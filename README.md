# SchoolDesk

**SchoolDesk** is a multi-tenant school management SaaS (eSkooly-style) for Nigerian schools, colleges, tuition centres and academies. Every table is scoped by `schoolId`, so many schools share one deployment with hard tenant isolation. All money is NGN (₦) stored as integer kobo, and the demo school is **Crescent Dawn Group of Schools**, Ikeja, Lagos. The UI is a single-page app shell (hash-routed) with role-aware navigation, light/dark themes, and dedicated parent/student portals.

## Quick facts

| | |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 + shadcn/ui (New York) |
| Data & state | Prisma ORM 6 + SQLite (provider-portable to PostgreSQL) · TanStack Query/Table · Zustand · React Hook Form + Zod |
| Auth | `jose` HS256 JWT — 15-min access + 7-day rotating refresh tokens in httpOnly cookies · `@node-rs/argon2` password hashing |
| API | REST route handlers under `/api/v1` (no server actions) · OpenAPI 3.1 document · in-memory rate limiting · audit logging |
| Charts & motion | Recharts · framer-motion · next-themes (light/dark) |
| Currency / locale | NGN (₦), amounts stored as **integer kobo** · en-NG · Africa/Lagos |
| Status | Internal demo project — no licence file yet; all rights reserved by the project authors |

<!-- -----------------------------------------------------------------------
SCREENSHOTS — placeholder. Drop PNGs into /docs/screenshots and uncomment:

1. Login screen                    4. Fee invoice with payments & receipt
2. Admin dashboard (KPIs)          5. Broadsheet & printable report card
3. Students table + detail drawer  6. Parent portal overview

| ![Login](docs/screenshots/login.png) | ![Dashboard](docs/screenshots/dashboard.png) |
|---|---|
------------------------------------------------------------------------ -->

## Features by module

Everything below is implemented and served over the REST API.

- **Auth & RBAC** — school self-registration (creates school + admin), login/logout, 15-minute access tokens + 7-day rotating refresh tokens (httpOnly cookies, DB-backed revocation), change password, users CRUD, granular permission catalogue with wildcard matching and a role-permission matrix UI, audit entries on mutations, in-memory sliding-window rate limiting.
- **Academic setup** — sessions; terms (activate current); classes; sections; subjects; class-subjects with teacher assignment; lesson plans; bulk promotions at year end.
- **Admissions & students** — applicant pipeline with stage advance and convert-to-student (auto admission number, optional guardian login), student profiles with guardians, siblings-aware detail view, CSV import/export, student exits (graduation/transfer), printable branded ID cards.
- **Timetable & attendance** — period setup, slot assignment with **clash detection** (409 on conflict), class & teacher timetable grids, timetable copy, daily and per-period attendance with bulk marking, staff attendance, monthly attendance reports, dashboard attendance summary, **automatic notifications to portal-linked guardians** when a student is marked absent.
- **Fees & billing** — fee structures per class, invoices with bulk generation per class/term, instalments with automatic payment allocation (oldest unpaid first), discounts, in-app payment recording with auto-generated receipt numbers (`RCP-YYYY-######`), printable branded receipts, defaulters surfaced in the fees summary, income/expense ledger and accounts summary analytics.
- **Exams & grades** — exam types, exams with publish workflow, exam schedules, grading scales with bands and auto-grading, bulk marks entry per class-subject, broadsheet with totals/averages/positions, branded printable report cards.
- **Homework** — assignments with due dates, role-aware portal list (teacher posts / student sees due work), submissions and grading.
- **Portals** — role-aware `/portal/overview` for parents and students: attendance %, results, fees due, timetable, homework and announcements; parents drill into each child.
- **HR & payroll** — employee records (+ portal access grants), salary structures, payslip generation per period with full earnings/deductions breakdown, mark-paid posts ledger expenses, staff self-service view with leave requests and approval workflow.
- **Inventory & library** — stock items with reorder levels and low-stock flags, IN/OUT/ADJUST stock movements (restock alerts fire on crossing reorder level), suppliers; library catalogue, loans and returns with automatic fine calculation.
- **Communication** — announcements with audience targeting and publish workflow, event calendar, SMS/Email/WhatsApp templates, send with preview and delivery logs; pluggable drivers — **mock (default, status `SIMULATED`)**, Termii (SMS/WhatsApp) and SendGrid (email) — configured per school in settings; notification centre with fan-out and read receipts.
- **Dashboard & search** — KPI widget payloads and a global search endpoint.
- **Administration** — school profile and branches, school settings API (branding etc.), roles matrix UI, **API Explorer** view rendering the machine-readable OpenAPI document.
- **Reports & analytics** — enrollment, academic (exam averages, grade distribution, top students), financial (expected/collected/outstanding by class, expense categories, defaulters) and attendance analytics (daily trend, per-class rates, chronic absentees); saved report views; scheduled CSV exports with recipient notifications.
- **Audit log** — filterable, paginated trail of every mutation/login/export with before/after snapshots in a detail dialog.
- **School settings UI** — profile & branding editor (name, motto, contacts, brand colours with live preview), language selector (English/Hausa/Yoruba/Igbo starter packs) and in-app database backups (create, download, delete).

