/**
 * settings.js — Settings page.
 *
 * Profile fields and preferences are demonstration state. The profile lives
 * in memory; only the non-identifying display preferences are written to
 * localStorage, because the brief rules out keeping anything confidential
 * in browser storage.
 */

import {
  h, icon, pageHeader, toast, confirmDialog, paintIcons
} from './ui.js';
import { getProfile, updateProfile, getPreferences, updatePreferences, resetDemoData } from './data.js';
import { storePreferences, clearStoredPreferences } from './state.js';
import { ROUTES } from './router.js';

export async function mountSettings(container, { onProfileChange, onPreferencesChange }) {
  const profile = await getProfile();
  const preferences = await getPreferences();

  const avatarPreview = h('div', { class: 'avatar avatar-xl' },
    profile.avatar_url
      ? h('img', { src: profile.avatar_url, alt: '' })
      : h('span', {}, profile.initials));

  container.append(
    pageHeader({
      title: 'Settings',
      description: 'Your counsellor profile and how this dashboard behaves.'
    }),
    h('div', { class: 'settings-grid' },
      profileCard(),
      preferencesCard()),
    dangerCard()
  );

  /* ---- profile ---- */

  function profileCard() {
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp',
      class: 'sr-only',
      id: 'avatar-input',
      onchange: event => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          toast('Choose an image under 2 MB.', 'warning');
          event.target.value = '';
          return;
        }
        // Held in memory for this session only — nothing is uploaded.
        const url = URL.createObjectURL(file);
        avatarPreview.replaceChildren(h('img', { src: url, alt: '' }));
        pendingAvatar = url;
      }
    });

    let pendingAvatar = null;

    const form = h('form', {
      class: 'settings-form',
      // Our own checks produce the messages, so the native bubbles stay out
      // of the way instead of blocking submit before the handler runs.
      novalidate: true,
      onsubmit: async event => {
        event.preventDefault();
        const data = new FormData(event.target);
        const fullName = String(data.get('full_name') || '').trim();
        const email = String(data.get('email') || '').trim();
        if (!fullName) {
          toast('Enter a counsellor name.', 'warning');
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast('Enter an email address in the form name@example.com.', 'warning');
          return;
        }
        const updated = await updateProfile({
          full_name: fullName,
          email,
          department: String(data.get('department') || '').trim(),
          role: String(data.get('role') || '').trim(),
          ...(pendingAvatar ? { avatar_url: pendingAvatar } : {})
        });
        if (!updated.avatar_url) avatarPreview.replaceChildren(h('span', {}, updated.initials));
        onProfileChange(updated);
        toast('Profile saved.');
      }
    },
      h('div', { class: 'avatar-row' },
        avatarPreview,
        h('div', { class: 'avatar-actions' },
          h('label', { class: 'button button-outline button-small', for: 'avatar-input' },
            icon('upload', 15), h('span', {}, 'Choose picture')),
          fileInput,
          profile.avatar_url || true
            ? h('button', {
                type: 'button', class: 'button button-quiet button-small',
                onclick: async () => {
                  pendingAvatar = '';
                  const updated = await updateProfile({ avatar_url: '' });
                  avatarPreview.replaceChildren(h('span', {}, updated.initials));
                  onProfileChange(updated);
                  toast('Profile picture removed.');
                }
              }, 'Remove')
            : null,
          h('p', { class: 'field-hint' }, 'Kept in this browser tab only. Nothing is uploaded.'))),
      textField({ name: 'full_name', label: 'Counsellor name', value: profile.full_name, required: true }),
      textField({ name: 'email', label: 'Email', value: profile.email, type: 'email', required: true }),
      textField({ name: 'department', label: 'Department', value: profile.department }),
      textField({ name: 'role', label: 'Role', value: profile.role }),
      h('div', { class: 'form-actions' },
        h('button', { type: 'submit', class: 'button button-primary' }, 'Save changes')));

    return h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Profile'),
          h('p', { class: 'card-subtitle' }, 'How you appear in the top bar of this dashboard.'))),
      form);
  }

  /* ---- preferences ---- */

  function preferencesCard() {
    const toggles = [
      ['notify_new_submissions', 'New submissions', 'Show a notification when a student submits a form.'],
      ['notify_wellbeing_flags', 'Wellbeing follow-ups', 'Highlight assessments that land in the Needs Support band.'],
      ['notify_weekly_digest', 'Weekly summary', 'Collect the week’s activity into a single notification.']
    ];

    async function save(patch, message) {
      const updated = await updatePreferences(patch);
      storePreferences(updated);
      onPreferencesChange(updated);
      if (message) toast(message);
      return updated;
    }

    const body = h('div', { class: 'settings-form' },
      h('fieldset', { class: 'fieldset' },
        h('legend', {}, 'Notifications'),
        toggles.map(([key, label, hint]) => switchField({
          label, hint, checked: preferences[key],
          onChange: value => save({ [key]: value })
        }))),
      h('fieldset', { class: 'fieldset' },
        h('legend', {}, 'Display'),
        radioGroup({
          name: 'density',
          label: 'Table density',
          value: preferences.density,
          options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' }
          ],
          onChange: value => save({ density: value }, 'Display density updated.')
        }),
        switchField({
          label: 'Reduce motion',
          hint: 'Turn off chart animations and transitions.',
          checked: preferences.reduce_motion,
          onChange: value => save({ reduce_motion: value }, value ? 'Motion reduced.' : 'Motion restored.')
        }),
        selectRow({
          label: 'Page shown on open',
          value: preferences.default_page,
          options: ROUTES.filter(route => route.id !== 'settings').map(route => ({ value: route.id, label: route.label })),
          onChange: value => save({ default_page: value }, 'Default page updated.')
        })),
      h('p', { class: 'field-hint' },
        'Display preferences are kept in this browser. No student information is stored on this device.'));

    return h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Dashboard preferences'),
          h('p', { class: 'card-subtitle' }, 'Changes apply straight away.'))),
      body);
  }

  /* ---- reset ---- */

  function dangerCard() {
    return h('section', { class: 'card' },
      h('header', { class: 'card-head' },
        h('div', { class: 'card-head-text' },
          h('h2', { class: 'card-title' }, 'Demonstration data'),
          h('p', { class: 'card-subtitle' }, 'Every record in this prototype is fictional and held in memory.'))),
      h('div', { class: 'reset-row' },
        h('div', {},
          h('p', { class: 'reset-copy' }, 'Reloading the page already restores the original records. Use this to start again without a reload, or to clear the preferences saved in this browser.'),
          h('div', { class: 'button-row' },
            h('button', {
              type: 'button', class: 'button button-outline',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Reset demonstration data?',
                  body: 'Status changes you have made in this session will be discarded and the original fictional records restored.',
                  confirmLabel: 'Reset data'
                });
                if (!ok) return;
                await resetDemoData();
                toast('Demonstration data restored.');
                window.location.hash = '#/overview';
              }
            }, icon('rotate-ccw', 16), h('span', {}, 'Reset demonstration data')),
            h('button', {
              type: 'button', class: 'button button-quiet',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Clear saved preferences?',
                  body: 'Display and notification preferences stored in this browser will be removed.',
                  confirmLabel: 'Clear preferences'
                });
                if (!ok) return;
                clearStoredPreferences();
                toast('Saved preferences cleared. Defaults apply on the next reload.');
              }
            }, 'Clear saved preferences')))));
  }

  paintIcons(container);
}

