import { describe, expect, it } from "vitest";
import { statementScanFailure } from "./statement-scan-errors";

describe("statement service error classification", () => {
  it("preserves a nested workspace spending-cap error without blaming the PDF", () => {
    const failure = statementScanFailure({ cause: { statusCode: 403, responseBody: JSON.stringify({ error: { type: "credit_hard_block_workspace", message: "Workspace AI usage limit reached" } }) } });
    expect(failure.status).toBe(403);
    expect(failure.type).toBe("credit_hard_block_workspace");
    expect(failure.message).toContain("להעלות את מגבלת ה־AI");
    expect(failure.message).toContain("Workspace AI usage limit reached");
  });
  it("preserves the safe credit remedy supplied by the service", () => {
    expect(statementScanFailure({ statusCode: 402, responseBody: JSON.stringify({ message: "Credits are temporarily held; release pending holds" }) }).message).toContain("Credits are temporarily held; release pending holds");
  });
  it("does not expose raw exceptions or claim document unreadability for unknown errors", () => {
    const failure = statementScanFailure(new Error("private internal details"));
    expect(failure.status).toBe(0);
    expect(failure.message).not.toContain("private internal details");
    expect(failure.message).not.toContain("בדקו שהמסמך קריא");
  });
});