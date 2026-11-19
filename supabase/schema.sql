-- Shanta Life Agent Hub — auth schema (PREPARED LOCALLY ONLY).
--
-- DO NOT RUN against any live database. This file is the Milestone 1
-- preparation for the future dedicated Hub auth Supabase project. When
-- Milestone 2 wires the Supabase provider, this schema is reviewed with
-- Mahadi first and then applied to the NEW Hub project only — never to the
-- LeadFlow or Learning Hub projects, which keep their own user tables.
--
-- Design notes:
-- - Identity is the Employee ID from the HR roster, shared with LeadFlow and
--   Learning Hub. No new username.
-- - Credentials are verified server-side (Edge Function) against
--   credential_hash. The browser never sees the hash.
-- - Lockout and must-change behaviour mirror the Learning Hub contract:
--   5 wrong attempts -> 15 minute lockout; temporary credentials force a
--   first-login change.
-- - Sessions are recorded so sign-out can revoke everywhere and admins can
--   see active sessions. The JWT itself is stateless; this table is for
--   revocation/audit, not for per-request lookups.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users
create table if not exists hub_users (
  employee_id text primary key,
  -- Same Employee ID / Code as the HR roster, LeadFlow and Learning Hub.
  full_name text not null,
  role text not null check (role in ('employee', 'team_lead', 'manager', 'admin')),
  -- 'team_lead' is automatic for anyone with >= 1 subordinate; kept as a
  -- stored role here so the Hub does not need the reporting tree at login.
  credential_hash text not null,
  -- bcrypt/argon2 hash of the PIN/password. Set by admin (temporary) or by
  -- the user at first login. NEVER store plaintext.
  must_change_credential boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table hub_users is 'Hub sign-in identities, keyed by HR Employee ID. One row per person.';

-- ------------------------------------------------------------- sessions
create table if not exists hub_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references hub_users (employee_id) on delete cascade,
  -- JWT ID (jti) of the issued token, so a session can be revoked by token.
  token_jti text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- Device hint for the admin console (e.g. 'Android · Chrome'). Free text.
  device_label text,
  created_at timestamptz not null default now()
);

create index if not exists hub_sessions_employee_id_idx
  on hub_sessions (employee_id);

comment on table hub_sessions is 'Issued SSO tokens, for revocation and audit. Tokens expire after 1 hour.';

-- ---------------------------------------------------------- audit log
create table if not exists hub_auth_audit (
  id bigint generated always as identity primary key,
  employee_id text,
  event text not null check (event in (
    'sign_in_ok', 'sign_in_wrong_pin', 'sign_in_locked',
    'sign_in_unknown_user', 'credential_changed',
    'session_revoked', 'account_locked', 'account_unlocked'
  )),
  created_at timestamptz not null default now()
);

create index if not exists hub_auth_audit_employee_id_idx
  on hub_auth_audit (employee_id);

comment on table hub_auth_audit is 'Auth events for security review. No credentials or tokens stored here.';

-- ------------------------------------------------- updated_at trigger
create or replace function hub_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hub_users_touch on hub_users;
create trigger hub_users_touch
  before update on hub_users
  for each row execute function hub_touch_updated_at();

-- ------------------------------------------------- row level security
-- The Hub backend talks to this project through an Edge Function with the
-- service-role key. Direct client access is denied: RLS is ON with no
-- permissive policies, so anon/authenticated keys read nothing.
alter table hub_users enable row level security;
alter table hub_sessions enable row level security;
alter table hub_auth_audit enable row level security;

-- No policies are created on purpose: only the service role (Edge Function)
-- bypasses RLS. If a future need requires client reads, add a narrow policy
-- then — never open these tables broadly.
