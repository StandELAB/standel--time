-- v0.25: separate first and last name in the private employee profile.
-- Requires 007_personal_profiles_certificate_files.sql.
-- Additive migration: no existing data is deleted or overwritten.
begin;
alter table public.employee_personal_details
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '';
-- Existing RLS rules from migration 007 apply to both new columns.
-- Respect existing profile data and avoid changing org_members display names automatically.
commit;
