-- Anonymous, consented public-website sessions, counted once per tab per UTC day.
create table if not exists public.website_visit_sessions (
  visit_date date not null default (now() at time zone 'UTC')::date,
  session_id uuid not null,
  primary key (visit_date, session_id)
);

create table if not exists public.website_visit_totals (
  visit_date date primary key,
  visits bigint not null default 0 check (visits >= 0)
);

alter table public.website_visit_sessions enable row level security;
alter table public.website_visit_totals enable row level security;
revoke all on public.website_visit_sessions, public.website_visit_totals from anon, authenticated;

create or replace function public.record_website_visit(visitor_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  inserted_count integer;
begin
  if auth.uid() is not null then
    return;
  end if;
  if visitor_session is null then
    raise exception 'A visitor session is required.';
  end if;
  insert into public.website_visit_sessions (visit_date, session_id)
  values (today, visitor_session)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    insert into public.website_visit_totals (visit_date, visits)
    values (today, 1)
    on conflict (visit_date) do update
      set visits = website_visit_totals.visits + 1;
  end if;
  delete from public.website_visit_sessions where visit_date < today - 30;
end;
$$;

create or replace function public.creator_website_visits()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  today date := (now() at time zone 'UTC')::date;
begin
  if not public.is_creator() then
    raise exception 'Creator access is required.';
  end if;
  return (
    select jsonb_build_object(
      'total', coalesce(sum(visits), 0),
      'today', coalesce(sum(visits) filter (where visit_date = today), 0),
      'last_30_days', coalesce(sum(visits) filter (where visit_date >= today - 29), 0),
      'since', min(visit_date)
    )
    from public.website_visit_totals
  );
end;
$$;

revoke all on function public.record_website_visit(uuid) from public;
revoke all on function public.creator_website_visits() from public;
grant execute on function public.record_website_visit(uuid) to anon, authenticated;
grant execute on function public.creator_website_visits() to authenticated;
