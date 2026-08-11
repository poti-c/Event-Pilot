import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Contact,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  List,
  LogOut,
  Mail,
  MapPinned,
  MessageSquare,
  Plus,
  ReceiptText,
  RefreshCcw,
  Scale,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  Users,
  Utensils,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { isSupabaseEnabled, supabase } from './supabaseClient'
import {
  clearConsoleSession,
  consoleCall,
  consoleLogin,
  readConsoleSession,
  verifyConsoleSession,
} from './consoleClient'
import type { ConsoleSession } from './consoleClient'
import {
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
} from './usersClient'
import type { ManagedUser, NewUserInput } from './usersClient'
import {
  accounts,
  BEO_DEPARTMENTS,
  initialBookings,
  LEAD_TYPES,
  leads as initialLeads,
  naNirandProfile,
  products as initialProducts,
  rolePermissions,
  tasks,
  venues as initialVenues,
} from './data'
import type {
  Account,
  Agreement,
  AgreementClause,
  AgreementContent,
  AgreementRevision,
  AgreementStatus,
  JobClosure,
  BookingStatus,
  Discount,
  BeoDepartment,
  DepartmentAck,
  DepartmentMessage,
  DiscountMode,
  EventBooking,
  FollowUp,
  GroupResume,
  GroupResumeDay,
  GroupResumeFunction,
  GroupResumeGuest,
  GroupResumeItineraryItem,
  GroupResumeRevenueRow,
  Lead,
  LeadStage,
  LeadType,
  LineItem,
  PaymentStatus,
  PriceTier,
  Product,
  PropertyProfile,
  ProposalRevision,
  SignedAgreementFile,
  ProposalSnapshot,
  Venue,
} from './data'

type ModuleId =
  | 'Dashboard'
  | 'Calendar'
  | 'Leads'
  | 'CRM'
  | 'Bookings'
  | 'BEOs'
  | 'GroupResume'
  | 'Proposals'
  | 'Agreements'
  | 'Invoices'
  | 'Packages'
  | 'Venues'
  | 'Tasks'
  | 'Reports'
  | 'Settings'
  | 'Login'
  | 'NewBooking'

type NavItem = {
  id: ModuleId
  label: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Calendar', label: 'Calendar / Function Diary', icon: CalendarDays },
  { id: 'CRM', label: 'CRM', icon: Users },
  { id: 'Leads', label: 'Leads', icon: Sparkles },
  { id: 'Proposals', label: 'Proposals', icon: FileText },
  { id: 'Agreements', label: 'Agreements', icon: Scale },
  { id: 'Bookings', label: 'Bookings', icon: BookOpenCheck },
  { id: 'BEOs', label: 'BEOs', icon: ClipboardList },
  { id: 'GroupResume', label: 'Group Resume', icon: Contact },
  { id: 'Invoices', label: 'Invoices', icon: ReceiptText },
  { id: 'Packages', label: 'Packages & Products', icon: Boxes },
  { id: 'Venues', label: 'Venue', icon: MapPinned },
  { id: 'Tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'Reports', label: 'Reports', icon: BarChart3 },
  { id: 'Settings', label: 'Settings', icon: Settings },
]

const NAV_ACTION: Partial<Record<ModuleId, Action>> = {
  Leads: 'nav:Leads',
  CRM: 'nav:CRM',
  Proposals: 'nav:Proposals',
  Agreements: 'nav:Agreements',
  Invoices: 'nav:Invoices',
  Packages: 'nav:Packages',
  Venues: 'nav:Venues',
  Reports: 'nav:Reports',
}

function visibleNavItems(role: AuthRole): NavItem[] {
  // Department viewers always get the calendar and the BEOs they sign off on,
  // plus any extra nav items Top Management has granted their role.
  if (role === 'beo_viewer') {
    return navItems.filter((item) => {
      if (item.id === 'Calendar' || item.id === 'BEOs') return true
      const action = NAV_ACTION[item.id]
      return action ? hasPermission(role, action) : false
    })
  }
  return navItems.filter((item) => {
    const action = NAV_ACTION[item.id]
    return !action || hasPermission(role, action)
  })
}

const moduleIds: ModuleId[] = [
  ...navItems.map((item) => item.id),
  'Login',
  'NewBooking',
]

function getModuleFromHash(): ModuleId {
  const hashModule = window.location.hash.replace('#', '').replace(/-/g, ' ')
  return moduleIds.includes(hashModule as ModuleId)
    ? (hashModule as ModuleId)
    : 'Dashboard'
}

function moduleTitle(module: ModuleId) {
  if (module === 'Login') return 'Login'
  if (module === 'GroupResume') return 'Group Resume'
  if (module === 'Venues') return 'Venue'
  return module === 'NewBooking' ? 'New booking' : module
}

const LEAD_STAGES: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost']

const LEAD_STAGE_PROBABILITY: Record<LeadStage, number> = {
  New: 10,
  Contacted: 25,
  Qualified: 45,
  'Proposal Sent': 65,
  Won: 100,
  Lost: 0,
}

// The linear "hunt" pipeline sales works a lead along. Lost is an off-ramp
// reachable from any stage, so it is not part of the forward/back order.
const LEAD_PIPELINE: LeadStage[] = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won']

function nextLeadStage(current: LeadStage): LeadStage {
  const index = LEAD_PIPELINE.indexOf(current)
  if (index === -1) return current
  return LEAD_PIPELINE[Math.min(index + 1, LEAD_PIPELINE.length - 1)]
}

function previousLeadStage(current: LeadStage): LeadStage {
  const index = LEAD_PIPELINE.indexOf(current)
  if (index === -1) return current
  return LEAD_PIPELINE[Math.max(index - 1, 0)]
}

function stageClass(stage: LeadStage) {
  return `stage-tone-${stage.toLowerCase().replace(/\s+/g, '-')}`
}

// The most recent date any part of the lead changed: an explicit updatedAt stamp,
// or (for seeded leads that predate it) the latest history / follow-up entry.
function leadLastUpdated(lead: Lead): string {
  const stamps = [
    lead.updatedAt,
    ...(lead.history ?? []).map((entry) => entry.timestamp),
    ...(lead.followUps ?? []).map((entry) => entry.timestamp),
    lead.createdAt,
  ].filter((value): value is string => Boolean(value))
  return [...stamps].sort().at(-1) ?? lead.createdAt
}

const statusOrder: BookingStatus[] = [
  'Inquiry',
  'Tentative',
  'Pending',
  'Confirmed',
  'Completed',
  'Lost',
  'Cancelled',
]

function readLocal<T>(key: string, initialValue: T): T {
  const stored = window.localStorage.getItem(key)
  if (!stored) return initialValue
  try {
    return JSON.parse(stored) as T
  } catch {
    return initialValue
  }
}

function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

/**
 * App-state hook that persists to Supabase (per authenticated user) with a
 * localStorage cache/fallback. When Supabase is not configured, or before a
 * user has signed in, it behaves exactly like the previous localStorage store.
 *
 * - `userId` present + Supabase enabled: hydrate from `eventpilot_app_state`,
 *   seeding the remote row from local/initial data on first login, and
 *   write-through on every change.
 * - otherwise: pure localStorage, so the app still runs fully offline.
 */
function useSyncedState<T>(key: string, initialValue: T, userId: string | null) {
  // Scope the local cache per user in cloud mode so one account's data can never
  // seed into, or be shown to, another account on a shared browser. Offline mode
  // (no Supabase / no userId) keeps the bare key so existing sandbox data loads.
  const scopedKey = supabase && userId ? `${key}::${userId}` : key
  const [value, setValue] = useState<T>(() => readLocal(scopedKey, initialValue))
  const hydratedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase || !userId || hydratedFor.current === userId) return
    let cancelled = false

    // A (different) user just signed in — drop any state still held from a
    // previous account before hydrating, so their data is never displayed or
    // written under this user.
    setValue(readLocal(scopedKey, initialValue))

    void (async () => {
      const { data, error } = await supabase
        .from('eventpilot_app_state')
        .select('value')
        .eq('user_id', userId)
        .eq('key', key)
        .maybeSingle()
      if (cancelled) return

      if (data && data.value != null) {
        setValue(data.value as T)
        writeLocal(scopedKey, data.value)
      } else if (!error) {
        // No remote row yet — seed from the pristine initial value, never from
        // another user's cached data.
        writeLocal(scopedKey, initialValue)
        await supabase
          .from('eventpilot_app_state')
          .upsert({ user_id: userId, key, value: initialValue })
      }
      hydratedFor.current = userId
    })()

    return () => {
      cancelled = true
    }
  }, [key, scopedKey, userId, initialValue])

  const setStoredValue = useCallback(
    (nextValue: T | ((currentValue: T) => T)) => {
      setValue((currentValue) => {
        const resolved =
          typeof nextValue === 'function'
            ? (nextValue as (currentValue: T) => T)(currentValue)
            : nextValue

        writeLocal(scopedKey, resolved)
        // Only write through to the cloud once this user's remote state has
        // hydrated, so a pre-hydration render can't clobber their row with
        // defaults or another account's leftover values.
        if (supabase && userId && hydratedFor.current === userId) {
          void supabase
            .from('eventpilot_app_state')
            .upsert({ user_id: userId, key, value: resolved })
            .then(({ error }) => {
              if (error) console.error(`Event Pilot sync failed for ${key}:`, error.message)
            })
        }
        return resolved
      })
    },
    [key, scopedKey, userId],
  )

  return [value, setStoredValue] as const
}

/**
 * A Thai address kept in both scripts. Thai tax invoices are legally rendered
 * in Thai, but the console is usable in English, so place names are stored
 * twice rather than transliterated at render time.
 */
type ThaiAddress = {
  house_no: string
  soi: string
  road: string
  subdistrict: string
  subdistrict_en: string
  district: string
  district_en: string
  province: string
  province_en: string
  postcode: string
  country: string
}

const emptyAddress: ThaiAddress = {
  house_no: '',
  soi: '',
  road: '',
  subdistrict: '',
  subdistrict_en: '',
  district: '',
  district_en: '',
  province: '',
  province_en: '',
  postcode: '',
  country: 'Thailand',
}

/** The issuer identity stamped onto every billing document. */
type IssuerSettings = {
  company_name: string
  company_name_th: string
  tax_id: string
  office_type: 'head_office' | 'branch'
  branch_code: string
  billing_address: ThaiAddress
  phone: string
  email: string
  website: string
  logo_url: string
  signatory_name: string
  signatory_title: string
  promptpay_id: string
  promptpay_name: string
  support_email: string
}

const emptyIssuer: IssuerSettings = {
  company_name: '',
  company_name_th: '',
  tax_id: '',
  office_type: 'head_office',
  branch_code: '',
  billing_address: emptyAddress,
  phone: '',
  email: '',
  website: '',
  logo_url: '',
  signatory_name: '',
  signatory_title: '',
  promptpay_id: '',
  promptpay_name: '',
  support_email: '',
}

function rowToIssuer(row: Record<string, unknown> | null): IssuerSettings {
  if (!row) return emptyIssuer
  return {
    ...emptyIssuer,
    ...Object.fromEntries(
      Object.entries(row).filter(([key, value]) => key in emptyIssuer && value !== null),
    ),
    billing_address: {
      ...emptyAddress,
      ...((row.billing_address as Partial<ThaiAddress> | null) ?? {}),
    },
  } as IssuerSettings
}

/** Loads and saves the single issuer settings row. */
function useIssuerSettings(enabled: boolean) {
  const [issuer, setIssuer] = useState<IssuerSettings>(emptyIssuer)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let active = true
    void (async () => {
      try {
        const data = await consoleCall('get_settings')
        if (!active) return
        setIssuer(rowToIssuer(data.settings as Record<string, unknown> | null))
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load settings.')
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [enabled])

  // Saved explicitly rather than on a debounce: these values end up on legal
  // documents, so an operator should decide when they are committed.
  const save = useCallback(async (next: IssuerSettings): Promise<string | null> => {
    try {
      const data = await consoleCall('update_settings', { settings: next })
      setIssuer(rowToIssuer(data.settings as Record<string, unknown> | null))
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not save settings.'
    }
  }, [])

  return { issuer, setIssuer, save, ready, error }
}

/** Maps a eventpilot_client_companies row onto the console's ClientCompany shape. */
function rowToClient(row: Record<string, unknown>): ClientCompany {
  const status = String(row.account_status ?? 'active')
  return {
    id: String(row.id),
    companyName: String(row.name ?? ''),
    propertyType: String(row.property_type ?? ''),
    planId: (row.plan as SaaSTierId) ?? 'Starter',
    status: ((status.charAt(0).toUpperCase() + status.slice(1)) as ClientAccountStatus),
    adminEmail: String(row.contact_email ?? ''),
    renewalDate: String(row.renewal_date ?? ''),
    activeUsers: Number(row.active_users ?? 0),
    userLimitOverride: Number(row.allowed_users ?? 0),
    bookingLimitOverride: Number(row.booking_limit ?? 0),
    supportOwner: String(row.support_owner ?? ''),
    notes: String(row.notes ?? ''),
  }
}

function clientToRow(client: ClientCompany): Record<string, unknown> {
  return {
    id: client.id,
    name: client.companyName,
    property_type: client.propertyType,
    plan: client.planId,
    account_status: client.status.toLowerCase(),
    contact_email: client.adminEmail,
    renewal_date: client.renewalDate || null,
    active_users: client.activeUsers,
    allowed_users: client.userLimitOverride,
    booking_limit: client.bookingLimitOverride,
    support_owner: client.supportOwner,
    notes: client.notes,
  }
}

/**
 * The console's client roster, backed by the shared
 * eventpilot_client_companies table rather than per-user app state.
 *
 * Edits stay local while typing and are flushed to the server on a short
 * debounce, so the existing keystroke-level UI keeps working without issuing a
 * request per character.
 */
function useConsoleClients(enabled: boolean) {
  const [clients, setClients] = useState<ClientCompany[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(new Map<string, ClientCompany>())
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    void (async () => {
      try {
        const data = await consoleCall('list_clients')
        if (!active) return
        const rows = (data.clients as Record<string, unknown>[] | undefined) ?? []
        setClients(rows.map(rowToClient))
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load clients.')
      } finally {
        if (active) setReady(true)
      }
    })()
    return () => {
      active = false
    }
  }, [enabled])

  const flush = useCallback(async () => {
    const queued = [...pending.current.values()]
    pending.current.clear()
    for (const client of queued) {
      try {
        await consoleCall('upsert_client', { client: clientToRow(client) })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save client.')
      }
    }
  }, [])

  const update = useCallback(
    (next: ClientCompany[] | ((current: ClientCompany[]) => ClientCompany[])) => {
      setClients((current) => {
        const resolved = typeof next === 'function' ? next(current) : next
        // Queue only the rows that actually changed.
        for (const client of resolved) {
          const before = current.find((item) => item.id === client.id)
          if (!before || JSON.stringify(before) !== JSON.stringify(client)) {
            pending.current.set(client.id, client)
          }
        }
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void flush(), 700)
        return resolved
      })
    },
    [flush],
  )

  // Don't lose the last keystrokes if the tab closes mid-debounce.
  useEffect(() => {
    if (!enabled) return
    const onHide = () => {
      if (pending.current.size) void flush()
    }
    window.addEventListener('beforeunload', onHide)
    return () => window.removeEventListener('beforeunload', onHide)
  }, [enabled, flush])

  return { clients, setClients: update, ready, error, reload: setClients }
}

type AuthState = {
  userId: string | null
  email: string
  role: LoginSession['role']
  displayName: string
  workspaceCode: string
  ready: boolean
  setDisplayName: (name: string) => void
}

/** Tracks the Supabase auth session and resolves the user's Event Pilot profile. */
function useSupabaseAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<LoginSession['role']>('staff')
  const [displayName, setDisplayName] = useState('')
  const [workspaceCode, setWorkspaceCode] = useState('')
  const [ready, setReady] = useState(!isSupabaseEnabled)

  useEffect(() => {
    if (!supabase) return
    let active = true
    const client = supabase

    // Applies a session and (asynchronously) resolves the user's profile. All
    // setState calls happen inside async callbacks, never synchronously in the
    // effect body.
    const applySession = (next: Session | null) => {
      if (!active) return
      setSession(next)
      const uid = next?.user?.id
      if (!uid) {
        setRole('staff')
        setDisplayName('')
        setWorkspaceCode('')
        return
      }
      void client
        .from('eventpilot_profiles')
        .select('role, display_name, workspace_code')
        .eq('user_id', uid)
        .maybeSingle()
        .then(({ data }) => {
          if (!active) return
          const nextRole = data?.role as AuthRole | undefined
          if (nextRole && AUTH_ROLES.includes(nextRole)) {
            setRole(nextRole)
          }
          setDisplayName((data?.display_name as string | null) ?? '')
          setWorkspaceCode((data?.workspace_code as string | null) ?? '')
        })
    }

    void client.auth.getSession().then(({ data }) => {
      applySession(data.session)
      if (active) setReady(true)
    })
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      applySession(next)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return {
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? '',
    role,
    displayName,
    workspaceCode,
    ready,
    setDisplayName,
  }
}

function timeOfDayGreeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(value)
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function compactMoney(value: number) {
  if (value >= 1_000_000) return `THB ${(value / 1_000_000).toFixed(2)}M`
  // Values that round up to 1000K (>= 999,500) should read as millions, not "1000K".
  if (value >= 999_500) return `THB ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `THB ${(value / 1_000).toFixed(0)}K`
  return money(value)
}

function priceLabel(value: number | null) {
  return value === null ? 'Quote required' : money(value)
}

// Existing bookings have no lineItems yet — derive a sensible starting point
// from their package/menu/AV/staffing tags so proposals/invoices never render
// blank until someone edits them.
function deriveLineItemsFromBooking(booking: EventBooking): LineItem[] {
  const tags = [
    ...(booking.packageName ? [booking.packageName] : []),
    ...booking.menu,
    ...booking.av,
    ...booking.staffing,
  ]
  if (!tags.length) {
    return [
      {
        id: `${booking.id}-derived`,
        description: booking.eventName,
        quantity: 1,
        unitPrice: booking.forecastRevenue,
      },
    ]
  }
  const perItem = booking.forecastRevenue / tags.length
  return tags.map((tag, index) => ({
    id: `${booking.id}-derived-${index}`,
    description: tag,
    quantity: 1,
    unitPrice: Math.round(perItem),
  }))
}

function getLineItems(booking: EventBooking): LineItem[] {
  return booking.lineItems && booking.lineItems.length
    ? booking.lineItems
    : deriveLineItemsFromBooking(booking)
}

function getDiscount(booking: EventBooking): Discount {
  return booking.discount ?? { mode: 'none', value: 0 }
}

// Uses the real Web Share API where the browser supports it; otherwise copies
// the summary to the clipboard so the action still does something real
// rather than just logging a fake local activity entry.
async function shareDocument(
  payload: { title: string; text: string },
  onCopied: () => void,
) {
  if (navigator.share) {
    try {
      await navigator.share(payload)
      return
    } catch {
      // User cancelled the native share sheet — nothing further to do.
      return
    }
  }
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(`${payload.title}\n${payload.text}`)
    onCopied()
  }
}

function discountAmount(subtotal: number, discount: Discount): number {
  switch (discount.mode) {
    case 'percent':
      return subtotal * (discount.value / 100)
    case 'value':
    case 'promo':
      return Math.min(discount.value, subtotal)
    default:
      return 0
  }
}

function capacityLabel(value: number | null) {
  return value === null ? 'TBC' : value.toString()
}

function shortDate(value: string | null) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function toLocalDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function toDateKey(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toStampKey(value: Date) {
  const hours = `${value.getHours()}`.padStart(2, '0')
  const minutes = `${value.getMinutes()}`.padStart(2, '0')
  return `${toDateKey(value)} ${hours}:${minutes}`
}

function toMonthKey(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function monthKeyToDate(value: string) {
  const [year, month] = value.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

function offsetMonth(value: string, offset: number) {
  const date = monthKeyToDate(value)
  date.setMonth(date.getMonth() + offset)
  return toMonthKey(date)
}

function monthLabel(monthKey: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    monthKeyToDate(monthKey),
  )
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort()
}

function availableMonthsOf<T>(items: T[], getDate: (item: T) => string) {
  return uniqueSorted(items.map((item) => toMonthKey(toLocalDate(getDate(item)))))
}

function availableYearsOf<T>(items: T[], getDate: (item: T) => string) {
  return uniqueSorted(items.map((item) => getDate(item).slice(0, 4)))
}

type ListViewMode = 'grid' | 'list'
type TimeFilterMode = 'All' | 'Month' | 'Year'

function filterAndSortByTime<T>(
  items: T[],
  getDate: (item: T) => string,
  timeFilter: TimeFilterMode,
  selectedMonth: string,
  selectedYear: string,
) {
  const filtered = items.filter((item) => {
    if (timeFilter === 'Month') return toMonthKey(toLocalDate(getDate(item))) === selectedMonth
    if (timeFilter === 'Year') return getDate(item).slice(0, 4) === selectedYear
    return true
  })
  return [...filtered].sort((first, second) => getDate(first).localeCompare(getDate(second)))
}

function ListViewControls({
  availableMonths,
  availableYears,
  selectedMonth,
  selectedYear,
  setSelectedMonth,
  setSelectedYear,
  setTimeFilter,
  setViewMode,
  timeFilter,
  viewMode,
}: {
  availableMonths: string[]
  availableYears: string[]
  selectedMonth: string
  selectedYear: string
  setSelectedMonth: (month: string) => void
  setSelectedYear: (year: string) => void
  setTimeFilter: (mode: TimeFilterMode) => void
  setViewMode: (mode: ListViewMode) => void
  timeFilter: TimeFilterMode
  viewMode: ListViewMode
}) {
  return (
    <div className="list-controls">
      <div className="segmented-control">
        {(['All', 'Month', 'Year'] as TimeFilterMode[]).map((mode) => (
          <button
            className={timeFilter === mode ? 'segment active' : 'segment'}
            key={mode}
            onClick={() => setTimeFilter(mode)}
            type="button"
          >
            {mode === 'All' ? 'Display all' : mode}
          </button>
        ))}
        {timeFilter === 'Month' && (
          <select onChange={(event) => setSelectedMonth(event.target.value)} value={selectedMonth}>
            {availableMonths.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>
        )}
        {timeFilter === 'Year' && (
          <select onChange={(event) => setSelectedYear(event.target.value)} value={selectedYear}>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="view-toggle">
        <button
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          className={viewMode === 'grid' ? 'icon-toggle active' : 'icon-toggle'}
          onClick={() => setViewMode('grid')}
          type="button"
        >
          <LayoutGrid size={16} />
        </button>
        <button
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          className={viewMode === 'list' ? 'icon-toggle active' : 'icon-toggle'}
          onClick={() => setViewMode('list')}
          type="button"
        >
          <List size={16} />
        </button>
      </div>
    </div>
  )
}

function statusClass(status: string) {
  return `tone-${status.toLowerCase().replace(/\s+/g, '-')}`
}

function nextBookingStatus(current: BookingStatus) {
  if (['Completed', 'Lost', 'Cancelled'].includes(current)) return current
  const index = statusOrder.indexOf(current)
  return statusOrder[Math.min(index + 1, statusOrder.indexOf('Completed'))]
}

function previousBookingStatus(current: BookingStatus) {
  if (current === 'Lost' || current === 'Cancelled') return 'Pending'
  const index = statusOrder.indexOf(current)
  return statusOrder[Math.max(index - 1, 0)]
}

function splitList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function statusProbability(status: BookingStatus) {
  if (status === 'Confirmed' || status === 'Completed') return 100
  if (status === 'Pending') return 75
  if (status === 'Tentative') return 55
  if (status === 'Inquiry') return 30
  return 0
}

function minutesFromTime(time: string) {
  const match = time.match(/^(\d{2}):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function bookingTimesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) {
  const aStart = minutesFromTime(startA)
  let aEnd = minutesFromTime(endA)
  const bStart = minutesFromTime(startB)
  let bEnd = minutesFromTime(endB)
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false
  // An end at or before its start means the event runs past midnight; extend it
  // by a day so the overlap test doesn't collapse (e.g. 20:00-01:00 vs 21:00-23:00).
  if (aEnd <= aStart) aEnd += 1440
  if (bEnd <= bStart) bEnd += 1440
  return aStart < bEnd && bStart < aEnd
}

type NewBookingFormState = {
  leadType: LeadType
  eventName: string
  eventType: string
  account: string
  contact: string
  owner: string
  leadSource: string
  date: string
  startTime: string
  endTime: string
  setupTime: string
  breakdownTime: string
  venue: string
  room: string
  layout: string
  expectedGuests: string
  guaranteedGuests: string
  status: BookingStatus
  holdExpiry: string
  packageName: string
  forecastRevenue: string
  depositDue: string
  nextAction: string
  appetizer: string
  soup: string
  mainCourse: string
  dessert: string
  beverage: string
  dietaryNotes: string
  housekeeping: string
  av: string
  staffing: string
  frontOffice: string
  vendors: string
  hr: string
  billingCompany: string
  billingCompanyName: string
  billingAddress: string
  billingTaxId: string
  paymentMethod: string
  specialRequests: string
  clientNotes: string
  internalNotes: string
}

function getNewBookingDefaults(): NewBookingFormState {
  return {
    leadType: 'BEO',
    eventName: '',
    eventType: '',
    account: '',
    contact: '',
    owner: 'Maya Sales',
    leadSource: 'Direct inquiry',
    date: toDateKey(new Date()),
    startTime: '09:00',
    endTime: '13:00',
    setupTime: '07:00',
    breakdownTime: '14:00',
    venue: 'Grand Ballroom',
    room: 'Ballroom A',
    layout: 'Round table banquet',
    expectedGuests: '',
    guaranteedGuests: '',
    status: 'Inquiry',
    holdExpiry: '',
    packageName: 'Custom event package',
    forecastRevenue: '',
    depositDue: '',
    nextAction: 'Qualify requirements and send proposal',
    appetizer: '',
    soup: '',
    mainCourse: '',
    dessert: '',
    beverage: '',
    dietaryNotes: '',
    housekeeping: '',
    av: '',
    staffing: '',
    frontOffice: '',
    vendors: '',
    hr: '',
    billingCompany: '',
    billingCompanyName: '',
    billingAddress: '',
    billingTaxId: '',
    paymentMethod: '',
    specialRequests: '',
    clientNotes: '',
    internalNotes: '',
  }
}

// Carry across everything a lead already captured so converting to a booking /
// proposal never re-types known data. Unknown booking fields keep their defaults.
function bookingPrefillFromLead(lead: Lead): NewBookingFormState {
  const defaults = getNewBookingDefaults()
  const accountName = lead.company || lead.name
  const contactLine = [lead.email, lead.phone].filter(Boolean).join(' · ')
  return {
    ...defaults,
    leadType: lead.leadType ?? 'BEO',
    eventName: lead.category ? `${accountName} — ${lead.category}` : `${accountName} event`,
    eventType: lead.category || defaults.eventType,
    account: accountName,
    contact: lead.name,
    owner: lead.owner || defaults.owner,
    leadSource: lead.source || defaults.leadSource,
    forecastRevenue: lead.estimatedValue ? String(lead.estimatedValue) : '',
    clientNotes: lead.notes || '',
    internalNotes: [
      `Converted from lead ${lead.id}.`,
      contactLine ? `Contact: ${contactLine}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  }
}

type SaaSTierId = 'Starter' | 'Gold' | 'Platinum'
type ClientAccountStatus = 'Active' | 'Pilot' | 'Suspended'
type AdminConsoleTab = 'Clients' | 'Packages' | 'Company' | 'Security'

type SaaSPlan = {
  id: SaaSTierId
  name: string
  description: string
  targetCustomer: string
  annualPrice: number
  includedUsers: number
  additionalUserPrice: number
  bookingLimit: number | null
  lockedFeatures: string[]
  adminNotes: string
}

type ExpansionPack = {
  id: string
  name: string
  category: string
  description: string
  annualPrice: number
  pricingUnit: string
  recommendedFor: string
  status: 'Available' | 'Draft'
}

type ClientCompany = {
  id: string
  companyName: string
  propertyType: string
  planId: SaaSTierId
  status: ClientAccountStatus
  adminEmail: string
  renewalDate: string
  activeUsers: number
  userLimitOverride: number
  bookingLimitOverride: number
  supportOwner: string
  notes: string
}

type AdminCredentialSettings = {
  adminName: string
  adminEmail: string
  requireNewDeviceEmailVerification: boolean
  sendLoginAlerts: boolean
  requireSensitiveActionVerification: boolean
  trustedDeviceDays: number
  sessionTimeoutMinutes: number
  minimumPasswordLength: number
  allowedEmailDomain: string
  lastPasswordChange: string
}

/** Three-tier authority model, mirroring the Kaizen System. */
// top_management/manager/staff are the real Supabase tiers. 'beo_viewer' is an
// app-layer, view-only department sign-in (no Supabase account) that can only
// see BEOs + the calendar and acknowledge its own department's instructions.
export type AuthRole = 'top_management' | 'manager' | 'staff' | 'beo_viewer'

type LoginSession = {
  authenticated: boolean
  email: string
  displayName: string
  workspaceCode: string
  role: AuthRole
  department?: BeoDepartment
}

// The three real Supabase tiers (used for profile validation + user management).
const AUTH_ROLES: AuthRole[] = ['top_management', 'manager', 'staff']
// Roles offered on the sign-in screen — the tiers plus the department viewer.
const LOGIN_ROLES: AuthRole[] = [...AUTH_ROLES, 'beo_viewer']

const ROLE_LABELS: Record<AuthRole, { en: string; th: string }> = {
  top_management: { en: 'Top Management', th: 'ผู้บริหารระดับสูง' },
  manager: { en: 'Managers', th: 'ผู้จัดการ' },
  staff: { en: 'Staff', th: 'พนักงาน' },
  beo_viewer: { en: 'Department (BEO)', th: 'แผนก (BEO)' },
}

/**
 * Single source of truth for tier-based access, mirroring the descriptions in
 * `rolePermissions` (data.ts): Top Management has full access; Managers cover
 * day-to-day operations but not admin/billing/user management; Staff get
 * assigned-work views only (no create/delete, no admin, no packages edit).
 */
type Action =
  | 'nav:Leads'
  | 'nav:CRM'
  | 'nav:Proposals'
  | 'nav:Agreements'
  | 'nav:Invoices'
  | 'nav:Packages'
  | 'nav:Venues'
  | 'nav:Reports'
  | 'booking:create'
  | 'booking:advanceStatus'
  | 'booking:fallBackStatus'
  | 'packages:edit'
  | 'venues:edit'
  | 'leads:create'
  | 'leads:edit'
  | 'leads:delete'
  | 'proposal:edit'
  | 'admin:settings'
  | 'admin:userManagement'

// Every action, in the order shown in the Settings permission editor, grouped
// for a readable matrix. Top Management always has all of them.
const ACTION_CATALOG: { key: Action; label: string; group: string }[] = [
  { key: 'nav:CRM', label: 'See CRM', group: 'Navigation' },
  { key: 'nav:Leads', label: 'See Leads', group: 'Navigation' },
  { key: 'nav:Proposals', label: 'See Proposals', group: 'Navigation' },
  { key: 'nav:Agreements', label: 'See Agreements', group: 'Navigation' },
  { key: 'nav:Invoices', label: 'See Invoices', group: 'Navigation' },
  { key: 'nav:Packages', label: 'See Packages & Products', group: 'Navigation' },
  { key: 'nav:Venues', label: 'See Venues', group: 'Navigation' },
  { key: 'nav:Reports', label: 'See Reports', group: 'Navigation' },
  { key: 'booking:create', label: 'Create bookings', group: 'Bookings' },
  { key: 'booking:advanceStatus', label: 'Advance booking status', group: 'Bookings' },
  { key: 'booking:fallBackStatus', label: 'Move booking status back', group: 'Bookings' },
  { key: 'leads:create', label: 'Create leads', group: 'Leads' },
  { key: 'leads:edit', label: 'Edit leads', group: 'Leads' },
  { key: 'leads:delete', label: 'Delete leads', group: 'Leads' },
  { key: 'proposal:edit', label: 'Edit proposals & BEO instructions', group: 'Documents' },
  { key: 'packages:edit', label: 'Edit packages & products', group: 'Documents' },
  { key: 'venues:edit', label: 'Edit venue photos & details', group: 'Documents' },
  { key: 'admin:settings', label: 'Edit property settings', group: 'Administration' },
  { key: 'admin:userManagement', label: 'Manage users', group: 'Administration' },
]

const ALL_ACTIONS: Action[] = ACTION_CATALOG.map((entry) => entry.key)

// Roles whose permissions Top Management can edit. Top Management itself is
// always all-access and never editable; that guarantee lives in this module.
const EDITABLE_ROLES: AuthRole[] = ['manager', 'staff', 'beo_viewer']

export type RolePermissionOverrides = Partial<Record<AuthRole, Action[]>>

// BEO Viewers are an app-layer roster (no Supabase account): a name tied to one
// department. They sign in through the "Department (BEO)" tab, view-only.
export type BeoViewer = {
  id: string
  name: string
  department: BeoDepartment
}

// A small starter roster so the BEO Viewers section is not empty on first run.
const initialBeoViewers: BeoViewer[] = [
  { id: 'beo-viewer-1', name: 'Front desk lead', department: 'Front Office' },
  { id: 'beo-viewer-2', name: 'Kitchen pass', department: 'Kitchen' },
]

// A STABLE empty default — useSyncedState keys its hydration effect on the
// initialValue identity, so this must not be an inline {} (that would re-run the
// effect every render and loop). No overrides means "use the built-in defaults".
const EMPTY_ROLE_OVERRIDES: RolePermissionOverrides = {}

const STAFF_ACTIONS: Action[] = ['booking:advanceStatus']
const MANAGER_ONLY_ADDITIONS: Action[] = [
  'nav:Leads',
  'nav:CRM',
  'nav:Proposals',
  'nav:Agreements',
  'nav:Invoices',
  'nav:Packages',
  'nav:Venues',
  'nav:Reports',
  'booking:create',
  'booking:advanceStatus',
  'booking:fallBackStatus',
  'leads:create',
  'leads:edit',
  'leads:delete',
  'proposal:edit',
  // Managers can manage users, but the User Management panel itself limits them
  // to adding Staff and BEO Viewers (never Top Management or other Managers).
  'admin:userManagement',
]

// The built-in defaults, used until Top Management customises a role and as the
// fallback for any role without an override.
const DEFAULT_PERMISSIONS: Record<AuthRole, Set<Action>> = {
  // Department viewers are view-only by default: no gated actions. Their base nav
  // (BEOs + calendar) is handled explicitly in visibleNavItems.
  beo_viewer: new Set(),
  staff: new Set(STAFF_ACTIONS),
  manager: new Set([...STAFF_ACTIONS, ...MANAGER_ONLY_ADDITIONS]),
  top_management: new Set(ALL_ACTIONS),
}

// The permissions actually enforced. Rebuilt from DEFAULT_PERMISSIONS plus any
// saved overrides via applyPermissionOverrides(); hasPermission reads this.
const activePermissions: Record<AuthRole, Set<Action>> = {
  top_management: new Set(DEFAULT_PERMISSIONS.top_management),
  manager: new Set(DEFAULT_PERMISSIONS.manager),
  staff: new Set(DEFAULT_PERMISSIONS.staff),
  beo_viewer: new Set(DEFAULT_PERMISSIONS.beo_viewer),
}

/**
 * Rebuilds the enforced permission sets from the saved overrides. Called
 * synchronously from App on every render so children see a consistent view.
 * Top Management is never overridable — it always keeps every action.
 */
function applyPermissionOverrides(overrides: RolePermissionOverrides | undefined) {
  activePermissions.top_management = new Set(ALL_ACTIONS)
  for (const role of EDITABLE_ROLES) {
    const override = overrides?.[role]
    if (override) {
      // Keep only recognised actions, in case an old key lingers in saved state.
      activePermissions[role] = new Set(
        override.filter((action) => ALL_ACTIONS.includes(action)),
      )
    } else {
      activePermissions[role] = new Set(DEFAULT_PERMISSIONS[role])
    }
  }
}

function hasPermission(role: AuthRole, action: Action): boolean {
  return activePermissions[role].has(action)
}

// Staff sign in with a username scoped to their workspace code; the auth email is
// derived deterministically so usernames can repeat across workspaces (Kaizen pattern).
function normalizeStaffUsername(username: string): string {
  return username.trim().toLowerCase().split(' ').filter(Boolean).join('.')
}

function normalizeWorkspaceCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function staffEmail(username: string, workspaceCode: string): string {
  return `${normalizeStaffUsername(username)}@${normalizeWorkspaceCode(
    workspaceCode,
  )}.staff.eventpilot.internal`
}

type NotificationItem = {
  id: string
  title: string
  detail: string
}

type SandboxAction = {
  id: string
  title: string
  detail: string
  time: string
}

const initialSaasPlans: SaaSPlan[] = [
  {
    id: 'Starter',
    name: 'Starter / Free Sandbox',
    description: 'Free entry plan for small hotels to test the workflow with limited operational depth.',
    targetCustomer: 'Small venues testing EventPilot before paid onboarding.',
    annualPrice: 0,
    includedUsers: 1,
    additionalUserPrice: 0,
    bookingLimit: 20,
    lockedFeatures: [
      'PDF and branded document export',
      'Custom BEO, proposal, and invoice templates',
      'Multi-user approvals and department sign-off',
      'Advanced reports and SaaS admin controls',
      'Cloud backup and production data sync',
    ],
    adminNotes: 'Use as a free sandbox. Keep limits visible so upgrade value is clear.',
  },
  {
    id: 'Gold',
    name: 'Gold Class',
    description: 'Paid single-user plan for boutique hotels, restaurants, and small venues.',
    targetCustomer: 'Thai SME hotel or venue with one primary sales/admin user.',
    annualPrice: 29000,
    includedUsers: 1,
    additionalUserPrice: 10000,
    bookingLimit: null,
    lockedFeatures: [],
    adminNotes: 'Best entry paid plan. Expansion packs should handle special needs.',
  },
  {
    id: 'Platinum',
    name: 'Platinum Class',
    description: 'Full access plan for hotel teams with department workflows and up to five users.',
    targetCustomer: 'Hotel team needing sales, BEO, finance, and operations collaboration.',
    annualPrice: 49000,
    includedUsers: 5,
    additionalUserPrice: 5000,
    bookingLimit: null,
    lockedFeatures: [],
    adminNotes: 'Position as best value for teams. Use lower extra-seat price as upgrade incentive.',
  },
]

const initialExpansionPacks: ExpansionPack[] = [
  {
    id: 'PACK-USERS',
    name: 'Extra User Seat',
    category: 'Seats',
    description: 'Add named users beyond the included seat allowance.',
    annualPrice: 10000,
    pricingUnit: 'per user / year on Gold; THB 5,000 on Platinum',
    recommendedFor: 'Growing sales or operations teams',
    status: 'Available',
  },
  {
    id: 'PACK-REPORTS',
    name: 'Advanced Reports Pack',
    category: 'Analytics',
    description: 'Venue utilization, lost business, sales performance, and revenue drilldowns.',
    annualPrice: 12000,
    pricingUnit: 'per workspace / year',
    recommendedFor: 'Owners and sales managers',
    status: 'Available',
  },
  {
    id: 'PACK-TEMPLATES',
    name: 'Custom Document Template Pack',
    category: 'Documents',
    description: 'Branded BEO, proposal, invoice, and package templates.',
    annualPrice: 15000,
    pricingUnit: 'setup + annual maintenance',
    recommendedFor: 'Hotels with strong brand standards',
    status: 'Available',
  },
  {
    id: 'PACK-PORTAL',
    name: 'Client Portal Pack',
    category: 'Client experience',
    description: 'Client approval links for proposals, BEO revisions, and event documents.',
    annualPrice: 18000,
    pricingUnit: 'per workspace / year',
    recommendedFor: 'Wedding and corporate event teams',
    status: 'Draft',
  },
  {
    id: 'PACK-TRAINING',
    name: 'Implementation & Training Pack',
    category: 'Services',
    description: 'Initial setup, staff training, package loading, and workflow configuration.',
    annualPrice: 25000,
    pricingUnit: 'one-time onboarding',
    recommendedFor: 'First-year paid customers',
    status: 'Available',
  },
  {
    id: 'PACK-MIGRATION',
    name: 'Data Migration Pack',
    category: 'Services',
    description: 'Import legacy clients, bookings, packages, and function diary records.',
    annualPrice: 20000,
    pricingUnit: 'per migration project',
    recommendedFor: 'Hotels moving from spreadsheets',
    status: 'Draft',
  },
]

const initialAdminCredentialSettings: AdminCredentialSettings = {
  adminName: 'EventPilot Owner',
  adminEmail: 'admin.eventpilot@nnr-solutions.com',
  requireNewDeviceEmailVerification: true,
  sendLoginAlerts: true,
  requireSensitiveActionVerification: true,
  trustedDeviceDays: 30,
  sessionTimeoutMinutes: 30,
  minimumPasswordLength: 8,
  allowedEmailDomain: 'nnr-solutions.com',
  lastPasswordChange: '2026-06-05',
}

const initialLoginSession: LoginSession = {
  authenticated: false,
  email: '',
  displayName: '',
  workspaceCode: '',
  role: 'staff',
}

function App() {
  const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin'
  const [activeModule, setActiveModule] = useState<ModuleId>(getModuleFromHash)
  // A view with an unsaved draft (e.g. an in-progress proposal edit) registers a
  // guard here: whether it's currently dirty, and what to ask before discarding.
  // Any navigation away from it routes through runGuarded so it can confirm
  // first — via an in-app dialog, not window.confirm (unreliable in sandboxed
  // preview frames: no visible prompt, and it silently resolves to "cancel").
  const unsavedChangesGuardRef = useRef<{ isDirty: () => boolean; message: string } | null>(null)
  const registerUnsavedChangesGuard = useCallback(
    (guard: { isDirty: () => boolean; message: string } | null) => {
      unsavedChangesGuardRef.current = guard
    },
    [],
  )
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)
  // Runs `action` right away if nothing would be lost; otherwise shows a
  // confirm dialog first and only runs it if the user chooses to discard.
  const runGuarded = useCallback((action: () => void) => {
    const guard = unsavedChangesGuardRef.current
    if (guard && guard.isDirty()) {
      setConfirmDialog({ message: guard.message, onConfirm: action })
      return
    }
    action()
  }, [])

  const auth = useSupabaseAuth()
  // Offline sandbox session (used only when Supabase is not configured).
  const [localSession, setLocalSession] = useState<LoginSession>(initialLoginSession)
  // App-layer department (BEO viewer) session. It bypasses Supabase entirely and
  // takes precedence over the tier session, so it works even when Supabase is on.
  const [departmentSession, setDepartmentSession] = useState<LoginSession | null>(null)
  // Vendor console session — entirely independent of the customer auth above.
  const [consoleSession, setConsoleSession] = useState<ConsoleSession | null>(null)
  const [consoleReady, setConsoleReady] = useState(!isAdminRoute)
  const userId = auth.userId
  const loginSession: LoginSession = departmentSession
    ? departmentSession
    : isSupabaseEnabled
      ? {
          authenticated: !!auth.userId,
          email: auth.email,
          displayName: auth.displayName,
          workspaceCode: auth.workspaceCode,
          role: auth.role,
        }
      : localSession

  const [bookings, setBookings] = useSyncedState(
    'eventpilot.bookings.v2',
    initialBookings,
    userId,
  )
  // The vendor console's roster comes from the shared table, not per-user app
  // state, so every operator sees the same customers.
  const consoleClients = useConsoleClients(isAdminRoute && Boolean(consoleSession))
  const [adminPlans, setAdminPlans] = useSyncedState(
    'eventpilot.admin.plans.v1',
    initialSaasPlans,
    userId,
  )
  const [expansionPacks, setExpansionPacks] = useSyncedState(
    'eventpilot.admin.expansion-packs.v1',
    initialExpansionPacks,
    userId,
  )
  const [adminCredentialSettings, setAdminCredentialSettings] = useSyncedState(
    'eventpilot.admin.credentials.v1',
    initialAdminCredentialSettings,
    userId,
  )
  const [propertyProfile, setPropertyProfile] = useSyncedState(
    'eventpilot.property-profile.v1',
    naNirandProfile,
    userId,
  )
  const [leads, setLeads] = useSyncedState(
    'eventpilot.leads.v1',
    initialLeads,
    userId,
  )
  const [products, setProducts] = useSyncedState(
    'eventpilot.products.v1',
    initialProducts,
    userId,
  )
  // Editable Category and Unit option lists for packages/products (Settings >
  // Package & Products edits them).
  const [packageCategories, setPackageCategories] = useSyncedState<string[]>(
    'eventpilot.package-categories.v1',
    DEFAULT_PACKAGE_CATEGORIES,
    userId,
  )
  const [unitOptions, setUnitOptions] = useSyncedState<string[]>(
    'eventpilot.unit-options.v1',
    DEFAULT_UNIT_OPTIONS,
    userId,
  )
  // Editable Setup style option list for venues (Settings > Venue).
  const [setupStyleOptions, setSetupStyleOptions] = useSyncedState<string[]>(
    'eventpilot.setup-styles.v1',
    DEFAULT_SETUP_STYLES,
    userId,
  )
  // Venue photos and descriptions edited from the Venue page.
  const [venues, setVenues] = useSyncedState<Venue[]>('eventpilot.venues.v1', initialVenues, userId)
  // Editable BEO department list, the BEO Viewer roster, and per-role permission
  // overrides all live in per-user synced state (Settings edits them).
  const [departments, setDepartments] = useSyncedState<BeoDepartment[]>(
    'eventpilot.departments.v1',
    BEO_DEPARTMENTS,
    userId,
  )
  const [beoViewers, setBeoViewers] = useSyncedState<BeoViewer[]>(
    'eventpilot.beo-viewers.v1',
    initialBeoViewers,
    userId,
  )
  const [rolePermissionOverrides, setRolePermissionOverrides] =
    useSyncedState<RolePermissionOverrides>(
      'eventpilot.role-permissions.v1',
      EMPTY_ROLE_OVERRIDES,
      userId,
    )
  // Rebuild the enforced permission sets from saved overrides before rendering
  // any child, so every hasPermission() call this render is consistent.
  applyPermissionOverrides(rolePermissionOverrides)
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id)
  // null = show the list; a booking id = show that document's detail with a back button.
  const [beoViewBookingId, setBeoViewBookingId] = useState<string | null>(null)
  const [proposalViewBookingId, setProposalViewBookingId] = useState<string | null>(null)
  const [invoiceViewBookingId, setInvoiceViewBookingId] = useState<string | null>(null)
  const [agreementViewBookingId, setAgreementViewBookingId] = useState<string | null>(null)
  // When a lead is converted, the New Booking form opens pre-filled; convertTarget
  // decides whether Save lands on Bookings or jumps straight to the proposal.
  const [bookingPrefill, setBookingPrefill] = useState<NewBookingFormState | null>(null)
  const [convertTarget, setConvertTarget] = useState<'booking' | 'proposal'>('booking')
  const [packagesNavNonce, setPackagesNavNonce] = useState(0)
  const [leadsNavNonce, setLeadsNavNonce] = useState(0)
  // The lead a CRM pull-in just created, so the Leads view opens onto it.
  const [pulledLeadId, setPulledLeadId] = useState<string | null>(null)
  // Bumped by the topbar's New lead; the remounted Leads view opens a blank
  // draft. Reset on any other navigation so it fires exactly once.
  const [leadDraftNonce, setLeadDraftNonce] = useState(0)
  const [openLeadDraft, setOpenLeadDraft] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>('All')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [sandboxActions, setSandboxActions] = useState<SandboxAction[]>([])

  useEffect(() => {
    const handleHashChange = () => {
      setActiveModule(getModuleFromHash())
      // Arriving by URL or the back button is a fresh visit, so a lead opened
      // by a previous topbar/CRM pull-in should not reopen with the list.
      setPulledLeadId(null)
      setOpenLeadDraft(false)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Restore a console session on reload, confirming it server-side so a stale
  // or revoked token drops straight back to the console login.
  useEffect(() => {
    if (!isAdminRoute) return
    let active = true
    void (async () => {
      const valid = await verifyConsoleSession()
      if (!active) return
      setConsoleSession(valid ? readConsoleSession() : null)
      setConsoleReady(true)
    })()
    return () => {
      active = false
    }
  }, [isAdminRoute])

  useEffect(() => {
    const nextHash = activeModule.replace(/\s+/g, '-')
    if (isAdminRoute) return
    if (window.location.hash !== `#${nextHash}`) {
      window.history.replaceState(null, '', `#${nextHash}`)
    }
  }, [activeModule, isAdminRoute])

  useEffect(() => {
    if (
      adminCredentialSettings.adminEmail === 'admin@eventpilot.local' ||
      adminCredentialSettings.requireNewDeviceEmailVerification === undefined
    ) {
      setAdminCredentialSettings((currentSettings) => ({
        ...initialAdminCredentialSettings,
        adminName: currentSettings.adminName || initialAdminCredentialSettings.adminName,
        adminEmail:
          currentSettings.adminEmail === 'admin@eventpilot.local'
            ? initialAdminCredentialSettings.adminEmail
            : currentSettings.adminEmail || initialAdminCredentialSettings.adminEmail,
        minimumPasswordLength:
          currentSettings.minimumPasswordLength ||
          initialAdminCredentialSettings.minimumPasswordLength,
        sessionTimeoutMinutes:
          currentSettings.sessionTimeoutMinutes ||
          initialAdminCredentialSettings.sessionTimeoutMinutes,
        allowedEmailDomain:
          currentSettings.allowedEmailDomain ||
          initialAdminCredentialSettings.allowedEmailDomain,
        lastPasswordChange:
          currentSettings.lastPasswordChange ||
          initialAdminCredentialSettings.lastPasswordChange,
      }))
    }
  }, [
    adminCredentialSettings.adminEmail,
    adminCredentialSettings.requireNewDeviceEmailVerification,
    setAdminCredentialSettings,
  ])

  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) ?? bookings[0]
  const beoViewBooking = bookings.find((booking) => booking.id === beoViewBookingId)
  const proposalViewBooking = bookings.find((booking) => booking.id === proposalViewBookingId)
  const invoiceViewBooking = bookings.find((booking) => booking.id === invoiceViewBookingId)
  const agreementViewBooking = bookings.find((booking) => booking.id === agreementViewBookingId)

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return bookings.filter((booking) => {
      const matchesQuery =
        !normalizedQuery ||
        [
          booking.eventName,
          booking.account,
          booking.contact,
          booking.venue,
          booking.room,
          booking.owner,
          booking.packageName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)

      const matchesStatus =
        statusFilter === 'All' || booking.status === statusFilter

      return matchesQuery && matchesStatus
    })
  }, [bookings, query, statusFilter])

  const confirmedRevenue = bookings.reduce(
    (sum, booking) => sum + booking.revenue,
    0,
  )
  const forecastRevenue = bookings.reduce(
    (sum, booking) =>
      booking.status === 'Lost' || booking.status === 'Cancelled'
        ? sum
        : sum + booking.forecastRevenue,
    0,
  )
  const openLeads = leads.filter((lead) => lead.stage !== 'Won' && lead.stage !== 'Lost')
  const pipelineRevenue = openLeads.reduce(
    (sum, lead) => sum + lead.estimatedValue,
    0,
  )
  const overdueFollowUps = bookings.filter((booking) =>
    ['Inquiry', 'Tentative', 'Pending'].includes(booking.status),
  ).length
  const notificationItems = useMemo<NotificationItem[]>(() => {
    const paymentItems = bookings
      .filter((booking) => ['Unpaid', 'Deposit due', 'Partial'].includes(booking.paymentStatus))
      .slice(0, 3)
      .map((booking) => ({
        id: `payment-${booking.id}`,
        title: `${booking.paymentStatus}: ${booking.eventName}`,
        detail: `${money(booking.depositDue || booking.forecastRevenue)} requires finance follow-up.`,
      }))
    const holdItems = bookings
      .filter((booking) => booking.holdExpiry && ['Inquiry', 'Tentative', 'Pending'].includes(booking.status))
      .slice(0, 3)
      .map((booking) => ({
        id: `hold-${booking.id}`,
        title: `Hold expiry: ${booking.eventName}`,
        detail: `${booking.holdExpiry} hold date needs sales confirmation.`,
      }))
    const beoItems = bookings
      .filter((booking) => booking.revision === 0)
      .slice(0, 2)
      .map((booking) => ({
        id: `beo-${booking.id}`,
        title: `Draft BEO needs review`,
        detail: `${booking.beoNumber} has not been revised by operations yet.`,
      }))

    return [...paymentItems, ...holdItems, ...beoItems]
  }, [bookings])

  const recordSandboxAction = (title: string, detail: string) => {
    const action: SandboxAction = {
      id: `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      detail,
      time: new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()),
    }
    setSandboxActions((currentActions) => [action, ...currentActions].slice(0, 8))
    setToast(`${title}: ${detail}`)
  }

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const updateBookingStatus = (
    bookingId: string,
    direction: 'backward' | 'forward',
  ) => {
    const currentBooking = bookings.find((booking) => booking.id === bookingId)
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId) return booking

        const nextStatus =
          direction === 'forward'
            ? nextBookingStatus(booking.status)
            : previousBookingStatus(booking.status)

        return {
          ...booking,
          status: nextStatus,
          // Realized revenue only exists while Confirmed/Completed. Recompute it
          // from the target status in both directions so a fall-back clears it
          // (otherwise the "confirmed revenue" KPI stays overstated).
          revenue:
            nextStatus === 'Confirmed' || nextStatus === 'Completed'
              ? booking.forecastRevenue
              : 0,
          paymentStatus:
            nextStatus === 'Confirmed' && booking.paymentStatus === 'Unpaid'
              ? 'Deposit due'
              : booking.paymentStatus,
          contractStatus:
            nextStatus === 'Confirmed' && booking.contractStatus !== 'Signed'
              ? 'Signature required'
              : booking.contractStatus,
        }
      }),
    )
    if (currentBooking) {
      const nextStatus =
        direction === 'forward'
          ? nextBookingStatus(currentBooking.status)
          : previousBookingStatus(currentBooking.status)
      recordSandboxAction(
        'Booking status changed',
        `${currentBooking.eventName} moved from ${currentBooking.status} to ${nextStatus}.`,
      )
    }
  }

  const appendBeoHistory = (bookingId: string, note: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              beoHistory: [
                ...(booking.beoHistory ?? []),
                { id: `HIST-${Date.now()}`, timestamp: toDateKey(new Date()), note },
              ],
            }
          : booking,
      ),
    )
  }

  // Instructions are only stored once they are submitted, so a half-typed note
  // never counts as a live instruction to the department.
  const submitDepartmentInstruction = (
    bookingId: string,
    dept: BeoDepartment,
    text: string,
    by: string,
  ) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              departmentInstructions: { ...booking.departmentInstructions, [dept]: trimmed },
              // A new instruction clears that department's stale acknowledgement.
              departmentAcks: (() => {
                const next = { ...booking.departmentAcks }
                delete next[dept]
                return next
              })(),
              departmentMessages: [
                ...(booking.departmentMessages ?? []),
                {
                  id: `DMSG-${Date.now()}`,
                  department: dept,
                  kind: 'instruction' as const,
                  text: trimmed,
                  by,
                  at: toStampKey(new Date()),
                },
              ],
            }
          : booking,
      ),
    )
    appendBeoHistory(bookingId, `Instructions sent to ${dept} (${by})`)
  }

  const acknowledgeDepartment = (bookingId: string, dept: BeoDepartment, by: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              departmentAcks: {
                ...booking.departmentAcks,
                [dept]: { by, at: toDateKey(new Date()) },
              },
              departmentMessages: [
                ...(booking.departmentMessages ?? []),
                {
                  id: `DMSG-${Date.now()}`,
                  department: dept,
                  kind: 'acknowledgement' as const,
                  text: 'Acknowledged the current instructions.',
                  by,
                  at: toStampKey(new Date()),
                },
              ],
            }
          : booking,
      ),
    )
    appendBeoHistory(bookingId, `${dept} acknowledged the BEO instructions (${by})`)
  }

  const appendDocumentHistory = (bookingId: string, note: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              documentHistory: [
                ...(booking.documentHistory ?? []),
                { id: `HIST-${Date.now()}`, timestamp: toDateKey(new Date()), note },
              ],
            }
          : booking,
      ),
    )
  }

  const markClientApproved = (bookingId: string) => {
    const today = toDateKey(new Date())
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              clientApprovedAt: today,
              beoHistory: [
                ...(booking.beoHistory ?? []),
                { id: `HIST-${Date.now()}`, timestamp: today, note: 'Client approved' },
              ],
            }
          : booking,
      ),
    )
  }

  const markBeoRevised = (bookingId: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              revision: booking.revision + 1,
              beoHistory: [
                ...(booking.beoHistory ?? []),
                {
                  id: `HIST-${Date.now()}`,
                  timestamp: toDateKey(new Date()),
                  note: `Marked as Rev ${booking.revision + 1}`,
                },
              ],
            }
          : booking,
      ),
    )
    const booking = bookings.find((item) => item.id === bookingId)
    if (booking) {
      recordSandboxAction(
        'BEO revision recorded',
        `${booking.beoNumber} moved to Rev ${booking.revision + 1}.`,
      )
    }
  }

  /**
   * Saving an edited proposal cuts a numbered revision: the booking keeps the
   * live figures, and a full snapshot is appended so Revision 1 stays readable
   * after Revision 2 is written.
   */
  const saveProposalRevision = (
    bookingId: string,
    lineItems: LineItem[],
    discount: Discount,
    savedBy: string,
    note: string,
  ) => {
    let nextNumber = 0
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId) return booking
        const number = (booking.proposalRevision ?? 0) + 1
        nextNumber = number
        const snapshot: ProposalSnapshot = {
          eventName: booking.eventName,
          account: booking.account,
          contact: booking.contact,
          eventType: booking.eventType,
          packageName: booking.packageName,
          venue: booking.venue,
          room: booking.room,
          date: booking.date,
          expectedGuests: booking.expectedGuests,
          depositDue: booking.depositDue,
          lineItems,
          discount,
        }
        return {
          ...booking,
          lineItems,
          discount,
          proposalRevision: number,
          proposalRevisions: [
            ...(booking.proposalRevisions ?? []),
            {
              id: `PRV-${bookingId}-${number}`,
              number,
              savedAt: toStampKey(new Date()),
              savedBy,
              note,
              snapshot,
            },
          ],
        }
      }),
    )
    appendDocumentHistory(bookingId, `Proposal saved as Revision ${nextNumber}`)
  }

  const createAgreement = (bookingId: string, agreement: Agreement) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId ? { ...booking, agreement } : booking,
      ),
    )
    appendDocumentHistory(
      bookingId,
      `Agreement ${agreement.content.agreementNumber} generated from proposal Revision ${agreement.fromProposalRevision}`,
    )
  }

  /** Same revision rule as the proposal, on the agreement's own counter. */
  const saveAgreementRevision = (
    bookingId: string,
    content: AgreementContent,
    savedBy: string,
    note: string,
  ) => {
    let nextNumber = 0
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId || !booking.agreement) return booking
        const number = booking.agreement.revision + 1
        nextNumber = number
        return {
          ...booking,
          agreement: {
            ...booking.agreement,
            content,
            revision: number,
            revisions: [
              ...booking.agreement.revisions,
              {
                id: `ARV-${bookingId}-${number}`,
                number,
                savedAt: toStampKey(new Date()),
                savedBy,
                note,
                snapshot: content,
              },
            ],
          },
        }
      }),
    )
    appendDocumentHistory(bookingId, `Agreement saved as Revision ${nextNumber}`)
  }

  /**
   * The countersigned agreement coming back in. This — not the status flag —
   * is what unlocks invoicing, so uploading one also marks the agreement and
   * the booking's contract as signed.
   */
  const uploadSignedAgreement = (bookingId: string, file: SignedAgreementFile) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId || !booking.agreement) return booking
        return {
          ...booking,
          contractStatus: 'Signed',
          agreement: {
            ...booking.agreement,
            status: 'Signed',
            signedAt: toDateKey(new Date()),
            signedFile: file,
          },
        }
      }),
    )
    appendDocumentHistory(bookingId, `Signed agreement uploaded (${file.name})`)
  }

  const removeSignedAgreement = (bookingId: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId || !booking.agreement) return booking
        return {
          ...booking,
          agreement: {
            ...booking.agreement,
            status: 'Sent for signature',
            signedAt: null,
            signedFile: null,
          },
        }
      }),
    )
    appendDocumentHistory(bookingId, 'Signed agreement removed')
  }

  /** Post-event closeout: final numbers in, nothing further expected. */
  const closeJob = (bookingId: string, closure: JobClosure) => {
    const stamped: JobClosure = {
      ...closure,
      closedBy: closure.closedBy || loginSession.displayName.trim() || 'Unknown user',
    }
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? {
              ...booking,
              status: 'Completed',
              actualGuests: stamped.actualGuests,
              revenue: stamped.finalRevenue,
              closure: stamped,
            }
          : booking,
      ),
    )
    const booking = bookings.find((item) => item.id === bookingId)
    if (booking) {
      recordSandboxAction(
        'Job closed',
        `${booking.eventName} closed out at ${money(stamped.finalRevenue)}.`,
      )
    }
  }

  const reopenJob = (bookingId: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId) return booking
        const next = { ...booking, status: 'Confirmed' as const }
        delete next.closure
        return next
      }),
    )
  }

  const setAgreementStatus = (bookingId: string, status: AgreementStatus) => {
    const today = toDateKey(new Date())
    setBookings((currentBookings) =>
      currentBookings.map((booking) => {
        if (booking.id !== bookingId || !booking.agreement) return booking
        return {
          ...booking,
          // A signed agreement is the contract; keep the booking's own
          // contract status in step so the BEO readiness check agrees.
          contractStatus: status === 'Signed' ? 'Signed' : booking.contractStatus,
          agreement: {
            ...booking.agreement,
            status,
            sentAt: status === 'Sent for signature' ? today : booking.agreement.sentAt,
            signedAt: status === 'Signed' ? today : null,
          },
        }
      }),
    )
    appendDocumentHistory(bookingId, `Agreement marked ${status}`)
  }

  const updateBookingGroupResume = (bookingId: string, groupResume: GroupResume) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId ? { ...booking, groupResume } : booking,
      ),
    )
    const booking = bookings.find((item) => item.id === bookingId)
    if (booking) {
      recordSandboxAction(
        'Group resume revision saved',
        `${booking.eventName} group resume moved to Rev ${groupResume.revision}.`,
      )
    }
  }

  const updateBookingLineItems = (
    bookingId: string,
    lineItems: LineItem[],
    discount: Discount,
  ) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId ? { ...booking, lineItems, discount } : booking,
      ),
    )
  }

  const createBooking = (booking: EventBooking) => {
    setBookings((currentBookings) => [booking, ...currentBookings])
    setSelectedBookingId(booking.id)
    setStatusFilter('All')
    setQuery('')
    setActiveModule('Bookings')
    recordSandboxAction(
      'Booking created',
      `${booking.eventName} was added locally with ${booking.beoNumber}.`,
    )
  }

  /**
   * Step 2 of the sales flow: pull a CRM customer profile into a new lead and
   * land straight on it, so the only thing left to type is what they want.
   */
  const pullAccountIntoLeads = (customer: Account, leadType: LeadType) => {
    const lead = leadFromAccount(
      customer,
      leadType,
      loginSession.displayName.trim() || 'Unassigned',
    )
    setLeads((current) => [lead, ...current])
    setPulledLeadId(lead.id)
    setOpenLeadDraft(false)
    setLeadsNavNonce((nonce) => nonce + 1)
    setActiveModule(leadType === 'Group Resume' ? 'GroupResume' : 'Leads')
    recordSandboxAction(
      'Lead created from CRM',
      `${customer.name} pulled into the ${leadType} track.`,
    )
  }

  const convertLead = (lead: Lead, target: 'booking' | 'proposal') => {
    setBookingPrefill(bookingPrefillFromLead(lead))
    setConvertTarget(target)
    setActiveModule('NewBooking')

    // Move the lead forward and record who converted it. Never step a stage
    // backward (e.g. a Won lead sent to a fresh proposal keeps Won).
    const actorName =
      loginSession.displayName.trim() || loginSession.email || 'A team member'
    const targetLabel = target === 'booking' ? 'booking' : 'proposal'
    const targetStage: LeadStage = target === 'booking' ? 'Won' : 'Proposal Sent'
    const stamp = toDateKey(new Date())
    setLeads((current) =>
      current.map((item) => {
        if (item.id !== lead.id) return item
        const advanced =
          LEAD_PIPELINE.indexOf(targetStage) > LEAD_PIPELINE.indexOf(item.stage)
        const nextStage = advanced ? targetStage : item.stage
        return {
          ...item,
          stage: nextStage,
          updatedAt: stamp,
          history: [
            ...(item.history ?? []),
            {
              id: `HIST-${Date.now()}`,
              timestamp: stamp,
              note: advanced
                ? `Converted to ${targetLabel} by ${actorName} — stage advanced to ${nextStage}`
                : `Converted to ${targetLabel} by ${actorName}`,
            },
          ],
        }
      }),
    )
  }

  const openNewBooking = () => {
    runGuarded(() => {
      setBookingPrefill(null)
      setConvertTarget('booking')
      setActiveModule('NewBooking')
    })
  }

  /**
   * The topbar's primary action. Work starts at a lead, so this is the front
   * door of the flow; creating a booking outright is the deliberate shortcut
   * and lives on the Bookings page instead.
   *
   * This only opens the form — the lead is not created until it is saved, so
   * a change of mind leaves no empty "New lead" in the list.
   */
  const startNewLead = () => {
    runGuarded(() => {
      setPulledLeadId(null)
      setOpenLeadDraft(true)
      setLeadDraftNonce((nonce) => nonce + 1)
      setLeadsNavNonce((nonce) => nonce + 1)
      setActiveModule('Leads')
    })
  }

  // Vendor console sign-in (see src/consoleClient.ts). Separate credentials,
  // separate token, no Supabase Auth involvement.
  const handleConsoleLogin = async (
    username: string,
    password: string,
  ): Promise<string | null> => {
    const failure = await consoleLogin(username, password)
    if (failure) return failure
    setConsoleSession(readConsoleSession())
    return null
  }

  const handleConsoleLogout = () => {
    clearConsoleSession()
    setConsoleSession(null)
  }

  // Returns an error message on failure, or null on success. `identifier` is an
  // email for Top Management / Managers, or a username for Staff (scoped by the
  // workspace code into a synthetic auth email).
  const handleLoginSubmit = async (
    role: AuthRole,
    identifier: string,
    password: string,
    workspaceCode: string,
    department?: BeoDepartment,
  ): Promise<string | null> => {
    // Department viewers never touch Supabase — they get a local, view-only
    // session scoped to a single BEO department.
    if (role === 'beo_viewer') {
      if (!department) return 'Please choose your department.'
      setDepartmentSession({
        authenticated: true,
        email: '',
        displayName: identifier.trim(),
        workspaceCode: workspaceCode.trim(),
        role: 'beo_viewer',
        department,
      })
      setActiveModule('BEOs')
      return null
    }

    const email =
      role === 'staff' ? staffEmail(identifier, workspaceCode) : identifier.trim()

    if (isSupabaseEnabled && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        return role === 'staff'
          ? 'Invalid workspace code, username, or password.'
          : error.message
      }

      // Enforce that the account tier matches the selected tab (Kaizen pattern):
      // signing in through the wrong tab is denied rather than silently allowed.
      const { data: profile } = await supabase
        .from('eventpilot_profiles')
        .select('role')
        .eq('user_id', data.user.id)
        .maybeSingle()
      if (profile?.role !== role) {
        await supabase.auth.signOut()
        return `This is not a ${ROLE_LABELS[role].en} account.`
      }
      setActiveModule('Dashboard')
      return null
    }

    // Offline sandbox (Supabase not configured): accept the entered identity,
    // honouring the selected tier.
    setLocalSession({
      authenticated: true,
      email,
      displayName: role === 'staff' ? identifier.trim() : '',
      workspaceCode: workspaceCode.trim(),
      role,
    })
    setActiveModule('Dashboard')
    return null
  }

  // Persist the user's display name (Supabase profile row, or offline session).
  const updateProfileName = async (name: string): Promise<string | null> => {
    const trimmed = name.trim()
    if (isSupabaseEnabled && supabase && userId) {
      const { error } = await supabase
        .from('eventpilot_profiles')
        .update({ display_name: trimmed })
        .eq('user_id', userId)
      if (error) return error.message
      auth.setDisplayName(trimmed)
      return null
    }
    setLocalSession((current) => ({ ...current, displayName: trimmed }))
    return null
  }

  // Change the sign-in email. In cloud mode Supabase sends a confirmation link
  // to the new address before the change takes effect.
  const updateAccountEmail = async (nextEmail: string): Promise<string | null> => {
    const trimmed = nextEmail.trim()
    if (isSupabaseEnabled && supabase) {
      const { error } = await supabase.auth.updateUser({ email: trimmed })
      return error ? error.message : null
    }
    setLocalSession((current) => ({ ...current, email: trimmed }))
    return null
  }

  // Change the sign-in password (cloud mode only; offline has no stored secret).
  const updateAccountPassword = async (nextPassword: string): Promise<string | null> => {
    if (isSupabaseEnabled && supabase) {
      const { error } = await supabase.auth.updateUser({ password: nextPassword })
      return error ? error.message : null
    }
    return null
  }

  // Nav clicks always land on a module's list (not whatever document was last
  // open) — a specific document is only opened via an explicit deep link
  // (e.g. "Open BEO" from a proposal), which sets the view-booking-id itself.
  const openModule = (id: ModuleId) => {
    runGuarded(() => {
      setActiveModule(id)
      if (id === 'BEOs') setBeoViewBookingId(null)
      if (id === 'Proposals') setProposalViewBookingId(null)
      if (id === 'Invoices') setInvoiceViewBookingId(null)
      // Packages and Leads keep their open-item state inside their own view,
      // so bump a nonce to remount — clicking the nav returns to the list
      // instead of a stale detail.
      if (id === 'Packages') setPackagesNavNonce((nonce) => nonce + 1)
      if (id === 'Leads' || id === 'GroupResume') {
        setLeadsNavNonce((nonce) => nonce + 1)
        setPulledLeadId(null)
        setOpenLeadDraft(false)
      }
    })
  }

  const handleLogout = () => {
    runGuarded(async () => {
      if (departmentSession) {
        setDepartmentSession(null)
      } else if (isSupabaseEnabled && supabase) {
        await supabase.auth.signOut()
      } else {
        setLocalSession(initialLoginSession)
      }
      setQuery('')
      setStatusFilter('All')
      setActiveModule('Login')
    })
  }

  // The vendor console is a separate authority plane: it never consults the
  // customer Supabase session, so no customer account — not even a Top
  // Management one — can reach it. Checked before the customer auth gate.
  if (isAdminRoute) {
    if (!consoleReady) {
      return <main className="login-shell" aria-busy="true" />
    }
    if (!consoleSession) {
      return <ConsoleLoginView onSubmit={handleConsoleLogin} />
    }
    return (
      <AdminPortal
        adminCredentialSettings={adminCredentialSettings}
        adminPlans={adminPlans}
        clientCompanies={consoleClients.clients}
        clientsError={consoleClients.error}
        clientsReady={consoleClients.ready}
        consoleSession={consoleSession}
        expansionPacks={expansionPacks}
        handleLogout={handleConsoleLogout}
        setAdminCredentialSettings={setAdminCredentialSettings}
        setAdminPlans={setAdminPlans}
        setClientCompanies={consoleClients.setClients}
        setExpansionPacks={setExpansionPacks}
      />
    )
  }

  // Wait for the Supabase session to resolve before deciding what to render,
  // so we don't briefly flash the login screen for an already-signed-in user.
  if (isSupabaseEnabled && !auth.ready) {
    return <main className="login-shell" aria-busy="true" />
  }

  if (!loginSession.authenticated || activeModule === 'Login') {
    return <LoginView onSubmit={handleLoginSubmit} />
  }

  return (
    <div className="platform-shell">
      <aside className="sidebar no-print" aria-label="Main navigation">
        <div className="brand-block">
          <div className="brand-mark">
            <img alt="" src="/brand/eventpilot-command-icon.svg" />
          </div>
          <div>
            <strong>EventPilot</strong>
            <span>YOUR BEO NAVIGATOR</span>
          </div>
        </div>

        <nav className="nav-list">
          {visibleNavItems(loginSession.role).map((item) => {
            const Icon = item.icon
            return (
              <button
                className={activeModule === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => openModule(item.id)}
                aria-current={activeModule === item.id ? 'page' : undefined}
                type="button"
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <p>{timeOfDayGreeting(new Date().getHours())}</p>
          <button
            className="sidebar-account"
            onClick={() => runGuarded(() => setActiveModule('Settings'))}
            title="Open settings"
            type="button"
          >
            <Settings size={15} />
            <span className="sidebar-account-identity">
              <strong>
                {loginSession.displayName.trim() || loginSession.email || 'Account'}
              </strong>
              <small>{ROLE_LABELS[loginSession.role].en}</small>
            </span>
          </button>
          <button className="sidebar-signout" onClick={handleLogout} type="button">
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="workbench">
        <header className="topbar no-print">
          <div>
            <p className="eyebrow">{propertyProfile.name}</p>
            <h1>{moduleTitle(activeModule)}</h1>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                aria-label="Search bookings"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events, clients, venues"
                value={query}
              />
            </label>
            <button
              aria-expanded={notificationsOpen}
              aria-label={`${notificationItems.length} local notifications`}
              className="icon-button notification-button"
              onClick={() => setNotificationsOpen((current) => !current)}
              title="Notifications"
              type="button"
            >
              <Bell size={18} />
              {notificationItems.length > 0 && <span>{notificationItems.length}</span>}
            </button>
            {hasPermission(loginSession.role, 'leads:create') ? (
              <a
                className="primary-action"
                href="#Leads"
                onClick={(event) => {
                  event.preventDefault()
                  startNewLead()
                }}
              >
                <Plus size={17} />
                New lead
              </a>
            ) : (
              // No lead rights but can still book? Keep the old shortcut here
              // rather than leaving them with no primary action at all.
              hasPermission(loginSession.role, 'booking:create') && (
                <a
                  className="primary-action"
                  href="#NewBooking"
                  onClick={(event) => {
                    event.preventDefault()
                    openNewBooking()
                  }}
                >
                  <Plus size={17} />
                  New booking
                </a>
              )
            )}
          </div>
          {notificationsOpen && (
            <section className="notification-panel" aria-label="Local notifications">
              <div className="panel-header">
                <h2>Local activity center</h2>
                <button
                  className="text-action"
                  onClick={() => setNotificationsOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <div className="notification-list">
                {notificationItems.map((item) => (
                  <article key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </article>
                ))}
                {sandboxActions.map((action) => (
                  <article key={action.id}>
                    <strong>{action.title}</strong>
                    <span>
                      {action.detail} | {action.time}
                    </span>
                  </article>
                ))}
                {!notificationItems.length && !sandboxActions.length && (
                  <article>
                    <strong>No local alerts</strong>
                    <span>New sends, exports, reports, and BEO revisions will appear here.</span>
                  </article>
                )}
              </div>
            </section>
          )}
        </header>

        <main className="content-area">
          {activeModule === 'NewBooking' && (
            <NewBookingView
              bookings={bookings}
              convertTarget={convertTarget}
              createBooking={createBooking}
              key={bookingPrefill ? 'prefilled' : 'blank'}
              onOpenProposal={(bookingId) => {
                setSelectedBookingId(bookingId)
                setProposalViewBookingId(bookingId)
                setActiveModule('Proposals')
              }}
              prefill={bookingPrefill}
              products={products}
              recordSandboxAction={recordSandboxAction}
              setActiveModule={(id) => runGuarded(() => setActiveModule(id))}
            />
          )}

          {activeModule === 'Dashboard' && (
            <DashboardView
              bookings={bookings}
              confirmedRevenue={confirmedRevenue}
              forecastRevenue={forecastRevenue}
              leads={leads}
              overdueFollowUps={overdueFollowUps}
              pipelineRevenue={pipelineRevenue}
              setActiveModule={(id) => runGuarded(() => setActiveModule(id))}
              setSelectedBookingId={setSelectedBookingId}
            />
          )}

          {activeModule === 'Calendar' && (
            <CalendarView
              bookings={filteredBookings}
              onViewBeo={(bookingId) => {
                setActiveModule('BEOs')
                setBeoViewBookingId(bookingId)
              }}
              selectedBookingId={selectedBooking?.id}
              setSelectedBookingId={setSelectedBookingId}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          )}

          {activeModule === 'Leads' && (
            <LeadsView
              account={loginSession}
              initialLeadId={pulledLeadId}
              key={`${leadsNavNonce}-${leadDraftNonce}`}
              leads={leads}
              onConvert={convertLead}
              setLeads={setLeads}
              startDraft={openLeadDraft}
            />
          )}

          {activeModule === 'GroupResume' && (
            <GroupResumeView
              account={loginSession}
              bookings={bookings}
              initialLeadId={pulledLeadId}
              key={leadsNavNonce}
              leads={leads}
              onConvert={convertLead}
              onOpenBooking={(bookingId) => {
                setSelectedBookingId(bookingId)
                setActiveModule('Bookings')
              }}
              onSaveResume={updateBookingGroupResume}
              propertyProfile={propertyProfile}
              setLeads={setLeads}
            />
          )}

          {activeModule === 'CRM' && (
            <CrmView
              bookings={bookings}
              canCreateLead={hasPermission(loginSession.role, 'leads:create')}
              leads={leads}
              onPullIntoLeads={pullAccountIntoLeads}
            />
          )}

          {activeModule === 'Bookings' && (
            <BookingsView
              account={loginSession}
              bookings={filteredBookings}
              closeJob={closeJob}
              onNewBooking={openNewBooking}
              onViewBeo={(bookingId) => {
                setActiveModule('BEOs')
                setBeoViewBookingId(bookingId)
              }}
              reopenJob={reopenJob}
              selectedBookingId={selectedBooking?.id}
              setSelectedBookingId={setSelectedBookingId}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              updateBookingStatus={updateBookingStatus}
            />
          )}

          {activeModule === 'BEOs' &&
            (beoViewBooking ? (
              <BeoView
                acknowledgeDepartment={acknowledgeDepartment}
                appendBeoHistory={appendBeoHistory}
                booking={beoViewBooking}
                departments={departments}
                markBeoRevised={markBeoRevised}
                markClientApproved={markClientApproved}
                onBack={() => setBeoViewBookingId(null)}
                propertyProfile={propertyProfile}
                session={loginSession}
                submitDepartmentInstruction={submitDepartmentInstruction}
              />
            ) : (
              <BeoListView
                bookings={bookings.filter(
                  (booking) => bookingLeadTypeOf(booking) === 'BEO',
                )}
                onSelect={(id) => {
                  setSelectedBookingId(id)
                  setBeoViewBookingId(id)
                }}
              />
            ))}

          {activeModule === 'Proposals' &&
            (proposalViewBooking ? (
              <DocumentsView
                account={loginSession}
                appendDocumentHistory={appendDocumentHistory}
                booking={proposalViewBooking}
                catalog={products}
                documentType="Proposals"
                onBack={() => setProposalViewBookingId(null)}
                onOpenAgreement={() => {
                  setActiveModule('Agreements')
                  setAgreementViewBookingId(proposalViewBooking.id)
                }}
                onOpenBeo={() =>
                  runGuarded(() => {
                    setActiveModule('BEOs')
                    setBeoViewBookingId(proposalViewBooking.id)
                  })
                }
                propertyProfile={propertyProfile}
                registerUnsavedChangesGuard={registerUnsavedChangesGuard}
                runGuarded={runGuarded}
                saveProposalRevision={saveProposalRevision}
                updateBookingLineItems={updateBookingLineItems}
              />
            ) : (
              <DocumentsListView
                bookings={bookings}
                documentType="Proposals"
                onSelect={(id) => {
                  setSelectedBookingId(id)
                  setProposalViewBookingId(id)
                }}
              />
            ))}

          {activeModule === 'Agreements' &&
            (agreementViewBooking ? (
              <AgreementView
                account={loginSession}
                booking={agreementViewBooking}
                key={agreementViewBooking.id}
                onBack={() => setAgreementViewBookingId(null)}
                onCreate={(agreement) => createAgreement(agreementViewBooking.id, agreement)}
                onOpenInvoice={() => {
                  setActiveModule('Invoices')
                  setInvoiceViewBookingId(agreementViewBooking.id)
                }}
                onOpenProposal={() => {
                  setActiveModule('Proposals')
                  setProposalViewBookingId(agreementViewBooking.id)
                }}
                onRemoveSignedFile={() => removeSignedAgreement(agreementViewBooking.id)}
                onSave={(content, note) =>
                  saveAgreementRevision(
                    agreementViewBooking.id,
                    content,
                    loginSession.displayName.trim() || 'Unknown user',
                    note,
                  )
                }
                onSetStatus={(status) => setAgreementStatus(agreementViewBooking.id, status)}
                onUploadSignedFile={(file) => uploadSignedAgreement(agreementViewBooking.id, file)}
                propertyProfile={propertyProfile}
                registerUnsavedChangesGuard={registerUnsavedChangesGuard}
                runGuarded={runGuarded}
              />
            ) : (
              <AgreementsListView
                bookings={bookings}
                onSelect={(id) => {
                  setSelectedBookingId(id)
                  setAgreementViewBookingId(id)
                }}
              />
            ))}

          {activeModule === 'Invoices' &&
            (invoiceViewBooking ? (
              <DocumentsView
                account={loginSession}
                appendDocumentHistory={appendDocumentHistory}
                booking={invoiceViewBooking}
                catalog={products}
                documentType="Invoices"
                onBack={() => setInvoiceViewBookingId(null)}
                onOpenAgreement={() => {
                  setActiveModule('Agreements')
                  setAgreementViewBookingId(invoiceViewBooking.id)
                }}
                onOpenBeo={() =>
                  runGuarded(() => {
                    setActiveModule('BEOs')
                    setBeoViewBookingId(invoiceViewBooking.id)
                  })
                }
                propertyProfile={propertyProfile}
                registerUnsavedChangesGuard={registerUnsavedChangesGuard}
                runGuarded={runGuarded}
                saveProposalRevision={saveProposalRevision}
                updateBookingLineItems={updateBookingLineItems}
              />
            ) : (
              <DocumentsListView
                bookings={bookings}
                documentType="Invoices"
                onSelect={(id) => {
                  setSelectedBookingId(id)
                  setInvoiceViewBookingId(id)
                }}
              />
            ))}

          {activeModule === 'Packages' && (
            <ProductsView
              account={loginSession}
              categories={packageCategories}
              key={packagesNavNonce}
              products={products}
              setProducts={setProducts}
              units={unitOptions}
            />
          )}

          {activeModule === 'Venues' && (
            <VenuesView
              account={loginSession}
              setVenues={setVenues}
              setupStyles={setupStyleOptions}
              venues={venues}
            />
          )}

          {activeModule === 'Tasks' && <TasksView bookings={bookings} />}

          {activeModule === 'Reports' && (
            <ReportsView
              bookings={bookings}
              confirmedRevenue={confirmedRevenue}
              forecastRevenue={forecastRevenue}
              leads={leads}
              pipelineRevenue={pipelineRevenue}
              products={products}
            />
          )}

          {activeModule === 'Settings' && (
            <SettingsView
              account={loginSession}
              beoViewers={beoViewers}
              currentUserId={userId}
              departments={departments}
              packageCategories={packageCategories}
              propertyProfile={propertyProfile}
              rolePermissionOverrides={rolePermissionOverrides}
              setBeoViewers={setBeoViewers}
              setDepartments={setDepartments}
              setPackageCategories={setPackageCategories}
              setPropertyProfile={setPropertyProfile}
              setRolePermissionOverrides={setRolePermissionOverrides}
              setSetupStyleOptions={setSetupStyleOptions}
              setUnitOptions={setUnitOptions}
              setupStyleOptions={setupStyleOptions}
              unitOptions={unitOptions}
              updateAccountEmail={updateAccountEmail}
              updateAccountPassword={updateAccountPassword}
              updateProfileName={updateProfileName}
            />
          )}
        </main>
        {toast && <div className="toast no-print" role="status">{toast}</div>}
      </div>
      {confirmDialog && (
        <Modal
          footer={
            <>
              <button
                className="secondary-action"
                onClick={() => setConfirmDialog(null)}
                type="button"
              >
                Keep editing
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  confirmDialog.onConfirm()
                  setConfirmDialog(null)
                }}
                type="button"
              >
                Discard changes
              </button>
            </>
          }
          onClose={() => setConfirmDialog(null)}
          title="Unsaved changes"
        >
          <p>{confirmDialog.message}</p>
        </Modal>
      )}
    </div>
  )
}

type LoginLang = 'en' | 'th'

const LOGIN_COPY: Record<
  LoginLang,
  {
    promoPrefix: string
    promoSuffix: string
    eyebrow: string
    title: string
    subtitle: string
    roleGroupLabel: string
    email: string
    username: string
    usernamePlaceholder: string
    password: string
    workspaceCode: string
    department: string
    departmentPlaceholder: string
    required: string
    clientPasswordPlaceholder: string
    adminPasswordPlaceholder: string
    staffPasswordPlaceholder: string
    submit: string
    passwordTooShort: (min: number) => string
  }
> = {
  en: {
    promoPrefix: 'Visit',
    promoSuffix: 'and let us be a part of your business solution.',
    eyebrow: 'Secure workspace access',
    title: 'Sign in to EventPilot',
    subtitle:
      'Enter your workspace credentials to access bookings, BEOs, client companies, subscription controls, and admin settings.',
    roleGroupLabel: 'Sign in as',
    email: 'Email address',
    username: 'Username',
    usernamePlaceholder: 'Staff username',
    password: 'Password',
    workspaceCode: 'Workspace code',
    department: 'Department',
    departmentPlaceholder: 'Select your department',
    required: 'Required',
    clientPasswordPlaceholder: 'Client password',
    adminPasswordPlaceholder: 'Admin password',
    staffPasswordPlaceholder: 'Staff password',
    submit: 'Enter EventPilot',
    passwordTooShort: (min) => `Password must be at least ${min} characters.`,
  },
  th: {
    promoPrefix: 'เยี่ยมชม',
    promoSuffix: 'และให้เราเป็นส่วนหนึ่งของโซลูชันธุรกิจของคุณ',
    eyebrow: 'เข้าถึงพื้นที่ทำงานอย่างปลอดภัย',
    title: 'เข้าสู่ระบบ EventPilot',
    subtitle:
      'กรอกข้อมูลรับรองพื้นที่ทำงานของคุณเพื่อเข้าถึงการจอง BEO บริษัทลูกค้า การควบคุมการสมัครสมาชิก และการตั้งค่าผู้ดูแลระบบ',
    roleGroupLabel: 'เข้าสู่ระบบในฐานะ',
    email: 'อีเมล',
    username: 'ชื่อผู้ใช้',
    usernamePlaceholder: 'ชื่อผู้ใช้พนักงาน',
    password: 'รหัสผ่าน',
    workspaceCode: 'รหัสพื้นที่ทำงาน',
    department: 'แผนก',
    departmentPlaceholder: 'เลือกแผนกของคุณ',
    required: 'จำเป็น',
    clientPasswordPlaceholder: 'รหัสผ่านลูกค้า',
    adminPasswordPlaceholder: 'รหัสผ่านผู้ดูแล',
    staffPasswordPlaceholder: 'รหัสผ่านพนักงาน',
    submit: 'เข้าสู่ EventPilot',
    passwordTooShort: (min) => `รหัสผ่านต้องมีอย่างน้อย ${min} ตัวอักษร`,
  },
}

/** Customer sign-in. The vendor console has its own ConsoleLoginView. */
function LoginView({
  onSubmit,
}: {
  onSubmit: (
    role: AuthRole,
    identifier: string,
    password: string,
    workspaceCode: string,
    department?: BeoDepartment,
  ) => Promise<string | null>
}) {
  const [role, setRole] = useState<AuthRole>('top_management')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceCode, setWorkspaceCode] = useState('')
  const [department, setDepartment] = useState<BeoDepartment | ''>('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lang, setLang] = useState<LoginLang>('en')
  const t = LOGIN_COPY[lang]
  const isStaff = role === 'staff'
  const isDepartment = role === 'beo_viewer'
  // Staff and department viewers both sign in with a workspace code + username.
  const usesWorkspace = isStaff || isDepartment
  const minPasswordLength = 8
  const passwordReady = password.length >= minPasswordLength
  const identifierReady = usesWorkspace
    ? username.trim() && workspaceCode.trim() && (!isDepartment || department)
    : email.includes('@')
  const loginReady = Boolean(identifierReady) && passwordReady && !submitting

  // Switching tabs clears entered credentials so one tab's input never leaks
  // into another's sign-in attempt.
  const selectRole = (next: AuthRole) => {
    setRole(next)
    setEmail('')
    setUsername('')
    setPassword('')
    setWorkspaceCode('')
    setDepartment('')
    setError('')
  }

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!passwordReady) {
      setError(t.passwordTooShort(minPasswordLength))
      return
    }

    setError('')
    setSubmitting(true)
    const failure = await onSubmit(
      role,
      usesWorkspace ? username : email,
      password,
      workspaceCode,
      isDepartment && department ? department : undefined,
    )
    setSubmitting(false)
    if (failure) {
      setError(failure)
      return
    }
  }

  return (
    <main className="login-shell">
      <section className="login-brand-stage">
        <div className="login-logo-card">
          <img
            alt="EventPilot - YOUR BEO NAVIGATOR"
            src="/brand/eventpilot-command-mark-final.svg"
          />
        </div>
        <p className="login-promo">
          {t.promoPrefix}{' '}
          <a href="https://nnr-solutions.com" target="_blank" rel="noreferrer">
            nnr-solutions.com
          </a>{' '}
          {t.promoSuffix}
        </p>
      </section>

      <section className="login-panel">
        <div className="login-lang-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={lang === 'en' ? 'is-active' : ''}
            onClick={() => setLang('en')}
          >
            EN
          </button>
          <button
            type="button"
            className={lang === 'th' ? 'is-active' : ''}
            onClick={() => setLang('th')}
          >
            ไทย
          </button>
        </div>

        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>

        <div className="login-role-tabs" role="tablist" aria-label={t.roleGroupLabel}>
          {LOGIN_ROLES.map((r) => (
            <button
              aria-selected={role === r}
              className={role === r ? 'is-active' : ''}
              key={r}
              onClick={() => selectRole(r)}
              role="tab"
              type="button"
            >
              {ROLE_LABELS[r][lang]}
            </button>
          ))}
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          {usesWorkspace ? (
            <>
              <FormField label={t.workspaceCode} requiredLabel={t.required} required>
                <input
                  autoCapitalize="none"
                  autoComplete="organization"
                  onChange={(event) => setWorkspaceCode(event.target.value)}
                  required
                  value={workspaceCode}
                />
              </FormField>
              <FormField label={t.username} requiredLabel={t.required} required>
                <input
                  autoCapitalize="none"
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={t.usernamePlaceholder}
                  required
                  value={username}
                />
              </FormField>
              {isDepartment && (
                <FormField label={t.department} requiredLabel={t.required} required>
                  <select
                    onChange={(event) => setDepartment(event.target.value as BeoDepartment | '')}
                    required
                    value={department}
                  >
                    <option value="">{t.departmentPlaceholder}</option>
                    {BEO_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
            </>
          ) : (
            <FormField label={t.email} requiredLabel={t.required} required>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </FormField>
          )}
          <FormField label={t.password} requiredLabel={t.required} required>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                usesWorkspace ? t.staffPasswordPlaceholder : t.clientPasswordPlaceholder
              }
              required
              type="password"
              value={password}
            />
          </FormField>

          {error && <p className="login-error">{error}</p>}

          <button className="primary-action login-submit" disabled={!loginReady} type="submit">
            <ShieldCheck size={17} />
            {t.submit}
          </button>
        </form>
      </section>
    </main>
  )
}

/**
 * Vendor console sign-in. Username + password against eventpilot_console_admins
 * — deliberately not an email/password Supabase login, so this screen shares no
 * credentials or session with the customer app.
 */
function ConsoleLoginView({
  onSubmit,
}: {
  onSubmit: (username: string, password: string) => Promise<string | null>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const ready = username.trim().length > 0 && password.length > 0 && !submitting

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const failure = await onSubmit(username, password)
    setSubmitting(false)
    if (failure) setError(failure)
  }

  return (
    <main className="login-shell">
      <section className="login-brand-stage">
        <div className="login-logo-card">
          <img
            alt="EventPilot - YOUR BEO NAVIGATOR"
            src="/brand/eventpilot-command-mark-final.svg"
          />
        </div>
        <p className="login-promo">
          NNR-Solutions staff only. Client sign-in is at{' '}
          <a href="/#Dashboard">the client app</a>.
        </p>
      </section>

      <section className="login-panel">
        <div>
          <p className="eyebrow">EventPilot operator access</p>
          <h1>Vendor console</h1>
          <p>
            Sign in with your console credentials to manage client companies,
            plans, and operator accounts.
          </p>
        </div>

        {!isSupabaseEnabled && (
          <p className="admin-notice">
            Offline sandbox — Supabase is not configured, so any credentials are
            accepted and nothing is saved to a backend.
          </p>
        )}

        <form className="login-form" onSubmit={submit}>
          <FormField label="Console username" requiredLabel="Required" required>
            <input
              autoCapitalize="none"
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </FormField>
          <FormField label="Console password" requiredLabel="Required" required>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </FormField>

          {error && <p className="login-error">{error}</p>}

          <button className="primary-action login-submit" disabled={!ready} type="submit">
            <ShieldCheck size={17} />
            Enter console
          </button>
        </form>
      </section>
    </main>
  )
}

function AdminPortal({
  adminCredentialSettings,
  adminPlans,
  clientCompanies,
  clientsError,
  clientsReady,
  consoleSession,
  expansionPacks,
  handleLogout,
  setAdminCredentialSettings,
  setAdminPlans,
  setClientCompanies,
  setExpansionPacks,
}: {
  adminCredentialSettings: AdminCredentialSettings
  adminPlans: SaaSPlan[]
  clientCompanies: ClientCompany[]
  clientsError: string
  clientsReady: boolean
  consoleSession: ConsoleSession
  expansionPacks: ExpansionPack[]
  handleLogout: () => void
  setAdminCredentialSettings: (
    next:
      | AdminCredentialSettings
      | ((current: AdminCredentialSettings) => AdminCredentialSettings),
  ) => void
  setAdminPlans: (next: SaaSPlan[] | ((current: SaaSPlan[]) => SaaSPlan[])) => void
  setClientCompanies: (
    next: ClientCompany[] | ((current: ClientCompany[]) => ClientCompany[]),
  ) => void
  setExpansionPacks: (
    next: ExpansionPack[] | ((current: ExpansionPack[]) => ExpansionPack[]),
  ) => void
}) {
  return (
    <div className="admin-portal-shell">
      <header className="admin-portal-header">
        <div className="brand-block">
          <div className="brand-mark">
            <img alt="" src="/brand/eventpilot-command-icon.svg" />
          </div>
          <div>
            <strong>EventPilot Admin</strong>
            <span>SaaS owner console</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="admin-portal-operator">
            {consoleSession.name}
            {consoleSession.sandbox ? ' · sandbox' : ''}
          </span>
          <a className="secondary-action" href="/#Dashboard">
            Open client app
          </a>
          <button className="secondary-action" onClick={handleLogout} type="button">
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-portal-content">
        <AdminConsoleView
          adminCredentialSettings={adminCredentialSettings}
          adminPlans={adminPlans}
          clientCompanies={clientCompanies}
          clientsError={clientsError}
          clientsReady={clientsReady}
          expansionPacks={expansionPacks}
          setAdminCredentialSettings={setAdminCredentialSettings}
          setAdminPlans={setAdminPlans}
          setClientCompanies={setClientCompanies}
          setExpansionPacks={setExpansionPacks}
        />
      </main>
    </div>
  )
}

function NewBookingView({
  bookings,
  convertTarget = 'booking',
  createBooking,
  onOpenProposal,
  prefill,
  products,
  recordSandboxAction,
  setActiveModule,
}: {
  bookings: EventBooking[]
  convertTarget?: 'booking' | 'proposal'
  createBooking: (booking: EventBooking) => void
  onOpenProposal?: (bookingId: string) => void
  prefill?: NewBookingFormState | null
  products: Product[]
  recordSandboxAction: (title: string, detail: string) => void
  setActiveModule: (module: ModuleId) => void
}) {
  const [form, setForm] = useState<NewBookingFormState>(() => prefill ?? getNewBookingDefaults())
  const [formNotice, setFormNotice] = useState('')
  const updateField = <K extends keyof NewBookingFormState>(
    field: K,
    value: NewBookingFormState[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
  }
  const selectedAccount = accounts.find((account) => account.name === form.account)
  const selectedVenue = initialVenues.find((venue) => venue.name === form.venue)
  // The Package / product field references the whole catalogue; picking a
  // fixed-price wedding package also seeds the forecast revenue.
  const packageOptions = products.map((product) => product.name)
  const selectPackage = (value: string) => {
    const match = products.find((product) => product.name === value)
    setForm((current) => ({
      ...current,
      packageName: value,
      forecastRevenue:
        match && match.category === 'Package' && match.price != null && !current.forecastRevenue
          ? String(match.price)
          : current.forecastRevenue,
    }))
  }
  const expectedGuests = Number(form.expectedGuests) || 0
  const guaranteedGuests = Number(form.guaranteedGuests) || expectedGuests
  const forecastRevenue = Number(form.forecastRevenue) || 0
  const depositDue = Number(form.depositDue) || 0
  const probability = statusProbability(form.status)
  const paymentStatus: PaymentStatus =
    form.status === 'Confirmed' ? 'Deposit due' : 'Unpaid'
  const contractStatus = form.status === 'Confirmed' ? 'Signed' : 'Not started'
  const capacityWarning =
    selectedVenue?.capacity && expectedGuests > selectedVenue.capacity
      ? `${selectedVenue.name} public capacity is ${selectedVenue.capacity}; this booking has ${expectedGuests} expected guests.`
      : ''
  const conflictBookings = bookings.filter(
    (booking) =>
      booking.date === form.date &&
      booking.venue.toLowerCase() === form.venue.trim().toLowerCase() &&
      booking.room.toLowerCase() === form.room.trim().toLowerCase() &&
      booking.status !== 'Cancelled' &&
      booking.status !== 'Lost' &&
      bookingTimesOverlap(booking.startTime, booking.endTime, form.startTime, form.endTime),
  )
  const guaranteeWarning =
    guaranteedGuests > expectedGuests
      ? 'Guaranteed guests cannot be higher than expected guests.'
      : ''

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (guaranteeWarning) {
      setFormNotice(guaranteeWarning)
      return
    }

    if (conflictBookings.length) {
      const conflictNames = conflictBookings.map((booking) => booking.eventName).join(', ')
      setFormNotice(
        `Potential room conflict with ${conflictNames}. This sandbox blocks double-booking the same room/time.`,
      )
      return
    }

    const timestamp = Date.now()
    // Random suffix so two bookings created within the same 100,000ms window can't
    // collide on id / beoNumber (which would produce duplicate React keys).
    const id = `BKG-${String(timestamp).slice(-5)}${Math.random().toString(36).slice(2, 5)}`
    const booking: EventBooking = {
      id,
      leadType: form.leadType,
      eventName: form.eventName.trim(),
      eventType: form.eventType.trim(),
      account: form.account.trim(),
      contact: form.contact.trim(),
      owner: form.owner.trim(),
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      setupTime: form.setupTime,
      breakdownTime: form.breakdownTime,
      venue: form.venue.trim(),
      room: form.room.trim(),
      expectedGuests,
      guaranteedGuests,
      actualGuests: null,
      status: form.status,
      paymentStatus,
      contractStatus,
      revenue:
        form.status === 'Confirmed' || form.status === 'Completed'
          ? forecastRevenue
          : 0,
      forecastRevenue,
      probability,
      holdExpiry: form.holdExpiry || null,
      nextAction: form.nextAction.trim(),
      leadSource: form.leadSource.trim(),
      layout: form.layout.trim(),
      packageName: form.packageName.trim(),
      // Each food/operations field maps onto one of the BEO's existing tag-list
      // sections; the category prefix keeps that mapping visible on the
      // printed document instead of collapsing into one undifferentiated list.
      menu: [
        ...splitList(form.appetizer).map((item) => `Appetizer: ${item}`),
        ...splitList(form.soup).map((item) => `Soup: ${item}`),
        ...splitList(form.mainCourse).map((item) => `Main course: ${item}`),
        ...splitList(form.dessert).map((item) => `Dessert: ${item}`),
        ...splitList(form.beverage).map((item) => `Beverage: ${item}`),
        ...splitList(form.dietaryNotes).map((item) => `Dietary/allergy: ${item}`),
      ],
      av: splitList(form.av),
      staffing: splitList(form.staffing),
      vendors: splitList(form.vendors),
      specialRequests: [
        ...splitList(form.housekeeping).map((item) => `Housekeeping/decoration: ${item}`),
        ...splitList(form.frontOffice).map((item) => `Front office: ${item}`),
        ...splitList(form.specialRequests),
      ],
      billingCompany: form.billingCompany.trim(),
      billingCompanyName: form.billingCompanyName.trim(),
      billingAddress: form.billingAddress.trim(),
      billingTaxId: form.billingTaxId.trim(),
      paymentMethod: form.paymentMethod.trim(),
      // HR gets its own department section on the BEO rather than being
      // folded into the shared special-instructions list.
      ...(form.hr.trim() ? { departmentInstructions: { HR: form.hr.trim() } } : {}),
      internalNotes: form.internalNotes.trim(),
      clientNotes: form.clientNotes.trim(),
      beoNumber: `BEO-DRAFT-${id.replace('BKG-', '')}`,
      revision: 0,
      depositDue,
    }

    createBooking(booking)
    recordSandboxAction(
      'Workflow started',
      `${booking.eventName} generated calendar, BEO, proposal, and invoice records locally.`,
    )
    // Converting "to a proposal" means: create the booking, then open its proposal.
    if (convertTarget === 'proposal') onOpenProposal?.(booking.id)
  }

  return (
    <form className="new-booking-form" onSubmit={handleSubmit}>
      <section className="panel form-intro">
        <div>
          <p className="eyebrow">Booking intake</p>
          <h2>Required information for a new booking</h2>
          <p>
            {prefill
              ? convertTarget === 'proposal'
                ? 'Details from the lead are filled in below. Complete the rest and save to create the booking and open its proposal.'
                : 'Details from the lead are filled in below. Complete the rest and save to create the booking.'
              : 'Capture enough detail to place the event on the calendar, qualify the sales stage, prepare a proposal, and start the BEO draft.'}
          </p>
        </div>
        <div className="form-readiness-card">
          <strong>{probability}%</strong>
          <span>{form.status} probability</span>
        </div>
      </section>

      <section className="form-layout">
        <div className="form-stack">
          <fieldset className="panel form-section">
            <legend>Client and event</legend>
            <div className="form-grid">
              <FormField label="Document track">
                <select
                  onChange={(event) => updateField('leadType', event.target.value as LeadType)}
                  value={form.leadType}
                >
                  {LEAD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'BEO' ? 'BEO (single function)' : 'Group Resume (multi-day group)'}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Event name" required>
                <input
                  onChange={(event) => updateField('eventName', event.target.value)}
                  placeholder="e.g. Chiang Mai Medical Symposium"
                  required
                  value={form.eventName}
                />
              </FormField>
              <FormField label="Event type" required>
                <input
                  onChange={(event) => updateField('eventType', event.target.value)}
                  placeholder="Wedding, seminar, dinner..."
                  required
                  value={form.eventType}
                />
              </FormField>
              <FormField label="Client / account" required>
                <input
                  list="account-options"
                  onChange={(event) => updateField('account', event.target.value)}
                  placeholder="Company, family, or group"
                  required
                  value={form.account}
                />
                <datalist id="account-options">
                  {accounts.map((account) => (
                    <option key={account.id} value={account.name} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Contact person" required>
                <input
                  onChange={(event) => updateField('contact', event.target.value)}
                  placeholder={selectedAccount?.contact ?? 'Primary client contact'}
                  required
                  value={form.contact}
                />
              </FormField>
              <FormField label="Owner" required>
                <input
                  onChange={(event) => updateField('owner', event.target.value)}
                  required
                  value={form.owner}
                />
              </FormField>
              <FormField label="Lead source">
                <input
                  onChange={(event) => updateField('leadSource', event.target.value)}
                  value={form.leadSource}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Date, time, and space</legend>
            <div className="form-grid">
              <FormField label="Event date" required>
                <input
                  onChange={(event) => updateField('date', event.target.value)}
                  required
                  type="date"
                  value={form.date}
                />
              </FormField>
              <FormField label="Start time" required>
                <input
                  onChange={(event) => updateField('startTime', event.target.value)}
                  required
                  type="time"
                  value={form.startTime}
                />
              </FormField>
              <FormField label="End time" required>
                <input
                  onChange={(event) => updateField('endTime', event.target.value)}
                  required
                  type="time"
                  value={form.endTime}
                />
              </FormField>
              <FormField label="Setup access" required>
                <input
                  onChange={(event) => updateField('setupTime', event.target.value)}
                  required
                  type="time"
                  value={form.setupTime}
                />
              </FormField>
              <FormField label="Teardown time">
                <input
                  onChange={(event) => updateField('breakdownTime', event.target.value)}
                  type="time"
                  value={form.breakdownTime}
                />
              </FormField>
              <FormField label="Venue" required>
                <input
                  list="venue-options"
                  onChange={(event) => updateField('venue', event.target.value)}
                  required
                  value={form.venue}
                />
                <datalist id="venue-options">
                  {initialVenues.map((venue) => (
                    <option key={venue.id} value={venue.name} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Room / area" required>
                <input
                  onChange={(event) => updateField('room', event.target.value)}
                  placeholder={selectedVenue?.setupStyles[0] ?? 'Function room'}
                  required
                  value={form.room}
                />
              </FormField>
              <FormField label="Layout / seating" required>
                <input
                  onChange={(event) => updateField('layout', event.target.value)}
                  placeholder="Banquet, classroom, boardroom..."
                  required
                  value={form.layout}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Commercial status</legend>
            <div className="form-grid">
              <FormField label="Expected guests" required>
                <input
                  min="1"
                  onChange={(event) => updateField('expectedGuests', event.target.value)}
                  required
                  type="number"
                  value={form.expectedGuests}
                />
              </FormField>
              <FormField label="Guaranteed guests">
                <input
                  min="0"
                  onChange={(event) => updateField('guaranteedGuests', event.target.value)}
                  placeholder="Defaults to expected"
                  type="number"
                  value={form.guaranteedGuests}
                />
              </FormField>
              <FormField label="Booking status">
                <select
                  onChange={(event) =>
                    updateField('status', event.target.value as BookingStatus)
                  }
                  value={form.status}
                >
                  {statusOrder.slice(0, 4).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Hold expiry">
                <input
                  onChange={(event) => updateField('holdExpiry', event.target.value)}
                  type="date"
                  value={form.holdExpiry}
                />
              </FormField>
              <FormField label="Package / product" required>
                <input
                  list="package-options"
                  onChange={(event) => selectPackage(event.target.value)}
                  required
                  value={form.packageName}
                />
                <datalist id="package-options">
                  {packageOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </FormField>
              <FormField label="Forecast revenue" required>
                <input
                  min="0"
                  onChange={(event) => updateField('forecastRevenue', event.target.value)}
                  placeholder="THB"
                  required
                  type="number"
                  value={form.forecastRevenue}
                />
              </FormField>
              <FormField label="Deposit due">
                <input
                  min="0"
                  onChange={(event) => updateField('depositDue', event.target.value)}
                  placeholder="THB"
                  type="number"
                  value={form.depositDue}
                />
              </FormField>
              <FormField label="Next action" required>
                <input
                  onChange={(event) => updateField('nextAction', event.target.value)}
                  required
                  value={form.nextAction}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Food &amp; beverage</legend>
            <p className="panel-header-detail">
              One field per course — each becomes a labeled item in the BEO's Food and
              beverage list, so the kitchen sees which course it belongs to.
            </p>
            <div className="form-grid form-grid-textareas">
              <FormField label="Appetizer">
                <textarea
                  onChange={(event) => updateField('appetizer', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.appetizer}
                />
              </FormField>
              <FormField label="Soup">
                <textarea
                  onChange={(event) => updateField('soup', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.soup}
                />
              </FormField>
              <FormField label="Main course">
                <textarea
                  onChange={(event) => updateField('mainCourse', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.mainCourse}
                />
              </FormField>
              <FormField label="Dessert">
                <textarea
                  onChange={(event) => updateField('dessert', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.dessert}
                />
              </FormField>
              <FormField label="Beverage">
                <textarea
                  onChange={(event) => updateField('beverage', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.beverage}
                />
              </FormField>
              <FormField
                hint="Also merged into the Food and beverage list, tagged so the kitchen can flag it."
                label="Food allergy / dietary notes"
              >
                <textarea
                  onChange={(event) => updateField('dietaryNotes', event.target.value)}
                  placeholder="No pork, nut allergy at table 4, vegetarian x12..."
                  value={form.dietaryNotes}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Operations &amp; departments</legend>
            <p className="panel-header-detail">
              One field per department. Housekeeping/decoration and Front office feed the
              BEO's Special instructions list; the rest feed their own named section.
            </p>
            <div className="form-grid form-grid-textareas">
              <FormField label="Housekeeping / decoration">
                <textarea
                  onChange={(event) => updateField('housekeeping', event.target.value)}
                  placeholder="Fresh floral centerpieces, linen color, staging..."
                  value={form.housekeeping}
                />
              </FormField>
              <FormField label="Audio visual / engineer">
                <textarea
                  onChange={(event) => updateField('av', event.target.value)}
                  placeholder="Microphones, screen, lighting, technician..."
                  value={form.av}
                />
              </FormField>
              <FormField hint="Banquet captain, servers, FB/BQ execution notes." label="Staffing / FB-BQ">
                <textarea
                  onChange={(event) => updateField('staffing', event.target.value)}
                  placeholder="Banquet captain, servers, AV tech..."
                  value={form.staffing}
                />
              </FormField>
              <FormField label="Front office">
                <textarea
                  onChange={(event) => updateField('frontOffice', event.target.value)}
                  placeholder="VIP check-in, registration desk, guest list handling..."
                  value={form.frontOffice}
                />
              </FormField>
              <FormField label="External vendors">
                <textarea
                  onChange={(event) => updateField('vendors', event.target.value)}
                  placeholder="Florist, decorator, production company..."
                  value={form.vendors}
                />
              </FormField>
              <FormField hint="Casual crew, overtime approval, uniform and grooming notes." label="HR">
                <textarea
                  onChange={(event) => updateField('hr', event.target.value)}
                  placeholder="Extra casual staff x6, overtime approved, name badges..."
                  value={form.hr}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Billing instructions</legend>
            <div className="form-grid">
              <FormField hint="e.g. Master Account, direct bill to client, third-party sponsor." label="Billing to company">
                <input
                  onChange={(event) => updateField('billingCompany', event.target.value)}
                  placeholder="Master Account"
                  value={form.billingCompany}
                />
              </FormField>
              <FormField hint="e.g. credit card on file, bank transfer, cash on departure." label="Payment method">
                <input
                  onChange={(event) => updateField('paymentMethod', event.target.value)}
                  placeholder="Bank transfer"
                  value={form.paymentMethod}
                />
              </FormField>
              <FormField hint="Legal entity name as it must appear on the tax invoice." label="Company name">
                <input
                  onChange={(event) => updateField('billingCompanyName', event.target.value)}
                  placeholder="Stream Events Asia Co., Ltd."
                  value={form.billingCompanyName}
                />
              </FormField>
              <FormField hint="13-digit taxpayer identification number." label="TAX ID">
                <input
                  onChange={(event) => updateField('billingTaxId', event.target.value)}
                  placeholder="0105558000000"
                  value={form.billingTaxId}
                />
              </FormField>
              <FormField asGroup label="Address">
                <textarea
                  onChange={(event) => updateField('billingAddress', event.target.value)}
                  placeholder="Registered address for the tax invoice..."
                  value={form.billingAddress}
                />
              </FormField>
            </div>
          </fieldset>

          <fieldset className="panel form-section">
            <legend>Special instructions &amp; notes</legend>
            <div className="form-grid form-grid-textareas">
              <FormField label="Special client instructions">
                <textarea
                  onChange={(event) => updateField('specialRequests', event.target.value)}
                  placeholder="VIP handling, access notes..."
                  value={form.specialRequests}
                />
              </FormField>
              <FormField label="Client notes">
                <textarea
                  onChange={(event) => updateField('clientNotes', event.target.value)}
                  value={form.clientNotes}
                />
              </FormField>
              <FormField label="Internal notes">
                <textarea
                  onChange={(event) => updateField('internalNotes', event.target.value)}
                  value={form.internalNotes}
                />
              </FormField>
            </div>
          </fieldset>
        </div>

        <aside className="panel intake-summary">
          <p className="eyebrow">What this creates</p>
          <h2>Local booking draft</h2>
          <div className="intake-summary-grid">
            <Detail label="Calendar" value={`${form.date} ${form.startTime}-${form.endTime}`} />
            <Detail label="Space" value={`${form.venue}, ${form.room}`} />
            <Detail label="Guests" value={`${expectedGuests} expected / ${guaranteedGuests} guaranteed`} />
            <Detail label="BEO" value="Draft Rev 0" />
            <Detail label="Proposal" value={form.packageName || 'Package required'} />
            <Detail label="Invoice" value={`${money(depositDue)} deposit due`} />
          </div>
          <div className="drawer-section">
            <h3>Required before saving</h3>
            <ul>
              <li>Event name, type, client, and contact</li>
              <li>Date, time, venue, room, and layout</li>
              <li>Expected guests, package, revenue, and next action</li>
            </ul>
          </div>
          {(capacityWarning || conflictBookings.length > 0 || formNotice) && (
            <div className="validation-panel">
              <TriangleAlert size={17} />
              <div>
                <strong>Operations check</strong>
                <span>
                  {formNotice ||
                    capacityWarning ||
                    `Potential conflict with ${conflictBookings[0]?.eventName}.`}
                </span>
              </div>
            </div>
          )}
          <div className="status-actions">
            <button
              className="secondary-action"
              onClick={() => setActiveModule('Dashboard')}
              type="button"
            >
              <ChevronLeft size={17} />
              Cancel
            </button>
            <button className="primary-action" type="submit">
              <Plus size={17} />
              Create booking
            </button>
          </div>
        </aside>
      </section>
    </form>
  )
}

function FormField({
  asGroup,
  children,
  hint,
  label,
  required,
  requiredLabel = 'Required',
}: {
  /**
   * Render a div instead of a label. Use for composite controls (buttons, a
   * pop-up menu) where a label would forward stray clicks to the first input.
   */
  asGroup?: boolean
  children: React.ReactNode
  hint?: string
  label: string
  required?: boolean
  requiredLabel?: string
}) {
  const Wrapper = asGroup ? 'div' : 'label'
  return (
    <Wrapper className="form-field">
      <span>
        {label}
        {required && <em>{requiredLabel}</em>}
      </span>
      {children}
      {hint && <small className="form-field-hint">{hint}</small>}
    </Wrapper>
  )
}

function DashboardView({
  bookings,
  confirmedRevenue,
  forecastRevenue,
  leads,
  overdueFollowUps,
  pipelineRevenue,
  setActiveModule,
  setSelectedBookingId,
}: {
  bookings: EventBooking[]
  confirmedRevenue: number
  forecastRevenue: number
  leads: Lead[]
  overdueFollowUps: number
  pipelineRevenue: number
  setActiveModule: (module: ModuleId) => void
  setSelectedBookingId: (id: string) => void
}) {
  const todayKey = toDateKey(new Date())
  const todayBookings = bookings.filter((booking) => booking.date === todayKey)
  // Today and future events, soonest first, excluding closed-out deals — so the
  // panel reflects what is actually coming up rather than an arbitrary slice.
  const upcomingBookings = bookings
    .filter(
      (booking) =>
        booking.date >= todayKey &&
        booking.status !== 'Lost' &&
        booking.status !== 'Cancelled',
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  // Fall back to the most recent events when nothing upcoming remains, so the
  // panel is never empty on stale demo data.
  const eventFeed = (upcomingBookings.length ? upcomingBookings : [...bookings].sort((a, b) => b.date.localeCompare(a.date))).slice(0, 5)
  const tentativeHolds = bookings.filter((booking) => booking.status === 'Tentative')
  const unpaidInvoices = bookings.filter((booking) =>
    ['Unpaid', 'Deposit due', 'Partial'].includes(booking.paymentStatus),
  )
  const openLeads = leads.filter((lead) => lead.stage !== 'Won' && lead.stage !== 'Lost')
  // Step 6 of the sales flow: past events nobody has closed out. This is the
  // reminder — the closeout form itself lives on the booking.
  const jobsToClose = openJobsToClose(bookings)

  const weekAheadKey = toDateKey(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 7),
  )
  const nearTermBookings = bookings.filter(
    (booking) =>
      booking.date >= todayKey &&
      booking.date <= weekAheadKey &&
      booking.status !== 'Lost' &&
      booking.status !== 'Cancelled',
  )
  const kitchenItems = nearTermBookings
    .filter((booking) => booking.menu.length === 0 || booking.guaranteedGuests === 0)
    .map((booking) => `Final count/menu needed for ${booking.eventName} (${booking.beoNumber})`)
    .slice(0, 4)
  const banquetOpsItems = nearTermBookings
    .filter((booking) => booking.av.length === 0 || !booking.layout || !booking.setupTime)
    .map((booking) => `Setup/AV pending for ${booking.eventName} (${booking.room})`)
    .slice(0, 4)
  const financeItems = nearTermBookings
    .filter(
      (booking) =>
        booking.depositDue > 0 &&
        (booking.paymentStatus === 'Unpaid' || booking.paymentStatus === 'Deposit due'),
    )
    .map(
      (booking) =>
        `${booking.paymentStatus}: ${booking.eventName} (${money(booking.depositDue)})`,
    )
    .slice(0, 4)

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard
          icon={CalendarDays}
          label="Today events"
          value={todayBookings.length.toString()}
          detail="Confirmed operations today"
        />
        <MetricCard
          icon={BadgeDollarSign}
          label="Confirmed revenue"
          value={money(confirmedRevenue)}
          detail={`${money(forecastRevenue)} forecasted`}
        />
        <MetricCard
          icon={Clock3}
          label="Tentative holds"
          value={tentativeHolds.length.toString()}
          detail="Require expiry follow-up"
        />
        <MetricCard
          icon={TriangleAlert}
          label="Needs attention"
          value={(overdueFollowUps + unpaidInvoices.length + jobsToClose.length).toString()}
          detail="Follow-ups, payments, and jobs to close"
        />
      </section>

      {jobsToClose.length > 0 && (
        <section className="panel">
          <PanelHeader
            detail="These events have finished. Close each one to record the final guest count and revenue."
            title={`Jobs to close (${jobsToClose.length})`}
          />
          <div className="banner-list">
            {jobsToClose.slice(0, 6).map((booking) => (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => {
                  setSelectedBookingId(booking.id)
                  setActiveModule('Bookings')
                }}
                type="button"
              >
                <span className="banner-status">{booking.status}</span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {booking.account} · finished {booking.date}
                  </span>
                </div>
                <span className="banner-meta">{booking.venue}</span>
                <strong className="banner-value">{money(booking.forecastRevenue)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {jobsToClose.length > 6 && (
              <p>{jobsToClose.length - 6} more waiting to be closed.</p>
            )}
          </div>
        </section>
      )}

      <section className="split-layout">
        <div className="panel wide-panel">
          <PanelHeader
            action="Open calendar"
            onAction={() => setActiveModule('Calendar')}
            title="Today and upcoming operations"
          />
          <div className="event-list">
            {eventFeed.map((booking) => (
              <button
                className="event-row"
                key={booking.id}
                onClick={() => {
                  setSelectedBookingId(booking.id)
                  setActiveModule('Bookings')
                }}
                type="button"
              >
                <div className="date-tile">
                  <strong>{shortDate(booking.date).split(' ')[1]}</strong>
                  <span>{shortDate(booking.date).split(' ')[0]}</span>
                </div>
                <div className="event-main">
                  <div>
                    <strong>{booking.eventName}</strong>
                    <span>
                      {booking.startTime}-{booking.endTime} | {booking.room}
                    </span>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </div>

        <div className="panel pipeline-panel">
          <PanelHeader title="Pipeline forecast" />
          <div className="forecast-card">
            <CircleDollarSign size={28} />
            <strong>{money(pipelineRevenue)}</strong>
            <span>Open lead value</span>
          </div>
          <div className="stage-list">
            {openLeads.map((lead) => (
              <div className="stage-item" key={lead.id}>
                <div>
                  <strong>{lead.name}</strong>
                  <span>{lead.stage}</span>
                </div>
                <em>{LEAD_STAGE_PROBABILITY[lead.stage]}%</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="triple-grid">
        <OperationalPanel
          icon={Utensils}
          items={kitchenItems.length ? kitchenItems : ['No kitchen items due this week']}
          title="Kitchen"
        />
        <OperationalPanel
          icon={Building2}
          items={banquetOpsItems.length ? banquetOpsItems : ['No setup/AV items due this week']}
          title="Banquet operations"
        />
        <OperationalPanel
          icon={ReceiptText}
          items={financeItems.length ? financeItems : ['No outstanding deposits this week']}
          title="Finance"
        />
      </section>
    </div>
  )
}

function CalendarView({
  bookings,
  onViewBeo,
  selectedBookingId,
  setSelectedBookingId,
  setStatusFilter,
  statusFilter,
}: {
  bookings: EventBooking[]
  onViewBeo: (bookingId: string) => void
  selectedBookingId?: string
  setSelectedBookingId: (id: string) => void
  setStatusFilter: (status: BookingStatus | 'All') => void
  statusFilter: BookingStatus | 'All'
}) {
  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) ?? bookings[0]
  const [visibleMonth, setVisibleMonth] = useState(() =>
    toMonthKey(toLocalDate(selectedBooking?.date ?? toDateKey(new Date()))),
  )
  const monthStart = monthKeyToDate(visibleMonth)
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7))

  const todayKey = toDateKey(new Date())
  const visibleMonthNumber = monthStart.getMonth()
  const monthTitle = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(monthStart)
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart)
    date.setDate(calendarStart.getDate() + index)
    return date
  })
  const bookingsByDate = bookings.reduce<Record<string, EventBooking[]>>(
    (groupedBookings, booking) => {
      groupedBookings[booking.date] = groupedBookings[booking.date] ?? []
      groupedBookings[booking.date].push(booking)
      return groupedBookings
    },
    {},
  )

  const visibleYear = monthStart.getFullYear()
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(2000, index, 1)),
  )
  const bookingYears = bookings.map((booking) => Number(booking.date.slice(0, 4)))
  const yearBounds = [...bookingYears, visibleYear, new Date().getFullYear()]
  const minYear = Math.min(...yearBounds) - 1
  const maxYear = Math.max(...yearBounds) + 2
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index)
  const jumpToMonth = (year: number, monthIndex: number) => {
    setVisibleMonth(toMonthKey(new Date(year, monthIndex, 1)))
  }

  return (
    <div className="page-stack">
      <FilterBar setStatusFilter={setStatusFilter} statusFilter={statusFilter} />

      <section className="calendar-shell">
        <div className="calendar-header">
          <div>
            <p className="eyebrow">Month view</p>
            <h2>{monthTitle}</h2>
          </div>
          <div className="calendar-controls">
            <button
              className="icon-button"
              onClick={() => setVisibleMonth((current) => offsetMonth(current, -1))}
              title="Previous month"
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="secondary-action"
              onClick={() => setVisibleMonth(toMonthKey(new Date()))}
              type="button"
            >
              Today
            </button>
            <button
              className="icon-button"
              onClick={() => setVisibleMonth((current) => offsetMonth(current, 1))}
              title="Next month"
              type="button"
            >
              <ChevronRight size={18} />
            </button>
            <div className="calendar-jump">
              <select
                aria-label="Jump to month"
                onChange={(event) => jumpToMonth(visibleYear, Number(event.target.value))}
                value={visibleMonthNumber}
              >
                {monthNames.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Jump to year"
                onChange={(event) => jumpToMonth(Number(event.target.value), visibleMonthNumber)}
                value={visibleYear}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="weekday-row">
          {weekdayLabels.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="month-grid">
          {calendarDays.map((day) => {
            const dateKey = toDateKey(day)
            const dayBookings = (bookingsByDate[dateKey] ?? []).sort((a, b) =>
              a.startTime.localeCompare(b.startTime),
            )
            const isOutsideMonth = day.getMonth() !== visibleMonthNumber

            return (
              <div
                className={[
                  'calendar-cell',
                  isOutsideMonth ? 'outside-month' : '',
                  dateKey === todayKey ? 'today-cell' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={dateKey}
              >
                <div className="day-number">
                  <strong>{day.getDate()}</strong>
                  {dayBookings.length > 0 && <span>{dayBookings.length}</span>}
                </div>
                <div className="calendar-events">
                  {dayBookings.map((booking) => (
                  <button
                    className={
                      booking.id === selectedBookingId
                        ? 'calendar-event-chip selected'
                        : 'calendar-event-chip'
                    }
                    key={booking.id}
                    onClick={() => setSelectedBookingId(booking.id)}
                    type="button"
                  >
                    <span className={`event-dot ${statusClass(booking.status)}`} />
                    <span>
                      <strong>{booking.eventName}</strong>
                      <em>
                        {booking.startTime} | {booking.room}
                      </em>
                    </span>
                  </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {selectedBooking && (
        <section className="panel calendar-selection">
          <PanelHeader
            action="View BEO"
            onAction={() => onViewBeo(selectedBooking.id)}
            title={selectedBooking.eventName}
          />
          <div className="selection-grid">
            <div className="detail-item">
              <dt>Current status</dt>
              <dd>
                <StatusBadge status={selectedBooking.status} />
              </dd>
            </div>
            <Detail label="Date" value={selectedBooking.date} />
            <Detail label="Time" value={`${selectedBooking.startTime}-${selectedBooking.endTime}`} />
            <Detail label="Venue" value={`${selectedBooking.venue}, ${selectedBooking.room}`} />
            <Detail label="Client" value={selectedBooking.account} />
            <Detail label="Next action" value={selectedBooking.nextAction} />
          </div>
        </section>
      )}
    </div>
  )
}

function leadTypeClass(type: LeadType) {
  return type === 'Group Resume' ? 'type-group' : 'type-beo'
}

// Leads seeded before the BEO / Group Resume split have no type; treat them as
// the single-function BEO track so nothing disappears from either list.
function leadTypeOf(lead: Lead): LeadType {
  return lead.leadType ?? 'BEO'
}

function bookingLeadTypeOf(booking: EventBooking): LeadType {
  return booking.leadType ?? 'BEO'
}

function emptyLead(leadType: LeadType = 'BEO'): Lead {
  return {
    id: `LEAD-${Date.now()}`,
    name: 'New lead',
    company: '',
    email: '',
    phone: '',
    source: '',
    category: '',
    stage: 'New',
    leadType,
    estimatedValue: 0,
    owner: '',
    createdAt: toDateKey(new Date()),
    notes: '',
    history: [{ id: `HIST-${Date.now()}`, timestamp: toDateKey(new Date()), note: 'Lead created' }],
  }
}

/**
 * Pull a CRM customer profile into a new lead. Everything the profile already
 * knows is carried across so nobody re-types a known client; the notes field
 * gets the qualifying context (budget, venue, behaviour) rather than losing it.
 */
function leadFromAccount(account: Account, leadType: LeadType, owner: string): Lead {
  const base = emptyLead(leadType)
  // Past average spend is a better opening estimate than zero for a repeat
  // client; a first-time profile has no events and keeps 0.
  const averageSpend =
    account.events > 0 ? Math.round(account.totalRevenue / account.events) : 0
  const notes = [
    account.notes,
    account.behavior,
    account.budgetRange ? `Budget range: ${account.budgetRange}` : '',
    account.preferredVenue ? `Preferred venue: ${account.preferredVenue}` : '',
    account.preferredPackages.length
      ? `Preferred packages: ${account.preferredPackages.join(', ')}`
      : '',
    account.dietary.length ? `Dietary/service: ${account.dietary.join(', ')}` : '',
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

  return {
    ...base,
    name: account.contact || account.name,
    company: account.name,
    email: account.email,
    phone: account.phone,
    source: account.leadSource,
    category: account.preferredPackages[0] ?? '',
    estimatedValue: averageSpend,
    owner,
    notes,
    history: [
      {
        id: `HIST-${Date.now()}`,
        timestamp: toDateKey(new Date()),
        note: `Lead pulled in from CRM profile ${account.id} (${account.name})`,
      },
    ],
  }
}

function LeadDetailView({
  canConvert,
  canDelete,
  canEdit,
  isNew = false,
  lead,
  onBack,
  onConvert,
  onDelete,
  onDiscardNew,
  onLogFollowUp,
  onSaveNew,
  updateLead,
}: {
  canConvert: boolean
  canDelete: boolean
  canEdit: boolean
  // An unsaved draft: nothing exists in the lead list until Save is clicked,
  // so abandoning the form leaves no empty "New lead" behind.
  isNew?: boolean
  lead: Lead
  onBack: () => void
  onConvert: (lead: Lead, target: 'booking' | 'proposal') => void
  onDelete: (id: string) => void
  onDiscardNew?: () => void
  onLogFollowUp: (note: string) => void
  onSaveNew?: () => void
  updateLead: <K extends keyof Lead>(id: string, field: K, value: Lead[K]) => void
}) {
  // A draft opens straight into the form — there is nothing to read yet.
  const [isEditing, setIsEditing] = useState(isNew)
  const [followUp, setFollowUp] = useState('')
  // Status changes are staged locally so an accidental click never commits: the
  // draft only becomes real (and lands in history) when the user clicks Save.
  // The parent remounts this view per lead (key={lead.id}), so the draft resets
  // on lead switch; after a Save, lead.stage already equals the draft.
  const [draftStage, setDraftStage] = useState<LeadStage>(lead.stage)
  const hasStageChange = draftStage !== lead.stage
  const orderedHistory = [...(lead.history ?? [])].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  )

  const saveStage = () => {
    if (hasStageChange) updateLead(lead.id, 'stage', draftStage)
  }

  // Called before any action that would otherwise discard a staged status change.
  // OK = save the change, Cancel = drop it; either way the caller then proceeds.
  const resolvePendingStage = () => {
    if (!hasStageChange) return
    if (
      window.confirm(
        `You changed the status to "${draftStage}" but haven't saved it.\n\n` +
          'Click OK to save this change, or Cancel to discard it.',
      )
    ) {
      updateLead(lead.id, 'stage', draftStage)
    } else {
      setDraftStage(lead.stage)
    }
  }

  return (
    <div className="page-stack">
      <button
        className="text-action back-action"
        onClick={() => {
          if (isNew) {
            onDiscardNew?.()
            return
          }
          resolvePendingStage()
          onBack()
        }}
        type="button"
      >
        <ChevronLeft size={16} />
        {isNew ? 'Cancel' : 'Back to leads'}
      </button>

      <section className="panel">
        <div className="drawer-head">
          <div>
            <p className={`eyebrow lead-stage-eyebrow ${stageClass(lead.stage)}`}>
              {isNew ? 'Unsaved draft' : lead.stage}
            </p>
            <h2>
              {isNew ? 'New lead' : lead.name}
              {!isNew && lead.company ? ` · ${lead.company}` : ''}
            </h2>
          </div>
          {isNew ? (
            <div className="drawer-head-actions">
              <div className="card-actions">
                <button className="secondary-action" onClick={onDiscardNew} type="button">
                  Discard
                </button>
                <button
                  className="primary-action"
                  disabled={!lead.name.trim()}
                  onClick={onSaveNew}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  Save lead
                </button>
              </div>
            </div>
          ) : (
            (canEdit || canDelete) && (
            <div className="drawer-head-actions">
              {canEdit && !isEditing && (
                <div className="lead-stage-control">
                  <div className={`lead-stage-stepper ${hasStageChange ? 'is-dirty' : ''}`}>
                    <button
                      className="icon-button"
                      disabled={draftStage === 'New' || draftStage === 'Lost'}
                      onClick={() => setDraftStage((current) => previousLeadStage(current))}
                      title="Fall back a stage"
                      type="button"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className={`stage-pill ${stageClass(draftStage)}`}>{draftStage}</span>
                    <button
                      className="icon-button"
                      disabled={draftStage === 'Won' || draftStage === 'Lost'}
                      onClick={() => setDraftStage((current) => nextLeadStage(current))}
                      title="Advance a stage"
                      type="button"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {hasStageChange ? (
                    <span className="lead-stage-hint">Unsaved — click Save</span>
                  ) : draftStage === 'Lost' ? (
                    <button
                      className="text-action lead-stage-link"
                      onClick={() => setDraftStage('New')}
                      type="button"
                    >
                      Reopen lead
                    </button>
                  ) : (
                    <button
                      className="text-action lead-stage-link danger"
                      onClick={() => setDraftStage('Lost')}
                      type="button"
                    >
                      Mark as lost
                    </button>
                  )}
                </div>
              )}
              <div className="card-actions">
                {canEdit &&
                  (hasStageChange && !isEditing ? (
                    <button className="primary-action" onClick={saveStage} type="button">
                      Save
                    </button>
                  ) : (
                    <button
                      className={isEditing ? 'secondary-action' : 'primary-action'}
                      onClick={() => setIsEditing((current) => !current)}
                      type="button"
                    >
                      {isEditing ? 'Done' : 'Edit'}
                    </button>
                  ))}
                {canDelete && (
                  <button
                    className="secondary-action"
                    onClick={() => {
                      resolvePendingStage()
                      onDelete(lead.id)
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            )
          )}
        </div>

        <div className="lead-type-row">
          <span className="lead-type-label">Lead type</span>
          {canEdit ? (
            <div className="lead-type-switch" role="group">
              {LEAD_TYPES.map((type) => (
                <button
                  className={leadTypeOf(lead) === type ? 'is-active' : ''}
                  key={type}
                  onClick={() => updateLead(lead.id, 'leadType', type)}
                  type="button"
                >
                  {type}
                </button>
              ))}
            </div>
          ) : (
            <span className="lead-type-pill">{leadTypeOf(lead)}</span>
          )}
          <span className="lead-type-hint">
            {leadTypeOf(lead) === 'Group Resume'
              ? 'Worked as a multi-day group; listed under Group Resume.'
              : 'Worked as a single function; listed under BEOs once converted.'}
          </span>
        </div>

        {isEditing ? (
          <div className="plan-edit-form">
            <FormField label="Contact name">
              <input
                onChange={(event) => updateLead(lead.id, 'name', event.target.value)}
                value={lead.name}
              />
            </FormField>
            <FormField label="Company">
              <input
                onChange={(event) => updateLead(lead.id, 'company', event.target.value)}
                value={lead.company}
              />
            </FormField>
            <FormField label="Email">
              <input
                onChange={(event) => updateLead(lead.id, 'email', event.target.value)}
                value={lead.email}
              />
            </FormField>
            <FormField label="Phone">
              <input
                onChange={(event) => updateLead(lead.id, 'phone', event.target.value)}
                value={lead.phone}
              />
            </FormField>
            <FormField label="Source">
              <input
                onChange={(event) => updateLead(lead.id, 'source', event.target.value)}
                value={lead.source}
              />
            </FormField>
            <FormField label="Category">
              <input
                onChange={(event) => updateLead(lead.id, 'category', event.target.value)}
                value={lead.category}
              />
            </FormField>
            <FormField label="Lead type">
              <select
                onChange={(event) =>
                  updateLead(lead.id, 'leadType', event.target.value as LeadType)
                }
                value={leadTypeOf(lead)}
              >
                {LEAD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Stage">
              <select
                onChange={(event) => updateLead(lead.id, 'stage', event.target.value as LeadStage)}
                value={lead.stage}
              >
                {LEAD_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </FormField>
            {lead.stage === 'Lost' && (
              <FormField label="Lost reason">
                <input
                  onChange={(event) => updateLead(lead.id, 'lostReason', event.target.value)}
                  value={lead.lostReason ?? ''}
                />
              </FormField>
            )}
            <FormField label="Estimated value">
              <input
                min="0"
                onChange={(event) =>
                  updateLead(lead.id, 'estimatedValue', Number(event.target.value))
                }
                type="number"
                value={lead.estimatedValue}
              />
            </FormField>
            <FormField label="Responsible staff">
              <input
                onChange={(event) => updateLead(lead.id, 'owner', event.target.value)}
                placeholder="Employee responsible for this lead"
                value={lead.owner}
              />
            </FormField>
            <FormField label="Notes">
              <textarea
                onChange={(event) => updateLead(lead.id, 'notes', event.target.value)}
                value={lead.notes}
              />
            </FormField>
          </div>
        ) : (
          <>
            <div className="detail-grid">
              <Detail label="Lead type" value={leadTypeOf(lead)} />
              <Detail label="Created" value={lead.createdAt} />
              <Detail label="Last updated" value={leadLastUpdated(lead)} />
              <Detail label="Email" value={lead.email || 'Not set'} />
              <Detail label="Phone" value={lead.phone || 'Not set'} />
              <Detail label="Source" value={lead.source || 'Not set'} />
              <Detail label="Category" value={lead.category || 'Not set'} />
              <Detail label="Estimated value" value={money(lead.estimatedValue)} />
              <Detail label="Responsible staff" value={lead.owner || 'Unassigned'} />
              {lead.stage === 'Lost' && (
                <Detail label="Lost reason" value={lead.lostReason || 'Not recorded'} />
              )}
            </div>
            <div className="drawer-section">
              <h3>Notes</h3>
              {/* pre-line so multi-line notes — e.g. the block a CRM pull-in
                  writes — keep their line breaks instead of running together. */}
              <p className="notes-body">{lead.notes || 'No notes yet.'}</p>
            </div>
            {(lead.followUps?.length ?? 0) > 0 && (
              <div className="drawer-section">
                <h3>Follow-up</h3>
                <div className="follow-up-log">
                  {(lead.followUps ?? []).map((entry: FollowUp) => (
                    <div className="follow-up-entry" key={entry.id}>
                      <span className="follow-up-date">{entry.timestamp}</span>
                      <p>{entry.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canEdit && !isNew && (
              <div className="drawer-section">
                <h3>Log a follow-up</h3>
                <div className="follow-up-form">
                  <textarea
                    onChange={(event) => setFollowUp(event.target.value)}
                    placeholder="Record a call, email, or next step for this lead…"
                    value={followUp}
                  />
                  <button
                    className="primary-action"
                    disabled={!followUp.trim()}
                    onClick={() => {
                      onLogFollowUp(followUp)
                      setFollowUp('')
                    }}
                    type="button"
                  >
                    Update
                  </button>
                </div>
              </div>
            )}
            {canConvert && !isNew && (
              <div className="lead-convert">
                <div className="lead-convert-copy">
                  <strong>Convert this lead</strong>
                  <span>
                    Carry the details across to a booking or proposal — you only fill in
                    what's missing.
                  </span>
                </div>
                <div className="lead-convert-actions">
                  <button
                    className="secondary-action"
                    onClick={() => {
                      resolvePendingStage()
                      onConvert(lead, 'proposal')
                    }}
                    type="button"
                  >
                    <FileText size={17} />
                    Convert to proposal
                  </button>
                  <button
                    className="primary-action"
                    onClick={() => {
                      resolvePendingStage()
                      onConvert(lead, 'booking')
                    }}
                    type="button"
                  >
                    <BookOpenCheck size={17} />
                    Convert to booking
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {!isNew && (
      <section className="panel">
        <PanelHeader title="History" />
        <div className="timeline">
          {orderedHistory.map((entry) => (
            <div className="timeline-entry" key={entry.id}>
              <span className="timeline-dot" />
              <div>
                <strong>{entry.note}</strong>
                <span>{entry.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  )
}

function LeadsView({
  account,
  initialLeadId,
  leads,
  listFooter,
  onConvert,
  restrictToType,
  setLeads,
  startDraft = false,
  title = 'Leads',
}: {
  account: LoginSession
  // Opens straight onto this lead — used when arriving from a CRM pull-in.
  initialLeadId?: string | null
  leads: Lead[]
  // Rendered under the list, and hidden while a lead detail is open.
  listFooter?: ReactNode
  onConvert: (lead: Lead, target: 'booking' | 'proposal') => void
  // When set, the view only shows leads on that track.
  restrictToType?: LeadType
  setLeads: (next: Lead[] | ((current: Lead[]) => Lead[])) => void
  // Open on a blank unsaved draft — the topbar's New lead.
  startDraft?: boolean
  title?: string
}) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(initialLeadId ?? null)
  // Held here, not in `leads`: an abandoned draft must leave nothing behind.
  const [draftLead, setDraftLead] = useState<Lead | null>(() =>
    startDraft ? emptyLead(restrictToType ?? 'BEO') : null,
  )
  const scopedLeads = restrictToType
    ? leads.filter((lead) => leadTypeOf(lead) === restrictToType)
    : leads
  const canEdit = hasPermission(account.role, 'leads:edit')
  const canConvert = hasPermission(account.role, 'booking:create')
  const canDelete = hasPermission(account.role, 'leads:delete')
  const getLeadDate = (lead: Lead) => lead.createdAt
  const availableMonths = availableMonthsOf(scopedLeads, getLeadDate)
  const availableYears = availableYearsOf(scopedLeads, getLeadDate)
  const [viewMode, setViewMode] = useState<ListViewMode>('grid')
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>('All')
  const [selectedMonth, setSelectedMonth] = useState(
    () => availableMonths[availableMonths.length - 1] ?? '',
  )
  const [selectedYear, setSelectedYear] = useState(
    () => availableYears[availableYears.length - 1] ?? '',
  )
  const visibleLeads = filterAndSortByTime(
    scopedLeads,
    getLeadDate,
    timeFilter,
    selectedMonth,
    selectedYear,
  )

  const actorName = account.displayName.trim() || account.email || 'A team member'

  const updateLead = <K extends keyof Lead>(id: string, field: K, value: Lead[K]) => {
    setLeads((current) =>
      current.map((lead) => {
        if (lead.id !== id) return lead
        const next = { ...lead, [field]: value, updatedAt: toDateKey(new Date()) }
        if (field === 'stage' && lead.stage !== value) {
          next.history = [
            ...(lead.history ?? []),
            {
              id: `HIST-${Date.now()}`,
              timestamp: toDateKey(new Date()),
              note: `Stage changed from ${lead.stage} to ${value as LeadStage} by ${actorName}`,
            },
          ]
        }
        return next
      }),
    )
  }

  const logFollowUp = (id: string, note: string) => {
    const trimmed = note.trim()
    if (!trimmed) return
    const stamp = toDateKey(new Date())
    const entryId = `FUP-${Date.now()}`
    setLeads((current) =>
      current.map((lead) =>
        lead.id === id
          ? {
              ...lead,
              updatedAt: stamp,
              followUps: [
                ...(lead.followUps ?? []),
                { id: entryId, timestamp: stamp, note: trimmed, author: actorName },
              ],
              history: [
                ...(lead.history ?? []),
                {
                  id: `HIST-${Date.now()}`,
                  timestamp: stamp,
                  note: `Follow-up logged by ${actorName}: ${trimmed}`,
                },
              ],
            }
          : lead,
      ),
    )
  }

  const deleteLead = (id: string) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    setLeads((current) => current.filter((lead) => lead.id !== id))
    if (selectedLeadId === id) setSelectedLeadId(null)
  }

  const updateDraft = <K extends keyof Lead>(_id: string, field: K, value: Lead[K]) => {
    setDraftLead((current) => (current ? { ...current, [field]: value } : current))
  }

  const saveDraft = () => {
    if (!draftLead) return
    const named = { ...draftLead, name: draftLead.name.trim() || 'Untitled lead' }
    setLeads((current) => [named, ...current])
    setDraftLead(null)
    setSelectedLeadId(named.id)
  }

  const discardDraft = () => {
    // Only nag when there is something to lose.
    const untouched = JSON.stringify({ ...draftLead, id: '', createdAt: '', history: [] })
    const blank = JSON.stringify({
      ...emptyLead(draftLead?.leadType ?? restrictToType ?? 'BEO'),
      id: '',
      createdAt: '',
      history: [],
    })
    if (untouched !== blank && !window.confirm('Discard this lead without saving?')) return
    setDraftLead(null)
  }

  if (draftLead) {
    return (
      <LeadDetailView
        canConvert={false}
        canDelete={false}
        canEdit
        isNew
        lead={draftLead}
        onBack={discardDraft}
        onConvert={onConvert}
        onDelete={() => setDraftLead(null)}
        onDiscardNew={discardDraft}
        onLogFollowUp={() => {}}
        onSaveNew={saveDraft}
        updateLead={updateDraft}
      />
    )
  }

  const selectedLead = scopedLeads.find((lead) => lead.id === selectedLeadId)

  if (selectedLead) {
    return (
      <LeadDetailView
        canConvert={canConvert}
        canDelete={canDelete}
        canEdit={canEdit}
        key={selectedLead.id}
        lead={selectedLead}
        onBack={() => setSelectedLeadId(null)}
        onConvert={onConvert}
        onDelete={deleteLead}
        onLogFollowUp={(note) => logFollowUp(selectedLead.id, note)}
        updateLead={updateLead}
      />
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        {/* Creating leads is the topbar's job now. A group-track lead starts
            there too, then gets switched with the lead detail's Lead type
            toggle. */}
        <PanelHeader title={title} />
        <ListViewControls
          availableMonths={availableMonths}
          availableYears={availableYears}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          setTimeFilter={setTimeFilter}
          setViewMode={setViewMode}
          timeFilter={timeFilter}
          viewMode={viewMode}
        />
        {viewMode === 'grid' ? (
          <div className="pipeline-board">
            {visibleLeads.map((lead) => (
              <button
                className={`opportunity-card ${stageClass(lead.stage)}`}
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                type="button"
              >
                <span>{lead.stage}</span>
                {!restrictToType && (
                  <span className={`lead-type-tag ${leadTypeClass(leadTypeOf(lead))}`}>
                    {leadTypeOf(lead)}
                  </span>
                )}
                <strong>
                  {lead.name}
                  {lead.company ? ` · ${lead.company}` : ''}
                </strong>
                <p>
                  {[lead.category, lead.source].filter(Boolean).join(' — ') ||
                    'No category/source set'}
                </p>
                <div className="progress-track">
                  <span style={{ width: `${LEAD_STAGE_PROBABILITY[lead.stage]}%` }} />
                </div>
                <div className="card-foot">
                  <em>{money(lead.estimatedValue)}</em>
                  <small>{lead.owner || 'Unassigned'}</small>
                </div>
                <p className="note-line">{lead.notes || 'No notes yet.'}</p>
              </button>
            ))}
            {!visibleLeads.length && (
              <p>
                No {restrictToType === 'Group Resume' ? 'group resume ' : ''}leads for this
                period.
              </p>
            )}
          </div>
        ) : (
          <div className="banner-list">
            {visibleLeads.map((lead) => (
              <button
                className={`banner-row ${stageClass(lead.stage)}`}
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                type="button"
              >
                <span className="banner-status">{lead.stage}</span>
                <div className="banner-main">
                  <strong>
                    {lead.name}
                    {lead.company ? ` · ${lead.company}` : ''}
                  </strong>
                  <span>
                    {[
                      restrictToType ? '' : leadTypeOf(lead),
                      lead.category,
                      lead.source,
                    ]
                      .filter(Boolean)
                      .join(' — ') || 'No category/source set'}
                  </span>
                </div>
                <span className="banner-meta">{lead.owner || 'Unassigned'}</span>
                <strong className="banner-value">{money(lead.estimatedValue)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {!visibleLeads.length && (
              <p>
                No {restrictToType === 'Group Resume' ? 'group resume ' : ''}leads for this
                period.
              </p>
            )}
          </div>
        )}
      </section>
      {listFooter}
    </div>
  )
}

function GroupResumeView({
  account,
  bookings,
  initialLeadId,
  leads,
  onConvert,
  onOpenBooking,
  onSaveResume,
  propertyProfile,
  setLeads,
}: {
  account: LoginSession
  bookings: EventBooking[]
  initialLeadId?: string | null
  leads: Lead[]
  onConvert: (lead: Lead, target: 'booking' | 'proposal') => void
  onOpenBooking: (bookingId: string) => void
  onSaveResume: (bookingId: string, resume: GroupResume) => void
  propertyProfile: PropertyProfile
  setLeads: (next: Lead[] | ((current: Lead[]) => Lead[])) => void
}) {
  const [openResumeId, setOpenResumeId] = useState<string | null>(null)
  const groupBookings = bookings
    .filter((booking) => bookingLeadTypeOf(booking) === 'Group Resume')
    .sort((first, second) => first.date.localeCompare(second.date))
  const openBooking = groupBookings.find((booking) => booking.id === openResumeId)

  if (openBooking) {
    return (
      <GroupResumeDocumentView
        booking={openBooking}
        canEdit={hasPermission(account.role, 'proposal:edit')}
        key={openBooking.id}
        onBack={() => setOpenResumeId(null)}
        onOpenBooking={() => onOpenBooking(openBooking.id)}
        onSave={(resume) => onSaveResume(openBooking.id, resume)}
        propertyProfile={propertyProfile}
      />
    )
  }

  return (
    <LeadsView
      account={account}
      initialLeadId={initialLeadId}
      leads={leads}
      listFooter={
        <section className="panel">
          <PanelHeader
            detail="Open a group to write or print its resume"
            title="Converted groups"
          />
          <div className="banner-list">
            {groupBookings.map((booking) => (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => setOpenResumeId(booking.id)}
                type="button"
              >
                <span className="banner-status">
                  {booking.groupResume?.revision
                    ? `Rev ${booking.groupResume.revision}`
                    : 'Draft'}
                </span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {booking.account} · {booking.date}
                  </span>
                </div>
                <span className="banner-meta">
                  {booking.venue}, {booking.room}
                </span>
                <strong className="banner-value">{money(booking.forecastRevenue)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {!groupBookings.length && (
              <p>
                No bookings on the group resume track yet. Convert a group resume lead, or set a
                booking's document track to Group Resume when you create it.
              </p>
            )}
          </div>
        </section>
      }
      onConvert={onConvert}
      restrictToType="Group Resume"
      setLeads={setLeads}
      title="Group resume leads"
    />
  )
}

/* ------------------------------------------------------------------ *
 * Group resume document
 *
 * The multi-day group's internal operating document. Layout follows the
 * resort's existing printed group resume: memo header, group information,
 * day-by-day itinerary, rooming list, room details, functions, revenue
 * summary, and payment / billing instructions over a signature block.
 * ------------------------------------------------------------------ */

/** Ids only need to be unique within one document's lifetime. */
function grId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** rate x rooms x nights x pax, treating a blank factor as 1. */
function grRowTotal(row: Pick<GroupResumeRevenueRow, 'rate' | 'rooms' | 'nights' | 'pax'>) {
  return Math.round((row.rate ?? 0) * (row.rooms || 1) * (row.nights || 1) * (row.pax || 1))
}

function grGrandTotal(rows: GroupResumeRevenueRow[]) {
  return rows
    .filter((row) => row.kind === 'line')
    .reduce((sum, row) => sum + (row.total || 0), 0)
}

/** Seed a resume from everything the booking already knows. */
function groupResumeDefaults(booking: EventBooking, propertyProfile: PropertyProfile): GroupResume {
  const lineRows: GroupResumeRevenueRow[] = (booking.lineItems ?? []).map((item) => ({
    id: grId('rev'),
    kind: 'line',
    details: item.description,
    rate: item.unitPrice,
    rooms: null,
    nights: null,
    pax: item.quantity || null,
    total: Math.round(item.unitPrice * (item.quantity || 1)),
  }))

  return {
    issueDate: toDateKey(new Date()),
    updated: false,
    subject: `${booking.account} — ${booking.eventName}`,
    from: 'Sales Department',
    to: [],
    cc: ['General Manager', 'All Sales Department'],
    intro: `Please join me in welcoming the participants of ${booking.account}, who will be staying at ${propertyProfile.name}.`,
    groupName: booking.account,
    organizer: booking.account,
    leaderName: booking.contact,
    leaderPhone: '',
    leaderEmail: '',
    checkIn: booking.date,
    checkOut: booking.date,
    groupSize: booking.expectedGuests ? `${booking.expectedGuests} persons` : '',
    roomCount: '',
    profile: '',
    days: [
      {
        id: grId('day'),
        label: 'Day 1',
        date: booking.date,
        location: booking.venue,
        overnight: `Overnight at ${propertyProfile.name}`,
        items: [
          { id: grId('it'), time: booking.setupTime, detail: 'Setup and vendor access' },
          { id: grId('it'), time: booking.startTime, detail: booking.eventName },
          { id: grId('it'), time: booking.endTime, detail: 'Function concludes' },
        ],
      },
    ],
    guests: [],
    roomRate: '',
    roomBenefits: [],
    functions: [
      {
        id: grId('fn'),
        name: booking.eventName,
        date: booking.date,
        venue: `${booking.venue}, ${booking.room}`,
        notes: '',
      },
    ],
    revenueRows: lineRows.length
      ? lineRows
      : [
          {
            id: grId('rev'),
            kind: 'line',
            details: booking.packageName || booking.eventName,
            rate: booking.forecastRevenue,
            rooms: null,
            nights: null,
            pax: null,
            total: booking.forecastRevenue,
          },
        ],
    paymentNotes: [],
    billingInstructions: [
      'Accommodation will be charged to MASTER ACCOUNT.',
      'Other expense charge to guest OWN ACCOUNT.',
    ],
    closingNote: 'Thank you for your co-operation.',
    preparedBy: booking.owner || propertyProfile.signatoryName,
    preparedByTitle: propertyProfile.signatoryTitle || 'Sales Manager',
    revision: 0,
  }
}

/** One label/value row of the memo header or group information block. */
function GrRow({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="gr-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Reads as plain text until the document is in edit mode. */
function GrText({
  editing,
  multiline,
  onChange,
  placeholder,
  value,
}: {
  editing: boolean
  multiline?: boolean
  onChange: (next: string) => void
  placeholder?: string
  value: string
}) {
  if (!editing) return <span className="gr-value">{value || <em>—</em>}</span>
  return multiline ? (
    <textarea
      className="gr-input"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      value={value}
    />
  ) : (
    <input
      className="gr-input"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  )
}

/** One entry per line. Deliberately not comma-split: entries carry money
 *  amounts like "THB 651,520" that a comma split would tear in half. */
function GrList({
  editing,
  onChange,
  placeholder,
  value,
}: {
  editing: boolean
  onChange: (next: string[]) => void
  placeholder?: string
  value: string[]
}) {
  // The textarea keeps its own raw text so a freshly pressed Enter (an empty
  // trailing line the parsed array drops) survives until it is typed into.
  const [text, setText] = useState(value.join('\n'))
  const [syncedFrom, setSyncedFrom] = useState(value)
  if (syncedFrom !== value) {
    setSyncedFrom(value)
    setText(value.join('\n'))
  }

  if (!editing)
    return (
      <span className="gr-value">
        {value.length ? (
          value.map((entry, index) => <span key={`${entry}-${index}`}>{entry}</span>)
        ) : (
          <em>—</em>
        )}
      </span>
    )

  return (
    <textarea
      className="gr-input"
      onChange={(event) => {
        const raw = event.target.value
        const next = raw
          .split('\n')
          .map((entry) => entry.trim())
          .filter(Boolean)
        setText(raw)
        // The parent stores this exact array, so the sync check above sees a
        // matching identity next render and leaves the raw text alone.
        setSyncedFrom(next)
        onChange(next)
      }}
      placeholder={placeholder}
      rows={3}
      value={text}
    />
  )
}

function GroupResumeDocumentView({
  booking,
  canEdit,
  onBack,
  onOpenBooking,
  onSave,
  propertyProfile,
}: {
  booking: EventBooking
  canEdit: boolean
  onBack: () => void
  onOpenBooking: () => void
  onSave: (resume: GroupResume) => void
  propertyProfile: PropertyProfile
}) {
  // Built once per mount (the caller keys this view by booking id) so the
  // unsaved fallback keeps a stable identity across renders.
  const [fallback] = useState(() => groupResumeDefaults(booking, propertyProfile))
  const saved = booking.groupResume ?? fallback
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GroupResume>(fallback)
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  // Re-sync when the caller saves or a different booking is opened.
  const [syncedFrom, setSyncedFrom] = useState(fallback)
  if (!editing && syncedFrom !== saved) {
    setSyncedFrom(saved)
    setDraft(saved)
  }

  const resume = editing ? draft : saved
  const setField = <K extends keyof GroupResume>(field: K, value: GroupResume[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const grandTotal = grGrandTotal(resume.revenueRows)

  const startEditing = () => {
    setDraft(saved)
    setEditing(true)
  }
  const cancelEditing = () => {
    setDraft(saved)
    setEditing(false)
  }
  const saveEditing = () => {
    // Every save is a numbered revision, matching proposals and agreements.
    onSave({ ...draft, revision: saved.revision + 1, updated: saved.revision > 0 })
    setEditing(false)
  }

  /* ---- itinerary ---- */
  const updateDay = (dayId: string, patch: Partial<GroupResumeDay>) =>
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? { ...day, ...patch } : day)),
    }))
  const addDay = () =>
    setDraft((current) => ({
      ...current,
      days: [
        ...current.days,
        {
          id: grId('day'),
          label: `Day ${current.days.length + 1}`,
          date: '',
          location: '',
          overnight: `Overnight at ${propertyProfile.name}`,
          items: [{ id: grId('it'), time: '', detail: '' }],
        },
      ],
    }))
  const removeDay = (dayId: string) =>
    setDraft((current) => ({ ...current, days: current.days.filter((day) => day.id !== dayId) }))
  const updateItem = (dayId: string, itemId: string, patch: Partial<GroupResumeItineraryItem>) =>
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayId
          ? {
              ...day,
              items: day.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item,
              ),
            }
          : day,
      ),
    }))
  const addItem = (dayId: string) =>
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayId
          ? { ...day, items: [...day.items, { id: grId('it'), time: '', detail: '' }] }
          : day,
      ),
    }))
  const removeItem = (dayId: string, itemId: string) =>
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === dayId
          ? { ...day, items: day.items.filter((item) => item.id !== itemId) }
          : day,
      ),
    }))

  /* ---- rooming list ---- */
  const updateGuest = (guestId: string, patch: Partial<GroupResumeGuest>) =>
    setDraft((current) => ({
      ...current,
      guests: current.guests.map((guest) =>
        guest.id === guestId ? { ...guest, ...patch } : guest,
      ),
    }))
  const addGuest = () =>
    setDraft((current) => ({
      ...current,
      guests: [
        ...current.guests,
        {
          id: grId('gst'),
          title: '',
          firstName: '',
          middleName: '',
          lastName: '',
          passportNumber: '',
          checkIn: current.checkIn,
          checkOut: current.checkOut,
          nights: 0,
          note: '',
        },
      ],
    }))
  const removeGuest = (guestId: string) =>
    setDraft((current) => ({
      ...current,
      guests: current.guests.filter((guest) => guest.id !== guestId),
    }))

  /* ---- functions ---- */
  const updateFunction = (functionId: string, patch: Partial<GroupResumeFunction>) =>
    setDraft((current) => ({
      ...current,
      functions: current.functions.map((entry) =>
        entry.id === functionId ? { ...entry, ...patch } : entry,
      ),
    }))
  const addFunction = () =>
    setDraft((current) => ({
      ...current,
      functions: [
        ...current.functions,
        { id: grId('fn'), name: '', date: '', venue: '', notes: '' },
      ],
    }))
  const removeFunction = (functionId: string) =>
    setDraft((current) => ({
      ...current,
      functions: current.functions.filter((entry) => entry.id !== functionId),
    }))

  /* ---- revenue ---- */
  const updateRow = (rowId: string, patch: Partial<GroupResumeRevenueRow>) =>
    setDraft((current) => ({
      ...current,
      revenueRows: current.revenueRows.map((row) => {
        if (row.id !== rowId) return row
        const next = { ...row, ...patch }
        // Any change to a factor re-derives the total; typing in the total
        // column itself still wins because that patch carries `total`.
        return 'total' in patch ? next : { ...next, total: grRowTotal(next) }
      }),
    }))
  const addRow = (kind: GroupResumeRevenueRow['kind']) =>
    setDraft((current) => ({
      ...current,
      revenueRows: [
        ...current.revenueRows,
        {
          id: grId('rev'),
          kind,
          details: '',
          rate: null,
          rooms: null,
          nights: null,
          pax: null,
          total: 0,
        },
      ],
    }))
  const removeRow = (rowId: string) =>
    setDraft((current) => ({
      ...current,
      revenueRows: current.revenueRows.filter((row) => row.id !== rowId),
    }))

  const numberValue = (value: number | null) => (value === null ? '' : String(value))
  const parseNumber = (value: string) => (value.trim() === '' ? null : Number(value) || 0)

  const paperDocument = (
    <div className="paper print-doc group-resume-doc">
      <div className="paper-head">
        <div>
          <span>{propertyProfile.name}</span>
          <strong>GROUP RESUME</strong>
        </div>
        <div>
          <span>{booking.id}</span>
          <strong>
            {resume.revision > 0 ? `Revision ${resume.revision}` : 'Draft'}
          </strong>
        </div>
      </div>

      {resume.updated && <p className="gr-updated-flag">UPDATED</p>}

      <dl className="gr-memo">
        <GrRow label="Issue date">
          <GrText
            editing={editing}
            onChange={(next) => setField('issueDate', next)}
            value={resume.issueDate}
          />
        </GrRow>
        <GrRow label="Subject">
          <GrText
            editing={editing}
            onChange={(next) => setField('subject', next)}
            value={resume.subject}
          />
        </GrRow>
        <GrRow label="From">
          <GrText
            editing={editing}
            onChange={(next) => setField('from', next)}
            value={resume.from}
          />
        </GrRow>
        <GrRow label="To">
          <GrList
            editing={editing}
            onChange={(next) => setField('to', next)}
            placeholder="One name per line"
            value={resume.to}
          />
        </GrRow>
        <GrRow label="CC">
          <GrList
            editing={editing}
            onChange={(next) => setField('cc', next)}
            placeholder="One name per line"
            value={resume.cc}
          />
        </GrRow>
      </dl>

      <div className="gr-paragraph">
        <GrText
          editing={editing}
          multiline
          onChange={(next) => setField('intro', next)}
          value={resume.intro}
        />
      </div>

      <PaperSection title="Group information">
        <dl className="gr-memo">
          <GrRow label="Group name">
            <GrText
              editing={editing}
              onChange={(next) => setField('groupName', next)}
              value={resume.groupName}
            />
          </GrRow>
          <GrRow label="Organizer name">
            <GrText
              editing={editing}
              onChange={(next) => setField('organizer', next)}
              value={resume.organizer}
            />
          </GrRow>
          <GrRow label="Group leader name">
            <GrText
              editing={editing}
              onChange={(next) => setField('leaderName', next)}
              value={resume.leaderName}
            />
          </GrRow>
          <GrRow label="Telephone no.">
            <GrText
              editing={editing}
              onChange={(next) => setField('leaderPhone', next)}
              value={resume.leaderPhone}
            />
          </GrRow>
          <GrRow label="Email">
            <GrText
              editing={editing}
              onChange={(next) => setField('leaderEmail', next)}
              value={resume.leaderEmail}
            />
          </GrRow>
          <GrRow label="Check-in date">
            <GrText
              editing={editing}
              onChange={(next) => setField('checkIn', next)}
              value={resume.checkIn}
            />
          </GrRow>
          <GrRow label="Check-out date">
            <GrText
              editing={editing}
              onChange={(next) => setField('checkOut', next)}
              value={resume.checkOut}
            />
          </GrRow>
          <GrRow label="Group size">
            <GrText
              editing={editing}
              onChange={(next) => setField('groupSize', next)}
              placeholder="15 persons and 1 organizer"
              value={resume.groupSize}
            />
          </GrRow>
          <GrRow label="Number of rooms">
            <GrText
              editing={editing}
              onChange={(next) => setField('roomCount', next)}
              placeholder="17 rooms / single occupancy"
              value={resume.roomCount}
            />
          </GrRow>
        </dl>
        <div className="gr-paragraph">
          <GrText
            editing={editing}
            multiline
            onChange={(next) => setField('profile', next)}
            placeholder="Short profile of the group or their company..."
            value={resume.profile}
          />
        </div>
      </PaperSection>

      <PaperSection title="Itinerary">
        <div className="gr-days">
          {resume.days.map((day) => (
            <div className="gr-day" key={day.id}>
              <div className="gr-day-head">
                {editing ? (
                  <>
                    <input
                      className="gr-input gr-input-narrow"
                      onChange={(event) => updateDay(day.id, { label: event.target.value })}
                      placeholder="Day 1"
                      value={day.label}
                    />
                    <input
                      className="gr-input"
                      onChange={(event) => updateDay(day.id, { date: event.target.value })}
                      placeholder="Monday 12 May 2025"
                      value={day.date}
                    />
                    <input
                      className="gr-input"
                      onChange={(event) => updateDay(day.id, { location: event.target.value })}
                      placeholder="Chiang Mai, Thailand"
                      value={day.location}
                    />
                    <button
                      className="text-action danger-action no-print"
                      onClick={() => removeDay(day.id)}
                      type="button"
                    >
                      Remove day
                    </button>
                  </>
                ) : (
                  <>
                    <strong>{day.label}</strong>
                    <span>{day.date}</span>
                    <span className="gr-day-location">{day.location}</span>
                  </>
                )}
              </div>

              <div className="gr-rundown">
                {day.items.map((item) =>
                  editing ? (
                    <div className="gr-rundown-edit" key={item.id}>
                      <input
                        className="gr-input gr-input-narrow"
                        onChange={(event) =>
                          updateItem(day.id, item.id, { time: event.target.value })
                        }
                        placeholder="09:00hrs"
                        value={item.time}
                      />
                      <textarea
                        className="gr-input"
                        onChange={(event) =>
                          updateItem(day.id, item.id, { detail: event.target.value })
                        }
                        placeholder="What happens"
                        rows={2}
                        value={item.detail}
                      />
                      <label className="gr-check">
                        <input
                          checked={Boolean(item.emphasis)}
                          onChange={(event) =>
                            updateItem(day.id, item.id, { emphasis: event.target.checked })
                          }
                          type="checkbox"
                        />
                        Note
                      </label>
                      <button
                        className="text-action danger-action no-print"
                        onClick={() => removeItem(day.id, item.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="gr-rundown-row" key={item.id}>
                      <span>{item.time}</span>
                      <p className={item.emphasis ? 'gr-note' : undefined}>{item.detail}</p>
                    </div>
                  ),
                )}
                {editing && (
                  <button
                    className="text-action no-print"
                    onClick={() => addItem(day.id)}
                    type="button"
                  >
                    <Plus size={14} />
                    Add line
                  </button>
                )}
              </div>

              <div className="gr-overnight">
                <GrText
                  editing={editing}
                  onChange={(next) => updateDay(day.id, { overnight: next })}
                  value={day.overnight}
                />
              </div>
            </div>
          ))}
          {!resume.days.length && <p className="empty-state">No itinerary days yet.</p>}
          {editing && (
            <button className="secondary-action no-print" onClick={addDay} type="button">
              <Plus size={16} />
              Add day
            </button>
          )}
        </div>
      </PaperSection>

      <PaperSection title="Rooming list">
        <div className="gr-table-scroll">
          <table className="gr-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Title</th>
                <th>First name</th>
                <th>Middle name</th>
                <th>Last name</th>
                <th>Passport number</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Nights</th>
                <th>Note</th>
                {editing && <th aria-label="Remove" className="no-print" />}
              </tr>
            </thead>
            <tbody>
              {resume.guests.map((guest, index) => (
                <tr key={guest.id}>
                  <td>{index + 1}</td>
                  {(
                    [
                      ['title', 'Mr'],
                      ['firstName', 'First'],
                      ['middleName', ''],
                      ['lastName', 'Last'],
                      ['passportNumber', 'Passport'],
                      ['checkIn', '2025-05-12'],
                      ['checkOut', '2025-05-18'],
                    ] as Array<[keyof GroupResumeGuest, string]>
                  ).map(([field, placeholder]) => (
                    <td key={field}>
                      {editing ? (
                        <input
                          className="gr-input"
                          onChange={(event) =>
                            updateGuest(guest.id, { [field]: event.target.value })
                          }
                          placeholder={placeholder}
                          value={String(guest[field] ?? '')}
                        />
                      ) : (
                        String(guest[field] ?? '')
                      )}
                    </td>
                  ))}
                  <td>
                    {editing ? (
                      <input
                        className="gr-input gr-input-narrow"
                        onChange={(event) =>
                          updateGuest(guest.id, { nights: Number(event.target.value) || 0 })
                        }
                        type="number"
                        value={guest.nights || ''}
                      />
                    ) : (
                      guest.nights || ''
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="gr-input"
                        onChange={(event) => updateGuest(guest.id, { note: event.target.value })}
                        placeholder="Cancelled with charge"
                        value={guest.note}
                      />
                    ) : (
                      guest.note
                    )}
                  </td>
                  {editing && (
                    <td className="no-print">
                      <button
                        className="text-action danger-action"
                        onClick={() => removeGuest(guest.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!resume.guests.length && (
                <tr>
                  <td className="gr-empty-cell" colSpan={editing ? 11 : 10}>
                    No guests added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {editing && (
          <button className="secondary-action no-print" onClick={addGuest} type="button">
            <Plus size={16} />
            Add guest
          </button>
        )}
      </PaperSection>

      <PaperSection title="Room details">
        <dl className="gr-memo">
          <GrRow label="Room rate">
            <GrText
              editing={editing}
              onChange={(next) => setField('roomRate', next)}
              placeholder="Romantic Lanna Deluxe THB 4,100 net per room per night including breakfast"
              value={resume.roomRate}
            />
          </GrRow>
          <GrRow label="Room benefit">
            <GrList
              editing={editing}
              onChange={(next) => setField('roomBenefits', next)}
              placeholder="One benefit per line"
              value={resume.roomBenefits}
            />
          </GrRow>
        </dl>
      </PaperSection>

      <PaperSection title="Functions">
        <div className="gr-functions">
          {resume.functions.map((entry) => (
            <div className="gr-function" key={entry.id}>
              {editing ? (
                <>
                  <input
                    className="gr-input"
                    onChange={(event) => updateFunction(entry.id, { name: event.target.value })}
                    placeholder="Welcome dinner"
                    value={entry.name}
                  />
                  <input
                    className="gr-input"
                    onChange={(event) => updateFunction(entry.id, { date: event.target.value })}
                    placeholder="Monday, 12 May 2025"
                    value={entry.date}
                  />
                  <input
                    className="gr-input"
                    onChange={(event) => updateFunction(entry.id, { venue: event.target.value })}
                    placeholder="Pre-dinner canape at Lawn, dinner at Glasshouse"
                    value={entry.venue}
                  />
                  <textarea
                    className="gr-input"
                    onChange={(event) => updateFunction(entry.id, { notes: event.target.value })}
                    placeholder="Decoration, performance, BEO reference..."
                    rows={2}
                    value={entry.notes}
                  />
                  <button
                    className="text-action danger-action no-print"
                    onClick={() => removeFunction(entry.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <strong>{entry.name}</strong>
                  <div className="paper-grid compact-paper-grid">
                    <Detail label="Date" value={entry.date || '—'} />
                    <Detail label="Venue" value={entry.venue || '—'} />
                  </div>
                  {entry.notes && <p>{entry.notes}</p>}
                </>
              )}
            </div>
          ))}
          {!resume.functions.length && <p className="empty-state">No functions listed yet.</p>}
          {editing && (
            <button className="secondary-action no-print" onClick={addFunction} type="button">
              <Plus size={16} />
              Add function
            </button>
          )}
        </div>
      </PaperSection>

      <PaperSection title="Summary revenue">
        <div className="gr-table-scroll">
          <table className="gr-table gr-revenue-table">
            <thead>
              <tr>
                <th>Details</th>
                <th>Rate</th>
                <th>Room</th>
                <th>Night</th>
                <th>Pax</th>
                <th>Total</th>
                {editing && <th aria-label="Remove" className="no-print" />}
              </tr>
            </thead>
            <tbody>
              {resume.revenueRows.map((row) =>
                row.kind === 'heading' && !editing ? (
                  <tr className="gr-revenue-heading" key={row.id}>
                    <td colSpan={6}>{row.details}</td>
                  </tr>
                ) : (
                  <tr className={row.kind === 'heading' ? 'gr-revenue-heading' : undefined} key={row.id}>
                    <td>
                      {editing ? (
                        <input
                          className="gr-input"
                          onChange={(event) => updateRow(row.id, { details: event.target.value })}
                          placeholder={row.kind === 'heading' ? 'Function - 12 May 2025' : 'Romantic Lanna Deluxe'}
                          value={row.details}
                        />
                      ) : (
                        row.details
                      )}
                    </td>
                    {row.kind === 'heading' ? (
                      <td className="no-print" colSpan={5} />
                    ) : (
                      (
                        [
                          ['rate', row.rate],
                          ['rooms', row.rooms],
                          ['nights', row.nights],
                          ['pax', row.pax],
                        ] as Array<[keyof GroupResumeRevenueRow, number | null]>
                      ).map(([field, value]) => (
                        <td key={field}>
                          {editing ? (
                            <input
                              className="gr-input gr-input-narrow"
                              onChange={(event) =>
                                updateRow(row.id, { [field]: parseNumber(event.target.value) })
                              }
                              type="number"
                              value={numberValue(value)}
                            />
                          ) : value === null ? (
                            ''
                          ) : (
                            value.toLocaleString('en-US')
                          )}
                        </td>
                      ))
                    )}
                    {row.kind === 'line' && (
                      <td className="gr-total-cell">
                        {editing ? (
                          <input
                            className="gr-input gr-input-narrow"
                            onChange={(event) =>
                              updateRow(row.id, { total: Number(event.target.value) || 0 })
                            }
                            type="number"
                            value={row.total || ''}
                          />
                        ) : (
                          row.total.toLocaleString('en-US')
                        )}
                      </td>
                    )}
                    {editing && (
                      <td className="no-print">
                        <button
                          className="text-action danger-action"
                          onClick={() => removeRow(row.id)}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ),
              )}
              <tr className="gr-revenue-total">
                <td colSpan={5}>GRAND TOTAL</td>
                <td className="gr-total-cell">{grandTotal.toLocaleString('en-US')}</td>
                {editing && <td className="no-print" />}
              </tr>
            </tbody>
          </table>
        </div>
        {editing && (
          <div className="gr-row-actions no-print">
            <button className="secondary-action" onClick={() => addRow('line')} type="button">
              <Plus size={16} />
              Add line
            </button>
            <button className="secondary-action" onClick={() => addRow('heading')} type="button">
              <Plus size={16} />
              Add heading
            </button>
          </div>
        )}
      </PaperSection>

      <PaperSection title="Payment">
        <GrList
          editing={editing}
          onChange={(next) => setField('paymentNotes', next)}
          placeholder="Full pre-payment of THB 651,520 net already paid"
          value={resume.paymentNotes}
        />
      </PaperSection>

      <PaperSection title="Billing instruction">
        <GrList
          editing={editing}
          onChange={(next) => setField('billingInstructions', next)}
          placeholder="Accommodation charged to MASTER ACCOUNT"
          value={resume.billingInstructions}
        />
        {(booking.billingCompanyName || booking.billingTaxId || booking.billingAddress) && (
          <div className="paper-grid compact-paper-grid">
            <Detail label="Company name" value={booking.billingCompanyName || booking.account} />
            <Detail label="TAX ID" value={booking.billingTaxId || '—'} />
            <Detail label="Address" value={booking.billingAddress || '—'} />
          </div>
        )}
      </PaperSection>

      <div className="gr-paragraph">
        <GrText
          editing={editing}
          onChange={(next) => setField('closingNote', next)}
          value={resume.closingNote}
        />
      </div>

      <div className="proposal-signature-row">
        <div className="signatory-column">
          <strong>
            <GrText
              editing={editing}
              onChange={(next) => setField('preparedBy', next)}
              value={resume.preparedBy}
            />
          </strong>
          <small>
            <GrText
              editing={editing}
              onChange={(next) => setField('preparedByTitle', next)}
              value={resume.preparedByTitle}
            />
          </small>
        </div>
        <div className="signatory-column">
          <strong>{propertyProfile.signatoryName || 'General Manager'}</strong>
          <small>Acknowledged — {propertyProfile.name}</small>
        </div>
      </div>
    </div>
  )

  if (showPdfPreview) {
    return (
      <div className="page-stack">
        <button
          className="text-action back-action no-print"
          onClick={() => setShowPdfPreview(false)}
          type="button"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <section className="document-preview single-document">
          <div className="document-toolbar no-print">
            <div>
              <p className="eyebrow">Group resume</p>
              <h2>{booking.eventName}</h2>
            </div>
            <div className="toolbar-actions">
              <button className="primary-action" onClick={() => window.print()} type="button">
                <Download size={16} />
                Print
              </button>
            </div>
          </div>
          {paperDocument}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to Group Resume
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">
              Group resume · {resume.revision > 0 ? `Revision ${resume.revision}` : 'Draft'}
            </p>
            <h2>{booking.eventName}</h2>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-action" onClick={onOpenBooking} type="button">
              <ClipboardList size={16} />
              Open booking
            </button>
            {canEdit &&
              (editing ? (
                <>
                  <button className="secondary-action" onClick={cancelEditing} type="button">
                    Cancel
                  </button>
                  <button className="primary-action" onClick={saveEditing} type="button">
                    <CheckCircle2 size={16} />
                    Save as revision {saved.revision + 1}
                  </button>
                </>
              ) : (
                <button className="primary-action" onClick={startEditing} type="button">
                  Edit resume
                </button>
              ))}
            <button
              className="secondary-action"
              onClick={() => setShowPdfPreview(true)}
              type="button"
            >
              <Download size={16} />
              View PDF
            </button>
          </div>
        </div>

        {paperDocument}
      </section>
    </div>
  )
}

function CrmView({
  bookings,
  canCreateLead,
  leads,
  onPullIntoLeads,
}: {
  bookings: EventBooking[]
  canCreateLead: boolean
  leads: Lead[]
  onPullIntoLeads: (account: Account, leadType: LeadType) => void
}) {
  return (
    <CustomerDirectory
      bookings={bookings}
      canCreateLead={canCreateLead}
      leads={leads}
      onPullIntoLeads={onPullIntoLeads}
    />
  )
}

function CustomerDirectory({
  bookings,
  canCreateLead,
  leads,
  onPullIntoLeads,
}: {
  bookings: EventBooking[]
  canCreateLead: boolean
  leads: Lead[]
  onPullIntoLeads: (account: Account, leadType: LeadType) => void
}) {
  const [pullTrack, setPullTrack] = useState<LeadType>('BEO')
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id)
  const sortedAccounts = [...accounts].sort((first, second) =>
    first.name.localeCompare(second.name),
  )
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0]
  const selectedAccountBookings = bookings.filter(
    (booking) => booking.account === selectedAccount.name,
  )
  // Leads already raised for this company, so a pull-in never silently
  // duplicates one somebody else opened last week.
  const selectedAccountLeads = leads.filter(
    (lead) => lead.company === selectedAccount.name,
  )
  const openAccountLeads = selectedAccountLeads.filter(
    (lead) => lead.stage !== 'Won' && lead.stage !== 'Lost',
  )
  const groupedAccounts = sortedAccounts.reduce<Record<string, Account[]>>(
    (groups, account) => {
      const letter = account.name[0]?.toUpperCase() ?? '#'
      groups[letter] = groups[letter] ?? []
      groups[letter].push(account)
      return groups
    },
    {},
  )
  const availableLetters = new Set(Object.keys(groupedAccounts))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return (
    <div className="crm-directory-layout">
      <section className="panel crm-directory-panel">
        <div className="alphabet-strip">
          {alphabet.map((letter) => (
            <span
              className={availableLetters.has(letter) ? 'letter available' : 'letter'}
              key={letter}
            >
              {letter}
            </span>
          ))}
        </div>

        <div className="directory-groups">
          {Object.entries(groupedAccounts).map(([letter, letterAccounts]) => (
            <section className="directory-group" key={letter}>
              <h2>{letter}</h2>
              <div className="directory-list">
                {letterAccounts.map((account) => {
                  const accountBookings = bookings.filter(
                    (booking) => booking.account === account.name,
                  )
                  return (
                    <button
                  className={
                    account.id === selectedAccount.id
                      ? 'directory-company selected'
                      : 'directory-company'
                  }
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  aria-pressed={account.id === selectedAccount.id}
                  type="button"
                >
                      <div>
                        <strong>{account.name}</strong>
                        <span>{account.type}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Revenue</dt>
                          <dd>{compactMoney(account.totalRevenue)}</dd>
                        </div>
                        <div>
                          <dt>Events</dt>
                          <dd>{account.events}</dd>
                        </div>
                        <div>
                          <dt>Active</dt>
                          <dd>{accountBookings.length}</dd>
                        </div>
                      </dl>
                      <ChevronRight size={18} />
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <aside className="detail-drawer customer-profile">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{selectedAccount.id}</p>
            <h2>{selectedAccount.name}</h2>
          </div>
          <span className="account-type">{selectedAccount.type}</span>
        </div>

        <div className="profile-summary-grid">
          <span>
            <strong>{compactMoney(selectedAccount.totalRevenue)}</strong>
            <small>Past revenue</small>
          </span>
          <span>
            <strong>{selectedAccount.events}</strong>
            <small>Past events</small>
          </span>
          <span>
            <strong>{selectedAccountBookings.length}</strong>
            <small>Active bookings</small>
          </span>
        </div>

        <div className="detail-grid">
          <Detail label="Contact" value={selectedAccount.contact} />
          <Detail label="Email" value={selectedAccount.email} />
          <Detail label="Phone" value={selectedAccount.phone} />
          <Detail label="Budget" value={selectedAccount.budgetRange} />
          <Detail label="Lead source" value={selectedAccount.leadSource} />
          <Detail label="Preferred venue" value={selectedAccount.preferredVenue} />
        </div>

        <div className="drawer-section">
          <h3>Preferred packages</h3>
          <TagList items={selectedAccount.preferredPackages} />
        </div>

        <div className="drawer-section">
          <h3>Dietary and service notes</h3>
          <TagList items={selectedAccount.dietary} />
        </div>

        <div className="drawer-section">
          <h3>Customer behavior</h3>
          <p>{selectedAccount.behavior}</p>
        </div>

        <div className="drawer-section">
          <h3>Profile notes</h3>
          <p>{selectedAccount.notes}</p>
        </div>

        <div className="drawer-section crm-pull-section">
          <h3>
            <Sparkles size={16} />
            Leads
          </h3>
          {selectedAccountLeads.length > 0 ? (
            <div className="profile-booking-list">
              {selectedAccountLeads.map((lead) => (
                <div className="profile-booking-row" key={lead.id}>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>
                      {lead.stage} · {shortDate(lead.createdAt)}
                    </span>
                  </div>
                  <span className={`lead-type-tag ${leadTypeClass(leadTypeOf(lead))}`}>
                    {leadTypeOf(lead)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>No leads raised for this customer yet.</p>
          )}

          {canCreateLead && (
            <div className="crm-pull-actions">
              {openAccountLeads.length > 0 && (
                <p className="panel-header-detail">
                  {openAccountLeads.length} lead
                  {openAccountLeads.length > 1 ? 's are' : ' is'} still open for this customer —
                  check before raising another.
                </p>
              )}
              <FormField label="Track">
                <select
                  onChange={(event) => setPullTrack(event.target.value as LeadType)}
                  value={pullTrack}
                >
                  {LEAD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'BEO' ? 'BEO (single function)' : 'Group Resume (multi-day group)'}
                    </option>
                  ))}
                </select>
              </FormField>
              <button
                className="primary-action full-width"
                onClick={() => onPullIntoLeads(selectedAccount, pullTrack)}
                type="button"
              >
                <Sparkles size={17} />
                Create lead from this profile
              </button>
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h3>Active bookings</h3>
          <div className="profile-booking-list">
            {selectedAccountBookings.length > 0 ? (
              selectedAccountBookings.map((booking) => (
                <div className="profile-booking-row" key={booking.id}>
                  <div>
                    <strong>{booking.eventName}</strong>
                    <span>
                      {shortDate(booking.date)} | {booking.room}
                    </span>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
              ))
            ) : (
              <p>No active bookings yet.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function BookingsView({
  account,
  bookings,
  closeJob,
  onNewBooking,
  onViewBeo,
  reopenJob,
  selectedBookingId,
  setSelectedBookingId,
  setStatusFilter,
  statusFilter,
  updateBookingStatus,
}: {
  account: LoginSession
  bookings: EventBooking[]
  closeJob: (bookingId: string, closure: JobClosure) => void
  onNewBooking: () => void
  onViewBeo: (bookingId: string) => void
  reopenJob: (bookingId: string) => void
  selectedBookingId?: string
  setSelectedBookingId: (id: string) => void
  setStatusFilter: (status: BookingStatus | 'All') => void
  statusFilter: BookingStatus | 'All'
  updateBookingStatus: (
    bookingId: string,
    direction: 'backward' | 'forward',
  ) => void
}) {
  const canAdvance = hasPermission(account.role, 'booking:advanceStatus')
  const canFallBack = hasPermission(account.role, 'booking:fallBackStatus')
  const canCreateBooking = hasPermission(account.role, 'booking:create')
  const bookingDisplayLimit = 6
  const [showAllBookings, setShowAllBookings] = useState(false)
  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) ?? bookings[0]
  const isFirstStatus = selectedBooking?.status === statusOrder[0]
  const isLastStatus = selectedBooking
    ? ['Completed', 'Lost', 'Cancelled'].includes(selectedBooking.status)
    : true
  const hasMoreBookings = bookings.length > bookingDisplayLimit
  const displayedBookings = showAllBookings
    ? bookings
    : bookings.slice(0, bookingDisplayLimit)
  const handleStatusFilter = (nextStatus: BookingStatus | 'All') => {
    setShowAllBookings(false)
    setStatusFilter(nextStatus)
  }

  return (
    <div className="bookings-layout">
      <section className="panel">
        <PanelHeader
          action={canCreateBooking ? 'New booking' : undefined}
          detail="Most bookings arrive by converting a lead. Create one here only when there is no lead to work from."
          onAction={canCreateBooking ? onNewBooking : undefined}
          title="Bookings"
        />
        <FilterBar setStatusFilter={handleStatusFilter} statusFilter={statusFilter} />
        <div className="booking-table">
          {displayedBookings.map((booking) => (
            <button
              className={
                selectedBooking?.id === booking.id
                  ? 'booking-record selected'
                  : 'booking-record'
              }
              key={booking.id}
              onClick={() => setSelectedBookingId(booking.id)}
              aria-pressed={selectedBooking?.id === booking.id}
              type="button"
            >
              <div>
                <strong>{booking.eventName}</strong>
                <span>{booking.account}</span>
              </div>
              <span>{shortDate(booking.date)}</span>
              <span>{booking.room}</span>
              <div className="booking-row-meta">
                <StatusBadge status={booking.status} />
                <em>{money(booking.forecastRevenue)}</em>
              </div>
            </button>
          ))}

          {hasMoreBookings && (
            <button
              className="see-more-row"
              onClick={() => setShowAllBookings((current) => !current)}
              type="button"
            >
              {showAllBookings
                ? 'Show first 6 bookings'
                : `See more (${bookings.length - bookingDisplayLimit} more)`}
            </button>
          )}
        </div>
      </section>

      {selectedBooking && (
        <aside className="detail-drawer">
          <div className="drawer-head">
            <div>
              <p className="eyebrow">{selectedBooking.id}</p>
              <h2>{selectedBooking.eventName}</h2>
            </div>
            <StatusBadge status={selectedBooking.status} />
          </div>
          <div className="detail-grid">
            <Detail label="Client" value={selectedBooking.account} />
            <Detail label="Contact" value={selectedBooking.contact} />
            <Detail label="Owner" value={selectedBooking.owner} />
            <Detail label="Venue" value={`${selectedBooking.venue}, ${selectedBooking.room}`} />
            <Detail
              label="Guest count"
              value={`${selectedBooking.expectedGuests} expected / ${selectedBooking.guaranteedGuests} guaranteed`}
            />
            <Detail label="Package" value={selectedBooking.packageName} />
            <Detail label="Payment" value={selectedBooking.paymentStatus} />
            <Detail label="Contract" value={selectedBooking.contractStatus} />
          </div>
          <div className="drawer-section">
            <h3>Next action</h3>
            <p>{selectedBooking.nextAction}</p>
          </div>
          <div className="drawer-section">
            <h3>Special requests</h3>
            <ul>
              {selectedBooking.specialRequests.map((request) => (
                <li key={request}>{request}</li>
              ))}
            </ul>
          </div>
          <div className="card-actions full-width view-beo-action">
            <button
              className="secondary-action full-width"
              onClick={() => onViewBeo(selectedBooking.id)}
              type="button"
            >
              <ClipboardList size={17} />
              View BEO
            </button>
          </div>

          <JobClosurePanel
            booking={selectedBooking}
            canClose={canAdvance}
            key={selectedBooking.id}
            onClose={(closure) => closeJob(selectedBooking.id, closure)}
            onReopen={() => reopenJob(selectedBooking.id)}
          />
          {(canFallBack || canAdvance) && (
            <div className="status-actions">
              {canFallBack && (
                <button
                  className="secondary-action"
                  disabled={isFirstStatus}
                  onClick={() => updateBookingStatus(selectedBooking.id, 'backward')}
                  type="button"
                >
                  <ChevronLeft size={17} />
                  Fall back
                </button>
              )}
              {canAdvance && (
                <button
                  className="primary-action"
                  disabled={isLastStatus}
                  onClick={() => updateBookingStatus(selectedBooking.id, 'forward')}
                  type="button"
                >
                  <CheckCircle2 size={17} />
                  Advance
                </button>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}

/**
 * Post-event closeout. Shown once the event date has passed (or the booking is
 * already Completed): capture the final numbers, then the job is done. Until
 * it is closed the dashboard keeps nagging about it.
 */
function JobClosurePanel({
  booking,
  canClose,
  onClose,
  onReopen,
}: {
  booking: EventBooking
  canClose: boolean
  onClose: (closure: JobClosure) => void
  onReopen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [actualGuests, setActualGuests] = useState(
    String(booking.actualGuests ?? booking.guaranteedGuests ?? ''),
  )
  const [finalRevenue, setFinalRevenue] = useState(
    String(booking.revenue || booking.forecastRevenue || ''),
  )
  const [outstanding, setOutstanding] = useState('0')
  const [notes, setNotes] = useState('')

  const closure = booking.closure

  if (closure) {
    return (
      <div className="drawer-section closure-section">
        <h3>
          <FileCheck2 size={16} />
          Job closed
        </h3>
        <div className="detail-grid">
          <Detail label="Closed" value={`${closure.closedAt} by ${closure.closedBy}`} />
          <Detail label="Actual guests" value={String(closure.actualGuests)} />
          <Detail label="Final revenue" value={money(closure.finalRevenue)} />
          <Detail label="Outstanding" value={money(closure.outstandingBalance)} />
        </div>
        {closure.notes && <p>{closure.notes}</p>}
        {canClose && (
          <button className="text-action" onClick={onReopen} type="button">
            Reopen job
          </button>
        )}
      </div>
    )
  }

  if (!isClosable(booking)) return null

  return (
    <div className="drawer-section closure-section">
      <h3>
        <TriangleAlert size={16} />
        Ready to close
      </h3>
      <p>
        This event finished on {booking.date} and has not been closed out yet.
      </p>
      {!canClose ? (
        <p className="panel-header-detail">Ask a manager to close this job.</p>
      ) : !open ? (
        <button className="primary-action full-width" onClick={() => setOpen(true)} type="button">
          <CheckCircle2 size={17} />
          Close the job
        </button>
      ) : (
        <div className="closure-form">
          <FormField label="Actual guests">
            <input
              onChange={(event) => setActualGuests(event.target.value)}
              type="number"
              value={actualGuests}
            />
          </FormField>
          <FormField label="Final revenue (THB)">
            <input
              onChange={(event) => setFinalRevenue(event.target.value)}
              type="number"
              value={finalRevenue}
            />
          </FormField>
          <FormField label="Outstanding balance (THB)">
            <input
              onChange={(event) => setOutstanding(event.target.value)}
              type="number"
              value={outstanding}
            />
          </FormField>
          <FormField asGroup label="Closing notes">
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What went well, what to carry into the next event, anything still owed..."
              value={notes}
            />
          </FormField>
          <div className="status-actions">
            <button className="secondary-action" onClick={() => setOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="primary-action"
              onClick={() =>
                onClose({
                  closedAt: toStampKey(new Date()),
                  closedBy: '',
                  actualGuests: Number(actualGuests) || 0,
                  finalRevenue: Number(finalRevenue) || 0,
                  outstandingBalance: Number(outstanding) || 0,
                  notes: notes.trim(),
                })
              }
              type="button"
            >
              <CheckCircle2 size={17} />
              Confirm close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** A job is closable once its event date has passed and it did not fall through. */
function isClosable(booking: EventBooking) {
  if (booking.closure) return false
  if (booking.status === 'Lost' || booking.status === 'Cancelled') return false
  if (booking.status === 'Inquiry') return false
  return booking.date < toDateKey(new Date())
}

/** Everything past its event date that nobody has closed out yet. */
function openJobsToClose(bookings: EventBooking[]) {
  return bookings.filter(isClosable).sort((first, second) => first.date.localeCompare(second.date))
}

function BeoListView({
  bookings,
  onSelect,
}: {
  bookings: EventBooking[]
  onSelect: (bookingId: string) => void
}) {
  const getBookingDate = (booking: EventBooking) => booking.date
  const availableMonths = availableMonthsOf(bookings, getBookingDate)
  const availableYears = availableYearsOf(bookings, getBookingDate)
  const [viewMode, setViewMode] = useState<ListViewMode>('grid')
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>('All')
  const [selectedMonth, setSelectedMonth] = useState(
    () => availableMonths[availableMonths.length - 1] ?? '',
  )
  const [selectedYear, setSelectedYear] = useState(
    () => availableYears[availableYears.length - 1] ?? '',
  )
  const visibleBookings = filterAndSortByTime(
    bookings,
    getBookingDate,
    timeFilter,
    selectedMonth,
    selectedYear,
  )

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader title="BEOs" />
        <ListViewControls
          availableMonths={availableMonths}
          availableYears={availableYears}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          setTimeFilter={setTimeFilter}
          setViewMode={setViewMode}
          timeFilter={timeFilter}
          viewMode={viewMode}
        />
        {viewMode === 'grid' ? (
          <div className="resource-grid">
            {visibleBookings.map((booking) => (
              <button
                className="resource-card"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <div className="resource-head">
                  <span>
                    {booking.beoNumber} / Rev {booking.revision}
                  </span>
                  <strong>{booking.eventName}</strong>
                </div>
                <p>
                  {booking.date} · {booking.venue}, {booking.room}
                </p>
                <div className="resource-meta">
                  <span>{booking.status}</span>
                  <span>{booking.guaranteedGuests} guaranteed</span>
                  <span>{money(booking.forecastRevenue)}</span>
                </div>
              </button>
            ))}
            {!visibleBookings.length && <p>No BEOs for this period.</p>}
          </div>
        ) : (
          <div className="banner-list">
            {visibleBookings.map((booking) => (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <span className="banner-status">{booking.status}</span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {booking.beoNumber} / Rev {booking.revision} · {booking.date}
                  </span>
                </div>
                <span className="banner-meta">
                  {booking.venue}, {booking.room}
                </span>
                <strong className="banner-value">{money(booking.forecastRevenue)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {!visibleBookings.length && <p>No BEOs for this period.</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function BeoView({
  acknowledgeDepartment,
  appendBeoHistory,
  booking,
  departments,
  markBeoRevised,
  markClientApproved,
  onBack,
  propertyProfile,
  session,
  submitDepartmentInstruction,
}: {
  acknowledgeDepartment: (bookingId: string, dept: BeoDepartment, by: string) => void
  appendBeoHistory: (bookingId: string, note: string) => void
  booking: EventBooking
  departments: BeoDepartment[]
  markBeoRevised: (bookingId: string) => void
  markClientApproved: (bookingId: string) => void
  onBack: () => void
  propertyProfile: PropertyProfile
  session: LoginSession
  submitDepartmentInstruction: (
    bookingId: string,
    dept: BeoDepartment,
    text: string,
    by: string,
  ) => void
}) {
  const isDepartmentViewer = session.role === 'beo_viewer'
  // Show the configured departments plus any this booking already has data for,
  // so renaming/removing a department in Settings never hides existing sign-offs.
  const bookingDepartments = Array.from(
    new Set([
      ...departments,
      ...Object.keys(booking.departmentInstructions ?? {}),
      ...Object.keys(booking.departmentAcks ?? {}),
      ...(booking.departmentMessages ?? []).map((message) => message.department),
    ]),
  )
  const canEditInstructions = hasPermission(session.role, 'proposal:edit')
  const viewerName = session.displayName.trim() || 'Department user'
  const beoHistory = [...(booking.beoHistory ?? [])].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  )
  const readinessItems = [
    {
      label: 'Plan and contract',
      detail: `Contract ${booking.contractStatus.toLowerCase()}; payment ${booking.paymentStatus.toLowerCase()}.`,
      ready: booking.contractStatus === 'Signed',
    },
    {
      label: 'Date, time, location',
      detail: `${booking.date}, ${booking.startTime}-${booking.endTime}, ${booking.venue}.`,
      ready: Boolean(booking.date && booking.startTime && booking.endTime && booking.room),
    },
    {
      label: 'Guests and seating',
      detail: `${booking.guaranteedGuests} guaranteed guests; ${booking.layout}.`,
      ready: booking.guaranteedGuests > 0 && Boolean(booking.layout),
    },
    {
      label: 'Menu and service timing',
      detail: `${booking.menu.length} menu items with service window in timeline.`,
      ready: booking.menu.length > 0,
    },
    {
      label: 'Room setup and decor',
      detail: `Setup ${booking.setupTime}; layout and special setup notes captured.`,
      ready: Boolean(booking.setupTime && booking.layout),
    },
    {
      label: 'AV and technical',
      detail: `${booking.av.length} AV or technical requirements listed.`,
      ready: booking.av.length > 0,
    },
    {
      label: 'Staffing',
      detail: `${booking.staffing.length} staffing requirements listed.`,
      ready: booking.staffing.length > 0,
    },
    {
      label: 'Client instructions',
      detail: `${booking.specialRequests.length} client or event instructions listed.`,
      ready: booking.specialRequests.length > 0,
    },
    {
      label: 'Department distribution',
      detail: 'Kitchen, operations, AV, service, finance, and sales responsibilities mapped.',
      ready: ['Confirmed', 'Completed'].includes(booking.status),
    },
    {
      label: 'Live revisions',
      detail: `Revision ${booking.revision}; local updates are tracked before PDF/share.`,
      ready: booking.revision > 0,
    },
  ]
  const readyCount = readinessItems.filter((item) => item.ready).length
  const readinessPercent = Math.round((readyCount / readinessItems.length) * 100)
  const departmentResponsibilities = [
    ['Sales', 'Contract, client notes, revision approval'],
    ['Banquet operations', 'Room setup, logistics, vendor access, teardown'],
    ['Kitchen', 'Menu, guaranteed counts, dietary notes, service timing'],
    ['AV', 'Audio, display, microphones, technical support'],
    ['Service', 'Staffing, guest flow, table service, special instructions'],
    ['Finance', 'Deposit, proforma invoice, final billing controls'],
  ]
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  const paperDocument = (
    <div className="paper print-doc">
          <div className="paper-head">
            <div>
              <span>EventPilot</span>
              <strong>{booking.eventName}</strong>
            </div>
            <div>
              <span>BEO</span>
              <strong>
                {booking.beoNumber} / Rev {booking.revision}
              </strong>
            </div>
          </div>

          <div className="paper-grid">
            <Detail label="Client" value={booking.account} />
            <Detail label="Contact" value={booking.contact} />
            <Detail label="Date" value={booking.date} />
            <Detail label="Time" value={`${booking.startTime}-${booking.endTime}`} />
            <Detail label="Room" value={`${booking.venue}, ${booking.room}`} />
            <Detail label="Setup" value={`${booking.setupTime} / Teardown ${booking.breakdownTime}`} />
            <Detail label="Guests" value={`${booking.guaranteedGuests} guaranteed`} />
            <Detail label="Owner" value={booking.owner} />
          </div>

          <PaperSection title="Timeline">
            <div className="rundown">
              <span>{booking.setupTime}</span>
              <p>Room setup and vendor access</p>
              <span>{booking.startTime}</span>
              <p>Guest arrival and service begins</p>
              <span>{booking.endTime}</span>
              <p>Event close and client farewell</p>
              <span>{booking.breakdownTime}</span>
              <p>Teardown and room reset</p>
            </div>
          </PaperSection>

          <PaperSection title="Contract and distribution">
            <div className="paper-grid compact-paper-grid">
              <Detail label="Contract status" value={booking.contractStatus} />
              <Detail label="Payment status" value={booking.paymentStatus} />
              <Detail label="Revision" value={`Rev ${booking.revision}`} />
              <Detail label="Distribution" value="Sales, operations, kitchen, AV, finance" />
              <Detail label="Billed to" value={booking.billingCompany || booking.account} />
              <Detail label="Payment method" value={booking.paymentMethod || 'Not specified'} />
              <Detail label="Company name" value={booking.billingCompanyName || '—'} />
              <Detail label="TAX ID" value={booking.billingTaxId || '—'} />
              <Detail label="Address" value={booking.billingAddress || '—'} />
            </div>
          </PaperSection>

          <PaperSection title="Room setup and layout">
            <div className="paper-grid compact-paper-grid">
              <Detail label="Layout" value={booking.layout} />
              <Detail label="Setup access" value={booking.setupTime} />
              <Detail label="Teardown" value={booking.breakdownTime} />
              <Detail label="Guest count" value={`${booking.guaranteedGuests} guaranteed / ${booking.expectedGuests} expected`} />
            </div>
          </PaperSection>

          <PaperSection title="Food and beverage">
            <TagList items={booking.menu} />
          </PaperSection>

          <PaperSection title="AV, staffing, vendors">
            <div className="three-column-list">
              <TagList items={booking.av} label="AV" />
              <TagList items={booking.staffing} label="Staffing" />
              <TagList items={booking.vendors.length ? booking.vendors : ['No external vendors']} label="Vendors" />
            </div>
          </PaperSection>

          <PaperSection title="Department responsibilities">
            <div className="responsibility-grid">
              {departmentResponsibilities.map(([department, responsibility]) => (
                <div key={department}>
                  <strong>{department}</strong>
                  <span>{responsibility}</span>
                </div>
              ))}
            </div>
          </PaperSection>

          <PaperSection title="Special instructions">
            <ul className="paper-list">
              {booking.specialRequests.map((request) => (
                <li key={request}>{request}</li>
              ))}
            </ul>
          </PaperSection>

          <div className="signature-row">
            <div className="signatory-column">
              <strong>{booking.account}</strong>
              <small>Client approval — {booking.contact}</small>
              {booking.clientApprovedAt && (
                <small className="approval-status">
                  ✓ Approved {booking.clientApprovedAt}
                </small>
              )}
            </div>
            <div className="signatory-column">
              <strong>{propertyProfile.signatoryName || 'Authorized signatory'}</strong>
              <small>
                Operations approval — {propertyProfile.signatoryTitle || 'Operations'}
              </small>
            </div>
            <div className="signatory-column">
              <strong>{propertyProfile.signatoryName || 'Authorized signatory'}</strong>
              <small>Finance approval — {propertyProfile.signatoryTitle || 'Finance'}</small>
            </div>
          </div>
          {!booking.clientApprovedAt && (
            <div className="card-actions no-print">
              <button
                className="secondary-action"
                onClick={() => markClientApproved(booking.id)}
                type="button"
              >
                <CheckCircle2 size={16} />
                Mark client approved
              </button>
            </div>
          )}
    </div>
  )

  if (showPdfPreview) {
    return (
      <div className="page-stack">
        <button
          className="text-action back-action no-print"
          onClick={() => setShowPdfPreview(false)}
          type="button"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <section className="document-preview single-document">
          <div className="document-toolbar no-print">
            <div>
              <p className="eyebrow">Banquet Event Order</p>
              <h2>{booking.beoNumber}</h2>
            </div>
            <div className="toolbar-actions">
              <button
                className="secondary-action"
                onClick={() =>
                  shareDocument(
                    {
                      title: booking.beoNumber,
                      text: `${booking.beoNumber} Rev ${booking.revision} — ${booking.eventName}, ${booking.date} at ${booking.venue}.`,
                    },
                    () => appendBeoHistory(booking.id, 'Summary copied to clipboard'),
                  )
                }
                type="button"
              >
                <Send size={16} />
                Share
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  appendBeoHistory(booking.id, 'Printed / exported as PDF')
                  window.print()
                }}
                type="button"
              >
                <Download size={16} />
                Print
              </button>
            </div>
          </div>
          {paperDocument}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to BEOs
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">Banquet Event Order</p>
            <h2>{booking.beoNumber}</h2>
          </div>
          <div className="toolbar-actions">
            <button
              className="secondary-action"
              onClick={() =>
                shareDocument(
                  {
                    title: booking.beoNumber,
                    text: `${booking.beoNumber} Rev ${booking.revision} — ${booking.eventName}, ${booking.date} at ${booking.venue}.`,
                  },
                  () => appendBeoHistory(booking.id, 'Summary copied to clipboard'),
                )
              }
              type="button"
            >
              <Send size={16} />
              Share
            </button>
            <button
              className="secondary-action"
              onClick={() => setShowPdfPreview(true)}
              type="button"
            >
              <Download size={16} />
              View PDF
            </button>
            {!isDepartmentViewer && (
              <button
                className="primary-action"
                onClick={() => markBeoRevised(booking.id)}
                type="button"
              >
                <RefreshCcw size={16} />
                Mark revised
              </button>
            )}
          </div>
        </div>

        <section className="beo-control-panel no-print">
          <div className="beo-readiness-head">
            <div>
              <p className="eyebrow">Operational readiness</p>
              <h3>{readyCount}/{readinessItems.length} BEO controls complete</h3>
            </div>
            <strong>{readinessPercent}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${readinessPercent}%` }} />
          </div>
          <div className="beo-readiness-grid">
            {readinessItems.map((item) => (
              <div className={item.ready ? 'readiness-item ready' : 'readiness-item'} key={item.label}>
                <CheckCircle2 size={16} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="beo-control-panel beo-departments no-print">
          <div className="beo-readiness-head">
            <div>
              <p className="eyebrow">Department instructions</p>
              <h3>
                {isDepartmentViewer
                  ? `${session.department} sign-off`
                  : 'Sign-off by responsible department'}
              </h3>
            </div>
            <strong>
              {bookingDepartments.filter((dept) => booking.departmentAcks?.[dept]).length}/
              {bookingDepartments.length} acknowledged
            </strong>
          </div>
          <div className="department-instruction-list">
            {bookingDepartments.map((dept) => (
              <DepartmentInstructionCard
                ack={booking.departmentAcks?.[dept]}
                canEdit={canEditInstructions}
                department={dept}
                instruction={booking.departmentInstructions?.[dept] ?? ''}
                isMine={isDepartmentViewer && session.department === dept}
                key={dept}
                messages={(booking.departmentMessages ?? []).filter(
                  (message) => message.department === dept,
                )}
                onAcknowledge={() => acknowledgeDepartment(booking.id, dept, viewerName)}
                onSubmit={(text) =>
                  submitDepartmentInstruction(booking.id, dept, text, viewerName)
                }
              />
            ))}
          </div>
        </section>

        {paperDocument}
      </section>

      <section className="panel no-print">
        <PanelHeader title="History" />
        <div className="timeline">
          {beoHistory.length ? (
            beoHistory.map((entry) => (
              <div className="timeline-entry" key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{entry.note}</strong>
                  <span>{entry.timestamp}</span>
                </div>
              </div>
            ))
          ) : (
            <p>No history recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function DepartmentInstructionCard({
  ack,
  canEdit,
  department,
  instruction,
  isMine,
  messages,
  onAcknowledge,
  onSubmit,
}: {
  ack?: DepartmentAck
  canEdit: boolean
  department: BeoDepartment
  instruction: string
  isMine: boolean
  messages: DepartmentMessage[]
  onAcknowledge: () => void
  onSubmit: (text: string) => void
}) {
  // The textarea holds an unsent draft; nothing reaches the department until it
  // is submitted, so the stored instruction is always what was actually sent.
  const [draft, setDraft] = useState(instruction)
  const trimmedDraft = draft.trim()
  const canSend = Boolean(trimmedDraft) && trimmedDraft !== instruction
  const timeline = [...messages].sort((first, second) =>
    first.at.localeCompare(second.at),
  )

  return (
    <div className={`department-instruction${isMine ? ' is-mine' : ''}`}>
      <div className="department-instruction-head">
        <strong>{department}</strong>
        {ack ? (
          <span className="dept-ack ok">
            <CheckCircle2 size={14} />
            Acknowledged by {ack.by} · {ack.at}
          </span>
        ) : (
          <span className="dept-ack pending">Awaiting acknowledgement</span>
        )}
      </div>
      {canEdit ? (
        <>
          <textarea
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`What does the client need from ${department}?`}
            value={draft}
          />
          <div className="department-instruction-actions">
            <span className="department-instruction-hint">
              {canSend
                ? 'Not sent yet — submit to notify the department.'
                : instruction
                  ? 'Current instructions are up to date.'
                  : 'No instructions sent to this department yet.'}
            </span>
            <button
              className="primary-action"
              disabled={!canSend}
              onClick={() => onSubmit(draft)}
              type="button"
            >
              <Send size={15} />
              {instruction ? 'Send update' : 'Send to department'}
            </button>
          </div>
        </>
      ) : (
        <p>{instruction || 'No specific instructions for this department.'}</p>
      )}
      {isMine && instruction && !ack && (
        <button className="primary-action" onClick={onAcknowledge} type="button">
          <CheckCircle2 size={16} />
          Acknowledge instructions
        </button>
      )}
      {isMine && ack && (
        <span className="dept-ack-note">You acknowledged this on {ack.at}.</span>
      )}
      <div className="department-message-log">
        <span className="department-message-log-title">
          <MessageSquare size={13} />
          Message timeline
        </span>
        {timeline.length ? (
          <ol className="department-message-timeline">
            {timeline.map((message) => (
              <li className={`department-message ${message.kind}`} key={message.id}>
                <span className="department-message-dot" />
                <div>
                  <p>{message.text}</p>
                  <span>
                    {message.kind === 'acknowledgement' ? 'Acknowledged' : 'Sent'} by{' '}
                    {message.by} · {message.at}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="department-message-empty">Nothing recorded for this department yet.</p>
        )}
      </div>
    </div>
  )
}

function LineItemsEditor({
  catalog = [],
  editable,
  lineItems,
  onChange,
}: {
  catalog?: Product[]
  editable: boolean
  lineItems: LineItem[]
  onChange: (next: LineItem[]) => void
}) {
  const updateItem = <K extends keyof LineItem>(id: string, field: K, value: LineItem[K]) => {
    onChange(lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }
  const addItem = () => {
    onChange([
      ...lineItems,
      { id: `LI-${Date.now()}`, description: '', quantity: 1, unitPrice: 0 },
    ])
  }
  const addFromCatalog = (productId: string) => {
    const product = catalog.find((item) => item.id === productId)
    if (!product) return
    // Tiered items store the first tier in `price`; fall back to the tier list.
    const unitPrice = product.price ?? product.priceTiers?.[0]?.price ?? 0
    onChange([
      ...lineItems,
      {
        id: `LI-${Date.now()}`,
        description: product.name,
        quantity: 1,
        unitPrice,
        productId: product.id,
        tierIndex: product.priceTiers?.length ? 0 : undefined,
      },
    ])
  }
  const removeItem = (id: string) => {
    onChange(lineItems.filter((item) => item.id !== id))
  }
  // The catalog product an item's options come from — matched by id when
  // added from the catalog, or by name so pre-existing items pick it up too.
  const optionsFor = (item: LineItem) => {
    const product = item.productId
      ? catalog.find((entry) => entry.id === item.productId)
      : catalog.find((entry) => entry.name === item.description)
    return { product, tiers: product?.priceTiers ?? [] }
  }
  const selectTier = (item: LineItem, tiers: PriceTier[], index: number, productId: string) => {
    const tier = tiers[index]
    if (!tier) return
    onChange(
      lineItems.map((entry) =>
        entry.id === item.id
          ? { ...entry, productId, tierIndex: index, unitPrice: tier.price }
          : entry,
      ),
    )
  }
  // Group catalog options by category, preserving the seed order.
  const catalogGroups = catalog.reduce<{ category: string; items: Product[] }[]>(
    (groups, product) => {
      const group = groups.find((entry) => entry.category === product.category)
      if (group) group.items.push(product)
      else groups.push({ category: product.category, items: [product] })
      return groups
    },
    [],
  )

  return (
    <div className="line-items-editor">
      <div className="line-items-row line-items-header">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span>Total</span>
        <span />
      </div>
      {lineItems.map((item) => {
        const { product, tiers } = optionsFor(item)
        return (
          <div className="line-items-row" key={item.id}>
            <div className="line-item-desc">
              {editable ? (
                <input
                  onChange={(event) => updateItem(item.id, 'description', event.target.value)}
                  value={item.description}
                />
              ) : (
                <span>{item.description}</span>
              )}
              {editable && product && tiers.length > 0 && (
                <select
                  aria-label={`${item.description || 'Line item'} option`}
                  onChange={(event) => selectTier(item, tiers, Number(event.target.value), product.id)}
                  value={item.tierIndex ?? 0}
                >
                  {tiers.map((tier, index) => (
                    <option key={index} value={index}>
                      {tier.label ? `${tier.label} — ${money(tier.price)}` : money(tier.price)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {editable ? (
              <input
                min="0"
                onChange={(event) => updateItem(item.id, 'quantity', Number(event.target.value))}
                type="number"
                value={item.quantity}
              />
            ) : (
              <span>{item.quantity}</span>
            )}
            {editable ? (
              <input
                min="0"
                onChange={(event) => updateItem(item.id, 'unitPrice', Number(event.target.value))}
                type="number"
                value={item.unitPrice}
              />
            ) : (
              <span>{money(item.unitPrice)}</span>
            )}
            <strong>{money(item.quantity * item.unitPrice)}</strong>
            {editable ? (
              <button
                aria-label="Remove line item"
                className="text-action"
                onClick={() => removeItem(item.id)}
                type="button"
              >
                &times;
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}
      {editable && (
        <div className="line-items-actions">
          <button className="secondary-action" onClick={addItem} type="button">
            <Plus size={14} />
            Add item
          </button>
          {catalogGroups.length > 0 && (
            <label className="catalog-add">
              <span>Add from catalog</span>
              <select
                onChange={(event) => {
                  if (event.target.value) addFromCatalog(event.target.value)
                  event.target.selectedIndex = 0
                }}
                value=""
              >
                <option value="">Select a package or item…</option>
                {catalogGroups.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((product) => {
                      const unitPrice = product.price ?? product.priceTiers?.[0]?.price ?? 0
                      return (
                        <option key={product.id} value={product.id}>
                          {product.name} — {money(unitPrice)}
                        </option>
                      )
                    })}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

const DISCOUNT_MODE_LABELS: Record<DiscountMode, string> = {
  none: 'No discount',
  percent: 'Percent',
  value: 'Amount',
  promo: 'Promo code',
}

function DiscountControl({
  discount,
  editable,
  onChange,
}: {
  discount: Discount
  editable: boolean
  onChange: (next: Discount) => void
}) {
  return (
    <div className="discount-control">
      {editable && (
        <div className="segmented-control">
          {(['none', 'percent', 'value', 'promo'] as DiscountMode[]).map((mode) => (
            <button
              className={discount.mode === mode ? 'segment active' : 'segment'}
              key={mode}
              onClick={() => onChange({ mode, value: mode === 'none' ? 0 : discount.value, code: discount.code })}
              type="button"
            >
              {DISCOUNT_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}
      {discount.mode !== 'none' && (
        <div className="discount-fields">
          {editable ? (
            <FormField label={discount.mode === 'percent' ? 'Percent off' : 'Amount off'}>
              <input
                min="0"
                onChange={(event) => onChange({ ...discount, value: Number(event.target.value) })}
                type="number"
                value={discount.value}
              />
            </FormField>
          ) : (
            <span>
              {discount.mode === 'percent' ? `${discount.value}% off` : `${money(discount.value)} off`}
            </span>
          )}
          {discount.mode === 'promo' &&
            (editable ? (
              <FormField label="Promo code">
                <input
                  onChange={(event) => onChange({ ...discount, code: event.target.value })}
                  value={discount.code ?? ''}
                />
              </FormField>
            ) : (
              discount.code && <span>Code: {discount.code}</span>
            ))}
        </div>
      )}
    </div>
  )
}

/** Same arithmetic as documentTotal, over a frozen proposal snapshot. */
function snapshotTotal(snapshot: ProposalSnapshot) {
  const subtotal = snapshot.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )
  const netOfDiscount = subtotal - discountAmount(subtotal, snapshot.discount)
  return netOfDiscount * 1.1 * 1.07
}

function documentTotal(booking: EventBooking) {
  const lineItems = getLineItems(booking)
  const discount = getDiscount(booking)
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const netOfDiscount = subtotal - discountAmount(subtotal, discount)
  return netOfDiscount * 1.1 * 1.07
}

function DocumentsListView({
  bookings,
  documentType,
  onSelect,
}: {
  bookings: EventBooking[]
  documentType: 'Proposals' | 'Invoices'
  onSelect: (bookingId: string) => void
}) {
  const getBookingDate = (booking: EventBooking) => booking.date
  const availableMonths = availableMonthsOf(bookings, getBookingDate)
  const availableYears = availableYearsOf(bookings, getBookingDate)
  const [viewMode, setViewMode] = useState<ListViewMode>('grid')
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>('All')
  const [selectedMonth, setSelectedMonth] = useState(
    () => availableMonths[availableMonths.length - 1] ?? '',
  )
  const [selectedYear, setSelectedYear] = useState(
    () => availableYears[availableYears.length - 1] ?? '',
  )
  const visibleBookings = filterAndSortByTime(
    bookings,
    getBookingDate,
    timeFilter,
    selectedMonth,
    selectedYear,
  )

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader title={documentType} />
        <ListViewControls
          availableMonths={availableMonths}
          availableYears={availableYears}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          setSelectedMonth={setSelectedMonth}
          setSelectedYear={setSelectedYear}
          setTimeFilter={setTimeFilter}
          setViewMode={setViewMode}
          timeFilter={timeFilter}
          viewMode={viewMode}
        />
        {viewMode === 'grid' ? (
          <div className="resource-grid">
            {visibleBookings.map((booking) => (
              <button
                className="resource-card"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <div className="resource-head">
                  <span>{booking.id}</span>
                  <strong>{booking.eventName}</strong>
                </div>
                <p>
                  {booking.account} · {booking.date}
                </p>
                <div className="resource-meta">
                  <span>{booking.status}</span>
                  <span>{money(documentTotal(booking))} estimated</span>
                </div>
              </button>
            ))}
            {!visibleBookings.length && <p>No bookings for this period.</p>}
          </div>
        ) : (
          <div className="banner-list">
            {visibleBookings.map((booking) => (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <span className="banner-status">{booking.status}</span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {booking.id} · {booking.account}
                  </span>
                </div>
                <span className="banner-meta">{booking.date}</span>
                <strong className="banner-value">
                  {money(documentTotal(booking))} estimated
                </strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {!visibleBookings.length && <p>No bookings for this period.</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function DocumentsView({
  account,
  appendDocumentHistory,
  booking,
  catalog,
  documentType,
  onBack,
  onOpenAgreement,
  onOpenBeo,
  propertyProfile,
  registerUnsavedChangesGuard,
  runGuarded,
  saveProposalRevision,
  updateBookingLineItems,
}: {
  account: LoginSession
  appendDocumentHistory: (bookingId: string, note: string) => void
  booking: EventBooking
  catalog: Product[]
  documentType: 'Proposals' | 'Invoices'
  onBack: () => void
  onOpenAgreement?: () => void
  onOpenBeo: () => void
  propertyProfile: PropertyProfile
  registerUnsavedChangesGuard: (guard: { isDirty: () => boolean; message: string } | null) => void
  runGuarded: (action: () => void) => void
  saveProposalRevision: (
    bookingId: string,
    lineItems: LineItem[],
    discount: Discount,
    savedBy: string,
    note: string,
  ) => void
  updateBookingLineItems: (bookingId: string, lineItems: LineItem[], discount: Discount) => void
}) {
  const isProposal = documentType === 'Proposals'
  const [isEditing, setIsEditing] = useState(false)
  const [viewingRevision, setViewingRevision] = useState<ProposalRevision | null>(null)
  // What the client last received. Invoices keep overwriting in place; only
  // proposals are versioned, because only proposals go back and forth.
  const proposalRevisions = [...(booking.proposalRevisions ?? [])].sort(
    (first, second) => first.number - second.number,
  )
  const currentRevision = booking.proposalRevision ?? 0
  const [revisionNote, setRevisionNote] = useState('')
  const canEdit = hasPermission(account.role, 'proposal:edit')
  const savedLineItems = getLineItems(booking)
  const savedDiscount = getDiscount(booking)
  // While editing, line items and discount are held as a local draft — nothing
  // reaches the booking until Save changes is clicked.
  const [draftLineItems, setDraftLineItems] = useState<LineItem[]>(savedLineItems)
  const [draftDiscount, setDraftDiscount] = useState<Discount>(savedDiscount)
  const isDirty =
    JSON.stringify(draftLineItems) !== JSON.stringify(savedLineItems) ||
    JSON.stringify(draftDiscount) !== JSON.stringify(savedDiscount)
  const lineItems = isEditing ? draftLineItems : savedLineItems
  const discount = isEditing ? draftDiscount : savedDiscount
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountValue = discountAmount(subtotal, discount)
  const netOfDiscount = subtotal - discountValue
  const serviceCharge = netOfDiscount * 0.1
  const tax = (netOfDiscount + serviceCharge) * 0.07
  const total = netOfDiscount + serviceCharge + tax
  const documentHistory = [...(booking.documentHistory ?? [])].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  )

  const unsavedChangesMessage = `Discard unsaved changes to this ${documentType === 'Proposals' ? 'proposal' : 'invoice'}?`
  // Step 4 of the sales flow: an invoice should only go out once the client's
  // countersigned agreement is actually on file. Surfaced as a warning rather
  // than a hard block so existing bookings are not stranded.
  const signedAgreementOnFile = Boolean(booking.agreement?.signedFile)

  // Any navigation away from this view — including clicks elsewhere in the app
  // like the sidebar — routes through the shared runGuarded/confirm-dialog
  // mechanism, using this as the dirtiness check. Cleared on unmount.
  useEffect(() => {
    registerUnsavedChangesGuard({
      isDirty: () => isEditing && isDirty,
      message: unsavedChangesMessage,
    })
    return () => registerUnsavedChangesGuard(null)
  }, [isEditing, isDirty, unsavedChangesMessage, registerUnsavedChangesGuard])

  const handleStartEditing = () => {
    setDraftLineItems(savedLineItems)
    setDraftDiscount(savedDiscount)
    setIsEditing(true)
  }
  const handleCancelEditing = () => {
    runGuarded(() => setIsEditing(false))
  }
  const handleSaveEditing = () => {
    if (isProposal) {
      saveProposalRevision(
        booking.id,
        draftLineItems,
        draftDiscount,
        account.displayName.trim() || 'Unknown user',
        revisionNote.trim(),
      )
      setRevisionNote('')
    } else {
      updateBookingLineItems(booking.id, draftLineItems, draftDiscount)
      appendDocumentHistory(booking.id, 'Line items updated')
    }
    setIsEditing(false)
  }
  const handleBack = () => {
    runGuarded(onBack)
  }
  const handleLineItemsChange = (nextItems: LineItem[]) => {
    setDraftLineItems(nextItems)
  }
  const handleDiscountChange = (nextDiscount: Discount) => {
    setDraftDiscount(nextDiscount)
  }
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  const shareWithClient = () =>
    shareDocument(
      {
        title: `${booking.eventName} — ${documentType === 'Proposals' ? 'Proposal' : 'Proforma invoice'}`,
        text: `${booking.account}: ${money(total)} total for ${booking.eventName} on ${booking.date}.`,
      },
      () => appendDocumentHistory(booking.id, 'Summary copied to clipboard'),
    )

  const paperDocument = (
    <div className="paper print-doc">
        <div className="paper-head">
          <div>
            <span>EventPilot</span>
            <strong>{documentType === 'Proposals' ? 'Event Proposal' : 'Proforma Invoice'}</strong>
          </div>
          <div>
            <span>{booking.id}</span>
            <strong>
              {isProposal
                ? currentRevision > 0
                  ? `Revision ${currentRevision}`
                  : 'Draft'
                : booking.date}
            </strong>
          </div>
        </div>

        <div className="paper-grid">
          <Detail label="Prepared for" value={booking.account} />
          <Detail label="Contact" value={booking.contact} />
          <Detail label="Event type" value={booking.eventType} />
          <Detail label="Package" value={booking.packageName} />
          <Detail label="Venue" value={`${booking.venue}, ${booking.room}`} />
          <Detail label="Guests" value={`${booking.expectedGuests} expected`} />
        </div>

        {(booking.billingCompanyName || booking.billingAddress || booking.billingTaxId) && (
          <PaperSection title="Bill to">
            <div className="paper-grid compact-paper-grid">
              <Detail label="Company name" value={booking.billingCompanyName || booking.account} />
              <Detail label="TAX ID" value={booking.billingTaxId || '—'} />
              <Detail label="Address" value={booking.billingAddress || '—'} />
            </div>
          </PaperSection>
        )}

        <PaperSection title="Line items">
          <LineItemsEditor
            catalog={catalog}
            editable={isEditing}
            lineItems={lineItems}
            onChange={handleLineItemsChange}
          />
        </PaperSection>

        {isProposal && isEditing && (
          <div className="revision-note-field no-print">
            <label htmlFor="proposal-revision-note">
              What changed in Revision {currentRevision + 1}?
            </label>
            <input
              id="proposal-revision-note"
              onChange={(event) => setRevisionNote(event.target.value)}
              placeholder="Client moved to the Lawn and added a canape round"
              value={revisionNote}
            />
          </div>
        )}

        {(isEditing || discount.mode !== 'none') && (
          <PaperSection title="Discount">
            <DiscountControl
              discount={discount}
              editable={isEditing}
              onChange={handleDiscountChange}
            />
          </PaperSection>
        )}

        <div className="invoice-table">
          <div>
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          {discountValue > 0 && (
            <div>
              <span>
                Discount{discount.mode === 'promo' && discount.code ? ` (${discount.code})` : ''}
              </span>
              <strong>-{money(discountValue)}</strong>
            </div>
          )}
          <div>
            <span>Service charge 10%</span>
            <strong>{money(serviceCharge)}</strong>
          </div>
          <div>
            <span>VAT 7%</span>
            <strong>{money(tax)}</strong>
          </div>
          <div className="total-row">
            <span>Estimated total</span>
            <strong>{money(total)}</strong>
          </div>
          <div>
            <span>Deposit due</span>
            <strong>{money(booking.depositDue)}</strong>
          </div>
        </div>

        <div className="proposal-signature-row">
          <div className="signatory-column">
            <strong>{propertyProfile.signatoryName || 'Authorized signatory'}</strong>
            <small>
              {propertyProfile.name} — {propertyProfile.signatoryTitle || 'Management'}
            </small>
          </div>
          <div className="signatory-column">
            <strong>{booking.account}</strong>
            <small>Client acceptance — {booking.contact}</small>
          </div>
        </div>
    </div>
  )

  if (viewingRevision) {
    return (
      <ProposalRevisionView
        onBack={() => setViewingRevision(null)}
        propertyProfile={propertyProfile}
        revision={viewingRevision}
      />
    )
  }

  if (showPdfPreview) {
    return (
      <div className="page-stack">
        <button
          className="text-action back-action no-print"
          onClick={() => setShowPdfPreview(false)}
          type="button"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        <section className="document-preview single-document">
          <div className="document-toolbar no-print">
            <div>
              <p className="eyebrow">
                {documentType === 'Proposals' ? 'Proposal' : 'Proforma invoice'}
              </p>
              <h2>{booking.eventName}</h2>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-action" onClick={shareWithClient} type="button">
                <Send size={16} />
                Share
              </button>
              <button
                className="primary-action"
                onClick={() => {
                  appendDocumentHistory(booking.id, 'Printed / exported as PDF')
                  window.print()
                }}
                type="button"
              >
                <Download size={16} />
                Print
              </button>
            </div>
          </div>
          {paperDocument}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={handleBack} type="button">
        <ChevronLeft size={16} />
        Back to {documentType}
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">
              {isProposal
                ? `Proposal · ${currentRevision > 0 ? `Revision ${currentRevision}` : 'Draft'}`
                : 'Proforma invoice'}
            </p>
            <h2>{booking.eventName}</h2>
          </div>
          <div className="toolbar-actions">
            <button className="secondary-action" onClick={onOpenBeo} type="button">
              <ClipboardList size={16} />
              Open BEO
            </button>
            {isProposal && onOpenAgreement && (
              <button className="secondary-action" onClick={() => runGuarded(onOpenAgreement)} type="button">
                <Scale size={16} />
                {booking.agreement ? 'Open agreement' : 'Convert to agreement'}
              </button>
            )}
            {canEdit &&
              (isEditing ? (
                <>
                  <button className="secondary-action" onClick={handleCancelEditing} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-action"
                    disabled={!isDirty}
                    onClick={handleSaveEditing}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    {isProposal ? `Save as revision ${currentRevision + 1}` : 'Save changes'}
                  </button>
                </>
              ) : (
                <button className="primary-action" onClick={handleStartEditing} type="button">
                  {isProposal ? 'Edit proposal' : 'Edit line items'}
                </button>
              ))}
            <button className="secondary-action" onClick={shareWithClient} type="button">
              <Send size={16} />
              Send to client
            </button>
            <button
              className="secondary-action"
              onClick={() => setShowPdfPreview(true)}
              type="button"
            >
              <Download size={16} />
              View PDF
            </button>
          </div>
        </div>

        {!isProposal && !signedAgreementOnFile && (
          <div className="gate-banner no-print">
            <TriangleAlert size={18} />
            <div>
              <strong>No signed agreement on file</strong>
              <span>
                {booking.agreement
                  ? 'The agreement exists but the countersigned copy has not been uploaded yet. Upload it before sending this invoice.'
                  : 'This booking has no agreement yet. Generate one from the proposal and upload the signed copy before sending this invoice.'}
              </span>
            </div>
            {onOpenAgreement && (
              <button className="secondary-action" onClick={() => runGuarded(onOpenAgreement)} type="button">
                <Scale size={16} />
                {booking.agreement ? 'Open agreement' : 'Create agreement'}
              </button>
            )}
          </div>
        )}

        {paperDocument}
      </section>

      {isProposal && (
        <section className="panel no-print">
          <PanelHeader
            detail="Every save cuts a numbered revision. Open one to read exactly what the client received."
            title="Revisions"
          />
          <div className="banner-list">
            {proposalRevisions
              .slice()
              .reverse()
              .map((revision) => (
                <button
                  className="banner-row"
                  key={revision.id}
                  onClick={() => setViewingRevision(revision)}
                  type="button"
                >
                  <span className="banner-status">Rev {revision.number}</span>
                  <div className="banner-main">
                    <strong>{revision.note || 'No change note'}</strong>
                    <span>
                      {revision.savedBy} · {revision.savedAt}
                    </span>
                  </div>
                  <strong className="banner-value">
                    {money(snapshotTotal(revision.snapshot))}
                  </strong>
                  <ChevronRight size={16} />
                </button>
              ))}
            {!proposalRevisions.length && (
              <p>
                No revisions yet. Editing and saving this proposal records Revision 1.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="panel no-print">
        <PanelHeader title="History" />
        <div className="timeline">
          {documentHistory.length ? (
            documentHistory.map((entry) => (
              <div className="timeline-entry" key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{entry.note}</strong>
                  <span>{entry.timestamp}</span>
                </div>
              </div>
            ))
          ) : (
            <p>No history recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * A past proposal revision, exactly as it was saved. Read-only by design:
 * correcting history would defeat the point of numbering revisions.
 */
function ProposalRevisionView({
  onBack,
  propertyProfile,
  revision,
}: {
  onBack: () => void
  propertyProfile: PropertyProfile
  revision: ProposalRevision
}) {
  const snapshot = revision.snapshot
  const subtotal = snapshot.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )
  const discountValue = discountAmount(subtotal, snapshot.discount)
  const netOfDiscount = subtotal - discountValue
  const serviceCharge = netOfDiscount * 0.1
  const tax = (netOfDiscount + serviceCharge) * 0.07
  const total = netOfDiscount + serviceCharge + tax

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to proposal
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">Proposal · Revision {revision.number} (archived)</p>
            <h2>{snapshot.eventName}</h2>
            <p className="panel-header-detail">
              Saved by {revision.savedBy} on {revision.savedAt}
              {revision.note ? ` — ${revision.note}` : ''}
            </p>
          </div>
          <div className="toolbar-actions">
            <button className="primary-action" onClick={() => window.print()} type="button">
              <Download size={16} />
              Print
            </button>
          </div>
        </div>

        <div className="paper print-doc">
          <div className="paper-head">
            <div>
              <span>{propertyProfile.name}</span>
              <strong>Event Proposal</strong>
            </div>
            <div>
              <span>{revision.savedAt}</span>
              <strong>Revision {revision.number}</strong>
            </div>
          </div>

          <div className="paper-grid">
            <Detail label="Prepared for" value={snapshot.account} />
            <Detail label="Contact" value={snapshot.contact} />
            <Detail label="Event type" value={snapshot.eventType} />
            <Detail label="Package" value={snapshot.packageName} />
            <Detail label="Venue" value={`${snapshot.venue}, ${snapshot.room}`} />
            <Detail label="Guests" value={`${snapshot.expectedGuests} expected`} />
          </div>

          <PaperSection title="Line items">
            <LineItemsEditor editable={false} lineItems={snapshot.lineItems} onChange={() => {}} />
          </PaperSection>

          {snapshot.discount.mode !== 'none' && (
            <PaperSection title="Discount">
              <DiscountControl discount={snapshot.discount} editable={false} onChange={() => {}} />
            </PaperSection>
          )}

          <div className="invoice-table">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            {discountValue > 0 && (
              <div>
                <span>Discount</span>
                <strong>-{money(discountValue)}</strong>
              </div>
            )}
            <div>
              <span>Service charge 10%</span>
              <strong>{money(serviceCharge)}</strong>
            </div>
            <div>
              <span>VAT 7%</span>
              <strong>{money(tax)}</strong>
            </div>
            <div className="total-row">
              <span>Estimated total</span>
              <strong>{money(total)}</strong>
            </div>
            <div>
              <span>Deposit due</span>
              <strong>{money(snapshot.depositDue)}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Agreements
 *
 * Step 3 of the sales flow: the agreed proposal becomes the contract
 * between the property and the client. External document — printable,
 * signed by both sides — and revised under the same numbering rule as
 * the proposal it came from.
 * ------------------------------------------------------------------ */

const DEFAULT_AGREEMENT_CLAUSES: Array<{ heading: string; body: string }> = [
  {
    heading: 'Confirmation and guaranteed numbers',
    body: 'The final guaranteed guest count must be confirmed in writing no later than seven (7) days before the event date. Charges are raised on the guaranteed count or the actual attendance, whichever is higher.',
  },
  {
    heading: 'Venue and timings',
    body: 'Access, service, and vacating times are as set out above. Extension beyond the agreed hours is subject to availability and additional charges.',
  },
  {
    heading: 'Menu and beverage',
    body: 'Menu selections and any dietary requirements must be confirmed no later than fourteen (14) days before the event date. Prices are subject to change if selections are altered after that point.',
  },
  {
    heading: 'Damage and liability',
    body: 'The client is responsible for any loss or damage to the property caused by the client, their guests, or their appointed suppliers during the event.',
  },
  {
    heading: 'Force majeure',
    body: 'Neither party is liable for failure to perform where prevented by circumstances beyond reasonable control, including natural disaster, government restriction, or public emergency.',
  },
]

const DEFAULT_PAYMENT_SCHEDULE = [
  'Deposit of 50% due on signing to confirm the booking.',
  'Balance due no later than seven (7) days before the event date.',
  'All amounts are quoted in Thai Baht and include 10% service charge and 7% VAT.',
]

const DEFAULT_CANCELLATION_POLICY = [
  'More than 60 days before the event: deposit refundable less administrative costs.',
  '30 to 60 days before the event: 50% of the contracted value is payable.',
  'Less than 30 days before the event: 100% of the contracted value is payable.',
]

/** Seed the agreement from the proposal that was agreed. */
function agreementDefaults(
  booking: EventBooking,
  propertyProfile: PropertyProfile,
): Agreement {
  const lineItems = getLineItems(booking)
  const discount = getDiscount(booking)
  const proposalRevision = booking.proposalRevision ?? 0

  const content: AgreementContent = {
    agreementNumber: `AGR-${booking.id.replace('BKG-', '')}`,
    issueDate: toDateKey(new Date()),
    providerName: propertyProfile.name,
    providerAddress: propertyProfile.address,
    providerSignatory: propertyProfile.signatoryName,
    providerSignatoryTitle: propertyProfile.signatoryTitle || 'Management',
    clientName: booking.billingCompanyName || booking.account,
    clientAddress: booking.billingAddress ?? '',
    clientTaxId: booking.billingTaxId ?? '',
    clientSignatory: booking.contact,
    clientSignatoryTitle: 'Authorized signatory',
    eventSummary: `${booking.eventName} — ${booking.eventType || 'private event'} for ${booking.expectedGuests} guests on ${booking.date}, ${booking.startTime}-${booking.endTime} at ${booking.venue}, ${booking.room}.`,
    clauses: DEFAULT_AGREEMENT_CLAUSES.map((clause, index) => ({
      id: `CLS-${booking.id}-${index}`,
      ...clause,
    })),
    paymentSchedule: [...DEFAULT_PAYMENT_SCHEDULE],
    cancellationPolicy: [...DEFAULT_CANCELLATION_POLICY],
    lineItems,
    discount,
  }

  return {
    status: 'Draft',
    createdAt: toDateKey(new Date()),
    fromProposalRevision: proposalRevision,
    sentAt: null,
    signedAt: null,
    content,
    revision: 0,
    revisions: [],
  }
}

function AgreementsListView({
  bookings,
  onSelect,
}: {
  bookings: EventBooking[]
  onSelect: (bookingId: string) => void
}) {
  const withAgreement = bookings.filter((booking) => booking.agreement)
  const withoutAgreement = bookings.filter((booking) => !booking.agreement)

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader
          detail="Generated from an agreed proposal, then revised until both sides sign."
          title="Agreements"
        />
        <div className="banner-list">
          {withAgreement.map((booking) => {
            const agreement = booking.agreement!
            return (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <span className="banner-status">{agreement.status}</span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {agreement.content.agreementNumber} · {booking.account} ·{' '}
                    {agreement.revision > 0 ? `Revision ${agreement.revision}` : 'Draft'}
                  </span>
                </div>
                <span className="banner-meta">{booking.date}</span>
                <strong className="banner-value">{money(documentTotal(booking))}</strong>
                <ChevronRight size={16} />
              </button>
            )
          })}
          {!withAgreement.length && (
            <p>
              No agreements yet. Open a proposal and use "Convert to agreement" once the client
              has agreed to it.
            </p>
          )}
        </div>
      </section>

      {withoutAgreement.length > 0 && (
        <section className="panel">
          <PanelHeader
            detail="Open one to generate its agreement from the current proposal."
            title="Awaiting an agreement"
          />
          <div className="banner-list">
            {withoutAgreement.map((booking) => (
              <button
                className="banner-row"
                key={booking.id}
                onClick={() => onSelect(booking.id)}
                type="button"
              >
                <span className="banner-status">
                  {booking.proposalRevision
                    ? `Proposal rev ${booking.proposalRevision}`
                    : 'Proposal draft'}
                </span>
                <div className="banner-main">
                  <strong>{booking.eventName}</strong>
                  <span>
                    {booking.id} · {booking.account}
                  </span>
                </div>
                <span className="banner-meta">{booking.date}</span>
                <strong className="banner-value">{money(documentTotal(booking))}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Editable when in edit mode, plain text otherwise. */
function AgField({
  editing,
  multiline,
  onChange,
  placeholder,
  value,
}: {
  editing: boolean
  multiline?: boolean
  onChange: (next: string) => void
  placeholder?: string
  value: string
}) {
  if (!editing) return <span className="ag-value">{value || <em>—</em>}</span>
  return multiline ? (
    <textarea
      className="gr-input"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={3}
      value={value}
    />
  ) : (
    <input
      className="gr-input"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  )
}

function AgreementView({
  account,
  booking,
  onBack,
  onCreate,
  onOpenInvoice,
  onOpenProposal,
  onRemoveSignedFile,
  onSave,
  onSetStatus,
  onUploadSignedFile,
  propertyProfile,
  registerUnsavedChangesGuard,
  runGuarded,
}: {
  account: LoginSession
  booking: EventBooking
  onBack: () => void
  onCreate: (agreement: Agreement) => void
  onOpenInvoice: () => void
  onOpenProposal: () => void
  onRemoveSignedFile: () => void
  onSave: (content: AgreementContent, note: string) => void
  onSetStatus: (status: AgreementStatus) => void
  onUploadSignedFile: (file: SignedAgreementFile) => void
  propertyProfile: PropertyProfile
  registerUnsavedChangesGuard: (guard: { isDirty: () => boolean; message: string } | null) => void
  runGuarded: (action: () => void) => void
}) {
  const agreement = booking.agreement
  const canEdit = hasPermission(account.role, 'proposal:edit')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<AgreementContent | null>(agreement?.content ?? null)
  const [revisionNote, setRevisionNote] = useState('')
  const [viewingRevision, setViewingRevision] = useState<AgreementRevision | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [uploadNotice, setUploadNotice] = useState('')

  // Stored inline as a data URL like the photo uploads, so the cap is small.
  const handleSignedFile = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setUploadNotice('')
    if (file.size > 4 * 1024 * 1024) {
      setUploadNotice(`${file.name} is over 4 MB — upload a smaller scan.`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      if (!dataUrl) {
        setUploadNotice('That file could not be read.')
        return
      }
      onUploadSignedFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
        uploadedAt: toStampKey(new Date()),
        uploadedBy: account.displayName.trim() || 'Unknown user',
      })
    }
    reader.onerror = () => setUploadNotice('That file could not be read.')
    reader.readAsDataURL(file)
  }

  const savedContent = agreement?.content ?? null
  const [syncedFrom, setSyncedFrom] = useState(savedContent)
  if (!editing && syncedFrom !== savedContent) {
    setSyncedFrom(savedContent)
    setDraft(savedContent)
  }

  const isDirty =
    editing && draft !== null && JSON.stringify(draft) !== JSON.stringify(savedContent)
  const unsavedChangesMessage = 'Discard unsaved changes to this agreement?'

  useEffect(() => {
    registerUnsavedChangesGuard({ isDirty: () => Boolean(isDirty), message: unsavedChangesMessage })
    return () => registerUnsavedChangesGuard(null)
  }, [isDirty, registerUnsavedChangesGuard])

  // Nothing generated yet: offer the conversion instead of an empty document.
  if (!agreement || !savedContent) {
    return (
      <div className="page-stack">
        <button
          className="text-action back-action no-print"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft size={16} />
          Back to Agreements
        </button>

        <section className="panel">
          <PanelHeader
            detail="An agreement is generated from the proposal the client agreed to."
            title={booking.eventName}
          />
          <div className="paper-grid">
            <Detail label="Client" value={booking.account} />
            <Detail label="Event date" value={booking.date} />
            <Detail label="Venue" value={`${booking.venue}, ${booking.room}`} />
            <Detail
              label="Proposal"
              value={
                booking.proposalRevision
                  ? `Revision ${booking.proposalRevision}`
                  : 'Draft (never revised)'
              }
            />
            <Detail label="Contracted value" value={money(documentTotal(booking))} />
          </div>
          <div className="toolbar-actions">
            <button className="secondary-action" onClick={onOpenProposal} type="button">
              <FileText size={16} />
              Open proposal
            </button>
            {canEdit && (
              <button
                className="primary-action"
                onClick={() => onCreate(agreementDefaults(booking, propertyProfile))}
                type="button"
              >
                <Scale size={16} />
                Generate agreement
              </button>
            )}
          </div>
          {!booking.proposalRevision && (
            <p className="panel-header-detail">
              This proposal has never been saved as a revision. You can still generate the
              agreement — it will record "from proposal Revision 0".
            </p>
          )}
        </section>
      </div>
    )
  }

  const signedFile = agreement.signedFile ?? null
  const content = editing && draft ? draft : savedContent
  const setField = <K extends keyof AgreementContent>(field: K, value: AgreementContent[K]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current))
  }

  const subtotal = content.lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )
  const discountValue = discountAmount(subtotal, content.discount)
  const netOfDiscount = subtotal - discountValue
  const serviceCharge = netOfDiscount * 0.1
  const tax = (netOfDiscount + serviceCharge) * 0.07
  const total = netOfDiscount + serviceCharge + tax

  const updateClause = (clauseId: string, patch: Partial<AgreementClause>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            clauses: current.clauses.map((clause) =>
              clause.id === clauseId ? { ...clause, ...patch } : clause,
            ),
          }
        : current,
    )
  const addClause = () =>
    setDraft((current) =>
      current
        ? {
            ...current,
            clauses: [
              ...current.clauses,
              { id: `CLS-${Date.now().toString(36)}`, heading: '', body: '' },
            ],
          }
        : current,
    )
  const removeClause = (clauseId: string) =>
    setDraft((current) =>
      current
        ? { ...current, clauses: current.clauses.filter((clause) => clause.id !== clauseId) }
        : current,
    )

  const startEditing = () => {
    setDraft(savedContent)
    setEditing(true)
  }
  const cancelEditing = () =>
    runGuarded(() => {
      setDraft(savedContent)
      setEditing(false)
    })
  const saveEditing = () => {
    if (!draft) return
    onSave(draft, revisionNote.trim())
    setRevisionNote('')
    setEditing(false)
  }

  if (viewingRevision) {
    return (
      <AgreementRevisionView
        onBack={() => setViewingRevision(null)}
        propertyProfile={propertyProfile}
        revision={viewingRevision}
      />
    )
  }

  const paperDocument = (
    <div className="paper print-doc agreement-doc">
      <div className="paper-head">
        <div>
          <span>{content.providerName}</span>
          <strong>EVENT AGREEMENT</strong>
        </div>
        <div>
          <span>{content.agreementNumber}</span>
          <strong>
            {agreement.revision > 0 ? `Revision ${agreement.revision}` : 'Draft'}
          </strong>
        </div>
      </div>

      <dl className="gr-memo">
        <GrRow label="Agreement no.">
          <AgField
            editing={editing}
            onChange={(next) => setField('agreementNumber', next)}
            value={content.agreementNumber}
          />
        </GrRow>
        <GrRow label="Issue date">
          <AgField
            editing={editing}
            onChange={(next) => setField('issueDate', next)}
            value={content.issueDate}
          />
        </GrRow>
        <GrRow label="Status">
          <span className="ag-value">
            {agreement.status}
            {agreement.signedAt ? ` on ${agreement.signedAt}` : ''}
          </span>
        </GrRow>
        <GrRow label="From proposal">
          <span className="ag-value">Revision {agreement.fromProposalRevision}</span>
        </GrRow>
      </dl>

      <PaperSection title="Parties">
        <div className="ag-parties">
          <div className="ag-party">
            <span className="eyebrow">The property</span>
            <dl className="gr-memo">
              <GrRow label="Name">
                <AgField
                  editing={editing}
                  onChange={(next) => setField('providerName', next)}
                  value={content.providerName}
                />
              </GrRow>
              <GrRow label="Address">
                <AgField
                  editing={editing}
                  multiline
                  onChange={(next) => setField('providerAddress', next)}
                  value={content.providerAddress}
                />
              </GrRow>
            </dl>
          </div>
          <div className="ag-party">
            <span className="eyebrow">The client</span>
            <dl className="gr-memo">
              <GrRow label="Name">
                <AgField
                  editing={editing}
                  onChange={(next) => setField('clientName', next)}
                  value={content.clientName}
                />
              </GrRow>
              <GrRow label="Address">
                <AgField
                  editing={editing}
                  multiline
                  onChange={(next) => setField('clientAddress', next)}
                  value={content.clientAddress}
                />
              </GrRow>
              <GrRow label="TAX ID">
                <AgField
                  editing={editing}
                  onChange={(next) => setField('clientTaxId', next)}
                  value={content.clientTaxId}
                />
              </GrRow>
            </dl>
          </div>
        </div>
      </PaperSection>

      <PaperSection title="The event">
        <div className="gr-paragraph">
          <AgField
            editing={editing}
            multiline
            onChange={(next) => setField('eventSummary', next)}
            value={content.eventSummary}
          />
        </div>
      </PaperSection>

      <PaperSection title="Contracted services">
        <LineItemsEditor editable={false} lineItems={content.lineItems} onChange={() => {}} />
      </PaperSection>

      <div className="invoice-table">
        <div>
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>
        {discountValue > 0 && (
          <div>
            <span>Discount</span>
            <strong>-{money(discountValue)}</strong>
          </div>
        )}
        <div>
          <span>Service charge 10%</span>
          <strong>{money(serviceCharge)}</strong>
        </div>
        <div>
          <span>VAT 7%</span>
          <strong>{money(tax)}</strong>
        </div>
        <div className="total-row">
          <span>Contracted total</span>
          <strong>{money(total)}</strong>
        </div>
      </div>

      <PaperSection title="Payment schedule">
        <GrList
          editing={editing}
          onChange={(next) => setField('paymentSchedule', next)}
          placeholder="One term per line"
          value={content.paymentSchedule}
        />
      </PaperSection>

      <PaperSection title="Cancellation policy">
        <GrList
          editing={editing}
          onChange={(next) => setField('cancellationPolicy', next)}
          placeholder="One term per line"
          value={content.cancellationPolicy}
        />
      </PaperSection>

      <PaperSection title="Terms and conditions">
        <ol className="ag-clauses">
          {content.clauses.map((clause) => (
            <li key={clause.id}>
              {editing ? (
                <div className="ag-clause-edit">
                  <input
                    className="gr-input"
                    onChange={(event) => updateClause(clause.id, { heading: event.target.value })}
                    placeholder="Clause heading"
                    value={clause.heading}
                  />
                  <textarea
                    className="gr-input"
                    onChange={(event) => updateClause(clause.id, { body: event.target.value })}
                    placeholder="Clause text"
                    rows={3}
                    value={clause.body}
                  />
                  <button
                    className="text-action danger-action no-print"
                    onClick={() => removeClause(clause.id)}
                    type="button"
                  >
                    <Trash2 size={14} />
                    Remove clause
                  </button>
                </div>
              ) : (
                <>
                  <strong>{clause.heading}</strong>
                  <p>{clause.body}</p>
                </>
              )}
            </li>
          ))}
        </ol>
        {editing && (
          <button className="secondary-action no-print" onClick={addClause} type="button">
            <Plus size={16} />
            Add clause
          </button>
        )}
      </PaperSection>

      <div className="proposal-signature-row">
        <div className="signatory-column">
          <strong>
            <AgField
              editing={editing}
              onChange={(next) => setField('providerSignatory', next)}
              value={content.providerSignatory}
            />
          </strong>
          <small>
            {content.providerName} —{' '}
            <AgField
              editing={editing}
              onChange={(next) => setField('providerSignatoryTitle', next)}
              value={content.providerSignatoryTitle}
            />
          </small>
        </div>
        <div className="signatory-column">
          <strong>
            <AgField
              editing={editing}
              onChange={(next) => setField('clientSignatory', next)}
              value={content.clientSignatory}
            />
          </strong>
          <small>
            {content.clientName} —{' '}
            <AgField
              editing={editing}
              onChange={(next) => setField('clientSignatoryTitle', next)}
              value={content.clientSignatoryTitle}
            />
          </small>
        </div>
      </div>
    </div>
  )

  if (showPdfPreview) {
    return (
      <div className="page-stack">
        <button
          className="text-action back-action no-print"
          onClick={() => setShowPdfPreview(false)}
          type="button"
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <section className="document-preview single-document">
          <div className="document-toolbar no-print">
            <div>
              <p className="eyebrow">Agreement</p>
              <h2>{booking.eventName}</h2>
            </div>
            <div className="toolbar-actions">
              <button className="primary-action" onClick={() => window.print()} type="button">
                <Download size={16} />
                Print
              </button>
            </div>
          </div>
          {paperDocument}
        </section>
      </div>
    )
  }

  return (
    <div className="page-stack">
      <button
        className="text-action back-action no-print"
        onClick={() => runGuarded(onBack)}
        type="button"
      >
        <ChevronLeft size={16} />
        Back to Agreements
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">
              Agreement · {agreement.revision > 0 ? `Revision ${agreement.revision}` : 'Draft'} ·{' '}
              {agreement.status}
            </p>
            <h2>{booking.eventName}</h2>
          </div>
          <div className="toolbar-actions">
            <button
              className="secondary-action"
              onClick={() => runGuarded(onOpenProposal)}
              type="button"
            >
              <FileText size={16} />
              Open proposal
            </button>
            {canEdit &&
              (editing ? (
                <>
                  <button className="secondary-action" onClick={cancelEditing} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-action"
                    disabled={!isDirty}
                    onClick={saveEditing}
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    Save as revision {agreement.revision + 1}
                  </button>
                </>
              ) : (
                <button className="primary-action" onClick={startEditing} type="button">
                  Edit agreement
                </button>
              ))}
            <button
              className="secondary-action"
              onClick={() => setShowPdfPreview(true)}
              type="button"
            >
              <Download size={16} />
              View PDF
            </button>
          </div>
        </div>

        {editing && (
          <div className="revision-note-field no-print">
            <label htmlFor="agreement-revision-note">
              What changed in Revision {agreement.revision + 1}?
            </label>
            <input
              id="agreement-revision-note"
              onChange={(event) => setRevisionNote(event.target.value)}
              placeholder="Payment schedule moved to 30/70"
              value={revisionNote}
            />
          </div>
        )}

        {paperDocument}
      </section>

      {!editing && (
        <section className="panel no-print">
          <PanelHeader
            detail="The uploaded countersigned file is what unlocks invoicing — not the status flag on its own."
            title="Signature and signed copy"
          />

          {signedFile ? (
            <div className="signed-file-card">
              <div className="signed-file-head">
                <FileCheck2 size={20} />
                <div>
                  <strong>{signedFile.name}</strong>
                  <span>
                    {fileSizeLabel(signedFile.size)} · uploaded by {signedFile.uploadedBy} on{' '}
                    {signedFile.uploadedAt}
                  </span>
                </div>
                <span className="signed-file-badge">Signed</span>
              </div>

              <div className="signed-file-preview">
                {signedFile.type.startsWith('image/') ? (
                  <img alt={`Signed agreement — ${signedFile.name}`} src={signedFile.dataUrl} />
                ) : signedFile.type === 'application/pdf' ? (
                  <iframe src={signedFile.dataUrl} title="Signed agreement" />
                ) : (
                  <p className="empty-state">
                    No inline preview for this file type — download it to view.
                  </p>
                )}
              </div>

              <div className="toolbar-actions">
                <a
                  className="secondary-action"
                  download={signedFile.name}
                  href={signedFile.dataUrl}
                >
                  <Download size={16} />
                  Download
                </a>
                <button className="secondary-action" onClick={onOpenInvoice} type="button">
                  <ReceiptText size={16} />
                  Generate invoice
                </button>
                {canEdit && (
                  <button className="text-action danger-action" onClick={onRemoveSignedFile} type="button">
                    <Trash2 size={14} />
                    Remove signed copy
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="signed-file-empty">
              <p>
                No signed agreement on file. Send the PDF to the client, then upload their
                countersigned copy here to unlock the invoice.
              </p>
              {canEdit && (
                <div className="toolbar-actions">
                  <button
                    className="secondary-action"
                    disabled={agreement.status !== 'Draft'}
                    onClick={() => onSetStatus('Sent for signature')}
                    type="button"
                  >
                    <Send size={16} />
                    {agreement.status === 'Draft' ? 'Mark sent for signature' : 'Sent for signature'}
                  </button>
                  <label className="primary-action file-action">
                    <Upload size={16} />
                    Upload signed agreement
                    <input
                      accept="application/pdf,image/png,image/jpeg"
                      onChange={(event) => {
                        handleSignedFile(event.target.files)
                        event.target.value = ''
                      }}
                      type="file"
                    />
                  </label>
                </div>
              )}
              {uploadNotice && <p className="form-notice">{uploadNotice}</p>}
            </div>
          )}
        </section>
      )}

      <section className="panel no-print">
        <PanelHeader
          detail="Every save cuts a numbered revision. Open one to read the version that was sent."
          title="Revisions"
        />
        <div className="banner-list">
          {[...agreement.revisions].reverse().map((revision) => (
            <button
              className="banner-row"
              key={revision.id}
              onClick={() => setViewingRevision(revision)}
              type="button"
            >
              <span className="banner-status">Rev {revision.number}</span>
              <div className="banner-main">
                <strong>{revision.note || 'No change note'}</strong>
                <span>
                  {revision.savedBy} · {revision.savedAt}
                </span>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
          {!agreement.revisions.length && (
            <p>No revisions yet. Editing and saving this agreement records Revision 1.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** A past agreement revision, exactly as it was saved. */
function AgreementRevisionView({
  onBack,
  propertyProfile,
  revision,
}: {
  onBack: () => void
  propertyProfile: PropertyProfile
  revision: AgreementRevision
}) {
  const content = revision.snapshot

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to agreement
      </button>

      <section className="document-preview single-document">
        <div className="document-toolbar no-print">
          <div>
            <p className="eyebrow">Agreement · Revision {revision.number} (archived)</p>
            <h2>{content.agreementNumber}</h2>
            <p className="panel-header-detail">
              Saved by {revision.savedBy} on {revision.savedAt}
              {revision.note ? ` — ${revision.note}` : ''}
            </p>
          </div>
          <div className="toolbar-actions">
            <button className="primary-action" onClick={() => window.print()} type="button">
              <Download size={16} />
              Print
            </button>
          </div>
        </div>

        <div className="paper print-doc agreement-doc">
          <div className="paper-head">
            <div>
              <span>{propertyProfile.name}</span>
              <strong>EVENT AGREEMENT</strong>
            </div>
            <div>
              <span>{content.agreementNumber}</span>
              <strong>Revision {revision.number}</strong>
            </div>
          </div>

          <div className="paper-grid">
            <Detail label="Issue date" value={content.issueDate} />
            <Detail label="Client" value={content.clientName} />
            <Detail label="TAX ID" value={content.clientTaxId || '—'} />
            <Detail label="Client address" value={content.clientAddress || '—'} />
          </div>

          <PaperSection title="The event">
            <p>{content.eventSummary}</p>
          </PaperSection>

          <PaperSection title="Contracted services">
            <LineItemsEditor editable={false} lineItems={content.lineItems} onChange={() => {}} />
          </PaperSection>

          <PaperSection title="Payment schedule">
            <ul className="inclusion-list">
              {content.paymentSchedule.map((term, index) => (
                <li key={index}>
                  <Check size={14} />
                  <span>{term}</span>
                </li>
              ))}
            </ul>
          </PaperSection>

          <PaperSection title="Cancellation policy">
            <ul className="inclusion-list">
              {content.cancellationPolicy.map((term, index) => (
                <li key={index}>
                  <Check size={14} />
                  <span>{term}</span>
                </li>
              ))}
            </ul>
          </PaperSection>

          <PaperSection title="Terms and conditions">
            <ol className="ag-clauses">
              {content.clauses.map((clause) => (
                <li key={clause.id}>
                  <strong>{clause.heading}</strong>
                  <p>{clause.body}</p>
                </li>
              ))}
            </ol>
          </PaperSection>

          <div className="proposal-signature-row">
            <div className="signatory-column">
              <strong>{content.providerSignatory}</strong>
              <small>
                {content.providerName} — {content.providerSignatoryTitle}
              </small>
            </div>
            <div className="signatory-column">
              <strong>{content.clientSignatory}</strong>
              <small>
                {content.clientName} — {content.clientSignatoryTitle}
              </small>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function emptyProduct(): Product {
  return {
    id: `PRD-${Date.now()}`,
    name: 'New package',
    category: 'Package',
    description: '',
    price: null,
    unit: 'per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: false,
  }
}

const ADD_NEW_CATEGORY = '__add_new_category__'
const ADD_NEW_UNIT = '__add_new_unit__'
// Seed value for the Settings-editable Units list (Settings > Package & Products).
const DEFAULT_UNIT_OPTIONS = [
  'net',
  'net per person',
  'net per keg',
  'net per bottle',
  'net per event',
  'net / 3 hours',
]

/** Setup styles seeded from the venues, edited in Settings > Venue. */
const DEFAULT_SETUP_STYLES = Array.from(
  new Set(initialVenues.flatMap((venue) => venue.setupStyles)),
).sort((a, b) => a.localeCompare(b))

function ProductDetailView({
  canDelete,
  categories,
  onBack,
  onDelete,
  onSave,
  product,
  units,
}: {
  canDelete: boolean
  categories: string[]
  onBack: () => void
  onDelete: () => void
  onSave: (product: Product) => void
  product: Product
  units: string[]
}) {
  const [draft, setDraft] = useState<Product>(product)
  const [addingCategory, setAddingCategory] = useState(false)
  // Remembered so cancelling "Add new" without typing restores the prior choice.
  const [prevCategory, setPrevCategory] = useState(product.category)
  const [addingUnit, setAddingUnit] = useState(false)
  const [prevUnit, setPrevUnit] = useState(product.unit)
  const [photoNotice, setPhotoNotice] = useState('')
  const isDirty = JSON.stringify(draft) !== JSON.stringify(product)

  // Ensure the current value is always selectable even if it isn't in the list.
  const categoryChoices = Array.from(
    new Set([...categories, draft.category].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  const unitChoices = Array.from(
    new Set([...units, draft.unit].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  const hasOptions = (draft.priceTiers?.length ?? 0) > 0

  const setField = <K extends keyof Product>(field: K, value: Product[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const setTierField = <K extends keyof PriceTier>(index: number, field: K, value: PriceTier[K]) => {
    const next = [...(draft.priceTiers ?? [])]
    next[index] = { ...next[index], [field]: value }
    setField('priceTiers', next)
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this package?')) return
    onBack()
  }

  // Dish photos are stored inline as data URLs, matching the venue photo
  // uploader — no file storage bucket needed.
  const addPhotos = (files: FileList | null) => {
    if (!files || !files.length) return
    setPhotoNotice('')
    Array.from(files).forEach((file) => {
      if (file.size > 1024 * 1024) {
        setPhotoNotice(`${file.name} is over 1 MB — choose a smaller photo.`)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '')
        if (!dataUrl) return
        setDraft((current) => ({ ...current, photos: [...(current.photos ?? []), dataUrl] }))
      }
      reader.readAsDataURL(file)
    })
  }
  const removePhoto = (index: number) => {
    setField('photos', (draft.photos ?? []).filter((_, i) => i !== index))
  }

  const handleSave = () => {
    // Drop blank inclusion rows so the card never renders empty checklist items.
    const inclusions = (draft.inclusions ?? []).map((item) => item.trim()).filter(Boolean)
    // Drop invalid option rows and blank labels; fall back to a flat price if none remain.
    const priceTiers = (draft.priceTiers ?? [])
      .filter((tier) => Number.isFinite(tier.price))
      .map((tier) => ({ ...tier, label: tier.label?.trim() || undefined }))
    onSave({ ...draft, inclusions, priceTiers: priceTiers.length ? priceTiers : undefined })
    onBack()
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action" onClick={handleBack} type="button">
        <ChevronLeft size={16} />
        Back to Packages
      </button>

      <section className="panel">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{draft.category}</p>
            <h2>{draft.name}</h2>
          </div>
          {canDelete && (
            <button className="secondary-action" onClick={onDelete} type="button">
              Delete
            </button>
          )}
        </div>

        <div className="venue-photo-gallery">
          {(draft.photos ?? []).map((photo, index) => (
            <div className="venue-photo" key={index}>
              <img alt={`${draft.name} ${index + 1}`} src={photo} />
              <button
                aria-label={`Remove photo ${index + 1}`}
                className="venue-photo-remove"
                onClick={() => removePhoto(index)}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="venue-photo-add">
          <input
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => addPhotos(event.target.files)}
            type="file"
          />
          <p className="panel-subtitle">
            Photos under 1 MB each. The first one shows on the Venue card.
          </p>
          {photoNotice && <p className="profile-notice">{photoNotice}</p>}
        </div>

        <div className="plan-edit-form">
          <FormField label="Name">
            <input onChange={(event) => setField('name', event.target.value)} value={draft.name} />
          </FormField>
          <FormField label="Category">
            {addingCategory ? (
              <div className="category-add">
                <input
                  autoFocus
                  onChange={(event) => setField('category', event.target.value)}
                  placeholder="New category name"
                  value={draft.category}
                />
                <button
                  className="text-action"
                  onClick={() => {
                    if (!draft.category.trim()) setField('category', prevCategory)
                    setAddingCategory(false)
                  }}
                  type="button"
                >
                  Choose from list
                </button>
              </div>
            ) : (
              <select
                onChange={(event) => {
                  if (event.target.value === ADD_NEW_CATEGORY) {
                    setPrevCategory(draft.category)
                    setField('category', '')
                    setAddingCategory(true)
                  } else {
                    setField('category', event.target.value)
                  }
                }}
                value={draft.category}
              >
                {categoryChoices.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
                <option value={ADD_NEW_CATEGORY}>＋ Add new category…</option>
              </select>
            )}
          </FormField>
          <FormField label="Description">
            <textarea
              onChange={(event) => setField('description', event.target.value)}
              value={draft.description}
            />
          </FormField>
          <div className="form-field">
            <span>Inclusions</span>
            <div className="inclusion-editor">
              {(draft.inclusions ?? []).map((item, index) => (
                <div className="inclusion-editor-row" key={index}>
                  <input
                    aria-label={`Inclusion ${index + 1}`}
                    onChange={(event) => {
                      const next = [...(draft.inclusions ?? [])]
                      next[index] = event.target.value
                      setField('inclusions', next)
                    }}
                    value={item}
                  />
                  <button
                    aria-label={`Remove inclusion ${index + 1}`}
                    className="user-admin-remove"
                    onClick={() =>
                      setField(
                        'inclusions',
                        (draft.inclusions ?? []).filter((_, i) => i !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="secondary-action inclusion-add"
                onClick={() => setField('inclusions', [...(draft.inclusions ?? []), ''])}
                type="button"
              >
                <Plus size={15} />
                Add inclusion
              </button>
            </div>
          </div>
          <FormField label="Price options">
            <select
              onChange={(event) => {
                if (event.target.value === 'Yes') {
                  setField(
                    'priceTiers',
                    draft.priceTiers?.length ? draft.priceTiers : [{ price: draft.price ?? 0 }],
                  )
                } else {
                  setField('priceTiers', undefined)
                }
              }}
              value={hasOptions ? 'Yes' : 'No'}
            >
              <option value="No">No — single price</option>
              <option value="Yes">Yes — let staff pick an option</option>
            </select>
          </FormField>
          {hasOptions ? (
            <div className="form-field">
              <span>Options</span>
              <div className="tier-editor">
                {(draft.priceTiers ?? []).map((tier, index) => (
                  <div className="tier-editor-row" key={index}>
                    <input
                      aria-label={`Option ${index + 1} label`}
                      onChange={(event) => setTierField(index, 'label', event.target.value)}
                      placeholder="Label (optional)"
                      value={tier.label ?? ''}
                    />
                    <input
                      aria-label={`Option ${index + 1} price`}
                      min="0"
                      onChange={(event) => setTierField(index, 'price', Number(event.target.value))}
                      placeholder="Price"
                      type="number"
                      value={tier.price}
                    />
                    <button
                      aria-label={`Remove option ${index + 1}`}
                      className="user-admin-remove"
                      onClick={() =>
                        setField(
                          'priceTiers',
                          (draft.priceTiers ?? []).filter((_, i) => i !== index),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="secondary-action inclusion-add"
                  onClick={() =>
                    setField('priceTiers', [...(draft.priceTiers ?? []), { price: 0 }])
                  }
                  type="button"
                >
                  <Plus size={15} />
                  Add option
                </button>
              </div>
            </div>
          ) : (
            <FormField label="Price">
              <input
                min="0"
                onChange={(event) =>
                  setField('price', event.target.value === '' ? null : Number(event.target.value))
                }
                type="number"
                value={draft.price ?? ''}
              />
            </FormField>
          )}
          <FormField label="Unit">
            {addingUnit ? (
              <div className="category-add">
                <input
                  autoFocus
                  onChange={(event) => setField('unit', event.target.value)}
                  placeholder="New unit"
                  value={draft.unit}
                />
                <button
                  className="text-action"
                  onClick={() => {
                    if (!draft.unit.trim()) setField('unit', prevUnit)
                    setAddingUnit(false)
                  }}
                  type="button"
                >
                  Choose from list
                </button>
              </div>
            ) : (
              <select
                onChange={(event) => {
                  if (event.target.value === ADD_NEW_UNIT) {
                    setPrevUnit(draft.unit)
                    setField('unit', '')
                    setAddingUnit(true)
                  } else {
                    setField('unit', event.target.value)
                  }
                }}
                value={draft.unit}
              >
                {unitChoices.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
                <option value={ADD_NEW_UNIT}>＋ Add new unit…</option>
              </select>
            )}
          </FormField>
          <FormField label="Display price to client">
            <select
              onChange={(event) => setField('displayPrice', event.target.value === 'Yes')}
              value={draft.displayPrice ? 'Yes' : 'No'}
            >
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </FormField>
          <FormField label="Show on BEO">
            <select
              onChange={(event) => setField('displayOnBeo', event.target.value === 'Yes')}
              value={draft.displayOnBeo ? 'Yes' : 'No'}
            >
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </FormField>
        </div>

        <div className="card-actions">
          <button className="secondary-action" onClick={handleBack} type="button">
            Cancel
          </button>
          <button className="primary-action" onClick={handleSave} type="button">
            Save changes
          </button>
        </div>
      </section>
    </div>
  )
}

// The catalogue is grouped into these sections; each maps one or more product
// categories to a heading, in display order. Anything unmatched falls to "Other".
const PACKAGE_SECTIONS: { title: string; categories: string[] }[] = [
  { title: 'Wedding Packages', categories: ['Package'] },
  { title: 'Venue Rental Fees', categories: ['Venue rental'] },
  { title: 'Food & Beverage Packages', categories: ['Food & Beverage', 'Beverage'] },
  { title: 'Additional Services', categories: ['Add-on service'] },
]

// Seed value for the Settings-editable Category list (Settings > Package & Products).
const DEFAULT_PACKAGE_CATEGORIES = PACKAGE_SECTIONS.flatMap((section) => section.categories)

function ProductsView({
  account,
  categories,
  products,
  setProducts,
  units,
}: {
  account: LoginSession
  categories: string[]
  products: Product[]
  setProducts: (next: Product[] | ((current: Product[]) => Product[])) => void
  units: string[]
}) {
  const [viewingProductId, setViewingProductId] = useState<string | null>(null)
  // Read-only "See more" details popup (separate from the Edit view).
  const [previewProductId, setPreviewProductId] = useState<string | null>(null)
  // Which price tier is highlighted per product (quoting reference only).
  const [tierByProduct, setTierByProduct] = useState<Record<string, number>>({})
  const canEdit = hasPermission(account.role, 'packages:edit')
  // Cards show at most this many inclusions before a "See more" link.
  const MAX_CARD_INCLUSIONS = 5

  const createProduct = () => {
    const product = emptyProduct()
    setProducts((current) => [product, ...current])
    setViewingProductId(product.id)
  }

  const deleteProduct = (id: string) => {
    if (!window.confirm('Delete this package? This cannot be undone.')) return
    setProducts((current) => current.filter((product) => product.id !== id))
    if (viewingProductId === id) setViewingProductId(null)
  }

  const viewingProduct = products.find((product) => product.id === viewingProductId)
  const previewProduct = products.find((product) => product.id === previewProductId)

  // Categories offered in the detail view's dropdown: the Settings-managed list
  // plus any category already in use across products.
  const categoryOptions = Array.from(
    new Set([...categories, ...products.map((product) => product.category)].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  if (viewingProduct) {
    return (
      <ProductDetailView
        canDelete={canEdit}
        categories={categoryOptions}
        onBack={() => setViewingProductId(null)}
        onDelete={() => deleteProduct(viewingProduct.id)}
        onSave={(updated) =>
          setProducts((current) =>
            current.map((product) => (product.id === updated.id ? updated : product)),
          )
        }
        product={viewingProduct}
        units={units}
      />
    )
  }

  const knownCategories = new Set(PACKAGE_SECTIONS.flatMap((section) => section.categories))
  const sections = PACKAGE_SECTIONS.map((section) => ({
    title: section.title,
    items: products.filter((product) => section.categories.includes(product.category)),
  })).filter((section) => section.items.length > 0)
  const otherItems = products.filter((product) => !knownCategories.has(product.category))
  if (otherItems.length) sections.push({ title: 'Other', items: otherItems })

  const renderCard = (product: Product) => {
    const tiers = product.priceTiers ?? []
    const selectedTier = tiers.length ? Math.min(tierByProduct[product.id] ?? 0, tiers.length - 1) : 0
    return (
      <article className="resource-card" key={product.id}>
        <div className="resource-head">
          <span>{product.category}</span>
          <strong>{product.name}</strong>
        </div>
        {product.description && <p>{product.description}</p>}
        {product.inclusions && product.inclusions.length > 0 && (
          <ul className="inclusion-list">
            {product.inclusions.slice(0, MAX_CARD_INCLUSIONS).map((item, index) => (
              <li key={index}>
                <Check size={14} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {product.inclusions && product.inclusions.length > MAX_CARD_INCLUSIONS && (
          <button
            className="see-more-link"
            onClick={() => setPreviewProductId(product.id)}
            type="button"
          >
            See more
            <ChevronRight size={14} />
          </button>
        )}
        {tiers.length > 0 && product.availability && product.availability !== 'Available' && (
          <p className="resource-note">{product.availability}</p>
        )}
        {tiers.length > 0 && (
          <div className="tier-select">
            <label>
              <span>Choose option</span>
              <select
                onChange={(event) =>
                  setTierByProduct((current) => ({
                    ...current,
                    [product.id]: Number(event.target.value),
                  }))
                }
                value={selectedTier}
              >
                {tiers.map((tier, index) => (
                  <option key={index} value={index}>
                    {tier.label ? `${tier.label} — ${money(tier.price)}` : money(tier.price)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {product.sourceUrl && (
          <a className="source-link" href={product.sourceUrl} rel="noreferrer" target="_blank">
            <ExternalLink size={14} />
            Source page
          </a>
        )}
        <div className="toggle-row">
          <span>Show on BEO</span>
          <strong>{product.displayOnBeo ? 'Yes' : 'No'}</strong>
        </div>
        <div className="card-actions">
          <div className="price-block">
            <strong>
              {tiers.length > 0
                ? money(tiers[selectedTier].price)
                : product.displayPrice
                  ? priceLabel(product.price)
                  : 'Quote required'}
            </strong>{' '}
            <span>{product.unit}</span>
          </div>
          {canEdit && (
            <button
              className="primary-action"
              onClick={() => setViewingProductId(product.id)}
              type="button"
            >
              Edit
            </button>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader
          action={canEdit ? 'New package' : undefined}
          onAction={canEdit ? createProduct : undefined}
          title="Packages & Products"
        />
        {!products.length && <p>No packages yet.</p>}
        <div className="package-sections">
          {sections.map((section) => (
            <div className="package-section" key={section.title}>
              <div className="package-section-head">
                <h3>{section.title}</h3>
                <span>{section.items.length}</span>
              </div>
              <div className="resource-grid">{section.items.map(renderCard)}</div>
            </div>
          ))}
        </div>
      </section>

      {previewProduct && (
        <Modal
          icon={Sparkles}
          onBack={() => setPreviewProductId(null)}
          onClose={() => setPreviewProductId(null)}
          title={previewProduct.name}
        >
          <p className="support-muted">{previewProduct.category}</p>
          {previewProduct.description && <p>{previewProduct.description}</p>}
          {previewProduct.inclusions && previewProduct.inclusions.length > 0 && (
            <>
              <h3 className="support-subhead">Inclusions</h3>
              <ul className="inclusion-list">
                {previewProduct.inclusions.map((item, index) => (
                  <li key={index}>
                    <Check size={14} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="price-block">
            <strong>
              {previewProduct.displayPrice ? priceLabel(previewProduct.price) : 'Quote required'}
            </strong>{' '}
            <span>{previewProduct.unit}</span>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** Client-facing venue hub: pick a venue to show its photos and details —
 * built for sales staff to pull up on a screen while closing a deal, not for
 * internal ops reporting. */
function VenuesView({
  account,
  setVenues,
  setupStyles,
  venues,
}: {
  account: LoginSession
  setVenues: (next: Venue[] | ((current: Venue[]) => Venue[])) => void
  setupStyles: string[]
  venues: Venue[]
}) {
  const [viewingVenueId, setViewingVenueId] = useState<string | null>(null)
  const canEdit = hasPermission(account.role, 'venues:edit')
  const viewingVenue = venues.find((venue) => venue.id === viewingVenueId)

  // Styles offered in the venue editor's dropdown: the Settings-managed list
  // plus any style already in use across the venues.
  const setupStyleOptions = Array.from(
    new Set([...setupStyles, ...venues.flatMap((venue) => venue.setupStyles)].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  if (viewingVenue) {
    return (
      <VenueDetailView
        canEdit={canEdit}
        onBack={() => setViewingVenueId(null)}
        onSave={(updated) =>
          setVenues((current) =>
            current.map((venue) => (venue.id === updated.id ? updated : venue)),
          )
        }
        setupStyleOptions={setupStyleOptions}
        venue={viewingVenue}
      />
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader
          detail="Click to show more details"
          title="Venue"
        />
        <div className="resource-grid">
          {venues.map((venue) => (
            <button
              className="venue-select-card"
              key={venue.id}
              onClick={() => setViewingVenueId(venue.id)}
              type="button"
            >
              <div className="venue-select-photo">
                {venue.photos?.[0] ? (
                  <img alt="" src={venue.photos[0]} />
                ) : (
                  <ImageIcon size={22} />
                )}
              </div>
              <div className="venue-select-body">
                <span className="eyebrow">{venue.status}</span>
                <strong>{venue.name}</strong>
                <span>{capacityLabel(venue.capacity)} guest capacity</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function VenueDetailView({
  canEdit,
  onBack,
  onSave,
  setupStyleOptions,
  venue,
}: {
  canEdit: boolean
  onBack: () => void
  onSave: (venue: Venue) => void
  setupStyleOptions: string[]
  venue: Venue
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<Venue>(venue)
  const [photoNotice, setPhotoNotice] = useState('')
  const isDirty = JSON.stringify(draft) !== JSON.stringify(venue)
  const display = isEditing ? draft : venue

  const setField = <K extends keyof Venue>(field: K, value: Venue[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleStartEditing = () => {
    setDraft(venue)
    setPhotoNotice('')
    setIsEditing(true)
  }
  const handleCancel = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this venue?')) return
    setDraft(venue)
    setIsEditing(false)
  }
  const handleSave = () => {
    onSave(draft)
    setIsEditing(false)
  }
  const handleBack = () => {
    if (isEditing && isDirty && !window.confirm('Discard unsaved changes to this venue?')) return
    onBack()
  }

  // Photos are stored inline as data URLs, matching the letterhead logo
  // uploader — no file storage bucket needed for a first version of this.
  const addPhotos = (files: FileList | null) => {
    if (!files || !files.length) return
    setPhotoNotice('')
    Array.from(files).forEach((file) => {
      if (file.size > 1024 * 1024) {
        setPhotoNotice(`${file.name} is over 1 MB — choose a smaller photo.`)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result ?? '')
        if (!dataUrl) return
        setDraft((current) => ({ ...current, photos: [...(current.photos ?? []), dataUrl] }))
      }
      reader.readAsDataURL(file)
    })
  }
  const removePhoto = (index: number) => {
    setField('photos', (draft.photos ?? []).filter((_, i) => i !== index))
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={handleBack} type="button">
        <ChevronLeft size={16} />
        Back to Venue
      </button>

      <section className="panel">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{display.status}</p>
            <h2>{display.name}</h2>
          </div>
          {canEdit &&
            (isEditing ? (
              <div className="card-actions">
                <button className="secondary-action" onClick={handleCancel} type="button">
                  Cancel
                </button>
                <button
                  className="primary-action"
                  disabled={!isDirty}
                  onClick={handleSave}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  Save changes
                </button>
              </div>
            ) : (
              <button className="secondary-action" onClick={handleStartEditing} type="button">
                Edit
              </button>
            ))}
        </div>

        <div className="venue-photo-gallery">
          {(display.photos ?? []).map((photo, index) => (
            <div className="venue-photo" key={index}>
              <img alt={`${display.name} ${index + 1}`} src={photo} />
              {isEditing && (
                <button
                  aria-label={`Remove photo ${index + 1}`}
                  className="venue-photo-remove"
                  onClick={() => removePhoto(index)}
                  type="button"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {!(display.photos ?? []).length && !isEditing && (
            <p className="empty-state">No photos added yet.</p>
          )}
        </div>
        {isEditing && (
          <div className="venue-photo-add">
            <input
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => addPhotos(event.target.files)}
              type="file"
            />
            <p className="panel-subtitle">Photos under 1 MB each.</p>
            {photoNotice && <p className="profile-notice">{photoNotice}</p>}
          </div>
        )}

        <div className="plan-edit-form">
          <FormField label="Description">
            {isEditing ? (
              <textarea
                onChange={(event) => setField('description', event.target.value)}
                placeholder="What makes this venue great for events — shown to clients."
                value={draft.description ?? ''}
              />
            ) : (
              <p>{display.description || 'No description yet.'}</p>
            )}
          </FormField>
          <FormField label="Capacity">
            {isEditing ? (
              <input
                min="0"
                onChange={(event) =>
                  setField('capacity', event.target.value === '' ? null : Number(event.target.value))
                }
                type="number"
                value={draft.capacity ?? ''}
              />
            ) : (
              <p>{capacityLabel(display.capacity)} guests</p>
            )}
          </FormField>
          <FormField
            asGroup={isEditing}
            hint={isEditing ? 'Pick from the list, or add a new style' : undefined}
            label="Setup styles"
          >
            {isEditing ? (
              <TagSelectField
                addLabel="Add setup style"
                emptyLabel="No setup styles selected"
                onChange={(next) => setField('setupStyles', next)}
                options={setupStyleOptions}
                placeholder="New setup style"
                value={draft.setupStyles}
              />
            ) : (
              <TagList items={display.setupStyles} />
            )}
          </FormField>
          <FormField label="Service hours">
            {isEditing ? (
              <input
                onChange={(event) => setField('serviceHours', event.target.value)}
                value={draft.serviceHours ?? ''}
              />
            ) : (
              <p>{display.serviceHours || 'Not set'}</p>
            )}
          </FormField>
        </div>
      </section>
    </div>
  )
}

function TasksView({ bookings }: { bookings: EventBooking[] }) {
  return (
    <section className="panel">
      <div className="task-list">
        {tasks.map((task) => {
          const booking = bookings.find((item) => item.id === task.bookingId)
          return (
            <article className="task-row" key={task.id}>
              <div className="task-icon">
                <CheckSquare size={18} />
              </div>
              <div>
                <strong>{task.title}</strong>
                <span>
                  {task.department} | {booking?.eventName ?? task.bookingId}
                </span>
              </div>
              <span>{task.owner}</span>
              <span>{task.due}</span>
              <StatusBadge status={task.status} />
            </article>
          )
        })}
      </div>
    </section>
  )
}

type ReportKey =
  | 'monthly-banquet-calendar'
  | 'weekly-operations-report'
  | 'lost-business-analysis'
  | 'package-popularity'
  | 'venue-utilization'
  | 'salesperson-performance'

const REPORT_ITEMS: Array<{ key: ReportKey; label: string }> = [
  { key: 'monthly-banquet-calendar', label: 'Monthly banquet calendar' },
  { key: 'weekly-operations-report', label: 'Weekly operations report' },
  { key: 'lost-business-analysis', label: 'Lost business analysis' },
  { key: 'package-popularity', label: 'Package popularity' },
  { key: 'venue-utilization', label: 'Venue utilization' },
  { key: 'salesperson-performance', label: 'Salesperson performance' },
]

function ReportsView({
  bookings,
  confirmedRevenue,
  forecastRevenue,
  leads,
  pipelineRevenue,
  products,
}: {
  bookings: EventBooking[]
  confirmedRevenue: number
  forecastRevenue: number
  leads: Lead[]
  pipelineRevenue: number
  products: Product[]
}) {
  const [activeReport, setActiveReport] = useState<ReportKey | null>(null)
  const confirmed = bookings.filter((booking) => booking.status === 'Confirmed').length
  const tentative = bookings.filter((booking) => booking.status === 'Tentative').length
  const outstanding = bookings.filter((booking) => booking.paymentStatus !== 'Paid').length

  const monthlyBanquetCalendar = useMemo(() => {
    const groups = new Map<string, EventBooking[]>()
    bookings.forEach((booking) => {
      const key = toMonthKey(toLocalDate(booking.date))
      groups.set(key, [...(groups.get(key) ?? []), booking])
    })
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second))
  }, [bookings])

  const weeklyOperations = useMemo(() => {
    const now = new Date()
    const weekOffset = (now.getDay() + 6) % 7
    const weekStart = toDateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekOffset),
    )
    const weekEnd = toDateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekOffset + 6),
    )
    return bookings
      .filter((booking) => booking.date >= weekStart && booking.date <= weekEnd)
      .map((booking) => ({
        booking,
        bookingTasks: tasks.filter((task) => task.bookingId === booking.id),
      }))
  }, [bookings])

  const lostBookings = bookings.filter((booking) => booking.status === 'Lost')
  const lostLeads = leads.filter((lead) => lead.stage === 'Lost')

  const packagePopularity = useMemo(() => {
    const counts = new Map<string, number>()
    bookings.forEach((booking) => {
      if (!booking.packageName) return
      counts.set(booking.packageName, (counts.get(booking.packageName) ?? 0) + 1)
    })
    return [...counts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        product: products.find((product) => product.name === name),
      }))
      .sort((first, second) => second.count - first.count)
  }, [bookings, products])

  const venueUtilization = useMemo(
    () =>
      initialVenues.map((venue) => ({
        venue,
        activeBookings: bookings.filter(
          (booking) => booking.venue === venue.name && booking.status !== 'Cancelled',
        ).length,
      })),
    [bookings],
  )

  const salespersonPerformance = useMemo(() => {
    const totals = new Map<string, { revenue: number; forecast: number; count: number }>()
    bookings.forEach((booking) => {
      const current = totals.get(booking.owner) ?? { revenue: 0, forecast: 0, count: 0 }
      totals.set(booking.owner, {
        revenue: current.revenue + booking.revenue,
        forecast:
          current.forecast +
          (booking.status === 'Lost' || booking.status === 'Cancelled'
            ? 0
            : booking.forecastRevenue),
        count: current.count + 1,
      })
    })
    return [...totals.entries()].sort(([, first], [, second]) => second.revenue - first.revenue)
  }, [bookings])

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard icon={ShieldCheck} label="Confirmed events" value={confirmed.toString()} detail="Signed bookings" />
        <MetricCard icon={Clock3} label="Tentative holds" value={tentative.toString()} detail="Hold expiry monitored" />
        <MetricCard icon={ReceiptText} label="Outstanding invoices" value={outstanding.toString()} detail="Deposit or final payment" />
        <MetricCard icon={BarChart3} label="Pipeline value" value={money(pipelineRevenue)} detail="Open leads" />
      </section>

      <section className="split-layout">
        <div className="panel">
          <PanelHeader title="Revenue forecast" />
          <div className="report-bars">
            <ReportBar label="Confirmed" max={forecastRevenue} value={confirmedRevenue} />
            <ReportBar label="Forecast" max={forecastRevenue} value={forecastRevenue} />
            <ReportBar label="Pipeline" max={forecastRevenue + pipelineRevenue} value={pipelineRevenue} />
          </div>
        </div>
        <div className="panel">
          <PanelHeader title="Report library" />
          <div className="report-list">
            {REPORT_ITEMS.map((report) => (
              <button
                className={activeReport === report.key ? 'report-item active' : 'report-item'}
                key={report.key}
                onClick={() =>
                  setActiveReport((current) => (current === report.key ? null : report.key))
                }
                type="button"
              >
                <BarChart3 size={16} />
                {report.label}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeReport && (
        <section className="panel report-drilldown">
          <PanelHeader title={REPORT_ITEMS.find((item) => item.key === activeReport)?.label ?? ''} />
          <div className="stage-list">
            {activeReport === 'monthly-banquet-calendar' &&
              (monthlyBanquetCalendar.length ? (
                monthlyBanquetCalendar.map(([month, monthBookings]) => (
                  <div className="stage-item" key={month}>
                    <div>
                      <strong>{month}</strong>
                      <span>{monthBookings.map((booking) => booking.eventName).join(', ')}</span>
                    </div>
                    <em>{monthBookings.length} event{monthBookings.length === 1 ? '' : 's'}</em>
                  </div>
                ))
              ) : (
                <p>No bookings scheduled.</p>
              ))}

            {activeReport === 'weekly-operations-report' &&
              (weeklyOperations.length ? (
                weeklyOperations.map(({ booking, bookingTasks }) => (
                  <div className="stage-item" key={booking.id}>
                    <div>
                      <strong>{booking.eventName}</strong>
                      <span>
                        {booking.date} · {bookingTasks.length} task
                        {bookingTasks.length === 1 ? '' : 's'}
                        {bookingTasks.length
                          ? `: ${bookingTasks.map((task) => task.title).join(', ')}`
                          : ''}
                      </span>
                    </div>
                    <em>{booking.status}</em>
                  </div>
                ))
              ) : (
                <p>No bookings scheduled this week.</p>
              ))}

            {activeReport === 'lost-business-analysis' &&
              (lostBookings.length || lostLeads.length ? (
                <>
                  {lostBookings.map((booking) => (
                    <div className="stage-item" key={booking.id}>
                      <div>
                        <strong>{booking.eventName}</strong>
                        <span>
                          {booking.leadSource} · {booking.nextAction}
                        </span>
                      </div>
                      <em>{money(booking.forecastRevenue)}</em>
                    </div>
                  ))}
                  {lostLeads.map((lead) => (
                    <div className="stage-item" key={lead.id}>
                      <div>
                        <strong>
                          {lead.name}
                          {lead.company ? ` · ${lead.company}` : ''}
                        </strong>
                        <span>{lead.lostReason || 'No lost reason recorded'}</span>
                      </div>
                      <em>{money(lead.estimatedValue)}</em>
                    </div>
                  ))}
                </>
              ) : (
                <p>No lost business recorded.</p>
              ))}

            {activeReport === 'package-popularity' &&
              (packagePopularity.length ? (
                packagePopularity.map((row) => (
                  <div className="stage-item" key={row.name}>
                    <div>
                      <strong>{row.name}</strong>
                      <span>
                        {row.product
                          ? `${row.product.category} · ${priceLabel(row.product.price)}`
                          : 'Not in package catalog'}
                      </span>
                    </div>
                    <em>{row.count} booking{row.count === 1 ? '' : 's'}</em>
                  </div>
                ))
              ) : (
                <p>No packages booked yet.</p>
              ))}

            {activeReport === 'venue-utilization' &&
              venueUtilization.map(({ venue, activeBookings }) => (
                <div className="stage-item" key={venue.id}>
                  <div>
                    <strong>{venue.name}</strong>
                    <span>
                      {venue.utilization}% baseline utilization · {activeBookings} active booking
                      {activeBookings === 1 ? '' : 's'}
                    </span>
                  </div>
                  <em>{capacityLabel(venue.capacity)} cap</em>
                </div>
              ))}

            {activeReport === 'salesperson-performance' &&
              (salespersonPerformance.length ? (
                salespersonPerformance.map(([owner, totals]) => (
                  <div className="stage-item" key={owner}>
                    <div>
                      <strong>{owner}</strong>
                      <span>
                        {totals.count} booking{totals.count === 1 ? '' : 's'} ·{' '}
                        {money(totals.forecast)} forecast
                      </span>
                    </div>
                    <em>{money(totals.revenue)}</em>
                  </div>
                ))
              ) : (
                <p>No bookings recorded.</p>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Issuer details — the legal identity printed on quotations, invoices and tax
 * invoices. Saved explicitly, since these values end up on documents that are
 * filed with the Revenue Department.
 */
function IssuerSettingsPanel() {
  const { issuer, setIssuer, save, ready, error } = useIssuerSettings(true)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const setField = <K extends keyof IssuerSettings>(field: K, value: IssuerSettings[K]) => {
    setIssuer((current) => ({ ...current, [field]: value }))
    setNotice('')
  }

  const setAddress = <K extends keyof ThaiAddress>(field: K, value: ThaiAddress[K]) => {
    setIssuer((current) => ({
      ...current,
      billing_address: { ...current.billing_address, [field]: value },
    }))
    setNotice('')
  }

  const handleSave = async () => {
    setSaving(true)
    const failure = await save(issuer)
    setSaving(false)
    setNotice(failure ?? 'Issuer details saved.')
  }

  // Logos are stored inline as a data URL so the document renderer needs no
  // network fetch (and no public bucket) to draw the letterhead.
  const handleLogo = (file: File | undefined) => {
    if (!file) return
    if (file.size > 512 * 1024) {
      setNotice('Logo must be under 512 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setField('logo_url', String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }

  if (!ready) {
    return (
      <section className="panel" aria-busy="true">
        <p className="empty-state">Loading issuer details…</p>
      </section>
    )
  }

  const address = issuer.billing_address
  const taxIdDigits = issuer.tax_id.replace(/\D/g, '')
  const taxIdValid = taxIdDigits.length === 13

  return (
    <section className="page-stack">
      <div className="panel">
        <PanelHeader
          title="Issuer identity"
          detail="Printed on every quotation, invoice, and tax invoice."
        />
        <div className="form-grid">
          <FormField label="Company name (EN)" requiredLabel="Required" required>
            <input
              onChange={(event) => setField('company_name', event.target.value)}
              value={issuer.company_name}
            />
          </FormField>
          <FormField label="Company name (TH)">
            <input
              onChange={(event) => setField('company_name_th', event.target.value)}
              placeholder="บริษัท ..."
              value={issuer.company_name_th}
            />
          </FormField>
          <FormField
            label="Tax ID (13 digits)"
            hint={
              issuer.tax_id && !taxIdValid
                ? `${taxIdDigits.length} of 13 digits`
                : undefined
            }
          >
            <input
              inputMode="numeric"
              onChange={(event) => setField('tax_id', event.target.value)}
              placeholder="0000000000000"
              value={issuer.tax_id}
            />
          </FormField>
          <FormField label="Office type">
            <select
              onChange={(event) =>
                setField('office_type', event.target.value as IssuerSettings['office_type'])
              }
              value={issuer.office_type}
            >
              <option value="head_office">Head office (สำนักงานใหญ่)</option>
              <option value="branch">Branch (สาขา)</option>
            </select>
          </FormField>
          {issuer.office_type === 'branch' && (
            <FormField label="Branch code" requiredLabel="Required" required>
              <input
                inputMode="numeric"
                onChange={(event) => setField('branch_code', event.target.value)}
                placeholder="00001"
                value={issuer.branch_code}
              />
            </FormField>
          )}
        </div>
      </div>

      <div className="panel">
        <PanelHeader
          title="Registered address"
          detail="Thai and English are stored separately so a Thai tax invoice never prints mixed script."
        />
        <div className="form-grid">
          <FormField label="House / building no.">
            <input
              onChange={(event) => setAddress('house_no', event.target.value)}
              value={address.house_no}
            />
          </FormField>
          <FormField label="Soi">
            <input
              onChange={(event) => setAddress('soi', event.target.value)}
              value={address.soi}
            />
          </FormField>
          <FormField label="Road">
            <input
              onChange={(event) => setAddress('road', event.target.value)}
              value={address.road}
            />
          </FormField>
          <FormField label="Postcode">
            <input
              inputMode="numeric"
              onChange={(event) => setAddress('postcode', event.target.value)}
              value={address.postcode}
            />
          </FormField>
          <FormField label="Subdistrict / ตำบล (TH)">
            <input
              onChange={(event) => setAddress('subdistrict', event.target.value)}
              value={address.subdistrict}
            />
          </FormField>
          <FormField label="Subdistrict (EN)">
            <input
              onChange={(event) => setAddress('subdistrict_en', event.target.value)}
              value={address.subdistrict_en}
            />
          </FormField>
          <FormField label="District / อำเภอ (TH)">
            <input
              onChange={(event) => setAddress('district', event.target.value)}
              value={address.district}
            />
          </FormField>
          <FormField label="District (EN)">
            <input
              onChange={(event) => setAddress('district_en', event.target.value)}
              value={address.district_en}
            />
          </FormField>
          <FormField label="Province / จังหวัด (TH)">
            <input
              onChange={(event) => setAddress('province', event.target.value)}
              value={address.province}
            />
          </FormField>
          <FormField label="Province (EN)">
            <input
              onChange={(event) => setAddress('province_en', event.target.value)}
              value={address.province_en}
            />
          </FormField>
        </div>
      </div>

      <div className="panel">
        <PanelHeader title="Contact and signature" />
        <div className="form-grid">
          <FormField label="Phone">
            <input
              onChange={(event) => setField('phone', event.target.value)}
              value={issuer.phone}
            />
          </FormField>
          <FormField label="Email">
            <input
              onChange={(event) => setField('email', event.target.value)}
              type="email"
              value={issuer.email}
            />
          </FormField>
          <FormField label="Website">
            <input
              onChange={(event) => setField('website', event.target.value)}
              value={issuer.website}
            />
          </FormField>
          <FormField label="Support email">
            <input
              onChange={(event) => setField('support_email', event.target.value)}
              type="email"
              value={issuer.support_email}
            />
          </FormField>
          <FormField label="Signatory name">
            <input
              onChange={(event) => setField('signatory_name', event.target.value)}
              value={issuer.signatory_name}
            />
          </FormField>
          <FormField label="Signatory title">
            <input
              onChange={(event) => setField('signatory_title', event.target.value)}
              value={issuer.signatory_title}
            />
          </FormField>
          <FormField label="PromptPay ID">
            <input
              onChange={(event) => setField('promptpay_id', event.target.value)}
              value={issuer.promptpay_id}
            />
          </FormField>
          <FormField label="PromptPay account name">
            <input
              onChange={(event) => setField('promptpay_name', event.target.value)}
              value={issuer.promptpay_name}
            />
          </FormField>
        </div>
      </div>

      <div className="panel">
        <PanelHeader title="Letterhead logo" detail="PNG or SVG, under 512 KB." />
        <div className="issuer-logo-row">
          {issuer.logo_url ? (
            <img alt="Current logo" className="issuer-logo-preview" src={issuer.logo_url} />
          ) : (
            <p className="empty-state">No logo set — documents print the company name.</p>
          )}
          <div className="status-actions">
            <input
              accept="image/png,image/svg+xml,image/jpeg"
              onChange={(event) => handleLogo(event.target.files?.[0])}
              type="file"
            />
            {issuer.logo_url && (
              <button
                className="secondary-action"
                onClick={() => setField('logo_url', '')}
                type="button"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="status-actions">
          <button
            className="primary-action"
            disabled={saving}
            onClick={() => void handleSave()}
            type="button"
          >
            <ShieldCheck size={17} />
            {saving ? 'Saving…' : 'Save issuer details'}
          </button>
        </div>
        {(notice || error) && <p className="admin-notice">{notice || error}</p>}
      </div>
    </section>
  )
}

function AdminConsoleView({
  adminCredentialSettings,
  adminPlans,
  clientCompanies,
  clientsError,
  clientsReady,
  expansionPacks,
  setAdminCredentialSettings,
  setAdminPlans,
  setClientCompanies,
  setExpansionPacks,
}: {
  adminCredentialSettings: AdminCredentialSettings
  adminPlans: SaaSPlan[]
  clientCompanies: ClientCompany[]
  clientsError: string
  clientsReady: boolean
  expansionPacks: ExpansionPack[]
  setAdminCredentialSettings: (
    next:
      | AdminCredentialSettings
      | ((current: AdminCredentialSettings) => AdminCredentialSettings),
  ) => void
  setAdminPlans: (next: SaaSPlan[] | ((current: SaaSPlan[]) => SaaSPlan[])) => void
  setClientCompanies: (
    next: ClientCompany[] | ((current: ClientCompany[]) => ClientCompany[]),
  ) => void
  setExpansionPacks: (
    next: ExpansionPack[] | ((current: ExpansionPack[]) => ExpansionPack[]),
  ) => void
}) {
  const [activeTab, setActiveTab] = useState<AdminConsoleTab>('Clients')
  const [selectedClientId, setSelectedClientId] = useState(
    clientCompanies[0]?.id ?? '',
  )
  const [currentPassword, setCurrentPassword] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [securityNotice, setSecurityNotice] = useState('')
  // The signed-in operator's own console-admin identity, read from (and written
  // back to) eventpilot_console_admins — not the cosmetic adminCredentialSettings.
  // Lazy-initialised from the console session so the sandbox / initial identity
  // is set without a synchronous setState inside the load effect below.
  const [adminProfile, setAdminProfile] = useState(() => {
    const session = readConsoleSession()
    return {
      username: session?.username ?? '',
      displayName: session?.name || session?.username || '',
      email: '',
    }
  })
  const [profileNotice, setProfileNotice] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [clientNotice, setClientNotice] = useState('')
  const [editingPlanId, setEditingPlanId] = useState<SaaSTierId | null>(null)
  const [editingPackId, setEditingPackId] = useState<string | null>(null)
  const selectedClient =
    clientCompanies.find((client) => client.id === selectedClientId) ??
    clientCompanies[0]
  const totalAnnualValue = clientCompanies.reduce((sum, client) => {
    const plan = adminPlans.find((item) => item.id === client.planId) ?? adminPlans[0]
    const includedUsers = client.userLimitOverride || plan.includedUsers
    const extraUsers = Math.max(0, client.activeUsers - includedUsers)
    return sum + plan.annualPrice + extraUsers * plan.additionalUserPrice
  }, 0)
  const activeClientCount = clientCompanies.filter(
    (client) => client.status === 'Active',
  ).length
  const pilotClientCount = clientCompanies.filter(
    (client) => client.status === 'Pilot',
  ).length
  const totalSeats = clientCompanies.reduce(
    (sum, client) => sum + client.userLimitOverride,
    0,
  )

  const updateClient = <K extends keyof ClientCompany>(
    clientId: string,
    field: K,
    value: ClientCompany[K],
  ) => {
    setClientCompanies((currentClients) =>
      currentClients.map((client) =>
        client.id === clientId ? { ...client, [field]: value } : client,
      ),
    )
  }

  const updatePlan = <K extends keyof SaaSPlan>(
    planId: SaaSTierId,
    field: K,
    value: SaaSPlan[K],
  ) => {
    setAdminPlans((currentPlans) =>
      currentPlans.map((plan) =>
        plan.id === planId ? { ...plan, [field]: value } : plan,
      ),
    )
  }

  const updateExpansionPack = <K extends keyof ExpansionPack>(
    packId: string,
    field: K,
    value: ExpansionPack[K],
  ) => {
    setExpansionPacks((currentPacks) =>
      currentPacks.map((pack) =>
        pack.id === packId ? { ...pack, [field]: value } : pack,
      ),
    )
  }

  const addExpansionPack = () => {
    const id = `PACK-${String(Date.now()).slice(-5)}${Math.random().toString(36).slice(2, 5)}`
    const nextPack: ExpansionPack = {
      id,
      name: 'New expansion pack',
      category: 'Add-on',
      description: 'Describe the add-on value and what it unlocks.',
      annualPrice: 0,
      pricingUnit: 'per workspace / year',
      recommendedFor: 'Clients with special workflow needs',
      status: 'Draft',
    }
    setExpansionPacks((currentPacks) => [nextPack, ...currentPacks])
    setEditingPackId(id)
  }

  // Creates the row server-side first, so the client carries its real database
  // id — billing documents will reference it.
  const addClientCompany = async () => {
    setClientNotice('')
    try {
      const data = await consoleCall('upsert_client', {
        client: {
          name: 'New client company',
          property_type: 'Hotel / venue',
          plan: 'Starter',
          account_status: 'pilot',
          renewal_date: toDateKey(new Date()),
          active_users: 1,
          allowed_users: 1,
          booking_limit: 20,
          support_owner: 'EventPilot Admin',
        },
      })
      const created = rowToClient(data.client as Record<string, unknown>)
      setClientCompanies((currentClients) => [created, ...currentClients])
      setSelectedClientId(created.id)
      setActiveTab('Clients')
    } catch (error) {
      setClientNotice(
        error instanceof Error ? error.message : 'Could not create the client company.',
      )
    }
  }

  const updateAdminCredential = <K extends keyof AdminCredentialSettings>(
    field: K,
    value: AdminCredentialSettings[K],
  ) => {
    setAdminCredentialSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }))
  }

  // Load the signed-in operator's own console-admin row so the name/email fields
  // reflect (and save back to) the real record. list_admins is service-role only
  // behind the console token, so nothing sensitive is exposed to the browser.
  useEffect(() => {
    let active = true
    const session = readConsoleSession()
    // No session, or offline sandbox (no backend row): the lazy initial state
    // already holds the session identity, so there is nothing to fetch.
    if (!session || session.sandbox) return
    void consoleCall('list_admins')
      .then((data) => {
        if (!active) return
        const admins = (data.admins ?? []) as Array<{
          username: string
          display_name: string | null
          email: string | null
        }>
        const me = admins.find((a) => a.username === session.username)
        setAdminProfile({
          username: me?.username ?? session.username,
          displayName: me?.display_name ?? session.name ?? '',
          email: me?.email ?? '',
        })
      })
      .catch(() => {
        if (!active) return
        setAdminProfile((current) => ({
          ...current,
          username: session.username,
          displayName: current.displayName || session.name || '',
        }))
      })
    return () => {
      active = false
    }
  }, [])

  // Persists the operator's display name and contact email to their
  // eventpilot_console_admins row. Passing no password leaves the hash untouched.
  const handleAdminProfileSave = async () => {
    const session = readConsoleSession()
    if (!session) {
      setProfileNotice('Console session expired. Sign in again.')
      return
    }
    const displayName = adminProfile.displayName.trim()
    if (!displayName) {
      setProfileNotice('Admin name cannot be empty.')
      return
    }
    setSavingProfile(true)
    try {
      await consoleCall('upsert_admin', {
        username: adminProfile.username || session.username,
        display_name: displayName,
        email: adminProfile.email.trim() || null,
      })
    } catch (error) {
      setProfileNotice(
        error instanceof Error ? error.message : 'Could not save the admin profile.',
      )
      return
    } finally {
      setSavingProfile(false)
    }
    setProfileNotice('Admin profile updated.')
  }

  // Changes the signed-in console admin's real password via the console edge
  // function (the database stores only a bcrypt hash).
  const handlePasswordUpdate = async () => {
    if (passwordDraft.length < adminCredentialSettings.minimumPasswordLength) {
      setSecurityNotice(
        `Password must be at least ${adminCredentialSettings.minimumPasswordLength} characters.`,
      )
      return
    }

    if (passwordDraft !== passwordConfirm) {
      setSecurityNotice('Password confirmation does not match.')
      return
    }

    if (!currentPassword) {
      setSecurityNotice('Enter your current password to confirm the change.')
      return
    }

    try {
      await consoleCall('change_password', {
        current_password: currentPassword,
        new_password: passwordDraft,
      })
    } catch (error) {
      setSecurityNotice(error instanceof Error ? error.message : 'Password change failed.')
      return
    }

    setAdminCredentialSettings((currentSettings) => ({
      ...currentSettings,
      lastPasswordChange: toDateKey(new Date()),
    }))
    setCurrentPassword('')
    setPasswordDraft('')
    setPasswordConfirm('')
    setSecurityNotice('Console password updated.')
  }

  return (
    <div className="page-stack">
      <section className="panel admin-hero">
        <div>
          <p className="eyebrow">SaaS control center</p>
          <h2>Manage tenant companies, plan limits, and owner access</h2>
        </div>
        <button
          className="primary-action"
          onClick={() => void addClientCompany()}
          type="button"
        >
          <Plus size={17} />
          Add client company
        </button>
      </section>

      {(clientsError || clientNotice) && (
        <p className="admin-notice">{clientsError || clientNotice}</p>
      )}

      <section className="metric-grid">
        <MetricCard icon={Building2} label="Client companies" value={clientCompanies.length.toString()} detail={`${activeClientCount} active accounts`} />
        <MetricCard icon={BadgeDollarSign} label="Annual value" value={money(totalAnnualValue)} detail="Plan value in local sandbox" />
        <MetricCard icon={Users} label="Managed seats" value={totalSeats.toString()} detail="Current configured user limits" />
        <MetricCard icon={Clock3} label="Pilot accounts" value={pilotClientCount.toString()} detail="Free or evaluation accounts" />
      </section>

      <div className="admin-tabs" role="tablist" aria-label="Admin console sections">
        {(['Clients', 'Packages', 'Company', 'Security'] as const).map((tab) => (
          <button
            className={activeTab === tab ? 'filter-chip filter-all active' : 'filter-chip'}
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            role="tab"
            type="button"
          >
            {tab === 'Packages' ? 'Packages & Expansions' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'Clients' && !clientsReady && (
        <section className="panel" aria-busy="true">
          <p className="empty-state">Loading client companies…</p>
        </section>
      )}

      {activeTab === 'Clients' && clientsReady && clientCompanies.length === 0 && (
        <section className="panel">
          <p className="empty-state">
            No client companies yet. Add one to start issuing quotations and
            invoices against it.
          </p>
        </section>
      )}

      {activeTab === 'Clients' && selectedClient && (
        <section className="admin-console-layout">
          <div className="panel admin-client-list">
            {clientCompanies.map((client) => {
              const plan = adminPlans.find((item) => item.id === client.planId)
              return (
                <button
                  className={
                    client.id === selectedClient.id
                      ? 'admin-client-card selected'
                      : 'admin-client-card'
                  }
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  type="button"
                >
                  <strong>{client.companyName}</strong>
                  <span>{client.propertyType}</span>
                  <div>
                    <StatusBadge status={client.status} />
                    <em>{plan?.name}</em>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="panel admin-editor">
            <div className="panel-header">
              <div>
                {/* Database ids are UUIDs; show a short readable reference. */}
                <p className="eyebrow">CLIENT-{selectedClient.id.slice(0, 8).toUpperCase()}</p>
                <h2>{selectedClient.companyName}</h2>
              </div>
              <StatusBadge status={selectedClient.status} />
            </div>

            <div className="form-grid">
              <FormField label="Client company">
                <input
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'companyName', event.target.value)
                  }
                  value={selectedClient.companyName}
                />
              </FormField>
              <FormField label="Property type">
                <input
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'propertyType', event.target.value)
                  }
                  value={selectedClient.propertyType}
                />
              </FormField>
              <FormField label="Subscription package">
                <select
                  onChange={(event) => {
                    const planId = event.target.value as SaaSTierId
                    const plan = adminPlans.find((item) => item.id === planId) ?? adminPlans[0]
                    updateClient(selectedClient.id, 'planId', planId)
                    updateClient(
                      selectedClient.id,
                      'userLimitOverride',
                      plan.includedUsers,
                    )
                    updateClient(
                      selectedClient.id,
                      'bookingLimitOverride',
                      plan.bookingLimit ?? 0,
                    )
                  }}
                  value={selectedClient.planId}
                >
                  {adminPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Account status">
                <select
                  onChange={(event) =>
                    updateClient(
                      selectedClient.id,
                      'status',
                      event.target.value as ClientAccountStatus,
                    )
                  }
                  value={selectedClient.status}
                >
                  {(['Active', 'Pilot', 'Suspended'] as const).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Client admin email">
                <input
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'adminEmail', event.target.value)
                  }
                  type="email"
                  value={selectedClient.adminEmail}
                />
              </FormField>
              <FormField label="Renewal date">
                <input
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'renewalDate', event.target.value)
                  }
                  type="date"
                  value={selectedClient.renewalDate}
                />
              </FormField>
              <FormField label="Active users">
                <input
                  min="0"
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'activeUsers', Number(event.target.value))
                  }
                  type="number"
                  value={selectedClient.activeUsers}
                />
              </FormField>
              <FormField label="Allowed users">
                <input
                  min="1"
                  onChange={(event) =>
                    updateClient(
                      selectedClient.id,
                      'userLimitOverride',
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={selectedClient.userLimitOverride}
                />
              </FormField>
              <FormField label="Booking limit">
                <input
                  min="0"
                  onChange={(event) =>
                    updateClient(
                      selectedClient.id,
                      'bookingLimitOverride',
                      Number(event.target.value),
                    )
                  }
                  placeholder="0 means unlimited"
                  type="number"
                  value={selectedClient.bookingLimitOverride}
                />
              </FormField>
              <FormField label="Support owner">
                <input
                  onChange={(event) =>
                    updateClient(selectedClient.id, 'supportOwner', event.target.value)
                  }
                  value={selectedClient.supportOwner}
                />
              </FormField>
            </div>

            <div className="usage-panel">
              <div>
                <span>Seat usage</span>
                <strong>
                  {selectedClient.activeUsers} / {selectedClient.userLimitOverride}
                </strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (selectedClient.activeUsers /
                          Math.max(1, selectedClient.userLimitOverride)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>

            <FormField label="Admin notes">
              <textarea
                onChange={(event) =>
                  updateClient(selectedClient.id, 'notes', event.target.value)
                }
                value={selectedClient.notes}
              />
            </FormField>
          </div>
        </section>
      )}

      {activeTab === 'Packages' && (
        <div className="page-stack">
          <section className="plan-grid">
            {adminPlans.map((plan) => {
              const isEditing = editingPlanId === plan.id
              return (
                <article className="panel plan-card" key={plan.id}>
                  <div className="plan-card-head">
                    <div>
                      <p className="eyebrow">{plan.id}</p>
                      <h2>{plan.name}</h2>
                    </div>
                    <button
                      className={isEditing ? 'secondary-action' : 'primary-action'}
                      onClick={() => setEditingPlanId(isEditing ? null : plan.id)}
                      type="button"
                    >
                      {isEditing ? 'Done' : 'Edit package'}
                    </button>
                  </div>

                  {isEditing ? (
                    <div className="plan-edit-form">
                      <FormField label="Package name">
                        <input
                          onChange={(event) => updatePlan(plan.id, 'name', event.target.value)}
                          value={plan.name}
                        />
                      </FormField>
                      <FormField label="Annual price">
                        <input
                          min="0"
                          onChange={(event) =>
                            updatePlan(plan.id, 'annualPrice', Number(event.target.value))
                          }
                          type="number"
                          value={plan.annualPrice}
                        />
                      </FormField>
                      <FormField label="Included users">
                        <input
                          min="1"
                          onChange={(event) =>
                            updatePlan(plan.id, 'includedUsers', Number(event.target.value))
                          }
                          type="number"
                          value={plan.includedUsers}
                        />
                      </FormField>
                      <FormField label="Additional user price">
                        <input
                          min="0"
                          onChange={(event) =>
                            updatePlan(
                              plan.id,
                              'additionalUserPrice',
                              Number(event.target.value),
                            )
                          }
                          type="number"
                          value={plan.additionalUserPrice}
                        />
                      </FormField>
                      <FormField label="Booking limit">
                        <input
                          min="0"
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            updatePlan(plan.id, 'bookingLimit', value === 0 ? null : value)
                          }}
                          placeholder="0 means unlimited"
                          type="number"
                          value={plan.bookingLimit ?? 0}
                        />
                      </FormField>
                      <FormField label="Target customer">
                        <input
                          onChange={(event) =>
                            updatePlan(plan.id, 'targetCustomer', event.target.value)
                          }
                          value={plan.targetCustomer}
                        />
                      </FormField>
                      <FormField label="Description">
                        <textarea
                          onChange={(event) =>
                            updatePlan(plan.id, 'description', event.target.value)
                          }
                          value={plan.description}
                        />
                      </FormField>
                      <FormField label="Locked modules / features">
                        <textarea
                          onChange={(event) =>
                            updatePlan(
                              plan.id,
                              'lockedFeatures',
                              splitList(event.target.value),
                            )
                          }
                          placeholder="Separate features with commas or new lines"
                          value={plan.lockedFeatures.join('\n')}
                        />
                      </FormField>
                      <FormField label="Internal admin notes">
                        <textarea
                          onChange={(event) =>
                            updatePlan(plan.id, 'adminNotes', event.target.value)
                          }
                          value={plan.adminNotes}
                        />
                      </FormField>
                    </div>
                  ) : (
                    <>
                      <p>{plan.description}</p>
                      <strong>
                        {plan.annualPrice === 0 ? 'Free' : `${money(plan.annualPrice)} / year`}
                      </strong>
                      <div className="plan-facts">
                        <Detail label="Included users" value={plan.includedUsers.toString()} />
                        <Detail
                          label="Additional user"
                          value={
                            plan.additionalUserPrice === 0
                              ? 'Not available'
                              : `${money(plan.additionalUserPrice)} / user / year`
                          }
                        />
                        <Detail
                          label="Booking limit"
                          value={
                            plan.bookingLimit
                              ? `${plan.bookingLimit} active bookings`
                              : 'Unlimited'
                          }
                        />
                        <Detail label="Target customer" value={plan.targetCustomer} />
                      </div>
                      <div className="drawer-section">
                        <h3>
                          {plan.lockedFeatures.length
                            ? 'Locked on this tier'
                            : 'Included access'}
                        </h3>
                        {plan.lockedFeatures.length ? (
                          <ul>
                            {plan.lockedFeatures.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>All core EventPilot CRM, booking, BEO, proposal, invoice, and reporting workflows.</p>
                        )}
                      </div>
                      <div className="admin-plan-note">
                        <strong>Admin note</strong>
                        <span>{plan.adminNotes}</span>
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </section>

          <section className="panel expansion-pack-section">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Expansion packs</p>
                <h2>Add-on products for tailored client packages</h2>
              </div>
              <button className="primary-action" onClick={addExpansionPack} type="button">
                <Plus size={17} />
                Add expansion pack
              </button>
            </div>
            <div className="expansion-pack-grid">
              {expansionPacks.map((pack) => {
                const isEditing = editingPackId === pack.id
                return (
                  <article className="expansion-pack-card" key={pack.id}>
                    <div className="resource-head">
                      <span>{pack.category}</span>
                      <strong>{pack.name}</strong>
                    </div>
                    {isEditing ? (
                      <div className="plan-edit-form">
                        <FormField label="Pack name">
                          <input
                            onChange={(event) =>
                              updateExpansionPack(pack.id, 'name', event.target.value)
                            }
                            value={pack.name}
                          />
                        </FormField>
                        <FormField label="Category">
                          <input
                            onChange={(event) =>
                              updateExpansionPack(pack.id, 'category', event.target.value)
                            }
                            value={pack.category}
                          />
                        </FormField>
                        <FormField label="Price">
                          <input
                            min="0"
                            onChange={(event) =>
                              updateExpansionPack(
                                pack.id,
                                'annualPrice',
                                Number(event.target.value),
                              )
                            }
                            type="number"
                            value={pack.annualPrice}
                          />
                        </FormField>
                        <FormField label="Pricing unit">
                          <input
                            onChange={(event) =>
                              updateExpansionPack(pack.id, 'pricingUnit', event.target.value)
                            }
                            value={pack.pricingUnit}
                          />
                        </FormField>
                        <FormField label="Status">
                          <select
                            onChange={(event) =>
                              updateExpansionPack(
                                pack.id,
                                'status',
                                event.target.value as ExpansionPack['status'],
                              )
                            }
                            value={pack.status}
                          >
                            <option value="Available">Available</option>
                            <option value="Draft">Draft</option>
                          </select>
                        </FormField>
                        <FormField label="Recommended for">
                          <input
                            onChange={(event) =>
                              updateExpansionPack(
                                pack.id,
                                'recommendedFor',
                                event.target.value,
                              )
                            }
                            value={pack.recommendedFor}
                          />
                        </FormField>
                        <FormField label="Description">
                          <textarea
                            onChange={(event) =>
                              updateExpansionPack(
                                pack.id,
                                'description',
                                event.target.value,
                              )
                            }
                            value={pack.description}
                          />
                        </FormField>
                      </div>
                    ) : (
                      <>
                        <p>{pack.description}</p>
                        <div className="plan-facts">
                          <Detail label="Price" value={money(pack.annualPrice)} />
                          <Detail label="Unit" value={pack.pricingUnit} />
                          <Detail label="Recommended for" value={pack.recommendedFor} />
                          <Detail label="Status" value={pack.status} />
                        </div>
                      </>
                    )}
                    <button
                      className="secondary-action full-width"
                      onClick={() => setEditingPackId(isEditing ? null : pack.id)}
                      type="button"
                    >
                      {isEditing ? 'Done' : 'Edit expansion pack'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'Company' && <IssuerSettingsPanel />}

      {activeTab === 'Security' && (
        <section className="admin-console-layout admin-security-layout">
          <div className="panel admin-credentials-panel">
            <PanelHeader title="Admin account" />
            <p className="panel-subtitle">
              This is the identity you use to sign in to the console. The name is
              saved to your operator record; the login username is fixed.
            </p>
            <div className="form-grid">
              <FormField label="Login username">
                <input
                  disabled
                  readOnly
                  value={adminProfile.username}
                />
              </FormField>
              <FormField label="Admin name">
                <input
                  onChange={(event) =>
                    setAdminProfile((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  value={adminProfile.displayName}
                />
              </FormField>
              <FormField label="Admin email">
                <input
                  onChange={(event) =>
                    setAdminProfile((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  type="email"
                  value={adminProfile.email}
                />
              </FormField>
            </div>
            <div className="status-actions">
              <button
                className="primary-action"
                disabled={savingProfile}
                onClick={() => void handleAdminProfileSave()}
                type="button"
              >
                <ShieldCheck size={17} />
                {savingProfile ? 'Saving…' : 'Save admin profile'}
              </button>
            </div>
            {profileNotice && <p className="admin-notice">{profileNotice}</p>}
          </div>

          <div className="panel admin-credentials-panel">
            <PanelHeader title="Console password" />
            <p className="panel-subtitle">
              Enter your current password to set a new one. Passwords are stored
              only as a bcrypt hash.
            </p>
            <div className="form-grid">
              <FormField label="Current console password">
                <input
                  autoComplete="current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  value={currentPassword}
                />
              </FormField>
              <FormField label="New console password">
                <input
                  autoComplete="new-password"
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  type="password"
                  value={passwordDraft}
                />
              </FormField>
              <FormField label="Confirm password">
                <input
                  autoComplete="new-password"
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  type="password"
                  value={passwordConfirm}
                />
              </FormField>
            </div>
            <div className="status-actions">
              <button
                className="primary-action"
                onClick={() => void handlePasswordUpdate()}
                type="button"
              >
                <ShieldCheck size={17} />
                Update console password
              </button>
            </div>
            {securityNotice && <p className="admin-notice">{securityNotice}</p>}
          </div>

          <div className="panel admin-settings-panel">
            <PanelHeader title="Security settings" />
            <div className="form-grid">
              <FormField label="Minimum password length">
                <input
                  min="8"
                  onChange={(event) =>
                    updateAdminCredential(
                      'minimumPasswordLength',
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={adminCredentialSettings.minimumPasswordLength}
                />
              </FormField>
              <FormField label="Session timeout minutes">
                <input
                  min="5"
                  onChange={(event) =>
                    updateAdminCredential(
                      'sessionTimeoutMinutes',
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={adminCredentialSettings.sessionTimeoutMinutes}
                />
              </FormField>
              <FormField label="Trusted device days">
                <input
                  min="1"
                  onChange={(event) =>
                    updateAdminCredential(
                      'trustedDeviceDays',
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={adminCredentialSettings.trustedDeviceDays}
                />
              </FormField>
              <FormField label="Allowed admin email domain">
                <input
                  onChange={(event) =>
                    updateAdminCredential('allowedEmailDomain', event.target.value)
                  }
                  value={adminCredentialSettings.allowedEmailDomain}
                />
              </FormField>
              <label className="toggle-row admin-toggle">
                <span>Verify new devices by email</span>
                <input
                  checked={adminCredentialSettings.requireNewDeviceEmailVerification}
                  onChange={(event) =>
                    updateAdminCredential(
                      'requireNewDeviceEmailVerification',
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
              </label>
              <label className="toggle-row admin-toggle">
                <span>Send login alerts</span>
                <input
                  checked={adminCredentialSettings.sendLoginAlerts}
                  onChange={(event) =>
                    updateAdminCredential('sendLoginAlerts', event.target.checked)
                  }
                  type="checkbox"
                />
              </label>
              <label className="toggle-row admin-toggle">
                <span>Extra check for sensitive admin actions</span>
                <input
                  checked={adminCredentialSettings.requireSensitiveActionVerification}
                  onChange={(event) =>
                    updateAdminCredential(
                      'requireSensitiveActionVerification',
                      event.target.checked,
                    )
                  }
                  type="checkbox"
                />
              </label>
            </div>
            <div className="security-model-card">
              <ShieldCheck size={20} />
              <div>
                <strong>Recommended low-friction setup</strong>
                <p>
                  Password login stays simple on trusted devices. New devices use
                  email verification, admins receive login alerts, and sensitive
                  changes can require a fresh email check.
                </p>
              </div>
            </div>
            <div className="drawer-section">
              <Detail
                label="Last password change"
                value={adminCredentialSettings.lastPasswordChange}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function SettingsView({
  account,
  beoViewers,
  currentUserId,
  departments,
  packageCategories,
  propertyProfile,
  rolePermissionOverrides,
  setBeoViewers,
  setDepartments,
  setPackageCategories,
  setPropertyProfile,
  setRolePermissionOverrides,
  setSetupStyleOptions,
  setUnitOptions,
  setupStyleOptions,
  unitOptions,
  updateAccountEmail,
  updateAccountPassword,
  updateProfileName,
}: {
  account: LoginSession
  beoViewers: BeoViewer[]
  currentUserId: string | null
  departments: BeoDepartment[]
  packageCategories: string[]
  propertyProfile: PropertyProfile
  rolePermissionOverrides: RolePermissionOverrides
  setBeoViewers: (next: BeoViewer[] | ((current: BeoViewer[]) => BeoViewer[])) => void
  setDepartments: (
    next: BeoDepartment[] | ((current: BeoDepartment[]) => BeoDepartment[]),
  ) => void
  setPackageCategories: (next: string[]) => void
  setPropertyProfile: (value: PropertyProfile) => void
  setRolePermissionOverrides: (
    next:
      | RolePermissionOverrides
      | ((current: RolePermissionOverrides) => RolePermissionOverrides),
  ) => void
  setSetupStyleOptions: (next: string[]) => void
  setUnitOptions: (next: string[]) => void
  setupStyleOptions: string[]
  unitOptions: string[]
  updateAccountEmail: (email: string) => Promise<string | null>
  updateAccountPassword: (password: string) => Promise<string | null>
  updateProfileName: (name: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PropertyProfile>(propertyProfile)
  const canEditProfile = hasPermission(account.role, 'admin:settings')
  const canManageUsers = hasPermission(account.role, 'admin:userManagement')
  const canEditPackages = hasPermission(account.role, 'packages:edit')
  const canEditVenues = hasPermission(account.role, 'venues:edit')

  const startEditing = () => {
    setDraft(propertyProfile)
    setEditing(true)
  }

  const saveProfile = () => {
    setPropertyProfile({
      ...draft,
      name: draft.name.trim() || propertyProfile.name,
      address: draft.address.trim(),
      lineOfficial: draft.lineOfficial.trim(),
    })
    setEditing(false)
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="property-profile">
          <div className="property-profile-head">
            <div>
              <p className="eyebrow">Property profile</p>
              {editing ? (
                <input
                  aria-label="Property name"
                  className="profile-name-input"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  value={draft.name}
                />
              ) : (
                <h2>{propertyProfile.name}</h2>
              )}
            </div>
            <div className="property-profile-aside">
              {account.workspaceCode.trim() && (
                <div className="workspace-code-tag">
                  <span>Workspace code</span>
                  <strong>{account.workspaceCode.trim()}</strong>
                </div>
              )}
              {editing ? (
                <div className="profile-actions">
                  <button
                    className="secondary-action"
                    onClick={() => setEditing(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="primary-action" onClick={saveProfile} type="button">
                    <CheckCircle2 size={16} />
                    Save changes
                  </button>
                </div>
              ) : (
                canEditProfile && (
                  <button className="secondary-action" onClick={startEditing} type="button">
                    Edit
                  </button>
                )
              )}
            </div>
          </div>

          {editing ? (
            <div className="profile-edit-grid">
              <FormField label="Address">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, address: event.target.value }))
                  }
                  value={draft.address}
                />
              </FormField>
              <FormField label="Phone (comma separated)">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      phones: splitList(event.target.value),
                    }))
                  }
                  value={draft.phones.join(', ')}
                />
              </FormField>
              <FormField label="Events email">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      emails: { ...current.emails, events: event.target.value.trim() },
                    }))
                  }
                  value={draft.emails.events}
                />
              </FormField>
              <FormField label="Reservations email">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      emails: { ...current.emails, reservations: event.target.value.trim() },
                    }))
                  }
                  value={draft.emails.reservations}
                />
              </FormField>
              <FormField label="General email">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      emails: { ...current.emails, general: event.target.value.trim() },
                    }))
                  }
                  value={draft.emails.general}
                />
              </FormField>
              <FormField label="Line official">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, lineOfficial: event.target.value }))
                  }
                  value={draft.lineOfficial}
                />
              </FormField>
              <FormField label="Signatory name" hint="Printed on proposals, invoices, and BEOs">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, signatoryName: event.target.value }))
                  }
                  value={draft.signatoryName}
                />
              </FormField>
              <FormField label="Signatory title">
                <input
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, signatoryTitle: event.target.value }))
                  }
                  value={draft.signatoryTitle}
                />
              </FormField>
            </div>
          ) : (
            <div className="profile-grid property-profile-grid">
              <Detail label="Address" value={propertyProfile.address} />
              <Detail label="Phone" value={propertyProfile.phones.join(', ')} />
              <Detail label="Line Official" value={propertyProfile.lineOfficial} />
              <Detail
                label="Signatory"
                value={
                  propertyProfile.signatoryName
                    ? `${propertyProfile.signatoryName}${propertyProfile.signatoryTitle ? ` — ${propertyProfile.signatoryTitle}` : ''}`
                    : 'Not set'
                }
              />
              <div className="detail-item detail-item-wide">
                <dt>Email routing</dt>
                <dd>
                  <div className="email-routes">
                    <div className="email-route">
                      <span>Events</span>
                      {propertyProfile.emails.events}
                    </div>
                    <div className="email-route">
                      <span>Reservations</span>
                      {propertyProfile.emails.reservations}
                    </div>
                    <div className="email-route">
                      <span>General</span>
                      {propertyProfile.emails.general}
                    </div>
                  </div>
                </dd>
              </div>
            </div>
          )}
        </div>
      </section>

      <UserProfilePanel
        account={account}
        updateAccountEmail={updateAccountEmail}
        updateAccountPassword={updateAccountPassword}
        updateProfileName={updateProfileName}
      />

      {isSupabaseEnabled && canManageUsers && (
        <UserManagementPanel
          beoViewers={beoViewers}
          currentRole={account.role}
          currentUserId={currentUserId}
          currentWorkspaceCode={account.workspaceCode}
          departments={departments}
          setBeoViewers={setBeoViewers}
        />
      )}

      {account.role === 'top_management' && (
        <DepartmentsPanel
          beoViewers={beoViewers}
          departments={departments}
          setDepartments={setDepartments}
        />
      )}

      {canEditPackages && (
        <PackageSettingsPanel
          categories={packageCategories}
          setCategories={setPackageCategories}
          setUnits={setUnitOptions}
          units={unitOptions}
        />
      )}

      {canEditVenues && (
        <VenueSettingsPanel setSetupStyles={setSetupStyleOptions} setupStyles={setupStyleOptions} />
      )}

      {account.role === 'top_management' ? (
        <RolePermissionsPanel
          overrides={rolePermissionOverrides}
          setOverrides={setRolePermissionOverrides}
        />
      ) : (
        <CollapsiblePanel title="Roles and permissions">
          <div className="permission-grid">
            {rolePermissions.map(([role, permission]) => (
              <div className="permission-row" key={role}>
                <strong>{role}</strong>
                <span>{permission}</span>
              </div>
            ))}
          </div>
        </CollapsiblePanel>
      )}

      <SupportPanel role={account.role} />

      <p className="app-version">
        EventPilot V.1.1.1 by NNR-Solutions {new Date().getFullYear()} ©
      </p>
    </div>
  )
}

function UserProfilePanel({
  account,
  updateAccountEmail,
  updateAccountPassword,
  updateProfileName,
}: {
  account: LoginSession
  updateAccountEmail: (email: string) => Promise<string | null>
  updateAccountPassword: (password: string) => Promise<string | null>
  updateProfileName: (name: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(account.displayName)
  const [email, setEmail] = useState(account.email)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const roleLabel = ROLE_LABELS[account.role].en

  const startEditing = () => {
    setName(account.displayName)
    setEmail(account.email)
    setPassword('')
    setConfirmPassword('')
    setError('')
    setNotice('')
    setEditing(true)
  }

  const saveProfile = async () => {
    setError('')
    setNotice('')

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const wantsPassword = password.length > 0

    if (wantsPassword && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (wantsPassword && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setError('Enter a valid email address.')
      return
    }

    setSaving(true)
    const messages: string[] = []

    if (trimmedName !== account.displayName) {
      const failure = await updateProfileName(trimmedName)
      if (failure) {
        setSaving(false)
        setError(failure)
        return
      }
    }

    if (trimmedEmail && trimmedEmail !== account.email) {
      const failure = await updateAccountEmail(trimmedEmail)
      if (failure) {
        setSaving(false)
        setError(failure)
        return
      }
      messages.push('Check your new email to confirm the address change.')
    }

    if (wantsPassword) {
      const failure = await updateAccountPassword(password)
      if (failure) {
        setSaving(false)
        setError(failure)
        return
      }
      messages.push('Password updated.')
    }

    setSaving(false)
    setPassword('')
    setConfirmPassword('')
    setNotice(messages.length ? messages.join(' ') : 'Profile updated.')
    setEditing(false)
  }

  return (
    <section className="panel">
      <div className="property-profile">
        <div className="property-profile-head">
          <div>
            <p className="eyebrow">User profile</p>
            <h2>{account.displayName.trim() || account.email || 'Your account'}</h2>
          </div>
          {editing ? (
            <div className="profile-actions">
              <button
                className="secondary-action"
                disabled={saving}
                onClick={() => setEditing(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-action"
                disabled={saving}
                onClick={saveProfile}
                type="button"
              >
                <CheckCircle2 size={16} />
                Save changes
              </button>
            </div>
          ) : (
            <button className="secondary-action" onClick={startEditing} type="button">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="profile-edit-grid">
            <FormField label="Full name">
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Poti"
                value={name}
              />
            </FormField>
            <FormField label="Sign-in email">
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </FormField>
            <FormField label="New password">
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Leave blank to keep current"
                type="password"
                value={password}
              />
            </FormField>
            <FormField label="Confirm new password">
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter new password"
                type="password"
                value={confirmPassword}
              />
            </FormField>
            {error && <p className="login-error">{error}</p>}
          </div>
        ) : (
          <div className="profile-grid">
            <Detail label="Sign-in email" value={account.email || '—'} />
            <Detail label="Access level" value={roleLabel} />
            <Detail label="Password" value="••••••••" />
          </div>
        )}

        {!editing && notice && <p className="profile-notice">{notice}</p>}
      </div>
    </section>
  )
}

// Singular labels for buttons ("Add Manager", not "Add Managers").
const ROLE_SINGULAR: Record<AuthRole, string> = {
  top_management: 'Top Management user',
  manager: 'Manager',
  staff: 'Staff member',
  beo_viewer: 'BEO Viewer',
}

/** Inline form to create a real Supabase account for a tier. */
function AddAccountForm({
  onCreate,
  role,
  workspaceCode,
}: {
  onCreate: (input: NewUserInput) => Promise<boolean>
  role: Exclude<AuthRole, 'beo_viewer'>
  workspaceCode: string
}) {
  const isStaff = role === 'staff'
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const submit = async () => {
    setLocalError('')
    if (!displayName.trim()) return setLocalError('Enter a name.')
    if (isStaff && !username.trim()) return setLocalError('Enter a username.')
    if (!isStaff && !email.includes('@')) return setLocalError('Enter a valid email.')
    if (password.length < 8) return setLocalError('Password must be at least 8 characters.')
    setBusy(true)
    const ok = await onCreate({
      role,
      display_name: displayName.trim(),
      password,
      ...(isStaff ? { username: username.trim() } : { email: email.trim() }),
    })
    setBusy(false)
    if (ok) {
      setDisplayName('')
      setEmail('')
      setUsername('')
      setPassword('')
    }
  }

  return (
    <div className="user-admin-add">
      <div className="form-grid">
        <FormField label="Full name">
          <input
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </FormField>
        {isStaff ? (
          <FormField label="Username">
            <input
              onChange={(event) => setUsername(event.target.value)}
              placeholder="e.g. somchai"
              value={username}
            />
          </FormField>
        ) : (
          <FormField label="Sign-in email">
            <input
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </FormField>
        )}
        <FormField label="Temporary password">
          <input
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            type="password"
            value={password}
          />
        </FormField>
        {isStaff && (
          <FormField label="Workspace code">
            <input disabled readOnly value={workspaceCode || '—'} />
          </FormField>
        )}
      </div>
      {localError && <p className="login-error">{localError}</p>}
      <div className="status-actions">
        <button
          className="primary-action"
          disabled={busy}
          onClick={() => void submit()}
          type="button"
        >
          <Plus size={16} />
          {busy ? 'Adding…' : `Add ${ROLE_SINGULAR[role]}`}
        </button>
      </div>
    </div>
  )
}

/** Inline form to add an app-layer BEO Viewer (name + department). */
function AddBeoViewerForm({
  departments,
  onAdd,
}: {
  departments: BeoDepartment[]
  onAdd: (name: string, department: BeoDepartment) => void
}) {
  const [name, setName] = useState('')
  const [department, setDepartment] = useState<BeoDepartment>(departments[0] ?? '')
  const [localError, setLocalError] = useState('')

  const submit = () => {
    setLocalError('')
    if (!name.trim()) return setLocalError('Enter a name.')
    if (!department) return setLocalError('Choose a department.')
    onAdd(name.trim(), department)
    setName('')
    setDepartment(departments[0] ?? '')
  }

  return (
    <div className="user-admin-add">
      <div className="form-grid">
        <FormField label="Name">
          <input onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <FormField label="Department">
          <select
            onChange={(event) => setDepartment(event.target.value)}
            value={department}
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {localError && <p className="login-error">{localError}</p>}
      <div className="status-actions">
        <button
          className="primary-action"
          onClick={submit}
          type="button"
        >
          <Plus size={16} />
          Add BEO Viewer
        </button>
      </div>
    </div>
  )
}

/**
 * User Management: four sections (Top Management / Managers / Staff / BEO
 * Viewers). Real tier accounts are created and deleted through the
 * eventpilot-users edge function (service role); BEO Viewers are an app-layer
 * roster. What a caller may do is gated by their own role:
 *   - Top Management: add/remove all tiers, change roles, manage BEO Viewers.
 *   - Managers: add/remove Staff and BEO Viewers only.
 */
function UserManagementPanel({
  beoViewers,
  currentRole,
  currentUserId,
  currentWorkspaceCode,
  departments,
  setBeoViewers,
}: {
  beoViewers: BeoViewer[]
  currentRole: AuthRole
  currentUserId: string | null
  currentWorkspaceCode: string
  departments: BeoDepartment[]
  setBeoViewers: (next: BeoViewer[] | ((current: BeoViewer[]) => BeoViewer[])) => void
}) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [openAdd, setOpenAdd] = useState<AuthRole | null>(null)

  const isTop = currentRole === 'top_management'
  const canManageStaff = isTop || currentRole === 'manager'

  useEffect(() => {
    // `loading` starts true, and this runs once on mount, so no setLoading(true)
    // here (calling setState synchronously in an effect body is discouraged).
    let active = true
    listManagedUsers()
      .then((list) => {
        if (!active) return
        setUsers(list)
        setLoadError('')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Could not load users.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const changeRole = async (user: ManagedUser, nextRole: AuthRole) => {
    if (!supabase || nextRole === user.role) return
    setError('')
    setNotice('')
    if (
      user.user_id === currentUserId &&
      !window.confirm(
        `Change your OWN access level to ${ROLE_LABELS[nextRole].en}? You may lose access to this panel.`,
      )
    ) {
      return
    }
    setBusyId(user.user_id)
    const { error: updateError } = await supabase
      .from('eventpilot_profiles')
      .update({ role: nextRole })
      .eq('user_id', user.user_id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setUsers((current) =>
      current.map((item) =>
        item.user_id === user.user_id ? { ...item, role: nextRole } : item,
      ),
    )
    setNotice(`${user.display_name?.trim() || user.email} is now ${ROLE_LABELS[nextRole].en}.`)
  }

  const removeUser = async (user: ManagedUser) => {
    if (
      !window.confirm(
        `Remove ${user.display_name?.trim() || user.email}? Their sign-in account is permanently deleted.`,
      )
    ) {
      return
    }
    setError('')
    setNotice('')
    setBusyId(user.user_id)
    try {
      await deleteManagedUser(user.user_id)
      setUsers((current) => current.filter((item) => item.user_id !== user.user_id))
      setNotice(`${user.display_name?.trim() || user.email} was removed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the user.')
    } finally {
      setBusyId(null)
    }
  }

  const createUser = async (input: NewUserInput): Promise<boolean> => {
    setError('')
    setNotice('')
    try {
      const created = await createManagedUser(input)
      setUsers((current) => [...current, created])
      setNotice(`${created.display_name?.trim() || created.email} was added.`)
      setOpenAdd(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the user.')
      return false
    }
  }

  const addBeoViewer = (name: string, department: BeoDepartment) => {
    setBeoViewers((current) => [
      ...current,
      { id: crypto.randomUUID(), name, department },
    ])
    setNotice(`${name} was added as a BEO Viewer.`)
    setOpenAdd(null)
  }

  const removeBeoViewer = (id: string) => {
    setBeoViewers((current) => current.filter((viewer) => viewer.id !== id))
  }

  const tierUsers = (role: AuthRole) => users.filter((user) => user.role === role)

  const canDeleteUser = (user: ManagedUser) => {
    if (user.user_id === currentUserId) return false
    if (isTop) return true
    return currentRole === 'manager' && user.role === 'staff'
  }

  const renderTierSection = (role: Exclude<AuthRole, 'beo_viewer'>, canAdd: boolean) => {
    const list = tierUsers(role)
    return (
      <div className="user-admin-section" key={role}>
        <div className="user-admin-section-head">
          <h3>
            {ROLE_LABELS[role].en} <span className="user-admin-count">{list.length}</span>
          </h3>
          {canAdd && (
            <button
              className="secondary-action"
              onClick={() => setOpenAdd(openAdd === role ? null : role)}
              type="button"
            >
              <Plus size={15} />
              {openAdd === role ? 'Close' : `Add ${ROLE_SINGULAR[role]}`}
            </button>
          )}
        </div>
        {canAdd && openAdd === role && (
          <AddAccountForm
            onCreate={createUser}
            role={role}
            workspaceCode={currentWorkspaceCode}
          />
        )}
        {list.length === 0 ? (
          <p className="user-admin-empty">No {ROLE_LABELS[role].en.toLowerCase()} yet.</p>
        ) : (
          <div className="user-admin-list">
            {list.map((user) => (
              <div className="user-admin-row" key={user.user_id}>
                <div className="user-admin-identity">
                  <strong>
                    {user.display_name?.trim() || user.email}
                    {user.user_id === currentUserId && (
                      <span className="user-admin-you">You</span>
                    )}
                  </strong>
                  <span>
                    {user.username ? `@${user.username}` : user.email}
                    {user.workspace_code ? ` · ${user.workspace_code}` : ''}
                  </span>
                </div>
                <div className="user-admin-controls">
                  {isTop && (
                    <select
                      aria-label={`Access level for ${user.email}`}
                      className="user-admin-select"
                      disabled={busyId === user.user_id}
                      onChange={(event) => changeRole(user, event.target.value as AuthRole)}
                      value={user.role}
                    >
                      {AUTH_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r].en}
                        </option>
                      ))}
                    </select>
                  )}
                  {canDeleteUser(user) && (
                    <button
                      className="user-admin-remove"
                      disabled={busyId === user.user_id}
                      onClick={() => void removeUser(user)}
                      type="button"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <CollapsiblePanel title="User management">
      <p className="panel-subtitle">
        {isTop
          ? 'Add and remove users, and set each user’s access level. New accounts sign in immediately with the password you set.'
          : 'Add Staff and BEO Viewers for your team.'}
      </p>

      {loading ? (
        <p className="user-admin-empty">Loading users…</p>
      ) : loadError ? (
        <p className="login-error">{loadError}</p>
      ) : (
        <div className="user-admin-sections">
          {isTop && renderTierSection('top_management', true)}
          {isTop && renderTierSection('manager', true)}
          {renderTierSection('staff', canManageStaff)}

          <div className="user-admin-section">
            <div className="user-admin-section-head">
              <h3>
                {ROLE_LABELS.beo_viewer.en}{' '}
                <span className="user-admin-count">{beoViewers.length}</span>
              </h3>
              {canManageStaff && (
                <button
                  className="secondary-action"
                  onClick={() =>
                    setOpenAdd(openAdd === 'beo_viewer' ? null : 'beo_viewer')
                  }
                  type="button"
                >
                  <Plus size={15} />
                  {openAdd === 'beo_viewer' ? 'Close' : 'Add BEO Viewer'}
                </button>
              )}
            </div>
            {canManageStaff && openAdd === 'beo_viewer' && (
              <AddBeoViewerForm departments={departments} onAdd={addBeoViewer} />
            )}
            {beoViewers.length === 0 ? (
              <p className="user-admin-empty">No BEO Viewers yet.</p>
            ) : (
              <div className="user-admin-list">
                {beoViewers.map((viewer) => (
                  <div className="user-admin-row" key={viewer.id}>
                    <div className="user-admin-identity">
                      <strong>{viewer.name}</strong>
                      <span>{viewer.department}</span>
                    </div>
                    <div className="user-admin-controls">
                      {canManageStaff && (
                        <button
                          className="user-admin-remove"
                          onClick={() => removeBeoViewer(viewer.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="login-error">{error}</p>}
      {notice && <p className="profile-notice">{notice}</p>}
    </CollapsiblePanel>
  )
}

/** Top-Management editor for the BEO department list. */
function DepartmentsPanel({
  beoViewers,
  departments,
  setDepartments,
}: {
  beoViewers: BeoViewer[]
  departments: BeoDepartment[]
  setDepartments: (
    next: BeoDepartment[] | ((current: BeoDepartment[]) => BeoDepartment[]),
  ) => void
}) {
  const [draft, setDraft] = useState<BeoDepartment[]>(departments)
  const [dirty, setDirty] = useState(false)
  const [newDept, setNewDept] = useState('')
  const [notice, setNotice] = useState('')

  // Adjust the draft during render when the saved list changes (hydration / other
  // edits), but never clobber unsaved work. This is the React-endorsed pattern
  // for resetting state from props without an effect.
  const [syncedFrom, setSyncedFrom] = useState(departments)
  if (!dirty && syncedFrom !== departments) {
    setSyncedFrom(departments)
    setDraft(departments)
  }

  const addDept = () => {
    const value = newDept.trim()
    if (!value) return
    if (draft.some((dept) => dept.toLowerCase() === value.toLowerCase())) {
      setNotice('That department already exists.')
      return
    }
    setDirty(true)
    setNotice('')
    setDraft([...draft, value])
    setNewDept('')
  }

  const renameDept = (index: number, value: string) => {
    setDirty(true)
    setNotice('')
    setDraft(draft.map((dept, i) => (i === index ? value : dept)))
  }

  const removeDept = (index: number) => {
    setDirty(true)
    setNotice('')
    setDraft(draft.filter((_, i) => i !== index))
  }

  const save = () => {
    const cleaned: BeoDepartment[] = []
    for (const dept of draft) {
      const value = dept.trim()
      if (value && !cleaned.some((d) => d.toLowerCase() === value.toLowerCase())) {
        cleaned.push(value)
      }
    }
    if (cleaned.length === 0) {
      setNotice('Keep at least one department.')
      return
    }
    setDepartments(cleaned)
    setDirty(false)
    setNotice('Departments saved.')
  }

  // Warn about BEO Viewers whose department would no longer exist after saving.
  const orphanedViewers = beoViewers.filter(
    (viewer) => !draft.some((dept) => dept.trim() === viewer.department),
  )

  return (
    <CollapsiblePanel title="Departments">
      <p className="panel-subtitle">
        These departments drive BEO sign-off and BEO Viewer assignments. Edit,
        add, or remove them, then Save.
      </p>

      <div className="department-editor-list">
        {draft.map((dept, index) => (
          <div className="department-editor-row" key={index}>
            <input
              aria-label={`Department ${index + 1}`}
              onChange={(event) => renameDept(index, event.target.value)}
              value={dept}
            />
            <button
              aria-label={`Remove ${dept}`}
              className="user-admin-remove"
              onClick={() => removeDept(index)}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="department-editor-add">
        <input
          aria-label="New department name"
          onChange={(event) => setNewDept(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addDept()
            }
          }}
          placeholder="New department name"
          value={newDept}
        />
        <button className="secondary-action" onClick={addDept} type="button">
          <Plus size={15} />
          Add department
        </button>
      </div>

      {orphanedViewers.length > 0 && (
        <p className="panel-subtitle department-editor-warning">
          {orphanedViewers.length} BEO Viewer(s) are assigned to a department you
          removed. Reassign them in User management after saving.
        </p>
      )}

      <div className="status-actions">
        <button className="primary-action" disabled={!dirty} onClick={save} type="button">
          <ShieldCheck size={16} />
          Save departments
        </button>
      </div>
      {notice && <p className="profile-notice">{notice}</p>}
    </CollapsiblePanel>
  )
}

/** A single editable list of short text values — add, rename, remove, then Save. */
function StringListEditor({
  addLabel,
  items,
  label,
  minItemsMessage,
  setItems,
}: {
  addLabel: string
  items: string[]
  label: string
  minItemsMessage: string
  setItems: (next: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>(items)
  const [dirty, setDirty] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [notice, setNotice] = useState('')

  // Adjust the draft during render when the saved list changes (hydration / other
  // edits), but never clobber unsaved work.
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (!dirty && syncedFrom !== items) {
    setSyncedFrom(items)
    setDraft(items)
  }

  const addItem = () => {
    const value = newItem.trim()
    if (!value) return
    if (draft.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setNotice('That value already exists.')
      return
    }
    setDirty(true)
    setNotice('')
    setDraft([...draft, value])
    setNewItem('')
  }

  const renameItem = (index: number, value: string) => {
    setDirty(true)
    setNotice('')
    setDraft(draft.map((item, i) => (i === index ? value : item)))
  }

  const removeItem = (index: number) => {
    setDirty(true)
    setNotice('')
    setDraft(draft.filter((_, i) => i !== index))
  }

  const save = () => {
    const cleaned: string[] = []
    for (const item of draft) {
      const value = item.trim()
      if (value && !cleaned.some((v) => v.toLowerCase() === value.toLowerCase())) {
        cleaned.push(value)
      }
    }
    if (cleaned.length === 0) {
      setNotice(minItemsMessage)
      return
    }
    setItems(cleaned)
    setDirty(false)
    setNotice(`${label} saved.`)
  }

  return (
    <div className="list-editor-group">
      <h3 className="support-subhead">{label}</h3>

      <div className="department-editor-list">
        {draft.map((item, index) => (
          <div className="department-editor-row" key={index}>
            <input
              aria-label={`${label} ${index + 1}`}
              onChange={(event) => renameItem(index, event.target.value)}
              value={item}
            />
            <button
              aria-label={`Remove ${item}`}
              className="user-admin-remove"
              onClick={() => removeItem(index)}
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="department-editor-add">
        <input
          aria-label={`New ${label.toLowerCase()}`}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addItem()
            }
          }}
          placeholder={addLabel}
          value={newItem}
        />
        <button className="secondary-action" onClick={addItem} type="button">
          <Plus size={15} />
          {addLabel}
        </button>
      </div>

      <div className="status-actions">
        <button className="primary-action" disabled={!dirty} onClick={save} type="button">
          <ShieldCheck size={16} />
          Save {label.toLowerCase()}
        </button>
      </div>
      {notice && <p className="profile-notice">{notice}</p>}
    </div>
  )
}

/** Top-Management/manager editor for the package Category and Unit dropdown lists. */
function PackageSettingsPanel({
  categories,
  setCategories,
  setUnits,
  units,
}: {
  categories: string[]
  setCategories: (next: string[]) => void
  setUnits: (next: string[]) => void
  units: string[]
}) {
  return (
    <CollapsiblePanel title="Package & Products">
      <p className="panel-subtitle">
        These Category and Units lists populate the dropdowns when editing a
        package or product. Edit, add, or remove options, then Save.
      </p>

      <StringListEditor
        addLabel="Add category"
        items={categories}
        label="Category"
        minItemsMessage="Keep at least one category."
        setItems={setCategories}
      />

      <StringListEditor
        addLabel="Add unit"
        items={units}
        label="Units"
        minItemsMessage="Keep at least one unit."
        setItems={setUnits}
      />
    </CollapsiblePanel>
  )
}

/** Editor for the venue Setup styles list offered on the Venue page. */
function VenueSettingsPanel({
  setSetupStyles,
  setupStyles,
}: {
  setSetupStyles: (next: string[]) => void
  setupStyles: string[]
}) {
  return (
    <CollapsiblePanel title="Venue">
      <p className="panel-subtitle">
        This Setup styles list populates the dropdown when editing a venue. Edit,
        add, or remove options, then Save.
      </p>

      <StringListEditor
        addLabel="Add setup style"
        items={setupStyles}
        label="Setup styles"
        minItemsMessage="Keep at least one setup style."
        setItems={setSetupStyles}
      />
    </CollapsiblePanel>
  )
}

/** Top-Management editor for per-role permissions (Top Management is always all). */
function RolePermissionsPanel({
  overrides,
  setOverrides,
}: {
  overrides: RolePermissionOverrides
  setOverrides: (
    next:
      | RolePermissionOverrides
      | ((current: RolePermissionOverrides) => RolePermissionOverrides),
  ) => void
}) {
  const buildDraft = (): Record<AuthRole, Set<Action>> => ({
    top_management: new Set(ALL_ACTIONS),
    manager: new Set(overrides.manager ?? DEFAULT_PERMISSIONS.manager),
    staff: new Set(overrides.staff ?? DEFAULT_PERMISSIONS.staff),
    beo_viewer: new Set(overrides.beo_viewer ?? DEFAULT_PERMISSIONS.beo_viewer),
  })

  const [draft, setDraft] = useState<Record<AuthRole, Set<Action>>>(buildDraft)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState('')

  // Re-sync from saved overrides during render (hydration / after save), unless
  // there are unsaved edits — the React-endorsed alternative to a sync effect.
  const [syncedFrom, setSyncedFrom] = useState(overrides)
  if (!dirty && syncedFrom !== overrides) {
    setSyncedFrom(overrides)
    setDraft(buildDraft())
  }

  const toggle = (role: AuthRole, action: Action) => {
    setDirty(true)
    setNotice('')
    setDraft((prev) => {
      const nextSet = new Set(prev[role])
      if (nextSet.has(action)) nextSet.delete(action)
      else nextSet.add(action)
      return { ...prev, [role]: nextSet }
    })
  }

  const restoreDefaults = () => {
    setDirty(true)
    setNotice('')
    setDraft({
      top_management: new Set(ALL_ACTIONS),
      manager: new Set(DEFAULT_PERMISSIONS.manager),
      staff: new Set(DEFAULT_PERMISSIONS.staff),
      beo_viewer: new Set(DEFAULT_PERMISSIONS.beo_viewer),
    })
  }

  const save = () => {
    const next: RolePermissionOverrides = {}
    for (const role of EDITABLE_ROLES) {
      next[role] = ALL_ACTIONS.filter((action) => draft[role].has(action))
    }
    setOverrides(next)
    setDirty(false)
    setNotice('Permissions saved.')
  }

  const groups = Array.from(new Set(ACTION_CATALOG.map((entry) => entry.group)))
  const columns: AuthRole[] = ['top_management', ...EDITABLE_ROLES]

  return (
    <CollapsiblePanel title="Roles and permissions">
      <p className="panel-subtitle">
        Top Management always has full access. Tick what Managers, Staff, and BEO
        Viewers can do, then Save.
      </p>

      <div className="permission-matrix-scroll">
        <table className="permission-matrix">
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {columns.map((role) => (
                <th key={role} scope="col">
                  {ROLE_LABELS[role].en}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="permission-matrix-group">
                  <td colSpan={columns.length + 1}>{group}</td>
                </tr>
                {ACTION_CATALOG.filter((entry) => entry.group === group).map((entry) => (
                  <tr key={entry.key}>
                    <td>{entry.label}</td>
                    {columns.map((role) => {
                      const locked = role === 'top_management'
                      return (
                        <td key={role}>
                          <input
                            aria-label={`${entry.label} for ${ROLE_LABELS[role].en}`}
                            checked={draft[role].has(entry.key)}
                            disabled={locked}
                            onChange={() => toggle(role, entry.key)}
                            type="checkbox"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="status-actions">
        <button className="primary-action" disabled={!dirty} onClick={save} type="button">
          <ShieldCheck size={16} />
          Save permissions
        </button>
        <button className="secondary-action" onClick={restoreDefaults} type="button">
          Restore defaults
        </button>
      </div>
      {notice && <p className="profile-notice">{notice}</p>}
    </CollapsiblePanel>
  )
}

/** Lightweight modal overlay (Event Pilot has no generic dialog otherwise). */
function Modal({
  children,
  footer,
  icon: Icon,
  onBack,
  onClose,
  title,
}: {
  children: ReactNode
  footer?: ReactNode
  icon?: LucideIcon
  onBack?: () => void
  onClose: () => void
  title: string
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-modal="true"
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-head">
          <h2>
            {onBack && (
              <button
                aria-label="Back"
                className="modal-back"
                onClick={onBack}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {Icon && <Icon size={18} />}
            {title}
          </h2>
          <button
            aria-label="Close"
            className="modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

type SupportDialog = 'packages' | 'help' | 'feedback' | 'compatibility' | 'legal' | null

// Support address for Help/Feedback. NNR-Solutions' general inbox.
const SUPPORT_EMAIL = 'info@nnr-solutions.com'

/**
 * Support section shown at the bottom of Settings. Mirrors the Kaizen System's
 * pattern (never its data): Packages & Expansions draws from the same plan /
 * expansion catalog the vendor console manages; the rest are static help,
 * feedback, compatibility, and IP dialogs.
 */
function SupportPanel({ role }: { role: AuthRole }) {
  const [dialog, setDialog] = useState<SupportDialog>(null)
  const close = () => setDialog(null)

  const rows: { key: SupportDialog; icon: LucideIcon; label: string; sub: string }[] = [
    { key: 'help', icon: HelpCircle, label: 'Help', sub: 'Get assistance from our team' },
    { key: 'feedback', icon: MessageSquare, label: 'Feedback', sub: 'Share your thoughts with us' },
    { key: 'compatibility', icon: Smartphone, label: 'Compatibility', sub: 'Supported devices & browsers' },
    { key: 'legal', icon: Scale, label: 'Intellectual Property', sub: 'Right of use & ownership' },
  ]

  const emailButton = (subject: string) => (
    <a className="primary-action" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`}>
      <Mail size={16} />
      Send Email
    </a>
  )

  return (
    <section className="panel support-panel">
      <div className="support-head">
        <LifeBuoy size={16} />
        <h2>Support</h2>
      </div>

      <div className="support-list">
        {role !== 'staff' && (
          <button className="support-row" onClick={() => setDialog('packages')} type="button">
            <span className="support-row-icon is-brand">
              <Sparkles size={18} />
            </span>
            <span className="support-row-text">
              <strong>Packages &amp; Expansions</strong>
              <span>Your plan, upgrades &amp; add-ons</span>
            </span>
            <ChevronRight className="support-row-chevron" size={18} />
          </button>
        )}
        {rows.map((row) => (
          <button
            className="support-row"
            key={row.key}
            onClick={() => setDialog(row.key)}
            type="button"
          >
            <span className="support-row-icon">
              <row.icon size={18} />
            </span>
            <span className="support-row-text">
              <strong>{row.label}</strong>
              <span>{row.sub}</span>
            </span>
            <ChevronRight className="support-row-chevron" size={18} />
          </button>
        ))}
      </div>

      {dialog === 'packages' && (
        <Modal
          footer={
            <a
              className="primary-action"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EventPilot — Plan enquiry')}`}
            >
              <Mail size={16} />
              Contact us to change plan
            </a>
          }
          icon={Sparkles}
          onClose={close}
          title="Packages & Expansions"
        >
          <p className="support-blurb">
            Your EventPilot plan and the upgrades &amp; add-ons available from
            NNR-Solutions. Plans are managed by NNR-Solutions — contact us to
            change yours.
          </p>

          <h3 className="support-subhead">Plans</h3>
          {initialSaasPlans.map((plan) => (
            <div className="support-plan" key={plan.id}>
              <div className="support-plan-head">
                <strong>{plan.name}</strong>
                <span>{plan.annualPrice > 0 ? `${money(plan.annualPrice)} / year` : 'Free'}</span>
              </div>
              <p>{plan.description}</p>
              <ul>
                <li>
                  {plan.includedUsers} included user{plan.includedUsers === 1 ? '' : 's'}
                  {plan.additionalUserPrice > 0
                    ? ` · ${money(plan.additionalUserPrice)} per extra seat`
                    : ''}
                </li>
                <li>
                  {plan.bookingLimit == null
                    ? 'Unlimited bookings'
                    : `${plan.bookingLimit} bookings included`}
                </li>
              </ul>
            </div>
          ))}

          <h3 className="support-subhead">Expansion packs</h3>
          {initialExpansionPacks
            .filter((pack) => pack.status === 'Available')
            .map((pack) => (
              <div className="support-plan" key={pack.id}>
                <div className="support-plan-head">
                  <strong>{pack.name}</strong>
                  <span>{money(pack.annualPrice)}</span>
                </div>
                <p>{pack.description}</p>
                <ul>
                  <li>{pack.pricingUnit}</li>
                  <li>Recommended for {pack.recommendedFor.toLowerCase()}</li>
                </ul>
              </div>
            ))}
        </Modal>
      )}

      {dialog === 'help' && (
        <Modal
          footer={emailButton('EventPilot — Help Request')}
          icon={HelpCircle}
          onClose={close}
          title="Help"
        >
          <p className="support-blurb">
            We're here to help. Let us know what you need a hand with and our team
            will get back to you as soon as we can.
          </p>
          <div className="support-contact">
            <Mail size={16} />
            <span>{SUPPORT_EMAIL}</span>
          </div>
        </Modal>
      )}

      {dialog === 'feedback' && (
        <Modal
          footer={emailButton('EventPilot — Feedback')}
          icon={MessageSquare}
          onClose={close}
          title="Feedback"
        >
          <p className="support-blurb">
            We read and consider every message. Your feedback helps make
            EventPilot better.
          </p>
          <div className="support-contact">
            <Mail size={16} />
            <span>{SUPPORT_EMAIL}</span>
          </div>
        </Modal>
      )}

      {dialog === 'compatibility' && (
        <Modal
          footer={
            <button className="secondary-action" onClick={close} type="button">
              Close
            </button>
          }
          icon={Smartphone}
          onClose={close}
          title="Compatibility"
        >
          <p className="support-blurb">
            EventPilot is a web app that runs smoothly on both desktops and mobile
            devices. For the best experience, open it in your browser and add it to
            your home screen — it will then run full-screen like a native app.
          </p>
          <p className="support-muted">
            Recommended: a current version of Chrome, Safari, Edge, or Firefox on
            desktop, or iPhone on iOS 16.4+ (Safari) and Android 10+ (Chrome).
          </p>
        </Modal>
      )}

      {dialog === 'legal' && (
        <Modal
          footer={
            <button className="secondary-action" onClick={close} type="button">
              Close
            </button>
          }
          icon={Scale}
          onClose={close}
          title="Intellectual Property & Right of Use"
        >
          <p>
            All intellectual property rights relating to this application,
            including but not limited to its software, source code, system design,
            user interface, workflow logic, database structure, documentation,
            name, logo, and related materials, shall remain the exclusive property
            of <strong>NNR-Solutions Co., Ltd.</strong>
          </p>
          <p>
            Authorised users are granted a limited, non-exclusive,
            non-transferable, and revocable right to access and use the application
            solely for event, booking, BEO, and related operational purposes. This
            right of use does not transfer any ownership rights in the application
            to any user, organisation, contractor, or third party.
          </p>
          <p>
            Users shall not copy, modify, reproduce, distribute, sell, sublicense,
            reverse-engineer, decompile, or create derivative works from the
            application, in whole or in part, without prior written permission from{' '}
            <strong>NNR-Solutions Co., Ltd.</strong>
          </p>
        </Modal>
      )}
    </section>
  )
}

function FilterBar({
  setStatusFilter,
  statusFilter,
}: {
  setStatusFilter: (status: BookingStatus | 'All') => void
  statusFilter: BookingStatus | 'All'
}) {
  return (
    <div className="filter-bar">
      <Filter size={16} />
      {(['All', ...statusOrder] as const).map((status) => (
        <button
          className={[
            'filter-chip',
            status === 'All' ? 'filter-all' : statusClass(status),
            statusFilter === status ? 'active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={status}
          onClick={() => setStatusFilter(status)}
          aria-pressed={statusFilter === status}
          type="button"
        >
          {status}
        </button>
      ))}
    </div>
  )
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function PanelHeader({
  action,
  detail,
  onAction,
  title,
}: {
  action?: string
  detail?: string
  onAction?: () => void
  title: string
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {detail && <p className="panel-header-detail">{detail}</p>}
      </div>
      {action && (
        <button className="text-action" onClick={onAction} type="button">
          {action}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  )
}

/** A panel whose body can be collapsed behind a clickable header. */
function CollapsiblePanel({
  children,
  defaultOpen = false,
  title,
}: {
  children: ReactNode
  defaultOpen?: boolean
  title: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={open ? 'panel collapsible-panel is-open' : 'panel collapsible-panel'}>
      <button
        aria-expanded={open}
        className="collapsible-header"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <h2>{title}</h2>
        <ChevronDown className="collapsible-chevron" size={18} />
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  )
}

function OperationalPanel({
  icon: Icon,
  items,
  title,
}: {
  icon: LucideIcon
  items: string[]
  title: string
}) {
  return (
    <article className="panel operational-panel">
      <div className="op-head">
        <Icon size={19} />
        <h2>{title}</h2>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function PaperSection({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="paper-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

/**
 * Multi-select chip picker for a list-of-strings field. Offers the known
 * options as a checklist and lets the user add one that is not on the list yet
 * from the bottom of the menu.
 */
function TagSelectField({
  addLabel = 'Add new',
  emptyLabel = 'None selected',
  onChange,
  options,
  placeholder = 'New option',
  value,
}: {
  addLabel?: string
  emptyLabel?: string
  onChange: (next: string[]) => void
  options: string[]
  placeholder?: string
  value: string[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  // Known options plus anything already selected, so a value that is no longer
  // offered elsewhere still shows up as ticked rather than silently vanishing.
  const allOptions = Array.from(new Set([...options, ...value])).sort((a, b) =>
    a.localeCompare(b),
  )

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setIsAdding(false)
        setNewValue('')
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  const toggleOption = (option: string) => {
    onChange(
      value.includes(option) ? value.filter((item) => item !== option) : [...value, option],
    )
  }

  const commitNewOption = () => {
    const trimmed = newValue.trim()
    if (!trimmed) return
    // Reuse an existing option when it only differs by case.
    const existing = allOptions.find((option) => option.toLowerCase() === trimmed.toLowerCase())
    const next = existing ?? trimmed
    if (!value.includes(next)) onChange([...value, next])
    setNewValue('')
    setIsAdding(false)
  }

  return (
    <div className="tag-select" ref={rootRef}>
      <button
        aria-expanded={isOpen}
        className="tag-select-control"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {value.length ? (
          <span className="tag-list">
            {value.map((item) => (
              <span className="tag" key={item}>
                {item}
              </span>
            ))}
          </span>
        ) : (
          <span className="tag-select-placeholder">{emptyLabel}</span>
        )}
        <ChevronDown size={16} />
      </button>
      {isOpen && (
        <div className="tag-select-menu">
          <div className="tag-select-options">
            {allOptions.map((option) => {
              const isSelected = value.includes(option)
              return (
                <button
                  aria-pressed={isSelected}
                  className={`tag-select-option${isSelected ? ' is-selected' : ''}`}
                  key={option}
                  onClick={() => toggleOption(option)}
                  type="button"
                >
                  <span className="tag-select-check">{isSelected && <Check size={13} />}</span>
                  <span>{option}</span>
                </button>
              )
            })}
            {!allOptions.length && <p className="tag-select-empty">No options yet.</p>}
          </div>
          <div className="tag-select-add">
            {isAdding ? (
              <>
                <input
                  autoFocus
                  onChange={(event) => setNewValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commitNewOption()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setIsAdding(false)
                      setNewValue('')
                    }
                  }}
                  placeholder={placeholder}
                  value={newValue}
                />
                <button
                  className="secondary-action"
                  disabled={!newValue.trim()}
                  onClick={commitNewOption}
                  type="button"
                >
                  Add
                </button>
              </>
            ) : (
              <button
                className="tag-select-add-trigger"
                onClick={() => setIsAdding(true)}
                type="button"
              >
                <Plus size={14} />
                <span>{addLabel}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TagList({ items, label }: { items: string[]; label?: string }) {
  return (
    <div className="tag-block">
      {label && <strong>{label}</strong>}
      <div className="tag-list">
        {items.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function ReportBar({
  label,
  max,
  value,
}: {
  label: string
  max: number
  value: number
}) {
  const width = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8

  return (
    <div className="report-bar">
      <div>
        <span>{label}</span>
        <strong>{money(value)}</strong>
      </div>
      <div className="bar-track">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export default App
