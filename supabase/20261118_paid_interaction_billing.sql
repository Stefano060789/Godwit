-- Apply after 20261117_trial_ten_interactions.sql.
-- Stripe metadata, prices (€7 per 100-session top-up), and payment completion must
-- be verified by the backend before invoking either service-only apply RPC.
-- New paid entitlements require status=active; Stripe trialing fails closed.
-- The original ten-session workspace trial is a separate, preserved mechanism.
begin;

create table public.workspace_interaction_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_subscription_id text not null unique check (btrim(stripe_subscription_id) <> ''),
  stripe_customer_id text not null check (btrim(stripe_customer_id) <> ''),
  plan text not null check (plan in ('small', 'standard', 'scale', 'regional')),
  status text not null check (status in (
    'active', 'trialing', 'past_due', 'canceled', 'inactive', 'incomplete',
    'incomplete_expired', 'unpaid', 'paused'
  )),
  period_start timestamptz not null,
  period_end timestamptz not null,
  event_created timestamptz not null,
  updated_at timestamptz not null default now(),
  check (isfinite(period_start) and isfinite(period_end) and period_end > period_start),
  check (isfinite(event_created))
);

-- Retain retired IDs: a late deleted/updated event must never resurrect a
-- replaced subscription, even if its event timestamp is newer.
create table public.workspace_interaction_subscription_ids (
  stripe_subscription_id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade
);

create table public.workspace_billing_checkouts (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  checkout_session_id text not null unique check (btrim(checkout_session_id) <> ''),
  expires_at timestamptz not null check (isfinite(expires_at))
);

create table public.workspace_interaction_topups (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_session_id text not null unique check (btrim(checkout_session_id) <> ''),
  payment_intent_id text not null unique check (btrim(payment_intent_id) <> ''),
  purchased_at timestamptz not null check (isfinite(purchased_at)),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  quantity integer not null default 100 check (quantity = 100),
  used integer not null default 0 check (used between 0 and quantity),
  check (expires_at = purchased_at + interval '30 days')
);
create index workspace_interaction_topups_available
  on public.workspace_interaction_topups(workspace_id, expires_at, id)
  where used < quantity and revoked_at is null;

-- A session is registered once per workspace, not once per Egg or renewal.
-- Allocation is immutable: top-up usage never becomes base usage on upgrade.
-- Base usage is counted by registration time in the current Stripe period.
create table public.workspace_interaction_sessions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  session_id uuid not null,
  campaign_id bigint references public.qr_campaigns(id) on delete set null,
  access_method text not null check (access_method in ('qr', 'nfc')),
  allocation text not null check (allocation in ('preview', 'trial', 'base', 'topup')),
  topup_id bigint references public.workspace_interaction_topups(id),
  created_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,
  primary key (workspace_id, session_id),
  check ((allocation = 'topup') = (topup_id is not null)),
  check (allocation = 'preview' or
    (period_start is not null and period_end is not null and period_end > period_start))
);
create index workspace_interaction_sessions_base_usage
  on public.workspace_interaction_sessions(workspace_id, created_at)
  where allocation in ('base', 'trial');

-- Preserve trial usage and previews. The original trial ledger remains the
-- authority for its ten-session cap; it is not reset when a plan is purchased.
insert into public.workspace_interaction_sessions (
  workspace_id, session_id, campaign_id, access_method, allocation,
  created_at, period_start, period_end
)
select i.workspace_id, i.session_id, i.campaign_id, i.access_method,
  case when i.is_preview then 'preview' else 'trial' end,
  i.created_at, t.started_at, t.ends_at
from public.workspace_trial_interactions i
join public.workspace_trial_claims t using (workspace_id);

alter table public.workspace_interaction_subscriptions enable row level security;
alter table public.workspace_interaction_subscription_ids enable row level security;
alter table public.workspace_billing_checkouts enable row level security;
alter table public.workspace_interaction_topups enable row level security;
alter table public.workspace_interaction_sessions enable row level security;
revoke all on public.workspace_interaction_subscriptions,
  public.workspace_interaction_subscription_ids, public.workspace_billing_checkouts,
  public.workspace_interaction_topups, public.workspace_interaction_sessions
  from public, anon, authenticated;
grant all on public.workspace_interaction_subscriptions,
  public.workspace_interaction_subscription_ids, public.workspace_billing_checkouts,
  public.workspace_interaction_topups, public.workspace_interaction_sessions to service_role;
