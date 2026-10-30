/**
 * register-counsellor — the only way a counsellor account is created.
 *
 * A counsellor opens #/register on a link from the counselling office, types
 * their details, and this function creates the account. It runs with the
 * service-role key that Supabase injects into its own environment, which never
 * leaves the server.
 *
 * Registration is deliberately open: whoever holds the link can create an
 * account. There is no code and no approval step, because the counselling
 * office hands the link out itself. The link is therefore the only secret
 * there is, and an account created here can read every student's counselling
 * request. Remove someone's access with
 *
 *   update public.counsellor_profiles set active = false where email = '…';
 *
 * Why not supabase.auth.signUp() from the page:
 *
 *   1. This project has email confirmation on and no SMTP configured, so a
 *      browser sign-up would send a confirmation link that never arrives.
 *      Here the account is created already confirmed, so the counsellor is in
 *      straight away.
 *   2. A sign-up that skips this function is never activated — see below —
 *      so it lands inactive and reads nothing. That is what keeps the public
 *      sign-up endpoint harmless.
 *   3. The staff ID, the phone number and the attempt throttle are all checked
 *      here, where the caller cannot skip them.
 *
 * How an account becomes a counsellor, exactly:
 *
 *   handle_new_counsellor() fires on the auth.users insert and writes an
 *   *inactive* counsellor_profiles row for every new user, whatever created
 *   it. This function then PATCHes that row to active with the service-role
 *   key. A sign-up that skipped this function is never patched, so it stays
 *   inactive and is_counsellor() rejects it — which is what keeps the public
 *   sign-up endpoint harmless.
 *
 * The trigger also activates a row whose insert already carried
 * app_metadata.counsellor_approved, which a browser cannot set. That path is
 * not the one taken here: the admin API applies app_metadata in a second
 * write, *after* the insert, so the trigger does not see the flag. Verified
 * against the live project — without the PATCH below the counsellor signs in
 * and reads nothing at all.
 *
 * It must be deployed with JWT verification OFF, because the caller has no
 * session yet:
 *
 *   supabase functions deploy register-counsellor --no-verify-jwt
 *
 * Environment (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the
 * platform):
 *
 *   COUNSELLOR_REGISTRATION_LIMIT   attempts per connection per hour (default 10)
 *   SUBMISSION_THROTTLE_SALT        salt for the per-address hash. Set one.
 *   ALLOWED_ORIGINS                 comma-separated origins, or * (default *)
 *
 * Nothing personal is ever logged: not a name, an ID, a phone number, an
 * email address, and obviously not a password. Failures log a status code.
 */

import { looksAutomated, validateRegistration } from './validation.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HOURLY_LIMIT = Number(Deno.env.get('COUNSELLOR_REGISTRATION_LIMIT') ?? '10');
const THROTTLE_SALT = Deno.env.get('SUBMISSION_THROTTLE_SALT') ?? 'counselling-dashboard';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

/** A registration is a few hundred bytes. Anything larger is not a form post. */
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of salt + address. The address itself is never stored or logged. */
function hashAddress(address: string): Promise<string> {
  return sha256(`${THROTTLE_SALT}:register:${address}`);
}

function callerAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0].trim() || request.headers.get('cf-connecting-ip') || 'unknown';
}

