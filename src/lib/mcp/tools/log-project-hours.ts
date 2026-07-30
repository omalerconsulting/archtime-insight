import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "log_project_hours",
  title: "Log project hours",
  description: "Record hours the signed-in user worked on a project on a given date.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project id (from list_projects)."),
    work_date: z.string().describe("Work date in YYYY-MM-DD format."),
    hours: z.number().positive().describe("Number of hours worked."),
    description: z.string().optional().describe("Short note about the work done."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ project_id, work_date, hours, description }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("project_hours")
      .insert({ project_id, work_date, hours, description: description ?? null, user_id: ctx.getUserId()! })
      .select()
      .single();
    if (error) return errorResult(error.message);
    return textResult(data, { entry: data });
  },
});