## Quick start

### Prerequisites

- **Node.js 20+** (or **Bun 1.1+** — the repo is developed with Bun; npm works fine)
- Git

### 1. Install & configure

```bash
git clone <repo-url> schooldesk && cd schooldesk
bun install          # or: npm install
# then create a .env file (see the table below)
```

Environment variables actually read by the code:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Prisma connection string. SQLite example: `"file:../db/custom.db"` (relative to `prisma/`) or an absolute path like `"file:/app/db/custom.db"` |
| `SD_JWT_ACCESS_SECRET` | ⚠️ prod | `schooldesk-dev-access-secret-change-me` | HS256 signing secret for access tokens — **set a strong random value outside development** |
| `SD_ACCESS_TTL` | — | `900` | Access token lifetime in seconds (15 min) |
| `SD_REFRESH_TTL` | — | `604800` | Refresh token lifetime in seconds (7 days) |
| `SEED_SCHOOL_NAME` | — | `Crescent Dawn Group of Schools` | Seed override |
| `SEED_SCHOOL_SHORT` | — | `CDG` | Seed override (used in admission number patterns) |
| `SEED_CURRENCY` | — | `NGN` | Seed override |

> There is no `db:seed` npm script — the seed is a TypeScript file run directly (see below). Refresh tokens are **opaque random strings** (48 random bytes) stored as SHA-256 hashes in the `RefreshToken` table — never JWTs.

### 2. Create the database & seed demo data

```bash
bun run db:generate                 # prisma generate (or: npx prisma generate)
bun run db:push                     # prisma db push --accept-data-loss
bun prisma/seed.ts                  # demo school + users (or: npx tsx prisma/seed.ts)
```

### 3. Run

```bash
bun run dev                         # or: npm run dev → http://localhost:3000
```

Production build:

```bash
bun run build                       # next build (+ copies static/public into .next/standalone)
bun run start                       # note: this script invokes Bun; Node users can run:
node .next/standalone/server.js     # equivalent start without Bun
```

## Demo logins

All seeded accounts share the password **`Password123!`** (verified in `prisma/seed.ts`):

| Email | Role |
|---|---|
| `admin@schooldesk.ng` | ADMIN — full access (`*`) |
| `principal@schooldesk.ng` | PRINCIPAL |
| `accountant@schooldesk.ng` | ACCOUNTANT |
| `tunde@schooldesk.ng` | TEACHER |
| `librarian@schooldesk.ng` | LIBRARIAN |
| `parent@schooldesk.ng` | PARENT — portal view of their child |
| `student@schooldesk.ng` | STUDENT — portal view |

