import { expenseOccurs, type Expense } from "./pnl-ledger";

export type ReviewIncome = { id: string; source: string; client_name: string | null; total_amount: number };
export type DuplicatePair = { key: string; kind: "expense" | "income"; firstId: string; secondId: string; first: string; second: string; amount: number; reason: string };
const normalize = (value: string | null) => (value || "").normalize("NFKC").toLocaleLowerCase("he").replace(/[\s\p{P}]+/gu, "");
const same = (a: string | null, b: string | null) => !!normalize(a) && normalize(a) === normalize(b);
const money = (n: number) => Math.round(Number(n) * 100);
export function findDuplicates(expenses: Expense[], incomes: ReviewIncome[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const add = (kind: DuplicatePair["kind"], a: { id: string }, b: { id: string }, first: string, second: string, amount: number, reason: string, signature: unknown) => {
    pairs.push({ key: JSON.stringify([kind, ...[a.id, b.id].sort(), signature]), kind, firstId: a.id, secondId: b.id, first, second, amount, reason });
  };
  expenses.forEach((a, i) => expenses.slice(i + 1).forEach(b => {
    const dateOverlap = a.is_recurring && b.is_recurring
      ? expenseOccurs(a, [a.expense_date, b.expense_date].sort()[1].slice(0, 7)) && expenseOccurs(b, [a.expense_date, b.expense_date].sort()[1].slice(0, 7))
      : a.is_recurring ? expenseOccurs(a, b.expense_date.slice(0, 7)) : b.is_recurring ? expenseOccurs(b, a.expense_date.slice(0, 7)) : a.expense_date === b.expense_date;
    if (dateOverlap && money(a.amount) === money(b.amount) && (same(a.vendor, b.vendor) || same(a.description, b.description))) {
      add("expense", a, b, `${a.description} · ${a.expense_date}`, `${b.description} · ${b.expense_date}`, a.amount, a.is_recurring || b.is_recurring ? "חפיפה עם הוצאה קבועה באותו חודש" : "סכום ותאריך זהים, וספק או תיאור תואמים", [a, b].sort((x,y) => x.id.localeCompare(y.id)).map(e => [e.amount, e.expense_date, e.description, e.vendor, e.is_recurring, e.recurring_until]));
    }
  }));
  incomes.forEach((a,i) => incomes.slice(i+1).forEach(b => {
    if (money(a.total_amount) === money(b.total_amount) && same(a.source,b.source) && (same(a.client_name,b.client_name) || (!a.client_name && !b.client_name))) add("income", a,b,a.source,b.source,a.total_amount,"מקור, לקוח וסכום זהים", [a,b].sort((x,y)=>x.id.localeCompare(y.id)).map(e=>[e.source,e.client_name,e.total_amount]));
  }));
  return pairs;
}
export function suggestRecurring(category: string, vendor: string, expenses: Expense[]) {
  const existing = expenses.find(e => same(e.vendor, vendor) && e.category === category);
  return existing ? existing.is_recurring : ["rent", "communications", "software", "insurance", "professional"].includes(category);
}