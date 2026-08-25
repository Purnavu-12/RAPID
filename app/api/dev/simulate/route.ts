import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveMerchantId,
  handleRazorpayWebhook as handleWebhook,
} from "@/lib/webhooks/razorpay";

/**
 * POST /api/dev/simulate
 *
 * Development-only harness that injects a *signed* Razorpay webhook into the
 * real ingestion pipeline, so you can watch the §26 ledger (and therefore the
 * dashboard) update live without a live Razorpay account.
 *
 * Body: { "stage": "failed" | "recovered" }
 *   - "failed"     → POSTs a signed `payment.failed` event → new at-risk case.
 *   - "recovered"  → resolves the latest open at-risk case to `RECOVERED` by
 *                    POSTing a signed `payment_link.paid` confirmation.
 *
 * The payload is signed with the configured RAZORPAY_WEBHOOK_SECRET using the
 * exact Razorpay scheme (HMAC-SHA256 hex, §9), so signature verification in
 * /api/webhooks/razorpay is exercised end-to-end — not bypassed. In production
 * this route is disabled.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Simulation only available in development." },
      { status: 404 }
    );
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Set RAZORPAY_WEBHOOK_SECRET in .env.local to run the simulation " +
          "(it is used to sign the synthetic webhook that the ingestion pipeline verifies).",
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const stage: string = body?.stage === "recovered" ? "recovered" : "failed";

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  const now = Date.now();
  const epoch = Math.floor(now / 1000);

  if (stage === "recovered") {
    // Resolve the most recent *open* case directly from risk_events (§24 open
    // states: SCHEDULED / OUTCOME_PENDING / ESCALATED), using a left-joined
    // outcomes embed so we can detect cases that already have a RECOVERED
    // outcome. Querying risk_events (not the recovery_cases view) preserves
    // source_ref, which the confirming webhook must echo back verbatim so the
    // ingestion layer can match it (§23 reconciliation).
    const { data: rows, error: openErr } = await supabase
      .from("risk_events")
      .select(
        "risk_event_id, source_ref, amount_minor, currency, detected_at, outcomes!left(outcome_id, status)"
      )
      .eq("merchant_id", merchantId)
      .order("detected_at", { ascending: false })
      .limit(20);

    if (openErr) throw openErr;

    const open = (rows || []).find(
      (r) =>
        !(r.outcomes || []).some((o: { status: string }) => o.status === "RECOVERED")
    );
    if (!open) {
      return NextResponse.json(
        {
          error:
            "No open case to resolve. POST with { stage: 'failed' } first to create one.",
          stage: "recovered",
        },
        { status: 409 }
      );
    }

    const sourceRef = open.source_ref;
    const amount = Number(open.amount_minor) || 0;

    const payload = {
      event: "payment_link.paid",
      event_id: `event_sim_paid_${now}`,
      created_at: epoch,
      payload: {
        payment_link: {
          entity: {
            id: `plink_${sourceRef}`,
            entity: "payment_link",
            order_id: sourceRef,
            amount,
            currency: open.currency || "INR",
            status: "paid",
          },
        },
      },
    } as const;

    const raw = JSON.stringify(payload);
    const signature = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

    const result = await handleWebhook(raw, signature);
    return NextResponse.json({ stage: "recovered", ...result }, { status: 200 });
  }

  // stage === "failed"
  const customerRefs = [
    "cust_1001",
    "cust_1002",
    "cust_1003",
    "cust_1004",
    "cust_1005",
    "cust_1006",
    "cust_1007",
    "cust_1008",
  ];
  const customerRef = customerRefs[now % customerRefs.length];

  // Deterministic-but-rotating amount so repeated clicks differ (§4.2 idempotency
  // is keyed on the event id, which varies per call → each click is a new case).
  const amounts = [45900, 79900, 119900, 34900, 89900, 199900, 59900, 129900];
  const amount = amounts[(now / 37 | 0) % amounts.length];

  const orderId = `order_sim_${now}`;
  const paymentId = `pay_sim_${now}`;

  const payload = {
    event: "payment.failed",
    event_id: `event_sim_failed_${now}`,
    created_at: epoch,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount,
          currency: "INR",
          status: "failed",
          order_id: orderId,
          error_code: "insufficient_funds",
          error_source: "issuer",
          error_reason: "Insufficient Funds",
          attempt_count: 1,
          notes: { customer_ref: customerRef },
        },
      },
    },
  } as const;

  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

  const result = await handleWebhook(raw, signature);
  return NextResponse.json(
    { stage: "failed", customerRef, amount, ...result },
    { status: 200 }
  );
}
