-- Phase 1: users table with profile_data JSONB
CREATE TABLE public.users (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_character TEXT,
  profile_data JSONB NOT NULL DEFAULT jsonb_build_object(
    'version', 1,
    'preferences', jsonb_build_object(
      'nsfw_level', 'sfw',
      'toxicity_tolerance', 0.5,
      'auto_voice', true,
      'incognito', false,
      'dom_sub_default', 'neutral',
      'boundaries', jsonb_build_object(
        'no_non_con', true,
        'no_degradation', false,
        'no_extreme_power_dynamics', false
      ),
      'character_dom_sub', '{}'::jsonb
    ),
    'characters', '{}'::jsonb,
    'memory', '{}'::jsonb,
    'rivalry', jsonb_build_object('enabled', true, 'intensity', 'medium'),
    'meta', jsonb_build_object('last_used_character', null, 'total_sessions', 0)
  )
);

CREATE INDEX idx_users_last_active_character ON public.users(last_active_character);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users insert own row"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own row"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.touch_users_updated_at();

-- Auto-create users row on signup (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.users (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Backfill: create users rows for existing auth users
INSERT INTO public.users (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Migrate existing relationships rows into profile_data.characters
WITH agg AS (
  SELECT
    user_id,
    jsonb_object_agg(
      character_id,
      jsonb_build_object(
        'affection', 0,
        'trust', 0,
        'tension', 0,
        'jealousy', 0,
        'message_count', message_count,
        'last_interaction', updated_at,
        'attachmentShift', 0.0,
        'relationship_label', COALESCE(level, 'stranger'),
        'legacy_intimacy_score', intimacy_score,
        'last_emotion', last_emotion,
        'last_intensity', last_intensity
      )
    ) AS chars
  FROM public.relationships
  GROUP BY user_id
)
UPDATE public.users u
SET profile_data = jsonb_set(u.profile_data, '{characters}', agg.chars, true)
FROM agg
WHERE u.id = agg.user_id;