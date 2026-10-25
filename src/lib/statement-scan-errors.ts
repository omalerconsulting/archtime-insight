type ScanFailure = { status: number; type: string; message: string };

/** Never classify service failures as evidence that the uploaded document is unreadable. */
export function statementScanFailure(error: unknown): ScanFailure {
  let current = error;
  let status = 0;
  let body: Record<string, unknown> = {};
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("statusCode" in current && Number(current.statusCode)) {
      status = Number(current.statusCode);
      if ("responseBody" in current && typeof current.responseBody === "string") {
        try {
          const parsed: unknown = JSON.parse(current.responseBody);
          if (typeof parsed === "object" && parsed !== null) body = parsed as Record<string, unknown>;
        } catch { /* A non-JSON response is not a safe user-facing message. */ }
      }
      break;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  const details = typeof body.error === "object" && body.error !== null ? body.error as Record<string, unknown> : body;
  const type = typeof details.type === "string" ? details.type : typeof body.type === "string" ? body.type : "";
  const safeMessage = typeof details.message === "string" ? details.message.trim() : typeof body.message === "string" ? body.message.trim() : "";
  const creditLimit = /credit_hard_block_workspace|credit_limit_reached/.test(type);
  const message = status === 403 && creditLimit
    ? "הסריקה נעצרה כי הגעתם למגבלת השימוש ב־Lovable AI של סביבת העבודה. מנהל סביבת העבודה צריך להעלות את מגבלת ה־AI בהגדרות. זו אינה תקלה בקריאות הקובץ."
    : status === 402 ? "אין מספיק יתרת Lovable AI לסריקה; יש להסדיר את היתרה לפני סריקה נוספת."
    : status === 403 ? "שירות ה־AI חסם את הסריקה; נדרש להסדיר את הגישה לפני סריקה נוספת. זו אינה תקלה בקריאות הקובץ."
    : status === 401 ? "שירות הסריקה אינו מוגדר כראוי. נדרש תיקון הגדרות השירות."
    : status === 429 ? "שירות הסריקה עמוס. נסו שוב מאוחר יותר."
    : status === 404 ? "שירות סריקת המסמכים אינו זמין כרגע."
    : status === 400 || status === 413 ? "שירות הסריקה לא קיבל את המסמך המלא — ייתכן שתוכנו חורג מקיבולת השירות או שהפורמט אינו נתמך. לא בוצעה סריקה חלקית."
    : status >= 500 ? "אירעה תקלה בשירות הסריקה. נסו שוב מאוחר יותר."
    : "סריקת המסמך לא הושלמה או שתוצאת הסריקה לא התקבלה במלואה. אין בכך הוכחה שהקובץ אינו קריא.";
  return { status, type, message: [message, safeMessage, "לא נשמרו הוצאות מהמסמך."].filter(Boolean).join(" ") };
}