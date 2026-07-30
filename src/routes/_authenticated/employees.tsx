import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, KeyRound, Check, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnly } from "@/components/AdminOnly";
import { fmtMoney } from "@/lib/time";
import { createEmployee, resetEmployeePassword, deleteEmployee } from "@/lib/admin-users.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

  const approve = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: true })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המשתמש אושר ויוכל להיכנס למערכת");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => toast.error("אישור המשתמש נכשל"),
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
              <th scope="col" className="p-3 text-start">פרטים מזהים</th>
              <th scope="col" className="p-3 text-start">אישור כניסה</th>
              <th scope="col" className="p-3 text-start">תעריף עלות למשרד (₪/שעה)</th>
              <th scope="col" className="p-3 text-start">שכר שעתי שהוזן ע״י העובד</th>
              <th scope="col" className="p-3 text-start">הרשאת מנהל</th>
              <th scope="col" className="p-3 text-start">פעיל</th>
              <th scope="col" className="p-3 text-start">סיסמה</th>
              <th scope="col" className="p-3 text-start">מחיקה</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.profiles ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 font-medium">{p.full_name || "—"}</td>
                <td className="p-3">{p.email}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  <div>טלפון: {p.phone || "—"}</div>
                  <div>ת״ז: {p.national_id || "—"}</div>
                  <div>לידה: {p.birth_date || "—"}</div>
                </td>
                <td className="p-3">
                  {p.is_approved ? (
                    <span className="text-xs font-medium text-emerald-600">מאושר</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => approve.mutate(p.id)}
                      aria-label={`אישור כניסה עבור ${p.full_name || p.email}`}
                    >
                      <Check className="size-4" />
                      אישור
                    </Button>
                  )}
                </td>
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
                <td className="p-3">
                  <ResetPasswordDialog userId={p.id} name={p.full_name || p.email} />
                </td>
                <td className="p-3">
                  <DeleteUserButton
                    userId={p.id}
                    name={p.full_name || p.email}
                    onDeleted={() => qc.invalidateQueries({ queryKey: ["employees"] })}
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
function NewUserDialog({ onCreated }: { onCreated: () => void }) {
  return <NewUserDialogInner onCreated={onCreated} />;
}

function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const reset = useServerFn(resetEmployeePassword);

  const mut = useMutation({
    mutationFn: async () => {
      if (pw.length < 8) throw new Error("סיסמה קצרה מדי");
      await reset({ data: { user_id: userId, password: pw } });
    },
    onSuccess: () => {
      toast.success("הסיסמה אופסה. העובד יתבקש להגדיר סיסמה חדשה בכניסה הבאה");
      setPw("");
      setOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(`איפוס הסיסמה נכשל: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`איפוס סיסמה עבור ${name}`}>
          <KeyRound className="size-4" />
          איפוס סיסמה
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>איפוס סיסמה – {name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`rp-${userId}`}>סיסמה זמנית (8 תווים לפחות)</Label>
          <Input id={`rp-${userId}`} type="text" value={pw} onChange={(e) => setPw(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            יש למסור את הסיסמה הזמנית לעובד. בכניסה הבאה הוא יידרש להגדיר סיסמה חדשה משלו לפני
            שיוכל להשתמש במערכת.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            איפוס סיסמה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewUserDialogInner({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", is_admin: false });
  const create = useServerFn(createEmployee);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.email.trim() || form.password.length < 8) throw new Error("שדות חסרים");
      await create({ data: { ...form, email: form.email.trim(), full_name: form.full_name.trim() } });
    },
    onSuccess: () => {
      toast.success("המשתמש נוצר בהצלחה");
      setForm({ full_name: "", email: "", password: "", is_admin: false });
      setOpen(false);
      onCreated();
    },
    onError: (e: unknown) =>
      toast.error(`יצירת המשתמש נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4" />
          הוספת משתמש
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הוספת משתמש חדש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nu-name">שם מלא</Label>
            <Input
              id="nu-name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-email">דוא״ל</Label>
            <Input
              id="nu-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-pass">סיסמה ראשונית (8 תווים לפחות)</Label>
            <Input
              id="nu-pass"
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="nu-admin"
              checked={form.is_admin}
              onCheckedChange={(v) => setForm({ ...form, is_admin: v })}
            />
            <Label htmlFor="nu-admin">הרשאת מנהל</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            יצירת משתמש
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
