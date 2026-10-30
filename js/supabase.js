/**
 * supabase.js — the one place a Supabase client is created.
 *
 * Credentials come from project-config.js, which reads the gitignored
 * js/config.js.
 *
 * Only the dashboard uses this module. The student form never touches a
 * Supabase client: it posts to the edge function, which is the only path a
 * submission has into the database.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { projectConfig as config, isConfigured } from './project-config.js';

let client = null;

export { isConfigured };

export function projectUrl() {
  return config?.url ?? null;
}

export function publishableKey() {
  return config?.key ?? null;
}

/**
 * The shared client. Sessions persist in localStorage under a named key, so a
 * counsellor stays signed in across a reload and the token is refreshed in the
 * background. Returns null when the project is not configured.
 */
export function getSupabase() {
  if (!config) return null;
  if (!client) {
    client = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'counselling-dashboard-auth'
      },
      global: {
        headers: { 'x-application-name': 'counselling-dashboard' }
      }
    });
  }
  return client;
}

/**
 * Turns a Supabase error into something a counsellor can act on. The raw
 * message is kept on the error for the console, but never shown as-is: a
 * PostgREST error can quote row contents back.
 */
export function describeError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  console.error('Supabase error:', error);
  const code = error.code || '';
  if (code === 'PGRST301' || error.status === 401) return 'Your session has expired. Please sign in again.';
  if (code === '42501' || error.status === 403) return 'Your account does not have access to that record.';
  if (error.message === 'Failed to fetch') return 'Cannot reach the server. Check your connection and try again.';
  return fallback;
}
