/**
 * auth.js — counsellor sign-in.
 *
 * Accounts are invite-only. There is no sign-up form here and there must not
 * be one: a counsellor account is created in the Supabase dashboard, and the
 * trigger in supabase/migrations adds the matching counsellor_profiles row
 * that actually grants access to the queue.
 *
 * The dashboard is not rendered at all until a session exists, so an
 * unauthenticated visitor never reaches a page that would try to read student
 * records.
 */

import { h, icon, paintIcons, clear } from './ui.js';
import { getSupabase, isConfigured } from './supabase.js';

/** The signed-in session, or null. */
export async function currentSession() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Could not read the session:', error);
    return null;
  }
  return data.session ?? null;
}

export async function signOut() {
  const supabase = getSupabase();
  if (supabase) await supabase.auth.signOut();
}

/** Calls back when the session ends in another tab, or the refresh fails. */
export function onSignedOut(handler) {
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (!session && event === 'TOKEN_REFRESHED')) handler();
  });
  return () => data.subscription.unsubscribe();
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

/**
 * Renders the sign-in screen into `main`, and resolves with the session once
 * a counsellor signs in successfully.
 */
export function promptSignIn(main) {
  return new Promise(resolve => {
    document.body.classList.add('is-signed-out');

    const message = h('p', { class: 'auth-message', role: 'alert', hidden: true });
    const email = h('input', {
      type: 'email', id: 'auth-email', name: 'email', class: 'auth-input',
      autocomplete: 'username', required: true, 'data-autofocus': true,
      placeholder: 'name@counselling.example.edu'
    });
    const password = h('input', {
      type: 'password', id: 'auth-password', name: 'password', class: 'auth-input',
      autocomplete: 'current-password', required: true, minlength: 6
    });
    const submit = h('button', { type: 'submit', class: 'button button-primary auth-submit' }, 'Sign in');

    function fail(text) {
      message.textContent = text;
      message.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Sign in';
      password.focus();
      password.select();
    }

    const form = h('form', {
      class: 'auth-form',
      novalidate: true,
      onsubmit: async event => {
        event.preventDefault();
        message.hidden = true;

        const address = email.value.trim();
        if (!address || !password.value) {
          fail('Enter your email address and password.');
          return;
        }

        submit.disabled = true;
        submit.textContent = 'Signing in…';

        const { data, error } = await getSupabase().auth.signInWithPassword({
          email: address,
          password: password.value
        });

        if (error) {
          console.error('Sign-in failed:', error);
          // Deliberately the same wording for an unknown address and a wrong
          // password, so the form cannot be used to discover who has an account.
          fail(
            error.message === 'Failed to fetch'
              ? 'Cannot reach the server. Check your connection and try again.'
              : 'That email address and password do not match an account.'
          );
          return;
        }

        password.value = '';
        document.body.classList.remove('is-signed-out');
        resolve(data.session);
      }
    },
      h('div', { class: 'auth-field' },
        h('label', { for: 'auth-email' }, 'Email address'), email),
      h('div', { class: 'auth-field' },
        h('label', { for: 'auth-password' }, 'Password'), password),
      message,
      submit);

    clear(main).append(
      h('section', { class: 'auth-screen' },
        h('div', { class: 'auth-card' },
          h('span', { class: 'auth-mark' }, icon('heart-handshake', 26)),
          h('h1', {}, 'Counselling Dashboard'),
          h('p', { class: 'auth-lede' }, 'Sign in to open the counselling request queue.'),
          form,
          h('p', { class: 'auth-foot' },
            icon('shield', 14),
            h('span', {}, 'Accounts are created by the counselling office. There is no public sign-up.'))))
    );
    paintIcons(main);
    email.focus();
  });
}

/**
 * Shown when `js/config.js` is missing or still holds the placeholder values.
 * Without it there is no project to sign in to, so this is a dead end rather
 * than a screen that retries.
 */
export function renderConfigurationNeeded(main) {
  document.body.classList.add('is-signed-out');
  clear(main).append(
    h('section', { class: 'auth-screen' },
      h('div', { class: 'auth-card auth-card-wide' },
        h('span', { class: 'auth-mark auth-mark-warning' }, icon('triangle-alert', 26)),
        h('h1', {}, 'This dashboard is not configured yet'),
        h('p', { class: 'auth-lede' },
          'It needs the address and publishable key of a Supabase project before anyone can sign in.'),
        h('ol', { class: 'auth-steps' },
          h('li', {}, 'Copy ', h('code', {}, 'js/config.example.js'), ' to ', h('code', {}, 'js/config.js'), '.'),
          h('li', {}, 'Paste in the project URL and publishable key from Project Settings → API.'),
          h('li', {}, 'Apply ', h('code', {}, 'supabase/migrations/'), ' and deploy the ',
            h('code', {}, 'submit-counselling-request'), ' function.'),
          h('li', {}, 'Reload this page.')),
        h('p', { class: 'auth-foot' },
          icon('shield', 14),
          h('span', {}, 'js/config.js is gitignored. Never put a service-role key in it.'))))
  );
  paintIcons(main);
}

export { isConfigured };
