import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { fmtMoney, MONTH_NAMES, milestoneAmount, todayIso, yearOptions } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/pnl")({
  head: () => ({
    meta: [
      { title: "רווח והפסד | ניהול שעות ופרויקטים" },
      { name: "description", content: "דוח רווח והפסד למשרד – הכנסות מפרויקטים, הכנסות נוספות, הוצאות וצפי שנתי." },
      { property: "og:title", content: "רווח והפסד" },
      { property: "og:description", content: "צפי הכנסות והוצאות לשנת מס מלאה, עם אפשרות הדפסה ל‑PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AdminOnly>
      <PnlPage />
    </AdminOnly>
  ),
});

const EXPENSE_CATEGORIES = [
  { value: "salaries", label: "שכר עבודה" },
  { value: "rent", label: "שכירות" },
  { value: "utilities", label: "חשמל, מים וארנונה" },
  { value: "software", label: "תוכנות ורישיונות" },
  { value: "marketing", label: "שיווק ופרסום" },
  { value: "subcontractors", label: "קבלני משנה ויועצים" },
  { value: "office", label: "תחזוקת משרד" },
  { value: "taxes", label: "אגרות ומיסים" },
  { value: "general", label: "כללי" },
];

const catLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

type Expense = {
  id: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  expense_date: string;
  is_recurring: boolean;
  recurring_until: string | null;
  notes: string | null;
};

type OtherIncome = {
  id: string;
  source: string;
  client_name: string | null;
  category: string;
  total_amount: number;
  status: string;
  notes: string | null;
};

type OtherMilestone = {
  id: string;
  income_id: string;
  title: string;
  amount_type: string;
  amount_value: number;
  due_date: string | null;
  status: string;
  paid_amount: number;
  paid_date: string | null;
  sort_order: number;
};

const monthKey = (iso: string) => iso.slice(0, 7);

function PnlPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());

  const q = useQuery({
    queryKey: ["pnl"],
    queryFn: async () => {
      const [projects, milestones, expenses, incomes, incomeMs, adj] = await Promise.all([
        supabase.from("projects").select("id, code, name, fee_total, status"),
        supabase.from("project_milestones").select("*"),
        supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
        supabase.from("other_incomes").select("*").order("created_at", { ascending: false }),
        supabase.from("other_income_milestones").select("*").order("sort_order"),
        supabase.from("pnl_adjustments").select("*"),
      ]);
      for (const r of [projects, milestones, expenses, incomes, incomeMs, adj]) {
        if (r.error) throw r.error;
      }
      return {
        projects: projects.data ?? [],
        milestones: milestones.data ?? [],
        expenses: (expenses.data ?? []) as Expense[],
        incomes: (incomes.data ?? []) as OtherIncome[],
        incomeMs: (incomeMs.data ?? []) as OtherMilestone[],
        adjustments: adj.data ?? [],
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["pnl"] });

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`),
    [year],
  );

  const rows = useMemo(() => {
    const d = q.data;
    const base = months.map((key) => ({
      key,
      label: `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${year}`,
      projectActual: 0,
      projectForecast: 0,
      otherActual: 0,
      otherForecast: 0,
      expenses: 0,
    }));
    if (!d) return base;
    const byKey = new Map(base.map((r) => [r.key, r]));

    d.milestones.forEach((m) => {
      const project = d.projects.find((p) => p.id === m.project_id);
      if (!project) return;
      const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(project.fee_total));
      const collected = m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full);
      const remaining = Math.max(0, full - collected);
      if (collected > 0) {
        const k = monthKey(m.paid_date || m.due_date || "");
        const row = byKey.get(k);
        if (row) row.projectActual += collected;
      }
      if (remaining > 0 && m.due_date) {
        const row = byKey.get(monthKey(m.due_date));
        if (row) row.projectForecast += remaining;
      }
    });

    d.incomeMs.forEach((m) => {
      const inc = d.incomes.find((i) => i.id === m.income_id);
      if (!inc) return;
      const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(inc.total_amount));
      const collected = m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full);
      const remaining = Math.max(0, full - collected);
      if (collected > 0) {
        const row = byKey.get(monthKey(m.paid_date || m.due_date || ""));
        if (row) row.otherActual += collected;
      }
      if (remaining > 0 && m.due_date) {
        const row = byKey.get(monthKey(m.due_date));
        if (row) row.otherForecast += remaining;
      }
    });

    d.expenses.forEach((e) => {
      const amount = Number(e.amount) || 0;
      if (!e.is_recurring) {
        const row = byKey.get(monthKey(e.expense_date));
        if (row) row.expenses += amount;
        return;
      }
      months.forEach((k) => {
        const first = `${k}-01`;
        if (first < e.expense_date.slice(0, 7) + "-01") return;
        if (e.recurring_until && first > e.recurring_until) return;
        byKey.get(k)!.expenses += amount;
      });
    });

    return base.map((r) => {
      const a = d.adjustments.find((x) => x.month === `${r.key}-01`);
      const income =
        a?.income_override != null
          ? Number(a.income_override)
          : r.projectActual + r.projectForecast + r.otherActual + r.otherForecast;
      const expenses = a?.expense_override != null ? Number(a.expense_override) : r.expenses;
      return {
        ...r,
        note: a?.note ?? "",
        overridden: a?.income_override != null || a?.expense_override != null,
        income,
        totalExpenses: expenses,
        profit: income - expenses,
      };
    });
  }, [q.data, months, year]);

  const totals = rows.reduce(
    (s, r) => ({
      income: s.income + r.income,
      expenses: s.expenses + r.totalExpenses,
      profit: s.profit + r.profit,
    }),
    { income: 0, expenses: 0, profit: 0 },
  );
  const currentKey = todayIso().slice(0, 7);
  const current = rows.find((r) => r.key === currentKey);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">רווח והפסד (P&amp;L)</h1>
          <p className="text-sm text-muted-foreground">
            הכנסות מפרויקטים ומהכנסות נוספות, מול הוצאות המשרד – פריסה מלאה לשנת מס וצפי לחודשים הבאים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32" aria-label="שנת מס">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" />
            הדפסה / הורדת PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="no-print print:hidden">
          <TabsTrigger value="summary">תחזית שנתית</TabsTrigger>
          <TabsTrigger value="expenses">הוצאות</TabsTrigger>
          <TabsTrigger value="incomes">הכנסות נוספות</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-6">
          <div className="print-area space-y-6">
            <h2 className="hidden text-xl font-bold print:block">
              דוח רווח והפסד – שנת {year}
            </h2>
            <section className="grid gap-4 md:grid-cols-4">
              <Stat label="סה״כ הכנסות בשנה" value={fmtMoney(totals.income)} />
              <Stat label="סה״כ הוצאות בשנה" value={fmtMoney(totals.expenses)} />
              <Stat
                label="רווח שנתי צפוי"
                value={fmtMoney(totals.profit)}
                tone={totals.profit >= 0 ? "good" : "bad"}
              />
              <Stat
                label="רווח בחודש הנוכחי"
                value={current ? fmtMoney(current.profit) : "—"}
                tone={(current?.profit ?? 0) >= 0 ? "good" : "bad"}
              />
            </section>

            <section className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <caption className="p-3 text-start font-semibold">
                  פריסה חודשית – שנת מס {year}
                </caption>
                <thead className="bg-muted/60">
                  <tr>
                    <th scope="col" className="p-2 text-start">חודש</th>
                    <th scope="col" className="p-2 text-start">גבייה בפועל – פרויקטים</th>
                    <th scope="col" className="p-2 text-start">צפי – פרויקטים</th>
                    <th scope="col" className="p-2 text-start">הכנסות נוספות</th>
                    <th scope="col" className="p-2 text-start">סה״כ הכנסות</th>
                    <th scope="col" className="p-2 text-start">הוצאות</th>
                    <th scope="col" className="p-2 text-start">רווח</th>
                    <th scope="col" className="p-2 text-start no-print print:hidden">תיקון ידני</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.key}
                      className={`border-t border-border ${r.key === currentKey ? "bg-accent/10 font-medium" : ""}`}
                    >
                      <td className="p-2">{r.label}</td>
                      <td className="p-2">{fmtMoney(r.projectActual)}</td>
                      <td className="p-2">{fmtMoney(r.projectForecast)}</td>
                      <td className="p-2">{fmtMoney(r.otherActual + r.otherForecast)}</td>
                      <td className="p-2 font-medium">
                        {fmtMoney(r.income)}
                        {r.overridden && <span className="ms-1 text-xs text-muted-foreground">(מתוקן)</span>}
                      </td>
                      <td className="p-2">{fmtMoney(r.totalExpenses)}</td>
                      <td className={`p-2 font-semibold ${r.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {fmtMoney(r.profit)}
                      </td>
                      <td className="p-2 no-print print:hidden">
                        <AdjustDialog monthKeyValue={r.key} label={r.label} onSaved={invalidate} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="p-2">סה״כ שנתי</td>
                    <td className="p-2" colSpan={3} />
                    <td className="p-2">{fmtMoney(totals.income)}</td>
                    <td className="p-2">{fmtMoney(totals.expenses)}</td>
                    <td className={`p-2 ${totals.profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {fmtMoney(totals.profit)}
                    </td>
                    <td className="p-2 no-print print:hidden" />
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab expenses={q.data?.expenses ?? []} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="incomes" className="mt-4">
          <IncomesTab
            incomes={q.data?.incomes ?? []}
            milestones={q.data?.incomeMs ?? []}
            onChanged={invalidate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AdjustDialog({
  monthKeyValue,
  label,
  onSaved,
}: {
  monthKeyValue: string;
  label: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [income, setIncome] = useState("");
  const [expense, setExpense] = useState("");
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pnl_adjustments").upsert(
        {
          month: `${monthKeyValue}-01`,
          income_override: income === "" ? null : Number(income),
          expense_override: expense === "" ? null : Number(expense),
          note: note || null,
        },
        { onConflict: "month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("התיקון נשמר");
      setOpen(false);
      onSaved();
    },
    onError: () => toast.error("שמירת התיקון נכשלה"),
  });

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        תיקון
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Input
        className="w-24"
        aria-label={`תיקון הכנסות ${label}`}
        placeholder="הכנסות"
        value={income}
        onChange={(e) => setIncome(e.target.value.replace(/[^\d.]/g, ""))}
      />
      <Input
        className="w-24"
        aria-label={`תיקון הוצאות ${label}`}
        placeholder="הוצאות"
        value={expense}
        onChange={(e) => setExpense(e.target.value.replace(/[^\d.]/g, ""))}
      />
      <Input
        className="w-28"
        aria-label="הערה"
        placeholder="הערה"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
        שמירה
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        ביטול
      </Button>
    </div>
  );
}

function ExpensesTab({ expenses, onChanged }: { expenses: Expense[]; onChanged: () => void }) {
  const [form, setForm] = useState({
    category: "general",
    description: "",
    vendor: "",
    amount: "",
    expense_date: todayIso(),
    is_recurring: false,
    recurring_until: "",
    notes: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error("חסר תיאור");
      const { error } = await supabase.from("expenses").insert({
        category: form.category,
        description: form.description.trim(),
        vendor: form.vendor.trim() || null,
        amount: Number(form.amount) || 0,
        expense_date: form.expense_date,
        is_recurring: form.is_recurring,
        recurring_until: form.is_recurring && form.recurring_until ? form.recurring_until : null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההוצאה נוספה");
      setForm({ ...form, description: "", vendor: "", amount: "", notes: "" });
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "הוספת ההוצאה נכשלה"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההוצאה נמחקה");
      onChanged();
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-semibold">הוספת הוצאה</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="ex-cat">קטגוריה</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger id="ex-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-desc">תיאור</Label>
            <Input
              id="ex-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-vendor">ספק</Label>
            <Input
              id="ex-vendor"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-amount">סכום (₪)</Label>
            <Input
              id="ex-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-date">תאריך</Label>
            <Input
              id="ex-date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-until">הוצאה קבועה עד (לא חובה)</Label>
            <Input
              id="ex-until"
              type="date"
              disabled={!form.is_recurring}
              value={form.recurring_until}
              onChange={(e) => setForm({ ...form, recurring_until: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="ex-rec"
              checked={form.is_recurring}
              onCheckedChange={(v) => setForm({ ...form, is_recurring: v })}
            />
            <Label htmlFor="ex-rec">הוצאה קבועה חודשית</Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ex-notes">הערות</Label>
            <Textarea
              id="ex-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-4" onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4" />
          הוספת הוצאה
        </Button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="p-3 text-start font-semibold">כל ההוצאות</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-2 text-start">תאריך</th>
              <th scope="col" className="p-2 text-start">קטגוריה</th>
              <th scope="col" className="p-2 text-start">תיאור</th>
              <th scope="col" className="p-2 text-start">ספק</th>
              <th scope="col" className="p-2 text-start">סכום</th>
              <th scope="col" className="p-2 text-start">סוג</th>
              <th scope="col" className="p-2 text-start">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-2">{e.expense_date}</td>
                <td className="p-2">{catLabel(e.category)}</td>
                <td className="p-2 font-medium">{e.description}</td>
                <td className="p-2">{e.vendor || "—"}</td>
                <td className="p-2">{fmtMoney(Number(e.amount))}</td>
                <td className="p-2">
                  {e.is_recurring
                    ? `קבועה חודשית${e.recurring_until ? ` · עד ${e.recurring_until}` : ""}`
                    : "חד פעמית"}
                </td>
                <td className="p-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`מחיקת ההוצאה ${e.description}`}
                    onClick={() => remove.mutate(e.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  עדיין לא הוזנו הוצאות.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function IncomesTab({
  incomes,
  milestones,
  onChanged,
}: {
  incomes: OtherIncome[];
  milestones: OtherMilestone[];
  onChanged: () => void;
}) {
  const [form, setForm] = useState({ source: "", client_name: "", total_amount: "", notes: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.source.trim()) throw new Error("חסר שם מקור ההכנסה");
      const { error } = await supabase.from("other_incomes").insert({
        source: form.source.trim(),
        client_name: form.client_name.trim() || null,
        total_amount: Number(form.total_amount) || 0,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההכנסה נוספה");
      setForm({ source: "", client_name: "", total_amount: "", notes: "" });
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "ההוספה נכשלה"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("other_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההכנסה נמחקה");
      onChanged();
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-semibold">הוספת הכנסה שאינה מפרויקט</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          לדוגמה: עמלות ספקים, ייעוץ חיצוני, השכרת ציוד. ההכנסות נספרות במלואן ב‑P&amp;L של המשרד.
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="oi-src">מקור ההכנסה</Label>
            <Input
              id="oi-src"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oi-client">לקוח / ספק</Label>
            <Input
              id="oi-client"
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oi-amount">סכום כולל (₪)</Label>
            <Input
              id="oi-amount"
              inputMode="decimal"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oi-notes">הערות</Label>
            <Input
              id="oi-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-4" onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4" />
          הוספת הכנסה
        </Button>
      </section>

      {incomes.map((inc) => (
        <IncomeCard
          key={inc.id}
          income={inc}
          milestones={milestones.filter((m) => m.income_id === inc.id)}
          onChanged={onChanged}
          onRemove={() => remove.mutate(inc.id)}
        />
      ))}
      {incomes.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
          עדיין לא הוזנו הכנסות נוספות.
        </p>
      )}
    </div>
  );
}

function IncomeCard({
  income,
  milestones,
  onChanged,
  onRemove,
}: {
  income: OtherIncome;
  milestones: OtherMilestone[];
  onChanged: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState({ title: "", amount_type: "percent", amount_value: "", due_date: "" });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("other_income_milestones").insert({
        income_id: income.id,
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
    onError: () => toast.error("הוספת תחנת התשלום נכשלה"),
  });

  const update = useMutation({
    mutationFn: async ({ id, paid, full }: { id: string; paid: number; full: number }) => {
      const { error } = await supabase
        .from("other_income_milestones")
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
      onChanged();
    },
  });

  const removeMs = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("other_income_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const collectedTotal = milestones.reduce((s, m) => {
    const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(income.total_amount));
    return s + (m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full));
  }, 0);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {income.source}
            {income.client_name ? ` · ${income.client_name}` : ""}
          </h3>
          <p className="text-sm text-muted-foreground">
            סכום כולל {fmtMoney(Number(income.total_amount))} · נגבה {fmtMoney(collectedTotal)} · יתרה{" "}
            {fmtMoney(Math.max(0, Number(income.total_amount) - collectedTotal))}
          </p>
        </div>
        <Button size="sm" variant="destructive" onClick={onRemove}>
          <Trash2 className="size-4" />
          מחיקה
        </Button>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">תחנות תשלום להכנסה</caption>
        <thead className="bg-muted/60">
          <tr>
            <th scope="col" className="p-2 text-start">שלב</th>
            <th scope="col" className="p-2 text-start">סכום</th>
            <th scope="col" className="p-2 text-start">לו״ז</th>
            <th scope="col" className="p-2 text-start">נגבה</th>
            <th scope="col" className="p-2 text-start">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((m) => {
            const full = milestoneAmount(m.amount_type, Number(m.amount_value), Number(income.total_amount));
            const collected = m.status === "paid" ? full : Math.min(Number(m.paid_amount) || 0, full);
            return (
              <tr key={m.id} className="border-t border-border">
                <td className="p-2">{m.title}</td>
                <td className="p-2">{fmtMoney(full)}</td>
                <td className="p-2">{m.due_date || "—"}</td>
                <td className="p-2">
                  {fmtMoney(collected)}
                  {collected >= full - 0.5 && <span className="ms-1 text-emerald-600">· נגבה במלואו</span>}
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => update.mutate({ id: m.id, paid: full, full })}
                    >
                      סימון כנגבה
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => update.mutate({ id: m.id, paid: 0, full })}
                    >
                      ביטול גבייה
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="מחיקת תחנה"
                      onClick={() => removeMs.mutate(m.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_8rem_minmax(0,1fr)_auto]">
        <Input
          aria-label="שם השלב"
          placeholder="לדוגמה: עמלה רבעונית"
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
          aria-label="ערך"
          inputMode="decimal"
          placeholder={draft.amount_type === "percent" ? "30" : "5000"}
          value={draft.amount_value}
          onChange={(e) => setDraft({ ...draft, amount_value: e.target.value.replace(/[^\d.]/g, "") })}
        />
        <Input
          type="date"
          aria-label="תאריך צפי"
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
