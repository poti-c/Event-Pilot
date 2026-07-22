-- Vendor billing: client roster + Thai-compliant billing documents.
--
-- Two things land here:
--   1. eventpilot_client_companies — the SaaS client roster becomes a real
--      shared table instead of per-user eventpilot_app_state JSON blobs, so
--      every operator sees the same customers. A billing document needs a
--      stable buyer to point at.
--   2. The document engine — quotations, invoices, tax invoices and receipts
--      with Thai legal fields, plus an append-only delivery log.
--
-- Like the console tables, everything here is service-role only and reached
-- through the eventpilot-console edge function.

-- ---------------------------------------------------------------------------
-- Issuer (NNR-Solutions) — single row, keyed by a boolean so it cannot fork.
-- ---------------------------------------------------------------------------
create table if not exists public.eventpilot_console_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'NNR-Solutions Co., Ltd.',
  company_name_th text,
  tax_id text,
  office_type text not null default 'head_office'
    check (office_type in ('head_office', 'branch')),
  branch_code text,
  billing_address jsonb not null default '{}'::jsonb,
  phone text,
  email text,
  website text,
  logo_url text,
  signatory_name text,
  signatory_title text,
  promptpay_id text,
  promptpay_name text,
  support_email text,
  updated_at timestamptz not null default now()
);

insert into public.eventpilot_console_settings (id) values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Client roster. Carries the buyer's Thai legal identity so documents can
-- snapshot it at issue time.
-- ---------------------------------------------------------------------------
create table if not exists public.eventpilot_client_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_th text,
  property_type text,
  plan text,
  account_status text not null default 'active'
    check (account_status in ('active', 'pilot', 'suspended', 'closed')),
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Thai legal identity of the buyer.
  tax_id text,
  office_type text not null default 'head_office'
    check (office_type in ('head_office', 'branch')),
  branch_code text,
  billing_address jsonb not null default '{}'::jsonb,
  -- Commercial terms.
  allowed_users integer,
  booking_limit integer,
  renewal_date date,
  support_owner text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eventpilot_client_companies_name_idx
  on public.eventpilot_client_companies (lower(name));

-- ---------------------------------------------------------------------------
-- Document numbering.
--
-- The Revenue Department expects tax invoice numbers to be sequential and
-- never reused. A counter row per (scope, doc_type, period) gives that
-- atomically: the UPDATE ... RETURNING below takes a row lock, so concurrent
-- issuers serialise instead of racing for the same number.
-- ---------------------------------------------------------------------------
create table if not exists public.eventpilot_document_counters (
  scope text not null,
  doc_type text not null,
  period text not null, -- 'YYYY-MM', derived from the Bangkok issue date
  next_value integer not null default 1,
  primary key (scope, doc_type, period)
);

-- ---------------------------------------------------------------------------
-- Documents.
--
-- issuer_snapshot / buyer_snapshot are deliberately denormalised copies: a
-- document must never change because a company later edits its address.
-- ---------------------------------------------------------------------------
create table if not exists public.eventpilot_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null
    check (doc_type in ('quotation', 'invoice', 'tax_invoice_receipt', 'receipt', 'credit_note')),
  doc_number text not null,
  -- 'vendor' today; 'venue' reserved for venue-to-event-client billing later.
  issuer_scope text not null default 'vendor'
    check (issuer_scope in ('vendor', 'venue')),
  client_company_id uuid references public.eventpilot_client_companies(id) on delete set null,
  issuer_snapshot jsonb not null default '{}'::jsonb,
  buyer_snapshot jsonb not null default '{}'::jsonb,
  line_items jsonb not null default '[]'::jsonb,
  currency text not null default 'THB',
  -- Money. Every figure is recomputed server-side from line_items.
  subtotal numeric(14, 2) not null default 0,
  discount_code text,
  discount_percent numeric(5, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  non_vat_amount numeric(14, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 7,
  vat_amount numeric(14, 2) not null default 0,
  -- Withholding tax: Thai corporates commonly withhold 3% on services.
  wht_rate numeric(5, 2) not null default 0,
  wht_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  issue_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  due_date date,
  status text not null default 'draft',
  notes text,
  -- Immutable rendered copy of what was issued, so a template change never
  -- rewrites history. Storage object path, filled at issue time.
  archive_path text,
  archived_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sequential-and-unique, per document type.
create unique index if not exists eventpilot_documents_type_number_uidx
  on public.eventpilot_documents (doc_type, doc_number);
create index if not exists eventpilot_documents_client_idx
  on public.eventpilot_documents (client_company_id, issue_date desc);
create index if not exists eventpilot_documents_created_idx
  on public.eventpilot_documents (created_at desc);

-- ---------------------------------------------------------------------------
-- Delivery log — append-only, one row per send attempt.
--
-- Deliberately a table rather than sent/sent_at flags on the document: a
-- resend must add to the history, not overwrite when it was first delivered.
-- ---------------------------------------------------------------------------
create table if not exists public.eventpilot_document_deliveries (
  id bigserial primary key,
  document_id uuid not null references public.eventpilot_documents(id) on delete cascade,
  channel text not null check (channel in ('email', 'download', 'print', 'link')),
  recipient text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'bounced')),
  error text,
  provider_message_id text,
  sent_by text,
  sent_at timestamptz not null default now()
);

create index if not exists eventpilot_document_deliveries_doc_idx
  on public.eventpilot_document_deliveries (document_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- Allocates the next document number atomically.
-- Format: PREFIX + YYYY + '-' + MM + NNN, counter resetting each month.
-- Example: INV2026-07001
-- ---------------------------------------------------------------------------
create or replace function public.eventpilot_next_doc_number(
  p_scope text,
  p_doc_type text,
  p_issue_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(p_issue_date, 'YYYY-MM');
  v_prefix text;
  v_next integer;
begin
  v_prefix := case p_doc_type
    when 'quotation' then 'QUO'
    when 'invoice' then 'INV'
    when 'tax_invoice_receipt' then 'TAX'
    when 'receipt' then 'REC'
    when 'credit_note' then 'CRN'
    else 'DOC'
  end;

  insert into public.eventpilot_document_counters (scope, doc_type, period, next_value)
  values (p_scope, p_doc_type, v_period, 1)
  on conflict (scope, doc_type, period) do nothing;

  -- Row-level lock: concurrent callers queue here rather than both reading
  -- the same value.
  update public.eventpilot_document_counters
     set next_value = next_value + 1
   where scope = p_scope and doc_type = p_doc_type and period = v_period
  returning next_value - 1 into v_next;

  return v_prefix
    || to_char(p_issue_date, 'YYYY') || '-' || to_char(p_issue_date, 'MM')
    || lpad(v_next::text, 3, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock everything down: RLS on, zero policies, no grants. Service role only.
-- ---------------------------------------------------------------------------
alter table public.eventpilot_console_settings enable row level security;
alter table public.eventpilot_client_companies enable row level security;
alter table public.eventpilot_document_counters enable row level security;
alter table public.eventpilot_documents enable row level security;
alter table public.eventpilot_document_deliveries enable row level security;

revoke all on public.eventpilot_console_settings from anon, authenticated;
revoke all on public.eventpilot_client_companies from anon, authenticated;
revoke all on public.eventpilot_document_counters from anon, authenticated;
revoke all on public.eventpilot_documents from anon, authenticated;
revoke all on public.eventpilot_document_deliveries from anon, authenticated;

revoke execute on function public.eventpilot_next_doc_number(text, text, date)
  from public, anon, authenticated;
