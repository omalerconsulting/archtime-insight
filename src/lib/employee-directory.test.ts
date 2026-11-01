import { describe, expect, it } from "vitest";
import { selectableEmployees, validReportTarget } from "./employee-directory";

describe("deleted employee report selection", () => {
  it("excludes deleted employees without hiding merely inactive employees", () => {
    expect(selectableEmployees([
      { id: "deleted", is_deleted: true, is_active: false },
      { id: "inactive", is_deleted: false, is_active: false },
    ]).map((employee) => employee.id)).toEqual(["inactive"]);
  });
  it("resets a removed selection to my report", () => {
    expect(validReportTarget("deleted", [{ id: "retained" }])).toBe("me");
    expect(validReportTarget("all", [])).toBe("all");
    expect(validReportTarget("retained", [{ id: "retained" }])).toBe("retained");
  });
});