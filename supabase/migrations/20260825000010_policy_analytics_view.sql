--- §51 Policy Simulation Engine + §62 Policy Analytics.
--- Adds a policy_analytics view that aggregates recovery-cases-by-policy
--- and action-distribution so the dashboard can show policy performance
--- (§62 Policy Analytics: policy version, action distribution, recovery uplift,
--- policy blocks, escalation rate).

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
group by rc.merchant_id, d.policy_version
;
