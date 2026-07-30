import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchMonthEntries, fetchProjectDirectory, trimTime } from "@/lib/queries";
import { holidayFor } from "@/lib/holidays";
import {
  absenceLabel,
  computeHours,
  fmtHours,
  iso,
  MONTH_NAMES,
  monthRange,
  splitOvertime,
  weekdayOf,
  yearOptions,
} from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({
    meta: [
      { title: "דוח שעות חודשי | ניהול שעות ופרויקטים" },
      { name: "description", content: "דוח שעות חודשי מפורט ומסכם להדפסה והעברה למנהל." },
      { property: "og:title", content: "דוח שעות חודשי" },
      { property: "og:description", content: "דוח מפורט לפי יום ולפי פרויקט, מוכן להדפסה." },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { user, profile, isAdmin } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [target, setTarget] = useState<string>("me");

  const range = useMemo(() => monthRange(year, month), [year, month]);
  const isAll = target === "all" && isAdmin;
  const userId = target === "me" ? (user?.id ?? "") : target;

  const staffQ = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const projectsQ = useQuery({ queryKey: ["projects-dir"], queryFn: fetchProjectDirectory });
  const dataQ = useQuery({
    queryKey: ["month", userId, range.start],
    queryFn: () => fetchMonthEntries(userId, range.start, range.end),
    enabled: Boolean(userId) && !isAll,
  });

  const allQ = useQuery({
    queryKey: ["month-all", range.start, range.end],
    enabled: isAll,
    queryFn: async () => {
      const [entries, hours] = await Promise.all([
        supabase
          .from("time_entries")
          .select("user_id, work_date, clock_in, clock_out, break_minutes, absence_type")
          .gte("work_date", range.start)
          .lte("work_date", range.end),
        supabase
          .from("project_hours")
          .select("user_id, project_id, hours")
          .gte("work_date", range.start)
          .lte("work_date", range.end),
      ]);
      if (entries.error) throw entries.error;
      if (hours.error) throw hours.error;
      return { entries: entries.data ?? [], projectHours: hours.data ?? [] };
    },
  });

  const projectName = (id: string) => {
    const p = projectsQ.data?.find((x) => x.id === id);
    return p ? `${p.code} · ${p.name}` : "פרויקט";
  };

  const projectCode = (id: string) => projectsQ.data?.find((x) => x.id === id)?.code ?? "—";

  const days = useMemo(
    () => Array.from({ length: range.days }, (_, i) => iso(new Date(Date.UTC(year, month, i + 1)))),
    [range.days, year, month],
  );

  const rows = days.map((d) => {
    const e = dataQ.data?.entries.find((x) => x.work_date === d);
    const hrs = (dataQ.data?.projectHours ?? []).filter((x) => x.work_date === d);
    const attendance = computeHours(
      trimTime(e?.clock_in ?? null),
      trimTime(e?.clock_out ?? null),
      e?.break_minutes ?? 0,
    );
    return { date: d, entry: e, hrs, attendance, holiday: holidayFor(d) };
  });

  const totals = rows.reduce(
    (acc, r) => {
      const s = splitOvertime(r.attendance);
      acc.total += r.attendance;
      acc.regular += s.regular;
      acc.ot125 += s.ot125;
      acc.ot150 += s.ot150;
      if (r.attendance > 0) acc.workDays += 1;
      if (r.entry?.absence_type) acc.absences += 1;
      return acc;
    },
    { total: 0, regular: 0, ot125: 0, ot150: 0, workDays: 0, absences: 0 },
  );

  const byProject = new Map<string, number>();
  rows.forEach((r) =>
    r.hrs.forEach((h) => byProject.set(h.project_id, (byProject.get(h.project_id) ?? 0) + Number(h.hours))),
  );

  const staffName =
    target === "me"
      ? profile?.full_name || profile?.email
      : staffQ.data?.find((s) => s.id === target)?.full_name;

  const staffLabel = (id: string) => {
    const s = staffQ.data?.find((x) => x.id === id);
    return s?.full_name || s?.email || "עובד";
  };

  const summary = useMemo(() => {
    if (!isAll || !allQ.data) return null;
    const perEmployee = new Map<string, { attendance: number; project: number; absences: number }>();
    for (const e of allQ.data.entries) {
      const cur = perEmployee.get(e.user_id) ?? { attendance: 0, project: 0, absences: 0 };
      cur.attendance += computeHours(
        trimTime(e.clock_in ?? null),
        trimTime(e.clock_out ?? null),
        e.break_minutes ?? 0,
      );
      if (e.absence_type) cur.absences += 1;
      perEmployee.set(e.user_id, cur);
    }
    const perProject = new Map<string, number>();
    const matrix = new Map<string, Map<string, number>>();
    for (const h of allQ.data.projectHours) {
      const v = Number(h.hours ?? 0);
      const cur = perEmployee.get(h.user_id) ?? { attendance: 0, project: 0, absences: 0 };
      cur.project += v;
      perEmployee.set(h.user_id, cur);
      perProject.set(h.project_id, (perProject.get(h.project_id) ?? 0) + v);
      const row = matrix.get(h.project_id) ?? new Map<string, number>();
      row.set(h.user_id, (row.get(h.user_id) ?? 0) + v);
      matrix.set(h.project_id, row);
    }
    return {
      employees: [...perEmployee.entries()].sort((a, b) => b[1].attendance - a[1].attendance),
      projects: [...perProject.entries()].sort((a, b) => b[1] - a[1]),
      matrix,
      totalAttendance: [...perEmployee.values()].reduce((s, v) => s + v.attendance, 0),
      totalProject: [...perProject.values()].reduce((s, v) => s + v, 0),
    };
  }, [isAll, allQ.data]);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">דוח שעות חודשי</h1>
          <p className="text-sm text-muted-foreground">דוח מפורט ומסכם, מוכן להדפסה</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {isAdmin && (
            <div className="space-y-1">
              <Label htmlFor="emp">עובד</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger id="emp" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">הדוח שלי</SelectItem>
                  <SelectItem value="all">דוח מרכז – כל העובדים</SelectItem>
                  {staffQ.data?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="m">חודש</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger id="m" className="w-36">
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
            <Label htmlFor="y">שנה</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="y" className="w-28">
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
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה / שמירה כ‑PDF
          </Button>
        </div>
      </div>

      {isAll ? (
        <div className="print-area space-y-6 rounded-xl border border-border bg-card p-6">
          <header className="border-b border-border pb-4">
            <h2 className="text-xl font-bold">
              דוח שעות מרכז – {MONTH_NAMES[month]} {year}
            </h2>
            <p className="text-sm text-muted-foreground">כל העובדים, וכל השעות לפי פרויקטים</p>
          </header>

          {allQ.isLoading && <p className="text-sm text-muted-foreground">טוען נתונים…</p>}

          {summary && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Summary label="סה״כ שעות נוכחות" value={fmtHours(summary.totalAttendance)} />
                <Summary label="סה״כ שעות בפרויקטים" value={fmtHours(summary.totalProject)} />
                <Summary label="עובדים מדווחים" value={String(summary.employees.length)} />
                <Summary label="פרויקטים פעילים בדיווח" value={String(summary.projects.length)} />
              </div>

              <table className="w-full text-sm">
                <caption className="mb-2 text-start font-semibold">סיכום לפי עובד</caption>
                <thead className="bg-muted/60">
                  <tr>
                    <th scope="col" className="p-2 text-start">עובד/ת</th>
                    <th scope="col" className="p-2 text-start">שעות נוכחות</th>
                    <th scope="col" className="p-2 text-start">שעות בפרויקטים</th>
                    <th scope="col" className="p-2 text-start">פער</th>
                    <th scope="col" className="p-2 text-start">ימי היעדרות</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employees.map(([uid, v]) => (
                    <tr key={uid} className="border-t border-border">
                      <td className="p-2">{staffLabel(uid)}</td>
                      <td className="p-2">{fmtHours(v.attendance)}</td>
                      <td className="p-2">{fmtHours(v.project)}</td>
                      <td className="p-2">{fmtHours(Math.abs(v.attendance - v.project))}</td>
                      <td className="p-2">{v.absences}</td>
                    </tr>
                  ))}
                  {summary.employees.length === 0 && (
                    <tr>
                      <td className="p-2 text-muted-foreground" colSpan={5}>
                        אין דיווחים בחודש זה.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <table className="w-full text-sm">
                <caption className="mb-2 text-start font-semibold">סיכום לפי פרויקט</caption>
                <thead className="bg-muted/60">
                  <tr>
                    <th scope="col" className="p-2 text-start">פרויקט</th>
                    <th scope="col" className="p-2 text-start">סה״כ שעות</th>
                    <th scope="col" className="p-2 text-start">פירוט לפי עובד</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.projects.map(([pid, h]) => (
                    <tr key={pid} className="border-t border-border align-top">
                      <td className="p-2">{projectName(pid)}</td>
                      <td className="p-2 font-semibold">{fmtHours(h)}</td>
                      <td className="p-2 text-muted-foreground">
                        {[...(summary.matrix.get(pid)?.entries() ?? [])]
                          .sort((a, b) => b[1] - a[1])
                          .map(([uid, uh]) => `${staffLabel(uid)} – ${fmtHours(uh)}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                  {summary.projects.length === 0 && (
                    <tr>
                      <td className="p-2 text-muted-foreground" colSpan={3}>
                        לא דווחו שעות לפרויקטים בחודש זה.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
      <div className="print-area space-y-6 rounded-xl border border-border bg-card p-6">
        <header className="border-b border-border pb-4">
          <h2 className="text-xl font-bold">
            דוח שעות – {MONTH_NAMES[month]} {year}
          </h2>
          <p className="text-sm text-muted-foreground">עובד/ת: {staffName}</p>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <Summary label="סה״כ שעות" value={fmtHours(totals.total)} />
          <Summary label="שעות רגילות" value={fmtHours(totals.regular)} />
          <Summary label="נוספות 125%" value={fmtHours(totals.ot125)} />
          <Summary label="נוספות 150%" value={fmtHours(totals.ot150)} />
          <Summary label="ימי עבודה" value={String(totals.workDays)} />
          <Summary label="ימי היעדרות" value={String(totals.absences)} />
        </div>

        <table className="w-full text-sm">
          <caption className="mb-2 text-start font-semibold">פירוט יומי</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-2 text-start">תאריך</th>
              <th scope="col" className="p-2 text-start">יום</th>
              <th scope="col" className="p-2 text-start">כניסה</th>
              <th scope="col" className="p-2 text-start">יציאה</th>
              <th scope="col" className="p-2 text-start">הפסקה</th>
              <th scope="col" className="p-2 text-start">שעות</th>
              <th scope="col" className="p-2 text-start">היעדרות</th>
              <th scope="col" className="p-2 text-start">מס׳ פרויקט</th>
              <th scope="col" className="p-2 text-start">הערות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.date}
                className={`border-t border-border ${r.holiday?.restDay ? "holiday-row" : ""}`}
              >
                <td className="p-2">{r.date.slice(8)}/{r.date.slice(5, 7)}</td>
                <td className="p-2">{weekdayOf(r.date)}</td>
                <td className={`p-2 ${r.entry?.manually_edited ? "font-semibold text-destructive" : ""}`}>
                  {trimTime(r.entry?.clock_in ?? null) || "—"}
                  {isAdmin && r.entry?.manually_edited && (
                    <span className="block text-xs font-normal text-destructive">
                      במקור: {trimTime(r.entry.original_clock_in ?? null) || "ללא"}
                    </span>
                  )}
                </td>
                <td className={`p-2 ${r.entry?.manually_edited ? "font-semibold text-destructive" : ""}`}>
                  {trimTime(r.entry?.clock_out ?? null) || "—"}
                  {isAdmin && r.entry?.manually_edited && (
                    <span className="block text-xs font-normal text-destructive">
                      במקור: {trimTime(r.entry.original_clock_out ?? null) || "ללא"}
                    </span>
                  )}
                </td>
                <td className={`p-2 ${r.entry?.manually_edited ? "font-semibold text-destructive" : ""}`}>
                  {r.entry?.break_minutes ?? 0}
                  {isAdmin && r.entry?.manually_edited && (
                    <span className="block text-xs font-normal text-destructive">
                      במקור: {r.entry.original_break_minutes ?? 0}
                    </span>
                  )}
                </td>
                <td className="p-2">{r.attendance ? fmtHours(r.attendance) : "—"}</td>
                <td className="p-2">{absenceLabel(r.entry?.absence_type) || "—"}</td>
                <td className="p-2">
                  {r.hrs.length ? r.hrs.map((h) => projectCode(h.project_id)).join(", ") : "—"}
                </td>
                <td className="p-2">
                  {r.holiday ? (
                    <span className={r.holiday.restDay ? "font-medium" : "text-muted-foreground"}>
                      {r.holiday.name}
                      {r.holiday.restDay ? " (חופשת חג על פי חוק)" : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="w-full text-sm">
          <caption className="mb-2 text-start font-semibold">סיכום לפי פרויקט</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-2 text-start">פרויקט</th>
              <th scope="col" className="p-2 text-start">שעות</th>
            </tr>
          </thead>
          <tbody>
            {[...byProject.entries()].map(([pid, h]) => (
              <tr key={pid} className="border-t border-border">
                <td className="p-2">{projectName(pid)}</td>
                <td className="p-2">{fmtHours(h)}</td>
              </tr>
            ))}
            {byProject.size === 0 && (
              <tr>
                <td className="p-2 text-muted-foreground" colSpan={2}>
                  לא דווחו שעות לפרויקטים בחודש זה.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 pt-8 text-sm">
          <div className="border-t border-border pt-2">חתימת העובד/ת</div>
          <div className="border-t border-border pt-2">אישור מנהל</div>
        </div>
      </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}