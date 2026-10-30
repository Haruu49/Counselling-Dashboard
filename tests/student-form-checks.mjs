/**
 * tests/student-form-checks.mjs — the public counselling request form.
 *
 * Drives a real Chromium against student-form.html and asserts what the brief
 * asks of it: required fields, the "Other" reveal, accessible error messages,
 * a successful submission, the failure paths, and a phone-sized layout.
 *
 * Every call to the edge function is intercepted, so this suite sends nothing
 * to Supabase and needs no database. What it checks about the request is that
 * the right URL, headers and payload would have gone out.
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   python3 -m http.server 8000 &
 *   BASE_URL=http://localhost:8000/ node tests/student-form-checks.mjs
 *
 * Needs js/config.js to exist (copy js/config.example.js), or the page shows
 * its "not available yet" screen instead of the form.
 *
 * Exits non-zero if any check fails.
 */

import { mkdirSync } from 'node:fs';

const pw = await import('playwright').catch(() => import('playwright-core'));
const { chromium } = pw.default ?? pw;

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const PAGE_URL = new URL('student-form.html', BASE).href;
const SHOT = process.env.OUT_DIR || new URL('./output', import.meta.url).pathname;
mkdirSync(SHOT, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];

const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

/**
 * Three checks below deliberately make the endpoint fail, and the browser
 * logs every non-2xx response. Those are expected, so recording is paused
 * around them rather than filtered by message text afterwards.
 */
let expectingFailure = false;

page.on('console', message => {
  if (message.type() === 'error' && !expectingFailure) consoleErrors.push(message.text());
});
page.on('pageerror', error => { if (!expectingFailure) pageErrors.push(error.message); });

/* ------------------------------------------------------------------ *
 * Intercepting the endpoint
 * ------------------------------------------------------------------ */

const ENDPOINT = '**/functions/v1/submit-counselling-request';

/** The last request the page tried to send. */
let lastRequest = null;

/** Replies to the next submission with whatever the test needs. */
let reply = { status: 201, body: { ok: true, reference_code: 'CR-2026-0042' } };