/* ------------------------------------------------------------------ *
 * Form controls local to this page
 * ------------------------------------------------------------------ */

function textField({ name, label, value = '', type = 'text', required = false }) {
  return h('label', { class: 'form-field' },
    h('span', { class: 'form-label' }, label, required ? h('span', { class: 'required' }, '*') : null),
    h('input', { class: 'text-input', name, type, value, required: required || null, autocomplete: 'off' }));
}

function switchField({ label, hint, checked, onChange }) {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch-input',
    checked: checked || null,
    onchange: event => onChange(event.target.checked)
  });
  return h('label', { class: 'switch-row' },
    h('span', { class: 'switch-text' },
      h('span', { class: 'switch-label' }, label),
      hint ? h('span', { class: 'switch-hint' }, hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
}

function radioGroup({ name, label, value, options, onChange }) {
  return h('div', { class: 'radio-group', role: 'group', 'aria-label': label },
    h('span', { class: 'form-label' }, label),
    h('div', { class: 'radio-row' },
      options.map(option => {
        const input = h('input', {
          type: 'radio',
          name,
          value: option.value,
          class: 'sr-only',
          checked: option.value === value || null,
          onchange: () => onChange(option.value)
        });
        return h('label', { class: `radio-chip${option.value === value ? ' is-selected' : ''}` },
          input, h('span', {}, option.label));
      })));
}

function selectRow({ label, value, options, onChange }) {
  const select = h('select', {
    class: 'select-input',
    onchange: event => onChange(event.target.value)
  }, options.map(option => {
    const node = h('option', { value: option.value }, option.label);
    if (option.value === value) node.selected = true;
    return node;
  }));
  return h('label', { class: 'form-field' },
    h('span', { class: 'form-label' }, label),
    select);
}
