import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "הגדרות משרד | ניהול שעות ופרויקטים" },
      { name: "description", content: "שם המשרד, לוגו, תקן שעות יומי ודוא״ל רואה החשבון." },
      { property: "og:title", content: "הגדרות משרד" },
      { property: "og:description", content: "מיתוג המשרד והגדרות דיווח בסיסיות." },
    ],
  }),
  component: () => (
    <AdminOnly>
      <SettingsPage />
    </AdminOnly>
  ),
});

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    office_name: "",
    logo_url: "",
    standard_daily_hours: "8.6",
    accountant_email: "",
  });

  useEffect(() => {
    if (q.data) {
      setForm({
        office_name: q.data.office_name ?? "",
        logo_url: q.data.logo_url ?? "",
        standard_daily_hours: String(q.data.standard_daily_hours ?? 8.6),
        accountant_email: q.data.accountant_email ?? "",
      });
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("org_settings").upsert({
        id: true,
        office_name: form.office_name || "משרד אדריכלים",
        logo_url: form.logo_url || null,
        standard_daily_hours: Number(form.standard_daily_hours) || 8.6,
        accountant_email: form.accountant_email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההגדרות נשמרו");
      qc.invalidateQueries({ queryKey: ["org-settings"] });
    },
    onError: () => toast.error("שמירת ההגדרות נכשלה"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">הגדרות משרד</h1>
        <p className="text-sm text-muted-foreground">מיתוג, תקן שעות יומי ופרטי רואה החשבון</p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="space-y-2">
          <Label htmlFor="on">שם המשרד</Label>
          <Input
            id="on"
            value={form.office_name}
            onChange={(e) => setForm({ ...form, office_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lu">כתובת לוגו (URL)</Label>
          <Input
            id="lu"
            placeholder="https://..."
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          />
          {form.logo_url && (
            <img src={form.logo_url} alt="תצוגה מקדימה של לוגו המשרד" className="h-12 w-auto" />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sh">תקן שעות ליום עבודה</Label>
          <Input
            id="sh"
            type="number"
            step="0.1"
            value={form.standard_daily_hours}
            onChange={(e) => setForm({ ...form, standard_daily_hours: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            ברירת המחדל 8.6 שעות ליום (משרה מלאה בת 182 שעות חודשיות).
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ae">דוא״ל רואה החשבון</Label>
          <Input
            id="ae"
            type="email"
            value={form.accountant_email}
            onChange={(e) => setForm({ ...form, accountant_email: e.target.value })}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          שמירת הגדרות
        </Button>
      </div>
    </div>
  );
}