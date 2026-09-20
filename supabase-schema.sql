-- Tabaja Card Designer V10.1 Cloud Foundation
-- Run this once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  phone text,
  plan text not null default 'Professional Trial',
  status text not null default 'active' check (status in ('active','suspended','expired')),
  licence_expires_at timestamptz,
  max_users integer not null default 3,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','designer','viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  orientation text not null default 'landscape',
  front_json jsonb,
  back_json jsonb,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_code text,
  full_name text not null,
  job_title text,
  email text,
  phone text,
  photo_url text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.print_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id),
  project_id uuid references public.projects(id) on delete set null,
  quantity integer not null default 1,
  printer_name text,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.projects enable row level security;
alter table public.employees enable row level security;
alter table public.print_history enable row level security;

create or replace function public.is_company_member(target_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = target_company and user_id = auth.uid()
  );
$$;

create policy "members read own company" on public.companies
for select using (public.is_company_member(id) or owner_user_id = auth.uid());

create policy "users create owned company" on public.companies
for insert with check (owner_user_id = auth.uid());

create policy "owners update own company" on public.companies
for update using (owner_user_id = auth.uid());

create policy "members read memberships" on public.company_members
for select using (user_id = auth.uid() or public.is_company_member(company_id));

create policy "owner creates initial membership" on public.company_members
for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.companies c where c.id = company_id and c.owner_user_id = auth.uid()
  )
);

create policy "members read projects" on public.projects
for select using (public.is_company_member(company_id));
create policy "members create projects" on public.projects
for insert with check (public.is_company_member(company_id));
create policy "members update projects" on public.projects
for update using (public.is_company_member(company_id));
create policy "members delete projects" on public.projects
for delete using (public.is_company_member(company_id));

create policy "members read employees" on public.employees
for select using (public.is_company_member(company_id));
create policy "members manage employees" on public.employees
for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create policy "members read print history" on public.print_history
for select using (public.is_company_member(company_id));
create policy "members add print history" on public.print_history
for insert with check (public.is_company_member(company_id));
