-- StandEL Time v0.29: safe archive/restore and restricted employee removal.
-- Run after 009. Does not delete existing working data.
-- These RPCs use security definer and explicitly check administrator rights.
begin;

create or replace function public.admin_set_worker_status(p_org uuid,p_user uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(p_org) then raise exception 'Administrator required'; end if;
  if p_status not in ('active','archived') then raise exception 'Unsupported status'; end if;
  if p_user=auth.uid() then raise exception 'Cannot archive your own administrator account'; end if;
  if not exists (select 1 from public.org_members where org_id=p_org and user_id=p_user and role in ('employee','foreman'))
    then raise exception 'Employee not found or protected administrator'; end if;
  if p_status='archived' then
    -- Preserve work history and assignments, but disconnect reporting lines.
    update public.org_members set supervisor_id=null where org_id=p_org and supervisor_id=p_user;
  end if;
  update public.org_members set status=p_status
   where org_id=p_org and user_id=p_user and role in ('employee','foreman');
end $$;
revoke all on function public.admin_set_worker_status(uuid,uuid,text) from public,anon;
grant execute on function public.admin_set_worker_status(uuid,uuid,text) to authenticated;

create or replace function public.admin_delete_empty_worker(p_org uuid,p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  has_rows boolean;
begin
  if not private.is_admin(p_org) then raise exception 'Administrator required'; end if;
  if p_user=auth.uid() then raise exception 'Cannot delete your own account'; end if;
  -- Prevent concurrent status changes of this membership.
  perform 1 from public.org_members where org_id=p_org and user_id=p_user
    and status='archived' and role in ('employee','foreman') for update;
  if not found then raise exception 'Only archived non-admin employees can be deleted'; end if;
  if exists(select 1 from public.org_members where org_id=p_org and supervisor_id=p_user)
    then raise exception 'Employee is still assigned as a supervisor'; end if;
  -- Conservative rule: block removal if ANY public table has related org_id/user_id rows.
  -- Includes assignments, approved hours, certificates, absences, payroll and documents.
  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and c.relname <> 'org_members'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='org_id' and a.attnum>0 and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and a.attnum>0 and not a.attisdropped)
  loop
    execute format('select exists (select 1 from %I.%I where org_id = $1 and user_id = $2)',r.nspname,r.relname)
      into has_rows using p_org,p_user;
    if has_rows then
      raise exception 'Cannot delete: related records exist in %.%. Archive the employee instead',r.nspname,r.relname;
    end if;
  end loop;
  -- Never delete auth.users: an account may belong to another organization.
  -- FK constraints also provide a final protection against unnoticed dependencies.
  delete from public.org_members where org_id=p_org and user_id=p_user and status='archived';
  if not found then raise exception 'Employee was not deleted'; end if;
end $$;
revoke all on function public.admin_delete_empty_worker(uuid,uuid) from public,anon;
grant execute on function public.admin_delete_empty_worker(uuid,uuid) to authenticated;
commit;
