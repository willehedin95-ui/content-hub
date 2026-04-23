-- Analytics RPC functions for Quiz Funnel Builder
-- Phase 4 - created 2026-04-23
-- Apply via Supabase Management API

-- ─── quiz_summary ────────────────────────────────────────────────────────────
-- Single-row summary: starts, completions, completion_rate, email_captures,
-- median_time_to_exit_sec.

create or replace function quiz_summary(
  quiz_id_in uuid,
  since timestamptz,
  until timestamptz
)
returns table (
  starts            bigint,
  completions       bigint,
  completion_rate   numeric,
  email_captures    bigint,
  median_time_to_exit_sec numeric
)
language sql stable as $$
  with sessions as (
    select
      id,
      started_at,
      completed_at,
      exit_clicked,
      email
    from quiz_sessions
    where quiz_id = quiz_id_in
      and started_at >= since
      and started_at < until
  )
  select
    count(*)                                                              as starts,
    count(*) filter (where exit_clicked)                                  as completions,
    case
      when count(*) = 0 then 0
      else round(count(*) filter (where exit_clicked) * 100.0 / count(*), 1)
    end                                                                   as completion_rate,
    count(*) filter (where email is not null and email <> '')             as email_captures,
    coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (completed_at - started_at))
      ) filter (where completed_at is not null),
      0
    )                                                                     as median_time_to_exit_sec
  from sessions;
$$;

-- ─── quiz_funnel_stats ───────────────────────────────────────────────────────
-- Per-step: distinct sessions that viewed each step, dropoff_pct to the next
-- step in sequence, and median time on step.
-- device_filter: 'all' | 'mobile' | 'tablet' | 'desktop'
-- variant_filter: jsonb { variantGroupId: stepNodeId } — null means no filter

create or replace function quiz_funnel_stats(
  quiz_id_in    uuid,
  since         timestamptz,
  until         timestamptz,
  device_filter text    default 'all',
  variant_filter jsonb  default null
)
returns table (
  step_id          text,
  sessions         bigint,
  dropoff_pct      numeric,
  median_time_sec  numeric
)
language sql stable as $$
  with filtered_sessions as (
    select s.id
    from quiz_sessions s
    where s.quiz_id = quiz_id_in
      and s.started_at >= since
      and s.started_at < until
      and (device_filter = 'all' or s.device_type = device_filter)
      -- variant filter: if supplied, every variantGroupId key must match chosen stepNodeId
      and (
        variant_filter is null
        or (
          select bool_and(
            s.variant_assignments ->> (kv).key = (kv).value #>> '{}'
          )
          from jsonb_each(variant_filter) as kv
        )
      )
  ),
  step_sessions as (
    select
      e.step_id,
      count(distinct e.session_id) as sessions
    from quiz_events e
    join filtered_sessions fs on fs.id = e.session_id
    where e.quiz_id = quiz_id_in
      and e.event_type = 'step_view'
      and e.step_id is not null
    group by e.step_id
  ),
  -- Compute next-event time per row using a window, then aggregate
  events_with_next as (
    select
      e.step_id,
      extract(epoch from (
        lead(e.created_at) over (partition by e.session_id order by e.created_at)
        - e.created_at
      )) as secs_to_next
    from quiz_events e
    join filtered_sessions fs on fs.id = e.session_id
    where e.quiz_id = quiz_id_in
      and e.event_type = 'step_view'
      and e.step_id is not null
  ),
  step_times as (
    select
      step_id,
      percentile_cont(0.5) within group (order by secs_to_next) as median_time_sec
    from events_with_next
    where secs_to_next is not null
    group by step_id
  ),
  -- Total starters (first step_view in each session counts as "entry")
  total_starters as (
    select count(distinct session_id) as cnt
    from quiz_events
    where quiz_id = quiz_id_in
      and event_type = 'step_view'
      and session_id in (select id from filtered_sessions)
  )
  select
    ss.step_id,
    ss.sessions,
    -- dropoff: percentage of sessions that saw THIS step but not the next-most-
    -- popular step. Simple approach: (this_sessions - next_sessions) / this_sessions * 100.
    -- We approximate "next" by the step with the next-lower session count in the
    -- ordered set. The analytics page sorts by topo order client-side.
    case
      when ss.sessions = 0 then 0
      else round(
        (ss.sessions - coalesce(
          lag(ss.sessions) over (order by ss.sessions desc),
          ss.sessions
        )) * 100.0 / ss.sessions,
        1
      )
    end as dropoff_pct,
    coalesce(st.median_time_sec, 0) as median_time_sec
  from step_sessions ss
  left join step_times st using (step_id)
  order by ss.sessions desc;
