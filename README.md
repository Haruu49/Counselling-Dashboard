# Counselling Dashboard

A university student counselling management dashboard, plus the student-facing
counselling request form that feeds it.

Students fill in **`student-form.html`**, a public page based on the printed
counselling form (GMI-RO-P04-F02). Their request is validated on the server, stored
in Supabase, and appears in the counsellor's queue without a refresh. Counsellors
sign in to read it and manage the "For Office Use Only" half.

| Part | State |
|---|---|
| Counselling requests | **Live.** Real rows in Supabase, behind authentication and row level security. |
| Registrations, wellbeing assessments, feedback, analytics | Fictional demonstration data, held in memory. |

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
│   ├── router.js           Hash routing and the route table
│   ├── data.js             Demonstration dataset + data access layer
│   ├── state.js            View state, display preferences, date ranges
│   ├── ui.js               Shared interface primitives
│   ├── charts.js           Every Chart.js chart
│   ├── csv.js              Client-side CSV export
│   ├── notifications.js    Notification dropdown and badge
│   ├── dashboard.js        Overview page
│   ├── submissions.js      Student Submissions page + detail dialog
│   ├── registration.js     Counselling Registration page
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
│   ├── config.toml                        CLI settings (verify_jwt off for the endpoint)
│   ├── migrations/                        Tables, RLS policies, triggers, realtime
│   └── functions/
│       └── submit-counselling-request/
│           ├── index.ts                   The public endpoint
│           └── validation.ts              The submission rules, as a pure module
│
├── tests/
│   ├── browser-checks.mjs            Dashboard behaviour (needs a session)
│   ├── dashboard-request-checks.mjs  The counsellor side, against a mocked Supabase
│   ├── student-form-checks.mjs       The student form, endpoint intercepted
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

**2. Apply the migration.** It creates `counselling_requests`,
`counsellor_profiles` and `submission_throttle`, their RLS policies, the triggers,
and adds the requests table to the realtime publication.

```sh
supabase db push
```

Without the CLI, paste `supabase/migrations/20261030120000_counselling_requests.sql`
into the SQL editor in the Supabase dashboard and run it once.

**3. Deploy the submission endpoint.** JWT verification must be off: the caller is
a student with no session. `supabase/config.toml` already sets this, and the flag
is repeated here for anyone deploying without it.

```sh
supabase functions deploy submit-counselling-request --no-verify-jwt
supabase secrets set SUBMISSION_THROTTLE_SALT="$(openssl rand -hex 16)"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform. Two
optional secrets: `SUBMISSION_HOURLY_LIMIT` (default 5) and `ALLOWED_ORIGINS`
(default `*` — set it to the site's origin once that is known).

**4. Close public sign-up.** Authentication → Providers → Email: turn
**Allow new users to sign up** off. Counsellor accounts are invite-only, and the
trigger in the migration admits any new auth user to the queue, so this is what
keeps the queue closed.

**5. Create a counsellor.** Authentication → Users → **Add user**, with
*Auto Confirm User* ticked. The trigger creates their `counsellor_profiles` row,
which is what grants access; they can change their display name under Settings.
To remove someone's access later, set `active = false` on that row rather than
deleting it, so their name still resolves on the requests they handled.

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

`tests/sql-checks.sh` asserts every row of that table by attempting it as the role
in question.

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

- Counsellor accounts are invite-only. There is no sign-up form, and public sign-up
  must be turned off in the project (step 4 of **Supabase setup**).
- The sign-in form gives the same message for an unknown address and a wrong
  password, so it cannot be used to find out who has an account.
- RLS is enabled *and forced* on every exposed table. See **Access rules**.
- The dashboard renders nothing before a session exists, so there is no
  unauthenticated path to a page that would try to read student records.

**Student data**

- A student cannot read any submission, including their own: there is no read path
  for `anon` at all.
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

Four suites, run independently. None of them touches a live Supabase project.

| Suite | What it covers | Needs |
|---|---|---|
| `tests/sql-checks.sh` | The migration and every access rule, applied to a throwaway local Postgres and attempted as each role | Postgres 16 server binaries |
| `tests/validation-checks.mjs` | The edge function's rules, imported directly | Node 22.6+ |
| `tests/student-form-checks.mjs` | The student form end to end, endpoint intercepted | Playwright, a static server |
| `tests/dashboard-request-checks.mjs` | The counsellor side against a mocked Supabase | Playwright, a static server |
| `tests/browser-checks.mjs` | The existing dashboard behaviour | Playwright, a static server, **and a counsellor account** |

```sh
./tests/sql-checks.sh
node tests/validation-checks.mjs

npm install --no-save playwright && npx playwright install chromium
python3 -m http.server 8000 &
BASE_URL=http://localhost:8000/ node tests/student-form-checks.mjs
BASE_URL=http://localhost:8000/ node tests/dashboard-request-checks.mjs
BASE_URL=http://localhost:8000/ \
  TEST_COUNSELLOR_EMAIL=... TEST_COUNSELLOR_PASSWORD=... \
  node tests/browser-checks.mjs
```

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
- **Search covers student ID, name and feedback comments only** — not reasons given
  on a registration form.
- **The assessment band is arithmetic, not clinical.** It averages four self-reported
  numbers and nothing more.
- **Analytics has no per-chart drill-down.** Charts are read-only; clicking a segment
  does not filter the pages below.

## Still to improve

- An audit log of who read or changed which request, and a retention policy.
- Rate limiting and lockout on sign-in attempts.
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
