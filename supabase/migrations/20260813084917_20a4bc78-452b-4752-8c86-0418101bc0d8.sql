ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS needs_admin_review boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_employee_project_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.created_by := auth.uid();
    NEW.fee_total := 0;
    NEW.hours_budget := NULL;
    NEW.notes := NULL;
    NEW.status := 'active';
    NEW.needs_admin_review := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_employee_insert ON public.projects;
CREATE TRIGGER trg_projects_employee_insert
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_project_insert();

DROP POLICY IF EXISTS projects_insert_authenticated ON public.projects;
CREATE POLICY projects_insert_authenticated ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin() OR (
    code <> '' AND name <> '' AND coalesce(client_name, '') <> ''
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_approved AND NOT p.is_deleted)
  )
);

DROP POLICY IF EXISTS projects_select_own_created ON public.projects;
CREATE POLICY projects_select_own_created ON public.projects
FOR SELECT TO authenticated
USING (public.is_admin() OR created_by = auth.uid());