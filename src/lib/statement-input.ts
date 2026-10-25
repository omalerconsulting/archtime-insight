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
    const content = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n", blankrows: false, dateNF: "yyyy-mm-dd" });
    if (!content.replace(/[\s\t]/g, "")) continue;
    const section = `גיליון: ${name}\n${content}`;
    length += section.length + 2;
    if (length > STATEMENT_MAX_TEXT) throw new Error("תוכן הקובץ חורג מקיבולת הסריקה הנוכחית. המסמך לא נסרק ולא נשמרו ממנו הוצאות; לא בוצעה סריקה חלקית.");
    sections.push(section);
  }
  if (!sections.length) throw new Error("לא נמצאו נתונים בגיליונות ה־Excel; בדקו שהקובץ אינו ריק או מוגן בסיסמה.");
  return sections.join("\n\n");
}