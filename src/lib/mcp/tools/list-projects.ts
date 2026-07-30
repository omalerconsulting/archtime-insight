import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "List office projects visible to the signed-in user, with code, name, client and status. Financial fields are only returned for managers.",
  inputSchema: {
    status: z.enum(["active", "quote", "done", "all"]).optional().describe("Filter by project status."),
    search: z.string().optional().describe("Free text match on project name or code."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, search }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    let query = supabaseForUser(ctx)
      .from("projects")
      .select("id, code, name, client_name, status, start_date, fee_total, hours_budget")
      .order("code");
    if (status && status !== "all") query = query.eq("status", status);
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    const { data, error } = await query.limit(300);
    if (error) return errorResult(error.message);
    return textResult(data, { projects: data ?? [] });
  },
});
