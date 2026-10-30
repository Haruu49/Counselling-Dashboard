/**
 * tests/registration-checks.mjs — the counsellor registration rules.
 *
 * registration-rules.js is pure, so it is exercised directly rather than
 * through a browser:
 *
 *   node tests/registration-checks.mjs
 *
 * The edge function is the authority on what a valid registration is and the
 * database has the last word on what can be stored, so the last two sections
 * re-read supabase/functions/register-counsellor/validation.ts and the
 * migration, and fail if any of the three have drifted apart.
 *
 * Exits non-zero if any check fails.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateRegistration, normalisePhone, LIMITS } from '../js/registration-rules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;

const ok = (name, condition, detail = '') => {
  if (condition) {
    console.log(`PASS  ${name}`);
    pass += 1;
  } else {
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ''}`);
    fail += 1;
  }
};

/** A registration with nothing wrong with it. Each check bends one thing. */
const valid = () => ({
  full_name: 'Nurul A\'in Rahman',
  staff_id: 'STAFF2041',
  phone: '012-3456789',
  email: 'nurul.ain@counselling.example.edu',
  password: 'Kaunseling2026',
  confirm_password: 'Kaunseling2026'
});

const check = patch => validateRegistration({ ...valid(), ...patch });

/* ------------------------------------------------------------------ *
 * The happy path
 * ------------------------------------------------------------------ */

const good = check({});
ok('A complete registration is accepted', good.ok, good.ok ? '' : JSON.stringify(good.errors));
ok('The phone number is normalised to +60 form',
  good.ok && good.value.phone === '+60123456789', good.ok ? good.value.phone : '');
const SENT = ['email', 'full_name', 'password', 'phone', 'staff_id'];
ok('Exactly the fields the function expects are returned',
  good.ok && Object.keys(good.value).sort().join() === SENT.join(),
  good.ok ? Object.keys(good.value).sort().join() : '');
ok('The second copy of the password is not sent anywhere',
  good.ok && !('confirm_password' in good.value));

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

ok('A staff ID is upper-cased', check({ staff_id: 'staff2041' }).value?.staff_id === 'STAFF2041');
ok('An email address is lower-cased',
  check({ email: 'Nurul.Ain@Counselling.Example.Edu' }).value?.email
    === 'nurul.ain@counselling.example.edu');
ok('Surrounding space is trimmed from the email',
  check({ email: '  nurul.ain@counselling.example.edu  ' }).value?.email
    === 'nurul.ain@counselling.example.edu');
ok('Repeated spaces in a name collapse to one',
  check({ full_name: 'Nurul    A\'in   Rahman' }).value?.full_name === 'Nurul A\'in Rahman');
ok('Surrounding space is trimmed from the staff ID',
  check({ staff_id: '  staff2041 ' }).value?.staff_id === 'STAFF2041');

// A password is the one field that must survive exactly as typed.
const spaced = check({ password: ' pass word 1 ', confirm_password: ' pass word 1 ' });
ok('A password is not trimmed', spaced.ok && spaced.value.password === ' pass word 1 ',
  spaced.ok ? JSON.stringify(spaced.value.password) : JSON.stringify(spaced.errors));

/* ------------------------------------------------------------------ *
 * Phone numbers
 * ------------------------------------------------------------------ */

[
  ['012-3456789', '+60123456789'],
  ['0123456789', '+60123456789'],
  ['+60123456789', '+60123456789'],
  ['60123456789', '+60123456789'],
  ['+60 12 345 6789', '+60123456789'],
  ['(012) 345 6789', '+60123456789'],
  ['011-23456789', '+601123456789'],
  ['03-12345678', '+60312345678']
].forEach(([input, expected]) => {
  ok(`${input} normalises to ${expected}`, normalisePhone(input) === expected, normalisePhone(input));
});

[
  ['+6512345678', 'a Singapore number is not rewritten as Malaysian'],
  ['12345', 'too few digits'],
  ['', 'nothing at all'],
  ['0121', 'a number that is too short'],
  ['012345678901234', 'a number that is too long'],
  ['not a phone', 'letters only']
].forEach(([input, why]) => {
  ok(`A phone number is refused: ${why}`, normalisePhone(input) === '', normalisePhone(input));
});

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

