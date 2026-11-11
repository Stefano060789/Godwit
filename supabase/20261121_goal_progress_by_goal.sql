alter table public.qr_campaigns
  drop constraint if exists qr_campaigns_goal_key_check;
alter table public.qr_campaigns
  add constraint qr_campaigns_goal_key_check
  check (goal_key is null or goal_key in (
    'answers',
    'feedback',
    'information',
    'next-step',
    'contacts',
    'reviews',
    'help-and-guide',
    'preferences',
    'satisfaction',
    'issue-reporting',
    'promotion',
    'event-interest',
    'return-visits'
  ));

alter table public.qr_campaigns
  drop constraint if exists qr_campaigns_goal_keys_check;
alter table public.qr_campaigns
  add constraint qr_campaigns_goal_keys_check
  check (
    goal_keys is null
    or (
      cardinality(goal_keys) between 1 and 11
      and goal_keys <@ array[
        'answers',
        'feedback',
        'information',
        'next-step',
        'contacts',
        'reviews',
        'help-and-guide',
        'preferences',
        'satisfaction',
        'issue-reporting',
        'promotion',
        'event-interest',
        'return-visits'
      ]::text[]
      and array_position(goal_keys, null) is null
    )
  );

create or replace function public.get_workspace_primary_goal_progress()
returns table(
  campaign_id bigint,
  activity_date date,
  metric text,
  event_count bigint
)
language sql
security definer
set search_path = public, pg_temp
volatile
as $$
  with workspace_campaigns as (
    select id
    from public.qr_campaigns
    where workspace_id = public.current_workspace_id()
  )
  select vote.campaign_id, vote.created_at::date, 'responses'::text, count(*)::bigint
  from public.votes vote
  join workspace_campaigns campaign on campaign.id = vote.campaign_id
  where vote.created_at >= now() - interval '30 days'
  group by vote.campaign_id, vote.created_at::date

  union all

  select lead.campaign_id, lead.created_at::date, 'contacts'::text, count(*)::bigint
  from public.voter_leads lead
  join workspace_campaigns campaign on campaign.id = lead.campaign_id
  where lead.created_at >= now() - interval '30 days'
  group by lead.campaign_id, lead.created_at::date

  union all

  select report.campaign_id, report.created_at::date, 'issues'::text, count(*)::bigint
  from public.egg_issue_reports report
  join workspace_campaigns campaign on campaign.id = report.campaign_id
  where report.created_at >= now() - interval '30 days'
  group by report.campaign_id, report.created_at::date;
$$;

revoke all on function public.get_workspace_primary_goal_progress() from public, anon;
grant execute on function public.get_workspace_primary_goal_progress() to authenticated;
