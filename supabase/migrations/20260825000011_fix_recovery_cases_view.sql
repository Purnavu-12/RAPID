-- Fix: recovery_cases view produced duplicate rows when a risk_event had
-- multiple actions (e.g. retries). The plain LEFT JOIN to `actions`
-- multiplies rows. Use DISTINCT ON to pick the latest action per event.
-- This eliminates React duplicate-key errors in the dashboard cases table.

drop view if exists policy_analytics;
drop view if exists recovery_cases;

create view recovery_cases as
select distinct on (re.risk_event_id)
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
    case
        when o.status = 'RECOVERED'        then 'RECOVERED'
        when o.status in ('EXHAUSTED','WRITTEN_OFF','CANCELLED') then 'EXHAUSTED'
        when re.status = 'ESCALATED'        then 'ESCALATED'
        when re.status = 'SCHEDULED' or (act.status = 'SCHEDULED' and act.status is not null) then 'SCHEDULED'
        when act.status is null and re.status = 'SCHEDULED' then 'SCHEDULED'
        else 'OUTCOME_PENDING'
    end                               as status,
    coalesce(o.recovered_at, act.completed_at, re.detected_at) as updated_at
from risk_events re
left join customers cust on cust.customer_id = re.customer_id
left join diagnoses diag on diag.risk_event_id = re.risk_event_id
left join decisions dec  on dec.risk_event_id = re.risk_event_id and dec.attempt_no = 1
left join actions act    on act.risk_event_id = re.risk_event_id
    and act.created_at = (
        select max(a2.created_at)
        from actions a2
        where a2.risk_event_id = re.risk_event_id
    )
left join outcomes o     on o.risk_event_id = re.risk_event_id
order by re.risk_event_id, act.created_at desc
;

-- §51: recreate policy_analytics (depends on recovery_cases).
create view policy_analytics as
select
    rc.merchant_id,
    d.policy_version as policy_label,
    count(*) filter (where d.action_class = 'CREATE_PAYMENT_LINK') as payment_link_count,
    count(*) filter (where d.action_class = 'RETRY_LATER') as retry_later_count,
    count(*) filter (where d.action_class = 'ESCALATE_HUMAN') as escalate_human_count,
    count(*) filter (where d.action_class = 'MARK_EXHAUSTED') as exhausted_count,
    count(*) filter (where o.status = 'RECOVERED') as recovered_count,
    coalesce(sum(o.recovered_amount_minor) filter (where o.status = 'RECOVERED'), 0) as revenue_recovered_minor,
    round(avg(d.probability_of_success) * 100.0, 1) as avg_model_confidence_pct,
    coalesce(round(
        count(*) filter (where o.status = 'RECOVERED')::numeric /
        nullif(count(*), 0) * 100.0, 1
    ), 0) as recovery_rate_pct,
    coalesce(round(
        count(*) filter (where o.status = 'RECOVERED' OR o.status = 'PARTIALLY_RECOVERED')::numeric /
        nullif(count(*), 0) * 100.0, 1
    ), 0) as recovery_rate_incl_partial_pct
from recovery_cases rc
left join decisions d on d.risk_event_id = rc.case_id
left join outcomes o on o.risk_event_id = rc.case_id
group by rc.merchant_id, d.policy_version;
