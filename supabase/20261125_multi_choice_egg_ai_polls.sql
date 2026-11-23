alter table public.egg_ai_interest_poll_sessions
  drop constraint egg_ai_interest_poll_sessions_pkey,
  add primary key (campaign_id, session_hash, poll_id);
alter table public.egg_ai_interest_poll_sessions add column if not exists retention_expires_at timestamptz;
update public.egg_ai_interest_poll_sessions set retention_expires_at = created_at + interval '30 days' where retention_expires_at is null;
alter table public.egg_ai_interest_poll_sessions alter column retention_expires_at set default (now() + interval '30 days');
alter table public.egg_ai_interest_poll_sessions alter column retention_expires_at set not null;
create index if not exists egg_ai_interest_poll_sessions_retention_idx
  on public.egg_ai_interest_poll_sessions(retention_expires_at);

drop function if exists public.create_egg_ai_interest_poll(bigint, text, text, text, text[]);
create or replace function public.create_egg_ai_interest_poll(
  target_campaign_id bigint, target_session_hash text, target_interest_key text,
  target_question text, target_answers text[], target_multiple_choice boolean default false
)
returns table(poll_id bigint, question text, answers jsonb, created boolean, reason text, multiple_choice boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  campaign_record public.qr_campaigns%rowtype;
  template_poll public.polls%rowtype;
  selected_poll public.polls%rowtype;
  existing_poll_id bigint;
  workspace_owner_id uuid;
  next_version integer;
  allowed_polls integer;
begin
  if target_session_hash is null or target_session_hash !~ '^[0-9a-f]{64}$'
    or target_interest_key is null or target_interest_key !~ '^[a-z0-9][a-z0-9-]{0,39}$'
    or target_question is null or char_length(trim(target_question)) not between 1 and 250
    or target_multiple_choice is null
    or coalesce(array_length(target_answers, 1), 0) not between 2 and 5
    or exists (select 1 from unnest(target_answers) as options(answer)
      where answer is null or char_length(trim(answer)) not between 1 and 80)
    or (select count(distinct lower(trim(answer))) from unnest(target_answers) as options(answer)) <> array_length(target_answers, 1) then
    raise exception 'The customer-interest poll is invalid.';
  end if;
  select * into campaign_record from public.qr_campaigns where id = target_campaign_id for update;
  if not found or not campaign_record.is_active or not (campaign_record.ai_enabled
    or campaign_record.goal_key is not null or coalesce(array_length(campaign_record.goal_keys,1),0) > 0) then
    raise exception 'AI polls are not enabled for this active Egg.';
  end if;
  select owner_id into workspace_owner_id from public.workspaces where id = campaign_record.workspace_id;
  if workspace_owner_id is null then raise exception 'The Egg workspace owner could not be found.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(186757, hashtext(campaign_record.workspace_id::text));
  perform pg_catalog.pg_advisory_xact_lock(186758, hashtext(target_campaign_id::text));

  select p.* into selected_poll
  from public.egg_ai_interest_poll_sessions s
  join public.egg_ai_interest_polls i on i.campaign_id = s.campaign_id and i.poll_id = s.poll_id
  join public.polls p on p.id = s.poll_id
  where s.campaign_id = target_campaign_id and s.session_hash = target_session_hash
    and i.interest_key = target_interest_key
  order by i.version desc limit 1;
  if found then
    if coalesce(selected_poll.status,'active') <> 'closed' and selected_poll.closed_at is null then
      return query select selected_poll.id, selected_poll.question, selected_poll.answers, false, null::text, selected_poll.multiple_choice;
    else
      return query select null::bigint, null::text, null::jsonb, false, 'poll_closed'::text, false;
    end if;
    return;
  end if;
  if (select count(*) from public.egg_ai_interest_poll_sessions s
    where s.campaign_id = target_campaign_id and s.session_hash = target_session_hash) >= 3 then
    return query select null::bigint, null::text, null::jsonb, false, 'session_limit'::text, false;
    return;
  end if;
  select p.* into selected_poll from public.egg_ai_interest_polls i
  join public.polls p on p.id = i.poll_id
  where i.campaign_id = target_campaign_id and i.interest_key = target_interest_key
    and p.multiple_choice = target_multiple_choice and coalesce(p.status,'active') <> 'closed' and p.closed_at is null
  order by i.version desc limit 1;
  if found then
    insert into public.egg_ai_interest_poll_sessions(campaign_id,session_hash,poll_id)
      values (target_campaign_id,target_session_hash,selected_poll.id);
    return query select selected_poll.id, selected_poll.question, selected_poll.answers, false, null::text, selected_poll.multiple_choice;
    return;
  end if;
  select coalesce(max(i.version),0)+1 into next_version from public.egg_ai_interest_polls i
    where i.campaign_id = target_campaign_id and i.interest_key = target_interest_key;
  select limits.poll_limit into allowed_polls from public.workspace_plan_limits(campaign_record.workspace_id) limits;
  if allowed_polls is null then raise exception 'Workspace poll limits could not be loaded.'; end if;
  if (select count(*) from public.polls p where p.workspace_id = campaign_record.workspace_id
    and coalesce(p.status,'active') <> 'closed' and p.closed_at is null
    and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())) >= allowed_polls then
    return query select null::bigint, null::text, null::jsonb, false, 'poll_limit'::text, false;
    return;
  end if;
  select p.* into template_poll from public.qr_campaign_items item
    join public.polls p on p.id = item.poll_id
    where item.campaign_id = target_campaign_id and item.workspace_id = campaign_record.workspace_id
      and item.item_type = 'poll' and p.workspace_id = campaign_record.workspace_id
    order by item.sort_order asc nulls last,item.id limit 1;
  if not found and campaign_record.poll_id is not null then
    select * into template_poll from public.polls where id = campaign_record.poll_id and workspace_id = campaign_record.workspace_id;
  end if;
  insert into public.polls(workspace_id,creator_id,question,answers,multiple_choice,allow_user_answers,
    allow_organizer_messages,email_benefit_type,brand_name,brand_logo_url,brand_primary_color,brand_accent_color,
    review_benefit_type,review_trigger_answers,raffle_enabled)
  values(campaign_record.workspace_id,coalesce(template_poll.creator_id,workspace_owner_id),trim(target_question),
    to_jsonb(target_answers),target_multiple_choice,false,false,'none',coalesce(template_poll.brand_name,campaign_record.name),
    template_poll.brand_logo_url,template_poll.brand_primary_color,template_poll.brand_accent_color,'none','{}',false)
  returning * into selected_poll;
  insert into public.egg_ai_interest_polls(campaign_id,workspace_id,interest_key,version,poll_id)
    values(target_campaign_id,campaign_record.workspace_id,target_interest_key,next_version,selected_poll.id);
  insert into public.egg_ai_interest_poll_sessions(campaign_id,session_hash,poll_id)
    values(target_campaign_id,target_session_hash,selected_poll.id);
  return query select selected_poll.id, selected_poll.question, selected_poll.answers, true, null::text, selected_poll.multiple_choice;
end;
$$;
revoke all on function public.create_egg_ai_interest_poll(bigint,text,text,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.create_egg_ai_interest_poll(bigint,text,text,text,text[],boolean) to service_role;
grant select, update on public.qr_campaigns to service_role;
grant select on public.workspaces, public.qr_campaign_items to service_role;
grant select, insert on public.polls to service_role;
grant usage, select on sequence public.polls_id_seq to service_role;
grant usage, select on sequence public.egg_ai_interest_polls_id_seq to service_role;
grant execute on function public.workspace_plan_limits(uuid) to service_role;
