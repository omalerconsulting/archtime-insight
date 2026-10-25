import { describe, expect, it } from "vitest";
import { sourceTextMatches, statementResultSchema } from "./statement-source";

describe("original statement evidence", () => {
  it("retains the original transaction wording, formatted amount and sheet location separately from corrections", () => {
    const original = "13/10/2026\tדלק תחנת איילון\t480.85\tאסמכתא 123456";
    const parsed = statementResultSchema.parse({ rows: [{ description: "דלק", vendor: "איילון", amount: 480.85, expense_date: "2026-10-13", category: "travel", warning: "", original_text: original, source_location: "גיליון בנק, שורה 2" }], warnings: [] });
    const edited = { ...parsed.rows[0], description: "תיאור מתוקן", amount: 400 };
    expect(edited.original_text).toBe(original);
    expect(edited.source_location).toBe("גיליון בנק, שורה 2");
    expect(edited.amount).toBe(400);
  });
  it("checks original Excel wording without treating paraphrases or changed amounts as source text", () => {
    const document = "תאריך\tתיאור\tסכום\n13/10/2026\tדלק תחנת איילון\t480.85";
    expect(sourceTextMatches("13/10/2026 דלק תחנת איילון 480.85", document)).toBe(true);
    expect(sourceTextMatches("13/10/2026 הוצאות דלק 480.85", document)).toBe(false);
    expect(sourceTextMatches("13/10/2026 דלק תחנת איילון 400", document)).toBe(false);
    expect(sourceTextMatches("", document)).toBe(false);
  });
});