-- Phase 6 — Batch Proof Runner (docs/RAPID.md §43).
-- Persists batch run reports so they can be viewed later.
alter table merchants add column if not exists proof_runs_enabled boolean default true;

create table proof_runs (
    run_id        uuid primary key default gen_random_uuid(),
    merchant_id   uuid not null references merchants(merchant_id),
    params        jsonb not null default '{}',
    report        jsonb not null,
    created_at    timestamptz not null default now()
);

create index idx_proof_runs_merchant on proof_runs(merchant_id, created_at desc);
