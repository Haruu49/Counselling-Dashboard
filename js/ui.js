/**
 * ui.js — reusable interface primitives.
 *
 * Every page builds its screen from these, so a table on Feedback behaves
 * exactly like a table on Submissions. Elements are constructed with DOM APIs
 * rather than HTML strings: record values reach the page through `textContent`,
 * so a student name or a free-text comment can never be parsed as markup.
 */

/* ------------------------------------------------------------------ *
 * Element factory
 * ------------------------------------------------------------------ */

/**
 * h('div', { class: 'card', onclick: fn }, 'text', childNode)
 *
 * - `class`, `id`, `type`, `href`… are set as attributes
 * - `dataset: {}` and `style: {}` are merged
 * - keys starting with `on` are bound as listeners
 * - string children become text nodes, never markup
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        if (dataValue !== null && dataValue !== undefined) node.dataset[dataKey] = dataValue;
      });
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key === 'html') {
      // Only ever used with strings this file builds itself (inline SVG).
      node.innerHTML = value;
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  });
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  children.flat(Infinity).forEach(child => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/* ------------------------------------------------------------------ *
 * Icons (Lucide, loaded from a CDN in index.html)
 * ------------------------------------------------------------------ */

/**
 * Placeholder element Lucide swaps for an SVG. If the CDN is unavailable the
 * span simply stays empty at its reserved size, so no layout shifts.
 */
export function icon(name, size = 18) {
  return h('i', {
    class: 'icon',
    'data-lucide': name,
    'aria-hidden': 'true',
    style: { width: `${size}px`, height: `${size}px` }
  });
}

/** Renders any `data-lucide` placeholders added since the last call. */
export function paintIcons(root = document.body) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons({ nameAttr: 'data-lucide', root });
    } catch {
      window.lucide.createIcons({ nameAttr: 'data-lucide' });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
});
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDate = value => (value ? DATE.format(new Date(value)) : '—');
export const formatDateTime = value => (value ? DATE_TIME.format(new Date(value)) : '—');
export const formatTime = value => (value ? TIME.format(new Date(value)) : '—');
export const formatNumber = value => new Intl.NumberFormat('en-GB').format(value ?? 0);

export function formatRelative(value) {
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

/** Signed percentage with its own word, e.g. "+12.5% vs last month". */
export function formatDelta(change) {
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

/* ------------------------------------------------------------------ *
 * Small display pieces
 * ------------------------------------------------------------------ */

const STATUS_TONE = {
  New: 'info',
  'Under Review': 'warning',
  Scheduled: 'info',
  Completed: 'good'
};

const STATUS_ICON = {
  New: 'inbox',
  'Under Review': 'loader',
  Scheduled: 'calendar-check',
  Completed: 'check'
};

/** Workflow state of a submission. Always carries its label, never colour alone. */
export function statusChip(status) {
  return h('span', { class: `chip chip-${STATUS_TONE[status] || 'neutral'}` },
    icon(STATUS_ICON[status] || 'circle', 13),
    h('span', {}, status));
}

const BAND_TONE = { Good: 'good', Moderate: 'warning', 'Needs Support': 'serious' };
const BAND_ICON = { Good: 'circle-check', Moderate: 'circle-dot', 'Needs Support': 'circle-alert' };

/**
 * Wellbeing monitoring band. Paired with an icon and a word because the
 * status palette is deliberately not readable by hue alone.
 */
export function bandChip(band) {
  return h('span', { class: `chip chip-${BAND_TONE[band] || 'neutral'}` },
    icon(BAND_ICON[band] || 'circle', 13),
    h('span', {}, band));
}

export function formTypeChip(formType) {
  const short = {
    'Counselling Registration': 'Registration',
    'Wellbeing Assessment': 'Assessment',
    'Counselling Feedback': 'Feedback'
  };
  return h('span', { class: 'chip chip-neutral', title: formType }, short[formType] || formType);
}

/** Rating 1–5 as filled marks plus the number, with a text equivalent. */
export function ratingStars(rating) {
  const wrap = h('span', {
    class: 'rating',
    role: 'img',
    'aria-label': `${rating} out of 5`
  });
  for (let i = 1; i <= 5; i += 1) {
    wrap.append(icon(i <= rating ? 'star' : 'star', 14));
    wrap.lastElementChild.classList.add(i <= rating ? 'star-on' : 'star-off');
  }
  wrap.append(h('span', { class: 'rating-value' }, String(rating)));
  return wrap;
}

/**
 * 1–5 meter. The fill carries the reading and the track is a lighter step of
 * the same ramp, so the state reads across the whole bar.
 */
export function meter(value, max = 5, tone = 'accent') {
  return h('div', { class: 'meter' },
    h('div', { class: 'meter-track' },
      h('div', {
        class: `meter-fill meter-${tone}`,
        style: { width: `${(value / max) * 100}%` }
      })),
    h('span', { class: 'meter-value' }, `${value}/${max}`));
}

export function emptyState({ iconName = 'search-x', title, body, action = null }) {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, icon(iconName, 22)),
    h('p', { class: 'empty-title' }, title),
    body ? h('p', { class: 'empty-body' }, body) : null,
    action);
}

