/**
 * feedback.js — Feedback Management page.
 */

import {
  h, icon, ratingStars, dataTable, selectField, dateField, pageHeader, demoNotice,
  detailList, modal, closeModal, toast, swapRegion, tableSkeleton, formatDate,
  formatDateTime, statCard
} from './ui.js';
import { listFeedback, getFeedback, getFeedbackSummary, SATISFACTION_LEVELS } from './data.js';
import { getQuery, setQuery, toggleSort, todayISO } from './state.js';
import { buildToolbar } from './submissions.js';
import { satisfactionCard } from './charts.js';

export async function mountFeedback(container) {
  const PAGE = 'feedback';
  const region = h('div', { class: 'region' }, tableSkeleton(8, 6));
  const statsRegion = h('div', { class: 'stat-grid stat-grid-three' });
  const chartRegion = h('div', { class: 'chart-grid chart-grid-single' });

  const controls = buildToolbar(PAGE, () => render(), {
    searchPlaceholder: 'Search student ID, name or comment',
    fields: () => {
      const query = getQuery(PAGE);
      return [
        selectField({
          label: 'Rating',
          value: query.rating,
          options: [5, 4, 3, 2, 1].map(value => ({ value, label: `${value} star${value === 1 ? '' : 's'}` })),
          allLabel: 'All ratings',
          onChange: value => { setQuery(PAGE, { rating: value }); render(); }
        }),
        selectField({
          label: 'Satisfaction', value: query.satisfaction, options: SATISFACTION_LEVELS, allLabel: 'All levels',
          onChange: value => { setQuery(PAGE, { satisfaction: value }); render(); }
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
      title: 'Feedback Management',
      description: 'What students said about the counselling sessions they attended.'
    }),
    demoNotice(),
    statsRegion,
    chartRegion,
    h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Feedback responses'),
          h('p', { class: 'card-subtitle' }, 'Open a response to read the full comment.'))),
      controls.node,
      region)
  );

  const columns = [
    { key: 'student_id', label: 'Student ID', sortable: true, render: row => h('span', { class: 'mono' }, row.student_id) },
    { key: 'submitted_at', label: 'Feedback Date', sortable: true, render: row => formatDate(row.submitted_at) },
    { key: 'rating', label: 'Session Rating', sortable: true, render: row => ratingStars(row.rating) },
    { key: 'satisfaction', label: 'Satisfaction', sortable: true },
    {
      key: 'comments',
      label: 'Comments',
      render: row => h('p', { class: 'cell-comment', title: row.comments }, row.comments)
    },
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
    const record = await getFeedback(id);
    if (!record) {
      toast('That feedback could not be found.', 'warning');
      return;
    }
    modal({
      title: 'Counselling feedback',
      subtitle: `${record.student_name} · ${record.student_id}`,
      size: 'medium',
      body: h('div', { class: 'detail-body' },
        h('div', { class: 'detail-banner' },
          ratingStars(record.rating),
          h('span', { class: 'detail-banner-meta' }, `Submitted ${formatDateTime(record.submitted_at)}`)),
        detailList([
          ['Student ID', h('span', { class: 'mono' }, record.student_id)],
          ['Session category', record.category],
          ['Satisfaction', record.satisfaction],
          ['Comments', h('p', { class: 'detail-quote' }, record.comments)],
          ['Record ID', h('span', { class: 'mono' }, record.id)]
        ])),
      actions: h('button', { type: 'button', class: 'button button-quiet', onclick: () => closeModal() }, 'Close')
    });
  }

  async function render() {
    controls.sync();
    const query = getQuery(PAGE);
    await swapRegion(region, async () => {
      const result = await listFeedback(query);
      return dataTable({
        columns,
        result,
        caption: 'Counselling feedback responses',
        sort: { by: query.sort_by, dir: query.sort_dir },
        onSort: column => { toggleSort(PAGE, column); render(); },
        onPage: page => { setQuery(PAGE, { page }); render(); }
      });
    });
    await renderSummary();
  }

  async function renderSummary() {
    const { from, to } = getQuery(PAGE);
    const summary = await getFeedbackSummary({ from, to });
    const positive = summary.distribution
      .filter(row => row.label === 'Very Satisfied' || row.label === 'Satisfied')
      .reduce((sum, row) => sum + row.value, 0);

    statsRegion.replaceChildren(
      statCard({ label: 'Responses received', value: summary.total, caption: 'In the selected range', iconName: 'message-square-quote' }),
      statCard({ label: 'Average rating', value: summary.average_rating, caption: 'Out of 5', iconName: 'star' }),
      statCard({
        label: 'Satisfied or better',
        value: summary.total ? Math.round((positive / summary.total) * 100) : 0,
        caption: 'Share of all responses',
        iconName: 'thumbs-up'
      })
    );
    // Give the average its decimal and the share its percent sign.
    const values = statsRegion.querySelectorAll('.stat-value');
    if (values[1]) values[1].textContent = summary.average_rating.toFixed(1);
    if (values[1]) values[1].append(h('span', { class: 'stat-unit' }, '/5'));
    if (values[2]) values[2].append(h('span', { class: 'stat-unit' }, '%'));

    chartRegion.replaceChildren(
      satisfactionCard(summary.distribution, { averageRating: summary.average_rating })
    );
  }

  await render();
}
