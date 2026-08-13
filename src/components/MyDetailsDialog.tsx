import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MyDetailsDialog() {
  const { profile, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    national_id: "",
    birth_date: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        national_id: profile.national_id ?? "",
        birth_date: profile.birth_date ?? "",
      });
    }
  }, [profile, open]);

  const save = useMutation({
    mutationFn: async () => {
      const name = form.full_name.trim();
      const nid = form.national_id.trim();
      const phone = form.phone.trim();
      if (name.length < 2) throw new Error("יש להזין שם מלא");
      if (nid && !/^\d{5,20}$/.test(nid.replace(/\D/g, "")))
        throw new Error("תעודת זהות אינה תקינה");
      if (phone && phone.replace(/\D/g, "").length < 6) throw new Error("מספר טלפון אינו תקין");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name.slice(0, 120),
          phone: phone ? phone.slice(0, 25) : null,
          national_id: nid ? nid.slice(0, 20) : null,
          birth_date: form.birth_date || null,
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("הפרטים עודכנו");
      await refresh();
      setOpen(false);
    },
    onError: (e: unknown) =>
      toast.error(`עדכון הפרטים נכשל: ${e instanceof Error ? e.message : "שגיאה"}`),
  });

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="עריכת הפרטים האישיים שלי">
          <UserCog className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הפרטים האישיים שלי</DialogTitle>
          <DialogDescription>
            עדכון שם מלא, מספר טלפון, תעודת זהות ותאריך לידה. כתובת הדוא״ל משמשת לכניסה למערכת
            וניתנת לשינוי על ידי מנהל בלבד.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="md-name">שם מלא</Label>
            <Input
              id="md-name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-email">כתובת דוא״ל</Label>
            <Input id="md-email" value={profile.email} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-phone">מספר טלפון</Label>
            <Input
              id="md-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-nid">תעודת זהות</Label>
            <Input
              id="md-nid"
              inputMode="numeric"
              maxLength={20}
              value={form.national_id}
              onChange={(e) => setForm({ ...form, national_id: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="md-bdate">תאריך לידה</Label>
            <Input
              id="md-bdate"
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
            שמירת פרטים
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
