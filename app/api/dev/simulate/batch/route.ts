/**
 * POST /api/dev/simulate/batch
 *
 * §45 Synthetic Event Simulator + §43 Incremental Recovery Measurement — dev-only
 * (docs/RAPID.md §47 integration-test surface). Generates *real* Razorpay
 * test resources (Orders / Payment Links) and signed webhook envelopes so the
 * engine's full diagnose → decide → act → outcome path is exercised for every
 * payment-failure type, and the with-vs-without recovery gap is measurable.
 *
 * Dev-only gate mirrors /api/dev/simulate: returns 404 outside `development`.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";
import {
  runScenarioSuite,
  runWithVsWithout,
  cleanSimRows,
} from "@/lib/dev/simulator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface BatchBody {
  mode?: "scenarios" | "withvswithout" | "clean";
  count?: number;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: BatchBody = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  const supabase = createServerSupabaseClient();
  const merchantId = await resolveMerchantId(supabase);
  if (!merchantId) {
    return NextResponse.json({ error: "merchant not found" }, { status: 404 });
  }

  switch (body.mode) {
    case "scenarios": {
      const res = await runScenarioSuite(supabase);
      return NextResponse.json(res, { status: 200 });
    }
    case "withvswithout": {
      const count = Number(body.count) || 10;
      const res = await runWithVsWithout(supabase, merchantId, count);
      return NextResponse.json(res, { status: 200 });
    }
    case "clean": {
      const res = await cleanSimRows(supabase, merchantId);
      return NextResponse.json(res, { status: 200 });
    }
    default:
      return NextResponse.json(
        { error: "unknown mode", mode: body.mode },
        { status: 400 }
      );
  }
}
