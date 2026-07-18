/**
 * Client for the vendor console (`/admin`).
 *
 * The console deliberately does NOT use Supabase Auth. It talks to the
 * `eventpilot-console` edge function with its own username/password and holds a
 * short-lived signed token, so a customer's Top Management account has no path
 * into the SaaS owner console — see supabase/functions/eventpilot-console.
 *
 * The token lives in sessionStorage, not localStorage: closing the tab ends the
 * console session.
 */
import { isSupabaseEnabled } from './supabaseClient'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/functions/v1/eventpilot-console`
  : ''

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const STORAGE_KEY = 'eventpilot.console.session'

export type ConsoleSession = {
  token: string
  expiresAt: number
  username: string
  name: string
  /** True when Supabase is not configured and the console is running offline. */
  sandbox: boolean
}

export function readConsoleSession(): ConsoleSession | null {
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ConsoleSession
    if (!parsed.token || parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function storeConsoleSession(session: ConsoleSession) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearConsoleSession() {
  window.sessionStorage.removeItem(STORAGE_KEY)
}

/** Offline sandbox session, used only when Supabase env vars are absent. */
function sandboxSession(username: string): ConsoleSession {
  return {
    token: 'sandbox',
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    username,
    name: username,
    sandbox: true,
  }
}

async function post(action: string, payload: Record<string, unknown>, token?: string) {
  let response: Response
  try {
    response = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The gateway needs an apikey to route the request. It is not a
        // credential here — the function is deployed with verify_jwt off and
        // authenticates callers itself via the console token below.
        apikey: ANON_KEY,
        ...(token ? { 'x-console-token': token } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    // Almost always the edge function not being deployed yet, or no network.
    throw new Error(
      'Cannot reach the console service. Check that the eventpilot-console function is deployed.',
    )
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(data.error ?? `Console request failed (${response.status}).`))
  }
  return data
}

/** Returns an error message on failure, or null once the session is stored. */
export async function consoleLogin(
  username: string,
  password: string,
): Promise<string | null> {
  if (!isSupabaseEnabled) {
    // Offline sandbox so `npm run dev` works with no backend, exactly like the
    // customer app's offline mode. The console UI labels this state clearly.
    storeConsoleSession(sandboxSession(username.trim() || 'sandbox'))
    return null
  }

  try {
    const data = await post('login', { username, password })
    storeConsoleSession({
      token: String(data.token),
      expiresAt: Number(data.expiresAt),
      username: String(data.username ?? username),
      name: String(data.name ?? username),
      sandbox: false,
    })
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Console sign-in failed.'
  }
}

/**
 * Calls a console action with the stored token. Throws on failure; a 401 also
 * clears the session so the UI falls back to the login screen.
 */
export async function consoleCall(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const session = readConsoleSession()
  if (!session) throw new Error('Console session expired. Sign in again.')
  if (session.sandbox) return { ok: true, sandbox: true }

  try {
    return await post(action, payload, session.token)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/unauthorized/i.test(message)) clearConsoleSession()
    throw error
  }
}

/** Confirms a restored session is still valid server-side. */
export async function verifyConsoleSession(): Promise<boolean> {
  const session = readConsoleSession()
  if (!session) return false
  if (session.sandbox) return true
  try {
    await post('verify', {}, session.token)
    return true
  } catch {
    clearConsoleSession()
    return false
  }
}
