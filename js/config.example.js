/**
 * config.example.js — copy this file to `js/config.js` and fill in the two
 * values from your Supabase project (Project Settings → API).
 *
 *   cp js/config.example.js js/config.js
 *
 * `js/config.js` is listed in .gitignore and must never be committed.
 *
 * Both values below are safe to serve to a browser: the publishable key
 * identifies the project and nothing more. Every rule that protects student
 * data lives in row level security and in the submit-counselling-request edge
 * function. The service-role key is a different key entirely — it belongs only
 * in the edge function's own environment and must never appear in this file,
 * in any file under js/, or anywhere else the browser can read.
 */

export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YOUR_KEY_HERE';
