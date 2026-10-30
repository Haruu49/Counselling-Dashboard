/**
 * app.js — application shell and bootstrap.
 *
 * Builds the sidebar and top bar once, then mounts one page module into the
 * main region per route. Page modules never touch the shell; the shell never
 * reaches into a page.
 */

import {
  h, icon, paintIcons, toast, confirmDialog, closeModal, clear, formatDate, debounce
} from './ui.js';
import {
  ROUTES, NAV_SECTIONS, initRouter, currentRoute, currentPublicRoute,
  navigate, routeById, defineRoutes, handlerFor
} from './router.js';
import { getProfile, getPreferences, updatePreferences, refreshCounsellingRequests } from './data.js';
import { isConfigured, currentSession, promptSignIn, renderConfigurationNeeded, signOut as endSupabaseSession, onSignedOut } from './auth.js';
import { subscribeToRequests, unsubscribeFromRequests } from './realtime.js';
import { loadStoredPreferences, storePreferences, setQuery } from './state.js';
import { createNotificationMenu, closeNotificationMenu, refreshBadge } from './notifications.js';
import { destroyAll, setChartMotion } from './charts.js';
import { mountOverview } from './dashboard.js';
import { mountSubmissions } from './submissions.js';
import { mountRegister } from './register.js';
import { mountRegistration } from './registration.js';
import { mountWellbeing } from './wellbeing.js';
import { mountFeedback } from './feedback.js';
import { mountAnalytics } from './analytics.js';
import { mountSettings } from './settings.js';

const shell = {
  sidebar: document.getElementById('sidebar'),
  topbar: document.getElementById('topbar'),
  main: document.getElementById('main-content'),
  overlay: document.getElementById('sidebar-overlay')
};

let profile;
let preferences;
let activeContainer = null;

/* ------------------------------------------------------------------ *
 * Sidebar
 * ------------------------------------------------------------------ */

function renderSidebar(activeId) {
  clear(shell.sidebar);

  shell.sidebar.append(
    h('div', { class: 'brand' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('heart-handshake', 20)),
      h('span', { class: 'brand-text' },
        h('strong', {}, 'Counselling Dashboard'),
        h('small', {}, 'Student Counselling Management'))),

    h('button', {
      type: 'button',
      class: 'collapse-toggle',
      'aria-label': 'Collapse sidebar',
      onclick: () => {
        const collapsed = document.body.classList.toggle('is-sidebar-collapsed');
        shell.sidebar.querySelector('.collapse-toggle')
          .setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      }
    }, icon('panel-left-close', 17))
  );

  const nav = h('nav', { class: 'sidebar-nav', 'aria-label': 'Main navigation' });
  NAV_SECTIONS.forEach(section => {
    const routes = ROUTES.filter(route => route.section === section);
    if (!routes.length) return;
    nav.append(h('p', { class: 'nav-section' }, section));
    const list = h('ul', { class: 'nav-list' });
    routes.forEach(route => {
      list.append(h('li', {},
        h('a', {
          class: `nav-link${route.id === activeId ? ' is-active' : ''}`,
          href: `#/${route.path}`,
          'aria-current': route.id === activeId ? 'page' : null,
          title: route.label
        },
          h('span', { class: 'nav-icon' }, icon(route.iconName, 18)),
          h('span', { class: 'nav-label' }, route.label))));
    });
    nav.append(list);
  });

  // Logout sits apart from the routed pages: it is an action, not a place.
  nav.append(h('p', { class: 'nav-section' }, 'Session'));
  nav.append(h('ul', { class: 'nav-list' },
    h('li', {},
      h('button', { type: 'button', class: 'nav-link nav-link-button', onclick: signOut },
        h('span', { class: 'nav-icon' }, icon('log-out', 18)),
        h('span', { class: 'nav-label' }, 'Logout')))));

  shell.sidebar.append(nav);

  shell.sidebar.append(
    h('div', { class: 'sidebar-footer' },
      h('div', { class: 'sidebar-profile' },
        avatar(profile, 'avatar-small'),
        h('span', { class: 'sidebar-profile-text' },
          h('strong', {}, profile.full_name),
          h('small', {}, profile.role))),
      h('p', { class: 'sidebar-note' },
        icon('shield', 14),
        h('span', {}, 'Counselling staff only · live requests')))
  );

  paintIcons(shell.sidebar);
}

function avatar(person, className = '') {
  return h('span', { class: `avatar ${className}`.trim() },
    person.avatar_url
      ? h('img', { src: person.avatar_url, alt: '' })
      : h('span', {}, person.initials));
}

