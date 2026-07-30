import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForcePasswordChange() {
  const { user, refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pw.length < 8) {
      toast.error("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (pw !== pw2) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      toast.error(`עדכון הסיסמה נכשל: ${error.message}`);
      return;
    }
    const upd = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user!.id);
    setBusy(false);
    if (upd.error) {
      toast.error("הסיסמה עודכנה אך אירעה שגיאה. יש לרענן את הדף");
      return;
    }
    toast.success("הסיסמה עודכנה בהצלחה");
    await refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">נדרשת הגדרת סיסמה חדשה</h1>
          <p className="text-sm text-muted-foreground">
            הסיסמה שלך אופסה על ידי מנהל המערכת. יש להגדיר סיסמה חדשה כדי להמשיך.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="np1">סיסמה חדשה (8 תווים לפחות)</Label>
          <Input id="np1" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="np2">אימות סיסמה</Label>
          <Input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void submit()} disabled={busy}>
            שמירת סיסמה חדשה
          </Button>
          <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
            התנתקות
          </Button>
        </div>
      </div>
    </div>
  );
}