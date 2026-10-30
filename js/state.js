/**
 * state.js — UI state that outlives a page render.
 *
 * Search text, filters, sort order and page number are kept here so that
 * leaving Submissions for Overview and coming back shows the same slice the
 * counsellor left behind. This holds view state only: no student records and
 * nothing confidential ever lands in this module or in browser storage.
 */

const DEFAULT_QUERY = {
  search: '',
  form_type: '',
  status: '',
  programme: '',
  band: '',
  satisfaction: '',
  rating: '',
  from: '',
  to: '',
  sort_by: 'submitted_at',
  sort_dir: 'desc',
  page: 1,
  per_page: 8
};

/** One query bag per list page. */
const queries = {
  submissions: { ...DEFAULT_QUERY },
  registrations: { ...DEFAULT_QUERY, sort_by: 'submitted_at' },
  wellbeing: { ...DEFAULT_QUERY, sort_by: 'submitted_at' },
  feedback: { ...DEFAULT_QUERY, sort_by: 'submitted_at' },
  // Seeded below, once RANGE_PRESETS exists.
  analytics: { from: '', to: '', preset: 'last_90' },
  // The Overview's recent-submissions table keeps its own slice, so filtering
  // it never disturbs the full Student Submissions page.
  recent: { ...DEFAULT_QUERY, per_page: 5 }
};

export function getQuery(page) {
  return { ...queries[page] };
}

/**
 * Merges a patch into a page's query. Changing anything other than the page
 * number returns to page 1, because the old offset rarely still makes sense.
 */
export function setQuery(page, patch) {
  const keepsPage = Object.keys(patch).every(key => key === 'page');
  queries[page] = { ...queries[page], ...patch, ...(keepsPage ? {} : { page: 1 }) };
  return { ...queries[page] };
}

export function resetQuery(page) {
  if (page === 'analytics') {
    queries.analytics = { from: '', to: '', preset: 'last_90' };
  } else {
    const { sort_by: sortBy, sort_dir: sortDir, per_page: perPage } = queries[page];
    queries[page] = { ...DEFAULT_QUERY, sort_by: sortBy, sort_dir: sortDir, per_page: perPage };
  }
  return { ...queries[page] };
}

/** Toggles direction when the same column is clicked twice. */
export function toggleSort(page, column) {
  const current = queries[page];
  const dir = current.sort_by === column && current.sort_dir === 'desc' ? 'asc' : 'desc';
  queries[page] = { ...current, sort_by: column, sort_dir: dir, page: 1 };
  return { ...queries[page] };
}

/* ------------------------------------------------------------------ *
 * Display preferences
 *
 * Only non-identifying display choices are persisted — density, landing
 * page, reduced motion and notification toggles. Section 18 of the brief
 * rules out putting anything confidential in browser storage, so nothing
 * else is written here.
 * ------------------------------------------------------------------ */

const PREFS_KEY = 'counselling-dashboard.display-preferences';

export function loadStoredPreferences() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private browsing, blocked storage, or malformed JSON — fall back to defaults.
    return null;
  }
}

export function storePreferences(preferences) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({
      notify_new_submissions: preferences.notify_new_submissions,
      notify_wellbeing_flags: preferences.notify_wellbeing_flags,
      notify_weekly_digest: preferences.notify_weekly_digest,
      density: preferences.density,
      default_page: preferences.default_page,
      reduce_motion: preferences.reduce_motion
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredPreferences() {
  try {
    window.localStorage.removeItem(PREFS_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Date range presets, shared by Analytics and the list pages
 * ------------------------------------------------------------------ */

export const RANGE_PRESETS = [
  { id: 'last_7', label: 'Last 7 days', days: 7 },
  { id: 'last_30', label: 'Last 30 days', days: 30 },
  { id: 'last_90', label: 'Last 90 days', days: 90 },
  { id: 'last_12_months', label: 'Last 12 months', days: 365 },
  { id: 'custom', label: 'Custom range', days: null }
];

const isoDay = date => {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const todayISO = () => isoDay(new Date());

/** Turns a preset id into the `{ from, to }` pair the data layer expects. */
export function rangeFromPreset(presetId) {
  const preset = RANGE_PRESETS.find(p => p.id === presetId);
  if (!preset || preset.days === null) return { from: '', to: '' };
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - preset.days);
  return { from: isoDay(from), to: isoDay(to) };
}

// Analytics opens on "Last 90 days", so its dates have to match the preset
// the button row shows as selected. Seeded here rather than in the object
// literal above, which is evaluated before RANGE_PRESETS exists.
queries.analytics = { ...rangeFromPreset('last_90'), preset: 'last_90' };
