import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(255),
  national_id: z.string().trim().min(5).max(20),
  birth_date: z.string().trim().min(8).max(10),
  phone: z.string().trim().min(6).max(25),
  password: z.string().min(8).max(72),
});

const digits = (v: string) => v.replace(/\D/g, "");

/** Self-service password reset verified by the identity details entered on signup. */
export const resetPasswordWithIdentity = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, national_id, birth_date, phone, is_approved")
      .eq("email", data.email.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);

    const ok =
      profile &&
      profile.national_id &&
      digits(profile.national_id) === digits(data.national_id) &&
      profile.birth_date === data.birth_date &&
      profile.phone &&
      digits(profile.phone).slice(-9) === digits(data.phone).slice(-9);

    if (!ok) throw new Error("mismatch");
    if (!profile!.is_approved) throw new Error("pending");

    const upd = await supabaseAdmin.auth.admin.updateUserById(profile!.id, {
      password: data.password,
    });
    if (upd.error) throw new Error(upd.error.message);
    return { ok: true };
  });
