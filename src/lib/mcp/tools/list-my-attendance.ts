import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_my_attendance",
  title: "List my attendance",
  description:
    "List the signed-in user's attendance days (clock in/out, breaks, absences) within a date range.",
  inputSchema: {
    from: z.string().describe("Start date YYYY-MM-DD (inclusive)."),
    to: z.string().describe("End date YYYY-MM-DD (inclusive)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return errorResult("Not authenticated");
    const { data, error } = await supabaseForUser(ctx)
      .from("time_entries")
      .select("work_date, clock_in, clock_out, break_minutes, absence_type, note")
      .eq("user_id", ctx.getUserId()!)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date")
      .limit(500);
    if (error) return errorResult(error.message);
    return textResult(data, { days: data ?? [] });
  },
});
