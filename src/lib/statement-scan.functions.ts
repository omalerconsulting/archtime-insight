import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXPENSE_CATEGORIES } from "@/lib/pnl-ledger";

export const scanStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ filename: z.string().max(250), mime: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]), base64: z.string().min(1).max(14000000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("הסריקה זמינה למנהלים בלבד");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { rows: [], warnings: [], error: "שירות הסריקה אינו מוגדר כרגע" };
    const { extractStatement } = await import("@/lib/statement-scan.server");
    return extractStatement(data, key, EXPENSE_CATEGORIES);
  });