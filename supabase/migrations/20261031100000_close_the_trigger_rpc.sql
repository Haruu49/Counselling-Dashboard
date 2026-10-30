-- ---------------------------------------------------------------------------
-- Take the gate function off the public API
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and `anon` and
-- `authenticated` inherit it, so every function in `public` is a PostgREST
-- endpoint by default. handle_new_counsellor() is now the thing that decides
-- who becomes a counsellor, so it should not be one of them.
--
-- Calling it over RPC cannot actually do anything — Postgres refuses to run a
-- trigger function directly — but a SECURITY DEFINER function sitting on the
-- public API is a standing invitation, and `supabase db advisors` is right to
-- name it.
--
-- is_counsellor() is deliberately left alone. The RLS policies call it as the
-- querying role, so revoking EXECUTE from `authenticated` stops every policy
-- matching and the dashboard reads nothing at all. tests/sql-checks.sh was
-- used to confirm that before this migration was written.
-- ---------------------------------------------------------------------------

revoke all on function public.handle_new_counsellor() from public, anon, authenticated;