/* ------------------------------------------------------------------ *
 * Top bar
 * ------------------------------------------------------------------ */

/**
 * The top bar is built once. Only the breadcrumb and the title change per
 * route, and only the profile chip changes when the profile is edited.
 * Rebuilding the whole bar on every navigation would re-register the
 * document-level listeners the dropdowns rely on, and the stale copies would
 * then fight the live panel.
 */
let topbar = null;

function buildTopbar() {
  const breadcrumb = h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' });
  const title = h('p', { class: 'topbar-title' });

  const search = h('form', {
    class: 'global-search',
    role: 'search',
    onsubmit: event => {
      event.preventDefault();
      runGlobalSearch(event.target.elements.q.value.trim());
    }
  },
    icon('search', 16),
    h('input', {
      type: 'search',
      name: 'q',
      placeholder: 'Search students or submissions',
      'aria-label': 'Search students or submissions',
      autocomplete: 'off',
      oninput: debounce(event => {
        // Typing in the top bar filters the submissions page live once the
        // counsellor is already looking at it.
        if (currentRoute()?.id === 'submissions' && event.target.value.length > 2) {
          runGlobalSearch(event.target.value.trim(), { quiet: true });
        }
      }, 320)
    }));

  const profile = buildProfileMenu();

  shell.topbar.append(
    h('div', { class: 'topbar-left' },
      h('button', {
        type: 'button',
        class: 'icon-button menu-toggle',
        'aria-label': 'Open navigation',
        'aria-expanded': 'false',
        onclick: openMobileNav
      }, icon('menu', 20)),
      h('div', { class: 'topbar-titles' }, breadcrumb, title)),

    h('div', { class: 'topbar-right' },
      search,
      h('p', { class: 'topbar-date' },
        icon('calendar-days', 15),
        h('span', {}, formatDate(new Date().toISOString()))),
      createNotificationMenu(),
      profile.node)
  );

  topbar = { breadcrumb, title, profile };
  paintIcons(shell.topbar);
}

function updateTopbarRoute(route) {
  if (!topbar) return;
  const trail = route ? route.breadcrumb : ['Dashboard', 'Not found'];
  topbar.breadcrumb.replaceChildren(
    h('ol', {}, trail.map((entry, index, all) =>
      h('li', { 'aria-current': index === all.length - 1 ? 'page' : null },
        index === 0 ? h('a', { href: '#/overview' }, entry) : h('span', {}, entry))))
  );
  topbar.title.textContent = route ? route.label : 'Page not found';
}

function runGlobalSearch(value, { quiet = false } = {}) {
  setQuery('submissions', { search: value, status: '', form_type: '' });
  if (currentRoute()?.id === 'submissions') {
    mountRoute(currentRoute());
  } else {
    navigate('submissions');
  }
  if (!quiet && value) toast(`Showing submissions matching \u201c${value}\u201d.`);
}

/**
 * Profile chip and its menu. Returns the node plus an `update` function, so a
 * profile edit refreshes the text in place instead of rebuilding the menu.
 */
function buildProfileMenu() {
  const toggleAvatar = h('span', { class: 'avatar avatar-small' });
  const toggleName = h('strong', {});
  const toggleRole = h('small', {});
  const headAvatar = h('span', { class: 'avatar avatar-medium' });
  const headName = h('p', { class: 'dropdown-title' });
  const headEmail = h('p', { class: 'dropdown-subtitle' });
  const headDept = h('p', { class: 'dropdown-meta' });

  const menu = h('div', { class: 'dropdown dropdown-profile', hidden: true, role: 'menu' },
    h('div', { class: 'dropdown-head' }, headAvatar, h('div', {}, headName, headEmail)),
    headDept,
    h('div', { class: 'dropdown-actions' },
      h('button', {
        type: 'button', class: 'dropdown-item', role: 'menuitem',
        onclick: () => { close(); navigate('settings'); }
      }, icon('user-round', 16), h('span', {}, 'Profile settings')),
      h('button', {
        type: 'button', class: 'dropdown-item', role: 'menuitem',
        onclick: () => { close(); navigate('settings'); }
      }, icon('sliders-horizontal', 16), h('span', {}, 'Dashboard preferences')),
      h('button', {
        type: 'button', class: 'dropdown-item dropdown-item-danger', role: 'menuitem',
        onclick: () => { close(); signOut(); }
      }, icon('log-out', 16), h('span', {}, 'Logout'))));

  const button = h('button', {
    type: 'button',
    class: 'profile-toggle',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    onclick: event => {
      event.stopPropagation();
      closeNotificationMenu();
      if (menu.hidden) open(); else close();
    }
  }, toggleAvatar, h('span', { class: 'profile-toggle-text' }, toggleName, toggleRole), icon('chevron-down', 15));

  const node = h('div', { class: 'menu-anchor' }, button, menu);

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('.dropdown-item')?.focus();
  }
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  // Registered once, because this menu is built once.
  document.addEventListener('click', event => {
    if (!menu.hidden && !node.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      close();
      button.focus();
    }
  });

  function update(person) {
    const face = () => (person.avatar_url
      ? h('img', { src: person.avatar_url, alt: '' })
      : h('span', {}, person.initials));
    toggleAvatar.replaceChildren(face());
    headAvatar.replaceChildren(face());
    toggleName.textContent = person.full_name;
    toggleRole.textContent = person.role;
    headName.textContent = person.full_name;
    headEmail.textContent = person.email;
    headDept.textContent = person.department;
  }

  update(profile);
  return { node, update };
}

