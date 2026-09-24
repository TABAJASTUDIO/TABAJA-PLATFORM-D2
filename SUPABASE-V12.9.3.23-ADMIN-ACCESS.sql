-- Tabaja Solution V12.9.3.23
-- Safe additive migration: does NOT delete companies, users, memberships, projects or customer data.
alter table public.companies add column if not exists feature_nfc boolean not null default false;
alter table public.companies add column if not exists feature_batch boolean not null default false;
alter table public.companies add column if not exists feature_templates boolean not null default false;
alter table public.companies add column if not exists feature_quality boolean not null default false;
alter table public.companies add column if not exists feature_zebra boolean not null default false;
alter table public.companies add column if not exists trial_started_at timestamptz;
alter table public.companies add column if not exists trial_expires_at timestamptz;

-- Allow the fixed Tabaja Cloud owner account to see customer companies in Company Manager.
drop policy if exists "tabaja cloud admin reads all companies" on public.companies;
create policy "tabaja cloud admin reads all companies" on public.companies
for select using (auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid);

-- Allow that same owner to update paid-access fields/status from Company Manager later.
drop policy if exists "tabaja cloud admin updates all companies" on public.companies;
create policy "tabaja cloud admin updates all companies" on public.companies
for update using (auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid)
with check (auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid);
