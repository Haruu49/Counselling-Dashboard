-- ===========================================================================
-- Client registrations — the public /#/register page.
--
-- A student registers with the counselling desk once, before sending any
-- counselling request. A registration is contact details only: no counselling
-- content, no account, no login. Counsellor accounts stay invite-only and are
-- not created here; see counsellor_profiles in the first migration.
--
-- Access model
-- ------------
--   anon           INSERT only, and only rows whose four fields are present.
--                  No SELECT, so the page that writes a registration cannot
--                  read one back, and the table cannot be enumerated with the
--                  publishable key.
--   authenticated  SELECT only, and only for an *active* counsellor. Nobody
--                  updates or deletes a registration through the API: there is
--                  no policy for either, deliberately.
--   service_role   Bypasses RLS, as always.
--
-- This is the one table a browser writes to directly. counselling_requests
-- goes through the submit-counselling-request edge function instead, because a
-- request carries what a student wrote about their situation; a registration
-- carries a name, an ID and two ways to make contact. The CHECK constraints
-- below are therefore the server-side validation, and they mirror the rules in
-- js/register.js field for field.
-- ===========================================================================

create table public.registrations (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  student_id text not null unique,
  phone      text not null,
  email      text not null unique,
  created_at timestamptz not null default now(),

  -- Stored trimmed, so a search for 'Lee' cannot miss ' Lee'.
  constraint registrations_full_name_trimmed
    check (full_name = btrim(full_name)),
  constraint registrations_full_name_length
    check (length(full_name) between 2 and 100),
  -- Letters, spaces, apostrophes, hyphens and dots. [[:alpha:]] is Unicode
  -- aware on a UTF-8 database, so an accented or non-Latin name is accepted.
  constraint registrations_full_name_shape
    check (full_name ~ '^[[:alpha:]][[:alpha:]''. -]*$'),

  -- Normalised to upper case by the page before it is sent.
  constraint registrations_student_id_shape
    check (student_id ~ '^[A-Z0-9]{4,20}$'),

  -- Normalised to +60 form: +60 followed by 8 to 11 digits covers Malaysian
  -- mobile and landline numbers.
  constraint registrations_phone_shape
    check (phone ~ '^\+60[0-9]{8,11}$'),

  constraint registrations_email_lowercase
    check (email = lower(email)),
  constraint registrations_email_shape
    check (
      length(email) between 5 and 254
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
    )
);

comment on table public.registrations is
  'Students registered with the counselling desk. Written by anon from /#/register, readable only by active counsellors.';

create index registrations_created_at_idx
  on public.registrations (created_at desc);

-- ---------------------------------------------------------------------------
-- Grants
--
-- Spelled out rather than left to Supabase's defaults for a new public table,
-- the same way the first migration does it.
-- ---------------------------------------------------------------------------

revoke all on public.registrations from anon, authenticated;

grant insert on public.registrations to anon;
grant select on public.registrations to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.registrations enable row level security;
alter table public.registrations force  row level security;

-- The grant already limits anon to INSERT. The WITH CHECK is what stops a row
-- of blanks: the CHECK constraints above police the shape of a value, this
-- policy polices that a value was given at all.
create policy "Anyone may register"
  on public.registrations for insert to anon
  with check (
    length(btrim(full_name))  > 0
    and length(btrim(student_id)) > 0
    and length(btrim(phone))      > 0
    and length(btrim(email))      > 0
  );

create policy "Counsellors read registrations"
  on public.registrations for select to authenticated
  using ((select public.is_counsellor()));

-- No SELECT policy for anon: a registration cannot be read back by the page
-- that created it, which is why js/register.js never asks for one.
-- No UPDATE or DELETE policy for anyone: corrections are a desk job.
