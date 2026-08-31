/**
 * Client for the customer-plane user-provisioning function (`eventpilot-users`).
 *
 * Unlike the vendor console (which has its own token), this talks to the edge
 * function using the SIGNED-IN user's own Supabase JWT. The function validates
 * that JWT, reads the caller's eventpilot_profiles role, and only then creates,
 * lists, or deletes accounts with the service role. See
 * supabase/functions/eventpilot-users/index.ts.
 */
import { supabase } from './supabaseClient'
import type { AuthRole } from './App'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/functions/v1/eventpilot-users`
  : ''

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export type ManagedUser = {
  user_id: string
  email: string
  display_name: string | null
  workspace_code: string | null
  username: string | null
  role: AuthRole
}

export type NewUserInput = {
  role: Exclude<AuthRole, 'beo_viewer'>
  /** Required for top_management / manager. */
  email?: string
  /** Required for staff. */
  username?: string
  password: string
  display_name?: string
}

async function call(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('User management requires the online backend.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session has expired. Sign in again.')

  let response: Response
  try {
    response = await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new Error(
      'Cannot reach the user service. Check that the eventpilot-users function is deployed.',
    )
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(data.error ?? `Request failed (${response.status}).`))
  }
  return data
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const data = await call('list_users')
  return (data.users ?? []) as ManagedUser[]
}

export async function createManagedUser(input: NewUserInput): Promise<ManagedUser> {
  const data = await call('create_user', { ...input })
  return data.user as ManagedUser
}

export async function deleteManagedUser(userId: string): Promise<void> {
  await call('delete_user', { user_id: userId })
}
