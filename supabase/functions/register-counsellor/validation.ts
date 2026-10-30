/**
 * validation.ts — the counsellor registration rules, as a module with no Deno
 * or network dependency so tests/registration-checks.mjs can import it
 * directly.
 *
 * These rules are the authority. js/registration-rules.js repeats them in the
 * browser for a quick, kind error message, and the CHECK constraints on
 * counsellor_profiles repeat the structural ones. Neither is trusted here.
 *
 * tests/registration-checks.mjs fails if this file and
 * js/registration-rules.js drift apart.
 */

export const LIMITS = {
  full_name: [2, 120],
  staff_id: [4, 20],
  email: [5, 254],
  password: [8, 72]
};

/**
 * Letters from any script, because a counsellor here may well write their
 * name with accents or in Chinese characters. counsellor_profiles.full_name
 * constrains only the length, so this adds no rule the database contradicts.
 */
const NAME_SHAPE = /^\p{L}[\p{L}\p{M}'. -]*$/u;

/** Mirrors counsellor_profiles_staff_id_shape, after upper-casing. */
const STAFF_ID_SHAPE = /^[A-Z0-9]{4,20}$/;

/** Mirrors counsellor_profiles_phone_shape, after normalisation. */
const PHONE_SHAPE = /^\+60[0-9]{8,11}$/;

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * A Malaysian number as anyone writes it, turned into one shape.
 *
 *   012-3456789  0123456789  +60123456789  60123456789  →  +60123456789
 *
 * Returns '' when what is left cannot be a Malaysian number, which the caller
 * reports as an invalid phone rather than guessing at a correction.
 */
export function normalisePhone(raw: unknown): string {
  const value = text(raw);
  if (!value) return '';

  const digits = value.replace(/[^0-9]/g, '');
  let national: string;

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
 * `true` when the payload carries a filled honeypot. No counsellor can see
 * the field, so anything in it came from a bot. The caller answers with an
 * ordinary success, which tells the bot nothing.
 */
export function looksAutomated(raw: Record<string, unknown>): boolean {
  return text(raw.website).length > 0;
}

type Ok = {
  ok: true;
  value: { full_name: string; staff_id: string; phone: string; email: string; password: string };
};
type Bad = { ok: false; errors: Record<string, string> };

/**
 * Validates and normalises one registration.
 *
 * Error keys are the form's own field names, so the page can put each message
 * beside the control it belongs to.
 */
export function validateRegistration(raw: unknown): Ok | Bad {
  const errors: Record<string, string> = {};

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { form: 'The registration could not be read.' } };
  }
  const input = raw as Record<string, unknown>;

  /* Full name ----------------------------------------------------------- */
  const fullName = text(input.full_name).replace(/\s+/g, ' ');
  const [nameMin, nameMax] = LIMITS.full_name;
  if (!fullName) {
    errors.full_name = 'Enter your full name.';
  } else if (fullName.length < nameMin || fullName.length > nameMax) {
    errors.full_name = `Your name should be between ${nameMin} and ${nameMax} characters.`;
  } else if (!NAME_SHAPE.test(fullName)) {
    errors.full_name = 'Use letters, spaces, hyphens, apostrophes and dots only.';
  }

  /* Staff ID ------------------------------------------------------------ */
  const staffId = text(input.staff_id).toUpperCase();
  const [idMin, idMax] = LIMITS.staff_id;
  if (!staffId) {
    errors.staff_id = 'Enter your staff ID.';
  } else if (!STAFF_ID_SHAPE.test(staffId)) {
    errors.staff_id = `Your staff ID should be ${idMin} to ${idMax} letters and numbers, with no spaces.`;
  }

  /* Phone --------------------------------------------------------------- */
  const phone = normalisePhone(input.phone);
  if (!text(input.phone)) {
    errors.phone = 'Enter a phone number we can reach you on.';
  } else if (!phone) {
    errors.phone = 'Enter a Malaysian number, for example 012-3456789.';
  }

  /* Email --------------------------------------------------------------- */
  const email = text(input.email).toLowerCase();
  const [mailMin, mailMax] = LIMITS.email;
  if (!email) {
    errors.email = 'Enter your email address.';
  } else if (email.length < mailMin || email.length > mailMax || !EMAIL_SHAPE.test(email)) {
    errors.email = 'Enter an email address in the form name@example.com.';
  }

  /* Password ------------------------------------------------------------ */
  // Not trimmed: a space is a legitimate character in a password, and
  // trimming one away would lock the counsellor out of the account they just
  // made. Only its presence is checked as a string.
  const password = typeof input.password === 'string' ? input.password : '';
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

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: { full_name: fullName, staff_id: staffId, phone, email, password }
  };
}
