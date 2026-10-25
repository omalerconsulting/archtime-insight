import { z } from "zod";

export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
// Resource guard, not a row/month limit. Upstream model capacity can still reject a full document.
export const STATEMENT_MAX_TEXT = 10 * 1024 * 1024;
const filename = z.string().trim().min(1).max(250);
export const statementInputSchema = z.union([
  z.object({ filename, mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]), base64: z.string().min(1).max(14000000) }),
  z.object({ filename, mime: z.literal("text/plain"), text: z.string().trim().min(1).max(STATEMENT_MAX_TEXT) }),
]);
export type StatementInput = z.infer<typeof statementInputSchema>;

export function statementFileKind(file: { name: string; type: string }): "excel" | "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | null {
  if (/\.xlsx?$/i.test(file.name)) return "excel";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "application/pdf";
  if (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp") return file.type;
  return null;
}

export async function extractStatementExcel(bytes: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: false, cellHTML: false, cellText: true });
  const sections: string[] = [];
  let length = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    // Ignore formatting-only outer ranges, but retain every actual value (including hidden cells).
    let firstRow = Infinity, firstCol = Infinity, lastRow = -1, lastCol = -1;
    for (const address of Object.keys(sheet)) {
      if (address.startsWith("!")) continue;
      const cell = sheet[address];
      if (!cell || cell.v === undefined || cell.v === null || cell.v === "") continue;
      const position = XLSX.utils.decode_cell(address);
      firstRow = Math.min(firstRow, position.r); firstCol = Math.min(firstCol, position.c);
      lastRow = Math.max(lastRow, position.r); lastCol = Math.max(lastCol, position.c);
    }
    if (lastRow < 0) continue;
    // SheetJS 0.18's CSV exporter reads !ref rather than an options.range; use an immutable view.
    const populatedSheet = { ...sheet, "!ref": XLSX.utils.encode_range({ s: { r: firstRow, c: firstCol }, e: { r: lastRow, c: lastCol } }) };
    const content = XLSX.utils.sheet_to_csv(populatedSheet, { FS: "\t", RS: "\n", blankrows: false, dateNF: "yyyy-mm-dd", strip: true });
    if (!content.replace(/[\s\t]/g, "")) continue;
    const section = `גיליון: ${name}\n${content}`;
    length += section.length + 2;
    if (length > STATEMENT_MAX_TEXT) throw new Error("תוכן הקובץ חורג מקיבולת הסריקה הנוכחית. המסמך לא נסרק ולא נשמרו ממנו הוצאות; לא בוצעה סריקה חלקית.");
    sections.push(section);
  }
  if (!sections.length) throw new Error("לא נמצאו נתונים בגיליונות ה־Excel; בדקו שהקובץ אינו ריק או מוגן בסיסמה.");
  return sections.join("\n\n");
}