ok('A missing name is refused', !!check({ full_name: '' }).errors?.full_name);
ok('A one-letter name is refused', !!check({ full_name: 'A' }).errors?.full_name);
ok('An over-long name is refused',
  !!check({ full_name: 'A'.repeat(LIMITS.full_name[1] + 1) }).errors?.full_name);
ok('A name of exactly the maximum length is accepted',
  check({ full_name: 'A'.repeat(LIMITS.full_name[1]) }).ok);
ok('A name with digits in it is refused', !!check({ full_name: 'Nurul 2041' }).errors?.full_name);
ok('A name cannot start with punctuation', !!check({ full_name: '.Nurul' }).errors?.full_name);
ok('An apostrophe, hyphen and dot are allowed',
  check({ full_name: 'Siti A\'in binti Abdul-Rahman Jr.' }).ok);
ok('An accented name is allowed', check({ full_name: 'Zulkiflé Rahmân' }).ok);
ok('A name in Chinese characters is allowed', check({ full_name: '陳小明' }).ok);

/* ------------------------------------------------------------------ *
 * Staff IDs
 * ------------------------------------------------------------------ */

ok('A missing staff ID is refused', !!check({ staff_id: '' }).errors?.staff_id);
ok('A staff ID below the minimum length is refused',
  !!check({ staff_id: 'A'.repeat(LIMITS.staff_id[0] - 1) }).errors?.staff_id);
ok('A staff ID at the minimum length is accepted',
  check({ staff_id: 'A'.repeat(LIMITS.staff_id[0]) }).ok);
ok('A staff ID at the maximum length is accepted',
  check({ staff_id: 'A'.repeat(LIMITS.staff_id[1]) }).ok);
ok('A staff ID above the maximum length is refused',
  !!check({ staff_id: 'A'.repeat(LIMITS.staff_id[1] + 1) }).errors?.staff_id);
ok('A staff ID with a space in it is refused', !!check({ staff_id: 'STAFF 2041' }).errors?.staff_id);
ok('A staff ID with a hyphen in it is refused', !!check({ staff_id: 'STAFF-2041' }).errors?.staff_id);

/* ------------------------------------------------------------------ *
 * Email addresses
 * ------------------------------------------------------------------ */

ok('A missing email address is refused', !!check({ email: '' }).errors?.email);
ok('An address with no @ is refused', !!check({ email: 'nurul.counselling.edu' }).errors?.email);
ok('An address with no dot after the @ is refused', !!check({ email: 'nurul@counselling' }).errors?.email);
ok('An address with a space in it is refused', !!check({ email: 'nurul ain@x.edu' }).errors?.email);
ok('An address with two @ is refused', !!check({ email: 'a@b@c.edu' }).errors?.email);
ok('An over-long address is refused',
  !!check({ email: `${'a'.repeat(LIMITS.email[1])}@x.edu` }).errors?.email);

/* ------------------------------------------------------------------ *
 * Passwords
 *
 * The counsellor chooses this on the form, and there is no SMTP on the
 * project, so a password they cannot reproduce is an account nobody can
 * recover. That is why the second copy is compulsory.
 * ------------------------------------------------------------------ */

const pw = (password, confirm = password) => check({ password, confirm_password: confirm });

ok('A missing password is refused', !!pw('', '').errors?.password);
ok('A password below the minimum length is refused',
  !!pw('a1'.repeat(LIMITS.password[0] / 2 - 1)).errors?.password);
ok('A password at the minimum length is accepted', pw('abcdefg1').ok);
ok('A password of letters only is refused', !!pw('abcdefghij').errors?.password);
ok('A password of digits only is refused', !!pw('1234567890').errors?.password);
ok('A password above the maximum length is refused',
  !!pw(`a1${'x'.repeat(LIMITS.password[1])}`).errors?.password);
ok('The user\'s own test password would be accepted', pw('Ammar@0049').ok);

ok('Two different passwords are refused', !!pw('abcdefg1', 'abcdefg2').errors?.confirm_password);
ok('A missing second copy is refused', !!pw('abcdefg1', '').errors?.confirm_password);
ok('The second copy is not complained about while the first is already wrong',
  !pw('short', 'short').errors?.confirm_password,
  JSON.stringify(pw('short', 'short').errors));

/* ------------------------------------------------------------------ *
 * Nothing else is asked for
 *
 * Registration is open: there is no code, and a value sent under any other
 * name must not reach the account either.
 * ------------------------------------------------------------------ */

