-- ---------------------------------------------------------------------------
-- Counsellor self-registration
--
-- This replaces the student registration table added in
-- 20261030153000_registrations.sql. Students only ever fill in the counselling
-- request form, so there was nothing for them to register for. Counsellors do
-- need a login, and they now create one themselves through the
-- register-counsellor edge function instead of being invited by hand.
--
-- The rule that matters is in handle_new_counsellor() below: it writes an
-- INACTIVE counsellor_profiles row for every new auth user, and activates one
-- only when the insert itself carried raw_app_meta_data.counsellor_approved,
-- which a browser cannot set.
--
-- In practice the registration function does not take that path: the GoTrue
-- admin API applies app_metadata in a second write, after the insert, so this
-- trigger does not see the flag. The function PATCHes the row to active with
-- the service-role key instead, once it has checked the details. Either way
-- the decision is made on the server, and a sign-up that never reaches the
-- function is never activated.
--
-- (This comment was corrected after the live run; the SQL below is unchanged
-- and is what was applied.)
--
-- That matters on this project because public sign-up is enabled: anyone
-- holding the publishable key can POST to /auth/v1/signup. Before this
-- migration such a user was given an active profile and could read every
-- student's counselling request. Now they get an inactive one, which
-- is_counsellor() rejects, so they can read nothing at all.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The student registration table goes away
--
-- Dropped rather than kept empty: a table that nothing writes to and nothing
-- reads is a thing to misunderstand later.
-- ---------------------------------------------------------------------------

drop table if exists public.registrations;

-- ---------------------------------------------------------------------------
-- 2. The two details a registering counsellor types that had nowhere to go
--
-- Both are nullable because the accounts invited before this migration have
-- neither, and because an unapproved sign-up is not allowed to claim either
-- (see the trigger). The shapes mirror js/registration-rules.js, which is
-- what the form checks; these constraints are the authority.
-- ---------------------------------------------------------------------------

alter table public.counsellor_profiles
  add column if not exists staff_id text,
  add column if not exists phone    text;

alter table public.counsellor_profiles
  drop constraint if exists counsellor_profiles_staff_id_shape,
  add  constraint counsellor_profiles_staff_id_shape
    check (staff_id is null or staff_id ~ '^[A-Z0-9]{4,20}$'),
  drop constraint if exists counsellor_profiles_phone_shape,
  add  constraint counsellor_profiles_phone_shape
    check (phone is null or phone ~ '^\+60[0-9]{8,11}$');

-- Two counsellors cannot hold one staff ID. Nulls are distinct in Postgres,
-- so the invited accounts that have no ID yet do not collide with each other.
create unique index if not exists counsellor_profiles_staff_id_key
  on public.counsellor_profiles (staff_id);

comment on column public.counsellor_profiles.staff_id is
  'University staff ID, typed by the counsellor at registration. Unique.';
comment on column public.counsellor_profiles.phone is
  'Normalised to +60… by the registration form and the edge function.';

comment on table public.counsellor_profiles is
  'Counsellors. A row with active = true is what makes an authenticated user a counsellor; only the register-counsellor function can create one.';

-- ---------------------------------------------------------------------------
-- 3. Who becomes a counsellor
--
-- Runs as the trigger on auth.users, so it sees every sign-up however it
-- arrived: through the edge function, through the Supabase dashboard, or
-- through a direct call to the public sign-up endpoint. Only the first of
-- those can set app_metadata, and only that one produces an active profile.
--
-- Nothing here is allowed to raise on bad input. user_metadata is whatever
-- the caller sent, and an exception would abort the auth.users insert and
-- surface as an opaque 500 from GoTrue; anything that would not satisfy a
-- constraint is dropped instead.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_counsellor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb   := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_approved boolean := coalesce(new.raw_app_meta_data ->> 'counsellor_approved', '') = 'true';
  v_name     text    := coalesce(
    nullif(btrim(v_meta ->> 'full_name'), ''),
    initcap(replace(split_part(new.email, '@', 1), '.', ' '))
  );
  v_staff_id text    := nullif(btrim(upper(coalesce(v_meta ->> 'staff_id', ''))), '');
  v_phone    text    := nullif(btrim(coalesce(v_meta ->> 'phone', '')), '');
begin
  -- An unapproved sign-up keeps neither detail: its staff_id would otherwise
  -- occupy an ID that belongs to a real counsellor, and its phone number
  -- would be in the roster beside counsellors who work here.
  if not v_approved then
    v_staff_id := null;
    v_phone    := null;
  end if;

  if v_staff_id is not null and v_staff_id !~ '^[A-Z0-9]{4,20}$' then
    v_staff_id := null;
  end if;
  if v_phone is not null and v_phone !~ '^\+60[0-9]{8,11}$' then
    v_phone := null;
  end if;

  -- full_name must be 2 to 120 characters. A one-letter local part in an
  -- email address can produce a shorter name than that.
  v_name := left(v_name, 120);
  if length(btrim(v_name)) < 2 then
    v_name := 'New counsellor';
  end if;

  insert into public.counsellor_profiles
    (user_id, full_name, email, initials, staff_id, phone, active)
  values (
    new.id,
    v_name,
    new.email,
    upper(
      left(split_part(v_name, ' ', 1), 1)
      || coalesce(left(nullif(split_part(v_name, ' ', 2), ''), 1), '')
    ),
    v_staff_id,
    v_phone,
    v_approved
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- The trigger itself is unchanged and already exists; recreated here so that
-- applying this migration to a fresh database leaves the same wiring.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_counsellor();

-- ---------------------------------------------------------------------------
-- 4. Reading the roster
--
-- No new grant or policy. counsellor_profiles already grants select to
-- `authenticated` behind is_counsellor(), and the two new columns are covered
-- by that. An inactive profile is invisible to everyone, including itself:
-- "Counsellors read the roster" requires is_counsellor(), which an inactive
-- user fails. That is deliberate. Such an account can sign in and see nothing.
-- ---------------------------------------------------------------------------

-- Registration attempts are throttled through the function the student form
-- already uses, public.register_submission_attempt(text, integer), with the
-- hash prefixed so the two endpoints cannot exhaust each other's allowance.
-- Nothing to create here; the grant stays revoked from anon and authenticated.
