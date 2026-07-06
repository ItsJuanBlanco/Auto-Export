-- Step 12 - Audit logs support
-- The audit_logs table already exists in cam_crm_schema.sql.
-- This step adds safe indexes and verification queries for manager visibility.

create index if not exists idx_audit_logs_created_at
  on public.audit_logs(created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs(entity_type, entity_id, created_at desc);

create index if not exists idx_audit_logs_user
  on public.audit_logs(user_id, created_at desc);

-- Verification 1: latest audit entries.
select
  al.created_at,
  au.display_name as user_name,
  au.email as user_email,
  al.entity_type,
  al.entity_id,
  al.action,
  al.after_data
from public.audit_logs al
left join public.app_users au on au.id = al.user_id
order by al.created_at desc
limit 50;

-- Verification 2: action counts.
select
  action,
  count(*) as action_count,
  max(created_at) as latest_at
from public.audit_logs
group by action
order by latest_at desc;
