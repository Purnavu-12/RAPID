import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";

/**
 * GET /api/recovery/escalated
 *
 * §40 Compliant escalation queue: returns all ESCALATED recovery cases for the
 * active merchant, with amount, root cause, confidence, attempt history, and
 * recommended action (from the latest decision).
 *
 * Auth: dev-open; production requires x-rapid-cron-secret.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const provided = request.headers.get("x-rapid-cron-secret");
    const secret = process.env.RAPID_CRON_SECRET;
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  try {
    // §40: ESCALATED cases = requires_human flag set on the decision, no
    // terminal outcome recorded yet.
    const { data: cases, error } = await supabase
      .from("recovery_cases")
      .select("*")
      .eq("merchant_id", merchantId)
      .filter("escalated", "eq", true)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    // For each escalated case, fetch attempt history (decisions + actions).
    const enriched = await Promise.all(
      (cases ?? []).map(async (c) => {
        const { data: attempts } = await supabase
          .from("decisions")
          .select(
            "attempt_no, action_class, root_cause:diagnoses!inner(root_cause), probability_of_success, reason_codes"
          )
          .eq("risk_event_id", c.case_id)
          .order("attempt_no", { ascending: true });

        return {
          caseId: c.case_id,
          customer: c.customer_ref ?? "",
          riskType: c.risk_type,
          rootCause: c.reason ?? "Unclear",
          amount: Number(c.amount_minor),
          currency: c.currency ?? "INR",
          confidence: c.confidence != null ? Number(c.confidence) : null,
          proposedAction: c.proposed_action ?? null,
          recoverability:
            c.recoverability != null ? Number(c.recoverability) : null,
          attempts: attempts ?? [],
          createdAt: c.detected_at ?? c.updated_at,
        };
      })
    );

    return NextResponse.json({ cases: enriched }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/recovery/escalated] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch escalated cases" },
      { status: 500 }
    );
  }
}
