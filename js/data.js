/**
 * data.js — demonstration dataset and data-access layer.
 *
 * This is the ONLY module that knows how records are shaped or stored.
 * Everything else asks for records through the async functions at the bottom
 * of this file, so Phase 2 can replace the bodies with Supabase queries
 * without touching a single rendering module.
 *
 * Conventions chosen to make that swap cheap:
 *   - Field names are snake_case, matching future PostgreSQL columns.
 *   - Every accessor is `async` and returns plain objects/arrays.
 *   - Individual student records and aggregate analytics are produced by
 *     separate functions (`listSubmissions` vs `getAnalytics`), so analytics
 *     can later become a database view or RPC call.
 *   - Records are returned as copies; callers cannot mutate the store.
 *
 * All names, identifiers and comments below are fictional.
 */

/* ------------------------------------------------------------------ *
 * Reference values (future: lookup tables)
 * ------------------------------------------------------------------ */

export const FORM_TYPES = [
  'Counselling Registration',
  'Wellbeing Assessment',
  'Counselling Feedback'
];

export const SUBMISSION_STATUSES = ['New', 'Under Review', 'Completed'];

export const REGISTRATION_STATUSES = ['New', 'Under Review', 'Scheduled', 'Completed'];

export const PROGRAMMES = [
  'Computer Science',
  'Business Administration',
  'Mechanical Engineering',
  'Psychology',
  'Nursing',
  'Law',
  'Architecture',
  'Accounting'
];

export const COUNSELLING_CATEGORIES = [
  'Academic Issues',
  'Stress',
  'Anxiety',
  'Family Issues',
  'Social Issues',
  'Personal Issues'
];

export const SESSION_TYPES = [
  'Individual Session',
  'Group Session',
  'Online Session',
  'Walk-in Session'
];

export const WELLBEING_BANDS = ['Good', 'Moderate', 'Needs Support'];

export const SATISFACTION_LEVELS = [
  'Very Satisfied',
  'Satisfied',
  'Neutral',
  'Dissatisfied'
];

/** The four 1–5 assessment measures, and which direction is favourable. */
export const ASSESSMENT_MEASURES = [
  { key: 'stress_level', label: 'Stress level', higher_is_better: false },
  { key: 'anxiety_level', label: 'Anxiety level', higher_is_better: false },
  { key: 'academic_pressure', label: 'Academic pressure', higher_is_better: false },
  { key: 'emotional_wellbeing', label: 'Emotional wellbeing', higher_is_better: true }
];

/* ------------------------------------------------------------------ *
 * Deterministic generator
 *
 * A seeded PRNG keeps the demonstration data identical on every reload,
 * so screenshots, counts and percentages stay stable while reviewing.
 * ------------------------------------------------------------------ */

function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = seededRandom(20260130);
const pick = list => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));

const FIRST_NAMES = [
  'Alya', 'Haziq', 'Mira', 'Daniel', 'Siti', 'Farid', 'Chloe', 'Imran',
  'Nadia', 'Kavin', 'Aminah', 'Wei Jie', 'Priya', 'Zulhilmi', 'Hannah',
  'Rajesh', 'Amirah', 'Jun Hao', 'Melissa', 'Tengku', 'Syafiq', 'Divya',
  'Adam', 'Yasmin', 'Marcus', 'Khairul', 'Shalini', 'Bryan', 'Nurul', 'Ethan'
];

const LAST_NAMES = [
  'Rahman', 'Tan', 'Ismail', 'Lim', 'Abdullah', 'Omar', 'Wong', 'Yusuf',
  'Hassan', 'Raj', 'Chong', 'Bakar', 'Menon', 'Ng', 'Salleh', 'Krishnan',
  'Aziz', 'Goh', 'Mahmud', 'Lee'
];

