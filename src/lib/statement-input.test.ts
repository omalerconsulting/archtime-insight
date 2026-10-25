import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractStatementExcel, statementFileKind, statementInputSchema } from "./statement-input";

describe("bank and accountant statement formats", () => {
  it("accepts XLSX and XLS even when the browser MIME is empty", () => {
    expect(statementFileKind({ name: "bank.xlsx", type: "" })).toBe("excel");
    expect(statementFileKind({ name: "accountant.XLS", type: "application/octet-stream" })).toBe("excel");
  });
  it("retains PDF support even with a missing MIME", () => {
    expect(statementFileKind({ name: "bank.pdf", type: "" })).toBe("application/pdf");
    expect(statementInputSchema.safeParse({ filename: "bank.pdf", mime: "application/pdf", base64: "JVBERg==" }).success).toBe(true);
  });
  for (const bookType of ["xlsx", "xls"] as const) {
    it(`reads all ${bookType} sheets including debit/credit columns and exact amounts`, async () => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["תאריך", "תיאור", "חובה", "זכות"], ["2026-10-20", "תוכנה", 350.25, ""]]), "בנק");
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["תאריך", "ספק", "סכום"], ["2026-10-21", "רו״ח", 900]]), "רואה חשבון");
      const text = await extractStatementExcel(XLSX.write(book, { type: "array", bookType }));
      expect(text).toContain("350.25");
      expect(text).toContain("חובה\tזכות");
      expect(text).toContain("2026-10-20");
      expect(text).toContain("גיליון: רואה חשבון");
      expect(text).toContain("900");
    });
  }
  it("rejects empty spreadsheets instead of scanning invented rows", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "empty");
    await expect(extractStatementExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }))).rejects.toThrow("לא נמצאו נתונים");
  });
  it("validates spreadsheet text and rejects an empty payload server-side", () => {
    expect(statementInputSchema.safeParse({ filename: "bank.xlsx", mime: "text/plain", text: "תאריך\tחובה\n2026-10-20\t350" }).success).toBe(true);
    expect(statementInputSchema.safeParse({ filename: "bank.xlsx", mime: "text/plain", text: " " }).success).toBe(false);
  });
});