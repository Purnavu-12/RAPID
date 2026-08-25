import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveMerchantId } from "@/lib/webhooks/razorpay";
import { executeDueActions } from "@/lib/actions/executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/execute-actions?due=true
 *
 * §5 Execution Plane scheduler endpoint. Executes due SCHEDULED recovery
 * actions by creating real Razorpay payment links (see lib/actions/executor.ts).
 *
 * Auth:
 *  - Development: dev-only (NODE_ENV === "development"), so the dashboard's
 *    "Execute now" button can drive it. `?due=true` forces execution of every
 *    open SCHEDULED CREATE_PAYMENT_LINK action regardless of the policy delay.
 *  - Production: schedule this URL from a real cron and gate it with the
 *    `x-rapid-cron-secret` header matching RAPID_CRON_SECRET (dev override
 *    refused server-side when not in development).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const dueNow = url.searchParams.get("due") === "true";

  if (process.env.NODE_ENV !== "development") {
    if (dueNow) {
      return NextResponse.json(
        { error: "due=true is dev-only." },
        { status: 400 }
      );
    }
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
    const executed = await executeDueActions(supabase, merchantId, { dueNow });
    return NextResponse.json({ executed, count: executed.length });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Execution failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
