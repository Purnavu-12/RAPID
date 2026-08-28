/**
 * Thin server-side client for the Razorpay REST API (test + live).
 *
 * Auth = HTTP Basic (`key_id : key_secret`) — §9/§8. Uses the credentials
 * configured via RZP_KEY_ID / RZP_KEY_SECRET (see .env.example). No SDK
 * dependency: a small fetch wrapper is lighter and avoids an extra runtime dep.
 *
 * This is what makes the Phase 7 dev demo "live data, no mock": every
 * order_id and payment_link.id the dashboard surfaces is a REAL resource
 * created in the Razorpay test account, not a synthetic string, and it is
 * signed with the real webhook secret so /api/webhooks/razorpay performs a
 * genuine signature verification (forged events are rejected with 401).
 */
const RAZORPAY_BASE = "https://api.razorpay.com/v1";

/** Paise (smallest currency unit) — §10.2 amounts are always minor units. */
export interface RazorpayOrder {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt?: string;
  status: "created" | "attempted" | "paid";
  notes?: Record<string, string>;
  created_at?: number;
}

export interface RazorpayPaymentLink {
  id: string;
  entity: "payment_link";
  short_url: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "cancelled" | "failed";
  notes?: Record<string, string>;
  created_at?: number;
}

export interface CreatePaymentLinkResult extends RazorpayPaymentLink {
  callback_url?: string;
}

/** Alias used by the §5 reconciler for provider link matching.
 *  Includes notes for idempotent matching by risk_event_id. */
export type PaymentLink = RazorpayPaymentLink;

function authHeader(): string {
  const id = process.env.RZP_KEY_ID;
  const secret = process.env.RZP_KEY_SECRET;
  if (!id || !secret) {
    throw new Error(
      "Razorpay API credentials are not configured (set RZP_KEY_ID and " +
        "RZP_KEY_SECRET). The Phase 7 dev demo needs them to create real test " +
        "resources in the Razorpay account.",
    );
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function razorpay<R>(
  path: string,
  opts: RequestInit = {},
): Promise<R> {
  const res = await fetch(`${RAZORPAY_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfter = res.headers.get("retry-after");
    const detail = retryAfter ? ` (retry-after: ${retryAfter}s)` : "";
    throw new Error(
      `Razorpay API ${res.status} ${res.statusText}: ${body.slice(0, 300)}${detail}`,
    );
  }
  return res.json() as Promise<R>;
}

export interface CreateOrderParams {
  amount: number; // paise
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

/** Create a real Razorpay Order (test/live). §10.2 amount is in paise. */
export async function createOrder(
  params: CreateOrderParams,
): Promise<RazorpayOrder> {
  const { amount, currency, receipt, notes } = params;
  const body: Record<string, unknown> = {
    amount,
    currency: currency || "INR",
  };
  if (receipt) body.receipt = receipt;
  if (notes) body.notes = notes;
  return razorpay<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchOrder(id: string): Promise<RazorpayOrder> {
  return razorpay<RazorpayOrder>(`/orders/${encodeURIComponent(id)}`);
}

export interface CreatePaymentLinkParams {
  amount: number; // paise
  currency?: string;
  description?: string;
  notes?: Record<string, string>;
  callback_url?: string;
}

/** Create a real Razorpay Payment Link (test/live). */
export async function createPaymentLink(
  params: CreatePaymentLinkParams,
): Promise<CreatePaymentLinkResult> {
  const { amount, currency, description, notes, callback_url } = params;
  const body: Record<string, unknown> = {
    amount,
    currency: currency || "INR",
  };
  if (description) body.description = description;
  if (notes) body.notes = notes;
  if (callback_url) body.callback_url = callback_url;
  return razorpay<CreatePaymentLinkResult>("/payment_links", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchPaymentLink(
  id: string,
): Promise<RazorpayPaymentLink> {
  return razorpay<RazorpayPaymentLink>(
    `/payment_links/${encodeURIComponent(id)}`,
  );
}

interface ListPaymentLinksResult {
  entity: {
    entity: string;
    count: number;
    items: RazorpayPaymentLink[];
  };
}

/**
 * List recent payment links from the provider (§5.3 reconciler).
 * Used to match UNKNOWN action outcomes — did the provider actually mint
 * the link even though the executor got a timeout?
 */
export async function listPaymentLinks(opts: {
  limit?: number;
  notes?: Record<string, string>;
}): Promise<RazorpayPaymentLink[]> {
  const params = new URLSearchParams();
  if (opts.limit) params.set("count", String(opts.limit));
  const qs = params.toString();
  const path = `/payment_links${qs ? `?${qs}` : ""}`;
  const result = await razorpay<ListPaymentLinksResult>(path);
  return result.entity?.items ?? [];
}
