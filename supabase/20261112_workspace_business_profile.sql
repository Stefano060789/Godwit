alter table public.workspaces
  add column if not exists business_type text;

alter table public.workspaces
  drop constraint if exists workspaces_business_type_check;
alter table public.workspaces
  add constraint workspaces_business_type_check
  check (business_type is null or business_type in (
    'cafe-pub',
    'restaurant-food',
    'accommodation',
    'arts-culture',
    'visitor-attraction',
    'event-venue',
    'retail-market',
    'local-service',
    'community-space'
  ));

alter table public.qr_campaigns
  drop constraint if exists qr_campaigns_business_type_check;
alter table public.qr_campaigns
  add constraint qr_campaigns_business_type_check
  check (business_type is null or business_type in (
    'arts',
    'hospitality',
    'places',
    'events',
    'shops',
    'cafe-pub',
    'restaurant-food',
    'accommodation',
    'arts-culture',
    'visitor-attraction',
    'event-venue',
    'retail-market',
    'local-service',
    'community-space'
  ));
