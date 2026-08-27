/**
 * §50 Policy Change Management + §51 Policy Simulation Engine.
 *
 * POST /api/policies/simulate — run a policy (current DB version or a candidate
 *   rules blob) against a batch of scenario contexts and report the resulting
 *   action distribution, recovery lift, and safety violations.
 *
 * GET  /api/policies           — list all versions for the tenant.
 * POST /api/policies/publish   — promote a draft policy version to active.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_POLICY,
  RecoveryPolicy,
  DecisionContext,
  Decision,
  evaluate,
  loadActivePolicy,
} from "@/lib/policy/engine";
import { appendAudit } from "@/lib/audit/ledger";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchant_id") ?? "dev-tenant";

    const { data, error } = await supabase
      .from("policy_versions")
      .select("version,status,rules,created_at")
      .eq("merchant_id", merchantId)
      .order("version", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ policies: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

interface SimulateRequest {
  /** Optional candidate rules blob to simulate; if omitted, uses active DB policy. */
  policy?: Partial<RecoveryPolicy>;
  /** Batch of decision contexts to evaluate. */
  scenarios: Array<{
    rootCause: string;
    amountMinor: number;
    attemptNo?: number;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body: SimulateRequest = await request.json();
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get("merchant_id") ?? "dev-tenant";

    if (!body.scenarios || !Array.isArray(body.scenarios)) {
      return NextResponse.json(
        { error: "scenarios array is required" },
        { status: 400 }
      );
    }

    // Resolve the policy to simulate: candidate blob, DB active, or default.
    let policy: RecoveryPolicy;
    let policyLabel: string;
    if (body.policy) {
      policy = { ...DEFAULT_POLICY, ...body.policy };
      policyLabel = "candidate";
    } else {
      const dbPolicy =
        (await loadActivePolicy(supabase, merchantId)) ?? DEFAULT_POLICY;
      policy = dbPolicy;
      policyLabel = dbPolicy.label;
    }

    // Evaluate each scenario.
    const results: Array<{
      scenario: DecisionContext;
      decision: Decision;
      expectedRecoveryMinor: number | null;
    }> = [];
    const actionCounts: Record<string, number> = {};
    let totalExpectedRecovery = 0;
    let violations = 0;

    for (const s of body.scenarios) {
      const ctx: DecisionContext = {
        rootCause: s.rootCause,
        amountMinor: s.amountMinor,
        attemptNo: s.attemptNo ?? 1,
      };
      const decision = evaluate(policy, ctx);
      results.push({
        scenario: ctx,
        decision,
        expectedRecoveryMinor: decision.expectedRecoveryMinor,
      });

      actionCounts[decision.actionClass] =
        (actionCounts[decision.actionClass] ?? 0) + 1;

      if (decision.expectedRecoveryMinor) {
        totalExpectedRecovery += decision.expectedRecoveryMinor;
      }

      // Safety: high-value cases must require human approval.
      if (
        ctx.amountMinor > policy.high_value_threshold_minor &&
        !decision.requiresHuman
      ) {
        violations++;
      }
    }

    const report = {
      policyLabel,
      totalScenarios: body.scenarios.length,
      actionDistribution: actionCounts,
      totalExpectedRecoveryMinor: totalExpectedRecovery,
      safetyViolations: violations,
      decisions: results,
    };

    // Audit the simulation run (§4.6 event-first auditability).
    await appendAudit(supabase, {
      merchantId: merchantId,
      entityType: "policy",
      entityId: `simulation:${policyLabel}`,
      eventType: "DECIDED",
      actorType: "policy_engine",
      actorId: "policy-simulate",
      data: {
        scenarios: body.scenarios.length,
        totalExpectedRecoveryMinor: totalExpectedRecovery,
        safetyViolations: violations,
      },
    });

    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
