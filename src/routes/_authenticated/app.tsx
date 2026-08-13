import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Coffee,
  LogIn,
  LogOut,
  Plus,
  Play,
  Save,
  Send,
  Square,
  Timer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { holidayFor } from "@/lib/holidays";
import {
  dayHours,
  fetchMonthEntries,
  fetchProjectDirectory,
  groupByDate,
  isOpenSegment,
  segmentHours,
  trimTime,
  type TimeEntry,
} from "@/lib/queries";
import {
  ABSENCE_TYPES,
  absenceLabel,
  computeHours,
  elapsedLabel,
  fmtDate,
  fmtHours,
  durationToHours,
  hoursGap,
  hoursToDuration,
  isDateLocked,
  isPeriodLocked,
  iso,
  maskDurationInput,
  maskTimeInput,
  monthFirstIso,
  monthRange,
  MONTH_NAMES,
  normalizeTime,
  nowTime,
  periodLockDate,
  REPORT_LOCK_DAYS,
  REPORT_STATUS_LABELS,
  todayIso,
  weekdayOf,
  yearOptions,
} from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectPicker } from "@/components/ProjectPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "דיווח שעות | ניהול שעות ופרויקטים" },
      { name: "description", content: "שעון נוכחות, היעדרויות ופירוק שעות לפי פרויקט." },
      { property: "og:title", content: "דיווח שעות" },
      { property: "og:description", content: "כניסה, יציאה ופירוק שעות לפרויקטים." },
    ],
  }),
  component: TimesheetPage,
});

/** `hours` is kept as an "HH:MM" duration string in the form. */
type DayRow = { project_id: string; hours: string; description: string; id?: string };

/** 24h text field, normalized to HH:MM. */
function TimeField({
  id,
  value,
  onChange,
  ...rest
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  "aria-label"?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      dir="ltr"
      className="text-center tabular-nums"
      placeholder="HH:MM"
      value={value}
      onChange={(e) => onChange(maskTimeInput(e.target.value))}
      onBlur={(e) => onChange(normalizeTime(e.target.value))}
      {...rest}
    />
  );
}

type ManualMeta = {
  manually_edited: boolean;
  manual_edited_at: string;
  original_clock_in: string | null;
  original_clock_out: string | null;
  original_break_minutes: number | null;
};

/** Snapshot of the pre-edit values, kept only for the first manual change. */
function manualMeta(existing: Partial<TimeEntry> | null | undefined): ManualMeta {
  return {
    manually_edited: true,
    manual_edited_at: new Date().toISOString(),
    original_clock_in: existing?.manually_edited
      ? (existing.original_clock_in ?? null)
      : (existing?.clock_in ?? null),
    original_clock_out: existing?.manually_edited
      ? (existing.original_clock_out ?? null)
      : (existing?.clock_out ?? null),
    original_break_minutes: existing?.manually_edited
      ? (existing.original_break_minutes ?? null)
      : (existing?.break_minutes ?? null),
  };
}

function minutesBetween(from: string, to: string) {
  const [h1, m1, s1 = 0] = from.split(":").map(Number);
  const [h2, m2, s2 = 0] = to.split(":").map(Number);
  let sec = h2 * 3600 + m2 * 60 + s2 - (h1 * 3600 + m1 * 60 + s1);
  if (sec < 0) sec += 86400;
  return Math.max(0, Math.round(sec / 60));
}

/** Re-render every 30s so the live clock/timer labels stay fresh. */
function useTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
}

function TimesheetPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editDate, setEditDate] = useState<string | null>(null);
  useTick();

  const range = useMemo(() => monthRange(year, month), [year, month]);
  const userId = user?.id ?? "";
  const lockDeadline = periodLockDate(year, month);
  const monthFirst = monthFirstIso(year, month);

  const projectsQ = useQuery({ queryKey: ["projects-dir"], queryFn: fetchProjectDirectory });
  const monthQ = useQuery({
    queryKey: ["month", userId, range.start],
    queryFn: () => fetchMonthEntries(userId, range.start, range.end),
    enabled: Boolean(userId),
  });
  const reportQ = useQuery({
    queryKey: ["monthly-report", userId, monthFirst],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .eq("user_id", userId)
        .eq("month", monthFirst)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const timerQ = useQuery({
    queryKey: ["active-timer", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_timers")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const reportStatus = reportQ.data?.status ?? null;
  const submittedLock = reportStatus === "submitted" || reportStatus === "approved";
  const monthLocked = isPeriodLocked(year, month, isAdmin) || (!isAdmin && submittedLock);

  const days = useMemo(() => {
    const list: string[] = [];
    for (let d = 1; d <= range.days; d++) {
      list.push(iso(new Date(Date.UTC(year, month, d))));
    }
    return list;
  }, [range.days, year, month]);

  const segsByDate = useMemo(() => groupByDate(monthQ.data?.entries), [monthQ.data]);

  const hoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    monthQ.data?.projectHours.forEach((h) =>
      map.set(h.work_date, (map.get(h.work_date) ?? 0) + Number(h.hours)),
    );
    return map;
  }, [monthQ.data]);

  const totals = useMemo(() => {
    let attendance = 0;
    let projects = 0;
    let absences = 0;
    days.forEach((d) => {
      const segs = segsByDate.get(d) ?? [];
      if (segs.some((e) => e.absence_type)) absences += 1;
      attendance += dayHours(segs);
      projects += hoursByDate.get(d) ?? 0;
    });
    return { attendance, projects, absences };
  }, [days, segsByDate, hoursByDate]);

  /** ימים עם מקטע פתוח (כניסה בלי יציאה) שדורש השלמה. מקטע פעיל של עכשיו אינו נחשב. */
  const missingOut = useMemo(() => {
    const today = todayIso();
    return days.filter((d) => {
      if (d > today) return false;
      const open = (segsByDate.get(d) ?? []).filter(isOpenSegment);
      // ביום שעבר – כל מקטע פתוח חסר יציאה. היום – מקטע אחד פתוח הוא המשמרת הנוכחית.
      return d < today ? open.length > 0 : open.length > 1;
    });
  }, [days, segsByDate]);

  const todaySegs = useMemo(() => segsByDate.get(todayIso()) ?? [], [segsByDate]);
  const openSeg = useMemo(() => [...todaySegs].reverse().find(isOpenSegment) ?? null, [todaySegs]);
  const onBreak = Boolean(openSeg?.break_start);
  const todayBreakMinutes = todaySegs.reduce((s, e) => s + (e.break_minutes ?? 0), 0);

  const clockMutation = useMutation({
    mutationFn: async (kind: "in" | "out" | "break-start" | "break-end") => {
      const date = todayIso();
      const existing = openSeg;
      let payload: {
        clock_in?: string;
        clock_out?: string;
        break_minutes?: number;
        break_start?: string | null;
      } = {};
      if (kind === "in") {
        if (existing) throw new Error("open-segment");
        const { error } = await supabase
          .from("time_entries")
          .insert({ user_id: userId, work_date: date, clock_in: nowTime() });
        if (error) throw error;
        return;
      }
      if (!existing) throw new Error("no-open-segment");
      if (kind === "out") {
        payload = { clock_out: nowTime() };
        // Close a forgotten open break on clock-out
        if (existing.break_start) {
          payload.break_minutes =
            (existing.break_minutes ?? 0) +
            minutesBetween(trimTime(existing.break_start), nowTime());
          payload.break_start = null;
        }
      } else if (kind === "break-start") {
        payload = { break_start: nowTime() };
      } else {
        const start = existing.break_start;
        if (!start) throw new Error("no-break");
        payload = {
          break_minutes: (existing.break_minutes ?? 0) + minutesBetween(trimTime(start), nowTime()),
          break_start: null,
        };
      }
      const { error } = await supabase.from("time_entries").update(payload).eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: (_d, kind) => {
      toast.success(
        kind === "in"
          ? "נרשמה כניסה – נפתח מקטע חדש"
          : kind === "out"
            ? "נרשמה יציאה – המקטע נסגר"
            : kind === "break-start"
              ? "יצאת להפסקה"
              : "חזרת מהפסקה – ההפסקה נרשמה",
      );
      qc.invalidateQueries({ queryKey: ["month"] });
      qc.invalidateQueries({ queryKey: ["day"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "open-segment"
          ? "יש מקטע פתוח – יש לרשום יציאה לפני כניסה חדשה"
          : e.message === "no-open-segment"
            ? "אין מקטע פתוח – יש לרשום כניסה תחילה"
            : "שמירת הדיווח נכשלה",
      ),
  });

  const timerMutation = useMutation({
    mutationFn: async (arg: { action: "start"; projectId: string } | { action: "stop" }) => {
      if (arg.action === "start") {
        const { error } = await supabase.from("active_timers").upsert({
          user_id: userId,
          project_id: arg.projectId,
          started_at: new Date().toISOString(),
        });
        if (error) throw error;
        return null;
      }
      const t = timerQ.data;
      if (!t) return null;
      const hours =
        Math.round(((Date.now() - new Date(t.started_at).getTime()) / 3600000) * 100) / 100;
      if (hours >= 0.02) {
        const { error: insErr } = await supabase.from("project_hours").insert({
          user_id: userId,
          project_id: t.project_id,
          work_date: todayIso(),
          hours,
          description: "טיימר",
        });
        if (insErr) throw insErr;
      }
      const { error } = await supabase.from("active_timers").delete().eq("user_id", userId);
      if (error) throw error;
      return hours;
    },
    onSuccess: (hours, arg) => {
      if (arg.action === "start") toast.success("הטיימר הופעל");
      else
        toast.success(
          hours && hours >= 0.02
            ? `הטיימר נעצר – נרשמו ${hoursToDuration(hours)} שעות לפרויקט`
            : "הטיימר נעצר (פחות מדקה – לא נרשם)",
        );
      qc.invalidateQueries({ queryKey: ["active-timer"] });
      qc.invalidateQueries({ queryKey: ["month"] });
    },
    onError: () => toast.error("פעולת הטיימר נכשלה"),
  });

  const submitMonth = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId,
        month: monthFirst,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
      };
      const { error } = await supabase
        .from("monthly_reports")
        .upsert(payload, { onConflict: "user_id,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הדוח החודשי הוגש לאישור המנהל");
      qc.invalidateQueries({ queryKey: ["monthly-report"] });
    },
    onError: () => toast.error("הגשת הדוח נכשלה"),
  });

  const [timerProject, setTimerProject] = useState("");
  const activeTimer = timerQ.data;
  const timerProjectName = activeTimer
    ? projectsQ.data?.find((p) => p.id === activeTimer.project_id)
    : null;

  const workedSince = openSeg?.clock_in
    ? elapsedLabel(`${todayIso()}T${trimTime(openSeg.clock_in)}`)
    : null;

  const todayRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    todayRowRef.current?.scrollIntoView({ block: "center" });
  }, [monthQ.isSuccess]);

  const statusBadge = reportStatus && (
    <Badge
      variant={
        reportStatus === "approved"
          ? "default"
          : reportStatus === "returned"
            ? "destructive"
            : "secondary"
      }
    >
      {REPORT_STATUS_LABELS[reportStatus] ?? reportStatus}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">דיווח שעות</h1>
            {statusBadge}
          </div>
          <p className="text-sm text-muted-foreground">
            שעון נוכחות, היעדרויות ופירוק השעות לפרויקטים
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="month">חודש</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger id="month" className="w-36">
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
            <Label htmlFor="year">שנה</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="year" className="w-28">
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
        </div>
      </div>

      {missingOut.length > 0 && (
        <div role="alert" className="rounded-xl border-2 border-warning/60 bg-warning/10 p-4">
          <p className="font-semibold">
            <AlertTriangle className="ms-0 me-2 inline size-4 text-warning" aria-hidden />
            {missingOut.length === 1
              ? `ביום ${fmtDate(missingOut[0])} נרשמה כניסה ללא יציאה.`
              : `ב‑${missingOut.length} ימים נרשמה כניסה ללא יציאה.`}{" "}
            יש להשלים את שעת היציאה כדי שהשעות ייספרו.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missingOut.slice(0, 5).map((d) => (
              <Button key={d} size="sm" variant="outline" onClick={() => setEditDate(d)}>
                השלמת {fmtDate(d)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {reportStatus === "returned" && reportQ.data?.manager_note && (
        <div
          role="alert"
          className="rounded-xl border-2 border-destructive/50 bg-destructive/10 p-4"
        >
          <p className="font-semibold text-destructive">הדוח הוחזר לתיקון על ידי המנהל:</p>
          <p className="mt-1 text-sm">{reportQ.data.manager_note}</p>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        {monthLocked && (
          <div
            role="status"
            className="rounded-xl border-2 border-destructive/50 bg-destructive/10 p-4 md:col-span-4"
          >
            <p className="text-base font-semibold text-destructive">
              {submittedLock
                ? `הדוח של ${MONTH_NAMES[month]} ${year} הוגש ${reportStatus === "approved" ? "ואושר" : "וממתין לאישור"} – לא ניתן לערוך.`
                : `תקופת הדיווח של ${MONTH_NAMES[month]} ${year} נעולה לשינויים.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {submittedLock
                ? "לתיקון יש לבקש מהמנהל להחזיר את הדוח לעריכה."
                : `ניתן היה לעדכן עד ${fmtDate(lockDeadline)} (${REPORT_LOCK_DAYS} ימים מתחילת החודש העוקב). לתיקון בדיעבד יש לפנות למנהל.`}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 md:col-span-2">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">שעון נוכחות – היום</h2>
          {todaySegs.length === 0 ? (
            <p className="mb-1 text-lg font-semibold">טרם נרשמה כניסה</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {todaySegs.map((s, i) => (
                <li key={s.id} className="text-sm">
                  <span className="font-semibold">מקטע {i + 1}:</span>{" "}
                  <span className="tabular-nums">
                    {trimTime(s.clock_in).slice(0, 5) || "—"} –{" "}
                    {trimTime(s.clock_out).slice(0, 5) || "פתוח"}
                  </span>
                  {s.absence_type && (
                    <span className="ms-2 text-muted-foreground">{absenceLabel(s.absence_type)}</span>
                  )}
                  <span className="ms-2 tabular-nums text-muted-foreground">
                    {segmentHours(s) ? `${hoursToDuration(segmentHours(s))} ש'` : ""}
                  </span>
                </li>
              ))}
              <li className="text-sm font-semibold">
                סה״כ היום:{" "}
                <span className="tabular-nums">{hoursToDuration(dayHours(todaySegs))}</span>
              </li>
            </ul>
          )}
          {workedSince && (
            <p className="mb-3 text-sm text-muted-foreground" dir="rtl">
              בעבודה כבר <span className="font-semibold tabular-nums">{workedSince}</span> שעות
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="min-w-28"
              onClick={() => clockMutation.mutate("in")}
              disabled={clockMutation.isPending || Boolean(openSeg)}
            >
              <LogIn className="size-4" />
              כניסה
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="min-w-28"
              onClick={() => clockMutation.mutate("out")}
              disabled={clockMutation.isPending || !openSeg}
            >
              <LogOut className="size-4" />
              יציאה
            </Button>
            <Button
              variant="outline"
              onClick={() => clockMutation.mutate("break-start")}
              disabled={clockMutation.isPending || onBreak || !openSeg}
            >
              <Coffee className="size-4" />
              יציאה להפסקה
            </Button>
            <Button
              variant="outline"
              onClick={() => clockMutation.mutate("break-end")}
              disabled={clockMutation.isPending || !onBreak}
            >
              <Play className="size-4" />
              חזרה מהפסקה
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {onBreak
              ? `בהפסקה מאז ${trimTime(openSeg?.break_start ?? null).slice(0, 5)} · סה"כ הפסקות היום: ${todayBreakMinutes} דק'`
              : openSeg
                ? `סה"כ הפסקות היום: ${todayBreakMinutes} דק'`
                : `סה"כ הפסקות היום: ${todayBreakMinutes} דק' · אין מקטע פתוח – לחיצה על "כניסה" תפתח מקטע חדש`}
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <Timer className="size-4" aria-hidden />
              טיימר פרויקט
            </h3>
            {activeTimer ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">
                  רץ על{" "}
                  <span className="font-semibold">
                    {timerProjectName
                      ? `${timerProjectName.code} · ${timerProjectName.name}`
                      : "פרויקט"}
                  </span>{" "}
                  ·{" "}
                  <span className="font-semibold tabular-nums">
                    {elapsedLabel(activeTimer.started_at)}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={timerMutation.isPending}
                  onClick={() => timerMutation.mutate({ action: "stop" })}
                >
                  <Square className="size-4" />
                  עצירה ורישום
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-56 flex-1">
                  <ProjectPicker
                    projects={projectsQ.data ?? []}
                    value={timerProject}
                    onChange={setTimerProject}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!timerProject || timerMutation.isPending || monthLocked}
                  onClick={() => timerMutation.mutate({ action: "start", projectId: timerProject })}
                >
                  <Play className="size-4" />
                  התחלה
                </Button>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              בעצירה הזמן נרשם אוטומטית כשעות פרויקט להיום.
            </p>
          </div>

          <Button
            size="lg"
            className="mt-4 w-full text-base font-semibold shadow-md"
            onClick={() => setEditDate(todayIso())}
          >
            עריכת היום ופירוק לפרויקטים
          </Button>
        </div>

        <StatCard title="סה״כ שעות נוכחות" value={fmtHours(totals.attendance)} />
        <div className="flex flex-col gap-4">
          <StatCard
            title="שעות משויכות לפרויקטים"
            value={fmtHours(totals.projects)}
            warn={Math.abs(totals.attendance - totals.projects) > 0.5}
          />
          {!isAdmin && !isPeriodLocked(year, month, isAdmin) && reportStatus !== "approved" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-full"
                  variant={reportStatus === "submitted" ? "outline" : "default"}
                  disabled={submitMonth.isPending || reportStatus === "submitted"}
                >
                  {reportStatus === "submitted" ? (
                    <>
                      <CheckCircle2 className="size-4" />
                      הדוח הוגש
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      הגשת דוח {MONTH_NAMES[month]} לאישור
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    הגשת דוח {MONTH_NAMES[month]} {year}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    לאחר ההגשה לא ניתן יהיה לערוך את הדיווח של החודש עד שהמנהל יאשר או יחזיר לתיקון.
                    סה״כ שעות נוכחות: {fmtHours(totals.attendance)} · שעות פרויקטים:{" "}
                    {fmtHours(totals.projects)}.
                    {missingOut.length > 0 &&
                      ` שים לב: ${missingOut.length} ימים עם כניסה ללא יציאה.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction onClick={() => submitMonth.mutate()}>
                    הגשה לאישור
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </section>

      {/* ===== Mobile: day cards ===== */}
      <section className="space-y-2 md:hidden">
        {days.map((d) => {
          const segs = segsByDate.get(d) ?? [];
          const attendance = dayHours(segs);
          const absence = segs.find((s) => s.absence_type)?.absence_type ?? null;
          const proj = hoursByDate.get(d) ?? 0;
          const holiday = holidayFor(d);
          const isToday = d === todayIso();
          const missing = missingOut.includes(d);
          const empty = segs.length === 0 && !holiday && proj === 0;
          if (empty && d > todayIso()) return null;
          return (
            <button
              key={d}
              onClick={() => setEditDate(d)}
              className={`w-full rounded-xl border p-3 text-start ${
                isToday
                  ? "border-primary bg-secondary/60"
                  : holiday?.restDay
                    ? "holiday-row border-border"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {weekdayOf(d)} {d.slice(8)}/{d.slice(5, 7)}
                  {isToday && <span className="ms-2 text-xs font-normal text-primary">היום</span>}
                </span>
                <span className="text-sm tabular-nums">
                  {attendance ? fmtHours(attendance) : absence ? absenceLabel(absence) : "—"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {segs.map((s) => (
                  <span key={s.id} className="tabular-nums">
                    {trimTime(s.clock_in).slice(0, 5) || "—"}–
                    {trimTime(s.clock_out).slice(0, 5) || "פתוח"}
                  </span>
                ))}
                {segs.length > 1 && <span>{segs.length} מקטעים</span>}
                {missing && <span className="font-semibold text-destructive">חסרה יציאה</span>}
                {proj > 0 && <span>פרויקטים {hoursToDuration(proj)}</span>}
                {holiday && <span>{holiday.name}</span>}
              </div>
            </button>
          );
        })}
      </section>

      {/* ===== Desktop: monthly table ===== */}
      <section className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">טבלת דיווח חודשי</caption>
          <thead className="bg-muted/60 text-start">
            <tr>
              <th scope="col" className="p-3 text-start">
                תאריך
              </th>
              <th scope="col" className="p-3 text-start">
                יום
              </th>
              <th scope="col" className="p-3 text-start">
                כניסה
              </th>
              <th scope="col" className="p-3 text-start">
                יציאה
              </th>
              <th scope="col" className="p-3 text-start">
                הפסקה (דק׳)
              </th>
              <th scope="col" className="p-3 text-start">
                שעות נוכחות
              </th>
              <th scope="col" className="p-3 text-start">
                שעות פרויקטים
              </th>
              <th scope="col" className="p-3 text-start">
                היעדרות
              </th>
              <th scope="col" className="p-3 text-start">
                הערות
              </th>
              <th scope="col" className="p-3 text-start">
                פעולה
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const segs = segsByDate.get(d) ?? [];
              const attendance = dayHours(segs);
              const manual = segs.some((s) => s.manually_edited);
              const absences = segs
                .map((s) => absenceLabel(s.absence_type))
                .filter(Boolean)
                .join(", ");
              const breakTotal = segs.reduce((s, x) => s + (x.break_minutes ?? 0), 0);
              const openCount = segs.filter(isOpenSegment).length;
              const proj = hoursByDate.get(d) ?? 0;
              const mismatch = attendance > 0 && hoursGap(attendance, proj) > 0.5;
              const weekend = ["שישי", "שבת"].includes(weekdayOf(d));
              const holiday = holidayFor(d);
              const isToday = d === todayIso();
              const missing = missingOut.includes(d);
              return (
                <tr
                  key={d}
                  ref={isToday ? todayRowRef : undefined}
                  className={`border-t border-border ${
                    isToday
                      ? "bg-secondary/70 ring-1 ring-inset ring-primary/30"
                      : holiday?.restDay
                        ? "holiday-row"
                        : weekend
                          ? "bg-muted/30"
                          : ""
                  }`}
                >
                  <td className="p-3 tabular-nums">
                    {d.slice(8)}/{d.slice(5, 7)}
                    {isToday && (
                      <span className="ms-2 text-xs font-semibold text-primary">היום</span>
                    )}
                  </td>
                  <td className="p-3">{weekdayOf(d)}</td>
                  <td
                    className={`p-3 tabular-nums ${manual ? "font-semibold text-destructive" : ""}`}
                  >
                    {segs.length === 0
                      ? "—"
                      : segs.map((s) => (
                          <div key={s.id}>{trimTime(s.clock_in).slice(0, 5) || "—"}</div>
                        ))}
                  </td>
                  <td
                    className={`p-3 tabular-nums ${manual ? "font-semibold text-destructive" : ""}`}
                  >
                    {segs.length === 0
                      ? "—"
                      : segs.map((s) => (
                          <div key={s.id}>
                            {trimTime(s.clock_out).slice(0, 5) ||
                              (missing ? (
                                <span className="font-semibold text-destructive">חסרה</span>
                              ) : (
                                <span className="text-muted-foreground">פתוח</span>
                              ))}
                          </div>
                        ))}
                  </td>
                  <td
                    className={`p-3 tabular-nums ${manual ? "font-semibold text-destructive" : ""}`}
                  >
                    {breakTotal}
                  </td>
                  <td className="p-3 font-medium tabular-nums">
                    {attendance ? fmtHours(attendance) : "—"}
                    {segs.length > 1 && (
                      <span className="ms-1 text-xs text-muted-foreground">
                        ({segs.length} מקטעים)
                      </span>
                    )}
                  </td>
                  <td className={`p-3 tabular-nums ${mismatch ? "text-destructive" : ""}`}>
                    {proj ? hoursToDuration(proj) : "—"}
                    {mismatch && (
                      <AlertTriangle
                        className="ms-1 inline size-3.5"
                        aria-label="פער בין נוכחות לשעות פרויקט"
                      />
                    )}
                  </td>
                  <td className="p-3">{absences || "—"}</td>
                  <td className="p-3">
                    {holiday ? (
                      <span className={holiday.restDay ? "font-medium" : "text-muted-foreground"}>
                        {holiday.name}
                        {holiday.restDay ? " (חופשת חג על פי חוק)" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditDate(d)}>
                      {monthLocked ? "צפייה" : "עריכה"}
                    </Button>
                    {openCount > 0 && d < todayIso() && (
                      <span className="ms-1 text-xs font-semibold text-destructive">
                        מקטע לא נסגר
                      </span>
                    )}
                    {manual && (
                      <span className="ms-1 text-xs text-destructive">עודכן ידנית</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editDate && (
        <DayEditor
          date={editDate}
          userId={userId}
          projects={projectsQ.data ?? []}
          locked={isDateLocked(editDate, isAdmin) || (!isAdmin && submittedLock)}
          onClose={() => setEditDate(null)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, warn }: { title: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${warn ? "text-destructive" : ""}`}>
        {value}
      </p>
      {warn && <p className="mt-1 text-xs text-destructive">קיים פער מול שעות הנוכחות</p>}
    </div>
  );
}

function DayEditor({
  date,
  userId,
  projects,
  locked,
  onClose,
}: {
  date: string;
  userId: string;
  projects: Array<{ id: string; code: string; name: string }>;
  locked?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const dayQ = useQuery({
    queryKey: ["day", userId, date],
    queryFn: async () => {
      const [entry, hours] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("user_id", userId)
          .eq("work_date", date)
          .maybeSingle(),
        supabase.from("project_hours").select("*").eq("user_id", userId).eq("work_date", date),
      ]);
      return { entry: entry.data, hours: hours.data ?? [] };
    },
  });

  const [form, setForm] = useState<{
    clock_in: string;
    clock_out: string;
    break_minutes: string;
    absence_type: string;
    note: string;
  } | null>(null);
  const [rows, setRows] = useState<DayRow[] | null>(null);

  // Initialize the form once the day query resolves (proper effect, not render-time setState).
  useEffect(() => {
    if (!dayQ.data) return;
    setForm({
      clock_in: trimTime(dayQ.data.entry?.clock_in ?? null).slice(0, 5),
      clock_out: trimTime(dayQ.data.entry?.clock_out ?? null).slice(0, 5),
      break_minutes: String(dayQ.data.entry?.break_minutes ?? 0),
      absence_type: dayQ.data.entry?.absence_type ?? "none",
      note: dayQ.data.entry?.note ?? "",
    });
    setRows(
      dayQ.data.hours.map((h) => ({
        id: h.id,
        project_id: h.project_id,
        hours: hoursToDuration(Number(h.hours)),
        description: h.description ?? "",
      })),
    );
  }, [dayQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !rows) return;
      if (locked) throw new Error("locked");
      const existing = dayQ.data?.entry as Partial<TimeEntry> | null | undefined;
      const changed =
        (normalizeTime(form.clock_in) || null) !== (existing?.clock_in ?? null) ||
        (normalizeTime(form.clock_out) || null) !== (existing?.clock_out ?? null) ||
        (Number(form.break_minutes) || 0) !== (existing?.break_minutes ?? 0);
      const payload = {
        user_id: userId,
        work_date: date,
        clock_in: normalizeTime(form.clock_in) || null,
        clock_out: normalizeTime(form.clock_out) || null,
        break_minutes: Number(form.break_minutes) || 0,
        absence_type: form.absence_type === "none" ? null : form.absence_type,
        note: form.note || null,
        ...(!isAdmin && changed ? manualMeta(existing) : {}),
      };
      const { error: upErr } = await supabase
        .from("time_entries")
        .upsert(payload, { onConflict: "user_id,work_date" });
      if (upErr) throw upErr;

      const { error: delErr } = await supabase
        .from("project_hours")
        .delete()
        .eq("user_id", userId)
        .eq("work_date", date);
      if (delErr) throw delErr;

      const valid = rows.filter((r) => r.project_id && durationToHours(r.hours) > 0);
      if (valid.length) {
        const { error: insErr } = await supabase.from("project_hours").insert(
          valid.map((r) => ({
            user_id: userId,
            work_date: date,
            project_id: r.project_id,
            hours: durationToHours(r.hours),
            description: r.description || null,
          })),
        );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success("הדיווח נשמר");
      qc.invalidateQueries({ queryKey: ["month"] });
      qc.invalidateQueries({ queryKey: ["day"] });
      onClose();
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "locked"
          ? "תקופת הדיווח נעולה לשינויים – יש לפנות למנהל"
          : "שמירת הדיווח נכשלה",
      ),
  });

  const attendance = form
    ? computeHours(form.clock_in, form.clock_out, Number(form.break_minutes) || 0)
    : 0;
  const projectTotal = (rows ?? []).reduce((s, r) => s + durationToHours(r.hours), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            דיווח ליום {weekdayOf(date)} {date.slice(8)}/{date.slice(5, 7)}/{date.slice(0, 4)}
          </DialogTitle>
        </DialogHeader>

        {form && rows && (
          <div className="space-y-6">
            {locked && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                תקופת הדיווח נעולה – ניתן לצפות בלבד. לעדכון בדיעבד יש לפנות למנהל.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-4">
              <fieldset disabled={locked} className="contents">
                <div className="space-y-2">
                  <Label htmlFor="ci">שעת כניסה</Label>
                  <TimeField
                    id="ci"
                    value={form.clock_in}
                    onChange={(v) => setForm({ ...form, clock_in: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co">שעת יציאה</Label>
                  <TimeField
                    id="co"
                    value={form.clock_out}
                    onChange={(v) => setForm({ ...form, clock_out: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="br">הפסקה (דקות)</Label>
                  <Input
                    id="br"
                    type="number"
                    min={0}
                    value={form.break_minutes}
                    onChange={(e) => setForm({ ...form, break_minutes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ab">היעדרות</Label>
                  <Select
                    value={form.absence_type}
                    onValueChange={(v) => setForm({ ...form, absence_type: v })}
                    disabled={locked}
                  >
                    <SelectTrigger id="ab">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא</SelectItem>
                      {ABSENCE_TYPES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.absence_type === "choice_day" && (
                    <p className="text-xs text-muted-foreground">
                      יום בחירה: על פי חוק חופשה שנתית, עובד רשאי לבחור יום חופשה אחד בשנה באחד
                      מהמועדים הקבועים בתוספת לחוק (למשל צום גדליה, ערב יום כיפור, פורים, יום
                      הזיכרון, ל״ג בעומר, ט׳ באב, ערבי חג ועוד), בהודעה למעסיק 30 ימים מראש. היום
                      מנוכה ממכסת החופשה השנתית.
                    </p>
                  )}
                </div>
              </fieldset>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">הערה</Label>
              <Textarea
                id="note"
                rows={2}
                disabled={locked}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">פירוק שעות לפי פרויקט</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={() => setRows([...rows, { project_id: "", hours: "", description: "" }])}
                >
                  <Plus className="size-4" />
                  הוספת שורה
                </Button>
              </div>
              <div className="space-y-2">
                {rows.length === 0 && (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    לא דווחו שעות לפרויקטים ביום זה.
                  </p>
                )}
                {rows.map((row, idx) => (
                  <fieldset
                    key={idx}
                    disabled={locked}
                    className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]"
                  >
                    <ProjectPicker
                      projects={projects}
                      value={row.project_id}
                      onChange={(v) => {
                        const next = [...rows];
                        next[idx] = { ...row, project_id: v };
                        setRows(next);
                      }}
                    />
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      className="text-center tabular-nums"
                      aria-label="שעות (HH:MM)"
                      placeholder="HH:MM"
                      value={row.hours}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, hours: maskDurationInput(e.target.value) };
                        setRows(next);
                      }}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (!v) return;
                        const next = [...rows];
                        next[idx] = { ...row, hours: hoursToDuration(durationToHours(v)) };
                        setRows(next);
                      }}
                    />
                    <Input
                      aria-label="תיאור המשימה"
                      placeholder="תיאור המשימה"
                      value={row.description}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, description: e.target.value };
                        setRows(next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="מחיקת שורה"
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </fieldset>
                ))}
              </div>

              <p
                className={`mt-3 text-sm ${
                  attendance > 0 && hoursGap(attendance, projectTotal) > 0.5
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                שעות נוכחות: {hoursToDuration(attendance)} · שעות פרויקטים:{" "}
                {hoursToDuration(projectTotal)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {locked ? "סגירה" : "ביטול"}
          </Button>
          {!locked && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" />
              שמירה
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