export function sectionCard({ title, subtitle, actions = null, className = '', body = [] }) {
  const card = h('section', { class: `card ${className}`.trim() });
  if (title || actions) {
    card.append(h('header', { class: 'card-head' },
      h('div', { class: 'card-head-text' },
        h('h2', { class: 'card-title' }, title),
        subtitle ? h('p', { class: 'card-subtitle' }, subtitle) : null),
      actions));
  }
  appendChildren(card, [body]);
  return card;
}

/* ------------------------------------------------------------------ *
 * Statistic card
 * ------------------------------------------------------------------ */

/**
 * Overview statistic. `delta` is optional and signed; `deltaGoodWhenUp`
 * decides whether an increase is read as favourable, because more pending
 * reviews is not good news the way more completed sessions is.
 */
export function statCard({
  label, value, caption, iconName, delta = null, deltaGoodWhenUp = true, deltaPeriod = 'vs last month'
}) {
  let deltaNode = null;
  if (delta !== null && delta !== undefined) {
    const up = delta > 0;
    const flat = Math.round(delta * 10) === 0;
    const favourable = flat ? null : up === deltaGoodWhenUp;
    deltaNode = h('p', {
      class: `stat-delta ${flat ? 'is-flat' : favourable ? 'is-good' : 'is-poor'}`
    },
      icon(flat ? 'minus' : up ? 'trending-up' : 'trending-down', 14),
      h('span', {}, flat ? `No change ${deltaPeriod}` : `${formatDelta(delta)} ${deltaPeriod}`));
  }

  return h('article', { class: 'stat-card' },
    h('div', { class: 'stat-top' },
      h('span', { class: 'stat-icon' }, icon(iconName, 19)),
      h('p', { class: 'stat-label' }, label)),
    h('p', { class: 'stat-value' }, formatNumber(value)),
    caption ? h('p', { class: 'stat-caption' }, caption) : null,
    deltaNode);
}

/* ------------------------------------------------------------------ *
 * Toolbar: one filter row above the content it scopes
 * ------------------------------------------------------------------ */

export function searchField({ value = '', placeholder, onInput, label }) {
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    value,
    placeholder,
    'aria-label': label || placeholder,
    oninput: event => onInput(event.target.value)
  });
  return h('div', { class: 'search-field' }, icon('search', 16), input);
}

export function selectField({ label, value = '', options, onChange, allLabel = 'All' }) {
  const select = h('select', {
    class: 'select-input',
    'aria-label': label,
    onchange: event => onChange(event.target.value)
  });
  select.append(h('option', { value: '' }, allLabel));
  options.forEach(option => {
    const optionValue = typeof option === 'object' ? option.value : option;
    const optionLabel = typeof option === 'object' ? option.label : option;
    const node = h('option', { value: optionValue }, optionLabel);
    if (String(optionValue) === String(value)) node.selected = true;
    select.append(node);
  });
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    select);
}

export function dateField({ label, value = '', onChange, max = null }) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('input', {
      type: 'date',
      class: 'date-input',
      value,
      max,
      'aria-label': label,
      onchange: event => onChange(event.target.value)
    }));
}

export function toolbar({ search = null, fields = [], trailing = null, onReset = null }) {
  const row = h('div', { class: 'toolbar' });
  if (search) row.append(search);
  if (fields.length) row.append(h('div', { class: 'toolbar-fields' }, fields));
  const end = h('div', { class: 'toolbar-end' });
  if (onReset) {
    end.append(h('button', { type: 'button', class: 'button button-quiet', onclick: onReset },
      icon('rotate-ccw', 15), h('span', {}, 'Clear filters')));
  }
  if (trailing) end.append(trailing);
  if (end.childElementCount) row.append(end);
  return row;
}

/* ------------------------------------------------------------------ *
 * Data table with sorting and pagination
 * ------------------------------------------------------------------ */

/**
 * columns: [{ key, label, sortable, align, width, render(row) }]
 * sort:    { by, dir } — current sort, reflected in aria-sort
 * result:  the paginated payload from the data layer
 */
