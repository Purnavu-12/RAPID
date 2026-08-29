/**
 * §27 Append-Only Audit Ledger.
 *
 * Every stage of the recovery funnel emits an immutable audit event:
 *   RISK_DETECTED → DIAGNOSED → DECIDED → ACTION_SCHEDULED → ACTION_EXECUTED
 *   → OUTCOME_RECORDED (→ APPROVED / REJECTED / EXHAUSTED in later phases).
 *
 * Each event is SHA-256 hashed, linked to the previous event in the merchant's
 * chain (`prev_hash`), providing tamper evidence without blockchain infrastructure
 * (docs/RAPID.md §27).
 *
 * The chain state (last hash) is cached per-request via a module-level variable
 * to avoid repeated queries on high-throughput webhook ingestion.
 */

import { createHash } from "node:crypto";
 
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Canonical serialization for hashing — sorted keys, no whitespace. */
function canonicalize(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (typeof data !== "object") return JSON.stringify(data);
  if (Array.isArray(data)) return "[" + data.map(canonicalize).join(",") + "]";
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
    "}"
  );
}

/** Types of actors that can emit audit events (§27 vocabulary). */
export type ActorType =
  | "webhook_receiver"
  | "diagnosis_engine"
  | "policy_engine"
  | "action_executor"
  | "outcome_verifier"
  | "human"
  | "scheduler";

/** Entity types audited (§27). */
export type EntityType = "recovery_case" | "action" | "policy";

/** Event types in the audit trail (§27). */
export type AuditEventType =
  | "RISK_DETECTED"
  | "DIAGNOSED"
  | "DECIDED"
  | "ACTION_SCHEDULED"
  | "ACTION_EXECUTED"
  | "OUTCOME_RECORDED"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED"
  | "EXHAUSTED";

export interface AuditEventInput {
  merchantId: string;
  traceId?: string | null;
  entityType: EntityType;
  entityId: string;
  eventType: AuditEventType;
  actorType: ActorType;
  actorId: string;
  occurredAt?: string;
  data: Record<string, unknown>;
}

export interface AuditEvent extends AuditEventInput {
  auditId: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

/** Per-request cache of the last hash per merchant. */
const hashCache = new Map<string, string>();

/** Clear the per-request hash cache (call when the request context changes). */
export function clearAuditCache() {
  hashCache.clear();
}

/** Append a single audit event to the chain.
 *
 * Computes the hash as SHA-256(canonical JSON of {event_type, entity_type,
 * entity_id, actor_type, actor_id, occurred_at, data} || prev_hash), then
 * inserts with prev_hash for tamper evidence (§27).
 */
export async function appendAudit(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  event: AuditEventInput,
): Promise<AuditEvent> {
  const occurredAt = event.occurredAt ?? new Date().toISOString();

  // Get the previous hash in the merchant's chain (cached per request).
  let prevHash: string | null;
  const cacheKey = `merchant:${event.merchantId}`;
  if (hashCache.has(cacheKey)) {
    prevHash = hashCache.get(cacheKey) ?? null;
  } else {
    const { data: lastRow, error: hashErr } = await supabase
      .from("audit_events")
      .select("hash")
      .eq("merchant_id", event.merchantId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hashErr) throw hashErr;
    prevHash = lastRow?.hash ?? null;
    hashCache.set(cacheKey, prevHash ?? "GENESIS");
  }

  // Compute the hash over the canonical event content + previous hash.
  const contentToHash = {
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId,
    actor_type: event.actorType,
    actor_id: event.actorId,
    occurred_at: occurredAt,
    data: event.data,
  };

  const hashInput = canonicalize(contentToHash) + (prevHash ?? "GENESIS");
  const hash = createHash("sha256").update(hashInput, "utf8").digest("hex");

  // Insert the audit event (prev_hash links to the chain).
  const insertPayload: Record<string, unknown> = {
    merchant_id: event.merchantId,
    trace_id: event.traceId ?? null,
    entity_type: event.entityType,
    entity_id: event.entityId,
    event_type: event.eventType,
    actor_type: event.actorType,
    actor_id: event.actorId,
    occurred_at: occurredAt,
    data: event.data,
    prev_hash: prevHash,
    hash,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("audit_events")
    .insert(insertPayload)
    .select(
      "audit_id, merchant_id, trace_id, entity_type, entity_id, event_type, actor_type, actor_id, occurred_at, data, prev_hash, hash, created_at",
    )
    .maybeSingle();

  if (insertErr) throw insertErr;

  // Update the cache.
  hashCache.set(cacheKey, hash);

  return {
    auditId: inserted!.audit_id,
    merchantId: event.merchantId,
    traceId: event.traceId ?? null,
    entityType: event.entityType as EntityType,
    entityId: event.entityId,
    eventType: event.eventType as AuditEventType,
    actorType: event.actorType as ActorType,
    actorId: event.actorId,
    occurredAt: inserted!.occurred_at,
    data: inserted!.data,
    prevHash: inserted!.prev_hash,
    hash: inserted!.hash,
    createdAt: inserted!.created_at,
  };
}

/** Fetch the full audit chain for a given entity (e.g. a recovery case).
 *  Ordered by occurred_at ascending. */
export async function fetchAuditChain(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  merchantId: string,
  entityId: string,
): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AuditEvent[];
}
