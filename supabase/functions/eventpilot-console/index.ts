// EventPilot vendor console API.
//
// Every request here runs with the service role key, so the ONLY thing standing
// between the internet and the console tables is this file's token check. The
// customer app's anon key cannot reach any eventpilot_console_* table.
//
// Auth model (mirrors kaizen-console):
//   login  -> username/password verified in-database via bcrypt, returns a
//             short-lived HMAC-signed token
//   others -> require that token in the x-console-token header
//
// Deployed with verify_jwt off: the project uses publishable (non-JWT) keys,
// and this function implements its own authentication end to end.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_USER = Deno.env.get('EVENTPILOT_CONSOLE_ADMIN_USER') ?? ''
const ADMIN_PASS = Deno.env.get('EVENTPILOT_CONSOLE_ADMIN_PASSWORD') ?? ''
const TOKEN_SECRET = Deno.env.get('EVENTPILOT_CONSOLE_TOKEN_SECRET') ?? ''

const MAX_ATTEMPTS = 5
const LOCKOUT_MIN = 15
const TOKEN_TTL_MS = 30 * 60 * 1000
const MIN_PASSWORD_LENGTH = 10

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-console-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const enc = new TextEncoder()

function b64url(buf: ArrayBuffer) {
  const s = btoa(String.fromCharCode(...new Uint8Array(buf)))
  return s.split('=').join('').split('+').join('-').split('/').join('_')
}
function b64urlStr(str: string) {
  return btoa(str).split('=').join('').split('+').join('-').split('/').join('_')
}
function fromB64url(str: string) {
  return atob(str.split('-').join('+').split('_').join('/'))
}

/** Console usernames normalise the way Kaizen's do: "Jane Doe" -> "jane.doe". */
function normUser(value: unknown) {
  return String(value ?? '').trim().toLowerCase().split(' ').filter(Boolean).join('.')
}

function cleanStr(value: unknown) {
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

async function sha256(str: string) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(str)))
}

