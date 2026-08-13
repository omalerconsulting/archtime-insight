import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Download, Mail, Printer, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dayHours, fetchMonthEntries, fetchProjectDirectory, trimTime } from "@/lib/queries";
import { holidayFor } from "@/lib/holidays";
import {
  absenceLabel,
  computeHours,
  fmtHours,
  iso,
  MONTH_NAMES,
  monthFirstIso,
  monthRange,
  REPORT_STATUS_LABELS,
  sickAccrued,
  splitOvertime,
  weekdayOf,
  yearOptions,
} from "@/lib/time";
import { exportCsv } from "@/lib/csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const orgQ = useQuery({
    queryKey: ["org-standard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_settings")
        .select("standard_daily_hours, accountant_email")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const standard = Number(orgQ.data?.standard_daily_hours ?? 8.6);
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
    const segs = (dataQ.data?.entries ?? []).filter((x) => x.work_date === d);
    const hrs = (dataQ.data?.projectHours ?? []).filter((x) => x.work_date === d);
    const attendance = dayHours(segs);
    return { date: d, segs, hrs, attendance, holiday: holidayFor(d) };
  });

  const totals = rows.reduce(
    (acc, r) => {
      const s = splitOvertime(r.attendance, standard);
      acc.total += r.attendance;
      acc.regular += s.regular;
      acc.ot125 += s.ot125;
      acc.ot150 += s.ot150;
      if (r.attendance > 0) acc.workDays += 1;
      if (r.segs.some((s) => s.absence_type)) acc.absences += 1;
      return acc;
    },
    { total: 0, regular: 0, ot125: 0, ot150: 0, workDays: 0, absences: 0 },
  );

  const byProject = new Map<string, number>();
  rows.forEach((r) =>
    r.hrs.forEach((h) =>
      byProject.set(h.project_id, (byProject.get(h.project_id) ?? 0) + Number(h.hours)),
    ),
  );

  const staffName =
    target === "me"
      ? profile?.full_name || profile?.email
      : staffQ.data?.find((s) => s.id === target)?.full_name;

  const staffLabel = (id: string) => {
    const s = staffQ.data?.find((x) => x.id === id);
    return s?.full_name || s?.email || "עובד";
  };

  // Vacation / sick balances for the viewed employee (year-to-date).
  const balancesQ = useQuery({
    queryKey: ["balances", userId, year],
    enabled: Boolean(userId) && !isAll,
    queryFn: async () => {
      const [prof, abs] = await Promise.all([
        supabase
          .from("profiles")
          .select("hire_date, vacation_quota")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("time_entries")
          .select("absence_type")
          .eq("user_id", userId)
          .gte("work_date", `${year}-01-01`)
          .lte("work_date", `${year}-12-31`)
          .not("absence_type", "is", null),
      ]);
      if (prof.error) throw prof.error;
      if (abs.error) throw abs.error;
      const counts: Record<string, number> = {};
      (abs.data ?? []).forEach((e) => {
        if (e.absence_type) counts[e.absence_type] = (counts[e.absence_type] ?? 0) + 1;
      });
      return { profile: prof.data, counts };
    },
  });
  const vacationUsed =
    (balancesQ.data?.counts["vacation"] ?? 0) + (balancesQ.data?.counts["choice_day"] ?? 0);
  const sickUsed = balancesQ.data?.counts["sick"] ?? 0;
  const vacationQuota = Number(balancesQ.data?.profile?.vacation_quota ?? 0);
  const sickPool = sickAccrued(balancesQ.data?.profile?.hire_date);

  // Submission status of the viewed employee's month + admin approvals list.
  const monthFirst = monthFirstIso(year, month);
  const qc = useQueryClient();
  const reportsQ = useQuery({
    queryKey: ["monthly-reports", monthFirst],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .eq("month", monthFirst);
      if (error) throw error;
      return data ?? [];
    },
  });
  const viewedReport = reportsQ.data?.find((r) => r.user_id === userId) ?? null;
  const decide = useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: string;
      status: "approved" | "returned";
      note?: string;
    }) => {
      const { error } = await supabase
        .from("monthly_reports")
        .update({
          status,
          manager_note: note || null,
          decided_at: new Date().toISOString(),
          decided_by: user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "הדוח אושר" : "הדוח הוחזר לתיקון");
      qc.invalidateQueries({ queryKey: ["monthly-reports"] });
    },
    onError: () => toast.error("עדכון הדוח נכשל"),
  });
  const [returnNotes, setReturnNotes] = useState<Record<string, string>>({});

  const exportPersonal = () =>
    exportCsv(
      `report-${staffName ?? "me"}-${year}-${String(month + 1).padStart(2, "0")}`,
      ["תאריך", "יום", "כניסה", "יציאה", "הפסקה (דק')", "שעות", "היעדרות", "פרויקטים", "חג/מועד"],
      rows.map((r) => [
        r.date,
        weekdayOf(r.date),
        r.segs.map((s) => trimTime(s.clock_in).slice(0, 5)).join(" | "),
        r.segs.map((s) => trimTime(s.clock_out).slice(0, 5) || "חסרה").join(" | "),
        r.segs.reduce((s, x) => s + (x.break_minutes ?? 0), 0),
        r.attendance ? r.attendance.toFixed(2) : "",
        r.segs
          .map((s) => absenceLabel(s.absence_type))
          .filter(Boolean)
          .join(" | "),
        r.hrs.map((h) => `${projectCode(h.project_id)} ${Number(h.hours).toFixed(2)}`).join(" | "),
        r.holiday?.name ?? "",
      ]),
    );

  const summary = useMemo(() => {
    if (!isAll || !allQ.data) return null;
    const perEmployee = new Map<
      string,
      { attendance: number; project: number; absences: number }
    >();
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
          {!isAll && (
            <Button variant="outline" onClick={exportPersonal}>
              <Download className="size-4" />
              ייצוא לאקסל
            </Button>
          )}
          {isAll && isAdmin && (
            <Button
              variant="outline"
              onClick={() => {
                const to = orgQ.data?.accountant_email ?? "";
                const subject = encodeURIComponent(`דוח שעות מרכז – ${MONTH_NAMES[month]} ${year}`);
                const body = encodeURIComponent(
                  `שלום,\n\nמצורף סיכום דוח השעות לחודש ${MONTH_NAMES[month]} ${year}.\n` +
                    (summary
                      ? `סה"כ שעות נוכחות: ${fmtHours(summary.totalAttendance)}\n` +
                        `סה"כ שעות בפרויקטים: ${fmtHours(summary.totalProject)}\n` +
                        `עובדים מדווחים: ${summary.employees.length}\n\n` +
                        summary.employees
                          .map(
                            ([uid, v]) =>
                              `${staffLabel(uid)}: ${fmtHours(v.attendance)} שעות, ${v.absences} ימי היעדרות`,
                          )
                          .join("\n")
                      : "") +
                    `\n\nאת הפירוט המלא ניתן להפיק מהמערכת (הדפסה / ייצוא לאקסל).`,
                );
                window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
              }}
            >
              <Mail className="size-4" />
              שליחה לרו״ח
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה / שמירה כ‑PDF
          </Button>
        </div>
      </div>

      {isAdmin && (
        <section className="no-print rounded-xl border border-border bg-card print:hidden">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-semibold">
              דוחות שהוגשו – {MONTH_NAMES[month]} {year}
            </h2>
            <span className="text-sm text-muted-foreground">
              {(reportsQ.data ?? []).filter((r) => r.status === "submitted").length} ממתינים לאישור
            </span>
          </div>
          {(reportsQ.data ?? []).length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              אף עובד עדיין לא הגיש דוח לחודש זה.
            </p>
          ) : (
            <table className="w-full border-t border-border text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th scope="col" className="p-3 text-start">
                    עובד/ת
                  </th>
                  <th scope="col" className="p-3 text-start">
                    סטטוס
                  </th>
                  <th scope="col" className="p-3 text-start">
                    הוגש בתאריך
                  </th>
                  <th scope="col" className="p-3 text-start">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {(reportsQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 font-medium">
                      <button
                        className="underline-offset-2 hover:underline"
                        onClick={() => setTarget(r.user_id)}
                      >
                        {staffLabel(r.user_id)}
                      </button>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "default"
                            : r.status === "returned"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {REPORT_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">
                      {new Date(r.submitted_at).toLocaleDateString("he-IL")}
                    </td>
                    <td className="p-3">
                      {r.status === "submitted" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                          >
                            <Check className="size-4" />
                            אישור
                          </Button>
                          <Input
                            className="w-48"
                            placeholder="סיבת החזרה (חובה)"
                            aria-label="סיבת החזרה"
                            value={returnNotes[r.id] ?? ""}
                            onChange={(e) =>
                              setReturnNotes((n) => ({ ...n, [r.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending || !(returnNotes[r.id] ?? "").trim()}
                            onClick={() =>
                              decide.mutate({
                                id: r.id,
                                status: "returned",
                                note: returnNotes[r.id],
                              })
                            }
                          >
                            <Undo2 className="size-4" />
                            החזרה לתיקון
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {r.manager_note ? `הערה: ${r.manager_note}` : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

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
                    <th scope="col" className="p-2 text-start">
                      עובד/ת
                    </th>
                    <th scope="col" className="p-2 text-start">
                      שעות נוכחות
                    </th>
                    <th scope="col" className="p-2 text-start">
                      שעות בפרויקטים
                    </th>
                    <th scope="col" className="p-2 text-start">
                      פער
                    </th>
                    <th scope="col" className="p-2 text-start">
                      ימי היעדרות
                    </th>
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
                    <th scope="col" className="p-2 text-start">
                      פרויקט
                    </th>
                    <th scope="col" className="p-2 text-start">
                      סה״כ שעות
                    </th>
                    <th scope="col" className="p-2 text-start">
                      פירוט לפי עובד
                    </th>
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
            <div className="mt-1 flex items-center gap-3">
              <p className="text-sm text-muted-foreground">עובד/ת: {staffName}</p>
              {viewedReport && (
                <Badge
                  variant={
                    viewedReport.status === "approved"
                      ? "default"
                      : viewedReport.status === "returned"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {REPORT_STATUS_LABELS[viewedReport.status] ?? viewedReport.status}
                </Badge>
              )}
            </div>
          </header>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <Summary label="סה״כ שעות" value={fmtHours(totals.total)} />
            <Summary label="שעות רגילות" value={fmtHours(totals.regular)} />
            <Summary label="נוספות 125%" value={fmtHours(totals.ot125)} />
            <Summary label="נוספות 150%" value={fmtHours(totals.ot150)} />
            <Summary label="ימי עבודה" value={String(totals.workDays)} />
            <Summary label="ימי היעדרות" value={String(totals.absences)} />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Summary
              label={`חופשה נוצלה ${year}`}
              value={`${vacationUsed}${vacationQuota ? ` / ${vacationQuota}` : ""}`}
            />
            <Summary
              label="יתרת חופשה"
              value={vacationQuota ? String(Math.max(0, vacationQuota - vacationUsed)) : "—"}
            />
            <Summary label={`מחלה נוצלה ${year}`} value={String(sickUsed)} />
            <Summary
              label="יתרת מחלה צבורה"
              value={
                sickPool === null
                  ? "—"
                  : String(Math.max(0, Math.round((sickPool - sickUsed) * 10) / 10))
              }
            />
          </div>

          <table className="w-full text-sm">
            <caption className="mb-2 text-start font-semibold">פירוט יומי</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-2 text-start">
                  תאריך
                </th>
                <th scope="col" className="p-2 text-start">
                  יום
                </th>
                <th scope="col" className="p-2 text-start">
                  כניסה
                </th>
                <th scope="col" className="p-2 text-start">
                  יציאה
                </th>
                <th scope="col" className="p-2 text-start">
                  הפסקה
                </th>
                <th scope="col" className="p-2 text-start">
                  שעות
                </th>
                <th scope="col" className="p-2 text-start">
                  היעדרות
                </th>
                <th scope="col" className="p-2 text-start">
                  מס׳ פרויקט
                </th>
                <th scope="col" className="p-2 text-start">
                  הערות
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.date}
                  className={`border-t border-border ${r.holiday?.restDay ? "holiday-row" : ""}`}
                >
                  <td className="p-2">
                    {r.date.slice(8)}/{r.date.slice(5, 7)}
                  </td>
                  <td className="p-2">{weekdayOf(r.date)}</td>
                  <td className="p-2">
                    {r.segs.length === 0
                      ? "—"
                      : r.segs.map((s) => (
                          <span
                            key={s.id}
                            className={`block ${s.manually_edited ? "font-semibold text-destructive" : ""}`}
                          >
                            {trimTime(s.clock_in) || "—"}
                            {isAdmin && s.manually_edited && (
                              <span className="block text-xs font-normal text-destructive">
                                במקור: {trimTime(s.original_clock_in ?? null) || "ללא"}
                              </span>
                            )}
                          </span>
                        ))}
                  </td>
                  <td className="p-2">
                    {r.segs.length === 0
                      ? "—"
                      : r.segs.map((s) => (
                          <span
                            key={s.id}
                            className={`block ${s.manually_edited || !s.clock_out ? "font-semibold text-destructive" : ""}`}
                          >
                            {trimTime(s.clock_out) || (s.clock_in ? "חסרה יציאה" : "—")}
                            {isAdmin && s.manually_edited && (
                              <span className="block text-xs font-normal text-destructive">
                                במקור: {trimTime(s.original_clock_out ?? null) || "ללא"}
                              </span>
                            )}
                          </span>
                        ))}
                  </td>
                  <td className="p-2">
                    {r.segs.length === 0
                      ? 0
                      : r.segs.map((s) => (
                          <span
                            key={s.id}
                            className={`block ${s.manually_edited ? "font-semibold text-destructive" : ""}`}
                          >
                            {s.break_minutes ?? 0}
                            {isAdmin && s.manually_edited && (
                              <span className="block text-xs font-normal text-destructive">
                                במקור: {s.original_break_minutes ?? 0}
                              </span>
                            )}
                          </span>
                        ))}
                  </td>
                  <td className="p-2">
                    {r.attendance ? fmtHours(r.attendance) : "—"}
                    {r.segs.length > 1 && (
                      <span className="block text-xs text-muted-foreground">
                        {r.segs.length} מקטעים
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.segs
                      .map((s) => absenceLabel(s.absence_type))
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
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
                <th scope="col" className="p-2 text-start">
                  פרויקט
                </th>
                <th scope="col" className="p-2 text-start">
                  שעות
                </th>
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
