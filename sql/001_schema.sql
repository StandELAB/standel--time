-- StandEL Time v0.7, Supabase/PostgreSQL migration.
-- Apply once to a NEW Supabase project; run in SQL Editor as database owner.
-- Not a substitute for a staged security audit before processing employee data.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null, registration_no text,
  created_at timestamptz not null default now()
);
create table public.org_members (
  org_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check(role in ('admin','foreman','employee')),
  display_name text not null,
  supervisor_id uuid references auth.users(id),
  status text not null default 'active' check(status in ('active','archived')),
  created_at timestamptz not null default now(),
  primary key(org_id,user_id)
);
create index org_members_supervisor_idx on public.org_members(org_id,supervisor_id);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  name text not null, project_code text, client_name text,
  color text not null default '#3976de' check(color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz, created_at timestamptz not null default now(),
  unique(org_id,id)
);
create table public.project_rates (
 project_id uuid primary key references public.projects(id),
 org_id uuid not null references public.organizations(id),
 customer_rate_sek numeric(12,2) not null default 0 check(customer_rate_sek>=0),
 updated_at timestamptz not null default now(),
 foreign key(org_id,project_id) references public.projects(org_id,id)
);
create table public.project_assignments (
  org_id uuid not null references public.organizations(id),
  project_id uuid not null, user_id uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key(org_id,project_id,user_id),
  foreign key(org_id,project_id) references public.projects(org_id,id),
  foreign key(org_id,user_id) references public.org_members(org_id,user_id)
);
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  project_id uuid not null,
  work_date date not null,
  start_minute integer not null check(start_minute between 0 and 1439),
  end_minute integer not null check(end_minute between 1 and 1440),
  break_minutes integer not null default 0 check(break_minutes>=0),
  hours numeric(8,2) generated always as (round((end_minute-start_minute-break_minutes)::numeric/60,2)) stored,
  category text not null default 'regular' check(category in ('regular','overtime','ob')),
  input_method text not null default 'manual' check(input_method in ('manual','timer')),
  description text not null default '' check(length(description)<=2000),
  status text not null default 'approved' check(status='approved'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key(org_id,project_id) references public.projects(org_id,id),
  foreign key(org_id,user_id) references public.org_members(org_id,user_id),
  check(end_minute>start_minute+break_minutes),
  constraint no_overlapping_work exclude using gist (
    user_id with =,work_date with =, int4range(start_minute,end_minute,'[)') with &&
  ) where(deleted_at is null)
);
create index time_entries_period_idx on public.time_entries(org_id,work_date);
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null, user_id uuid not null,
  start_date date not null,end_date date not null,
  kind text not null check(kind in ('sick','personal','vacation')),
  status text not null default 'pending' check(status in ('reported','pending','approved','rejected')),
  note text not null default '' check(length(note)<=500),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id), decided_at timestamptz,
  foreign key(org_id,user_id) references public.org_members(org_id,user_id),
  check(end_date>=start_date and end_date<=start_date+365),
  check((kind='sick' and status='reported') or (kind<>'sick' and status in ('pending','approved','rejected')))
);
-- Prevent duplicate active absences for the same day. Rejected requests do not block scheduling.
alter table public.absences add constraint no_overlapping_absence exclude using gist (
 user_id with =, daterange(start_date,end_date+1,'[)') with &&
) where(status in ('reported','pending','approved'));
create table public.shifts (
  id uuid primary key default gen_random_uuid(),org_id uuid not null,user_id uuid not null,
  project_id uuid not null,work_date date not null,start_minute integer not null,end_minute integer not null,
  created_at timestamptz not null default now(),
  foreign key(org_id,user_id) references public.org_members(org_id,user_id),
  foreign key(org_id,project_id) references public.projects(org_id,id),
  check(start_minute>=0 and end_minute<=1440 and end_minute>start_minute)
);
create table public.certificates (
  id uuid primary key default gen_random_uuid(),org_id uuid not null,user_id uuid not null,
  kind text not null,reference_no text,expires_on date not null,
  created_at timestamptz not null default now(),
  foreign key(org_id,user_id) references public.org_members(org_id,user_id)
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id),entity text not null,entity_id uuid not null,
  action text not null,before_data jsonb,after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events(org_id,created_at desc);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  auth_user_id uuid not null references auth.users(id),
  role text not null check(role in ('employee','foreman')),
  employee_name text not null,
  channel text not null check(channel in ('email','sms')),
  recipient text not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null, accepted_at timestamptz,
  revoked_at timestamptz,
  check(expires_at>created_at)
);
create index invitations_auth_idx on public.invitations(auth_user_id,accepted_at);

