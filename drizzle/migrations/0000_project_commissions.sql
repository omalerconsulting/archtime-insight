CREATE TABLE public.project_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  supplier_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  expected_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_commissions TO authenticated;
GRANT ALL ON public.project_commissions TO service_role;
ALTER TABLE public.project_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_commissions_admin_all ON public.project_commissions FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX project_commissions_project_idx ON public.project_commissions(project_id);
CREATE TRIGGER project_commissions_touch BEFORE UPDATE ON public.project_commissions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();