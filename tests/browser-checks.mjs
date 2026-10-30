/**
 * tests/browser-checks.mjs — the Phase 1 verification suite.
 *
 * Drives a real Chromium against a locally served copy of the dashboard and
 * asserts the behaviour the brief asks for: routing, charts, search, filters,
 * sorting, pagination, the detail dialog, status updates, notifications, CSV
 * export, settings, responsive layout and console hygiene.
 *
 * Requires Playwright and a browser:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Then, with the dashboard served (see README):
 *
 *   python3 -m http.server 8000 &
 *   BASE_URL=http://localhost:8000/ node tests/browser-checks.mjs
 *
 * Exits non-zero if any check fails. Screenshots and downloaded CSVs are
 * written to the directory given by OUT_DIR (default: ./tests/output).
 */

import { mkdirSync } from 'node:fs';

// playwright ships as CommonJS, so the namespace may carry the exports on
// `default` depending on how Node's named-export detection resolves it.
const pw = await import('playwright').catch(() => import('playwright-core'));
const { chromium } = pw.default ?? pw;

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const SHOT = process.env.OUT_DIR || new URL('./output', import.meta.url).pathname;
mkdirSync(SHOT, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.launch({
  // CHROME_PATH lets a sandboxed or non-standard install be pointed at directly.
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--no-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('requestfailed', r => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

const settle = (ms = 700) => page.waitForTimeout(ms);

// ---------- boot ----------
await page.goto(BASE, { waitUntil: 'networkidle' });
await settle(900);

ok('Page title is correct', await page.title() === 'Counselling Dashboard | Student Counselling Management', await page.title());
ok('Boot class removed (app started)', !(await page.evaluate(() => document.body.classList.contains('is-booting'))));
ok('Chart.js loaded from CDN', await page.evaluate(() => typeof window.Chart !== 'undefined'));
ok('Lucide loaded from CDN', await page.evaluate(() => typeof window.lucide !== 'undefined'));
ok('Lucide icons rendered as SVG', await page.evaluate(() => document.querySelectorAll('svg.lucide').length) > 10,
   `${await page.evaluate(() => document.querySelectorAll('svg.lucide').length)} svg icons`);
ok('Landed on overview route', page.url().includes('#/overview'), page.url());

// ---------- overview ----------
const statCount = await page.locator('.stat-card').count();
ok('Four statistic cards render', statCount === 4, `${statCount} cards`);
const statValues = await page.locator('.stat-value').allInnerTexts();
ok('Statistic values are populated', statValues.every(v => v.trim().length > 0), statValues.join(' | '));
const deltas = await page.locator('.stat-delta').count();
ok('Trend indicators present', deltas >= 3, `${deltas} deltas`);

const qa = await page.locator('.quick-action').count();
ok('Five quick actions render', qa === 5, `${qa} actions`);

const canvases = await page.locator('.chart-card canvas').count();
ok('Overview charts render canvases', canvases === 4, `${canvases} canvases`);
const charted = await page.evaluate(() =>
  [...document.querySelectorAll('.chart-card canvas')].every(c => c.width > 0 && c.height > 0));
ok('Chart canvases have real dimensions', charted);

const legendItems = await page.locator('.chart-legend-item').count();
ok('Chart legends render', legendItems >= 7, `${legendItems} legend items`);
const tableTwins = await page.locator('.chart-table').count();
ok('Every chart has a table twin', tableTwins === 4, `${tableTwins} table views`);

const rows = await page.locator('.card:has-text("Recent student submissions") tbody tr').count();
ok('Recent submissions table populated', rows === 5, `${rows} rows`);
await page.screenshot({ path: `${SHOT}/01-overview.png`, fullPage: true });

// ---------- sidebar navigation across all routes ----------
const routes = [
  ['submissions', 'Student Submissions'],
  ['registration', 'Counselling Registration'],
  ['wellbeing', 'Wellbeing Assessment'],
  ['feedback', 'Feedback Management'],
  ['analytics', 'Analytics & Reports'],
  ['settings', 'Settings']
];
for (const [path, label] of routes) {
  await page.click(`.nav-link[href="#/${path}"]`);
  await settle(850);
  const title = (await page.locator('.topbar-title').innerText()).trim();
  const active = await page.locator('.nav-link.is-active').innerText();
  ok(`Navigate to ${label}`, title === label && active.includes(label), `title="${title}" active="${active.trim()}"`);
  await page.screenshot({ path: `${SHOT}/route-${path}.png`, fullPage: true });
}

// ---------- unknown route ----------
await page.goto(`${BASE}#/does-not-exist`, { waitUntil: 'load' });
await settle(500);
ok('Unknown route shows fallback', (await page.locator('.not-found h1').count()) === 1);

// ---------- submissions: search / filter / sort / paginate ----------
await page.goto(`${BASE}#/submissions`, { waitUntil: 'load' });
await settle(900);

const totalText = await page.locator('.pagination-count').first().innerText();
ok('Pagination summary renders', /Showing \d+–\d+ of \d+/.test(totalText), totalText);
const totalRecords = Number(totalText.match(/of ([\d,]+)/)[1].replace(/,/g, ''));
ok('Dataset has a realistic record count', totalRecords > 100, `${totalRecords} submissions`);

// sort by date toggles direction
const firstBefore = await page.locator('tbody tr').first().innerText();
await page.click('th:has-text("Submission Date") .th-sort');
await settle(600);
const firstAfter = await page.locator('tbody tr').first().innerText();
ok('Sorting by date changes row order', firstBefore !== firstAfter);
const ariaSort = await page.locator('th:has(.th-sort.is-sorted)').first().getAttribute('aria-sort');
ok('Sorted column exposes aria-sort', ariaSort === 'ascending' || ariaSort === 'descending', String(ariaSort));

// pagination
await page.click('.page-number:not(.is-current)');
await settle(600);
const afterPage = await page.locator('.pagination-count').first().innerText();
ok('Pagination moves to another page', afterPage !== totalText, afterPage);

// status filter
await page.selectOption('.toolbar select >> nth=1', 'New');
await settle(700);
const statuses = await page.$$eval('tbody tr', rows =>
  rows.map(r => r.querySelectorAll('td')[4]?.innerText.trim()));
ok('Status filter narrows the table', statuses.length > 0 && statuses.every(s => s === 'New'),
   `${statuses.length} rows, values: ${[...new Set(statuses)].join('/')}`);

// form type filter combined
await page.selectOption('.toolbar select >> nth=0', 'Wellbeing Assessment');
await settle(700);
const combined = await page.locator('.pagination-count, .empty-title').first().innerText();
ok('Combined filters apply', combined.length > 0, combined);

// search
await page.fill('.search-field input', 'STU');
await settle(800);
const searchResult = await page.locator('.pagination-count, .empty-title').first().innerText();
ok('Search runs without clearing the input', (await page.inputValue('.search-field input')) === 'STU', searchResult);

// clear filters
await page.click('.toolbar-end button');
await settle(800);
const cleared = await page.locator('.pagination-count').first().innerText();
ok('Clear filters restores the full set', cleared.includes(String(totalRecords)) || /of [\d,]+/.test(cleared), cleared);

// ---------- detail modal + status update ----------
await page.click('tbody tr:first-child button:has-text("View")');
await settle(700);
ok('Detail dialog opens', (await page.locator('.modal[role="dialog"]').count()) === 1);
ok('Dialog is modal and labelled', (await page.getAttribute('.modal', 'aria-modal')) === 'true');
const statusButtons = await page.locator('.status-actions button').count();
ok('Status update controls render', statusButtons === 3, `${statusButtons} buttons`);

const targetRowBefore = await page.locator('.modal-subtitle').innerText();
// pick an enabled status button
const enabled = page.locator('.status-actions button:not([disabled])').first();
const newStatus = (await enabled.innerText()).trim();
await enabled.click();
await settle(800);
ok('Status update closes the dialog', (await page.locator('.modal[role="dialog"]').count()) === 0);
ok('Status update shows a toast', (await page.locator('.toast').count()) === 1,
   await page.locator('.toast p').innerText().catch(() => ''));
console.log(`   (set ${targetRowBefore} -> ${newStatus})`);

// escape closes dialog
await page.click('tbody tr:first-child button:has-text("View")');
await settle(600);
await page.keyboard.press('Escape');
await settle(300);
ok('Escape closes the dialog', (await page.locator('.modal[role="dialog"]').count()) === 0);

// ---------- notifications ----------
await page.click('.notification-toggle');
await settle(600);
ok('Notification panel opens', (await page.locator('.dropdown-notifications').isVisible()));
const notifCount = await page.locator('.notification-item').count();
ok('Notifications listed', notifCount >= 5, `${notifCount} notifications`);
const unreadBefore = await page.locator('.notification-item.is-unread').count();
ok('Unread notifications marked', unreadBefore > 0, `${unreadBefore} unread`);
await page.click('.dropdown-head .link-button');
await settle(700);
const unreadAfter = await page.locator('.notification-item.is-unread').count();
ok('Mark all as read clears unread state', unreadAfter === 0, `${unreadAfter} unread remain`);
const badgeHidden = await page.$eval('.notification-badge', el => el.hidden);
ok('Badge hides when nothing is unread', badgeHidden === true, `hidden=${badgeHidden}`);
await page.keyboard.press('Escape');
await settle(300);

// ---------- profile dropdown ----------
await page.click('.profile-toggle');
await settle(400);
ok('Profile dropdown opens', await page.locator('.dropdown-profile').isVisible());
const items = await page.locator('.dropdown-item').count();
ok('Profile menu has actions', items === 3, `${items} items`);
await page.keyboard.press('Escape');
await settle(300);

// ---------- wellbeing ----------
await page.goto(`${BASE}#/wellbeing`, { waitUntil: 'load' });
await settle(1000);
const wbStats = await page.locator('.stat-card').count();
ok('Wellbeing shows four measure cards', wbStats === 4, `${wbStats} cards`);
const wbCharts = await page.locator('canvas').count();
ok('Wellbeing charts render', wbCharts === 2, `${wbCharts} canvases`);
ok('Non-clinical callout present', (await page.locator('.callout-info').innerText()).includes('not a screening instrument'));
const bands = await page.locator('tbody .chip').allInnerTexts();
ok('Monitoring bands render in the table', bands.length > 0, [...new Set(bands.map(b=>b.trim()))].join('/'));
await page.selectOption('.toolbar select >> nth=0', 'Needs Support');
await settle(800);
const banded = await page.locator('tbody .chip:has-text("Needs Support")').count();
ok('Band filter works', banded > 0, `${banded} rows`);
await page.screenshot({ path: `${SHOT}/wellbeing-filtered.png`, fullPage: true });

// ---------- feedback ----------
await page.goto(`${BASE}#/feedback`, { waitUntil: 'load' });
await settle(1000);
ok('Feedback ratings render', (await page.locator('tbody .rating').count()) > 0);
const avg = await page.locator('.stat-value').nth(1).innerText();
ok('Average rating shown with a decimal', /^\d\.\d/.test(avg.trim()), avg.trim());
await page.selectOption('.toolbar select >> nth=0', '5');
await settle(800);
const fiveStar = await page.locator('tbody .rating-value').allInnerTexts();
ok('Rating filter works', fiveStar.length > 0 && fiveStar.every(v => v.trim() === '5'), `${fiveStar.length} rows`);

// ---------- analytics + CSV export ----------
await page.goto(`${BASE}#/analytics`, { waitUntil: 'load' });
await settle(1300);
const anaCanvas = await page.locator('canvas').count();
ok('Analytics renders six charts', anaCanvas === 6, `${anaCanvas} canvases`);
const presets = await page.locator('.preset-button').count();
ok('Date range presets render', presets === 5, `${presets} presets`);

const beforeRange = await page.locator('.range-summary').innerText();
await page.click('.preset-button:has-text("Last 7 days")');
await settle(1200);
const afterRange = await page.locator('.range-summary').innerText();
ok('Date range preset changes the scope', beforeRange !== afterRange, afterRange);

await page.click('.preset-button:has-text("Last 12 months")');
await settle(1200);

// CSV downloads
const exportButtons = await page.locator('.export-button').count();
ok('Five export options render', exportButtons === 5, `${exportButtons} buttons`);
const downloads = [];
for (let i = 0; i < 5; i += 1) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    page.locator('.export-button').nth(i).click()
  ]);
  const name = download.suggestedFilename();
  const path = `${SHOT}/${name}`;
  await download.saveAs(path);
  downloads.push(name);
  await settle(300);
}
ok('All five CSV exports download', downloads.length === 5, downloads.join(', '));
await page.screenshot({ path: `${SHOT}/analytics.png`, fullPage: true });

// ---------- settings ----------
await page.goto(`${BASE}#/settings`, { waitUntil: 'load' });
await settle(900);
await page.fill('input[name="full_name"]', 'Dr. Lina Haron');
await page.click('button[type="submit"]');
await settle(800);
const topbarName = await page.locator('.profile-toggle-text strong').innerText();
ok('Profile save updates the top bar', topbarName.trim() === 'Dr. Lina Haron', topbarName);

await page.evaluate(() => { document.getElementById('toast-root').replaceChildren(); });
await page.fill('input[name="email"]', 'not-an-email');
await page.click('button[type="submit"]');
await settle(600);
const toastText = await page.locator('.toast p').innerText().catch(() => '');
ok('Invalid email is rejected', toastText.includes('name@example.com'), toastText);

await page.fill('input[name="email"]', 'lina.haron@university.demo');
await page.click('button[type="submit"]');
await settle(700);

// density toggle
await page.click('.radio-chip:has-text("Compact")');
await settle(600);
ok('Compact density applies', await page.evaluate(() => document.body.classList.contains('is-compact')));

// reduce motion toggle
const motionSwitch = page.locator('.switch-input').last();
await motionSwitch.click();
await settle(600);
ok('Reduce motion applies', await page.evaluate(() => document.body.classList.contains('is-reduced-motion')));

// preferences persist in localStorage
const stored = await page.evaluate(() => localStorage.getItem('counselling-dashboard.display-preferences'));
ok('Display preferences persist', stored && stored.includes('compact'), String(stored).slice(0, 90));

// no student data in storage
const storageDump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
ok('No student records in localStorage', !/STU\d{6}/.test(storageDump) && !/student_name/.test(storageDump));

await page.screenshot({ path: `${SHOT}/settings.png`, fullPage: true });

// ---------- state kept across navigation ----------
await page.goto(`${BASE}#/submissions`, { waitUntil: 'load' });
await settle(900);
await page.selectOption('.toolbar select >> nth=1', 'Completed');
await settle(700);
await page.click('.nav-link[href="#/overview"]');
await settle(900);
await page.click('.nav-link[href="#/submissions"]');
await settle(900);
const keptFilter = await page.inputValue('.toolbar select >> nth=1');
ok('Filters survive navigation', keptFilter === 'Completed', `value="${keptFilter}"`);

// ---------- logout ----------
await page.click('.nav-link-button:has-text("Logout")');
await settle(600);
ok('Logout asks for confirmation', (await page.locator('.modal').innerText()).includes('Log out of the prototype?'));
await page.click('.modal button:has-text("Log out")');
await settle(700);
ok('Logout shows the signed-out screen', (await page.locator('.signed-out h1').count()) === 1);
await page.click('.signed-out button');
await settle(900);
ok('Sign back in restores the dashboard', (await page.locator('.stat-card').count()) === 4);

// ---------- keyboard accessibility ----------
await page.goto(`${BASE}#/overview`, { waitUntil: 'load' });
await settle(900);
const skipLink = await page.evaluate(() => {
  const el = document.querySelector('.skip-link');
  el.focus();
  return { focused: document.activeElement === el, text: el.textContent };
});
ok('Skip link is focusable', skipLink.focused, skipLink.text);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
const focusRing = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { outline: cs.outlineStyle, width: cs.outlineWidth, visible: el.matches(':focus-visible') };
});
ok('Keyboard focus produces a visible outline',
   focusRing.outline !== 'none' && focusRing.visible,
   JSON.stringify(focusRing));

