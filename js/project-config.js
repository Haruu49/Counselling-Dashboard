/**
 * project-config.js — reads js/config.js, which is gitignored.
 *
 * Its own module with no other imports, so the public student form can learn
 * the project address without loading the Supabase client library the
 * dashboard needs.
 *
 * The import is dynamic so a missing config file is a state the page can
 * explain, rather than a module error that stops it loading at all.
 */

const loaded = await import('./config.js').then(
  module => {
    const url = String(module.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const key = String(module.SUPABASE_PUBLISHABLE_KEY || '').trim();
    const filledIn = url.startsWith('https://')
      && !url.includes('YOUR-PROJECT-REF')
      && key.length > 20
      && !key.includes('YOUR_KEY_HERE');
    return filledIn ? { url, key } : null;
  },
  () => null
);

/** `{ url, key }`, or null when js/config.js is missing or still a template. */
export const projectConfig = loaded;

export function isConfigured() {
  return loaded !== null;
}

/** Where the public submission endpoint lives. */
export function functionUrl(name) {
  return loaded ? `${loaded.url}/functions/v1/${name}` : null;
}
