import { findDuplicates } from "./finance-review";
import type { Expense } from "./pnl-ledger";

export type StoredScanExpense = Expense & { merged_into?: string | null };
export type ScanExpense = Omit<Expense, "id" | "notes" | "import_key"> & { importKey: string };
export type ScanDuplicateCheck = { blocked: boolean; matches: Expense[]; fingerprint: string };
export const DEFAULT_SCAN_DUPLICATE_DECISION = "add" as const;

export function approveSelectedScanDuplicates<T extends ScanExpense & { selected: boolean; decision: "add" | "skip" | ""; reviewedFingerprint: string }>(rows: T[], stored: StoredScanExpense[]): T[] {
  const peers = rows.filter(row => row.selected && row.decision !== "skip");
  return rows.map(row => {
    const check = checkScanDuplicates(row, stored, peers);
    if (!row.selected || row.decision === "skip" || check.blocked || !check.matches.length) return row;
    return { ...row, decision: DEFAULT_SCAN_DUPLICATE_DECISION, reviewedFingerprint: check.fingerprint };
  });
}

export function checkScanDuplicates(row: ScanExpense, stored: StoredScanExpense[], peers: ScanExpense[] = []): ScanDuplicateCheck {
  const candidate: Expense = { ...row, id: `scan:${row.importKey}`, import_key: row.importKey, notes: null };
  const blocked = stored.some(e => e.import_key === row.importKey);
  const others: Expense[] = [
    ...stored.filter(e => !e.merged_into),
    ...peers.filter(e => e.importKey !== row.importKey).map(e => ({ ...e, id: `scan:${e.importKey}`, notes: null })),
  ];
  const matches = others.filter(e => findDuplicates([candidate, e], []).length > 0);
  const signature = (e: Expense) => [e.id, e.amount, e.expense_date, e.description, e.vendor, e.category, e.is_recurring, e.recurring_until];
  return { blocked, matches, fingerprint: JSON.stringify([blocked, signature(candidate), matches.map(signature).sort((a,b) => String(a[0]).localeCompare(String(b[0])))]) };
}

export function scanNeedsDecision(check: ScanDuplicateCheck, decision: "add" | "skip" | "", reviewedFingerprint: string): boolean {
  return check.blocked || (check.matches.length > 0 && (decision !== "add" || reviewedFingerprint !== check.fingerprint));
}