import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/time";

type Row = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  paid_amount: number;
  paid_date: string | null;
  code: string | null;
  name: string | null;
};

/**
 * עדכון גורף של תאריכי תשלום בפועל: מציג את כל אבני הדרך שנחתמו בתאריך מקור
 * (ברירת מחדל: יום ייבוא הנתונים 13.10.2026) ומאפשר לתקן כל אחת לתאריך שבו
 * הכסף באמת נכנס, אחרי בדיקה שורה־שורה.
 */
export function BulkPaidDateFix() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sourceDate, setSourceDate] = useState("2026-10-13");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["bulk-paid-date-fix", sourceDate],
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate),
    queryFn: async () => {
      const [ms, ps] = await Promise.all([
        supabase
          .from("project_milestones")
          .select("id, project_id, title, due_date, paid_amount, paid_date")
          .eq("paid_date", sourceDate)
          .order("due_date"),
        supabase.from("projects").select("id, code, name"),
      ]);
      if (ms.error) throw ms.error;
      if (ps.error) throw ps.error;
      const byId = new Map((ps.data ?? []).map((p) => [p.id, p]));
      return (ms.data ?? []).map((m) => ({
        ...m,
        code: byId.get(m.project_id)?.code ?? null,
        name: byId.get(m.project_id)?.name ?? null,
      })) as Row[];
    },
  });

  useEffect(() => {
    if (!q.data) return;
    setDrafts(Object.fromEntries(q.data.map((r) => [r.id, r.paid_date ?? ""])));
  }, [q.data]);

  const rows = q.data ?? [];
  const changed = rows.filter((r) => drafts[r.id] && drafts[r.id] !== r.paid_date);
  const invalid = rows.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(drafts[r.id] ?? ""));

  const saveAll = async () => {
    if (!changed.length) { toast.info("לא שונו תאריכים"); return; }
    if (!window.confirm(`לעדכן ${changed.length} תשלומים לתאריכים החדשים שסומנו? דוח הרווח וההפסד יתעדכן בהתאם.`)) return;
    setBusy(true);
    try {
      for (const r of changed) {
        const { error } = await supabase.from("project_milestones").update({ paid_date: drafts[r.id] }).eq("id", r.id);
        if (error) throw error;
      }
      toast.success(`${changed.length} תאריכי תשלום עודכנו`);
      void qc.invalidateQueries({ queryKey: ["pnl"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["bulk-paid-date-fix"] });
    } catch {
      toast.error("העדכון נכשל — בדקו את הרשומות ונסו שוב");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarClock className="size-4" />
        עדכון גורף של תאריכי תשלום
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto" dir="rtl">
          <DialogTitle>עדכון גורף של תאריכי תשלום בפועל</DialogTitle>
          <DialogDescription>
            כל התשלומים שתאריך התשלום שלהם הוא תאריך המקור יופיעו כאן. עברו שורה־שורה, תקנו את התאריך ליום שבו הכסף באמת נכנס, ולחצו שמירה.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bulk-paid-source" className="text-sm font-medium">תאריך מקור לבדיקה</label>
            <Input
              id="bulk-paid-source"
              type="date"
              className="w-44"
              value={sourceDate}
              onChange={(e) => setSourceDate(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">
              {q.isLoading ? "טוען…" : `${rows.length} תשלומים נמצאו · ${changed.length} שונו`}
            </span>
          </div>
          {q.isError && <p role="alert" className="text-sm text-destructive">טעינת התשלומים נכשלה. <Button variant="link" onClick={() => void q.refetch()}>ניסיון נוסף</Button></p>}
          {rows.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="p-2 text-start">פרויקט</th>
                  <th className="p-2 text-start">תשלום</th>
                  <th className="p-2 text-start">תאריך יעד</th>
                  <th className="p-2 text-start">נגבה</th>
                  <th className="p-2 text-start">תאריך תשלום בפועל</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-2">{r.code ? `${r.code} · ` : ""}{r.name ?? "—"}</td>
                    <td className="p-2">{r.title}</td>
                    <td className="p-2">{r.due_date ?? "—"}</td>
                    <td className="p-2">{fmtMoney(r.paid_amount)}</td>
                    <td className="p-2">
                      <Input
                        type="date"
                        aria-label={`תאריך התשלום בפועל עבור ${r.name ?? ""} ${r.title}`}
                        className={drafts[r.id] !== r.paid_date ? "border-primary" : ""}
                        value={drafts[r.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {q.data && rows.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו תשלומים בתאריך המקור שנבחר.</p>}
          <div className="flex items-center gap-2">
            <Button onClick={saveAll} disabled={busy || changed.length === 0 || invalid.length > 0}>
                {busy ? "שומר…" : `שמירת ${changed.length} התאריכים ששונו`}
            </Button>
            {invalid.length > 0 && <p role="alert" className="text-sm text-destructive">יש שורות ללא תאריך תקין — השלימו אותן לפני השמירה.</p>}
            <Button variant="ghost" onClick={() => setOpen(false)}>סגירה</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
