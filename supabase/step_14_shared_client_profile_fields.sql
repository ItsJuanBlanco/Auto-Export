-- Step 14 - Shared client profile fields
-- Ensures CAM and Manager views read/write the same client profile columns.

alter table public.clients
  add column if not exists country text,
  add column if not exists start_date date,
  add column if not exists preferred_channel text,
  add column if not exists language text;

-- Verification: these columns should exist.
select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clients'
  and column_name in ('country', 'start_date', 'preferred_channel', 'language')
order by column_name;
