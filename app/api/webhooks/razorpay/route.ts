import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/lib/webhooks/razorpay";

/**
 * POST /api/webhooks/razorpay
 *
 * Razorpay's inbound webhook receiver (docs/RAPID.md §9 Webhook Ingestion
 * Architecture). Razorpay retries deliveries with at-least-once semantics, so
 * idempotency is enforced at the data layer via provider_events
 * (merchant_id + provider + external_event_id) rather than trusting the
 * network (§8.1 / §41 / §48 replay-attack defense).
 *
 * The raw request body is read verbatim (not re-serialized) so the HMAC
 * signature — computed by Razorpay over the exact byte sequence they sent
 * (§9 Verify Signature) — validates correctly.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs Node `crypto` + service-role client

export async function POST(request: Request) {
  try {
    // Razorpay delivers `x-razorpay-signature` + `x-razorpay-event-id`.
    const signature = request.headers.get("x-razorpay-signature");
    const rawBody = await request.text();

    const result = await handleRazorpayWebhook(rawBody, signature);
    return NextResponse.json(
      {
        received: true,
        ...result,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Bad signature / forged webhook → 401, never persisted (§48 security).
    if (/signature/i.test(message)) {
      console.warn("[webhooks/razorpay] rejected:", message);
      return NextResponse.json({ received: false, error: "Invalid signature" }, { status: 401 });
    }

    console.error("[webhooks/razorpay] handler error:", err);
    return NextResponse.json(
      { received: false, error: "Internal webhook error" },
      { status: 500 }
    );
  }
}
