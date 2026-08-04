import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { exportCsv } from "@/lib/csv";
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
  yearOptions,
} from "@/lib/time";
import { trimTime } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
      {
        name: "description",
        content: "רווחיות פרויקטים, שעות מושקעות, חריגות לו״ז ויעילות עובדים.",
      },
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
  const [year, setYear] = useState(now.getFullYear());

  const range = monthRange(year, month);
  const scoped = scope === "month";

  const dataQ = useQuery({
    queryKey: ["dashboard", scoped ? range.start : "all"],
    queryFn: async () => {
      // Server-side date filtering keeps this fast even after years of data.
      let hoursQ = supabase.from("project_hours").select("project_id, user_id, work_date, hours");
      let entriesQ = supabase
        .from("time_entries")
        .select("user_id, work_date, clock_in, clock_out, break_minutes, absence_type");
      if (scoped) {
        hoursQ = hoursQ.gte("work_date", range.start).lte("work_date", range.end);
        entriesQ = entriesQ.gte("work_date", range.start).lte("work_date", range.end);
      }
      const [projects, milestones, hours, profiles, entries, settings, pending] = await Promise.all(
        [
          supabase.from("projects").select("*"),
          supabase.from("project_milestones").select("*"),
          hoursQ,
          supabase
            .from("profiles")
            .select("id, full_name, email, cost_rate, is_deleted, is_active"),
          entriesQ,
          supabase.from("org_settings").select("standard_daily_hours").maybeSingle(),
          supabase
            .from("monthly_reports")
            .select("id, user_id, month, status")
            .eq("status", "submitted"),
        ],
      );
      const err =
        projects.error ||
        milestones.error ||
        hours.error ||
        profiles.error ||
        entries.error ||
        pending.error;
      if (err) throw err;
      return {
        projects: projects.data ?? [],
        milestones: milestones.data ?? [],
        hours: hours.data ?? [],
        profiles: (profiles.data ?? []).filter((p) => !p.is_deleted),
        entries: entries.data ?? [],
        standard: Number(settings.data?.standard_daily_hours ?? 8.6),
        pendingReports: pending.data ?? [],
      };
    },
  });

  const analysis = useMemo(() => {
    const d = dataQ.data;
    if (!d) return null;
    // Cost is based on the admin-controlled cost_rate ONLY. The self-editable
    // hourly_rate must never leak into profitability figures.
    const rateOf = (uid: string) => Number(d.profiles.find((x) => x.id === uid)?.cost_rate ?? 0);
    const missingRates = d.profiles.filter((p) => p.is_active && !Number(p.cost_rate));

    const rows = d.projects
      .map((p) => {
        const hrs = d.hours.filter((h) => h.project_id === p.id);
        const totalHours = hrs.reduce((s, h) => s + Number(h.hours), 0);
        const cost = hrs.reduce((s, h) => s + Number(h.hours) * rateOf(h.user_id), 0);
        const ms = d.milestones.filter((m) => m.project_id === p.id);
        const collected = ms.reduce((s, m) => {
          const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(p.fee_total));
          return s + (m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full));
        }, 0);
        const openMs = ms
          .filter((m) => m.status !== "paid")
          .sort((a, b) => a.sort_order - b.sort_order)[0];
        const lateDays =
          openMs?.due_date && daysBetween(openMs.due_date, todayIso()) > 0
            ? daysBetween(openMs.due_date, todayIso())
            : 0;
        const budget = Number(p.hours_budget) || 0;
        const budgetPct = budget > 0 ? (totalHours / budget) * 100 : null;
        const profit = Number(p.fee_total) - cost;
        // Projected profit at the current burn rate: extrapolate cost to the full hours budget.
        const projectedProfit =
          budget > 0 && totalHours > 0
            ? Number(p.fee_total) - (cost / totalHours) * Math.max(budget, totalHours)
            : null;
        return {
          project: p,
          totalHours,
          cost,
          collected,
          outstanding: Number(p.fee_total) - collected,
          profit,
          projectedProfit,
          budget,
          budgetPct,
          margin: Number(p.fee_total) > 0 ? (profit / Number(p.fee_total)) * 100 : 0,
          effectiveRate: totalHours > 0 ? Number(p.fee_total) / totalHours : 0,
          stage: openMs?.title ?? "הושלם",
          lateDays,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    const employees = d.profiles
      .map((emp) => {
        const entries = d.entries.filter((e) => e.user_id === emp.id);
        const attendance = entries.reduce(
          (s, e) => s + computeHours(trimTime(e.clock_in), trimTime(e.clock_out), e.break_minutes),
          0,
        );
        const overtime = entries.reduce((s, e) => {
          const h = computeHours(trimTime(e.clock_in), trimTime(e.clock_out), e.break_minutes);
          const sp = splitOvertime(h, d.standard);
          return s + sp.ot125 + sp.ot150;
        }, 0);
        const projectHours = d.hours
          .filter((h) => h.user_id === emp.id)
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
      .filter((e) => e.attendance > 0 || e.projectHours > 0)
      .sort((a, b) => b.projectHours - a.projectHours);

    const overBudget = rows.filter((r) => r.budgetPct !== null && r.budgetPct >= 80);

    return {
      rows,
      employees,
      missingRates,
      overBudget,
      pending: d.pendingReports,
      totals: {
        hours: rows.reduce((s, r) => s + r.totalHours, 0),
        fee: rows.reduce((s, r) => s + Number(r.project.fee_total), 0),
        cost: rows.reduce((s, r) => s + r.cost, 0),
        outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
        late: rows.filter((r) => r.lateDays > 0).length,
      },
    };
  }, [dataQ.data]);

  if (!analysis)
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );

  const { rows, employees, totals, missingRates, overBudget, pending } = analysis;
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
    {
      name: "נגבה",
      value: Math.max(
        0,
        rows.reduce((s, r) => s + r.collected, 0),
      ),
    },
    { name: "פתוח לגבייה", value: Math.max(0, totals.outstanding) },
  ];
  const employeeData = employees.slice(0, 10).map((e) => ({
    name: e.emp.full_name || e.emp.email,
    hours: Math.round(e.projectHours * 10) / 10,
  }));
  const pieColors = ["var(--chart-3)", "var(--chart-1)"];

  const exportProjects = () =>
    exportCsv(
      `projects-analysis-${scoped ? range.start.slice(0, 7) : "all"}`,
      [
        "קוד",
        "פרויקט",
        "לקוח",
        "שעות",
        "עלות שעות",
        "שכר טרחה",
        "רווח",
        "שיעור רווח %",
        "רווח צפוי",
        "תקציב שעות",
        "ניצול תקציב %",
        "תעריף אפקטיבי",
        "שלב נוכחי",
        "ימי חריגה",
      ],
      rows.map((r) => [
        r.project.code,
        r.project.name,
        r.project.client_name ?? "",
        r.totalHours.toFixed(2),
        r.cost.toFixed(0),
        Number(r.project.fee_total).toFixed(0),
        r.profit.toFixed(0),
        r.margin.toFixed(0),
        r.projectedProfit === null ? "" : r.projectedProfit.toFixed(0),
        r.budget || "",
        r.budgetPct === null ? "" : r.budgetPct.toFixed(0),
        r.effectiveRate ? r.effectiveRate.toFixed(0) : "",
        r.stage,
        r.lateDays || "",
      ]),
    );

  const exportEmployees = () =>
    exportCsv(
      `employees-analysis-${scoped ? range.start.slice(0, 7) : "all"}`,
      ["עובד", "שעות נוכחות", "שעות פרויקטים", "אחוז שיוך", "שעות נוספות", "ימי היעדרות"],
      employees.map((e) => [
        e.emp.full_name || e.emp.email,
        e.attendance.toFixed(2),
        e.projectHours.toFixed(2),
        e.attendance ? e.coverage.toFixed(0) : "",
        e.overtime.toFixed(2),
        e.absences,
      ]),
    );

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">דשבורד ניהולי</h1>
          <p className="text-sm text-muted-foreground">תמונת מצב עדכנית של שעות, רווחיות וחריגות</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
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
            <>
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
              <div className="space-y-1">
                <Label htmlFor="dy">שנה</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger id="dy" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {yearOptions().map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <Button variant="outline" onClick={exportProjects}>
            <Download className="size-4" />
            ייצוא לאקסל
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה
          </Button>
        </div>
      </div>

      <div className="print-area space-y-6">
        <section className="grid gap-4 md:grid-cols-5">
          <Kpi
            label="רווח גולמי"
            value={fmtMoney(profit)}
            tone={profit >= 0 ? "good" : "bad"}
            big
          />
          <Kpi label="סה״כ שעות" value={fmtHours(totals.hours)} />
          <Kpi label="שכר טרחה מצטבר" value={fmtMoney(totals.fee)} />
          <Kpi label="עלות שעות עבודה" value={fmtMoney(totals.cost)} />
          <Kpi label="יתרות לגבייה" value={fmtMoney(totals.outstanding)} />
        </section>

        {pending.length > 0 && (
          <Link
            to="/report"
            className="flex items-center justify-between rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm transition-colors hover:bg-accent/20"
          >
            <span className="font-semibold">{pending.length} דוחות חודשיים ממתינים לאישורך</span>
            <span className="text-muted-foreground">מעבר לאישור ←</span>
          </Link>
        )}

        {missingRates.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            <span>
              ל‑{missingRates.length} עובדים פעילים לא הוגדר תעריף עלות – חישובי הרווחיות אינם
              כוללים את השעות שלהם. יש להגדיר תעריף עלות בדף העובדים:{" "}
              {missingRates.map((p) => p.full_name || p.email).join(", ")}.
            </span>
          </div>
        )}

        {totals.late > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            <span>
              {totals.late} פרויקטים חורגים מלוח הזמנים שהוגדר לשלב הנוכחי – מומלץ לתעדף אותם.
            </span>
          </div>
        )}

        {overBudget.length > 0 && (
          <div className="rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
            <p className="font-semibold">
              התראת תקציב שעות: {overBudget.length} פרויקטים ניצלו מעל 80% מתקציב השעות
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {overBudget.slice(0, 6).map((r) => (
                <li key={r.project.id}>
                  {r.project.code} · {r.project.name} – {r.totalHours.toFixed(0)} מתוך {r.budget}{" "}
                  שעות ({r.budgetPct!.toFixed(0)}%)
                  {r.projectedProfit !== null && r.projectedProfit < 0 && (
                    <span className="font-semibold text-destructive">
                      {" "}
                      · צפי הפסד {fmtMoney(Math.abs(r.projectedProfit))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
                  <Cell
                    key={r.name}
                    fill={r.profit >= 0 ? "var(--chart-3)" : "var(--destructive)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
          <ChartCard title="מצב גבייה">
            <PieChart>
              <Pie
                data={collectionData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
              >
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
                <th scope="col" className="p-3 text-start">
                  קוד
                </th>
                <th scope="col" className="p-3 text-start">
                  פרויקט
                </th>
                <th scope="col" className="p-3 text-start">
                  שעות
                </th>
                <th scope="col" className="p-3 text-start">
                  ניצול תקציב
                </th>
                <th scope="col" className="p-3 text-start">
                  עלות שעות
                </th>
                <th scope="col" className="p-3 text-start">
                  שכר טרחה
                </th>
                <th scope="col" className="p-3 text-start">
                  רווח
                </th>
                <th scope="col" className="p-3 text-start">
                  רווח צפוי
                </th>
                <th scope="col" className="p-3 text-start">
                  תעריף אפקטיבי
                </th>
                <th scope="col" className="p-3 text-start">
                  שלב נוכחי
                </th>
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
                  <td className="p-3 tabular-nums">{fmtHours(r.totalHours)}</td>
                  <td className="p-3">
                    {r.budgetPct === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex min-w-28 items-center gap-2">
                        <Progress
                          value={Math.min(100, r.budgetPct)}
                          className={`h-2 flex-1 ${r.budgetPct >= 100 ? "[&>div]:bg-destructive" : r.budgetPct >= 80 ? "[&>div]:bg-warning" : ""}`}
                        />
                        <span
                          className={`text-xs tabular-nums ${
                            r.budgetPct >= 100
                              ? "font-semibold text-destructive"
                              : r.budgetPct >= 80
                                ? "font-semibold text-warning"
                                : "text-muted-foreground"
                          }`}
                        >
                          {r.budgetPct.toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">{fmtMoney(r.cost)}</td>
                  <td className="p-3 tabular-nums">{fmtMoney(Number(r.project.fee_total))}</td>
                  <td
                    className={`p-3 font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : ""}`}
                  >
                    {fmtMoney(r.profit)}
                    <span className="ms-1 text-xs text-muted-foreground">
                      ({r.margin.toFixed(0)}%)
                    </span>
                  </td>
                  <td
                    className={`p-3 tabular-nums ${
                      r.projectedProfit !== null && r.projectedProfit < 0
                        ? "font-semibold text-destructive"
                        : ""
                    }`}
                  >
                    {r.projectedProfit === null ? "—" : fmtMoney(r.projectedProfit)}
                  </td>
                  <td className="p-3 tabular-nums">
                    {r.effectiveRate ? fmtMoney(r.effectiveRate) : "—"}
                  </td>
                  <td className={`p-3 ${r.lateDays ? "font-semibold text-destructive" : ""}`}>
                    {r.stage}
                    {r.lateDays > 0 && ` · חריגה ${r.lateDays} ימים`}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    אין עדיין נתוני פרויקטים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between p-3">
            <p className="font-semibold">יעילות וחריגות עובדים</p>
            <Button
              size="sm"
              variant="ghost"
              className="no-print print:hidden"
              onClick={exportEmployees}
            >
              <Download className="size-4" />
              ייצוא
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-start">
                  עובד/ת
                </th>
                <th scope="col" className="p-3 text-start">
                  שעות נוכחות
                </th>
                <th scope="col" className="p-3 text-start">
                  שעות משויכות לפרויקט
                </th>
                <th scope="col" className="p-3 text-start">
                  אחוז שיוך
                </th>
                <th scope="col" className="p-3 text-start">
                  שעות נוספות
                </th>
                <th scope="col" className="p-3 text-start">
                  ימי היעדרות
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.emp.id} className="border-t border-border">
                  <td className="p-3 font-medium">{e.emp.full_name || e.emp.email}</td>
                  <td className="p-3 tabular-nums">{fmtHours(e.attendance)}</td>
                  <td className="p-3 tabular-nums">{fmtHours(e.projectHours)}</td>
                  <td
                    className={`p-3 tabular-nums ${e.coverage < 85 && e.attendance > 0 ? "text-destructive" : ""}`}
                  >
                    {e.attendance ? `${e.coverage.toFixed(0)}%` : "—"}
                  </td>
                  <td className="p-3 tabular-nums">{fmtHours(e.overtime)}</td>
                  <td className="p-3 tabular-nums">{e.absences}</td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    אין דיווחי נוכחות בטווח שנבחר.
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

function Kpi({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  big?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-5 ${big ? "border-primary/40 shadow-sm" : "border-border"}`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 flex items-center gap-1 font-bold tabular-nums ${big ? "text-2xl" : "text-xl"} ${
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
function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
