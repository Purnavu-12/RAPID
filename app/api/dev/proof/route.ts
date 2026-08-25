import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";
import { runProof, getLatestProof, getProofHistory } from "@/lib/dev/simulator";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/proof
 *
 * §43 / §6.5 Batch Proof Runner. Runs a configurable batch of synthetic
 * payment failures through the full engine (diagnosis → decision → action →
 * outcome) and persists a report card to `proof_runs`.
 *
 * Auth: dev-only. Production requires x-rapid-cron-secret.
 *
 * Body (all optional):
 *   { count?: number; payRate?: number; scenarioMix?: string[] }
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const provided = request.headers.get("x-rapid-cron-secret");
    const secret = process.env.RAPID_CRON_SECRET;
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { count?: number; payRate?: number; scenarioMix?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  try {
    const result = await runProof(supabase, merchantId, {
      count: body.count ?? 20,
      payRate: body.payRate ?? 0.84,
      scenarioMix: body.scenarioMix,
    });

    return NextResponse.json(
      { ok: true, runId: result.runId, report: result.report },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[api/dev/proof] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dev/proof?history=true
 *
 * Returns the latest proof run report (default) or full history.
 *
 * Auth: dev-only. Production requires x-rapid-cron-secret.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    const provided = request.headers.get("x-rapid-cron-secret");
    const secret = process.env.RAPID_CRON_SECRET;
    if (!secret || !provided || provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const history = url.searchParams.get("history") === "true";

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  try {
    if (history) {
      const runs = await getProofHistory(supabase, merchantId);
      return NextResponse.json({ runs }, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const latest = await getLatestProof(supabase, merchantId);
    return NextResponse.json(
      latest ?? { runId: null, report: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[api/dev/proof] error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
