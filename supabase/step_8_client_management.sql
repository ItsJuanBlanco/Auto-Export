-- Step 8 - Client management persistence support
-- Run this after the main schema if price checks already exist.

alter table public.price_checks
  add column if not exists checked boolean default false;

alter table public.price_checks
  add column if not exists updated_at timestamptz default now();
