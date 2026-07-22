import {
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookOpenCheck,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Filter,
  LayoutDashboard,
  LayoutGrid,
  List,
  LogOut,
  MapPinned,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  Utensils,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  accounts,
  initialBookings,
  leads as initialLeads,
  naNirandProfile,
  products as initialProducts,
  rolePermissions,
  tasks,
  venues,
} from './data'
import type {
  Account,
  BookingStatus,
  Discount,
  DiscountMode,
  EventBooking,
  Lead,
  LeadStage,
  LineItem,
  PaymentStatus,
  Product,
  PropertyProfile,
} from './data'

type ModuleId =
  | 'Dashboard'
  | 'Calendar'
  | 'Leads'
  | 'CRM'
  | 'Bookings'
  | 'BEOs'
  | 'Proposals'
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
  { id: 'Leads', label: 'Leads', icon: Sparkles },
  { id: 'CRM', label: 'CRM', icon: Users },
  { id: 'Bookings', label: 'Bookings', icon: BookOpenCheck },
  { id: 'BEOs', label: 'BEOs', icon: ClipboardList },
  { id: 'Proposals', label: 'Proposals', icon: FileText },
  { id: 'Invoices', label: 'Invoices', icon: ReceiptText },
  { id: 'Packages', label: 'Packages & Products', icon: Boxes },
  { id: 'Venues', label: 'Venues', icon: MapPinned },
  { id: 'Tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'Reports', label: 'Reports', icon: BarChart3 },
  { id: 'Settings', label: 'Settings', icon: Settings },
]

const NAV_ACTION: Partial<Record<ModuleId, Action>> = {
  Leads: 'nav:Leads',
  CRM: 'nav:CRM',
  Proposals: 'nav:Proposals',
  Invoices: 'nav:Invoices',
  Packages: 'nav:Packages',
  Venues: 'nav:Venues',
  Reports: 'nav:Reports',
}

function visibleNavItems(role: AuthRole): NavItem[] {
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
  menu: string
  av: string
  staffing: string
  vendors: string
  specialRequests: string
  clientNotes: string
  internalNotes: string
}

function getNewBookingDefaults(): NewBookingFormState {
  return {
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
    menu: '',
    av: '',
    staffing: '',
    vendors: '',
    specialRequests: '',
    clientNotes: '',
    internalNotes: '',
  }
}

type SaaSTierId = 'Starter' | 'Gold' | 'Platinum'
type ClientAccountStatus = 'Active' | 'Pilot' | 'Suspended'
type AdminConsoleTab = 'Clients' | 'Plans' | 'Company' | 'Security'

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
type AuthRole = 'top_management' | 'manager' | 'staff'

type LoginSession = {
  authenticated: boolean
  email: string
  displayName: string
  workspaceCode: string
  role: AuthRole
}

const AUTH_ROLES: AuthRole[] = ['top_management', 'manager', 'staff']