/** Comment bank for counselling feedback, keyed by satisfaction level. */
const FEEDBACK_COMMENTS = {
  'Very Satisfied': [
    'The counsellor listened carefully and I left with a clear plan for the semester.',
    'Booking was straightforward and the session started on time.',
    'I felt comfortable talking openly. The follow-up notes were helpful.',
    'Very practical advice on managing my study schedule.'
  ],
  Satisfied: [
    'Helpful session overall. I would have liked a little more time.',
    'Good conversation, though the room was a bit noisy.',
    'The counsellor understood my situation and suggested useful next steps.',
    'Useful, and I have booked a follow-up session.'
  ],
  Neutral: [
    'The session was fine but covered things I already knew.',
    'It helped a little. I am still deciding whether to continue.',
    'Reasonable advice, nothing that changed my situation yet.'
  ],
  Dissatisfied: [
    'I waited two weeks for an appointment and the time did not suit my classes.',
    'I did not feel the session addressed what I came in for.',
    'The appointment was rescheduled twice before it happened.'
  ]
};

const REGISTRATION_REASONS = {
  'Academic Issues': 'Struggling to keep up with coursework after missing classes.',
  Stress: 'Finding the workload before final examinations difficult to manage.',
  Anxiety: 'Feeling very anxious before presentations and group assessments.',
  'Family Issues': 'Family circumstances at home are affecting my studies.',
  'Social Issues': 'Having difficulty settling in and making friends on campus.',
  'Personal Issues': 'Would like to talk through a personal matter confidentially.'
};

const pad = (n, width) => String(n).padStart(width, '0');
const iso = date => date.toISOString();

/** Returns a date `monthsBack` months ago, on a plausible weekday. */
function dateInMonth(monthsBack) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const lastDay = monthsBack === 0
    ? now.getDate()
    : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(between(1, Math.max(1, lastDay)));
  // Pull weekend submissions onto the Friday — a campus service is weekday-shaped.
  if (d.getDay() === 0) d.setDate(d.getDate() - 2);
  if (d.getDay() === 6) d.setDate(d.getDate() - 1);
  d.setHours(between(8, 17), pick([0, 10, 15, 30, 45]), 0, 0);
  return d;
}

/* ------------------------------------------------------------------ *
 * Store construction
 * ------------------------------------------------------------------ */

