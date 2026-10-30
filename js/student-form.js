/**
 * student-form.js — the public counselling request form.
 *
 * This page has no Supabase client and no session. It posts to the
 * `submit-counselling-request` edge function, which is the only way a
 * submission reaches the database; `anon` holds no privilege on the table at
 * all, so nothing here can read what anyone else has written.
 *
 * The checks below exist to give a student a quick, kind answer. They are not
 * the security boundary: validation.ts re-checks everything on the server, and
 * the CHECK constraints re-check the structural parts in the database.
 *
 * Markup is built from the lists in form-options.js rather than written out,
 * so the printed form and the page cannot drift apart.
 */

import { h, clear } from './ui.js';
import {
  REQUEST_TYPES, COUNSELLING_PURPOSES, COUNSELLING_ISSUES, LIMITS
} from './form-options.js';
import { functionUrl, isConfigured, projectConfig } from './project-config.js';

const main = document.getElementById('form-main');

/** Every registered control, so an error can find its field and focus it. */
const fields = new Map();

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;
const PHONE_SHAPE = /^[0-9+().\-\s]+$/;

/* ------------------------------------------------------------------ *
 * Field builders
 * ------------------------------------------------------------------ */

function register(name, entry) {
  fields.set(name, entry);
  return entry;
}

/** A labelled text, tel, email or multi-line control. */
function field({
  name, label, type = 'text', hint = null, multiline = false,
  autocomplete = null, inputmode = null, maxLength = null, rows = 6, placeholder = null
}) {
  const id = `f-${name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, errorId].filter(Boolean).join(' ');

  const attrs = {
    id,
    name,
    class: 'form-control',
    'aria-describedby': describedBy,
    maxlength: maxLength,
    placeholder,
    autocomplete,
    inputmode
  };

  const clearOwn = () => clearError(name);
  const control = multiline
    ? h('textarea', { ...attrs, rows, oninput: clearOwn })
    : h('input', { ...attrs, type, oninput: clearOwn });

  const error = h('p', { id: errorId, class: 'form-error', hidden: true });

  const node = h('div', { class: 'form-row' },
    h('label', { class: 'form-label', for: id },
      h('span', {}, label),
      h('span', { class: 'required', title: 'Required' }, '*')),
    hint ? h('p', { id: hintId, class: 'form-hint' }, hint) : null,
    control,
    error);

  register(name, { node, error, label, focus: () => control.focus(), value: () => control.value });
  return node;
}

/** The Request / Referral choice. */
function radioGroup({ name, legend, hint, options }) {
  const errorId = `f-${name}-error`;
  const error = h('p', { id: errorId, class: 'form-error', hidden: true });
  const inputs = [];

  const choices = h('div', { class: 'choice-row' }, options.map((option, index) => {
    const id = `f-${name}-${index}`;
    const input = h('input', {
      type: 'radio', id, name, value: option, class: 'choice-input',
      onchange: () => clearError(name)
    });
    inputs.push(input);
    return h('label', { class: 'choice', for: id }, input, h('span', {}, option));
  }));

  const node = h('fieldset', { class: 'form-row form-fieldset', 'aria-describedby': errorId },
    h('legend', { class: 'form-label' },
      h('span', {}, legend),
      h('span', { class: 'required', title: 'Required' }, '*')),
    hint ? h('p', { class: 'form-hint' }, hint) : null,
    choices,
    error);

  register(name, {
    node, error, label: legend,
    focus: () => inputs[0].focus(),
    value: () => inputs.find(input => input.checked)?.value ?? ''
  });
  return node;
}

/**
 * A multi-select group. Ticking "Other" reveals its short text field and
 * moves focus into it, so the next thing to type is where the caret is.
 */
function checkboxGroup({ name, legend, hint, options, otherName, otherLabel }) {
  const errorId = `f-${name}-error`;
  const error = h('p', { id: errorId, class: 'form-error', hidden: true });
  const inputs = [];

  const otherField = field({
    name: otherName,
    label: otherLabel,
    maxLength: LIMITS.other[1],
    placeholder: 'A few words is plenty'
  });
  otherField.classList.add('form-row-other');
  otherField.hidden = true;

  function syncOther() {
    const other = inputs.find(input => input.value === 'Other');
    const show = Boolean(other && other.checked);
    if (show === !otherField.hidden) return;
    otherField.hidden = !show;
    if (show) fields.get(otherName).focus();
    else clearError(otherName);
  }

  const choices = h('div', { class: 'choice-grid' }, options.map((option, index) => {
    const id = `f-${name}-${index}`;
    const input = h('input', {
      type: 'checkbox', id, name, value: option, class: 'choice-input',
      onchange: () => { clearError(name); syncOther(); }
    });
    inputs.push(input);
    return h('label', { class: 'choice', for: id }, input, h('span', {}, option));
  }));

  const node = h('fieldset', { class: 'form-row form-fieldset', 'aria-describedby': errorId },
    h('legend', { class: 'form-label' },
      h('span', {}, legend),
      h('span', { class: 'required', title: 'Required' }, '*')),
    hint ? h('p', { class: 'form-hint' }, hint) : null,
    choices,
    error,
    otherField);

  register(name, {
    node, error, label: legend,
    focus: () => inputs[0].focus(),
    value: () => inputs.filter(input => input.checked).map(input => input.value)
  });
  return node;
}

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

const summary = h('div', {
  class: 'form-summary', role: 'alert', tabindex: '-1', hidden: true
});

function clearError(name) {
  const entry = fields.get(name);
  if (!entry) return;
  entry.error.hidden = true;
  entry.error.textContent = '';
  entry.node.classList.remove('has-error');
  entry.node.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
}

function clearAllErrors() {
  fields.forEach((_, name) => clearError(name));
  summary.hidden = true;
  clear(summary);
}

/**
 * Shows each message beside its field and repeats them in one summary at the
 * top, which takes focus. A long form on a phone can push an inline message
 * well off screen; the summary means the student always learns what happened.
 */
function showErrors(errors) {
  clearAllErrors();

  const entries = Object.entries(errors).filter(([name]) => fields.has(name) || name === 'form');
  if (!entries.length) return;

  entries.forEach(([name, message]) => {
    const entry = fields.get(name);
    if (!entry) return;
    entry.error.textContent = message;
    entry.error.hidden = false;
    entry.node.classList.add('has-error');
    const control = entry.node.querySelector('.form-control, .choice-input');
    if (control) control.setAttribute('aria-invalid', 'true');
  });

  const listed = entries.filter(([name]) => fields.has(name));
  // Native append() stringifies null, so the optional row is filtered out
  // rather than passed through the way the h() helper would allow.
  summary.append(...[
    h('h2', { class: 'form-summary-title' },
      listed.length === 1
        ? 'There is one thing to check before sending'
        : `There are ${listed.length} things to check before sending`),
    h('ul', {}, listed.map(([name, message]) =>
      h('li', {},
        h('a', {
          href: `#f-${name}`,
          onclick: event => { event.preventDefault(); fields.get(name).focus(); }
        }, `${fields.get(name).label}: ${message}`)))),
    errors.form ? h('p', {}, errors.form) : null
  ].filter(Boolean));
  summary.hidden = false;
  summary.focus();
}

