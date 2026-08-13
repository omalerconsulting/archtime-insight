import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortDir = "asc" | "desc";
export type SortOption = { value: string; label: string };

/** Generic comparator builder: numeric-aware, Hebrew-aware string collation. */
export function compareValues(a: unknown, b: unknown, dir: SortDir) {
  const sign = dir === "asc" ? 1 : -1;
  const aNil = a === null || a === undefined || a === "";
  const bNil = b === null || b === undefined || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), "he", { numeric: true, sensitivity: "base" }) * sign;
}

/** Sorts a list by a keyed accessor map. */
export function sortRows<T>(
  rows: T[],
  key: string,
  dir: SortDir,
  accessors: Record<string, (row: T) => unknown>,
) {
  const get = accessors[key];
  if (!get) return rows;
  return [...rows].sort((a, b) => compareValues(get(a), get(b), dir));
}

/** Sort field + direction control shared by the admin tables. */
export function SortControls({
  id,
  options,
  value,
  onValueChange,
  dir,
  onDirChange,
  label = "מיון",
  className = "",
}: {
  id: string;
  options: SortOption[];
  value: string;
  onValueChange: (v: string) => void;
  dir: SortDir;
  onDirChange: (d: SortDir) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger id={id} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => onDirChange(dir === "asc" ? "desc" : "asc")}
        aria-label={dir === "asc" ? "סדר עולה – מעבר ליורד" : "סדר יורד – מעבר לעולה"}
        title={dir === "asc" ? "סדר עולה" : "סדר יורד"}
      >
        {dir === "asc" ? (
          <ArrowUpAZ className="size-4" aria-hidden />
        ) : (
          <ArrowDownAZ className="size-4" aria-hidden />
        )}
        {dir === "asc" ? "עולה" : "יורד"}
      </Button>
    </div>
  );
}
