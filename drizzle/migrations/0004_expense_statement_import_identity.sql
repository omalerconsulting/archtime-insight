ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS import_key text;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_import_key_unique ON public.expenses (import_key) WHERE import_key IS NOT NULL;
COMMENT ON COLUMN public.expenses.import_key IS 'Stable statement transaction fingerprint to prevent repeated import of the same uploaded document row.';