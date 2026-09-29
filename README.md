# Nib Incident Tracking System

A full-stack Nib SOC dashboard: dark-themed incident tracking
app with role-based access control, a live dashboard, a full incident
intake wizard, real file uploads, an audit trail, notifications, and team
chat.

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3), JWT auth, multer (file uploads)
- **Frontend:** React (Vite) + Tailwind CSS + Recharts + React Router

## Project structure

```
nib/
  backend/     Express API + SQLite database + uploaded files
  frontend/    React app (Vite)
```

## Getting started

### 1. Backend

```bash
cd backend
npm install
npm run seed # optional: create local demo users and cases
npm start
```

This starts the API on **http://localhost:4000** and creates the database schema.
Demo data is opt-in through `npm run seed` or `SEED_DEMO=true` in development.
Production startup and the seed command reject demo seeding when `NODE_ENV=production`.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` requests to
the backend on port 4000 (see `vite.config.js`).

### 3. Log in

After explicitly seeding a development database, these demo accounts are available
(all use password `password123`). Optional quick-fill buttons require
`VITE_SHOW_DEMO=true` in `frontend/.env.local` and are hidden in production builds:

| Username     | Role         | Can do |
|--------------|--------------|--------|
| `zemenu`     | SOC Analyst  | Create/view/edit cases, add notes, change status, search IOCs |
| `admin`      | SOC Admin    | Everything an analyst can, plus: reject cases, archive/restore, assign cases to users, manage user accounts |
| `iranalyst`  | IR Analyst   | Everything an analyst can, plus: reject cases |

Try logging in as different roles to see the UI adapt — e.g. only
`admin`/`iranalyst` see the **Reject** button on incidents, only
`admin` sees archive/restore and assignment controls, and the
**User Management** page only appears in the sidebar for `admin`.

## What's implemented

**Auth & access control**
- JWT login/session, protected routes, logout
- Real role-based permissions enforced **server-side** (not just hidden UI):
  - Rejecting a case requires `SOC_ADMIN` or `IR_ANALYST` — the rejection
    label (`"SOC Admin"` / `"IR Analyst"`) is derived from the caller's
    role server-side, never trusted from the request body
  - Archiving/restoring requires `SOC_ADMIN`
  - Assigning a case to a user requires `SOC_ADMIN`
  - The frontend also hides/disables these actions per role (`permissions.js`)
    as a UX nicety, but the backend is the actual enforcement point

**Dashboard**
- Stat cards, incident trend line chart, severity bar chart, attack type
  breakdown, attack origin map + top origins panel — all from live SQL
- **Working date-range filter** (All Time / 7d / 30d / 90d / This year) that
  re-queries the stats endpoint with real `from`/`to` bounds

**Incident Panel**
- "New Incidents" / "Rejected by SOC Admin" / "Rejected by IR Analyst" tabs
  with live counts and search
- **Working Reject action** (role-gated) — prompts for an optional reason,
  calls the reject endpoint, and the case moves to the correct tab

**Add New Incident wizard**
- 3-step flow (Incident Details → Add IOCs → Review) with real file uploads
  for IOC images and related documents

**File uploads**
- `POST /api/uploads` — multipart upload, 10MB/file limit, saved to disk
  under `backend/uploads/`
- **Authenticated downloads**: files are served from
  `GET /api/uploads/file/:filename`, which requires a valid JWT (via header
  or `?token=` query param, since `<img>`/`<a>` tags can't send custom
  headers). Unauthenticated requests get a 401; path-traversal attempts
  (`../`) are rejected with a 400.

**Case management**
- **Response deadlines** — SOC Admins can set or clear a manual due time on a case; open overdue and due-within-24-hours views are available from the dashboard and case list, and each case row shows its deadline
- Assigned users receive an in-app notification (and email if configured) once when a deadline enters the 24-hour window; overdue cases are also notified once if the server was offline as the deadline passed; changing a deadline enables a new reminder
- **Case List** — server-side search + pagination (15/page), filterable by
  status via the sidebar, and a "My Cases" view (cases assigned to you)
- **Case Detail**:
  - Edit mode for title, attack type, origin, asset, shift, summary,
    impact, and recommendations
  - Status changes, note-taking
  - Assignment dropdown (admin-only) with a live user list
  - Reject button (admin/IR-analyst-only)
  - Archive button (admin-only)
  - Real IOC records displayed with clickable, authenticated file attachments
  - **Activity History** — full audit trail of every status change,
    rejection, assignment, edit, archive/restore, with who did it and when
- **Archive** — view archived cases; restore is hidden from non-admins

**Notifications**
- Real notifications (not decorative): assigning a case notifies the
  assignee, rejecting a case notifies the assignee (if someone else did it)
- Working bell icon in the topbar with unread count, dropdown list, and
  click-to-open-case; polls every 15s

**Chat**
- Simple team chat (polls every 4s), persisted per user

**User Management** (admin-only, `/users`)
- Create new accounts with a role, change any user's role, reset passwords,
  activate/deactivate accounts
- Deactivating a user **immediately invalidates their active session** —
  every request re-checks the `active` flag in the DB, not just at login —
  so it's not just "block future logins," it's a real kill switch
- Admins can't deactivate their own account (guarded server-side)
- Deactivated users are automatically excluded from the case-assignment
  dropdown

**IOC Search** (`/iocs`, any role)
- Search every IOC ever recorded — by value, description, or threat intel
  source — across **all cases**, with a type filter and pagination
- Answers "which other cases mention this IP/domain/hash?" by querying the
  real `iocs` table (not the per-case JSON blob), with results linking
  straight back to the case that recorded each match

**Login rate limiting**
- In-memory limiter, keyed by IP+username: 5 failed attempts locks that
  specific account+source out for 15 minutes (429), even if the 6th attempt
  uses the correct password — a different username from the same source
  isn't affected
- Resets on server restart; not shared across multiple instances (fine for
  a single-process deploy, see the note below if you scale out)

## Data model additions

Beyond the original `cases`, `users`, `case_notes`, `chat_messages` tables:

- **`cases.due_at` / `cases.due_reminded_at`** — response deadline and once-per-deadline reminder marker
- **`users.active`** — soft-deactivation flag, checked on every
  authenticated request, not just at login
- **`case_history`** — audit trail: one row per `created` / `status_changed`
  / `rejected` / `assigned` / `edited` / `deadline_changed` / `archived` / `restored` event, with
  actor and timestamp
- **`iocs`** — real, queryable IOC records per case (type, value, threat
  intel source, count, percentage, description, attached images/documents),
  separate from the JSON blob kept on `cases.iocs` for wizard-payload
  compatibility
- **`notifications`** — per-user notifications with read/unread state

## API overview

| Method | Path                          | Role required        | Description |
|--------|--------------------------------|-----------------------|--------------|
| POST   | /api/auth/login                | — (rate limited)      | Login, returns JWT |
| GET    | /api/auth/me                   | any                   | Current user info |
| GET    | /api/cases                     | any                   | Paginated list (`?status=&archived=&assignedToMe=&q=&due=overdue%7Cupcoming&page=&pageSize=`) |
| GET    | /api/cases/stats               | any                   | Dashboard stats and deadline workload (`?from=&to=`) |
| GET    | /api/cases/lookup/users        | any                   | Active user list, for the assignment dropdown |
| GET    | /api/cases/:id                 | any                   | Case detail + notes + history + IOC records + assignee |
| POST   | /api/cases                     | any                   | Create a case (accepts full wizard payload incl. IOCs) |
| PATCH  | /api/cases/:id                 | any (archive/deadline: admin) | Update status/severity; `archived` and `due_at` require SOC_ADMIN |
| PUT    | /api/cases/:id                 | any                   | Edit case fields (title, summary, IPs, etc.) |
| POST   | /api/cases/:id/reject          | SOC_ADMIN, IR_ANALYST | Reject a case; label derived from caller's role |
| POST   | /api/cases/:id/assign          | SOC_ADMIN             | Assign/unassign a case; notifies the assignee |
| POST   | /api/cases/:id/notes           | any                   | Add a note |
| POST   | /api/cases/:id/links           | any                   | Link this case to another related case |
| DELETE | /api/cases/:id/links/:linkId   | any                   | Remove a link |
| PATCH  | /api/auth/me                   | any                   | Set your own email / notification preference |
| GET    | /api/chat                      | any                   | List chat messages |
| POST   | /api/chat                      | any                   | Send a chat message |
| GET    | /api/notifications              | any                   | List your notifications + unread count |
| POST   | /api/notifications/:id/read     | any                   | Mark one notification read |
| POST   | /api/notifications/read-all     | any                   | Mark all read |
| POST   | /api/uploads                   | any                   | Upload files (multipart, field name `files`) |
| GET    | /api/uploads/file/:filename    | any (token via header or `?token=`) | Download an uploaded file |
| GET    | /api/users                     | SOC_ADMIN             | List all users (incl. inactive) |
| POST   | /api/users                     | SOC_ADMIN             | Create a user |
| PATCH  | /api/users/:id                 | SOC_ADMIN             | Change role/active/password |
| GET    | /api/users/email-log           | SOC_ADMIN             | Audit what the app has attempted to email |
| GET    | /api/iocs                      | any                   | Search IOCs across all cases (`?q=&type=&page=&pageSize=`) |
| GET    | /api/iocs/types                | any                   | Distinct IOC types recorded, for a filter dropdown |

All routes above except `/api/auth/login` require `Authorization: Bearer <token>`.

## Response deadlines

SOC Admins can set or clear a response deadline from a case detail page. Due
values are stored in UTC. The dashboard shows counts and the five nearest
cases that are overdue or due within 24 hours; case-list filters show all
matching cases. Completed, rejected, and archived cases are excluded.

The backend checks for reminders when it starts and once an hour thereafter.
It notifies the active assignee once when a case enters its final 24 hours;
if the server was offline at the deadline, it sends the overdue notice when it
returns. Changing or clearing a deadline resets the reminder state. In-app
notifications always work; email follows the existing SMTP and user preference
settings. Reminder scheduling runs in this single backend process, so run one
instance of the API to avoid duplicate scheduler work.

## Email notifications

Case assignment, rejection, and new **Critical**-severity cases now trigger
real notification emails, not just in-app ones:

- `backend/services/email.js` uses real SMTP if `SMTP_HOST` is set (see
  `backend/.env.example`), otherwise safely logs what *would* have been
  sent to an `email_log` table — so the app works with zero mail config,
  and is one env var away from real delivery
- Any user can set their own contact email and opt in/out of email
  notifications from **My Profile** (click your avatar in the top bar)
- Creating a **Critical**-severity case emails every active SOC Admin
- Admins can review everything the app has attempted to send from the
  **Email Log** section at the bottom of **User Management**

## Case linking

From any case's detail page, you can link it to another related case (e.g.
same threat actor, same campaign) with an optional note explaining why.
Links are bidirectional — linking A to B makes both cases show the
relationship — and every link/unlink is recorded in that case's Activity
History.

## Moving to Postgres

`backend/postgres/` has a tested path for moving your data off SQLite:

- `schema.sql` — a Postgres translation of the schema in `db.js` (booleans,
  JSONB, timestamps, and enforced foreign keys, plus indexes worth having
  under real concurrent load)
- `migrate-data.js` — reads every row out of `nib.db` and inserts it into
  Postgres, preserving IDs so foreign keys stay valid; safe to re-run

**Important scope note:** this moves your *data*, not the running app. The
Express routes still talk to SQLite via `better-sqlite3`, which is
synchronous — swapping to the `pg` driver (promise-based) means converting
every route's query calls to `async`/`await`, which is real, mechanical
work across every file in `routes/`. That's a reasonable next step, but a
deliberately separate one from moving your data — see
`backend/postgres/README.md` for the full picture and exact steps.

## Notes / next steps if you want to extend it further

- Convert the routes to run on Postgres full-time (see above) — the data
  migration path is ready; the route-level async conversion isn't done yet
- Add WebSockets (Socket.io) for live chat/notifications instead of polling
- **File storage in production:** uploads currently save to local disk,
  which works for a single server but won't persist across
  redeploys/containers or scale across multiple instances. Swap the
  multer `diskStorage` in `routes/uploads.js` for an S3-compatible bucket
  (multer-s3 or a presigned-URL flow).
- Add a real geographic map (e.g. react-simple-maps) in place of the
  stylized SVG placeholder in `Dashboard.jsx`
- **Rate limiting is in-memory** — fine for a single-process demo, but
  resets on restart and isn't shared across instances. A multi-instance
  production deploy should use a shared store (Redis) instead.
- No password reset / "forgot password" self-service flow — only an admin
  can reset a password via the User Management page
- Email delivery is fire-and-forget with no retry — a failed send is
  logged to `email_log` with the error, but nothing automatically retries it

## Reliability checks and deployment configuration

Run `npm test` in `backend` for isolated HTTP workflow, permission, and configuration tests.
Run `npm test` and `npm run build` in `frontend` for session handling, API recovery,
pagination checks, and the production build. Backend tests use in-memory databases,
a temporary upload directory, and offline email logging, leaving existing records
untouched and sending no real email.

The workflow suite exercises incident/IOC persistence, edits and notes, assignment,
rejection and archiving, notification ownership, search and dashboard filters,
deadline permissions and reminder deduplication, case linking, multipart uploads,
chat, account administration, and critical-incident alerts. An injected database
failure verifies that incident creation rolls back its case, IOCs, and history
together. Invalid IOC payloads and blank titles are rejected before creation;
assignment requires an active user.

See `test_workflow.txt` for the coverage boundary and remaining browser checks.
The separate browser suite checks core browser workflows. The delivery/restart
suite verifies SMTP against a loopback receiver and scheduler behavior across
real process restarts; external-provider delivery and actual hour-long timing
are outside this automated coverage. `UPLOAD_DIR` optionally selects an existing upload
directory; the default remains `backend/uploads`.

Set `NODE_ENV=production` and provide a randomly generated `JWT_SECRET` of at
least 32 characters (for example, generate one with `openssl rand -hex 32`).
Missing, short, and documented placeholder secrets are rejected at startup.
Do not enable `SEED_DEMO` in production. Existing demo accounts are not deleted
by this change; remove or secure them before using an existing demo database in production.
`DATABASE_PATH` optionally selects a database file; the default remains `backend/nib.db`.

Authorization reads each user's current role and active status on every request.
Case rejection must use the dedicated reject endpoint, including for admins.
The frontend clears the session on authenticated API 401 responses or the
`ACCOUNT_DEACTIVATED` code, while ordinary permission-denied responses keep the
session intact. User details refresh on startup and window focus.

## Browser workflow checks

From the project root, run `npm install`, then `npx playwright install chromium`.
Run `npm run test:e2e` for browser checks or `npm run verify` for backend tests,
frontend tests, the production build, and browser checks together.

Browser tests start isolated services on ports 4015 and 5175, create temporary
accounts/database/uploads, and disable SMTP. They cover sign-in and refresh,
admin-route protection, incident validation and creation with an attachment,
notes and status updates, search persistence, admin assignment and deadlines,
and mobile navigation and page width. Failed checks retain screenshots and
traces under `test-results/`. The development proxy can be overridden with
`API_PROXY_TARGET`; its default remains port 4000.

The Nib rename changes browser session keys, so existing users must sign in
again. The SQLite default is now `backend/nib.db`. In this workspace the existing
database was copied with SQLite's backup API and integrity-checked; the original
is retained as `backend/nib-before-rename.db` with its sidecar files. The outer
workspace directory retains its existing name so open IDE paths remain valid.

## Email and scheduler verification

`npm --prefix backend test` includes `backend/test/delivery-restart.test.js`.
It starts the real backend with a temporary on-disk database and a loopback-only
SMTP receiver. It verifies accepted mail and its content, SMTP rejection logging,
in-app notification retention after email failure, restart deduplication,
startup catch-up for cases that became overdue offline, and recurring delivery
without restarting the server. No messages leave the machine.

The test checks that the server registers a 3,600,000 ms interval, then speeds
that interval up with a test-only preload. Production scheduling is unchanged.
No hour-long wall-clock wait is claimed. SMTP authentication, TLS, and delivery
to an external inbox still require verification with the deployment's mail
provider. Failed email sends remain logged without automatic retry; in-app
reminders persist independently.
