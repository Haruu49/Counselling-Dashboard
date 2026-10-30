/**
 * dashboard.js — the Overview page.
 *
 * Opens with the four headline statistics, offers the actions a counsellor
 * reaches for first, then the charts, then the recent submissions table.
 */

import {
  h, icon, statCard, dataTable, selectField, pageHeader, demoNotice, swapRegion,
  tableSkeleton, toast, paintIcons, formatDate
} from './ui.js';
import { getOverviewStats, getAnalytics, listSubmissions, getExportRows, FORM_TYPES, SUBMISSION_STATUSES } from './data.js';
import { getQuery, setQuery, toggleSort, rangeFromPreset } from './state.js';
import { submissionColumns, openSubmissionDetail, buildToolbar, onSubmissionChange } from './submissions.js';
import {
  wellbeingDistributionCard, submissionsTrendCard, categoriesCard, satisfactionCard
} from './charts.js';
import { downloadCSV } from './csv.js';
import { navigate } from './router.js';

export async function mountOverview(container, { profile }) {
  const PAGE = 'recent';
  const statsRegion = h('div', { class: 'stat-grid stat-grid-four' });
  // A plain wrapper: the grid itself is rebuilt inside on each render.
  const chartRegion = h('div', { class: 'region' });
  const tableRegion = h('div', { class: 'region' }, tableSkeleton(5, 6));

  const controls = buildToolbar(PAGE, () => renderTable(), {
    searchPlaceholder: 'Search student ID or name',
    fields: () => {
      const query = getQuery(PAGE);
      return [
        selectField({
          label: 'Form type', value: query.form_type, options: FORM_TYPES, allLabel: 'All form types',
          onChange: value => { setQuery(PAGE, { form_type: value }); renderTable(); }
        }),
        selectField({
          label: 'Status', value: query.status, options: SUBMISSION_STATUSES, allLabel: 'All statuses',
          onChange: value => { setQuery(PAGE, { status: value }); renderTable(); }
        })
      ];
    }
  });

  container.append(
    pageHeader({
      title: greeting(profile.full_name),
      description: `Here is what has come in across the counselling service. Today is ${formatDate(new Date().toISOString())}.`
    }),
    demoNotice(),
    statsRegion,
    quickActions(),
    chartRegion,
    h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Recent student submissions'),
          h('p', { class: 'card-subtitle' }, 'The latest forms to arrive. Open one to read it and set its status.')),
        h('button', {
          type: 'button', class: 'button button-quiet button-small', onclick: () => navigate('submissions')
        }, h('span', {}, 'All submissions'), icon('arrow-right', 15))),
      controls.node,
      tableRegion)
  );

  /* ---- quick actions ---- */

  function quickActions() {
    const actions = [
      {
        label: 'View new submissions',
        hint: 'Forms waiting for a first read',
        iconName: 'inbox',
        run: () => {
          setQuery('submissions', { status: 'New', search: '', form_type: '' });
          navigate('submissions');
        }
      },
      {
        label: 'View counselling registrations',
        hint: 'Students asking for an appointment',
        iconName: 'clipboard-list',
        run: () => navigate('registration')
      },
      {
        label: 'View wellbeing reports',
        hint: 'Assessment readings and bands',
        iconName: 'heart-pulse',
        run: () => navigate('wellbeing')
      },
      {
        label: 'View feedback',
        hint: 'Ratings and comments from sessions',
        iconName: 'message-square-quote',
        run: () => navigate('feedback')
      },
      {
        label: 'Generate CSV report',
        hint: 'Download the last 90 days',
        iconName: 'download',
        run: async () => {
          try {
            const range = rangeFromPreset('last_90');
            const rows = await getExportRows('summary', range);
            const fileName = downloadCSV(rows, 'counselling-summary', {
              notice: 'Counselling Dashboard demonstration export. All records are fictional.'
            });
            toast(`Downloaded ${fileName} covering the last 90 days.`);
          } catch (error) {
            toast(error.message, 'warning');
          }
        }
      }
    ];

    return h('section', { class: 'quick-actions' },
      h('h2', { class: 'section-heading' }, 'Quick actions'),
      h('div', { class: 'quick-action-row' },
        actions.map(action => h('button', {
          type: 'button', class: 'quick-action', onclick: action.run
        },
          h('span', { class: 'quick-action-icon' }, icon(action.iconName, 18)),
          h('span', { class: 'quick-action-text' },
            h('strong', {}, action.label),
            h('small', {}, action.hint))))));
  }

  /* ---- regions ---- */

  async function renderStats() {
    const stats = await getOverviewStats();
    statsRegion.replaceChildren(
      statCard({
        label: 'Total students',
        value: stats.total_students.value,
        caption: stats.total_students.caption,
        iconName: 'users',
        delta: stats.total_students.change,
        deltaPeriod: 'vs previous 30 days'
      }),
      statCard({
        label: 'Total form submissions',
        value: stats.total_submissions.value,
        caption: stats.total_submissions.caption,
        iconName: 'file-text',
        delta: stats.total_submissions.change,
        deltaPeriod: 'vs previous 30 days'
      }),
      statCard({
        label: 'Pending reviews',
        value: stats.pending_reviews.value,
        caption: `${stats.pending_reviews.under_review} more are under review`,
        iconName: 'clock',
        // More unread forms is not good news, so the arrow and the colour part ways.
        delta: null
      }),
      statCard({
        label: 'Completed counselling sessions',
        value: stats.completed_sessions.value,
        caption: stats.completed_sessions.caption,
        iconName: 'circle-check',
        delta: stats.completed_sessions.change,
        deltaPeriod: 'vs previous 30 days'
      })
    );
    paintIcons(statsRegion);
  }

  async function renderCharts() {
    await swapRegion(chartRegion, async () => {
      const analytics = await getAnalytics({});
      return h('div', { class: 'chart-grid chart-grid-two' },
        submissionsTrendCard(analytics.submissions_by_month, { className: 'span-two' }),
        wellbeingDistributionCard(analytics.wellbeing_distribution),
        satisfactionCard(analytics.feedback_satisfaction, { averageRating: analytics.totals.average_rating }),
        categoriesCard(analytics.counselling_categories, { className: 'span-two' }));
    });
  }

  async function renderTable() {
    controls.sync();
    const query = getQuery(PAGE);
    await swapRegion(tableRegion, async () => {
      const result = await listSubmissions(query);
      return dataTable({
        columns: submissionColumns({
          onView: id => openSubmissionDetail(id, {
            onUpdated: () => { renderTable(); renderStats(); }
          })
        }),
        result,
        caption: 'Recent student counselling form submissions',
        sort: { by: query.sort_by, dir: query.sort_dir },
        onSort: column => { toggleSort(PAGE, column); renderTable(); },
        onPage: page => { setQuery(PAGE, { page }); renderTable(); }
      });
    });
  }

  const stop = onSubmissionChange(() => { renderStats(); renderCharts(); });
  container.addEventListener('page:unmount', stop, { once: true });

  await Promise.all([renderStats(), renderCharts(), renderTable()]);
}

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').replace(/^Dr\.?\s+/i, '').split(' ')[0] || 'there';
  return `${part}, ${first}`;
}
