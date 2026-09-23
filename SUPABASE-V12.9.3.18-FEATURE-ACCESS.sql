-- Run once in Supabase SQL Editor to enable Admin-controlled access for the three protected modules.
alter table public.companies add column if not exists feature_templates boolean not null default false;
alter table public.companies add column if not exists feature_print_quality boolean not null default false;
alter table public.companies add column if not exists feature_zebra boolean not null default false;

-- Tabaja Cloud Admin may update customer feature access.
drop policy if exists "tabaja admin updates companies" on public.companies;
create policy "tabaja admin updates companies" on public.companies
for update using (auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid)
with check (auth.uid() = '74cdabd7-4fb6-4016-bf68-cfac6bb17c14'::uuid);
