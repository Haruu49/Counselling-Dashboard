/**
 * tests/dashboard-request-checks.mjs — the counsellor side of a counselling
 * request, against a mocked Supabase.
 *
 * Every Supabase call is intercepted and answered from the fixtures below, so
 * this suite touches no project, needs no applied migration and no account.
 * What it verifies is the dashboard's own behaviour: that a request reaches
 * the queue, reads correctly in the detail dialog, and that saving the office
 * fields sends those columns and nothing else.
 *
 * What it cannot verify, and tests/sql-checks.sh covers instead: that the
 * access rules actually hold. A mock answers whatever it is asked. The two
 * suites together are the argument; neither is on its own.
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   python3 -m http.server 8000 &
 *   BASE_URL=http://localhost:8000/ node tests/dashboard-request-checks.mjs
 */

import { mkdirSync } from 'node:fs';

const pw = await import('playwright').catch(() => import('playwright-core'));
const { chromium } = pw.default ?? pw;

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const SHOT = process.env.OUT_DIR || new URL('./output', import.meta.url).pathname;
mkdirSync(SHOT, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

/* ------------------------------------------------------------------ *
 * Fixtures — fictional, as the brief requires
 * ------------------------------------------------------------------ */

const COUNSELLOR_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'lina.haron@counselling.demo';

const profile = {
  user_id: COUNSELLOR_ID,
  full_name: 'Dr. Lina Haron',
  role: 'Senior Counsellor',
  department: 'Student Counselling Unit',
  initials: 'LH',
  avatar_url: null,
  email: EMAIL
};

const firstRequest = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  reference_code: 'CR-2026-0001',
  request_type: 'Request',
  channel: 'Online',
  student_name: 'Nadia Yusuf',
  student_id: 'STU20241234',
  semester: '3',
  contact_no: '012-345 6789',
  email: 'nadia.yusuf@student.university.demo',
  purposes: ['Individual Counselling', 'Guidance'],
  purpose_other: null,
  issues: ['Academic', 'Other'],
  issue_other: 'Placement worries',
  description: 'I have fallen behind after missing classes and would like help planning the rest of the semester.',
  status: 'New',
  reference_source: null,
  appointment_at: null,
  assigned_counsellor_id: null,
  office_notes: null,
  submitted_at: new Date(Date.now() - 3600_000).toISOString(),
  updated_at: new Date(Date.now() - 3600_000).toISOString()
};

const arrivingRequest = {
  ...firstRequest,
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  reference_code: 'CR-2026-0002',
  request_type: 'Referral',
  student_name: 'Haziq Rahman',
  student_id: 'STU20240077',
  purposes: ['Psychometric Test'],
  issues: ['Career'],
  issue_other: null,
  description: 'My lecturer suggested I speak to someone about choosing a specialisation.',
  submitted_at: new Date().toISOString()
};

/** The queue the mock serves. The arriving request is added mid-suite. */
let queue = [firstRequest];

/** Every PATCH the page sent, so the payload can be inspected. */
const patches = [];

const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = [
  base64url({ alg: 'HS256', typ: 'JWT' }),
  base64url({
    sub: COUNSELLOR_ID, aud: 'authenticated', role: 'authenticated',
    email: EMAIL, exp: Math.floor(Date.now() / 1000) + 3600
  }),
  'not-a-real-signature'
].join('.');

const user = {
  id: COUNSELLOR_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: EMAIL,
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: profile.full_name },
  created_at: new Date().toISOString()
};

const session = {
  access_token: accessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'fictional-refresh-token',
  user
};

/* ------------------------------------------------------------------ *
 * Browser
 * ------------------------------------------------------------------ */

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();

page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', error => pageErrors.push(error.message));

/** Realtime runs over a websocket, which route() does not cover. */
let realtimeSocketUrl = null;
page.on('websocket', socket => { realtimeSocketUrl = socket.url(); });

/** Each PostgREST read the page made, for asserting what it asked for. */
const reads = [];

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body)
});

