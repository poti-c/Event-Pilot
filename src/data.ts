export type BookingStatus =
  | 'Inquiry'
  | 'Tentative'
  | 'Pending'
  | 'Confirmed'
  | 'Completed'
  | 'Lost'
  | 'Cancelled'

export type PaymentStatus = 'Unpaid' | 'Deposit due' | 'Partial' | 'Paid'

export type EventBooking = {
  id: string
  eventName: string
  eventType: string
  account: string
  contact: string
  owner: string
  date: string
  startTime: string
  endTime: string
  setupTime: string
  breakdownTime: string
  venue: string
  room: string
  expectedGuests: number
  guaranteedGuests: number
  actualGuests: number | null
  status: BookingStatus
  paymentStatus: PaymentStatus
  contractStatus: string
  revenue: number
  forecastRevenue: number
  probability: number
  holdExpiry: string | null
  nextAction: string
  leadSource: string
  layout: string
  packageName: string
  menu: string[]
  av: string[]
  staffing: string[]
  vendors: string[]
  specialRequests: string[]
  internalNotes: string
  clientNotes: string
  beoNumber: string
  revision: number
  depositDue: number
}

export type Account = {
  id: string
  name: string
  type: string
  contact: string
  email: string
  phone: string
  totalRevenue: number
  events: number
  preferredVenue: string
  preferredPackages: string[]
  dietary: string[]
  budgetRange: string
  behavior: string
  leadSource: string
  notes: string
}

export type Opportunity = {
  id: string
  title: string
  account: string
  stage: string
  owner: string
  expectedRevenue: number
  expectedClose: string
  probability: number
  nextAction: string
}

export type Product = {
  id: string
  name: string
  category: string
  description: string
  price: number | null
  unit: string
  cost: number | null
  availability: string
  displayOnBeo: boolean
  displayPrice: boolean
  tags: string[]
  sourceUrl?: string
}

export type Venue = {
  id: string
  name: string
  capacity: number | null
  setupStyles: string[]
  status: string
  utilization: number
  nextBooking: string
  serviceHours?: string
  sourceUrl?: string
  notes?: string
}

export type Task = {
  id: string
  title: string
  owner: string
  department: string
  due: string
  status: 'Open' | 'In review' | 'Done'
  bookingId: string
}

export type PropertyProfile = {
  name: string
  positioning: string
  address: string
  phones: string[]
  emails: {
    general: string
    reservations: string
    events: string
  }
  lineOfficial: string
  logistics: string[]
  sourcePages: Array<{
    label: string
    url: string
  }>
}

export const naNirandProfile: PropertyProfile = {
  name: 'Na Nirand Romantic Boutique Resort',
  positioning: 'Romantic boutique resort on the Ping River with Lanna-style wedding, honeymoon, dining, spa, and small function experiences.',
  address:
    '1/1 Soi 9, Charoenprathet Road, Tambon Changklan, Amphoe Muang, Chiang Mai 50100, Thailand',
  phones: ['+66 53 280 988', '+66 93 629 9998'],
  emails: {
    general: 'info@nanirand.com',
    reservations: 'rsvn@nanirand.com',
    events: 'sales@nanirand.com',
  },
  lineOfficial: '@nanirandresort',
  logistics: [
    'Next to Wat Chai Mongkhon temple',
    'About 5 minutes from Chiang Mai Night Bazaar',
    'About 15 minutes by car to Chiang Mai International Airport',
  ],
  sourcePages: [
    { label: 'Events', url: 'https://nanirand.com/events' },
    { label: 'Dining', url: 'https://nanirand.com/dining' },
    {
      label: 'Service & Facilities',
      url: 'https://nanirand.com/service-%26-facilities',
    },
    { label: 'Contact', url: 'https://nanirand.com/contact' },
  ],
}

