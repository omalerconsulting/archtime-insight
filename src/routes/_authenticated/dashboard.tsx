import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import {
  computeHours,
  daysBetween,
  fmtHours,
  fmtMoney,
  milestoneAmount,
  MONTH_NAMES,
  monthRange,
  splitOvertime,
  todayIso,
} from "@/lib/time";
import { trimTime } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "דשבורד ניהולי | ניהול שעות ופרויקטים" },
      { name: "description", content: "רווחיות פרויקטים, שעות מושקעות, חריגות לו״ז ויעילות עובדים." },
      { property: "og:title", content: "דשבורד ניהולי" },
      { property: "og:description", content: "ניתוחי רווחיות, שעות וחריגות בזמן אמת." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <DashboardPage />
    </AdminOnly>
  ),
});

function DashboardPage() {
  const now = new Date();
  const [scope, setScope] = useState("all");
  const [month, setMonth] = useState(now.getMonth());

  const dataQ = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [projects, milestones, hours, profiles, entries] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("project_milestones").select("*"),
        supabase.from("project_hours").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("time_entries").select("*"),
      ]);
      const err = projects.error || milestones.error || hours.error || profiles.error || entries.error;
      if (err) throw err;
      return {
        projects: projects.data ?? [],
        milestones: milestones.data ?? [],
        hours: hours.data ?? [],
        profiles: profiles.data ?? [],
        entries: entries.data ?? [],
      };
    },
  });

  const range = monthRange(now.getFullYear(), month);

  const analysis = useMemo(() => {
    const d = dataQ.data;
    if (!d) return null;
    const rateOf = (uid: string) => {
      const p = d.profiles.find((x) => x.id === uid);
      return Number(p?.cost_rate ?? p?.hourly_rate ?? 0);
    };

    const rows = d.projects
      .map((p) => {
        const hrs = d.hours.filter((h) => h.project_id === p.id);
        const inScope = scope === "all" ? hrs : hrs.filter((h) => h.work_date >= range.start && h.work_date <= range.end);
        const totalHours = inScope.reduce((s, h) => s + Number(h.hours), 0);
        const cost = inScope.reduce((s, h) => s + Number(h.hours) * rateOf(h.user_id), 0);
        const ms = d.milestones.filter((m) => m.project_id === p.id);
        const collected = ms
          .filter((m) => m.status === "paid")
          .reduce((s, m) => s + milestoneAmount(m.amount_type, Number(m.amount_value), Number(p.fee_total)), 0);
        const openMs = ms
          .filter((m) => m.status !== "paid")
          .sort((a, b) => a.sort_order - b.sort_order)[0];
        const lateDays =
          openMs?.due_date && daysBetween(openMs.due_date, todayIso()) > 0
            ? daysBetween(openMs.due_date, todayIso())
            : 0;
        const profit = Number(p.fee_total) - cost;
        return {
          project: p,
          totalHours,
          cost,
          collected,
          outstanding: Number(p.fee_total) - collected,
          profit,
          margin: Number(p.fee_total) > 0 ? (profit / Number(p.fee_total)) * 100 : 0,
          effectiveRate: totalHours > 0 ? Number(p.fee_total) / totalHours : 0,
          stage: openMs?.title ?? "הושלם",
          lateDays,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    const employees = d.profiles
      .map((emp) => {
        const entries = d.entries.filter(
          (e) => e.user_id === emp.id && (scope === "all" || (e.work_date >= range.start && e.work_date <= range.end)),
        );
        const attendance = entries.reduce(
          (s, e) => s + computeHours(trimTime(e.clock_in), trimTime(e.clock_out), e.break_minutes),
          0,
        );
        const overtime = entries.reduce((s, e) => {
          const h = computeHours(trimTime(e.clock_in), trimTime(e.clock_out), e.break_minutes);
          const sp = splitOvertime(h);
          return s + sp.ot125 + sp.ot150;
        }, 0);
        const projectHours = d.hours
          .filter((h) => h.user_id === emp.id && (scope === "all" || (h.work_date >= range.start && h.work_date <= range.end)))
          .reduce((s, h) => s + Number(h.hours), 0);
        const absences = entries.filter((e) => e.absence_type).length;
        return {
          emp,
          attendance,
          overtime,
          projectHours,
          absences,
          coverage: attendance > 0 ? (projectHours / attendance) * 100 : 0,
        };
      })
      .sort((a, b) => b.projectHours - a.projectHours);

    return {
      rows,
      employees,
      totals: {
        hours: rows.reduce((s, r) => s + r.totalHours, 0),
        fee: rows.reduce((s, r) => s + Number(r.project.fee_total), 0),
        cost: rows.reduce((s, r) => s + r.cost, 0),
        outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
        late: rows.filter((r) => r.lateDays > 0).length,
      },
    };
  }, [dataQ.data, scope, range.start, range.end]);

  if (!analysis) return <p className="text-muted-foreground">טוען נתונים…</p>;

  const { rows, employees, totals } = analysis;
  const profit = totals.fee - totals.cost;
  const topHours = rows.slice(0, 8).map((r) => ({
    name: `${r.project.code}`,
    hours: Math.round(r.totalHours * 10) / 10,
  }));
  const profitRows = [...rows]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 8)
    .map((r) => ({ name: r.project.code, profit: Math.round(r.profit) }));
  const collectionData = [
    { name: "נגבה", value: Math.max(0, rows.reduce((s, r) => s + r.collected, 0)) },
    { name: "פתוח לגבייה", value: Math.max(0, totals.outstanding) },
  ];
  const employeeData = employees
    .slice(0, 10)
    .map((e) => ({ name: e.emp.full_name || e.emp.email, hours: Math.round(e.projectHours * 10) / 10 }));
  const pieColors = ["var(--chart-3)", "var(--chart-1)"];

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">דשבורד ניהולי</h1>
          <p className="text-sm text-muted-foreground">תמונת מצב עדכנית של שעות, רווחיות וחריגות</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="scope">טווח</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="scope" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">מצטבר (כל הזמן)</SelectItem>
                <SelectItem value="month">חודש נבחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "month" && (
            <div className="space-y-1">
              <Label htmlFor="dm">חודש</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger id="dm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={m} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה
          </Button>
        </div>
      </div>

      <div className="print-area space-y-6">
        <section className="grid gap-4 md:grid-cols-5">
          <Kpi label="סה״כ שעות" value={fmtHours(totals.hours)} />
          <Kpi label="שכר טרחה מצטבר" value={fmtMoney(totals.fee)} />
          <Kpi label="עלות שעות עבודה" value={fmtMoney(totals.cost)} />
          <Kpi
            label="רווח גולמי"
            value={fmtMoney(profit)}
            tone={profit >= 0 ? "good" : "bad"}
          />
          <Kpi label="יתרות לגבייה" value={fmtMoney(totals.outstanding)} />
        </section>

        {totals.late > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            <span>
              {totals.late} פרויקטים חורגים מלוח הזמנים שהוגדר לשלב הנוכחי – מומלץ לתעדף אותם.
            </span>
          </div>
        )}

        <section className="no-print grid gap-4 lg:grid-cols-2 print:hidden">
          <ChartCard title="שעות מושקעות לפי פרויקט (Top 8)">
            <BarChart data={topHours}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={50} />
              <Tooltip formatter={(v: number) => `${v} שעות`} />
              <Bar dataKey="hours" name="שעות" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
          <ChartCard title="רווח גולמי לפי פרויקט">
            <BarChart data={profitRows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: number) => fmtMoney(Number(v))} />
              <Bar dataKey="profit" name="רווח" radius={[6, 6, 0, 0]}>
                {profitRows.map((r) => (
                  <Cell key={r.name} fill={r.profit >= 0 ? "var(--chart-3)" : "var(--destructive)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="מצב גבייה">
            <PieChart>
              <Pie data={collectionData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {collectionData.map((d, i) => (
                  <Cell key={d.name} fill={pieColors[i]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip formatter={(v: number) => fmtMoney(Number(v))} />
            </PieChart>
          </ChartCard>
          <ChartCard title="שעות עובדים משויכות לפרויקטים">
            <BarChart data={employeeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${v} שעות`} />
              <Bar dataKey="hours" name="שעות" fill="var(--chart-2)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ChartCard>
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="p-3 text-start font-semibold">ניתוח פרויקטים</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-start">קוד</th>
                <th scope="col" className="p-3 text-start">פרויקט</th>
                <th scope="col" className="p-3 text-start">שעות</th>
                <th scope="col" className="p-3 text-start">עלות שעות</th>
                <th scope="col" className="p-3 text-start">שכר טרחה</th>
                <th scope="col" className="p-3 text-start">רווח</th>
                <th scope="col" className="p-3 text-start">שיעור רווח</th>
                <th scope="col" className="p-3 text-start">תעריף אפקטיבי לשעה</th>
                <th scope="col" className="p-3 text-start">שלב נוכחי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.project.id}
                  className={`border-t border-border ${r.lateDays ? "bg-destructive/10" : ""}`}
                >
                  <td className="p-3 font-mono">{r.project.code}</td>
                  <td className="p-3 font-medium">{r.project.name}</td>
                  <td className="p-3">{fmtHours(r.totalHours)}</td>
                  <td className="p-3">{fmtMoney(r.cost)}</td>
                  <td className="p-3">{fmtMoney(Number(r.project.fee_total))}</td>
                  <td className={`p-3 font-medium ${r.profit < 0 ? "text-destructive" : ""}`}>
                    {fmtMoney(r.profit)}
                  </td>
                  <td className="p-3">{r.margin.toFixed(0)}%</td>
                  <td className="p-3">{r.effectiveRate ? fmtMoney(r.effectiveRate) : "—"}</td>
                  <td className={`p-3 ${r.lateDays ? "font-semibold text-destructive" : ""}`}>
                    {r.stage}
                    {r.lateDays > 0 && ` · חריגה ${r.lateDays} ימים`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    אין עדיין נתוני פרויקטים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="p-3 text-start font-semibold">יעילות וחריגות עובדים</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-start">עובד/ת</th>
                <th scope="col" className="p-3 text-start">שעות נוכחות</th>
                <th scope="col" className="p-3 text-start">שעות משויכות לפרויקט</th>
                <th scope="col" className="p-3 text-start">אחוז שיוך</th>
                <th scope="col" className="p-3 text-start">שעות נוספות</th>
                <th scope="col" className="p-3 text-start">ימי היעדרות</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.emp.id} className="border-t border-border">
                  <td className="p-3 font-medium">{e.emp.full_name || e.emp.email}</td>
                  <td className="p-3">{fmtHours(e.attendance)}</td>
                  <td className="p-3">{fmtHours(e.projectHours)}</td>
                  <td className={`p-3 ${e.coverage < 85 && e.attendance > 0 ? "text-destructive" : ""}`}>
                    {e.attendance ? `${e.coverage.toFixed(0)}%` : "—"}
                  </td>
                  <td className="p-3">{fmtHours(e.overtime)}</td>
                  <td className="p-3">{e.absences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 flex items-center gap-1 text-xl font-bold ${
          tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {tone === "good" && <TrendingUp className="size-4" aria-hidden />}
        {tone === "bad" && <TrendingDown className="size-4" aria-hidden />}
        {value}
      </p>
    </div>
  );
}