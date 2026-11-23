begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select 1 from public.business_research_usage$$, '42501', null, 'first user cannot read counters');
select throws_ok($$update public.business_research_usage set request_count = 1 returning 1$$, '42501', null, 'first user cannot update counters');
select throws_ok($$delete from public.business_research_usage returning 1$$, '42501', null, 'first user cannot delete counters');
select throws_ok($$insert into public.business_research_usage(workspace_id,week_start,request_count) values ('11111111-1111-4111-8111-111111111111',current_date,1)$$, '42501', null, 'first user cannot insert counters');
select throws_ok($$select public.reserve_business_research('11111111-1111-4111-8111-111111111111',1,10)$$, '42501', null, 'first user cannot bypass server authorization');

set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select 1 from public.business_research_usage$$, '42501', null, 'second user cannot read counters');
select throws_ok($$update public.business_research_usage set request_count = 1 returning 1$$, '42501', null, 'second user cannot update counters');
select throws_ok($$delete from public.business_research_usage returning 1$$, '42501', null, 'second user cannot delete counters');
select throws_ok($$insert into public.business_research_usage(workspace_id,week_start,request_count) values ('11111111-1111-4111-8111-111111111111',current_date,1)$$, '42501', null, 'second user cannot forge another workspace counter');
select throws_ok($$select public.reserve_business_research('11111111-1111-4111-8111-111111111111',1,10)$$, '42501', null, 'second user cannot reserve another workspace request');

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok($$select 1 from public.business_research_usage$$, '42501', null, 'anonymous visitors cannot read counters');
select throws_ok($$select public.reserve_business_research('11111111-1111-4111-8111-111111111111',1,10)$$, '42501', null, 'anonymous visitors cannot reserve research');
select * from finish();
rollback;
