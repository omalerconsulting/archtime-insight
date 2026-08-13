/** Excel/CSV helpers for project import (browser only — loaded lazily). */
import { parseCsv } from "@/lib/csv";

export const TEMPLATE_HEADERS = [
  "קוד",
  "שם הפרויקט",
  "לקוח",
  "שכר טרחה",
  "תקציב שעות",
  "תאריך התחלה",
  "הערות",
];

const TEMPLATE_ROWS: Array<Array<string | number>> = [
  ["1024", "וילה כרמל", "משפחת לוי", 350000, 900, "2026-01-15", "היתר בנייה בהליך"],
  ["1025", "מגדל אלון", 'אלון ייזום בע"מ', 1250000, 3200, "2026-02-01", ""],
  ["1026", "שיפוץ משרדים רוטשילד", "כלל ביטוח", 180000, 400, "2026-03-10", "כולל תכנון פנים"],
];

/** Downloads a ready-to-fill .xlsx template with an example + instructions sheet. */
export async function downloadProjectsTemplate() {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "פרויקטים");

  const notes = XLSX.utils.aoa_to_sheet([
    ["הוראות מילוי גליון ייבוא פרויקטים"],
    [""],
    ["עמודה", "חובה?", "הסבר"],
    ["קוד", "חובה", "מספר הפרויקט במשרד. קוד קיים במערכת יעודכן ולא ייווצר כפול."],
    ["שם הפרויקט", "חובה", "שם הפרויקט כפי שיוצג במערכת."],
    ["לקוח", "רשות", "שם הלקוח / היזם."],
    ["שכר טרחה", "רשות", "סכום בשקלים, מספר בלבד (ללא ₪ ופסיקים)."],
    ["תקציב שעות", "רשות", "מספר שעות מתוכנן לפרויקט."],
    ["תאריך התחלה", "רשות", "בפורמט YYYY-MM-DD, למשל 2026-01-15."],
    ["הערות", "רשות", "טקסט חופשי."],
    [""],
    ["שורה 1 היא שורת כותרות – אין למחוק אותה."],
    ["את שורות הדוגמה יש להחליף בנתונים שלכם."],
    ["שלבי תשלום מוגדרים במערכת לאחר הייבוא, בכרטיס הפרויקט."],
  ]);
  notes["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, notes, "הוראות");

  XLSX.writeFile(wb, "תבנית-ייבוא-פרויקטים.xlsx");
}

/** Reads an .xlsx/.xls/.csv file into rows of string cells. */
export async function readSheetRows(file: File): Promise<string[][]> {
  const isExcel = /\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name);
  if (!isExcel) {
    const text = await file.text();
    return parseCsv(text);
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.trim() !== "הוראות") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: true });
  return raw.map((row) =>
    (row ?? []).map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (cell instanceof Date) {
        const y = cell.getFullYear();
        const m = String(cell.getMonth() + 1).padStart(2, "0");
        const d = String(cell.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(cell).trim();
    }),
  );
}