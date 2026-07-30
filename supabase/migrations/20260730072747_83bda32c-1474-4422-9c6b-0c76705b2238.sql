-- allow admins to create the org settings row
CREATE POLICY org_settings_admin_insert ON public.org_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- allow admins to grant / revoke roles
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin());

GRANT INSERT ON public.org_settings TO authenticated;
GRANT INSERT, DELETE ON public.user_roles TO authenticated;

-- ensure the profile trigger exists (new users must get a profile + role)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();