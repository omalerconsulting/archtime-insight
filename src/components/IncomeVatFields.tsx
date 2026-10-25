import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { incomeVat } from "@/lib/income-vat";
import { fmtMoney } from "@/lib/time";

export function IncomeVatFields({ id, amount, included, rate, onChange }: { id: string; amount: number; included: boolean; rate: string; onChange: (included: boolean, rate: string) => void }) {
  const valid = rate.trim() !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0 && Number(rate) <= 100;
  const values = valid && Number.isFinite(amount) ? incomeVat(amount, { vat_included: included, vat_rate: Number(rate) }) : null;
  return <div className="space-y-3 sm:col-span-2">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`${id}-basis`}>בסיס סכום ההכנסה</Label><Select value={included ? "gross" : "net"} onValueChange={v => onChange(v === "gross", rate)}><SelectTrigger id={`${id}-basis`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="net">לפני מע״מ</SelectItem><SelectItem value="gross">כולל מע״מ</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor={`${id}-rate`}>שיעור מע״מ (%)</Label><Input id={`${id}-rate`} type="number" min="0" max="100" step="0.01" value={rate} onChange={e => onChange(included, e.target.value)} /></div>
    </div>
    {values && <p className="text-sm text-muted-foreground">לדוח לפני מע״מ: {fmtMoney(values.net)} · מע״מ: {fmtMoney(values.vat)} · לבנק כולל מע״מ: {fmtMoney(values.gross)}</p>}
  </div>;
}