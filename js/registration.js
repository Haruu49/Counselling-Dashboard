/**
 * registration.js — Counselling Registration page.
 *
 * Registrations carry one state the submission inbox does not: Scheduled,
 * for a request that has been given an appointment but not yet held.
 */

import {
  h, icon, statusChip, dataTable, selectField, dateField, pageHeader, demoNotice,
  detailList, modal, closeModal, toast, swapRegion, tableSkeleton, formatDate,
  formatDateTime, statCard
} from './ui.js';
import {
  listRegistrations, getRegistration, updateRegistrationStatus,
  PROGRAMMES, REGISTRATION_STATUSES
} from './data.js';
import { getQuery, setQuery, toggleSort, todayISO } from './state.js';
import { buildToolbar, onSubmissionChange } from './submissions.js';

export async function mountRegistration(container) {
  const PAGE = 'registrations';
  const region = h('div', { class: 'region' }, tableSkeleton(8, 7));
  const statsRegion = h('div', { class: 'stat-grid stat-grid-three' });

  const controls = buildToolbar(PAGE, () => render(), {
    searchPlaceholder: 'Search student ID or name',
    fields: () => {
      const query = getQuery(PAGE);
      return [
        selectField({
          label: 'Programme', value: query.programme, options: PROGRAMMES, allLabel: 'All programmes',
          onChange: value => { setQuery(PAGE, { programme: value }); render(); }
        }),
        selectField({
          label: 'Status', value: query.status, options: REGISTRATION_STATUSES, allLabel: 'All statuses',
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
      title: 'Counselling Registration',
      description: 'Requests from students asking to see a counsellor.'
    }),
    demoNotice(),
    statsRegion,
    h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Registration requests'),
          h('p', { class: 'card-subtitle' }, 'Open a request to read the reason given and move it through the queue.'))),
      controls.node,
      region)
  );

  const columns = [
    { key: 'student_id', label: 'Student ID', sortable: true, render: row => h('span', { class: 'mono' }, row.student_id) },
    { key: 'student_name', label: 'Student Name', sortable: true, render: row => h('span', { class: 'cell-strong' }, row.student_name) },
    { key: 'programme', label: 'Programme', sortable: true },
    { key: 'semester', label: 'Semester', sortable: true, align: 'center', render: row => String(row.semester) },
    {
      key: 'category',
      label: 'Reason',
      sortable: true,
      render: row => h('span', { class: 'cell-stack' },
        h('span', {}, row.category),
        h('small', { class: 'cell-truncate', title: row.reason }, row.reason))
    },
    { key: 'session_type', label: 'Requested Session', sortable: true },
    { key: 'submitted_at', label: 'Submitted', sortable: true, render: row => formatDate(row.submitted_at) },
    { key: 'status', label: 'Status', sortable: true, render: row => statusChip(row.status) },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      render: row => h('button', {
        type: 'button', class: 'button button-quiet button-small', onclick: () => openDetail(row.id)
      }, icon('eye', 15), h('span', {}, 'View'))
    }
  ];

  async function openDetail(id) {
    const registration = await getRegistration(id);
    if (!registration) {
      toast('That registration could not be found.', 'warning');
      return;
    }
    modal({
      title: 'Counselling registration',
      subtitle: `${registration.student_name} · ${registration.student_id}`,
      size: 'large',
      body: h('div', { class: 'detail-body' },
        h('div', { class: 'detail-banner' },
          statusChip(registration.status),
          h('span', { class: 'detail-banner-meta' }, `Submitted ${formatDateTime(registration.submitted_at)}`)),
        detailList([
          ['Student ID', h('span', { class: 'mono' }, registration.student_id)],
          ['Student name', registration.student_name],
          ['Programme', registration.programme],
          ['Semester', `Semester ${registration.semester}`],
          ['Reason category', registration.category],
          ['Reason for counselling', h('p', { class: 'detail-quote' }, registration.reason)],
          ['Requested session type', registration.session_type],
          ['Record ID', h('span', { class: 'mono' }, registration.id)]
        ]),
        h('div', { class: 'status-actions' },
          h('p', { class: 'status-actions-label' }, 'Update registration status'),
          h('div', { class: 'button-row' },
            REGISTRATION_STATUSES.map(status => h('button', {
              type: 'button',
              class: `button ${status === registration.status ? 'button-primary' : 'button-outline'} button-small`,
              'aria-pressed': status === registration.status ? 'true' : 'false',
              disabled: status === registration.status,
              onclick: async () => {
                await updateRegistrationStatus(registration.id, status);
                toast(`${registration.student_name}'s registration is now ${status}.`);
                closeModal();
                render();
              }
            }, status))))),
      actions: h('button', { type: 'button', class: 'button button-quiet', onclick: () => closeModal() }, 'Close')
    });
  }

  async function render() {
    controls.sync();
    const query = getQuery(PAGE);
    await swapRegion(region, async () => {
      const result = await listRegistrations(query);
      return dataTable({
        columns,
        result,
        caption: 'Counselling registration requests',
        sort: { by: query.sort_by, dir: query.sort_dir },
        onSort: column => { toggleSort(PAGE, column); render(); },
        onPage: page => { setQuery(PAGE, { page }); render(); }
      });
    });
    await renderStats();
  }

  async function renderStats() {
    // Counts come from unpaginated queries so they describe the whole queue,
    // not the page on screen.
    const [all, awaiting, scheduled] = await Promise.all([
      listRegistrations({ per_page: 1 }),
      listRegistrations({ status: 'New', per_page: 1 }),
      listRegistrations({ status: 'Scheduled', per_page: 1 })
    ]);
    statsRegion.replaceChildren(
      statCard({ label: 'Total registrations', value: all.total, caption: 'All demonstration requests', iconName: 'clipboard-list' }),
      statCard({ label: 'Awaiting first review', value: awaiting.total, caption: 'Still marked New', iconName: 'inbox' }),
      statCard({ label: 'Scheduled', value: scheduled.total, caption: 'Appointment arranged', iconName: 'calendar-check' })
    );
  }

  const stop = onSubmissionChange(() => render());
  container.addEventListener('page:unmount', stop, { once: true });

  await render();
}
