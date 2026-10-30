/**
 * charts.js — every Chart.js chart in the dashboard.
 *
 * Colour decisions here are deliberate and were validated rather than
 * eyeballed:
 *
 *   - No chart uses a multi-series categorical palette. The brand sage and
 *     teal sit too close in hue to be told apart under red/green colour
 *     vision deficiency, so each chart is either single-hue (magnitude),
 *     an ordered one-hue ramp, or the reserved status palette.
 *   - ORDINAL ramp (satisfaction) is one teal hue stepped light to dark.
 *     Checked for monotone lightness, a visible step gap, and a light end
 *     that still separates from a white card.
 *   - STATUS colours (wellbeing bands) are a fixed good / warning / serious
 *     trio and always ship with an icon and a word, because two of the three
 *     sit below 3:1 against white on purpose.
 *   - Counselling categories are nominal, so every bar is one colour. Making
 *     each bar a different shade would encode bar length twice and say nothing.
 *
 * Every chart also renders its own legend in HTML (so label text wears text
 * colours, never the series colour) and carries a collapsed table of values,
 * so nothing is reachable only by hovering.
 */

import { h, icon, emptyState, chartTableView, formatNumber, paintIcons } from './ui.js';

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

export const CHART_TOKENS = {
  surface: '#FFFFFF',
  // Single hue for magnitude — step 3 of the ordinal ramp.
  accent: '#3C7568',
  accentWash: 'rgba(60, 117, 104, 0.10)',
  accentHover: '#2F6F62',
  // Validated ordinal ramp, light -> dark.
  ordinal: ['#8AB3A7', '#5E9487', '#3C7568', '#22554B'],
  // Reserved status palette, never used for a plain series.
  status: { good: '#0CA30C', warning: '#FAB219', serious: '#EC835A', critical: '#D03B3B' },
  grid: '#E8EAE6',
  axis: '#C9CDC6',
  inkPrimary: '#1F2937',
  inkSecondary: '#4B5563',
  inkMuted: '#6B7280',
  font: "'Source Sans 3', 'Source Sans Pro', system-ui, -apple-system, 'Segoe UI', sans-serif"
};

const BAND_COLOURS = {
  Good: CHART_TOKENS.status.good,
  Moderate: CHART_TOKENS.status.warning,
  'Needs Support': CHART_TOKENS.status.serious
};

/** Darkest step = most satisfied, so the ramp reads with the scale. */
const SATISFACTION_COLOURS = {
  'Very Satisfied': CHART_TOKENS.ordinal[3],
  Satisfied: CHART_TOKENS.ordinal[2],
  Neutral: CHART_TOKENS.ordinal[1],
  Dissatisfied: CHART_TOKENS.ordinal[0]
};

let reduceMotion = false;

export function setChartMotion(enabled) {
  reduceMotion = !enabled;
}