export const initialBookings: EventBooking[] = [
  {
    id: 'BKG-2401',
    eventName: 'Siam Retail Leadership Dinner',
    eventType: 'Corporate dinner',
    account: 'Siam Retail Group',
    contact: 'Narin V.',
    owner: 'Maya Sales',
    date: '2026-06-05',
    startTime: '18:30',
    endTime: '22:00',
    setupTime: '15:00',
    breakdownTime: '23:00',
    venue: 'Grand Ballroom',
    room: 'Ballroom A',
    expectedGuests: 180,
    guaranteedGuests: 165,
    actualGuests: null,
    status: 'Confirmed',
    paymentStatus: 'Partial',
    contractStatus: 'Signed',
    revenue: 342000,
    forecastRevenue: 342000,
    probability: 100,
    holdExpiry: null,
    nextAction: 'Kitchen final count review',
    leadSource: 'Repeat corporate account',
    layout: 'Round table banquet',
    packageName: 'Executive Thai Banquet',
    menu: ['Tom yum goong station', 'Royal Thai set menu', 'Coffee and petit fours'],
    av: ['Wireless microphones', 'LED wall', 'Podium uplight'],
    staffing: ['1 banquet captain', '18 servers', '2 AV technicians'],
    vendors: ['Floral House Bangkok'],
    specialRequests: ['No pork table for 24 guests', 'VIP entrance at north lobby'],
    internalNotes: 'Finance approved partial payment. Final invoice after beverage actuals.',
    clientNotes: 'Client wants discreet service and quick CEO speech transition.',
    beoNumber: 'BEO-2026-0142',
    revision: 3,
    depositDue: 0,
  },
  {
    id: 'BKG-2402',
    eventName: 'LannaTech Product Launch',
    eventType: 'Product launch',
    account: 'LannaTech Co.',
    contact: 'Kanya S.',
    owner: 'Pim Catering',
    date: '2026-06-06',
    startTime: '09:00',
    endTime: '13:00',
    setupTime: '06:00',
    breakdownTime: '14:00',
    venue: 'Innovation Hall',
    room: 'Hall 2',
    expectedGuests: 260,
    guaranteedGuests: 220,
    actualGuests: null,
    status: 'Tentative',
    paymentStatus: 'Deposit due',
    contractStatus: 'Contract sent',
    revenue: 0,
    forecastRevenue: 418000,
    probability: 70,
    holdExpiry: '2026-06-05',
    nextAction: 'Confirm deposit and stage layout',
    leadSource: 'Website inquiry',
    layout: 'Theater with demo zone',
    packageName: 'Launch Half-Day Package',
    menu: ['Morning coffee break', 'Thai-Western lunch buffet'],
    av: ['Stage lighting', 'Press audio split', 'Confidence monitor'],
    staffing: ['1 event coordinator', '10 servers', '3 AV technicians'],
    vendors: ['BrightStage Production'],
    specialRequests: ['Press registration table', 'Product display security overnight'],
    internalNotes: 'Potential conflict with Hall 3 loading bay. Ops to confirm access.',
    clientNotes: 'Client asks for branded signage and launch countdown.',
    beoNumber: 'BEO-DRAFT-2402',
    revision: 1,
    depositDue: 125400,
  },
  {
    id: 'BKG-2403',
    eventName: 'Chiang Mai Medical Symposium',
    eventType: 'Conference',
    account: 'Northern Medical Association',
    contact: 'Dr. Araya M.',
    owner: 'Tan Sales',
    date: '2026-06-08',
    startTime: '08:00',
    endTime: '17:30',
    setupTime: '18:00 previous day',
    breakdownTime: '18:30',
    venue: 'Convention Wing',
    room: 'Summit 1-3',
    expectedGuests: 420,
    guaranteedGuests: 390,
    actualGuests: null,
    status: 'Confirmed',
    paymentStatus: 'Paid',
    contractStatus: 'Signed',
    revenue: 712000,
    forecastRevenue: 712000,
    probability: 100,
    holdExpiry: null,
    nextAction: 'Print speaker holding-room signage',
    leadSource: 'Association renewal',
    layout: 'Classroom plus exhibition foyer',
    packageName: 'Conference Full-Day Package',
    menu: ['Arrival coffee', 'Two coffee breaks', 'International buffet lunch'],
    av: ['3 projectors', 'Hybrid meeting kit', 'Recording desk'],
    staffing: ['2 coordinators', '24 servers', '4 AV technicians'],
    vendors: ['MedExpo Booths'],
    specialRequests: ['Vegetarian meals for 46 guests', 'Reserved seating for speakers'],
    internalNotes: 'Kitchen needs coffee break split by foyer side.',
    clientNotes: 'Client requested strict session timing.',
    beoNumber: 'BEO-2026-0147',
    revision: 2,
    depositDue: 0,
  },
  {
    id: 'BKG-2404',
    eventName: 'Royal Orchid Wedding',
    eventType: 'Wedding',
    account: 'Wongthanakit Family',
    contact: 'Mintra W.',
    owner: 'Pim Catering',
    date: '2026-06-10',
    startTime: '17:00',
    endTime: '23:30',
    setupTime: '11:00',
    breakdownTime: '00:30',
    venue: 'Garden Pavilion',
    room: 'Pavilion and Lawn',
    expectedGuests: 310,
    guaranteedGuests: 280,
    actualGuests: null,
    status: 'Pending',
    paymentStatus: 'Deposit due',
    contractStatus: 'Under negotiation',
    revenue: 0,
    forecastRevenue: 615000,
    probability: 55,
    holdExpiry: '2026-06-07',
    nextAction: 'Send revised floral and buffet proforma',
    leadSource: 'Planner referral',
    layout: 'Cocktail lawn and banquet pavilion',
    packageName: 'Signature Wedding Package',
    menu: ['Canapes', 'Seafood buffet', 'Late-night noodle station'],
    av: ['Ceremony sound', 'DJ power drop', 'Ambient lighting'],
    staffing: ['1 wedding coordinator', '22 servers', '2 bartenders'],
    vendors: ['Mali Wedding Studio', 'North Floral'],
    specialRequests: ['Separate family tea ceremony room', 'Rain backup by 10:00'],
    internalNotes: 'High revenue potential. Needs fast follow-up on revised quote.',
    clientNotes: 'Family wants premium but understated styling.',
    beoNumber: 'BEO-DRAFT-2404',
    revision: 1,
    depositDue: 184500,
  },
  {
    id: 'BKG-2405',
    eventName: 'Aviation Partners Board Retreat',
    eventType: 'Board meeting',
    account: 'Aviation Partners Asia',
    contact: 'Leon C.',
    owner: 'Maya Sales',
    date: '2026-06-12',
    startTime: '10:00',
    endTime: '16:00',
    setupTime: '08:00',
    breakdownTime: '16:30',
    venue: 'Executive Floor',
    room: 'Boardroom 3',
    expectedGuests: 24,
    guaranteedGuests: 20,
    actualGuests: null,
    status: 'Inquiry',
    paymentStatus: 'Unpaid',
    contractStatus: 'Not started',
    revenue: 0,
    forecastRevenue: 88000,
    probability: 30,
    holdExpiry: null,
    nextAction: 'Call assistant with proposal options',
    leadSource: 'Phone inquiry',
    layout: 'Boardroom',
    packageName: 'Executive Meeting Package',
    menu: ['Premium coffee service', 'Working lunch', 'Afternoon tea'],
    av: ['Video conference bar', 'Screen share adapter'],
    staffing: ['1 coordinator', '2 servers'],
    vendors: [],
    specialRequests: ['Confidential guest list', 'Airport transfer quote'],
    internalNotes: 'May become repeat account if handled well.',
    clientNotes: 'Assistant requested quiet room and fast check-in.',
    beoNumber: 'BEO-DRAFT-2405',
    revision: 0,
    depositDue: 26400,
  },
  {
    id: 'BKG-2406',
    eventName: 'Na Nirand Garden Wedding Inquiry',
    eventType: 'Destination wedding',
    account: 'Private Couple Inquiry',
    contact: 'Website wedding lead',
    owner: 'Pim Catering',
    date: '2026-06-14',
    startTime: '17:30',
    endTime: '22:30',
    setupTime: '13:00',
    breakdownTime: '23:30',
    venue: 'The Garden of Eternal Love',
    room: 'Rain tree garden',
    expectedGuests: 80,
    guaranteedGuests: 60,
    actualGuests: null,
    status: 'Inquiry',
    paymentStatus: 'Unpaid',
    contractStatus: 'Not started',
    revenue: 0,
    forecastRevenue: 280000,
    probability: 35,
    holdExpiry: null,
    nextAction: 'Send wedding package and check garden backup plan',
    leadSource: 'Na Nirand website events inquiry',
    layout: 'Outdoor garden ceremony with riverfront dinner option',
    packageName: 'Na Nirand Wedding & Honeymoon Package',
    menu: ['Candle Light Dinner option', 'TIME Riverfront Cuisine & Bar menu', 'Signature Afternoon Tea add-on'],
    av: ['Ceremony sound', 'Ambient garden lighting'],
    staffing: ['Wedding coordinator', 'Banquet service team'],
    vendors: ['Florist to confirm', 'Photographer to confirm'],
    specialRequests: [
      'Outdoor weather decision required',
      'Offer Huan Kammung or TIME Riverfront as backup flow',
      'Ask whether alms giving, cooking class, or spa add-ons are desired',
    ],
    internalNotes:
      'Data pack sourced from public Na Nirand pages. Capacities and package pricing require sales confirmation.',
    clientNotes: 'Couple is interested in romantic Lanna setting under the giant rain tree.',
    beoNumber: 'BEO-DRAFT-2406',
    revision: 0,
    depositDue: 84000,
  },
]

