/**
 * router.js — hash routing.
 *
 * Routes are declared once here with the title and breadcrumb the top bar
 * needs, so adding a page means adding one entry rather than editing the
 * shell. Page modules register their mount function through `defineRoutes`.
 */

export const ROUTES = [
  { id: 'overview', path: 'overview', label: 'Overview', iconName: 'layout-dashboard', section: 'Monitor', breadcrumb: ['Dashboard', 'Overview'] },
  { id: 'submissions', path: 'submissions', label: 'Student Submissions', iconName: 'inbox', section: 'Monitor', breadcrumb: ['Dashboard', 'Student Submissions'] },
  { id: 'registration', path: 'registration', label: 'Counselling Registration', iconName: 'clipboard-list', section: 'Manage', breadcrumb: ['Dashboard', 'Counselling Registration'] },
  { id: 'wellbeing', path: 'wellbeing', label: 'Wellbeing Assessment', iconName: 'heart-pulse', section: 'Manage', breadcrumb: ['Dashboard', 'Wellbeing Assessment'] },
  { id: 'feedback', path: 'feedback', label: 'Feedback Management', iconName: 'message-square-quote', section: 'Manage', breadcrumb: ['Dashboard', 'Feedback Management'] },
  { id: 'analytics', path: 'analytics', label: 'Analytics & Reports', iconName: 'chart-column', section: 'Insight', breadcrumb: ['Dashboard', 'Analytics & Reports'] },
  { id: 'settings', path: 'settings', label: 'Settings', iconName: 'settings', section: 'Account', breadcrumb: ['Dashboard', 'Settings'] }
];

export const NAV_SECTIONS = ['Monitor', 'Manage', 'Insight', 'Account'];

/**
 * Routes that open without a session and carry no dashboard data.
 *
 * They are kept out of ROUTES on purpose: ROUTES builds the sidebar, and a
 * public page does not belong in a counsellor's navigation. app.js renders
 * one of these before the sign-in card when the hash asks for it, and inside
 * the shell when a signed-in counsellor navigates to it.
 */
export const PUBLIC_ROUTES = [
  {
    id: 'register',
    path: 'register',
    label: 'Client Registration',
    breadcrumb: ['Counselling desk', 'Register'],
    public: true
  }
];

/** The hash's leading segment, with the leading #/ and any sub-path removed. */
function hashPath() {
  return window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
}

/** The public route in the current hash, or null. */
export function currentPublicRoute() {
  const path = hashPath();
  return PUBLIC_ROUTES.find(route => route.path === path) || null;
}

const handlers = new Map();
let onChange = () => {};
let fallback = 'overview';

export function defineRoutes(map) {
  Object.entries(map).forEach(([id, handler]) => handlers.set(id, handler));
}

export function routeById(id) {
  return ROUTES.find(route => route.id === id) || null;
}

/** The route in the current hash, or null when the hash names nothing known. */
export function currentRoute() {
  const path = hashPath();
  return ROUTES.find(route => route.path === path) || null;
}

export function navigate(id) {
  const route = routeById(id);
  window.location.hash = `/${route ? route.path : fallback}`;
}

export function handlerFor(id) {
  return handlers.get(id) || null;
}

/**
 * Starts routing. `options.landing` is the route used when the page is opened
 * without a hash, so the Settings "default page" preference takes effect.
 */
export function initRouter({ landing = 'overview', onNavigate }) {
  fallback = landing;
  onChange = onNavigate;
  window.addEventListener('hashchange', () => onChange(currentRoute()));
  if (!window.location.hash) {
    const route = routeById(landing) || ROUTES[0];
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/${route.path}`);
  }
  onChange(currentRoute());
}
