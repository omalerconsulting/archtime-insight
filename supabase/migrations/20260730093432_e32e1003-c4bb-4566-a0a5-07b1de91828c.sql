CREATE OR REPLACE FUNCTION public.period_open(_work_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_date <= ((date_trunc('month', _work_date) + interval '1 month')::date + 5)
$$;

DROP POLICY IF EXISTS time_entries_own ON public.time_entries;
CREATE POLICY time_entries_select_own ON public.time_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY time_entries_insert_own ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY time_entries_update_own ON public.time_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)))
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY time_entries_delete_own ON public.time_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY time_entries_admin_write ON public.time_entries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS project_hours_own ON public.project_hours;
CREATE POLICY project_hours_select_own ON public.project_hours
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY project_hours_insert_own ON public.project_hours
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY project_hours_update_own ON public.project_hours
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)))
  WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY project_hours_delete_own ON public.project_hours
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND (public.is_admin() OR public.period_open(work_date)));
CREATE POLICY project_hours_admin_write ON public.project_hours
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());