DROP POLICY IF EXISTS "users own or admin debug view" ON public.users;
DROP POLICY IF EXISTS "users own or admin debug update" ON public.users;

CREATE POLICY "users own or admin debug view"
ON public.users
FOR SELECT
TO authenticated
USING ((id = auth.uid()) OR private.is_admin_or_debugger(auth.uid()));

CREATE POLICY "users own or admin debug update"
ON public.users
FOR UPDATE
TO authenticated
USING ((id = auth.uid()) OR private.is_admin_or_debugger(auth.uid()))
WITH CHECK ((id = auth.uid()) OR private.is_admin_or_debugger(auth.uid()));