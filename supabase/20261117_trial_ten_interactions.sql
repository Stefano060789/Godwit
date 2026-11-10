-- Apply after 20261116_workspace_interaction_trial.sql.
-- Preserve usage and dates; trials at or above 10 sessions pause new sessions.
begin;

alter table public.workspace_trial_claims
  alter column interaction_limit set default 10;

update public.workspace_trial_claims
set interaction_limit = 10
where interaction_limit <> 10;

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
  values (new.id, new.owner_id, now(), now() + interval '30 days', 10)
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

commit;
