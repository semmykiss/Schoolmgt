# SchoolDesk — Master Plan

Cloud school management system (eSkooly-style) for schools, colleges, tuition centres and academies.
Nigerian demo context, currency NGN, fully responsive, light/dark themes.

---

## 0. Platform adaptations (sandbox constraints → engineering decisions)

| Requested | Delivered here | Why / how the intent is preserved |
|---|---|---|
| Express/Fastify + PostgreSQL | **Next.js 16 route handlers under `/api/v1`** (same REST contract + OpenAPI JSON), **Prisma + SQLite** file DB | Sandbox exposes a single port. Route handlers are plain REST (no server actions). Schema is provider-portable: switch one line to `postgresql`. |
| React + Vite SPA | **React 19 SPA inside the Next.js app shell** at the single public route `/`, hash-routed (`#/students`, `#/fees/...`) | Same component architecture (views, drawers, tables). TanStack Table, React Hook Form + Zod, Recharts, Tailwind — all used as requested. |
| JWT + refresh tokens | `jose` HS256, **15-min access token + 7-day rotating refresh token** in httpOnly cookies, DB-backed revocation (`RefreshToken` table) | Identical security model. |
| argon2 | `@node-rs/argon2` (prebuilt native); fallback `scrypt` from `node:crypto` | No compilation risk in sandbox. |
| Paystack/Flutterwave | Adapter interface with **sandbox/mock driver** + real driver code paths (keys from Settings) + webhook endpoint | Online payment flow fully testable without live keys. |
| PDF exports | **Print-optimised views** (report card, receipt, ID card, timetable) via browser print → PDF; CSV export server/client side | Zero heavy server PDF deps; school-branded output. |
| Unit tests + Playwright | Domain logic isolated as **pure functions in `src/lib/domain/*`** (fees, grading, attendance, positions, clash detection) — unit-test ready. Verification in this sandbox: `lint` + live browser run-through of the golden path per module | Sandbox does not run test suites; logic is still isolated for tests to attach later. |
| Docker Compose + README | Delivered in final phase | — |

## 1. Folder structure

```
/home/z/my-project
├── prisma/
│   ├── schema.prisma          # ✅ written (56 models)
│   └── seed.ts                # Phase 0: Nigerian demo data
├── db/custom.db               # SQLite database
├── uploads/                   # runtime file storage (served via /api/v1/files/:id)
├── docs/PLAN.md               # this file
├── docker-compose.yml         # final phase
└── src/
    ├── app/
    │   ├── layout.tsx         # ThemeProvider (next-themes), fonts, Toaster
    │   ├── page.tsx           # SPA entry → login / admin shell / parent & student portals
    │   └── api/v1/            # REST API (route handlers, ~120 endpoints)
    │       ├── auth/{register,login,refresh,logout,me,change-password}/route.ts
    │       ├── users/…  roles/…  school/  branches/…  settings/
    │       ├── academic/{sessions,terms,classes,sections,subjects,class-subjects,lesson-plans,promotions}/…
    │       ├── public/admissions/apply/  admissions/applicants/…  uploads/  files/[id]/
    │       ├── students/…  guardians/…
    │       ├── timetable/{periods,slots,class,teacher}/…
    │       ├── attendance/{students,staff,summary}/…
    │       ├── exams/{exam-types,exams,schedules,grading-scales,marks-sheet,broadsheet}/…
    │       ├── report-cards/  assignments/…
    │       ├── fees/{structures,invoices,instalments,discounts,defaulters}/…
    │       ├── payments/online/{initiate,webhook,verify}/…  accounts/{ledger,summary}/
    │       ├── hr/{employees,salary-structures,payslips,leave-requests}/…
    │       ├── inventory/{items,movements,suppliers,books,loans}/…
    │       ├── communication/{announcements,events,templates,send,logs}/  notifications/
    │       ├── portal/{overview,child}/  reports/…  dashboard/  audit-logs/  openapi.json/
    ├── components/
    │   ├── ui/                # shadcn/ui (existing, New York style)
    │   ├── layout/            # AppShell, Sidebar (collapsible groups), Topbar (branch switcher,
    │   │                      #   global search, notifications bell, profile menu), ThemeToggle
    │   ├── shared/            # DataTable (TanStack) + column toggle + bulk bar, SearchFilterBar,
    │   │                      # CrudDrawer, DetailTabs, EmptyState, StatCard, MoneyInput,
    │   │                      # ConfirmDialog, PrintFrame, FileUpload, ExportButtons
    │   └── modules/           # dashboard/ admissions/ students/ academic/ timetable/ attendance/
    │                          # exams/ assignments/ fees/ hr/ inventory/ communication/
    │                          # portals/ reports/ admin/
    ├── lib/
    │   ├── api/               # handler(): auth → RBAC → school-scope → zod validate → audit;
    │   │                      #   errors, rate-limit (in-memory sliding window), pagination helpers
    │   ├── auth/              # jwt.ts (jose), password.ts (argon2/scrypt), session.ts (cookies)
    │   ├── domain/            # PURE functions: fees.ts, grading.ts, attendance.ts,
    │   │                      #   positions.ts, timetable.ts (clash detection), admissionNo.ts
    │   ├── integrations/      # payments/{paystack,flutterwave,mock}.ts,
    │   │                      #   messaging/{email,sms,whatsapp}+{termii,sendgrid,mock} drivers
    │   ├── csv.ts  openapi.ts  utils.ts
    │   └── validation/        # zod schemas per module (shared client+server)
    ├── hooks/                 # use-session, use-list (query+filters), use-mutations, use-debounce
    └── stores/                # zustand: session, ui (sidebar, column prefs, theme)
```

