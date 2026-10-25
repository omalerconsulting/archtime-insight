import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil, Eye, Merge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/time";
import type { DuplicatePair } from "@/lib/finance-review";
import type { ReviewIncome } from "@/lib/finance-review";
import { catLabel, type Expense } from "@/lib/pnl-ledger";
import { incomeVat } from "@/lib/income-vat";
import { mergedExpenseAmount } from "@/lib/expense-merge";
import { expenseSourceLabel } from "@/lib/expense-source";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export function FinanceDuplicates({ pairs, expenses, incomes, approved, onChanged, onEdit }: { pairs: DuplicatePair[]; expenses: Expense[]; incomes: (ReviewIncome & { category?: string; notes?: string | null; status?: string })[]; approved: string[]; onChanged: () => void; onEdit: (kind: DuplicatePair["kind"], id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<DuplicatePair | null>(null);
  const [keepId, setKeepId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const pending = pairs.filter(p => !approved.includes(p.key));
  const selected = pending.filter(p => selectedKeys.includes(p.key));
  const approve = async (keys: string[]) => {
    const currentKeys = [...new Set(keys)].filter(key => pending.some(p => p.key === key));
    if (!currentKeys.length || !window.confirm(`לאשר ${currentKeys.length} זוגות רשומות כהוצאות או הכנסות נפרדות, ללא איחוד? כל הרשומות יישארו בתחשיב.`)) return;
    setBusy(true);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("נדרשת כניסה מחדש");
      const { error } = await supabase.from("finance_duplicate_reviews").upsert(currentKeys.map(pair_key => ({ pair_key, approved_by: data.user.id })), { onConflict: "pair_key", ignoreDuplicates: true });
      if (error) throw error;
      setSelectedKeys(previous => previous.filter(key => !currentKeys.includes(key)));
      setViewing(null); toast.success("הרשומות אושרו כתקינות"); onChanged();
    } catch { toast.error("האישור לא נשמר"); } finally { setBusy(false); }
  };
  const firstExpense = expenses.find(e => e.id === viewing?.firstId);
  const secondExpense = expenses.find(e => e.id === viewing?.secondId);
  const kept = keepId === firstExpense?.id ? firstExpense : secondExpense;
  const other = keepId === firstExpense?.id ? secondExpense : firstExpense;
  const merge = async (sum: boolean) => {
    if (!kept || !other) return;
    const amount = mergedExpenseAmount(kept, other, sum);
    if (!window.confirm(`לאחד ${sum ? "עם סכימת שתי ההוצאות" : "ללא סכימה"} לסכום ${fmtMoney(amount)}? יישארו התאריך, הספק, הקטגוריה והסוג של ההוצאה שבחרת; ההוצאה השנייה לא תיכלל עוד בדוח. פעולה זו אינה ניתנת לביטול אוטומטי.`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("merge_duplicate_expenses", { p_keep_id: kept.id, p_remove_id: other.id, p_sum: sum, p_expected_keep: { ...kept }, p_expected_remove: { ...other } });
      if (error) throw error;
      toast.success("ההוצאות אוחדו להוצאה אחת");
      setViewing(null); onChanged();
    } catch { toast.error("האיחוד לא בוצע. יש לרענן את הנתונים ולנסות שוב"); onChanged(); }
    finally { setBusy(false); }
  };
  const recordDetails = (id: string) => {
    if (viewing?.kind === "expense") {
      const e = expenses.find(row => row.id === id);
      if (!e) return <p>ההוצאה אינה זמינה</p>;
      return <dl className="space-y-2 text-sm">
        <Detail label="תיאור" value={e.description} /><Detail label="סכום" value={fmtMoney(e.amount)} />
        <Detail label="מקור הזנה" value={expenseSourceLabel(e)} />
        <Detail label="ספק" value={e.vendor} /><Detail label="תאריך" value={e.expense_date} />
        <Detail label="קטגוריה" value={catLabel(e.category)} /><Detail label="סוג" value={e.is_recurring ? "קבועה חודשית" : "זמנית / חד־פעמית"} />
        {e.is_recurring && <Detail label="עד תאריך" value={e.recurring_until || "ללא תאריך סיום"} />}
        <Detail label="הערות" value={e.notes} />
      </dl>;
    }
    const e = incomes.find(row => row.id === id);
    if (!e) return <p>ההכנסה אינה זמינה</p>;
    const amounts = incomeVat(e.total_amount, e);
    return <dl className="space-y-2 text-sm">
      <Detail label="מקור" value={e.source} /><Detail label="לקוח" value={e.client_name} />
      <Detail label="סכום שהוזן" value={fmtMoney(e.total_amount)} /><Detail label="בסיס מע״מ" value={`${e.vat_included ? "כולל מע״מ" : "לפני מע״מ"} · ${e.vat_rate ?? 0}%`} />
      <Detail label="סכום לדוח" value={fmtMoney(amounts.net)} /><Detail label="לבנק כולל מע״מ" value={fmtMoney(amounts.gross)} />
      <Detail label="קטגוריה" value={e.category} /><Detail label="סטטוס" value={e.status} /><Detail label="הערות" value={e.notes} />
    </dl>;
  };
  if (!pending.length) return null;
  return <><section className="no-print space-y-3 border-s-4 border-warning bg-warning/10 p-4" aria-label="חשד לכפילויות">
    <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />חשד לכפילויות · {pending.length}</h2>
    <p className="text-sm text-muted-foreground">הרשומות עדיין נכללות בתחשיב. יש לבדוק, לתקן או לאשר שהן תקינות.</p>
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <Checkbox aria-label="סימון כל הכפילויות" disabled={busy} checked={selected.length === pending.length ? true : selected.length ? "indeterminate" : false} onCheckedChange={v => setSelectedKeys(v === true ? pending.map(p => p.key) : [])} />
      <span className="text-sm">{selected.length} נבחרו</span>
      <Button size="sm" disabled={busy || !selected.length} onClick={() => void approve(selected.map(p => p.key))}><Check className="size-4" />אישור המסומנות ללא איחוד</Button>
    </div>
    <div className="max-h-80 space-y-3 overflow-auto">{pending.map(p => <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <Checkbox aria-label={`סימון כפילות ${p.first} מול ${p.second}`} disabled={busy} checked={selectedKeys.includes(p.key)} onCheckedChange={v => setSelectedKeys(previous => v === true ? [...previous, p.key] : previous.filter(key => key !== p.key))} />
      <div className="min-w-0 text-sm"><p className="font-medium">{p.kind === "expense" ? "הוצאות" : "הכנסות"} · {fmtMoney(p.amount)}</p><p className="break-words">{p.first} ↔ {p.second}</p><p className="text-muted-foreground">{p.reason}</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>{setViewing(p); setKeepId(p.firstId);}}><Eye className="size-3" />השוואת שתי הרשומות</Button><Button size="sm" variant="outline" onClick={()=>onEdit(p.kind,p.firstId)}><Pencil className="size-3" />תיקון הראשונה</Button><Button size="sm" variant="outline" onClick={()=>onEdit(p.kind,p.secondId)}><Pencil className="size-3" />תיקון השנייה</Button><Button size="sm" disabled={busy} onClick={()=>void approve([p.key])}><Check className="size-3" />אישור שתיהן</Button></div>
    </div>)}</div>
  </section>
    <Dialog open={!!viewing} onOpenChange={open => { if (!open && !busy) setViewing(null); }}>
      <DialogContent dir="rtl" className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto">
        <DialogTitle className="pe-8">השוואת שתי הרשומות</DialogTitle>
        <DialogDescription>{viewing?.reason}</DialogDescription>
        {viewing && <div className="grid gap-5 sm:grid-cols-2">{[viewing.firstId, viewing.secondId].map((id, index) => <section key={id} className="min-w-0 space-y-3 border-t border-border pt-3">
          <h3 className="font-semibold">{index === 0 ? "הרשומה הראשונה" : "הרשומה השנייה"}</h3>
          {recordDetails(id)}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { setViewing(null); onEdit(viewing.kind, id); }}><Pencil className="size-3" />תיקון {index === 0 ? "הראשונה" : "השנייה"}</Button>
        </section>)}</div>}
        {viewing?.kind === "expense" && kept && other && <section className="space-y-3 border-t border-border pt-4">
          <h3 className="font-semibold">איחוד להוצאה אחת</h3>
          <Select value={keepId} onValueChange={setKeepId} disabled={busy}>
            <SelectTrigger aria-label="ההוצאה שפרטיה יישמרו"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={viewing.firstId}>שמירת פרטי הראשונה</SelectItem><SelectItem value={viewing.secondId}>שמירת פרטי השנייה</SelectItem></SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">תאריך: {kept.expense_date} · {catLabel(kept.category)} · {kept.is_recurring ? "קבועה חודשית" : "חד־פעמית"}. ההוצאה השנייה תוסר מהתחשיב; תיעוד האיחוד יישמר בהערות.</p>
          {(kept.is_recurring !== other.is_recurring || kept.expense_date !== other.expense_date || kept.recurring_until !== other.recurring_until) && <p role="alert" className="text-sm text-warning">מועדי ההוצאות או הסוג שלהן שונים. האיחוד יחול לפי התאריך והחזרה החודשית של ההוצאה הנבחרת בלבד.</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void merge(true)}><Merge className="size-4" />איחוד עם סכימה · {fmtMoney(mergedExpenseAmount(kept, other, true))}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void merge(false)}><Merge className="size-4" />איחוד ללא סכימה · {fmtMoney(mergedExpenseAmount(kept, other, false))}</Button>
          </div>
        </section>}
        {viewing && <Button variant="outline" disabled={busy} onClick={() => void approve([viewing.key])}><Check className="size-4" />אישור שתיהן ללא איחוד</Button>}
      </DialogContent>
    </Dialog>
  </>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-words whitespace-pre-wrap">{value || "—"}</dd></div>;
}