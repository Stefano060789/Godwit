-- A new account receives one 30-day Starter trial with up to 100 customer Egg sessions.
-- One session is counted once across all Eggs; staff previews are excluded.

create table if not exists public.workspace_trial_claims (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  interaction_limit integer not null default 100 check (interaction_limit > 0),
  check (ends_at > started_at)
);

create table if not exists public.workspace_trial_interactions (
  workspace_id uuid not null references public.workspace_trial_claims(workspace_id) on delete cascade,
  session_id uuid not null,
  campaign_id bigint references public.qr_campaigns(id) on delete set null,
  access_method text not null check (access_method in ('qr', 'nfc')),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (workspace_id, session_id)
);

create index if not exists idx_workspace_trial_interactions_workspace_created
  on public.workspace_trial_interactions (workspace_id, created_at desc)
  where not is_preview;

alter table public.workspace_trial_claims enable row level security;
alter table public.workspace_trial_interactions enable row level security;

create or replace function public.start_workspace_interaction_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_trial public.workspace_trial_claims%rowtype;
begin
  insert into public.workspace_trial_claims (workspace_id, owner_id, started_at, ends_at, interaction_limit)
  values (new.id, new.owner_id, now(), now() + interval '30 days', 100)
  on conflict (owner_id) do nothing
  returning * into new_trial;

  if not found then
    return new;
  end if;

  insert into public.workspace_subscriptions (workspace_id, plan, status, current_period_end)
  values (new.id, 'starter', 'trialing', new_trial.ends_at)
  on conflict (workspace_id) do nothing;

  return new;
end;
$$;

drop trigger if exists workspaces_start_interaction_trial on public.workspaces;
create trigger workspaces_start_interaction_trial
after insert on public.workspaces
for each row execute function public.start_workspace_interaction_trial();

create or replace function public.workspace_plan(target_workspace_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case
      when subscription.status = 'active' then subscription.plan
      when subscription.status = 'trialing'
        and trial.ends_at > now()
        and (
          select count(*) from public.workspace_trial_interactions interaction
          where interaction.workspace_id = trial.workspace_id and not interaction.is_preview
        ) < trial.interaction_limit
        then subscription.plan
      else 'free'
    end
    from public.workspace_subscriptions subscription
    left join public.workspace_trial_claims trial on trial.workspace_id = subscription.workspace_id
    where subscription.workspace_id = target_workspace_id
      and (
        subscription.status = 'active'
        or (subscription.status = 'trialing' and trial.workspace_id is not null)
      )
  ), 'free');
$$;

create or replace function public.workspace_plan_limits(
  target_workspace_id uuid default public.current_workspace_id()
)
returns table(plan text, poll_limit integer, campaign_limit integer, seat_limit integer)
language sql
security definer
set search_path = public
stable
as $$
  select
    public.workspace_plan(target_workspace_id),
    case public.workspace_plan(target_workspace_id)
      when 'starter' then 25
      when 'growth' then 250
      else 3
    end,
    case
      when subscription.status = 'trialing'
        and trial.ends_at > now()
        and (
          select count(*) from public.workspace_trial_interactions interaction
          where interaction.workspace_id = target_workspace_id and not interaction.is_preview
        ) < trial.interaction_limit
        then 2147483647
      when public.workspace_plan(target_workspace_id) = 'starter' then 10
      when public.workspace_plan(target_workspace_id) = 'growth' then 100
      else 1
    end,
    case public.workspace_plan(target_workspace_id)
      when 'starter' then 3
      when 'growth' then 10
      else 1
    end
  from (select 1) singleton
  left join public.workspace_subscriptions subscription on subscription.workspace_id = target_workspace_id
  left join public.workspace_trial_claims trial on trial.workspace_id = target_workspace_id;
$$;

