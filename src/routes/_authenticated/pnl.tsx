import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Printer, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { PnlStatement } from "@/components/PnlStatement";
import { StatementImport } from "@/components/StatementImport";
import { IncomeVatFields } from "@/components/IncomeVatFields";
import { incomeVat } from "@/lib/income-vat";
import { ForecastCalculator } from "@/components/ForecastCalculator";
import { EXPENSE_CATEGORIES, catLabel, buildLedger, forecastMonths, validDate, type Expense } from "@/lib/pnl-ledger";
import { fmtMoney, MONTH_NAMES, milestoneAmount, todayIso, yearOptions } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkFinanceActions } from "@/components/BulkFinanceActions";
import { FinanceDuplicates } from "@/components/FinanceDuplicates";
import { ExpenseSourceBadge } from "@/components/ExpenseSourceBadge";
import { findDuplicates, suggestRecurring } from "@/lib/finance-review";
import { AUTHORITY_NOTE, printFullPnl } from "@/lib/pnl-print";
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

type OtherIncome = {
  vat_included: boolean;
  vat_rate: number;
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

function PnlPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("summary");
  const [editTarget, setEditTarget] = useState<{ kind: "expense" | "income"; id: string } | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const q = useQuery({
    queryKey: ["pnl"],
    queryFn: async () => {
      const [projects, milestones, expenses, incomes, incomeMs, adj, comms, reviews] = await Promise.all([
        supabase.from("projects").select("id, code, name, fee_total, status, vat_included, vat_rate"),
        supabase.from("project_milestones").select("*"),
        supabase.from("expenses").select("*").is("merged_into", null).order("expense_date", { ascending: false }),
        supabase.from("other_incomes").select("*").order("created_at", { ascending: false }),
        supabase.from("other_income_milestones").select("*").order("sort_order"),
        supabase.from("pnl_adjustments").select("*"),
        supabase.from("project_commissions").select("id, project_id, supplier_name, amount, expected_date, paid_amount, paid_date, vat_included, vat_rate"),
        supabase.from("finance_duplicate_reviews").select("pair_key"),
      ]);
      for (const r of [projects, milestones, expenses, incomes, incomeMs, adj, comms, reviews]) {
        if (r.error) throw r.error;
      }
      return {
        projects: projects.data ?? [],
        milestones: milestones.data ?? [],
        expenses: (expenses.data ?? []) as Expense[],
        incomes: (incomes.data ?? []) as OtherIncome[],
        incomeMs: (incomeMs.data ?? []) as OtherMilestone[],
        adjustments: adj.data ?? [],
        commissions: comms.data ?? [],
        reviews: (reviews.data ?? []).map(r=>r.pair_key),
      };
    },
  });

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["pnl"] }); void qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const rows = useMemo(() => buildLedger(q.data, year), [q.data, year]);

  const totals = rows.reduce(
    (s, r) => ({
      income: s.income + r.income,
      expenses: s.expenses + r.totalExpenses,
      profit: s.profit + r.profit,
    }),
    { income: 0, expenses: 0, profit: 0 },
  );
  const { current, next } = forecastMonths(q.data, todayIso());
  const duplicatePairs = findDuplicates(q.data?.expenses ?? [], q.data?.incomes ?? []);

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
          <Button disabled={!q.data} onClick={() => { if (!printFullPnl(rows, year)) toast.error("יש לאפשר פתיחת חלון להדפסת הדוח"); }}>
            <Printer className="size-4" />
            דוח מלא להדפסה / PDF
          </Button>
        </div>
      </div>

      {q.isError && <p role="alert" className="text-destructive">טעינת הנתונים נכשלה. <Button variant="link" onClick={()=>void q.refetch()}>ניסיון נוסף</Button></p>}
      <FinanceDuplicates pairs={duplicatePairs} expenses={q.data?.expenses ?? []} incomes={q.data?.incomes ?? []} approved={q.data?.reviews ?? []} onChanged={invalidate} onEdit={(kind,id)=>{ setEditTarget({kind,id}); setTab(kind === "expense" ? "expenses" : "incomes"); }} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print h-auto max-w-full flex-wrap print:hidden">
          <TabsTrigger value="summary">תחזית שנתית</TabsTrigger>
          <TabsTrigger value="expenses">הוצאות</TabsTrigger>
          <TabsTrigger value="incomes">הכנסות נוספות</TabsTrigger>
          <TabsTrigger value="calculator">מחשבון תחזיות</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-6">
          <div className="print-area space-y-6">
            <h2 className="hidden text-xl font-bold print:block">
              דוח רווח והפסד – שנת {year}
            </h2>
            <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              <Stat label="סה״כ הכנסות בשנה" value={fmtMoney(totals.income)} />
              <Stat label="סה״כ הוצאות בשנה" value={fmtMoney(totals.expenses)} />
              <Stat
                label="רווח שנתי צפוי"
                value={fmtMoney(totals.profit)}
                tone={totals.profit >= 0 ? "good" : "bad"}
              />
              <Stat
                label={`צפי החודש · ${current?.key ?? ""}`}
                value={current ? fmtMoney(current.profit) : "—"}
                tone={(current?.profit ?? 0) >= 0 ? "good" : "bad"}
              />
              <Stat label={`צפי חודש הבא · ${next?.key ?? ""}`} value={next ? fmtMoney(next.profit) : "—"} tone={(next?.profit ?? 0) >= 0 ? "good" : "bad"} />
            </section>
            <p className="text-sm text-muted-foreground">{AUTHORITY_NOTE}</p><p className="text-sm text-muted-foreground">ההכנסות והרווח בדוח לפני מע״מ; הגבייה בבנק מוצגת בנפרד כולל מע״מ. הכנסות קיימות נשארו בשיעור 0% עד בדיקת מנהל.</p>

            <PnlStatement rows={rows} expenses={q.data?.expenses ?? []} year={year}
              adjustment={r => <AdjustDialog monthKeyValue={r.key} label={r.key} onSaved={invalidate} />} />
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab key={editTarget?.kind === "expense" ? editTarget.id : "expenses"} initialId={editTarget?.kind === "expense" ? editTarget.id : undefined} expenses={q.data?.expenses ?? []} onChanged={invalidate} />
        </TabsContent>

        <TabsContent value="incomes" className="mt-4">
          <IncomesTab
            key={editTarget?.kind === "income" ? editTarget.id : "incomes"}
            initialId={editTarget?.kind === "income" ? editTarget.id : undefined}
            incomes={q.data?.incomes ?? []}
            milestones={q.data?.incomeMs ?? []}
            onChanged={invalidate}
          />
        </TabsContent>
        <TabsContent value="calculator" className="mt-4"><ForecastCalculator data={q.data} /></TabsContent>
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
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
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

