/**
 * submissions.js — the Student Submissions page and the submission detail
 * dialog, which the Overview table and the notification dropdown both reuse.
 */

import {
  h, icon, statusChip, formTypeChip, bandChip, ratingStars, meter, dataTable, toolbar,
  searchField, selectField, dateField, pageHeader, demoNotice, detailList, modal, closeModal,
  toast, swapRegion, tableSkeleton, formatDate, formatDateTime, debounce, paintIcons
} from './ui.js';
import {
  listSubmissions, getSubmission, updateSubmissionStatus,
  FORM_TYPES, SUBMISSION_STATUSES, ASSESSMENT_MEASURES
} from './data.js';
import { getQuery, setQuery, resetQuery, toggleSort, todayISO } from './state.js';

/** Fires whenever a status changes, so other views can refresh their counts. */
const listeners = new Set();
export function onSubmissionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function announceChange() {
  listeners.forEach(fn => fn());
}

/* ------------------------------------------------------------------ *
 * Columns, shared by this page and the Overview table
 * ------------------------------------------------------------------ */

export function submissionColumns({ onView, compact = false }) {
  const columns = [
    {
      key: 'student_id',
      label: 'Student ID',
      sortable: true,
      render: row => h('span', { class: 'mono' }, row.student_id)
    },
    {
      key: 'student_name',
      label: 'Student Name',
      sortable: true,
      render: row => h('span', { class: 'cell-strong' }, row.student_name)
    },
    { key: 'form_type', label: 'Form Type', sortable: true, render: row => formTypeChip(row.form_type) },
    {
      key: 'submitted_at',
      label: 'Submission Date',
      sortable: true,
      render: row => h('span', { class: 'cell-stack' },
        h('span', {}, formatDate(row.submitted_at)),
        h('small', {}, formatDateTime(row.submitted_at).slice(-5)))
    },
    { key: 'status', label: 'Status', sortable: true, render: row => statusChip(row.status) },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      render: row => h('button', {
        type: 'button',
        class: 'button button-quiet button-small',
        onclick: () => onView(row.id)
      }, icon('eye', 15), h('span', {}, 'View'))
    }
  ];
  return compact ? columns.filter(column => column.key !== 'form_type' || !compact) : columns;
}

/* ------------------------------------------------------------------ *
 * Detail dialog
 * ------------------------------------------------------------------ */

/**
 * Opens the submission detail dialog. The body shape depends on the form
 * type, but the status controls are identical across all three.
 */
export async function openSubmissionDetail(id, { onUpdated = () => {} } = {}) {
  const record = await getSubmission(id);
  if (!record) {
    toast('That submission could not be found.', 'warning');
    return;
  }
  const { submission, student, detail } = record;

  const statusRow = h('div', { class: 'status-actions' },
    h('p', { class: 'status-actions-label' }, 'Update status'),
    h('div', { class: 'button-row' },
      SUBMISSION_STATUSES.map(status => h('button', {
        type: 'button',
        class: `button ${status === submission.status ? 'button-primary' : 'button-outline'} button-small`,
        'aria-pressed': status === submission.status ? 'true' : 'false',
        disabled: status === submission.status,
        onclick: async () => {
          await updateSubmissionStatus(submission.id, status);
          toast(`${submission.student_name}'s submission is now ${status}.`);
          closeModal();
          announceChange();
          onUpdated();
        }
      }, status))));

  modal({
    title: submission.form_type,
    subtitle: `${submission.student_name} · ${submission.student_id}`,
    size: 'large',
    body: h('div', { class: 'detail-body' },
      h('div', { class: 'detail-banner' },
        statusChip(submission.status),
        h('span', { class: 'detail-banner-meta' }, `Submitted ${formatDateTime(submission.submitted_at)}`)),
      detailList([
        ['Student ID', h('span', { class: 'mono' }, submission.student_id)],
        ['Student name', submission.student_name],
        student ? ['Programme', student.programme] : null,
        student ? ['Semester', `Semester ${student.semester}`] : null,
        ['Form type', submission.form_type],
        ['Record ID', h('span', { class: 'mono' }, submission.id)]
      ]),
      detailBody(submission.form_type, detail),
      statusRow),
    actions: h('button', { type: 'button', class: 'button button-quiet', onclick: () => closeModal() }, 'Close')
  });
}