export const accounts: Account[] = [
  {
    id: 'ACC-01',
    name: 'Siam Retail Group',
    type: 'Corporate',
    contact: 'Narin V.',
    email: 'narin@siamretail.example',
    phone: '+66 81 555 0142',
    totalRevenue: 1248000,
    events: 7,
    preferredVenue: 'Grand Ballroom',
    preferredPackages: ['Executive Thai Banquet', 'Premium Coffee Break'],
    dietary: ['No pork table', 'Vegetarian executives'],
    budgetRange: '300k-500k THB',
    behavior: 'Fast approver after finance receives itemized proforma.',
    leadSource: 'Repeat corporate account',
    notes: 'Prefers precise run sheets and low-profile VIP handling.',
  },
  {
    id: 'ACC-02',
    name: 'LannaTech Co.',
    type: 'Corporate',
    contact: 'Kanya S.',
    email: 'kanya@lannatech.example',
    phone: '+66 89 222 0188',
    totalRevenue: 0,
    events: 0,
    preferredVenue: 'Innovation Hall',
    preferredPackages: ['Launch Half-Day Package'],
    dietary: ['Halal option', 'Vegetarian'],
    budgetRange: '350k-450k THB',
    behavior: 'Compares AV line items closely and asks for visual mockups.',
    leadSource: 'Website inquiry',
    notes: 'Potential high-value tech account if launch is successful.',
  },
  {
    id: 'ACC-03',
    name: 'Northern Medical Association',
    type: 'Association',
    contact: 'Dr. Araya M.',
    email: 'araya@nma.example',
    phone: '+66 82 417 9001',
    totalRevenue: 1935000,
    events: 5,
    preferredVenue: 'Convention Wing',
    preferredPackages: ['Conference Full-Day Package'],
    dietary: ['Vegetarian', 'Low sugar desserts'],
    budgetRange: '650k-850k THB',
    behavior: 'Renews annually when session timing and AV reliability are strong.',
    leadSource: 'Association renewal',
    notes: 'Requires strong speaker-room coordination.',
  },
]