function buildStudents() {
  const students = [];
  const used = new Set();
  for (let i = 0; i < 64; i += 1) {
    let name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    let guard = 0;
    while (used.has(name) && guard < 50) {
      name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
      guard += 1;
    }
    used.add(name);
    const intake = between(0, 13);
    students.push({
      id: `stu-${pad(i + 1, 3)}`,
      student_id: `STU${2024 + Math.floor(intake / 12)}${pad(1000 + i * 7, 4)}`,
      full_name: name,
      programme: pick(PROGRAMMES),
      semester: between(1, 8),
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@student.university.demo`,
      created_at: iso(dateInMonth(intake))
    });
  }
  return students;
}

/**
 * Builds submissions plus the detail record each one points at.
 * A submission is the inbox row; the detail record holds the form payload.
 */
function buildSubmissions(students) {
  const submissions = [];
  const registrations = [];
  const assessments = [];
  const feedback = [];
  let counter = 0;

  // Monthly submission volume across the last 12 months, newest last.
  // Shaped like an academic year: quiet over the break, heavy before finals.
  const volumes = [12, 14, 19, 23, 17, 15, 21, 26, 24, 18, 21, 24];

  volumes.forEach((count, index) => {
    const monthsBack = volumes.length - 1 - index;
    for (let i = 0; i < count; i += 1) {
      counter += 1;
      const student = pick(students);
      const formType = pick(FORM_TYPES);
      const submittedAt = dateInMonth(monthsBack);
      const submissionId = `sub-${pad(counter, 4)}`;

      // Older submissions have had time to be worked through.
      let status;
      if (monthsBack === 0) status = pick(['New', 'New', 'Under Review', 'Completed']);
      else if (monthsBack === 1) status = pick(['Under Review', 'Completed', 'Completed']);
      else status = 'Completed';

      const base = {
        id: submissionId,
        student_ref: student.id,
        student_id: student.student_id,
        student_name: student.full_name,
        form_type: formType,
        submitted_at: iso(submittedAt),
        status
      };

      if (formType === 'Counselling Registration') {
        const category = pick(COUNSELLING_CATEGORIES);
        registrations.push({
          id: `reg-${pad(counter, 4)}`,
          submission_id: submissionId,
          student_ref: student.id,
          student_id: student.student_id,
          student_name: student.full_name,
          programme: student.programme,
          semester: student.semester,
          category,
          reason: REGISTRATION_REASONS[category],
          session_type: pick(SESSION_TYPES),
          submitted_at: iso(submittedAt),
          status: status === 'Completed'
            ? pick(['Scheduled', 'Completed', 'Completed'])
            : status
        });
        base.detail_id = `reg-${pad(counter, 4)}`;
      } else if (formType === 'Wellbeing Assessment') {
        // Weighted so most students report mid-to-low concern, which is what
        // a campus-wide monitoring set looks like. A flat 1–5 draw would put
        // roughly half the cohort in the highest band and overstate the need.
        const stress = pick([1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
        const anxiety = Math.max(1, Math.min(5, stress + between(-1, 1)));
        const pressure = pick([1, 2, 2, 3, 3, 3, 4, 4, 5]);
        const emotional = Math.max(1, Math.min(5,
          6 - Math.round((stress + anxiety) / 2) + pick([0, 1, 1, 2])));
        assessments.push({
          id: `asm-${pad(counter, 4)}`,
          submission_id: submissionId,
          student_ref: student.id,
          student_id: student.student_id,
          student_name: student.full_name,
          programme: student.programme,
          stress_level: stress,
          anxiety_level: anxiety,
          academic_pressure: pressure,
          emotional_wellbeing: emotional,
          band: wellbeingBand({
            stress_level: stress,
            anxiety_level: anxiety,
            academic_pressure: pressure,
            emotional_wellbeing: emotional
          }),
          submitted_at: iso(submittedAt),
          status
        });
        base.detail_id = `asm-${pad(counter, 4)}`;
      } else {
        const rating = pick([5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 2, 1]);
        const satisfaction = satisfactionFor(rating);
        feedback.push({
          id: `fbk-${pad(counter, 4)}`,
          submission_id: submissionId,
          student_ref: student.id,
          student_id: student.student_id,
          student_name: student.full_name,
          category: pick(COUNSELLING_CATEGORIES),
          rating,
          satisfaction,
          comments: pick(FEEDBACK_COMMENTS[satisfaction]),
          submitted_at: iso(submittedAt),
          status
        });
        base.detail_id = `fbk-${pad(counter, 4)}`;
      }

      submissions.push(base);
    }
  });

  submissions.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return { submissions, registrations, assessments, feedback };
}

/**
 * Derives a monitoring band from the four measures.
 *
 * This is an administrative triage aid for workload planning — it indicates
 * which submissions a counsellor may want to read first. It is deliberately
 * a coarse three-step band, it is not a screening instrument, and it is not
 * a clinical or diagnostic judgement of any kind.
 */
export function wellbeingBand(record) {
  const concern = (
    record.stress_level +
    record.anxiety_level +
    record.academic_pressure +
    (6 - record.emotional_wellbeing)
  ) / 4;
  if (concern <= 2.6) return 'Good';
  if (concern <= 3.5) return 'Moderate';
  return 'Needs Support';
}

export function satisfactionFor(rating) {
  if (rating >= 5) return 'Very Satisfied';
  if (rating === 4) return 'Satisfied';
  if (rating === 3) return 'Neutral';
  return 'Dissatisfied';
}

function buildSessions(students) {
  const sessions = [];
  const volumes = [8, 9, 13, 16, 12, 10, 15, 18, 17, 13, 15, 17];
  let counter = 0;
  volumes.forEach((count, index) => {
    const monthsBack = volumes.length - 1 - index;
    for (let i = 0; i < count; i += 1) {
      counter += 1;
      const student = pick(students);
      sessions.push({
        id: `ses-${pad(counter, 4)}`,
        student_ref: student.id,
        student_id: student.student_id,
        category: pick(COUNSELLING_CATEGORIES),
        session_type: pick(SESSION_TYPES),
        session_date: iso(dateInMonth(monthsBack)),
        status: monthsBack === 0
          ? pick(['Completed', 'Completed', 'Scheduled'])
          : 'Completed'
      });
    }
  });
  return sessions;
}

function buildNotifications(submissions) {
  const recent = submissions.slice(0, 5);
  const titles = {
    'Counselling Registration': 'New counselling registration submitted',
    'Wellbeing Assessment': 'New wellbeing assessment received',
    'Counselling Feedback': 'New counselling feedback submitted'
  };
  const notifications = recent.map((submission, index) => ({
    id: `ntf-${pad(index + 1, 3)}`,
    kind: 'submission',
    title: titles[submission.form_type],
    body: `${submission.student_name} (${submission.student_id})`,
    submission_id: submission.id,
    created_at: submission.submitted_at,
    read: index > 2
  }));

  const pending = submissions.filter(s => s.status === 'New').length;
  notifications.unshift({
    id: 'ntf-000',
    kind: 'reminder',
    title: 'Pending submissions require review',
    body: `${pending} submission${pending === 1 ? '' : 's'} are still marked New.`,
    submission_id: null,
    created_at: iso(new Date()),
    read: false
  });
  return notifications;
}

const DEFAULT_PROFILE = {
  full_name: 'Dr. Aisyah Karim',
  email: 'aisyah.karim@university.demo',
  department: 'Student Wellbeing & Counselling Unit',
  role: 'Senior Counsellor',
  initials: 'AK',
  avatar_url: ''
};

const DEFAULT_PREFERENCES = {
  notify_new_submissions: true,
  notify_wellbeing_flags: true,
  notify_weekly_digest: false,
  density: 'comfortable',
  default_page: 'overview',
  reduce_motion: false
};

function createStore() {
  const students = buildStudents();
  const { submissions, registrations, assessments, feedback } = buildSubmissions(students);
  return {
    students,
    submissions,
    registrations,
    assessments,
    feedback,
    sessions: buildSessions(students),
    notifications: buildNotifications(submissions),
    profile: { ...DEFAULT_PROFILE },
    preferences: { ...DEFAULT_PREFERENCES }
  };
}

let store = createStore();

/* ------------------------------------------------------------------ *
 * Query helpers shared by the list accessors
 * ------------------------------------------------------------------ */

const copy = value => JSON.parse(JSON.stringify(value));

/**
 * Simulated round-trip. Phase 1 reads from memory, but every accessor is
 * awaited so the pages already handle a pending state. Set to 0 to disable.
 */
const LATENCY_MS = 90;
const settle = () => new Promise(resolve => setTimeout(resolve, LATENCY_MS));

function matchesText(record, fields, text) {
  if (!text) return true;
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return fields.some(field => String(record[field] ?? '').toLowerCase().includes(needle));
}

function withinRange(value, from, to) {
  if (from && value < from) return false;
  if (to && value > `${to}T23:59:59.999Z`) return false;
  return true;
}

/**
 * Sorts, counts and slices a filtered list.
 * Returns the page of rows plus the totals the pagination control needs.
 */
function paginate(rows, { sort_by = 'submitted_at', sort_dir = 'desc', page = 1, per_page = 8 } = {}) {
  const sorted = rows.slice().sort((a, b) => {
    const left = a[sort_by];
    const right = b[sort_by];
    let result;
    if (typeof left === 'number' && typeof right === 'number') result = left - right;
    else result = String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
    return sort_dir === 'asc' ? result : -result;
  });
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / per_page));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * per_page;
  return {
    rows: copy(sorted.slice(start, start + per_page)),
    total,
    page: current,
    per_page,
    page_count: pageCount,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + per_page, total)
  };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});
}

const monthKey = isoString => isoString.slice(0, 7);

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' })
    .format(new Date(year, month - 1, 1));
}

/** The last `count` month keys, oldest first. */
function recentMonths(count) {
  const now = new Date();
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`);
  }
  return keys;
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/* ------------------------------------------------------------------ *
 * Data access layer — the public API
 *
 * Phase 2 replaces each body with a Supabase call. Signatures stay.
 * ------------------------------------------------------------------ */

export async function getOverviewStats() {
  await settle();

  // Rolling 30-day windows rather than calendar months. Comparing a
  // part-finished month against a whole one reads as a collapse in activity
  // on any day except the last of the month.
  const now = Date.now();
  const DAY = 86400000;
  const currentFrom = new Date(now - 30 * DAY).toISOString();
  const previousFrom = new Date(now - 60 * DAY).toISOString();
  const inCurrent = value => value >= currentFrom;
  const inPrevious = value => value >= previousFrom && value < currentFrom;

  const studentsThis = store.students.filter(s => inCurrent(s.created_at)).length;
  const studentsPrev = store.students.filter(s => inPrevious(s.created_at)).length;
  const subsThis = store.submissions.filter(s => inCurrent(s.submitted_at)).length;
  const subsPrev = store.submissions.filter(s => inPrevious(s.submitted_at)).length;
  const completedSessions = store.sessions.filter(s => s.status === 'Completed');
  const sessionsThis = completedSessions.filter(s => inCurrent(s.session_date)).length;
  const sessionsPrev = completedSessions.filter(s => inPrevious(s.session_date)).length;

  return {
    total_students: {
      value: store.students.length,
      change: percentChange(studentsThis, studentsPrev),
      caption: 'Registered on the demonstration roll'
    },
    total_submissions: {
      value: store.submissions.length,
      change: percentChange(subsThis, subsPrev),
      caption: `${subsThis} in the last 30 days`
    },
    pending_reviews: {
      value: store.submissions.filter(s => s.status === 'New').length,
      under_review: store.submissions.filter(s => s.status === 'Under Review').length,
      caption: 'Awaiting a first read'
    },
    completed_sessions: {
      value: completedSessions.length,
      change: percentChange(sessionsThis, sessionsPrev),
      caption: 'Recorded as completed'
    }
  };
}

export async function listSubmissions(query = {}) {
  await settle();
  const rows = store.submissions.filter(row =>
    matchesText(row, ['student_id', 'student_name'], query.search) &&
    (!query.form_type || row.form_type === query.form_type) &&
    (!query.status || row.status === query.status) &&
    withinRange(row.submitted_at, query.from, query.to)
  );
  return paginate(rows, query);
}

export async function getSubmission(id) {
  await settle();
  const submission = store.submissions.find(s => s.id === id);
  if (!submission) return null;
  const student = store.students.find(s => s.id === submission.student_ref) || null;
  let detail = null;
  if (submission.form_type === 'Counselling Registration') {
    detail = store.registrations.find(r => r.id === submission.detail_id) || null;
  } else if (submission.form_type === 'Wellbeing Assessment') {
    detail = store.assessments.find(a => a.id === submission.detail_id) || null;
  } else {
    detail = store.feedback.find(f => f.id === submission.detail_id) || null;
  }
  return copy({ submission, student, detail });
}

/**
 * Updates a submission status and keeps the linked detail record in step.
 * Returns the updated submission, or null when the id is unknown.
 */
export async function updateSubmissionStatus(id, status) {
  await settle();
  if (!SUBMISSION_STATUSES.includes(status)) {
    throw new Error(`Unknown submission status: ${status}`);
  }
  const submission = store.submissions.find(s => s.id === id);
  if (!submission) return null;
  submission.status = status;

  const linked =
    store.registrations.find(r => r.submission_id === id) ||
    store.assessments.find(a => a.submission_id === id) ||
    store.feedback.find(f => f.submission_id === id);
  if (linked) {
    // A registration can sit at Scheduled, which has no submission equivalent;
    // leave that alone rather than overwriting a more specific state.
    if (!(linked.status === 'Scheduled' && status === 'Completed')) linked.status = status;
  }
  return copy(submission);
}

export async function listRegistrations(query = {}) {
  await settle();
  const rows = store.registrations.filter(row =>
    matchesText(row, ['student_id', 'student_name'], query.search) &&
    (!query.programme || row.programme === query.programme) &&
    (!query.status || row.status === query.status) &&
    withinRange(row.submitted_at, query.from, query.to)
  );
  return paginate(rows, query);
}

export async function getRegistration(id) {
  await settle();
  const registration = store.registrations.find(r => r.id === id);
  return registration ? copy(registration) : null;
}

export async function updateRegistrationStatus(id, status) {
  await settle();
  if (!REGISTRATION_STATUSES.includes(status)) {
    throw new Error(`Unknown registration status: ${status}`);
  }
  const registration = store.registrations.find(r => r.id === id);
  if (!registration) return null;
  registration.status = status;
  const submission = store.submissions.find(s => s.id === registration.submission_id);
  if (submission && SUBMISSION_STATUSES.includes(status)) submission.status = status;
  return copy(registration);
}

export async function listAssessments(query = {}) {
  await settle();
  const rows = store.assessments.filter(row =>
    matchesText(row, ['student_id', 'student_name'], query.search) &&
    (!query.band || row.band === query.band) &&
    (!query.status || row.status === query.status) &&
    withinRange(row.submitted_at, query.from, query.to)
  );
  return paginate(rows, query);
}

export async function getAssessment(id) {
  await settle();
  const assessment = store.assessments.find(a => a.id === id);
  return assessment ? copy(assessment) : null;
}

export async function listFeedback(query = {}) {
  await settle();
  const rows = store.feedback.filter(row =>
    matchesText(row, ['student_id', 'student_name', 'comments'], query.search) &&
    (!query.rating || row.rating === Number(query.rating)) &&
    (!query.satisfaction || row.satisfaction === query.satisfaction) &&
    withinRange(row.submitted_at, query.from, query.to)
  );
  return paginate(rows, query);
}

export async function getFeedback(id) {
  await settle();
  const record = store.feedback.find(f => f.id === id);
  return record ? copy(record) : null;
}

/* ---- aggregates: deliberately separate from the record accessors ---- */

export async function getWellbeingSummary(range = {}) {
  await settle();
  const rows = store.assessments.filter(a => withinRange(a.submitted_at, range.from, range.to));
  const averages = ASSESSMENT_MEASURES.map(measure => ({
    key: measure.key,
    label: measure.label,
    higher_is_better: measure.higher_is_better,
    average: rows.length
      ? Math.round((rows.reduce((sum, row) => sum + row[measure.key], 0) / rows.length) * 10) / 10
      : 0
  }));
  const counts = countBy(rows, 'band');
  return {
    total: rows.length,
    averages,
    distribution: WELLBEING_BANDS.map(band => ({ label: band, value: counts[band] || 0 }))
  };
}

export async function getFeedbackSummary(range = {}) {
  await settle();
  const rows = store.feedback.filter(f => withinRange(f.submitted_at, range.from, range.to));
  const counts = countBy(rows, 'satisfaction');
  const average = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 10) / 10
    : 0;
  return {
    total: rows.length,
    average_rating: average,
    distribution: SATISFACTION_LEVELS.map(level => ({ label: level, value: counts[level] || 0 }))
  };
}

/**
 * Dashboard-wide aggregates for the analytics page and the overview charts.
 * Holds no individual student identities — only counts.
 */
export async function getAnalytics(range = {}) {
  await settle();
  const submissions = store.submissions.filter(s => withinRange(s.submitted_at, range.from, range.to));
  const assessments = store.assessments.filter(a => withinRange(a.submitted_at, range.from, range.to));
  const feedback = store.feedback.filter(f => withinRange(f.submitted_at, range.from, range.to));
  const sessions = store.sessions.filter(s => withinRange(s.session_date, range.from, range.to));

  const byMonth = countBy(submissions.map(s => ({ month: monthKey(s.submitted_at) })), 'month');
  const months = recentMonths(12).filter(key => {
    if (range.from && key < monthKey(range.from)) return false;
    if (range.to && key > monthKey(range.to)) return false;
    return true;
  });

  const bandCounts = countBy(assessments, 'band');
  const satisfactionCounts = countBy(feedback, 'satisfaction');
  const categoryCounts = countBy(sessions, 'category');
  const formTypeCounts = countBy(submissions, 'form_type');
  const statusCounts = countBy(submissions, 'status');

  const averageRating = feedback.length
    ? Math.round((feedback.reduce((sum, row) => sum + row.rating, 0) / feedback.length) * 10) / 10
    : 0;

  return {
    range: { from: range.from || null, to: range.to || null },
    totals: {
      submissions: submissions.length,
      assessments: assessments.length,
      feedback: feedback.length,
      sessions: sessions.filter(s => s.status === 'Completed').length,
      average_rating: averageRating
    },
    submissions_by_month: months.map(key => ({
      key,
      label: monthLabel(key),
      value: byMonth[key] || 0
    })),
    submissions_by_form_type: FORM_TYPES.map(type => ({
      label: type,
      value: formTypeCounts[type] || 0
    })),
    submissions_by_status: SUBMISSION_STATUSES.map(status => ({
      label: status,
      value: statusCounts[status] || 0
    })),
    wellbeing_distribution: WELLBEING_BANDS.map(band => ({
      label: band,
      value: bandCounts[band] || 0
    })),
    counselling_categories: COUNSELLING_CATEGORIES.map(category => ({
      label: category,
      value: categoryCounts[category] || 0
    })),
    feedback_satisfaction: SATISFACTION_LEVELS.map(level => ({
      label: level,
      value: satisfactionCounts[level] || 0
    }))
  };
}

/** Flat rows for CSV export. `dataset` names the export the counsellor chose. */
export async function getExportRows(dataset, range = {}) {
  await settle();
  const inRange = (value) => withinRange(value, range.from, range.to);
  if (dataset === 'submissions') {
    return copy(store.submissions
      .filter(s => inRange(s.submitted_at))
      .map(({ id, student_id, student_name, form_type, submitted_at, status }) =>
        ({ id, student_id, student_name, form_type, submitted_at, status })));
  }
  if (dataset === 'registrations') {
    return copy(store.registrations
      .filter(r => inRange(r.submitted_at))
      .map(({ id, student_id, student_name, programme, semester, category, session_type, submitted_at, status }) =>
        ({ id, student_id, student_name, programme, semester, category, session_type, submitted_at, status })));
  }
  if (dataset === 'assessments') {
    return copy(store.assessments
      .filter(a => inRange(a.submitted_at))
      .map(({ id, student_id, programme, stress_level, anxiety_level, academic_pressure, emotional_wellbeing, band, submitted_at }) =>
        ({ id, student_id, programme, stress_level, anxiety_level, academic_pressure, emotional_wellbeing, band, submitted_at })));
  }
  if (dataset === 'feedback') {
    return copy(store.feedback
      .filter(f => inRange(f.submitted_at))
      .map(({ id, student_id, category, rating, satisfaction, comments, submitted_at }) =>
        ({ id, student_id, category, rating, satisfaction, comments, submitted_at })));
  }
  if (dataset === 'summary') {
    const analytics = await getAnalytics(range);
    return [
      ...analytics.submissions_by_month.map(r => ({ metric: 'Submissions', dimension: r.label, value: r.value })),
      ...analytics.submissions_by_form_type.map(r => ({ metric: 'Submissions by form type', dimension: r.label, value: r.value })),
      ...analytics.wellbeing_distribution.map(r => ({ metric: 'Wellbeing band', dimension: r.label, value: r.value })),
      ...analytics.counselling_categories.map(r => ({ metric: 'Counselling category', dimension: r.label, value: r.value })),
      ...analytics.feedback_satisfaction.map(r => ({ metric: 'Feedback satisfaction', dimension: r.label, value: r.value }))
    ];
  }
  throw new Error(`Unknown export dataset: ${dataset}`);
}

/* ---- notifications ---- */

export async function listNotifications() {
  await settle();
  return copy(store.notifications.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)));
}

export async function markNotificationRead(id) {
  await settle();
  const notification = store.notifications.find(n => n.id === id);
  if (!notification) return null;
  notification.read = true;
  return copy(notification);
}

export async function markAllNotificationsRead() {
  await settle();
  store.notifications.forEach(n => { n.read = true; });
  return copy(store.notifications);
}

/* ---- profile & preferences ---- */

export async function getProfile() {
  await settle();
  return copy(store.profile);
}

export async function updateProfile(patch) {
  await settle();
  store.profile = { ...store.profile, ...patch };
  const name = store.profile.full_name.trim();
  store.profile.initials = name
    ? name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2)
        .map(part => part[0].toUpperCase()).join('') || 'C'
    : 'C';
  return copy(store.profile);
}

export async function getPreferences() {
  await settle();
  return copy(store.preferences);
}

export async function updatePreferences(patch) {
  await settle();
  store.preferences = { ...store.preferences, ...patch };
  return copy(store.preferences);
}

/** Rebuilds the demonstration store. Used by Settings. */
export async function resetDemoData() {
  await settle();
  const preferences = { ...store.preferences };
  store = createStore();
  store.preferences = preferences;
  return true;
}
