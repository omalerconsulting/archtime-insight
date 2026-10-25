export function expenseSource(expense: { import_key?: string | null }) {
  return expense.import_key?.trim() ? "automatic" : "manual";
}

export function expenseSourceLabel(expense: { import_key?: string | null }) {
  return expenseSource(expense) === "automatic" ? "אוטומטי" : "ידני";
}