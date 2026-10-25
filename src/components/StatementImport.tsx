import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { scanStatement } from "@/lib/statement-scan.functions";
import { EXPENSE_CATEGORIES, catLabel, validDate, type Expense } from "@/lib/pnl-ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { suggestRecurring } from "@/lib/finance-review";
import { Checkbox } from "@/components/ui/checkbox";
import { checkScanDuplicates, scanNeedsDecision, type ScanExpense, type StoredScanExpense } from "@/lib/statement-duplicates";

type Proposal = { description: string; vendor: string; amount: number; expense_date: string; category: string; warning: string; selected: boolean; importKey: string; is_recurring: boolean; recurring_until: string; decision: "add" | "skip" | ""; reviewedFingerprint: string };
const asExpense = (r: Proposal): ScanExpense => ({ ...r, recurring_until: r.is_recurring && r.recurring_until ? r.recurring_until : null });
async function loadAllExpenses(): Promise<StoredScanExpense[]> {
  const all: StoredScanExpense[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("expenses").select("*").order("id").range(start, start + 499);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 500) return all;
  }
}
export function StatementImport({ expenses, onSaved }: { expenses: Expense[]; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const scan = useServerFn(scanStatement);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Proposal[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [stored, setStored] = useState<StoredScanExpense[]>([]);
  const change = (index: number, patch: Partial<Proposal>) => setRows(previous => previous.map((r, i) => i === index ? { ...r, ...patch } : r));
  const peers = rows.filter(r => r.selected && r.decision !== "skip").map(asExpense);
  const checks = rows.map(r => checkScanDuplicates(asExpense(r), stored, peers));
  const upload = async (file: File) => {
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) { toast.error("בחרו PDF או תמונה עד 10MB"); return; }
    setOpen(true); setBusy(true); setFilename(file.name); setRows([]); setWarnings([]);
    try {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await scan({ data: { filename: file.name, mime: file.type as "application/pdf" | "image/png" | "image/jpeg" | "image/webp", base64 } });
      if (result.error) throw new Error(result.error);
      const currentExpenses = await loadAllExpenses();
      setStored(currentExpenses);
      setWarnings(result.warnings);
      setRows(result.rows.map((r, i) => {
        const importKey = `${hash}:${i}`;
        return { ...r, importKey, selected: false, decision: "" as const, reviewedFingerprint: "", is_recurring: suggestRecurring(r.category, r.vendor, currentExpenses.filter(e => !e.merged_into)), recurring_until: "" };
      }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "הסריקה נכשלה"); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const selected = rows.filter(r => r.selected && r.decision !== "skip");
    if (!selected.length || selected.some(r => !validDate(r.expense_date) || !Number.isFinite(r.amount) || r.amount === 0 || !r.description.trim())) { toast.error("בדקו תאריך, תיאור וסכום בכל שורה שאושרה"); return; }
    if (selected.some(r=>r.is_recurring && r.recurring_until && (!validDate(r.recurring_until) || r.recurring_until < r.expense_date))) { toast.error("בדקו תאריכי סיום של הוצאות קבועות"); return; }
    setSaving(true);
    try {
      const currentExpenses = await loadAllExpenses();
      setStored(currentExpenses);
      if (selected.some(r => scanNeedsDecision(checkScanDuplicates(asExpense(r), currentExpenses, selected.map(asExpense)), r.decision, r.reviewedFingerprint))) {
        toast.error("נמצאו כפילויות — בדקו את ההוצאות המוצגות ובחרו פעולה לכל שורה לפני שמירה");
        return;
      }
      const { error } = await supabase.from("expenses").upsert(selected.map(r => ({ category: r.category, description: r.description.trim(), vendor: r.vendor.trim() || null, amount: r.amount, expense_date: r.expense_date, is_recurring: r.is_recurring, recurring_until: r.is_recurring && r.recurring_until ? r.recurring_until : null, notes: `סריקת מסמך: ${filename}`, import_key: r.importKey })), { onConflict: "import_key", ignoreDuplicates: true });
      if (error) throw error;
      toast.success("ההוצאות המאושרות נשמרו; שורות שכבר יובאו לא נוספו שוב"); setOpen(false); onSaved();
    } catch { toast.error("בדיקת ההוצאות הקיימות או השמירה נכשלה; לא ניתן להשלים את הייבוא והשורות נשארו לבדיקה"); }
    finally { setSaving(false); }
  };
  return <>
    <input ref={input} type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="מסמך הוצאות לסריקה" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
    <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}><ScanLine className="size-4" />סריקת דפי חשבון / אשראי</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy && !saving) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-6xl overflow-y-auto" dir="rtl" onInteractOutside={e => e.preventDefault()}>
        <DialogTitle className="ps-8">אישור הוצאות מהמסמך</DialogTitle>
        <DialogDescription>{filename} · סריקה באמצעות Lovable AI כרוכה בשימוש ביתרת AI. מסמך בנק אינו תחליף לחשבונית מס.</DialogDescription>
        {busy ? <div className="flex items-center gap-3 py-8" role="status"><Loader2 className="size-5 animate-spin" />סורק את המסמך…</div> : <>
          {warnings.length > 0 && <ul className="list-inside list-disc text-sm text-warning">{warnings.map((w,i) => <li key={i}>{w}</li>)}</ul>}
          <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr>{["אישור", "תאריך / חודש", "תיאור", "ספק", "קטגוריה", "סכום (₪)", "סוג", "קבועה עד", "בדיקה"].map(h => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>
            {rows.map((r,i) => <tr key={r.importKey} className="border-t border-border">
              <td className="p-2"><Checkbox aria-label={`אישור שורה ${i+1}`} disabled={saving || checks[i]?.blocked} checked={r.selected} onCheckedChange={v => change(i,{selected:v===true})} /></td>
              <td className="p-2"><Input type="date" className="w-36" aria-label={`תאריך שורה ${i+1}`} value={r.expense_date} onChange={e => change(i,{expense_date:e.target.value})} /></td>
              <td className="p-2"><Input aria-label={`תיאור שורה ${i+1}`} value={r.description} onChange={e => change(i,{description:e.target.value})} /></td>
              <td className="p-2"><Input aria-label={`ספק שורה ${i+1}`} value={r.vendor} onChange={e => change(i,{vendor:e.target.value})} /></td>
              <td className="p-2"><Select value={r.category} onValueChange={v => change(i,{category:v})}><SelectTrigger className="w-48" aria-label={`קטגוריה שורה ${i+1}`}><SelectValue /></SelectTrigger><SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem value={c.value} key={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></td>
              <td className="p-2"><Input type="number" step="0.01" className="w-28" aria-label={`סכום שורה ${i+1}`} value={r.amount} onChange={e => change(i,{amount:Number(e.target.value)})} /></td>
              <td className="p-2"><Select value={r.is_recurring ? "fixed" : "temporary"} onValueChange={v=>change(i,{is_recurring:v==="fixed"})}><SelectTrigger className="w-36" aria-label={`סוג הוצאה שורה ${i+1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">קבועה חודשית</SelectItem><SelectItem value="temporary">זמנית</SelectItem></SelectContent></Select></td>
              <td className="p-2"><Input type="date" className="w-36" aria-label={`סיום שורה ${i+1}`} disabled={!r.is_recurring} value={r.recurring_until} onChange={e=>change(i,{recurring_until:e.target.value})} /></td>
              <td className="min-w-72 p-2">
                {r.warning && <p className="text-warning">{r.warning}</p>}
                {checks[i]?.blocked ? <p className="text-warning">שורה זו כבר יובאה; לא תתווסף שוב.</p> : (checks[i]?.matches.length ?? 0) > 0 ? <div className="space-y-2">
                  <p className="font-medium text-warning">חשד לכפילות</p>
                  {checks[i]?.matches.map(e => <div key={e.id} className="border-s-2 border-border ps-2 text-xs">
                    <p className="font-medium">{e.id.startsWith("scan:") ? "שורה נוספת במסמך" : "הוצאה קיימת"}: {e.description}</p>
                    <p>{e.vendor || "ללא ספק"} · {e.expense_date} · {Number(e.amount).toLocaleString("he-IL")} ₪</p>
                    <p>{catLabel(e.category)} · {e.is_recurring ? "קבועה חודשית" : "זמנית"}{e.recurring_until ? ` · עד ${e.recurring_until}` : ""}</p>
                    {e.notes && <p className="break-words">{e.notes}</p>}
                  </div>)}
                  <Select disabled={saving} value={r.reviewedFingerprint === checks[i]?.fingerprint ? r.decision : ""} onValueChange={v => change(i, { decision: v === "add" ? "add" : "skip", reviewedFingerprint: checks[i]?.fingerprint || "" })}>
                    <SelectTrigger aria-label={`פעולה בכפילות שורה ${i+1}`}><SelectValue placeholder="בחרו מה לעשות בכפילות" /></SelectTrigger>
                    <SelectContent><SelectItem value="skip">דלג — לא להוסיף</SelectItem><SelectItem value="add">זו הוצאה נפרדת — הוסף בכל זאת</SelectItem></SelectContent>
                  </Select>
                </div> : <p className="text-muted-foreground">{r.decision === "skip" ? "לא תתווסף" : "לא נמצאה כפילות"}</p>}
              </td>
            </tr>)}
          </tbody></table></div>
          {!rows.length && <p className="text-muted-foreground">לא זוהו הוצאות לאישור.</p>}
          <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving || !rows.some(r => r.selected && r.decision !== "skip")}>שמירת {rows.filter(r=>r.selected && r.decision !== "skip").length} שורות מאושרות</Button><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>ביטול</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}