export const opportunities: Opportunity[] = [
  {
    id: 'OPP-01',
    title: 'LannaTech launch deposit',
    account: 'LannaTech Co.',
    stage: 'Deposit requested',
    owner: 'Pim Catering',
    expectedRevenue: 418000,
    expectedClose: '2026-06-05',
    probability: 70,
    nextAction: 'Send bank transfer reminder',
  },
  {
    id: 'OPP-02',
    title: 'Royal Orchid revised package',
    account: 'Wongthanakit Family',
    stage: 'Negotiation',
    owner: 'Pim Catering',
    expectedRevenue: 615000,
    expectedClose: '2026-06-07',
    probability: 55,
    nextAction: 'Send floral option comparison',
  },
  {
    id: 'OPP-03',
    title: 'Aviation board retreat',
    account: 'Aviation Partners Asia',
    stage: 'New inquiry',
    owner: 'Maya Sales',
    expectedRevenue: 88000,
    expectedClose: '2026-06-09',
    probability: 30,
    nextAction: 'Call executive assistant',
  },
  {
    id: 'OPP-04',
    title: 'Siam Retail Q3 townhall',
    account: 'Siam Retail Group',
    stage: 'Site inspection scheduled',
    owner: 'Tan Sales',
    expectedRevenue: 520000,
    expectedClose: '2026-06-18',
    probability: 45,
    nextAction: 'Prepare ballroom split proposal',
  },
  {
    id: 'OPP-05',
    title: 'Na Nirand wedding inquiry',
    account: 'Private Couple Inquiry',
    stage: 'New website lead',
    owner: 'Pim Catering',
    expectedRevenue: 280000,
    expectedClose: '2026-06-08',
    probability: 35,
    nextAction: 'Send wedding package, venue options, and consultation times',
  },
]