/** The form-specific half of the detail dialog. */
function detailBody(formType, detail) {
  if (!detail) return null;

  if (formType === 'Counselling Registration') {
    return h('div', { class: 'detail-section' },
      h('h3', { class: 'detail-heading' }, 'Registration details'),
      detailList([
        ['Reason category', detail.category],
        ['Reason given', h('p', { class: 'detail-quote' }, detail.reason)],
        ['Requested session', detail.session_type],
        ['Registration status', statusChip(detail.status)]
      ]));
  }

  if (formType === 'Wellbeing Assessment') {
    return h('div', { class: 'detail-section' },
      h('h3', { class: 'detail-heading' }, 'Assessment readings'),
      h('p', { class: 'detail-hint' },
        'Self-reported on a 1–5 scale. These readings support administrative follow-up and are not a clinical assessment.'),
      h('div', { class: 'measure-grid' },
        ASSESSMENT_MEASURES.map(measure => h('div', { class: 'measure-row' },
          h('p', { class: 'measure-label' }, measure.label),
          meter(detail[measure.key], 5, measureTone(measure, detail[measure.key]))))),
      detailList([['Monitoring band', bandChip(detail.band)]]));
  }

  return h('div', { class: 'detail-section' },
    h('h3', { class: 'detail-heading' }, 'Feedback'),
    detailList([
      ['Session rating', ratingStars(detail.rating)],
      ['Satisfaction', detail.satisfaction],
      ['Session category', detail.category],
      ['Comments', h('p', { class: 'detail-quote' }, detail.comments)]
    ]));
}

/**
 * Picks the meter tone. A high stress reading and a high wellbeing reading
 * mean opposite things, so the direction of the measure decides the colour.
 */
function measureTone(measure, value) {
  const concern = measure.higher_is_better ? 6 - value : value;
  if (concern >= 4) return 'serious';
  if (concern === 3) return 'warning';
  return 'accent';
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export async function mountSubmissions(container) {
  const PAGE = 'submissions';
  const region = h('div', { class: 'region' }, tableSkeleton(8, 6));

  const controls = buildToolbar(PAGE, () => render(), {
    searchPlaceholder: 'Search student ID or name',
    fields: () => {
      const query = getQuery(PAGE);
      return [
        selectField({
          label: 'Form type', value: query.form_type, options: FORM_TYPES, allLabel: 'All form types',
          onChange: value => { setQuery(PAGE, { form_type: value }); render(); }
        }),
        selectField({
          label: 'Status', value: query.status, options: SUBMISSION_STATUSES, allLabel: 'All statuses',
          onChange: value => { setQuery(PAGE, { status: value }); render(); }
        }),
        dateField({
          label: 'From', value: query.from, max: todayISO(),
          onChange: value => { setQuery(PAGE, { from: value }); render(); }
        }),
        dateField({
          label: 'To', value: query.to, max: todayISO(),
          onChange: value => { setQuery(PAGE, { to: value }); render(); }
        })
      ];
    }
  });

  container.append(
    pageHeader({
      title: 'Student Submissions',
      description: 'Every counselling form submitted by a student, newest first.'
    }),
    demoNotice(),
    h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'All submissions'),
          h('p', { class: 'card-subtitle' }, 'Search, filter and sort to find a record, then open it to update its status.'))),
      controls.node,
      region)
  );

  async function render() {
    controls.sync();
    const query = getQuery(PAGE);
    await swapRegion(region, async () => {
      const result = await listSubmissions(query);
      return dataTable({
        columns: submissionColumns({
          onView: id => openSubmissionDetail(id, { onUpdated: render })
        }),
        result,
        caption: 'Student counselling form submissions',
        sort: { by: query.sort_by, dir: query.sort_dir },
        onSort: column => { toggleSort(PAGE, column); render(); },
        onPage: page => { setQuery(PAGE, { page }); render(); }
      });
    });
  }

  await render();
}

/**
 * Builds a toolbar whose search input survives re-renders (so typing never
 * loses focus) while the dropdowns are rebuilt to reflect current values.
 */
export function buildToolbar(page, onChange, { searchPlaceholder, fields, trailing = null }) {
  const query = getQuery(page);
  const search = searchField({
    value: query.search,
    placeholder: searchPlaceholder,
    label: searchPlaceholder,
    onInput: debounce(value => {
      setQuery(page, { search: value });
      onChange();
    })
  });

  const fieldHost = h('div', { class: 'toolbar-fields' }, fields());
  const node = h('div', { class: 'toolbar' },
    search,
    fieldHost,
    h('div', { class: 'toolbar-end' },
      h('button', {
        type: 'button',
        class: 'button button-quiet',
        onclick: () => {
          resetQuery(page);
          const input = search.querySelector('input');
          if (input) input.value = '';
          onChange();
        }
      }, icon('rotate-ccw', 15), h('span', {}, 'Clear filters')),
      trailing));

  return {
    node,
    /** Rebuild just the dropdowns, keeping the live search input in place. */
    sync() {
      fieldHost.replaceChildren(...fields());
      paintIcons(node);
    }
  };
}
