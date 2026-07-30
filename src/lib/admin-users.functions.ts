import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().max(120).default(""),
  is_admin: z.boolean().default(false),
});

export const createEmployee = createServerFn({ method: "POST" })
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
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (created.error) throw new Error(created.error.message);
    const newId = created.data.user!.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, full_name: data.full_name, email: data.email });

    if (data.is_admin) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: newId, role: "admin" },
        { onConflict: "user_id,role" },
      );
    }
    return { id: newId };
  });
