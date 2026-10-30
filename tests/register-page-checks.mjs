/**
 * tests/register-page-checks.mjs — the counsellor registration page at
 * #/register.
 *
 * Every network call is intercepted and answered here, so this suite touches
 * no project and creates no account. What it verifies is the page's own
 * behaviour: that it opens with no session and reads nothing, that a bad
 * field is caught before a round trip, that the values sent are the
 * normalised ones, that each refusal lands beside the right field, and that
 * no password or personal detail reaches the console.
 *
 * Registration is open — there is no code to type — so nothing here checks
 * one, and one check asserts the field is gone.
 *
 * What it cannot verify, and tests/sql-checks.sh covers instead: that only an
 * approved sign-up becomes an active counsellor. A mock answers whatever it
 * is asked.
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   python3 -m http.server 8000 &
 *   BASE_URL=http://localhost:8000/ node tests/register-page-checks.mjs
 */

import { mkdirSync } from 'node:fs';

const pw = await import('playwright').catch(() => import('playwright-core'));
const { chromium } = pw.default ?? pw;

const BASE = process.env.BASE_URL || 'http://localhost:8000/';
const SHOT = process.env.OUT_DIR || new URL('./output', import.meta.url).pathname;
mkdirSync(SHOT, { recursive: true });

const results = [];
const consoleMessages = [];
const pageErrors = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

/* ------------------------------------------------------------------ *
 * Fixtures — fictional, as the brief requires
 * ------------------------------------------------------------------ */

const COUNSELLOR = {
  full_name: 'Dr. Lina  Haron',
  staff_id: 'staff2041',
  phone: '012-3456789',
  email: 'Lina.Haron@Counselling.Example.Edu',
  password: 'Kaunseling2026',
  confirm_password: 'Kaunseling2026'
};

