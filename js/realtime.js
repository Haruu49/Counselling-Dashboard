/**
 * realtime.js — the live connection to the counselling request queue.
 *
 * Supabase Realtime applies the table's SELECT policy per subscriber, so a
 * socket only ever carries rows the signed-in counsellor is already allowed
 * to read. Nothing here widens that.
 *
 * Events deliberately carry no payload to the rest of the app: a change
 * arrives, the data layer re-reads the queue, and the page re-renders from
 * that. Re-reading costs one query and keeps the dashboard correct even when
 * events are coalesced, delivered out of order, or missed during a reconnect.
 */

import { getSupabase } from './supabase.js';

let channel = null;

/**
 * Subscribes to inserts and updates on counselling_requests.
 *
 * `onChange({ type, id })` fires for each event; `onStatus(state)` reports the
 * socket's own state so the page can show when it is not live.
 * Returns an unsubscribe function.
 */
export function subscribeToRequests({ onChange = () => {}, onStatus = () => {} } = {}) {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  unsubscribeFromRequests();

  channel = supabase
    .channel('counselling-requests')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'counselling_requests' },
      payload => onChange({ type: 'insert', id: payload.new?.id ?? null })
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'counselling_requests' },
      payload => onChange({ type: 'update', id: payload.new?.id ?? null })
    )
    .subscribe(status => {
      // SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
      onStatus(status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn(`Realtime channel is ${status}; the queue will still update on navigation.`);
      }
    });

  return unsubscribeFromRequests;
}

export function unsubscribeFromRequests() {
  if (!channel) return;
  const supabase = getSupabase();
  if (supabase) supabase.removeChannel(channel);
  channel = null;
}
