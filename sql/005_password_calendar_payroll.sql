-- StandEL Time v0.17. Run ONLY after 001...004 and after a verified backup.
-- Compatible with existing organizations, memberships, projects and time entries.
begin;

-- Prevent NEW duplicate companies. Existing duplicate organizations are not merged or deleted.
create or replace function private.prevent_duplicate_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.registration_no is not null and btrim(new.registration_no) <> '' then
  perform pg_advisory_xact_lock(hashtext('standel_org_registration:' || btrim(new.registration_no))::bigint);
  if exists(select 1 from public.organizations o where btrim(o.registration_no)=btrim(new.registration_no) and o.id<>new.id) then
   raise exception 'Organization with this registration number already exists';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists prevent_duplicate_registration on public.organizations;
create trigger prevent_duplicate_registration before insert or update of registration_no
on public.organizations for each row execute function private.prevent_duplicate_registration();

-- Employee-month approval. An approved month is closed against all changes including direct API access.
create table if not exists public.payroll_months (
 org_id uuid not null,
 user_id uuid not null,
 month_start date not null,
 status text not null default 'open' check(status in ('open','approved')),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(org_id,user_id,month_start),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id),
 check(extract(day from month_start)=1),
 check ((status='open') or (approved_by is not null and approved_at is not null))
);
create index if not exists payroll_months_month_idx on public.payroll_months(org_id,month_start);
alter table public.payroll_months enable row level security;
drop policy if exists payroll_months_read on public.payroll_months;
create policy payroll_months_read on public.payroll_months for select to authenticated
 using(private.can_see_employee(org_id,user_id));
drop policy if exists payroll_months_insert_admin on public.payroll_months;
create policy payroll_months_insert_admin on public.payroll_months for insert to authenticated
 with check(private.is_admin(org_id));
drop policy if exists payroll_months_update_admin on public.payroll_months;
create policy payroll_months_update_admin on public.payroll_months for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
revoke all on public.payroll_months from public,anon,authenticated;
grant select,insert,update on public.payroll_months to authenticated;

-- The lock must run in DB for INSERT, UPDATE, and DELETE. Advisory transaction lock
-- synchronizes entry writes with approval and prevents write/approval races.
create or replace function private.monthly_lock_key(p_org uuid,p_user uuid,p_month date)
returns bigint language sql immutable set search_path='' as $$
 select hashtextextended(p_org::text||':'||p_user::text||':'||p_month::text,0)
$$;
create or replace function private.guard_payroll_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_user uuid;v_date date;v_month date;
begin
 v_org:=case when tg_op='DELETE' then old.org_id else new.org_id end;
 v_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 v_date:=case when tg_op='DELETE' then old.work_date else new.work_date end;
 v_month:=date_trunc('month',v_date)::date;
 perform pg_advisory_xact_lock(private.monthly_lock_key(v_org,v_user,v_month));
 if exists(select 1 from public.payroll_months pm where pm.org_id=v_org and pm.user_id=v_user
           and pm.month_start=v_month and pm.status='approved') then
  raise exception 'Месяц утверждён администратором. Изменения заблокированы.';
 end if;
 if tg_op='UPDATE' and new.work_date is distinct from old.work_date then
  perform pg_advisory_xact_lock(private.monthly_lock_key(old.org_id,old.user_id,date_trunc('month',old.work_date)::date));
  if exists(select 1 from public.payroll_months pm where pm.org_id=old.org_id and pm.user_id=old.user_id
            and pm.month_start=date_trunc('month',old.work_date)::date and pm.status='approved') then
   raise exception 'Нельзя переносить запись из утверждённого месяца';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists time_payroll_lock on public.time_entries;
create trigger time_payroll_lock before insert or update or delete on public.time_entries
for each row execute function private.guard_payroll_approval();

-- Validate approval permissions and capture actor server-side; never trust client provided actor.
create or replace function private.audit_payroll_month() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin(new.org_id) then raise exception 'Only organization admin may approve months'; end if;
 if tg_op='UPDATE' and (new.org_id,new.user_id,new.month_start) is distinct from (old.org_id,old.user_id,old.month_start) then raise exception 'Payroll month identity is immutable'; end if;
 perform pg_advisory_xact_lock(private.monthly_lock_key(new.org_id,new.user_id,new.month_start));
 new.updated_at:=now();
 if new.status='approved' then new.approved_by:=auth.uid();new.approved_at:=now();
 else new.approved_by:=null;new.approved_at:=null; end if;
 return new;
end $$;
drop trigger if exists payroll_month_validate on public.payroll_months;
create trigger payroll_month_validate before insert or update on public.payroll_months
for each row execute function private.audit_payroll_month();
create or replace function private.log_payroll_month() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(new.org_id,auth.uid(),'payroll_month',new.user_id,
 case when new.status='approved' then 'approve' else 'reopen' end,
 case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
drop trigger if exists payroll_month_audit on public.payroll_months;
create trigger payroll_month_audit after insert or update on public.payroll_months
for each row execute function private.log_payroll_month();

-- Hardening: a non-admin must not change time-entry ownership, payroll status,
-- or overwrite auditing fields (existing guard already rejects user/org changes).
create or replace function private.guard_time_entry_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.status is distinct from old.status or new.updated_at is distinct from old.updated_at
     or new.created_at is distinct from old.created_at
     or new.input_method is distinct from old.input_method then
    raise exception 'Protected time entry fields cannot be modified';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists entry_fields_guard on public.time_entries;
create trigger entry_fields_guard before update on public.time_entries
for each row execute function private.guard_time_entry_fields();
commit;
