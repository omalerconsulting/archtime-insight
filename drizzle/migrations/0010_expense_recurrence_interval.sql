ALTER TABLE public.expenses ADD COLUMN recurring_every_months integer NOT NULL DEFAULT 1;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_recurring_every_months_positive CHECK (recurring_every_months >= 1);
COMMENT ON COLUMN public.expenses.recurring_every_months IS 'Number of months between recurring charges, anchored to expense_date; existing expenses remain monthly.';