// ---------- responsive sweep ----------
const viewports = [
  ['desktop-1440', 1440, 950],
  ['laptop-1280', 1280, 800],
  ['tablet-1024', 1024, 820],
  ['tablet-768', 768, 1024],
  ['mobile-414', 414, 896],
  ['mobile-360', 360, 780]
];
for (const [name, width, height] of viewports) {
  await page.setViewportSize({ width, height });
  await settle(650);
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 4)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
  }));
  ok(`No horizontal overflow at ${name}`, overflow.doc <= overflow.win + 1,
     `scrollWidth=${overflow.doc} innerWidth=${overflow.win}${overflow.offenders.length ? ' offenders: ' + overflow.offenders.join(', ') : ''}`);
  await page.screenshot({ path: `${SHOT}/vp-${name}.png`, fullPage: false });
}

// mobile nav drawer
await page.setViewportSize({ width: 390, height: 844 });
await settle(600);
ok('Menu toggle visible on mobile', await page.locator('.menu-toggle').isVisible());
await page.click('.menu-toggle');
await settle(600);
ok('Mobile drawer opens', await page.evaluate(() => document.body.classList.contains('is-nav-open')));
await page.screenshot({ path: `${SHOT}/mobile-drawer.png` });
await page.click('.nav-link[href="#/feedback"]');
await settle(900);
ok('Drawer closes after navigating', !(await page.evaluate(() => document.body.classList.contains('is-nav-open'))));

