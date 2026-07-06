# Step 8 - Client Management Migration

Goal: make client management persistent in Supabase instead of only changing local React state.

## Tables Used

- `clients`
  - Stores client identity, status, stage, profile fields, notes, pin state, and soft-delete marker.
- `client_assignments`
  - Connects each client to one or more CAM profiles.
- `client_credentials`
  - Stores VPS / NinjaTrader / prop firm login notes for each client.
- `price_checks`
  - Stores scheduled client price-check rows.

## Implementation Steps

1. Run `supabase/step_8_client_management.sql`.
   - Adds `price_checks.checked`.
   - Adds `price_checks.updated_at`.

2. Add Supabase helpers for:
   - create client with optional CAM assignment
   - update client profile, notes, pin state, and credentials
   - soft-delete client
   - transfer client owner assignment
   - replace client price checks

3. Wire frontend flows:
   - CAM sidebar `New client`
   - Manager `New client`
   - Manager client transfer
   - Credentials & Notes edits
   - Price Checks edits
   - Delete client button

4. Preserve local UI responsiveness:
   - update React state immediately
   - write to Supabase in the background
   - show an alert if Supabase write fails

5. Keep historical data safe:
   - client delete is soft delete by setting `status = 'Inactive'` and `deleted_at`
   - account/import/activity history remains in database

6. Verify manually:
   - create a client in Manager and refresh browser
   - create a client from CAM sidebar and refresh browser
   - edit profile/credentials/notes and refresh browser
   - add price-check rows and refresh browser
   - transfer client to another CAM and confirm sidebar changes after refresh
   - delete/deactivate client and confirm it no longer appears after refresh

## Current Status

- Schema already exists.
- Code wiring completed.
- `step_8_client_management.sql` still needs to be run before testing price-check checkbox persistence.
