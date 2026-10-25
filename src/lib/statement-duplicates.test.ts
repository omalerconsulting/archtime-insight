import { describe, expect, it } from "vitest";
import { checkScanDuplicates, scanNeedsDecision, type ScanExpense, type StoredScanExpense } from "./statement-duplicates";

const scanned: ScanExpense = { importKey: "second:0", description: "שירות תוכנה", vendor: "ספק א", amount: 350, expense_date: "2026-10-20", category: "software", is_recurring: false, recurring_until: null };
const existing: StoredScanExpense = { ...scanned, id: "manual", import_key: null, notes: null };

describe("new statement duplicate checks", () => {
  it("compares both manual and earlier scanned expenses, regardless of input order", () => {
    const earlierScan = { ...existing, id: "earlier", import_key: "first:0" };
    expect(checkScanDuplicates(scanned, [existing, earlierScan]).matches.map(e => e.id)).toEqual(["manual", "earlier"]);
  });
  it("requires an explicit decision for each suspected duplicate", () => {
    const check = checkScanDuplicates(scanned, [existing]);
    expect(scanNeedsDecision(check, "", "")).toBe(true);
    expect(scanNeedsDecision(check, "add", check.fingerprint)).toBe(false);
  });
  it("requires fresh review if a new stored duplicate appears before save", () => {
    const before = checkScanDuplicates(scanned, [existing]);
    const after = checkScanDuplicates(scanned, [existing, { ...existing, id: "new" }]);
    expect(scanNeedsDecision(after, "add", before.fingerprint)).toBe(true);
  });
  it("checks fixed expenses against the new scan month", () => {
    expect(checkScanDuplicates(scanned, [{ ...existing, expense_date: "2026-01-31", is_recurring: true }]).matches).toHaveLength(1);
  });
  it("does not treat a different-date one-time expense as a duplicate", () => {
    expect(checkScanDuplicates(scanned, [{ ...existing, expense_date: "2026-09-20" }]).matches).toHaveLength(0);
  });
  it("blocks exact repeat imports even when the original was absorbed in a merge", () => {
    const check = checkScanDuplicates(scanned, [{ ...existing, import_key: "second:0", merged_into: "survivor" }]);
    expect(check.blocked).toBe(true);
    expect(scanNeedsDecision(check, "add", check.fingerprint)).toBe(true);
  });
  it("checks duplicates within the same new scan", () => {
    expect(checkScanDuplicates(scanned, [], [{ ...scanned, importKey: "second:1" }]).matches).toHaveLength(1);
  });
  it("invalidates review after editing matching fields", () => {
    const before = checkScanDuplicates(scanned, [existing]);
    const after = checkScanDuplicates({ ...scanned, category: "other" }, [existing]);
    expect(scanNeedsDecision(after, "add", before.fingerprint)).toBe(true);
  });
});