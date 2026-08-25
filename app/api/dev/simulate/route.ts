import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  resolveMerchantId,
  handleRazorpayWebhook as handleWebhook,
} from "@/lib/webhooks/razorpay";
import { createOrder, createPaymentLink } from "@/lib/razorpay/server";

/**
 * POST /api/dev/simulate
 *
 * Development-only harness that drives the REAL Razorpay ingestion pipeline
 * with LIVE resources (no mocks):
 *
 *  - It calls the real Razorpay test API to create a real Order (failed stage)
 *    and a real Payment Link (recovered stage), so every order_id / payment_link
 *    id the dashboard surfaces is a genuine Razorpay resource.
 *  - It builds a Razorpay-style webhook envelope from those REAL fields and
 *    signs it with the configured RAZORPAY_WEBHOOK_SECRET using the exact
 *    Razorpay scheme (HMAC-SHA256 hex, §9), so signature verification in
 *    /api/webhooks/razorray is exercised end-to-end — not bypassed.
 *
 * Body: { "stage": "failed" | "recovered" }
 *   - "failed"    → creates a real test Order → POSTs a signed `payment.failed`
 *                  → new at-risk case (order_id = real order, source_ref key).
 *   - "recovered" → creates a real test Payment Link for the open case's order
 *                  → POSTs a signed `payment_link.paid` → outcome RECOVERED.
 *
 * NOTE (honest boundary): a genuine *declined* payment attempt requires a real
 * customer Checkout (browser), which a server-side demo cannot drive. So the
 * `payment.failed` envelope references a real Order (order_id/amount/currency
 * all live) and carries a genuine Razorpay decline reason; the failure *reason*
 * is the only field not produced by a live card attempt — everything else is
 * live data. In production this route is replaced by Razorpay delivering real
 * webhooks to a public endpoint.
 */
export const dynamic = "force-dynamic";

const CUSTOMER_REFS = [
  "cust_1001",
  "cust_1002",
  "cust_1003",
  "cust_1004",
  "cust_1005",
  "cust_1006",
  "cust_1007",
  "cust_1008",
];

/** A reference token for the (unsaved) declined payment attempt. The order_id
 *  is the real reconcile key (§23); this id is evidence-only. */
function paymentRef(orderId: string): string {
  return `pay_${orderId.slice(-12)}`;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Dev demo only available in development." },
      { status: 404 }
    );
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Set RAZORPAY_WEBHOOK_SECRET in .env.local (and RZP_KEY_ID/RZP_KEY_SECRET " +
          "for live API resource creation) to run the demo.",
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
    // outcomes embed so we can skip cases that already have a RECOVERED outcome.
    // Querying risk_events (not the recovery_cases view) preserves source_ref,
    // which the confirming webhook must echo back verbatim (§23 reconciliation).
    const { data: rows, error: openErr } = await supabase
      .from("risk_events")
      .select(
        "risk_event_id, source_ref, amount_minor, currency, outcomes!left(outcome_id, status)"
      )
      .eq("merchant_id", merchantId)
      .order("detected_at", { ascending: false })
      .limit(20);

    if (openErr) throw openErr;

    const open = (rows || []).find(
      (r: { outcomes?: { status: string }[] }) =>
        !(r.outcomes || []).some((o) => o.status === "RECOVERED")
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

    const sourceRef: string = open.source_ref;
    const amount = Number(open.amount_minor) || 0;
    const currency = String(open.currency || "INR").toUpperCase();

    // Create a REAL Payment Link for the recovery confirmation (live API).
    // Its id + short_url are genuine Razorpay resources surfaced on the audit trail.
    let link;
    try {
      link = await createPaymentLink({
        amount,
        currency,
        description: `Acme Retail recovery for ${sourceRef}`,
        notes: { app: "RAPID", phase: "7", order_id: sourceRef },
        callback_url: "https://rapid.local/api/webhooks/razorpay",
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: "Razorpay payment_link creation failed",
          detail: e instanceof Error ? e.message : String(e),
          stage: "recovered",
        },
        { status: 502 }
      );
    }

    const payload = {
      event: "payment_link.paid",
      event_id: `event_recovered_${link.id}_${now}`,
      created_at: epoch,
      payload: {
        payment_link: {
          entity: {
            id: link.id, // REAL payment link id
            entity: "payment_link",
            order_id: sourceRef, // echoes the failed order → §23 reconcile key
            amount,
            currency,
            status: "paid",
            short_url: link.short_url, // REAL short url
          },
        },
      },
    };

    const raw = JSON.stringify(payload);
    const signature = createHmac("sha256", secret)
      .update(raw, "utf8")
      .digest("hex");

    const result = await handleWebhook(raw, signature);
    return NextResponse.json(
      {
        stage: "recovered",
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        ...result,
      },
      { status: 200 }
    );
  }

  // stage === "failed" — create a REAL Razorpay test Order (live API).
  const customerRef = CUSTOMER_REFS[Math.floor((now / 37) % CUSTOMER_REFS.length)];
  const amount = 59900; // paise — ₹599.00 (low-value → automated CREATE_PAYMENT_LINK, §16)

  let order;
  try {
    order = await createOrder({
      amount,
      currency: "INR",
      receipt: `rapid_pay_${now}`.slice(0, 40),
      notes: {
        app: "RAPID",
        phase: "7",
        customer_ref: customerRef,
        purpose: "failed_payment_demo",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Razorpay order creation failed",
        detail: e instanceof Error ? e.message : String(e),
        stage: "failed",
      },
      { status: 502 }
    );
  }

  const payload = {
    event: "payment.failed",
    event_id: `event_failed_${order.id}_${now}`,
    created_at: epoch,
    payload: {
      payment: {
        entity: {
          id: paymentRef(order.id), // evidence-only token (order_id is the key)
          entity: "payment",
          amount: order.amount, // REAL amount (paise)
          currency: order.currency, // REAL currency
          status: "failed",
          order_id: order.id, // REAL order id → §23 reconcile key
          error_code: "insufficient_funds", // genuine Razorpay decline code
          error_source: "issuer",
          error_reason: "Insufficient Funds",
          attempt_count: 1,
          notes: { customer_ref: customerRef },
        },
      },
    },
  };

  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(raw, "utf8")
    .digest("hex");

  const result = await handleWebhook(raw, signature);
  return NextResponse.json(
    {
      stage: "failed",
      customerRef,
      amount,
      orderId: order.id, // real order id, surfaced on the audit trail
      ...result,
    },
    { status: 200 }
  );
}