ok('A registration code is neither required nor accepted',
  check({ registration_code: 'anything-at-all' }).ok
  && !('registration_code' in check({ registration_code: 'x' }).value));
ok('An unknown field is dropped rather than passed on',
  !('role' in check({ role: 'admin' }).value)
  && !('active' in check({ active: true }).value));

/* ------------------------------------------------------------------ *
 * The messages themselves
 * ------------------------------------------------------------------ */

const empty = validateRegistration({});
ok('An empty form reports every field at once',
  !empty.ok && ['full_name', 'staff_id', 'phone', 'email', 'password']
    .every(field => field in empty.errors),
  empty.ok ? '' : Object.keys(empty.errors).join(', '));

ok('Every message is something a counsellor can act on',
  !empty.ok && Object.values(empty.errors).every(message =>
    message.length > 10 && message === message.trimEnd() && /[.?]$/.test(message)),
  empty.ok ? '' : JSON.stringify(empty.errors));

ok('No message names a column',
  !empty.ok && !Object.values(empty.errors).some(message => /_/.test(message)),
  empty.ok ? '' : JSON.stringify(empty.errors));

ok('No message quotes back what was typed',
  !check({ email: 'wrong-address' }).ok
    && !JSON.stringify(check({ email: 'wrong-address' }).errors).includes('wrong-address'));

/* ------------------------------------------------------------------ *
 * The page and the edge function agree
 *
 * The function is the authority: anything the page lets through is checked
 * again there. If a rule moves on one side only, a counsellor gets a flat
 * refusal from the server instead of a sentence beside the field.
 * ------------------------------------------------------------------ */

const server = readFileSync(
  join(ROOT, 'supabase/functions/register-counsellor/validation.ts'), 'utf8'
);

Object.entries(LIMITS).forEach(([field, [min, max]]) => {
  ok(`The ${field.replace('_', ' ')} limits match the function`,
    new RegExp(`${field}:\\s*\\[${min},\\s*${max}\\]`).test(server));
});

[
  ['name', "/^\\p{L}[\\p{L}\\p{M}'. -]*$/u"],
  ['staff ID', '/^[A-Z0-9]{4,20}$/'],
  ['phone', '/^\\+60[0-9]{8,11}$/'],
  ['email', '/^[^@\\s]+@[^@\\s]+\\.[a-zA-Z]{2,}$/']
].forEach(([what, pattern]) => {
  ok(`The ${what} pattern matches the function`, server.includes(pattern), pattern);
});

ok('The function asks for no code either', !server.includes('registration_code'));
ok('The function returns only the five values it stores',
  /value: \{ full_name: fullName, staff_id: staffId, phone, email, password \}/.test(server));
ok('The function does not trim passwords either',
  server.includes('// Not trimmed: a space is a legitimate character in a password'));

/* ------------------------------------------------------------------ *
 * The function and the database agree
 * ------------------------------------------------------------------ */

const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20261031090000_counsellor_registration.sql'), 'utf8'
);

ok('The staff ID pattern matches the migration',
  migration.includes(`^[A-Z0-9]{${LIMITS.staff_id[0]},${LIMITS.staff_id[1]}}$`));
ok('The phone pattern matches the migration', migration.includes('\\+60[0-9]{8,11}'));
ok('The migration keeps one staff ID per counsellor',
  /create unique index[^;]*counsellor_profiles \(staff_id\)/s.test(migration));
ok('The migration adds both new columns',
  migration.includes('add column if not exists staff_id') &&
  migration.includes('add column if not exists phone'));
ok('Only an approved sign-up becomes an active counsellor',
  migration.includes("raw_app_meta_data ->> 'counsellor_approved'") &&
  /active\b/.test(migration) && migration.includes('v_approved'));
ok('An unapproved sign-up keeps neither staff ID nor phone',
  /if not v_approved then\s*\n\s*v_staff_id := null;\s*\n\s*v_phone\s*:= null;/.test(migration));
ok('The trigger reads the details the function sends as user metadata',
  migration.includes("v_meta ->> 'full_name'") &&
  migration.includes("v_meta ->> 'staff_id'") &&
  migration.includes("v_meta ->> 'phone'"));
ok('The student registration table is gone',
  migration.includes('drop table if exists public.registrations'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
