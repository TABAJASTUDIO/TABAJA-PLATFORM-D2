-- FIX-4: optional QR Code and Barcode customer access.
-- Safe additive migration. Existing NFC/Batch data is untouched.

alter table public.companies
  add column if not exists feature_qr boolean not null default false,
  add column if not exists feature_barcode boolean not null default false;