/** PostgREST, as service_role. Only ever called with values built here. */
function db(path: string, init: RequestInit = {}): Promise<Response> {
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
    console.error('register-counsellor is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ ok: false, message: 'Registration is not available right now.' }, 500, origin);
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return json({ ok: false, message: 'That registration is too large.' }, 413, origin);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ ok: false, message: 'The registration could not be read.' }, 400, origin);
  }

  // A plain success. A bot learns nothing from it, and no counsellor can
  // reach this branch: the field is off screen and always empty.
  if (looksAutomated(payload as Record<string, unknown>)) {
    return json({ ok: true, created: false }, 200, origin);
  }

  const result = validateRegistration(payload);
  if (!result.ok) {
    return json(
      { ok: false, message: 'Please check the highlighted fields.', errors: result.errors },
      400,
      origin
    );
  }

  /* Throttle ------------------------------------------------------------ *
   * With no code to check, this is the only thing standing between the
   * endpoint and a script. Counted per salted IP hash per hour by the same
   * function the student form uses; the hash is salted with "register:" so
   * the two endpoints cannot exhaust each other's allowance.
   * --------------------------------------------------------------------- */
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
            'Too many registration attempts from this connection. ' +
            'Please wait an hour, or ask the counselling office to set your account up directly.'
        },
        429,
        origin
      );
    }
  } catch (error) {
    // A throttle that cannot be reached must not be a way to block
    // registration altogether, so this is logged and let through.
    console.error('throttle check failed', error);
  }

  /* An ID already in the roster ----------------------------------------- *
   * Checked here so that it is a clear message rather than a unique
   * violation inside the auth.users trigger, which GoTrue can only report as
   * an opaque 500.
   * --------------------------------------------------------------------- */
  const taken = await db(
    `counsellor_profiles?staff_id=eq.${encodeURIComponent(result.value.staff_id)}&select=user_id&limit=1`
  );
  if (taken.ok && ((await taken.json()) as unknown[]).length > 0) {
    return json(
      {
        ok: false,
        message: 'That staff ID is already registered.',
        errors: {
          staff_id: 'That staff ID already has an account. Contact the counselling office if that is not you.'
        }
      },
      409,
      origin
    );
  }

  /* Create the account -------------------------------------------------- */
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: result.value.email,
      password: result.value.password,
      // Already confirmed: there is no SMTP on this project, so a confirmation
      // link would never arrive and the account would be unusable.
      email_confirm: true,
      user_metadata: {
        full_name: result.value.full_name,
        staff_id: result.value.staff_id,
        phone: result.value.phone
      },
      // The flag the trigger looks for. A browser cannot set this.
      app_metadata: { counsellor_approved: true, registered_via: 'register-counsellor' }
    })
  });

  if (!created.ok) {
    const detail = await created.text();
    let errorCode = '';
    try {
      const parsed = JSON.parse(detail);
      errorCode = String(parsed.error_code ?? parsed.code ?? parsed.msg ?? '');
    } catch {
      errorCode = `http ${created.status}`;
    }

    // The body quotes the address back, so only the code is logged.
    console.error('account creation failed', created.status, errorCode.slice(0, 80));

    if (/already|exists|registered/i.test(errorCode)) {
      return json(
        {
          ok: false,
          message: 'That email address already has an account.',
          errors: {
            email: 'That email address already has an account. Sign in instead, or ask the office to reset it.'
          }
        },
        409,
        origin
      );
    }
    if (/password/i.test(errorCode)) {
      return json(
        {
          ok: false,
          message: 'Please choose a different password.',
          errors: { password: 'That password was refused. Try a longer one.' }
        },
        400,
        origin
      );
    }
    return json(
      { ok: false, message: 'The account could not be created. Please try again in a moment.' },
      502,
      origin
    );
  }

  /* Admit them ---------------------------------------------------------- *
   * The row already exists: the trigger wrote an inactive one. This is the
   * write that actually grants access, and it happens here, with the
   * service-role key, after the details have been checked.
   * --------------------------------------------------------------------- */
  const user = await created.json().catch(() => null);
  const userId = typeof user?.id === 'string' ? user.id : '';

  const rollback = () =>
    fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` }
    }).catch(error => console.error('rollback failed', error.name));

  if (!userId) {
    console.error('account created but no id came back');
    return json(
      { ok: false, message: 'The account could not be created. Please try again in a moment.' },
      502,
      origin
    );
  }

  // The representation comes back so that "no row matched" is not mistaken
  // for success: a PATCH that updates nothing is a 204, not an error.
  const activated = await db(`counsellor_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      active: true,
      staff_id: result.value.staff_id,
      phone: result.value.phone
    })
  });

  if (!activated.ok) {
    // The body can quote the staff ID back, so only the status is logged.
    const detail = await activated.text();
    const taken = /staff_id_key|duplicate key|23505/.test(detail);
    console.error('profile activation failed', activated.status, taken ? 'id taken' : '');

    // An account that can sign in and see nothing is worse than no account,
    // and whoever was registering can simply try again.
    await rollback();

    if (taken) {
      return json(
        {
          ok: false,
          message: 'That staff ID is already registered.',
          errors: {
            staff_id: 'That staff ID already has an account. Contact the counselling office if that is not you.'
          }
        },
        409,
        origin
      );
    }
    return json(
      { ok: false, message: 'The account could not be created. Please try again in a moment.' },
      502,
      origin
    );
  }

  const rows = await activated.json().catch(() => null);
  if (!Array.isArray(rows) || rows.length !== 1) {
    console.error('profile activation matched no row');
    await rollback();
    return json(
      { ok: false, message: 'The account could not be created. Please try again in a moment.' },
      502,
      origin
    );
  }

  // Nothing about the new user goes back to the browser. The page signs in
  // with the password the counsellor just chose, like any other sign-in.
  return json({ ok: true, created: true }, 201, origin);
});
