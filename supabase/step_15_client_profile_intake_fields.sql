-- Step 15: Client profile intake fields from client feedback.
-- Run after step_14_shared_client_profile_fields.sql.

alter table public.clients
  add column if not exists product_key text,
  add column if not exists additional_emails jsonb default '[]'::jsonb;

update public.clients
set additional_emails = '[]'::jsonb
where additional_emails is null;

alter table public.clients
  alter column additional_emails set default '[]'::jsonb;

select
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'clients'
  and column_name in ('product_key', 'additional_emails')
order by ordinal_position;
