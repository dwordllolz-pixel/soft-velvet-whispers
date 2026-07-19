import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bug, Copy, Database, FileWarning, KeyRound, LineChart, MessageSquare, Save, Shield, SlidersHorizontal, UserCog } from "lucide-react";
import { characters } from "@/data/characters";
import { useAdminDebug, type AdminChatMessage, type AdminChatSession, type AdminRole, type AdminUserRow } from "@/hooks/useAdminDebug";
import { RELATIONSHIP_THRESHOLDS } from "@/lib/relationshipAxes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_CHARACTER_STATE, type CharacterState } from "@/types/profile";

const relationshipLabels = ["stranger", "acquaintance", "getting close", "close", "FWB", "situationship", "complicated", "ex", "intimate", "devoted"];

type DashboardData = Awaited<ReturnType<ReturnType<typeof useAdminDebug>["loadDashboard"]>>;

const Stat = ({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof Shield }) => (
  <div className="glass rounded-xl p-4">
    <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
      <Icon className="h-4 w-4" />
      {label}
    </div>
    <div className="mt-2 font-heading text-2xl font-bold text-foreground">{value}</div>
  </div>
);

const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const AdminDebug = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const admin = useAdminDebug();
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("debugger");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState(characters[0]?.id ?? "");
  const [draft, setDraft] = useState<CharacterState>({ ...DEFAULT_CHARACTER_STATE });

  const selectedUser = useMemo(
    () => data?.users.find((u) => u.id === selectedUserId) ?? data?.users[0],
    [data?.users, selectedUserId],
  );

  const sessionMessages = useMemo(() => {
    const grouped = new Map<string, AdminChatMessage[]>();
    for (const m of data?.messages ?? []) {
      grouped.set(m.session_id, [...(grouped.get(m.session_id) ?? []), m]);
    }
    return grouped;
  }, [data?.messages]);

  const refresh = async () => {
    if (!admin.canDebug) return;
    const loaded = await admin.loadDashboard();
    setData(loaded);
    setSelectedUserId((cur) => cur || loaded.users[0]?.id || "");
  };

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (admin.canDebug) void refresh();
  }, [admin.canDebug]);

  useEffect(() => {
    if (!selectedUser || !selectedCharacterId) return;
    setDraft(selectedUser.profile_data.characters[selectedCharacterId] ?? { ...DEFAULT_CHARACTER_STATE });
  }, [selectedCharacterId, selectedUser]);

  const redeem = async () => {
    setStatus("");
    try {
      await admin.redeemInvite(inviteCode);
      setInviteCode("");
      setStatus("Admin/debug access enabled.");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const createInvite = async () => {
    setStatus("");
    try {
      const code = await admin.createInvite(inviteRole, `${inviteRole} dashboard invite`);
      setCreatedInvite(code);
      setStatus("Invite created. Copy it now; only the hash is stored.");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const saveRelationship = async () => {
    if (!selectedUser || !selectedCharacterId) return;
    setStatus("");
    try {
      await admin.updateCharacterState(selectedUser.id, selectedCharacterId, draft);
      await refresh();
      setStatus("Relationship debug state saved.");
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const setNumber = (key: keyof CharacterState, value: string, min = 0, max = 100) => {
    const n = Number(value);
    setDraft((cur) => ({ ...cur, [key]: Number.isFinite(n) ? clampNum(n, min, max) : 0 }));
  };

  if (authLoading || admin.loadingRoles) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading admin console...</div>;
  }

  if (!admin.canDebug) {
    return (
      <div className="min-h-screen pb-8">
        <header className="sticky top-0 z-50 glass border-b border-border/30 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="h-8 w-8 rounded-full glass flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="font-heading text-lg font-bold text-foreground">Admin / Debug Access</h1>
        </header>
        <main className="mx-auto max-w-lg px-4 pt-8 space-y-4">
          <div className="glass rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-primary" /><h2 className="font-heading text-xl font-bold">Redeem invite</h2></div>
            <Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="ADM-..." />
            <Button onClick={redeem} className="w-full"><Shield className="h-4 w-4" /> Enable access</Button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </div>
        </main>
      </div>
    );
  }

  const sessions = data?.sessions ?? [];
  const echoLogs = data?.echoLogs ?? [];
  const analytics = data?.analytics ?? [];
  const audit = data?.audit ?? [];

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-50 glass border-b border-border/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="h-8 w-8 rounded-full glass flex items-center justify-center"><ArrowLeft className="h-4 w-4" /></button>
        <div className="flex-1"><h1 className="font-heading text-lg font-bold text-gradient">Admin / Debug Console</h1><p className="text-xs text-muted-foreground">Roles: {admin.roles.join(", ")}</p></div>
        <Button size="sm" variant="outline" onClick={refresh}><Database className="h-4 w-4" /> Refresh</Button>
      </header>

      <main className="px-4 pt-5 space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Users" value={data?.users.length ?? 0} icon={UserCog} />
          <Stat label="Sessions" value={sessions.length} icon={MessageSquare} />
          <Stat label="ECHO errors" value={echoLogs.filter((e) => e.echo_type === "error" || e.severity === "error").length} icon={FileWarning} />
          <Stat label="Events" value={analytics.length} icon={LineChart} />
        </section>

        {admin.isAdmin && (
          <section className="glass rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h2 className="font-heading font-semibold">Invite management</h2></div>
            <div className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
              <Input value={createdInvite} readOnly placeholder="Created invite appears here once" />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AdminRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debugger">Debugger</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select>
              <Button onClick={createInvite}><KeyRound className="h-4 w-4" /> Create</Button>
            </div>
            {createdInvite && <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(createdInvite)}><Copy className="h-4 w-4" /> Copy invite</Button>}
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <div className="glass rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><h2 className="font-heading font-semibold">Relationship testing</h2></div>
            <Select value={selectedUser?.id ?? ""} onValueChange={setSelectedUserId}><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{(data?.users ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.id.slice(0, 8)} · {u.last_active_character ?? "no character"}</SelectItem>)}</SelectContent></Select>
            <Select value={selectedCharacterId} onValueChange={setSelectedCharacterId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{characters.map((c) => <SelectItem key={c.id} value={c.id}>{c.emoji} {c.name}</SelectItem>)}</SelectContent></Select>
            <Select value={draft.relationship_label} onValueChange={(v) => setDraft((cur) => ({ ...cur, relationship_label: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{relationshipLabels.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent></Select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Affection<Input type="number" value={draft.affection} onChange={(e) => setNumber("affection", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Trust<Input type="number" value={draft.trust} onChange={(e) => setNumber("trust", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Tension<Input type="number" value={draft.tension} onChange={(e) => setNumber("tension", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Jealousy<Input type="number" value={draft.jealousy} onChange={(e) => setNumber("jealousy", e.target.value)} /></label>
              <label className="text-xs text-muted-foreground">Attachment<Input type="number" step="0.01" value={draft.attachmentShift} onChange={(e) => setNumber("attachmentShift", e.target.value, -0.3, 0.4)} /></label>
              <label className="text-xs text-muted-foreground">Messages<Input type="number" value={draft.message_count} onChange={(e) => setNumber("message_count", e.target.value, 0, 100000)} /></label>
            </div>
            <Button onClick={saveRelationship} className="w-full"><Save className="h-4 w-4" /> Save debug state</Button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Main ladder thresholds (main-ladder only — reads from RELATIONSHIP_THRESHOLDS, same source deriveRelationshipResult() uses for both label and reasoning)</p>
              <p>stranger → acquaintance: affection &amp; trust ≥ {RELATIONSHIP_THRESHOLDS.acquaintance}</p>
              <p>acquaintance → getting close: &gt; {RELATIONSHIP_THRESHOLDS.gettingClose}</p>
              <p>getting close → close: &gt; {RELATIONSHIP_THRESHOLDS.close} (and tension &lt; 30)</p>
              <p>close → intimate: &gt; {RELATIONSHIP_THRESHOLDS.intimate}</p>
              <p>intimate → devoted: affection &amp; trust &gt; 70, message_count &gt; 100 (unchanged — see RELATIONSHIP_STATE_V2.md Section 7, devoted's gate is pending the multi-day sustain redesign, not a simple rescale)</p>
              <p className="italic pt-1">Recalibrated July 2026 — provisional until Character Completion. See RELATIONSHIP_STATE_V2.md for full reasoning. Branch states (FWB/situationship/complicated/ex) not shown here — dormant V3 functionality, thresholds unchanged.</p>
            </div>
          </div>

          <div className="glass rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><Bug className="h-4 w-4 text-primary" /><h2 className="font-heading font-semibold">Character backgrounds</h2></div>
            <div className="grid gap-3 md:grid-cols-2">
              {characters.map((c, index) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} className="rounded-lg border border-border/40 bg-muted/20 p-3">
                  <div className="flex items-center gap-2"><span className="text-xl">{c.emoji}</span><div><p className="font-heading font-semibold">{c.name}</p><p className="text-xs text-primary">{c.archetype}</p></div></div>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-4">{c.bio}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Voice: {c.voiceDescription}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="glass rounded-xl p-4 space-y-3"><h2 className="font-heading font-semibold">Chat logs</h2>{sessions.map((s: AdminChatSession) => <div key={s.id} className="rounded-lg border border-border/40 p-3"><p className="text-sm font-medium">{s.character_id} · {s.asmr_type}</p><p className="text-xs text-muted-foreground">User {s.user_id.slice(0, 8)} · {new Date(s.updated_at).toLocaleString()}</p><div className="mt-2 space-y-1">{(sessionMessages.get(s.id) ?? []).slice(0, 4).map((m) => <p key={m.id} className="text-xs text-muted-foreground"><span className="text-foreground">{m.role}:</span> {m.content.slice(0, 180)}</p>)}</div></div>)}</div>
          <div className="glass rounded-xl p-4 space-y-3"><h2 className="font-heading font-semibold">ECHO errors</h2>{echoLogs.map((e) => <div key={e.id} className="rounded-lg border border-border/40 p-3"><p className="text-sm"><span className="text-primary">ECHO {e.echo_type}</span> · {e.message}</p><p className="text-xs text-muted-foreground">{e.character_id ?? "global"} · {new Date(e.created_at).toLocaleString()}</p></div>)}</div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="glass rounded-xl p-4 space-y-3"><h2 className="font-heading font-semibold">Analytics</h2>{analytics.map((a) => <div key={a.id} className="rounded-lg border border-border/40 p-3"><p className="text-sm text-foreground">{a.event_name}</p><p className="text-xs text-muted-foreground">{a.character_id ?? "global"} · {a.mode ?? "app"} · {new Date(a.created_at).toLocaleString()}</p></div>)}</div>
          <div className="glass rounded-xl p-4 space-y-3"><h2 className="font-heading font-semibold">Audit trail</h2>{audit.map((a) => <div key={a.id} className="rounded-lg border border-border/40 p-3"><p className="text-sm text-foreground">{a.action}</p><p className="text-xs text-muted-foreground">Target {a.target_user_id?.slice(0, 8) ?? "—"} · {a.target_character_id ?? "—"} · {new Date(a.created_at).toLocaleString()}</p></div>)}</div>
        </section>
      </main>
    </div>
  );
};

export default AdminDebug;
