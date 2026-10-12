DROP POLICY IF EXISTS projects_select_own_created ON public.projects;
CREATE POLICY projects_select_admin ON public.projects FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.list_projects_directory()
 RETURNS TABLE(id uuid, code text, name text, client_name text, status text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.code, p.name,
         CASE WHEN public.is_admin() THEN p.client_name ELSE NULL END,
         p.status
  FROM public.projects p
  WHERE auth.uid() IS NOT NULL
  ORDER BY p.code
$function$;