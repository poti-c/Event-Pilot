// EventPilot customer-plane user provisioning API.
//
// This is the customer-plane analogue of eventpilot-console. Where that function
// governs NNR-Solutions' own vendor operators, this one lets a customer's own
// signed-in Top Management or Manager create, list, and delete real Supabase
// login accounts for their company.
//
// Auth model (DIFFERENT from eventpilot-console):
//   - eventpilot-console authenticates a custom, self-issued HMAC console token.
//   - THIS function authenticates the CALLER'S own Supabase Auth JWT. Every
//     request must carry `Authorization: Bearer <jwt>`. We validate it with the
//     service-role client (`admin.auth.getUser(token)`), then load the caller's
//     row in eventpilot_profiles to learn their role + workspace, and only then
//     act with the service role.
//
// Deployed with verify_jwt OFF: the function validates the JWT itself so it can
// return clean JSON errors and load the caller's profile in the same pass.
//
// Every request runs with the service role key, so the role/permission checks in
// this file are the only thing standing between a signed-in staff member and the
// ability to mint accounts. The service role key and tokens are never returned.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIN_PASSWORD_LENGTH = 8

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

// These mirror the app's own login logic EXACTLY so accounts created here can
// sign in the same way the app expects. Do not "improve" them independently.
function normalizeStaffUsername(username: unknown) {
  return String(username ?? '').trim().toLowerCase().split(' ').filter(Boolean).join('.')
}
function normalizeWorkspaceCode(code: unknown) {
  return String(code ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function staffEmail(username: unknown, workspaceCode: unknown) {
  return `${normalizeStaffUsername(username)}@${normalizeWorkspaceCode(workspaceCode)}.staff.eventpilot.internal`
}
function cleanStr(v: unknown) {
  const t = String(v ?? '').trim()
  return t || null
}

/** Columns returned to the client for any managed user. */
const MANAGED_USER_COLUMNS = 'user_id, email, display_name, workspace_code, username, role'

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Bad request' }, 400)
    }
    const action = String(body.action ?? '')

    // --- Authenticate the caller's Supabase JWT -----------------------------
    const authHeader = req.headers.get('Authorization') ?? ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = match ? match[1].trim() : ''
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile } = await admin
      .from('eventpilot_profiles')
      .select('user_id, role, workspace_code')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile) return json({ error: 'No profile for caller.' }, 403)

    const callerRole = profile.role as 'top_management' | 'manager' | 'staff'
    const callerWorkspace = profile.workspace_code as string | null

    // --- Actions ------------------------------------------------------------

    if (action === 'list_users') {
      if (callerRole === 'staff') {
        return json({ error: 'Staff cannot manage users.' }, 403)
      }

      let query = admin
        .from('eventpilot_profiles')
        .select(MANAGED_USER_COLUMNS)
        .order('created_at', { ascending: true })

      // Managers only see the staff they can manage.
      if (callerRole === 'manager') {
        query = query.eq('role', 'staff')
      }

      const { data, error } = await query
      if (error) return json({ error: error.message }, 400)

      // Defensive: never surface the vendor-console plane in the customer roster.
      const users = (data ?? []).filter((u) => u.workspace_code !== 'admin')
      return json({ users })
    }

    if (action === 'create_user') {
      const role = String(body.role ?? '')

      // Permission + role validation.
      if (role === 'beo_viewer') {
        return json({ error: 'BEO Viewers are managed in the app, not created here.' }, 400)
      }
      const ALLOWED_ROLES = ['top_management', 'manager', 'staff']
      if (!ALLOWED_ROLES.includes(role)) {
        return json({ error: `Unknown role: ${role}` }, 400)
      }
      if (callerRole === 'staff') {
        return json({ error: 'You cannot create that role.' }, 403)
      }
      if (callerRole === 'manager' && role !== 'staff') {
        return json({ error: 'You cannot create that role.' }, 403)
      }

      const password = body.password
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return json({ error: 'Password must be at least 8 characters.' }, 400)
      }

      const displayName = cleanStr(body.display_name)

      // Resolve the auth email + stored username/workspace per role.
      let email: string
      let username: string | null
      let workspaceCode: string | null

      if (role === 'staff') {
        const rawUsername = cleanStr(body.username)
        if (!rawUsername) {
          return json({ error: 'Staff username is required.' }, 400)
        }
        if (!callerWorkspace) {
          return json({ error: 'Set a workspace code on your account before adding staff.' }, 400)
        }
        email = staffEmail(rawUsername, callerWorkspace)
        username = normalizeStaffUsername(rawUsername)
        workspaceCode = callerWorkspace
      } else {
        const rawEmail = cleanStr(body.email)
        if (!rawEmail || !rawEmail.includes('@')) {
          return json({ error: 'A valid email is required.' }, 400)
        }
        email = rawEmail
        username = null
        // Inherit the caller's workspace so the company groups together.
        workspaceCode = callerWorkspace
      }

      // Create the auth user. The role/workspace/username go into user_metadata
      // because a trigger (eventpilot_handle_new_user) mirrors them into
      // eventpilot_profiles the moment the auth row is inserted; passing them
      // here means that auto-created profile is already correct.
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role,
          display_name: displayName,
          workspace_code: workspaceCode,
          username,
        },
      })
      if (createErr || !created?.user) {
        const msg =
          createErr?.message || (createErr ? JSON.stringify(createErr) : 'Failed to create account.')
        if (/already registered|already been registered|duplicate|exists/i.test(msg)) {
          return json({ error: 'An account with that email or username already exists.' }, 409)
        }
        return json({ error: msg }, 400)
      }

      // Upsert the profile so this function is the authoritative writer,
      // regardless of what the trigger set (service role bypasses RLS).
      const { data: upserted, error: upsertErr } = await admin
        .from('eventpilot_profiles')
        .upsert({
          user_id: created.user.id,
          email,
          role,
          display_name: displayName,
          workspace_code: workspaceCode,
          username,
        })
        .select(MANAGED_USER_COLUMNS)
        .maybeSingle()

      if (upsertErr) {
        // Best-effort rollback so we don't leave an orphaned auth user.
        await admin.auth.admin.deleteUser(created.user.id)
        return json({ error: upsertErr.message }, 400)
      }

      return json({ user: upserted })
    }

    if (action === 'delete_user') {
      const userId = cleanStr(body.user_id)
      if (!userId) return json({ error: 'User id is required.' }, 400)

      const { data: target } = await admin
        .from('eventpilot_profiles')
        .select('user_id, role')
        .eq('user_id', userId)
        .maybeSingle()
      if (!target) return json({ error: 'User not found.' }, 404)

      if (userId === user.id) {
        return json({ error: 'You cannot delete your own account.' }, 400)
      }

      // Permission checks.
      if (callerRole === 'staff') {
        return json({ error: 'Staff cannot manage users.' }, 403)
      }
      if (callerRole === 'manager' && target.role !== 'staff') {
        return json({ error: 'You can only delete staff accounts.' }, 403)
      }

      // Never remove the last way into Top Management.
      if (target.role === 'top_management') {
        const { count } = await admin
          .from('eventpilot_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', 'top_management')
        if ((count ?? 0) <= 1) {
          return json({ error: 'Cannot delete the last Top Management account.' }, 409)
        }
      }

      // The eventpilot_profiles row cascades via FK ON DELETE CASCADE.
      const { error: delErr } = await admin.auth.admin.deleteUser(userId)
      if (delErr) return json({ error: delErr.message }, 400)

      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    return json({ error: String((err as { message?: unknown })?.message ?? err) }, 500)
  }
})
