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
  it("includes data beyond the former 200000-character cutoff and the last sheet in one payload", async () => {
    const book = XLSX.utils.book_new();
    const source = Array.from({ length: 2500 }, (_, i) => [`2026-10-20`, `תנועת בנק ${i} ${"פירוט מלא ".repeat(8)}`, i + 0.25]);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["תאריך", "תיאור", "חובה"], ...source]), "כל התנועות");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["עסקה אחרונה", 987.65]]), "גיליון אחרון");
    const text = await extractStatementExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    expect(text.length).toBeGreaterThan(200000);
    expect(text).toContain("תנועת בנק 2499");
    expect(text).toContain("2499.25");
    expect(text).toContain("גיליון: גיליון אחרון\nעסקה אחרונה\t987.65");
    expect(statementInputSchema.safeParse({ filename: "full.xlsx", mime: "text/plain", text }).success).toBe(true);
  });
  it("ignores formatting-only outer columns but preserves populated distant and hidden cells", async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["תיאור", "חובה"], ["תוכנה", 350.25]]);
    sheet.Z100 = { t: "n", v: 987.65 };
    sheet.AA100 = { t: "s", v: "" };
    sheet["!ref"] = "A1:AZ120";
    sheet["!rows"] = Array.from({ length: 100 }, (_, i) => ({ hidden: i === 99 }));
    XLSX.utils.book_append_sheet(book, sheet, "בנק");
    const text = await extractStatementExcel(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    expect(text).toContain("תוכנה\t350.25");
    expect(text).toContain("987.65");
    expect(text.length).toBeLessThan(200);
  });
});