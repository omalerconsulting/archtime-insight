type Row = Record<string, unknown>;
export type EmployeeArchive = {
  profile: Row;
  time_entries: Row[];
  project_hours: Row[];
  monthly_reports: Row[];
  active_timers: Row[];
  projects: Row[];
};

const labels: Record<string, string> = {
  id: "מזהה", user_id: "מזהה עובד", project_id: "מזהה פרויקט", full_name: "שם מלא",
  email: "דוא״ל", phone: "טלפון", national_id: "תעודת זהות", birth_date: "תאריך לידה",
  hourly_rate: "שכר לשעה", hire_date: "תחילת עבודה", vacation_quota: "מכסת חופשה",
  work_date: "תאריך עבודה", clock_in: "כניסה", clock_out: "יציאה", break_minutes: "דקות הפסקה",
  absence_type: "סוג היעדרות", note: "הערה", description: "תיאור", hours: "שעות",
  month: "חודש", status: "סטטוס", submitted_at: "מועד הגשה", decided_at: "מועד החלטה",
  manager_note: "הערת מנהל", created_at: "נוצר בתאריך", updated_at: "עודכן בתאריך",
  manually_edited: "נערך ידנית", manual_edited_at: "מועד עריכה ידנית",
  original_clock_in: "כניסה מקורית", original_clock_out: "יציאה מקורית",
  original_break_minutes: "הפסקה מקורית", break_start: "תחילת הפסקה", started_at: "התחלה",
  code: "קוד פרויקט", name: "שם פרויקט",
};

export function archiveSheets(archive: EmployeeArchive, archivedAt: string) {
  // No account credentials or office-only cost rates are included in employee handoffs.
  const profile = Object.entries(archive.profile)
    .filter(([key]) => !["cost_rate", "must_change_password"].includes(key))
    .map(([key, value]) => ({ "שדה": labels[key] ?? key, "ערך": value ?? "" }));
  return [
    { name: "פרטי עובד", rows: [{ "שדה": "מועד שמירת הארכיון", "ערך": archivedAt }, ...profile] },
    { name: "נוכחות והיעדרויות", rows: archive.time_entries },
    { name: "שעות בפרויקטים", rows: archive.project_hours },
    { name: "דוחות חודשיים", rows: archive.monthly_reports },
    { name: "טיימרים", rows: archive.active_timers },
    { name: "פרויקטים", rows: archive.projects },
  ];
}

export async function employeeArchiveBlob(archive: EmployeeArchive, archivedAt: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of archiveSheets(archive, archivedAt)) {
    const rows = sheet.rows.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [labels[key] ?? key, value ?? ""]),
    ));
    const worksheet = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["אין רשומות"]]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  workbook.Workbook = { Views: [{ RTL: true }] };
  return new Blob([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadEmployeeArchive(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: filename }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) saveBlob(blob, filename);
    });
    return;
  }
  saveBlob(blob, filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}