/**
 * wellbeing.js — Wellbeing Assessment page.
 *
 * Administrative monitoring only. The page shows self-reported 1–5 readings
 * and a coarse three-step band so a counsellor can decide what to read
 * first. It does not screen, score or label anyone, and the copy on the page
 * says so plainly.
 */

import {
  h, icon, statusChip, bandChip, meter, dataTable, selectField, dateField, pageHeader,
  demoNotice, detailList, modal, closeModal, toast, swapRegion, tableSkeleton,
  formatDate, formatDateTime, statCard
} from './ui.js';
import { listAssessments, getAssessment, getWellbeingSummary, WELLBEING_BANDS, SUBMISSION_STATUSES } from './data.js';
import { getQuery, setQuery, toggleSort, todayISO } from './state.js';
import { buildToolbar, onSubmissionChange } from './submissions.js';
import { wellbeingDistributionCard, assessmentAveragesCard } from './charts.js';

export async function mountWellbeing(container) {
  const PAGE = 'wellbeing';
  const region = h('div', { class: 'region' }, tableSkeleton(8, 7));
  const summaryRegion = h('div', { class: 'stat-grid stat-grid-four' });
  const chartRegion = h('div', { class: 'chart-grid chart-grid-split' });

  const controls = buildToolbar(PAGE, () => render(), {
    searchPlaceholder: 'Search student ID or name',
    fields: () => {
      const query = getQuery(PAGE);
      return [
        selectField({
          label: 'Monitoring band', value: query.band, options: WELLBEING_BANDS, allLabel: 'All bands',
          onChange: value => { setQuery(PAGE, { band: value }); render(); }
        }),
        selectField({
          label: 'Review status', value: query.status, options: SUBMISSION_STATUSES, allLabel: 'All statuses',
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
      title: 'Wellbeing Assessment',
      description: 'Self-reported wellbeing readings submitted by students.'
    }),
    h('div', { class: 'callout callout-info' },
      icon('info', 17),
      h('div', {},
        h('p', { class: 'callout-title' }, 'An administrative monitoring tool'),
        h('p', {}, 'These readings help decide which submissions to read first. They are not a screening instrument and they do not diagnose any condition. Use clinical judgement and your service’s referral process for anything beyond triage.'))),
    demoNotice(),
    summaryRegion,
    chartRegion,
    h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Assessment submission history'),
          h('p', { class: 'card-subtitle' }, 'Every assessment submitted, newest first. Open one to see the individual readings.'))),
      controls.node,
      region)
  );

  const columns = [
    { key: 'student_id', label: 'Student ID', sortable: true, render: row => h('span', { class: 'mono' }, row.student_id) },
    { key: 'student_name', label: 'Student Name', sortable: true, render: row => h('span', { class: 'cell-strong' }, row.student_name) },
    { key: 'programme', label: 'Programme', sortable: true },
    { key: 'stress_level', label: 'Stress', sortable: true, align: 'center', render: row => scaleCell(row.stress_level) },
    { key: 'anxiety_level', label: 'Anxiety', sortable: true, align: 'center', render: row => scaleCell(row.anxiety_level) },
    { key: 'academic_pressure', label: 'Academic', sortable: true, align: 'center', render: row => scaleCell(row.academic_pressure) },
    { key: 'emotional_wellbeing', label: 'Emotional', sortable: true, align: 'center', render: row => scaleCell(row.emotional_wellbeing, true) },
    { key: 'band', label: 'Band', sortable: true, render: row => bandChip(row.band) },
    { key: 'submitted_at', label: 'Submitted', sortable: true, render: row => formatDate(row.submitted_at) },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      render: row => h('button', {
        type: 'button', class: 'button button-quiet button-small', onclick: () => openDetail(row.id)
      }, icon('eye', 15), h('span', {}, 'View'))
    }
  ];

  /** A single 1–5 reading. `favourableHigh` flips which end is a concern. */
  function scaleCell(value, favourableHigh = false) {
    const concern = favourableHigh ? 6 - value : value;
    const tone = concern >= 4 ? 'serious' : concern === 3 ? 'warning' : 'accent';
    return h('span', { class: `scale-pill scale-${tone}`, title: `${value} out of 5` }, String(value));
  }

  async function openDetail(id) {
    const assessment = await getAssessment(id);
    if (!assessment) {
      toast('That assessment could not be found.', 'warning');
      return;
    }
    const measures = [
      ['Stress level', assessment.stress_level, false],
      ['Anxiety level', assessment.anxiety_level, false],
      ['Academic pressure', assessment.academic_pressure, false],
      ['Emotional wellbeing', assessment.emotional_wellbeing, true]
    ];
    modal({
      title: 'Wellbeing assessment',
      subtitle: `${assessment.student_name} · ${assessment.student_id}`,
      size: 'large',
      body: h('div', { class: 'detail-body' },
        h('div', { class: 'detail-banner' },
          bandChip(assessment.band),
          statusChip(assessment.status),
          h('span', { class: 'detail-banner-meta' }, `Submitted ${formatDateTime(assessment.submitted_at)}`)),
        h('div', { class: 'detail-section' },
          h('h3', { class: 'detail-heading' }, 'Readings'),
          h('p', { class: 'detail-hint' }, 'Each measure is self-reported on a 1–5 scale.'),
          h('div', { class: 'measure-grid' },
            measures.map(([label, value, favourableHigh]) => {
              const concern = favourableHigh ? 6 - value : value;
              const tone = concern >= 4 ? 'serious' : concern === 3 ? 'warning' : 'accent';
              return h('div', { class: 'measure-row' },
                h('p', { class: 'measure-label' }, label),
                meter(value, 5, tone));
            }))),
        detailList([
          ['Programme', assessment.programme],
          ['Monitoring band', bandChip(assessment.band)],
          ['Record ID', h('span', { class: 'mono' }, assessment.id)]
        ]),
        h('p', { class: 'detail-hint' },
          'This band is a workload cue for the counselling team, not a clinical finding.')),
      actions: h('button', { type: 'button', class: 'button button-quiet', onclick: () => closeModal() }, 'Close')
    });
  }

  async function render() {
    controls.sync();
    const query = getQuery(PAGE);
    await swapRegion(region, async () => {
      const result = await listAssessments(query);
      return dataTable({
        columns,
        result,
        caption: 'Wellbeing assessment submissions',
        sort: { by: query.sort_by, dir: query.sort_dir },
        onSort: column => { toggleSort(PAGE, column); render(); },
        onPage: page => { setQuery(PAGE, { page }); render(); }
      });
    });
    await renderSummary();
  }

  /** Summary cards and charts follow the date range, not the page number. */
  async function renderSummary() {
    const { from, to } = getQuery(PAGE);
    const summary = await getWellbeingSummary({ from, to });
    summaryRegion.replaceChildren(...summary.averages.map(measure => statCard({
      label: `Average ${measure.label.toLowerCase()}`,
      value: measure.average,
      caption: measure.higher_is_better ? 'Higher is more favourable' : 'Lower is more favourable',
      iconName: measure.higher_is_better ? 'smile' : 'activity'
    })));
    // statCard formats whole numbers; show the one decimal place these need.
    summaryRegion.querySelectorAll('.stat-value').forEach((node, index) => {
      node.textContent = `${summary.averages[index].average.toFixed(1)}`;
      node.append(h('span', { class: 'stat-unit' }, '/5'));
    });
    chartRegion.replaceChildren(
      wellbeingDistributionCard(summary.distribution),
      assessmentAveragesCard(summary.averages)
    );
  }

  const stop = onSubmissionChange(() => render());
  container.addEventListener('page:unmount', stop, { once: true });

  await render();
}