/** Constant-time string compare, so a wrong guess leaks no timing signal. */
function ctEq(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

async function makeToken(username: string) {
  const payload = b64urlStr(
    JSON.stringify({ sub: username, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS }),
  )
  return `${payload}.${await hmac(payload)}`
}

/** Returns the token's subject (username) when valid and unexpired, else null. */
async function readToken(token: unknown): Promise<string | null> {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  if (!ctEq(parts[1], await hmac(parts[0]))) return null
  try {
    const data = JSON.parse(fromB64url(parts[0]))
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null
    return typeof data.sub === 'string' ? data.sub : ''
  } catch {
    return null
  }
}

function getIp(req: Request) {
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const fwd = (req.headers.get('x-forwarded-for') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return fwd[fwd.length - 1] || req.headers.get('x-real-ip') || 'unknown'
}

async function audit(
  action: string,
  detail: Record<string, unknown>,
  ip: string,
  success: boolean,
  actor: string | null = null,
) {
  try {
    await admin
      .from('eventpilot_console_audit')
      .insert({ action, detail, ip, success, actor })
  } catch {
    /* auditing must never block the action it records */
  }
}

/** Refuses to leave the console with no way in. */
async function activeAdminCount() {
  const { count } = await admin
    .from('eventpilot_console_admins')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  return count ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!TOKEN_SECRET) return json({ error: 'Console is not configured.' }, 500)

  const ip = getIp(req)
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const action = String(body.action ?? '')

  if (action === 'login') {
    const { data: rl } = await admin
      .from('eventpilot_console_login_attempts')
      .select('*')
      .eq('ip', ip)
      .maybeSingle()

    if (rl?.locked_until && new Date(rl.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(rl.locked_until).getTime() - Date.now()) / 60000)
      await audit('login_locked', {}, ip, false)
      return json({ error: `Too many attempts. Try again in ${mins} minute(s).` }, 429)
    }

    const username = normUser(body.username)
    const password = String(body.password ?? '')

    let ok = false
    try {
      const { data: id } = await admin.rpc('eventpilot_console_verify_login', {
        p_username: username,
        p_password: password,
      })
      ok = Boolean(id)
    } catch {
      /* fall through to the bootstrap env credential */
    }
    // Bootstrap path: lets the first admin sign in before any row exists.
    if (!ok && ADMIN_USER && ADMIN_PASS) {
      const [userOk, passOk] = await Promise.all([
        (async () => ctEq(await sha256(username), await sha256(normUser(ADMIN_USER))))(),
        (async () => ctEq(await sha256(password), await sha256(ADMIN_PASS)))(),
      ])
      ok = userOk && passOk
    }

    if (!ok) {
      const attempts = (rl?.attempts ?? 0) + 1
      const locked = attempts >= MAX_ATTEMPTS
      await admin.from('eventpilot_console_login_attempts').upsert({
        ip,
        attempts: locked ? MAX_ATTEMPTS : attempts,
        locked_until: locked ? new Date(Date.now() + LOCKOUT_MIN * 60000).toISOString() : null,
        last_attempt: new Date().toISOString(),
      })
      await audit('login_failed', { username, attempts }, ip, false)
      return json({ error: 'Invalid credentials.' }, 401)
    }

    await admin.from('eventpilot_console_login_attempts').delete().eq('ip', ip)
    await admin
      .from('eventpilot_console_admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('username', username)

    const { data: who } = await admin
      .from('eventpilot_console_admins')
      .select('display_name, username, email')
      .eq('username', username)
      .maybeSingle()

    await audit('login_success', { username }, ip, true, username)
    return json({
      token: await makeToken(username),
      expiresAt: Date.now() + TOKEN_TTL_MS,
      username,
      name: who?.display_name || who?.username || username,
      email: who?.email ?? null,
    })
  }

  const actor = await readToken(req.headers.get('x-console-token') ?? body.token)
  if (actor === null) return json({ error: 'Unauthorized' }, 401)

  if (action === 'verify') return json({ ok: true, username: actor })

  if (action === 'list_admins') {
    const { data } = await admin
      .from('eventpilot_console_admins')
      .select('id, username, display_name, email, is_active, created_at, last_login_at')
      .order('created_at', { ascending: true })
    return json({ admins: data ?? [] })
  }

  if (action === 'upsert_admin') {
    const username = normUser(body.username)
    const password = body.password == null ? null : String(body.password)
    if (!username) return json({ error: 'Username is required.' }, 400)
    if (password !== null && password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400)
    }

    const isActive = body.is_active !== false
    // Never let the console be locked out by deactivating the last way in.
    if (!isActive) {
      const { data: existing } = await admin
        .from('eventpilot_console_admins')
        .select('is_active')
        .eq('username', username)
        .maybeSingle()
      if (existing?.is_active && (await activeAdminCount()) <= 1) {
        return json({ error: 'Cannot deactivate the last active console admin.' }, 409)
      }
    }

    const { error } = await admin.rpc('eventpilot_console_upsert_admin', {
      p_username: username,
      p_password: password,
      p_display_name: cleanStr(body.display_name),
      p_email: cleanStr(body.email),
      p_is_active: isActive,
    })
    if (error) {
      await audit('upsert_admin', { username, error: error.message }, ip, false, actor)
      return json({ error: error.message }, 400)
    }
    await audit('upsert_admin', { username, is_active: isActive }, ip, true, actor)
    return json({ ok: true })
  }

  if (action === 'delete_admin') {
    const username = normUser(body.username)
    if (!username) return json({ error: 'Username is required.' }, 400)
    if ((await activeAdminCount()) <= 1) {
      return json({ error: 'Cannot delete the last active console admin.' }, 409)
    }
    const { error } = await admin
      .from('eventpilot_console_admins')
      .delete()
      .eq('username', username)
    if (error) return json({ error: error.message }, 400)
    await audit('delete_admin', { username }, ip, true, actor)
    return json({ ok: true })
  }

  // Changes the signed-in console admin's own password. Unlike the old
  // Settings tab, this actually writes a new bcrypt hash.
  if (action === 'change_password') {
    const current = String(body.current_password ?? '')
    const next = String(body.new_password ?? '')
    if (next.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400)
    }
    const { data: id } = await admin.rpc('eventpilot_console_verify_login', {
      p_username: actor,
      p_password: current,
    })
    if (!id) {
      await audit('change_password', { username: actor }, ip, false, actor)
      return json({ error: 'Current password is incorrect.' }, 401)
    }
    const { error } = await admin.rpc('eventpilot_console_upsert_admin', {
      p_username: actor,
      p_password: next,
      p_display_name: null,
      p_email: null,
      p_is_active: true,
    })
    if (error) return json({ error: error.message }, 400)
    await audit('change_password', { username: actor }, ip, true, actor)
    return json({ ok: true })
  }

  if (action === 'list_audit') {
    const { data } = await admin
      .from('eventpilot_console_audit')
      .select('id, action, actor, detail, ip, success, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    return json({ entries: data ?? [] })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