revoke all on sequence public.workspace_interaction_topups_id_seq from public, anon, authenticated;
grant usage, select on sequence public.workspace_interaction_topups_id_seq to service_role;

create or replace function public.interaction_plan_limit(target_plan text)
returns integer language sql immutable set search_path = public as $$
  select case target_plan when 'small' then 100 when 'standard' then 500
    when 'scale' then 2000 when 'regional' then 10000 else 0 end;
$$;

-- PostgREST body: {"subscription": {workspace_id, stripe_subscription_id,
-- stripe_customer_id, plan, status, period_start, period_end, event_created}}.
-- Period timestamps are ISO-8601 strings; event_created also accepts Stripe Unix
-- seconds. Equal event times are no-ops (first accepted snapshot wins).
create or replace function public.apply_interaction_subscription(subscription jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  input jsonb := subscription;
  incoming public.workspace_interaction_subscriptions%rowtype;
  previous public.workspace_interaction_subscriptions%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  incoming.workspace_id := (input->>'workspace_id')::uuid;
  incoming.stripe_subscription_id := input->>'stripe_subscription_id';
  incoming.stripe_customer_id := input->>'stripe_customer_id';
  incoming.plan := input->>'plan';
  incoming.status := input->>'status';
  incoming.period_start := (input->>'period_start')::timestamptz;
  incoming.period_end := (input->>'period_end')::timestamptz;
  incoming.event_created := case when jsonb_typeof(input->'event_created') = 'number'
    then to_timestamp((input->>'event_created')::double precision)
    else (input->>'event_created')::timestamptz end;
  -- Validate before even considering stale events.
  if incoming.workspace_id is null
    or nullif(btrim(incoming.stripe_subscription_id), '') is null
    or nullif(btrim(incoming.stripe_customer_id), '') is null
    or incoming.plan is null or public.interaction_plan_limit(incoming.plan) = 0
    or incoming.status is null or incoming.status not in (
      'active', 'trialing', 'past_due', 'canceled', 'inactive', 'incomplete',
      'incomplete_expired', 'unpaid', 'paused')
    or incoming.period_start is null or incoming.period_end is null
    or not isfinite(incoming.period_start) or not isfinite(incoming.period_end)
    or incoming.period_end <= incoming.period_start
    or incoming.event_created is null or not isfinite(incoming.event_created) then
    raise exception 'Invalid interaction subscription payload.';
  end if;

  perform 1 from public.workspaces where id = incoming.workspace_id for update;
  if not found then raise exception 'Workspace does not exist.'; end if;
  select * into previous from public.workspace_interaction_subscriptions
    where workspace_id = incoming.workspace_id;
  if found then
    if incoming.event_created <= previous.event_created then
      return jsonb_build_object('applied', false, 'reason', 'stale_or_duplicate');
    end if;
    if incoming.stripe_subscription_id <> previous.stripe_subscription_id
      and exists (select 1 from public.workspace_interaction_subscription_ids
        where stripe_subscription_id = incoming.stripe_subscription_id) then
      return jsonb_build_object('applied', false, 'reason', 'replaced_subscription');
    end if;
    if incoming.stripe_subscription_id = previous.stripe_subscription_id
      and incoming.period_start < previous.period_start then
      return jsonb_build_object('applied', false, 'reason', 'stale_period');
    end if;
  end if;

  insert into public.workspace_interaction_subscription_ids(stripe_subscription_id, workspace_id)
    values (incoming.stripe_subscription_id, incoming.workspace_id)
    on conflict (stripe_subscription_id) do nothing;
  if not exists (select 1 from public.workspace_interaction_subscription_ids
    where stripe_subscription_id = incoming.stripe_subscription_id
      and workspace_id = incoming.workspace_id) then
    raise exception 'Subscription belongs to another workspace.';
  end if;

  insert into public.workspace_interaction_subscriptions (
    workspace_id, stripe_subscription_id, stripe_customer_id, plan, status,
    period_start, period_end, event_created
  ) values (
    incoming.workspace_id, incoming.stripe_subscription_id, incoming.stripe_customer_id,
    incoming.plan, incoming.status, incoming.period_start, incoming.period_end, incoming.event_created
  ) on conflict (workspace_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id, plan = excluded.plan,
    status = excluded.status, period_start = excluded.period_start,
    period_end = excluded.period_end, event_created = excluded.event_created, updated_at = now();

  insert into public.workspace_subscriptions (
    workspace_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_end
  ) values (
    incoming.workspace_id, incoming.stripe_subscription_id, incoming.stripe_customer_id,
    case when incoming.plan in ('small', 'standard') then 'starter' else 'growth' end,
    case when incoming.status = 'incomplete_expired' then 'inactive' else incoming.status end,
    incoming.period_end
  ) on conflict (workspace_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_customer_id = excluded.stripe_customer_id, plan = excluded.plan,
    status = excluded.status, current_period_end = excluded.current_period_end, updated_at = now();
  return jsonb_build_object('applied', true);
end;
$$;

-- PostgREST body: {"topup": {workspace_id, checkout_session_id,
-- payment_intent_id, purchased_at}}. purchased_at is Stripe Checkout.created
-- converted to an ISO-8601 timestamptz string, never webhook receipt time.
create or replace function public.apply_interaction_topup(topup jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  input jsonb := topup;
  target_workspace uuid := (input->>'workspace_id')::uuid;
  checkout_id text := input->>'checkout_session_id';
  payment_id text := input->>'payment_intent_id';
  purchased timestamptz := (input->>'purchased_at')::timestamptz;
  existing public.workspace_interaction_topups%rowtype;
  inserted_id bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if target_workspace is null or nullif(btrim(checkout_id), '') is null
    or nullif(btrim(payment_id), '') is null or purchased is null
    or not isfinite(purchased) or purchased > now() + interval '5 minutes' then
    raise exception 'Invalid interaction top-up payload.';
  end if;
  perform 1 from public.workspaces where id = target_workspace for update;
  if not found then raise exception 'Workspace does not exist.'; end if;
  -- Insert first so unique indexes also serialize concurrent cross-workspace
  -- replay attempts. Never change purchase time or refill an existing purchase.
  insert into public.workspace_interaction_topups (
    workspace_id, checkout_session_id, payment_intent_id, purchased_at, expires_at
  ) values (target_workspace, checkout_id, payment_id, purchased, purchased + interval '30 days')
  on conflict do nothing returning id into inserted_id;
  if inserted_id is not null then
    return jsonb_build_object('applied', true, 'topup_id', inserted_id);
  end if;
  select * into existing from public.workspace_interaction_topups
    where checkout_session_id = checkout_id or payment_intent_id = payment_id
    order by id limit 1;
  if existing.workspace_id <> target_workspace
    or existing.checkout_session_id <> checkout_id
    or existing.payment_intent_id <> payment_id
    or existing.purchased_at <> purchased then
    raise exception 'Top-up replay does not match the original purchase.';
  end if;
  return jsonb_build_object('applied', false, 'reason', 'duplicate', 'topup_id', existing.id);
end;
$$;

-- A full or partial refund revokes all unspent credits from that purchase.
-- Spent allocations and used remain immutable. Unknown payment IDs are no-ops.
create or replace function public.revoke_interaction_topup(target_payment_intent_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_workspace uuid;
  revoked_id bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if nullif(btrim(target_payment_intent_id), '') is null then
    raise exception 'A payment intent ID is required.';
  end if;
  select workspace_id into target_workspace from public.workspace_interaction_topups
    where payment_intent_id = target_payment_intent_id;
  if target_workspace is null then
    return jsonb_build_object('applied', false, 'reason', 'not_found');
  end if;
  perform 1 from public.workspaces where id = target_workspace for update;
  update public.workspace_interaction_topups set revoked_at = now()
    where payment_intent_id = target_payment_intent_id and revoked_at is null
    returning id into revoked_id;
  if revoked_id is null then
    return jsonb_build_object('applied', false, 'reason', 'already_revoked');
  end if;
  return jsonb_build_object('applied', true, 'topup_id', revoked_id);
end;
$$;

create or replace function public.workspace_interaction_status(target_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  subscription public.workspace_interaction_subscriptions%rowtype;
  trial public.workspace_trial_claims%rowtype;
  result_plan text := 'legacy';
  result_state text := 'legacy';
  starts timestamptz;
  ends timestamptz;
  quota integer := 0;
  used_count bigint := 0;
  remaining_topups bigint := 0;
  first_expiry timestamptz;
  paid boolean := false;
  legacy_status text;
  legacy_plan text;
begin
  if auth.role() is distinct from 'service_role'
    and not coalesce(public.is_workspace_member(target_workspace_id), false) then
    raise exception 'You do not have access to this workspace.' using errcode = '42501';
  end if;
  select * into subscription from public.workspace_interaction_subscriptions
    where workspace_id = target_workspace_id;
  if found then
    result_plan := subscription.plan;
    starts := subscription.period_start;
    ends := subscription.period_end;
    quota := public.interaction_plan_limit(result_plan);
    select count(*) into used_count from public.workspace_interaction_sessions
      where workspace_id = target_workspace_id and allocation in ('base', 'trial')
        and created_at >= starts and created_at < ends;
    select coalesce(sum(quantity - used), 0), min(expires_at)
      into remaining_topups, first_expiry from public.workspace_interaction_topups
      where workspace_id = target_workspace_id and purchased_at <= now()
        and expires_at > now() and used < quantity and revoked_at is null;
    paid := subscription.status = 'active' and starts <= now() and ends > now();
    if not paid then
      remaining_topups := 0;
      first_expiry := null;
    end if;
    result_state := case
      when ends <= now() then 'expired'
      when not paid then 'inactive'
      when greatest(quota - used_count, 0) + remaining_topups = 0 then 'exhausted'
      else 'active' end;
  else
    select status, plan into legacy_status, legacy_plan from public.workspace_subscriptions
      where workspace_id = target_workspace_id;
    select * into trial from public.workspace_trial_claims where workspace_id = target_workspace_id;
    -- Existing active paid feature-tier subscriptions keep their legacy behavior.
    if found and not (coalesce(legacy_status = 'active' and legacy_plan <> 'free', false)) then
      result_plan := 'trial';
      starts := trial.started_at;
      ends := trial.ends_at;
      quota := trial.interaction_limit;
      select count(*) into used_count from public.workspace_trial_interactions
        where workspace_id = target_workspace_id and not is_preview;
      result_state := case when ends <= now() then 'expired'
        when legacy_status is distinct from 'trialing' then 'inactive'
        when used_count >= quota then 'exhausted' else 'active' end;
    end if;
  end if;
  return jsonb_build_object(
    'state', result_state, 'plan', result_plan, 'period_start', starts, 'period_end', ends,
    'base_limit', quota, 'base_used', used_count, 'topup_remaining', remaining_topups,
    'interactions_remaining', case when result_state in ('active', 'exhausted')
      then greatest(quota - used_count, 0) + remaining_topups else 0 end,
    'warning', result_state in ('active', 'exhausted') and quota > 0
      and used_count * 10 >= quota::bigint * 9 and remaining_topups = 0,
    'can_topup', paid,
    'next_plan', case result_plan when 'trial' then 'small' when 'small' then 'standard'
      when 'standard' then 'scale' when 'scale' then 'regional' else null end,
    'topup_expires_at', first_expiry);
end;
$$;

create or replace function public.workspace_plan(target_workspace_id uuid)
returns text language sql security definer set search_path = public stable as $$
  select coalesce(
    (select case when s.status = 'active'
        and s.period_start <= now() and s.period_end > now()
      then case when s.plan in ('small', 'standard') then 'starter' else 'growth' end
      else 'free' end
    from public.workspace_interaction_subscriptions s where s.workspace_id = target_workspace_id),
    (select case when s.status = 'active' then s.plan
      when s.status = 'trialing' and t.started_at <= now() and t.ends_at > now()
        and (select count(*) from public.workspace_trial_interactions i
          where i.workspace_id = t.workspace_id and not i.is_preview) < t.interaction_limit
      then s.plan else 'free' end
    from public.workspace_subscriptions s
    left join public.workspace_trial_claims t using (workspace_id)
    where s.workspace_id = target_workspace_id), 'free');
$$;

create or replace function public.workspace_plan_limits(
  target_workspace_id uuid default public.current_workspace_id()
)
returns table(plan text, poll_limit integer, campaign_limit integer, seat_limit integer)
language sql security definer set search_path = public stable as $$
  select p.plan,
    case p.plan when 'starter' then 25 when 'growth' then 250 else 3 end,
    case when exists (
      select 1 from public.workspace_interaction_subscriptions s
      where s.workspace_id = target_workspace_id and s.status = 'active'
        and s.period_start <= now() and s.period_end > now()
    ) or (not exists (
      select 1 from public.workspace_interaction_subscriptions s where s.workspace_id = target_workspace_id
    ) and exists (
      select 1 from public.workspace_trial_claims t
      join public.workspace_subscriptions s using (workspace_id)
      where t.workspace_id = target_workspace_id and s.status = 'trialing'
        and t.started_at <= now() and t.ends_at > now()
        and (select count(*) from public.workspace_trial_interactions i
          where i.workspace_id = t.workspace_id and not i.is_preview) < t.interaction_limit
    )) then 2147483647
      when p.plan = 'starter' then 10 when p.plan = 'growth' then 100 else 1 end,
    case p.plan when 'starter' then 3 when 'growth' then 10 else 1 end
  from (select public.workspace_plan(target_workspace_id) as plan) p;
$$;

create or replace function public.can_access_egg_session(
  target_workspace_id uuid, target_session_id uuid, target_is_preview boolean default false
)
returns boolean language plpgsql security definer set search_path = public stable as $$
declare
  subscription public.workspace_interaction_subscriptions%rowtype;
  trial public.workspace_trial_claims%rowtype;
  registered public.workspace_interaction_sessions%rowtype;
  legacy_status text;
  legacy_plan text;
begin
  select * into registered from public.workspace_interaction_sessions
    where workspace_id = target_workspace_id and session_id = target_session_id;
  if target_is_preview or registered.allocation = 'preview' then
    return coalesce(public.is_workspace_manager(target_workspace_id)
      and registered.allocation = 'preview', false);
  end if;
  select * into subscription from public.workspace_interaction_subscriptions
    where workspace_id = target_workspace_id;
  if found then
    return coalesce(subscription.status = 'active'
      and subscription.period_start <= now() and subscription.period_end > now()
      and registered.allocation in ('base', 'topup', 'trial')
      and registered.created_at >= subscription.period_start
      and registered.created_at < subscription.period_end, false);
  end if;
  select * into trial from public.workspace_trial_claims where workspace_id = target_workspace_id;
  if not found then return true; end if;
  select status, plan into legacy_status, legacy_plan from public.workspace_subscriptions
    where workspace_id = target_workspace_id;
  if legacy_status = 'active' and legacy_plan <> 'free' then return true; end if;
  return coalesce(legacy_status = 'trialing' and trial.started_at <= now()
    and trial.ends_at > now() and exists (
      select 1 from public.workspace_trial_interactions i
      where i.workspace_id = target_workspace_id and i.session_id = target_session_id and not i.is_preview
    ), false);
end;
$$;

-- The AI service wrapper must not trust a preview UUID without checking the manager.
create or replace function public.check_egg_trial_session(target_campaign_token text, target_session_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select public.can_access_egg_session(c.workspace_id, target_session_id, false)
    from public.qr_campaigns c where c.token = target_campaign_token and c.is_active), false);
$$;

create or replace function public.record_egg_access(
  target_campaign_id bigint, target_access_method text, target_session_id uuid,
  target_is_preview boolean default false
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  target_workspace uuid;
  subscription public.workspace_interaction_subscriptions%rowtype;
  trial public.workspace_trial_claims%rowtype;
  registered public.workspace_interaction_sessions%rowtype;
  used_count bigint;
  available_topup bigint;
  allocation_kind text;
  legacy_status text;
  legacy_plan text;
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
  -- Same lock used by billing webhooks, all Eggs, and all quota allocations.
  perform 1 from public.workspaces where id = target_workspace for update;
  select * into registered from public.workspace_interaction_sessions
    where workspace_id = target_workspace and session_id = target_session_id;
  if target_is_preview then
    if not coalesce(public.is_workspace_manager(target_workspace), false) then return false; end if;
    if registered.session_id is not null then return registered.allocation = 'preview'; end if;
    insert into public.workspace_interaction_sessions
      (workspace_id, session_id, campaign_id, access_method, allocation)
      values (target_workspace, target_session_id, target_campaign_id, target_access_method, 'preview');
    return true;
  end if;
  -- A preview cannot be converted into a free customer session.
  if registered.allocation = 'preview' then return false; end if;
  select * into subscription from public.workspace_interaction_subscriptions
    where workspace_id = target_workspace;
  if found then
    if subscription.status <> 'active'
      or subscription.period_start > now() or subscription.period_end <= now() then return false; end if;
    if registered.session_id is not null then
      if not public.can_access_egg_session(target_workspace, target_session_id, false) then return false; end if;
    else
      select count(*) into used_count from public.workspace_interaction_sessions
        where workspace_id = target_workspace and allocation in ('base', 'trial')
          and created_at >= subscription.period_start and created_at < subscription.period_end;
      allocation_kind := 'base';
      if used_count >= public.interaction_plan_limit(subscription.plan) then
        select id into available_topup from public.workspace_interaction_topups
          where workspace_id = target_workspace and purchased_at <= now()
            and expires_at > now() and used < quantity and revoked_at is null
          order by expires_at, id limit 1 for update;
        if available_topup is null then return false; end if;
        update public.workspace_interaction_topups set used = used + 1 where id = available_topup;
        allocation_kind := 'topup';
      end if;
      insert into public.workspace_interaction_sessions (
        workspace_id, session_id, campaign_id, access_method, allocation, topup_id, period_start, period_end
      ) values (
        target_workspace, target_session_id, target_campaign_id, target_access_method,
        allocation_kind, available_topup, subscription.period_start, subscription.period_end
      );
    end if;
  else
    select * into trial from public.workspace_trial_claims where workspace_id = target_workspace;
    if found then
      select status, plan into legacy_status, legacy_plan from public.workspace_subscriptions
        where workspace_id = target_workspace;
      if legacy_status = 'active' and legacy_plan <> 'free' then
        null; -- Pre-existing legacy paid subscriptions remain unmetered.
      elsif legacy_status is distinct from 'trialing' or trial.started_at > now() or trial.ends_at <= now() then
        return false;
      elsif not exists (
        select 1 from public.workspace_trial_interactions i where i.workspace_id = target_workspace
          and i.session_id = target_session_id and not i.is_preview
      ) then
        select count(*) into used_count from public.workspace_trial_interactions
          where workspace_id = target_workspace and not is_preview;
        if used_count >= trial.interaction_limit then return false; end if;
        insert into public.workspace_trial_interactions(workspace_id, session_id, campaign_id, access_method)
          values (target_workspace, target_session_id, target_campaign_id, target_access_method);
        insert into public.workspace_interaction_sessions (
          workspace_id, session_id, campaign_id, access_method, allocation, period_start, period_end
        ) values (target_workspace, target_session_id, target_campaign_id, target_access_method,
          'trial', trial.started_at, trial.ends_at) on conflict do nothing;
      end if;
    end if;
  end if;

  insert into public.qr_scan_events(campaign_id, access_method)
    values (target_campaign_id, target_access_method);
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

create or replace function public.enforce_workspace_trial_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_workspace uuid;
begin
  select workspace_id into target_workspace from public.polls where id = new.poll_id;
  if target_workspace is null then raise exception 'The poll does not exist.'; end if;
  -- Only managers may perform an unmetered staff preview, not ordinary members.
  if auth.uid() is not null and public.is_workspace_manager(target_workspace) then return new; end if;
  if exists (select 1 from public.workspace_interaction_subscriptions where workspace_id = target_workspace)
    or exists (select 1 from public.workspace_trial_claims where workspace_id = target_workspace) then
    if not public.can_access_egg_session(target_workspace, new.trial_session_id, false) then
      raise exception 'A valid active Egg session is required to submit this vote.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.interaction_plan_limit(text),
  public.apply_interaction_subscription(jsonb), public.apply_interaction_topup(jsonb),
  public.revoke_interaction_topup(text),
  public.workspace_interaction_status(uuid), public.can_access_egg_session(uuid, uuid, boolean),
  public.check_egg_trial_session(text, uuid), public.enforce_workspace_trial_vote(),
  public.record_egg_access(bigint, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.interaction_plan_limit(text),
  public.apply_interaction_subscription(jsonb), public.apply_interaction_topup(jsonb),
  public.revoke_interaction_topup(text),
  public.workspace_interaction_status(uuid), public.can_access_egg_session(uuid, uuid, boolean),
  public.check_egg_trial_session(text, uuid), public.enforce_workspace_trial_vote(),
  public.record_egg_access(bigint, text, uuid, boolean) to service_role;
grant execute on function public.workspace_interaction_status(uuid) to authenticated;
-- AI previews retain the caller's manager JWT; service_role is not a preview bypass.
grant execute on function public.check_egg_trial_session(text, uuid) to authenticated;
grant execute on function public.record_egg_access(bigint, text, uuid, boolean) to anon, authenticated;
grant execute on function public.workspace_plan(uuid), public.workspace_plan_limits(uuid) to authenticated, service_role;

commit;