export function dataTable({ columns, result, sort, onSort, onPage, caption, empty }) {
  const wrap = h('div', { class: 'table-wrap' });

  if (!result.rows.length) {
    wrap.append(empty || emptyState({
      title: 'No records match these filters',
      body: 'Adjust the search or clear the filters to see more records.'
    }));
    return wrap;
  }

  const table = h('table', { class: 'data-table' });
  if (caption) table.append(h('caption', { class: 'sr-only' }, caption));

  const headRow = h('tr');
  columns.forEach(column => {
    const isSorted = sort && sort.by === column.key;
    const cell = h('th', {
      scope: 'col',
      class: column.align ? `align-${column.align}` : null,
      style: column.width ? { width: column.width } : null,
      'aria-sort': column.sortable ? (isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : null
    });
    if (column.sortable && onSort) {
      cell.append(h('button', {
        type: 'button',
        class: `th-sort${isSorted ? ' is-sorted' : ''}`,
        onclick: () => onSort(column.key)
      },
        h('span', {}, column.label),
        icon(isSorted ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down', 14)));
    } else {
      cell.append(h('span', {}, column.label));
    }
    headRow.append(cell);
  });

  const body = h('tbody');
  result.rows.forEach(row => {
    const tr = h('tr');
    columns.forEach(column => {
      const cell = h('td', {
        class: column.align ? `align-${column.align}` : null,
        'data-label': column.label
      });
      const content = column.render ? column.render(row) : row[column.key];
      appendChildren(cell, [content]);
      tr.append(cell);
    });
    body.append(tr);
  });

  table.append(h('thead', {}, headRow), body);
  wrap.append(h('div', { class: 'table-scroll' }, table));
  if (onPage) wrap.append(pagination({ result, onPage }));
  return wrap;
}

export function pagination({ result, onPage }) {
  const { page, page_count: pageCount, from, to, total } = result;
  const nav = h('nav', { class: 'pagination', 'aria-label': 'Pagination' });

  nav.append(h('p', { class: 'pagination-count' },
    `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`));

  const controls = h('div', { class: 'pagination-controls' });
  controls.append(h('button', {
    type: 'button', class: 'button button-quiet', disabled: page <= 1,
    'aria-label': 'Previous page',
    onclick: () => onPage(page - 1)
  }, icon('chevron-left', 16), h('span', {}, 'Previous')));

  pageNumbers(page, pageCount).forEach(entry => {
    if (entry === 'gap') {
      controls.append(h('span', { class: 'pagination-gap', 'aria-hidden': 'true' }, '…'));
      return;
    }
    controls.append(h('button', {
      type: 'button',
      class: `page-number${entry === page ? ' is-current' : ''}`,
      'aria-current': entry === page ? 'page' : null,
      'aria-label': `Page ${entry}`,
      onclick: () => onPage(entry)
    }, String(entry)));
  });

  controls.append(h('button', {
    type: 'button', class: 'button button-quiet', disabled: page >= pageCount,
    'aria-label': 'Next page',
    onclick: () => onPage(page + 1)
  }, h('span', {}, 'Next'), icon('chevron-right', 16)));

  nav.append(controls);
  return nav;
}

/** First, last, and a window around the current page. */
function pageNumbers(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) out.push('gap');
    out.push(value);
  });
  return out;
}

/* ------------------------------------------------------------------ *
 * Loading state
 * ------------------------------------------------------------------ */

export function tableSkeleton(rows = 6, cols = 5) {
  const table = h('div', { class: 'skeleton-table', 'aria-hidden': 'true' });
  for (let r = 0; r < rows; r += 1) {
    const row = h('div', { class: 'skeleton-row' });
    for (let c = 0; c < cols; c += 1) row.append(h('div', { class: 'skeleton-cell' }));
    table.append(row);
  }
  return table;
}

export function loadingRegion(message = 'Loading records') {
  return h('div', { class: 'loading-region', role: 'status' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }),
    h('span', {}, message));
}

/* ------------------------------------------------------------------ *
 * Modal dialog
 * ------------------------------------------------------------------ */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openDialog = null;

/**
 * Opens a modal. Returns a close function.
 * Traps Tab inside the dialog, closes on Escape or backdrop, and restores
 * focus to whatever was focused before it opened.
 */
