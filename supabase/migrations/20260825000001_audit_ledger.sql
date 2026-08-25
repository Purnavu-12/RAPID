-- Phase 3 — Append-only audit ledger (docs/RAPID.md §27).
-- Per merchant, append-only chain with SHA-256 hash linking for tamper evidence.

create table audit_events (
    audit_id        uuid primary key default gen_random_uuid(),
    merchant_id     uuid not null references merchants(merchant_id),
    trace_id        text,
    entity_type     text not null,
    entity_id       text not null,
    event_type      text not null,
    actor_type      text not null,
    actor_id        text not null,
    occurred_at     timestamptz not null default now(),
    data            jsonb not null default '{}',
    prev_hash       text,
    hash            text not null,
    created_at      timestamptz not null default now()
);

create index idx_audit_merchant_time on audit_events(merchant_id, occurred_at desc);
create index idx_audit_entity on audit_events(merchant_id, entity_type, entity_id);
create index idx_audit_trace on audit_events(trace_id);
create index idx_audit_event_type on audit_events(merchant_id, event_type, occurred_at);
create index idx_audit_hash on audit_events(merchant_id, hash);

-- Enforce append-only at the database level where possible (§27 tamper evidence).
-- REVOKE UPDATE and DELETE on audit_events for all roles so the chain cannot be
-- overwritten. INSERT-only remains for the application service role.
REVOKE UPDATE, DELETE ON audit_events FROM public, anon, authenticated, service_role;

-- Helper to get the last hash in a merchant's chain (used by the emitter).
create or replace function get_last_audit_hash(p_merchant_id uuid)
returns text as $$
  select hash from audit_events
  where merchant_id = p_merchant_id
  order by occurred_at desc, audit_id desc
  limit 1;
$$ language sql stable;
