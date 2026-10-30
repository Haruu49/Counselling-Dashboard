/**
 * submit-counselling-request — the only way a student submission reaches the
 * database.
 *
 * The student form is a public page with no session, so it cannot be trusted
 * and is not given any database access: `anon` holds no privilege on
 * public.counselling_requests at all. This function is the gate. It runs with
 * the service-role key that Supabase injects into its own environment, which
 * never leaves the server.
 *
 * It must be deployed with JWT verification OFF, because the caller is an
 * anonymous student:
 *
 *   supabase functions deploy submit-counselling-request --no-verify-jwt
 *
 * Environment (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the
 * platform; the rest are optional secrets):
 *
 *   SUBMISSION_THROTTLE_SALT   salt for the per-address hash. Set one.
 *   SUBMISSION_HOURLY_LIMIT    submissions per address per hour (default 5)
 *   ALLOWED_ORIGINS            comma-separated origins, or * (default *)
 */

import { looksAutomated, validateSubmission } from './validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const THROTTLE_SALT = Deno.env.get('SUBMISSION_THROTTLE_SALT') ?? 'counselling-dashboard';
const HOURLY_LIMIT = Number(Deno.env.get('SUBMISSION_HOURLY_LIMIT') ?? '5');
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

/** A submission is a few hundred bytes. Anything larger is not a form post. */
const MAX_BODY_BYTES = 20_000;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes('*')
    ? '*'
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

/** SHA-256 of salt + address. The address itself is never stored or logged. */
async function hashAddress(address: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${THROTTLE_SALT}:${address}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function callerAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || request.headers.get('cf-connecting-ip') || 'unknown';
}

/** PostgREST, as service_role. Only ever called with values built here. */
function db(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, message: 'Send this form with POST.' }, 405, origin);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('submit-counselling-request is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ ok: false, message: 'The form is not available right now.' }, 500, origin);
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return json({ ok: false, message: 'That submission is too large.' }, 413, origin);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ ok: false, message: 'The submission could not be read.' }, 400, origin);
  }

  // The honeypot answer is a plain success. A bot learns nothing from it, and
  // no student can reach this branch: the field is hidden and always empty.
  if (looksAutomated(payload as Record<string, unknown>)) {
    return json({ ok: true, reference_code: 'CR-0000-0000' }, 200, origin);
  }

  const result = validateSubmission(payload);
  if (!result.ok) {
    return json(
      { ok: false, message: 'Please check the highlighted fields.', errors: result.errors },
      400,
      origin
    );
  }

  /* Throttle ------------------------------------------------------------ */
  try {
    const ipHash = await hashAddress(callerAddress(request));
    const throttle = await db('rpc/register_submission_attempt', {
      method: 'POST',
      body: JSON.stringify({ p_ip_hash: ipHash, p_limit: HOURLY_LIMIT })
    });
    if (throttle.ok && (await throttle.json()) === false) {
      return json(
        {
          ok: false,
          message:
            'Several requests have already been sent from this connection. ' +
            'Please wait an hour, or contact the counselling office directly if this is urgent.'
        },
        429,
        origin
      );
    }
  } catch (error) {
    // A throttle that cannot be reached must not stop a student asking for help.
    console.error('throttle check failed', error);
  }

  /* Insert -------------------------------------------------------------- */
  const inserted = await db('counselling_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(result.value)
  });

  if (!inserted.ok) {
    // The body can quote the student's own words back, so it is not returned
    // to the browser; it goes to the function log instead.
    console.error('insert failed', inserted.status, await inserted.text());
    return json(
      { ok: false, message: 'The request could not be saved. Please try again in a moment.' },
      502,
      origin
    );
  }

  const [row] = await inserted.json();
  return json({ ok: true, reference_code: row?.reference_code ?? null }, 201, origin);
});
