import { describe, expect, it } from "vitest";
import { runStatementBatch } from "./statement-batch";

describe("multiple statement scans", () => {
  it("scans all selected documents with at most two simultaneous requests", async () => {
    let active = 0;
    let peak = 0;
    const completed: string[] = [];
    await runStatementBatch(["first.pdf", "second.xlsx", "third.xls"], async name => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      completed.push(name);
      active--;
    }, () => { throw new Error("Unexpected scan failure"); });
    expect(peak).toBe(2);
    expect(completed.sort()).toEqual(["first.pdf", "second.xlsx", "third.xls"]);
  });

  it("reports a failure for its document without losing other scan results and permits retry", async () => {
    const results = new Map<string, string>();
    const failures: string[] = [];
    await runStatementBatch(["good.pdf", "broken.xlsx", "other.pdf"], async name => {
      if (name === "broken.xlsx") throw new Error("Invalid workbook");
      results.set(name, "ready for review");
    }, (name, error) => failures.push(`${name}: ${error instanceof Error ? error.message : "error"}`));
    expect(failures).toEqual(["broken.xlsx: Invalid workbook"]);
    expect([...results.keys()].sort()).toEqual(["good.pdf", "other.pdf"]);
    await runStatementBatch(["broken.xlsx"], async name => { results.set(name, "corrected"); }, () => {});
    expect(results.get("broken.xlsx")).toBe("corrected");
    expect(results.get("good.pdf")).toBe("ready for review");
  });
});