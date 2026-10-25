import { describe, it, expect } from "vitest";
import { mergedExpenseAmount } from "./expense-merge";
import type { Expense } from "./pnl-ledger";

const first: Expense = { id: "first", amount: 100.25, category: "general", description: "expense", vendor: null, expense_date: "2026-10-25", is_recurring: false, recurring_until: null, notes: null };
const second = { ...first, id: "second", amount: 200.50 };
describe("expense duplicate merge", () => {
  it("sums both expenses into a single amount when requested", () => {
    expect(mergedExpenseAmount(first, second, true)).toBe(300.75);
  });
  it("keeps only the selected expense amount without summation", () => {
    expect(mergedExpenseAmount(first, second, false)).toBe(100.25);
    expect(mergedExpenseAmount(second, first, false)).toBe(200.50);
  });
  it("does not allow merging an expense with itself", () => {
    expect(() => mergedExpenseAmount(first, first, true)).toThrow();
  });
});