import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { SortControls, sortRows, type SortDir } from "@/components/SortControls";
import { daysBetween, fmtDate, fmtMoney, milestoneAmount, monthLabel, todayIso } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "גבייה וכספים | ניהול שעות ופרויקטים" },
      { name: "description", content: "מעקב תנאי תשלום, יתרות לגבייה וחריגות לו״ז לישיבות הנהלה." },
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [sortBy, setSortBy] = useState("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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

  const updateMilestone = useMutation({
    mutationFn: async ({ id, paid, full }: { id: string; paid: number; full: number }) => {
      const { error } = await supabase
        .from("project_milestones")
        .update({
          paid_amount: paid,
          status: paid >= full - 0.5 ? "paid" : paid > 0 ? "invoiced" : "pending",
          paid_date: paid >= full - 0.5 ? todayIso() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("עדכון הגבייה נשמר");
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["projects-full"] });
      qc.invalidateQueries({ queryKey: ["pnl"] });
    },
    onError: () => toast.error("עדכון הגבייה נכשל"),
  });

  const openAll = projects.flatMap((p) =>
    milestones
      .filter((m) => m.project_id === p.id && m.status !== "paid")
      .map((m) => {
        const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(p.fee_total));
        const collected = Math.min(Number(m.paid_amount) || 0, full);
        const amount = Math.max(0, full - collected);
        return {
          project: p,
          milestone: m,
          full,
          collected,
          amount,
          lateDays:
            amount > 0 && m.due_date && daysBetween(m.due_date, todayIso()) > 0
              ? daysBetween(m.due_date, todayIso())
              : 0,
        };
      })
      .filter((r) => r.amount > 0),
  );

  const term = search.trim().toLowerCase();
  const filteredOpen = openAll.filter(
    (r) =>
      (!lateOnly || r.lateDays > 0) &&
      (!term ||
        r.project.code.toLowerCase().includes(term) ||
        r.project.name.toLowerCase().includes(term) ||
        (r.project.client_name ?? "").toLowerCase().includes(term) ||
        (r.milestone.title ?? "").toLowerCase().includes(term)),
  );
  const open = sortRows(filteredOpen, sortBy, sortDir, {
    code: (r) => r.project.code,
    name: (r) => r.project.name,
    client: (r) => r.project.client_name ?? "",
    stage: (r) => r.milestone.title ?? "",
    amount: (r) => r.amount,
    collected: (r) => r.collected,
    due_date: (r) => r.milestone.due_date ?? "",
    lateDays: (r) => r.lateDays,
  });

  const totalOutstanding = openAll.reduce((s, r) => s + r.amount, 0);
  const invoiced = openAll
    .filter((r) => r.milestone.status === "invoiced")
    .reduce((s, r) => s + r.amount, 0);
  const overdue = openAll.filter((r) => r.lateDays > 0);
  const overdueAmount = overdue.reduce((s, r) => s + r.amount, 0);

  const forecastMap = new Map<string, number>();
  openAll.forEach((r) => {
    const key = r.milestone.due_date ? r.milestone.due_date.slice(0, 7) : "unknown";
    forecastMap.set(key, (forecastMap.get(key) ?? 0) + r.amount);
  });
  const forecast = [...forecastMap.entries()]
    .sort((a, b) => (a[0] === "unknown" ? 1 : b[0] === "unknown" ? -1 : a[0].localeCompare(b[0])))
    .map(([key, amount]) => ({
      key,
      label: key === "unknown" ? "ללא תאריך צפי" : monthLabel(`${key}-01`),
      amount,
    }));
  let running = 0;
  const forecastRows = forecast.map((f) => {
    running += f.amount;
    return { ...f, cumulative: running };
  });

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

      <div className="no-print flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 print:hidden">
        <Input
          className="w-64"
          aria-label="חיפוש פרויקט או שלב"
          placeholder="חיפוש לפי קוד, פרויקט, לקוח או שלב"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant={lateOnly ? "default" : "outline"} onClick={() => setLateOnly((v) => !v)}>
          {lateOnly ? "מוצגות חריגות לו״ז בלבד" : "הצגת חריגות לו״ז בלבד"}
        </Button>
        <SortControls
          id="finance-sort"
          value={sortBy}
          onValueChange={setSortBy}
          dir={sortDir}
          onDirChange={setSortDir}
          options={[
            { value: "code", label: "מספר פרויקט" },
            { value: "name", label: "שם הפרויקט (א״ב)" },
            { value: "client", label: "לקוח (א״ב)" },
            { value: "stage", label: "שלב (א״ב)" },
            { value: "amount", label: "יתרה לגבייה" },
            { value: "collected", label: "נגבה בפועל" },
            { value: "due_date", label: "תאריך לו״ז" },
            { value: "lateDays", label: "ימי חריגה" },
          ]}
        />
        <span className="text-sm text-muted-foreground">
          מוצגות {open.length} מתוך {openAll.length} תחנות פתוחות
        </span>
      </div>

      <div className="print-area space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <Card label="סה״כ פתוח לגבייה" value={fmtMoney(totalOutstanding)} />
          <Card label="חויב וטרם שולם" value={fmtMoney(invoiced)} />
          <Card label="תחנות בחריגת לו״ז" value={`${overdue.length} · ${fmtMoney(overdueAmount)}`} />
        </section>

        {overdue.length > 0 && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold text-destructive">
              התראת גבייה: {overdue.length} תנאי תשלום חרגו מתאריך הצפי, בהיקף {fmtMoney(overdueAmount)}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              {overdue
                .sort((a, b) => b.lateDays - a.lateDays)
                .slice(0, 6)
                .map((r) => (
                  <li key={r.milestone.id}>
                    {r.project.code} · {r.project.name} – {r.milestone.title}: {fmtMoney(r.amount)} · באיחור{" "}
                    {r.lateDays} ימים
                  </li>
                ))}
            </ul>
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">צפי הכנסות לפי חודש</h2>
          <div className="no-print h-64 print:hidden" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v: number) => fmtMoney(Number(v))} />
                <Bar dataKey="amount" name="צפי הכנסה" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-4 w-full text-sm">
            <caption className="sr-only">דוח צפי הכנסות</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-2 text-start">חודש</th>
                <th scope="col" className="p-2 text-start">צפי הכנסה</th>
                <th scope="col" className="p-2 text-start">מצטבר</th>
              </tr>
            </thead>
            <tbody>
              {forecastRows.map((f) => (
                <tr key={f.key} className="border-t border-border">
                  <td className="p-2">{f.label}</td>
                  <td className="p-2 font-medium">{fmtMoney(f.amount)}</td>
                  <td className="p-2">{fmtMoney(f.cumulative)}</td>
                </tr>
              ))}
              {forecastRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-muted-foreground">
                    אין תחנות פתוחות לתחזית.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="p-3 text-start font-semibold">תנאי תשלום פתוחים</caption>
            <thead className="bg-muted/60">
              <tr>
                <th scope="col" className="p-3 text-start">קוד</th>
                <th scope="col" className="p-3 text-start">פרויקט</th>
                <th scope="col" className="p-3 text-start">לקוח</th>
                <th scope="col" className="p-3 text-start">שלב</th>
                <th scope="col" className="p-3 text-start">יתרה לגבייה</th>
                <th scope="col" className="p-3 text-start">נגבה בפועל</th>
                <th scope="col" className="p-3 text-start">לו״ז</th>
                <th scope="col" className="p-3 text-start">סטטוס</th>
                <th scope="col" className="p-3 text-start no-print print:hidden">עדכון גבייה</th>
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
                  <td className="p-3">{fmtMoney(r.collected)} מתוך {fmtMoney(r.full)}</td>
                  <td className={`p-3 ${r.lateDays ? "font-semibold text-destructive" : ""}`}>
                    {r.milestone.due_date ? fmtDate(r.milestone.due_date) : "—"}
                    {r.lateDays > 0 && ` · חריגה ${r.lateDays} ימים`}
                  </td>
                  <td className="p-3">
                    {r.collected > 0 ? "נגבה חלקית" : r.milestone.status === "invoiced" ? "חויב" : "ממתין"}
                  </td>
                  <td className="p-3 no-print print:hidden">
                    <CollectRow
                      value={r.collected}
                      max={r.full}
                      pending={updateMilestone.isPending}
                      onSave={(v) => updateMilestone.mutate({ id: r.milestone.id, paid: v, full: r.full })}
                    />
                  </td>
                </tr>
              ))}
              {open.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    אין תנאי תשלום פתוחים.
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
function CollectRow({
  value,
  max,
  pending,
  onSave,
}: {
  value: number;
  max: number;
  pending: boolean;
  onSave: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value || ""));
  useEffect(() => setDraft(String(value || "")), [value]);
  const parsed = Math.min(Number(draft) || 0, max);
  return (
    <div className="flex items-center gap-1">
      <Input
        className="w-24 font-mono tabular-nums"
        inputMode="decimal"
        aria-label="סכום שנגבה"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onSave(parsed)}>
        שמירה
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onSave(max)}>
        נגבה במלואו
      </Button>
    </div>
  );
}
