import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import {
  daysBetween,
  fmtDate,
  fmtMoney,
  milestoneAmount,
  PROJECT_STATUSES,
  projectStatusLabel,
  todayIso,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "ניהול פרויקטים | ניהול שעות ופרויקטים" },
      { name: "description", content: "הוספת פרויקטים, קודי פרויקט, שכר טרחה ותנאי תשלום." },
      { property: "og:title", content: "ניהול פרויקטים" },
      { property: "og:description", content: "פרויקטים, שכר טרחה, תנאי תשלום ולוחות זמנים." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <ProjectsPage />
    </AdminOnly>
  ),
});

type Milestone = {
  id: string;
  project_id: string;
  title: string;
  amount_type: string;
  amount_value: number;
  due_date: string | null;
  paid_date: string | null;
  paid_amount: number;
  status: string;
  sort_order: number;
};

function ProjectsPage() {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  const projectsQ = useQuery({
    queryKey: ["projects-full"],
    queryFn: async () => {
      const [projects, milestones] = await Promise.all([
        supabase.from("projects").select("*").order("code"),
        supabase.from("project_milestones").select("*").order("sort_order"),
      ]);
      if (projects.error) throw projects.error;
      if (milestones.error) throw milestones.error;
      return { projects: projects.data, milestones: (milestones.data ?? []) as Milestone[] };
    },
  });

  const del = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("projects").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(ids.length > 1 ? `${ids.length} פרויקטים נמחקו` : "הפרויקט נמחק");
      setChecked((c) => c.filter((id) => !ids.includes(id)));
      qc.invalidateQueries({ queryKey: ["projects-full"] });
      qc.invalidateQueries({ queryKey: ["projects-dir"] });
    },
    onError: () => toast.error("מחיקה נכשלה – ייתכן שקיימות שעות מדווחות"),
  });

  const allProjects = projectsQ.data?.projects ?? [];
  const milestones = projectsQ.data?.milestones ?? [];
  const q = search.trim().toLowerCase();
  const projects = allProjects.filter(
    (p) =>
      (statusFilter === "all" || p.status === statusFilter) &&
      (!q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? "").toLowerCase().includes(q)),
  );
  const allChecked = projects.length > 0 && projects.every((p) => checked.includes(p.id));
  const toggle = (id: string) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const checkedProjects = allProjects.filter((p) => checked.includes(p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ניהול פרויקטים</h1>
          <p className="text-sm text-muted-foreground">
            מוצגים {projects.length} מתוך {allProjects.length} פרויקטים · קוד, שכר טרחה, תנאי תשלום ולוחות זמנים
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            הדפסת רשימה
          </Button>
          <ProjectDialog onSaved={() => qc.invalidateQueries({ queryKey: ["projects-full"] })} />
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 print:hidden">
        <Input
          className="w-64"
          aria-label="חיפוש פרויקט"
          placeholder="חיפוש לפי קוד, שם או לקוח"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" aria-label="סינון לפי סטטוס">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{checked.length} מסומנים</span>
        {checked.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={() => setChecked([])}>
              ניקוי סימון
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setPendingDelete(checked)}
            >
              <Trash2 className="size-4" />
              מחיקת המסומנים
            </Button>
          </>
        )}
      </div>

      <div className="print-area overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">רשימת פרויקטים</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-3 text-start no-print print:hidden">
                <input
                  type="checkbox"
                  aria-label="סימון כל הפרויקטים"
                  className="size-4 accent-[var(--primary)]"
                  checked={allChecked}
                  onChange={() =>
                    setChecked(allChecked ? [] : Array.from(new Set(projects.map((p) => p.id))))
                  }
                />
              </th>
              <th scope="col" className="p-3 text-start">קוד</th>
              <th scope="col" className="p-3 text-start">שם הפרויקט</th>
              <th scope="col" className="p-3 text-start">לקוח</th>
              <th scope="col" className="p-3 text-start">שכר טרחה</th>
              <th scope="col" className="p-3 text-start">שולם</th>
              <th scope="col" className="p-3 text-start">יתרה לגבייה</th>
              <th scope="col" className="p-3 text-start">שלב נוכחי</th>
              <th scope="col" className="p-3 text-start">סטטוס</th>
              <th scope="col" className="p-3 text-start no-print print:hidden">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const ms = milestones.filter((m) => m.project_id === p.id);
              const paid = ms.reduce((s, m) => {
                const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(p.fee_total));
                return s + (m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full));
              }, 0);
              const open = ms.find((m) => m.status !== "paid");
              const late =
                open?.due_date && daysBetween(open.due_date, todayIso()) > 0
                  ? daysBetween(open.due_date, todayIso())
                  : 0;
              return (
                <tr
                  key={p.id}
                  className={`border-t border-border ${late ? "bg-destructive/10" : ""} ${
                    checked.includes(p.id) ? "bg-accent/10" : ""
                  }`}
                >
                  <td className="p-3 no-print print:hidden">
                    <input
                      type="checkbox"
                      aria-label={`סימון ${p.name}`}
                      className="size-4 accent-[var(--primary)]"
                      checked={checked.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                  <td className="p-3 font-mono">{p.code}</td>
                  <td className="p-3 font-medium">
                    <button
                      className="underline-offset-2 hover:underline"
                      onClick={() => toggle(p.id)}
                    >
                      {p.name}
                    </button>
                  </td>
                  <td className="p-3">{p.client_name || "—"}</td>
                  <td className="p-3">{fmtMoney(Number(p.fee_total))}</td>
                  <td className="p-3">{fmtMoney(paid)}</td>
                  <td className="p-3 font-medium">{fmtMoney(Number(p.fee_total) - paid)}</td>
                  <td className={`p-3 ${late ? "font-semibold text-destructive" : ""}`}>
                    {open ? open.title : "הושלם"}
                    {late > 0 && (
                      <span className="ms-1 inline-flex items-center gap-1">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        חריגה של {late} ימים
                      </span>
                    )}
                  </td>
                  <td className="p-3">{projectStatusLabel(p.status)}</td>
                  <td className="p-3 no-print print:hidden">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggle(p.id)}
                        aria-label={`ניהול גבייה עבור ${p.name}`}
                      >
                        גבייה ותנאי תשלום
                      </Button>
                      <ProjectDialog
                        project={p}
                        projectMilestones={ms}
                        onSaved={() => qc.invalidateQueries({ queryKey: ["projects-full"] })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`מחיקת ${p.name}`}
                        onClick={() => setPendingDelete([p.id])}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  {allProjects.length ? "לא נמצאו פרויקטים התואמים לסינון." : "עדיין לא הוגדרו פרויקטים. התחל בהוספת פרויקט חדש."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {checkedProjects.map((p) => (
        <MilestonesPanel
          key={p.id}
          project={p}
          milestones={milestones.filter((m) => m.project_id === p.id)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["projects-full"] })}
        />
      ))}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
            <AlertDialogDescription>
              לאחר המחיקה, לא ניתן לשחזר את המידע
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>לא</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) del.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              כן
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type MilestoneDraft = {
  id?: string;
  title: string;
  amount_type: string;
  amount_value: string;
  due_date: string;
  status?: string;
};

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  fee_total: number;
  hours_budget: number | null;
  start_date: string | null;
  status: string;
  notes: string | null;
};