$$;

-- ─── quiz_option_distribution ────────────────────────────────────────────────
-- Per step + question element + option: count + % of all answers for that step.

create or replace function quiz_option_distribution(
  quiz_id_in uuid,
  since      timestamptz,
  until      timestamptz
)
returns table (
  step_id           text,
  question_el_id    text,
  option_id         text,
  option_count      bigint,
  option_pct_of_step numeric
)
language sql stable as $$
  with answers as (
    select
      e.step_id,
      e.meta ->> 'questionElId' as question_el_id,
      e.option_id,
      count(*) as cnt
    from quiz_events e
    join quiz_sessions s on s.id = e.session_id
    where e.quiz_id = quiz_id_in
      and e.event_type = 'answer'
      and s.started_at >= since
      and s.started_at < until
      and e.step_id is not null
      and e.option_id is not null
    group by e.step_id, e.meta ->> 'questionElId', e.option_id
  ),
  step_totals as (
    select step_id, question_el_id, sum(cnt) as total
    from answers
    group by step_id, question_el_id
  )
  select
    a.step_id,
    a.question_el_id,
    a.option_id,
    a.cnt as option_count,
    case
      when st.total = 0 then 0
      else round(a.cnt * 100.0 / st.total, 1)
    end as option_pct_of_step
  from answers a
  join step_totals st using (step_id, question_el_id)
  order by a.step_id, a.question_el_id, a.cnt desc;
$$;

-- ─── quiz_variant_comparison ─────────────────────────────────────────────────
-- Per variant group + chosen step node: sessions, completion_rate, through_rate.

create or replace function quiz_variant_comparison(
  quiz_id_in uuid,
  since      timestamptz,
  until      timestamptz
)
returns table (
  variant_group_id text,
  step_id          text,
  sessions         bigint,
  completion_rate  numeric,
  through_rate     numeric
)
language sql stable as $$
  with variant_sessions as (
    -- Each (variantGroupId, chosen stepNodeId) combination
    select
      e.variant_group_id,
      e.step_id,
      e.session_id,
      s.exit_clicked
    from quiz_events e
    join quiz_sessions s on s.id = e.session_id
    where e.quiz_id = quiz_id_in
      and e.event_type = 'step_view'
      and e.variant_group_id is not null
      and s.started_at >= since
      and s.started_at < until
  ),
  -- Sessions that went beyond the variant step (viewed another step after it)
  through_sessions as (
    select
      vs.variant_group_id,
      vs.step_id,
      vs.session_id
    from variant_sessions vs
    where exists (
      select 1
      from quiz_events e2
      where e2.session_id = vs.session_id
        and e2.event_type = 'step_view'
        and e2.created_at > (
          select min(created_at)
          from quiz_events
          where session_id = vs.session_id
            and step_id = vs.step_id
            and event_type = 'step_view'
        )
        and e2.step_id <> vs.step_id
    )
  ),
  agg as (
    select
      vs.variant_group_id,
      vs.step_id,
      count(distinct vs.session_id)                          as sessions,
      count(distinct vs.session_id) filter (where vs.exit_clicked) as completions,
      count(distinct ts.session_id)                          as through_count
    from variant_sessions vs
    left join through_sessions ts
      on ts.variant_group_id = vs.variant_group_id
      and ts.step_id = vs.step_id
      and ts.session_id = vs.session_id
    group by vs.variant_group_id, vs.step_id
  )
  select
    variant_group_id,
    step_id,
    sessions,
    case when sessions = 0 then 0 else round(completions * 100.0 / sessions, 1) end as completion_rate,
    case when sessions = 0 then 0 else round(through_count * 100.0 / sessions, 1) end as through_rate
  from agg
  order by variant_group_id, sessions desc;
$$;

-- ─── workspace_quizzes_kpis ──────────────────────────────────────────────────
-- Lightweight KPI row per quiz for the list page.

create or replace function workspace_quizzes_kpis(
  workspace_id_in uuid,
  since           timestamptz,
  until           timestamptz
)
returns table (
  quiz_id          uuid,
  starts           bigint,
  completions      bigint,
  completion_rate  numeric
)
language sql stable as $$
  select
    s.quiz_id,
    count(*)                                            as starts,
    count(*) filter (where s.exit_clicked)              as completions,
    case
      when count(*) = 0 then 0::numeric
      else round(count(*) filter (where s.exit_clicked) * 100.0 / count(*), 1)
    end                                                 as completion_rate
  from quiz_sessions s
  join quizzes q on q.id = s.quiz_id
  where q.workspace_id = workspace_id_in
    and s.started_at >= since
    and s.started_at < until
  group by s.quiz_id;
$$;
