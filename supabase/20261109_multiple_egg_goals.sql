alter table public.qr_campaigns
  add column if not exists goal_keys text[];

update public.qr_campaigns
set goal_keys = array[goal_key]
where goal_key is not null
  and goal_keys is null;

alter table public.qr_campaigns
  drop constraint if exists qr_campaigns_goal_keys_check;
alter table public.qr_campaigns
  add constraint qr_campaigns_goal_keys_check
  check (
    goal_keys is null
    or (
      cardinality(goal_keys) between 1 and 6
      and goal_keys <@ array['answers', 'feedback', 'information', 'next-step', 'contacts', 'reviews']::text[]
      and array_position(goal_keys, null) is null
    )
  );

create or replace function public.sync_qr_campaign_goal_keys()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.goal_keys is null and new.goal_key is not null then
      new.goal_keys := array[new.goal_key];
    elsif new.goal_keys is not null then
      new.goal_key := new.goal_keys[1];
    end if;
  elsif new.goal_keys is distinct from old.goal_keys then
    new.goal_key := new.goal_keys[1];
  elsif new.goal_key is distinct from old.goal_key then
    new.goal_keys := case
      when new.goal_key is null then null
      else array[new.goal_key]
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_qr_campaign_goal_keys on public.qr_campaigns;
create trigger sync_qr_campaign_goal_keys
before insert or update of goal_key, goal_keys on public.qr_campaigns
for each row execute function public.sync_qr_campaign_goal_keys();
