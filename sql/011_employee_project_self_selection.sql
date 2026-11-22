-- StandEL Time v0.30: self-selection of active projects by active members.
-- Apply after 009. Works with or without optional migration 010.
-- Does not delete existing assignments, hours, projects, or documents.
begin;

-- Keep the existing project_read policy for historic assigned/archived projects.
-- Add visibility of every ACTIVE project to authenticated active organization members.
drop policy if exists project_active_member_read on public.projects;
create policy project_active_member_read on public.projects
 for select to authenticated
 using (archived_at is null and private.member_role(org_id) is not null);

-- Members may record their OWN choice only; administrators retain existing assignment workflow.
drop policy if exists assignments_self_insert on public.project_assignments;
create policy assignments_self_insert on public.project_assignments
 for insert to authenticated
 with check (
   user_id = auth.uid()
   and private.member_role(org_id) in ('employee','foreman')
   and exists (
     select 1 from public.projects p
     where p.org_id = project_assignments.org_id
       and p.id = project_assignments.project_id
       and p.archived_at is null
   )
 );

-- A second, authoritative guard prevents assigning archived projects or inactive staff
-- even if a future RLS policy is accidentally loosened.
create or replace function private.guard_project_choice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.projects p
    where p.org_id=new.org_id and p.id=new.project_id and p.archived_at is null
  ) then
    raise exception 'Cannot select an archived or unknown project';
  end if;
  if not exists (
    select 1 from public.org_members m
    where m.org_id=new.org_id and m.user_id=new.user_id and m.status='active'
  ) then
    raise exception 'Inactive or unknown employee';
  end if;
  return new;
end $$;

drop trigger if exists guard_project_choice_insert on public.project_assignments;
create trigger guard_project_choice_insert
 before insert on public.project_assignments
 for each row execute function private.guard_project_choice();

-- Existing project_assignments INSERT grants must be explicit for self-service.
grant select, insert on public.project_assignments to authenticated;

-- Existing private.guard_time_entry requires a project_assignments row.
-- The app now creates that row immediately upon explicit selection, before saving hours.
commit;