## 2. API route map (`/api/v1`, all scoped by schoolId)

### Auth & identity
```
POST /auth/register            create school + admin (onboarding)
POST /auth/login               → access + rotating refresh (httpOnly cookies)
POST /auth/refresh             rotate refresh, issue access
POST /auth/logout              revoke refresh
GET  /auth/me                  user + role + permissions + school branding
POST /auth/change-password     POST /auth/forgot-password  POST /auth/reset-password
GET/POST /users                GET/PATCH/DELETE /users/:id
GET /roles                     PATCH /roles/:id            (permission matrix)
GET/PATCH /school              GET/POST /branches          PATCH/DELETE /branches/:id
GET/PUT /settings              GET /audit-logs
```

### Academic structure
```
GET/POST /academic/sessions            PATCH/DELETE /academic/sessions/:id   POST …/:id/set-current
GET/POST /academic/terms               PATCH/DELETE /academic/terms/:id      POST …/:id/set-current
GET/POST /academic/classes             PATCH/DELETE /academic/classes/:id
POST     /academic/classes/:id/sections  PATCH/DELETE /academic/sections/:id
GET/POST /academic/subjects            PATCH/DELETE /academic/subjects/:id
GET/POST /academic/class-subjects      PATCH/DELETE /academic/class-subjects/:id   (assign teacher)
GET/POST /academic/lesson-plans        PATCH/DELETE /academic/lesson-plans/:id
POST     /academic/promotions          bulk promote / graduate by class
```

### Admissions & students
```
POST /public/admissions/apply           public, rate-limited, sanitised
GET/POST /admissions/applicants         GET/PATCH /admissions/applicants/:id
POST /admissions/applicants/:id/advance  (pipeline stage move)
POST /admissions/applicants/:id/convert → student + admission number (+ optional guardian login)
POST /uploads                           multipart; mime/extension whitelist + size cap
GET  /files/:id                         authenticated file serving
GET/POST /students                      GET/PATCH/DELETE /students/:id  (detail = profile +
                                        guardians + fee status + attendance summary + results)
POST /students/import                   POST /students/:id/promote | transfer | graduate
GET  /students/export                   CSV
GET/POST /guardians                     PATCH /guardians/:id   POST /students/:id/guardians
GET  /students/:id/id-card              branded card print payload
```

### Timetable & attendance
```
GET/POST /timetable/periods             PATCH/DELETE /timetable/periods/:id
GET/POST /timetable/slots               PATCH/DELETE /timetable/slots/:id   (409 on clash)
GET /timetable/class/:classId           GET /timetable/teacher/:employeeId
GET  /attendance/students?classId&date  roster + existing marks (daily or per-period)
POST /attendance/students               bulk upsert; ABSENT triggers parent notifications
GET  /attendance/students/report        monthly matrix + percentages
GET  /attendance/staff/report
GET  /attendance/summary?date           dashboard %
```

### Exams, results, assignments
```
GET/POST /exams/exam-types              PATCH/DELETE /exams/exam-types/:id
GET/POST /exams                         PATCH/DELETE /exams/:id   POST /exams/:id/publish
GET/POST /exams/schedules               PATCH/DELETE /exams/schedules/:id
GET/POST /exams/grading-scales          PATCH/DELETE /exams/grading-scales/:id  (bands nested)
GET/POST /exams/:id/marks-sheet         bulk entry per classSubject; auto-grade via scale
GET  /exams/:id/broadsheet?classId      totals, averages, positions
GET  /report-cards?studentId&examId     branded report-card print payload
GET/POST /assignments                   PATCH/DELETE /assignments/:id
GET  /assignments/portal                role-aware list (teacher posts / student due work)
```

### Fees & accounts
```
GET/POST /fees/structures               PATCH/DELETE /fees/structures/:id
GET/POST /fees/invoices                 GET/PATCH /fees/invoices/:id
POST /fees/invoices/bulk-generate       per class + term (applies discounts)
POST /fees/invoices/:id/instalments     PATCH /fees/instalments/:id
GET/POST /fees/discounts                PATCH/DELETE /fees/discounts/:id
POST /fees/invoices/:id/payments        → receipt; auto ledger INCOME entry
GET  /fees/payments/:id/receipt         branded receipt print payload
POST /payments/online/initiate          Paystack/Flutterwave/mock → checkout URL
POST /payments/online/webhook/:provider GET /payments/online/:reference/verify
GET  /fees/defaulters?termId
GET/POST /accounts/ledger               PATCH/DELETE /accounts/ledger/:id
GET  /accounts/summary                  income vs expense (month/term/session)
```