export const products: Product[] = [
  {
    id: 'PRD-01',
    name: 'Executive Thai Banquet',
    category: 'Package',
    description: 'Premium Thai set menu with coffee service and standard banquet staffing.',
    price: 1900,
    unit: 'per person',
    cost: 980,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['corporate', 'thai', 'vip'],
  },
  {
    id: 'PRD-02',
    name: 'Launch Half-Day Package',
    category: 'Package',
    description: 'Morning launch package with stage support, coffee break, and lunch.',
    price: 1600,
    unit: 'per person',
    cost: 820,
    availability: 'Limited',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['launch', 'av-heavy', 'press'],
  },
  {
    id: 'PRD-03',
    name: 'Hybrid Meeting Kit',
    category: 'AV',
    description: 'Camera, audio bridge, capture card, and technician support.',
    price: 18000,
    unit: 'per event',
    cost: 6500,
    availability: '2 kits left',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['conference', 'hybrid'],
  },
  {
    id: 'PRD-04',
    name: 'Seafood Buffet Upgrade',
    category: 'Food',
    description: 'Live seafood station upgrade for weddings and gala dinners.',
    price: 650,
    unit: 'per person',
    cost: 390,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['wedding', 'premium'],
  },
  {
    id: 'PRD-NN-01',
    name: 'Na Nirand Wedding & Honeymoon Package',
    category: 'Package',
    description:
      'Romantic wedding or honeymoon experience using garden, Lanna house, rice barn, riverfront dining, and optional resort activities.',
    price: null,
    unit: 'quote required',
    cost: null,
    availability: 'Sales confirmation required',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['nanirand', 'wedding', 'honeymoon', 'lanna'],
    sourceUrl: 'https://nanirand.com/events',
  },
  {
    id: 'PRD-NN-02',
    name: 'Signature Afternoon Tea',
    category: 'Dining',
    description: 'Publicly listed afternoon tea experience served daily from 11:00 to 17:00.',
    price: null,
    unit: 'quote required',
    cost: null,
    availability: 'Daily 11:00-17:00',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['nanirand', 'afternoon tea', 'upsell'],
    sourceUrl: 'https://nanirand.com/dining',
  },
  {
    id: 'PRD-NN-03',
    name: 'Glasshouse Dinner',
    category: 'Dining',
    description:
      'Glasshouse dining option at TIME Riverfront Cuisine & Bar with 360-degree views.',
    price: null,
    unit: 'quote required',
    cost: null,
    availability: 'Daily 17:00-22:30',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['nanirand', 'glasshouse', 'dinner'],
    sourceUrl: 'https://nanirand.com/dining',
  },
  {
    id: 'PRD-NN-04',
    name: 'Candle Light Dinner',
    category: 'Dining',
    description: 'Romantic dinner experience promoted for couples, honeymoons, and anniversaries.',
    price: null,
    unit: 'quote required',
    cost: null,
    availability: 'Daily 17:00-22:30',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['nanirand', 'romantic dinner', 'anniversary'],
    sourceUrl: 'https://nanirand.com/dining',
  },
  {
    id: 'PRD-NN-05',
    name: 'Na Nirand Spa Add-on',
    category: 'Spa',
    description:
      'Two-treatment-room Lanna-style spa add-on for wedding, honeymoon, and leisure itineraries.',
    price: null,
    unit: 'quote required',
    cost: null,
    availability: 'Daily 10:00-21:00',
    displayOnBeo: true,
    displayPrice: false,
    tags: ['nanirand', 'spa', 'honeymoon'],
    sourceUrl: 'https://nanirand.com/service-%26-facilities',
  },
]

