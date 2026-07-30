import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { resetPasswordWithIdentity } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = s.next;
    return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? { next }
      : {};
  },
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
  const { next } = Route.useSearch();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const resetPw = useServerFn(resetPasswordWithIdentity);

  useEffect(() => {
    if (!authLoading && session) {
      if (next) window.location.replace(next);
      else navigate({ to: "/app", replace: true });
    }
  }, [authLoading, session, navigate, next]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error("כניסה נכשלה", { description: "בדוק את שם המשתמש והסיסמה ונסה שוב." });
      return;
    }
    if (next) window.location.replace(next);
    else navigate({ to: "/app", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          national_id: nationalId.trim(),
          birth_date: birthDate,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) {
      toast.error("יצירת המשתמש נכשלה", { description: error.message });
      return;
    }
    await supabase.auth.signOut();
    toast.success("המשתמש נוצר ונשלח לאישור מנהל", {
      description: "לאחר אישור המנהל תוכל להיכנס עם המייל והסיסמה שהגדרת.",
    });
    setMode("signin");
    setPassword("");
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await resetPw({
        data: {
          email: email.trim(),
          national_id: nationalId.trim(),
          birth_date: birthDate,
          phone: phone.trim(),
          password,
        },
      });
      toast.success("הסיסמה עודכנה", { description: "אפשר להיכנס עם הסיסמה החדשה." });
      setMode("signin");
      setPassword("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error("איפוס הסיסמה נכשל", {
        description: msg.includes("pending")
          ? "החשבון עדיין ממתין לאישור מנהל."
          : "הפרטים המזהים שהוזנו אינם תואמים לפרטים שנשמרו במערכת.",
      });
    } finally {
      setBusy(false);
    }
  }

  const identityFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="phone">מספר טלפון</Label>
        <Input
          id="phone"
          type="tel"
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nid">תעודת זהות</Label>
        <Input
          id="nid"
          required
          inputMode="numeric"
          maxLength={20}
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bdate">תאריך לידה</Label>
        <Input
          id="bdate"
          type="date"
          required
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Building2 className="mx-auto mb-3 size-8 text-accent" aria-hidden />
          <h1 className="text-2xl font-bold">מערכת שעות ופרויקטים</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            הכניסה מותרת למשתמשים שאושרו על ידי מנהל המשרד
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {mode === "signin" && (
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
          )}

          {mode === "signup" && (
            <form onSubmit={signUp} className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                לאחר ההרשמה המשתמש נפתח אצל מנהל המשרד וממתין לאישורו. רק לאחר אישור המנהל אפשר
                להיכנס עם המייל והסיסמה שהוגדרו.
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
              {identityFields}
              <div className="space-y-2">
                <Label htmlFor="password2">סיסמה (8 תווים לפחות)</Label>
                <Input
                  id="password2"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                יצירת משתמש
              </Button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={forgot} className="space-y-4">
              <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                לאיפוס הסיסמה יש להזין את הפרטים המזהים שהוזנו בעת פתיחת המשתמש.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email3">כתובת מייל</Label>
                <Input
                  id="email3"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {identityFields}
              <div className="space-y-2">
                <Label htmlFor="password3">סיסמה חדשה (8 תווים לפחות)</Label>
                <Input
                  id="password3"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                איפוס סיסמה
              </Button>
            </form>
          )}

          <div className="mt-4 space-y-2 text-center">
            {mode !== "signup" && (
              <button
                type="button"
                className="block w-full text-sm text-accent underline"
                onClick={() => setMode("signup")}
              >
                משתמש חדש
              </button>
            )}
            {mode !== "forgot" && (
              <button
                type="button"
                className="block w-full text-sm text-muted-foreground underline"
                onClick={() => setMode("forgot")}
              >
                שכחתי סיסמה
              </button>
            )}
            {mode !== "signin" && (
              <button
                type="button"
                className="block w-full text-sm text-muted-foreground underline"
                onClick={() => setMode("signin")}
              >
                חזרה למסך הכניסה
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="underline">
            על המערכת והוראות הפעלה
          </Link>
        </p>
      </div>
    </div>
  );
}
