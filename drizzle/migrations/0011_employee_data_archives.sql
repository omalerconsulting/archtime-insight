CREATE TABLE public.employee_archives (
 user_id uuid PRIMARY KEY,
 full_name text NOT NULL,
 email text NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL
);
GRANT SELECT ON public.employee_archives TO authenticated;
GRANT ALL ON public.employee_archives TO service_role;
ALTER TABLE public.employee_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_archives_admin_read ON public.employee_archives FOR SELECT TO authenticated USING (public.is_admin());
CREATE FUNCTION public.employee_archive_payload(p_user_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object(
 'profile', (SELECT to_jsonb(p) - 'cost_rate' FROM public.profiles p WHERE p.id = p_user_id),
 'time_entries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.work_date,t.id) FROM public.time_entries t WHERE t.user_id=p_user_id),'[]'::jsonb),
 'project_hours', COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.work_date,h.id) FROM public.project_hours h WHERE h.user_id=p_user_id),'[]'::jsonb),
 'monthly_reports', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.month,r.id) FROM public.monthly_reports r WHERE r.user_id=p_user_id),'[]'::jsonb),
 'active_timers', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.active_timers t WHERE t.user_id=p_user_id),'[]'::jsonb),
 'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name)) FROM public.projects p WHERE EXISTS(SELECT 1 FROM public.project_hours h WHERE h.project_id=p.id AND h.user_id=p_user_id) OR EXISTS(SELECT 1 FROM public.active_timers t WHERE t.project_id=p.id AND t.user_id=p_user_id)),'[]'::jsonb)
 );
$$;
REVOKE ALL ON FUNCTION public.employee_archive_payload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_archive_payload(uuid) TO service_role;
CREATE FUNCTION public.archive_deleted_employee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.is_deleted AND NOT OLD.is_deleted THEN
  IF NOT public.is_admin() AND COALESCE(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Only administrators can delete employees'; END IF;
  INSERT INTO public.employee_archives(user_id,full_name,email,payload)
  VALUES(OLD.id,OLD.full_name,OLD.email,public.employee_archive_payload(OLD.id))
  ON CONFLICT(user_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_deleted_employee() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER archive_employee_before_deletion BEFORE UPDATE OF is_deleted ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_employee();
INSERT INTO public.employee_archives(user_id,full_name,email,archived_at,payload)
SELECT p.id,p.full_name,p.email,p.updated_at,public.employee_archive_payload(p.id) FROM public.profiles p WHERE p.is_deleted ON CONFLICT(user_id) DO NOTHING;