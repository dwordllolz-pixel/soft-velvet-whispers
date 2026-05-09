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
    let mounted = true;

    const cleanAuthHash = () => {
      const hash = window.location.hash;

      // Ignore normal hash routes
      if (
        !hash.includes("access_token") &&
        !hash.includes("refresh_token")
      ) {
        return;
      }

      // Preserve the HashRouter route
      // Example: #/chat/eli#access_token=... -> /chat/eli
      const routeMatch = hash.match(/^#(\/[^#&?]*)/);
      const routePart = routeMatch ? routeMatch[1] : "";

      const newUrl =
        window.location.pathname +
        window.location.search +
        (routePart ? `#${routePart}` : "");

      window.history.replaceState({}, document.title, newUrl);
    };

    const ensureAnonymousSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          await supabase.auth.signInAnonymously();
        }
      } catch (err) {
        console.warn("[auth] anonymous sign-in failed:", err);
      }
    };

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      if (session) cleanAuthHash();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      applySession(session);
      if (event === "SIGNED_IN" && session) {
        cleanAuthHash();
      }
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

  const isGuest = !!user && (user as any).is_anonymous === true;

  return (
    <AuthContext.Provider value={{ user, session, loading, isGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
