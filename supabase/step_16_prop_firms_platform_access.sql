-- Step 16: Multiple prop firms and NinjaTrader password.
-- Run after step_15_client_profile_intake_fields.sql.

alter table public.client_credentials
  add column if not exists nt_password_encrypted text;

create table if not exists public.client_prop_firms (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  firm_name text,
  connection text not null default 'Tradovate' check (connection in ('Tradovate', 'Rithmic')),
  login text,
  password_encrypted text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_client_prop_firms_client_order
  on public.client_prop_firms(client_id, sort_order, created_at);

-- One-time migration from the previous single prop firm credential fields.
insert into public.client_prop_firms (
  client_id,
  firm_name,
  connection,
  login,
  password_encrypted,
  sort_order,
  updated_at
)
select
  cc.client_id,
  nullif(c.prop_firm, ''),
  'Tradovate',
  nullif(cc.firm_login, ''),
  nullif(cc.firm_password_encrypted, ''),
  0,
  now()
from public.client_credentials cc
join public.clients c on c.id = cc.client_id
where (nullif(c.prop_firm, '') is not null
   or nullif(cc.firm_login, '') is not null
   or nullif(cc.firm_password_encrypted, '') is not null)
  and not exists (
    select 1
    from public.client_prop_firms cpf
    where cpf.client_id = cc.client_id
  );

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'client_credentials' and column_name = 'nt_password_encrypted')
    or table_name = 'client_prop_firms'
  )
order by table_name, ordinal_position;
