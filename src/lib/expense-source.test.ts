import { describe, it, expect } from "vitest";
import { expenseSource } from "./expense-source";

describe("expense entry source", () => {
  it("classifies approved scanned entries with document fingerprints as automatic", () => {
    expect(expenseSource({ import_key: "document-sha256:0" })).toBe("automatic");
  });
  it("classifies directly entered expenses without fingerprints as manual", () => {
    expect(expenseSource({ import_key: null })).toBe("manual");
    expect(expenseSource({})).toBe("manual");
  });
  it("preserves the scanned origin even when the description or notes are corrected", () => {
    const scanned = { import_key: "document-sha256:1", notes: "סריקת מסמך: statement.pdf" };
    expect(expenseSource({ ...scanned, notes: "הערות מתוקנות" })).toBe("automatic");
  });
});