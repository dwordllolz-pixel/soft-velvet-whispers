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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isGuest: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "SIGNED_IN") {
        setSession(session);
        setUser(session?.user ?? null);
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session);
        setUser(session.user);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isGuest = !!user && (user as any).is_anonymous === true;

  return (
    <AuthContext.Provider value={{ user, session, loading, isGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
