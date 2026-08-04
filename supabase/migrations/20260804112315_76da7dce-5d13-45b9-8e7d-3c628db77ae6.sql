-- ===== 1. Active break persisted server-side (was localStorage only) =====
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS break_start time;

-- ===== 2. Live project timer =====
CREATE TABLE IF NOT EXISTS public.active_timers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_timers TO authenticated;
GRANT ALL ON public.active_timers TO service_role;
ALTER TABLE public.active_timers ENABLE ROW LEVEL SECURITY;
CREATE POLICY active_timers_own ON public.active_timers
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== 3. Monthly report submission & approval workflow =====
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','returned')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_reports TO authenticated;
GRANT ALL ON public.monthly_reports TO service_role;
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_reports_select_own_or_admin ON public.monthly_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY monthly_reports_insert_own ON public.monthly_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'submitted');
CREATE POLICY monthly_reports_update_own ON public.monthly_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status <> 'approved')
  WITH CHECK (user_id = auth.uid() AND status IN ('submitted'));
CREATE POLICY monthly_reports_admin_all ON public.monthly_reports
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER monthly_reports_touch BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== 4. Vacation / sick balances =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vacation_quota numeric(5,2) NOT NULL DEFAULT 12;

CREATE OR REPLACE FUNCTION public.protect_profile_cost_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.cost_rate := OLD.cost_rate;
    NEW.is_active := OLD.is_active;
    NEW.hire_date := OLD.hire_date;
    NEW.vacation_quota := OLD.vacation_quota;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ===== 5. Reported months become read-only once submitted/approved =====
CREATE OR REPLACE FUNCTION public.month_editable(_work_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.period_open(_work_date)
     AND NOT EXISTS (
       SELECT 1 FROM public.monthly_reports mr
       WHERE mr.user_id = auth.uid()
         AND mr.month = date_trunc('month', _work_date)::date
         AND mr.status IN ('submitted','approved')
     )
$$;

DROP POLICY IF EXISTS time_entries_insert_own ON public.time_entries;
CREATE POLICY time_entries_insert_own ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));
DROP POLICY IF EXISTS time_entries_update_own ON public.time_entries;
CREATE POLICY time_entries_update_own ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)))
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));
DROP POLICY IF EXISTS time_entries_delete_own ON public.time_entries;
CREATE POLICY time_entries_delete_own ON public.time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));

DROP POLICY IF EXISTS project_hours_insert_own ON public.project_hours;
CREATE POLICY project_hours_insert_own ON public.project_hours
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));
DROP POLICY IF EXISTS project_hours_update_own ON public.project_hours;
CREATE POLICY project_hours_update_own ON public.project_hours
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)))
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));
DROP POLICY IF EXISTS project_hours_delete_own ON public.project_hours;
CREATE POLICY project_hours_delete_own ON public.project_hours
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.month_editable(work_date)));