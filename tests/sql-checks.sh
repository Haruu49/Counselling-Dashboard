#!/usr/bin/env bash
# ===========================================================================
# tests/sql-checks.sh — exercises supabase/migrations against a throwaway
# local Postgres cluster.
#
# The point is the access rules. A policy that reads correctly can still let
# the wrong role through, so every rule below is asserted by trying it as the
# role in question rather than by reading the catalogue.
#
# Nothing here touches a live Supabase project: the cluster is created in a
# temporary directory, used, and destroyed.
#
#   ./tests/sql-checks.sh
#
# Needs the Postgres 16 server binaries (initdb, pg_ctl). On Debian/Ubuntu:
#   sudo apt install postgresql-16
# ===========================================================================

set -uo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT_TEST:-55432}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WORK="$(mktemp -d)"
DATA="$WORK/pgdata"

pass=0
fail=0

ok() { # name, condition-already-evaluated ("pass"/"fail"), detail
  if [ "$2" = pass ]; then
    printf 'PASS  %s\n' "$1"; pass=$((pass + 1))
  else
    printf 'FAIL  %s%s\n' "$1" "${3:+ :: $3}"; fail=$((fail + 1))
  fi
}

cleanup() {
  "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ ! -x "$PGBIN/initdb" ]; then
  echo "SKIP  SQL checks: no Postgres server binaries at $PGBIN" >&2
  echo "      set PGBIN, or install postgresql-16, to run them." >&2
  exit 0
fi

# --------------------------------------------------------------------------
# Throwaway cluster
# --------------------------------------------------------------------------
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null 2>&1
"$PGBIN/pg_ctl" -D "$DATA" \
  -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1 -c wal_level=logical" \
  -l "$WORK/pg.log" start >/dev/null 2>&1
for _ in $(seq 1 20); do
  "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break
  sleep 0.3
done

PSQL="psql -X -q -h 127.0.0.1 -p $PORT -U postgres -d postgres"
$PSQL -v ON_ERROR_STOP=1 -c "create database shimtest;" >/dev/null 2>&1
PSQL="psql -X -q -h 127.0.0.1 -p $PORT -U postgres -d shimtest"

# `sql` runs a statement and reports whether it succeeded.
sql()  { $PSQL -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
# `val` returns a single value. Only the trailing newline is stripped, so a
# value with spaces in it ("Dr. Lina Haron") compares as itself.
val()  { $PSQL -t -A -c "$1" 2>/dev/null | head -1 | sed 's/[[:space:]]*$//'; }

assert_true()  { [ "$(val "$2")" = t ] && ok "$1" pass || ok "$1" fail "got '$(val "$2")'"; }
assert_eq()    { local got; got="$(val "$3")"; [ "$got" = "$2" ] && ok "$1" pass || ok "$1" fail "expected '$2', got '$got'"; }
assert_ok()    { sql "$2" && ok "$1" pass || ok "$1" fail "statement failed"; }
assert_denied(){ sql "$2" && ok "$1" fail "statement was allowed" || ok "$1" pass; }

# --------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/supabase-shim.sql" >/dev/null 2>&1 \
  && ok 'Supabase shim applies' pass || ok 'Supabase shim applies' fail

migration="$(ls "$ROOT"/supabase/migrations/*_counselling_requests.sql | head -1)"
if $PSQL -v ON_ERROR_STOP=1 -f "$migration" >/dev/null 2>&1; then
  ok 'Migration applies cleanly' pass
else
  ok 'Migration applies cleanly' fail "$($PSQL -f "$migration" 2>&1 | grep -m1 ERROR)"
  echo; echo "$pass passed, $fail failed"; exit 1
fi

for later in $(ls "$ROOT"/supabase/migrations/*.sql | tail -n +2); do
  name="$(basename "$later" .sql | cut -c16-)"
  if $PSQL -v ON_ERROR_STOP=1 -f "$later" >/dev/null 2>&1; then
    ok "Migration $name applies cleanly" pass
  else
    ok "Migration $name applies cleanly" fail "$($PSQL -f "$later" 2>&1 | grep -m1 ERROR)"
    echo; echo "$pass passed, $fail failed"; exit 1
  fi
done

assert_true 'RLS is enabled on counselling_requests' \
  "select relrowsecurity and relforcerowsecurity from pg_class where oid='public.counselling_requests'::regclass"
assert_true 'RLS is enabled on counsellor_profiles' \
  "select relrowsecurity and relforcerowsecurity from pg_class where oid='public.counsellor_profiles'::regclass"
assert_true 'RLS is enabled on submission_throttle' \
  "select relrowsecurity from pg_class where oid='public.submission_throttle'::regclass"
assert_eq  'Requests table is published for Realtime' 't' \
  "select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='counselling_requests')"
assert_eq  'No delete policy exists for anyone' '0' \
  "select count(*) from pg_policies where tablename='counselling_requests' and cmd='DELETE'"
assert_eq  'anon holds no privilege on requests' '0' \
  "select count(*) from information_schema.role_table_grants where grantee='anon' and table_name='counselling_requests'"
assert_eq  'anon holds no privilege on the throttle table' '0' \
  "select count(*) from information_schema.role_table_grants where grantee='anon' and table_name='submission_throttle'"

# --------------------------------------------------------------------------
# A counsellor and a plain signed-in user
# --------------------------------------------------------------------------
COUNSELLOR='11111111-1111-4111-8111-111111111111'
OUTSIDER='22222222-2222-4222-8222-222222222222'

# Created the way register-counsellor creates one: the details in
# user_metadata, the approval in app_metadata.
sql "insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
     values ('$COUNSELLOR', 'lina.haron@counselling.demo',
             '{\"full_name\":\"Dr. Lina Haron\",\"staff_id\":\"STAFF2041\",\"phone\":\"+60123456789\"}'::jsonb,
             '{\"counsellor_approved\":true}'::jsonb);"
assert_eq 'New auth user gets a counsellor profile' 'Dr. Lina Haron' \
  "select full_name from public.counsellor_profiles where user_id='$COUNSELLOR'"
assert_eq 'Initials are derived for the sidebar' 'DL' \
  "select initials from public.counsellor_profiles where user_id='$COUNSELLOR'"

# An authenticated user with no profile row: signed in, but not a counsellor.
sql "insert into auth.users (id, email) values ('$OUTSIDER', 'someone.else@example.com');"
sql "delete from public.counsellor_profiles where user_id='$OUTSIDER';"

# as() wraps a statement in a transaction running as a given role and subject.
as() { # role, subject-uuid-or-empty, sql
  $PSQL -v ON_ERROR_STOP=1 -c "begin;
    select set_config('request.jwt.claim.sub', '$2', true);
    set local role $1;
    $3;
  commit;" >/dev/null 2>&1
}
as_val() { # role, subject, sql  -> single value
  $PSQL -t -A -c "begin;
    select set_config('request.jwt.claim.sub', '$2', true);
    set local role $1;
    $3;
  commit;" 2>/dev/null | sed -n '2p' | tr -d '[:space:]'
}

# --------------------------------------------------------------------------
# Insert path: only service_role (the edge function) may create a request
# --------------------------------------------------------------------------
NEW_ROW="insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email,
   purposes, issues, description)
  values ('Request', 'Nadia Yusuf', 'STU20241234', '3', '0123456789',
          'nadia.yusuf@student.university.demo',
          array['Individual Counselling'], array['Academic'],
          'I have fallen behind after missing classes and would like help planning the rest of the semester.')"

as anon '' "$NEW_ROW" && ok 'anon cannot insert a request' fail 'insert succeeded' \
                      || ok 'anon cannot insert a request' pass
as anon '' "select * from public.counselling_requests" && ok 'anon cannot read requests' fail 'select succeeded' \
                      || ok 'anon cannot read requests' pass

if as service_role '' "$NEW_ROW"; then
  ok 'service_role (edge function) can insert' pass
else
  ok 'service_role (edge function) can insert' fail
fi

assert_eq 'Reference code is generated by the database' 't' \
  "select reference_code ~ '^CR-[0-9]{4}-[0-9]{4}\$' from public.counselling_requests limit 1"
assert_eq 'Channel defaults to Online' 'Online' \
  "select channel from public.counselling_requests limit 1"
assert_eq 'Status defaults to New' 'New' \
  "select status from public.counselling_requests limit 1"

# --------------------------------------------------------------------------
# Read path: active counsellors only
# --------------------------------------------------------------------------
got="$(as_val authenticated "$COUNSELLOR" 'select count(*) from public.counselling_requests')"
[ "$got" = 1 ] && ok 'A counsellor reads the queue' pass || ok 'A counsellor reads the queue' fail "saw $got rows"

got="$(as_val authenticated "$OUTSIDER" 'select count(*) from public.counselling_requests')"
[ "$got" = 0 ] && ok 'A signed-in non-counsellor sees nothing' pass \
               || ok 'A signed-in non-counsellor sees nothing' fail "saw $got rows"

sql "update public.counsellor_profiles set active=false where user_id='$COUNSELLOR';"
got="$(as_val authenticated "$COUNSELLOR" 'select count(*) from public.counselling_requests')"
[ "$got" = 0 ] && ok 'A deactivated counsellor loses access' pass \
               || ok 'A deactivated counsellor loses access' fail "saw $got rows"
sql "update public.counsellor_profiles set active=true where user_id='$COUNSELLOR';"

# --------------------------------------------------------------------------
# Update path: office-use fields only
# --------------------------------------------------------------------------
if as authenticated "$COUNSELLOR" "update public.counselling_requests
     set status='Under Review', appointment_at=now(), reference_source='TTO/Lecturer',
         assigned_counsellor_id='$COUNSELLOR', office_notes='Booked a first session.'"; then
  ok 'A counsellor updates the office-use fields' pass
else
  ok 'A counsellor updates the office-use fields' fail
fi

as authenticated "$COUNSELLOR" "update public.counselling_requests set description='rewritten'" \
  && ok "A counsellor cannot rewrite the student's description" fail 'update succeeded' \
  || ok "A counsellor cannot rewrite the student's description" pass

as authenticated "$COUNSELLOR" "update public.counselling_requests set student_name='Someone Else'" \
  && ok 'A counsellor cannot rewrite the student name' fail 'update succeeded' \
  || ok 'A counsellor cannot rewrite the student name' pass

# A policy that filters rows makes these statements affect nothing rather than
# raise, so both are asserted on the data afterwards, not on the exit status.
as authenticated "$OUTSIDER" "update public.counselling_requests set status='Completed'"
assert_eq 'A non-counsellor cannot update a request' 'Under Review' \
  "select status from public.counselling_requests limit 1"

as authenticated "$COUNSELLOR" "delete from public.counselling_requests"
assert_eq 'A counsellor cannot delete a request' '1' \
  "select count(*) from public.counselling_requests"

as anon '' "delete from public.counselling_requests"
assert_eq 'anon cannot delete a request' '1' \
  "select count(*) from public.counselling_requests"

assert_eq 'updated_at moved on the office update' 't' \
  "select updated_at > submitted_at from public.counselling_requests limit 1"

# --------------------------------------------------------------------------
# Field rules, enforced in the database as well as the edge function
# --------------------------------------------------------------------------
bad() { # name, column-overrides
  as service_role '' "insert into public.counselling_requests
    (request_type, student_name, student_id, semester, contact_no, email,
     purposes, issues, description $3)
    values ('Request','Test Student','STU20240001','1','0123456789',
            'test.student@student.university.demo',
            $2,
            'A description long enough to clear the minimum length rule.' $4)" \
    && ok "$1" fail 'insert was allowed' || ok "$1" pass
}

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Request','T S','STU1','1','0123456789','t@s.demo', array[]::text[], array['Academic'],
          'A description long enough to clear the minimum length rule.')" \
  && ok 'At least one purpose is required' fail 'insert was allowed' \
  || ok 'At least one purpose is required' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Request','T S','STU1','1','0123456789','t@s.demo', array['Astrology'], array['Academic'],
          'A description long enough to clear the minimum length rule.')" \
  && ok 'Purposes outside the printed list are rejected' fail 'insert was allowed' \
  || ok 'Purposes outside the printed list are rejected' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Request','T S','STU1','1','0123456789','t@s.demo', array['Other'], array['Academic'],
          'A description long enough to clear the minimum length rule.')" \
  && ok 'Purpose \"Other\" without its text is rejected' fail 'insert was allowed' \
  || ok 'Purpose \"Other\" without its text is rejected' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, issue_other, description)
  values ('Request','T S','STU1','1','0123456789','t@s.demo', array['Guidance'], array['Academic'], 'Housing',
          'A description long enough to clear the minimum length rule.')" \
  && ok 'Issue text without \"Other\" ticked is rejected' fail 'insert was allowed' \
  || ok 'Issue text without \"Other\" ticked is rejected' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Request','T S','STU1','1','0123456789','not-an-email', array['Guidance'], array['Academic'],
          'A description long enough to clear the minimum length rule.')" \
  && ok 'A malformed email is rejected' fail 'insert was allowed' \
  || ok 'A malformed email is rejected' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Request','T S','STU1','1','0123456789','t@s.demo', array['Guidance'], array['Academic'], 'too short')" \
  && ok 'A one-line description is rejected' fail 'insert was allowed' \
  || ok 'A one-line description is rejected' pass

as service_role '' "insert into public.counselling_requests
  (request_type, student_name, student_id, semester, contact_no, email, purposes, issues, description)
  values ('Enquiry','T S','STU1','1','0123456789','t@s.demo', array['Guidance'], array['Academic'],
          'A description long enough to clear the minimum length rule.')" \
  && ok 'An unknown request type is rejected' fail 'insert was allowed' \
  || ok 'An unknown request type is rejected' pass

# --------------------------------------------------------------------------
# Throttle
# --------------------------------------------------------------------------
got="$(val "select public.register_submission_attempt('hash-a', 3)")"
[ "$got" = t ] && ok 'First submission from an address is allowed' pass \
               || ok 'First submission from an address is allowed' fail "got '$got'"
val "select public.register_submission_attempt('hash-a', 3)" >/dev/null
val "select public.register_submission_attempt('hash-a', 3)" >/dev/null
got="$(val "select public.register_submission_attempt('hash-a', 3)")"
[ "$got" = f ] && ok 'The fourth submission in an hour is throttled' pass \
               || ok 'The fourth submission in an hour is throttled' fail "got '$got'"
got="$(val "select public.register_submission_attempt('hash-b', 3)")"
[ "$got" = t ] && ok 'The throttle is per address, not global' pass \
               || ok 'The throttle is per address, not global' fail "got '$got'"
assert_eq 'No raw address is stored by the throttle' '0' \
  "select count(*) from public.submission_throttle where ip_hash like '%.%.%.%'"

# --------------------------------------------------------------------------
# Counsellor registration
#
# The gate is handle_new_counsellor(): a new auth user becomes an active
# counsellor only when its insert carried app_metadata.counsellor_approved,
# which only a service-role caller — the register-counsellor function — can
# set. Everything below is asserted by inserting into auth.users the way each
# caller would, rather than by reading the function's source.
# --------------------------------------------------------------------------
assert_eq 'The student registration table is gone' 'f' \
  "select exists(select 1 from pg_tables where schemaname='public' and tablename='registrations')"

# The gate function is not a PostgREST endpoint. is_counsellor() has to stay
# executable: the policies call it as the querying role, and revoking it stops
# every policy matching.
assert_eq 'Nobody can call the gate function over RPC' 'f' \
  "select bool_or(has_function_privilege(r, 'public.handle_new_counsellor()', 'execute'))
     from unnest(array['anon','authenticated','public']) as r"
assert_eq 'A counsellor can still call is_counsellor()' 't' \
  "select has_function_privilege('authenticated', 'public.is_counsellor()', 'execute')"
assert_eq 'anon holds no privilege on counsellor profiles' '0' \
  "select count(*) from information_schema.role_table_grants
    where grantee='anon' and table_name='counsellor_profiles'"

assert_eq 'An approved sign-up is an active counsellor' 't' \
  "select active from public.counsellor_profiles where user_id='$COUNSELLOR'"
assert_eq 'The staff ID the function sent is stored' 'STAFF2041' \
  "select staff_id from public.counsellor_profiles where user_id='$COUNSELLOR'"
assert_eq 'The phone number the function sent is stored' '+60123456789' \
  "select phone from public.counsellor_profiles where user_id='$COUNSELLOR'"

# A stranger posting straight to /auth/v1/signup: no app_metadata, so no
# approval. Public sign-up is enabled on the project, so this is the case that
# matters most.
STRANGER='33333333-3333-4333-8333-333333333333'
sql "insert into auth.users (id, email, raw_user_meta_data)
     values ('$STRANGER', 'stranger@example.com',
             '{\"full_name\":\"Opportunist Smith\",\"staff_id\":\"STAFF2041\",\"phone\":\"+60100000000\"}'::jsonb);"

assert_eq 'An unapproved sign-up still gets a profile row' '1' \
  "select count(*) from public.counsellor_profiles where user_id='$STRANGER'"
assert_eq 'An unapproved sign-up is not active' 'f' \
  "select active from public.counsellor_profiles where user_id='$STRANGER'"
assert_eq 'An unapproved sign-up cannot claim a staff ID' '' \
  "select coalesce(staff_id, '') from public.counsellor_profiles where user_id='$STRANGER'"
assert_eq 'An unapproved sign-up cannot claim a phone number' '' \
  "select coalesce(phone, '') from public.counsellor_profiles where user_id='$STRANGER'"

got="$(as_val authenticated "$STRANGER" 'select count(*) from public.counselling_requests')"
[ "$got" = 0 ] && ok 'An unapproved sign-up reads no student requests' pass \
               || ok 'An unapproved sign-up reads no student requests' fail "saw $got rows"

got="$(as_val authenticated "$STRANGER" 'select public.is_counsellor()')"
[ "$got" = f ] && ok 'is_counsellor() rejects an inactive profile' pass \
               || ok 'is_counsellor() rejects an inactive profile' fail "got '$got'"

as authenticated "$STRANGER" "update public.counsellor_profiles set active = true where user_id='$STRANGER'"
assert_eq 'An inactive account cannot approve itself' 'f' \
  "select active from public.counsellor_profiles where user_id='$STRANGER'"

# The path registration actually takes. GoTrue's admin API inserts the user
# first and applies app_metadata in a second write, so the trigger never sees
# counsellor_approved and leaves the row inactive; the edge function then
# PATCHes it as service_role. That is reproduced here in two steps, because a
# single insert with the flag already set is the one case production never hits.
FUNCPATH='66666666-6666-4666-8666-666666666666'
sql "insert into auth.users (id, email, raw_user_meta_data)
     values ('$FUNCPATH', 'via.function@counselling.demo',
             '{\"full_name\":\"Via Function\",\"staff_id\":\"STAFF3030\",\"phone\":\"+60123456711\"}'::jsonb);"
assert_eq 'A sign-up the trigger cannot vouch for starts inactive' 'f' \
  "select active from public.counsellor_profiles where user_id='$FUNCPATH'"
got="$(as_val authenticated "$FUNCPATH" 'select count(*) from public.counselling_requests')"
[ "$got" = 0 ] && ok 'And reads nothing in that state' pass \
               || ok 'And reads nothing in that state' fail "saw $got rows"

# What the function does next, with the service-role key.
as service_role '' "update public.counsellor_profiles
   set active = true, staff_id = 'STAFF3030', phone = '+60123456711'
   where user_id='$FUNCPATH'" \
  && ok 'The function can admit them' pass || ok 'The function can admit them' fail 'update refused'

assert_eq 'The staff ID is stored by that write' 'STAFF3030' \
  "select staff_id from public.counsellor_profiles where user_id='$FUNCPATH'"
got="$(as_val authenticated "$FUNCPATH" 'select count(*) from public.counselling_requests')"
[ -n "$got" ] && [ "$got" != 0 ] && ok 'And then they read the queue' pass \
                                 || ok 'And then they read the queue' fail "saw '$got' rows"

# Junk in user_metadata must not abort the sign-up: GoTrue can only report a
# trigger exception as an opaque 500, so bad values are dropped instead.
JUNK='44444444-4444-4444-8444-444444444444'
sql "insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
     values ('$JUNK', 'j@counselling.demo',
             '{\"full_name\":\"\",\"staff_id\":\"no\",\"phone\":\"012-3456789\"}'::jsonb,
             '{\"counsellor_approved\":true}'::jsonb);"
assert_eq 'A sign-up with junk metadata still creates the account' '1' \
  "select count(*) from public.counsellor_profiles where user_id='$JUNK'"
assert_eq 'A name too short to store falls back rather than failing' 'New counsellor' \
  "select full_name from public.counsellor_profiles where user_id='$JUNK'"
assert_eq 'A malformed staff ID is dropped, not stored' '' \
  "select coalesce(staff_id, '') from public.counsellor_profiles where user_id='$JUNK'"
assert_eq 'An unnormalised phone number is dropped, not stored' '' \
  "select coalesce(phone, '') from public.counsellor_profiles where user_id='$JUNK'"

# Two counsellors cannot hold one staff ID.
sql "update public.counsellor_profiles set staff_id='STAFF9999' where user_id='$JUNK';"
got="$($PSQL -c "update public.counsellor_profiles set staff_id='STAFF2041' where user_id='$JUNK';" 2>&1)"
case "$got" in
  *duplicate*|*unique*) ok 'A staff ID cannot be taken twice' pass ;;
  *)                    ok 'A staff ID cannot be taken twice' fail "$got" ;;
esac

# The CHECK constraints, which are the server-side half of the form's rules.
bad_profile() { # name, column, value
  got="$($PSQL -c "update public.counsellor_profiles set $2='$3' where user_id='$JUNK';" 2>&1)"
  case "$got" in
    *violates\ check\ constraint*) ok "$1" pass ;;
    *)                              ok "$1" fail "accepted '$3'" ;;
  esac
}
bad_profile 'A lower-case staff ID is rejected'          staff_id 'staff2041'
bad_profile 'A three-character staff ID is rejected'     staff_id 'ST5'
bad_profile 'A staff ID with a hyphen is rejected'       staff_id 'STAFF-2041'
bad_profile 'A staff ID with a space is rejected'        staff_id 'STAFF 204'
bad_profile 'An unnormalised phone number is rejected'   phone    '012-3456789'
bad_profile 'A non-Malaysian phone number is rejected'   phone    '+442071234567'
bad_profile 'A phone number that is too short is rejected' phone  '+6012345'

assert_eq 'A counsellor sees a colleague in the roster' '4' \
  "select count(*) from public.counsellor_profiles"
got="$(as_val authenticated "$COUNSELLOR" 'select count(*) from public.counsellor_profiles')"
[ "$got" = 4 ] && ok 'An active counsellor reads the whole roster' pass \
               || ok 'An active counsellor reads the whole roster' fail "saw $got rows"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
