-- v0.16; run AFTER 001, 002 and 003, once in an existing test database.
-- Add the third operational absence category without dropping historical rows.
ALTER TABLE public.absences DROP CONSTRAINT IF EXISTS absences_kind_check;
ALTER TABLE public.absences ADD CONSTRAINT absences_kind_check
  CHECK (kind IN ('sick','personal','vacation','no_show'));
-- Administrators may explicitly register no-shows / sick leave for employees.
DROP POLICY IF EXISTS absence_admin_insert ON public.absences;
CREATE POLICY absence_admin_insert ON public.absences FOR INSERT TO authenticated
 WITH CHECK(private.is_admin(org_id) AND private.member_role(org_id) IS NOT NULL);
