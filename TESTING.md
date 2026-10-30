# Verification

**Run:** Chromium 1248 and PostgreSQL 16.15 on Linux, 31 October 2026, against
`python3 -m http.server` on a desktop viewport unless a check states otherwise.

## Results

| Suite | Result |
|---|---|
| `tests/sql-checks.sh` — migrations and access rules | **74 of 74 passed** |
| `tests/validation-checks.mjs` — the submission endpoint's rules | **51 of 51 passed** |
| `tests/registration-checks.mjs` — the registration rules | **81 of 81 passed** |
| `tests/student-form-checks.mjs` — the student form | **62 of 62 passed** |
| `tests/register-page-checks.mjs` — counsellor registration | **80 of 80 passed** |
| `tests/dashboard-request-checks.mjs` — the counsellor side | **59 of 59 passed** |
| `tests/browser-checks.mjs` — the existing dashboard | **6 of 6 gate checks passed; 83 skipped** |

No console errors, no uncaught page errors, no failed network requests, other than
the deliberate failures three checks inject and the realtime socket the mock cannot
answer. Both are scoped out explicitly in the suites rather than filtered after.

**The 83 existing dashboard checks did not run.** They need a counsellor session,
and they write when they get one — a profile save and a status change. They are not
pointed at the project holding real rows; see *Not covered*.

**Three of the four migrations have been applied to a Supabase project** and both
edge functions are deployed — see *Against a live project* below. The suites above
still touch nothing: every call in them is intercepted.

```sh
./tests/sql-checks.sh
node tests/validation-checks.mjs
node tests/registration-checks.mjs

npm install --no-save playwright
npx playwright install chromium
python3 -m http.server 8000 &
BASE_URL=http://localhost:8000/ node tests/student-form-checks.mjs
BASE_URL=http://localhost:8000/ node tests/register-page-checks.mjs
BASE_URL=http://localhost:8000/ node tests/dashboard-request-checks.mjs
BASE_URL=http://localhost:8000/ \
  TEST_COUNSELLOR_EMAIL=... TEST_COUNSELLOR_PASSWORD=... \
  node tests/browser-checks.mjs
```

---

## Migration and access rules

`tests/sql-checks.sh` creates a throwaway Postgres cluster, applies
`tests/supabase-shim.sql` (the roles, `auth.users`, `auth.uid()` and the realtime
publication that a Supabase project already provides), then applies every migration
in `supabase/migrations/` in order, unmodified, and attempts each operation **as the
role in question**. A policy that
reads correctly can still let the wrong role through, so nothing here is asserted
by reading the catalogue.

- RLS is enabled and forced on all three tables; the requests table is in the
  `supabase_realtime` publication; there is no DELETE policy for any role; `anon`
  holds no privilege on the requests or throttle tables.
- `anon` cannot insert or read a request. `service_role` can insert.
- A new auth user gets a `counsellor_profiles` row, with initials derived for the
  sidebar — **active only when the sign-up carried
  `app_metadata.counsellor_approved`**, which only the registration function can
  set. A sign-up without it lands inactive, cannot claim a staff ID or a phone
  number, fails `is_counsellor()`, reads no request, and cannot switch itself on.
- Junk in `user_metadata` never aborts a sign-up: a malformed staff ID or phone
  number is dropped, and a name too short to store falls back. An exception there
  would reach the browser as an opaque 500 from GoTrue.
- A staff ID cannot be taken twice, and the CHECK constraints reject a lower-case
  ID, one under four characters, one with a space or hyphen, an unnormalised phone
  number and a non-Malaysian one.
- The gate function is not callable over RPC by `anon`, `authenticated` or
  `public`, while `is_counsellor()` still is — the policies need it.
- **The path registration actually takes is reproduced in two steps**, because
  the admin API's own two writes are what production does: a user inserted
  without `app_metadata` starts inactive and reads nothing, then a service-role
  update switches it on with its staff ID and phone, and only then does it read
  the queue. A single insert carrying the flag is the one case production never
  hits, so it is not the only case checked.
- The student `registrations` table no longer exists, and `anon` holds no privilege
  on `counsellor_profiles`.
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

## The registration rules

`tests/registration-checks.mjs` imports `js/registration-rules.js` directly. Beyond
each field's length and shape, it asserts the properties the account depends on:

- **Everything is normalised before it is sent.** The staff ID is upper-cased, the
  email lower-cased, runs of space inside a name collapse, and eight ways of
  writing a Malaysian number — `012-3456789`, `0123456789`, `+60 12 345 6789`,
  `(012) 345 6789`, `60123456789`, `011-23456789`, `03-12345678` — all become one.
  A `+65` number is refused rather than mangled into a Malaysian one.
