import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const RESET_SCOPES = [
  "time_entries",
  "project_hours",
  "projects",
  "expenses",
  "other_incomes",
  "pnl_adjustments",
  "employees",
] as const;

export type ResetScope = (typeof RESET_SCOPES)[number];

const schema = z.object({
  scopes: z.array(z.enum(RESET_SCOPES)).min(1),
  confirm: z.literal("מחק לצמיתות"),
});

export const purgeData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (roleErr) throw new Error(roleErr.message);
    if (!roles || roles.length === 0) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all = "00000000-0000-0000-0000-000000000000";
    const deleted: Record<string, number> = {};
    const scopes = new Set<ResetScope>(data.scopes);

    const wipe = async (table: string, key = "id") => {
      const res = await supabaseAdmin.from(table as never).delete({ count: "exact" }).neq(key, all);
      if (res.error) throw new Error(`${table}: ${res.error.message}`);
      deleted[table] = res.count ?? 0;
    };

    if (scopes.has("time_entries") || scopes.has("employees")) await wipe("time_entries");
    if (scopes.has("project_hours") || scopes.has("projects") || scopes.has("employees"))
      await wipe("project_hours");
    if (scopes.has("projects")) {
      await wipe("project_milestones");
      await wipe("projects");
    }
    if (scopes.has("expenses")) await wipe("expenses");
    if (scopes.has("other_incomes")) {
      await wipe("other_income_milestones");
      await wipe("other_incomes");
    }
    if (scopes.has("pnl_adjustments")) await wipe("pnl_adjustments");

    if (scopes.has("employees")) {
      const { data: profiles, error } = await supabaseAdmin.from("profiles").select("id");
      if (error) throw new Error(error.message);
      const { data: admins, error: aErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (aErr) throw new Error(aErr.message);
      const adminIds = new Set((admins ?? []).map((r) => r.user_id));
      const targets = (profiles ?? [])
        .map((p) => p.id)
        .filter((id) => id !== context.userId && !adminIds.has(id));
      for (const id of targets) {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
        await supabaseAdmin.from("profiles").delete().eq("id", id);
        const res = await supabaseAdmin.auth.admin.deleteUser(id);
        if (res.error) throw new Error(res.error.message);
      }
      deleted["employees"] = targets.length;
    }

    return { deleted };
  });
