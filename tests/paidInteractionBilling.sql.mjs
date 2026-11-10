// Standalone executable SQL integration harness (not a mocked SQL text test).
// Requires @electric-sql/pglite; no changes to application dependencies:
// npm install --prefix .billing-sql-tools --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
// node tests\paidInteractionBilling.sql.mjs
// Alternatively set PGLITE_MODULE to an installed module's absolute file URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE
  || '../.billing-sql-tools/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
let checks = 0;
const value = async (sql) => (await db.query(sql)).rows[0].value;
const check = async (sql, expected, message) => {
  assert.deepEqual(await value(sql), expected, message);
  checks++;
};
const rejects = async (sql, pattern) => {
  await assert.rejects(() => db.exec(sql), pattern);
  checks++;
};
const migration = async (name) => db.exec(await readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8'));
const workspace = '10000000-0000-0000-0000-000000000001';
const trialWorkspace = '10000000-0000-0000-0000-000000000002';
const owner = '20000000-0000-0000-0000-000000000001';
const session = (n) => `30000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const access = (n, campaign = 1, method = 'qr', preview = false) =>
  `select public.record_egg_access(${campaign}, '${method}', '${session(n)}', ${preview}) as value`;
const status = (key, id = workspace) =>
  `select public.workspace_interaction_status('${id}')->'${key}' as value`;
const applySubscription = (overrides = {}) => {
  const { sql = '', ...data } = overrides;
  const fields = {
    workspace_id: workspace, stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1',
    plan: 'small', status: 'active', period_start: '2026-01-01T00:00:00Z',
    period_end: '2026-02-01T00:00:00Z', event_created: '2026-01-01T00:00:00Z', ...data,
  };
  // Test dates are relative to the database clock, not the machine's date.
  return `select public.apply_interaction_subscription(
    '${JSON.stringify(fields)}'::jsonb
      || jsonb_build_object('period_start', now() - interval '1 day',
        'period_end', now() + interval '29 days')
      ${sql}) as value`;
};
const topup = (id, age = '0 days', overrides = '') =>
  `select public.apply_interaction_topup(
    jsonb_build_object('workspace_id', '${workspace}', 'checkout_session_id', 'cs_${id}',
      'payment_intent_id', 'pi_${id}', 'purchased_at', now() - interval '${age}') ${overrides}) as value`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select current_setting('request.jwt.claim.role', true)
    $$;
    create table auth.users(id uuid primary key);
    create table public.workspaces(id uuid primary key, owner_id uuid references auth.users(id));
    create function public.is_workspace_member(w uuid) returns boolean language sql stable as $$
      select coalesce(auth.uid() = owner_id, false) from public.workspaces where id = w
    $$;
    create function public.is_workspace_manager(w uuid) returns boolean language sql stable as $$
      select coalesce(auth.uid() = owner_id, false) from public.workspaces where id = w
    $$;
    create function public.current_workspace_id() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.workspace_subscriptions(
      workspace_id uuid primary key references public.workspaces(id),
      plan text not null check (plan in ('free','starter','growth')),
      status text not null check (status in ('active','trialing','past_due','canceled','inactive','incomplete','unpaid','paused')),
      stripe_customer_id text unique, stripe_subscription_id text unique,
      current_period_end timestamptz, updated_at timestamptz default now()
    );
    create table public.polls(id bigint primary key, workspace_id uuid,
      question text, brand_name text, brand_logo_url text, brand_primary_color text, brand_accent_color text);
    create table public.qr_campaigns(id bigint primary key, workspace_id uuid references public.workspaces(id),
      token text unique, is_active boolean default true, poll_id bigint, portal_title text, portal_message text);
    create table public.qr_scan_events(campaign_id bigint, access_method text);
    create table public.woodpecker_tasks(id bigint primary key, campaign_id bigint,
      completion_mode text, status text, completed_at timestamptz);
    create table public.woodpecker_task_history(task_id bigint, event_type text, message text);
    create table public.votes(id bigint generated always as identity primary key, poll_id bigint, campaign_id bigint);
    create table public.qr_campaign_items(id bigint, campaign_id bigint, item_type text,
      sort_order integer, poll_id bigint, title text, body text, link_url text, link_label text,
      image_url text, accessibility_tags text[], reward_code text);
    create table public.donation_settings(workspace_id uuid, is_enabled boolean, stripe_charges_enabled boolean,
      currency text, suggested_amount numeric, message text);
  `);
  await migration('20261116_workspace_interaction_trial.sql');
  await migration('20261117_trial_ten_interactions.sql');
  await db.exec(`
    insert into auth.users values ('${owner}'), ('20000000-0000-0000-0000-000000000002');
    insert into public.workspaces values
      ('${workspace}', '${owner}'),
      ('${trialWorkspace}', '20000000-0000-0000-0000-000000000002');
    insert into public.qr_campaigns(id,workspace_id,token,poll_id) values
      (1,'${workspace}','one',1), (2,'${workspace}','two',1), (3,'${trialWorkspace}','trial',2);
    insert into public.polls(id,workspace_id) values (1,'${workspace}'),(2,'${trialWorkspace}');
    insert into public.qr_campaign_items(id,campaign_id,item_type) values (1,1,'poll');
    insert into public.woodpecker_tasks values (1,1,'scan','open',null);
    select public.record_egg_access(1,'qr','${session(1)}',false);
  `);
  await migration('20261118_paid_interaction_billing.sql');
  await db.exec(`set request.jwt.claim.role = 'service_role'`);
  await check(`select count(*)::int as value from public.workspace_interaction_sessions`, 1, 'copies trial usage');
  await check(status('base_limit'), 10, 'trial cap remains ten');
  await check(`select array_agg(public.interaction_plan_limit(p)) as value
    from unnest(array['small','standard','scale','regional']) p`, [100, 500, 2000, 10000], 'paid limits');
  await check(`select (${applySubscription().slice(7, -9)})->'applied' as value`, true, 'applies subscription');
  await check(status('base_used'), 1, 'trial usage in billing period is retained');
  await check(`select plan as value from public.workspace_subscriptions where workspace_id='${workspace}'`, 'starter', 'legacy mapping');
  await check(`select campaign_limit as value from public.workspace_plan_limits('${workspace}')`, 2147483647, 'unlimited paid Eggs');
  await check(access(1, 2, 'nfc'), true, 'dedup across Eggs and access methods');
  await check(status('base_used'), 1, 'repeat session does not consume quota');
  await check(topup(1, '2 days'), { applied: true, topup_id: 1 }, 'first topup');
  await db.exec(`begin; ${topup(2, '1 day')}; ${topup(2, '1 day')}; commit;`);
  await check(`select count(*)::int as value from public.workspace_interaction_topups`, 2, 'topup webhook is idempotent');
  await rejects(topup(1, '2 days', `|| '{"payment_intent_id":"other"}'::jsonb`), /replay/);
  await db.exec(`do $$ begin for n in 2..90 loop
    if not public.record_egg_access(1,'qr',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,false)
      then raise exception 'unexpected denial'; end if;
    end loop; end $$;`);
  await check(status('warning'), false, 'topups suppress 90% warning');
  await check(`select sum(used)::int as value from public.workspace_interaction_topups`, 0, 'base consumed first');
  await db.exec(`update public.workspace_interaction_topups set expires_at = purchased_at + interval '30 days';
    do $$ begin for n in 91..201 loop
      perform public.record_egg_access(1,'nfc',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,false);
    end loop; end $$;`);
  await check(status('base_used'), 100, 'base usage excludes topup sessions');
  await check(`select used as value from public.workspace_interaction_topups where id=1`, 100, 'oldest topup first');
  await check(`select used as value from public.workspace_interaction_topups where checkout_session_id='cs_2'`, 1, 'next topup');
  await db.exec(applySubscription({ plan: 'standard', event_created: '2026-01-02T00:00:00Z' }));
  await check(status('base_used'), 100, 'upgrade does not reset usage or reallocate topups');
  await check(status('interactions_remaining'), 499, 'upgrade remaining base plus unused topups');
  await db.exec(applySubscription({ plan: 'small', event_created: '2026-01-03T00:00:00Z' }));
  await db.exec(`do $$ begin for n in 202..300 loop
    perform public.record_egg_access(1,'qr',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,false);
    end loop; end $$;`);
  await check(status('state'), 'exhausted', 'exhaustion');
  await check(status('can_topup'), true, 'exhausted paid plan can top up');
  await check(status('warning'), true, '90% warning with no topups');
  await check(access(301), false, 'new session denied when exhausted');
  await check(access(2), true, 'existing session continues at exhaustion');
  await check(`select public.check_egg_trial_session('one','${session(2)}') as value`, true, 'AI wrapper');
  await check(`select count(*)::int as value from public.get_public_qr_campaign_items('one','${session(2)}',false)`, 1, 'items wrapper');
  await db.exec(`insert into public.votes(poll_id,trial_session_id) values (1,'${session(2)}');`);
  await rejects(`insert into public.votes(poll_id,trial_session_id) values (1,'${session(301)}')`, /valid active Egg session/);
  await check(`select count(*)::int as value from public.woodpecker_task_history`, 1, 'scan task completes exactly once');
  await check(`select count(*) > 0 as value from public.qr_scan_events`, true, 'scans retained');
  await rejects(applySubscription({ plan: 'invalid' }), /Invalid interaction subscription/);
  await check(`select (${applySubscription({ plan: 'scale' }).slice(7, -9)})->'applied' as value`, false, 'stale event ignored');
  await db.exec(applySubscription({ plan: 'scale', stripe_subscription_id: 'sub_2', event_created: '2026-01-04T00:00:00Z' }));
  await check(`select public.workspace_plan('${workspace}') as value`, 'growth', 'scale maps to Growth');
  await check(`select (${applySubscription({ event_created: '2026-01-05T00:00:00Z' }).slice(7, -9)})->'reason' as value`,
    'replaced_subscription', 'newer retired event cannot resurrect old subscription');
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2', status: 'trialing',
    event_created: '2026-01-05T06:00:00Z' }));
  await check(access(2), false, 'Stripe trialing blocks existing paid sessions');
  await check(access(400), false, 'Stripe trialing blocks new paid base sessions');
  await check(status('can_topup'), false, 'Stripe trialing cannot buy topups');
  await check(status('state'), 'inactive', 'Stripe trialing fails closed');
  await check(`select public.workspace_plan('${workspace}') as value`, 'free', 'Stripe trialing has no paid features');
  await check(`select campaign_limit as value from public.workspace_plan_limits('${workspace}')`,
    1, 'Stripe trialing has no unlimited Eggs');
  await db.exec(topup('stripe_trial', '3 days'));
  await check(status('topup_remaining'), 0, 'Stripe trialing has no usable topups');
  await check(access(401), false, 'Stripe trialing cannot spend stored topups');
  await db.exec(`select public.revoke_interaction_topup('pi_stripe_trial')`);
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2', status: 'past_due',
    event_created: '2026-01-05T12:00:00Z' }));
  await check(access(2), false, 'past due blocks existing sessions');
  await check(access(400), false, 'past due blocks new sessions');
  await check(status('state'), 'inactive', 'past due reported inactive');
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2', status: 'canceled', event_created: '2026-01-06T00:00:00Z' }));
  await check(access(2), false, 'cancellation denies even registered sessions');
  await check(status('can_topup'), false, 'canceled cannot top up');
  await check(`select count(*)::int as value from public.workspace_interaction_subscriptions
    where workspace_id='${workspace}' and status='canceled'`, 1, 'canceled row persists to prevent trial fallback');
  await check(`select public.check_egg_trial_session('one','${session(2)}') as value`, false, 'AI denies canceled');
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2', event_created: '2026-01-07T00:00:00Z',
    sql: `|| jsonb_build_object('period_start', now()-interval '31 days','period_end',now()-interval '1 day')` }));
  // Period regression is rejected, so test expiry on a second paid workspace instead.
  await db.exec(applySubscription({ workspace_id: trialWorkspace, stripe_subscription_id: 'sub_expired',
    stripe_customer_id: 'cus_expired', sql: `|| jsonb_build_object('period_start',now()-interval '31 days','period_end',now()-interval '1 day')` }));
  await check(status('state', trialWorkspace), 'expired', 'period expiry');
  await check(`select public.record_egg_access(3,'qr','${session(500)}',false) as value`, false, 'expired denied');
  await db.exec(`delete from public.workspace_interaction_subscriptions where workspace_id='${trialWorkspace}';
    update public.workspace_subscriptions set status='trialing',plan='starter' where workspace_id='${trialWorkspace}';
    do $$ begin for n in 501..510 loop
      if not public.record_egg_access(3,'qr',('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,false)
        then raise exception 'trial session denied'; end if;
      end loop; end $$;`);
  await check(`select public.record_egg_access(3,'qr','${session(511)}',false) as value`, false, 'trial remains ten');
  await check(`select public.record_egg_access(3,'qr','${session(501)}',false) as value`, true, 'trial sessions continue at cap');
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2',
    event_created: 2_000_000_000 }));
  await check(`select extract(epoch from event_created)::int as value
    from public.workspace_interaction_subscriptions where workspace_id='${workspace}'`,
    2_000_000_000, 'Stripe numeric event timestamp accepted');
  await rejects(topup('future', '-1 day'), /Invalid interaction top-up/);
  await db.exec(topup('expired', '31 days'));
  await check(status('topup_remaining'), 0, 'expired topups never count');
  await check(access(700), false, 'expired topups cannot admit a session');
  await db.exec(topup('checkout_formats', '1 day',
    `|| '{"checkout_session_id":"cs_live_format_123","payment_intent_id":"pi_live_format_123"}'::jsonb`));
  await db.exec(`select public.revoke_interaction_topup('pi_live_format_123')`);
  await db.exec(topup('checkout_formats', '1 day',
    `|| '{"checkout_session_id":"cs_test_format_123","payment_intent_id":"pi_test_format_123"}'::jsonb`));
  await db.exec(`select public.revoke_interaction_topup('pi_test_format_123')`);
  await check(`select count(*)::int as value from public.workspace_interaction_topups
    where checkout_session_id in ('cs_live_format_123','cs_test_format_123')`,
    2, 'both Stripe live and test Checkout IDs accepted');
  await db.exec(topup('rollover', '10 days'));
  await check(access(700), true, 'valid topup admits new session');
  await check(status('topup_remaining'), 99, 'topup decremented once');
  await check(access(700, 2, 'nfc'), true, 'topup session dedup across Eggs');
  await check(status('topup_remaining'), 99, 'duplicate topup session not charged twice');
  await check(`select public.revoke_interaction_topup('pi_rollover')->'applied' as value`,
    true, 'refund revokes remaining pack');
  await check(status('topup_remaining'), 0, 'revoked pack excluded from remaining credits');
  await check(`select used as value from public.workspace_interaction_topups
    where payment_intent_id='pi_rollover'`, 1, 'refund preserves spent credits');
  await check(`select public.revoke_interaction_topup('pi_rollover')->'reason' as value`,
    'already_revoked', 'refund replay idempotent');
  await check(`select public.revoke_interaction_topup('pi_missing')->'reason' as value`,
    'not_found', 'unknown refund no-op');
  await check(access(702), false, 'revoked pack cannot admit a new session');
  await check(access(700), true, 'refund does not interrupt an admitted session');
  await db.exec(`select public.apply_interaction_topup(jsonb_build_object(
    'workspace_id',workspace_id,'checkout_session_id',checkout_session_id,
    'payment_intent_id',payment_intent_id,'purchased_at',purchased_at))
    from public.workspace_interaction_topups where payment_intent_id='pi_rollover'`);
  await check(`select revoked_at is not null as value from public.workspace_interaction_topups
    where payment_intent_id='pi_rollover'`, true, 'purchase replay cannot restore revoked credits');
  await db.exec(`update public.workspace_interaction_topups
    set purchased_at=now()-interval '31 days', expires_at=now()-interval '1 day'
    where checkout_session_id='cs_rollover'`);
  await check(access(700), true, 'topup expiry does not interrupt an admitted session');
  await check(status('topup_remaining'), 0, 'expired leftover topup excluded');
  await db.exec(topup('renewal', '5 days'));
  await db.exec(`
    update public.workspace_interaction_sessions set created_at=now()-interval '2 days'
      where workspace_id='${workspace}';
    update public.workspace_interaction_subscriptions
      set period_start=now()-interval '31 days',period_end=now()-interval '1 day'
      where workspace_id='${workspace}';
  `);
  await db.exec(applySubscription({ stripe_subscription_id: 'sub_2',
    event_created: 2_000_000_001 }));
  await check(status('base_used'), 0, 'renewal counts only current period');
  await check(status('topup_remaining'), 100, 'unspent topup survives renewal');
  await check(access(700), false, 'old UUID cannot bypass renewal accounting');
  await check(access(701), true, 'fresh renewal session');
  await check(status('base_used'), 1, 'fresh renewal base usage');
  await check(status('topup_remaining'), 100, 'renewal base before rollover topups');
  await db.exec(`update public.workspace_interaction_subscriptions
    set period_end=now()-interval '1 second',period_start=now()-interval '1 day'
    where workspace_id='${workspace}'`);
  await check(access(701), false, 'period expiry denies previously admitted session');
  await check(`select public.check_egg_trial_session('one','${session(701)}') as value`, false, 'AI respects expiry');
  await check(`select count(*)::int as value from public.get_public_qr_campaign_items('one','${session(701)}',false)`, 0, 'items respect expiry');
  await rejects(`insert into public.votes(poll_id,trial_session_id) values (1,'${session(701)}')`, /valid active Egg session/);
  await db.exec(`set request.jwt.claim.sub='${owner}'; set request.jwt.claim.role='authenticated';`);
  await check(status('plan'), 'small', 'member status access');
  await check(access(600, 1, 'qr', true), true, 'manager preview allowed without quota');
  await check(`select public.can_access_egg_session('${workspace}','${session(600)}',true) as value`, true, 'manager preview access');
  await db.exec(`set request.jwt.claim.sub=''; set request.jwt.claim.role='anon';`);
  await check(access(601, 1, 'qr', true), false, 'anonymous preview denied');
  await check(access(600), false, 'preview UUID cannot become a free customer session');
  await check(`select public.check_egg_trial_session('one','${session(600)}') as value`, false, 'preview UUID cannot bypass AI');
  await rejects(`select public.workspace_interaction_status('${workspace}')`, /access to this workspace/);
  await rejects(applySubscription(), /Service role required/);
  await rejects(topup(3), /Service role required/);
  await rejects(`select public.revoke_interaction_topup('pi_1')`, /Service role required/);
  await check(`select has_function_privilege('anon','public.can_access_egg_session(uuid,uuid,boolean)','execute') as value`, false, 'internal RPC private');
  await check(`select has_function_privilege('service_role','public.apply_interaction_subscription(jsonb)','execute') as value`, true, 'explicit service grant');
  await check(`select has_table_privilege('authenticated','public.workspace_billing_checkouts','select') as value`, false, 'checkout locks private');
  await check(`select bool_and(relrowsecurity) as value from pg_class where relname in (
    'workspace_interaction_subscriptions','workspace_interaction_subscription_ids',
    'workspace_interaction_topups','workspace_interaction_sessions','workspace_billing_checkouts')`, true, 'RLS enabled');
  await db.exec(`set role anon;`);
  await rejects(`select * from public.workspace_billing_checkouts`, /permission denied/);
  await rejects(`insert into public.workspace_interaction_topups
    (workspace_id,checkout_session_id,payment_intent_id,purchased_at,expires_at)
    values ('${workspace}','forged','forged',now(),now()+interval '30 days')`, /permission denied/);
  await rejects(`select public.can_access_egg_session('${workspace}','${session(701)}',false)`, /permission denied/);
  await check(access(800), false, 'public access wrapper remains executable');
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.role='authenticated';
    set request.jwt.claim.sub='${owner}';`);
  await check(status('state'), 'expired', 'authenticated member can execute status RPC');
  await check(`select public.check_egg_trial_session('one','${session(600)}') as value`,
    true, 'authenticated manager JWT admits AI preview');
  await check(`select count(*)::int as value from public.get_public_qr_campaign_items(
    'one','${session(600)}',true)`, 1, 'authenticated manager JWT admits item preview');
  await db.exec(`set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'`);
  await check(`select public.check_egg_trial_session('one','${session(600)}') as value`,
    false, 'authenticated nonmanager cannot reuse AI preview UUID');
  await check(`select count(*)::int as value from public.get_public_qr_campaign_items(
    'one','${session(600)}',true)`, 0, 'authenticated nonmanager cannot reuse item preview UUID');
  await db.exec(`set request.jwt.claim.sub='${owner}'`);
  await rejects(applySubscription(), /permission denied/);
  await rejects(`select public.revoke_interaction_topup('pi_1')`, /permission denied/);
  await db.exec(`reset role; set request.jwt.claim.sub=''; set request.jwt.claim.role='service_role';
    set role service_role;`);
  await check(status('state'), 'expired', 'service-role status permitted without membership');
  await check(`select public.check_egg_trial_session('one','${session(600)}') as value`,
    false, 'service role without manager identity cannot preview AI');
  await check(`select count(*)::int as value from public.get_public_qr_campaign_items(
    'one','${session(600)}',true)`, 0, 'service role without manager identity cannot preview items');
  await db.exec(`reset role`);
  const normalState = await value(status('state', trialWorkspace));
  await db.exec(`
    alter table auth.users add column email text, add column email_confirmed_at timestamptz;
    update auth.users set email='bonomistefano@outlook.it', email_confirmed_at=now() where id='${owner}';
  `);
  await migration('20261119_creator_access.sql');
  await migration('20261119_creator_access.sql');
  await check(status('state'), 'complimentary', 'creator replaces legacy/expired warning');
  await check(status('unlimited'), true, 'creator interactions are unlimited');
  await check(status('can_topup'), false, 'creator never needs topups');
  await check(`select public.workspace_plan('${workspace}') as value`, 'growth', 'all existing plan features unlocked');
  for (const limit of ['poll_limit', 'campaign_limit', 'seat_limit']) {
    await check(`select ${limit} as value from public.workspace_plan_limits('${workspace}')`, 2147483647, `creator ${limit}`);
  }
  await check(status('state', trialWorkspace), normalState, 'unrelated account remains unchanged');
  for (let n = 900; n < 912; n++) await check(access(n), true, 'creator access bypasses expired subscription');
  await check(`select public.can_access_egg_session('${workspace}','${session(900)}',false) as value`, true, 'creator customer session valid');
  await check(`select public.can_access_egg_session('${workspace}','${session(999)}',false) as value`, false, 'unregistered session not admitted');
  await check(`select public.can_access_egg_session('${workspace}','${session(600)}',false) as value`, false, 'anonymous cannot reuse creator preview');
  await check(access(600), false, 'creator preview cannot become a customer session');
  await check(access(999, 1, 'qr', true), false, 'creator preview still requires manager');
  await rejects(`select public.record_egg_access(1,'invalid','${session(999)}',false)`, /Unsupported/);
  await db.exec(`set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${owner}'`);
  await check(status('state'), 'complimentary', 'creator member can read access');
  await rejects(`delete from public.creator_accounts`, /permission denied/);
  await rejects(`insert into public.creator_accounts(user_id) values ('${owner}')`, /permission denied/);
  await rejects(`select public.workspace_interaction_status_metered('${workspace}')`, /permission denied/);
  await db.exec(`set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002'`);
  await rejects(status('state'), /access to this workspace/);
  await db.exec(`reset role; set role anon; set request.jwt.claim.role='anon'; set request.jwt.claim.sub=''`);
  await check(access(912), true, 'anonymous visitors can access creator Eggs');
  await rejects(`select * from public.creator_accounts`, /permission denied/);
  await db.exec(`reset role; set request.jwt.claim.role='service_role';
    delete from public.creator_accounts where user_id='${owner}';`);
  await check(status('state'), 'expired', 'revoking grant restores original paid status without changing billing records');
  console.log(`Paid interaction billing SQL: ${checks} checks passed (real embedded PostgreSQL).`);
} finally {
  await db.close();
}