await page.route('**/auth/v1/**', async route => {
  const url = route.request().url();
  if (url.includes('/token')) return json(route, session);
  if (url.includes('/user')) return json(route, user);
  if (url.includes('/logout')) return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  return json(route, {});
});

await page.route('**/rest/v1/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.split('/').pop();
  const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');

  if (request.method() === 'PATCH') {
    const body = JSON.parse(request.postData() || '{}');
    patches.push({ table, body, query: url.search });
    const index = queue.findIndex(row => url.search.includes(row.id));
    if (index >= 0) queue[index] = { ...queue[index], ...body, updated_at: new Date().toISOString() };
    const updated = queue[index] ?? null;
    return json(route, wantsObject ? updated : [updated]);
  }

  reads.push({ table, query: url.search });

  if (table === 'counsellor_profiles') {
    const rows = url.search.includes('active=eq.true') && !url.search.includes('user_id=eq.')
      ? [profile]
      : [profile];
    return json(route, wantsObject ? rows[0] : rows);
  }
  if (table === 'counselling_requests') {
    return json(route, wantsObject ? queue[0] : queue);
  }
  return json(route, []);
});

/* ------------------------------------------------------------------ *
 * Sign in
 * ------------------------------------------------------------------ */

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('.auth-form');

await page.fill('#auth-email', EMAIL);
await page.fill('#auth-password', 'fictional-password');
await page.click('.auth-submit');
await page.waitForSelector('.stat-card', { timeout: 20000 });

ok('A counsellor signs in and reaches the dashboard',
  (await page.locator('.stat-card').count()) === 4);
ok('The sidebar shows the counsellor from counsellor_profiles',
  (await page.locator('.sidebar-profile strong').innerText()).trim() === 'Dr. Lina Haron');
ok('Their role comes from the profile row too',
  (await page.locator('.sidebar-profile small').innerText()).trim() === 'Senior Counsellor');

const queueRead = reads.find(read => read.table === 'counselling_requests');
ok('The queue is read once at sign-in', Boolean(queueRead));
ok('It asks for newest first',
  queueRead?.query.includes('order=submitted_at.desc'), queueRead?.query);
ok('It names the columns it wants rather than selecting everything',
  queueRead?.query.includes('select=') && queueRead.query.includes('reference_code'),
  queueRead?.query.slice(0, 60));

// The socket is opened asynchronously once the channel subscribes.
if (!realtimeSocketUrl) {
  await page.waitForEvent('websocket', { timeout: 10000 }).catch(() => {});
}
ok('A realtime websocket is opened to the project',
  Boolean(realtimeSocketUrl) && realtimeSocketUrl.includes('/realtime/v1/'),
  String(realtimeSocketUrl).slice(0, 70));

/* ------------------------------------------------------------------ *
 * The request reaches the queue
 * ------------------------------------------------------------------ */

await page.goto(`${BASE}#/submissions`, { waitUntil: 'load' });
await page.waitForSelector('.data-table tbody tr');
await page.waitForTimeout(400);

await page.selectOption('.toolbar-fields select >> nth=0', 'Counselling Request');
await page.waitForTimeout(600);

const requestRows = await page.locator('.data-table tbody tr').count();
ok('Filtering by Counselling Request shows the live row', requestRows === 1, `${requestRows} rows`);
ok('The student name is in the queue',
  (await page.locator('.data-table tbody').innerText()).includes('Nadia Yusuf'));
ok('The student ID is in the queue',
  (await page.locator('.data-table tbody').innerText()).includes('STU20241234'));
ok('It is marked New',
  (await page.locator('.data-table tbody tr').first().locator('.chip').nth(1).innerText()).includes('New'),
  await page.locator('.data-table tbody tr').first().innerText());

/* ------------------------------------------------------------------ *
 * Reading it
 * ------------------------------------------------------------------ */

await page.click('.data-table tbody button:has-text("View")');
await page.waitForSelector('.modal[role="dialog"]');
const dialog = await page.locator('.modal').innerText();

