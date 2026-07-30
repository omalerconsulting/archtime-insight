import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_my_project_hours",
  title: "List my project hours",
  description: "List the signed-in user's project hour entries within a date range.",
  inputSchema: {
    from: z.string().describe("Start date YYYY-MM-DD (inclusive)."),
    to: z.string().describe("End date YYYY-MM-DD (inclusive)."),
    project_id: z.string().uuid().optional().describe("Limit to one project."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, project_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    let query = supabaseForUser(ctx)
      .from("project_hours")
      .select("id, work_date, hours, description, project_id, projects(code, name)")
      .eq("user_id", ctx.getUserId()!)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date");
    if (project_id) query = query.eq("project_id", project_id);
    const { data, error } = await query.limit(1000);
    if (error) return errorResult(error.message);
    const total = (data ?? []).reduce((sum, row) => sum + Number(row.hours ?? 0), 0);
    return textResult({ total_hours: total, entries: data }, { total_hours: total, entries: data ?? [] });
  },
});
