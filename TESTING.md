# Phase 1 verification

**Run:** Chromium, 30 October 2026, against `python3 -m http.server` on a desktop
viewport unless a check states otherwise.

**Result: 83 of 83 automated checks passed.** No console errors, no uncaught page
errors, no failed network requests.

Reproduce with:

```sh
npm install --no-save playwright
npx playwright install chromium
python3 -m http.server 8000 &
BASE_URL=http://localhost:8000/ node tests/browser-checks.mjs
```

---

## What passed

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

## Fixed during verification

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

---

## Limits

These checks cover a frontend simulation using fictional data. They establish that
the interface behaves as the brief specifies. They do not establish production
readiness, security, privacy compliance, or fitness to hold real student counselling
information.
