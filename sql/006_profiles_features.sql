-- StandEL Time v0.18: private avatars, delegated feature access and foreman assignment.
-- Run after 005, on a verified staging copy first. Does not delete existing data.
begin;

create table if not exists public.profile_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_path text not null,
  updated_at timestamptz not null default now(),
  constraint avatar_path_is_owner check (storage_path = user_id::text || '/avatar')
);
alter table public.profile_avatars enable row level security;
drop policy if exists avatar_member_read on public.profile_avatars;
create policy avatar_member_read on public.profile_avatars for select to authenticated
 using (exists (select 1 from public.org_members m where m.user_id=profile_avatars.user_id
   and private.can_see_employee(m.org_id,m.user_id)));
drop policy if exists avatar_self_insert on public.profile_avatars;
create policy avatar_self_insert on public.profile_avatars for insert to authenticated
 with check (user_id=auth.uid());
drop policy if exists avatar_self_update on public.profile_avatars;
create policy avatar_self_update on public.profile_avatars for update to authenticated
 using (user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.profile_avatars from public,anon,authenticated;
grant select,insert,update on public.profile_avatars to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('standel-avatars','standel-avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists standel_avatar_read on storage.objects;
create policy standel_avatar_read on storage.objects for select to authenticated
 using (bucket_id='standel-avatars' and exists(
  select 1 from public.org_members m
  where m.user_id::text=(storage.foldername(name))[1]
    and private.can_see_employee(m.org_id,m.user_id)));
drop policy if exists standel_avatar_insert on storage.objects;
create policy standel_avatar_insert on storage.objects for insert to authenticated
 with check(bucket_id='standel-avatars' and name=auth.uid()::text||'/avatar');
drop policy if exists standel_avatar_update on storage.objects;
create policy standel_avatar_update on storage.objects for update to authenticated
 using(bucket_id='standel-avatars' and name=auth.uid()::text||'/avatar')
 with check(bucket_id='standel-avatars' and name=auth.uid()::text||'/avatar');

create table if not exists public.employee_feature_access (
 org_id uuid not null,
 user_id uuid not null,
 feature text not null check(feature in ('orders','materials','ata')),
 enabled boolean not null default false,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(org_id,user_id,feature),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id) on delete cascade
);
alter table public.employee_feature_access enable row level security;
drop policy if exists feature_access_read on public.employee_feature_access;
create policy feature_access_read on public.employee_feature_access for select to authenticated
 using(private.can_see_employee(org_id,user_id));
revoke all on public.employee_feature_access from public,anon,authenticated;
grant select on public.employee_feature_access to authenticated;

-- On the database side, only admin or the assigned foreman may change access,
-- and only for non-admin employees. Foremen cannot appoint other foremen.
create or replace function public.set_employee_feature(p_org uuid,p_user uuid,p_feature text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_target public.org_members%rowtype;
begin
 if p_feature not in ('orders','materials','ata') then raise exception 'Unknown feature'; end if;
 select * into v_target from public.org_members
 where org_id=p_org and user_id=p_user and status='active';
 if not found or v_target.role<>'employee' then raise exception 'Only active employees can be assigned optional tabs'; end if;
 if not (private.is_admin(p_org) or
   (private.member_role(p_org)='foreman' and v_target.supervisor_id=auth.uid())) then
   raise exception 'Not allowed to manage this employee';
 end if;
 insert into public.employee_feature_access(org_id,user_id,feature,enabled,updated_by)
 values(p_org,p_user,p_feature,p_enabled,auth.uid())
 on conflict(org_id,user_id,feature) do update
 set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.set_employee_feature(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_employee_feature(uuid,uuid,text,boolean) to authenticated;

create or replace function public.set_employee_role(p_org uuid,p_user uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin(p_org) then raise exception 'Administrator required'; end if;
 if p_role not in ('employee','foreman') then raise exception 'Unsupported role'; end if;
 update public.org_members set role=p_role,supervisor_id=null
 where org_id=p_org and user_id=p_user and status='active' and role in ('employee','foreman');
 if not found then raise exception 'Employee not found or protected administrator'; end if;
end $$;
revoke all on function public.set_employee_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_employee_role(uuid,uuid,text) to authenticated;

create or replace function public.set_employee_supervisor(p_org uuid,p_user uuid,p_foreman uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin(p_org) then raise exception 'Administrator required'; end if;
 if p_foreman is not null and not exists(
  select 1 from public.org_members where org_id=p_org and user_id=p_foreman
    and role='foreman' and status='active') then raise exception 'Selected supervisor is not an active foreman'; end if;
 update public.org_members set supervisor_id=p_foreman
 where org_id=p_org and user_id=p_user and role='employee' and status='active';
 if not found then raise exception 'Only employees can have a foreman'; end if;
end $$;
revoke all on function public.set_employee_supervisor(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_employee_supervisor(uuid,uuid,uuid) to authenticated;

-- Enforce optional-tab access in the database as well as the interface.
-- RESTRICTIVE policies combine with existing base RLS policies (never replace them).
create or replace function private.feature_allowed(p_org uuid,p_feature text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.member_role(p_org) in ('admin','foreman')
   or exists(select 1 from public.employee_feature_access f
             where f.org_id=p_org and f.user_id=auth.uid()
               and f.feature=p_feature and f.enabled),false)
$$;
revoke all on function private.feature_allowed(uuid,text) from public,anon;
grant execute on function private.feature_allowed(uuid,text) to authenticated;

drop policy if exists feature_orders_select on public.work_orders;
create policy feature_orders_select on public.work_orders as restrictive for select to authenticated
 using(private.feature_allowed(org_id,'orders'));
drop policy if exists feature_order_assignees_select on public.work_order_assignees;
create policy feature_order_assignees_select on public.work_order_assignees as restrictive for select to authenticated
 using(private.feature_allowed(org_id,'orders'));
drop policy if exists feature_material_select on public.material_entries;
create policy feature_material_select on public.material_entries as restrictive for select to authenticated
 using(private.feature_allowed(org_id,'materials'));
drop policy if exists feature_material_insert on public.material_entries;
create policy feature_material_insert on public.material_entries as restrictive for insert to authenticated
 with check(private.feature_allowed(org_id,'materials'));
drop policy if exists feature_ata_select on public.ata_requests;
create policy feature_ata_select on public.ata_requests as restrictive for select to authenticated
 using(private.feature_allowed(org_id,'ata'));
drop policy if exists feature_ata_insert on public.ata_requests;
create policy feature_ata_insert on public.ata_requests as restrictive for insert to authenticated
 with check(private.feature_allowed(org_id,'ata'));
drop policy if exists feature_ata_update on public.ata_requests;
create policy feature_ata_update on public.ata_requests as restrictive for update to authenticated
 using(private.feature_allowed(org_id,'ata')) with check(private.feature_allowed(org_id,'ata'));

-- Protect status-changing RPC, which runs with definer privileges.
create or replace function private.guard_workorder_feature() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.feature_allowed(new.org_id,'orders') then
   raise exception 'Arbetsorder tab is not enabled for this user';
 end if;
 return new;
end $$;
-- Existing work-order status RPC writes through definer privileges and will still
-- invoke this database trigger, so the check cannot be bypassed by direct RPC.
drop trigger if exists work_order_feature_gate on public.work_orders;
create trigger work_order_feature_gate before update on public.work_orders
for each row execute function private.guard_workorder_feature();

commit;
