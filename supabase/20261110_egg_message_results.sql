create or replace function public.get_workspace_egg_message_summaries()
returns table(
  campaign_id bigint,
  message_count bigint,
  latest_messages jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  with campaigns as (
    select campaign.id
    from public.qr_campaigns campaign
    where campaign.workspace_id = public.current_workspace_id()
      and public.is_workspace_manager(campaign.workspace_id)
  ),
  ranked_messages as (
    select
      message.campaign_id,
      message.id,
      message.message,
      message.reply_email,
      message.poll_id,
      message.created_at,
      row_number() over (
        partition by message.campaign_id
        order by message.created_at desc, message.id desc
      ) as message_rank
    from public.organizer_messages message
    join campaigns on campaigns.id = message.campaign_id
    where message.workspace_id = public.current_workspace_id()
  ),
  message_totals as (
    select campaign_id, count(*)::bigint as message_count
    from ranked_messages
    group by campaign_id
  ),
  message_previews as (
    select
      campaign_id,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'message', message,
          'reply_email', reply_email,
          'poll_id', poll_id,
          'created_at', created_at
        )
        order by created_at desc, id desc
      ) as latest_messages
    from ranked_messages
    where message_rank <= 3
    group by campaign_id
  )
  select
    campaigns.id,
    coalesce(message_totals.message_count, 0)::bigint,
    coalesce(message_previews.latest_messages, '[]'::jsonb)
  from campaigns
  left join message_totals on message_totals.campaign_id = campaigns.id
  left join message_previews on message_previews.campaign_id = campaigns.id;
$$;

revoke all on function public.get_workspace_egg_message_summaries() from public, anon;
grant execute on function public.get_workspace_egg_message_summaries() to authenticated;