The seed also creates the 2024/2025 session with 3 terms, classes Primary 4 → SS 3 with sections, 10 subjects, 48 students with guardians, 8 employees, a ₦85,000/term fee structure with invoices in every state, payments, a discount, defaulters, a current-term exam with marks and a WAEC-style grading scale, four weeks of attendance, a timetable for JSS 1A, announcements, calendar events, inventory items, library books with active loans, and ledger entries.

## Architecture

### API request pipeline

Every endpoint is a Next.js route handler wrapped by `createHandler()` (`src/lib/api/handler.ts`):

```
rate-limit → auth (JWT cookie) → role/permission check → zod body validation
           → handler (scoped by ctx.user.schoolId) → audit entry → response
```

- **Success envelope:** `{ "data": ... }` · **Error envelope:** `{ "error": { "message", "code", "details?" } }` (Zod issues come back as `VALIDATION` with per-field details).
- **Tenant isolation:** handlers must filter with `ctx.user.schoolId`; tenant tables all carry `schoolId`. Cross-school reads are impossible through the API.
- **Permissions:** a single catalogue (`src/lib/auth/permissions.ts`) drives routes, the roles matrix UI and patch validation. Wildcards: `*` (everything), `fees.*` (prefix), `*.read` (suffix). Seeded defaults: ADMIN `*`, PRINCIPAL read-everything plus operational writes, TEACHER academic writes, ACCOUNTANT fees/accounts, LIBRARIAN library/inventory, PARENT/STUDENT portal-only.
- **Money:** all amounts are integer **kobo** (`₦1.00 = 100`) — never floats. Currency defaults to NGN and is configurable per school.
- **Dates:** pure calendar dates are ISO strings `YYYY-MM-DD` (SQLite-friendly, timezone-safe); timestamps use `DateTime`.
- **Frontend:** one public route `/` hosts the SPA; sections are hash-routed (`#/dashboard`, `#/students`, `#/fees`, `#/exams`, `#/reports`, `#/settings`, `#/api-docs`, …) with role-aware sidebar groups, collapsible layout, global search, notifications bell and theme toggle.

### Auth tokens

`jose` HS256. Access tokens live 15 minutes. Refresh tokens are opaque strings (7-day TTL) that **rotate on every use**, are stored hashed (SHA-256), and detect theft — reuse of a revoked token revokes the user's whole token family. Cookies are `httpOnly`; the client fetches identity via `GET /api/v1/auth/me` (user + role + permissions + school branding).

## API overview

- Base path: **`/api/v1`** — plain REST route handlers (no server actions).
- Machine-readable **OpenAPI 3.1** document: **`GET /api/v1/openapi.json`**, browsable in-app under **`#/api-docs`** ("API Explorer") with per-endpoint descriptions.
- Route families: `auth/*`, `users`, `roles`, `school`, `branches`, `settings`, `academics/*` (sessions, terms, classes, sections, subjects, class-subjects, lesson-plans, promotions), `admissions/applicants/*`, `students/*` (incl. `import`, `export`, `:id/exit`, `:id/guardians`), `guardians`, `timetable/*` (periods, slots, grid, copy), `attendance/*` (students, staff, summary), `exams/*` (types, schedules, grading-scales, marks-sheet, broadsheet, publish), `report-cards`, `assignments/*`, `fees/*` (structures, invoices, bulk, discounts, payments, summary), `accounts/*` (ledger, summary), `hr/*` (employees, salary-structures, payslips, leave-requests, self), `inventory/*`, `library/*`, `communication/*` (announcements, events, templates, send, logs), `notifications`, `portal/*`, `dashboard`, `search`, `openapi.json`.

## Running with Docker

Files: `Dockerfile` (multi-stage, Next.js **standalone** output — `output: "standalone"` is set in `next.config.ts`), `docker-entrypoint.sh` (schema bootstrap + optional seeding), `docker-compose.yml`, `.dockerignore`.

