/**
 * validation.ts — the submission rules, as a module with no Deno or network
 * dependency so they can be exercised directly by tests/validation-checks.mjs.
 *
 * These rules are the authority. The browser repeats them for a quick, kind
 * error message; the database repeats the structural ones as CHECK
 * constraints. Nothing here trusts anything the client sent.
 *
 * The three lists below must stay identical to the constants exported from
 * js/data.js. tests/validation-checks.mjs fails if they drift apart.
 */

export const REQUEST_TYPES = ['Request', 'Referral'];

export const PURPOSES = [
  'Individual Counselling',
  'Group Counselling',
  'Guidance',
  'Psychometric Test',
  'Other'
];

export const ISSUES = [
  'Academic',
  'Health',
  'Personal',
  'Career',
  'Relationship',
  'Further Study',
  'Finance',
  'Other'
];

/** Matches the CHECK constraint on counselling_requests.email. */
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

/** Anything a phone number may be written with. */
const PHONE_SHAPE = /^[0-9+().\-\s]+$/;

export const LIMITS = {
  student_name: [2, 120],
  student_id: [3, 32],
  semester: [1, 32],
  contact_no: [7, 32],
  email: [5, 254],
  other: [2, 120],
  description: [20, 4000]
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * `true` when the payload carries a filled honeypot. Real students never see
 * the field, so anything in it came from a bot. The caller answers with an
 * ordinary success rather than an error, which tells the bot nothing.
 */
export function looksAutomated(raw: Record<string, unknown>): boolean {
  return text(raw.website).length > 0;
}

type Ok = { ok: true; value: Record<string, unknown> };
type Bad = { ok: false; errors: Record<string, string> };

/**
 * Validates and normalises one submission.
 *
 * Error keys are the form's own field names, so the page can put each message
 * beside the control it belongs to.
 */
export function validateSubmission(raw: unknown): Ok | Bad {
  const errors: Record<string, string> = {};

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { form: 'The submission could not be read.' } };
  }
  const input = raw as Record<string, unknown>;

  /* Section A ----------------------------------------------------------- */
  const requestType = text(input.request_type);
  if (!requestType) {
    errors.request_type = 'Choose whether this is a request or a referral.';
  } else if (!REQUEST_TYPES.includes(requestType)) {
    errors.request_type = 'Choose either Request or Referral.';
  }

  /* Section B ----------------------------------------------------------- */
  const studentName = text(input.student_name);
  if (!studentName) errors.student_name = 'Enter your full name.';
  else if (!inRange(studentName, LIMITS.student_name)) {
    errors.student_name = `Your name must be between ${LIMITS.student_name[0]} and ${LIMITS.student_name[1]} characters.`;
  }

  const studentId = text(input.student_id);
  if (!studentId) errors.student_id = 'Enter your student ID.';
  else if (!inRange(studentId, LIMITS.student_id)) {
    errors.student_id = `Your student ID must be between ${LIMITS.student_id[0]} and ${LIMITS.student_id[1]} characters.`;
  }

  const semester = text(input.semester);
  if (!semester) errors.semester = 'Enter your current semester.';
  else if (!inRange(semester, LIMITS.semester)) errors.semester = 'Enter your semester, for example 3.';

  const contactNo = text(input.contact_no);
  if (!contactNo) {
    errors.contact_no = 'Enter a contact number.';
  } else if (!PHONE_SHAPE.test(contactNo) || digitsIn(contactNo) < 7) {
    errors.contact_no = 'Enter a contact number we can reach you on, for example 012-345 6789.';
  } else if (!inRange(contactNo, LIMITS.contact_no)) {
    errors.contact_no = 'That contact number is too long.';
  }

  const email = text(input.email);
  if (!email) errors.email = 'Enter your email address.';
  else if (!EMAIL.test(email) || !inRange(email, LIMITS.email)) {
    errors.email = 'Enter an email address in the form name@example.com.';
  }

  /* Section C ----------------------------------------------------------- */
  const purposes = cleanList(input.purposes, PURPOSES);
  if (!purposes.length) errors.purposes = 'Choose at least one purpose.';

  const purposeOther = text(input.purpose_other);
  if (purposes.includes('Other') && !purposeOther) {
    errors.purpose_other = 'Tell us briefly what the other purpose is.';
  } else if (purposes.includes('Other') && !inRange(purposeOther, LIMITS.other)) {
    errors.purpose_other = `Keep this between ${LIMITS.other[0]} and ${LIMITS.other[1]} characters.`;
  }

  /* Section D ----------------------------------------------------------- */
  const issues = cleanList(input.issues, ISSUES);
  if (!issues.length) errors.issues = 'Choose at least one type of issue.';

  const issueOther = text(input.issue_other);
  if (issues.includes('Other') && !issueOther) {
    errors.issue_other = 'Tell us briefly what the other issue is.';
  } else if (issues.includes('Other') && !inRange(issueOther, LIMITS.other)) {
    errors.issue_other = `Keep this between ${LIMITS.other[0]} and ${LIMITS.other[1]} characters.`;
  }

  /* Brief description --------------------------------------------------- */
  const description = text(input.description);
  if (!description) {
    errors.description = 'Tell us briefly what prompted this request.';
  } else if (description.length < LIMITS.description[0]) {
    errors.description = 'Please add a little more, so a counsellor knows how to help.';
  } else if (description.length > LIMITS.description[1]) {
    errors.description = `Please keep this under ${LIMITS.description[1]} characters.`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  // Built key by key rather than spread, so no office-use field, no status and
  // no id can ride in on the payload.
  return {
    ok: true,
    value: {
      request_type: requestType,
      channel: 'Online',
      student_name: studentName,
      student_id: studentId,
      semester,
      contact_no: contactNo,
      email,
      purposes,
      purpose_other: purposes.includes('Other') ? purposeOther : null,
      issues,
      issue_other: issues.includes('Other') ? issueOther : null,
      description
    }
  };
}

function inRange(value: string, [min, max]: number[]): boolean {
  return value.length >= min && value.length <= max;
}

function digitsIn(value: string): number {
  return (value.match(/\d/g) || []).length;
}

/** Keeps only known values, in the order the printed form lists them. */
function cleanList(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter(item => typeof item === 'string').map(item => item.trim()));
  return allowed.filter(option => chosen.has(option));
}
