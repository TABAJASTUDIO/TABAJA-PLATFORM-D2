-- TABaja Solution FIX 5.5
-- Run ONCE in Supabase SQL Editor before testing 5.5.
-- Purpose: create the authenticated user's company + initial owner membership
-- atomically, without weakening the existing RLS policies.

create or replace function public.provision_my_company(
  p_name text,
  p_country text default '',
  p_phone text default '',
  p_trial_started_at timestamptz default now(),
  p_trial_expires_at timestamptz default (now() + interval '5 days')
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_meta jsonb;
  v_name text;
  v_country text;
  v_phone text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- FIX 5.5.2: confirmation/sign-in can occasionally return client user metadata
  -- later than the authenticated session. Recover the original signup fields from
  -- auth.users on the database side so first sign-in can still provision safely.
  select coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_meta
    from auth.users u
   where u.id = v_user;

  v_name := coalesce(nullif(btrim(p_name), ''), nullif(btrim(v_meta->>'company'), ''));
  v_country := coalesce(nullif(btrim(p_country), ''), nullif(btrim(v_meta->>'country'), ''), '');
  v_phone := coalesce(nullif(btrim(p_phone), ''), nullif(btrim(v_meta->>'phone'), ''), '');

  if v_name is null then
    raise exception 'Company name is missing from signup metadata. Please create the account again.';
  end if;

  -- Idempotent: if this user already belongs to a company, return it.
  select cm.company_id
    into v_company
    from public.company_members cm
   where cm.user_id = v_user
   order by cm.created_at asc
   limit 1;

  if v_company is not null then
    return v_company;
  end if;

  insert into public.companies (
    name, country, phone, plan, status,
    trial_started_at, trial_expires_at,
    feature_nfc, feature_batch, feature_qr, feature_barcode, feature_elements,
    max_users, owner_user_id
  ) values (
    v_name, v_country, v_phone,
    'Standard · 5-Day Trial', 'active',
    coalesce(p_trial_started_at, now()),
    coalesce(p_trial_expires_at, now() + interval '5 days'),
    false, false, false, false, false,
    3, v_user
  )
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, v_user, 'owner')
  on conflict (company_id, user_id) do nothing;

  return v_company;
end;
$$;

revoke all on function public.provision_my_company(text,text,text,timestamptz,timestamptz) from public;
grant execute on function public.provision_my_company(text,text,text,timestamptz,timestamptz) to authenticated;
