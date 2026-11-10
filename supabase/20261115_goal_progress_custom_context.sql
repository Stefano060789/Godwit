alter table public.workspaces
  add column if not exists business_description text;

alter table public.workspaces
  drop constraint if exists workspaces_business_type_check;
alter table public.workspaces
  add constraint workspaces_business_type_check
  check (business_type is null or business_type in (
    'cafe-pub',
    'restaurant-food',
    'accommodation',
    'arts-culture',
    'visitor-attraction',
    'event-venue',
    'retail-market',
    'local-service',
    'community-space',
    'other'
  ));

alter table public.qr_campaigns
  drop constraint if exists qr_campaigns_business_type_check;
alter table public.qr_campaigns
  add constraint qr_campaigns_business_type_check
  check (business_type is null or business_type in (
    'arts',
    'hospitality',
    'places',
    'events',
    'shops',
    'cafe-pub',
    'restaurant-food',
    'accommodation',
    'arts-culture',
    'visitor-attraction',
    'event-venue',
    'retail-market',
    'local-service',
    'community-space',
    'other'
  ));

alter table public.qr_campaigns
  add column if not exists goal_context text;

create index if not exists idx_qr_scan_events_campaign_created
  on public.qr_scan_events (campaign_id, created_at desc);
create index if not exists idx_voter_leads_campaign_created
  on public.voter_leads (campaign_id, created_at desc);
create index if not exists idx_organizer_messages_campaign_created
  on public.organizer_messages (campaign_id, created_at desc);

create or replace function public.get_workspace_goal_progress()
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
  select event.campaign_id, event.created_at::date, 'interactions'::text, count(*)::bigint
  from public.qr_scan_events event
  join workspace_campaigns campaign on campaign.id = event.campaign_id
  where event.created_at >= now() - interval '30 days'
  group by event.campaign_id, event.created_at::date

  union all

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

  select message.campaign_id, message.created_at::date, 'messages'::text, count(*)::bigint
  from public.organizer_messages message
  join workspace_campaigns campaign on campaign.id = message.campaign_id
  where message.created_at >= now() - interval '30 days'
  group by message.campaign_id, message.created_at::date;
$$;

revoke all on function public.get_workspace_goal_progress() from public, anon;
grant execute on function public.get_workspace_goal_progress() to authenticated;
