-- Server-only aggregate billing protection. No prompts, results or visitor data.
create table if not exists public.business_research_usage (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_start date not null,
  request_count integer not null check (request_count between 1 and 20),
  created_at timestamptz not null default now(),
  retention_expires_at timestamptz not null default (now() + interval '56 days'),
  primary key (workspace_id, week_start)
);
create index if not exists business_research_usage_week_idx on public.business_research_usage(week_start);
create index if not exists business_research_usage_retention_idx on public.business_research_usage(retention_expires_at);
alter table public.business_research_usage enable row level security;
revoke all on public.business_research_usage from public, anon, authenticated;
grant select, insert, update, delete on public.business_research_usage to service_role;

create or replace function public.reserve_business_research(
  target_workspace_id uuid, workspace_limit integer, global_limit integer
)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  this_week date := date_trunc('week', now() at time zone 'utc')::date;
  reserved integer;
begin
  if target_workspace_id is null or workspace_limit is null or global_limit is null
    or workspace_limit not between 1 and 20 or global_limit not between 1 and 1000 then
    raise exception 'Invalid business research limits.';
  end if;
  -- One lock protects both caps across all concurrent server instances.
  perform pg_catalog.pg_advisory_xact_lock(186755, 1);
  if (select coalesce(sum(request_count), 0) from public.business_research_usage where week_start = this_week) >= global_limit then
    return false;
  end if;
  insert into public.business_research_usage(workspace_id, week_start, request_count)
    values (target_workspace_id, this_week, 1)
    on conflict (workspace_id, week_start) do update
      set request_count = public.business_research_usage.request_count + 1
      where public.business_research_usage.request_count < workspace_limit
    returning request_count into reserved;
  return reserved is not null;
end;
$$;
revoke all on function public.reserve_business_research(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_business_research(uuid, integer, integer) to service_role;
