-- Eggs are reusable QR campaigns with multiple physical access methods.
-- QR remains the default for existing scan events and callers.

alter table public.qr_scan_events
  add column if not exists access_method text not null default 'qr';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'qr_scan_events_access_method_check'
      and conrelid = 'public.qr_scan_events'::regclass
  ) then
    alter table public.qr_scan_events
      add constraint qr_scan_events_access_method_check
      check (access_method in ('qr', 'nfc'));
  end if;
end;
$$;

create index if not exists idx_qr_scan_events_campaign_access_method
  on public.qr_scan_events (campaign_id, access_method);

create or replace function public.record_egg_access(
  target_campaign_id bigint,
  target_access_method text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_access_method is null or target_access_method not in ('qr', 'nfc') then
    raise exception 'Unsupported Egg access method.';
  end if;

  if exists (
    select 1 from public.qr_campaigns
    where id = target_campaign_id and is_active
  ) then
    insert into public.qr_scan_events (campaign_id, access_method)
    values (target_campaign_id, target_access_method);

    with completed_tasks as (
      update public.woodpecker_tasks
      set status = 'completed', completed_at = now()
      where campaign_id = target_campaign_id
        and completion_mode = 'scan'
        and status <> 'completed'
      returning id
    )
    insert into public.woodpecker_task_history (task_id, event_type, message)
    select id, 'completed', 'Task completed by customer Egg access'
    from completed_tasks;
  end if;
end;
$$;

grant execute on function public.record_egg_access(bigint, text) to anon, authenticated;

create or replace function public.get_workspace_egg_access_metrics()
returns table(
  campaign_id bigint,
  qr_access_count bigint,
  nfc_access_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    campaign.id,
    count(event.id) filter (where event.access_method = 'qr'),
    count(event.id) filter (where event.access_method = 'nfc')
  from public.qr_campaigns campaign
  left join public.qr_scan_events event on event.campaign_id = campaign.id
  where campaign.workspace_id = public.current_workspace_id()
  group by campaign.id;
$$;

grant execute on function public.get_workspace_egg_access_metrics() to authenticated;
