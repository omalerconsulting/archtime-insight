import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | null;
  cost_rate: number | null;
  is_active: boolean;
  must_change_password?: boolean | null;
  is_approved?: boolean | null;
  national_id?: string | null;
  birth_date?: string | null;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((prof as Profile) ?? null);
    setIsAdmin(Boolean(roles?.some((r) => r.role === "admin")));
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      void load(data.session?.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setLoading(true);
        void load(next?.user.id);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin,
      loading,
      refresh: () => load(session?.user.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, profile, isAdmin, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}