export const venues: Venue[] = [
  {
    id: 'VEN-01',
    name: 'Grand Ballroom',
    capacity: 520,
    setupStyles: ['Banquet', 'Theater', 'Classroom'],
    status: 'Available after 23:00',
    utilization: 78,
    nextBooking: 'Siam Retail Leadership Dinner',
  },
  {
    id: 'VEN-02',
    name: 'Innovation Hall',
    capacity: 340,
    setupStyles: ['Theater', 'Expo', 'Launch'],
    status: 'Tentative hold',
    utilization: 64,
    nextBooking: 'LannaTech Product Launch',
  },
  {
    id: 'VEN-03',
    name: 'Convention Wing',
    capacity: 680,
    setupStyles: ['Classroom', 'Conference', 'Expo'],
    status: 'Confirmed',
    utilization: 86,
    nextBooking: 'Chiang Mai Medical Symposium',
  },
  {
    id: 'VEN-04',
    name: 'Garden Pavilion',
    capacity: 360,
    setupStyles: ['Wedding', 'Cocktail', 'Banquet'],
    status: 'Pending proposal',
    utilization: 52,
    nextBooking: 'Royal Orchid Wedding',
  },
  {
    id: 'VEN-NN-01',
    name: 'The Garden of Eternal Love',
    capacity: null,
    setupStyles: ['Outdoor ceremony', 'Proposal', 'Pre-wedding photography'],
    status: 'Public capacity TBC',
    utilization: 36,
    nextBooking: 'Na Nirand Garden Wedding Inquiry',
    sourceUrl: 'https://nanirand.com/service-%26-facilities',
    notes:
      'Garden under the resort rain tree, positioned for proposals, pre-wedding photos, and wedding ceremonies. Weather backup should be tracked on BEOs.',
  },
  {
    id: 'VEN-NN-02',
    name: 'Huan Kammung',
    capacity: null,
    setupStyles: ['Small meeting', 'Exhibition', 'Engagement', 'Small wedding'],
    status: 'Public capacity TBC',
    utilization: 28,
    nextBooking: 'Available',
    serviceHours: '09:00-20:00',
    sourceUrl: 'https://nanirand.com/service-%26-facilities',
    notes:
      'Lanna teak house that can function for parties, exhibitions, small meetings, pre-wedding photography, engagement parties, and smaller weddings.',
  },
  {
    id: 'VEN-NN-03',
    name: 'Lanna Rice Barn & Pool Bar',
    capacity: null,
    setupStyles: ['Private dinner', 'Small exhibition', 'Lanna engagement'],
    status: 'Public capacity TBC',
    utilization: 22,
    nextBooking: 'Available',
    serviceHours: '10:00-20:00',
    sourceUrl: 'https://nanirand.com/service-%26-facilities',
    notes:
      'Antique Lanna-style rice barn and small pool bar suitable for intimate functions and private sit-down dinners.',
  },
  {
    id: 'VEN-NN-04',
    name: 'TIME Riverfront Cuisine & Bar',
    capacity: null,
    setupStyles: ['Riverfront dinner', 'Anniversary', 'Romantic dining'],
    status: 'Public capacity TBC',
    utilization: 48,
    nextBooking: 'Available',
    serviceHours: '06:30-22:30',
    sourceUrl: 'https://nanirand.com/dining',
    notes:
      'Riverfront Thai-Lanna fusion and international dining venue, with Glasshouse and Candle Light Dinner options.',
  },
  {
    id: 'VEN-NN-05',
    name: 'Na Nirand Spa',
    capacity: null,
    setupStyles: ['Spa add-on', 'Honeymoon itinerary'],
    status: '2 treatment rooms',
    utilization: 42,
    nextBooking: 'Available',
    serviceHours: '10:00-21:00',
    sourceUrl: 'https://nanirand.com/service-%26-facilities',
    notes:
      'Compact Lanna-style spa for honeymoon and wedding add-ons. Good candidate for package upsells.',
  },
]

