# Counselling Dashboard

A university student counselling management dashboard, plus the student-facing
counselling request form that feeds it.

Students fill in **`student-form.html`**, a public page based on the printed
counselling form (GMI-RO-P04-F02). Their request is validated on the server, stored
in Supabase, and appears in the counsellor's queue without a refresh. There is no
student login anywhere in this application: filling in the form is all a student
ever does.

Counsellors create their own login at **`#/register`** and sign in to read the
queue and manage the "For Office Use Only" half. Registration is open to whoever
has the link, by choice — so **the link is the only secret there is**, and an
account made with it can read every student's request. Nobody without an account
can read a single record.

| Part | State |
|---|---|
| Counselling requests | **Live.** Real rows in Supabase, behind authentication and row level security. |
| Counsellor accounts | **Live.** Created at `#/register` by anyone with the link. |
| Counselling registrations, wellbeing assessments, feedback, analytics | Fictional demonstration data, held in memory. |

> **Still a prototype.** Counselling requests are stored for real, but the three
> demonstration datasets are not, and there is no audit trail, retention policy or
> privacy assessment yet. Use fictional data. Do not put real student counselling
> information near it until the work listed under *Still to improve* is done.

---

## Running it locally

The app uses ES modules, so it needs to be served over HTTP — opening `index.html`
from the file system will be blocked by the browser's origin rules.

```sh
cd Counselling-Dashboard
python3 -m http.server 8000
```

Then open <http://localhost:8000> for the dashboard, or
<http://localhost:8000/student-form.html> for the student form.

Any static server works (`npx serve`, `php -S localhost:8000`, the VS Code Live
Server extension). There is no build step, no package manager and no install.

**Both pages need `js/config.js` before they do anything.** It holds the Supabase
project URL and publishable key, it is gitignored, and it is not in this repository:

```sh
cp js/config.example.js js/config.js
# then paste in the URL and publishable key from Project Settings → API
```

Without it the dashboard shows a short setup screen instead of a sign-in form, and
the student form says it is not available yet. See **Supabase setup** below for the
database and the submission endpoint, which also have to exist.

The dashboard requires a counsellor sign-in and will not fall back to demonstration
mode: it reads real student requests, so there is no unauthenticated path into it.

**An internet connection is needed on first load.** Chart.js, Lucide icons and the
Source Sans 3 webfont come from CDNs. Without them the dashboard still runs: charts
are replaced by their value tables, icons fall back to blank space at the reserved
size, and the type falls back to the system sans.

---

## Technology