create or replace function public.workspace_trial_status(target_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  trial public.workspace_trial_claims%rowtype;
  subscription_status text;
  subscription_plan text;
  used_interactions integer;
  trial_state text;
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'You do not have access to this workspace.';
  end if;

  select * into trial
  from public.workspace_trial_claims
  where workspace_id = target_workspace_id;

  if not found then
    return null;
  end if;

  select status, plan into subscription_status, subscription_plan
  from public.workspace_subscriptions
  where workspace_id = target_workspace_id;

  select count(*)::integer into used_interactions
  from public.workspace_trial_interactions
  where workspace_id = target_workspace_id and not is_preview;

  if subscription_status = 'active' and subscription_plan <> 'free' then
    trial_state := 'upgraded';
  elsif subscription_status is distinct from 'trialing' then
    trial_state := 'inactive';
  elsif trial.ends_at <= now() then
    trial_state := 'expired';
  elsif used_interactions >= trial.interaction_limit then
    trial_state := 'used_up';
  else
    trial_state := 'active';
  end if;

  return jsonb_build_object(
    'started_at', trial.started_at,
    'ends_at', trial.ends_at,
    'interaction_limit', trial.interaction_limit,
    'interactions_used', used_interactions,
    'interactions_remaining', greatest(trial.interaction_limit - used_interactions, 0),
    'state', trial_state,
    'active', trial_state = 'active'
  );
end;
$$;
revoke all on function public.workspace_trial_status(uuid) from public, anon;
grant execute on function public.workspace_trial_status(uuid) to authenticated;

create or replace function public.can_access_egg_session(
  target_workspace_id uuid,
  target_session_id uuid,
  target_is_preview boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  trial public.workspace_trial_claims%rowtype;
  subscription_status text;
  subscription_plan text;
begin
  select * into trial
  from public.workspace_trial_claims
  where workspace_id = target_workspace_id;

  if not found then
    return not target_is_preview or public.is_workspace_manager(target_workspace_id);
  end if;

  if target_is_preview then
    return public.is_workspace_manager(target_workspace_id)
      and exists (
        select 1 from public.workspace_trial_interactions interaction
        where interaction.workspace_id = target_workspace_id
          and interaction.session_id = target_session_id
          and interaction.is_preview
      );
  end if;

  if exists (
    select 1 from public.workspace_trial_interactions interaction
    where interaction.workspace_id = target_workspace_id
      and interaction.session_id = target_session_id
      and interaction.is_preview
  ) then
    return true;
  end if;

  select status, plan into subscription_status, subscription_plan
  from public.workspace_subscriptions
  where workspace_id = target_workspace_id;

  if subscription_status = 'active' and subscription_plan <> 'free' then
    return true;
  end if;

  return coalesce(subscription_status = 'trialing'
    and trial.ends_at > now()
    and exists (
      select 1 from public.workspace_trial_interactions interaction
      where interaction.workspace_id = target_workspace_id
        and interaction.session_id = target_session_id
        and not interaction.is_preview
    ), false);
end;
$$;
revoke all on function public.can_access_egg_session(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.check_egg_trial_session(
  target_campaign_token text,
  target_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.qr_campaigns
  where token = target_campaign_token and is_active;

  if target_workspace_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.workspace_trial_interactions interaction
    where interaction.workspace_id = target_workspace_id
      and interaction.session_id = target_session_id
      and interaction.is_preview
  ) then
    return true;
  end if;

  return public.can_access_egg_session(target_workspace_id, target_session_id, false);
end;
$$;
revoke all on function public.check_egg_trial_session(text, uuid) from public, anon, authenticated;
grant execute on function public.check_egg_trial_session(text, uuid) to service_role;

drop function if exists public.record_egg_access(bigint, text);
create or replace function public.record_egg_access(
  target_campaign_id bigint,
  target_access_method text,
  target_session_id uuid,
  target_is_preview boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  trial public.workspace_trial_claims%rowtype;
  subscription_status text;
  subscription_plan text;
  used_interactions integer;
  has_trial boolean;
begin
  if target_access_method is null or target_access_method not in ('qr', 'nfc') then
    raise exception 'Unsupported Egg access method.';
  end if;
  if target_session_id is null then
    raise exception 'A valid Egg session is required.';
  end if;

  select workspace_id into target_workspace_id
  from public.qr_campaigns
  where id = target_campaign_id and is_active;

  if target_workspace_id is null then
    return false;
  end if;

  select * into trial
  from public.workspace_trial_claims
  where workspace_id = target_workspace_id;
  has_trial := found;

  if target_is_preview then
    if not public.is_workspace_manager(target_workspace_id) then
      return false;
    end if;
    if has_trial then
      insert into public.workspace_trial_interactions (
        workspace_id, session_id, campaign_id, access_method, is_preview
      ) values (
        target_workspace_id, target_session_id, target_campaign_id, target_access_method, true
      )
      on conflict (workspace_id, session_id) do update
      set is_preview = public.workspace_trial_interactions.is_preview and excluded.is_preview;
    end if;
    return true;
  end if;

  if has_trial then
    select status, plan into subscription_status, subscription_plan
    from public.workspace_subscriptions
    where workspace_id = target_workspace_id
    for update;

    if subscription_status = 'active' and subscription_plan <> 'free' then
      null;
    elsif subscription_status is distinct from 'trialing' or trial.ends_at <= now() then
      return false;
    elsif exists (
      select 1 from public.workspace_trial_interactions interaction
      where interaction.workspace_id = target_workspace_id
        and interaction.session_id = target_session_id
        and not interaction.is_preview
    ) then
      null;
    else
      select count(*)::integer into used_interactions
      from public.workspace_trial_interactions
      where workspace_id = target_workspace_id and not is_preview;

      if used_interactions >= trial.interaction_limit then
        return false;
      end if;

      insert into public.workspace_trial_interactions (
        workspace_id, session_id, campaign_id, access_method
      ) values (
        target_workspace_id, target_session_id, target_campaign_id, target_access_method
      )
      on conflict (workspace_id, session_id) do nothing;
    end if;
  end if;

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

  return true;
end;
$$;
grant execute on function public.record_egg_access(bigint, text, uuid, boolean) to anon, authenticated;

alter table public.votes add column if not exists trial_session_id uuid;

create or replace function public.enforce_workspace_trial_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  trial public.workspace_trial_claims%rowtype;
  subscription_status text;
  subscription_plan text;
  campaign_vote boolean;
begin
  select workspace_id into target_workspace_id
  from public.polls
  where id = new.poll_id;

  if target_workspace_id is null then
    raise exception 'The poll does not exist.';
  end if;

  if auth.uid() is not null and public.is_workspace_member(target_workspace_id) then
    return new;
  end if;

  select exists (
    select 1 from public.qr_campaigns campaign
    where campaign.workspace_id = target_workspace_id
      and campaign.is_active
      and (campaign.id = new.campaign_id or campaign.poll_id = new.poll_id)
  ) into campaign_vote;
  if not campaign_vote then
    return new;
  end if;

  select * into trial
  from public.workspace_trial_claims
  where workspace_id = target_workspace_id;
  if not found then
    return new;
  end if;

  select status, plan into subscription_status, subscription_plan
  from public.workspace_subscriptions
  where workspace_id = target_workspace_id;

  if subscription_status = 'active' and subscription_plan <> 'free' then
    return new;
  end if;

  if subscription_status is distinct from 'trialing' or trial.ends_at <= now() then
    raise exception 'This Egg trial has ended. New customer interactions are paused.';
  end if;

  if new.trial_session_id is null or not exists (
    select 1 from public.workspace_trial_interactions interaction
    where interaction.workspace_id = target_workspace_id
      and interaction.session_id = new.trial_session_id
      and not interaction.is_preview
  ) then
    raise exception 'A valid Egg trial session is required to submit this vote.';
  end if;

  return new;
end;
$$;

drop trigger if exists votes_enforce_workspace_trial on public.votes;
create trigger votes_enforce_workspace_trial
before insert on public.votes
for each row execute function public.enforce_workspace_trial_vote();

alter table public.donation_settings
  add column if not exists category text not null default 'contribution';

alter table public.donation_settings
  drop constraint if exists donation_settings_category_check;

alter table public.donation_settings
  add constraint donation_settings_category_check
  check (category in ('tip', 'contribution', 'donation'));

drop function if exists public.get_public_qr_campaign_items(text);
create or replace function public.get_public_qr_campaign_items(
  target_token text,
  target_session_id uuid,
  target_is_preview boolean default false
)
returns table (
  item_id bigint,
  campaign_id bigint,
  portal_title text,
  portal_message text,
  item_type text,
  sort_order integer,
  poll_id bigint,
  poll_question text,
  poll_brand_name text,
  poll_brand_logo_url text,
  poll_brand_primary_color text,
  poll_brand_accent_color text,
  title text,
  body text,
  link_url text,
  link_label text,
  image_url text,
  accessibility_tags text[],
  reward_code text,
  donation_category text,
  donation_currency text,
  donation_suggested_amount numeric,
  donation_message text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    i.id,
    c.id,
    c.portal_title,
    c.portal_message,
    i.item_type,
    i.sort_order,
    i.poll_id,
    p.question,
    p.brand_name,
    p.brand_logo_url,
    p.brand_primary_color,
    p.brand_accent_color,
    i.title,
    i.body,
    i.link_url,
    i.link_label,
    i.image_url,
    i.accessibility_tags,
    i.reward_code,
    case when i.item_type = 'donation' then d.category else null end,
    case when i.item_type = 'donation' then d.currency else null end,
    case when i.item_type = 'donation' then d.suggested_amount else null end,
    case when i.item_type = 'donation' then coalesce(i.body, d.message) else null end
  from public.qr_campaign_items i
  join public.qr_campaigns c on c.id = i.campaign_id
  left join public.polls p on p.id = i.poll_id
  left join public.donation_settings d
    on d.workspace_id = c.workspace_id and d.is_enabled and d.stripe_charges_enabled
  where c.token = target_token
    and c.is_active
    and public.can_access_egg_session(c.workspace_id, target_session_id, target_is_preview)
  order by i.sort_order asc nulls last, i.id asc;
$$;
grant execute on function public.get_public_qr_campaign_items(text, uuid, boolean) to anon, authenticated;
