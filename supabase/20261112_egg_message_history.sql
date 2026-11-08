-- Read older private feedback inside Results, without a separate inbox.
create or replace function public.get_workspace_egg_messages(
  target_campaign_id bigint,
  before_created_at timestamptz default null,
  before_message_id bigint default null
)
returns table(id bigint, message text, reply_email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_workspace_id uuid := public.current_workspace_id();
begin
  if target_workspace_id is null
    or not public.is_workspace_manager(target_workspace_id)
    or not exists (
      select 1 from public.qr_campaigns c
      where c.id = target_campaign_id and c.workspace_id = target_workspace_id
    ) then
    raise exception 'You do not have permission to read this Egg''s messages.';
  end if;
  if (before_created_at is null) <> (before_message_id is null) then
    raise exception 'Provide both message cursor values.';
  end if;
  return query
    select m.id, m.message, m.reply_email, m.created_at
    from public.organizer_messages m
    where m.workspace_id = target_workspace_id
      and m.campaign_id = target_campaign_id
      and (
        before_created_at is null
        or (m.created_at, m.id) < (before_created_at, before_message_id)
      )
    order by m.created_at desc, m.id desc
    limit 21;
end;
$$;

revoke all on function public.get_workspace_egg_messages(bigint, timestamptz, bigint) from public, anon;
grant execute on function public.get_workspace_egg_messages(bigint, timestamptz, bigint) to authenticated;
