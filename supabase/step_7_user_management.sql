-- Step 7: User management support for the Manager Users & Access panel.
-- Run this before testing real user CRUD from the app.

alter table public.app_users
  add column if not exists status text not null default 'Active';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_status_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_status_check
      check (status in ('Active', 'Inactive'));
  end if;
end $$;

update public.app_users
set status = 'Active'
where status is null;

create index if not exists idx_app_users_status
  on public.app_users(status);

create or replace view public.auth_mapping_status as
select
  app.id,
  app.legacy_key,
  app.username,
  app.display_name,
  app.email,
  app.role,
  app.status,
  cp.legacy_key as cam_profile_key,
  cp.name as cam_profile_name,
  app.auth_user_id,
  case when app.auth_user_id is null then false else true end as linked_to_auth,
  auth.email_confirmed_at,
  auth.last_sign_in_at
from public.app_users app
left join public.cam_profiles cp on cp.id = app.cam_profile_id
left join auth.users auth on auth.id = app.auth_user_id
order by
  case app.role when 'Manager' then 0 else 1 end,
  app.display_name;

select
  username,
  display_name,
  email,
  role,
  status,
  auth_user_id
from public.app_users
order by
  case role when 'Manager' then 0 else 1 end,
  display_name;
