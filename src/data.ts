export type BookingStatus =
  | 'Inquiry'
  | 'Tentative'
  | 'Pending'
  | 'Confirmed'
  | 'Completed'
  | 'Lost'
  | 'Cancelled'

export type PaymentStatus = 'Unpaid' | 'Deposit due' | 'Partial' | 'Paid'

export type LineItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export type DiscountMode = 'none' | 'percent' | 'value' | 'promo'

export type Discount = {
  mode: DiscountMode
  value: number
  code?: string
}

export type HistoryEntry = {
  id: string
  timestamp: string
  note: string
}

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
  lineItems?: LineItem[]
  discount?: Discount
  beoHistory?: HistoryEntry[]
  documentHistory?: HistoryEntry[]
  billingCompany?: string
  paymentMethod?: string
  clientApprovedAt?: string
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

export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Won' | 'Lost'

export type FollowUp = {
  id: string
  timestamp: string
  note: string
  author: string
}

export type Lead = {
  id: string
  name: string
  company: string
  email: string
  phone: string
  source: string
  category: string
  stage: LeadStage
  estimatedValue: number
  owner: string
  lostReason?: string
  createdAt: string
  updatedAt?: string
  notes: string
  followUps?: FollowUp[]
  history: HistoryEntry[]
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
  signatoryName: string
  signatoryTitle: string
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
  signatoryName: '',
  signatoryTitle: '',
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
    beoHistory: [
      { id: 'BKG-2401-BH1', timestamp: '2026-05-10', note: 'BEO drafted' },
      { id: 'BKG-2401-BH2', timestamp: '2026-05-18', note: 'Marked as Rev 1' },
      { id: 'BKG-2401-BH3', timestamp: '2026-05-27', note: 'Marked as Rev 2' },
      { id: 'BKG-2401-BH4', timestamp: '2026-06-02', note: 'Marked as Rev 3' },
    ],
    documentHistory: [
      { id: 'BKG-2401-DH1', timestamp: '2026-05-10', note: 'Proposal generated from booking' },
      { id: 'BKG-2401-DH2', timestamp: '2026-05-12', note: 'Sent to client' },
      { id: 'BKG-2401-DH3', timestamp: '2026-05-30', note: 'Line items updated' },
    ],
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

export const leads: Lead[] = [
  {
    id: 'LEAD-01',
    name: 'Kanya S.',
    company: 'LannaTech Co.',
    email: 'kanya@lannatech.example',
    phone: '+66 89 222 0188',
    source: 'Website inquiry',
    category: 'Product launch',
    stage: 'Won',
    estimatedValue: 418000,
    owner: 'Pim Catering',
    createdAt: '2026-05-20',
    notes: 'Send bank transfer reminder for deposit.',
    history: [
      { id: 'LEAD-01-H1', timestamp: '2026-05-20', note: 'Lead created' },
      { id: 'LEAD-01-H2', timestamp: '2026-05-21', note: 'Stage changed from New to Contacted' },
      { id: 'LEAD-01-H3', timestamp: '2026-05-25', note: 'Stage changed from Contacted to Qualified' },
      { id: 'LEAD-01-H4', timestamp: '2026-05-30', note: 'Stage changed from Qualified to Proposal Sent' },
      { id: 'LEAD-01-H5', timestamp: '2026-06-05', note: 'Stage changed from Proposal Sent to Won' },
    ],
  },
  {
    id: 'LEAD-02',
    name: 'Mintra W.',
    company: 'Wongthanakit Family',
    email: '',
    phone: '',
    source: 'Planner referral',
    category: 'Wedding',
    stage: 'Proposal Sent',
    estimatedValue: 615000,
    owner: 'Pim Catering',
    createdAt: '2026-05-22',
    notes: 'Send floral option comparison.',
    history: [
      { id: 'LEAD-02-H1', timestamp: '2026-05-22', note: 'Lead created' },
      { id: 'LEAD-02-H2', timestamp: '2026-05-24', note: 'Stage changed from New to Contacted' },
      { id: 'LEAD-02-H3', timestamp: '2026-05-29', note: 'Stage changed from Contacted to Qualified' },
      { id: 'LEAD-02-H4', timestamp: '2026-06-02', note: 'Stage changed from Qualified to Proposal Sent' },
    ],
  },
  {
    id: 'LEAD-03',
    name: 'Leon C.',
    company: 'Aviation Partners Asia',
    email: '',
    phone: '',
    source: 'Phone inquiry',
    category: 'Board meeting',
    stage: 'New',
    estimatedValue: 88000,
    owner: 'Maya Sales',
    createdAt: '2026-05-28',
    notes: 'Call executive assistant.',
    history: [{ id: 'LEAD-03-H1', timestamp: '2026-05-28', note: 'Lead created' }],
  },
  {
    id: 'LEAD-04',
    name: 'Narin V.',
    company: 'Siam Retail Group',
    email: 'narin@siamretail.example',
    phone: '+66 81 555 0142',
    source: 'Repeat corporate account',
    category: 'Corporate',
    stage: 'Qualified',
    estimatedValue: 520000,
    owner: 'Tan Sales',
    createdAt: '2026-05-15',
    notes: 'Prepare ballroom split proposal for Q3 townhall.',
    history: [
      { id: 'LEAD-04-H1', timestamp: '2026-05-15', note: 'Lead created' },
      { id: 'LEAD-04-H2', timestamp: '2026-05-18', note: 'Stage changed from New to Contacted' },
      { id: 'LEAD-04-H3', timestamp: '2026-05-26', note: 'Stage changed from Contacted to Qualified' },
    ],
  },
  {
    id: 'LEAD-05',
    name: 'Website wedding lead',
    company: 'Private Couple Inquiry',
    email: '',
    phone: '',
    source: 'Na Nirand website events inquiry',
    category: 'Wedding',
    stage: 'New',
    estimatedValue: 280000,
    owner: 'Pim Catering',
    createdAt: '2026-06-01',
    notes: 'Send wedding package, venue options, and consultation times.',
    history: [{ id: 'LEAD-05-H1', timestamp: '2026-06-01', note: 'Lead created' }],
  },
]

export const products: Product[] = [
  // ── Wedding packages (Na Nirand Signature Wedding Package 2026) ──
  {
    id: 'PRD-W01',
    name: 'Pre-Wedding Photoshooting',
    category: 'Package',
    description:
      '5 hours pre-wedding venue photoshoot; day-use resort room for changing and preparation.',
    price: 15000,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'pre-wedding', 'photography'],
  },
  {
    id: 'PRD-W02',
    name: 'Lanna Wedding',
    category: 'Package',
    description:
      "Traditional Thai (Lanna) wedding ceremony. Includes: back drop with floral arch; traditional 'Khan Mak' set; Bai Sri set with wrist binding or water blessing set or Chinese tea ceremony; Thai wedding ceremony set up; 30-min Lanna blessing by master of ceremony; floral neck garland for bride & groom; personalized couple name / welcome signage; groom's boutonniere; bridal bouquet; 4 corsages for parents; decorated registration desk, blessing book and money box; in-house sound system with background music; one-night stay in Romantic Lanna Royal deluxe incl. in-room breakfast for two; complimentary honeymoon set up in room; 1 bottle of Sparkling Wine; herbal refreshments for 50 guests during the ceremony (additional guests subject to extra fee).",
    price: 128888,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'thai', 'lanna', 'ceremony'],
  },
  {
    id: 'PRD-W03',
    name: 'Buddhist Ceremony — 5 Monks',
    category: 'Package',
    description:
      'Buddha image and flower decoration at altar; inviting 5 monks and master of ceremony for blessing; venue set up with equipment; Thai set menu in Lanna Tiffin Carrier and offering set for monks and master of ceremony.',
    price: 19888,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'buddhist', 'ceremony'],
  },
  {
    id: 'PRD-W04',
    name: 'Buddhist Ceremony — 9 Monks',
    category: 'Package',
    description:
      'Buddha image and flower decoration at altar; inviting 9 monks and master of ceremony for blessing; venue set up with equipment; Thai set menu in Lanna Tiffin Carrier and offering set for monks and master of ceremony.',
    price: 38888,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'buddhist', 'ceremony'],
  },
  {
    id: 'PRD-W05',
    name: 'Western Wedding',
    category: 'Package',
    description:
      "Western-style wedding ceremony. Includes: back drop with floral arch; personalized welcome signage; 6 floral along the aisle; 2 floral stands at the entrance; groom's boutonniere; bridal bouquet; 6 corsages for best men and 4 for bridesmaids; 4 corsages for parents; 8 sets of baskets of flower petals; decorated registration desk and blessing book; in-house sound system with background music; one-night stay in Romantic Lanna Royal deluxe incl. in-room breakfast for two; complimentary honeymoon set up in room; 1 bottle of Sparkling Wine; herbal refreshments for 50 guests during the ceremony (additional guests subject to extra fee).",
    price: 128888,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'western', 'ceremony'],
  },
  {
    id: 'PRD-W06',
    name: 'Wedding Reception Decoration',
    category: 'Package',
    description:
      "Reception decoration package. Includes: back drop with floral arch; welcome floral backdrop; personalized welcome signage; 8 floral along the aisle; 2 floral stands at the entrance; groom's boutonniere; bridal bouquet; floral neck garland for bride & groom (Thai style ceremony); 3-tiers (ten-pound) wedding cake with flower decoration; champagne tower with flower decoration; 4 corsages for parents; decorated registration desk, blessing book and money box; floral decoration for the bride & groom's seats; standard flower vases on dining table; in-house sound system with background music; two-night stay in Romantic Lanna Royal deluxe incl. in-room breakfast for two; complimentary honeymoon set up in room; 1 bottle of Champagne; herbal refreshments for 50 guests during the ceremony (additional guests subject to extra fee).",
    price: 168888,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['wedding', 'reception', 'decoration'],
  },

  // ── Venue rental (applied when no wedding package is taken) ──
  {
    id: 'PRD-R01',
    name: 'Venue Rental — TIME Riverfront Cuisine & Bar',
    category: 'Venue rental',
    description:
      'Venue rental fee (applied if no wedding package is taken). Or minimum revenue THB 150,000 net; maximum 5 hours per booking.',
    price: 80000,
    unit: 'net',
    cost: null,
    availability: 'By reservation',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['venue', 'rental', 'riverfront'],
  },
  {
    id: 'PRD-R02',
    name: 'Venue Rental — Glass House',
    category: 'Venue rental',
    description:
      'Venue rental fee (applied if no wedding package is taken). Or minimum revenue THB 80,000 net.',
    price: 50000,
    unit: 'net',
    cost: null,
    availability: 'By reservation',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['venue', 'rental', 'glass-house'],
  },
  {
    id: 'PRD-R03',
    name: 'Venue Rental — Huan Kammung',
    category: 'Venue rental',
    description: 'Venue rental fee (applied if no wedding package is taken).',
    price: 35000,
    unit: 'net',
    cost: null,
    availability: 'By reservation',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['venue', 'rental', 'huan-kammung'],
  },
  {
    id: 'PRD-R04',
    name: 'Venue Rental — The Garden of Eternal Love',
    category: 'Venue rental',
    description: 'Venue rental fee (applied if no wedding package is taken).',
    price: 65000,
    unit: 'net',
    cost: null,
    availability: 'By reservation',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['venue', 'rental', 'garden'],
  },

  // ── Food & Beverage packages (per person; three menu tiers) ──
  {
    id: 'PRD-F01',
    name: 'Coffee Break',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 550 / 750 / 1,000 net per person.',
    price: 550,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'coffee-break'],
  },
  {
    id: 'PRD-F02',
    name: 'Kad Mua',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 850 / 1,000 / 1,200 net per person.',
    price: 850,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'thai', 'kad-mua'],
  },
  {
    id: 'PRD-F03',
    name: 'Cocktail',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 850 / 1,000 / 1,400 net per person.',
    price: 850,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'cocktail'],
  },
  {
    id: 'PRD-F04',
    name: 'Set Menu — Thai Set',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 1,200 / 1,500 / 1,800 net per person.',
    price: 1200,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'set-menu', 'thai'],
  },
  {
    id: 'PRD-F05',
    name: 'Set Menu — East Meets West Set',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 1,500 / 1,800 / 2,100 net per person.',
    price: 1500,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'set-menu', 'fusion'],
  },
  {
    id: 'PRD-F06',
    name: 'Set Menu — Western Set',
    category: 'Food & Beverage',
    description: 'Three menu tiers: THB 1,700 / 2,000 / 2,300 net per person.',
    price: 1700,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'set-menu', 'western'],
  },
  {
    id: 'PRD-F07',
    name: 'Thai Buffet',
    category: 'Food & Beverage',
    description: 'Minimum 50 persons. Three menu tiers: THB 1,100 / 1,300 / 1,500 net per person.',
    price: 1100,
    unit: 'net per person',
    cost: null,
    availability: 'Minimum 50 persons',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'buffet', 'thai'],
  },
  {
    id: 'PRD-F08',
    name: 'International Buffet',
    category: 'Food & Beverage',
    description: 'Minimum 50 persons. Three menu tiers: THB 1,200 / 1,500 / 1,800 net per person.',
    price: 1200,
    unit: 'net per person',
    cost: null,
    availability: 'Minimum 50 persons',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['catering', 'buffet', 'international'],
  },

  // ── Beverage packages ──
  {
    id: 'PRD-B01',
    name: 'Free Flow — Soft Drinks',
    category: 'Beverage',
    description:
      'Per person by duration: 1hr 150 / 2hr 270 / 3hr 360 net. Coke, Sprite, ginger ale, tonic, soda, pouring water.',
    price: 150,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'free-flow', 'soft-drinks'],
  },
  {
    id: 'PRD-B02',
    name: 'Free Flow — Soft Drinks, Fruit Juices & Local Beers',
    category: 'Beverage',
    description:
      'Per person by duration: 1hr 500 / 2hr 800 / 3hr 1,050 net. Adds orange/apple/pineapple juice and Chang/Singha beer.',
    price: 500,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'free-flow', 'beer'],
  },
  {
    id: 'PRD-B03',
    name: 'Free Flow — Soft Drinks, Fruit Juices, Local Beers & House Wine',
    category: 'Beverage',
    description: 'Per person by duration: 1hr 1,000 / 2hr 1,600 / 3hr 2,100 net. Adds house wine.',
    price: 1000,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'free-flow', 'wine'],
  },
  {
    id: 'PRD-B04',
    name: 'Standard Open Bar',
    category: 'Beverage',
    description:
      'Per person by duration: 1hr 1,200 / 2hr 1,900 / 3hr 2,500 net. Soft drinks, fruit juice, local beer, house wine, whisky, vodka, tequila, gin, rum.',
    price: 1200,
    unit: 'net per person',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'open-bar', 'spirits'],
  },
  {
    id: 'PRD-B05',
    name: 'Draft Beer — Chang (30L keg)',
    category: 'Beverage',
    description: '30 liters, approx. 80 glasses.',
    price: 9000,
    unit: 'net per keg',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'draft-beer', 'chang'],
  },
  {
    id: 'PRD-B06',
    name: 'Draft Beer — Singha (30L keg)',
    category: 'Beverage',
    description: '30 liters, approx. 80 glasses.',
    price: 10000,
    unit: 'net per keg',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'draft-beer', 'singha'],
  },
  {
    id: 'PRD-B07',
    name: 'Draft Beer — Heineken (30L keg)',
    category: 'Beverage',
    description: '30 liters, approx. 80 glasses.',
    price: 11000,
    unit: 'net per keg',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'draft-beer', 'heineken'],
  },
  {
    id: 'PRD-B08',
    name: 'Corkage — Wine & Spirit',
    category: 'Beverage',
    description: 'Corkage charge for guest-supplied wine and spirit.',
    price: 500,
    unit: 'net per bottle',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'corkage', 'wine'],
  },
  {
    id: 'PRD-B09',
    name: 'Corkage — Champagne',
    category: 'Beverage',
    description: 'Corkage charge for guest-supplied champagne.',
    price: 1000,
    unit: 'net per bottle',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'corkage', 'champagne'],
  },
  {
    id: 'PRD-B10',
    name: 'Corkage Package',
    category: 'Beverage',
    description: '1–12 bottles THB 3,000 / 13–24 bottles THB 5,000 / 24+ bottles THB 10,000 net.',
    price: 3000,
    unit: 'net per event',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['beverage', 'corkage', 'package'],
  },

  // ── Additional services ──
  {
    id: 'PRD-S01',
    name: 'Bulb Lighting at Lawn Area',
    category: 'Add-on service',
    description: 'Decorative bulb lighting installed across the lawn area.',
    price: 8000,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['add-on', 'lighting'],
  },
  {
    id: 'PRD-S02',
    name: 'Duo Band',
    category: 'Add-on service',
    description: 'Live duo band performance.',
    price: 25000,
    unit: 'net / 3 hours',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['add-on', 'entertainment', 'band'],
  },
  {
    id: 'PRD-S03',
    name: 'Trio Band',
    category: 'Add-on service',
    description: 'Live trio band performance.',
    price: 30000,
    unit: 'net / 3 hours',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['add-on', 'entertainment', 'band'],
  },
  {
    id: 'PRD-S04',
    name: 'Quartet Band',
    category: 'Add-on service',
    description: 'Live quartet band performance.',
    price: 35000,
    unit: 'net / 3 hours',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['add-on', 'entertainment', 'band'],
  },
  {
    id: 'PRD-S05',
    name: 'MC and Event Sequence Run',
    category: 'Add-on service',
    description: 'Master of ceremony and event sequence run-through / coordination.',
    price: 15000,
    unit: 'net',
    cost: null,
    availability: 'Available',
    displayOnBeo: true,
    displayPrice: true,
    tags: ['add-on', 'mc', 'coordination'],
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
    id: 'VEN-05',
    name: 'Executive Floor',
    capacity: 40,
    setupStyles: ['Boardroom', 'U-Shape', 'Private dining'],
    status: 'Inquiry hold',
    utilization: 38,
    nextBooking: 'Aviation Partners Board Retreat',
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

// Authority tiers, aligned with the three-tier login model
// (top_management / manager / staff). These descriptions are enforced by the
// `hasPermission`/`PERMISSIONS` table in App.tsx — keep both in sync.
export const rolePermissions = [
  [
    'Top Management',
    'Full access — bookings, BEOs, clients, reports, subscription controls, admin settings, and user management.',
  ],
  [
    'Managers',
    'Day-to-day operations — bookings, BEOs, proposals, packages, tasks, and reports. No admin, billing, or user management.',
  ],
  [
    'Staff',
    'Assigned work — event details, BEO updates, checklists, and operational views for their tasks.',
  ],
]
