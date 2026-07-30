export const ABSENCE_TYPES = [
  { value: "vacation", label: "חופשה" },
  { value: "sick", label: "מחלה" },
  { value: "reserve", label: "מילואים" },
  { value: "travel", label: "נסיעת עבודה" },
  { value: "holiday", label: "חג" },
  { value: "choice_day", label: "יום בחירה" },
  { value: "other", label: "היעדרות אחרת" },
] as const;

export function absenceLabel(value: string | null | undefined) {
  if (!value) return "";
  return ABSENCE_TYPES.find((a) => a.value === value)?.label ?? value;
}

export const MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Hours between two "HH:MM" strings, minus break minutes. Handles overnight shifts. */
export function computeHours(
  clockIn: string | null,
  clockOut: string | null,
  breakMinutes = 0,
): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  let minutes = outH * 60 + outM - (inH * 60 + inM);
  if (minutes < 0) minutes += 24 * 60;
  minutes -= breakMinutes || 0;
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
}

/**
 * Israeli overtime split (חוק שעות עבודה ומנוחה):
 * first `standard` hours regular, next 2 hours at 125%, remainder at 150%.
 */
export function splitOvertime(hours: number, standard = 8.6) {
  const regular = Math.min(hours, standard);
  const over = Math.max(0, hours - standard);
  const ot125 = Math.min(over, 2);
  const ot150 = Math.max(0, over - 2);
  return { regular, ot125, ot150 };
}

export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: iso(start), end: iso(end), days: end.getUTCDate() };
}

export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function fmtHours(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtMoney(n: number) {
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

export function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function weekdayOf(dateIso: string) {
  return WEEKDAYS[new Date(`${dateIso}T00:00:00`).getDay()];
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

/** Milestone value in shekels given the project total fee. */
export function milestoneAmount(
  amountType: string,
  amountValue: number,
  feeTotal: number,
): number {
  return amountType === "percent" ? (feeTotal * amountValue) / 100 : amountValue;
}