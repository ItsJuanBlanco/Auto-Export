# Step 19: Intake CSV Import

No SQL is required for this step. The required fields already exist from:

- `step_15_client_profile_intake_fields.sql`
- `step_16_prop_firms_platform_access.sql`

## Flow

1. Set `GOOGLE_SHEET_CSV_URL` in local/Vercel env.
2. Restart `vercel dev` or redeploy so the server route can read the env value.
3. Open Manager -> Data Tools.
4. Click `Fetch Google Sheet`.
5. Review the parsed row preview, then click `Import`.
6. New rows are created as clients with `stage = Onboarding`.
7. Clients are imported without CAM assignment unless assigned later by Manager.
8. Manager can assign those clients from the existing client management roster.

Manual fallback: export the Google Sheet as CSV and use `Import intake CSV`.

Duplicate protection checks existing CRM clients by:

- client name
- primary email

Rows already present in Supabase are shown as duplicates in the preview and are
skipped during import.

Google Sheet fetch/import actions are written to `audit_logs` with the Manager
identity, new row count, and duplicate count.

## Google Sheet Route Hook

The API route is ready at:

```text
GET /api/admin/intake-sheet
```

It requires a Manager session token and reads:

```text
GOOGLE_SHEET_CSV_URL
```

If the env var is not set, it returns `501` with setup instructions. Set it to a
published Google Sheet CSV export URL when the live Sheet connection is ready.

Example:

```text
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=0
```

## Intake Mapping

| Intake column | App field |
| --- | --- |
| `First Name` + `Last Name` | Client name / full name |
| `Whop Registration Email` | Primary email |
| `VPS IP Address` | VPS IP |
| `VPS Username` | VPS username |
| `VPS Password` | VPS password |
| `Preferred Communication Time` | Client notes |
| `Special Instructions or Notes` | Client notes |
| `Discord Username` | Discord username |
| `NT8 username` | NinjaTrader username |
| `NT8 password` | NinjaTrader password |
| `Are you using Tradovate or Rithmic?` | Prop firm connection |
| `Tradovate credentials` | Prop firm login/password text |

## Verification

```sql
select
  c.name,
  c.stage,
  c.email,
  c.messenger,
  c.timezone,
  c.notes,
  ca.id as assignment_id
from public.clients c
left join public.client_assignments ca on ca.client_id = c.id
where c.stage = 'Onboarding'
order by c.created_at desc;
```

```sql
select
  c.name,
  cc.ip,
  cc.username,
  cc.password_encrypted,
  cc.nt_login,
  cc.nt_password_encrypted
from public.client_credentials cc
join public.clients c on c.id = cc.client_id
order by cc.updated_at desc;
```

```sql
select
  c.name,
  cpf.firm_name,
  cpf.connection,
  cpf.login,
  cpf.password_encrypted
from public.client_prop_firms cpf
join public.clients c on c.id = cpf.client_id
order by cpf.updated_at desc;
```
