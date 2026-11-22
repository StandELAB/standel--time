-- v0.22: private employee profile details and certificate files.
-- Run in production SQL Editor BEFORE deploying v0.22.
begin;
create table if not exists public.employee_personal_details (
 org_id uuid not null,
 user_id uuid not null,
 phone text not null default '' check(length(phone)<=60),
 contact_email text not null default '' check(length(contact_email)<=254),
 address_line text not null default '' check(length(address_line)<=250),
 postal_code text not null default '' check(length(postal_code)<=30),
 city text not null default '' check(length(city)<=120),
 updated_at timestamptz not null default now(),
 primary key(org_id,user_id),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id) on delete cascade
);
alter table public.employee_personal_details enable row level security;
drop policy if exists personal_details_read on public.employee_personal_details;
create policy personal_details_read on public.employee_personal_details for select to authenticated
 using(user_id=auth.uid() or private.is_admin(org_id));
drop policy if exists personal_details_insert on public.employee_personal_details;
create policy personal_details_insert on public.employee_personal_details for insert to authenticated
 with check(user_id=auth.uid() and private.member_role(org_id) in ('employee','foreman','admin'));
drop policy if exists personal_details_update on public.employee_personal_details;
create policy personal_details_update on public.employee_personal_details for update to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.employee_personal_details from public,anon,authenticated;
grant select,insert,update on public.employee_personal_details to authenticated;

create table if not exists public.employee_certificate_files (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 user_id uuid not null,
 label text not null check(length(label) between 1 and 160),
 filename text not null check(length(filename) between 1 and 255),
 mime_type text not null,
 storage_path text not null unique,
 created_at timestamptz not null default now(),
 foreign key(org_id,user_id) references public.org_members(org_id,user_id) on delete cascade,
 constraint cert_file_owned_path check(storage_path like user_id::text || '/%' and storage_path !~ '[^a-zA-Z0-9/_-]')
);
create index if not exists cert_files_user_idx on public.employee_certificate_files(org_id,user_id,created_at desc);
alter table public.employee_certificate_files enable row level security;
drop policy if exists cert_files_read on public.employee_certificate_files;
create policy cert_files_read on public.employee_certificate_files for select to authenticated
 using(user_id=auth.uid() or private.is_admin(org_id));
drop policy if exists cert_files_insert on public.employee_certificate_files;
create policy cert_files_insert on public.employee_certificate_files for insert to authenticated
 with check(user_id=auth.uid() and private.member_role(org_id) in ('employee','foreman','admin'));
drop policy if exists cert_files_delete on public.employee_certificate_files;
create policy cert_files_delete on public.employee_certificate_files for delete to authenticated
 using(user_id=auth.uid());
revoke all on public.employee_certificate_files from public,anon,authenticated;
grant select,insert,delete on public.employee_certificate_files to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('standel-certificates','standel-certificates',false,15728640,
 array['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet',
 'text/plain','text/csv','application/csv'])
on conflict(id) do update set public=false,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists standel_cert_storage_read on storage.objects;
create policy standel_cert_storage_read on storage.objects for select to authenticated
 using(bucket_id='standel-certificates' and exists(
  select 1 from public.employee_certificate_files f
  where f.storage_path=name and (f.user_id=auth.uid() or private.is_admin(f.org_id))));
drop policy if exists standel_cert_storage_insert on storage.objects;
create policy standel_cert_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='standel-certificates' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.org_members m where m.user_id=auth.uid() and m.status='active'));
drop policy if exists standel_cert_storage_delete on storage.objects;
create policy standel_cert_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='standel-certificates' and (storage.foldername(name))[1]=auth.uid()::text);
commit;
