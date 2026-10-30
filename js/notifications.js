/**
 * notifications.js — the notification dropdown in the top bar.
 *
 * Owns its own open/closed state and badge count. Opening a submission
 * notification hands off to the shared submission detail dialog.
 */

import { h, icon, formatRelative, paintIcons, toast, clear } from './ui.js';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from './data.js';
import { openSubmissionDetail, onSubmissionChange } from './submissions.js';

const ICONS = {
  submission: 'file-plus',
  reminder: 'bell-ring'
};

let panel;
let badge;
let toggleButton;
let isOpen = false;

/**
 * Builds the bell button and its panel. Returns the button so the top bar
 * can place it; the panel is positioned relative to the same wrapper.
 */
export function createNotificationMenu() {
  badge = h('span', { class: 'notification-badge', hidden: true, 'aria-hidden': 'true' });
  toggleButton = h('button', {
    type: 'button',
    class: 'icon-button notification-toggle',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-label': 'Notifications',
    onclick: event => {
      event.stopPropagation();
      toggle();
    }
  }, icon('bell', 19), badge);

  panel = h('div', {
    class: 'dropdown dropdown-notifications',
    hidden: true,
    role: 'dialog',
    'aria-label': 'Notifications'
  });

  const wrapper = h('div', { class: 'menu-anchor' }, toggleButton, panel);

  // Clicking anywhere else, or pressing Escape, closes the panel.
  document.addEventListener('click', event => {
    if (isOpen && !wrapper.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) {
      close();
      toggleButton.focus();
    }
  });

  onSubmissionChange(() => { refreshBadge(); if (isOpen) renderPanel(); });
  refreshBadge();
  return wrapper;
}

export function closeNotificationMenu() {
  if (isOpen) close();
}

function toggle() {
  if (isOpen) close();
  else open();
}

async function open() {
  isOpen = true;
  panel.hidden = false;
  toggleButton.setAttribute('aria-expanded', 'true');
  await renderPanel();
  const first = panel.querySelector('button');
  if (first) first.focus();
}

function close() {
  isOpen = false;
  panel.hidden = true;
  toggleButton.setAttribute('aria-expanded', 'false');
}

export async function refreshBadge() {
  const notifications = await listNotifications();
  const unread = notifications.filter(n => !n.read).length;
  if (!badge) return unread;
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  toggleButton.setAttribute(
    'aria-label',
    unread ? `Notifications, ${unread} unread` : 'Notifications, none unread'
  );
  return unread;
}

async function renderPanel() {
  const notifications = await listNotifications();
  const unread = notifications.filter(n => !n.read).length;
  clear(panel);

  panel.append(h('header', { class: 'dropdown-head' },
    h('div', {},
      h('p', { class: 'dropdown-title' }, 'Notifications'),
      h('p', { class: 'dropdown-subtitle' }, unread ? `${unread} unread` : 'All caught up')),
    unread
      ? h('button', {
          type: 'button', class: 'link-button',
          onclick: async () => {
            await markAllNotificationsRead();
            await refreshBadge();
            await renderPanel();
            toast('All notifications marked as read.');
          }
        }, 'Mark all as read')
      : null));

  if (!notifications.length) {
    panel.append(h('p', { class: 'dropdown-empty' }, 'Nothing here yet. New submissions will show up as they arrive.'));
    return;
  }

  const list = h('ul', { class: 'notification-list' });
  notifications.forEach(notification => {
    list.append(h('li', {},
      h('button', {
        type: 'button',
        class: `notification-item${notification.read ? '' : ' is-unread'}`,
        onclick: () => openNotification(notification)
      },
        h('span', { class: 'notification-icon' }, icon(ICONS[notification.kind] || 'bell', 16)),
        h('span', { class: 'notification-text' },
          h('strong', {}, notification.title),
          h('span', {}, notification.body),
          h('small', {}, formatRelative(notification.created_at))),
        notification.read
          ? null
          : h('span', { class: 'unread-dot', 'aria-label': 'Unread' }))));
  });
  panel.append(list);
  panel.append(h('footer', { class: 'dropdown-foot' },
    h('p', {}, 'Demonstration notifications. Nothing is sent by email.')));
  paintIcons(panel);
}

async function openNotification(notification) {
  await markNotificationRead(notification.id);
  await refreshBadge();
  close();
  if (notification.submission_id) {
    await openSubmissionDetail(notification.submission_id, { onUpdated: () => refreshBadge() });
  } else {
    // The reminder has no single record behind it — send the counsellor to the queue.
    window.location.hash = '#/submissions';
    toast('Showing submissions still waiting for a first review.');
  }
}
