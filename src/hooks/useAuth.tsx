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
          console.log("[auth] no session — calling signInAnonymously()");
          const result = await supabase.auth.signInAnonymously();
          console.log("[auth] signInAnonymously result:", {
            user: result.data?.user?.id,
            session: !!result.data?.session,
            error: result.error,
          });
        } else {
          console.log("[auth] session already present, skipping anon sign-in");
        }
      } catch (err) {
        console.warn("[auth] anonymous sign-in threw:", err);
      }
    };

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("[auth] startup getSession():", {
        hasSession: !!session,
        userId: session?.user?.id,
        isAnonymous: (session?.user as any)?.is_anonymous,
      });
      if (!session) {
        await ensureAnonymousSession();
        const { data } = await supabase.auth.getSession();
        applySession(data.session);
        console.log("[auth] post-anon final state:", {
          hasSession: !!data.session,
          userId: data.session?.user?.id,
          isAnonymous: (data.session?.user as any)?.is_anonymous,
        });
      } else {
        applySession(session);
        cleanAuthHash();
        console.log("[auth] startup final state:", {
          hasSession: true,
          userId: session.user?.id,
          isAnonymous: (session.user as any)?.is_anonymous,
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[auth] onAuthStateChange:", event, {
        hasSession: !!session,
        userId: session?.user?.id,
        isAnonymous: (session?.user as any)?.is_anonymous,
      });
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