- **A password is never touched.** ` pass word 1 ` survives exactly as typed, spaces
  and all, because the password stored must be the password the counsellor will
  type again. The second copy is required, must match, and is dropped from the
  values that get sent.
- **The page, the function and the database agree.** Every limit in `LIMITS`, all
  four regular expressions, the staff ID pattern, the `+60` phone pattern, the
  unique index and the approval rule are read back out of
  `supabase/functions/register-counsellor/validation.ts` and the migration file.
  The suite fails if any one of the three moves alone.
- **Only the five stored values survive.** A `registration_code`, a `role` or an
  `active` sent under any name is dropped rather than passed on, and the suite
  asserts the function asks for no code either.

Also checked: a name may carry an apostrophe, a hyphen, a dot, an accent or Chinese
characters but not a digit; a password of letters only or digits only is refused;
the second password is not complained about while the first is already wrong; no
message names a column; no message quotes back what was typed; and every message is
a full sentence a counsellor could act on.

---

## The registration page

`tests/register-page-checks.mjs` drives `#/register` with every call intercepted,
so no account is created. It asserts:

- **It opens with no session and reads nothing.** The card renders without a
  sign-in, the dashboard shell is absent, and the count of PostgREST reads made
  while signed out is zero — not "no record was rendered", but "nothing was asked
  for".
- **Only the normalised values go on the wire.** `staff2041` and
  `Lina.Haron@Counselling.Example.Edu` are sent upper- and lower-cased, the phone
  as `+60123456789`, and the body carries exactly five keys: no second password,
  no honeypot, nothing else.
- **Registering lands them in the dashboard.** The page signs in with the address
  and password just chosen, the confirmation card takes focus, and it offers the
  way in. When that sign-in is refused, the card still confirms the account and
  asks them to sign in — the account exists either way.
- **Every refusal lands beside its own field.** A staff ID already taken and an
  email that already has an account each appear under the right input; the form
  stays in place to correct; nobody is signed in; and a throttled or failing
  endpoint is explained rather than swallowed.
- **The spam trap cannot fire on a person.** Clicking the button the instant the
  page loads, with every field empty, produces five inline errors — not the silent
  success a bot gets. This is a regression test: it did the wrong thing first.
- **Nothing personal reaches the console.** Not the name, the staff ID, the phone
  number or the password. The four injected refusals are asserted by their exact
  statuses, so an unexpected failed request cannot hide among them.

Also checked: every label is tied to its input, each input is described by its own
error line, the summary carries `role="alert"`, the first faulted field takes focus,
typing clears that field's error, both password fields ask for `new-password`, all
six fields are reachable in order by Tab while the honeypot is skipped, no field
asks for a registration code, and there is no sideways scrolling at 390px.

---

## Against a live project

Separately from the suites, registration was driven end to end against the real
project with nothing mocked: three of the four migrations applied, both edge
functions deployed, and a browser pointed at the running app. **11 of 11 passed**,
after a bug the first run found.

| Step | Result |
|---|---|
| A real registration from `#/register` | Account created, `Your account is ready` |
| The sign-in that follows it | Automatic; the card offers the way in |
| Opening the counselling desk | The dashboard boots as the new counsellor, sidebar reading `LH Lina Haron` |
| What that brand new account can read | The live queue, including the real request |
| What was stored | `active = true`, `staff_id = STAFF407799`, `phone = +60123456789`, initials derived |
| The same staff ID, a different address | `That staff ID already has an account` beside the field |
| The same address, a different staff ID | `That email address already has an account` beside the field |
| After both refusals | Two auth users, not four — neither refusal left a half-made account |
| The console | No password, no address, no unexpected error |

The test account was deleted afterwards, along with the two the first run left.

**The first run failed, and the failure was the point.** The account was created
and signed in, but the sidebar fell back to the demonstration profile and the
queue was empty: `handle_new_counsellor()` had written an *inactive* row, because
GoTrue's admin API applies `app_metadata` in a second write after the `auth.users`
insert, so the trigger never saw `counsellor_approved`. The function now PATCHes
the row to active itself with the service-role key, and asks for the
representation back so that a PATCH matching no row is not read as success. Both
test suites had passed against this bug — the local cluster sets `app_metadata` in
the insert, which production does not.

Two things in the repository are **not** on the live project yet:

- `supabase/migrations/20261031100000_close_the_trigger_rpc.sql`, which takes
  `handle_new_counsellor()` off the public API. Applying it is one line in the SQL
  editor; the local suite covers it.
