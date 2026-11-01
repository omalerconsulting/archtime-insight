import { expect, it } from "vitest";
import { employeeArchiveBlob, type EmployeeArchive } from "./employee-archive";

it("exports every attendance segment and project row, and omits office cost rate", async () => {
  const archive: EmployeeArchive = {
    profile: { full_name: "עובד בדיקה", cost_rate: 999 },
    time_entries: Array.from({ length: 1201 }, (_, id) => ({ id, work_date: "2025-10-13", note: `segment ${id}` })),
    project_hours: [{ hours: 2, project_id: "341" }],
    monthly_reports: [{ month: "2025-10-01", status: "approved" }],
    active_timers: [], projects: [{ id: "341", code: "341", name: "פרויקט בדיקה" }],
  };
  const XLSX = await import("xlsx");
  const blob = await employeeArchiveBlob(archive, "2026-11-01");
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array" });
  expect(workbook.SheetNames).toHaveLength(6);
  const attendance = workbook.Sheets["נוכחות והיעדרויות"];
  if (!attendance) throw new Error("Missing attendance sheet");
  const rows = XLSX.utils.sheet_to_json(attendance);
  expect(rows).toHaveLength(1201);
  expect(rows[1200]).toMatchObject({ "הערה": "segment 1200" });
  const profile = workbook.Sheets["פרטי עובד"];
  if (!profile) throw new Error("Missing profile sheet");
  expect(JSON.stringify(XLSX.utils.sheet_to_json(profile))).not.toContain("999");
  const projects = workbook.Sheets["שעות בפרויקטים"];
  if (!projects) throw new Error("Missing project sheet");
  expect(XLSX.utils.sheet_to_json(projects)).toEqual([{ "שעות": 2, "מזהה פרויקט": "341" }]);
});