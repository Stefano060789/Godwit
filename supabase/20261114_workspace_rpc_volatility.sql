-- Workspace resolution updates last_active_at through ensure_my_workspace().
-- These read RPCs call current_workspace_id(), so they must not be STABLE.
alter function public.get_workspace_egg_access_metrics() volatile;
alter function public.get_workspace_egg_message_summaries() volatile;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_workspace_egg_messages(bigint, timestamptz, bigint)',
    'public.get_workspace_vote_counts()',
    'public.get_workspace_vote_timeline()',
    'public.get_workspace_campaign_metrics()',
    'public.get_workspace_adaptive_poll_status()'
  ]
  loop
    if to_regprocedure(function_signature) is not null then
      execute format('alter function %s volatile', function_signature);
    end if;
  end loop;
end;
$$;
