import { CalendarClock } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Reminder shown to employees during the last two days of the month. */
export function MonthEndNotice() {
  const { isAdmin, user } = useAuth();
  if (!user || isAdmin) return null;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remaining = daysInMonth - now.getDate();
  if (remaining > 1) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        נותרו יומיים לסיום החודש – מומלץ לבדוק ולעדכן את דיווח השעות על מנת למנוע חוסרים.
      </p>
    </div>
  );
}