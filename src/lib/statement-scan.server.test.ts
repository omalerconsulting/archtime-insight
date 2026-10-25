import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), header: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost:8080"), setResponseHeader: mocks.header }));
vi.mock("./ai/run-id.server.ts", () => ({ createLovableAiGatewayRunIdFetch: () => ({ fetch: mocks.fetch, getRunId: () => "synthetic-run" }) }));
import { extractStatement } from "./statement-scan.server";

afterEach(() => { vi.restoreAllMocks(); mocks.fetch.mockReset(); mocks.header.mockReset(); });

describe("PDF scan upstream error regression", () => {
  it("returns the original 403 when the real SDK wraps the streamed error as missing output", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { type: "credit_hard_block_workspace", message: "Workspace AI limit reached" } }), { status: 403, headers: { "content-type": "application/json" } }));
    const result = await extractStatement({ filename: "synthetic.pdf", mime: "application/pdf", base64: "JVBERi0xLjQ=" }, "synthetic-key", []);
    expect(result.error).toContain("להעלות את מגבלת ה־AI");
    expect(result.error).toContain("Workspace AI limit reached");
    expect("errorStatus" in result && result.errorStatus).toBe(403);
    expect(result.rows).toEqual([]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.header).toHaveBeenCalledWith("X-Lovable-AIG-Run-ID", "synthetic-run");
  });
});