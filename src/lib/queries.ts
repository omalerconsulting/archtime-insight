import { supabase } from "@/integrations/supabase/client";

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
  absence_type: string | null;
  note: string | null;
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