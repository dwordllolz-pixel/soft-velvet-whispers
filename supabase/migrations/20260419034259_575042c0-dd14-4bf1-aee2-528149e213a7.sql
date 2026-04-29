DROP POLICY IF EXISTS "Users view own row" ON public.users;
DROP POLICY IF EXISTS "Users insert own row" ON public.users;
DROP POLICY IF EXISTS "Users update own row" ON public.users;

CREATE POLICY "Users view own row"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users insert own row"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own row"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);