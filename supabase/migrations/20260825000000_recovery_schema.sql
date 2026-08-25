-- Phase 5: real data backend for the RAPID dashboard.
-- Schema follows docs/RAPID.md §26 Core Database Model verbatim.
-- Views follow §62 Dashboard Architecture: the dashboard reads
-- analytical projections, not joins against transaction tables.

create extension if not exists "pgcrypto";

-- §26.1 Merchants
create table merchants (
    merchant_id   uuid primary key default gen_random_uuid(),
    name          text not null,
    status        text not null,
    timezone      text not null default 'Asia/Kolkata',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- §26.2 Customers
create table customers (
    customer_id          uuid primary key default gen_random_uuid(),
    merchant_id          uuid not null references merchants(merchant_id),
    external_customer_ref text,
    contact_policy_id    uuid,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index idx_customers_merchant on customers(merchant_id, customer_id);

-- §26.3 Provider Events
create table provider_events (
    event_id            uuid primary key default gen_random_uuid(),
    merchant_id         uuid not null references merchants(merchant_id),
    provider            text not null,
    external_event_id   text not null,
    event_type          text not null,
    schema_version      text not null,
    occurred_at         timestamptz,
    received_at         timestamptz not null default now(),
    payload_uri         text,
    payload_hash        text not null,
    unique (merchant_id, provider, external_event_id)
);

-- §26.4 Risk Events  (the "recovery candidate")
create table risk_events (
    risk_event_id uuid primary key default gen_random_uuid(),
    merchant_id   uuid not null references merchants(merchant_id),
    customer_id   uuid references customers(customer_id),
    source_type   text not null,
    source_ref    text not null,
    risk_type     text not null,
    amount_minor  bigint not null,
    currency      char(3) not null default 'INR',
    detected_at   timestamptz not null default now(),
    status        text not null default 'DETECTED',
    evidence      jsonb not null default '{}',
    created_at    timestamptz not null default now()
);
create index idx_risk_events_merchant_time on risk_events(merchant_id, detected_at desc);
create index idx_risk_events_source      on risk_events(merchant_id, source_type, source_ref);
create index idx_risk_events_status      on risk_events(merchant_id, status);

-- §26.5 Diagnoses
create table diagnoses (
    diagnosis_id    uuid primary key default gen_random_uuid(),
    risk_event_id   uuid not null references risk_events(risk_event_id),
    root_cause      text not null,
    confidence      numeric(5,4) not null,
    method          text not null,
    model_version   text,
    prompt_version  text,
    evidence_codes  jsonb not null default '[]',
    reason_summary  text,
    created_at      timestamptz not null default now()
);

-- §26.6 Decisions
create table decisions (
    decision_id            uuid primary key default gen_random_uuid(),
    risk_event_id          uuid not null references risk_events(risk_event_id),
    action_class           text not null,
    attempt_no             integer not null default 1,
    expected_recovery_minor bigint,
    probability_of_success numeric(5,4),
    policy_version         text not null,
    decision_method        text not null,
    reason_codes           jsonb not null default '[]',
    requires_human         boolean not null default false,
    created_at             timestamptz not null default now()
);

-- §26.7 Actions
create table actions (
    action_id      uuid primary key default gen_random_uuid(),
    decision_id    uuid not null references decisions(decision_id),
    risk_event_id  uuid not null references risk_events(risk_event_id),
    merchant_id    uuid not null references merchants(merchant_id),
    action_class   text not null,
    status         text not null default 'PENDING',
    idempotency_key text not null unique,
    scheduled_for  timestamptz,
    started_at     timestamptz,
    completed_at   timestamptz,
    provider_ref   text,
    result         jsonb,
    created_at     timestamptz not null default now()
);

-- §26.8 Outcomes  (authoritative financial truth, §23)
create table outcomes (
    outcome_id            uuid primary key default gen_random_uuid(),
    risk_event_id         uuid not null references risk_events(risk_event_id),
    action_id             uuid references actions(action_id),
    status                text not null,
    recovered_amount_minor bigint,
    recovered_at          timestamptz,
    evidence              jsonb not null default '{}',
    created_at            timestamptz not null default now()
);
create index idx_outcomes_risk_event on outcomes(risk_event_id);

-- §26.9 Policy Versions
create table policy_versions (
    policy_version_id uuid primary key default gen_random_uuid(),
    merchant_id       uuid not null references merchants(merchant_id),
    version           integer not null,
    status            text not null,
    rules             jsonb not null,
    created_by        uuid,
    created_at        timestamptz not null default now(),
    unique (merchant_id, version)
);

------------------------------------------------------------------------------
-- Analytical projections (§62 Dashboard Architecture)
------------------------------------------------------------------------------
-- The dashboard never touches the transaction tables directly.
-- It reads these views, which the API materialises from the ledger.

-- Audit-trail view: Event → Diagnosis → Decision → Policy → Action → Outcome.
create view recovery_cases as
select
    re.risk_event_id                  as case_id,
    re.merchant_id,
    re.risk_type,
    re.currency,
    re.amount_minor                   as amount_minor,
    re.detected_at,
    re.customer_id,
    cust.external_customer_ref        as customer_ref,
    diag.root_cause                   as reason,
    diag.confidence,
    diag.evidence_codes,
    dec.action_class                  as proposed_action,
    dec.probability_of_success        as recoverability,
    dec.policy_version,
    dec.requires_human                as escalated,
    act.status                        as action_status,
    act.scheduled_for,
    act.completed_at,
    o.status                           as outcome_status,
    o.recovered_amount_minor,
    o.recovered_at,
    -- current case status mapped to the dashboard's state vocabulary (§24)
    case
        when o.status = 'RECOVERED'        then 'RECOVERED'
        when o.status in ('EXHAUSTED','WRITTEN_OFF','CANCELLED') then 'EXHAUSTED'
        when re.status = 'ESCALATED'        then 'ESCALATED'
        when re.status = 'SCHEDULED' or act.status = 'SCHEDULED' then 'SCHEDULED'
        else 'OUTCOME_PENDING'
    end                               as status,
    coalesce(o.recovered_at, act.completed_at, re.detected_at) as updated_at
from risk_events re
left join customers cust on cust.customer_id = re.customer_id
left join diagnoses diag on diag.risk_event_id = re.risk_event_id
left join decisions dec  on dec.risk_event_id = re.risk_event_id and dec.attempt_no = 1
left join actions act    on act.risk_event_id = re.risk_event_id
left join outcomes o     on o.risk_event_id = re.risk_event_id
;

-- Single-row-per-merchant metric projection (§37 Key Metrics + §62 Overview).
-- revenue_at_risk = unrecovered revenue (open cases + EXHAUSTED, but not yet
-- written off/cancelled). active_cases excludes terminal states (RECOVERED /
-- EXHAUSTED / WRITTEN_OFF / CANCELLED).
create view dashboard_metrics as
select
    re.merchant_id,
    coalesce(sum(o.recovered_amount_minor) filter (where o.status = 'RECOVERED'), 0)
        as revenue_recovered_minor,
    coalesce(
        sum(re.amount_minor) filter (
            where o.outcome_id is null
               or o.status not in ('RECOVERED', 'WRITTEN_OFF', 'CANCELLED')
        ), 0)
        as revenue_at_risk_minor,
    count(*) filter (
        where o.outcome_id is null
           or o.status not in ('RECOVERED', 'EXHAUSTED', 'WRITTEN_OFF', 'CANCELLED')
    )
        as active_cases,
    count(*) as total_cases,
    coalesce(
        percentile_cont(0.5) within group (
            order by extract(epoch from (o.recovered_at - re.detected_at))
        ), 0)
        as median_time_to_recovery_sec,
    max(re.detected_at) as last_activity_at
from risk_events re
left join outcomes o on o.risk_event_id = re.risk_event_id
group by re.merchant_id
;

-- Daily recovery funnel (§62), grouped by detection/intake day so the API
-- always receives a row for every day cases were opened (not only days that
-- recovered). The caller keeps the 7-day window and labels weekday names.
create view recovery_daily_trend as
select
    re.merchant_id,
    date_trunc('day', re.detected_at)::date as day,
    count(*) filter (where o.status = 'RECOVERED') as recoveries,
    count(*) filter (
        where o.outcome_id is null
           or o.status not in ('RECOVERED', 'WRITTEN_OFF', 'CANCELLED')
    ) as at_risk
from risk_events re
left join outcomes o on o.risk_event_id = re.risk_event_id
group by re.merchant_id, date_trunc('day', re.detected_at)
order by day;
