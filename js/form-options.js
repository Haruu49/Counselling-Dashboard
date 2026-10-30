/**
 * form-options.js — the printed counselling form, GMI-RO-P04-F02, as data.
 *
 * Kept in its own module with no dependencies so the public student form can
 * import it without pulling in the dashboard's Supabase client.
 *
 * These values are repeated in three places that must agree:
 *   - here, for both browsers
 *   - supabase/functions/submit-counselling-request/validation.ts, on the server
 *   - the CHECK constraints in supabase/migrations/, in the database
 *
 * tests/validation-checks.mjs fails if this file and validation.ts drift apart.
 */

export const REQUEST_TYPES = ['Request', 'Referral'];

/**
 * How a request reached the office. The student form always records 'Online';
 * the rest exist so a counsellor can log a request that arrived another way.
 */
export const SUBMISSION_CHANNELS = ['Online', 'Walk In', 'Telephone', 'Email', 'Letter/Memo'];

export const COUNSELLING_PURPOSES = [
  'Individual Counselling',
  'Group Counselling',
  'Guidance',
  'Psychometric Test',
  'Other'
];

export const COUNSELLING_ISSUES = [
  'Academic',
  'Health',
  'Personal',
  'Career',
  'Relationship',
  'Further Study',
  'Finance',
  'Other'
];

/** Section E of the paper form — office use only, never shown to a student. */
export const REFERENCE_SOURCES = ['HOD/HOS', 'TTO/Lecturer', 'Friends', 'Family Member'];

/** Length bounds, matching validation.ts and the database constraints. */
export const LIMITS = {
  student_name: [2, 120],
  student_id: [3, 32],
  semester: [1, 32],
  contact_no: [7, 32],
  email: [5, 254],
  other: [2, 120],
  description: [20, 4000]
};
