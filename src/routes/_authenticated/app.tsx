import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LogIn, LogOut, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchMonthEntries, fetchProjectDirectory, trimTime, type TimeEntry } from "@/lib/queries";
import {
  ABSENCE_TYPES,
  absenceLabel,
  computeHours,
  fmtHours,
  iso,
  monthRange,
  MONTH_NAMES,
  nowTime,
  todayIso,
  weekdayOf,
} from "@/lib/time";
import { Button } from "@/components/ui/button";
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

type DayRow = { project_id: string; hours: string; description: string; id?: string };

function TimesheetPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [editDate, setEditDate] = useState<string | null>(null);

  const range = useMemo(() => monthRange(year, month), [year, month]);
  const userId = user?.id ?? "";

  const projectsQ = useQuery({ queryKey: ["projects-dir"], queryFn: fetchProjectDirectory });
  const monthQ = useQuery({
    queryKey: ["month", userId, range.start],
    queryFn: () => fetchMonthEntries(userId, range.start, range.end),
    enabled: Boolean(userId),
  });

  const days = useMemo(() => {
    const list: string[] = [];
    for (let d = 1; d <= range.days; d++) {
      list.push(iso(new Date(Date.UTC(year, month, d))));
    }
    return list;
  }, [range.days, year, month]);

  const entryByDate = useMemo(() => {
    const map = new Map<string, TimeEntry>();
    monthQ.data?.entries.forEach((e) => map.set(e.work_date, e));
    return map;
  }, [monthQ.data]);

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
      const e = entryByDate.get(d);
      if (e?.absence_type) absences += 1;
      attendance += computeHours(trimTime(e?.clock_in ?? null), trimTime(e?.clock_out ?? null), e?.break_minutes ?? 0);
      projects += hoursByDate.get(d) ?? 0;
    });
    return { attendance, projects, absences };
  }, [days, entryByDate, hoursByDate]);

  const clockMutation = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      const date = todayIso();
      const existing = entryByDate.get(date);
      const payload =
        kind === "in"
          ? { clock_in: nowTime() }
          : { clock_out: nowTime() };
      if (existing) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .insert({ user_id: userId, work_date: date, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: (_d, kind) => {
      toast.success(kind === "in" ? "נרשמה כניסה" : "נרשמה יציאה");
      qc.invalidateQueries({ queryKey: ["month"] });
    },
    onError: () => toast.error("שמירת הדיווח נכשלה"),
  });

  const todayEntry = entryByDate.get(todayIso());

  const [manual, setManual] = useState({ date: todayIso(), in: "", out: "", brk: "0" });
  const manualSave = useMutation({
    mutationFn: async () => {
      if (!manual.date || (!manual.in && !manual.out)) throw new Error("missing");
      const existing = entryByDate.get(manual.date);
      const payload = {
        clock_in: manual.in || null,
        clock_out: manual.out || null,
        break_minutes: Number(manual.brk) || 0,
      };
      if (existing) {
        const { error } = await supabase.from("time_entries").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("time_entries")
          .insert({ user_id: userId, work_date: manual.date, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("השעות נשמרו");
      qc.invalidateQueries({ queryKey: ["month"] });
    },
    onError: () => toast.error("הזנת השעות נכשלה – יש למלא תאריך ולפחות שעת כניסה או יציאה"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">דיווח שעות</h1>
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
              <SelectContent>
                {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
                  (y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 md:col-span-2">
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">שעון נוכחות – היום</h2>
          <p className="mb-4 text-lg font-semibold">
            {todayEntry?.clock_in ? `כניסה ${trimTime(todayEntry.clock_in)}` : "טרם נרשמה כניסה"}
            {todayEntry?.clock_out ? ` · יציאה ${trimTime(todayEntry.clock_out)}` : ""}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => clockMutation.mutate("in")} disabled={clockMutation.isPending}>
              <LogIn className="size-4" />
              כניסה
            </Button>
            <Button
              variant="outline"
              onClick={() => clockMutation.mutate("out")}
              disabled={clockMutation.isPending}
            >
              <LogOut className="size-4" />
              יציאה
            </Button>
            <Button variant="secondary" onClick={() => setEditDate(todayIso())}>
              עריכת היום ופירוק לפרויקטים
            </Button>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">הזנה ידנית של שעות</h3>
            <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="m-date" className="text-xs">תאריך</Label>
                <Input
                  id="m-date"
                  type="date"
                  value={manual.date}
                  onChange={(e) => setManual({ ...manual, date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="m-in" className="text-xs">כניסה</Label>
                <Input
                  id="m-in"
                  type="time"
                  value={manual.in}
                  onChange={(e) => setManual({ ...manual, in: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="m-out" className="text-xs">יציאה</Label>
                <Input
                  id="m-out"
                  type="time"
                  value={manual.out}
                  onChange={(e) => setManual({ ...manual, out: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="m-brk" className="text-xs">הפסקה (דק׳)</Label>
                <Input
                  id="m-brk"
                  type="number"
                  min="0"
                  value={manual.brk}
                  onChange={(e) => setManual({ ...manual, brk: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" onClick={() => manualSave.mutate()} disabled={manualSave.isPending}>
                  שמירה ידנית
                </Button>
              </div>
            </div>
          </div>
        </div>
        <StatCard title="סה״כ שעות נוכחות" value={fmtHours(totals.attendance)} />
        <StatCard
          title="שעות משויכות לפרויקטים"
          value={fmtHours(totals.projects)}
          warn={Math.abs(totals.attendance - totals.projects) > 0.5}
        />
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">טבלת דיווח חודשי</caption>
          <thead className="bg-muted/60 text-start">
            <tr>
              <th scope="col" className="p-3 text-start">תאריך</th>
              <th scope="col" className="p-3 text-start">יום</th>
              <th scope="col" className="p-3 text-start">כניסה</th>
              <th scope="col" className="p-3 text-start">יציאה</th>
              <th scope="col" className="p-3 text-start">הפסקה (דק׳)</th>
              <th scope="col" className="p-3 text-start">שעות נוכחות</th>
              <th scope="col" className="p-3 text-start">שעות פרויקטים</th>
              <th scope="col" className="p-3 text-start">היעדרות</th>
              <th scope="col" className="p-3 text-start">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const e = entryByDate.get(d);
              const attendance = computeHours(
                trimTime(e?.clock_in ?? null),
                trimTime(e?.clock_out ?? null),
                e?.break_minutes ?? 0,
              );
              const proj = hoursByDate.get(d) ?? 0;
              const mismatch = attendance > 0 && Math.abs(attendance - proj) > 0.5;
              const weekend = ["שישי", "שבת"].includes(weekdayOf(d));
              return (
                <tr
                  key={d}
                  className={`border-t border-border ${weekend ? "bg-muted/30" : ""}`}
                >
                  <td className="p-3">{d.slice(8)}/{d.slice(5, 7)}</td>
                  <td className="p-3">{weekdayOf(d)}</td>
                  <td className="p-3">{trimTime(e?.clock_in ?? null) || "—"}</td>
                  <td className="p-3">{trimTime(e?.clock_out ?? null) || "—"}</td>
                  <td className="p-3">{e?.break_minutes ?? 0}</td>
                  <td className="p-3 font-medium">{attendance ? fmtHours(attendance) : "—"}</td>
                  <td className={`p-3 ${mismatch ? "text-destructive" : ""}`}>
                    {proj ? fmtHours(proj) : "—"}
                    {mismatch && (
                      <AlertTriangle className="ms-1 inline size-3.5" aria-label="פער בין נוכחות לשעות פרויקט" />
                    )}
                  </td>
                  <td className="p-3">{absenceLabel(e?.absence_type) || "—"}</td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => setEditDate(d)}>
                      עריכה
                    </Button>
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
      <p className={`mt-2 text-2xl font-bold ${warn ? "text-destructive" : ""}`}>{value}</p>
      {warn && <p className="mt-1 text-xs text-destructive">קיים פער מול שעות הנוכחות</p>}
    </div>
  );
}

function DayEditor({
  date,
  userId,
  projects,
  onClose,
}: {
  date: string;
  userId: string;
  projects: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
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

  if (dayQ.data && form === null) {
    setForm({
      clock_in: trimTime(dayQ.data.entry?.clock_in ?? null),
      clock_out: trimTime(dayQ.data.entry?.clock_out ?? null),
      break_minutes: String(dayQ.data.entry?.break_minutes ?? 0),
      absence_type: dayQ.data.entry?.absence_type ?? "none",
      note: dayQ.data.entry?.note ?? "",
    });
    setRows(
      dayQ.data.hours.map((h) => ({
        id: h.id,
        project_id: h.project_id,
        hours: String(h.hours),
        description: h.description ?? "",
      })),
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form || !rows) return;
      const payload = {
        user_id: userId,
        work_date: date,
        clock_in: form.clock_in || null,
        clock_out: form.clock_out || null,
        break_minutes: Number(form.break_minutes) || 0,
        absence_type: form.absence_type === "none" ? null : form.absence_type,
        note: form.note || null,
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

      const valid = rows.filter((r) => r.project_id && Number(r.hours) > 0);
      if (valid.length) {
        const { error: insErr } = await supabase.from("project_hours").insert(
          valid.map((r) => ({
            user_id: userId,
            work_date: date,
            project_id: r.project_id,
            hours: Number(r.hours),
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
    onError: () => toast.error("שמירת הדיווח נכשלה"),
  });

  const attendance = form ? computeHours(form.clock_in, form.clock_out, Number(form.break_minutes) || 0) : 0;
  const projectTotal = (rows ?? []).reduce((s, r) => s + (Number(r.hours) || 0), 0);

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
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="ci">שעת כניסה</Label>
                <Input
                  id="ci"
                  type="time"
                  value={form.clock_in}
                  onChange={(e) => setForm({ ...form, clock_in: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co">שעת יציאה</Label>
                <Input
                  id="co"
                  type="time"
                  value={form.clock_out}
                  onChange={(e) => setForm({ ...form, clock_out: e.target.value })}
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">הערה</Label>
              <Textarea
                id="note"
                rows={2}
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
                  onClick={() =>
                    setRows([...rows, { project_id: "", hours: "", description: "" }])
                  }
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
                  <div key={idx} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                    <Select
                      value={row.project_id}
                      onValueChange={(v) => {
                        const next = [...rows];
                        next[idx] = { ...row, project_id: v };
                        setRows(next);
                      }}
                    >
                      <SelectTrigger aria-label="בחירת פרויקט">
                        <SelectValue placeholder="בחר פרויקט" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      aria-label="שעות"
                      placeholder="שעות"
                      value={row.hours}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, hours: e.target.value };
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
                  </div>
                ))}
              </div>

              <p
                className={`mt-3 text-sm ${
                  attendance > 0 && Math.abs(attendance - projectTotal) > 0.5
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                שעות נוכחות: {fmtHours(attendance)} · שעות פרויקטים: {fmtHours(projectTotal)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="size-4" />
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}