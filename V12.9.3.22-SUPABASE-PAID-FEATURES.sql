-- V12.9.3.22 paid feature columns. Review before running in Supabase SQL Editor.
-- This does not delete or recreate any company/customer data.
alter table public.companies add column if not exists feature_templates boolean not null default false;
alter table public.companies add column if not exists feature_quality boolean not null default false;
alter table public.companies add column if not exists feature_zebra boolean not null default false;
