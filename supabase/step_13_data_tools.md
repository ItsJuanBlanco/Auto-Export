# Step 13 - DB-Safe Export/Import

This step does not require a new SQL migration.

## What Was Added

- Manager -> Data Tools panel.
- Supabase JSON export through `/api/admin/data-export`.
- Client directory CSV export from the current Supabase-loaded state.
- Client directory CSV import into Supabase.
- Audit log entries for data export and client CSV import.

## Export Rules

The JSON export includes operational tables such as clients, assignments, accounts, imports, flags, tasks, reports, SOP data, and audit logs.

The export intentionally excludes:

- `client_credentials`

Credentials should not be included in portable admin exports until server-side encryption is finalized.

## Client CSV Import Columns

Supported columns:

```text
name, cam, stage, email, phone, timezone, propFirm, messenger, notes
```

Notes:

- `name` is required.
- `cam` can be a CAM display name or CAM profile id.
- Existing client names are skipped.
- Duplicate names inside the same CSV are skipped.

## Local Testing

Use `localhost:3000` through `vercel dev` because `/api/admin/data-export` is a server route.

1. Login as Manager.
2. Open Manager -> Data Tools.
3. Click Export JSON.
4. Confirm the downloaded JSON has `excludedTables: ["client_credentials"]`.
5. Export Clients CSV.
6. Edit/add one new row.
7. Import the CSV.
8. Confirm the client appears in Supabase and Manager sidebar.
9. Open Manager -> Audit Logs and confirm export/import actions are recorded.
