-- ===========================================================================
-- tests/supabase-shim.sql — the parts of a Supabase project that
-- supabase/migrations/*.sql depends on, recreated on a throwaway local
-- Postgres so the migration can be applied and exercised without touching a
-- live project.
--
-- Used by tests/sql-checks.sh. It is NOT part of the migration and must never
-- be run against a real Supabase project, which already provides all of this.
-- ===========================================================================

-- The three PostgREST roles. service_role carries BYPASSRLS on Supabase,
-- which is what lets the edge function insert past the policies.
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase hands the API roles broad privileges on anything created in
-- public. Reproduced here so the migration's explicit REVOKEs are actually
-- revoking something during the test.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- GoTrue's user table, cut down to the columns the migration reads.
create schema auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  -- What the caller sent. A browser can set this, so nothing trusts it.
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  -- What the server set. Only a service-role caller can write this, which is
  -- what handle_new_counsellor() relies on to decide who becomes a counsellor.
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- auth.uid() reads the subject claim PostgREST sets per request. The tests
-- impersonate a counsellor with `set local request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- The publication Realtime reads from.
create publication supabase_realtime;

create extension if not exists pgcrypto;
