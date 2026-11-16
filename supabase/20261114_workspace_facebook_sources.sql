alter table public.workspace_ai_sources
  drop constraint if exists workspace_ai_sources_source_type_check;

alter table public.workspace_ai_sources
  add constraint workspace_ai_sources_source_type_check
  check (source_type in ('website', 'notes', 'instagram', 'facebook'));

alter table public.workspace_ai_sources
  drop constraint if exists workspace_ai_sources_facebook_link_check;

alter table public.workspace_ai_sources
  add constraint workspace_ai_sources_facebook_link_check
  check (source_type <> 'facebook' or
    (source_url is not null and content = source_url and
      (source_url ~* '^https://www\.facebook\.com/[a-z0-9._-]+$'
       or source_url ~ '^https://www\.facebook\.com/profile\.php\?id=[0-9]+$')));
