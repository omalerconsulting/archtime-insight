import { ScanLine, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { expenseSource, expenseSourceLabel } from "@/lib/expense-source";

export function ExpenseSourceBadge({ expense }: { expense: { import_key?: string | null } }) {
  const automatic = expenseSource(expense) === "automatic";
  const Icon = automatic ? ScanLine : PenLine;
  return <Badge variant={automatic ? "secondary" : "outline"} className="gap-1 whitespace-nowrap" title={automatic ? "הוזן בסריקת מסמך לאחר אישור מנהל" : "הוזן ידנית"}><Icon className="size-3" />{expenseSourceLabel(expense)}</Badge>;
}