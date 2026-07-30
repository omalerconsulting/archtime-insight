/**
 * לוח החגים והמועדים בישראל – מחושב אוטומטית מהלוח העברי (Intl),
 * ולכן תקף לכל שנה, ללא הגבלה.
 */

export type HolidayKind = "rest" | "eve" | "memorial" | "special";

export type HolidayInfo = {
  name: string;
  kind: HolidayKind;
  /** יום מנוחה על פי חוק (צביעה בצהוב בהיר בדוחות) */
  restDay: boolean;
};

const hebFmt = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function utc(dateIso: string) {
  return new Date(`${dateIso}T12:00:00Z`);
}

function shift(dateIso: string, days: number) {
  const d = utc(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hebrewOf(dateIso: string) {
  const parts = hebFmt.formatToParts(utc(dateIso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: Number(get("day")), month: get("month"), year: get("year") };
}

/** יום בשבוע (0=ראשון) של תאריך לועזי */
function dow(dateIso: string) {
  return utc(dateIso).getUTCDay();
}

/** יום העצמאות הנדחה – מחושב מתאריך ה׳ באייר של אותה שנה */
function independenceObserved(iyar5Iso: string) {
  const w = dow(iyar5Iso);
  if (w === 5) return shift(iyar5Iso, -1); // שישי → חמישי
  if (w === 6) return shift(iyar5Iso, -2); // שבת → חמישי
  if (w === 1) return shift(iyar5Iso, 1); // שני → שלישי
  return iyar5Iso;
}

function holocaustObserved(nisan27Iso: string) {
  const w = dow(nisan27Iso);
  if (w === 5) return shift(nisan27Iso, -1); // שישי → חמישי
  if (w === 0) return shift(nisan27Iso, 1); // ראשון → שני
  return nisan27Iso;
}

function chanukahDay(dateIso: string): number | null {
  for (let back = 0; back < 8; back++) {
    const h = hebrewOf(shift(dateIso, -back));
    if (h.month === "Kislev" && h.day === 25) return back + 1;
  }
  return null;
}

const REST: HolidayKind = "rest";

/** מחזיר את פרטי החג/המועד של תאריך לועזי (YYYY-MM-DD), או null. */
export function holidayFor(dateIso: string): HolidayInfo | null {
  const { day, month } = hebrewOf(dateIso);
  const adar = month === "Adar" || month === "Adar II";

  const make = (name: string, kind: HolidayKind = "special"): HolidayInfo => ({
    name,
    kind,
    restDay: kind === REST,
  });

  if (month === "Tishri") {
    if (day === 1) return make("ראש השנה – יום א׳", REST);
    if (day === 2) return make("ראש השנה – יום ב׳", REST);
    if (day === 3) return make("צום גדליה", "memorial");
    if (day === 9) return make("ערב יום כיפור", "eve");
    if (day === 10) return make("יום הכיפורים", REST);
    if (day === 14) return make("ערב סוכות", "eve");
    if (day === 15) return make("סוכות – יום א׳", REST);
    if (day >= 16 && day <= 20) return make("חול המועד סוכות");
    if (day === 21) return make("הושענא רבה / ערב שמחת תורה", "eve");
    if (day === 22) return make("שמיני עצרת ושמחת תורה", REST);
  }

  const chan = chanukahDay(dateIso);
  if (chan) return make(`חנוכה – נר ${chan}`);

  if (month === "Tevet" && day === 10) return make("צום עשרה בטבת", "memorial");
  if (month === "Shevat" && day === 15) return make("ט״ו בשבט");

  if (adar) {
    if (day === 13) return make("תענית אסתר", "memorial");
    if (day === 14) return make("פורים");
    if (day === 15) return make("שושן פורים");
  }

  if (month === "Nisan") {
    if (day === 14) return make("ערב פסח", "eve");
    if (day === 15) return make("פסח – יום א׳", REST);
    if (day >= 16 && day <= 20) return make("חול המועד פסח");
    if (day === 21) return make("שביעי של פסח", REST);
    if (day >= 25 && day <= 29) {
      const nisan27 = shift(dateIso, 27 - day);
      if (holocaustObserved(nisan27) === dateIso) return make("יום הזיכרון לשואה ולגבורה", "memorial");
    }
  }

  if (month === "Iyar" && day >= 2 && day <= 8) {
    const iyar5 = shift(dateIso, 5 - day);
    const independence = independenceObserved(iyar5);
    if (independence === dateIso) return make("יום העצמאות", REST);
    if (shift(independence, -1) === dateIso)
      return make("יום הזיכרון לחללי מערכות ישראל", "memorial");
  }
  if (month === "Iyar" && day === 18) return make("ל״ג בעומר");
  if (month === "Iyar" && day === 28) return make("יום ירושלים");

  if (month === "Sivan" && day === 5) return make("ערב שבועות", "eve");
  if (month === "Sivan" && day === 6) return make("שבועות", REST);

  if (month === "Tammuz" && day === 17) return make("צום שבעה עשר בתמוז", "memorial");
  if (month === "Av" && day === 9) return make("תשעה באב", "memorial");
  if (month === "Av" && day === 15) return make("ט״ו באב");
  if (month === "Elul" && day === 29) return make("ערב ראש השנה", "eve");

  return null;
}

/** מפת חגים לטווח תאריכים (כולל) */
export function holidayMap(startIso: string, endIso: string) {
  const map = new Map<string, HolidayInfo>();
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso && guard++ < 400) {
    const h = holidayFor(cur);
    if (h) map.set(cur, h);
    cur = shift(cur, 1);
  }
  return map;
}
