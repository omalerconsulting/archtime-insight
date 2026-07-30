import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "project_hours_summary",
  title: "Project hours summary",
  description:
    "Total hours per project in a date range, aggregated across every entry the signed-in user is allowed to see (managers see the whole office).",
  inputSchema: {
    from: z.string().describe("Start date YYYY-MM-DD (inclusive)."),
    to: z.string().describe("End date YYYY-MM-DD (inclusive)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("project_hours")
      .select("hours, project_id, projects(code, name)")
      .gte("work_date", from)
      .lte("work_date", to)
      .limit(5000);
    if (error) return errorResult(error.message);
    const totals = new Map<string, { project_id: string; code: string; name: string; hours: number }>();
    for (const row of data ?? []) {
      const project = row.projects as { code?: string; name?: string } | null;
      const key = row.project_id;
      const current = totals.get(key) ?? {
        project_id: key,
        code: project?.code ?? "",
        name: project?.name ?? "",
        hours: 0,
      };
      current.hours += Number(row.hours ?? 0);
      totals.set(key, current);
    }
    const summary = [...totals.values()].sort((a, b) => b.hours - a.hours);
    return textResult(summary, { summary });
  },
});