function prefersReducedMotion() {
  return reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ *
 * Chart.js base configuration
 * ------------------------------------------------------------------ */

const registry = new Map();

function available() {
  return typeof window.Chart !== 'undefined';
}

function applyDefaults() {
  if (!available() || window.Chart.__brandDefaultsApplied) return;
  const { Chart } = window;
  Chart.defaults.font.family = CHART_TOKENS.font;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = CHART_TOKENS.inkMuted;
  Chart.defaults.plugins.legend.display = false; // legends are rendered in HTML
  Chart.defaults.plugins.tooltip.backgroundColor = '#111827';
  Chart.defaults.plugins.tooltip.titleColor = '#FFFFFF';
  Chart.defaults.plugins.tooltip.bodyColor = '#E5E7EB';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
  Chart.defaults.plugins.tooltip.bodyFont = { weight: '600', size: 13 };
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.maintainAspectRatio = false;
  Chart.__brandDefaultsApplied = true;
}

/**
 * Vertical hairline on the line chart, so a reader aims at a month rather
 * than at a 2px stroke.
 */
const crosshairPlugin = {
  id: 'brandCrosshair',
  afterDatasetsDraw(chart) {
    const active = chart.getActiveElements();
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = CHART_TOKENS.axis;
    ctx.stroke();
    ctx.restore();
  }
};

/** Replaces any chart already drawn on this canvas id. */
function mount(id, canvas, config) {
  applyDefaults();
  destroy(id);
  const chart = new window.Chart(canvas, config);
  registry.set(id, chart);
  return chart;
}

export function destroy(id) {
  const existing = registry.get(id);
  if (existing) {
    existing.destroy();
    registry.delete(id);
  }
}

/** Called by the router before a new page is mounted. */
export function destroyAll() {
  [...registry.keys()].forEach(destroy);
}

const animation = () => (prefersReducedMotion() ? false : { duration: 420, easing: 'easeOutQuart' });

/* ------------------------------------------------------------------ *
 * Card shell shared by every chart
 * ------------------------------------------------------------------ */

/**
 * Builds the card, then calls `draw(canvas)` once the canvas is in the
 * document — Chart.js needs a laid-out parent to size itself.
 *
 * `legend`  : [{ label, value, colour }] rendered as HTML
 * `table`   : { columns, rows } for the collapsed table twin
 * `height`  : canvas box height, sized to include the axis band
 */
export function chartCard({
  title, subtitle, total, draw, legend = null, table = null, height = 260,
  headline = null, className = '', emptyBody = 'Records will appear here once submissions arrive in this range.'
}) {
  const card = h('section', { class: `card chart-card ${className}`.trim() });
  card.append(h('header', { class: 'card-head' },
    h('div', { class: 'card-head-text' },
      h('h2', { class: 'card-title' }, title),
      subtitle ? h('p', { class: 'card-subtitle' }, subtitle) : null),
    headline));

  if (!total) {
    card.append(emptyState({ iconName: 'chart-pie', title: 'Nothing to chart yet', body: emptyBody }));
    return card;
  }

  if (!available()) {
    card.append(emptyState({
      iconName: 'wifi-off',
      title: 'Chart library unavailable',
      body: 'Chart.js loads from a CDN. Reconnect and reload the page to draw this chart. The values are in the table below.'
    }));
    if (table) card.append(chartTableView({ ...table, label: 'Show values as a table' }));
    return card;
  }

  const canvas = h('canvas', { role: 'img', 'aria-label': `${title}. Values are listed in the table below this chart.` });
  card.append(h('div', { class: 'chart-box', style: { height: `${height}px` } }, canvas));
  if (legend) card.append(chartLegend(legend));
  if (table) card.append(chartTableView(table));

  // Draw after the browser has laid the card out.
  requestAnimationFrame(() => {
    if (canvas.isConnected) draw(canvas);
  });
  return card;
}

/**
 * HTML legend. The swatch carries identity; the text stays in ink colours.
 * `shape` mirrors the mark — a rect for bars and areas, a line for lines.
 */
export function chartLegend(entries, shape = 'rect') {
  return h('ul', { class: 'chart-legend' }, entries.map(entry =>
    h('li', { class: 'chart-legend-item' },
      h('span', {
        class: `legend-key legend-${shape}`,
        style: { backgroundColor: entry.colour },
        'aria-hidden': 'true'
      }),
      h('span', { class: 'legend-label' }, entry.label),
      entry.value !== undefined
        ? h('span', { class: 'legend-value' }, formatNumber(entry.value))
        : null,
      entry.share !== undefined
        ? h('span', { class: 'legend-share' }, `${entry.share}%`)
        : null)));
}

const shareOf = (value, total) => (total ? Math.round((value / total) * 100) : 0);

/* ------------------------------------------------------------------ *
 * Chart 1 — Student wellbeing distribution (doughnut, status palette)
 * ------------------------------------------------------------------ */

export function wellbeingDistributionCard(distribution, { className = '' } = {}) {
  const total = distribution.reduce((sum, row) => sum + row.value, 0);
  const needsSupport = distribution.find(row => row.label === 'Needs Support');

  return chartCard({
    title: 'Student wellbeing distribution',
    subtitle: 'Monitoring bands across submitted assessments',
    className: `chart-card-doughnut ${className}`.trim(),
    total,
    height: 220,
    headline: needsSupport && needsSupport.value
      ? h('p', { class: 'card-flag' },
          icon('circle-alert', 15),
          h('span', {}, `${needsSupport.value} marked Needs Support`))
      : null,
    legend: distribution.map(row => ({
      label: row.label,
      value: row.value,
      share: shareOf(row.value, total),
      colour: BAND_COLOURS[row.label]
    })),
    table: {
      label: 'Show band counts as a table',
      columns: ['Band', 'Assessments', 'Share'],
      rows: distribution.map(row => [row.label, row.value, `${shareOf(row.value, total)}%`])
    },
    draw: canvas => mount('wellbeing-doughnut', canvas, {
      type: 'doughnut',
      data: {
        labels: distribution.map(row => row.label),
        datasets: [{
          data: distribution.map(row => row.value),
          backgroundColor: distribution.map(row => BAND_COLOURS[row.label]),
          // A 2px ring in the surface colour is the gap between segments.
          borderColor: CHART_TOKENS.surface,
          borderWidth: 2,
          hoverOffset: 6,
          hoverBorderColor: CHART_TOKENS.surface
        }]
      },
      options: {
        responsive: true,
        cutout: '64%',
        animation: animation(),
        plugins: {
          tooltip: {
            callbacks: {
              label: context => ` ${formatNumber(context.parsed)} assessments · ${shareOf(context.parsed, total)}%`
            }
          }
        }
      }
    })
  });
}

/* ------------------------------------------------------------------ *
 * Chart 2 — Monthly form submissions (line, single series)
 * ------------------------------------------------------------------ */

export function submissionsTrendCard(byMonth, { className = '', height = 268 } = {}) {
  const total = byMonth.reduce((sum, row) => sum + row.value, 0);
  const peak = byMonth.reduce((best, row) => (row.value > best.value ? row : best), byMonth[0] || { value: 0 });

  return chartCard({
    title: 'Monthly form submissions',
    subtitle: 'All form types combined',
    className,
    total,
    height,
    headline: peak && peak.value
      ? h('p', { class: 'card-note' }, `Busiest month: ${peak.label} (${peak.value})`)
      : null,
    // One series, so no legend box — the title already says what is plotted.
    table: {
      label: 'Show monthly totals as a table',
      columns: ['Month', 'Submissions'],
      rows: byMonth.map(row => [row.label, row.value])
    },
    draw: canvas => mount('submissions-line', canvas, {
      type: 'line',
      data: {
        labels: byMonth.map(row => row.label),
        datasets: [{
          label: 'Submissions',
          data: byMonth.map(row => row.value),
          borderColor: CHART_TOKENS.accent,
          backgroundColor: CHART_TOKENS.accentWash,
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 4,
          pointBackgroundColor: CHART_TOKENS.accent,
          pointBorderColor: CHART_TOKENS.surface,
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        animation: animation(),
        // Hit the month, not the line.
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CHART_TOKENS.axis },
            ticks: { color: CHART_TOKENS.inkMuted, maxRotation: 0, autoSkipPadding: 12 }
          },
          y: {
            beginAtZero: true,
            grid: { color: CHART_TOKENS.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHART_TOKENS.inkMuted, precision: 0, padding: 8 }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: items => items[0].label,
              label: context => ` ${formatNumber(context.parsed.y)} submissions`
            }
          }
        }
      },
      plugins: [crosshairPlugin]
    })
  });
}