function ExpensesTab({ expenses, onChanged, initialId }: { expenses: Expense[]; onChanged: () => void; initialId?: string }) {
  const initial = expenses.find(e=>e.id===initialId);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(initial?.id ?? null);
  const [form, setForm] = useState(initial ? { category: initial.category, description: initial.description, vendor: initial.vendor || "", amount: String(initial.amount), expense_date: initial.expense_date, is_recurring: initial.is_recurring, recurring_until: initial.recurring_until || "", notes: initial.notes || "" } : {
    category: "general",
    description: "",
    vendor: "",
    amount: "",
    expense_date: todayIso(),
    is_recurring: false,
    recurring_until: "",
    notes: "",
  });

  const [catFilter, setCatFilter] = useState("all");
  const [amountFilter, setAmountFilter] = useState("all"); // all | high | low
  const [amountThreshold, setAmountThreshold] = useState("");
  const filtered = useMemo(
    () =>
      expenses.filter((e) => {
        if (catFilter !== "all" && e.category !== catFilter) return false;
        if (amountFilter !== "all" && amountThreshold.trim() !== "") {
          const t = Number(amountThreshold);
          if (Number.isFinite(t) && (amountFilter === "high" ? Number(e.amount) <= t : Number(e.amount) >= t)) return false;
        }
        return true;
      }),
    [expenses, catFilter, amountFilter, amountThreshold],
  );
  const filteredSum = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const filtersActive = catFilter !== "all" || (amountFilter !== "all" && amountThreshold.trim() !== "");
  const clearFilters = () => { setCatFilter("all"); setAmountFilter("all"); setAmountThreshold(""); };

  const add = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error("חסר תיאור");
      if (!validDate(form.expense_date) || !Number.isFinite(Number(form.amount)) || !form.amount.trim() || Number(form.amount) === 0) throw new Error("יש להזין תאריך וסכום תקינים");
      if (form.is_recurring && form.recurring_until && (!validDate(form.recurring_until) || form.recurring_until < form.expense_date)) throw new Error("תאריך סיום חייב להיות אחרי תאריך ההוצאה");
      const payload = {
        category: form.category,
        description: form.description.trim(),
        vendor: form.vendor.trim() || null,
        amount: Number(form.amount) || 0,
        expense_date: form.expense_date,
        is_recurring: form.is_recurring,
        recurring_until: form.is_recurring && form.recurring_until ? form.recurring_until : null,
        notes: form.notes.trim() || null,
      };
      const suspected = findDuplicates([...expenses.filter(e=>e.id!==editingId), { ...payload, id: editingId || "draft" }], []);
      if (suspected.some(p=>p.firstId===(editingId || "draft") || p.secondId===(editingId || "draft")) && !window.confirm("חשד לכפילות בהוצאה. לשמור בכל זאת ולהעביר לבדיקת כפילויות?")) throw new Error("השמירה בוטלה; ניתן לתקן את ההוצאה");
      const result = editingId ? await supabase.from("expenses").update(payload).eq("id", editingId).select("id").single() : await supabase.from("expenses").insert(payload).select("id").single();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new Error("ההוצאה לא נשמרה; יש לבדוק הרשאת מנהל");
    },
    onSuccess: () => {
      toast.success(editingId ? "ההוצאה עודכנה" : "ההוצאה נוספה");
      setEditingId(null);
      setForm({ category: "general", description: "", vendor: "", amount: "", expense_date: todayIso(), is_recurring: false, recurring_until: "", notes: "" });
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "הוספת ההוצאה נכשלה"),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("expenses").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההוצאות נמחקו");
      setSelected([]);
      onChanged();
    },
    onError: () => toast.error("המחיקה נכשלה"),
  });

  const editExpense = (e: Expense) => {
    setEditingId(e.id); setForm({ category: e.category, description: e.description, vendor: e.vendor || "", amount: String(e.amount), expense_date: e.expense_date, is_recurring: e.is_recurring, recurring_until: e.recurring_until || "", notes: e.notes || "" });
    requestAnimationFrame(() => { const input = document.getElementById("ex-desc"); input?.scrollIntoView({ block: "center" }); input?.focus({ preventScroll: true }); });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{editingId ? "עריכת הוצאה" : "הוספת הוצאה"}</h2>
          <StatementImport expenses={expenses} onSaved={onChanged} />
        </div>
        <p className="mb-4 text-xs text-muted-foreground">סעיפים חשבונאיים מקובלים בישראל; הסיווג אינו קובע הכרה בהוצאה או זכאות לניכוי מע״מ.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="ex-cat">קטגוריה</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v, is_recurring: suggestRecurring(v, form.vendor, expenses) })}>
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
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
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
            <Label htmlFor="ex-rec">סוג הוצאה</Label>
            <Select value={form.is_recurring ? "fixed" : "temporary"} onValueChange={v=>setForm({...form,is_recurring:v==="fixed"})}><SelectTrigger id="ex-rec"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">קבועה חודשית</SelectItem><SelectItem value="temporary">זמנית / חד־פעמית</SelectItem></SelectContent></Select>
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
          {editingId ? "שמירת שינויים" : "הוספת הוצאה"}
        </Button>
        {editingId && <Button className="ms-2 mt-4" variant="outline" onClick={() => { setEditingId(null); setForm({ category: "general", description: "", vendor: "", amount: "", expense_date: todayIso(), is_recurring: false, recurring_until: "", notes: "" }); }}>ביטול</Button>}
      </section>

      <p className="text-sm text-muted-foreground">קבועה משובצת אוטומטית מדי חודש עד תאריך הסיום; זמנית רק בחודש שנבחר. הסיווג הראשוני מוצע לפי הקטגוריה וניתן לשינוי.</p>
      <BulkFinanceActions ids={filtered.map(e=>e.id)} selected={selected} onSelect={setSelected} onDelete={ids=>remove.mutate(ids)} busy={remove.isPending} label="הוצאות" />
      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="ex-filter-cat" className="text-xs text-muted-foreground">סינון לפי תחום</Label>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger id="ex-filter-cat" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל התחומים</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ex-filter-amount" className="text-xs text-muted-foreground">סינון לפי סכום</Label>
          <Select value={amountFilter} onValueChange={setAmountFilter}>
            <SelectTrigger id="ex-filter-amount" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסכומים</SelectItem>
              <SelectItem value="high">סכום גבוה מ…</SelectItem>
              <SelectItem value="low">סכום נמוך מ…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {amountFilter !== "all" && (
          <div className="space-y-1">
            <Label htmlFor="ex-filter-threshold" className="text-xs text-muted-foreground">סכום (₪)</Label>
            <Input
              id="ex-filter-threshold"
              inputMode="decimal"
              className="w-32"
              placeholder={amountFilter === "high" ? "למשל 1000" : "למשל 500"}
              value={amountThreshold}
              onChange={(e) => setAmountThreshold(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        )}
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters}>ניקוי סינון</Button>
        )}
        <p className="ms-auto text-sm text-muted-foreground" aria-live="polite">
          {filtered.length} מתוך {expenses.length} הוצאות · סה״כ מסונן {fmtMoney(filteredSum)}
        </p>
      </section>
      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="p-3 text-start font-semibold">כל ההוצאות</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-2 text-start">סימון</th>
              <th scope="col" className="p-2 text-start">תאריך</th>
              <th scope="col" className="p-2 text-start">קטגוריה</th>
              <th scope="col" className="p-2 text-start">תיאור</th>
              <th scope="col" className="p-2 text-start">ספק</th>
              <th scope="col" className="p-2 text-start">סכום</th>
              <th scope="col" className="p-2 text-start">סוג</th>
              <th scope="col" className="p-2 text-start">מקור הזנה</th>
              <th scope="col" className="p-2 text-start">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-2"><Checkbox aria-label={`סימון הוצאה ${e.description}`} checked={selected.includes(e.id)} onCheckedChange={v=>setSelected(v ? [...selected,e.id] : selected.filter(id=>id!==e.id))} /></td>
                <td className="p-2">{e.expense_date}</td>
                <td className="p-2">{catLabel(e.category)}</td>
                <td className="p-2 font-medium"><Button variant="link" className="h-auto whitespace-normal p-0 text-start" onClick={() => editExpense(e)}>{e.description}</Button></td>
                <td className="p-2">{e.vendor || "—"}</td>
                <td className="p-2">{fmtMoney(Number(e.amount))}</td>
                <td className="p-2">
                  {e.is_recurring
                    ? `קבועה חודשית${e.recurring_until ? ` · עד ${e.recurring_until}` : ""}`
                    : "חד פעמית"}
                </td>
                <td className="p-2"><ExpenseSourceBadge expense={e} /></td>
                <td className="p-2">
                  <Button size="icon" variant="ghost" title="עריכת הוצאה" aria-label={`עריכת ההוצאה ${e.description}`} onClick={() => editExpense(e)}><Pencil className="size-4" /></Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`מחיקת ההוצאה ${e.description}`}
                    onClick={() => { if (window.confirm("למחוק את ההוצאה?")) remove.mutate([e.id]); }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
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
  initialId,
}: {
  initialId?: string;
  incomes: OtherIncome[];
  milestones: OtherMilestone[];
  onChanged: () => void;
}) {
  const initial = incomes.find(i=>i.id===initialId);
  const [editingId, setEditingId] = useState<string | null>(initial?.id ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState(initial ? {source:initial.source,client_name:initial.client_name || "",total_amount:String(initial.total_amount),vat_included:initial.vat_included,vat_rate:String(initial.vat_rate),notes:initial.notes || ""} : { source: "", client_name: "", total_amount: "", vat_included: false, vat_rate: "18", notes: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.source.trim()) throw new Error("חסר שם מקור ההכנסה");
      const payload = {
        source: form.source.trim(),
        client_name: form.client_name.trim() || null,
        total_amount: Number(form.total_amount) || 0,
        vat_included: form.vat_included,
        vat_rate: Number(form.vat_rate),
        notes: form.notes.trim() || null,
      };
      if (!form.vat_rate.trim() || !Number.isFinite(payload.vat_rate) || payload.vat_rate < 0 || payload.vat_rate > 100) throw new Error("יש להזין שיעור מע״מ בין 0 ל־100");
      if (!Number.isFinite(payload.total_amount) || payload.total_amount <= 0) throw new Error("יש להזין סכום חיובי תקין");
      const suspected = findDuplicates([], [...incomes.filter(i=>i.id!==editingId),{...payload,id:editingId || "draft"}]);
      if (suspected.some(p=>p.firstId===(editingId || "draft") || p.secondId===(editingId || "draft")) && !window.confirm("חשד לכפילות בהכנסה. לשמור בכל זאת ולהעביר לבדיקת כפילויות?")) throw new Error("השמירה בוטלה; ניתן לתקן את ההכנסה");
      const { error } = editingId ? await supabase.from("other_incomes").update(payload).eq("id", editingId) : await supabase.from("other_incomes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingId ? "ההכנסה עודכנה" : "ההכנסה נוספה");
      setEditingId(null);
      setForm({ source: "", client_name: "", total_amount: "", vat_included: false, vat_rate: "18", notes: "" });
      onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "ההוספה נכשלה"),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("other_incomes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההכנסות ותחנות התשלום שלהן נמחקו");
      setSelected([]);
      onChanged();
    },
    onError: () => toast.error("מחיקת ההכנסות נכשלה"),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-semibold">{editingId ? "עריכת הכנסה" : "הוספת הכנסה שאינה מפרויקט"}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          לדוגמה: עמלות ספקים, ייעוץ חיצוני, השכרת ציוד. ההכנסות בדוח מוצגות לפני מע״מ; הגבייה בבנק כולל מע״מ. תחנות התשלום והסכומים שנגבו נרשמים לפי בסיס הסכום שנבחר.
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
            <Label htmlFor="oi-amount">סכום הכנסה (₪)</Label>
            <Input
              id="oi-amount"
              inputMode="decimal"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </div>
          <IncomeVatFields id="oi-vat" amount={Number(form.total_amount)} included={form.vat_included} rate={form.vat_rate} onChange={(included,rate)=>setForm({...form,vat_included:included,vat_rate:rate})} />
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
          {editingId ? "שמירת שינויים" : "הוספת הכנסה"}
        </Button>
        {editingId && <Button className="ms-2" variant="outline" onClick={()=>{setEditingId(null);setForm({source:"",client_name:"",total_amount:"",vat_included:false,vat_rate:"18",notes:""});}}>ביטול</Button>}
      </section>

      <BulkFinanceActions ids={incomes.map(i=>i.id)} selected={selected} onSelect={setSelected} onDelete={ids=>remove.mutate(ids)} busy={remove.isPending} label="הכנסות" />
      {incomes.map((inc) => (
        <IncomeCard
          key={inc.id}
          income={inc}
          milestones={milestones.filter((m) => m.income_id === inc.id)}
          onChanged={onChanged}
          selected={selected.includes(inc.id)}
          onSelect={v=>setSelected(v ? [...selected,inc.id] : selected.filter(id=>id!==inc.id))}
          onEdit={()=>{setEditingId(inc.id);setForm({source:inc.source,client_name:inc.client_name || "",total_amount:String(inc.total_amount),vat_included:inc.vat_included,vat_rate:String(inc.vat_rate),notes:inc.notes || ""});document.getElementById("oi-src")?.scrollIntoView({block:"center"});}}
          onRemove={() => {if(window.confirm("למחוק את ההכנסה וכל תחנות התשלום שלה?")) remove.mutate([inc.id]);}}
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
  selected, onSelect, onEdit,
}: {
  income: OtherIncome;
  milestones: OtherMilestone[];
  onChanged: () => void;
  onRemove: () => void;
  selected: boolean; onSelect: (value: boolean) => void; onEdit: () => void;
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
          <div className="mb-2 flex items-center gap-2"><Checkbox aria-label={`סימון הכנסה ${income.source}`} checked={selected} onCheckedChange={v=>onSelect(v===true)} /><Button variant="link" onClick={onEdit}>עריכת הכנסה</Button></div>
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

      <p className="mb-3 text-sm text-muted-foreground">{income.vat_included ? "סכומים כוללים מע״מ" : "סכומים לפני מע״מ"} · {income.vat_rate}% · לדוח: {fmtMoney(incomeVat(Number(income.total_amount), income).net)} · לבנק: {fmtMoney(incomeVat(Number(income.total_amount), income).gross)} · נגבה בבנק: {fmtMoney(incomeVat(collectedTotal, income).gross)}</p>
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
                  {collected >= full - 0.5 && <span className="ms-1 text-success">· נגבה במלואו</span>}
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
