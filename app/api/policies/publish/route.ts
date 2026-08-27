/**
 * §4.3 Policies are data + §50 Policy Change Management.
 *
 * POST /api/policies/publish — insert a new policy version as a draft,
 *   optionally promote it to active (deactivating the previous active version).
 *
 * Dev-mode: no secret required. Production: requires `x-rapid-control-secret`
 * matching RAPID_CONTROL_SECRET (same pattern as cron routes, §29 secret header).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RecoveryPolicy } from "@/lib/policy/engine";
import { appendAudit } from "@/lib/audit/ledger";

interface PublishRequest {
  merchant_id?: string;
  rules: RecoveryPolicy;
  /** If true, this version becomes the active policy for the merchant. */
  activate?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Dev-mode bypass: in development the secret is optional.
    const secret = process.env.RAPID_CONTROL_SECRET;
    if (secret) {
      const provided = request.headers.get("x-rapid-control-secret");
      if (!provided || provided !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createServerSupabaseClient();
    const body: PublishRequest = await request.json();
    const merchantId = body.merchant_id ?? "dev-tenant";

    if (!body.rules || !body.rules.label) {
      return NextResponse.json(
        { error: "rules with a label field are required" },
        { status: 400 }
      );
    }

    const rules: RecoveryPolicy = body.rules;

    // If activating, deactivate the current active version first.
    if (body.activate) {
      await supabase
        .from("policy_versions")
        .update({ status: "archived" })
        .eq("merchant_id", merchantId)
        .eq("status", "active");
    }

    // Insert the new version.
    const { data, error } = await supabase
      .from("policy_versions")
      .insert({
        merchant_id: merchantId,
        version: (rules.version ?? 1),
        status: body.activate ? "active" : "draft",
        rules,
        created_by: "api",
      })
      .select("policy_version_id version status created_at")
      .single();

    if (error) {
      console.error("Policy publish error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit the policy change (§50).
    await appendAudit(supabase, {
      merchantId: merchantId,
      entityType: "policy",
      entityId: (data as any)?.policy_version_id ?? "unknown",
      eventType: "DECIDED",
      actorType: "policy_engine",
      actorId: "policy-publish",
      data: {
        version: (data as any)?.version,
        label: rules.label,
        activate: !!body.activate,
      },
    });

    return NextResponse.json({
      success: true,
      policy: {
        id: (data as any)?.policy_version_id,
        version: (data as any)?.version,
        status: (data as any)?.status,
        created_at: (data as any)?.created_at,
        label: rules.label,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