```bash
docker compose up --build -d
# → http://localhost:3000
```

What happens on first boot:

1. The entrypoint creates the SQLite directory, and — because the database file is missing — runs `npx prisma db push` to create the schema.
2. If `SEED_DEMO_DATA=1` (default in compose), it seeds the Nigerian demo school via the bundled `prisma/seed.cjs` (compiled during the image build).
3. `node server.js` starts the Next.js standalone server on port 3000 (the repo's `npm run start` uses Bun, which is not available in the Node image, so the container runs the standalone server directly with Node).

Configuration:

| Compose variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:/app/db/custom.db` | SQLite file inside the mounted volume |
| `SD_JWT_ACCESS_SECRET` | `change-me-in-production` | Override via a `.env` next to `docker-compose.yml` |
| `SEED_DEMO_DATA` | `1` | Set to `0` to start with an empty database |

Volumes: `./db:/app/db` persists the SQLite database; `./backups:/app/backups` is where in-app backup snapshots are written. The healthcheck probes `http://127.0.0.1:3000/api/health`. To run schema updates on an existing volume: `docker compose exec app npx prisma db push --skip-generate`. The container runs as a non-root user with uid `1000`; if a Linux host's `./db` directory is owned by a different uid, fix it once with `sudo chown -R $(id -u):$(id -g) db backups`.

## Backups

Use the in-app backups UI under **School Settings → Database backups** (permission `settings.write`):

- **Create** — `POST /api/v1/admin/backup` copies the SQLite file into `backups/schooldesk-backup-<timestamp>.db` on the mounted `./backups` host volume.
- **Download** — `GET /api/v1/admin/backup/{name}` streams the snapshot file.
- **Delete** — `DELETE /api/v1/admin/backup/{name}`.

Every backup action is written to the audit log. For cold backups while the server is idle, a plain file copy of the `./db` volume is equally valid:

```bash
# Copy the SQLite file into the mounted ./backups volume
# (do this while the server is idle for a guaranteed-consistent copy):
docker compose exec app node -e \
  "require('fs').copyFileSync('db/custom.db','backups/custom-snapshot.db')"

# Or simply copy the volume file:
docker compose cp app:/app/db/custom.db ./backups/custom-$(date +%F).db
```

Because the database lives on the `./db` host volume, a plain file copy while the server is idle is equally valid.

## Roles & permissions overview

| Role | Highlights |
|---|---|
| `ADMIN` | `*` — everything |
| `PRINCIPAL` | Read-everything (`*.read`) + student/admissions/academic/timetable/attendance/exam/assignment/communication writes, exam publishing, report cards, audit read |
| `TEACHER` | Students & academics read, timetable/attendance writes, exam marks, assignments + grading |
| `ACCOUNTANT` | Students/academics read, fee structures/invoices/payments/discounts, full accounts ledger |
| `LIBRARIAN` | Library + inventory read/write, students read |
| `HR` | Employees, portal access, salary structures, payroll run + settle, leave decisions |
| `PARENT` / `STUDENT` | `portal` + communication read |

Roles are editable at runtime through the permission matrix UI (`#/roles`); permission patches are validated against the same catalogue the API enforces.

## Project structure

```
schooldesk/
├── prisma/
│   ├── schema.prisma        # 56 models, every tenant table scoped by schoolId
│   └── seed.ts              # Nigerian demo school (run: bun prisma/seed.ts)
├── db/                      # SQLite database file (custom.db) — gitignored
├── src/
│   ├── app/
│   │   ├── layout.tsx       # ThemeProvider (next-themes), fonts, Toaster
│   │   ├── page.tsx         # SPA entry → login / admin shell / portals
│   │   └── api/v1/          # REST route handlers (~120 endpoints)
│   │       ├── auth/  users/  roles/  school/  branches/  settings/
│   │       ├── academics/  admissions/  students/  guardians/
│   │       ├── timetable/  attendance/  exams/  report-cards/  assignments/
│   │       ├── fees/  accounts/  hr/  inventory/  library/
│   │       ├── communication/  notifications/  portal/
│   │       └── dashboard/  search/  openapi.json/
│   ├── components/
│   │   ├── ui/              # shadcn/ui (New York style)
│   │   ├── layout/          # AppShell, Sidebar, Topbar (search, bell, profile)
│   │   ├── shared/          # DataTable, CrudDrawer, EmptyState, StatCard, …
│   │   └── modules/         # dashboard/ admissions/ students/ academics/
│   │                        # timetable/ attendance/ exams/ homework/ fees/
│   │                        # accounts/ staff/ inventory/ library/
│   │                        # communication/ portals/ admin/
│   ├── lib/
│   │   ├── api/             # createHandler middleware chain, errors,
│   │   │                    #   in-memory rate limit, pagination, audience, notify
│   │   ├── auth/            # jwt (jose), password (argon2), session cookies,
│   │   │                    #   permission catalogue + wildcard matching
│   │   ├── domain/          # PURE functions: fees allocation, grading,
│   │   │                    #   positions, timetable clash detection, fines, …
│   │   ├── integrations/    # messaging drivers: mock | termii | sendgrid
│   │   ├── validation/      # zod schemas shared by client + server
│   │   ├── openapi.ts       # OpenAPI 3.1 document source
│   │   └── money.ts  csv.ts  utils.ts
│   ├── hooks/               # use-hash-route, use-mobile, use-toast
│   └── stores/              # zustand: session, ui
├── Dockerfile               # multi-stage standalone build
├── docker-entrypoint.sh     # schema bootstrap + optional demo seed
├── docker-compose.yml       # app service, volumes, healthcheck
└── docs/PLAN.md             # master build plan (phases 0–10)
```

## NPM scripts

| Script | What it does |
|---|---|
| `dev` | `next dev -p 3000` (logs to `dev.log`) |
| `build` | `next build`, then copies `.next/static` and `public/` into `.next/standalone/` |
| `start` | Runs the standalone server — **requires Bun** (`bun .next/standalone/server.js`); Node equivalent: `node .next/standalone/server.js` |
| `lint` | ESLint |
| `db:generate` | `prisma generate` |
| `db:push` | `prisma db push --accept-data-loss` |
| `db:migrate` | `prisma migrate dev` |
| `db:reset` | `prisma migrate reset` |

*(Seeding has no script wrapper — run the file directly: `bun prisma/seed.ts` or `npx tsx prisma/seed.ts`.)*

## Roadmap & known trade-offs

- **SQLite** is used for sandbox simplicity; the schema is provider-portable — switch the datasource provider to `postgresql` and convert string "enum" columns to native enums.
- **Messaging defaults to the mock driver** (status `SIMULATED`); Termii (SMS/WhatsApp) and SendGrid (email) activate as soon as keys are set in school settings.
- **Online payments are recorded in-app** (receipts, instalment allocation, ledger) — Paystack/Flutterwave gateway adapters are on the roadmap, not yet wired.
- **Reports & analytics, audit log viewer, settings UI and in-app backups are delivered** (phase 10). Scheduled exports run via "Run now"; for fully unattended cycles, point a cron/scheduler at `POST /api/v1/reports/scheduled-exports/{id}/run`.
- **Rate limiting is in-memory** (sliding window, single node) — swap for Redis in clustered deployments.
- **No file upload API yet**; PDF output uses print-optimised views (report card, receipt, ID card, payslip, timetable) via browser print.
- Domain logic is isolated as pure functions in `src/lib/domain/*`, ready for unit tests to be attached.

---

Built as a 10-phase delivery (see `docs/PLAN.md`); phase 10 closes out reports, administration, documentation and Docker.
