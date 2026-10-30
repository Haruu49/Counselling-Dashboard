/**
 * csv.js — client-side CSV export.
 *
 * Builds the file in the browser with a Blob and hands it to the viewer
 * through a temporary download link. No server and no network request.
 */

/** Wraps a value so commas, quotes and newlines survive a round trip. */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Column key -> human heading. Anything unlisted is title-cased. */
const HEADINGS = {
  id: 'Record ID',
  student_id: 'Student ID',
  student_name: 'Student Name',
  form_type: 'Form Type',
  submitted_at: 'Submitted At',
  status: 'Status',
  programme: 'Programme',
  semester: 'Semester',
  category: 'Category',
  session_type: 'Session Type',
  stress_level: 'Stress Level (1-5)',
  anxiety_level: 'Anxiety Level (1-5)',
  academic_pressure: 'Academic Pressure (1-5)',
  emotional_wellbeing: 'Emotional Wellbeing (1-5)',
  band: 'Monitoring Band',
  rating: 'Session Rating (1-5)',
  satisfaction: 'Satisfaction',
  comments: 'Comments',
  metric: 'Metric',
  dimension: 'Dimension',
  value: 'Value'
};

const headingFor = key => HEADINGS[key]
  || key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

/**
 * Serialises an array of flat objects. Columns come from the first row, so
 * every row is expected to share a shape — which the data layer guarantees.
 */
export function toCSV(rows, { notice = null } = {}) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const lines = [];
  if (notice) lines.push(escapeCell(notice));
  lines.push(keys.map(key => escapeCell(headingFor(key))).join(','));
  rows.forEach(row => lines.push(keys.map(key => escapeCell(row[key])).join(',')));
  return lines.join('\r\n');
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Triggers a download. Returns the file name so the caller can name it in a
 * confirmation message. Throws when there is nothing to export.
 */
export function downloadCSV(rows, baseName, options = {}) {
  if (!rows || !rows.length) throw new Error('There are no records in this range to export.');
  const csv = toCSV(rows, options);
  // The BOM keeps accented names readable when the file is opened in Excel.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const fileName = `${baseName}-${timestamp()}.csv`;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick; Safari needs the URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}
