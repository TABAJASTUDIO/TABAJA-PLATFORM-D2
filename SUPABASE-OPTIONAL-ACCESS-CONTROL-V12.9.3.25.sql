-- TABAJA SOLUTION V12.9.3.25
-- OPTIONAL / MANUAL ONLY. DO NOT RUN AUTOMATICALLY.
-- Purpose: add the three requested paid-feature flags (and preserve the existing NFC/Batch flags)
-- plus allow the fixed Cloud Owner UID to read/update existing companies through RLS.
-- This is additive: no DELETE, DROP, data recreation, or ID changes.

alter table public.companies add column if not exists feature_nfc boolean not null default false;
alter table public.companies add column if not exists feature_batch boolean not null default false;
alter table public.companies add column if not exists feature_templates boolean not null default false;
alter table public.companies add column if not exists feature_print_quality boolean not null default false;
alter table public.companies add column if not exists feature_zebra boolean not null default false;

-- Cloud Owner can see all existing companies in Company Manager.
drop policy if exists "tabaja cloud owner reads all companies" on public.companies;
create policy "tabaja cloud owner reads all companies" on public.companies
for select using (
  auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid
  or public.is_company_member(id)
  or owner_user_id = auth.uid()
);

-- Cloud Owner can change company status/feature flags. Existing company owners retain their update right.
drop policy if exists "tabaja cloud owner updates companies" on public.companies;
create policy "tabaja cloud owner updates companies" on public.companies
for update using (
  auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid
  or owner_user_id = auth.uid()
)
with check (
  auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid
  or owner_user_id = auth.uid()
);
