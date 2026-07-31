ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_milestones ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  vendor text,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT current_date,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_until date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_admin_all ON public.expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER expenses_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.other_incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT '',
  client_name text,
  category text NOT NULL DEFAULT 'commission',
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_incomes TO authenticated;
GRANT ALL ON public.other_incomes TO service_role;
ALTER TABLE public.other_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY other_incomes_admin_all ON public.other_incomes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER other_incomes_touch BEFORE UPDATE ON public.other_incomes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.other_income_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL REFERENCES public.other_incomes(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  amount_type text NOT NULL DEFAULT 'percent',
  amount_value numeric NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  paid_amount numeric NOT NULL DEFAULT 0,
  paid_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_income_milestones TO authenticated;
GRANT ALL ON public.other_income_milestones TO service_role;
ALTER TABLE public.other_income_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY other_income_milestones_admin_all ON public.other_income_milestones FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER other_income_milestones_touch BEFORE UPDATE ON public.other_income_milestones FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.pnl_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  income_override numeric,
  expense_override numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pnl_adjustments TO authenticated;
GRANT ALL ON public.pnl_adjustments TO service_role;
ALTER TABLE public.pnl_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pnl_adjustments_admin_all ON public.pnl_adjustments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER pnl_adjustments_touch BEFORE UPDATE ON public.pnl_adjustments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();