-- V12.9.3.21 - run only when ready to persist the 3 new paid permissions in Supabase.
-- Additive only: no deletes, no data movement.
alter table public.companies add column if not exists feature_templates boolean not null default false;
alter table public.companies add column if not exists feature_quality boolean not null default false;
alter table public.companies add column if not exists feature_zebra boolean not null default false;