-- Read-only role predicates run as DB owner; never trust roles passed from clients.
create or replace function private.member_role(p_org uuid,p_user uuid default auth.uid())
returns text language sql stable security definer set search_path='' as $$
 select m.role from public.org_members m
 where m.org_id=p_org and m.user_id=p_user and m.status='active' limit 1
$$;
create or replace function private.is_admin(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.member_role(p_org)='admin',false)
$$;
create or replace function private.can_see_employee(p_org uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(
  (auth.uid()=p_user and private.member_role(p_org) is not null)
  or private.is_admin(p_org)
  or (private.member_role(p_org)='foreman' and exists (
   select 1 from public.org_members m where m.org_id=p_org and m.user_id=p_user
   and m.supervisor_id=auth.uid() and m.status='active'))
 ,false)
$$;
revoke all on function private.member_role(uuid,uuid),private.is_admin(uuid),private.can_see_employee(uuid,uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.member_role(uuid,uuid),private.is_admin(uuid),private.can_see_employee(uuid,uuid) to authenticated;

-- Validate project assignment, prevent ownership tampering, and log edits.
create or replace function private.guard_time_entry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.org_id is distinct from old.org_id or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Time entry ownership is immutable';
  end if;
  new.updated_at:=now();
 end if;
 if not exists (select 1 from public.projects p where p.id=new.project_id and p.org_id=new.org_id and p.archived_at is null)
 then raise exception 'Invalid or archived project'; end if;
 if not private.is_admin(new.org_id) and not exists(
  select 1 from public.project_assignments pa where pa.org_id=new.org_id
  and pa.user_id=new.user_id and pa.project_id=new.project_id)
 then raise exception 'Employee is not assigned to project'; end if;
 if new.deleted_at is null and exists (
  select 1 from public.absences a where a.org_id=new.org_id and a.user_id=new.user_id
    and a.status in ('reported','approved') and new.work_date between a.start_date and a.end_date
 ) then raise exception 'Date overlaps registered absence'; end if;
 return new;
end $$;
create trigger time_guard before insert or update on public.time_entries
 for each row execute function private.guard_time_entry();
create or replace function private.log_time_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(coalesce(new.org_id,old.org_id),auth.uid(),'time_entry',coalesce(new.id,old.id),
 case when tg_op='INSERT' then 'create' when new.deleted_at is not null and old.deleted_at is null then 'archive' else 'update' end,
 case when tg_op='INSERT' then null else to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
create trigger time_audit after insert or update on public.time_entries
 for each row execute function private.log_time_change();

-- Restrict to one organization and one person's own records unless assigned admin/foreman.
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_rates enable row level security;
alter table public.time_entries enable row level security;
alter table public.absences enable row level security;
alter table public.shifts enable row level security;
alter table public.certificates enable row level security;
alter table public.audit_events enable row level security;
alter table public.invitations enable row level security;

create policy org_read on public.organizations for select to authenticated
 using(private.member_role(id) is not null);
create policy member_read on public.org_members for select to authenticated
 using(private.can_see_employee(org_id,user_id));
create policy project_read on public.projects for select to authenticated
 using(private.is_admin(org_id) or
 (private.member_role(org_id) is not null and exists(
  select 1 from public.project_assignments pa
  where pa.org_id=projects.org_id and pa.project_id=projects.id
   and (pa.user_id=auth.uid() or private.can_see_employee(org_id,pa.user_id))
 )));
create policy rates_admin_read on public.project_rates for select to authenticated
 using(private.is_admin(org_id));
create policy rates_admin_write on public.project_rates for all to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy project_admin_insert on public.projects for insert to authenticated
 with check(private.is_admin(org_id));
create policy project_admin_update on public.projects for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy assignments_read on public.project_assignments for select to authenticated
 using(private.can_see_employee(org_id,user_id));
create policy assignments_admin_insert on public.project_assignments for insert to authenticated
 with check(private.is_admin(org_id));
create policy assignments_admin_delete on public.project_assignments for delete to authenticated
 using(private.is_admin(org_id));
create policy entry_read on public.time_entries for select to authenticated
 using(private.can_see_employee(org_id,user_id));
create policy entry_insert on public.time_entries for insert to authenticated
 with check((private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null)) and deleted_at is null);
create policy entry_update on public.time_entries for update to authenticated
 using(private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null))
 with check(private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null));
