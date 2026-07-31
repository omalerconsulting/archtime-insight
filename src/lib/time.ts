export const ABSENCE_TYPES = [
  { value: "vacation", label: "חופשה" },
  { value: "sick", label: "מחלה" },
  { value: "reserve", label: "מילואים" },
  { value: "travel", label: "נסיעת עבודה" },
  { value: "site_visit", label: "סיור בשטח" },
  { value: "holiday", label: "חג" },
  { value: "choice_day", label: "יום בחירה" },
  { value: "other", label: "היעדרות אחרת" },
] as const;

export function absenceLabel(value: string | null | undefined) {
  if (!value) return "";
  return ABSENCE_TYPES.find((a) => a.value === value)?.label ?? value;
}

export const PROJECT_STATUSES = [
  { value: "active", label: "פעיל" },
  { value: "closed", label: "פרויקט הסתיים" },
] as const;

export function projectStatusLabel(value: string) {
  if (value === "quote") return "בהצעת מחיר";
  if (value === "done") return "פרויקט הסתיים";
  return PROJECT_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function monthLabel(dateIso: string) {
  const [y, m] = dateIso.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
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

/** רשימת שנים דינמית – תמיד תומכת בשנה הנוכחית, בעבר ובשנים הבאות. */
export function yearOptions(backYears = 10, forwardYears = 5) {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + forwardYears; y >= current - backYears; y--) years.push(y);
  return years;
}

export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** מספר הימים מתחילת החודש העוקב שבהם עדיין ניתן לעדכן את תקופת הדיווח. */
export const REPORT_LOCK_DAYS = 5;

/** התאריך האחרון (כולל) שבו עובד רגיל יכול עדיין לעדכן את חודש הדיווח. */
export function periodLockDate(year: number, month: number) {
  return iso(new Date(Date.UTC(year, month + 1, REPORT_LOCK_DAYS)));
}

/** האם תקופת הדיווח (שנה/חודש) נעולה לעובד רגיל. מנהל תמיד יכול לערוך. */
export function isPeriodLocked(year: number, month: number, isAdmin = false, today = todayIso()) {
  if (isAdmin) return false;
  return today > periodLockDate(year, month);
}

/** האם תאריך מסוים (YYYY-MM-DD) נמצא בתקופה נעולה. */
export function isDateLocked(dateIso: string, isAdmin = false) {
  if (!dateIso) return false;
  const [y, m] = dateIso.split("-").map(Number);
  return isPeriodLocked(y, m - 1, isAdmin);
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

/** Normalize free text into 24h HH:MM:SS ("" when empty/invalid). Seconds default to 00. */
export function normalizeTime(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  let h: number, m: number, s: number;
  if (raw.includes(":")) {
    const [a, b, c] = raw.split(":");
    h = Number(a);
    m = Number(b ?? 0);
    s = Number(c ?? 0);
  } else if (digits.length <= 2) {
    h = Number(digits);
    m = 0;
    s = 0;
  } else {
    h = Number(digits.slice(0, digits.length - 4 > 0 ? 2 : digits.length - 2));
    m = Number(digits.slice(digits.length - 4 > 0 ? 2 : digits.length - 2, digits.length - 4 > 0 ? 4 : digits.length));
    s = digits.length > 4 ? Number(digits.slice(4, 6)) : 0;
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return "";
  if (h > 23 || m > 59 || s > 59 || h < 0 || m < 0 || s < 0) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export function fmtHours(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Progressive 24h mask: typing digits auto-inserts ":" → HH:MM:SS. */
export function maskTimeInput(value: string): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}:${d.slice(4)}`;
}

/** Progressive duration mask: digits auto-insert ":" → HH:MM. */
export function maskDurationInput(value: string): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** "H:MM" (or bare hours) → decimal hours. Seconds are ignored. */
export function durationToHours(value: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const [h, m] = raw.split(":");
  const hours = Number(h) || 0;
  const mins = Number((m ?? "").slice(0, 2)) || 0;
  return Math.round((hours + mins / 60) * 10000) / 10000;
}

/** Decimal hours → "HH:MM" (rounded to whole minutes, seconds ignored). */
export function hoursToDuration(n: number): string {
  const total = Math.round((Number(n) || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Compare two hour amounts at whole-minute resolution (seconds never count). */
export function hoursGap(a: number, b: number): number {
  return Math.abs(Math.round(a * 60) - Math.round(b * 60)) / 60;
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