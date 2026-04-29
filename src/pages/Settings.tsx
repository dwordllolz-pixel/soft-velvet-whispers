import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { supabase, supabaseEnv } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useChatHistory } from "@/hooks/useChatHistory";
import { getCharacter } from "@/data/characters";
import { deleteAllMemory } from "@/lib/memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = "idle" | "warn" | "reauth" | "deleting" | "farewell" | "done";
type MemStep = "idle" | "warn" | "reauth" | "deleting" | "done";

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, resetAllCharacterStates } = useUserProfile();
  const { deleteAllSessions } = useChatHistory();

  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [farewellName, setFarewellName] = useState<string | null>(null);
  const [farewellText, setFarewellText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Independent flow for "Reset Relationship Memory" — does NOT touch chats.
  const [memStep, setMemStep] = useState<MemStep>("idle");
  const [memPassword, setMemPassword] = useState("");
  const [memReauthError, setMemReauthError] = useState<string | null>(null);
  const [memBusy, setMemBusy] = useState(false);

  /** Highest-relationship character above the meaningful threshold. */
  const farewellCandidate = useMemo(() => {
    let best: { id: string; score: number } | null = null;
    for (const [id, st] of Object.entries(profile.characters)) {
      if (!st) continue;
      const score = st.affection + st.trust;
      if (st.affection > 60 && st.trust > 60 && (!best || score > best.score)) {
        best = { id, score };
      }
    }
    return best ? getCharacter(best.id) ?? null : null;
  }, [profile.characters]);

  const generateFarewell = async (): Promise<string | null> => {
    if (!farewellCandidate) return null;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `${supabaseEnv.url}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? supabaseEnv.anonKey}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "I'm clearing all our conversations. Say one short, in-character goodbye — two sentences max. No quotes, no asterisks.",
            },
          ],
          systemPrompt: `${farewellCandidate.systemPromptBase}\n\nThis is a final farewell. Keep it under 30 words. No formatting, no actions.`,
          characterId: farewellCandidate.id,
          asmrType: "confession",
        }),
      });
      if (!resp.ok || !resp.body) return null;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) text += delta;
          } catch {
            /* partial */
          }
        }
      }
      return text.trim() || null;
    } catch (e) {
      console.warn("[settings] farewell generation failed:", e);
      return null;
    }
  };

  const performReset = async () => {
    if (!user) return;
    setStep("deleting");
    setBusy(true);

    // Kick off farewell generation in PARALLEL with the delete so reset
    // doesn't block on edge-function latency. The model still sees the
    // intact relationship snapshot because no DB writes have occurred yet.
    const farewellPromise = generateFarewell();

    try {
      // 1) Backend-first: hard delete every chat_message + chat_session for
      //    this user. RLS additionally restricts to auth.uid() rows.
      await deleteAllSessions();

      // 2) Reset every character's relationship state in ONE atomic write.
      //    Preferences are intentionally preserved.
      await resetAllCharacterStates();

      // 3) Full reset also wipes relationship memory tables (narrative state,
      //    milestones, learned preferences) for a true clean slate.
      await deleteAllMemory(user.id);

      // 4) Now wait on the farewell that's been streaming alongside the deletes.
      const farewell = await farewellPromise;

      if (farewell && farewellCandidate) {
        setFarewellName(farewellCandidate.name);
        setFarewellText(farewell);
        setStep("farewell");
      } else {
        setStep("done");
      }
      toast.success("All chats and memory cleared.");
    } catch (e) {
      console.error("[settings] reset failed:", e);
      toast.error("Couldn't complete reset. Try again.");
      setStep("idle");
    } finally {
      setBusy(false);
    }
  };

  const handleReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setReauthError("No email on this account — can't re-authenticate.");
      return;
    }
    setBusy(true);
    setReauthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    setBusy(false);
    if (error) {
      setReauthError("Incorrect password.");
      return;
    }
    setPassword("");
    void performReset();
  };

  // -------- Memory-only reset (separate flow, doesn't touch chats) --------
  const performMemoryReset = async () => {
    if (!user) return;
    setMemStep("deleting");
    setMemBusy(true);
    try {
      await deleteAllMemory(user.id);
      setMemStep("done");
      toast.success("Relationship memory cleared.");
    } catch (e) {
      console.error("[settings] memory reset failed:", e);
      toast.error("Couldn't clear relationship memory. Try again.");
      setMemStep("idle");
    } finally {
      setMemBusy(false);
    }
  };

  const handleMemReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setMemReauthError("No email on this account — can't re-authenticate.");
      return;
    }
    setMemBusy(true);
    setMemReauthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: memPassword,
    });
    setMemBusy(false);
    if (error) {
      setMemReauthError("Incorrect password.");
      return;
    }
    setMemPassword("");
    void performMemoryReset();
  };

  return (
    <div className="min-h-screen pb-12">
      <header className="sticky top-0 z-40 glass border-b border-border/30 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="h-8 w-8 rounded-full glass flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-heading text-lg font-bold">Settings</h1>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        <section className="glass rounded-2xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Account
          </h2>
          <p className="text-sm">{user?.email ?? "Guest session"}</p>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </section>

        <section className="glass rounded-2xl p-4 space-y-3 border border-border/40">
          <div className="flex items-start gap-2">
            <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Relationship memory</h2>
              <p className="text-xs text-muted-foreground">
                Erases everything characters remember about you across all
                relationships — narrative state, key moments, learned patterns.
                Your conversations and account preferences are kept.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!user || memBusy}
            onClick={() => setMemStep("warn")}
          >
            <Brain className="h-3.5 w-3.5 mr-1.5" />
            Reset relationship memory
          </Button>
        </section>

        <section className="glass rounded-2xl p-4 space-y-3 border border-destructive/30">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Danger zone</h2>
              <p className="text-xs text-muted-foreground">
                Deletes every chat, resets every relationship to zero, and
                erases all relationship memory. Your account and preferences
                are kept.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={!user || busy}
            onClick={() => setStep("warn")}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Reset all chats
          </Button>
        </section>
      </main>

      {/* 1) Warning */}
      <AlertDialog open={step === "warn"} onOpenChange={(o) => !o && setStep("idle")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every conversation and reset every
              character relationship to stranger. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => setStep("reauth")}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 2) Re-auth */}
      <Dialog open={step === "reauth"} onOpenChange={(o) => !o && setStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it's you</DialogTitle>
            <DialogDescription>
              Re-enter your password to permanently reset all chats.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReauth} className="space-y-3">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              disabled={busy}
            />
            {reauthError && <p className="text-xs text-destructive">{reauthError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("idle")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || !password}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reset everything"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3) Deleting spinner */}
      <Dialog open={step === "deleting"}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="sr-only">Resetting</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Clearing every conversation…</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4) Farewell */}
      <Dialog open={step === "farewell"} onOpenChange={(o) => !o && setStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{farewellName} wanted to say something</DialogTitle>
          </DialogHeader>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm italic text-foreground/90 leading-relaxed py-2"
          >
            {farewellText}
          </motion.p>
          <DialogFooter>
            <Button onClick={() => setStep("idle")}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5) Done (no farewell) */}
      <Dialog open={step === "done"} onOpenChange={(o) => !o && setStep("idle")}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>All chats cleared</DialogTitle>
            <DialogDescription>Every conversation has been removed.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setStep("idle")}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Memory-only reset flow ---------- */}
      <AlertDialog open={memStep === "warn"} onOpenChange={(o) => !o && setMemStep("idle")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset relationship memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently erases everything every character remembers
              about you — narrative state, key moments, and learned patterns
              — across all relationships. Your conversation history and
              account preferences are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setMemStep("reauth")}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={memStep === "reauth"} onOpenChange={(o) => !o && setMemStep("idle")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it's you</DialogTitle>
            <DialogDescription>
              Re-enter your password to permanently erase all relationship memory.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMemReauth} className="space-y-3">
            <Input
              type="password"
              placeholder="Password"
              value={memPassword}
              onChange={(e) => setMemPassword(e.target.value)}
              autoFocus
              required
              disabled={memBusy}
            />
            {memReauthError && <p className="text-xs text-destructive">{memReauthError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMemStep("idle")}
                disabled={memBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={memBusy || !memPassword}>
                {memBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Erase memory"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={memStep === "deleting"}>
        <DialogContent className="sm:max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="sr-only">Erasing memory</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Erasing relationship memory…</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={memStep === "done"} onOpenChange={(o) => !o && setMemStep("idle")}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Relationship memory cleared</DialogTitle>
            <DialogDescription>
              Every character now remembers nothing about you. Your conversations
              are still intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setMemStep("idle")}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