/* ------------------------------------------------------------------ *
 * Validation — mirrors validation.ts, which is the authority
 * ------------------------------------------------------------------ */

function validate(values) {
  const errors = {};
  const within = (value, [min, max]) => value.length >= min && value.length <= max;

  if (!values.request_type) errors.request_type = 'Choose whether this is a request or a referral.';

  if (!values.student_name) errors.student_name = 'Enter your full name.';
  else if (!within(values.student_name, LIMITS.student_name)) {
    errors.student_name = `Use between ${LIMITS.student_name[0]} and ${LIMITS.student_name[1]} characters.`;
  }

  if (!values.student_id) errors.student_id = 'Enter your student ID.';
  else if (!within(values.student_id, LIMITS.student_id)) {
    errors.student_id = `Use between ${LIMITS.student_id[0]} and ${LIMITS.student_id[1]} characters.`;
  }

  if (!values.semester) errors.semester = 'Enter your current semester.';
  else if (!within(values.semester, LIMITS.semester)) errors.semester = 'Enter your semester, for example 3.';

  if (!values.contact_no) errors.contact_no = 'Enter a contact number.';
  else if (!PHONE_SHAPE.test(values.contact_no) || (values.contact_no.match(/\d/g) || []).length < 7) {
    errors.contact_no = 'Enter a number we can reach you on, for example 012-345 6789.';
  } else if (!within(values.contact_no, LIMITS.contact_no)) {
    errors.contact_no = 'That contact number is too long.';
  }

  if (!values.email) errors.email = 'Enter your email address.';
  else if (!EMAIL.test(values.email) || !within(values.email, LIMITS.email)) {
    errors.email = 'Enter an email address in the form name@example.com.';
  }

  if (!values.purposes.length) errors.purposes = 'Choose at least one purpose.';
  if (values.purposes.includes('Other') && !values.purpose_other) {
    errors.purpose_other = 'Tell us briefly what the other purpose is.';
  }

  if (!values.issues.length) errors.issues = 'Choose at least one type of issue.';
  if (values.issues.includes('Other') && !values.issue_other) {
    errors.issue_other = 'Tell us briefly what the other issue is.';
  }

  if (!values.description) errors.description = 'Tell us briefly what prompted this request.';
  else if (values.description.length < LIMITS.description[0]) {
    errors.description = 'Please add a little more, so a counsellor knows how to help.';
  } else if (values.description.length > LIMITS.description[1]) {
    errors.description = `Please keep this under ${LIMITS.description[1]} characters.`;
  }

  return errors;
}

