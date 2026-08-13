import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { UserPlus, KeyRound, Check, Trash2, Pencil } from "lucide-react";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "ניהול עובדים | ניהול שעות ופרויקטים" },
      {
        name: "description",
        content: "הרשאות מנהל, תעריף עלות לשעה וסטטוס פעילות של עובדי המשרד.",
      },
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
  const [hr, setHr] = useState<Record<string, { hire: string; quota: string }>>({});
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [roleConfirm, setRoleConfirm] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const bulkDel = useServerFn(deleteEmployee);

  const verifyAndRun = async () => {
    if (!roleConfirm) return;
    if (!adminPassword) {
      toast.error("יש להזין סיסמה");
      return;
    }
    setVerifying(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const email = userRes.user?.email;
      if (!email) throw new Error("no-email");
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: adminPassword,
      });
      if (error) {
        toast.error("הסיסמה שהוזנה שגויה");
        return;
      }
      roleConfirm.run();
      setRoleConfirm(null);
      setAdminPassword("");
    } catch {
      toast.error("האימות נכשל");
    } finally {
      setVerifying(false);
    }
  };

  const q = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("*").eq("is_deleted", false).order("full_name"),
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
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
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
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: active })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const saveHr = useMutation({
    mutationFn: async ({
      userId,
      hire,
      quota,
    }: {
      userId: string;
      hire: string;
      quota: string;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          hire_date: hire || null,
          vacation_quota: Number(quota) || 0,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("נתוני הוותק והחופשה נשמרו");
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => toast.error("השמירה נכשלה"),
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
      const { error } = await supabase
        .from("profiles")
        .update({ cost_rate: value })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("תעריף העלות נשמר");
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const isAdminUser = (id: string) =>
    Boolean(q.data?.roles.some((r) => r.user_id === id && r.role === "admin"));

  const profiles = q.data?.profiles ?? [];
  const allChecked = profiles.length > 0 && profiles.every((p) => checked.includes(p.id));
  const toggle = (id: string) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const bulk = useMutation({
    mutationFn: async (
      action: "approve" | "activate" | "deactivate" | "admin" | "unadmin" | "delete",
    ) => {
      const ids = [...checked];
      if (action === "delete") {
        for (const id of ids) await bulkDel({ data: { user_id: id } });
        return;
      }
      if (action === "approve") {
        const { error } = await supabase
          .from("profiles")
          .update({ is_approved: true })
          .in("id", ids);
        if (error) throw error;
        return;
      }
      if (action === "activate" || action === "deactivate") {
        const { error } = await supabase
          .from("profiles")
          .update({ is_active: action === "activate" })
          .in("id", ids);
        if (error) throw error;
        return;
      }
      if (action === "admin") {
        const missing = ids.filter((id) => !isAdminUser(id));
        if (missing.length) {
          const { error } = await supabase
            .from("user_roles")
            .insert(missing.map((id) => ({ user_id: id, role: "admin" as const })));
          if (error) throw error;
        }
        return;
      }
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .in("user_id", ids)
        .eq("role", "admin");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הפעולה בוצעה על המשתמשים המסומנים");
      setChecked([]);
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e: unknown) =>
      toast.error(`הפעולה נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
        <span className="text-sm text-muted-foreground">{checked.length} משתמשים מסומנים</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!checked.length || bulk.isPending}
          onClick={() => bulk.mutate("approve")}
        >
          אישור כניסה
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!checked.length || bulk.isPending}
          onClick={() => {
            setAdminPassword("");
            setRoleConfirm({
              title: "מתן הרשאת מנהל",
              description: `הענקת הרשאת מנהל ל-${checked.length} משתמשים מסומנים. לאישור הפעולה יש להזין את הסיסמה שלך.`,
              run: () => bulk.mutate("admin"),
            });
          }}
        >
          מתן הרשאת מנהל
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!checked.length || bulk.isPending}
          onClick={() => {
            setAdminPassword("");
            setRoleConfirm({
              title: "הסרת הרשאת מנהל",
              description: `הסרת הרשאת מנהל מ-${checked.length} משתמשים מסומנים. לאישור הפעולה יש להזין את הסיסמה שלך.`,
              run: () => bulk.mutate("unadmin"),
            });
          }}
        >
          הסרת הרשאת מנהל
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!checked.length || bulk.isPending}
          onClick={() => bulk.mutate("activate")}
        >
          הפעלה
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!checked.length || bulk.isPending}
          onClick={() => bulk.mutate("deactivate")}
        >
          השבתה
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!checked.length || bulk.isPending}
          onClick={() => setBulkDelete(true)}
        >
          <Trash2 className="size-4" />
          מחיקת המסומנים
        </Button>
        {checked.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setChecked([])}>
            ניקוי סימון
          </Button>
        )}
      </div>

      <AlertDialog open={bulkDelete} onOpenChange={setBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת {checked.length} משתמשים</AlertDialogTitle>
            <AlertDialogDescription>
              המשתמשים יוסרו מהרשימה ולא יוכלו להתחבר. כל נתוני השעות ההיסטוריים יישמרו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>לא</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulk.mutate("delete")}>כן, מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">רשימת עובדים</caption>
          <thead className="bg-muted/60">
            <tr>
              <th scope="col" className="p-3 text-start">
                <input
                  type="checkbox"
                  aria-label="סימון כל המשתמשים"
                  className="size-4 accent-[var(--primary)]"
                  checked={allChecked}
                  onChange={() => setChecked(allChecked ? [] : profiles.map((p) => p.id))}
                />
              </th>
              <th scope="col" className="p-3 text-start">
                שם
              </th>
              <th scope="col" className="p-3 text-start">
                דוא״ל
              </th>
              <th scope="col" className="p-3 text-start">
                פרטים מזהים
              </th>
              <th scope="col" className="p-3 text-start">
                אישור כניסה
              </th>
              <th scope="col" className="p-3 text-start">
                תעריף עלות למשרד (₪/שעה)
              </th>
              <th scope="col" className="p-3 text-start">
                ותק ומכסת חופשה
              </th>
              <th scope="col" className="p-3 text-start">
                שכר שעתי שהוזן ע״י העובד
              </th>
              <th scope="col" className="p-3 text-start">
                הרשאת מנהל
              </th>
              <th scope="col" className="p-3 text-start">
                פעיל
              </th>
              <th scope="col" className="p-3 text-start">
                סיסמה
              </th>
              <th scope="col" className="p-3 text-start">
                הסרת גישה
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`סימון ${p.full_name || p.email}`}
                    className="size-4 accent-[var(--primary)]"
                    checked={checked.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </td>
                <td className="p-3 font-medium">{p.full_name || "—"}</td>
                <td className="p-3">{p.email}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  <div>טלפון: {p.phone || "—"}</div>
                  <div>ת״ז: {p.national_id || "—"}</div>
                  <div>לידה: {p.birth_date || "—"}</div>
                  <EditDetailsDialog
                    profile={p}
                    onSaved={() => qc.invalidateQueries({ queryKey: ["employees"] })}
                  />
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
                      value={rates[p.id] ?? p.cost_rate ?? ""}
                      onChange={(e) => setRates({ ...rates, [p.id]: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setCost.mutate({
                          userId: p.id,
                          value:
                            rates[p.id] === "" ? null : Number(rates[p.id] ?? p.cost_rate ?? 0),
                        })
                      }
                    >
                      שמירה
                    </Button>
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-36"
                      type="date"
                      aria-label={`תאריך תחילת עבודה עבור ${p.full_name || p.email}`}
                      value={hr[p.id]?.hire ?? p.hire_date ?? ""}
                      onChange={(e) =>
                        setHr({
                          ...hr,
                          [p.id]: {
                            hire: e.target.value,
                            quota: hr[p.id]?.quota ?? String(p.vacation_quota ?? 12),
                          },
                        })
                      }
                    />
                    <Input
                      className="w-20"
                      type="number"
                      min="0"
                      aria-label={`מכסת חופשה שנתית עבור ${p.full_name || p.email}`}
                      title="מכסת ימי חופשה שנתית"
                      value={hr[p.id]?.quota ?? String(p.vacation_quota ?? 12)}
                      onChange={(e) =>
                        setHr({
                          ...hr,
                          [p.id]: {
                            hire: hr[p.id]?.hire ?? p.hire_date ?? "",
                            quota: e.target.value,
                          },
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        saveHr.mutate({
                          userId: p.id,
                          hire: hr[p.id]?.hire ?? p.hire_date ?? "",
                          quota: hr[p.id]?.quota ?? String(p.vacation_quota ?? 12),
                        })
                      }
                    >
                      שמירה
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    תאריך תחילת עבודה · ימי חופשה בשנה
                  </p>
                </td>
                <td className="p-3">{p.hourly_rate ? fmtMoney(Number(p.hourly_rate)) : "—"}</td>
                <td className="p-3">
                  <Switch
                    checked={isAdminUser(p.id)}
                    aria-label={`הרשאת מנהל עבור ${p.full_name || p.email}`}
                    onCheckedChange={(v) => {
                      setAdminPassword("");
                      setRoleConfirm({
                        title: v ? "מתן הרשאת מנהל" : "ביטול הרשאת מנהל",
                        description: `${v ? "הענקת" : "הסרת"} הרשאת מנהל עבור ${
                          p.full_name || p.email
                        }. לאישור הפעולה יש להזין את הסיסמה שלך.`,
                        run: () => setRole.mutate({ userId: p.id, admin: v }),
                      });
                    }}
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
  return <ResetPasswordDialogInner userId={userId} name={name} />;
}

function DeleteUserButton({
  userId,
  name,
  onDeleted,
}: {
  userId: string;
  name: string;
  onDeleted: () => void;
}) {
  const del = useServerFn(deleteEmployee);
  const mut = useMutation({
    mutationFn: async () => {
      await del({ data: { user_id: userId } });
    },
    onSuccess: () => {
      toast.success("גישת המשתמש הוסרה. ההיסטוריה נשמרה");
      onDeleted();
    },
    onError: (e: unknown) =>
      toast.error(`הסרת המשתמש נכשלה: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" aria-label={`הסרת גישה למשתמש ${name}`}>
          <Trash2 className="size-4" />
          מחיקת משתמש
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>מחיקת המשתמש {name}</AlertDialogTitle>
          <AlertDialogDescription>
            האם אתה בטוח? המשתמש לא יוכל עוד להתחבר למערכת ויוסרו הרשאותיו. כל הנתונים ההיסטוריים –
            דוחות שעות, שעות עבודה בפרויקטים וכל דיווח קודם – יישמרו במלואם לצורכי דיווח וניתוח.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>לא</AlertDialogCancel>
          <AlertDialogAction disabled={mut.isPending} onClick={() => mut.mutate()}>
            כן, מחק
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetPasswordDialogInner({ userId, name }: { userId: string; name: string }) {
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
          <Input
            id={`rp-${userId}`}
            type="text"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            יש למסור את הסיסמה הזמנית לעובד. בכניסה הבאה הוא יידרש להגדיר סיסמה חדשה משלו לפני שיוכל
            להשתמש במערכת.
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
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    national_id: "",
    birth_date: "",
    password: "",
    is_admin: false,
  });
  const create = useServerFn(createEmployee);

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.email.trim() || form.password.length < 8) throw new Error("שדות חסרים");
      await create({
        data: { ...form, email: form.email.trim(), full_name: form.full_name.trim() },
      });
    },
    onSuccess: () => {
      toast.success("המשתמש נוצר בהצלחה");
      setForm({
        full_name: "",
        email: "",
        phone: "",
        national_id: "",
        birth_date: "",
        password: "",
        is_admin: false,
      });
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
          <div className="space-y-2">
            <Label htmlFor="nu-phone">מספר טלפון</Label>
            <Input
              id="nu-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-nid">תעודת זהות</Label>
            <Input
              id="nu-nid"
              inputMode="numeric"
              maxLength={20}
              value={form.national_id}
              onChange={(e) => setForm({ ...form, national_id: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-bdate">תאריך לידה</Label>
            <Input
              id="nu-bdate"
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
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

type EditableProfile = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  national_id: string | null;
  birth_date: string | null;
};

function EditDetailsDialog({
  profile,
  onSaved,
}: {
  profile: EditableProfile;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    phone: profile.phone ?? "",
    national_id: profile.national_id ?? "",
    birth_date: profile.birth_date ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const name = form.full_name.trim();
      if (name.length < 2) throw new Error("יש להזין שם מלא");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.slice(0, 120),
          phone: form.phone.trim() ? form.phone.trim().slice(0, 25) : null,
          national_id: form.national_id.trim() ? form.national_id.trim().slice(0, 20) : null,
          birth_date: form.birth_date || null,
        })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("פרטי העובד עודכנו");
      setOpen(false);
      onSaved();
    },
    onError: (e: unknown) =>
      toast.error(`עדכון הפרטים נכשל: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

  const label = profile.full_name || profile.email;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-7 px-2"
          aria-label={`עריכת פרטים מזהים עבור ${label}`}
        >
          <Pencil className="size-3.5" />
          עריכת פרטים
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>עריכת פרטים – {label}</DialogTitle>
          <DialogDescription>שם מלא, טלפון, תעודת זהות ותאריך לידה.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`ed-name-${profile.id}`}>שם מלא</Label>
            <Input
              id={`ed-name-${profile.id}`}
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ed-phone-${profile.id}`}>מספר טלפון</Label>
            <Input
              id={`ed-phone-${profile.id}`}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ed-nid-${profile.id}`}>תעודת זהות</Label>
            <Input
              id={`ed-nid-${profile.id}`}
              inputMode="numeric"
              maxLength={20}
              value={form.national_id}
              onChange={(e) => setForm({ ...form, national_id: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ed-bdate-${profile.id}`}>תאריך לידה</Label>
            <Input
              id={`ed-bdate-${profile.id}`}
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
