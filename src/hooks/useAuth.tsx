import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True when the current session is an anonymous (guest) user. */
  isGuest: boolean;
  signOut: () => Promise<void>;
  /** Explicitly start a guest session. Only called when user clicks "Continue as Guest". */
  signInAsGuest: () => Promise<void>;
}
// using this for a commit
const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isGuest: false,
  signOut: async () => {},
  signInAsGuest: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };

    // On startup: just restore whatever session exists (real or guest).
    // Never create a session automatically — that's the user's explicit choice now.
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[auth] startup getSession():", {
        hasSession: !!session,
        userId: session?.user?.id,
        isAnonymous: (session?.user as any)?.is_anonymous,
      });
      applySession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth] onAuthStateChange:", event, {
        hasSession: !!session,
        userId: session?.user?.id,
        isAnonymous: (session?.user as any)?.is_anonymous,
      });
      applySession(session);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Only called when user explicitly clicks "Continue as Guest"
  const signInAsGuest = async () => {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
  };

  const isGuest = !!user && (user as any).is_anonymous === true;

  return (
    <AuthContext.Provider value={{ user, session, loading, isGuest, signOut, signInAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
};