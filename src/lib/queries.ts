import { supabase } from "@/integrations/supabase/client";
import { computeHours } from "@/lib/time";

export type ProjectRef = {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  status: string;
};

export async function fetchProjectDirectory(): Promise<ProjectRef[]> {
  const { data, error } = await supabase.rpc("list_projects_directory");
  if (error) throw error;
  return (data ?? []) as ProjectRef[];
}

export type TimeEntry = {
  id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number;
  break_start?: string | null;
  absence_type: string | null;
  note: string | null;
  manually_edited?: boolean | null;
  manual_edited_at?: string | null;
  original_clock_in?: string | null;
  original_clock_out?: string | null;
  original_break_minutes?: number | null;
};

export type ProjectHour = {
  id: string;
  user_id: string;
  project_id: string;
  work_date: string;
  hours: number;
  description: string | null;
};

export async function fetchMonthEntries(userId: string, start: string, end: string) {
  const [entries, hours] = await Promise.all([
    supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date"),
    supabase
      .from("project_hours")
      .select("*")
      .eq("user_id", userId)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date"),
  ]);
  if (entries.error) throw entries.error;
  if (hours.error) throw hours.error;
  return {
    entries: (entries.data ?? []) as TimeEntry[],
    projectHours: (hours.data ?? []) as ProjectHour[],
  };
}

export function trimTime(t: string | null) {
  if (!t) return "";
  const v = t.slice(0, 8);
  return v.length === 5 ? `${v}:00` : v;
}

/** שעות נוכחות של מקטע בודד (כניסה/יציאה בודדת), בניכוי הפסקות. */
export function segmentHours(e: Partial<TimeEntry> | null | undefined) {
  if (!e) return 0;
  return computeHours(
    trimTime(e.clock_in ?? null),
    trimTime(e.clock_out ?? null),
    e.break_minutes ?? 0,
  );
}

/** סכום שעות הנוכחות של כל מקטעי היום. */
export function dayHours(segments: Array<Partial<TimeEntry>> | undefined) {
  return (segments ?? []).reduce((s, e) => s + segmentHours(e), 0);
}

/** מקטע פתוח = נרשמה כניסה אך לא יציאה. */
export function isOpenSegment(e: Partial<TimeEntry> | null | undefined) {
  return Boolean(e?.clock_in) && !e?.clock_out;
}

/** קיבוץ רשומות הנוכחות לפי תאריך, ממוינות לפי שעת הכניסה. */
export function groupByDate<T extends { work_date: string; clock_in?: string | null }>(
  entries: T[] | undefined,
) {
  const map = new Map<string, T[]>();
  (entries ?? []).forEach((e) => {
    const list = map.get(e.work_date) ?? [];
    list.push(e);
    map.set(e.work_date, list);
  });
  map.forEach((list) =>
    list.sort((a, b) => (trimTime(a.clock_in ?? null) < trimTime(b.clock_in ?? null) ? -1 : 1)),
  );
  return map;
}
