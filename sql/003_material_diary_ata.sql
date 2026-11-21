-- v0.9; apply AFTER 001_schema.sql and 002_work_orders.sql.
-- This migration is designed for a new/test Supabase project; review RLS before live data.
create table public.material_entries (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,project_id uuid not null,work_order_id uuid,
 user_id uuid not null default auth.uid(),
 work_date date not null default current_date,
 item_name text not null check(length(trim(item_name)) between 2 and 180),
 unit text not null default 'st' check(unit in ('st','m','m2','kg','h','paket','other')),
 quantity numeric(12,3) not null check(quantity>0 and quantity<=100000),
 notes text not null default '' check(length(notes)<=1000),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references public.projects(org_id,id),
 foreign key(org_id,work_order_id) references public.work_orders(org_id,id),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id),
 unique(org_id,id)
);
create index material_by_project_date on public.material_entries(org_id,project_id,work_date desc);
-- Worker-visible material details are separate from private administrator-only prices.
create table public.material_prices (
 org_id uuid not null,material_id uuid primary key,
 unit_cost_sek numeric(12,2) not null default 0 check(unit_cost_sek>=0),
 unit_sales_sek numeric(12,2) not null default 0 check(unit_sales_sek>=0),
 foreign key(org_id,material_id) references public.material_entries(org_id,id)
);
create table public.site_diary (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,project_id uuid not null,work_order_id uuid,
 user_id uuid not null default auth.uid(),
 work_date date not null default current_date,
 description text not null check(length(trim(description)) between 3 and 4000),
 safety_notes text not null default '' check(length(safety_notes)<=2000),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references public.projects(org_id,id),
 foreign key(org_id,work_order_id) references public.work_orders(org_id,id),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id),
 unique(org_id,id)
);
create index diary_by_project_date on public.site_diary(org_id,project_id,work_date desc);
create table public.diary_photos (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,diary_id uuid not null,
 user_id uuid not null default auth.uid(),
 storage_path text not null unique,
 created_at timestamptz not null default now(),
 foreign key(org_id,diary_id) references public.site_diary(org_id,id),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id)
);
create table public.ata_requests (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,project_id uuid not null,work_order_id uuid,
 requested_by uuid not null default auth.uid(),
 ata_no text,
 title text not null check(length(trim(title)) between 3 and 180),
 description text not null check(length(trim(description)) between 3 and 4000),
 proposed_hours numeric(9,2) not null default 0 check(proposed_hours between 0 and 100000),
 status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')),
 decided_by uuid,decided_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references public.projects(org_id,id),
 foreign key(org_id,work_order_id) references public.work_orders(org_id,id),
 foreign key(org_id,requested_by) references public.org_members(org_id,user_id),
 unique(org_id,id),unique(org_id,ata_no)
);
create index ata_by_project on public.ata_requests(org_id,project_id,status);
-- Financial values are stored separately to avoid exposing them to workers.
create table public.ata_finance (
 org_id uuid not null,ata_id uuid primary key,
 labor_rate_sek numeric(12,2) not null default 0 check(labor_rate_sek>=0),
 materials_sek numeric(12,2) not null default 0 check(materials_sek>=0),
 other_sek numeric(12,2) not null default 0 check(other_sek>=0),
 foreign key(org_id,ata_id) references public.ata_requests(org_id,id)
);
-- Validate cross-project work orders and immutable ownership of records.
create or replace function private.guard_site_detail() returns trigger language plpgsql security definer set search_path='' as $$
declare order_project uuid; assigned boolean;
begin
 if tg_op='UPDATE' then
  if new.org_id is distinct from old.org_id or new.project_id is distinct from old.project_id or new.user_id is distinct from old.user_id then
   raise exception 'Record ownership cannot be changed';
  end if;
 end if;
 if new.work_order_id is not null then
  select project_id into order_project from public.work_orders where org_id=new.org_id and id=new.work_order_id and status<>'cancelled';
  if order_project is distinct from new.project_id then raise exception 'Wrong work order project';end if;
  if not private.is_admin(new.org_id) and not exists(
   select 1 from public.work_order_assignees where org_id=new.org_id and work_order_id=new.work_order_id and user_id=new.user_id
  ) then raise exception 'Work order not assigned';end if;
 end if;
 if not private.is_admin(new.org_id) and not exists(
  select 1 from public.project_assignments where org_id=new.org_id and project_id=new.project_id and user_id=new.user_id
 ) then raise exception 'Project not assigned';end if;
 return new;
end $$;
create trigger materials_guard before insert or update on public.material_entries for each row execute function private.guard_site_detail();
create trigger diary_guard before insert or update on public.site_diary for each row execute function private.guard_site_detail();
-- ata_requests uses requested_by, not user_id; create separate guard.
create or replace function private.guard_ata() returns trigger language plpgsql security definer set search_path='' as $$
declare order_project uuid;
begin
 if tg_op='UPDATE' then
  if new.org_id is distinct from old.org_id or new.project_id is distinct from old.project_id
   or new.requested_by is distinct from old.requested_by or new.created_at is distinct from old.created_at
   or new.work_order_id is distinct from old.work_order_id then raise exception 'Immutable ATA identity';end if;
  if not private.is_admin(new.org_id) then
   if old.status not in ('draft','rejected') or new.status not in ('draft','submitted')
    or new.decided_at is distinct from old.decided_at or new.decided_by is distinct from old.decided_by
    or new.ata_no is distinct from old.ata_no then raise exception 'Only admin may decide ATA'; end if;
  end if;
 end if;
 if new.work_order_id is not null then
  select project_id into order_project from public.work_orders where org_id=new.org_id and id=new.work_order_id and status<>'cancelled';
  if order_project is distinct from new.project_id then raise exception 'Wrong work order';end if;
  if not private.is_admin(new.org_id) and not exists (select 1 from public.work_order_assignees a where a.org_id=new.org_id and a.work_order_id=new.work_order_id and a.user_id=new.requested_by) then
   raise exception 'Work order not assigned to ATA author';
  end if;
 end if;
 if not private.is_admin(new.org_id) and not exists(
  select 1 from public.project_assignments where org_id=new.org_id and project_id=new.project_id and user_id=new.requested_by
 ) then raise exception 'Project not assigned';end if;
 return new;