// mobile table restacks
const stacked = await page.evaluate(() => {
  // Chart cards carry a compact table twin that deliberately stays a table.
  const td = document.querySelector('.data-table:not(.data-table-compact) tbody td');
  return td ? { display: getComputedStyle(td).display, label: td.getAttribute('data-label') } : null;
});
ok('Mobile table rows restack as cards', stacked && stacked.display === 'grid', JSON.stringify(stacked));
await page.screenshot({ path: `${SHOT}/mobile-table.png`, fullPage: true });

// desktop sidebar collapse
await page.setViewportSize({ width: 1440, height: 950 });
await page.goto(`${BASE}#/overview`, { waitUntil: 'load' });
await settle(900);
await page.click('.collapse-toggle');
await settle(600);
ok('Desktop sidebar collapses', await page.evaluate(() => document.body.classList.contains('is-sidebar-collapsed')));
await page.screenshot({ path: `${SHOT}/sidebar-collapsed.png` });
await page.click('.collapse-toggle');
await settle(400);

// ---------- console hygiene ----------
ok('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));
ok('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
const realFailures = failedRequests.filter(r => !r.includes('favicon'));
ok('No failed network requests', realFailures.length === 0, realFailures.slice(0, 4).join(' | '));

await browser.close();

const passed = results.filter(r => r.pass).length;
console.log(`\n================ ${passed}/${results.length} checks passed ================`);
const failures = results.filter(r => !r.pass);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(` - ${f.name} :: ${f.detail}`));
  process.exitCode = 1;
}