ok('The dialog opens on the request', (await page.locator('.modal[role="dialog"]').count()) === 1);
ok('It is titled by the request type', (await page.locator('.modal-title').innerText()).toLowerCase().includes('request'));
ok('Student details are shown', dialog.includes('Nadia Yusuf') && dialog.includes('STU20241234'));
ok('The semester the student typed is shown', dialog.includes('3'));
ok('The contact number is shown', dialog.includes('012-345 6789'));
ok('The email is shown', dialog.includes('nadia.yusuf@student.university.demo'));
ok('The reference code is shown', dialog.includes('CR-2026-0001'));
ok('Every chosen purpose is shown',
  dialog.includes('Individual Counselling') && dialog.includes('Guidance'));
ok('Every chosen issue is shown', dialog.includes('Academic'));
ok('The "Other" issue shows the text beside it',
  dialog.includes('Other — Placement worries'), dialog.match(/Other[^\n]*/)?.[0]);
ok('The brief description is shown in full',
  dialog.includes('I have fallen behind after missing classes'));
ok('The submission channel is recorded as Online', dialog.includes('Online'));

/* ------------------------------------------------------------------ *
 * The office-use half
 * ------------------------------------------------------------------ */

ok('The office-use panel is present', (await page.locator('.office-panel').count()) === 1);
ok('It is labelled as office use only',
  (await page.locator('.office-panel legend').innerText()).toLowerCase().includes('office use'));
ok('Reference source can be set', (await page.locator('#office-source').count()) === 1);
ok('Appointment date can be set', (await page.locator('#office-date').count()) === 1);
ok('Appointment time can be set', (await page.locator('#office-time').count()) === 1);
ok('A counsellor can be assigned', (await page.locator('#office-counsellor').count()) === 1);
ok('Office notes can be written', (await page.locator('#office-notes').count()) === 1);
ok('The assigned-counsellor list is filled from counsellor_profiles',
  (await page.locator('#office-counsellor option').allInnerTexts()).includes('Dr. Lina Haron'));

const studentFieldsEditable = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  return [...modal.querySelectorAll('input, textarea, select')]
    .map(el => el.id)
    .filter(id => ['f-student_name', 'f-description', 'f-email'].includes(id)).length;
});
ok('Nothing the student wrote is editable in the dialog', studentFieldsEditable === 0);

await page.screenshot({ path: `${SHOT}/request-detail.png`, fullPage: false });

await page.selectOption('#office-source', 'TTO/Lecturer');
await page.fill('#office-date', '2026-11-12');
await page.fill('#office-time', '14:30');
await page.selectOption('#office-counsellor', COUNSELLOR_ID);
await page.fill('#office-notes', 'Booked a first session in room 2.');
await page.click('.office-form button[type="submit"]');
await page.waitForTimeout(900);

const patch = patches.at(-1);
ok('Saving sends a PATCH to counselling_requests', patch?.table === 'counselling_requests');
ok('It targets that one row by id', patch?.query.includes(firstRequest.id), patch?.query);
ok('It sets the reference source', patch?.body.reference_source === 'TTO/Lecturer');
ok('It sets the appointment', typeof patch?.body.appointment_at === 'string'
  && patch.body.appointment_at.includes('2026-11-12'), String(patch?.body.appointment_at));
ok('It assigns the counsellor', patch?.body.assigned_counsellor_id === COUNSELLOR_ID);
ok('It saves the notes', patch?.body.office_notes === 'Booked a first session in room 2.');

const sentKeys = Object.keys(patch?.body ?? {});
const studentColumns = ['student_name', 'student_id', 'semester', 'contact_no', 'email',
  'purposes', 'issues', 'description', 'request_type', 'channel', 'reference_code', 'submitted_at'];
ok('It sends no column the student filled in',
  studentColumns.every(column => !sentKeys.includes(column)), sentKeys.join(', '));

ok('The dialog closes after saving', (await page.locator('.modal[role="dialog"]').count()) === 0);
ok('A confirmation toast is shown', (await page.locator('.toast').count()) >= 1);

/* ------------------------------------------------------------------ *
 * Status, through the shared control
 * ------------------------------------------------------------------ */

