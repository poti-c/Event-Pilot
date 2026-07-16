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
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  accounts,
  initialBookings,
  naNirandProfile,
  opportunities,
  products,
  rolePermissions,
  tasks,
  venues,
} from './data'
import type { Account, BookingStatus, EventBooking, PaymentStatus } from './data'

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

const statusOrder: BookingStatus[] = [
  'Inquiry',
  'Tentative',
  'Pending',
  'Confirmed',
  'Completed',
  'Lost',
  'Cancelled',
]

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = window.localStorage.getItem(key)
    if (!stored) return initialValue

    try {
      return JSON.parse(stored) as T
    } catch {
      return initialValue
    }
  })

  const setStoredValue = (nextValue: T | ((currentValue: T) => T)) => {
    setValue((currentValue) => {
      const resolved =
        typeof nextValue === 'function'
          ? (nextValue as (currentValue: T) => T)(currentValue)
          : nextValue

      window.localStorage.setItem(key, JSON.stringify(resolved))
      return resolved
    })
  }

  return [value, setStoredValue] as const
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
  if (value >= 1_000) return `THB ${(value / 1_000).toFixed(0)}K`
  return money(value)
}

function priceLabel(value: number | null) {
  return value === null ? 'Quote required' : money(value)
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
  const aEnd = minutesFromTime(endA)
  const bStart = minutesFromTime(startB)
  const bEnd = minutesFromTime(endB)
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false
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
type AdminConsoleTab = 'Clients' | 'Plans' | 'Security'

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

type LoginSession = {
  authenticated: boolean
  email: string
  role: 'Owner Admin' | 'Client User'
}

type LoginCredential = {
  email: string
  password: string
  workspaceCode: string
  role: LoginSession['role']
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

const initialClientCompanies: ClientCompany[] = [
  {
    id: 'CLIENT-NNR',
    companyName: 'Na Nirand Romantic Boutique Resort',
    propertyType: 'Boutique resort',
    planId: 'Platinum',
    status: 'Pilot',
    adminEmail: 'admin@nanirand.example',
    renewalDate: '2027-06-05',
    activeUsers: 4,
    userLimitOverride: 5,
    bookingLimitOverride: 0,
    supportOwner: 'EventPilot Admin',
    notes: 'Pilot account for local sandbox validation before Supabase migration.',
  },
  {
    id: 'CLIENT-SME-01',
    companyName: 'Siam Riverside Events',
    propertyType: 'SME hotel',
    planId: 'Gold',
    status: 'Active',
    adminEmail: 'events@siamriverside.example',
    renewalDate: '2027-01-31',
    activeUsers: 1,
    userLimitOverride: 1,
    bookingLimitOverride: 0,
    supportOwner: 'Sales Ops',
    notes: 'Single-user annual subscription candidate.',
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

const loginCredentials: LoginCredential[] = [
  {
    email: 'poti@nanirand.com',
    password: 'REDACTED-PW',
    workspaceCode: 'nanirand',
    role: 'Client User',
  },
  {
    email: 'admin.eventpilot@nnr-solutions.com',
    password: 'REDACTED-PW',
    workspaceCode: 'admin',
    role: 'Owner Admin',
  },
]

const initialLoginSession: LoginSession = {
  authenticated: false,
  email: '',
  role: 'Client User',
}

function App() {
  const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin'
  const [activeModule, setActiveModule] = useState<ModuleId>(getModuleFromHash)
  const [bookings, setBookings] = useLocalStorageState(
    'eventpilot.bookings.v2',
    initialBookings,
  )
  const [clientCompanies, setClientCompanies] = useLocalStorageState(
    'eventpilot.admin.clients.v1',
    initialClientCompanies,
  )
  const [adminPlans, setAdminPlans] = useLocalStorageState(
    'eventpilot.admin.plans.v1',
    initialSaasPlans,
  )
  const [expansionPacks, setExpansionPacks] = useLocalStorageState(
    'eventpilot.admin.expansion-packs.v1',
    initialExpansionPacks,
  )
  const [adminCredentialSettings, setAdminCredentialSettings] =
    useLocalStorageState(
      'eventpilot.admin.credentials.v1',
      initialAdminCredentialSettings,
    )
  const [loginSession, setLoginSession] = useLocalStorageState(
    'eventpilot.login.session.v1',
    initialLoginSession,
  )
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id)
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
    (sum, booking) => sum + booking.forecastRevenue,
    0,
  )
  const pipelineRevenue = opportunities.reduce(
    (sum, opportunity) => sum + opportunity.expectedRevenue,
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
      id: `ACT-${Date.now()}`,
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
          revenue:
            nextStatus === 'Confirmed' || nextStatus === 'Completed'
              ? booking.forecastRevenue
              : booking.revenue,
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

  const markBeoRevised = (bookingId: string) => {
    setBookings((currentBookings) =>
      currentBookings.map((booking) =>
        booking.id === bookingId
          ? { ...booking, revision: booking.revision + 1 }
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

  const resetSandbox = () => {
    const confirmed = window.confirm(
      'Reset all local demo bookings to the original sandbox data?',
    )
    if (!confirmed) return
    setBookings(initialBookings)
    setSelectedBookingId(initialBookings[0].id)
    setQuery('')
    setStatusFilter('All')
    setSandboxActions([])
    recordSandboxAction('Sandbox reset', 'Demo bookings were restored locally.')
  }

  const handleLogin = (credential: LoginCredential) => {
    setLoginSession({
      authenticated: true,
      email: credential.email,
      role: credential.role,
    })
    setActiveModule(isAdminRoute ? 'Dashboard' : 'Dashboard')
  }

  const handleLogout = () => {
    setLoginSession(initialLoginSession)
    setQuery('')
    setStatusFilter('All')
    setActiveModule('Login')
  }

  if (
    !loginSession.authenticated ||
    activeModule === 'Login' ||
    (isAdminRoute && loginSession.role !== 'Owner Admin')
  ) {
    return (
      <LoginView
        adminCredentialSettings={adminCredentialSettings}
        handleLogin={handleLogin}
        isAdminRoute={isAdminRoute}
      />
    )
  }

  if (isAdminRoute) {
    return (
      <AdminPortal
        adminCredentialSettings={adminCredentialSettings}
        adminPlans={adminPlans}
        clientCompanies={clientCompanies}
        expansionPacks={expansionPacks}
        handleLogout={handleLogout}
        setAdminCredentialSettings={setAdminCredentialSettings}
        setAdminPlans={setAdminPlans}
        setClientCompanies={setClientCompanies}
        setExpansionPacks={setExpansionPacks}
      />
    )
  }

  return (
    <div className="platform-shell">
      <aside className="sidebar" aria-label="Main navigation">
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
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={activeModule === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => setActiveModule(item.id)}
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
          <p>Storage mode</p>
          <strong>Browser local data</strong>
          <span>Supabase deferred</span>
        </div>
      </aside>

      <div className="workbench">
        <header className="topbar">
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
            <button className="secondary-action" onClick={handleLogout} type="button">
              Sign out
            </button>
            <a
              className="primary-action"
              href="#NewBooking"
              onClick={() => setActiveModule('NewBooking')}
            >
              <Plus size={17} />
              New booking
            </a>
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
              recordSandboxAction={recordSandboxAction}
              setActiveModule={setActiveModule}
            />
          )}

          {activeModule === 'Dashboard' && (
            <DashboardView
              bookings={bookings}
              confirmedRevenue={confirmedRevenue}
              forecastRevenue={forecastRevenue}
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

          {(activeModule === 'Leads' || activeModule === 'CRM') && (
            <CrmView activeModule={activeModule} bookings={bookings} />
          )}

          {activeModule === 'Bookings' && (
            <BookingsView
              bookings={filteredBookings}
              selectedBookingId={selectedBooking?.id}
              setSelectedBookingId={setSelectedBookingId}
              setStatusFilter={setStatusFilter}
              statusFilter={statusFilter}
              updateBookingStatus={updateBookingStatus}
            />
          )}

          {activeModule === 'BEOs' && selectedBooking && (
            <BeoView
              booking={selectedBooking}
              bookings={filteredBookings}
              markBeoRevised={markBeoRevised}
              recordSandboxAction={recordSandboxAction}
              setSelectedBookingId={setSelectedBookingId}
            />
          )}

          {(activeModule === 'Proposals' || activeModule === 'Invoices') &&
            selectedBooking && (
              <DocumentsView
                booking={selectedBooking}
                documentType={activeModule}
                recordSandboxAction={recordSandboxAction}
                setActiveModule={setActiveModule}
              />
            )}

          {activeModule === 'Packages' && <ProductsView />}

          {activeModule === 'Venues' && <VenuesView bookings={bookings} />}

          {activeModule === 'Tasks' && <TasksView bookings={bookings} />}

          {activeModule === 'Reports' && (
            <ReportsView
              bookings={bookings}
              confirmedRevenue={confirmedRevenue}
              forecastRevenue={forecastRevenue}
              pipelineRevenue={pipelineRevenue}
              recordSandboxAction={recordSandboxAction}
            />
          )}

          {activeModule === 'Settings' && <SettingsView resetSandbox={resetSandbox} />}
        </main>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </div>
  )
}

function LoginView({
  adminCredentialSettings,
  handleLogin,
  isAdminRoute,
}: {
  adminCredentialSettings: AdminCredentialSettings
  handleLogin: (credential: LoginCredential) => void
  isAdminRoute: boolean
}) {
  const defaultCredential = isAdminRoute
    ? loginCredentials.find((credential) => credential.role === 'Owner Admin')
    : loginCredentials.find((credential) => credential.role === 'Client User')
  const [email, setEmail] = useState(defaultCredential?.email ?? '')
  const [password, setPassword] = useState('')
  const [workspaceCode, setWorkspaceCode] = useState(
    defaultCredential?.workspaceCode ?? '',
  )
  const [error, setError] = useState('')
  const passwordReady =
    password.length >=
    (isAdminRoute ? adminCredentialSettings.minimumPasswordLength : 8)
  const loginReady = email.includes('@') && passwordReady && workspaceCode.trim()

  const submitLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!passwordReady) {
      setError(
        `Password must be at least ${adminCredentialSettings.minimumPasswordLength} characters.`,
      )
      return
    }

    const matchedCredential = loginCredentials.find(
      (credential) =>
        credential.email.toLowerCase() === email.trim().toLowerCase() &&
        credential.password === password &&
        credential.workspaceCode.toLowerCase() ===
          workspaceCode.trim().toLowerCase(),
    )

    if (!matchedCredential) {
      setError('Email, password, or workspace code does not match.')
      return
    }

    if (isAdminRoute && matchedCredential.role !== 'Owner Admin') {
      setError('Admin Console requires the EventPilot admin workspace.')
      return
    }

    setError('')
    handleLogin(matchedCredential)
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
        <div className="login-signal-grid">
          <span>BEO control</span>
          <span>CRM pipeline</span>
          <span>Calendar ops</span>
          <span>Tenant admin</span>
        </div>
      </section>

      <section className="login-panel">
        <div>
          <p className="eyebrow">Secure workspace access</p>
          <h1>Sign in to EventPilot</h1>
          <p>
            Enter your workspace credentials to access bookings, BEOs, client
            companies, subscription controls, and admin settings.
          </p>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <FormField label="Email address" required>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </FormField>
          <FormField label="Password" required>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isAdminRoute ? 'Admin password' : 'Client password'}
              required
              type="password"
              value={password}
            />
          </FormField>
          <FormField label="Workspace code" required>
            <input
              onChange={(event) => setWorkspaceCode(event.target.value)}
              required
              value={workspaceCode}
            />
          </FormField>

          <div className="login-policy-grid">
            <span className={passwordReady ? 'policy-ready' : ''}>
              {isAdminRoute
                ? `${adminCredentialSettings.minimumPasswordLength}+ character policy`
                : 'Client workspace'}
            </span>
            <span
              className={
                adminCredentialSettings.requireNewDeviceEmailVerification
                  ? 'policy-ready'
                  : ''
              }
            >
              New-device email check
            </span>
            <span>{adminCredentialSettings.trustedDeviceDays} day trusted device</span>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="primary-action login-submit" disabled={!loginReady} type="submit">
            <ShieldCheck size={17} />
            Enter EventPilot
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
  recordSandboxAction,
  setActiveModule,
}: {
  bookings: EventBooking[]
  createBooking: (booking: EventBooking) => void
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
    const id = `BKG-${String(timestamp).slice(-5)}`
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
  label,
  required,
}: {
  children: React.ReactNode
  label: string
  required?: boolean
}) {
  return (
    <label className="form-field">
      <span>
        {label}
        {required && <em>Required</em>}
      </span>
      {children}
    </label>
  )
}

function DashboardView({
  bookings,
  confirmedRevenue,
  forecastRevenue,
  overdueFollowUps,
  pipelineRevenue,
  setActiveModule,
  setSelectedBookingId,
}: {
  bookings: EventBooking[]
  confirmedRevenue: number
  forecastRevenue: number
  overdueFollowUps: number
  pipelineRevenue: number
  setActiveModule: (module: ModuleId) => void
  setSelectedBookingId: (id: string) => void
}) {
  const todayKey = toDateKey(new Date())
  const todayBookings = bookings.filter((booking) => booking.date === todayKey)
  const tentativeHolds = bookings.filter((booking) => booking.status === 'Tentative')
  const unpaidInvoices = bookings.filter((booking) =>
    ['Unpaid', 'Deposit due', 'Partial'].includes(booking.paymentStatus),
  )

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
            {bookings.slice(0, 5).map((booking) => (
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
            <span>Open opportunity value</span>
          </div>
          <div className="stage-list">
            {opportunities.map((opportunity) => (
              <div className="stage-item" key={opportunity.id}>
                <div>
                  <strong>{opportunity.title}</strong>
                  <span>{opportunity.stage}</span>
                </div>
                <em>{opportunity.probability}%</em>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="triple-grid">
        <OperationalPanel
          icon={Utensils}
          items={['Final count for BKG-2401', 'Vegetarian labels for symposium']}
          title="Kitchen"
        />
        <OperationalPanel
          icon={Building2}
          items={['Stage power check', 'Garden rain backup decision']}
          title="Banquet operations"
        />
        <OperationalPanel
          icon={ReceiptText}
          items={['Deposit reminders', 'Partial payment follow-up']}
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
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay())

  const todayKey = toDateKey(new Date())
  const visibleMonthNumber = monthStart.getMonth()
  const monthTitle = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(monthStart)
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

function CrmView({
  activeModule,
  bookings,
}: {
  activeModule: ModuleId
  bookings: EventBooking[]
}) {
  if (activeModule === 'CRM') {
    return <CustomerDirectory bookings={bookings} />
  }

  return (
    <div className="page-stack">
      <section className="pipeline-board">
        {opportunities.map((opportunity) => (
          <article className="opportunity-card" key={opportunity.id}>
            <span>{opportunity.stage}</span>
            <strong>{opportunity.title}</strong>
            <p>{opportunity.account}</p>
            <div className="progress-track">
              <span style={{ width: `${opportunity.probability}%` }} />
            </div>
            <div className="card-foot">
              <em>{money(opportunity.expectedRevenue)}</em>
              <small>{opportunity.expectedClose}</small>
            </div>
            <p className="note-line">{opportunity.nextAction}</p>
          </article>
        ))}
      </section>

      <section className="account-grid">
        {accounts.map((account) => {
          const accountBookings = bookings.filter(
            (booking) => booking.account === account.name,
          )
          return (
            <article className="account-card" key={account.id}>
              <div className="account-head">
                <div className="avatar">{account.name.slice(0, 2)}</div>
                <div className="account-title">
                  <strong>{account.name}</strong>
                  <span className="account-type">{account.type}</span>
                </div>
              </div>
              <div className="account-stats">
                <span>
                  <strong title={money(account.totalRevenue)}>
                    {compactMoney(account.totalRevenue)}
                  </strong>
                  <small>Past revenue</small>
                </span>
                <span>
                  <strong>{account.events}</strong>
                  <small>Past events</small>
                </span>
                <span>
                  <strong>{accountBookings.length}</strong>
                  <small>Active bookings</small>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Contact</dt>
                  <dd>{account.contact}</dd>
                </div>
                <div>
                  <dt>Preference</dt>
                  <dd>{account.preferredPackages.join(', ')}</dd>
                </div>
                <div>
                  <dt>Behavior</dt>
                  <dd>{account.behavior}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </section>
    </div>
  )
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
  bookings,
  selectedBookingId,
  setSelectedBookingId,
  setStatusFilter,
  statusFilter,
  updateBookingStatus,
}: {
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
          <div className="status-actions">
            <button
              className="secondary-action"
              disabled={isFirstStatus}
              onClick={() => updateBookingStatus(selectedBooking.id, 'backward')}
              type="button"
            >
              <ChevronLeft size={17} />
              Fall back
            </button>
            <button
              className="primary-action"
              disabled={isLastStatus}
              onClick={() => updateBookingStatus(selectedBooking.id, 'forward')}
              type="button"
            >
              <CheckCircle2 size={17} />
              Advance
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

function BeoView({
  booking,
  bookings,
  markBeoRevised,
  recordSandboxAction,
  setSelectedBookingId,
}: {
  booking: EventBooking
  bookings: EventBooking[]
  markBeoRevised: (bookingId: string) => void
  recordSandboxAction: (title: string, detail: string) => void
  setSelectedBookingId: (id: string) => void
}) {
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
    <div className="documents-layout">
      <aside className="document-list">
        {bookings.map((item) => (
          <button
            className={item.id === booking.id ? 'doc-list-item active' : 'doc-list-item'}
            key={item.id}
            onClick={() => setSelectedBookingId(item.id)}
            aria-pressed={item.id === booking.id}
            type="button"
          >
            <FileText size={16} />
            <span>{item.beoNumber}</span>
            <em>Rev {item.revision}</em>
          </button>
        ))}
      </aside>

      <section className="document-preview">
        <div className="document-toolbar">
          <div>
            <p className="eyebrow">Banquet Event Order</p>
            <h2>{booking.beoNumber}</h2>
          </div>
          <div className="toolbar-actions">
            <button
              className="secondary-action"
              onClick={() =>
                recordSandboxAction(
                  'BEO share simulated',
                  `${booking.beoNumber} queued for sales, operations, kitchen, AV, service, and finance.`,
                )
              }
              type="button"
            >
              <Send size={16} />
              Share
            </button>
            <button
              className="secondary-action"
              onClick={() =>
                recordSandboxAction(
                  'PDF export simulated',
                  `${booking.beoNumber} Rev ${booking.revision} export was logged locally.`,
                )
              }
              type="button"
            >
              <Download size={16} />
              PDF
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

        <section className="beo-control-panel">
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
          <div className="department-strip">
            {departmentResponsibilities.map(([department, responsibility]) => (
              <div key={department}>
                <strong>{department}</strong>
                <span>{responsibility}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="paper">
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
            <span>Client approval</span>
            <span>Operations approval</span>
            <span>Finance approval</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function DocumentsView({
  booking,
  documentType,
  recordSandboxAction,
  setActiveModule,
}: {
  booking: EventBooking
  documentType: 'Proposals' | 'Invoices'
  recordSandboxAction: (title: string, detail: string) => void
  setActiveModule: (module: ModuleId) => void
}) {
  const subtotal = booking.forecastRevenue
  const serviceCharge = subtotal * 0.1
  const tax = (subtotal + serviceCharge) * 0.07
  const total = subtotal + serviceCharge + tax

  return (
    <section className="document-preview single-document">
      <div className="document-toolbar">
        <div>
          <p className="eyebrow">{documentType === 'Proposals' ? 'Proposal' : 'Proforma invoice'}</p>
          <h2>{booking.eventName}</h2>
        </div>
        <div className="toolbar-actions">
          <button className="secondary-action" onClick={() => setActiveModule('BEOs')} type="button">
            <ClipboardList size={16} />
            Open BEO
          </button>
          <button
            className="primary-action"
            onClick={() =>
              recordSandboxAction(
                `${documentType === 'Proposals' ? 'Proposal' : 'Invoice'} send simulated`,
                `${booking.account} would receive ${booking.eventName} by email in production.`,
              )
            }
            type="button"
          >
            <Send size={16} />
            Send to client
          </button>
        </div>
      </div>

      <div className="paper">
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

        <PaperSection title="Package inclusions">
          <TagList items={[...booking.menu, ...booking.av, ...booking.staffing]} />
        </PaperSection>

        <div className="invoice-table">
          <div>
            <span>Event package and venue estimate</span>
            <strong>{money(subtotal)}</strong>
          </div>
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
      </div>
    </section>
  )
}

function ProductsView() {
  return (
    <section className="resource-grid">
      {products.map((product) => (
        <article className="resource-card" key={product.id}>
          <div className="resource-head">
            <span>{product.category}</span>
            <strong>{product.name}</strong>
          </div>
          <p>{product.description}</p>
          <div className="resource-meta">
            <span>{priceLabel(product.price)}</span>
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
        </article>
      ))}
    </section>
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

function ReportsView({
  bookings,
  confirmedRevenue,
  forecastRevenue,
  pipelineRevenue,
  recordSandboxAction,
}: {
  bookings: EventBooking[]
  confirmedRevenue: number
  forecastRevenue: number
  pipelineRevenue: number
  recordSandboxAction: (title: string, detail: string) => void
}) {
  const confirmed = bookings.filter((booking) => booking.status === 'Confirmed').length
  const tentative = bookings.filter((booking) => booking.status === 'Tentative').length
  const outstanding = bookings.filter((booking) => booking.paymentStatus !== 'Paid').length

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard icon={ShieldCheck} label="Confirmed events" value={confirmed.toString()} detail="Signed bookings" />
        <MetricCard icon={Clock3} label="Tentative holds" value={tentative.toString()} detail="Hold expiry monitored" />
        <MetricCard icon={ReceiptText} label="Outstanding invoices" value={outstanding.toString()} detail="Deposit or final payment" />
        <MetricCard icon={BarChart3} label="Pipeline value" value={money(pipelineRevenue)} detail="Open opportunities" />
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
            {[
              'Monthly banquet calendar',
              'Weekly operations report',
              'Lost business analysis',
              'Package popularity',
              'Venue utilization',
              'Salesperson performance',
            ].map((report) => (
              <button
                className="report-item"
                key={report}
                onClick={() =>
                  recordSandboxAction(
                    'Report opened',
                    `${report} is available as a local sandbox drilldown.`,
                  )
                }
                type="button"
              >
                <BarChart3 size={16} />
                {report}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function AdminConsoleView({
  adminCredentialSettings,
  adminPlans,
  clientCompanies,
  expansionPacks,
  setAdminCredentialSettings,
  setAdminPlans,
  setClientCompanies,
  setExpansionPacks,
}: {
  adminCredentialSettings: AdminCredentialSettings
  adminPlans: SaaSPlan[]
  clientCompanies: ClientCompany[]
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
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [securityNotice, setSecurityNotice] = useState('')
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
    const id = `PACK-${String(Date.now()).slice(-5)}`
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

  const addClientCompany = () => {
    const id = `CLIENT-${String(Date.now()).slice(-5)}`
    const nextClient: ClientCompany = {
      id,
      companyName: 'New client company',
      propertyType: 'Hotel / venue',
      planId: 'Starter',
      status: 'Pilot',
      adminEmail: 'admin@example.com',
      renewalDate: toDateKey(new Date()),
      activeUsers: 1,
      userLimitOverride: 1,
      bookingLimitOverride: 20,
      supportOwner: 'EventPilot Admin',
      notes: 'New local sandbox account.',
    }
    setClientCompanies((currentClients) => [nextClient, ...currentClients])
    setSelectedClientId(id)
    setActiveTab('Clients')
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

  const handlePasswordUpdate = () => {
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

    setAdminCredentialSettings((currentSettings) => ({
      ...currentSettings,
      lastPasswordChange: toDateKey(new Date()),
    }))
    setPasswordDraft('')
    setPasswordConfirm('')
    setSecurityNotice('Admin password policy updated locally. Plain text is not stored.')
  }

  return (
    <div className="page-stack">
      <section className="panel admin-hero">
        <div>
          <p className="eyebrow">SaaS control center</p>
          <h2>Manage tenant companies, plan limits, and owner access</h2>
        </div>
        <button className="primary-action" onClick={addClientCompany} type="button">
          <Plus size={17} />
          Add client company
        </button>
      </section>

      <section className="metric-grid">
        <MetricCard icon={Building2} label="Client companies" value={clientCompanies.length.toString()} detail={`${activeClientCount} active accounts`} />
        <MetricCard icon={BadgeDollarSign} label="Annual value" value={money(totalAnnualValue)} detail="Plan value in local sandbox" />
        <MetricCard icon={Users} label="Managed seats" value={totalSeats.toString()} detail="Current configured user limits" />
        <MetricCard icon={Clock3} label="Pilot accounts" value={pilotClientCount.toString()} detail="Free or evaluation accounts" />
      </section>

      <div className="admin-tabs" role="tablist" aria-label="Admin console sections">
        {(['Clients', 'Plans', 'Security'] as const).map((tab) => (
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
                <p className="eyebrow">{selectedClient.id}</p>
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
              <FormField label="New admin password">
                <input
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  type="password"
                  value={passwordDraft}
                />
              </FormField>
              <FormField label="Confirm password">
                <input
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  type="password"
                  value={passwordConfirm}
                />
              </FormField>
            </div>
            <div className="status-actions">
              <button className="primary-action" onClick={handlePasswordUpdate} type="button">
                <ShieldCheck size={17} />
                Update password policy
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

function SettingsView({ resetSandbox }: { resetSandbox: () => void }) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="property-profile">
          <div>
            <p className="eyebrow">Property profile</p>
            <h2>{naNirandProfile.name}</h2>
          </div>
          <div className="profile-grid">
            <Detail label="Address" value={naNirandProfile.address} />
            <Detail label="Phone" value={naNirandProfile.phones.join(', ')} />
            <Detail
              label="Email routing"
              value={`Events ${naNirandProfile.emails.events} | Reservations ${naNirandProfile.emails.reservations} | General ${naNirandProfile.emails.general}`}
            />
            <Detail label="Line official" value={naNirandProfile.lineOfficial} />
          </div>
        </div>
      </section>

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

      <section className="split-layout">
        <div className="panel">
          <PanelHeader title="Local sandbox" />
          <div className="integration-card">
            <ShieldCheck size={24} />
            <div>
              <strong>Browser local storage</strong>
              <p>Bookings can be edited locally while the MVP is shaped.</p>
            </div>
          </div>
          <button className="secondary-action full-width" onClick={resetSandbox} type="button">
            <RefreshCcw size={16} />
            Reset demo data
          </button>
        </div>

        <div className="panel">
          <PanelHeader title="Future migration" />
          <div className="integration-card muted-card">
            <Building2 size={24} />
            <div>
              <strong>Supabase and DNS deferred</strong>
              <p>
                Database, auth, storage, production hosting, and nnr-solutions.com
                DNS are intentionally parked for the next phase.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
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
  onAction,
  title,
}: {
  action?: string
  onAction?: () => void
  title: string
}) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
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
  const width = Math.max(8, Math.round((value / max) * 100))

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
