import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function PendingApproval() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <Clock className="mx-auto mb-4 size-10 text-accent" aria-hidden />
        <h1 className="text-xl font-bold">החשבון ממתין לאישור מנהל</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          פרטי המשתמש שלך נשמרו במערכת ונשלחו לאישור מנהל המשרד. לאחר האישור תוכל להיכנס עם שם
          המשתמש והסיסמה שהגדרת.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={signOut}>
          יציאה
        </Button>
      </div>
    </div>
  );
}
