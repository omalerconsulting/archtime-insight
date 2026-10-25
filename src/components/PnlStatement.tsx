import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EXPENSE_CATEGORIES, catLabel, expenseAlerts, type Expense, type LedgerMonth, type LedgerDetail } from "@/lib/pnl-ledger";
import { fmtMoney, MONTH_NAMES, todayIso } from "@/lib/time";

export function PnlStatement({ rows, expenses, year, adjustment }: { rows: LedgerMonth[]; expenses: Expense[]; year: number; adjustment: (r: LedgerMonth) => React.ReactNode }) {
  const [detail, setDetail] = useState<{ title: string; items: LedgerDetail[]; delta: number; total: number; note: string } | null>(null);
  const alerts = expenseAlerts(expenses, year, todayIso());
  const categories = [...EXPENSE_CATEGORIES, ...Array.from(new Set(expenses.map(e => e.category))).filter(v => !EXPENSE_CATEGORIES.some(c => c.value === v)).map(value => ({ value, label: catLabel(value) }))];
  type Line = { label: string; get: (r: LedgerMonth) => number; filter?: (d: LedgerDetail) => boolean; delta?: (r: LedgerMonth) => number; strong?: boolean };
  const lines: Line[] = [
    { label: "הכנסות מפרויקטים — בפועל", get: r => r.projectActual, filter: d => d.bucket === "projectActual" },
    { label: "הכנסות מפרויקטים — צפי", get: r => r.projectForecast, filter: d => d.bucket === "projectForecast" },
    { label: "הכנסות נוספות — בפועל", get: r => r.otherActual, filter: d => d.bucket === "otherActual" },
    { label: "הכנסות נוספות — צפי", get: r => r.otherForecast, filter: d => d.bucket === "otherForecast" },
    { label: "התאמות הכנסות", get: r => r.incomeDelta },
    { label: "סה״כ הכנסות", get: r => r.income, filter: d => d.bucket !== "expenses", delta: r => r.incomeDelta, strong: true },
    ...categories.map(c => ({ label: c.label, get: (r: LedgerMonth) => r.details.filter(d => d.bucket === "expenses" && d.category === c.value).reduce((s,d) => s+d.amount,0), filter: (d: LedgerDetail) => d.bucket === "expenses" && d.category === c.value })),
    { label: "התאמות הוצאות", get: r => r.expenseDelta },
    { label: "סה״כ הוצאות", get: r => r.totalExpenses, filter: d => d.bucket === "expenses", delta: r => r.expenseDelta, strong: true },
    { label: "רווח / הפסד צפוי", get: r => r.profit, strong: true },
  ];
  return <>
    {alerts.length > 0 && <section className="no-print space-y-2 border-s-4 border-warning bg-warning/10 p-4" aria-label="התראות תקינות הוצאות"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warning" />בדיקות הוצאות — חודשים שהסתיימו</h2><div className="max-h-48 overflow-y-auto"><ul className="space-y-1 text-sm">{alerts.map(a => <li key={a.key}>{MONTH_NAMES[Number(a.month.slice(5))-1]} {year} · {a.text}</li>)}</ul></div><p className="text-xs text-muted-foreground">סימנים לבדיקה בלבד, לא קביעה שחסרה הוצאה. פער משמעותי: 30% ומעלה.</p></section>}
    <section className="pnl-statement overflow-x-auto border-y border-border" dir="rtl">
      <table className="w-full min-w-[1550px] text-xs tabular-nums">
        <caption className="p-3 text-start font-semibold">דוח רווח והפסד וצפי — {year}</caption>
        <thead className="bg-muted"><tr><th scope="col" className="sticky start-0 z-10 min-w-52 bg-muted p-3 text-start">סעיף</th>{rows.map((r,i) => <th scope="col" className="p-2" key={r.key}>{MONTH_NAMES[i]}</th>)}<th scope="col" className="p-2">סה״כ שנתי</th></tr></thead>
        <tbody>{lines.map(line => <tr key={line.label} className={`border-t border-border ${line.strong ? "bg-muted/60 font-semibold" : ""}`}>
          <th scope="row" className="sticky start-0 z-10 bg-background p-3 text-start">{line.label}</th>
          {rows.map(r => <td className="p-1 text-center" key={r.key}>{line.filter ? <Button variant="ghost" className="h-8 px-1 text-xs tabular-nums" aria-label={`${line.label} ${MONTH_NAMES[Number(r.key.slice(5))-1]}`} onClick={() => setDetail({ title: `${line.label} · ${MONTH_NAMES[Number(r.key.slice(5))-1]} ${year}`, items: r.details.filter(d => line.filter?.(d) ?? false), delta: line.delta?.(r) ?? 0, total: line.get(r), note: r.note })}>{fmtMoney(line.get(r))}</Button> : fmtMoney(line.get(r))}</td>)}
          <td className="p-2 text-center font-semibold">{fmtMoney(rows.reduce((s,r) => s+line.get(r),0))}</td>
        </tr>)}
        <tr className="no-print border-t border-border"><th className="sticky start-0 bg-background p-3 text-start">תיקון ידני</th>{rows.map(r => <td key={r.key} className="p-2">{adjustment(r)}</td>)}<td /></tr>
        </tbody>
      </table>
    </section>
    <Dialog open={!!detail} onOpenChange={v => { if (!v) setDetail(null); }}><DialogContent dir="rtl" className="max-h-[85dvh] w-[95vw] max-w-4xl overflow-y-auto" aria-describedby={undefined}>
      <DialogTitle className="pe-8">{detail?.title}</DialogTitle>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr>{["תאריך", "תיאור", "פרויקט / ספק", "סוג", "סכום"].map(h => <th className="p-2 text-start" key={h}>{h}</th>)}</tr></thead><tbody>{detail?.items.map(d => <tr key={d.id} className="border-t border-border"><td className="p-2">{d.date}</td><td className="p-2">{d.description}</td><td className="p-2">{d.party}</td><td className="p-2">{d.bucket === "expenses" ? `${catLabel(d.category || "general")}${d.recurring ? " · קבועה" : ""}` : d.bucket.endsWith("Forecast") ? "צפי" : "בפועל"}</td><td className="p-2">{fmtMoney(d.amount)}</td></tr>)}</tbody></table></div>
      {detail?.items.length === 0 && <p className="text-muted-foreground">אין רשומות מקור בסעיף זה.</p>}
      {!!detail?.delta && <p>התאמה ידנית: {fmtMoney(detail.delta)}{detail.note ? ` · ${detail.note}` : ""}</p>}
      <p className="border-t border-border pt-3 font-semibold">סה״כ: {fmtMoney(detail?.total ?? 0)}</p>
    </DialogContent></Dialog>
  </>;
}