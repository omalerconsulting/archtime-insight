export const EXPENSE_CATEGORIES = [
  { value: "salaries", label: "שכר עבודה" },
  { value: "payroll_costs", label: "נלוות שכר והפרשות מעסיק" },
  { value: "subcontractors", label: "קבלני משנה ויועצים" },
  { value: "rent", label: "שכירות ודמי ניהול" },
  { value: "utilities", label: "חשמל, מים וארנונה" },
  { value: "office", label: "אחזקה וניקיון המשרד" },
  { value: "supplies", label: "ציוד משרדי, הדפסות ומשלוחים" },
  { value: "software", label: "תוכנות, רישיונות ושירותי ענן" },
  { value: "communications", label: "טלפון ואינטרנט" },
  { value: "professional", label: "הנהלת חשבונות, משפטיות וייעוץ עסקי" },
  { value: "insurance", label: "ביטוחים ואחריות מקצועית" },
  { value: "marketing", label: "שיווק ופרסום" },
  { value: "travel", label: "נסיעות, רכב וחניה" },
  { value: "training", label: "השתלמויות וספרות מקצועית" },
  { value: "taxes", label: "אגרות ומסים עסקיים" },
  { value: "finance", label: "עמלות בנק והוצאות מימון" },
  { value: "depreciation", label: "פחת" },
  { value: "general", label: "הוצאות אחרות" },
];
export const catLabel = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label ?? v;
export type Expense = { id: string; category: string; description: string; vendor: string | null; amount: number; expense_date: string; is_recurring: boolean; recurring_until: string | null; notes: string | null; import_key?: string | null };
export type Bucket = "projectActual" | "projectForecast" | "otherActual" | "otherForecast" | "expenses";
export type LedgerDetail = { id: string; bucket: Bucket; date: string; description: string; party: string; amount: number; category?: string; expenseId?: string; recurring?: boolean };
type Milestone = { id: string; title: string; amount_type: string; amount_value: number; status: string; paid_amount: number; paid_date: string | null; due_date: string | null };
export type LedgerData = {
  projects: { id: string; code: string; name: string; fee_total: number }[];
  milestones: (Milestone & { project_id: string })[];
  commissions: { id: string; project_id: string; supplier_name: string; amount: number; paid_amount: number; paid_date: string | null; expected_date: string | null }[];
  incomes: { id: string; source: string; total_amount: number }[];
  incomeMs: (Milestone & { income_id: string })[];
  expenses: Expense[];
  adjustments: { month: string; income_override: number | null; expense_override: number | null; note: string | null }[];
};
export function expenseOccurs(e: Expense, key: string) {
  return e.is_recurring
    ? key >= e.expense_date.slice(0, 7) && (!e.recurring_until || `${key}-01` <= e.recurring_until)
    : key === e.expense_date.slice(0, 7);
}
export function buildLedger(data: LedgerData | undefined, year: number) {
  const rows = Array.from({ length: 12 }, (_, i) => ({ key: `${year}-${String(i + 1).padStart(2, "0")}`, projectActual: 0, projectForecast: 0, otherActual: 0, otherForecast: 0, expenses: 0, details: [] as LedgerDetail[] }));
  const byKey = new Map(rows.map(r => [r.key, r]));
  const add = (detail: LedgerDetail) => {
    const row = byKey.get(detail.date.slice(0, 7));
    if (!row || !detail.amount) return;
    row[detail.bucket] += detail.amount;
    row.details.push(detail);
  };
  if (data) {
    const payment = (m: Milestone, total: number, label: string, actual: Bucket, forecast: Bucket) => {
      const full = m.amount_type === "percent" ? Number(total) * Number(m.amount_value) / 100 : Number(m.amount_value);
      const paid = m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full);
      add({ id: `${m.id}-paid`, bucket: actual, date: m.paid_date || m.due_date || "", description: m.title, party: label, amount: paid });
      add({ id: `${m.id}-forecast`, bucket: forecast, date: m.due_date || "", description: m.title, party: label, amount: Math.max(0, full - paid) });
    };
    data.milestones.forEach(m => {
      const p = data.projects.find(p => p.id === m.project_id);
      if (p) payment(m, p.fee_total, `${p.code} · ${p.name}`, "projectActual", "projectForecast");
    });
    data.incomeMs.forEach(m => {
      const inc = data.incomes.find(i => i.id === m.income_id);
      if (inc) payment(m, inc.total_amount, inc.source, "otherActual", "otherForecast");
    });
    data.commissions.forEach(c => {
      const p = data.projects.find(p => p.id === c.project_id);
      const paid = Math.min(Number(c.paid_amount) || 0, Number(c.amount));
      const detail = { description: `עמלת ספק · ${c.supplier_name}`, party: p ? `${p.code} · ${p.name}` : "פרויקט", amount: paid };
      add({ ...detail, id: `${c.id}-paid`, bucket: "projectActual", date: c.paid_date || c.expected_date || "" });
      add({ ...detail, id: `${c.id}-forecast`, bucket: "projectForecast", date: c.expected_date || "", amount: Math.max(0, Number(c.amount) - paid) });
    });
    data.expenses.forEach(e => rows.forEach(r => {
      if (expenseOccurs(e, r.key)) add({ id: `${e.id}-${r.key}`, bucket: "expenses", date: e.is_recurring ? `${r.key}-${e.expense_date.slice(8, 10)}` : e.expense_date, description: e.description, party: e.vendor || "—", amount: Number(e.amount), category: e.category, expenseId: e.id, recurring: e.is_recurring });
    }));
  }
  return rows.map(r => {
    const a = data?.adjustments.find(a => a.month === `${r.key}-01`);
    const sourceIncome = r.projectActual + r.projectForecast + r.otherActual + r.otherForecast;
    const income = a?.income_override != null ? Number(a.income_override) : sourceIncome;
    const totalExpenses = a?.expense_override != null ? Number(a.expense_override) : r.expenses;
    return { ...r, sourceIncome, income, totalExpenses, profit: income - totalExpenses, incomeDelta: income - sourceIncome, expenseDelta: totalExpenses - r.expenses, note: a?.note ?? "", overridden: a?.income_override != null || a?.expense_override != null };
  });
}
export type LedgerMonth = ReturnType<typeof buildLedger>[number];
export function expenseAlerts(expenses: Expense[], year: number, today: string) {
  const messages: { key: string; month: string; text: string }[] = [];
  const sum = (key: string, cat?: string) => expenses.filter(e => expenseOccurs(e, key) && (!cat || e.category === cat)).reduce((s, e) => s + Number(e.amount), 0);
  // Only completed months: a month still in progress is not comparable to a full month.
  for (let i = 1; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2, "0")}`;
    if (key >= today.slice(0, 7)) continue;
    if (!expenses.some(e => e.expense_date.slice(0, 7) <= key)) continue;
    for (const cat of ["rent", "salaries"]) if (sum(key, cat) === 0) messages.push({ key: `${key}-${cat}`, month: key, text: `ייתכן שחסרה הוצאת ${catLabel(cat)}` });
    const previous = i === 1 ? `${year - 1}-12` : `${year}-${String(i - 1).padStart(2, "0")}`;
    const before = sum(previous), now = sum(key);
    if (before > 0 && Math.abs(now - before) / before >= 0.3) messages.push({ key: `${key}-variance`, month: key, text: `ההוצאות ${now > before ? "עלו" : "ירדו"} ב־${Math.round(Math.abs(now - before) / before * 100)}% לעומת החודש הקודם` });
  }
  return messages;
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}