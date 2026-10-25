import type { Expense } from "./pnl-ledger";

export function mergedExpenseAmount(kept: Expense, other: Expense, sum: boolean) {
  if (kept.id === other.id) throw new Error("יש לבחור שתי הוצאות שונות");
  if (!Number.isFinite(Number(kept.amount)) || !Number.isFinite(Number(other.amount))) throw new Error("סכום לא תקין");
  return sum ? Math.round((Number(kept.amount) + Number(other.amount)) * 100) / 100 : Number(kept.amount);
}