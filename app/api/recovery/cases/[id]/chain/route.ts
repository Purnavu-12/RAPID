import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAuditChain } from "@/lib/audit/ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolveMerchantId(supabase: SupabaseClient) {
  const envId = process.env.RAPID_MERCHANT_ID;
  if (envId) return envId;
  const { data, error } = await supabase
    .from("merchants")
    .select("merchant_id")
    .eq("name", "Acme Retail")
    .maybeSingle();
  if (error) throw error;
  return data?.merchant_id ?? null;
}

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * §4. API: GET /api/recovery/cases/{case_id}/chain
 *
 * Returns the full audit trail for a recovery case: Event → Diagnosis →
 * Decision → Policy → Action → Outcome, plus the append-only audit chain
 * with hash links (§27).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const merchantId = await resolveMerchantId(supabase);

    // 1. Fetch the audit chain for this case (§27 append-only ledger).
    const auditChain = await fetchAuditChain(supabase, merchantId!, id);

    // 2. Fetch the joined recovery case data (Event → Diagnosis → Decision →
    //    Action → Outcome) from the recovery_cases projection (§62 Audit Viewer).
    let q = supabase.from("recovery_cases").select("*").eq("case_id", id);
    if (merchantId) q = q.eq("merchant_id", merchantId);
    const { data: caseRow, error: caseErr } = await q.maybeSingle();
    if (caseErr) throw caseErr;

    // 3. Fetch actions for the case (there may be multiple attempts).
    const { data: actionRows, error: actionErr } = await supabase
      .from("actions")
      .select("*")
      .eq("risk_event_id", id)
      .order("created_at", { ascending: true });
    if (actionErr) throw actionErr;

    // 4. Fetch decisions for the case.
    const { data: decisionRows, error: decisionErr } = await supabase
      .from("decisions")
      .select("*")
      .eq("risk_event_id", id)
      .order("attempt_no", { ascending: true });
    if (decisionErr) throw decisionErr;

    const chain = {
      caseId: id,
      case: caseRow ?? null,
      actions: actionRows ?? [],
      decisions: decisionRows ?? [],
      auditEvents: auditChain,
    };

    return NextResponse.json(chain, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/recovery/chain] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch audit chain" },
      { status: 500 },
    );
  }
}
