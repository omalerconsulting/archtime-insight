import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/accessibility")({
  head: () => ({
    meta: [
      { title: "הצהרת נגישות | ניהול שעות ופרויקטים" },
      { name: "description", content: "הצהרת הנגישות של מערכת ניהול השעות והפרויקטים." },
    ],
  }),
  component: AccessibilityStatement,
});

function AccessibilityStatement() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold">הצהרת נגישות</h1>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed">
        <p>
          אנו רואים חשיבות רבה במתן שירות שוויוני לכלל המשתמשים ובשיפור נגישות המערכת לאנשים עם
          מוגבלות, בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח‑1998, ולתקנות שוויון זכויות
          לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע״ג‑2013.
        </p>

        <h2 className="text-base font-semibold">התאמות הנגישות במערכת</h2>
        <p>
          המערכת פותחה בשאיפה לעמידה בהנחיות הנגישות WCAG 2.1 ברמה AA ובתקן הישראלי ת״י 5568. בין
          ההתאמות הקיימות: תמיכה מלאה בניווט מקלדת, תיאורי ARIA לרכיבים אינטראקטיביים, ניגודיות
          צבעים תקינה, תוסף נגישות מובנה המאפשר הגדלת גופן, ניגודיות גבוהה, גווני אפור, הדגשת
          קישורים, סמן מוגדל וביטול אנימציות, וכן תמיכה במצב תצוגה כהה.
        </p>

        <h2 className="text-base font-semibold">שימוש בתוסף הנגישות</h2>
        <p>
          בכל עמוד במערכת מופיע כפתור הנגישות. לחיצה עליו פותחת תפריט שבו ניתן להתאים את התצוגה
          לצרכים האישיים. ההגדרות נשמרות בדפדפן וחלות על כל העמודים.
        </p>

        <h2 className="text-base font-semibold">רכז/ת הנגישות</h2>
        <p>
          אם נתקלתם בקושי נגישות במערכת, או שיש לכם הצעה לשיפור, נשמח שתפנו אלינו ונטפל בפנייה
          בהקדם: יש לפנות למנהל המשרד באמצעות פרטי הקשר המופיעים אצל המעסיק, או בכתובת המייל של
          המשרד. אנא ציינו את תיאור הבעיה, הדפדפן והמכשיר שבו השתמשתם.
        </p>
        <p className="text-muted-foreground">
          יש להשלים כאן את שם רכז/ת הנגישות של המשרד, טלפון וכתובת מייל, כנדרש בתקנות.
        </p>

        <h2 className="text-base font-semibold">עדכון ההצהרה</h2>
        <p>ההצהרה עודכנה לאחרונה: אוגוסט 2026.</p>
      </div>

      <p>
        <Link to="/" className="text-sm underline">
          ← חזרה לעמוד הראשי
        </Link>
      </p>
    </div>
  );
}
