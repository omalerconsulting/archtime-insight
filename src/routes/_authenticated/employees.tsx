import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { fmtMoney } from "@/lib/time";
import { createEmployee } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "ניהול עובדים | ניהול שעות ופרויקטים" },
      { name: "description", content: "הרשאות מנהל, תעריף עלות לשעה וסטטוס פעילות של עובדי המשרד." },
      { property: "og:title", content: "ניהול עובדים" },
      { property: "og:description", content: "הרשאות, תעריפי עלות וסטטוס עובדים." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <EmployeesPage />
    </AdminOnly>
  ),
});

function EmployeesPage() {
  const qc = useQueryClient();
  const [rates, setRates] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("user_roles").select("*"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return { profiles: profiles.data ?? [], roles: roles.data ?? [] };
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, admin }: { userId: string; admin: boolean }) => {
      if (admin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("ההרשאות עודכנו");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => toast.error("עדכון ההרשאות נכשל"),
  });

  const setActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const setCost = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: number | null }) => {
      const { error } = await supabase.from("profiles").update({ cost_rate: value }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("תעריף העלות נשמר");
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const isAdminUser = (id: string) => Boolean(q.data?.roles.some((r) => r.user_id === id && r.role === "admin"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ניהול עובדים והרשאות</h1>
          <p className="text-sm text-muted-foreground">
            הוספת משתמשים חדשים, הרשאות מנהל, תעריף עלות לשעה וסטטוס פעילות.
          </p>
        </div>
        <NewUserDialog onCreated={() => qc.invalidateQueries({ queryKey: ["employees"] })} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">רשימת עובדים</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-3 text-start">שם</th>
              <th scope="col" className="p-3 text-start">דוא״ל</th>
              <th scope="col" className="p-3 text-start">תעריף עלות למשרד (₪/שעה)</th>
              <th scope="col" className="p-3 text-start">שכר שעתי שהוזן ע״י העובד</th>
              <th scope="col" className="p-3 text-start">הרשאת מנהל</th>
              <th scope="col" className="p-3 text-start">פעיל</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.profiles ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 font-medium">{p.full_name || "—"}</td>
                <td className="p-3">{p.email}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-28"
                      type="number"
                      min="0"
                      aria-label={`תעריף עלות עבור ${p.full_name || p.email}`}
                      value={rates[p.id] ?? (p.cost_rate ?? "")}
                      onChange={(e) => setRates({ ...rates, [p.id]: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setCost.mutate({
                          userId: p.id,
                          value: rates[p.id] === "" ? null : Number(rates[p.id] ?? p.cost_rate ?? 0),
                        })
                      }
                    >
                      שמירה
                    </Button>
                  </div>
                </td>
                <td className="p-3">{p.hourly_rate ? fmtMoney(Number(p.hourly_rate)) : "—"}</td>
                <td className="p-3">
                  <Switch
                    checked={isAdminUser(p.id)}
                    aria-label={`הרשאת מנהל עבור ${p.full_name || p.email}`}
                    onCheckedChange={(v) => setRole.mutate({ userId: p.id, admin: v })}
                  />
                </td>
                <td className="p-3">
                  <Switch
                    checked={p.is_active}
                    aria-label={`סטטוס פעילות עבור ${p.full_name || p.email}`}
                    onCheckedChange={(v) => setActive.mutate({ userId: p.id, active: v })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}