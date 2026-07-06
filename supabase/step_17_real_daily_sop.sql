-- Step 17: Replace the Daily SOP template with the real CAM checklist.
-- Run after step_16_prop_firms_platform_access.sql.

begin;

insert into public.sop_templates (legacy_key, name, description, is_active, editable_by_role)
values (
  'cam-daily-v1',
  'Daily CAM Checklist',
  'Real CAM daily operating checklist from client feedback. Covers connections/data, algo configuration, accounts, and payout/evaluation levels.',
  true,
  'Manager'
)
on conflict (legacy_key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  editable_by_role = excluded.editable_by_role,
  updated_at = now();

with template as (
  select id from public.sop_templates where legacy_key = 'cam-daily-v1'
),
seed_sections(section_key, title, time_label, emoji, display_order) as (
  values
    ('connections-data', 'Connections & Data', 'Pre-market / market open', '', 0),
    ('algo-configuration', 'Algo Configuration', 'Before enabling strategies', '', 1),
    ('accounts', 'Accounts', 'Daily account review', '', 2),
    ('payout-evaluation-levels', 'Payout & Evaluation Levels', 'Before close / payout review', '', 3)
)
insert into public.sop_sections (template_id, section_key, title, time_label, emoji, display_order, is_active)
select template.id, section_key, title, time_label, emoji, display_order, true
from template
cross join seed_sections
on conflict (template_id, section_key) do update set
  title = excluded.title,
  time_label = excluded.time_label,
  emoji = excluded.emoji,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

with template as (
  select id from public.sop_templates where legacy_key = 'cam-daily-v1'
),
seed_sections(section_key) as (
  values
    ('connections-data'),
    ('algo-configuration'),
    ('accounts'),
    ('payout-evaluation-levels')
)
update public.sop_sections ss
set is_active = false, updated_at = now()
from template
where ss.template_id = template.id
  and ss.section_key not in (select section_key from seed_sections);

with template as (
  select id from public.sop_templates where legacy_key = 'cam-daily-v1'
),
section_rows as (
  select s.id, s.section_key
  from public.sop_sections s
  join template t on t.id = s.template_id
),
seed_items(section_key, item_key, text, display_order) as (
  values
    ('connections-data', 'connections-data-0', 'Confirm charts are moving properly with no delayed-data indicators.', 0),
    ('connections-data', 'connections-data-1', 'If delayed data appears, disconnect all prop-firm connections and reconnect one at a time to identify the delayed connection.', 1),
    ('connections-data', 'connections-data-2', 'For new clients, verify the time zone is set to EST.', 2),
    ('algo-configuration', 'algo-configuration-0', 'Ensure the correct instrument is selected for each algo.', 0),
    ('algo-configuration', 'algo-configuration-1', 'Check whether the contract is current or needs rollover.', 1),
    ('algo-configuration', 'algo-configuration-2', 'Confirm the correct timeframe is set for each algo.', 2),
    ('algo-configuration', 'algo-configuration-3', 'Make sure there are no duplicated algos running.', 3),
    ('accounts', 'accounts-0', 'Verify all accounts are properly assigned.', 0),
    ('accounts', 'accounts-1', 'Confirm all funded accounts are active unless agreed as reserves with the client.', 1),
    ('accounts', 'accounts-2', 'Review account balances.', 2),
    ('payout-evaluation-levels', 'payout-evaluation-levels-0', 'Identify accounts at payout level (54k).', 0),
    ('payout-evaluation-levels', 'payout-evaluation-levels-1', 'Identify evaluations that have passed the challenge (53k).', 1),
    ('payout-evaluation-levels', 'payout-evaluation-levels-2', 'If an account is approaching payout within about $300-$500, reduce the stack to a single algo. Recommend OGX on a low-risk setting.', 2)
)
insert into public.sop_items (section_id, item_key, text, display_order, is_active)
select section_rows.id, seed_items.item_key, seed_items.text, seed_items.display_order, true
from seed_items
join section_rows on section_rows.section_key = seed_items.section_key
on conflict (section_id, item_key) do update set
  text = excluded.text,
  display_order = excluded.display_order,
  is_active = true,
  updated_at = now();

with template as (
  select id from public.sop_templates where legacy_key = 'cam-daily-v1'
),
section_rows as (
  select s.id, s.section_key
  from public.sop_sections s
  join template t on t.id = s.template_id
),
seed_items(section_key, item_key) as (
  values
    ('connections-data', 'connections-data-0'),
    ('connections-data', 'connections-data-1'),
    ('connections-data', 'connections-data-2'),
    ('algo-configuration', 'algo-configuration-0'),
    ('algo-configuration', 'algo-configuration-1'),
    ('algo-configuration', 'algo-configuration-2'),
    ('algo-configuration', 'algo-configuration-3'),
    ('accounts', 'accounts-0'),
    ('accounts', 'accounts-1'),
    ('accounts', 'accounts-2'),
    ('payout-evaluation-levels', 'payout-evaluation-levels-0'),
    ('payout-evaluation-levels', 'payout-evaluation-levels-1'),
    ('payout-evaluation-levels', 'payout-evaluation-levels-2')
)
update public.sop_items si
set is_active = false, updated_at = now()
from section_rows sr
where si.section_id = sr.id
  and not exists (
    select 1
    from seed_items seed
    where seed.section_key = sr.section_key
      and seed.item_key = si.item_key
  );

commit;

select
  st.name as template_name,
  count(distinct ss.id) filter (where ss.is_active) as active_sections,
  count(si.id) filter (where si.is_active) as active_items
from public.sop_templates st
left join public.sop_sections ss on ss.template_id = st.id
left join public.sop_items si on si.section_id = ss.id
where st.legacy_key = 'cam-daily-v1'
group by st.name;

select
  ss.display_order as section_order,
  ss.title as section_title,
  ss.time_label,
  si.display_order as item_order,
  si.item_key,
  si.text as item_text
from public.sop_templates st
join public.sop_sections ss on ss.template_id = st.id and ss.is_active = true
join public.sop_items si on si.section_id = ss.id and si.is_active = true
where st.legacy_key = 'cam-daily-v1'
order by ss.display_order, si.display_order;
