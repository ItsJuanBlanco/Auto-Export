-- Step 11 - Report history persistence support
-- The reports table already exists in cam_crm_schema.sql.
-- This step only adds safe indexes and verification queries for generated reports.

create index if not exists idx_reports_client_created
  on public.reports(client_id, created_at desc);

create index if not exists idx_reports_client_date_type
  on public.reports(client_id, report_date desc, report_type);

-- Verification 1: recent saved reports.
select
  r.id,
  c.name as client_name,
  r.report_type,
  r.report_date,
  r.created_at,
  r.content->>'title' as title
from public.reports r
join public.clients c on c.id = r.client_id
order by r.created_at desc
limit 20;

-- Verification 2: report counts by client.
select
  c.name as client_name,
  r.report_type,
  count(*) as report_count,
  max(r.created_at) as latest_saved_at
from public.reports r
join public.clients c on c.id = r.client_id
group by c.name, r.report_type
order by latest_saved_at desc;
