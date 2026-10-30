# Verification

**Run:** Chromium 1248 and PostgreSQL 16.15 on Linux, 30 October 2026, against
`python3 -m http.server` on a desktop viewport unless a check states otherwise.

## Results

| Suite | Result |
|---|---|
| `tests/sql-checks.sh` — migration and access rules | **38 of 38 passed** |
| `tests/validation-checks.mjs` — the edge function's rules | **51 of 51 passed** |
| `tests/student-form-checks.mjs` — the student form | **62 of 62 passed** |
| `tests/dashboard-request-checks.mjs` — the counsellor side | **59 of 59 passed** |
| `tests/browser-checks.mjs` — the existing dashboard | **5 of 5 gate checks passed; 83 skipped** |

No console errors, no uncaught page errors, no failed network requests, other than
the deliberate failures three checks inject and the realtime socket the mock cannot
answer. Both are scoped out explicitly in the suites rather than filtered after.

**The 83 existing dashboard checks did not run.** They now need a counsellor session
on a project with the migration applied, and no migration has been applied to any
project — see *Not covered*.

```sh
./tests/sql-checks.sh
node tests/validation-checks.mjs

npm install --no-save playwright
npx playwright install chromium
python3 -m http.server 8000 &
BASE_URL=http://localhost:8000/ node tests/student-form-checks.mjs
BASE_URL=http://localhost:8000/ node tests/dashboard-request-checks.mjs
BASE_URL=http://localhost:8000/ \
  TEST_COUNSELLOR_EMAIL=... TEST_COUNSELLOR_PASSWORD=... \
  node tests/browser-checks.mjs
```

---

## Migration and access rules

`tests/sql-checks.sh` creates a throwaway Postgres cluster, applies
`tests/supabase-shim.sql` (the roles, `auth.users`, `auth.uid()` and the realtime
publication that a Supabase project already provides), then applies the migration
unmodified and attempts each operation **as the role in question**. A policy that
reads correctly can still let the wrong role through, so nothing here is asserted
by reading the catalogue.

- RLS is enabled and forced on all three tables; the requests table is in the
  `supabase_realtime` publication; there is no DELETE policy for any role; `anon`
  holds no privilege on the requests or throttle tables.
- `anon` cannot insert or read a request. `service_role` can insert.
- A new auth user gets a `counsellor_profiles` row, with initials derived for the
  sidebar.
- An active counsellor reads the queue. A signed-in non-counsellor sees nothing. A
  counsellor whose `active` goes false sees nothing from that moment.
- A counsellor can set the office-use fields. Rewriting the description or the
  student name raises an exception. A non-counsellor's update changes nothing, and
  neither a counsellor nor `anon` can delete.
- Rejected at insert: no purpose, a purpose not on the printed form, `Other`
  without its text, `Other` text without `Other` ticked, a malformed email, a
  one-line description, an unknown request type.
- The throttle counts per salted hash per hour, is per address rather than global,
  and stores no raw address.

---

## The submission rules

`tests/validation-checks.mjs` imports `validation.ts` directly. Beyond the required
fields, lengths, email and phone shapes, and the `Other` pairing in both directions,
it asserts the two properties that matter most:

- **A payload carrying office-use fields is accepted, and none of them survive.**
  `id`, `reference_code`, `status`, `appointment_at`, `assigned_counsellor_id`,
  `reference_source`, `office_notes` and `submitted_at` are all dropped, and a
  supplied `channel` is overwritten with `Online`.
- **The lists cannot drift.** Request types, purposes, issues and length limits are
  compared against `js/form-options.js`; the suite fails if the server and the
  browser disagree about what the printed form says.

Also checked: choices come back in the order the printed form lists them, a repeated
choice is counted once, a filled honeypot reads as a bot and an empty one does not,
and every error message is a full sentence a student could act on.

---

## The student form

`tests/student-form-checks.mjs` drives Chromium against `student-form.html` with the
edge function intercepted, so nothing is sent anywhere. What it asserts about the
request is that the right URL, headers and payload *would* have gone out.

- Two request types, five purposes, eight issues; purpose and issue are checkboxes
  and request type is a radio, so "more than one" and "exactly one" are not in doubt.
- **No office-use field is present on the page**, and none is sent.
- Ticking `Other` reveals its text field and moves focus into it; unticking hides it.
- An empty submission never reaches the endpoint, shows nine inline messages and
  nine entries in a summary that takes focus and carries `role="alert"`; every field
  points at its own message with `aria-describedby`; a summary link focuses its
  field; typing clears that field's message and leaves the others alone.
- A valid submission POSTs to `/functions/v1/…`, not to `/rest/v1/…`, carrying the
  publishable key. The browser does not set `channel`; the server does.
- The confirmation shows the reference code, what happens next, and where to go for
  urgent help. "Send another request" returns an empty form.
- The honeypot is off screen rather than `display:none`, `aria-hidden`, and out of
  the tab order.