export const tasks: Task[] = [
  {
    id: 'TSK-01',
    title: 'Review final guaranteed count',
    owner: 'Kitchen',
    department: 'Kitchen',
    due: '2026-06-05 14:00',
    status: 'Open',
    bookingId: 'BKG-2401',
  },
  {
    id: 'TSK-02',
    title: 'Confirm launch stage power and loading bay',
    owner: 'Banquet Ops',
    department: 'Operations',
    due: '2026-06-05 16:00',
    status: 'Open',
    bookingId: 'BKG-2402',
  },
  {
    id: 'TSK-03',
    title: 'Send revised floral proforma',
    owner: 'Pim Catering',
    department: 'Sales',
    due: '2026-06-06 11:00',
    status: 'In review',
    bookingId: 'BKG-2404',
  },
  {
    id: 'TSK-04',
    title: 'Prepare weekly operations report',
    owner: 'Management',
    department: 'Management',
    due: '2026-06-07 17:00',
    status: 'Open',
    bookingId: 'BKG-2403',
  },
  {
    id: 'TSK-05',
    title: 'Confirm Na Nirand public package pricing and capacities',
    owner: 'Sales',
    department: 'Sales',
    due: '2026-06-06 15:00',
    status: 'Open',
    bookingId: 'BKG-2406',
  },
]

export const rolePermissions = [
  ['Admin', 'Full system, settings, users, audit logs'],
  ['Sales manager', 'Pipeline, bookings, proposals, reports, approvals'],
  ['Catering manager', 'Bookings, BEOs, packages, event operations'],
  ['Event coordinator', 'Tasks, event details, client communication, BEO updates'],
  ['Banquet operations', 'Operations view, setup notes, staffing, checklists'],
  ['Kitchen', 'Menu, guest counts, service times, dietary notes'],
  ['Finance', 'Quotes, proforma, invoices, receipts, payments'],
  ['Management', 'Dashboards, reports, revenue forecast, read approvals'],
  ['Client portal user', 'Proposal, booking details, BEO approval, payment'],
]
