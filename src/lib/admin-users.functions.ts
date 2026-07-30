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
      .upsert({ id: newId, full_name: data.full_name, email: data.email, is_approved: true });

    if (data.is_admin) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: newId, role: "admin" },
        { onConflict: "user_id,role" },
      );
    }
    return { id: newId };
  });

const resetSchema = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (roleErr) throw new Error(roleErr.message);
    if (!roles || roles.length === 0) throw new Error("forbidden");
    if (data.user_id === context.userId) throw new Error("לא ניתן למחוק את המשתמש שלך");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // היסטוריית העובד (דיווחי שעות ושעות בפרויקטים) נשמרת במלואה.
    // מוסרים רק את אפשרות ההתחברות וההרשאות.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin
      .from("profiles")
      .update({ is_active: false, is_approved: false })
      .eq("id", data.user_id);
    const del = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (del.error) throw new Error(del.error.message);
    return { ok: true };
  });

export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin");
    if (roleErr) throw new Error(roleErr.message);
    if (!roles || roles.length === 0) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const upd = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (upd.error) throw new Error(upd.error.message);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
