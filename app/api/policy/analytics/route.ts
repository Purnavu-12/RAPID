/**
 * §62 Policy Analytics — aggregated recovery performance per policy version.
 *
 * GET /api/policy/analytics?merchant_id=...
 *
 * Reads from the `policy_analytics` projection view (§39 OLTP vs OLAP) so the
 * dashboard never joins transaction tables directly.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchant_id") ?? "dev-tenant";

    const { data, error } = await supabase
      .from("policy_analytics")
      .select(
        `
        policy_label,
        payment_link_count,
        retry_later_count,
        escalate_human_count,
        exhausted_count,
        recovered_count,
        revenue_recovered_minor,
        avg_model_confidence_pct,
        recovery_rate_pct,
        recovery_rate_incl_partial_pct
      `
      )
      .eq("merchant_id", merchantId)
      .order("policy_label", { ascending: false });

    if (error) {
      console.error("policy_analytics query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ analytics: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
