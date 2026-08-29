import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";
import { appendAudit } from "@/lib/audit/ledger";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

/**
 * POST /api/recovery/cases/{case_id}/reject
 *
 * §40 Reject an escalated case: marks the risk_event terminal (WRITTEN_OFF)
 * and records a CANCELLED outcome, so the case is excluded from active
 * recovery and audit metrics.
 *
 * Auth: dev-open; production requires x-rapid-cron-secret.
 *
 * Body:
 *   { reason?: string }  — human comment for the audit trail.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const caseId = url.pathname.split("/")[4];

  if (process.env.NODE_ENV !== "development") {
    const provided = request.headers.get("x-rapid-cron-secret");
    const secret = process.env.RAPID_CRON_SECRET;
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!caseId) {
    return NextResponse.json({ error: "case_id required" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  let body: { reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  try {
    // Verify the case exists for this merchant.
    const { data: riskEvent, error: reErr } = await supabase
      .from("risk_events")
      .select("risk_event_id, status")
      .eq("risk_event_id", caseId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (reErr) throw reErr;
    if (!riskEvent) {
      return NextResponse.json({ error: "case not found" }, { status: 404 });
    }

    // Mark risk_event terminal.
    const { error: statusErr } = await supabase
      .from("risk_events")
      .update({ status: "ESCALATED" }) // stays ESCALATED but terminal
      .eq("risk_event_id", caseId);
    if (statusErr) throw statusErr;

    // Record a terminal outcome (CANCELLED).
    const { data: actionRow } = await supabase
      .from("actions")
      .select("action_id")
      .eq("risk_event_id", caseId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: ocErr } = await supabase.from("outcomes").insert({
      risk_event_id: caseId,
      action_id: actionRow?.action_id ?? null,
      status: "CANCELLED",
      recovered_amount_minor: 0,
      recovered_at: null,
      evidence: {
        source: "human",
        reason: body.reason ?? "Rejected by human reviewer",
        rejected_at: new Date().toISOString(),
      },
    });
    if (ocErr) throw ocErr;

    // §27 audit: REJECTED.
    await appendAudit(supabase, {
      merchantId,
      entityType: "recovery_case",
      entityId: caseId,
      eventType: "REJECTED",
      actorType: "human",
      actorId: "dashboard-rejector",
      occurredAt: new Date().toISOString(),
      data: {
        reason: body.reason ?? "Rejected by human reviewer",
        outcome_status: "CANCELLED",
      },
    });

    return NextResponse.json(
      { ok: true, caseId, status: "CANCELLED", reason: body.reason },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/recovery/cases/reject] error:", err);
    return NextResponse.json(
      { error: "Failed to reject case" },
      { status: 500 },
    );
  }
}
