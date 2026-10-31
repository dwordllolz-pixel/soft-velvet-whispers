import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Clock } from "lucide-react";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useAuth } from "@/hooks/useAuth";
import { getCharacter, getASMRCategory, type ASMRType } from "@/data/characters";

interface SessionItem {
  id: string;
  character_id: string;
  asmr_type: string;
  title: string;
  updated_at: string;
}

const History = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { listSessions } = useChatHistory();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    listSessions().then((s) => {
      setSessions(s as SessionItem[]);
      setLoading(false);
    });
  }, [user, authLoading, listSessions, navigate]);

  return (
    <div className="min-h-screen pb-8">
      <header className="sticky top-0 z-50 glass border-b border-border/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="h-8 w-8 rounded-full glass flex items-center justify-center">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="font-heading text-lg font-bold text-foreground">Chat History</h1>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved sessions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start a chat to see it here</p>
          </div>
        ) : (
          sessions.map((s, i) => {
            const char = getCharacter(s.character_id);
            const isCharacterMode = s.asmr_type === "__character__";
            const cat = isCharacterMode ? undefined : getASMRCategory(s.asmr_type as ASMRType);
            const targetPath = isCharacterMode
              ? `/chat/${s.character_id}`
              : `/chat/${s.character_id}/${s.asmr_type}`;
            return (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => navigate(targetPath)}
                className="w-full glass rounded-xl p-4 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
              >
                <span className="text-2xl">{char?.emoji ?? "🎧"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold text-foreground truncate">
                    {char?.name ?? s.character_id}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {isCharacterMode ? "💬 Whisper Corner" : `${cat?.emoji ?? ""} ${cat?.label ?? s.asmr_type}`.trim()}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {new Date(s.updated_at).toLocaleDateString()}
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default History;
