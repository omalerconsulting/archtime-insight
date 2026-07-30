import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_project_milestones",
  title: "List payment milestones",
  description:
    "List payment milestones (stage, amount, due date, payment status) for a project. Managers only — employees get no rows.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project id (from list_projects)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("project_milestones")
      .select("id, title, amount_type, amount_value, due_date, paid_date, status, sort_order")
      .eq("project_id", project_id)
      .order("sort_order");
    if (error) return errorResult(error.message);
    return textResult(data, { milestones: data ?? [] });
  },
});