- Nothing else. There is no secret to set: registration is open.

### A warning that was checked and deliberately not acted on

`supabase db advisors` reports that `is_counsellor()` is callable by `anon` and
`authenticated` as a `SECURITY DEFINER` function. Revoking that EXECUTE was tried
in the throwaway cluster first: **every RLS policy stopped matching and a
counsellor read nothing at all**, because the policies call the function as the
querying role. So the grant stays, and only `handle_new_counsellor()` — which
Postgres will not run over RPC anyway — is closed.

`auth_leaked_password_protection` is off, and now matters more than it did:
counsellors choose their own password on the form. Turning it on is one switch in
Authentication → Policies and costs nothing.

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

## Fixed while adding counsellor registration

1. **The spam trap could fire on a person.** The minimum fill time was checked
   before validation, so clicking the button the instant the page loaded, with every
   field empty, produced a silent "your account is ready" instead of six errors.
   Found before any test was written; validation now runs first, and
   `register-page-checks.mjs` pins it.
2. **`anyone` could become a counsellor.** `handle_new_counsellor()` gave every new
   auth user an *active* profile, and public sign-up is enabled on the project — so
   anyone holding the publishable key could POST to `/auth/v1/signup` and read every
   student's counselling request. This was live, and predates this change. The
   trigger now sets `active` from an `app_metadata` flag a browser cannot write.
3. **The function deployed with `verify_jwt` on**, which would have rejected the
   anonymous caller it exists for. Caught by reading the deploy response rather than
   by a test; redeployed and confirmed `false`.
4. **A registered counsellor could sign in and read nothing.** The trigger decided
   activation from `app_metadata`, which GoTrue's admin API writes *after* the
   `auth.users` insert, so every account created by the function arrived inactive.
   Both suites passed against it, because the local cluster writes `app_metadata`
   in the insert. Only the live run caught it. The function now performs the
   activating write itself. See *Against a live project*.
5. **Four of this round's own assertions were wrong** and are recorded here rather
   than quietly corrected: a one-letter email local part falls back to
   `New counsellor`, not to its initial; `.auth-form` is the sign-in card's class
   too, so waiting on it raced the card still on screen; the queue table shows the
   student ID rather than the reference code; and the browser does not log the
   rejected sign-in as a failed resource, so five statuses appear in the console,
   not six.

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
- **The edge functions' shells are only partly exercised.** Both are deployed and
  invoked: for the submission endpoint, CORS preflight, the validation path and a
  submission that reached the database; for `register-counsellor`, CORS preflight
  and the 503 fail-closed path. Neither function's body-size cap, 429 throttle
  branch or 5xx failure branch has been triggered against the deployed copy.
- **The throttle has not been run to its limit against the deployed function.**
  Eleven registrations in an hour from one connection should get a 429 on the
  eleventh; that is covered in the local cluster against
  `register_submission_attempt()`, and against a mock in the browser suite, but
  not end to end.
- **The live run was one pass, not a suite.** The table under *Against a live
  project* was produced by a throwaway script that is not in `tests/`, so it is not
  repeatable from this repository. The repeatable suites all mock Supabase.
- **The 83 existing dashboard checks have not been re-run.** A counsellor account
  now exists, but the suite writes when it is given one — it saves a profile and
  changes a submission's status — so it needs a project that can be written to
  freely. The code paths it covers are exercised against a mock by
  `dashboard-request-checks.mjs`, which is not the same thing.
- **No realtime event has been driven end to end.** The subscription is confirmed to
  open to the right project, and the handler's work is confirmed to produce the right
  result, but no Postgres write has travelled the socket.
- **RLS is only partly confirmed against Supabase's own roles.** One rule was
  checked on the real project: an active counsellor reads the request queue.
  Everything else — the freeze trigger, the office-use update rules,
  the deactivated-counsellor case — rests on `tests/supabase-shim.sql`'s
  reproduction of `service_role`'s `BYPASSRLS` and `auth.uid()`, which the real
  project may differ from. The registration gate in particular — that an
  unapproved sign-up lands inactive — is asserted only in that local cluster,
  because proving it on the live project means creating a stranger's account on it.

---

## Limits

These checks use fictional data throughout. They establish that the interface
behaves as the brief specifies, that the migration applies and its access rules hold
on a local Postgres, and that the submission rules reject what they should. They do
not establish production readiness, privacy compliance, or fitness to hold real
student counselling information, and no part of the system has been exercised
against a live Supabase project.
