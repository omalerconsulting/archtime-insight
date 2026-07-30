import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "כניסה למערכת | ניהול שעות ופרויקטים" },
      {
        name: "description",
        content: "כניסה למערכת ניהול השעות והפרויקטים של המשרד עם שם משתמש וסיסמה.",
      },
      { property: "og:title", content: "כניסה למערכת ניהול שעות ופרויקטים" },
      { property: "og:description", content: "כניסה מאובטחת לעובדי ומנהלי המשרד." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "first-admin">("signin");
  const [busy, setBusy] = useState(false);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/app", replace: true });
  }, [authLoading, session, navigate]);

  useEffect(() => {
    supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => {
        // Unauthenticated readers cannot see rows; a null/0 count is treated as "unknown".
        if (error) setHasUsers(true);
        else setHasUsers((count ?? 0) > 0);
      });
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("כניסה נכשלה", { description: "בדוק את שם המשתמש והסיסמה ונסה שוב." });
      return;
    }
    navigate({ to: "/app", replace: true });
  }

  async function createFirstAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) {
      toast.error("יצירת המשתמש נכשלה", { description: error.message });
      return;
    }
    toast.success("המשתמש הראשון נוצר והוגדר כמנהל");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Building2 className="mx-auto mb-3 size-8 text-accent" aria-hidden />
          <h1 className="text-2xl font-bold">מערכת שעות ופרויקטים</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            הכניסה מותרת למשתמשים שנפתחו על ידי מנהל המשרד
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {mode === "signin" ? (
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">כתובת מייל</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">סיסמה</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                כניסה
              </Button>
            </form>
          ) : (
            <form onSubmit={createFirstAdmin} className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                טרם הוגדרו משתמשים במערכת. המשתמש הראשון שייווצר יקבל הרשאות מנהל.
              </p>
              <div className="space-y-2">
                <Label htmlFor="name">שם מלא</Label>
                <Input
                  id="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email2">כתובת מייל</Label>
                <Input
                  id="email2"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">סיסמה (6 תווים לפחות)</Label>
                <Input
                  id="password2"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                יצירת מנהל ראשון
              </Button>
            </form>
          )}

          {hasUsers === false && (
            <button
              type="button"
              className="mt-4 w-full text-sm text-accent underline"
              onClick={() => setMode(mode === "signin" ? "first-admin" : "signin")}
            >
              {mode === "signin" ? "הגדרת מנהל ראשון למערכת" : "חזרה למסך הכניסה"}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/help" className="underline">
            הוראות הפעלה
          </Link>
        </p>
      </div>
    </div>
  );
}