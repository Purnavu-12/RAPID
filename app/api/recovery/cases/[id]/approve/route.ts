import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";
import { appendAudit } from "@/lib/audit/ledger";
import { buildIdempotencyKey } from "@/lib/webhooks/razorpay";
import type { SupabaseClient } from "@/lib/supabase/server";

type Supabase = SupabaseClient;

/**
 * POST /api/recovery/cases/{case_id}/approve
 *
 * §40 Approve an escalated case: creates a new decision (attempt_no+1) using
 * the recommended action class, schedules a new action, and emits audit events.
 *
 * Auth: dev-open; production requires x-rapid-cron-secret.
 *
 * Body:
 *   { actionClass?: string }  — optional override; defaults to the recommended
 *   action from the latest decision.
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

  let body: { actionClass?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — use recommended action
  }

  try {
    // Find the case + latest decision.
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

    const { data: latestDec, error: decErr } = await supabase
      .from("decisions")
      .select("attempt_no, action_class, reason_codes")
      .eq("risk_event_id", caseId)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (decErr) throw decErr;
    if (!latestDec) {
      return NextResponse.json(
        { error: "no prior decision found" },
        { status: 400 }
      );
    }

    const nextAttempt = latestDec.attempt_no + 1;
    const actionClass = body.actionClass ?? latestDec.action_class;

    // §40: approve → new decision + scheduled action.
    const { data: newDec, error: newDecErr } = await supabase
      .from("decisions")
      .insert({
        risk_event_id: caseId,
        action_class: actionClass,
        attempt_no: nextAttempt,
        reason_codes: [...(latestDec.reason_codes ?? []), "HUMAN_APPROVED"],
        policy_version: "human-approved-v1",
        decision_method: "human",
        requires_human: false,
        expected_recovery_minor:
          actionClass === "CREATE_PAYMENT_LINK"
            ? riskEvent.risk_event_id
              ? 0
              : 0
            : 0,
        probability_of_success: 0.85,
      })
      .select("decision_id")
      .maybeSingle();
    if (newDecErr) throw newDecErr;

    const scheduledFor = new Date(
      Date.now() + 2 * 3600 * 1000
    ).toISOString();

    const { data: newAct, error: actErr } = await supabase
      .from("actions")
      .insert({
        decision_id: newDec!.decision_id,
        risk_event_id: caseId,
        merchant_id: merchantId,
        action_class: actionClass,
        status: "SCHEDULED",
        idempotency_key: buildIdempotencyKey(caseId, actionClass, nextAttempt),
        scheduled_for: scheduledFor,
        provider_ref: `plink_${caseId}`,
        result: {
          attempt_no: nextAttempt,
          provider: "razorpay",
          action: "scheduled",
          requires_human: false,
        },
      })
      .select("action_id")
      .maybeSingle();
    if (actErr) throw actErr;

    // Update risk_event status.
    await supabase
      .from("risk_events")
      .update({ status: "SCHEDULED" })
      .eq("risk_event_id", caseId);

    // §27 audit: APPROVED + ACTION_SCHEDULED.
    const now = new Date().toISOString();
    await appendAudit(supabase, {
      merchantId,
      entityType: "recovery_case",
      entityId: caseId,
      eventType: "APPROVED",
      actorType: "human",
      actorId: "dashboard-approver",
      occurredAt: now,
      data: {
        action_class: actionClass,
        attempt_no: nextAttempt,
        reason: "HUMAN_APPROVED",
      },
    });
    await appendAudit(supabase, {
      merchantId,
      entityType: "action",
      entityId: newAct!.action_id,
      eventType: "ACTION_SCHEDULED",
      actorType: "action_executor",
      actorId: "execution-worker",
      occurredAt: now,
      data: {
        action_class: actionClass,
        scheduled_for: scheduledFor,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        caseId,
        decisionId: newDec!.decision_id,
        actionId: newAct!.action_id,
        actionClass,
        attemptNo: nextAttempt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/recovery/cases/approve] error:", err);
    return NextResponse.json(
      { error: "Failed to approve case" },
      { status: 500 }
    );
  }
}
