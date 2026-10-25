CREATE TABLE public.finance_duplicate_reviews (
 pair_key text PRIMARY KEY,
 approved_by uuid NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.finance_duplicate_reviews TO authenticated;
GRANT ALL ON public.finance_duplicate_reviews TO service_role;
ALTER TABLE public.finance_duplicate_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_duplicate_reviews_admin_select ON public.finance_duplicate_reviews FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY finance_duplicate_reviews_admin_insert ON public.finance_duplicate_reviews FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND approved_by = auth.uid());
CREATE POLICY finance_duplicate_reviews_admin_delete ON public.finance_duplicate_reviews FOR DELETE TO authenticated USING (public.is_admin());