- A 400 with field errors maps back to the fields; a 429 and a network failure each
  give a plain explanation and leave the button usable.
- 360px: no horizontal overflow, choice targets and the submit button at least 44px
  tall. The skip link is the first tab stop. Nothing typed reaches `localStorage`.

---

## The counsellor side

`tests/dashboard-request-checks.mjs` answers every Supabase call from fixtures, so
it needs no project, no migration and no account. It covers the dashboard's own
behaviour, not the access rules — a mock answers whatever it is asked, which is why
`sql-checks.sh` exists.

- Sign-in reaches the dashboard; the sidebar name and role come from
  `counsellor_profiles`.
- The queue is read once at sign-in, newest first, naming its columns rather than
  selecting everything. A realtime websocket is opened to the project.
- A request appears in Student Submissions, filters as `Counselling Request`, and
  shows the student's name, ID and status.
- The detail dialog shows student details, semester, contact number, email,
  reference code, every purpose and issue, `Other — Placement worries` beside the
  chip, the description in full, and `Online` as the channel. A referral is titled
  as a referral.
- The office-use panel carries all five fields and fills its counsellor list from
  `counsellor_profiles`. Nothing the student wrote is editable.
- Saving PATCHes that one row and sends **only** `reference_source`,
  `appointment_at`, `assigned_counsellor_id` and `office_notes`. Setting the status
  sends `{"status": …}` and nothing else.
- A new request arriving is found by a re-read, appears in the table without a
  reload, raises a notification naming the student and the reference code, and
  increments the badge.
- Wellbeing, Feedback, Analytics, Registration and Settings all still render, and
  the overview counts include the live requests.

---

## The sign-in gate

Running `browser-checks.mjs` without credentials still asserts the part that matters
most: an unauthenticated visitor gets a sign-in screen and not a dashboard, no
`.data-table` or `.stat-card` renders behind it, and there is no public sign-up link.

---

## What passed previously (dashboard, 83 checks)

These passed before this change and have not been re-run — see *Not covered*.

### Boot and shell
- Browser title is `Counselling Dashboard | Student Counselling Management`.
- The app starts and clears its booting state.
- Chart.js and Lucide both load from their CDNs; 53 icons render as inline SVG.
- Opens on the Overview route when no hash is present.

### Navigation
- All seven destinations open, each setting the matching page title and marking the
  matching sidebar item active: Overview, Student Submissions, Counselling
  Registration, Wellbeing Assessment, Feedback Management, Analytics & Reports,
  Settings.
- An unknown hash shows the fallback page rather than an empty screen.
- Breadcrumb and page title update per route.

### Overview
- Four statistic cards render with populated values and trend indicators.
- Five quick actions render and route correctly.
- Four charts draw onto canvases with real dimensions.
- Chart legends render; every chart carries a table-view twin.
- The recent submissions table populates.

### Tables: search, filter, sort, paginate
- Pagination summary reports `Showing 1–8 of 238`.
- Sorting a column reorders rows and exposes `aria-sort` on the sorted header.
- Moving to another page changes the visible slice.
- The status filter narrows the table to a single status.
- Form type and status filters combine correctly.
- Typing in the search field filters without the input losing focus or its value.
- Clearing filters restores the full record set.
- The rating filter on Feedback and the band filter on Wellbeing both narrow correctly.

### Detail dialog and status updates
- Opens as a labelled `role="dialog"` with `aria-modal="true"`.
- Three status controls render, with the current status disabled.
- Choosing a status updates the record, closes the dialog and confirms with a toast.
- Escape closes the dialog.

### Notifications
- Panel opens and lists notifications with unread state marked.
- "Mark all as read" clears every unread item and hides the badge.

### Analytics and CSV export
- Six charts render.
- Five date-range presets render; choosing one re-scopes the page.
- All five CSV files download: summary, submissions, registrations, assessments,
  feedback. Files carry a UTF-8 BOM, human-readable headings, and quote any value
  containing a comma.

### Settings
- Saving the profile updates the name shown in the top bar.
- An invalid email is rejected with the interface's own message.
- Compact density and reduced motion both apply to the document.
- Display preferences persist to `localStorage`.
- **No student record, name or identifier appears anywhere in browser storage.**

### Session and state
- Filters survive leaving a page and returning to it.
- Logout asks for confirmation, shows the signed-out screen, and signing back in
  restores the dashboard.

### Accessibility
- The skip link is reachable and focusable.
- Keyboard focus produces a visible 2px outline and matches `:focus-visible`.
- Tables carry a caption, `scope` on headers and `aria-sort` on sorted columns.
- Dialogs trap Tab, close on Escape and restore focus to whatever opened them.

### Responsive
- No horizontal overflow at 1440, 1280, 1024, 768, 414 and 360px.
- The menu button appears below 960px and the drawer opens.
- The drawer closes after choosing a destination.
- Table rows restack as labelled cards below 620px, while chart table twins stay
  real tables.
