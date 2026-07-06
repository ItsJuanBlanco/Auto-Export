-- Step 10 - Remove seeded starter data
-- Run this only after you have confirmed no real client data uses these legacy keys.
--
-- Note:
-- This removes public.app_users rows for the old starter accounts.
-- Supabase Auth users are separate and must be removed/disabled from
-- Authentication -> Users if they should no longer exist.
-- If app_users becomes empty, the admin API bootstraps the currently signed-in
-- Auth user as the first Manager the next time Manager -> Users & Access loads.

delete from public.clients
where legacy_key in (
  'client-rome',
  'client-todd',
  'client-amanda',
  'client-blanco',
  'client-ed',
  'client-sarah-training'
);

delete from public.app_users
where legacy_key in (
  'user-manager',
  'user-pedro',
  'user-amanda',
  'user-juan',
  'user-ed',
  'user-sarah'
);

delete from public.cam_profiles
where legacy_key in (
  'am-pedro',
  'am-amanda',
  'am-juan',
  'am-ed',
  'am-sarah'
);
