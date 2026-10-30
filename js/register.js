/**
 * register.js — counsellor registration at #/register.
 *
 * A counsellor who has been sent the link creates their own account here, and
 * is signed in and looking at the queue a moment later. There is no second
 * step for the counselling office to forget.
 *
 * Registration is open to whoever holds the link: there is no code to type and
 * nobody to approve it. The link is the only secret there is.
 *
 * It is reachable without signing in — app.js renders it before the sign-in
 * card when the hash asks for it — so it reads no dashboard data at all. Its
 * only call is a POST to the register-counsellor edge function, which holds
 * the service-role key on the server. This page never sees a key beyond the
 * publishable one.
 *
 * Validation lives in registration-rules.js, which mirrors the function's own
 * rules. The messages here are a courtesy; the server is the authority.
 */

import { h, icon, paintIcons, clear } from './ui.js';
import { validateRegistration, LIMITS } from './registration-rules.js';
import { functionUrl, projectConfig, isConfigured } from './project-config.js';
import { getSupabase } from './supabase.js';

/**
 * A bot fills every input it finds, including the one no counsellor can see,
 * and it fills them faster than anyone can type. Both are answered with an
 * ordinary success: an attacker learns nothing from a page that agrees.
 *
 * Neither can be the real defence, because both run in a browser. The server
 * counts attempts per connection per hour, which is what actually holds.
 */
const MIN_FILL_MS = 1200;

