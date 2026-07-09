# Patch Notes — Round 2 (2026-07-06)

Second hand-off, on top of the Round 1 note
([`2026-07-02-patch-notes-for-natanel.md`](./2026-07-02-patch-notes-for-natanel.md))
you already implemented. The GitHub repo is up to date — pull/diff from there and
mirror on the Supabase build. This round is all in **Users & Access** (the CAM
profile ↔ user ↔ sidebar relationship).

> Confirmed working on your side: the two panels are connected (CAM edits and the
> Manager view share one client record). Thanks. The items below are what we
> changed after that, while creating real team users.

Files: `src/App.jsx` (`ManagerOverview`, Users table), `src/domain/userStore.js`,
`src/domain/demoStore.js`. Verified end-to-end (Playwright) + `npm test` 334
passing, `vite build` clean, no new lint errors.

---

## 1. "CAM profile" is now a Yes/No toggle (was a name dropdown)

The old column made you pick an **existing** profile, so a brand-new CAM could
never get one. It's now a per-user toggle:

- **ON** → a `cam_profile` is created (named after the user) and linked
  (`users.cam_profile_id`). The profile **shows in the left sidebar** and **can
  be assigned clients**.
- **OFF** → the `cam_profile` is deleted and unlinked (no sidebar, no clients).
  If it still has clients, the manager is warned they'll be left unassigned.
- **Manager** users show `—` (no CAM profile — managers aren't CAMs).

This replaces Round 1's "auto-create on add" note: the toggle is the model now.

**DB:** treat the CAM profile as a 1:1 row for a CAM user. Toggle = create/remove
that `cam_profiles` row (it drives sidebar visibility + client-assignment
eligibility). `client_assignments` continue to point at the `cam_profile`.

## 2. New: employee Status (Active / Inactive)

New per-user field `status` (`Active` | `Inactive`), toggled from the Users table.

- **Inactive** → the employee is **hidden from the left sidebar / CAM roster**,
  but **stays in the Users list**, dimmed and badged `Inactive`. Deactivating is
  reversible; it is not a delete.
- **Active** → normal, shows in the sidebar.

**DB:** add `users.status` (default `Active`). Sidebar/roster queries filter to
`status = 'Active'`; the Users admin list shows everyone regardless.

## 3. Delete removes the person everywhere

Deleting a CAM user now also deletes their linked `cam_profile`, so they no
longer linger in the sidebar (previous bug: only the login row was removed).
Warn if the CAM still has assigned clients before deleting.

**DB:** delete should cascade `user` → `cam_profile` → clean up
`client_assignments` (or reassign first).

## 4. Small addition — prop firm name

The `client.propFirms[]` shape gained a **`name`** field (e.g. Apex, TopStep)
alongside `connection` (`Tradovate` | `Rithmic`), `login`, `password`. So the
full shape is `{ id, name, connection, login, password }`.

## 5. Unassigned clients — auto-unassign on CAM delete + manager flag

When a CAM is deleted (employee no longer working), their clients now
**immediately become unassigned** (they belong to no CAM). To make that
followable:

- The **Manager Operations view shows a red banner**: "N clients unassigned — no
  CAM assigned. Reassign in the Client roster below," with the client names.
  Implemented in `ManagerOverview` (`unassignedClients` memo + banner).
- The existing **Client roster** already lists each client's CAM (or
  `Unassigned`) and lets the manager reassign via the dropdown — that's where
  they clear the backlog.

**DB:** `client_assignments` should simply have no row for an unassigned client
(or `cam_profile_id = NULL`). The manager flag = count of clients with no active
assignment.

## 6. Bug to validate (deployed build) — unassigned clients throw a DB error

When a client lands in the **Unassigned** bucket (no CAM), the deployed app
reports a **database error**. Unassigned must be a **valid state**, not an error:
make `clients.cam_profile_id` / the `client_assignments` link **nullable**, and
make sure list/join queries handle a missing CAM (LEFT JOIN, null-safe) instead
of failing. Please validate how clients with no CAM are connected.

---

## Summary of the model (for reference)

- **role** (`Manager` | `CAM`) = permissions.
- **CAM profile** (toggle) = is this person an active, client-carrying CAM shown
  in the sidebar.
- **status** (`Active` | `Inactive`) = employed/active vs deactivated (hidden from
  sidebar, still listed).
- **delete** = remove from everywhere (user + cam_profile + assignments cleanup).

We're moving into beta/production testing from here. If we hit anything else
during real use, we'll drop another dated patch note in this folder.
