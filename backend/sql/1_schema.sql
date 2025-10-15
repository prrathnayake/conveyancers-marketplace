-- Core tables
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  role text check (role in ('customer','conveyancer','admin')) not null,
  email text unique not null,
  phone text,
  state text,
  kyc_status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists conveyancer_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  licence_number text,
  licence_state text,
  verified boolean default false,
  hourly_rate numeric,
  fixed_fee_options jsonb default '[]'::jsonb,
  specialties text[],
  years_experience int,
  insurance_policy text,
  insurance_expiry date
);

create table if not exists licences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references conveyancer_profiles(user_id) on delete cascade,
  provider text, status text, checked_at timestamptz, expiry date
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references users(id),
  conveyancer_id uuid references users(id),
  state text,
  property_type text,
  status text default 'quote_pending',
  created_at timestamptz default now()
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  name text, amount_cents int not null, due_date date, status text default 'pending'
);

create table if not exists escrow_payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  milestone_id uuid references milestones(id),
  amount_authorised_cents int, amount_held_cents int, amount_released_cents int,
  provider_ref text, status text, created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  from_user uuid references users(id),
  content text, attachments jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  doc_type text, url text, checksum text, uploaded_by uuid references users(id),
  version int default 1, created_at timestamptz default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) unique,
  by_user uuid references users(id),
  rating int check (rating between 1 and 5),
  text text, created_at timestamptz default now()
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  milestone_id uuid references milestones(id),
  reason text, evidence_urls jsonb default '[]', status text default 'open', created_at timestamptz default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor uuid, action text, subject text, details jsonb, ip text, created_at timestamptz default now()
);