export function mountRegister(container, { standalone = false } = {}) {
  const fields = new Map();
  const host = h('section', { class: 'auth-screen' });

  container.append(host);
  render();

  function render() {
    fields.clear();
    clear(host).append(isConfigured() ? formCard() : unavailableCard());
    paintIcons(host);
  }

  /* ---------------------------------------------------------------- *
   * Fields
   * ---------------------------------------------------------------- */

  function field({ name, label, type = 'text', hint = null, autocomplete = null, inputmode = null, maxLength = null, placeholder = null }) {
    const id = `r-${name}`;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;

    const error = h('p', { id: errorId, class: 'field-error', hidden: true });
    const input = h('input', {
      id,
      name,
      type,
      class: 'auth-input',
      'aria-describedby': [hint ? hintId : null, errorId].filter(Boolean).join(' '),
      autocomplete,
      inputmode,
      maxlength: maxLength,
      placeholder,
      required: true,
      oninput: () => clearError(name)
    });

    const node = h('div', { class: 'auth-field' },
      h('label', { for: id }, label),
      hint ? h('p', { id: hintId, class: 'field-hint' }, hint) : null,
      input,
      error);

    fields.set(name, {
      node, error, input, label,
      focus: () => input.focus(),
      value: () => input.value
    });
    return node;
  }

  function clearError(name) {
    const entry = fields.get(name);
    if (!entry) return;
    entry.error.hidden = true;
    entry.error.textContent = '';
    entry.node.classList.remove('has-error');
    entry.input.removeAttribute('aria-invalid');
  }

  /* ---------------------------------------------------------------- *
   * Screens
   * ---------------------------------------------------------------- */

  function formCard() {
    const openedAt = Date.now();

    // Off screen rather than display:none, which some bots skip.
    const honeypot = h('input', {
      type: 'text', name: 'website', class: 'honeypot',
      tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true'
    });

    const summary = h('p', { class: 'auth-message', role: 'alert', hidden: true });

    const submit = h('button', { type: 'submit', class: 'button button-primary auth-submit' },
      'Create my counsellor account');

    const form = h('form', {
      class: 'auth-form',
      novalidate: true,
      onsubmit: event => {
        event.preventDefault();
        send({ form, summary, submit, honeypot, openedAt });
      }
    },
      field({
        name: 'full_name', label: 'Full name', autocomplete: 'name',
        maxLength: LIMITS.full_name[1], placeholder: 'As your students should see it'
      }),
      field({
        name: 'staff_id', label: 'Staff ID', autocomplete: 'off',
        maxLength: LIMITS.staff_id[1],
        hint: `${LIMITS.staff_id[0]}–${LIMITS.staff_id[1]} letters and numbers.`
      }),
      field({
        name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel',
        inputmode: 'tel', maxLength: 24, placeholder: '012-3456789'
      }),
      field({
        name: 'email', label: 'Email address', type: 'email', autocomplete: 'email',
        inputmode: 'email', maxLength: LIMITS.email[1], placeholder: 'name@example.com',
        hint: 'You will sign in with this address.'
      }),
      field({
        name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password',
        maxLength: LIMITS.password[1],
        hint: `At least ${LIMITS.password[0]} characters, with a letter and a number.`
      }),
      field({
        name: 'confirm_password', label: 'Password again', type: 'password',
        autocomplete: 'new-password', maxLength: LIMITS.password[1]
      }),
      honeypot,
      summary,
      submit);

    return h('div', { class: 'auth-card auth-card-form' },
      h('span', { class: 'auth-mark' }, icon('user-plus', 26)),
      h('h1', {}, 'Register as a counsellor'),
      h('p', { class: 'auth-lede' },
        'For counselling staff only. This creates your login for the counselling request queue.'),
      form,
      h('p', { class: 'auth-foot' },
        icon('shield', 14),
        h('span', {}, 'An account here can read every student’s counselling request, so this link is only for counselling staff.')),
      backLinks());
  }

  /**
   * Shown once the account exists. `entered` is true when this tab is now
   * signed in as the new counsellor, which only happens for someone who was
   * signed out when they arrived.
   */
  function confirmationCard({ entered }) {
    return h('div', { class: 'auth-card auth-card-form', tabindex: '-1' },
      h('span', { class: 'auth-mark' }, icon('check', 26)),
      h('h1', {}, 'Your account is ready'),
      h('p', { class: 'auth-lede' }, entered
        ? 'You are signed in. The counselling request queue is waiting.'
        : 'Sign in with the email address and password you just chose.'),
      entered
        ? h('button', {
            type: 'button', class: 'button button-primary auth-submit',
            onclick: () => { window.location.hash = '#/overview'; }
          }, icon('layout-dashboard', 16), h('span', {}, 'Open the counselling desk'))
        : h('a', { class: 'button button-primary auth-submit', href: '#/overview' },
            icon('log-in', 16), h('span', {}, 'Go to sign in')),
      h('button', {
        type: 'button', class: 'button button-outline auth-submit',
        onclick: () => { render(); host.querySelector('.auth-input')?.focus(); }
      }, 'Register another counsellor'),
      h('p', { class: 'auth-foot' },
        icon('shield', 14),
        h('span', {}, 'Your details are visible to the counselling office only.')),
      backLinks());
  }

  function unavailableCard() {
    return h('div', { class: 'auth-card auth-card-form' },
      h('span', { class: 'auth-mark auth-mark-warning' }, icon('triangle-alert', 26)),
      h('h1', {}, 'Registration is not available yet'),
      h('p', { class: 'auth-lede' },
        'This dashboard has not been connected to its Supabase project. Please contact the counselling office.'),
      backLinks());
  }

  function backLinks() {
    return h('p', { class: 'auth-links' },
      h('a', { href: '#/overview' },
        icon('arrow-left', 14),
        h('span', {}, standalone ? 'Back to sign in' : 'Back to the dashboard')));
  }

  /* ---------------------------------------------------------------- *
   * Submit
   * ---------------------------------------------------------------- */

  function showConfirmation({ entered }) {
    clear(host).append(confirmationCard({ entered }));
    paintIcons(host);
    host.querySelector('.auth-card').focus();
  }

  /**
   * Signs this tab in as the counsellor who just registered, so that
   * registering and arriving at the queue is one step. Only for a visitor who
   * had no session: a counsellor registering a colleague from inside the
   * dashboard must not be swapped into their colleague's account.
   */
  async function enterDashboard({ email, password }) {
    if (!standalone) return false;
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // The account exists either way, so this is not a failed registration;
      // the confirmation card falls back to asking them to sign in.
      console.error('Could not sign in after registering:', error.message);
      return false;
    }
    return Boolean(data.session);
  }

  async function send({ form, summary, submit, honeypot, openedAt }) {
    fields.forEach((_, name) => clearError(name));
    summary.hidden = true;
    summary.textContent = '';

    const raw = {};
    fields.forEach((entry, name) => { raw[name] = entry.value(); });

    // See MIN_FILL_MS. Nothing is created and nothing is said.
    if (honeypot.value.trim()) {
      showConfirmation({ entered: false });
      return;
    }

    const checked = validateRegistration(raw);
    if (!checked.ok) {
      showErrors(checked.errors, summary);
      return;
    }

    // Checked after validation, not before: someone who clicks the button the
    // moment the page loads should be told what is missing, not thanked.
    if (Date.now() - openedAt < MIN_FILL_MS) {
      showConfirmation({ entered: false });
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Creating your account…';

    try {
      const response = await fetch(functionUrl('register-counsellor'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: projectConfig.key,
          Authorization: `Bearer ${projectConfig.key}`
        },
        body: JSON.stringify(checked.value)
      });

      const body = await response.json().catch(() => ({}));

      if (response.ok && body.ok) {
        const entered = await enterDashboard(checked.value);
        form.reset();
        showConfirmation({ entered });
        return;
      }

      if (body.errors) {
        showErrors(body.errors, summary);
      } else {
        summary.textContent = body.message
          || 'Your account could not be created. Please try again in a moment.';
        summary.hidden = false;
      }
    } catch (error) {
      // Nothing from the form is logged: the console belongs to a shared
      // machine as often as not.
      console.error('Registration request failed:', error.name);
      summary.textContent =
        'We could not reach the counselling service. Check your connection and try again.';
      summary.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create my counsellor account';
    }
  }

  /**
   * Each message beside its field, and one summary that screen readers
   * announce. `summary` carries role="alert", so the count is spoken once
   * rather than several messages fighting each other.
   */
  function showErrors(errors, summary) {
    const entries = Object.entries(errors).filter(([name]) => fields.has(name));

    entries.forEach(([name, message]) => {
      const entry = fields.get(name);
      entry.error.textContent = message;
      entry.error.hidden = false;
      entry.node.classList.add('has-error');
      entry.input.setAttribute('aria-invalid', 'true');
    });

    // A count, not the message itself: the message is already beside its
    // field, and reading it twice helps nobody. A server message that names no
    // field of ours is shown as it stands.
    summary.textContent = errors.form
      || (!entries.length
        ? 'Your account could not be created. Please try again in a moment.'
        : entries.length === 1
          ? 'There is one detail to check before you can register.'
          : `There are ${entries.length} details to check before you can register.`);
    summary.hidden = false;

    if (entries.length) fields.get(entries[0][0]).focus();
  }
}
