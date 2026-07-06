-- Step 20: Per-CAM create/delete client permissions.
-- Run after step_19_intake_import.

alter table public.cam_profiles
  add column if not exists can_manage_clients boolean not null default false;

comment on column public.cam_profiles.can_manage_clients is
  'When true, this CAM can create and deactivate clients from the CAM workspace. Managers always retain full permissions.';

update public.cam_profiles
set can_manage_clients = false
where can_manage_clients is null;

select
  legacy_key,
  name,
  role_title,
  status,
  can_manage_clients
from public.cam_profiles
order by name;
