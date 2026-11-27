-- StandEL Time v0.38. Apply after checking existing migrations.
-- A server-side delivery ledger; employees never gain access to it.
begin;
create table if not exists public.reminder_deliveries (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 user_id uuid not null references auth.users(id),
 work_date date not null,
 channel text not null check (channel in ('email','sms')),
 status text not null default 'sending' check (status in ('sending','sent','failed')),
 provider_message_id text,
 error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,user_id,work_date,channel),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id)
);
create index if not exists reminder_deliveries_org_date on public.reminder_deliveries(org_id,work_date);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from public,anon,authenticated;
grant select,insert,update on public.reminder_deliveries to service_role;
commit;