export function modal({ title, subtitle = null, body, actions = null, size = 'medium' }) {
  closeModal();
  const previouslyFocused = document.activeElement;
  const root = document.getElementById('modal-root');

  const panel = h('div', {
    class: `modal modal-${size}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'modal-title'
  },
    h('header', { class: 'modal-head' },
      h('div', {},
        h('h2', { class: 'modal-title', id: 'modal-title' }, title),
        subtitle ? h('p', { class: 'modal-subtitle' }, subtitle) : null),
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': 'Close dialog', onclick: () => closeModal()
      }, icon('x', 18))),
    h('div', { class: 'modal-body' }, body),
    actions ? h('footer', { class: 'modal-foot' }, actions) : null);

  const backdrop = h('div', {
    class: 'modal-backdrop',
    onmousedown: event => { if (event.target === backdrop) closeModal(); }
  }, panel);

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKeydown);
  root.append(backdrop);
  document.body.classList.add('is-modal-open');
  paintIcons(panel);

  const target = panel.querySelector('[data-autofocus]') || panel.querySelector(FOCUSABLE);
  if (target) target.focus();

  openDialog = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
    document.body.classList.remove('is-modal-open');
    openDialog = null;
    if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
  };
  return closeModal;
}

export function closeModal() {
  if (openDialog) openDialog();
}

/** Confirmation dialog. Resolves true when the confirming button is pressed. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', tone = 'primary' }) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };
    modal({
      title,
      size: 'small',
      body: h('p', { class: 'modal-copy' }, body),
      actions: [
        h('button', { type: 'button', class: 'button button-quiet', onclick: () => finish(false) }, 'Cancel'),
        h('button', {
          type: 'button', class: `button button-${tone}`, 'data-autofocus': '', onclick: () => finish(true)
        }, confirmLabel)
      ]
    });
    // Escape / backdrop resolve false.
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.modal-backdrop')) {
        observer.disconnect();
        finish(false);
      }
    });
    observer.observe(document.getElementById('modal-root'), { childList: true });
  });
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

let toastTimer;

export function toast(message, tone = 'good') {
  const root = document.getElementById('toast-root');
  clear(root);
  const iconName = tone === 'good' ? 'circle-check' : tone === 'warning' ? 'triangle-alert' : 'info';
  const node = h('div', { class: `toast toast-${tone}` },
    icon(iconName, 17),
    h('p', {}, message),
    h('button', {
      type: 'button', class: 'icon-button', 'aria-label': 'Dismiss', onclick: () => clear(root)
    }, icon('x', 15)));
  root.append(node);
  paintIcons(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => clear(root), 4200);
}

/* ------------------------------------------------------------------ *
 * Definition list used by every detail view
 * ------------------------------------------------------------------ */

export function detailList(entries) {
  const list = h('dl', { class: 'detail-list' });
  entries.filter(Boolean).forEach(([term, value]) => {
    list.append(h('div', { class: 'detail-row' },
      h('dt', {}, term),
      h('dd', {}, value)));
  });
  return list;
}

/**
 * The table twin every chart carries, so no value is reachable only by
 * hovering a mark. Collapsed by default to keep the card quiet.
 */
export function chartTableView({ label = 'Show values as a table', columns, rows }) {
  const table = h('table', { class: 'data-table data-table-compact' });
  table.append(h('thead', {}, h('tr', {}, columns.map(col => h('th', { scope: 'col' }, col)))));
  table.append(h('tbody', {}, rows.map(row => h('tr', {}, row.map((cell, index) =>
    h(index === 0 ? 'th' : 'td', index === 0 ? { scope: 'row' } : { class: 'align-right' }, String(cell)))))));
  return h('details', { class: 'chart-table' },
    h('summary', {}, label),
    h('div', { class: 'table-scroll' }, table));
}

/* ------------------------------------------------------------------ *
 * Page furniture
 * ------------------------------------------------------------------ */

/** Intro block every page opens with. */
export function pageHeader({ title, description, actions = null }) {
  return h('div', { class: 'page-header' },
    h('div', { class: 'page-header-text' },
      h('h1', { class: 'page-title' }, title),
      description ? h('p', { class: 'page-description' }, description) : null),
    actions ? h('div', { class: 'page-header-actions' }, actions) : null);
}

/** Standing reminder that the records are fictional. */
export function demoNotice(text = 'Demonstration data only. Every student record shown here is fictional.') {
  return h('p', { class: 'demo-notice' }, icon('shield', 15), h('span', {}, text));
}

/**
 * Delays a call until typing stops, so the search field filters once rather
 * than on every keystroke.
 */
export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Swaps a region's contents without a layout jump: the previous render is
 * held at reduced opacity while the next one is built.
 */
export async function swapRegion(region, build) {
  region.classList.add('is-loading');
  try {
    const content = await build();
    region.replaceChildren(content);
  } finally {
    region.classList.remove('is-loading');
  }
  paintIcons(region);
  return region;
}
