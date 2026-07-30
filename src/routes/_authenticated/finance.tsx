import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { daysBetween, fmtDate, fmtMoney, milestoneAmount, todayIso } from "@/lib/time";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "גבייה וכספים | ניהול שעות ופרויקטים" },
      { name: "description", content: "מעקב תחנות תשלום, יתרות לגבייה וחריגות לו״ז לישיבות הנהלה." },
      { property: "og:title", content: "גבייה וכספים" },
      { property: "og:description", content: "כמה כסף עדיין בחוץ, לפי פרויקט ותחנת תשלום." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <FinancePage />
    </AdminOnly>
  ),
});

function FinancePage() {
  const q = useQuery({
    queryKey: ["finance"],
    queryFn: async () => {
      const [projects, milestones] = await Promise.all([
        supabase.from("projects").select("*").order("code"),
        supabase.from("project_milestones").select("*").order("sort_order"),
      ]);
      if (projects.error) throw projects.error;
      if (milestones.error) throw milestones.error;
      return { projects: projects.data ?? [], milestones: milestones.data ?? [] };
    },
  });

  const projects = (q.data?.projects ?? []).filter((p) => p.status !== "closed");
  const milestones = q.data?.milestones ?? [];

  const open = projects.flatMap((p) =>
    milestones
      .filter((m) => m.project_id === p.id && m.status !== "paid")
      .map((m) => ({
        project: p,
        milestone: m,
        amount: milestoneAmount(m.amount_type, Number(m.amount_value), Number(p.fee_total)),
        lateDays:
          m.due_date && daysBetween(m.due_date, todayIso()) > 0 ? daysBetween(m.due_date, todayIso()) : 0,
      })),
  );

  const totalOutstanding = open.reduce((s, r) => s + r.amount, 0);
  const invoiced = open.filter((r) => r.milestone.status === "invoiced").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">גבייה וכספים</h1>
          <p className="text-sm text-muted-foreground">
            תמונת מצב לישיבת הנהלה – מה כבר חויב, מה עדיין בחוץ ומה חורג מהלו״ז
          </p>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" />
          הדפסת הרשימה
        </Button>
      </div>

      <div className="print-area space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card label="סה״כ פתוח לגבייה" value={fmtMoney(totalOutstanding)} />
          <Card label="חויב וטרם שולם" value={fmtMoney(invoiced)} />
          <Card label="תחנות בחריגת לו״ז" value={String(open.filter((r) => r.lateDays > 0).length)} />
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="p-3 text-start font-semibold">תחנות תשלום פתוחות</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-start">קוד</th>
                <th scope="col" className="p-3 text-start">פרויקט</th>
                <th scope="col" className="p-3 text-start">לקוח</th>
                <th scope="col" className="p-3 text-start">שלב</th>
                <th scope="col" className="p-3 text-start">סכום</th>
                <th scope="col" className="p-3 text-start">לו״ז</th>
                <th scope="col" className="p-3 text-start">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {open.map((r) => (
                <tr
                  key={r.milestone.id}
                  className={`border-t border-border ${r.lateDays ? "bg-destructive/10" : ""}`}
                >
                  <td className="p-3 font-mono">{r.project.code}</td>
                  <td className="p-3 font-medium">{r.project.name}</td>
                  <td className="p-3">{r.project.client_name || "—"}</td>
                  <td className="p-3">{r.milestone.title}</td>
                  <td className="p-3">{fmtMoney(r.amount)}</td>
                  <td className={`p-3 ${r.lateDays ? "font-semibold text-destructive" : ""}`}>
                    {r.milestone.due_date ? fmtDate(r.milestone.due_date) : "—"}
                    {r.lateDays > 0 && ` · חריגה ${r.lateDays} ימים`}
                  </td>
                  <td className="p-3">{r.milestone.status === "invoiced" ? "חויב" : "ממתין"}</td>
                </tr>
              ))}
              {open.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    אין תחנות תשלום פתוחות.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}