import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** true during the final two calendar days of the month (e.g. 30-31 in July). */
export function isMonthEndWindow(now = new Date()) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return daysInMonth - now.getDate() <= 1;
}

export const MONTH_END_MESSAGE =
  "נותרו יומיים לסיום החודש – יש לבדוק ולעדכן את דיווח השעות על מנת למנוע חוסרים.";

/** Reminder shown to employees during the last two days of the month. */
export function MonthEndNotice() {
  const { isAdmin, user, loading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const active = Boolean(user) && !isAdmin && !loading && isMonthEndWindow();
    setShow(active);
  }, [user, isAdmin, loading]);

  if (!show) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-4 rounded-xl border-2 border-amber-500/60 bg-amber-500/15 p-5"
    >
      <CalendarClock className="mt-0.5 size-9 shrink-0 text-amber-600" aria-hidden />
      <p className="text-lg font-bold leading-snug text-amber-900 dark:text-amber-200 sm:text-xl">
        {MONTH_END_MESSAGE}
      </p>
    </div>
  );
}