/** What the fields above must become on the wire. */
const NORMALISED = {
  full_name: 'Dr. Lina Haron',
  staff_id: 'STAFF2041',
  phone: '+60123456789',
  email: 'lina.haron@counselling.example.edu',
  password: 'Kaunseling2026'
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

page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
page.on('pageerror', error => pageErrors.push(error.message));

/** Every call the page made, and how the next registration is answered. */
const posts = [];
const signIns = [];
const reads = [];
let answer = { status: 201, body: { ok: true, created: true } };
let signInAnswer = {
  status: 200,
  body: {
    access_token: 'test-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh',
    user: { id: '11111111-1111-4111-8111-111111111111', email: NORMALISED.email, aud: 'authenticated' }
  }
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

await page.route('**/functions/v1/register-counsellor', route => {
  const request = route.request();
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  posts.push({
    body: JSON.parse(request.postData() || 'null'),
    headers: request.headers()
  });
  return route.fulfill({
    status: answer.status,
    contentType: 'application/json',
    headers: cors,
    body: JSON.stringify(answer.body)
  });
});

await page.route('**/auth/v1/**', route => {
  const url = route.request().url();
  if (/token\?/.test(url)) {
    signIns.push(JSON.parse(route.request().postData() || 'null'));
    return route.fulfill({
      status: signInAnswer.status,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(signInAnswer.body)
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
});

await page.route('**/rest/v1/**', route => {
  reads.push({ url: route.request().url(), method: route.request().method() });
  return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '[]' });
});

const fill = async (values = COUNSELLOR) => {
  for (const [name, value] of Object.entries(values)) await page.fill(`#r-${name}`, value);
};

/**
 * A full load every time. Going straight from one #/register to the next is a
 * same-document navigation, which would leave the previous card on screen.
 *
 * Waits for a field only this page has: `.auth-form` is the sign-in card's
 * class too, so waiting on that can match the card still on screen while the
 * session is being read.
 */
const openRegister = async () => {
  await page.goto('about:blank');
  await page.goto(`${BASE}#/register`, { waitUntil: 'load' });
  await page.waitForSelector('#r-confirm_password', { timeout: 10000 });
};

/** Fills in, waits past the minimum fill time, and submits. */
const submit = async (values = COUNSELLOR) => {
  await fill(values);
  await page.waitForTimeout(1400);
  await page.click('.auth-submit');
  await page.waitForTimeout(600);
};

/* ------------------------------------------------------------------ *
 * It opens without a session, and reads nothing
 * ------------------------------------------------------------------ */

await openRegister();

ok('#/register opens without signing in', (await page.locator('#r-full_name').count()) === 1);
ok('The sign-in password field is not on the page', (await page.locator('#auth-password').count()) === 0);
ok('The dashboard shell is not rendered', (await page.locator('.sidebar .nav-link').count()) === 0);
ok('No record was read while signed out', reads.length === 0, JSON.stringify(reads.slice(0, 3)));
ok('The heading says what the page is for',
  (await page.locator('.auth-card h1').innerText()).toLowerCase().includes('register as a counsellor'));
ok('The page says it is for staff, not students',
  (await page.locator('.auth-lede').innerText()).toLowerCase().includes('counselling staff'));
ok('It says plainly what an account can read',
  (await page.locator('.auth-foot').first().innerText())
    .includes('can read every student'));
ok('There is a way back to sign in',
  (await page.locator('.auth-links a').innerText()).includes('Back to sign in'));
await page.screenshot({ path: `${SHOT}/register-counsellor-empty.png` });

/* ------------------------------------------------------------------ *
 * The fields, labelled and reachable
 * ------------------------------------------------------------------ */

for (const [name, label] of [
  ['full_name', 'Full name'],
  ['staff_id', 'Staff ID'],
  ['phone', 'Phone number'],
  ['email', 'Email address'],
  ['password', 'Password'],
  ['confirm_password', 'Password again']
]) {
  ok(`${label} has a label tied to its input`,
    (await page.locator(`label[for="r-${name}"]`).count()) === 1);
  ok(`${label} is described by its error line`,
    (await page.getAttribute(`#r-${name}`, 'aria-describedby') || '').includes(`r-${name}-error`));
}

ok('There are exactly six fields and no code',
  (await page.locator('.auth-form input:not(.honeypot)').count()) === 6,
  String(await page.locator('.auth-form input:not(.honeypot)').count()));
ok('No field asks for a registration code',
  (await page.locator('#r-registration_code').count()) === 0
  && !(await page.locator('.auth-card').innerText()).toLowerCase().includes('registration code'));
ok('Both password fields are masked',
  (await page.locator('.auth-form input[type="password"]').count()) === 2);
ok('The password fields ask the browser for a new password, not a saved one',
  (await page.getAttribute('#r-password', 'autocomplete')) === 'new-password'
  && (await page.getAttribute('#r-confirm_password', 'autocomplete')) === 'new-password');
ok('The honeypot is present and off screen',
  (await page.locator('input.honeypot').count()) === 1
  && (await page.locator('input.honeypot').boundingBox().catch(() => null))?.x < 0);
ok('The error summary is announced', (await page.getAttribute('.auth-message', 'role')) === 'alert');

/* ------------------------------------------------------------------ *
 * An empty submit, straight away
 *
 * This is also the spam-trap regression: the minimum fill time must not turn
 * an impatient click into a fake success.
 * ------------------------------------------------------------------ */

await page.click('.auth-submit');
await page.waitForTimeout(250);

const emptyErrors = await page.locator('.field-error:visible').count();
ok('An empty form reports every field that is missing', emptyErrors === 5, String(emptyErrors));
ok('An empty form is not sent', posts.length === 0);
ok('No account is created by an empty form', signIns.length === 0);
ok('An invalid field is marked aria-invalid',
  (await page.getAttribute('#r-full_name', 'aria-invalid')) === 'true');
ok('The second password is not complained about while the first is empty',
  (await page.locator('#r-confirm_password').getAttribute('aria-invalid')) === null);
ok('The summary counts what is wrong',
  (await page.locator('.auth-message').innerText()).includes('5 details'));
ok('An impatient click is not answered with a fake success',
  (await page.locator('.auth-form').count()) === 1);
ok('The first field with an error takes focus',
  await page.evaluate(() => document.activeElement?.id) === 'r-full_name');

/* ------------------------------------------------------------------ *
 * One field at a time
 * ------------------------------------------------------------------ */

const fieldCheck = async (name, value, expect) => {
  await openRegister();
  await submit({ ...COUNSELLOR, [name]: value });
  const message = await page.locator(`#r-${name}-error`).innerText().catch(() => '');
  ok(`${expect}`, message.length > 0 && posts.length === 0, message || 'no message shown');
};

await fieldCheck('full_name', 'L', 'A one-letter name is refused before sending');
await fieldCheck('full_name', 'Lina 2041', 'A name with digits is refused before sending');
await fieldCheck('staff_id', 'ST5', 'A short staff ID is refused before sending');
await fieldCheck('staff_id', 'STAFF 2041', 'A staff ID with a space is refused before sending');
await fieldCheck('phone', '+6512345678', 'A non-Malaysian number is refused before sending');
await fieldCheck('email', 'lina.haron', 'An address with no @ is refused before sending');
await fieldCheck('password', 'short1', 'A short password is refused before sending');
await fieldCheck('password', 'abcdefghij', 'A password with no number is refused before sending');
await fieldCheck('confirm_password', 'Kaunseling2027', 'Two different passwords are refused before sending');

await openRegister();
await fill({ ...COUNSELLOR, staff_id: 'ST5' });
await page.waitForTimeout(1400);
await page.click('.auth-submit');
await page.waitForTimeout(300);
ok('An error clears as soon as the field is corrected', await (async () => {
  await page.fill('#r-staff_id', 'STAFF2042');
  return (await page.locator('#r-staff_id-error').isVisible()) === false
    && (await page.getAttribute('#r-staff_id', 'aria-invalid')) === null;
})());
await page.screenshot({ path: `${SHOT}/register-counsellor-errors.png` });

/* ------------------------------------------------------------------ *
 * What goes on the wire
 * ------------------------------------------------------------------ */

posts.length = 0;
signIns.length = 0;
await openRegister();
await submit();

ok('A valid registration is sent once', posts.length === 1, String(posts.length));

const sent = posts[0]?.body ?? {};
Object.entries(NORMALISED).forEach(([key, value]) => {
  ok(`${key} is sent normalised`, sent[key] === value, JSON.stringify(sent[key]));
});
ok('The second copy of the password is not sent', !('confirm_password' in sent));
ok('The honeypot is not sent', !('website' in sent));
ok('Nothing beyond the five values is sent',
  Object.keys(sent).sort().join() === Object.keys(NORMALISED).sort().join(),
  Object.keys(sent).sort().join());
ok('The publishable key identifies the caller',
  (posts[0]?.headers.apikey || '').startsWith('sb_publishable_'));
ok('The body is sent as JSON',
  (posts[0]?.headers['content-type'] || '').includes('application/json'));

/* ------------------------------------------------------------------ *
 * And then they are in
 * ------------------------------------------------------------------ */

ok('The counsellor is signed in with what they just chose',
  signIns.length === 1 && signIns[0].email === NORMALISED.email
  && signIns[0].password === NORMALISED.password,
  JSON.stringify(signIns.map(s => s.email)));
ok('The confirmation card replaces the form',
  (await page.locator('.auth-form').count()) === 0
  && (await page.locator('.auth-card h1').innerText()).includes('Your account is ready'));
ok('The confirmation card takes focus so the move is announced',
  await page.evaluate(() => document.activeElement?.classList.contains('auth-card')));
ok('The way into the dashboard is offered',
  (await page.locator('.auth-card').innerText()).includes('Open the counselling desk'));
ok('Registering someone else is offered too',
  (await page.locator('.auth-card').innerText()).includes('Register another counsellor'));
await page.screenshot({ path: `${SHOT}/register-counsellor-done.png` });

ok('The form comes back empty for the next counsellor', await (async () => {
  await page.click('.button-outline');
  await page.waitForSelector('.auth-form');
  return (await page.inputValue('#r-full_name')) === ''
    && (await page.inputValue('#r-password')) === ''
    && (await page.inputValue('#r-confirm_password')) === '';
})());

/* ------------------------------------------------------------------ *
 * A sign-in that does not come off
 *
 * The account exists either way, so this must not read as a failure.
 * ------------------------------------------------------------------ */

signInAnswer = { status: 400, body: { error: 'invalid_grant', error_description: 'bad' } };
await openRegister();
await submit();
ok('A failed sign-in still confirms the account',
  (await page.locator('.auth-card h1').innerText()).includes('Your account is ready'));
ok('It then asks them to sign in',
  (await page.locator('.auth-lede').innerText()).includes('Sign in with the email address'));
signInAnswer.status = 200;

/* ------------------------------------------------------------------ *
 * What the server refuses
 * ------------------------------------------------------------------ */

signIns.length = 0;

const refusal = async (name, response, field, expect) => {
  answer = response;
  await openRegister();
  await submit();
  const message = await page.locator(`#r-${field}-error`).innerText().catch(() => '');
  ok(name, message.includes(expect), message || 'no message beside the field');
};

await refusal('A staff ID already registered is reported on that field',
  { status: 409, body: { ok: false, errors: { staff_id: 'That staff ID already has an account. Contact the counselling office if that is not you.' } } },
  'staff_id', 'already has an account');

await refusal('An email already registered is reported on that field',
  { status: 409, body: { ok: false, errors: { email: 'That email address already has an account. Sign in instead, or ask the office to reset it.' } } },
  'email', 'already has an account');

ok('A refusal names nobody else',
  !(await page.locator('.auth-card').innerText()).includes('@')
  || !(await page.locator('.auth-card').innerText()).includes('lina.haron@counselling.example.edu'));
ok('A refusal leaves the form in place to correct',
  (await page.locator('.auth-form').count()) === 1);
ok('A refusal does not sign anybody in', signIns.length === 0,
  JSON.stringify(signIns.map(s => s.email)));

answer = { status: 502, body: { ok: false, message: 'The account could not be created. Please try again in a moment.' } };
await openRegister();
await submit();
ok('A server failure is explained, not swallowed',
  (await page.locator('.auth-message').innerText()).includes('could not be created'));

answer = { status: 429, body: { ok: false, message: 'Too many registration attempts from this connection. Please wait an hour, or ask the counselling office to set your account up directly.' } };
await openRegister();
await submit();
ok('Being throttled is explained',
  (await page.locator('.auth-message').innerText()).includes('Too many registration attempts'));
ok('The submit button comes back after a refusal',
  (await page.isEnabled('.auth-submit')) &&
  (await page.locator('.auth-submit').innerText()).includes('Create my counsellor account'));

/* ------------------------------------------------------------------ *
 * The bot trap
 * ------------------------------------------------------------------ */

answer = { status: 201, body: { ok: true, created: true } };
posts.length = 0;
await openRegister();
await fill();
await page.evaluate(() => {
  const trap = document.querySelector('input.honeypot');
  trap.value = 'https://spam.example';
});
await page.waitForTimeout(1400);
await page.click('.auth-submit');
await page.waitForTimeout(400);
ok('A filled honeypot is answered with an ordinary success',
  (await page.locator('.auth-card h1').innerText()).includes('Your account is ready'));
ok('A filled honeypot sends nothing', posts.length === 0, String(posts.length));

/* ------------------------------------------------------------------ *
 * Narrow screens and keyboard use
 * ------------------------------------------------------------------ */

await page.setViewportSize({ width: 390, height: 844 });
await openRegister();
ok('The card fits a phone without sideways scrolling',
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
ok('Every field is reachable by keyboard', await (async () => {
  await page.click('#r-full_name');
  const seen = ['r-full_name'];
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement?.id));
  }
  return seen.join() === [
    'r-full_name', 'r-staff_id', 'r-phone', 'r-email',
    'r-password', 'r-confirm_password'
  ].join();
})());
ok('The honeypot is skipped by the keyboard',
  (await page.getAttribute('input.honeypot', 'tabindex')) === '-1');
await page.screenshot({ path: `${SHOT}/register-counsellor-phone.png`, fullPage: true });
await page.setViewportSize({ width: 1440, height: 950 });

/* ------------------------------------------------------------------ *
 * Nothing personal in the console
 * ------------------------------------------------------------------ */

const leaked = consoleMessages.filter(({ text }) =>
  /lina|haron|STAFF2041|60123456789|Kaunseling2026/i.test(text));
ok('No personal detail or password is logged', leaked.length === 0,
  leaked.slice(0, 2).map(l => l.text).join(' | '));

// The browser logs every failed request, so the refusals injected above
// appear here. The exact list is asserted rather than filtered away, so an
// unexpected failed request cannot hide among them. The rejected sign-in is
// not in it: supabase-js reads that response itself and the browser does not
// record it as a failed resource.
const injected = consoleMessages
  .map(({ text }) => (/status of (\d{3})/.exec(text) || [])[1])
  .filter(Boolean)
  .sort();
ok('The only failed requests are the four injected refusals',
  injected.join(' ') === '409 409 429 502', injected.join(' '));

const errors = consoleMessages.filter(({ type, text }) =>
  type === 'error' && !/websocket|realtime/i.test(text) && !/status of \d{3}/.test(text));
ok('No console errors', errors.length === 0, errors.slice(0, 3).map(e => e.text).join(' | '));
ok('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter(result => !result.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) failed.forEach(f => console.log(` - ${f.name} :: ${f.detail}`));
process.exit(failed.length === 0 ? 0 : 1);
