/**
 * registration-rules.js — what the counsellor registration form accepts.
 *
 * A plain module: no DOM, no network, no imports, so tests can exercise the
 * rules directly and the page can stay about presentation.
 *
 * These rules mirror supabase/functions/register-counsellor/validation.ts,
 * which is the authority — the form is a courtesy that saves a round trip and
 * puts the message beside the field. Anything that passes here is checked
 * again on the server, and the structural rules are checked a third time by
 * the CHECK constraints on counsellor_profiles.
 * tests/registration-checks.mjs fails if the two files drift apart.
 *
 * One rule here has no counterpart on the server: confirm_password. It exists
 * so a typo cannot lock a counsellor out of the account they just made, and
 * the second copy is never sent anywhere.
 *
 * There is no code or invitation to check. Registration is open to whoever
 * holds the link; see the note at the top of the edge function.
 */

export const LIMITS = {
  full_name: [2, 120],
  staff_id: [4, 20],
  email: [5, 254],
  password: [8, 72]
};

/**
 * Letters from any script, because a counsellor here may well write their
 * name with accents or in Chinese characters.
 */
const NAME_SHAPE = /^\p{L}[\p{L}\p{M}'. -]*$/u;
const STAFF_ID_SHAPE = /^[A-Z0-9]{4,20}$/;
const PHONE_SHAPE = /^\+60[0-9]{8,11}$/;
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

const text = value => (typeof value === 'string' ? value.trim() : '');

/**
 * A Malaysian number as anyone writes it, turned into one shape.
 *
 *   012-3456789  0123456789  +60123456789  60123456789  →  +60123456789
 *
 * Returns '' when what is left cannot be a Malaysian number, so the form
 * reports an invalid number rather than guessing at a correction.
 */
export function normalisePhone(raw) {
  const value = text(raw);
  if (!value) return '';

  const digits = value.replace(/[^0-9]/g, '');
  let national;

  if (value.trimStart().startsWith('+')) {
    // An explicit country code must be Malaysia's; +65… is a real number
    // somewhere else, and silently rewriting it would be worse than refusing.
    if (!digits.startsWith('60')) return '';
    national = digits.slice(2);
  } else if (digits.startsWith('60') && digits.length >= 10) {
    national = digits.slice(2);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  const candidate = `+60${national}`;
  return PHONE_SHAPE.test(candidate) ? candidate : '';
}

/**
 * Validates and normalises what the form holds.
 *
 * Returns `{ ok: true, value }` with the normalised fields ready to post, or
 * `{ ok: false, errors }` keyed by field name so each message can go beside
 * the control it belongs to.
 */
export function validateRegistration(raw = {}) {
  const errors = {};

  /* Full name ----------------------------------------------------------- */
  const fullName = text(raw.full_name).replace(/\s+/g, ' ');
  const [nameMin, nameMax] = LIMITS.full_name;
  if (!fullName) {
    errors.full_name = 'Enter your full name.';
  } else if (fullName.length < nameMin || fullName.length > nameMax) {
    errors.full_name = `Your name should be between ${nameMin} and ${nameMax} characters.`;
  } else if (!NAME_SHAPE.test(fullName)) {
    errors.full_name = 'Use letters, spaces, hyphens, apostrophes and dots only.';
  }

  /* Staff ID ------------------------------------------------------------ */
  const staffId = text(raw.staff_id).toUpperCase();
  const [idMin, idMax] = LIMITS.staff_id;
  if (!staffId) {
    errors.staff_id = 'Enter your staff ID.';
  } else if (!STAFF_ID_SHAPE.test(staffId)) {
    errors.staff_id = `Your staff ID should be ${idMin} to ${idMax} letters and numbers, with no spaces.`;
  }

  /* Phone --------------------------------------------------------------- */
  const phone = normalisePhone(raw.phone);
  if (!text(raw.phone)) {
    errors.phone = 'Enter a phone number we can reach you on.';
  } else if (!phone) {
    errors.phone = 'Enter a Malaysian number, for example 012-3456789.';
  }

  /* Email --------------------------------------------------------------- */
  const email = text(raw.email).toLowerCase();
  const [mailMin, mailMax] = LIMITS.email;
  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (email.length < mailMin || email.length > mailMax || !EMAIL_SHAPE.test(email)) {
    errors.email = 'Enter an email address in the form name@example.com.';
  }

  /* Password ------------------------------------------------------------ */
  // Never trimmed: a space is a legitimate character in a password, and
  // trimming one away here would mean the password that was stored is not the
  // password that was typed.
  const password = typeof raw.password === 'string' ? raw.password : '';
  const [pwMin, pwMax] = LIMITS.password;
  if (!password) {
    errors.password = 'Choose a password.';
  } else if (password.length < pwMin) {
    errors.password = `Use at least ${pwMin} characters.`;
  } else if (password.length > pwMax) {
    errors.password = `Use at most ${pwMax} characters.`;
  } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Include at least one letter and one number.';
  }

  const confirm = typeof raw.confirm_password === 'string' ? raw.confirm_password : '';
  if (!errors.password) {
    if (!confirm) {
      errors.confirm_password = 'Type your password again.';
    } else if (confirm !== password) {
      errors.confirm_password = 'The two passwords are not the same.';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      full_name: fullName,
      staff_id: staffId,
      phone,
      email,
      password
    }
  };
}