/* ------------------------------------------------------------------ *
 * Mobile navigation
 * ------------------------------------------------------------------ */

function openMobileNav() {
  document.body.classList.add('is-nav-open');
  shell.overlay.hidden = false;
  document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'true');
  shell.sidebar.querySelector('.nav-link')?.focus();
}

function closeMobileNav() {
  document.body.classList.remove('is-nav-open');
  shell.overlay.hidden = true;
  document.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ------------------------------------------------------------------ *
 * Sign out
 * ------------------------------------------------------------------ */

/** True while this tab is deliberately ending its own session. */
let signingOut = false;

async function signOut() {
  const ok = await confirmDialog({
    title: 'Log out of the dashboard?',
    body: 'Your session will end on this device. You will need to sign in again to open the counselling request queue.',
    confirmLabel: 'Log out'
  });
  if (!ok) return;

  signingOut = true;
  await endSupabaseSession();
  signingOut = false;
  await returnToSignIn();
}

/**
 * The screens a visitor gets before any session exists: the sign-in card, and
 * the public registration page when the hash asks for one. The links between
 * them are ordinary hash links, so a hash change is what moves from one to the
 * other — which is why this waits on either a sign-in or a hash change, and
 * resolves only once there is a session.
 *
 * Neither screen reads a single record: the register page only posts to the
 * register-counsellor function, and the sign-in card holds nothing at all.
 */
async function showPublicScreens() {
  while (!(await currentSession())) {
    const publicRoute = currentPublicRoute();
    const moved = new AbortController();
    const hashChanged = new Promise(resolve =>
      window.addEventListener('hashchange', resolve, { once: true, signal: moved.signal }));

    if (publicRoute) {
      document.body.classList.add('is-signed-out');
      mountRegister(clear(shell.main), { standalone: true });
      // The only way off this page is one of its own links.
      await hashChanged;
    } else if (await Promise.race([promptSignIn(shell.main).then(() => true), hashChanged.then(() => false)])) {
      moved.abort();
      return;
    }
    moved.abort();
  }
}

/**
 * Tears the dashboard down and shows the sign-in screen again. Used by the
 * logout button and by a session that ends elsewhere — in another tab, or
 * because a token could not be refreshed.
 */
async function returnToSignIn(notice = null) {
  unsubscribeFromRequests();
  destroyAll();
  closeModal();
  closeMobileNav();
  closeNotificationMenu();

  activeContainer = null;
  topbar = null;
  clear(shell.sidebar);
  clear(shell.topbar);

  await showPublicScreens();
  if (notice) toast(notice, 'warning');
  await boot();
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

defineRoutes({
  overview: container => mountOverview(container, { profile }),
  submissions: container => mountSubmissions(container),
  // The registration page, hosted inside the shell for a counsellor who is
  // already signed in and is setting up a colleague. Signed out, it is
  // rendered by showPublicScreens() instead.
  register: container => mountRegister(container),
  registration: container => mountRegistration(container),
  wellbeing: container => mountWellbeing(container),
  feedback: container => mountFeedback(container),
  analytics: container => mountAnalytics(container),
  settings: container => mountSettings(container, {
    onProfileChange: updated => {
      profile = updated;
      renderSidebar(currentRoute()?.id);
      if (topbar) topbar.profile.update(updated);
    },
    onPreferencesChange: updated => {
      preferences = updated;
      applyPreferences();
    }
  })
});

async function mountRoute(route) {
  closeModal();
  closeMobileNav();
  closeNotificationMenu();
  destroyAll();
  document.body.classList.remove('is-signed-out');

  // Let the outgoing page detach its listeners.
  if (activeContainer) activeContainer.dispatchEvent(new CustomEvent('page:unmount'));

  renderSidebar(route ? route.id : null);
  updateTopbarRoute(route);

  const container = h('div', { class: 'page' });
  activeContainer = container;
  clear(shell.main).append(container);
  shell.main.scrollTop = 0;
  window.scrollTo(0, 0);

  if (!route) {
    container.append(notFound());
    paintIcons(container);
    return;
  }

  const handler = handlerFor(route.id);
  try {
    await handler(container);
  } catch (error) {
    // A page that throws should not leave an empty screen behind.
    console.error(`Failed to render ${route.id}:`, error);
    container.replaceChildren(renderError(route));
  }
  paintIcons(container);
}

function notFound() {
  return h('section', { class: 'not-found' },
    h('span', { class: 'not-found-mark' }, icon('compass', 24)),
    h('h1', {}, 'That page is not part of the dashboard'),
    h('p', {}, 'The address may be out of date. Choose a page from the navigation, or go back to the overview.'),
    h('button', { type: 'button', class: 'button button-primary', onclick: () => navigate('overview') },
      'Back to overview'));
}

function renderError(route) {
  return h('section', { class: 'not-found' },
    h('span', { class: 'not-found-mark' }, icon('triangle-alert', 24)),
    h('h1', {}, 'This page could not be loaded'),
    h('p', {}, `Something went wrong while building ${route.label}. Reload the page to try again; the browser console has the details.`),
    h('button', { type: 'button', class: 'button button-primary', onclick: () => window.location.reload() },
      'Reload the dashboard'));
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

function applyPreferences() {
  document.body.classList.toggle('is-compact', preferences.density === 'compact');
  document.body.classList.toggle('is-reduced-motion', Boolean(preferences.reduce_motion));
  setChartMotion(!preferences.reduce_motion);
}

/* ------------------------------------------------------------------ *
 * Bootstrap
 * ------------------------------------------------------------------ */

/**
 * Boots the dashboard for a signed-in counsellor. Called after sign-in, and
 * again if the counsellor signs out and back in without reloading, so
 * everything it builds is either cleared first or replaced in place.
 */
async function boot() {
  document.body.classList.remove('is-signed-out');

  profile = await getProfile();

  // Stored display preferences win over the defaults, if any were saved.
  const stored = loadStoredPreferences();
  preferences = stored ? await updatePreferences(stored) : await getPreferences();
  if (!stored) storePreferences(preferences);
  applyPreferences();

  buildTopbar();

  // Read the live queue once before the first page renders, so the counts on
  // the overview are right the first time rather than a beat later.
  await refreshCounsellingRequests();
  startRealtime();

  initRouter({
    landing: preferences.default_page,
    // A public route is not in ROUTES, so it arrives here as null.
    onNavigate: route => mountRoute(route ?? currentPublicRoute())
  });

  await refreshBadge();
}

/**
 * Keeps the queue live. Every event re-reads the table and tells the mounted
 * page to re-render; nothing is taken from the event payload itself.
 */
function startRealtime() {
  subscribeToRequests({
    onChange: async () => {
      const { added } = await refreshCounsellingRequests();
      await refreshBadge();
      added.forEach(row => toast(`New counselling request from ${row.student_name}.`));
      document.dispatchEvent(new CustomEvent('requests:changed'));
    }
  });
}

async function start() {
  // The shell is listening before anything can need it.
  shell.overlay.addEventListener('click', closeMobileNav);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('is-nav-open')) closeMobileNav();
  });
  // Clicking a sidebar link on a phone should close the drawer behind it.
  shell.sidebar.addEventListener('click', event => {
    if (event.target.closest('.nav-link')) closeMobileNav();
  });

  document.body.classList.remove('is-booting');

  // Without js/config.js there is no project to sign in to. The dashboard
  // reads real student records, so it does not fall back to anything.
  if (!isConfigured()) {
    renderConfigurationNeeded(shell.main);
    return;
  }

  // #/register must open without a session, so the public screens come first
  // and this returns only once a counsellor has signed in.
  await showPublicScreens();

  onSignedOut(() => {
    if (signingOut) return;
    returnToSignIn('Your session ended. Please sign in again.');
  });

  await boot();
}

start().catch(error => {
  console.error('The dashboard failed to start:', error);
  document.body.classList.remove('is-booting');
  shell.main.append(h('section', { class: 'not-found' },
    h('h1', {}, 'The dashboard failed to start'),
    h('p', {}, 'Reload the page. If it keeps happening, the browser console has the details.')));
});
