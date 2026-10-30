/**
 * analytics.js — Analytics & Reports page.
 *
 * One date-range control at the top scopes every number, chart and export
 * below it, so the figures on screen always describe the same slice.
 */

import {
  h, icon, pageHeader, demoNotice, statCard, toast, swapRegion, loadingRegion,
  formatDate, dateField, paintIcons
} from './ui.js';
import { getAnalytics, getExportRows } from './data.js';
import { getQuery, setQuery, RANGE_PRESETS, rangeFromPreset, todayISO } from './state.js';
import {
  submissionsTrendCard, wellbeingDistributionCard, categoriesCard,
  satisfactionCard, breakdownCard
} from './charts.js';
import { downloadCSV } from './csv.js';

const EXPORTS = [
  { id: 'summary', label: 'Summary of all charts', file: 'counselling-summary', iconName: 'chart-column' },
  { id: 'submissions', label: 'Student submissions', file: 'counselling-submissions', iconName: 'inbox' },
  { id: 'registrations', label: 'Counselling registrations', file: 'counselling-registrations', iconName: 'clipboard-list' },
  { id: 'assessments', label: 'Wellbeing assessments', file: 'counselling-assessments', iconName: 'heart-pulse' },
  { id: 'feedback', label: 'Counselling feedback', file: 'counselling-feedback', iconName: 'message-square-quote' }
];

export async function mountAnalytics(container) {
  const PAGE = 'analytics';
  const statsRegion = h('div', { class: 'stat-grid stat-grid-four' });
  // A plain wrapper: the grid itself is rebuilt inside on each render.
  const chartRegion = h('div', { class: 'region' }, loadingRegion('Building charts'));
  const rangeLabel = h('p', { class: 'range-summary' });

  const controls = h('div', { class: 'toolbar toolbar-range' });

  container.append(
    pageHeader({
      title: 'Analytics & Reports',
      description: 'Aggregate activity across the counselling service. No individual student is identified on this page.',
      actions: h('button', {
        type: 'button', class: 'button button-primary', onclick: () => openExportMenu()
      }, icon('download', 16), h('span', {}, 'Export CSV'))
    }),
    demoNotice('Demonstration data only. Figures are generated from fictional records.'),
    h('section', { class: 'card card-flush' }, controls, rangeLabel),
    statsRegion,
    chartRegion,
    exportPanel()
  );

  /** Preset rows first, custom range behind them — nobody fights a calendar for "last 30 days". */
  function renderControls() {
    const query = getQuery(PAGE);
    const presetButtons = h('div', { class: 'preset-row', role: 'group', 'aria-label': 'Date range presets' },
      RANGE_PRESETS.map(preset => h('button', {
        type: 'button',
        class: `preset-button${query.preset === preset.id ? ' is-selected' : ''}`,
        'aria-pressed': query.preset === preset.id ? 'true' : 'false',
        onclick: () => {
          if (preset.id === 'custom') {
            setQuery(PAGE, { preset: 'custom' });
          } else {
            const range = rangeFromPreset(preset.id);
            setQuery(PAGE, { preset: preset.id, ...range });
          }
          render();
        }
      },
        query.preset === preset.id ? icon('check', 15) : null,
        h('span', {}, preset.label))));

    const custom = h('div', { class: 'custom-range' },
      dateField({
        label: 'From', value: query.from, max: todayISO(),
        onChange: value => { setQuery(PAGE, { from: value, preset: 'custom' }); render(); }
      }),
      dateField({
        label: 'To', value: query.to, max: todayISO(),
        onChange: value => { setQuery(PAGE, { to: value, preset: 'custom' }); render(); }
      }));

    controls.replaceChildren(presetButtons, custom);
    paintIcons(controls);
  }

  function exportPanel() {
    return h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Download a report'),
          h('p', { class: 'card-subtitle' }, 'Each file covers the date range selected above and is built in your browser — nothing is uploaded.'))),
      h('div', { class: 'export-grid' },
        EXPORTS.map(entry => h('button', {
          type: 'button', class: 'export-button', onclick: () => runExport(entry)
        },
          h('span', { class: 'export-icon' }, icon(entry.iconName, 18)),
          h('span', { class: 'export-text' },
            h('strong', {}, entry.label),
            h('small', {}, `${entry.file}.csv`)),
          icon('download', 16)))));
  }

  function openExportMenu() {
    const panel = container.querySelector('.export-grid');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const first = panel.querySelector('button');
      if (first) first.focus();
    }
  }

  async function runExport(entry) {
    const { from, to } = getQuery(PAGE);
    try {
      const rows = await getExportRows(entry.id, { from, to });
      const notice = 'Counselling Dashboard demonstration export. All records are fictional.';
      const fileName = downloadCSV(rows, entry.file, { notice });
      toast(`Downloaded ${fileName} with ${rows.length} rows.`);
    } catch (error) {
      toast(error.message, 'warning');
    }
  }

  async function render() {
    renderControls();
    const { from, to } = getQuery(PAGE);

    rangeLabel.replaceChildren(
      document.createTextNode(from || to
        ? `Showing ${from ? formatDate(from) : 'the earliest record'} to ${to ? formatDate(to) : 'today'}.`
        : 'Showing every demonstration record.')
    );

    const analytics = await getAnalytics({ from, to });

    statsRegion.replaceChildren(
      statCard({ label: 'Total form submissions', value: analytics.totals.submissions, caption: 'All form types', iconName: 'file-text' }),
      statCard({ label: 'Wellbeing assessments', value: analytics.totals.assessments, caption: 'Submitted in range', iconName: 'heart-pulse' }),
      statCard({ label: 'Completed sessions', value: analytics.totals.sessions, caption: 'Recorded as completed', iconName: 'circle-check' }),
      statCard({ label: 'Average feedback rating', value: analytics.totals.average_rating, caption: 'Out of 5', iconName: 'star' })
    );
    const ratingValue = statsRegion.querySelectorAll('.stat-value')[3];
    if (ratingValue) {
      ratingValue.textContent = analytics.totals.average_rating.toFixed(1);
      ratingValue.append(h('span', { class: 'stat-unit' }, '/5'));
    }

    await swapRegion(chartRegion, async () => {
      const grid = h('div', { class: 'chart-grid chart-grid-two' },
        submissionsTrendCard(analytics.submissions_by_month, { className: 'span-two' }),
        wellbeingDistributionCard(analytics.wellbeing_distribution),
        satisfactionCard(analytics.feedback_satisfaction, { averageRating: analytics.totals.average_rating }),
        categoriesCard(analytics.counselling_categories),
        breakdownCard({
          id: 'analytics-form-types',
          title: 'Submissions by form type',
          subtitle: 'Which form students reached for',
          rows: analytics.submissions_by_form_type
        }),
        breakdownCard({
          id: 'analytics-statuses',
          title: 'Submissions by review status',
          subtitle: 'Where the queue currently stands',
          rows: analytics.submissions_by_status,
          className: 'span-two'
        }));
      return grid;
    });
    paintIcons(container);
  }

  await render();
}