- The desktop sidebar collapses to an icon rail and expands again.

---

## Fixed during Phase 1 verification

These were found by the checks or by reading the rendered output, and corrected:

1. **Stale document listeners.** The notification and profile menus were rebuilt on
   every route change, each adding permanent `document` listeners. The stale copies
   fought the live panel. The top bar is now built once and only its breadcrumb,
   title and profile chip update.
2. **Charts rendered at half width.** The chart region was itself a two-column grid
   *and* contained another two-column grid, so every card sat in one column of the
   outer grid. The outer wrapper is now a plain region.
3. **CSS specificity collision.** `.toolbar-range` is declared in `dashboard.css`,
   but `components.css` loads later and its `.toolbar` rule won at equal
   specificity — the date presets inherited the toolbar's row layout, padding and
   grey band. Now qualified as `.toolbar.toolbar-range`.
4. **Top bar overflowed at 360px.** A full-width search field inside the right-hand
   flex group pushed the bar 7px past the viewport. The group now takes its own row
   and wraps internally.
5. **Native validation shadowed the interface's own messages.** The settings form is
   now `novalidate`, so its own validation produces every message.
6. **Analytics opened in an inconsistent state** — "Last 90 days" showed as selected
   while the range was empty and the summary read "showing every record". The
   default query is now seeded with the matching dates.
7. **Month-to-date compared against a whole previous month**, so the overview read
   as a collapse in activity on any day but the last of the month. Trends now use
   rolling 30-day windows.
8. **Wellbeing readings were drawn uniformly from 1–5**, putting roughly half the
   cohort in the highest band and overstating need. Readings are now weighted toward
   mid-to-low concern, giving 43% Good, 31% Moderate, 26% Needs Support.
9. **An invalid CSS declaration** (`left: --var(...)`) left in the active nav rule.

---

## Fixed during this change

1. **The "Other" text field never actually hid.** `.form-row { display: grid }`
   outranks the user-agent rule for `[hidden]`, so the reveal looked permanently
   open while the JavaScript believed it was closed. Caught by the first run of
   `student-form-checks.mjs`; fixed with an explicit `[hidden] { display: none }`.
2. **The error summary rendered the literal text "null".** `Element.append()`
   stringifies `null`, unlike the `h()` helper it sat next to. Found while debugging
   an unrelated failure; the optional row is now filtered out before appending.
3. **The required asterisk drifted to the far right** of any label that wrapped onto
   two lines, where it stopped reading as part of the label. The label was a flex
   row; it is now a block.
4. **Three of this round's own assertions were wrong** and are recorded here rather
   than quietly corrected: a policy-filtered `UPDATE`/`DELETE` affects zero rows
   instead of raising, so two SQL checks were passing a statement that did nothing;
   and the first `.chip` in a queue row is the form type, not the status.

---

## Not covered

- **No screen-reader pass.** ARIA attributes, roles, labels, focus order and focus
  visibility are asserted, but no automated audit (axe) and no assistive-technology
  testing has been run.
- **One browser only.** Chromium. Not verified in Firefox, Safari or WebKit, and not
  on a real phone or tablet — responsive checks are emulated viewports.
- **No colour-contrast audit of the full interface.** The chart palette was validated
  against its surface; interface text and controls were not measured.
- **Offline behaviour is designed for but not asserted.** The fallbacks for a missing
  Chart.js or Lucide exist in code and were not exercised by a test.
- **No performance measurement** beyond the absence of console errors.
- **No load testing** of the table at a record count far beyond the ~240 demonstration
  rows.
- **Nothing has been applied to a Supabase project.** The migration has been applied
  only to a throwaway local Postgres, and the edge function has never been deployed
  or invoked. The function's HTTP shell — CORS, method handling, body-size cap, the
  throttle RPC call and the PostgREST insert — is therefore unexercised; only the
  validation module it imports is tested.
- **The 83 existing dashboard checks have not been re-run**, because they now need a
  counsellor account on a project with the migration applied. The code paths they
  cover are exercised against a mock by `dashboard-request-checks.mjs`, which is not
  the same thing.
- **No realtime event has been driven end to end.** The subscription is confirmed to
  open to the right project, and the handler's work is confirmed to produce the right
  result, but no Postgres write has travelled the socket.
- **RLS has not been confirmed against Supabase's own roles.** `service_role`'s
  `BYPASSRLS` and `auth.uid()` are reproduced by `tests/supabase-shim.sql`; the real
  project may differ.

---

## Limits

These checks use fictional data throughout. They establish that the interface
behaves as the brief specifies, that the migration applies and its access rules hold
on a local Postgres, and that the submission rules reject what they should. They do
not establish production readiness, privacy compliance, or fitness to hold real
student counselling information, and no part of the system has been exercised
against a live Supabase project.
