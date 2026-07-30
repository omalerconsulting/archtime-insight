import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Banknote,
  Building2,
  CalendarClock,
  FileText,
  FolderKanban,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MonthEndNotice } from "@/components/MonthEndNotice";
import { ForcePasswordChange } from "@/components/ForcePasswordChange";
import { PendingApproval } from "@/components/PendingApproval";
import officeLogo from "@/assets/office-logo.png";

type NavItem = { to: string; label: string; icon: typeof Building2; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/app", label: "דיווח שעות", icon: CalendarClock },
  { to: "/report", label: "דוח חודשי", icon: FileText },
  { to: "/dashboard", label: "דשבורד ניהולי", icon: BarChart3, adminOnly: true },
  { to: "/projects", label: "פרויקטים", icon: FolderKanban, adminOnly: true },
  { to: "/finance", label: "גבייה וכספים", icon: Banknote, adminOnly: true },
  { to: "/employees", label: "עובדים", icon: Users, adminOnly: true },
  { to: "/settings", label: "הגדרות משרד", icon: Settings, adminOnly: true },
  { to: "/guide", label: "הוראות הפעלה", icon: BookOpen },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [officeName, setOfficeName] = useState("סימאונה אדריכלים");

  useEffect(() => {
    const saved = window.localStorage.getItem("theme") === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);

  useEffect(() => {
    supabase
      .from("org_settings")
      .select("logo_url, office_name")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLogo(data.logo_url);
          if (data.office_name && data.office_name !== "משרד אדריכלים") {
            setOfficeName(data.office_name);
          }
        }
      });
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  if (profile && profile.is_approved === false) return <PendingApproval />;
  if (profile?.must_change_password) return <ForcePasswordChange />;

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="תפריט ניווט"
            onClick={() => setOpen((o) => !o)}
          >
            <Menu className="size-5" />
          </Button>

          <Link to="/app" className="flex items-center gap-3">
            <img
              src={logo || officeLogo}
              alt={`הלוגו של ${officeName}`}
              className="h-9 w-auto object-contain"
            />
            <span className="text-base font-semibold">{officeName}</span>
          </Link>

          <nav aria-label="ניווט ראשי" className="ms-auto hidden items-center gap-1 lg:flex">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.to
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
              onClick={toggleTheme}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <div className="hidden text-end sm:block">
              <p className="text-sm font-medium">{profile?.full_name || profile?.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              יציאה
            </Button>
          </div>
        </div>

        {open && (
          <nav aria-label="ניווט נייד" className="border-t border-border px-4 py-2 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <MonthEndNotice />
        {children}
      </main>
    </div>
  );
}