### HR & payroll
```
GET/POST /hr/employees                  GET/PATCH/DELETE /hr/employees/:id
GET/POST /hr/salary-structures          PATCH/DELETE /hr/salary-structures/:id
POST /hr/payslips/generate?period       GET /hr/payslips?period
GET  /hr/payslips/:id                   PATCH /hr/payslips/:id/mark-paid  (ledger EXPENSE)
GET/POST /hr/leave-requests             POST /hr/leave-requests/:id/decide
```

### Inventory & library
```
GET/POST /inventory/items               PATCH/DELETE /inventory/items/:id
POST /inventory/items/:id/stock         IN/OUT/ADJUST
GET  /inventory/movements
GET/POST /inventory/suppliers           PATCH/DELETE /inventory/suppliers/:id
GET/POST /inventory/books               PATCH/DELETE /inventory/books/:id
POST /inventory/loans                   POST /inventory/loans/:id/return  (+fine calc)
```

### Communication, portals, reports, dashboard
```
GET/POST /communication/announcements   PATCH/DELETE …/:id    POST …/:id/publish
GET/POST /communication/events          PATCH/DELETE …/:id
GET/POST /communication/templates       PATCH/DELETE …/:id
POST /communication/send                channel + audience filter → driver → CommunicationLog
GET  /communication/logs
GET  /notifications                     POST /notifications/read   (one / all)
GET  /portal/overview                   role-aware: children/self → attendance %, results,
                                        fees due, timetable, homework, announcements
GET  /portal/child/:studentId           parent drill-in
GET  /reports/attendance | academic | financial | enrollment
GET/POST /reports/saved-filters         PATCH/DELETE …/:id
GET/POST /reports/scheduled-exports     PATCH/DELETE …/:id   POST …/:id/run
GET  /dashboard                         all widget payloads
GET  /openapi.json                      OpenAPI 3.1 document (rendered by SPA "API Docs" view)
```

## 3. Build phases (each ends with lint + browser verification + summary)

| # | Phase | Contents |
|---|---|---|
| 0 | Foundation | deps (jose, @node-rs/argon2), db push, seed (Nigerian demo school), auth + RBAC + audit + rate-limit, API handler middleware, app shell (sidebar/topbar/themes), shared DataTable/drawer/empty-state kit, dashboard skeleton, OpenAPI doc |
| 1 | Academic structure | sessions/terms/classes/sections/subjects/class-subjects/lesson plans/promotions |
| 2 | Admissions + students | public apply form, pipeline, convert, students CRUD, guardians, CSV import/export, ID card |
| 3 | Timetable + attendance | periods, slots + clash detection, class/teacher views, daily & per-period attendance, staff attendance, monthly reports, parent alerts |
| 4 | Fees & accounts | structures, invoices (bulk + instalments + discounts), payments + receipts, online payment adapter, defaulters, ledger, accounts summary |
| 5 | Exams & report cards | exam types, schedules, grading scales, marks entry, broadsheet/positions, branded report card print, publish |
| 6 | Portals + assignments | parent/student logins & views; homework posting/viewing |
| 7 | Communication | announcements, events, templates, messaging adapters, notification centre |
| 8 | HR & payroll | employees, salary structures, payslips, leaves, staff portal access |
| 9 | Inventory & library | items, stock movements, suppliers, books, loans |
| 10 | Reports + admin + polish | analytics, saved filters, scheduled exports, roles matrix, audit log UI, branding, backups, i18n stubs, README, docker-compose |

## 4. Seed data (Nigerian context, configurable via env)

- School: "Crescent Dawn Group of Schools", Ikeja, Lagos (`SEED_SCHOOL_NAME` / `SEED_CURRENCY` overridable)
- Logins (password `Password123!`): admin@ / principal@ / teacher@ / accountant@ / parent@ / student@schooldesk.ng
- 2024/2025 session (current), 3 terms; classes Primary 4 → SS 3 with sections; 10 subjects (Mathematics, English Language, Basic Science, Civic Education, Yoruba, Computer Studies, Business Studies, Agricultural Science, Social Studies, CRS)
- 48 students (real Nigerian names), guardians, one sibling pair; 8 employees (principal, bursar, 5 teachers, librarian)
- Fee structure ₦85,000/term (tuition, levies, PTA) with invoices in every state, payments, a discount, defaulters
- Current-term exam with marks + WAEC-style grading scale, attendance for the last 4 weeks, timetable for JSS 1A
- Announcements, calendar events, inventory items, library books + 2 active loans, ledger entries
