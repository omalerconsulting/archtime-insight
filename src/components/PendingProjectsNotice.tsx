import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/** התראה למנהל על פרויקטים שנפתחו על ידי עובדים וממתינים להשלמת פרטים. */
export function PendingProjectsNotice() {
  const { isAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["projects-review"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, code, name, client_name")
        .eq("needs_admin_review", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = q.data ?? [];
  if (!isAdmin || rows.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-5 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">
              {rows.length} פרויקטים חדשים נפתחו על ידי עובדים וממתינים להשלמת פרטים
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rows
                .slice(0, 5)
                .map((p) => `${p.code} · ${p.name}${p.client_name ? ` (${p.client_name})` : ""}`)
                .join(" | ")}
              {rows.length > 5 ? " ועוד…" : ""}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/projects">להשלמת הפרטים</Link>
        </Button>
      </div>
    </div>
  );
}
