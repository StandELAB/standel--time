-- StandEL Time v0.8 · Apply AFTER 001_schema.sql in the same Supabase project.
-- Server-enforced Arbetsorder with multiple assignees and optional link to time records.
create table public.work_orders (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 project_id uuid not null,
 order_no text not null,
 title text not null check (length(trim(title)) between 3 and 160),
 description text not null default '' check(length(description)<=4000),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 status text not null default 'open' check(status in ('open','in_progress','done','approved','cancelled')),
 due_on date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 archived_at timestamptz,
 foreign key(org_id,project_id) references public.projects(org_id,id),
 unique(org_id,id), unique(org_id,order_no)
);
create index work_orders_project_idx on public.work_orders(org_id,project_id,status);
create table public.work_order_assignees (
 org_id uuid not null,
 work_order_id uuid not null,
 user_id uuid not null,
 assigned_at timestamptz not null default now(),
 primary key(work_order_id,user_id),
 foreign key(org_id,work_order_id) references public.work_orders(org_id,id),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id)
);
create index work_order_assignees_user_idx on public.work_order_assignees(org_id,user_id);
-- Each time entry can optionally correspond to a particular Arbetsorder.
alter table public.time_entries add column work_order_id uuid;
alter table public.time_entries add constraint time_order_same_org
 foreign key(org_id,work_order_id) references public.work_orders(org_id,id);
-- Ensure a time entry belongs to the same project as its order, and employee is assigned.
-- This trigger executes in addition to v0.7 guard_time_entry.
create or replace function private.check_entry_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare o public.work_orders%rowtype;
begin
 if new.work_order_id is null then return new; end if;
 select * into o from public.work_orders where id=new.work_order_id and org_id=new.org_id;
 if not found or o.project_id<>new.project_id or o.archived_at is not null or o.status='cancelled' then
  raise exception 'Invalid work order/project combination'; end if;
 if not exists (select 1 from public.work_order_assignees a
  where a.work_order_id=new.work_order_id and a.org_id=new.org_id and a.user_id=new.user_id) then
  raise exception 'Employee is not assigned to work order'; end if;
 return new;
end $$;
create trigger time_order_guard before insert or update on public.time_entries
 for each row execute function private.check_entry_order();
-- Validate assignees also have access to the order's project.
create or replace function private.check_work_order_assignee() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists (
   select 1 from public.work_orders w
   join public.project_assignments pa on pa.org_id=w.org_id and pa.project_id=w.project_id
   where w.id=new.work_order_id and w.org_id=new.org_id and pa.user_id=new.user_id
 ) then raise exception 'Assign employee to project before assigning work order'; end if;
 return new;
end $$;
create trigger work_order_assignee_guard before insert or update on public.work_order_assignees
 for each row execute function private.check_work_order_assignee();
-- Server-side audit for create/update and assignments.
create or replace function private.audit_work_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(coalesce(new.org_id,old.org_id),auth.uid(),'work_order',coalesce(new.id,old.id),lower(tg_op),
  case when tg_op='INSERT' then null else to_jsonb(old) end,
  case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger work_order_audit after insert or update on public.work_orders
 for each row execute function private.audit_work_order();
create or replace function private.audit_order_assignee() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(coalesce(new.org_id,old.org_id),auth.uid(),'work_order_assignee',coalesce(new.work_order_id,old.work_order_id),lower(tg_op),
  case when tg_op='INSERT' then null else to_jsonb(old) end,
  case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger work_order_assignee_audit after insert or delete on public.work_order_assignees
 for each row execute function private.audit_order_assignee();
-- RLS: only assigned staff or admins can read work orders, never public.
alter table public.work_orders enable row level security;
alter table public.work_order_assignees enable row level security;
create policy wo_admin_read on public.work_orders for select to authenticated using(private.is_admin(org_id));
create policy wo_assigned_read on public.work_orders for select to authenticated
 using(exists(select 1 from public.work_order_assignees a where a.work_order_id=id and a.user_id=auth.uid()) and private.member_role(org_id) is not null);
create policy wo_admin_insert on public.work_orders for insert to authenticated
 with check(private.is_admin(org_id) and created_by=auth.uid() and status='open');
create policy wo_admin_update on public.work_orders for update to authenticated
 using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy wo_assignees_read on public.work_order_assignees for select to authenticated
 using(private.is_admin(org_id) or (user_id=auth.uid() and private.member_role(org_id) is not null));
create policy wo_assignees_insert on public.work_order_assignees for insert to authenticated
 with check(private.is_admin(org_id));
create policy wo_assignees_delete on public.work_order_assignees for delete to authenticated
 using(private.is_admin(org_id));
revoke all on public.work_orders,public.work_order_assignees from public,anon,authenticated;
grant select,insert,update on public.work_orders to authenticated;
grant select,insert,delete on public.work_order_assignees to authenticated;
-- Only admin is allowed to edit the full work order; assignees may change status via checked RPC.
create or replace function public.set_work_order_status(p_order uuid,p_status text) returns text
language plpgsql security definer set search_path='' as $$
declare o public.work_orders%rowtype;
begin
 select * into o from public.work_orders where id=p_order for update;
 if not found or o.archived_at is not null then raise exception 'Work order unavailable'; end if;
 if private.is_admin(o.org_id) then
  if not ((o.status='open' and p_status in ('in_progress','cancelled')) or
          (o.status='in_progress' and p_status in ('done','cancelled')) or
          (o.status='done' and p_status in ('approved','in_progress')) or
          (o.status='approved' and p_status='in_progress')) then
   raise exception 'Invalid status transition'; end if;
 else
  if private.member_role(o.org_id) is null or not exists(select 1 from public.work_order_assignees a
     where a.work_order_id=p_order and a.user_id=auth.uid()) then
    raise exception 'Not assigned to work order'; end if;
  if not ((o.status='open' and p_status='in_progress') or
          (o.status='in_progress' and p_status='done')) then
   raise exception 'Invalid worker status transition'; end if;
 end if;
 update public.work_orders set status=p_status,updated_at=now(),
  completed_at=case when p_status='done' then now() when p_status='in_progress' then null else completed_at end
 where id=p_order;
 return p_status;
end $$;
revoke all on function public.set_work_order_status(uuid,text) from public,anon;
grant execute on function public.set_work_order_status(uuid,text) to authenticated;
-- Do not allow changing ownership fields or project after creation; admin may change title, description etc.
create or replace function private.work_order_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.org_id is distinct from old.org_id or new.id is distinct from old.id
   or new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.order_no is distinct from old.order_no then
   raise exception 'Work order identifiers are immutable'; end if;
  new.updated_at=now();
 end if;
 return new;
end $$;
create trigger work_order_guard before update on public.work_orders
 for each row execute function private.work_order_guard();
