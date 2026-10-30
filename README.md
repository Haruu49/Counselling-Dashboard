# Counselling Dashboard

A university student counselling management dashboard. **Phase 1: frontend only.**

Counsellors can monitor student counselling activity, read form submissions, follow
wellbeing assessments, manage session feedback, and review aggregate statistics.
Every record in this prototype is fictional and held in memory.

> **This is a demonstration prototype.** It has no authentication, no authorisation,
> no server-side validation, no audit trail and no database. It must not be used to
> manage real student counselling information.

---

## Running it locally

The app uses ES modules, so it needs to be served over HTTP — opening `index.html`
from the file system will be blocked by the browser's origin rules.

```sh
cd Counselling-Dashboard
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Any static server works (`npx serve`, `php -S localhost:8000`, the VS Code Live
Server extension). There is no build step, no package manager and no install.

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

No React, Vue, Angular, Next.js, Bootstrap, Tailwind or external AI APIs.

---

## Folder structure

```
Counselling-Dashboard/
├── index.html              Shell markup, CDN tags, mount points
│
├── css/
│   ├── dashboard.css       Design tokens, base styles, app layout
│   ├── components.css      Reusable pieces (cards, tables, chips, dialogs…)
│   └── responsive.css      Breakpoints, print and forced-colours
│
├── js/
│   ├── app.js              Shell, sidebar, top bar, route mounting, sign-out
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
├── tests/
│   └── browser-checks.mjs  The 83 automated browser checks
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

### Student Submissions
Search by student ID or name; filter by form type, status and date range; sort any
column; paginate; open a submission to read the full form and change its status.
The detail dialog adapts to the form type it is showing.

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

## Preparing for Supabase (Phase 2)

`js/data.js` is the only module that knows how a record is shaped or where it lives.
Everything else goes through its exported functions, so Phase 2 replaces the bodies
without touching a rendering module.

- **Field names are snake_case**, matching the PostgreSQL columns they will become.
- **Every accessor is `async`** and already awaited, with a simulated 90 ms latency
  and real loading states, so nothing has to change shape when a real round trip
  appears.
- **Records and aggregates are separate.** `listSubmissions()` returns rows;
  `getAnalytics()` returns counts and holds no student identity. The aggregate
  functions can become database views or RPC calls.
- **Filtering, sorting and pagination are already a query object** (`search`,
  `status`, `from`, `to`, `sort_by`, `sort_dir`, `page`, `per_page`) handed to the
  data layer, not applied in the page — the same shape a Supabase query takes.
- **Reusable loaders, renderers, filters and status updates** live in `ui.js` and
  `data.js` rather than being written out per page.
- **Nothing is hardcoded in markup.** Reference lists (form types, statuses,
  programmes, categories) are exported from `data.js` and become lookup tables.

Phase 2 must add row level security, role-based access control, server-side
validation, audit logging and data retention rules before any real counselling
information goes near it. **No Supabase project, credentials, authentication or
realtime connection exists in Phase 1**, and nothing here performs a live database
update.

---

## Security and privacy

- Every student, counsellor, submission and comment is fictional.
- The counsellor profile is held in memory. Only non-identifying display preferences
  (density, landing page, reduced motion, notification toggles) are written to
  `localStorage`, under one clearly named key, and every read and write is wrapped so
  blocked storage degrades instead of throwing.
- No student record, name, identifier or comment is ever written to browser storage.
  The test suite asserts this.
- Analytics shows counts only; no individual is identified on that page.
- Counselling notes are not surfaced on the overview; reading one takes a deliberate
  click into a detail dialog.
- A profile picture chosen in Settings stays in the browser tab as an object URL and
  is never uploaded.
- **Frontend behaviour is not security.** None of the above is an access control.

---

## Verification

83 automated browser checks pass against Chromium — boot, all seven routes, the
unknown-route fallback, chart rendering, search, every filter, sorting, pagination,
the detail dialog and status updates, notifications, the profile menu, all five CSV
downloads, settings validation and persistence, state surviving navigation, logout
and sign-in, keyboard focus, the mobile drawer, table restacking, sidebar collapse,
and no horizontal overflow at 1440 / 1280 / 1024 / 768 / 414 / 360px.

The run finishes with no console errors, no uncaught page errors and no failed
network requests. See `TESTING.md` for the full list and what is not covered.

---

## Known issues

- **CDN dependency.** Chart.js, Lucide and the webfont load from CDNs. Offline, the
  charts degrade to their table views and icons render as blank space at the reserved
  size; nothing breaks, but the page is plainer. Vendoring them locally would remove
  this.
- **No dark mode.** The brief specifies a light warm-white palette and the dashboard
  implements only that. A dark theme would need its own validated chart steps rather
  than an inverted copy.
- **Demonstration data resets on reload.** Status changes live in memory by design.
- **Lucide ships as one 356 KB bundle.** Fine locally; a production build should
  subset to the roughly 40 icons actually used.
- **Search covers student ID, name and feedback comments only** — not reasons given
  on a registration form.
- **The assessment band is arithmetic, not clinical.** It averages four self-reported
  numbers and nothing more.
- **Analytics has no per-chart drill-down.** Charts are read-only; clicking a segment
  does not filter the pages below.

## Still to improve

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
