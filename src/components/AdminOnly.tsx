import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <p className="p-6 text-muted-foreground">טוען…</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">אזור למנהלים בלבד</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          לחשבון שלך אין הרשאות ניהול. פנה/י למנהל המשרד.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}