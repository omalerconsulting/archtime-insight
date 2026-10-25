import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/time";
import type { DuplicatePair } from "@/lib/finance-review";

export function FinanceDuplicates({ pairs, approved, onChanged, onEdit }: { pairs: DuplicatePair[]; approved: string[]; onChanged: () => void; onEdit: (kind: DuplicatePair["kind"], id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = pairs.filter(p => !approved.includes(p.key));
  const approve = async (key: string) => {
    if (!window.confirm("לאשר ששתי הרשומות תקינות ואינן כפילות? שתיהן יישארו בתחשיב.")) return;
    setBusy(true);
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("נדרשת כניסה מחדש");
      const { error } = await supabase.from("finance_duplicate_reviews").insert({ pair_key: key, approved_by: data.user.id });
      if (error) throw error;
      toast.success("הרשומות אושרו כתקינות"); onChanged();
    } catch { toast.error("האישור לא נשמר"); } finally { setBusy(false); }
  };
  if (!pending.length) return null;
  return <section className="no-print space-y-3 border-s-4 border-warning bg-warning/10 p-4" aria-label="חשד לכפילויות">
    <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />חשד לכפילויות · {pending.length}</h2>
    <p className="text-sm text-muted-foreground">הרשומות עדיין נכללות בתחשיב. יש לבדוק, לתקן או לאשר שהן תקינות.</p>
    <div className="max-h-80 space-y-3 overflow-auto">{pending.map(p => <div key={p.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <div className="min-w-0 text-sm"><p className="font-medium">{p.kind === "expense" ? "הוצאות" : "הכנסות"} · {fmtMoney(p.amount)}</p><p className="break-words">{p.first} ↔ {p.second}</p><p className="text-muted-foreground">{p.reason}</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>onEdit(p.kind,p.firstId)}><Pencil className="size-3" />תיקון הראשונה</Button><Button size="sm" variant="outline" onClick={()=>onEdit(p.kind,p.secondId)}><Pencil className="size-3" />תיקון השנייה</Button><Button size="sm" disabled={busy} onClick={()=>void approve(p.key)}><Check className="size-3" />אישור שתיהן</Button></div>
    </div>)}</div>
  </section>;
}