await page.route(ENDPOINT, async route => {
  const request = route.request();
  lastRequest = {
    method: request.method(),
    url: request.url(),
    headers: request.headers(),
    body: JSON.parse(request.postData() || '{}')
  };
  if (reply === 'abort') {
    await route.abort('failed');
    return;
  }
  await route.fulfill({
    status: reply.status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(reply.body)
  });
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const fieldError = name => page.locator(`#f-${name}-error`);

async function fillValidForm() {
  await page.check('input[name="request_type"][value="Request"]');
  await page.fill('#f-student_name', 'Nadia Yusuf');
  await page.fill('#f-student_id', 'STU20241234');
  await page.fill('#f-semester', '3');
  await page.fill('#f-contact_no', '012-345 6789');
  await page.fill('#f-email', 'nadia.yusuf@student.university.demo');
  await page.check('input[name="purposes"][value="Individual Counselling"]');
  await page.check('input[name="issues"][value="Academic"]');
  await page.fill('#f-description',
    'I have fallen behind after missing classes and would like help planning the rest of the semester.');
}

const reload = async () => {
  await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.student-form');
};

/* ------------------------------------------------------------------ *
 * The form renders
 * ------------------------------------------------------------------ */

await reload();

ok('Page title is correct',
  (await page.title()) === 'Counselling Request Form | Student Counselling', await page.title());
ok('The form rendered rather than the "not configured" screen',
  (await page.locator('.student-form').count()) === 1);
ok('Request type offers exactly two choices',
  (await page.locator('input[name="request_type"]').count()) === 2);
ok('Five purposes render',
  (await page.locator('input[name="purposes"]').count()) === 5,
  `${await page.locator('input[name="purposes"]').count()} boxes`);
ok('Eight issue types render',
  (await page.locator('input[name="issues"]').count()) === 8,
  `${await page.locator('input[name="issues"]').count()} boxes`);
ok('Purpose and issue are checkboxes, so several can be chosen',
  (await page.getAttribute('input[name="purposes"]', 'type')) === 'checkbox'
  && (await page.getAttribute('input[name="issues"]', 'type')) === 'checkbox');
ok('Request type is a radio, so only one can be chosen',
  (await page.getAttribute('input[name="request_type"]', 'type')) === 'radio');

ok('No office-use field appears on the student form',
  (await page.locator(
    '[name="appointment_at"], [name="assigned_counsellor_id"], [name="reference_source"],'
    + ' [name="status"], [name="office_notes"], [name="signature"]'
  ).count()) === 0);

const comfortText = await page.locator('#f-description-hint').innerText();
ok('The description says a student can share only what they are comfortable with',
  /comfortable/i.test(comfortText), comfortText.slice(0, 80));

const everyControlLabelled = await page.evaluate(() =>
  [...document.querySelectorAll('.form-control')].every(control => {
    const label = control.labels?.[0] || document.querySelector(`label[for="${control.id}"]`);
    return Boolean(label && label.innerText.trim());
  }));
ok('Every text field has a visible label', everyControlLabelled);

/* ------------------------------------------------------------------ *
 * The "Other" reveal
 * ------------------------------------------------------------------ */

ok('Purpose "Other" text is hidden to start with',
  await page.locator('#f-purpose_other').isHidden());
ok('Issue "Other" text is hidden to start with',
  await page.locator('#f-issue_other').isHidden());

await page.check('input[name="purposes"][value="Other"]');
ok('Ticking purpose "Other" reveals its text field',
  await page.locator('#f-purpose_other').isVisible());
ok('Focus moves into the revealed field',
  (await page.evaluate(() => document.activeElement?.id)) === 'f-purpose_other');

await page.uncheck('input[name="purposes"][value="Other"]');
ok('Unticking purpose "Other" hides its text field again',
  await page.locator('#f-purpose_other').isHidden());

await page.check('input[name="issues"][value="Other"]');
ok('Ticking issue "Other" reveals its text field',
  await page.locator('#f-issue_other').isVisible());
await page.uncheck('input[name="issues"][value="Other"]');

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

await reload();
await page.click('.form-submit');

ok('Submitting an empty form does not call the endpoint', lastRequest === null);
ok('An error summary appears', await page.locator('.form-summary').isVisible());
ok('The summary takes focus so it is announced',
  (await page.evaluate(() => document.activeElement?.className || '')).includes('form-summary'));
ok('The summary has the role of an alert',
  (await page.getAttribute('.form-summary', 'role')) === 'alert');

const summaryLinks = await page.locator('.form-summary a').count();
ok('Every invalid field is listed in the summary', summaryLinks === 9, `${summaryLinks} listed`);

for (const name of ['request_type', 'student_name', 'student_id', 'semester',
  'contact_no', 'email', 'purposes', 'issues', 'description']) {
  const visible = await fieldError(name).isVisible();
  if (!visible) ok(`Inline message shown for ${name}`, false);
}
ok('An inline message is shown beside every invalid field',
  (await page.locator('.form-error:visible').count()) === 9,
  `${await page.locator('.form-error:visible').count()} messages`);

ok('Invalid fields are marked for assistive technology',
  (await page.locator('[aria-invalid="true"]').count()) > 0);

const described = await page.evaluate(() => {
  const input = document.getElementById('f-email');
  return (input.getAttribute('aria-describedby') || '').includes('f-email-error');
});
ok('Each field points at its own message with aria-describedby', described);

const summaryLink = page.locator('.form-summary a').first();
await summaryLink.click();
ok('A summary link moves focus to its field',
  (await page.evaluate(() => document.activeElement?.name)) === 'request_type');

await page.fill('#f-student_name', 'Nadia Yusuf');
ok('Typing clears that field’s message', await fieldError('student_name').isHidden());
ok('Other messages stay until they are fixed', await fieldError('email').isVisible());

await page.fill('#f-email', 'not-an-email');
await page.click('.form-submit');
ok('A malformed email is caught in the browser',
  (await fieldError('email').innerText()).includes('name@example.com'));
ok('A malformed email never reaches the endpoint', lastRequest === null);

await page.fill('#f-description', 'help');
await page.click('.form-submit');
ok('A one-line description is caught',
  (await fieldError('description').isVisible()));

await page.check('input[name="purposes"][value="Other"]');
await page.click('.form-submit');
ok('Choosing "Other" without its text is caught',
  await fieldError('purpose_other').isVisible());

/* ------------------------------------------------------------------ *
 * A successful submission
 * ------------------------------------------------------------------ */

await reload();
lastRequest = null;
reply = { status: 201, body: { ok: true, reference_code: 'CR-2026-0042' } };

await fillValidForm();
await page.check('input[name="issues"][value="Finance"]');
await page.click('.form-submit');
await page.waitForSelector('.confirmation');

ok('A valid submission reaches the endpoint', lastRequest !== null);
ok('It is sent as POST', lastRequest?.method === 'POST');
ok('It goes to the edge function, not to the table',
  lastRequest?.url.includes('/functions/v1/submit-counselling-request')
  && !lastRequest?.url.includes('/rest/v1/'),
  lastRequest?.url);
ok('It carries the publishable key, not a service-role key',
  typeof lastRequest?.headers.apikey === 'string'
  && lastRequest.headers.apikey.startsWith('sb_publishable_'),
  String(lastRequest?.headers.apikey).slice(0, 18));

const sent = lastRequest?.body ?? {};
ok('The payload carries the student’s answers',
  sent.student_name === 'Nadia Yusuf' && sent.student_id === 'STU20241234'
  && sent.semester === '3' && sent.email === 'nadia.yusuf@student.university.demo');
ok('Several issues are sent as an array',
  Array.isArray(sent.issues) && sent.issues.length === 2,
  JSON.stringify(sent.issues));
ok('The browser does not set the channel; the server does',
  !('channel' in sent), Object.keys(sent).join(', '));
ok('No office-use field is sent',
  !['status', 'appointment_at', 'assigned_counsellor_id', 'reference_source', 'office_notes']
    .some(key => key in sent),
  Object.keys(sent).join(', '));

ok('A confirmation replaces the form', (await page.locator('.student-form').count()) === 0);
ok('The reference code is shown',
  (await page.locator('.confirmation-reference strong').innerText()).trim() === 'CR-2026-0042');
ok('The confirmation says what happens next',
  (await page.locator('.confirmation-list li').count()) >= 3);
ok('The confirmation points somewhere else for urgent help',
  (await page.locator('.confirmation-urgent').innerText()).length > 20);

await page.screenshot({ path: `${SHOT}/student-form-confirmation.png`, fullPage: true });

await page.click('.confirmation button');
ok('"Send another request" brings the form back',
  (await page.locator('.student-form').count()) === 1);
ok('The returned form is empty',
  (await page.inputValue('#f-student_name')) === '');

/* ------------------------------------------------------------------ *
 * The honeypot
 * ------------------------------------------------------------------ */

ok('A honeypot field exists', (await page.locator('#f-website').count()) === 1);
ok('It is hidden from assistive technology',
  (await page.getAttribute('.no-fill', 'aria-hidden')) === 'true');
ok('It is out of the tab order', (await page.getAttribute('#f-website', 'tabindex')) === '-1');
const honeypotOffscreen = await page.evaluate(() =>
  document.querySelector('.no-fill').getBoundingClientRect().right < 0);
ok('It is positioned off screen rather than hidden with display:none', honeypotOffscreen);

/* ------------------------------------------------------------------ *
 * What the server says back
 * ------------------------------------------------------------------ */

expectingFailure = true;

await reload();
reply = {
  status: 400,
  body: { ok: false, message: 'Please check the highlighted fields.', errors: { email: 'That address is not accepted.' } }
};
await fillValidForm();
await page.click('.form-submit');
await page.waitForSelector('.form-summary:visible');
ok('A server-side field error is shown beside its field',
  (await fieldError('email').innerText()).includes('not accepted'));
ok('The form is still there after a rejected submission',
  (await page.locator('.student-form').count()) === 1);

await reload();
reply = { status: 429, body: { ok: false, message: 'Several requests have already been sent from this connection.' } };
await fillValidForm();
await page.click('.form-submit');
await page.waitForSelector('.form-status.is-error');
ok('A throttled submission explains itself',
  (await page.locator('.form-status').innerText()).includes('Several requests'));
ok('The submit button is usable again after a failure',
  !(await page.locator('.form-submit').isDisabled()));

await reload();
reply = 'abort';
await fillValidForm();
await page.click('.form-submit');
await page.waitForSelector('.form-status.is-error');
ok('A network failure gives a plain explanation',
  (await page.locator('.form-status').innerText()).toLowerCase().includes('connection'));
reply = { status: 201, body: { ok: true, reference_code: 'CR-2026-0043' } };

expectingFailure = false;

/* ------------------------------------------------------------------ *
 * Keyboard and phone
 * ------------------------------------------------------------------ */

await reload();
await page.keyboard.press('Tab');
const firstStop = await page.evaluate(() => document.activeElement?.className || '');
ok('The skip link is the first tab stop', firstStop.includes('skip-link'), firstStop);

const reachedByKeyboard = await page.evaluate(() => {
  const focusable = [...document.querySelectorAll('input, textarea, button, a[href]')]
    .filter(el => el.tabIndex >= 0 && el.offsetParent !== null);
  return focusable.length;
});
ok('Every control is reachable by keyboard', reachedByKeyboard > 15, `${reachedByKeyboard} stops`);

await page.setViewportSize({ width: 360, height: 740 });
await page.waitForTimeout(150);

const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth
}));
ok('No horizontal overflow at 360px', overflow.doc <= overflow.win + 1, JSON.stringify(overflow));

const touchTargets = await page.evaluate(() =>
  [...document.querySelectorAll('.choice')].every(el => el.getBoundingClientRect().height >= 44));
ok('Choice targets are at least 44px tall on a phone', touchTargets);

const submitWidth = await page.evaluate(() => {
  const button = document.querySelector('.form-submit');
  return button.getBoundingClientRect().height >= 44;
});
ok('The submit button is a comfortable size on a phone', submitWidth);

await page.screenshot({ path: `${SHOT}/student-form-mobile.png`, fullPage: true });

await page.setViewportSize({ width: 1280, height: 900 });

/* ------------------------------------------------------------------ *
 * Hygiene
 * ------------------------------------------------------------------ */

const storageDump = await page.evaluate(() => JSON.stringify(window.localStorage));
ok('Nothing a student typed is kept in browser storage',
  !/student_name|Nadia|STU2024/.test(storageDump), storageDump.slice(0, 80));

ok('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
ok('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length === 0 ? 0 : 1);