function ProjectDialog({
  project,
  projectMilestones = [],
  onSaved,
}: {
  project?: ProjectRow;
  projectMilestones?: Milestone[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: project?.code ?? "",
    name: project?.name ?? "",
    client_name: project?.client_name ?? "",
    fee_total: String(project?.fee_total ?? 0),
    hours_budget: project?.hours_budget ? String(project.hours_budget) : "",
    start_date: project?.start_date ?? "",
    status: project?.status ?? "active",
    notes: project?.notes ?? "",
  });
  const [stations, setStations] = useState<MilestoneDraft[]>([]);

  // Load the project's existing payment terms into the editor each time it opens.
  useEffect(() => {
    if (!open) return;
    setStations(
      [...projectMilestones]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => ({
          id: m.id,
          title: m.title,
          amount_type: m.amount_type,
          amount_value: String(m.amount_value ?? ""),
          due_date: m.due_date ?? "",
          status: m.status,
        })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fee = Number(form.fee_total) || 0;
  const stationsTotal = stations.reduce(
    (s, m) => s + milestoneAmount(m.amount_type, Number(m.amount_value) || 0, fee),
    0,
  );
  const stationsValid =
    stations.length === 0 || (fee > 0 && Math.abs(stationsTotal - fee) < 1);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        client_name: form.client_name.trim() || null,
        fee_total: Number(form.fee_total) || 0,
        hours_budget: form.hours_budget ? Number(form.hours_budget) : null,
        start_date: form.start_date || null,
        status: form.status,
        notes: form.notes || null,
      };
      if (!payload.code || !payload.name) throw new Error("missing");
      if (!stationsValid) throw new Error("stations");
      if (project) {
        const { error } = await supabase.from("projects").update(payload).eq("id", project.id);
        if (error) throw error;
        await saveStations(project.id);
      } else {
        const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
        if (error) throw error;
        if (data) await saveStations(data.id);
      }
    },
    onSuccess: () => {
      toast.success("הפרויקט נשמר");
      setOpen(false);
      onSaved();
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error && e.message === "stations"
          ? "סכום תנאי התשלום חייב להיות שווה בדיוק לשכר הטרחה (100%)"
          : "שמירה נכשלה – ודא שקוד הפרויקט ייחודי ושכל השדות מולאו",
      ),
  });

  async function saveStations(projectId: string) {
    const valid = stations.filter((s) => s.title.trim());
    const keptIds = valid.map((s) => s.id).filter(Boolean) as string[];
    const removed = projectMilestones
      .filter((m) => !keptIds.includes(m.id))
      .map((m) => m.id);

    if (removed.length > 0) {
      const { error } = await supabase.from("project_milestones").delete().in("id", removed);
      if (error) throw error;
    }

    for (let i = 0; i < valid.length; i++) {
      const s = valid[i];
      const row = {
        title: s.title.trim(),
        amount_type: s.amount_type,
        amount_value: Number(s.amount_value) || 0,
        due_date: s.due_date || null,
        sort_order: i,
      };
      if (s.id) {
        const { error } = await supabase.from("project_milestones").update(row).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("project_milestones")
          .insert({ ...row, project_id: projectId });
        if (error) throw error;
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {project ? (
          <Button size="sm" variant="ghost">
            עריכה
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" />
            פרויקט חדש
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{project ? "עריכת פרויקט" : "פרויקט חדש"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="קוד פרויקט" id="code">
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="1024"
            />
          </Field>
          <Field label="שם הפרויקט" id="name">
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="שם הלקוח" id="client">
            <Input
              id="client"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            />
          </Field>
          <Field label="שכר טרחה (₪)" id="fee">
            <Input
              id="fee"
              type="number"
              min="0"
              value={form.fee_total}
              onChange={(e) => setForm({ ...form, fee_total: e.target.value })}
            />
          </Field>
          <Field label="תקציב שעות (לא חובה)" id="hb">
            <Input
              id="hb"
              type="number"
              min="0"
              value={form.hours_budget}
              onChange={(e) => setForm({ ...form, hours_budget: e.target.value })}
            />
          </Field>
          <Field label="תאריך תחילה" id="sd">
            <Input
              id="sd"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>
          <Field label="סטטוס" id="st">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger id="st">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="הערות" id="notes">
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4 sm:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">תנאי תשלום</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setStations([
                    ...stations,
                    { title: "", amount_type: "percent", amount_value: "", due_date: "" },
                  ])
                }
              >
                <Plus className="size-4" />
                הוספת תחנה
              </Button>
            </div>
            {stations.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {project
                  ? "לפרויקט זה עדיין לא הוגדרו תנאי תשלום. ניתן להוסיף תחנות באחוזים או בסכום."
                  : "ניתן להגדיר תחנות באחוזים או בסכום, עם תאריך צפי לתשלום. הסכום הכולל חייב להשלים ל‑100%."}
              </p>
            )}
            {stations.map((s, idx) => {
              const rowAmount = milestoneAmount(s.amount_type, Number(s.amount_value) || 0, fee);
              const rowPercent = fee > 0 ? (rowAmount / fee) * 100 : 0;
              return (
              <div key={idx} className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_7rem_auto_minmax(0,1.2fr)_auto] sm:items-center">
                <Input
                  aria-label="שלב בפרויקט"
                  placeholder="שלב (למשל: חתימת חוזה)"
                  value={s.title}
                  onChange={(e) => {
                    const n = [...stations];
                    n[idx] = { ...s, title: e.target.value };
                    setStations(n);
                  }}
                />
                <Select
                  value={s.amount_type}
                  onValueChange={(v) => {
                    const n = [...stations];
                    n[idx] = { ...s, amount_type: v };
                    setStations(n);
                  }}
                >
                  <SelectTrigger aria-label="סוג חישוב">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">אחוז</SelectItem>
                    <SelectItem value="fixed">סכום</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="text-start font-mono tabular-nums"
                  style={{ width: `${Math.max(7, s.amount_value.length + 5)}ch` }}
                  aria-label="ערך התחנה"
                  placeholder={s.amount_type === "percent" ? "30" : "100000"}
                  value={s.amount_value}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "").slice(0, 9);
                    const n = [...stations];
                    n[idx] = { ...s, amount_value: v };
                    setStations(n);
                  }}
                />
                <Input
                  type="date"
                  aria-label="תאריך צפי לתשלום"
                  value={s.due_date}
                  onChange={(e) => {
                    const n = [...stations];
                    n[idx] = { ...s, due_date: e.target.value };
                    setStations(n);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="מחיקת תחנה"
                  onClick={() => setStations(stations.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4" />
                </Button>
                <p className="text-xs text-muted-foreground sm:col-span-5">
                  שווה ערך: {fmtMoney(rowAmount)} · {rowPercent.toFixed(1)}% משכר הטרחה
                  {s.status === "paid" && " · שולם"}
                </p>
              </div>
              );
            })}
            {stations.length > 0 && (
              <p className={`text-sm ${stationsValid ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                סך כל התחנות יחד: {fmtMoney(stationsTotal)} מתוך שכר טרחה {fmtMoney(fee)}
                {fee > 0 && ` · ${((stationsTotal / fee) * 100).toFixed(1)}%`}
                {!stationsValid &&
                  ` – ${
                    stationsTotal > fee
                      ? `חריגה של ${fmtMoney(stationsTotal - fee)}`
                      : `נותר להשלים ${fmtMoney(fee - stationsTotal)}`
                  }. סכום כל התחנות יחד חייב להיות 100% משכר הטרחה (כל תחנה בנפרד יכולה להיות כל אחוז).`}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !stationsValid}>
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function MilestonesPanel({
  project,
  milestones,
  onChanged,
}: {
  project: ProjectRow;
  milestones: Milestone[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    amount_type: "percent",
    amount_value: "",
    due_date: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_milestones").insert({
        project_id: project.id,
        title: draft.title.trim(),
        amount_type: draft.amount_type,
        amount_value: Number(draft.amount_value) || 0,
        due_date: draft.due_date || null,
        sort_order: milestones.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ title: "", amount_type: "percent", amount_value: "", due_date: "" });
      toast.success("תחנת התשלום נוספה");
      onChanged();
    },
    onError: () => toast.error("הוספת תחנת תשלום נכשלה"),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { status: string; paid_date: string | null };
    }) => {
      const { error } = await supabase.from("project_milestones").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">
        תנאי תשלום – {project.code} · {project.name}
      </h2>

      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" className="p-2 text-start">שלב</th>
            <th scope="col" className="p-2 text-start">סוג</th>
            <th scope="col" className="p-2 text-start">ערך</th>
            <th scope="col" className="p-2 text-start">סכום</th>
            <th scope="col" className="p-2 text-start">לו״ז לביצוע</th>
            <th scope="col" className="p-2 text-start">סטטוס</th>
            <th scope="col" className="p-2 text-start">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((m) => {
            const late =
              m.status !== "paid" && m.due_date && daysBetween(m.due_date, todayIso()) > 0
                ? daysBetween(m.due_date, todayIso())
                : 0;
            return (
              <tr key={m.id} className={`border-t border-border ${late ? "bg-destructive/10" : ""}`}>
                <td className="p-2">{m.title}</td>
                <td className="p-2">{m.amount_type === "percent" ? "אחוז" : "סכום"}</td>
                <td className="p-2">
                  {m.amount_type === "percent" ? `${m.amount_value}%` : fmtMoney(Number(m.amount_value))}
                </td>
                <td className="p-2">
                  {fmtMoney(milestoneAmount(m.amount_type, Number(m.amount_value), Number(project.fee_total)))}
                </td>
                <td className={`p-2 ${late ? "font-semibold text-destructive" : ""}`}>
                  {m.due_date ? fmtDate(m.due_date) : "—"}
                  {late > 0 && ` · חריגה ${late} ימים`}
                </td>
                <td className="p-2">
                  <Select
                    value={m.status}
                    onValueChange={(v) =>
                      update.mutate({
                        id: m.id,
                        patch: { status: v, paid_date: v === "paid" ? todayIso() : null },
                      })
                    }
                  >
                    <SelectTrigger className="w-32" aria-label="סטטוס תחנה">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">ממתין</SelectItem>
                      <SelectItem value="invoiced">חויב</SelectItem>
                      <SelectItem value="paid">שולם</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="מחיקת תחנה"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,2fr)_7rem_auto_minmax(0,1fr)_auto]">
        <Input
          aria-label="שם השלב"
          placeholder="לדוגמה: חתימה על חוזה"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <Select value={draft.amount_type} onValueChange={(v) => setDraft({ ...draft, amount_type: v })}>
          <SelectTrigger aria-label="סוג חישוב">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">אחוז</SelectItem>
            <SelectItem value="fixed">סכום</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="text"
          inputMode="decimal"
          className="font-mono tabular-nums"
          style={{ width: `${Math.max(7, draft.amount_value.length + 5)}ch` }}
          aria-label="ערך"
          placeholder={draft.amount_type === "percent" ? "30" : "100000"}
          value={draft.amount_value}
          onChange={(e) =>
            setDraft({ ...draft, amount_value: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) })
          }
        />
        <Input
          type="date"
          aria-label="לוח זמנים"
          value={draft.due_date}
          onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
        />
        <Button onClick={() => add.mutate()} disabled={!draft.title || add.isPending}>
          <Plus className="size-4" />
          הוספה
        </Button>
      </div>
    </section>
  );
}