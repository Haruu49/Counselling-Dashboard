/**
 * tests/validation-checks.mjs — the edge function's submission rules.
 *
 * validation.ts is the authority on what a valid submission is, so it is
 * exercised directly here rather than through a deployed function. Node 22.6+
 * strips the type annotations on import, so no build step is involved:
 *
 *   node tests/validation-checks.mjs
 *
 * Exits non-zero if any check fails.
 */

import {
  validateSubmission, looksAutomated,
  REQUEST_TYPES, PURPOSES, ISSUES, LIMITS
} from '../supabase/functions/submit-counselling-request/validation.ts';

import * as options from '../js/form-options.js';

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

/** A submission with nothing wrong with it. Each test bends one thing. */
const valid = () => ({
  request_type: 'Request',
  student_name: 'Nadia Yusuf',
  student_id: 'STU20241234',
  semester: '3',
  contact_no: '012-345 6789',
  email: 'nadia.yusuf@student.university.demo',
  purposes: ['Individual Counselling'],
  issues: ['Academic'],
  description: 'I have fallen behind after missing classes and would like help planning the rest of the semester.'
});

const withField = (field, value) => ({ ...valid(), [field]: value });

const rejects = (name, field, value, expectedKey = field) => {
  const result = validateSubmission(withField(field, value));
  ok(name, result.ok === false && expectedKey in (result.errors ?? {}),
    result.ok ? 'accepted' : `errors: ${Object.keys(result.errors).join(', ')}`);
};

/* ------------------------------------------------------------------ *
 * The lists must match the browser's copy
 * ------------------------------------------------------------------ */

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

ok('Request types match js/form-options.js', same(REQUEST_TYPES, options.REQUEST_TYPES),
  `${REQUEST_TYPES} vs ${options.REQUEST_TYPES}`);
ok('Purposes match js/form-options.js', same(PURPOSES, options.COUNSELLING_PURPOSES),
  `${PURPOSES} vs ${options.COUNSELLING_PURPOSES}`);
ok('Issues match js/form-options.js', same(ISSUES, options.COUNSELLING_ISSUES),
  `${ISSUES} vs ${options.COUNSELLING_ISSUES}`);
ok('Length limits match js/form-options.js',
  JSON.stringify(LIMITS) === JSON.stringify(options.LIMITS),
  `${JSON.stringify(LIMITS)} vs ${JSON.stringify(options.LIMITS)}`);

/* ------------------------------------------------------------------ *
 * The happy path
 * ------------------------------------------------------------------ */

const accepted = validateSubmission(valid());
ok('A complete submission is accepted', accepted.ok === true,
  accepted.ok ? '' : JSON.stringify(accepted.errors));

if (accepted.ok) {
  ok('Channel is forced to Online', accepted.value.channel === 'Online', String(accepted.value.channel));
  ok('Values are trimmed', validateSubmission(withField('student_name', '  Nadia Yusuf  ')).value.student_name === 'Nadia Yusuf');
  ok('Unused "other" text is dropped',
    accepted.value.purpose_other === null && accepted.value.issue_other === null);
}

/* ------------------------------------------------------------------ *
 * Office-use fields can never ride in on the payload
 * ------------------------------------------------------------------ */

const smuggled = validateSubmission({
  ...valid(),
  id: '00000000-0000-4000-8000-000000000000',
  reference_code: 'CR-1999-0001',
  status: 'Completed',
  channel: 'Walk In',
  appointment_at: '2026-01-01T09:00:00Z',
  assigned_counsellor_id: '11111111-1111-4111-8111-111111111111',
  reference_source: 'HOD/HOS',
  office_notes: 'injected',
  submitted_at: '1999-01-01T00:00:00Z'
});

ok('A payload carrying office-use fields is still accepted', smuggled.ok === true);
if (smuggled.ok) {
  const keys = Object.keys(smuggled.value);
  const forbidden = ['id', 'reference_code', 'status', 'appointment_at',
    'assigned_counsellor_id', 'reference_source', 'office_notes', 'submitted_at'];
  ok('None of the office-use fields survive validation',
    forbidden.every(key => !keys.includes(key)),
    keys.join(', '));
  ok('A supplied channel is overwritten with Online', smuggled.value.channel === 'Online',
    String(smuggled.value.channel));
}

/* ------------------------------------------------------------------ *
 * Required fields
 * ------------------------------------------------------------------ */