create policy absence_read on public.absences for select to authenticated
 using(private.can_see_employee(org_id,user_id));
create policy absence_create on public.absences for insert to authenticated
 with check((auth.uid()=user_id or private.is_admin(org_id)) and private.member_role(org_id) is not null
 and ((kind='sick' and status='reported') or (kind<>'sick' and status='pending')));
create policy absence_admin_update on public.absences for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy shift_read on public.shifts for select to authenticated
 using(private.can_see_employee(org_id,user_id));
create policy shift_admin_insert on public.shifts for insert to authenticated
 with check(private.is_admin(org_id));
create policy shift_admin_update on public.shifts for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy shift_admin_delete on public.shifts for delete to authenticated
 using(private.is_admin(org_id));
create policy cert_read on public.certificates for select to authenticated
 using(private.is_admin(org_id) or auth.uid()=user_id);
create policy cert_admin_insert on public.certificates for insert to authenticated
 with check(private.is_admin(org_id));
create policy cert_admin_update on public.certificates for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy audit_admin_read on public.audit_events for select to authenticated
 using(private.is_admin(org_id));

-- Invitations are server-only. A verified user may claim *only their own* token.
create or replace function public.claim_invitation(p_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare inv public.invitations%rowtype; u auth.users%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into inv from public.invitations i where i.token_hash=p_hash for update;
 if not found or inv.auth_user_id<>auth.uid() or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then
  raise exception 'Invalid, expired or used invitation';
 end if;
 select * into u from auth.users where id=auth.uid();
 if (inv.channel='email' and (u.email is distinct from inv.recipient or u.email_confirmed_at is null))
 or (inv.channel='sms' and (u.phone is distinct from inv.recipient or u.phone_confirmed_at is null))
 then raise exception 'Contact verification required'; end if;
 insert into public.org_members(org_id,user_id,role,display_name)
 values(inv.org_id,auth.uid(),inv.role,inv.employee_name)
 on conflict(org_id,user_id) do nothing;
 if not found then raise exception 'User already has organization membership'; end if;
 update public.invitations set accepted_at=now() where id=inv.id;
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action)
 values(inv.org_id,auth.uid(),'invitation',inv.id,'accepted');
 return inv.role;
end $$;
revoke all on function public.claim_invitation(text) from public,anon;
grant execute on function public.claim_invitation(text) to authenticated;

-- Grant only necessary operations. No raw DELETE of time entries (soft delete instead).
revoke all on public.organizations,public.org_members,public.projects,public.project_assignments,
 public.time_entries,public.absences,public.shifts,public.certificates,public.audit_events,public.invitations,public.project_rates
 from public,anon,authenticated;
grant select on public.organizations,public.org_members,public.projects,public.project_assignments,
 public.time_entries,public.absences,public.shifts,public.certificates,public.audit_events,public.project_rates to authenticated;
grant insert,update on public.projects to authenticated;
grant insert,update,delete on public.project_rates to authenticated;
grant insert,delete on public.project_assignments to authenticated;
grant insert,update on public.time_entries to authenticated;
grant insert,update on public.absences to authenticated;
grant insert,update,delete on public.shifts to authenticated;
grant insert,update on public.certificates to authenticated;
revoke all on public.invitations from authenticated;

-- IMPORTANT before go-live:
-- 1. Make server RPC/transactions for absence-versus-work concurrency and status changes.
-- 2. Forbid editing closed payroll periods; apply column-specific grants/validation.
-- 3. Add immutable audit for absences/projects/assignments and independent restore testing.
