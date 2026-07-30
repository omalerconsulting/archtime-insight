import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BarChart3, Building2, Clock, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ניהול שעות ופרויקטים | משרד אדריכלים" },
      {
        name: "description",
        content:
          "מערכת לדיווח נוכחות ושעות לפי פרויקט, דוחות חודשיים להדפסה, מעקב גבייה ודשבורד ניהולי.",
      },
      { property: "og:title", content: "ניהול שעות ופרויקטים | משרד אדריכלים" },
      {
        property: "og:description",
        content: "דיווח שעות, תחנות תשלום, רווחיות פרויקטים וניתוחי עובדים במקום אחד.",
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  {
    icon: Clock,
    title: "שעון נוכחות ודיווח לפי פרויקט",
    text: "כניסה, יציאה, הפסקות והיעדרויות — ולצידם פירוק השעות לכל פרויקט.",
  },
  {
    icon: BarChart3,
    title: "דשבורד ניהולי",
    text: "רווחיות, צריכת שעות, חריגות לו״ז ומדדי יעילות עובדים בזמן אמת.",
  },
  {
    icon: FileText,
    title: "דוחות להדפסה",
    text: "דוח חודשי מפורט ומסכם לכל עובד, מוכן להדפסה או לשליחה לרואה החשבון.",
  },
  {
    icon: ShieldCheck,
    title: "הרשאות מבוקרות",
    text: "נתוני הכנסות ורווחיות גלויים למשתמשי מנהל בלבד.",
  },
];

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <Building2 className="size-6 text-accent" aria-hidden />
            <span className="text-lg font-semibold">מערכת שעות ופרויקטים</span>
          </div>
          <Button asChild>
            <Link to="/auth">כניסה למערכת</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="mb-4 text-sm font-medium tracking-widest text-accent">
            למשרדי אדריכלים
          </p>
          <h1 className="max-w-3xl text-4xl leading-tight font-bold text-foreground md:text-5xl">
            כל שעת עבודה במקום הנכון — וכל פרויקט עם התמונה הכלכלית המלאה
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            העובדים מדווחים נוכchות ושעות לכל פרויקט, וההנהלה מקבלת רווחיות, מצב גבייה,
            חריגות לו״ז וניתוחי יעילות — בלחיצה אחת.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">כניסה עם שם משתמש וסיסמה</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/help">הוראות הפעלה</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-card/50">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <article key={f.title} className="rounded-xl border border-border bg-card p-6">
                <f.icon className="mb-4 size-6 text-accent" aria-hidden />
                <h2 className="mb-2 text-base font-semibold">{f.title}</h2>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        מערכת ניהול שעות ופרויקטים · דיווח שעות בהתאם לחוק שעות עבודה ומנוחה
      </footer>
    </div>
  );
}
