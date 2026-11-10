-- Apply after 20261118_paid_interaction_billing.sql using the SQL editor.
-- Complimentary access is tied to a confirmed auth user, never client input.
begin;

create table if not exists public.creator_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.creator_accounts enable row level security;
revoke all on public.creator_accounts from public, anon, authenticated;
grant select, insert, delete on public.creator_accounts to service_role;

do $$
declare creator_id uuid;
begin
  select id into strict creator_id from auth.users
    where lower(email) = 'bonomistefano@outlook.it' and email_confirmed_at is not null;
  insert into public.creator_accounts(user_id) values (creator_id) on conflict do nothing;
exception
  when no_data_found then raise exception 'The confirmed creator account was not found. No access was granted.';
  when too_many_rows then raise exception 'Multiple creator accounts matched. No access was granted.';
end;
$$;

create or replace function public.workspace_has_creator_access(target_workspace_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.workspaces w join public.creator_accounts c on c.user_id = w.owner_id
    where w.id = target_workspace_id
  );
$$;
revoke all on function public.workspace_has_creator_access(uuid) from public, anon, authenticated;
grant execute on function public.workspace_has_creator_access(uuid) to service_role;

-- Retain the metered implementation intact for every other account.
do $$
begin
  if to_regprocedure('public.workspace_plan_metered(uuid)') is null then
    alter function public.workspace_plan(uuid) rename to workspace_plan_metered;
    alter function public.workspace_plan_limits(uuid) rename to workspace_plan_limits_metered;
    alter function public.workspace_interaction_status(uuid) rename to workspace_interaction_status_metered;
    alter function public.can_access_egg_session(uuid, uuid, boolean) rename to can_access_egg_session_metered;
    alter function public.record_egg_access(bigint, text, uuid, boolean) rename to record_egg_access_metered;
  end if;
end;
$$;

create or replace function public.workspace_plan(target_workspace_id uuid)
returns text language sql security definer set search_path = public stable as $$
  select case when public.workspace_has_creator_access(target_workspace_id) then 'growth'
    else public.workspace_plan_metered(target_workspace_id) end;
$$;

create or replace function public.workspace_plan_limits(target_workspace_id uuid default public.current_workspace_id())
returns table(plan text, poll_limit integer, campaign_limit integer, seat_limit integer)
language plpgsql security definer set search_path = public stable as $$
begin
  if public.workspace_has_creator_access(target_workspace_id) then
    return query select 'growth'::text, 2147483647, 2147483647, 2147483647;
  else
    return query select * from public.workspace_plan_limits_metered(target_workspace_id);
  end if;
end;
$$;

create or replace function public.workspace_interaction_status(target_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  if auth.role() is distinct from 'service_role'
    and not coalesce(public.is_workspace_member(target_workspace_id), false) then
    raise exception 'You do not have access to this workspace.' using errcode = '42501';
  end if;
  if public.workspace_has_creator_access(target_workspace_id) then
    return jsonb_build_object(
      'state', 'complimentary', 'plan', 'creator', 'unlimited', true,
      'base_limit', null, 'base_used', null, 'interactions_remaining', null,
      'warning', false, 'can_topup', false,
      'has_subscription', exists (
        select 1 from public.workspace_interaction_subscriptions
        where workspace_id = target_workspace_id
      ));
  end if;
  return public.workspace_interaction_status_metered(target_workspace_id);
end;
$$;

create or replace function public.can_access_egg_session(
  target_workspace_id uuid, target_session_id uuid, target_is_preview boolean default false
)
returns boolean language plpgsql security definer set search_path = public stable as $$
begin
  if target_session_id is null or target_is_preview is null then return false; end if;
  if public.workspace_has_creator_access(target_workspace_id) and not target_is_preview then
    return exists (
      select 1 from public.workspace_interaction_sessions
      where workspace_id = target_workspace_id and session_id = target_session_id
        and allocation <> 'preview'
    ) or coalesce(public.is_workspace_manager(target_workspace_id), false) and exists (
      select 1 from public.workspace_interaction_sessions
      where workspace_id = target_workspace_id and session_id = target_session_id
        and allocation = 'preview'
    );
  end if;
  return public.can_access_egg_session_metered(target_workspace_id, target_session_id, target_is_preview);
end;
$$;

create or replace function public.record_egg_access(
  target_campaign_id bigint, target_access_method text, target_session_id uuid,
  target_is_preview boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_workspace uuid;
begin
  if target_access_method is null or target_access_method not in ('qr', 'nfc') then
    raise exception 'Unsupported Egg access method.';
  end if;
  if target_session_id is null or target_is_preview is null then
    raise exception 'A valid Egg session and preview flag are required.';
  end if;
  select workspace_id into target_workspace from public.qr_campaigns
    where id = target_campaign_id and is_active;
  if target_workspace is null then return false; end if;
  if target_is_preview or not public.workspace_has_creator_access(target_workspace) then
    return public.record_egg_access_metered(target_campaign_id, target_access_method, target_session_id, target_is_preview);
  end if;
  perform 1 from public.workspaces where id = target_workspace for update;
  if exists (select 1 from public.workspace_interaction_sessions
    where workspace_id = target_workspace and session_id = target_session_id and allocation = 'preview') then
    return false;
  end if;
  insert into public.workspace_interaction_sessions(
    workspace_id, session_id, campaign_id, access_method, allocation, period_start, period_end
  ) values (target_workspace, target_session_id, target_campaign_id, target_access_method,
    'base', date_trunc('year', now()), date_trunc('year', now()) + interval '1 year')
    on conflict do nothing;
  insert into public.qr_scan_events(campaign_id, access_method) values (target_campaign_id, target_access_method);
  with completed_tasks as (
    update public.woodpecker_tasks set status = 'completed', completed_at = now()
      where campaign_id = target_campaign_id and completion_mode = 'scan' and status <> 'completed'
      returning id
  )
  insert into public.woodpecker_task_history(task_id, event_type, message)
    select id, 'completed', 'Task completed by customer Egg access' from completed_tasks;
  return true;
end;
$$;

revoke all on function public.workspace_plan_metered(uuid),
  public.workspace_plan_limits_metered(uuid), public.workspace_interaction_status_metered(uuid),
  public.can_access_egg_session_metered(uuid, uuid, boolean),
  public.record_egg_access_metered(bigint, text, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.workspace_plan(uuid), public.workspace_plan_limits(uuid),
  public.workspace_interaction_status(uuid), public.can_access_egg_session(uuid, uuid, boolean),
  public.record_egg_access(bigint, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.workspace_plan(uuid), public.workspace_plan_limits(uuid),
  public.workspace_interaction_status(uuid) to authenticated, service_role;
grant execute on function public.can_access_egg_session(uuid, uuid, boolean) to service_role;
grant execute on function public.record_egg_access(bigint, text, uuid, boolean) to anon, authenticated, service_role;

commit;