end $$;
create trigger ata_guard before insert or update on public.ata_requests for each row execute function private.guard_ata();
-- RLS: workers see only their own records, admins all in their organization.
alter table public.material_entries enable row level security;
alter table public.material_prices enable row level security;
alter table public.site_diary enable row level security;
alter table public.diary_photos enable row level security;
alter table public.ata_requests enable row level security;
alter table public.ata_finance enable row level security;
create policy material_read on public.material_entries for select to authenticated using(private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null));
create policy material_add on public.material_entries for insert to authenticated with check((private.is_admin(org_id) or auth.uid()=user_id) and private.member_role(org_id) is not null);
create policy price_admin on public.material_prices for all to authenticated using(private.is_admin(org_id)) with check(private.is_admin(org_id));
create policy diary_read on public.site_diary for select to authenticated using(private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null));
create policy diary_add on public.site_diary for insert to authenticated with check((private.is_admin(org_id) or auth.uid()=user_id) and private.member_role(org_id) is not null);
create policy diary_photo_read on public.diary_photos for select to authenticated using(private.is_admin(org_id) or (auth.uid()=user_id and private.member_role(org_id) is not null));
create policy diary_photo_add on public.diary_photos for insert to authenticated with check(auth.uid()=user_id and private.member_role(org_id) is not null and exists(select 1 from public.site_diary d where d.id=diary_id and d.user_id=auth.uid()));
create policy ata_read on public.ata_requests for select to authenticated using(private.is_admin(org_id) or (auth.uid()=requested_by and private.member_role(org_id) is not null));
create policy ata_add on public.ata_requests for insert to authenticated with check((private.is_admin(org_id) or auth.uid()=requested_by) and private.member_role(org_id) is not null and status in ('draft','submitted') and decided_at is null and decided_by is null);
create policy ata_update on public.ata_requests for update to authenticated using(private.is_admin(org_id) or (auth.uid()=requested_by and private.member_role(org_id) is not null)) with check(private.is_admin(org_id) or (auth.uid()=requested_by and private.member_role(org_id) is not null));
create policy ata_finance_admin on public.ata_finance for all to authenticated using(private.is_admin(org_id)) with check(private.is_admin(org_id));
-- Enforce restricted columns on worker update, including admin-only decisions and pricing.
revoke all on public.material_entries,public.material_prices,public.site_diary,public.diary_photos,public.ata_requests,public.ata_finance from public,anon,authenticated;
grant select,insert on public.material_entries, public.site_diary,public.diary_photos to authenticated;
grant select,insert,update on public.ata_requests to authenticated;
grant select,insert,update on public.material_prices,public.ata_finance to authenticated;
-- Admin updates and status changes are recorded; no direct worker edits to historical quantities.
create or replace function private.audit_v09() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_events(org_id,actor_id,entity,entity_id,action,before_data,after_data)
 values(coalesce(new.org_id,old.org_id),auth.uid(),TG_TABLE_NAME,coalesce(new.id,old.id),lower(TG_OP),
 case when TG_OP='INSERT' then null else to_jsonb(old) end,
 case when TG_OP='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;
create trigger material_audit after insert on public.material_entries for each row execute function private.audit_v09();
create trigger diary_audit after insert on public.site_diary for each row execute function private.audit_v09();
create trigger ata_audit after insert or update on public.ata_requests for each row execute function private.audit_v09();
-- Photos: only the photo owner uploads into their org/user prefix; admins may read.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('standel-diary','standel-diary',false,10485760,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do nothing;
create policy standel_photo_upload on storage.objects for insert to authenticated
 with check(bucket_id='standel-diary' and (storage.foldername(name))[2]=auth.uid()::text
 and exists(select 1 from public.org_members m where m.org_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.status='active'));
create policy standel_photo_view on storage.objects for select to authenticated
 using(bucket_id='standel-diary' and exists(select 1 from public.org_members m where m.org_id::text=(storage.foldername(name))[1] and m.status='active' and (m.user_id=auth.uid() and (storage.foldername(name))[2]=auth.uid()::text or private.is_admin(m.org_id))));
-- Prevent a diary photo metadata record from pointing to another org/user file.
create or replace function private.guard_diary_photo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists (select 1 from public.site_diary d where d.id=new.diary_id and d.org_id=new.org_id and d.user_id=new.user_id) then
  raise exception 'Photo must belong to diary author';
 end if;
 if split_part(new.storage_path,'/',1)<>new.org_id::text or split_part(new.storage_path,'/',2)<>new.user_id::text then
  raise exception 'Invalid private photo path';
 end if;
 return new;
end $$;
create trigger photo_meta_guard before insert on public.diary_photos for each row execute function private.guard_diary_photo();
