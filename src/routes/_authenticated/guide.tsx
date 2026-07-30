import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({
    meta: [
      { title: "הוראות הפעלה | ניהול שעות ופרויקטים" },
      { name: "description", content: "מדריך שימוש קצר לעובדים ולמנהלים במערכת ניהול השעות והפרויקטים." },
      { property: "og:title", content: "הוראות הפעלה" },
      { property: "og:description", content: "מדריך מהיר לעובד ולמנהל." },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  const { isAdmin } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">הוראות הפעלה</h1>
        <p className="text-sm text-muted-foreground">מדריך קצר לשימוש יומיומי במערכת</p>
      </header>

      <Section title="לעובד/ת">
        <Step n={1} title="החתמת כניסה ויציאה">
          בעמוד «דיווח שעות» לוחצים «כניסה» בתחילת היום ו«יציאה» בסופו. אפשר גם לתקן ידנית דרך «עריכה» בשורת התאריך.
        </Step>
        <Step n={2} title="הפסקות והיעדרויות">
          בחלון העריכה מזינים דקות הפסקה, ובוחרים סוג היעדרות: חופשה, מחלה, מילואים, נסיעת עבודה, חג או יום בחירה.
        </Step>
        <Step n={3} title="פירוק שעות לפי פרויקט">
          באותו חלון מוסיפים שורה לכל פרויקט שעבדתם עליו באותו יום, עם מספר השעות ותיאור קצר. אפשר לדווח כמה פרויקטים באותו יום.
        </Step>
        <Step n={4} title="בקרת פערים">
          אם סך שעות הפרויקטים לא תואם את שעות הנוכחות, השורה תסומן באדום. יש להשלים את הפער לפני סוף החודש.
        </Step>
        <Step n={5} title="דוח חודשי להדפסה">
          בעמוד «דוח חודשי» בוחרים חודש ולוחצים «הדפסה / שמירה כ‑PDF». הדוח כולל פירוט יומי, פילוח לפי פרויקט וסיכום שעות רגילות ונוספות (125%/150%) לפי חוק שעות עבודה ומנוחה.
        </Step>
      </Section>

      {isAdmin && (
        <Section title="למנהל/ת">
          <Step n={1} title="הקמת פרויקט">
            בעמוד «פרויקטים» מוסיפים פרויקט עם קוד המשרד, שם, לקוח ושכר טרחה. לחיצה על שם הפרויקט פותחת את תחנות התשלום.
          </Step>
          <Step n={2} title="תחנות תשלום ולו״ז">
            כל תחנה מוגדרת באחוזים או בסכום קבוע (למשל 30% עם חתימת חוזה), עם תאריך יעד. חריגה מהתאריך תסמן את הפרויקט באדום ותציג את מספר ימי החריגה.
          </Step>
          <Step n={3} title="דשבורד ניהולי">
            «דשבורד» מציג שעות מצטברות לכל פרויקט, עלות שעות העבודה, רווח ושיעור רווח, תעריף אפקטיבי לשעה, וכן מדדי יעילות וחריגות עובדים.
          </Step>
          <Step n={4} title="גבייה">
            «גבייה וכספים» מרכז את כל התחנות שטרם שולמו – כמה כסף עדיין בחוץ ואילו תשלומים באיחור. ניתן להדפיס את הרשימה לישיבת הנהלה.
          </Step>
          <Step n={5} title="עובדים והרשאות">
            ב«עובדים» קובעים למי יש הרשאת מנהל, מגדירים תעריף עלות לשעה לכל עובד (בסיס לחישוב הרווחיות) ומשביתים עובדים שסיימו.
          </Step>
          <Step n={6} title="דוחות לרואה החשבון">
            בעמוד «דוח חודשי» ניתן לבחור כל עובד בנפרד, להדפיס או לשמור PDF ולשלוח לרואה החשבון.
          </Step>
        </Section>
      )}

      <Section title="נגישות">
        <p className="text-sm leading-relaxed">
          כפתור הנגישות בפינת המסך מאפשר הגדלת טקסט, ניגודיות גבוהה, גווני אפור, הדגשת קישורים, סמן מוגדל ועצירת אנימציות,
          בהתאם לתקן הישראלי ת״י 5568 ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות).
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
        {n}
      </span>
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}