| Layer | Choice |
|---|---|
| Markup | HTML5, one page |
| Styling | CSS3, custom properties, no framework |
| Behaviour | Vanilla JavaScript, ES modules, no bundler |
| Charts | [Chart.js 4.4.1](https://www.chartjs.org/) via cdnjs |
| Icons | [Lucide 0.460.0](https://lucide.dev) via jsDelivr |
| Type | Source Sans 3 via Google Fonts |
| Database, auth, realtime | [Supabase](https://supabase.com) — Postgres, GoTrue, Realtime |
| Client library | `@supabase/supabase-js` 2.118.0 via jsDelivr (dashboard only) |
| Submission endpoint | A Supabase Edge Function (Deno, TypeScript) |

No React, Vue, Angular, Next.js, Bootstrap, Tailwind or external AI APIs. The
student form loads no Supabase client at all — it posts to the edge function.

---

## Folder structure

```
Counselling-Dashboard/
├── index.html              Shell markup, CDN tags, mount points
│
├── css/
│   ├── dashboard.css       Design tokens, base styles, app layout
│   ├── components.css      Reusable pieces (cards, tables, chips, dialogs…)
│   ├── responsive.css      Breakpoints, print and forced-colours
│   └── student-form.css    The student form only
│
├── student-form.html       The public student counselling request form
│
├── js/
│   ├── app.js              Shell, sidebar, top bar, route mounting, auth gate
│   ├── auth.js             Counsellor sign-in, session, sign-out
│   ├── supabase.js         The one place a Supabase client is created
│   ├── project-config.js   Reads the gitignored js/config.js
│   ├── config.example.js   Template for js/config.js
│   ├── realtime.js         The live subscription to the request queue
│   ├── form-options.js     The printed form's lists, shared by both pages
│   ├── student-form.js     The student form: build, validate, submit
│   ├── register.js         Counsellor registration at #/register
│   ├── registration-rules.js  Its rules, as a pure module the tests import
│   ├── router.js           Hash routing and the route table
│   ├── data.js             Demonstration dataset + data access layer
│   ├── state.js            View state, display preferences, date ranges
│   ├── ui.js               Shared interface primitives
│   ├── charts.js           Every Chart.js chart
│   ├── csv.js              Client-side CSV export
│   ├── notifications.js    Notification dropdown and badge
│   ├── dashboard.js        Overview page
│   ├── submissions.js      Student Submissions page + detail dialog
│   ├── registration.js     Counselling Registration page (demonstration)
│   ├── wellbeing.js        Wellbeing Assessment page
│   ├── feedback.js         Feedback Management page
│   ├── analytics.js        Analytics & Reports page
│   └── settings.js         Settings page
│
├── assets/
│   ├── images/favicon.svg  Brand mark sized for a browser tab
│   └── icons/              Brand mark + a note on the icon set
│
├── supabase/
│   ├── config.toml                        CLI settings (verify_jwt off for both endpoints)
│   ├── migrations/                        Tables, RLS policies, triggers, realtime
│   └── functions/
│       ├── submit-counselling-request/
│       │   ├── index.ts                   The public submission endpoint
│       │   └── validation.ts              The submission rules, as a pure module
│       └── register-counsellor/
│           ├── index.ts                   The only thing that creates an account
│           └── validation.ts              The registration rules, as a pure module
│
├── tests/
│   ├── browser-checks.mjs            Dashboard behaviour (needs a session)
│   ├── dashboard-request-checks.mjs  The counsellor side, against a mocked Supabase
│   ├── student-form-checks.mjs       The student form, endpoint intercepted
│   ├── register-page-checks.mjs      Counsellor registration, every call intercepted
│   ├── registration-checks.mjs       The registration rules, directly
│   ├── validation-checks.mjs         The edge function's rules, directly
│   ├── sql-checks.sh                 The migration on a throwaway Postgres
│   └── supabase-shim.sql             What that throwaway cluster needs first
│
├── TESTING.md              Verification results and what is not covered
└── README.md
```

**A note on the module list.** The brief sketched six JavaScript files. Seven pages
plus a shell would not fit in six without one of them becoming a dumping ground, and
the brief also asks that application logic not pile up in a single file. All six
named files exist and keep their stated jobs; the extra modules are one page each,
plus `router.js`, `state.js`, `ui.js` and `csv.js` for concerns shared across pages.

---

## Features

### Shell
- Collapsible desktop sidebar, grouped navigation, active-page indicator.
- Off-canvas drawer with overlay below 960px; closes when a destination is chosen.
- Top bar with breadcrumb, page title, global search, current date, notification
  bell and profile menu.
- Global search jumps to Student Submissions pre-filtered; typing while already on
  that page filters it live.
- Logout confirms, then shows a signed-out screen with a way back in.
- Unknown routes get a real page, not a blank screen.

### Overview
- Four statistic cards: total students, total form submissions, pending reviews,
  completed counselling sessions — each with an icon, a large figure, a caption and
  a trend against the previous 30 days.
- Five quick actions: new submissions, registrations, wellbeing reports, feedback,
  and a one-click CSV report for the last 90 days.
- Four charts and a recent-submissions table with its own search, filters, sorting
  and pagination.

### Student counselling request form
`student-form.html`, public and mobile-first. Request or referral; name, student ID,
semester, contact number and email; purpose and type of issue as checkboxes so more
than one can be chosen, each with an "Other" box that reveals a short text field;
and a free-text description that says plainly the student can share only what they
feel comfortable sharing. The submission channel is recorded as `Online`
automatically, and none of the "For Office Use Only" fields appear.

Invalid fields get a message beside them, `aria-invalid`, and an entry in one
summary at the top of the form that takes focus — a long form on a phone can push
an inline message well off screen. Submitting shows a confirmation with a reference
code the student can quote, what happens next, and where to go if they need help
sooner than the queue allows.

### Counsellor registration
`#/register`, reachable without a session, because a counsellor who has no account
yet cannot sign in to make one. Six fields: full name, staff ID, phone number,
email address, and a password typed twice. There is nothing else to supply:
registration is open, and the counselling office controls who gets the link.

Values are normalised before they are stored, so the roster stays searchable: the
staff ID is upper-cased, the email lower-cased, and `012-3456789`, `0123456789` and
`+60 12 345 6789` all become `+60123456789`. A password is the one field never
trimmed — a stripped space would mean the password stored is not the password
typed. The second copy is compulsory and never leaves the browser: there is no SMTP
on the project, so a password nobody can reproduce is an account nobody can
recover.

The page creates nothing itself. It posts to the `register-counsellor` edge
function, which holds the service-role key on the server, validates everything
again, counts attempts per connection, and creates the account already confirmed.
The page then signs in with the password just chosen, so registering and arriving
at the queue is one step. A counsellor who is already signed in and is setting up a
colleague is not swapped into the new account.

Each refusal lands beside the field it belongs to — a staff ID already taken, an
email that already has an account — and neither says whose record was collided
with.

Because registration is open, removing access is the thing to know how to do:

```sql
update public.counsellor_profiles set active = false where email = 'them@example.edu';
```

That takes effect on their next request. The row stays, so their name still
resolves on the requests they handled.

### Student Submissions
Search by student ID or name; filter by form type, status and date range; sort any
column; paginate; open a submission to read the full form and change its status.
The detail dialog adapts to the form type it is showing.

Counselling requests appear here alongside the three demonstration form types, and
arrive live. Opening one shows the student's details, every purpose and issue they
chose, and their description — then, below it, the **For office use only** panel:
reference source, appointment date and time, assigned counsellor and office notes.
Those five columns are the only ones a counsellor can write. The database refuses
any change to what the student submitted.

### Counselling Registration
Student ID, name, programme, semester, reason category, the reason in the student's
own words, requested session type, submission date and registration status. Filter
by programme and status. Registrations carry one extra state — Scheduled — for a
request that has an appointment but has not happened yet.

### Wellbeing Assessment
Stress level, anxiety level, academic pressure and emotional wellbeing, each
self-reported from 1 to 5, with averages, a distribution chart, full submission
history and a per-student detail view.

The monitoring band (Good / Moderate / Needs Support) is a coarse triage aid for
deciding what to read first. It is **not** a screening instrument and does not label
anyone with a condition — the page says so where a counsellor will read it.

### Feedback Management
Ratings, satisfaction levels and comments, with response counts, average rating,
share satisfied or better, a satisfaction chart, and filters by rating and level.

### Analytics & Reports
One date-range control scopes everything beneath it: four totals and six charts.
Five CSV exports (summary, submissions, registrations, assessments, feedback), all
built in the browser with a Blob — no server, nothing uploaded.

### Settings
Profile name, email, department, role and picture; notification preferences; table
density; reduced motion; which page opens first. Demonstration data can be reset
without a reload, and saved preferences can be cleared.

### Notifications
Badge with unread count, read and unread states, mark one or all as read, and
opening a notification takes you to the submission behind it.

---

## How it is put together

**One shell, one page per route.** `app.js` builds the sidebar and top bar once and
mounts a single page module into the main region per route. Page modules never touch
the shell and the shell never reaches into a page.

**Records never become markup.** Elements are built through an `h()` helper using DOM
APIs, so a student name or a free-text comment is inserted as a text node and can
never be parsed as HTML.

**Filters survive navigation.** `state.js` holds the search text, filters, sort and
page number per page, so leaving Submissions and coming back shows the same slice.

**Reloading keeps its frame.** A region holds its previous render at reduced opacity
while the next one is built, instead of collapsing to a skeleton and jumping.

### Chart colour

Chart colours were validated, not eyeballed. The brand sage and teal sit too close in
hue to be told apart under red/green colour vision deficiency, so no chart uses a
multi-series categorical palette. Every chart is one of three things:

- **Single hue** for magnitude — counselling categories, monthly submissions, and the
  analytics breakdowns. Nominal categories get one colour for every bar; shading each
  bar differently would encode bar length twice and add no information.
- **An ordered one-hue teal ramp** for feedback satisfaction, checked for monotone
  lightness, a visible step between adjacent steps, and a light end that still
  separates from a white card.
- **The reserved status palette** for wellbeing bands, always paired with an icon and
  a word, because two of the three status colours sit below 3:1 against white by
  design.

Every chart also renders its legend in HTML — so label text wears ink colours and the
swatch beside it carries identity — and ships a collapsed table of its values, so no
number is reachable only by hovering.

---

## Supabase setup

Nothing in this repository is applied to a project automatically. These are the
steps, in order. They need the [Supabase CLI](https://supabase.com/docs/guides/local-development)
and an account with access to the project.

**1. Link the project.**

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

**2. Apply the migrations.** In order: the first creates `counselling_requests`,
`counsellor_profiles` and `submission_throttle`, their RLS policies, the triggers,
and adds the requests table to the realtime publication. The second created a
student `registrations` table. The third drops that table again — students only
fill in the form — and adds counsellor registration: the `staff_id` and `phone`
columns, and the trigger that decides who becomes a counsellor. The fourth takes
that trigger function off the public API.

```sh
supabase db push
```

Without the CLI, paste each file in `supabase/migrations/` into the SQL editor in
the Supabase dashboard, oldest first, and run it once. The order matters: each one
builds on the last.

**3. Deploy both endpoints.** JWT verification must be off for both: one caller is
a student with no session, the other a counsellor who has no account yet.
`supabase/config.toml` already sets this, and the flags are repeated here for
anyone deploying without it.

```sh
supabase functions deploy submit-counselling-request --no-verify-jwt
supabase functions deploy register-counsellor --no-verify-jwt

supabase secrets set SUBMISSION_THROTTLE_SALT="$(openssl rand -hex 16)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.
Optional: `SUBMISSION_HOURLY_LIMIT` (default 5), `COUNSELLOR_REGISTRATION_LIMIT`
(default 10) and `ALLOWED_ORIGINS` (default `*` — set it to the site's origin once
that is known).

**There is no gate on `register-counsellor`.** Whoever can reach the page can
create an account that reads every student's counselling request, and the only
abuse control is the per-connection throttle. That is a deliberate choice for this
prototype — the counselling office hands the link out itself — and it is the first
thing to revisit before any real student data goes near this. See *Known
limitations*.

**4. Optionally close public sign-up.** Authentication → Providers → Email:
**Allow new users to sign up**. Leaving it on is safe — `handle_new_counsellor()`
gives an account the dashboard only when the sign-up carried
`app_metadata.counsellor_approved`, which a browser cannot set, so anyone signing
up directly lands inactive and reads nothing. Turning it off removes the pointless
endpoint anyway; `register-counsellor` keeps working either way, because the admin
API it uses is not governed by that setting.

**5. The first counsellor.** Send them `#/register`. That is the whole process, and
it is the same for everyone after them.

Creating one by hand in Authentication → Users → **Add user** also works, but the
dashboard cannot set `app_metadata`, so that account arrives **inactive** and sees
nothing until you run:

```sql
update public.counsellor_profiles set active = true where email = 'them@example.edu';
```

That is also how you remove access later — set `active = false` rather than
deleting the row, so their name still resolves on the requests they handled.

**6. Point the pages at the project.**

```sh
cp js/config.example.js js/config.js
```

Fill in the project URL and the **publishable** key. Both are safe in a browser.
The service-role key is a different key and belongs only in the edge function's
environment — never in `js/config.js`, never under `js/`, never committed.

---

## How a submission travels

```
student-form.html
      │  POST, no session, publishable key only
      ▼
submit-counselling-request  (edge function, verify_jwt off)
      │  validation.ts re-checks every field
      │  office-use fields dropped, channel forced to 'Online'
      │  per-hour throttle on a salted hash of the caller's address
      │  service-role key, held only in the function's environment
      ▼
public.counselling_requests   anon has no policy and no grant
      │
      │  Postgres WAL → supabase_realtime publication
      ▼
the counsellor's subscription   RLS applied per subscriber
      │
      ▼
data.js re-reads the queue → the page re-renders
```

Two details worth keeping:

- **The student form holds no database access at all.** `anon` has no policy and no
  grant on `counselling_requests`, so there is nothing for a student's browser key
  to read even if someone tried. The edge function is the only way in.
- **Realtime events carry nothing into the app.** An event means "something
  changed"; the data layer then re-reads the table. That costs one query and keeps
  the queue correct when events are coalesced, arrive out of order, or are missed
  during a reconnect.

---

## Access rules

| Who | `counselling_requests` |
|---|---|
| A student (`anon`) | Nothing. No policy, and the grants are revoked explicitly. |
| A signed-in non-counsellor | Nothing. `is_counsellor()` is false, so no row matches. |
| An active counsellor | Read, update the office-use columns, insert an offline request. |
| A deactivated counsellor | Nothing, from the moment `active` goes false. |
| Anyone | No delete. There is no DELETE policy for any role. |
| The edge function (`service_role`) | Insert, bypassing RLS, from the server only. |

A submitted request is a record of what a student wrote, so the student-supplied
columns are frozen at insert by `counselling_requests_freeze_submission()`. A
counsellor updating `description` or `student_name` gets an exception, not a
silent write — enforced in the database, not only in the interface.

| Who | `counsellor_profiles` |
|---|---|
| A student (`anon`) | Nothing. Every grant is revoked explicitly. |
| An inactive account | Nothing, including its own row. `is_counsellor()` is false. |
| An active counsellor | Read the roster; update only their own row. |
| Anyone | No insert and no delete. Only the trigger creates a row. |

Becoming a counsellor is the one thing no policy can grant, because the row that
makes someone a counsellor is written by `handle_new_counsellor()` as the trigger
on `auth.users`. It sets `active` from `app_metadata.counsellor_approved`, which
only a service-role caller can write — so the `register-counsellor` function,
is the only thing in the system that can admit anybody. A sign-up straight against the public endpoint gets a row with
`active = false`, no staff ID and no phone number, and reads nothing.

The trigger is also careful never to raise. `user_metadata` is whatever the caller
sent, and an exception there would abort the `auth.users` insert and reach the
browser as an opaque 500 from GoTrue, so a malformed staff ID or phone number is
dropped rather than refused.

`tests/sql-checks.sh` asserts every row of both tables by attempting it as the role
in question, and asserts the gate by inserting into `auth.users` the way each
caller would — with the approval flag and without it.

---

## Keeping the data layer honest

`js/data.js` is still the only module that knows how a record is shaped or where it
lives. What changed is that some records now come from Postgres:

- Live requests are cached in `live`, deliberately outside `store`, and merged into
  the submission accessors by `allSubmissions()`. Every page kept its existing
  call — `listSubmissions()`, `getSubmission()`, `updateSubmissionStatus()` — and
  none of them had to learn where a row came from.
- The reference lists moved to `form-options.js`, which has no imports, so the
  student form can share them without loading a Supabase client. `data.js`
  re-exports them, so nothing else had to change.
- The same lists exist in three places that must agree: `form-options.js`,
  `validation.ts`, and the CHECK constraints. `tests/validation-checks.mjs` fails
  if the first two drift apart.

## Security and privacy

**Credentials**

- `js/config.js` is gitignored and holds only the project URL and the publishable
  key, both of which are designed to be public.
- The service-role key exists only inside the edge function's environment, injected
  by the platform. It is in no file in this repository and reaches no browser.
- No key is fabricated anywhere in the repo; `js/config.example.js` ships
  placeholders.

**Access**

- A counsellor account can only be *activated* by the `register-counsellor` edge
  function, with the service-role key. The trigger gives every new auth user an
  inactive profile, and only that server-side write switches one on, so a sign-up
  that skips the function reads nothing. **The function itself admits anyone who
  asks**; see *Known limitations*.
- The sign-in form gives the same message for an unknown address and a wrong
  password, so it cannot be used to find out who has an account.
- RLS is enabled *and forced* on every exposed table. See **Access rules**.
- The dashboard renders nothing before a session exists, so there is no
  unauthenticated path to a page that would try to read student records. The one
  page that does render signed out, `#/register`, reads nothing: its only call is a
  POST to the registration function. `tests/register-page-checks.mjs` asserts that
  no PostgREST read is attempted while signed out, rather than that none rendered.

**Student data**

- A student cannot read any submission, including their own: there is no read path
  for `anon` at all. No table in the schema grants `anon` anything.
- A counsellor's own password never reaches the database as typed, and never
  reaches the console at all. The registration page logs an error's name, not its
  message, and the function logs status codes rather than bodies.
- The counsellor session is kept in `localStorage` under `counselling-dashboard-auth`.
  No student record, name, identifier or comment is ever written to browser storage,
  and both test suites assert it.
- Display preferences (density, landing page, reduced motion, notification toggles)
  are the only other thing stored, under one clearly named key, with every read and
  write wrapped so blocked storage degrades instead of throwing.
- Analytics shows counts only; no individual is identified on that page.
- Counselling notes are not surfaced on the overview; reading one takes a deliberate
  click into a detail dialog.
- A profile picture chosen in Settings stays in the browser tab as an object URL and
  is never uploaded.
- A PostgREST error is logged to the console but never shown to a student or a
  counsellor as-is, because the message can quote row contents back.

**The public endpoint**

- Every field is re-validated server-side; the browser's copy of the rules exists
  only to give a quick, kind message.
- The payload is rebuilt key by key rather than spread, so no office-use field,
  status or id can ride in on it.
- A honeypot field and a per-hour limit on a salted hash of the caller's address.
  No raw address is stored.
- The body size is capped before it is parsed.

**Still not covered.** No audit log, no retention or deletion policy, no rate limit
on sign-in attempts, no privacy assessment, and no penetration test. Those come
before real counselling information.

---

## Verification

Six suites, run independently. None of them touches a live Supabase project.

| Suite | What it covers | Needs |
|---|---|---|
| `tests/sql-checks.sh` | Every migration and every access rule, applied to a throwaway local Postgres and attempted as each role | Postgres 16 server binaries |
| `tests/validation-checks.mjs` | The edge function's rules, imported directly | Node 22.6+ |
| `tests/registration-checks.mjs` | The registration rules, imported directly, and that the page, the function and the migration agree | Node 22.6+ |
| `tests/student-form-checks.mjs` | The student form end to end, endpoint intercepted | Playwright, a static server |
| `tests/register-page-checks.mjs` | Counsellor registration end to end, every call intercepted | Playwright, a static server |
| `tests/dashboard-request-checks.mjs` | The counsellor side against a mocked Supabase | Playwright, a static server |
| `tests/browser-checks.mjs` | The existing dashboard behaviour | Playwright, a static server, **and a counsellor account** |

```sh
./tests/sql-checks.sh
node tests/validation-checks.mjs
node tests/registration-checks.mjs

npm install --no-save playwright && npx playwright install chromium
python3 -m http.server 8000 &
BASE_URL=http://localhost:8000/ node tests/student-form-checks.mjs
BASE_URL=http://localhost:8000/ node tests/register-page-checks.mjs
BASE_URL=http://localhost:8000/ node tests/dashboard-request-checks.mjs
BASE_URL=http://localhost:8000/ \
  TEST_COUNSELLOR_EMAIL=... TEST_COUNSELLOR_PASSWORD=... \
  node tests/browser-checks.mjs
```

`browser-checks.mjs` writes when it is given an account: it saves a profile and
changes a submission's status. Point it at a project you are happy to have
written to, never one holding records anyone depends on.

`browser-checks.mjs` now needs a real session for everything past the sign-in
screen. Without those two variables it checks the gate — that an unauthenticated
visitor gets a sign-in form, that no student record renders behind it, and that
there is no sign-up link — then reports the rest as skipped rather than failing.
Use a fictional account, never a real counsellor's.

See `TESTING.md` for the full list and what is not covered.

---

## Known issues

- **CDN dependency.** Chart.js, Lucide and the webfont load from CDNs. Offline, the
  charts degrade to their table views and icons render as blank space at the reserved
  size; nothing breaks, but the page is plainer. Vendoring them locally would remove
  this.
- **No dark mode.** The brief specifies a light warm-white palette and the dashboard
  implements only that. A dark theme would need its own validated chart steps rather
  than an inverted copy.
- **Demonstration data resets on reload.** The three demonstration form types live
  in memory by design. Counselling requests are stored and do not reset.
- **Realtime is best-effort.** If the socket drops, the queue still refreshes on
  navigation and on any action that re-reads it; the console says when the channel
  errored. There is no reconnection banner yet.
- **The realtime socket itself is not covered by an automated test.** The suites
  assert that the subscription is opened to the right project and that the handler's
  work — re-read, then re-render — produces the right result, but nothing drives a
  real Postgres event end to end.
- **Lucide ships as one 356 KB bundle.** Fine locally; a production build should
  subset to the roughly 40 icons actually used.
- **Registration is open, and this is the biggest thing wrong with the
  prototype.** Anyone who reaches `#/register` — because the link was forwarded,
  guessed, or found in a browser history — can create an account and read every
  student's counselling request. Nothing checks that they work for the
  university. The per-connection throttle slows a script down; it stops nobody
  who is willing to fill the form in once. Before real student data goes
  anywhere near this, registration needs either per-person invitations with an
  expiry, an approval step, or at minimum a shared code.
- **Search covers student ID, name and feedback comments only** — not reasons given
  on a registration form.
- **The assessment band is arithmetic, not clinical.** It averages four self-reported
  numbers and nothing more.
- **Analytics has no per-chart drill-down.** Charts are read-only; clicking a segment
  does not filter the pages below.

## Still to improve

- An audit log of who read or changed which request, and a retention policy.
- A gate on registration: per-person invitations with an expiry, or an approval
  step, and a list of who registered when.
- Rate limiting and lockout on sign-in attempts. Registration is already throttled
  per connection per hour; signing in is not.
- Letting a student check the status of their own request from the reference code,
  which needs a second endpoint rather than any read access to the table.
- Vendor the CDN libraries locally and subset the icon set.
- Automated accessibility auditing (axe) and a screen-reader pass; the current checks
  cover focus visibility, keyboard paths, landmarks and ARIA attributes, not a full
  audit.
- Column-level sorting on the comments column, and search across registration reasons.
- Bulk status updates from the table, rather than one record at a time.
- Saved filter views, and a URL that carries the current filter state so a filtered
  view can be shared or bookmarked.
- Charts reacting to the list-page filters, not only to the analytics date range.
- Real empty states for a genuinely empty dataset, as opposed to a filtered one.
- A print stylesheet pass against real printed output.
