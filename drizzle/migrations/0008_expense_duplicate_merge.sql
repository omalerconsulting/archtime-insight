ALTER TABLE public.expenses ADD COLUMN merged_into uuid REFERENCES public.expenses(id);
COMMENT ON COLUMN public.expenses.merged_into IS 'Absorbed duplicate; retained to preserve statement import fingerprints, excluded from the active ledger.';
CREATE OR REPLACE FUNCTION public.merge_duplicate_expenses(p_keep_id uuid, p_remove_id uuid, p_sum boolean, p_expected_keep jsonb, p_expected_remove jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  kept public.expenses%ROWTYPE;
  removed public.expenses%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_keep_id IS NULL OR p_remove_id IS NULL OR p_keep_id = p_remove_id OR p_sum IS NULL OR p_expected_keep IS NULL OR p_expected_remove IS NULL THEN RAISE EXCEPTION 'Invalid merge request'; END IF;
  PERFORM id FROM public.expenses WHERE id IN (p_keep_id, p_remove_id) ORDER BY id FOR UPDATE;
  SELECT * INTO kept FROM public.expenses WHERE id = p_keep_id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense changed or unavailable; refresh before merging'; END IF;
  SELECT * INTO removed FROM public.expenses WHERE id = p_remove_id AND merged_into IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense changed or unavailable; refresh before merging'; END IF;
  IF NOT (to_jsonb(kept) @> p_expected_keep) OR NOT (to_jsonb(removed) @> p_expected_remove) THEN RAISE EXCEPTION 'Expense changed; refresh before merging'; END IF;
  UPDATE public.expenses SET amount = CASE WHEN p_sum THEN round(kept.amount + removed.amount, 2) ELSE kept.amount END,
    notes = concat_ws(E'\n', nullif(kept.notes, ''), 'איחוד ' || CASE WHEN p_sum THEN 'עם סכימה' ELSE 'ללא סכימה' END || ': ' || removed.description || ' | ' || removed.expense_date || ' | ' || removed.amount::text || ' | ' || coalesce(removed.vendor, '') || ' | ' || removed.id::text, nullif(removed.notes, ''))
  WHERE id = p_keep_id;
  UPDATE public.expenses SET merged_into = p_keep_id WHERE id = p_remove_id;
  RETURN p_keep_id;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_duplicate_expenses(uuid, uuid, boolean, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_expenses(uuid, uuid, boolean, jsonb, jsonb) TO authenticated;