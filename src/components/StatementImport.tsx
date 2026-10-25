import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine, Loader2, FileText, RotateCcw, Upload, CheckCircle2, AlertCircle } from "lucide-react";
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
import { extractStatementExcel, statementFileKind, statementInputSchema, STATEMENT_MAX_BYTES } from "@/lib/statement-input";
import { runStatementBatch } from "@/lib/statement-batch";

type Proposal = { description: string; vendor: string; amount: number; expense_date: string; category: string; warning: string; selected: boolean; importKey: string; is_recurring: boolean; recurring_until: string; decision: "add" | "skip" | ""; reviewedFingerprint: string };
type ScanDocument = { id: string; file: File; status: "queued" | "scanning" | "ready" | "error" | "saved"; rows: Proposal[]; warnings: string[]; error: string; savedCount: number };
const statusLabel = { queued: "ממתין לסריקה", scanning: "בסריקה", ready: "מוכן לבדיקה", error: "הסריקה נכשלה", saved: "נשמר" };
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
  const replacementInput = useRef<HTMLInputElement>(null);
  const replacementId = useRef<string | null>(null);
  const hashes = useRef(new Map<string, string>());
  const batchLock = useRef(false);
  const scan = useServerFn(scanStatement);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<ScanDocument[]>([]);
  const [activeId, setActiveId] = useState("");
  const [stored, setStored] = useState<StoredScanExpense[]>([]);
  const active = documents.find(d => d.id === activeId);
  const rows = active?.rows || [];
  const warnings = active?.warnings || [];
  const allRows = documents.flatMap(d => d.rows);
  const selectedRows = allRows.filter(r => r.selected && r.decision !== "skip");
  const changeDocument = (id: string, patch: Partial<ScanDocument>) => setDocuments(previous => previous.map(d => d.id === id ? { ...d, ...patch } : d));
  const change = (index: number, patch: Partial<Proposal>) => setDocuments(previous => previous.map(d => d.id === activeId ? { ...d, rows: d.rows.map((r, i) => i === index ? { ...r, ...patch } : r) } : d));
  const peers = selectedRows.map(asExpense);
  const checks = rows.map(r => checkScanDuplicates(asExpense(r), stored, peers));
  const upload = async (files: File[], replaceId?: string) => {
    if (batchLock.current || !files.length) return;
    batchLock.current = true;
    const added: ScanDocument[] = files.map(file => ({ id: replaceId || crypto.randomUUID(), file, status: "queued", rows: [], warnings: [], error: "", savedCount: 0 }));
    setDocuments(previous => replaceId ? previous.map(d => d.id === replaceId ? (added[0] || d) : d) : [...previous, ...added]);
    setActiveId(added[0]?.id || "");
    setOpen(true); setBusy(true);
    try { await runStatementBatch(added, async document => {
      const { file, id } = document;
      changeDocument(id, { status: "scanning", error: "" });
      const kind = statementFileKind(file);
      if (!kind || file.size === 0 || file.size > STATEMENT_MAX_BYTES) throw new Error("בחרו קובץ Excel, PDF או תמונה שאינו ריק ועד 10MB. ניתן להחליף את הקובץ ולנסות שוב.");
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      const existingDocument = hashes.current.get(hash);
      if (existingDocument && existingDocument !== id) throw new Error("אותו קובץ כבר נבחר לסריקה. בדקו את המסמך הקיים או החליפו בקובץ אחר.");
      hashes.current.set(hash, id);
      const payload = kind === "excel"
        ? { filename: file.name, mime: "text/plain" as const, text: await extractStatementExcel(bytes) }
        : { filename: file.name, mime: kind, base64: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); }) };
      const result = await scan({ data: statementInputSchema.parse(payload) });
      if (result.error) throw new Error(result.error);
      const currentExpenses = await loadAllExpenses();
      setStored(currentExpenses);
      changeDocument(id, { status: "ready", warnings: result.warnings, rows: result.rows.map((r, i) => {
        const importKey = `${hash}:${i}`;
        return { ...r, importKey, selected: false, decision: "" as const, reviewedFingerprint: "", is_recurring: suggestRecurring(r.category, r.vendor, currentExpenses.filter(e => !e.merged_into)), recurring_until: "" };
      }) });
    }, (document, error) => changeDocument(document.id, { status: "error", error: error instanceof Error ? error.message : "הסריקה נכשלה. ניתן לנסות שוב או להחליף קובץ." })); }
    finally { setBusy(false); batchLock.current = false; }
  };
  const save = async () => {
    const selected = selectedRows;
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
      const { error } = await supabase.from("expenses").upsert(selected.map(r => ({ category: r.category, description: r.description.trim(), vendor: r.vendor.trim() || null, amount: r.amount, expense_date: r.expense_date, is_recurring: r.is_recurring, recurring_until: r.is_recurring && r.recurring_until ? r.recurring_until : null, notes: `סריקת מסמך: ${documents.find(d => d.rows.includes(r))?.file.name || ""}`, import_key: r.importKey })), { onConflict: "import_key", ignoreDuplicates: true });
      if (error) throw error;
      const savedKeys = new Set(selected.map(r => r.importKey));
      setDocuments(previous => previous.map(d => {
        const remaining = d.rows.filter(r => !savedKeys.has(r.importKey));
        const count = d.rows.length - remaining.length;
        return count ? { ...d, rows: remaining, savedCount: d.savedCount + count, status: remaining.length ? "ready" : "saved" } : d;
      }));
      toast.success("ההוצאות המאושרות נשמרו; שורות שכבר יובאו לא נוספו שוב"); onSaved();
    } catch { toast.error("בדיקת ההוצאות הקיימות או השמירה נכשלה; לא ניתן להשלים את הייבוא והשורות נשארו לבדיקה"); }
    finally { setSaving(false); }
  };
  return <>
    <input ref={input} type="file" multiple className="hidden" accept=".xlsx,.xls,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,image/png,image/jpeg,image/webp" aria-label="מסמך הוצאות לסריקה" onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ""; }} />
    <input ref={replacementInput} type="file" className="hidden" accept=".xlsx,.xls,.pdf,image/png,image/jpeg,image/webp" aria-label="החלפת מסמך לסריקה" onChange={e => { const file = e.target.files?.[0]; if (file && replacementId.current) void upload([file], replacementId.current); e.target.value = ""; }} />
    <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}><ScanLine className="size-4" />סריקת Excel / PDF / תמונה</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy && !saving) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-6xl overflow-y-auto" dir="rtl" onInteractOutside={e => e.preventDefault()}>
        <DialogTitle className="ps-8">אישור הוצאות מהמסמכים</DialogTitle>
        <DialogDescription>סריקה באמצעות Lovable AI כרוכה בשימוש ביתרת AI לכל מסמך. מסמך בנק אינו תחליף לחשבונית מס.</DialogDescription>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" role="status">{documents.filter(d => d.status !== "queued" && d.status !== "scanning").length} מתוך {documents.length} מסמכים נסרקו · {documents.filter(d => d.status === "error").length} תקלות</p>
          <Button variant="outline" disabled={busy || saving} onClick={() => input.current?.click()}><Upload className="size-4" />הוספת קבצים</Button>
        </div>
        <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {documents.map(d => <Button key={d.id} variant={d.id === activeId ? "secondary" : "outline"} className="h-auto min-w-0 justify-start px-3 py-3 text-start" onClick={() => setActiveId(d.id)} aria-pressed={d.id === activeId} aria-label={`מסמך ${d.file.name}`}>
            {d.status === "scanning" ? <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : d.status === "error" ? <AlertCircle className="size-4 shrink-0 text-destructive" /> : d.status === "saved" ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <FileText className="size-4 shrink-0" />}
            <span className="min-w-0 whitespace-normal break-words"><span className="block font-medium">{d.file.name}</span><span className="block text-xs text-muted-foreground">{statusLabel[d.status]} · {d.rows.length} שורות{d.savedCount > 0 ? ` · ${d.savedCount} נשמרו` : ""}{d.warnings.length > 0 ? ` · ${d.warnings.length} הערות` : ""}</span></span>
          </Button>)}
        </div>
        {active && <h3 className="break-words font-semibold">{active.file.name}</h3>}
        {active?.status === "scanning" || active?.status === "queued" ? <div className="flex items-center gap-3 py-8" role="status"><Loader2 className="size-5 animate-spin motion-reduce:animate-none" />{statusLabel[active.status]}…</div> : active?.status === "error" ? <div className="space-y-3 border-s-2 border-destructive ps-3">
          <p className="break-words text-sm text-destructive" role="alert">{active.error}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || saving} onClick={() => void upload([active.file], active.id)}><RotateCcw className="size-4" />ניסיון נוסף</Button><Button variant="outline" disabled={busy || saving} onClick={() => { replacementId.current = active.id; replacementInput.current?.click(); }}><Upload className="size-4" />החלפת קובץ</Button></div>
        </div> : <fieldset disabled={saving} className="min-w-0 space-y-3">
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
                    <p className="font-medium">{e.id.startsWith("scan:") ? `שורה במסמך ${documents.find(d => d.rows.some(row => `scan:${row.importKey}` === e.id))?.file.name || "נוסף"}` : "הוצאה קיימת"}: {e.description}</p>
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
          {!rows.length && <p className="text-muted-foreground">{active?.status === "saved" ? "כל השורות שאושרו במסמך נשמרו." : "לא זוהו הוצאות לאישור."}</p>}
          {active?.status === "ready" && !rows.length && <Button variant="outline" disabled={busy || saving} onClick={() => { replacementId.current = active.id; replacementInput.current?.click(); }}><Upload className="size-4" />החלפת קובץ</Button>}
        </fieldset>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3"><Button onClick={() => void save()} disabled={busy || saving || !selectedRows.length}>{saving && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}שמירת {selectedRows.length} שורות מאושרות</Button><Button variant="outline" disabled={busy || saving} onClick={() => setOpen(false)}>סגירה</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}