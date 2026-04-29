
-- character_memory: one narrative_state per user+character
CREATE TABLE public.character_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id TEXT NOT NULL,
  narrative_state TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, character_id)
);

ALTER TABLE public.character_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own character_memory"
  ON public.character_memory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own character_memory"
  ON public.character_memory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own character_memory"
  ON public.character_memory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users delete own character_memory"
  ON public.character_memory FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_character_memory_updated_at
  BEFORE UPDATE ON public.character_memory
  FOR EACH ROW EXECUTE FUNCTION public.touch_users_updated_at();

CREATE INDEX idx_character_memory_user_char
  ON public.character_memory (user_id, character_id);

-- character_milestones: append-only key emotional moments
CREATE TABLE public.character_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id TEXT NOT NULL,
  emotional_summary TEXT NOT NULL,
  emotional_weight REAL NOT NULL DEFAULT 0,
  times_referenced INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.character_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own milestones"
  ON public.character_milestones FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own milestones"
  ON public.character_milestones FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own milestones"
  ON public.character_milestones FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users delete own milestones"
  ON public.character_milestones FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_character_milestones_user_char_created
  ON public.character_milestones (user_id, character_id, created_at DESC);

-- character_preferences: learned patterns with confidence
CREATE TABLE public.character_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  character_id TEXT NOT NULL,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.6,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.character_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own preferences"
  ON public.character_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users insert own preferences"
  ON public.character_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own preferences"
  ON public.character_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "users delete own preferences"
  ON public.character_preferences FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_character_preferences_user_char
  ON public.character_preferences (user_id, character_id);