function collect() {
  const read = name => {
    const value = fields.get(name).value();
    return Array.isArray(value) ? value : value.trim();
  };
  return {
    request_type: read('request_type'),
    student_name: read('student_name'),
    student_id: read('student_id'),
    semester: read('semester'),
    contact_no: read('contact_no'),
    email: read('email'),
    purposes: read('purposes'),
    purpose_other: read('purpose_other'),
    issues: read('issues'),
    issue_other: read('issue_other'),
    description: read('description')
  };
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function confirmation(referenceCode) {
  return h('section', { class: 'card student-card confirmation', tabindex: '-1' },
    h('span', { class: 'confirmation-mark', 'aria-hidden': 'true' }, '✓'),
    h('h1', {}, 'Your request has been sent'),
    h('p', { class: 'confirmation-lede' },
      'A counsellor will look at it and contact you using the details you gave.'),
    referenceCode
      ? h('p', { class: 'confirmation-reference' },
          h('span', {}, 'Your reference'),
          h('strong', { class: 'mono' }, referenceCode))
      : null,
    h('h2', { class: 'confirmation-heading' }, 'What happens next'),
    h('ul', { class: 'confirmation-list' },
      h('li', {}, 'The counselling office reads every request in the order it arrives.'),
      h('li', {}, 'You will be contacted by phone or email to arrange a time.'),
      h('li', {}, 'What you wrote is read only by the counselling team.')),
    h('p', { class: 'confirmation-urgent' },
      h('strong', {}, 'If you need help now'),
      h('span', {}, ' this form is not monitored continuously. Please contact the counselling office directly, or your local emergency service.')),
    h('button', {
      type: 'button', class: 'button button-outline',
      onclick: () => { clear(main).append(formScreen()); main.focus(); }
    }, 'Send another request'));
}

function notConfigured() {
  return h('section', { class: 'card student-card' },
    h('h1', {}, 'This form is not available yet'),
    h('p', {}, 'The counselling service has not finished setting it up. Please contact the counselling office directly.'),
    h('p', { class: 'form-hint' },
      'If you are setting this up: copy js/config.example.js to js/config.js, fill in the project URL and publishable key, and deploy the submit-counselling-request function.'));
}

function formScreen() {
  fields.clear();
  clear(summary);
  summary.hidden = true;

  const status = h('p', { class: 'form-status', role: 'status' });
  const submit = h('button', { type: 'submit', class: 'button button-primary form-submit' },
    'Send my request');

  // Hidden from students and from assistive technology; only a bot fills it in.
  const honeypot = h('div', { class: 'no-fill', 'aria-hidden': 'true' },
    h('label', { for: 'f-website' }, 'Leave this field empty'),
    h('input', { type: 'text', id: 'f-website', name: 'website', tabindex: '-1', autocomplete: 'off' }));

  const form = h('form', {
    class: 'student-form',
    novalidate: true,
    onsubmit: event => { event.preventDefault(); send(form, submit, status, honeypot); }
  },
    summary,

    h('section', { class: 'form-section' },
      h('h2', { class: 'form-section-title' }, 'About this request'),
      radioGroup({
        name: 'request_type',
        legend: 'Is this a request or a referral?',
        hint: 'Choose "Referral" if someone else — a lecturer, for example — asked you to get in touch.',
        options: REQUEST_TYPES
      })),

    h('section', { class: 'form-section' },
      h('h2', { class: 'form-section-title' }, 'Your details'),
      h('p', { class: 'form-section-hint' }, 'So a counsellor can reach you to arrange a time.'),
      field({ name: 'student_name', label: 'Full name', autocomplete: 'name', maxLength: LIMITS.student_name[1] }),
      field({ name: 'student_id', label: 'Student ID', maxLength: LIMITS.student_id[1], autocomplete: 'off' }),
      field({ name: 'semester', label: 'Semester', maxLength: LIMITS.semester[1], inputmode: 'numeric', placeholder: 'For example, 3' }),
      field({ name: 'contact_no', label: 'Contact number', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxLength: LIMITS.contact_no[1] }),
      field({ name: 'email', label: 'Email address', type: 'email', autocomplete: 'email', inputmode: 'email', maxLength: LIMITS.email[1] })),

    h('section', { class: 'form-section' },
      h('h2', { class: 'form-section-title' }, 'What you are asking for'),
      checkboxGroup({
        name: 'purposes',
        legend: 'Purpose',
        hint: 'Choose as many as apply.',
        options: COUNSELLING_PURPOSES,
        otherName: 'purpose_other',
        otherLabel: 'What other purpose?'
      }),
      checkboxGroup({
        name: 'issues',
        legend: 'Type of issue',
        hint: 'Choose as many as apply.',
        options: COUNSELLING_ISSUES,
        otherName: 'issue_other',
        otherLabel: 'What other issue?'
      })),

    h('section', { class: 'form-section' },
      h('h2', { class: 'form-section-title' }, 'In your own words'),
      field({
        name: 'description',
        label: 'What prompted this request, and what support are you looking for?',
        hint: 'Share only what you feel comfortable sharing. A couple of sentences is enough, and you can say more when you meet a counsellor.',
        multiline: true,
        maxLength: LIMITS.description[1]
      })),

    honeypot,

    h('div', { class: 'form-foot' },
      submit,
      status,
      h('p', { class: 'form-hint' },
        'Your request is recorded as submitted online and is read only by the counselling team.')));

  return h('div', { class: 'card student-card' },
    h('h1', { class: 'student-title' }, 'Counselling request form'),
    h('p', { class: 'student-lede' },
      'Ask to see a counsellor. There are no wrong answers, and you can share as little or as much as you like.'),
    form);
}

/* ------------------------------------------------------------------ *
 * Submit
 * ------------------------------------------------------------------ */

async function send(form, submit, status, honeypot) {
  const values = collect();
  const errors = validate(values);

  if (Object.keys(errors).length) {
    status.textContent = '';
    status.classList.remove('is-error');
    showErrors(errors);
    return;
  }

  clearAllErrors();
  submit.disabled = true;
  submit.textContent = 'Sending…';
  status.textContent = '';
  status.classList.remove('is-error');

  const payload = {
    ...values,
    purpose_other: values.purposes.includes('Other') ? values.purpose_other : '',
    issue_other: values.issues.includes('Other') ? values.issue_other : '',
    website: honeypot.querySelector('input').value
  };

  try {
    const response = await fetch(functionUrl('submit-counselling-request'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: projectConfig.key,
        Authorization: `Bearer ${projectConfig.key}`
      },
      body: JSON.stringify(payload)
    });

    const body = await response.json().catch(() => ({}));

    if (response.ok && body.ok) {
      clear(main).append(confirmation(body.reference_code));
      main.querySelector('.confirmation').focus();
      window.scrollTo(0, 0);
      return;
    }

    if (body.errors) {
      showErrors(body.errors);
    } else {
      status.textContent = body.message || 'The request could not be sent. Please try again in a moment.';
      status.classList.add('is-error');
    }
  } catch (error) {
    console.error('Submission failed:', error);
    status.textContent = 'We could not reach the counselling service. Check your connection and try again.';
    status.classList.add('is-error');
  } finally {
    submit.disabled = false;
    submit.textContent = 'Send my request';
  }
}

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

clear(main).append(isConfigured() ? formScreen() : notConfigured());
document.body.classList.remove('is-booting');
