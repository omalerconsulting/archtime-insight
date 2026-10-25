import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
export function BulkFinanceActions({ ids, selected, onSelect, onDelete, busy, label }: { ids: string[]; selected: string[]; onSelect: (ids: string[]) => void; onDelete: (ids: string[]) => void; busy: boolean; label: string }) {
  const active = selected.filter(id=>ids.includes(id));
  return <div className="flex flex-wrap items-center gap-3 border-y border-border py-3"><Checkbox aria-label={`סימון כל ${label}`} checked={active.length > 0 && active.length === ids.length ? true : active.length ? "indeterminate" : false} onCheckedChange={v=>onSelect(v ? ids : [])} /><span className="text-sm">{active.length} נבחרו</span><Button variant="destructive" size="sm" disabled={!active.length || busy} onClick={()=>{ if(window.confirm(`למחוק ${active.length} ${label}? המחיקה סופית${label === "הכנסות" ? " וכוללת את תחנות התשלום שלהן" : ". מחיקת הוצאה קבועה מסירה את כל השיבוצים החודשיים שלה"}.`)) onDelete(active); }}><Trash2 className="size-4" />מחיקת המסומנות</Button></div>;
}