const ROLE_LABELS: Record<AuthRole, { en: string; th: string }> = {
  top_management: { en: 'Top Management', th: 'ผู้บริหารระดับสูง' },
  manager: { en: 'Managers', th: 'ผู้จัดการ' },
  staff: { en: 'Staff', th: 'พนักงาน' },
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
  | 'nav:Invoices'
  | 'nav:Packages'
  | 'nav:Venues'
  | 'nav:Reports'
  | 'booking:create'
  | 'booking:advanceStatus'
  | 'booking:fallBackStatus'
  | 'packages:edit'
  | 'leads:create'
  | 'leads:edit'
  | 'leads:delete'
  | 'proposal:edit'
  | 'admin:settings'
  | 'admin:userManagement'

const STAFF_ACTIONS: Action[] = ['booking:advanceStatus']
const MANAGER_ONLY_ADDITIONS: Action[] = [
  'nav:Leads',
  'nav:CRM',
  'nav:Proposals',
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
]
const TOP_MANAGEMENT_ONLY_ADDITIONS: Action[] = ['packages:edit', 'admin:settings', 'admin:userManagement']

const PERMISSIONS: Record<AuthRole, Set<Action>> = {
  staff: new Set(STAFF_ACTIONS),
  manager: new Set([...STAFF_ACTIONS, ...MANAGER_ONLY_ADDITIONS]),
  top_management: new Set([
    ...STAFF_ACTIONS,
    ...MANAGER_ONLY_ADDITIONS,
    ...TOP_MANAGEMENT_ONLY_ADDITIONS,
  ]),
}

function hasPermission(role: AuthRole, action: Action): boolean {
  return PERMISSIONS[role].has(action)
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

  const auth = useSupabaseAuth()
  // Offline sandbox session (used only when Supabase is not configured).
  const [localSession, setLocalSession] = useState<LoginSession>(initialLoginSession)
  // Vendor console session — entirely independent of the customer auth above.
  const [consoleSession, setConsoleSession] = useState<ConsoleSession | null>(null)
  const [consoleReady, setConsoleReady] = useState(!isAdminRoute)
  const userId = auth.userId
  const loginSession: LoginSession = isSupabaseEnabled
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
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id)
  // null = show the list; a booking id = show that document's detail with a back button.
  const [beoViewBookingId, setBeoViewBookingId] = useState<string | null>(null)
  const [proposalViewBookingId, setProposalViewBookingId] = useState<string | null>(null)
  const [invoiceViewBookingId, setInvoiceViewBookingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>('All')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [sandboxActions, setSandboxActions] = useState<SandboxAction[]>([])

  useEffect(() => {
    const handleHashChange = () => setActiveModule(getModuleFromHash())
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
  ): Promise<string | null> => {
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
    setActiveModule(id)
    if (id === 'BEOs') setBeoViewBookingId(null)
    if (id === 'Proposals') setProposalViewBookingId(null)
    if (id === 'Invoices') setInvoiceViewBookingId(null)
  }

  const handleLogout = async () => {
    if (isSupabaseEnabled && supabase) {
      await supabase.auth.signOut()
    } else {
      setLocalSession(initialLoginSession)
    }
    setQuery('')
    setStatusFilter('All')
    setActiveModule('Login')
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
            onClick={() => setActiveModule('Settings')}
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
            <p className="eyebrow">Venue CRM, BEO, booking, and operations</p>
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
            {hasPermission(loginSession.role, 'booking:create') && (
              <a
                className="primary-action"
                href="#NewBooking"
                onClick={() => setActiveModule('NewBooking')}
              >
                <Plus size={17} />
                New booking
              </a>
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
              createBooking={createBooking}
              products={products}
              recordSandboxAction={recordSandboxAction}
              setActiveModule={setActiveModule}
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
              setActiveModule={setActiveModule}
              setSelectedBookingId={setSelectedBookingId}
            />
          )}

          {activeModule === 'Calendar' && (
            <CalendarView
              bookings={filteredBookings}
              selectedBookingId={selectedBooking?.id}
              setSelectedBookingId={setSelectedBookingId}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
            />
          )}

          {activeModule === 'Leads' && (
            <LeadsView account={loginSession} leads={leads} setLeads={setLeads} />
          )}

          {activeModule === 'CRM' && <CrmView bookings={bookings} />}

          {activeModule === 'Bookings' && (
            <BookingsView
              account={loginSession}
              bookings={filteredBookings}
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
                appendBeoHistory={appendBeoHistory}
                booking={beoViewBooking}
                markBeoRevised={markBeoRevised}
                onBack={() => setBeoViewBookingId(null)}
                propertyProfile={propertyProfile}
              />
            ) : (
              <BeoListView
                bookings={bookings}
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
                documentType="Proposals"
                onBack={() => setProposalViewBookingId(null)}
                onOpenBeo={() => {
                  setActiveModule('BEOs')
                  setBeoViewBookingId(proposalViewBooking.id)
                }}
                propertyProfile={propertyProfile}
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

          {activeModule === 'Invoices' &&
            (invoiceViewBooking ? (
              <DocumentsView
                account={loginSession}
                appendDocumentHistory={appendDocumentHistory}
                booking={invoiceViewBooking}
                documentType="Invoices"
                onBack={() => setInvoiceViewBookingId(null)}
                onOpenBeo={() => {
                  setActiveModule('BEOs')
                  setBeoViewBookingId(invoiceViewBooking.id)
                }}
                propertyProfile={propertyProfile}
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
            <ProductsView account={loginSession} products={products} setProducts={setProducts} />
          )}

          {activeModule === 'Venues' && <VenuesView bookings={bookings} />}

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
              currentUserId={userId}
              propertyProfile={propertyProfile}
              setPropertyProfile={setPropertyProfile}
              updateAccountEmail={updateAccountEmail}
              updateAccountPassword={updateAccountPassword}
              updateProfileName={updateProfileName}
            />
          )}
        </main>
        {toast && <div className="toast no-print" role="status">{toast}</div>}
      </div>
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
  ) => Promise<string | null>
}) {
  const [role, setRole] = useState<AuthRole>('top_management')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceCode, setWorkspaceCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lang, setLang] = useState<LoginLang>('en')
  const t = LOGIN_COPY[lang]
  const isStaff = role === 'staff'
  const minPasswordLength = 8
  const passwordReady = password.length >= minPasswordLength
  const identifierReady = isStaff
    ? username.trim() && workspaceCode.trim()
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
      isStaff ? username : email,
      password,
      workspaceCode,
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
          {AUTH_ROLES.map((r) => (
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
          {isStaff ? (
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
                isStaff ? t.staffPasswordPlaceholder : t.clientPasswordPlaceholder
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
  createBooking,
  products,
  recordSandboxAction,
  setActiveModule,
}: {
  bookings: EventBooking[]
  createBooking: (booking: EventBooking) => void
  products: Product[]
  recordSandboxAction: (title: string, detail: string) => void
  setActiveModule: (module: ModuleId) => void
}) {
  const [form, setForm] = useState<NewBookingFormState>(getNewBookingDefaults)
  const [formNotice, setFormNotice] = useState('')
  const updateField = <K extends keyof NewBookingFormState>(
    field: K,
    value: NewBookingFormState[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }))
  }
  const selectedAccount = accounts.find((account) => account.name === form.account)
  const selectedVenue = venues.find((venue) => venue.name === form.venue)
  const packageOptions = products
    .filter((product) => product.category === 'Package')
    .map((product) => product.name)
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
      menu: splitList(form.menu),
      av: splitList(form.av),
      staffing: splitList(form.staffing),
      vendors: splitList(form.vendors),
      specialRequests: splitList(form.specialRequests),
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
  }

  return (
    <form className="new-booking-form" onSubmit={handleSubmit}>
      <section className="panel form-intro">
        <div>
          <p className="eyebrow">Booking intake</p>
          <h2>Required information for a new booking</h2>
          <p>
            Capture enough detail to place the event on the calendar, qualify the
            sales stage, prepare a proposal, and start the BEO draft.
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
              <FormField label="Breakdown time">
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
                  {venues.map((venue) => (
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
                  onChange={(event) => updateField('packageName', event.target.value)}
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
            <legend>BEO and operations notes</legend>
            <div className="form-grid form-grid-textareas">
              <FormField label="Menu / F&B items">
                <textarea
                  onChange={(event) => updateField('menu', event.target.value)}
                  placeholder="Separate items with commas or new lines"
                  value={form.menu}
                />
              </FormField>
              <FormField label="AV / technical">
                <textarea
                  onChange={(event) => updateField('av', event.target.value)}
                  placeholder="Microphones, screen, lighting, technician..."
                  value={form.av}
                />
              </FormField>
              <FormField label="Staffing">
                <textarea
                  onChange={(event) => updateField('staffing', event.target.value)}
                  placeholder="Banquet captain, servers, AV tech..."
                  value={form.staffing}
                />
              </FormField>
              <FormField label="External vendors">
                <textarea
                  onChange={(event) => updateField('vendors', event.target.value)}
                  placeholder="Florist, decorator, production company..."
                  value={form.vendors}
                />
              </FormField>
              <FormField label="Special client instructions">
                <textarea
                  onChange={(event) => updateField('specialRequests', event.target.value)}
                  placeholder="Dietary needs, VIP handling, access notes..."
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
  children,
  hint,
  label,
  required,
  requiredLabel = 'Required',
}: {
  children: React.ReactNode
  hint?: string
  label: string
  required?: boolean
  requiredLabel?: string
}) {
  return (
    <label className="form-field">
      <span>
        {label}
        {required && <em>{requiredLabel}</em>}
      </span>
      {children}
      {hint && <small className="form-field-hint">{hint}</small>}
    </label>
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
          value={(overdueFollowUps + unpaidInvoices.length).toString()}
          detail="Follow-ups and payment items"
        />
      </section>

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
  selectedBookingId,
  setSelectedBookingId,
  setStatusFilter,
  statusFilter,
}: {
  bookings: EventBooking[]
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
          <PanelHeader title="Selected event" />
          <div className="selection-grid">
            <Detail label="Event" value={selectedBooking.eventName} />
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

function emptyLead(): Lead {
  return {
    id: `LEAD-${Date.now()}`,
    name: 'New lead',
    company: '',
    email: '',
    phone: '',
    source: '',
    category: '',
    stage: 'New',
    estimatedValue: 0,
    owner: '',
    createdAt: toDateKey(new Date()),
    notes: '',
    history: [{ id: `HIST-${Date.now()}`, timestamp: toDateKey(new Date()), note: 'Lead created' }],
  }
}

function LeadDetailView({
  canDelete,
  canEdit,
  lead,
  onBack,
  onDelete,
  updateLead,
}: {
  canDelete: boolean
  canEdit: boolean
  lead: Lead
  onBack: () => void
  onDelete: (id: string) => void
  updateLead: <K extends keyof Lead>(id: string, field: K, value: Lead[K]) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const orderedHistory = [...(lead.history ?? [])].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  )

  return (
    <div className="page-stack">
      <button className="text-action back-action" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to leads
      </button>

      <section className="panel">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">{lead.stage}</p>
            <h2>
              {lead.name}
              {lead.company ? ` · ${lead.company}` : ''}
            </h2>
          </div>
          {(canEdit || canDelete) && (
            <div className="card-actions">
              {canEdit && (
                <button
                  className={isEditing ? 'secondary-action' : 'primary-action'}
                  onClick={() => setIsEditing((current) => !current)}
                  type="button"
                >
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              )}
              {canDelete && (
                <button className="secondary-action" onClick={() => onDelete(lead.id)} type="button">
                  Delete
                </button>
              )}
            </div>
          )}
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
            <FormField label="Owner">
              <input
                onChange={(event) => updateLead(lead.id, 'owner', event.target.value)}
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
              <Detail label="Email" value={lead.email || 'Not set'} />
              <Detail label="Phone" value={lead.phone || 'Not set'} />
              <Detail label="Source" value={lead.source || 'Not set'} />
              <Detail label="Category" value={lead.category || 'Not set'} />
              <Detail label="Estimated value" value={money(lead.estimatedValue)} />
              <Detail label="Owner" value={lead.owner || 'Unassigned'} />
              {lead.stage === 'Lost' && (
                <Detail label="Lost reason" value={lead.lostReason || 'Not recorded'} />
              )}
              <Detail label="Created" value={lead.createdAt} />
            </div>
            <div className="drawer-section">
              <h3>Notes</h3>
              <p>{lead.notes || 'No notes yet.'}</p>
            </div>
          </>
        )}
      </section>

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
    </div>
  )
}

function LeadsView({
  account,
  leads,
  setLeads,
}: {
  account: LoginSession
  leads: Lead[]
  setLeads: (next: Lead[] | ((current: Lead[]) => Lead[])) => void
}) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const canCreate = hasPermission(account.role, 'leads:create')
  const canEdit = hasPermission(account.role, 'leads:edit')
  const canDelete = hasPermission(account.role, 'leads:delete')
  const getLeadDate = (lead: Lead) => lead.createdAt
  const availableMonths = availableMonthsOf(leads, getLeadDate)
  const availableYears = availableYearsOf(leads, getLeadDate)
  const [viewMode, setViewMode] = useState<ListViewMode>('grid')
  const [timeFilter, setTimeFilter] = useState<TimeFilterMode>('All')
  const [selectedMonth, setSelectedMonth] = useState(
    () => availableMonths[availableMonths.length - 1] ?? '',
  )
  const [selectedYear, setSelectedYear] = useState(
    () => availableYears[availableYears.length - 1] ?? '',
  )
  const visibleLeads = filterAndSortByTime(
    leads,
    getLeadDate,
    timeFilter,
    selectedMonth,
    selectedYear,
  )

  const updateLead = <K extends keyof Lead>(id: string, field: K, value: Lead[K]) => {
    setLeads((current) =>
      current.map((lead) => {
        if (lead.id !== id) return lead
        const next = { ...lead, [field]: value }
        if (field === 'stage' && lead.stage !== value) {
          next.history = [
            ...(lead.history ?? []),
            {
              id: `HIST-${Date.now()}`,
              timestamp: toDateKey(new Date()),
              note: `Stage changed from ${lead.stage} to ${value as LeadStage}`,
            },
          ]
        }
        return next
      }),
    )
  }

  const createLead = () => {
    const lead = emptyLead()
    setLeads((current) => [lead, ...current])
    setSelectedLeadId(lead.id)
  }

  const deleteLead = (id: string) => {
    if (!window.confirm('Delete this lead? This cannot be undone.')) return
    setLeads((current) => current.filter((lead) => lead.id !== id))
    if (selectedLeadId === id) setSelectedLeadId(null)
  }

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId)

  if (selectedLead) {
    return (
      <LeadDetailView
        canDelete={canDelete}
        canEdit={canEdit}
        lead={selectedLead}
        onBack={() => setSelectedLeadId(null)}
        onDelete={deleteLead}
        updateLead={updateLead}
      />
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader
          action={canCreate ? 'New lead' : undefined}
          onAction={canCreate ? createLead : undefined}
          title="Leads"
        />
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
                className="opportunity-card"
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                type="button"
              >
                <span>{lead.stage}</span>
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
            {!visibleLeads.length && <p>No leads for this period.</p>}
          </div>
        ) : (
          <div className="banner-list">
            {visibleLeads.map((lead) => (
              <button
                className="banner-row"
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
                    {[lead.category, lead.source].filter(Boolean).join(' — ') ||
                      'No category/source set'}
                  </span>
                </div>
                <span className="banner-meta">{lead.owner || 'Unassigned'}</span>
                <strong className="banner-value">{money(lead.estimatedValue)}</strong>
                <ChevronRight size={16} />
              </button>
            ))}
            {!visibleLeads.length && <p>No leads for this period.</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function CrmView({
  bookings,
}: {
  bookings: EventBooking[]
}) {
  return <CustomerDirectory bookings={bookings} />
}

function CustomerDirectory({ bookings }: { bookings: EventBooking[] }) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id)
  const sortedAccounts = [...accounts].sort((first, second) =>
    first.name.localeCompare(second.name),
  )
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0]
  const selectedAccountBookings = bookings.filter(
    (booking) => booking.account === selectedAccount.name,
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
  selectedBookingId,
  setSelectedBookingId,
  setStatusFilter,
  statusFilter,
  updateBookingStatus,
}: {
  account: LoginSession
  bookings: EventBooking[]
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
  appendBeoHistory,
  booking,
  markBeoRevised,
  onBack,
  propertyProfile,
}: {
  appendBeoHistory: (bookingId: string, note: string) => void
  booking: EventBooking
  markBeoRevised: (bookingId: string) => void
  onBack: () => void
  propertyProfile: PropertyProfile
}) {
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
    ['Banquet operations', 'Room setup, logistics, vendor access, breakdown'],
    ['Kitchen', 'Menu, guaranteed counts, dietary notes, service timing'],
    ['AV', 'Audio, display, microphones, technical support'],
    ['Service', 'Staffing, guest flow, table service, special instructions'],
    ['Finance', 'Deposit, proforma invoice, final billing controls'],
  ]

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
              onClick={() => {
                appendBeoHistory(booking.id, 'Printed / exported as PDF')
                window.print()
              }}
              type="button"
            >
              <Download size={16} />
              Print / Save PDF
            </button>
            <button
              className="primary-action"
              onClick={() => markBeoRevised(booking.id)}
              type="button"
            >
              <RefreshCcw size={16} />
              Mark revised
            </button>
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
            <Detail label="Setup" value={`${booking.setupTime} / Breakdown ${booking.breakdownTime}`} />
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
              <p>Breakdown and room reset</p>
            </div>
          </PaperSection>

          <PaperSection title="Contract and distribution">
            <div className="paper-grid compact-paper-grid">
              <Detail label="Contract status" value={booking.contractStatus} />
              <Detail label="Payment status" value={booking.paymentStatus} />
              <Detail label="Revision" value={`Rev ${booking.revision}`} />
              <Detail label="Distribution" value="Sales, operations, kitchen, AV, finance" />
            </div>
          </PaperSection>

          <PaperSection title="Room setup and layout">
            <div className="paper-grid compact-paper-grid">
              <Detail label="Layout" value={booking.layout} />
              <Detail label="Setup access" value={booking.setupTime} />
              <Detail label="Breakdown" value={booking.breakdownTime} />
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
        </div>
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

function LineItemsEditor({
  editable,
  lineItems,
  onChange,
}: {
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
  const removeItem = (id: string) => {
    onChange(lineItems.filter((item) => item.id !== id))
  }

  return (
    <div className="line-items-editor">
      <div className="line-items-row line-items-header">
        <span>Description</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span>Total</span>
        <span />
      </div>
      {lineItems.map((item) => (
        <div className="line-items-row" key={item.id}>
          {editable ? (
            <input
              onChange={(event) => updateItem(item.id, 'description', event.target.value)}
              value={item.description}
            />
          ) : (
            <span>{item.description}</span>
          )}
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
      ))}
      {editable && (
        <button className="secondary-action" onClick={addItem} type="button">
          <Plus size={14} />
          Add item
        </button>
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
  documentType,
  onBack,
  onOpenBeo,
  propertyProfile,
  updateBookingLineItems,
}: {
  account: LoginSession
  appendDocumentHistory: (bookingId: string, note: string) => void
  booking: EventBooking
  documentType: 'Proposals' | 'Invoices'
  onBack: () => void
  onOpenBeo: () => void
  propertyProfile: PropertyProfile
  updateBookingLineItems: (bookingId: string, lineItems: LineItem[], discount: Discount) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const canEdit = hasPermission(account.role, 'proposal:edit')
  const lineItems = getLineItems(booking)
  const discount = getDiscount(booking)
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const discountValue = discountAmount(subtotal, discount)
  const netOfDiscount = subtotal - discountValue
  const serviceCharge = netOfDiscount * 0.1
  const tax = (netOfDiscount + serviceCharge) * 0.07
  const total = netOfDiscount + serviceCharge + tax
  const documentHistory = [...(booking.documentHistory ?? [])].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  )

  const handleLineItemsChange = (nextItems: LineItem[]) => {
    updateBookingLineItems(booking.id, nextItems, discount)
  }
  const handleDiscountChange = (nextDiscount: Discount) => {
    updateBookingLineItems(booking.id, lineItems, nextDiscount)
  }
  const handleToggleEdit = () => {
    if (isEditing) {
      appendDocumentHistory(booking.id, 'Line items updated')
    }
    setIsEditing((current) => !current)
  }

  return (
    <div className="page-stack">
      <button className="text-action back-action no-print" onClick={onBack} type="button">
        <ChevronLeft size={16} />
        Back to {documentType}
      </button>

      <section className="document-preview single-document">
      <div className="document-toolbar no-print">
        <div>
          <p className="eyebrow">{documentType === 'Proposals' ? 'Proposal' : 'Proforma invoice'}</p>
          <h2>{booking.eventName}</h2>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-action" onClick={onOpenBeo} type="button">
            <ClipboardList size={16} />
            Open BEO
          </button>
          {canEdit && (
            <button
              className={isEditing ? 'secondary-action' : 'primary-action'}
              onClick={handleToggleEdit}
              type="button"
            >
              {isEditing ? 'Done editing' : 'Edit line items'}
            </button>
          )}
          <button
            className="secondary-action"
            onClick={() =>
              shareDocument(
                {
                  title: `${booking.eventName} — ${documentType === 'Proposals' ? 'Proposal' : 'Proforma invoice'}`,
                  text: `${booking.account}: ${money(total)} total for ${booking.eventName} on ${booking.date}.`,
                },
                () => appendDocumentHistory(booking.id, 'Summary copied to clipboard'),
              )
            }
            type="button"
          >
            <Send size={16} />
            Send to client
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
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="paper print-doc">
        <div className="paper-head">
          <div>
            <span>EventPilot</span>
            <strong>{documentType === 'Proposals' ? 'Event Proposal' : 'Proforma Invoice'}</strong>
          </div>
          <div>
            <span>{booking.id}</span>
            <strong>{booking.date}</strong>
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

        <PaperSection title="Line items">
          <LineItemsEditor
            editable={isEditing}
            lineItems={lineItems}
            onChange={handleLineItemsChange}
          />
        </PaperSection>

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
      </section>

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
    tags: [],
  }
}

function ProductDetailView({
  canDelete,
  onBack,
  onDelete,
  onSave,
  product,
}: {
  canDelete: boolean
  onBack: () => void
  onDelete: () => void
  onSave: (product: Product) => void
  product: Product
}) {
  const [draft, setDraft] = useState<Product>(product)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(product)

  const setField = <K extends keyof Product>(field: K, value: Product[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('Discard unsaved changes to this package?')) return
    onBack()
  }

  const handleSave = () => {
    onSave(draft)
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

        <div className="plan-edit-form">
          <FormField label="Name">
            <input onChange={(event) => setField('name', event.target.value)} value={draft.name} />
          </FormField>
          <FormField label="Category">
            <input
              onChange={(event) => setField('category', event.target.value)}
              value={draft.category}
            />
          </FormField>
          <FormField label="Description">
            <textarea
              onChange={(event) => setField('description', event.target.value)}
              value={draft.description}
            />
          </FormField>
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
          <FormField label="Unit">
            <input onChange={(event) => setField('unit', event.target.value)} value={draft.unit} />
          </FormField>
          <FormField label="Availability">
            <input
              onChange={(event) => setField('availability', event.target.value)}
              value={draft.availability}
            />
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

function ProductsView({
  account,
  products,
  setProducts,
}: {
  account: LoginSession
  products: Product[]
  setProducts: (next: Product[] | ((current: Product[]) => Product[])) => void
}) {
  const [viewingProductId, setViewingProductId] = useState<string | null>(null)
  const canEdit = hasPermission(account.role, 'packages:edit')

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

  if (viewingProduct) {
    return (
      <ProductDetailView
        canDelete={canEdit}
        onBack={() => setViewingProductId(null)}
        onDelete={() => deleteProduct(viewingProduct.id)}
        onSave={(updated) =>
          setProducts((current) =>
            current.map((product) => (product.id === updated.id ? updated : product)),
          )
        }
        product={viewingProduct}
      />
    )
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <PanelHeader
          action={canEdit ? 'New package' : undefined}
          onAction={canEdit ? createProduct : undefined}
          title="Packages"
        />
        <div className="resource-grid">
          {products.map((product) => (
            <article className="resource-card" key={product.id}>
              <div className="resource-head">
                <span>{product.category}</span>
                <strong>{product.name}</strong>
              </div>
              <p>{product.description}</p>
              <div className="resource-meta">
                <span>{product.displayPrice ? priceLabel(product.price) : 'Quote required'}</span>
                <span>{product.unit}</span>
                <span>{product.availability}</span>
              </div>
              <TagList items={product.tags} />
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
              {canEdit && (
                <div className="card-actions">
                  <button
                    className="primary-action"
                    onClick={() => setViewingProductId(product.id)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="secondary-action"
                    onClick={() => deleteProduct(product.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              )}
            </article>
          ))}
          {!products.length && <p>No packages yet.</p>}
        </div>
      </section>
    </div>
  )
}

function VenuesView({ bookings }: { bookings: EventBooking[] }) {
  return (
    <section className="resource-grid">
      {venues.map((venue) => {
        const conflicts = bookings.filter(
          (booking) => booking.venue === venue.name && booking.status !== 'Cancelled',
        ).length

        return (
          <article className="resource-card" key={venue.id}>
            <div className="resource-head">
              <span>{venue.status}</span>
              <strong>{venue.name}</strong>
            </div>
            <div className="venue-stat">
              <strong>{capacityLabel(venue.capacity)}</strong>
              <span>guest capacity</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${venue.utilization}%` }} />
            </div>
            <p>{venue.utilization}% utilization this month</p>
            {venue.serviceHours && <p>Service hours: {venue.serviceHours}</p>}
            {venue.notes && <p>{venue.notes}</p>}
            <TagList items={venue.setupStyles} />
            {venue.sourceUrl && (
              <a className="source-link" href={venue.sourceUrl} rel="noreferrer" target="_blank">
                <ExternalLink size={14} />
                Source page
              </a>
            )}
            <div className="toggle-row">
              <span>Active bookings</span>
              <strong>{conflicts}</strong>
            </div>
          </article>
        )
      })}
    </section>
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
      venues.map((venue) => ({
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
        {(['Clients', 'Plans', 'Company', 'Security'] as const).map((tab) => (
          <button
            className={activeTab === tab ? 'filter-chip filter-all active' : 'filter-chip'}
            key={tab}
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            role="tab"
            type="button"
          >
            {tab}
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

      {activeTab === 'Plans' && (
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
            <PanelHeader title="Admin login credentials" />
            <div className="form-grid">
              <FormField label="Admin name">
                <input
                  onChange={(event) =>
                    updateAdminCredential('adminName', event.target.value)
                  }
                  value={adminCredentialSettings.adminName}
                />
              </FormField>
              <FormField label="Admin email">
                <input
                  onChange={(event) =>
                    updateAdminCredential('adminEmail', event.target.value)
                  }
                  type="email"
                  value={adminCredentialSettings.adminEmail}
                />
              </FormField>
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
  currentUserId,
  propertyProfile,
  setPropertyProfile,
  updateAccountEmail,
  updateAccountPassword,
  updateProfileName,
}: {
  account: LoginSession
  currentUserId: string | null
  propertyProfile: PropertyProfile
  setPropertyProfile: (value: PropertyProfile) => void
  updateAccountEmail: (email: string) => Promise<string | null>
  updateAccountPassword: (password: string) => Promise<string | null>
  updateProfileName: (name: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PropertyProfile>(propertyProfile)
  const canEditProfile = hasPermission(account.role, 'admin:settings')

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

      {isSupabaseEnabled && hasPermission(account.role, 'admin:userManagement') && (
        <UserManagementPanel currentUserId={currentUserId} />
      )}

      <section className="panel">
        <PanelHeader title="Roles and permissions" />
        <div className="permission-grid">
          {rolePermissions.map(([role, permission]) => (
            <div className="permission-row" key={role}>
              <strong>{role}</strong>
              <span>{permission}</span>
            </div>
          ))}
        </div>
      </section>

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

type ManagedUser = {
  user_id: string
  email: string
  display_name: string | null
  workspace_code: string | null
  role: AuthRole
}

/**
 * Top-Management-only panel to view every user and change their access tier.
 * Writes go straight to eventpilot_profiles; the database guard trigger enforces
 * that only Top Management can change roles and blocks demoting the last one.
 */
function UserManagementPanel({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase
      .from('eventpilot_profiles')
      .select('user_id, email, display_name, workspace_code, role')
      .order('created_at')
      .then(({ data, error: fetchError }) => {
        if (!active) return
        if (fetchError) {
          setLoadError(fetchError.message)
        } else {
          setUsers((data ?? []) as ManagedUser[])
        }
        setLoading(false)
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

    setSavingId(user.user_id)
    const { error: updateError } = await supabase
      .from('eventpilot_profiles')
      .update({ role: nextRole })
      .eq('user_id', user.user_id)
    setSavingId(null)

    if (updateError) {
      // Surface the guard-trigger message (e.g. last Top Management) verbatim.
      setError(updateError.message)
      return
    }
    setUsers((current) =>
      current.map((item) =>
        item.user_id === user.user_id ? { ...item, role: nextRole } : item,
      ),
    )
    setNotice(
      `${user.display_name?.trim() || user.email} is now ${ROLE_LABELS[nextRole].en}.`,
    )
  }

  return (
    <section className="panel">
      <PanelHeader title="User management" />
      <p className="panel-subtitle">
        Set each user's access level. Only Top Management can manage roles.
      </p>

      {loading ? (
        <p className="user-admin-empty">Loading users…</p>
      ) : loadError ? (
        <p className="login-error">{loadError}</p>
      ) : (
        <div className="user-admin-list">
          {users.map((user) => (
            <div className="user-admin-row" key={user.user_id}>
              <div className="user-admin-identity">
                <strong>
                  {user.display_name?.trim() || user.email}
                  {user.user_id === currentUserId && (
                    <span className="user-admin-you">You</span>
                  )}
                </strong>
                <span>
                  {user.email}
                  {user.workspace_code ? ` · ${user.workspace_code}` : ''}
                </span>
              </div>
              <select
                aria-label={`Access level for ${user.email}`}
                className="user-admin-select"
                disabled={savingId === user.user_id}
                onChange={(event) =>
                  changeRole(user, event.target.value as AuthRole)
                }
                value={user.role}
              >
                {AUTH_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r].en}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {error && <p className="login-error">{error}</p>}
      {notice && <p className="profile-notice">{notice}</p>}
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