/* ------------------------------------------------------------------ *
 * Chart 3 — Counselling categories (horizontal bars, one hue)
 * ------------------------------------------------------------------ */

export function categoriesCard(categories, { className = '' } = {}) {
  const total = categories.reduce((sum, row) => sum + row.value, 0);
  const ordered = categories.slice().sort((a, b) => b.value - a.value);

  return chartCard({
    title: 'Counselling categories',
    subtitle: 'Completed and scheduled sessions by reason',
    className,
    total,
    height: 272,
    table: {
      label: 'Show category counts as a table',
      columns: ['Category', 'Sessions', 'Share'],
      rows: ordered.map(row => [row.label, row.value, `${shareOf(row.value, total)}%`])
    },
    draw: canvas => mount('categories-bar', canvas, {
      type: 'bar',
      data: {
        labels: ordered.map(row => row.label),
        datasets: [{
          label: 'Sessions',
          data: ordered.map(row => row.value),
          // Nominal categories: one series, one colour.
          backgroundColor: CHART_TOKENS.accent,
          hoverBackgroundColor: CHART_TOKENS.accentHover,
          borderRadius: 4,
          // Square where it meets the baseline, rounded at the data end.
          borderSkipped: 'start',
          barThickness: 'flex',
          maxBarThickness: 22,
          categoryPercentage: 0.78,
          barPercentage: 0.9
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        animation: animation(),
        interaction: { mode: 'nearest', intersect: true },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: CHART_TOKENS.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHART_TOKENS.inkMuted, precision: 0, padding: 6 }
          },
          y: {
            grid: { display: false },
            border: { color: CHART_TOKENS.axis },
            ticks: { color: CHART_TOKENS.inkSecondary, crossAlign: 'far', padding: 6 }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: context => ` ${formatNumber(context.parsed.x)} sessions · ${shareOf(context.parsed.x, total)}%`
            }
          }
        }
      }
    })
  });
}

/* ------------------------------------------------------------------ *
 * Chart 4 — Feedback satisfaction (doughnut, ordinal ramp)
 * ------------------------------------------------------------------ */

