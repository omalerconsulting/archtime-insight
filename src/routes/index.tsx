import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Building2, Clock, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "מערכת ניהול שעות לעובדים | משרד אדריכלים" },
      {
        name: "description",
        content:
          "מערכת לדיווח שעות לעובדים וניהול שעות פרויקטים: שעון נוכחות, דוחות חודשיים להדפסה וסודיות מלאה.",
      },
      { property: "og:title", content: "מערכת ניהול שעות לעובדים" },
      {
        property: "og:description",
        content: "דיווח שעות לעובדים וניהול שעות פרויקטים במקום אחד.",
      },
    ],
  }),
  component: Index,
});

const FEATURES = [
  {
    icon: Clock,
    title: "שעון נוכחות ודיווח שעות לפי פרויקט",
    text: "כניסה, יציאה, הפסקות והיעדרויות עתה בלחיצת כפתור. בנוסף, ניהול שעות פרויקטים בקלות ובמהירות כולל התראות על אי התאמות.",
  },
  {
    icon: FileText,
    title: "דוחות להדפסה",
    text: "מידי חודש בלחיצת כפתור ניתן להוציא דוח שעות מפורט ומסכם לכל עובד, מוכן להדפסה.",
  },
  {
    icon: ShieldCheck,
    title: "סודיות מלאה",
    text: "כלל המידע האישי של העובד סודי ולא חשוף לכלל המשתמשים ו/או המנהלים.",
  },
];

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="dark relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-accent/20 blur-[140px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] size-[32rem] rounded-full bg-chart-2/20 blur-[150px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_left,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:64px_64px]"
      />

      <div className="relative">
        <header className="border-b border-border/60 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            <div className="flex items-center gap-2">
              <Building2 className="size-6 text-accent" aria-hidden />
              <span className="text-lg font-semibold">מערכת ניהול שעות ופרויקטים</span>
            </div>
            <Button asChild>
              <Link to="/auth">כניסה למערכת</Link>
            </Button>
          </div>
        </header>

        <main>
          <section className="mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
            <p className="mb-6 inline-flex animate-fade-in items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-medium tracking-widest text-accent">
              למשרדי אדריכלים
            </p>
            <h1 className="mx-auto max-w-4xl animate-fade-in bg-gradient-to-l from-foreground via-foreground to-accent bg-clip-text text-4xl leading-tight font-bold text-transparent md:text-6xl">
              מערכת ניהול שעות לעובדים
            </h1>
            <h2 className="mx-auto mt-6 max-w-2xl animate-fade-in text-lg text-muted-foreground md:text-xl">
              מערכת לדיווח שעות לעובדים וניהול שעות פרויקטים
            </h2>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" className="hover-scale shadow-lg shadow-accent/10">
                <Link to="/auth">כניסה עם שם משתמש וסיסמה</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="hover-scale">
                <Link to="/guide">הוראות הפעלה</Link>
              </Button>
            </div>
          </section>

          <section className="border-t border-border/60">
            <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-3">
              {FEATURES.map((f) => (
                <article
                  key={f.title}
                  className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-accent/50 hover:shadow-2xl hover:shadow-accent/10"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <div className="relative mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110">
                    <f.icon
                      className="size-6 text-accent transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:scale-110"
                      aria-hidden
                    />
                  </div>
                  <h2 className="relative mb-3 text-lg font-semibold">{f.title}</h2>
                  <p className="relative text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </article>
              ))}
            </div>
          </section>
        </main>

        <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
          מערכת ניהול שעות ופרויקטים · דיווח שעות בהתאם לחוק שעות עבודה ומנוחה
        </footer>
      </div>
    </div>
  );
}