rejects('Missing request type is rejected', 'request_type', '');
rejects('Unknown request type is rejected', 'request_type', 'Enquiry');
rejects('Missing name is rejected', 'student_name', '');
rejects('Whitespace-only name is rejected', 'student_name', '    ');
rejects('One-character name is rejected', 'student_name', 'N');
rejects('Over-long name is rejected', 'student_name', 'N'.repeat(121));
rejects('Missing student ID is rejected', 'student_id', '');
rejects('Missing semester is rejected', 'semester', '');
rejects('Missing contact number is rejected', 'contact_no', '');
rejects('Letters in a contact number are rejected', 'contact_no', 'call me');
rejects('A too-short contact number is rejected', 'contact_no', '12345');
rejects('Missing email is rejected', 'email', '');
rejects('A malformed email is rejected', 'email', 'nadia.yusuf@');
rejects('An email with no dot in the domain is rejected', 'email', 'nadia@localhost');
rejects('Missing description is rejected', 'description', '');
rejects('A one-line description is rejected', 'description', 'help');
rejects('An over-long description is rejected', 'description', 'x'.repeat(4001));

ok('A valid international number is accepted',
  validateSubmission(withField('contact_no', '+60 12-345 6789')).ok === true);

/* ------------------------------------------------------------------ *
 * Purposes and issues
 * ------------------------------------------------------------------ */

rejects('No purpose chosen is rejected', 'purposes', []);
rejects('A purpose that is not on the form is rejected', 'purposes', ['Astrology']);
rejects('Purposes sent as a string are rejected', 'purposes', 'Guidance');
rejects('No issue chosen is rejected', 'issues', []);
rejects('An issue that is not on the form is rejected', 'issues', ['Weather']);

ok('Several purposes are accepted',
  validateSubmission(withField('purposes', ['Guidance', 'Psychometric Test'])).ok === true);
ok('Several issues are accepted',
  validateSubmission(withField('issues', ['Academic', 'Finance', 'Career'])).ok === true);

const unordered = validateSubmission(withField('issues', ['Finance', 'Academic']));
ok('Choices come back in the order the printed form lists them',
  unordered.ok && unordered.value.issues.join() === 'Academic,Finance',
  unordered.ok ? unordered.value.issues.join() : '');

const duplicated = validateSubmission(withField('issues', ['Academic', 'Academic']));
ok('A repeated choice is counted once',
  duplicated.ok && duplicated.value.issues.length === 1,
  duplicated.ok ? String(duplicated.value.issues.length) : '');

/* ------------------------------------------------------------------ *
 * "Other"
 * ------------------------------------------------------------------ */

const purposeOtherEmpty = validateSubmission({ ...valid(), purposes: ['Other'] });
ok('Purpose "Other" without its text is rejected',
  !purposeOtherEmpty.ok && 'purpose_other' in purposeOtherEmpty.errors);

const purposeOtherGiven = validateSubmission({
  ...valid(), purposes: ['Other'], purpose_other: 'Exam access arrangements'
});
ok('Purpose "Other" with its text is accepted', purposeOtherGiven.ok === true);
ok('The "Other" text is kept',
  purposeOtherGiven.ok && purposeOtherGiven.value.purpose_other === 'Exam access arrangements');

const issueOtherEmpty = validateSubmission({ ...valid(), issues: ['Other'] });
ok('Issue "Other" without its text is rejected',
  !issueOtherEmpty.ok && 'issue_other' in issueOtherEmpty.errors);

const issueOtherUnticked = validateSubmission({ ...valid(), issue_other: 'Housing' });
ok('"Other" text without the box ticked is dropped rather than stored',
  issueOtherUnticked.ok && issueOtherUnticked.value.issue_other === null);

/* ------------------------------------------------------------------ *
 * Shape and spam
 * ------------------------------------------------------------------ */

ok('A non-object payload is rejected', validateSubmission('hello').ok === false);
ok('An array payload is rejected', validateSubmission([]).ok === false);
ok('A null payload is rejected', validateSubmission(null).ok === false);

ok('An empty honeypot reads as a person', looksAutomated({ website: '' }) === false);
ok('An absent honeypot reads as a person', looksAutomated({}) === false);
ok('A filled honeypot reads as a bot', looksAutomated({ website: 'http://spam.example' }) === true);

/* ------------------------------------------------------------------ *
 * Every message is something a student can act on
 * ------------------------------------------------------------------ */

const empty = validateSubmission({});
ok('An empty form reports every required field',
  !empty.ok && ['request_type', 'student_name', 'student_id', 'semester', 'contact_no', 'email',
    'purposes', 'issues', 'description'].every(key => key in empty.errors),
  empty.ok ? '' : Object.keys(empty.errors).join(', '));

ok('No message is empty or shouted',
  !empty.ok && Object.values(empty.errors).every(message =>
    message.length > 10 && message === message.trimEnd() && /[.?]$/.test(message)),
  empty.ok ? '' : JSON.stringify(empty.errors));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