export function satisfactionCard(distribution, { averageRating = null, className = '' } = {}) {
  const total = distribution.reduce((sum, row) => sum + row.value, 0);

  return chartCard({
    title: 'Feedback satisfaction',
    subtitle: 'How students rated their counselling session',
    className: `chart-card-doughnut ${className}`.trim(),
    total,
    height: 220,
    headline: averageRating
      ? h('p', { class: 'card-note' },
          h('strong', {}, String(averageRating)),
          h('span', {}, ' average rating'))
      : null,
    legend: distribution.map(row => ({
      label: row.label,
      value: row.value,
      share: shareOf(row.value, total),
      colour: SATISFACTION_COLOURS[row.label]
    })),
    table: {
      label: 'Show satisfaction counts as a table',
      columns: ['Satisfaction', 'Responses', 'Share'],
      rows: distribution.map(row => [row.label, row.value, `${shareOf(row.value, total)}%`])
    },
    draw: canvas => mount('satisfaction-doughnut', canvas, {
      type: 'doughnut',
      data: {
        labels: distribution.map(row => row.label),
        datasets: [{
          data: distribution.map(row => row.value),
          backgroundColor: distribution.map(row => SATISFACTION_COLOURS[row.label]),
          borderColor: CHART_TOKENS.surface,
          borderWidth: 2,
          hoverOffset: 6,
          hoverBorderColor: CHART_TOKENS.surface
        }]
      },
      options: {
        responsive: true,
        cutout: '64%',
        animation: animation(),
        plugins: {
          tooltip: {
            callbacks: {
              label: context => ` ${formatNumber(context.parsed)} responses · ${shareOf(context.parsed, total)}%`
            }
          }
        }
      }
    })
  });
}

/* ------------------------------------------------------------------ *
 * Wellbeing measure averages (columns, one hue, fixed 1–5 axis)
 * ------------------------------------------------------------------ */

export function assessmentAveragesCard(averages, { className = '' } = {}) {
  const total = averages.reduce((sum, row) => sum + row.average, 0);

  return chartCard({
    title: 'Average assessment readings',
    subtitle: 'Self-reported 1–5 scale, mean across the range',
    className,
    total,
    height: 248,
    table: {
      label: 'Show averages as a table',
      columns: ['Measure', 'Average (1–5)'],
      rows: averages.map(row => [row.label, row.average.toFixed(1)])
    },
    draw: canvas => mount('assessment-averages', canvas, {
      type: 'bar',
      data: {
        labels: averages.map(row => row.label),
        datasets: [{
          label: 'Average',
          data: averages.map(row => row.average),
          backgroundColor: CHART_TOKENS.accent,
          hoverBackgroundColor: CHART_TOKENS.accentHover,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.7,
          barPercentage: 0.85
        }]
      },
      options: {
        responsive: true,
        animation: animation(),
        interaction: { mode: 'nearest', intersect: true },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CHART_TOKENS.axis },
            ticks: { color: CHART_TOKENS.inkSecondary, maxRotation: 0, autoSkip: false, callback(value) {
              // Wrap two-word measure names onto two lines.
              return this.getLabelForValue(value).split(' ');
            } }
          },
          y: {
            beginAtZero: true,
            max: 5,
            grid: { color: CHART_TOKENS.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHART_TOKENS.inkMuted, stepSize: 1, padding: 8 }
          }
        },
        plugins: {
          tooltip: {
            callbacks: { label: context => ` ${context.parsed.y.toFixed(1)} out of 5` }
          }
        }
      }
    })
  });
}

/* ------------------------------------------------------------------ *
 * Submissions by status / form type (columns, one hue) — Analytics
 * ------------------------------------------------------------------ */

export function breakdownCard({
  id, title, subtitle, rows, unit = 'submissions', className = '', height = 248
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return chartCard({
    title,
    subtitle,
    className,
    total,
    height,
    table: {
      label: 'Show values as a table',
      columns: [title, 'Count', 'Share'],
      rows: rows.map(row => [row.label, row.value, `${shareOf(row.value, total)}%`])
    },
    draw: canvas => mount(id, canvas, {
      type: 'bar',
      data: {
        labels: rows.map(row => row.label),
        datasets: [{
          label: title,
          data: rows.map(row => row.value),
          backgroundColor: CHART_TOKENS.accent,
          hoverBackgroundColor: CHART_TOKENS.accentHover,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          categoryPercentage: 0.7,
          barPercentage: 0.85
        }]
      },
      options: {
        responsive: true,
        animation: animation(),
        interaction: { mode: 'nearest', intersect: true },
        scales: {
          x: {
            grid: { display: false },
            border: { color: CHART_TOKENS.axis },
            ticks: { color: CHART_TOKENS.inkSecondary, maxRotation: 0, autoSkip: false, callback(value) {
              const label = this.getLabelForValue(value);
              return label.length > 14 ? label.split(' ') : label;
            } }
          },
          y: {
            beginAtZero: true,
            grid: { color: CHART_TOKENS.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHART_TOKENS.inkMuted, precision: 0, padding: 8 }
          }
        },
        plugins: {
          tooltip: {
            callbacks: { label: context => ` ${formatNumber(context.parsed.y)} ${unit}` }
          }
        }
      }
    })
  });
}

/** Repaints Lucide icons inside freshly built chart cards. */
export function paintChartIcons(root) {
  paintIcons(root);
}