await page.click('.data-table tbody button:has-text("View")');
await page.waitForSelector('.modal[role="dialog"]');
await page.click('.status-actions button:has-text("Under Review")');
await page.waitForTimeout(900);

const statusPatch = patches.at(-1);
ok('Setting the status patches only the status',
  statusPatch?.body.status === 'Under Review' && Object.keys(statusPatch.body).length === 1,
  JSON.stringify(statusPatch?.body));
ok('The queue shows the new status',
  (await page.locator('.data-table tbody').innerText()).includes('Under Review'));

/* ------------------------------------------------------------------ *
 * A new request arriving
 *
 * app.js answers a realtime event by re-reading the table and raising
 * `requests:changed`. The websocket itself cannot be driven from here, so the
 * same two steps are run directly against the loaded modules — the path a
 * real event takes, minus the socket that triggers it.
 * ------------------------------------------------------------------ */

const rowsBefore = await page.locator('.data-table tbody tr').count();
queue = [arrivingRequest, ...queue];

const added = await page.evaluate(async () => {
  const data = await import('/js/data.js');
  const notifications = await import('/js/notifications.js');
  const result = await data.refreshCounsellingRequests();
  await notifications.refreshBadge();
  document.dispatchEvent(new CustomEvent('requests:changed'));
  return result.added.length;
});
await page.waitForTimeout(900);

ok('Re-reading the queue finds the new request', added === 1, `${added} added`);
const rowsAfter = await page.locator('.data-table tbody tr').count();
ok('It appears in the table without a page reload', rowsAfter === rowsBefore + 1,
  `${rowsBefore} then ${rowsAfter}`);
ok('The new student name is in the queue',
  (await page.locator('.data-table tbody').innerText()).includes('Haziq Rahman'));
await page.click('.data-table tbody tr:has-text("Haziq Rahman") button:has-text("View")');
await page.waitForSelector('.modal[role="dialog"]');
ok('A referral is titled as a referral, not a request',
  (await page.locator('.modal-title').innerText()).toLowerCase().includes('referral'),
  await page.locator('.modal-title').innerText());
ok('The referral shows its own reference code',
  (await page.locator('.modal').innerText()).includes('CR-2026-0002'));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

ok('The notification badge counts the new request',
  !(await page.locator('.notification-badge').isHidden()),
  await page.locator('.notification-badge').innerText().catch(() => ''));

await page.click('.notification-toggle');
await page.waitForTimeout(400);
const panelText = await page.locator('.dropdown-notifications').innerText();
ok('The notification names the student', panelText.includes('Haziq Rahman'), panelText.slice(0, 80));
ok('The notification carries the reference code', panelText.includes('CR-2026-0002'));

await page.screenshot({ path: `${SHOT}/queue-after-arrival.png`, fullPage: false });
await page.keyboard.press('Escape');

/* ------------------------------------------------------------------ *
 * The existing dashboard still works
 * ------------------------------------------------------------------ */

for (const [path, selector, label] of [
  ['wellbeing', '.stat-card', 'Wellbeing Assessment'],
  ['feedback', '.data-table', 'Feedback Management'],
  ['analytics', 'canvas', 'Analytics & Reports'],
  ['registration', '.data-table', 'Counselling Registration'],
  ['settings', '.settings-form', 'Settings']
]) {
  await page.goto(`${BASE}#/${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  ok(`${label} still renders`, (await page.locator(selector).count()) > 0);
}

await page.goto(`${BASE}#/overview`, { waitUntil: 'load' });
await page.waitForTimeout(1100);
const total = Number((await page.locator('.stat-card .stat-value').nth(1).innerText()).replace(/\D/g, ''));
ok('Overview counts include the live requests', total > 100, String(total));

ok('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

// supabase-js retries the realtime socket, which the mock cannot answer; that
// is the only network error this suite expects.
const unexpected = consoleErrors.filter(text =>
  !/websocket|realtime|WebSocket/i.test(text));
ok('No unexpected console errors', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) failed.forEach(f => console.log(` - ${f.name} :: ${f.detail}`));
process.exit(failed.length === 0 ? 0 : 1);
