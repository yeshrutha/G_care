# G-Care PostgreSQL integration

## What is running

The local application now uses PostgreSQL 17.11, database `gcare`, on `127.0.0.1:55433`. The password-protected cluster is in `data/postgres`; portable executables are in `tmp/postgres/pgsql`. The ignored backend `.env` contains the connection. No connection credentials are placed in frontend variables. The original JSON and an environment backup are retained in `data/backups`. Original `data/db.json` matched its backup after migration.

The app is available at http://localhost:8080 while the development server runs. Health endpoint: http://localhost:8787/api/health. It reports `persistence: postgresql` only after a real database query succeeds.

## Initial audit and corrections

Entry points: `server.js` -> `server/index.js`; development launcher `server/dev.js`. Existing `server/db.js` selected PostgreSQL only with DATABASE_URL; otherwise JSON with a process cache and serialized file writes. Existing PostgreSQL branches had startup DDL/automatic demo password replacement, incomplete alarm/appointment metadata, integer SpO2, encoded PDF contents in the database, and no durable medication acknowledgement history. PostgreSQL episode tests were adapter mocks. Frontend Zustand/local caches and broadcasts are presentation/synchronization layers, not the durable database.

The existing `/api/auth/*`, `/api/elders`, `/api/dashboard-data`, `/api/vitals`, `/api/device/*`, `/api/alerts`, `/api/medications`, `/api/alarms`, `/api/reports`, `/api/medical-records`, `/api/clinical-notes` and `/api/care-team` contracts remain. Added `POST /api/reminder-acknowledgements`; health adds the persistence mode. No generic patients endpoint was invented.

## Schema and architecture

17 tables: `users`, `elders`, `user_elders`, `medications`, `medication_schedules`, `alarms`, `appointments`, `reminder_acknowledgements`, `vitals_readings`, `vitals_latest`, `alerts`, `clinical_notes`, `reports`, `audit_logs`, `revoked_tokens`, `schema_migrations`, `data_imports`.

The existing user-patient join represents doctor, nurse/assistant and guardian assignments, with role approval checked against current stored accounts. No duplicate role tables were needed. Profiles, variable audit details, medical-condition arrays and appointment display details use JSONB; main entities and relationships use typed columns. Medication schedule rows preserve their original positions, so stable reminder IDs do not shift. The times array is retained for existing API compatibility, with schedule rows used for reads.

Physiological alert episode state stays on alerts: patient plus canonical anomaly type identifies the continuous episode. Row locks serialize creation per patient across database connections. A partial unique index protects one open unrecovered physiological alert. Acknowledgement resolves the care alert but suppresses recreation until recovery. Recovery ends the physiological episode; it does not silently acknowledge a pending care alert. New abnormality after recovery can create a new episode. Existing SOS and fall event flows remain.

Latest telemetry is updated transactionally on every accepted reading. History is sampled at ten seconds by default, with fall events retained. Existing history is never pruned/deleted. Timestamps and patient association are stored; stale arrivals cannot replace a newer latest reading. The open Watch saves only its selected authorized simulated patient every 30 seconds; display polling remains unchanged. Recent device telemetry has priority over simulator saves for 60 seconds. Hardware-key ingestion remains restricted to DEVICE_ELDER_ID.

Medication definitions and schedule rows commit together. Taken is an application acknowledgement, not proof of ingestion. Acknowledgements are unique per patient/reminder/local calendar date; repeat requests do not add duplicate history. Login hydration restores them, and reminder rebuilds retain today's status. The next day's daily dose is independent. Failed saving does not mark Taken.

Appointment records preserve patient, doctor, date/time and status; main/preparation alarm metadata is retained. Stable IDs support retries and a patient/doctor/date/time uniqueness constraint prevents duplicate bookings. Individual appointment/alarm writes are transactional. The existing UI still uses multiple requests to save a main alarm, prep alarm, notification and acknowledgement; this is not a claim that the entire browser booking flow is one distributed transaction. Booked details are now saved on the resolved source alert.

Notifications remain represented by durable alerts/alarms plus the existing browser broadcasts; there is no new parallel notification generator/table. PDFs are saved separately under DATA_DIR/uploads with random internal filenames; PostgreSQL stores metadata/file references. The authenticated download route and patient checks remain. Legacy encoded files can still be read. Back up both the database and upload directory.

## Migrations and imported data

Four checksum-tracked migrations: existing schema; persistence entities/indexes; patient/episode constraints; medication schedule ordering. An advisory lock prevents concurrent migration runs. Normal startup verifies applied versions and does not recreate tables or reseed PostgreSQL. Apply new migrations before API startup; do not edit already applied migration files.

The JSON importer uses one transaction, dependency order, foreign keys and a source digest. Repeat import of the same source reports alreadyImported. Conflicting account identities abort rather than overwrite. Confirmed open physiological duplicates with explicit lifecycle state are closed but retained; ambiguous legacy duplicates stop import for review. The source file is never changed.

Actual migration: 6 users, 3 patients, 3 medications, 11 alarms, 3 alerts, 31 reports, 296 audit entries, 7 revoked tokens, 1 telemetry reading. No duplicate alerts required closing. Browser login checks subsequently add normal authentication audit entries. The source contained no clinical notes. Existing alarms had already lost appointment IDs/dates in the former adapter, so no complete appointment rows could honestly be reconstructed; the 11 alarm records are preserved. New appointment metadata is tested and persists.

## Commands for this workspace

From `C:\Users\yeshr\OneDrive\Desktop\G_care`:

```powershell
npm run db:local
npm run db:migrate
npm run db:status
npm run dev
```

`db:local` only starts the project-owned PostgreSQL cluster on port 55433. Run it again after reboot. Do not delete `data/postgres`, `data/uploads`, `.env` or the portable PostgreSQL files while using this setup. This is a local development setup, not an installed Windows database service. For another machine, install PostgreSQL or use a hosted database and supply its own DATABASE_URL; portable files and private credentials are not committed.

Import a preserved JSON source into an appropriate target database:

```powershell
npm run db:import -- data/db.json
```

Optional demo seed for an empty development database: `npm run db:seed`. Production disables known demo logins through NODE_ENV/DEMO_AUTH_ENABLED; imported real accounts keep the manual verification policy. Never use demo credentials for real patient access.

Testing:

```powershell
npm test
$env:TEST_DATABASE_URL = 'postgresql://YOUR_TEST_USER:YOUR_TEST_PASSWORD@127.0.0.1:5432/gcare_test'
npm run test:postgres
npm run build
```

The isolated portable test instance used here runs at 127.0.0.1:55432/gcare_test, distinct from the application database. Tests generate a unique schema and clean up only that schema. TEST_DATABASE_URL is required; a missing server fails the tests, not a silent mock/skip. The Vitest suite explicitly ignores the application's DATABASE_URL to protect real data.

## Verification results

141 Vitest tests across 18 files passed, protecting existing alerts, simulator, role approval/privacy, medication/report workflows, watch dismissal and multilingual speech completion; three new reminder state tests cover success, failure and daily reset.

18 live PostgreSQL integration tests exercise real migration/import idempotency, row-lock alert concurrency, acknowledgement/recovery/new episodes, decimal/latest telemetry and sampling, medication schedules/Taken persistence, appointment retries and metadata, PDF upload/authenticated bytes/restart, role approval, patient isolation, invalid SQL/FKs, rollback, replaced connections, actual API process restart/re-login/logout, unavailable database startup, hardware-key falls, physical telemetry precedence, retry identity privacy and duplicate-import safety.

Headless Chromium checks passed for Doctor (3 demo patients), Caretaker (3) and Guardian (1), including page reload with zero page errors. Screenshots are in tmp/postgres. The application PostgreSQL instance itself was stopped/restarted and reconnected successfully; imported counts survived. Production build passed. The separate TypeScript check still has pre-existing project errors; passing Vite is not a claim that all type errors were fixed.

Hardware was not physically retested here. External AI services and audible Kannada/Hindi speech were not newly validated against the database; existing software/voice regression tests passed. Render deployment was prepared but not performed.

## Environment and Render steps

Backend variables: DATABASE_URL, private JWT_SECRET, NODE_ENV, CORS_ORIGIN, DATA_DIR; optional PGSSL, PGSSL_REJECT_UNAUTHORIZED, PG_POOL_MAX, TELEMETRY_HISTORY_INTERVAL_MS, DEMO_AUTH_ENABLED and existing DEVICE_API_KEY/DEVICE_ELDER_ID. See .env.example. Do not put any secret in VITE_ variables. Default PostgreSQL certificate verification is not disabled; only explicitly configure a provider-specific TLS exception if required.

For Render:

1. Create/use a PostgreSQL database and copy its Internal Database URL into the backend DATABASE_URL (or the Blueprint's fromDatabase binding).
2. Set NODE_ENV=production, a private JWT_SECRET, DEMO_AUTH_ENABLED=false and explicit frontend CORS origins.
3. Set DATA_DIR=/var/data/gcare and mount a persistent disk at /var/data. The prepared render.yaml changes the web service to a disk-capable starter plan; this can incur hosting cost. No paid resource was created. If you keep a free ephemeral filesystem, uploaded PDFs will not reliably survive replacement/redeploy even though metadata remains in PostgreSQL.
4. Build with the existing npm install/build command. Start with `npm run db:migrate && npm start` so migrations finish first.
5. Transfer/import your approved JSON source and report files once using a trusted administrative session; the local private database is not automatically copied to Render. Use backups first. Do not reseed on every deployment.
6. Check /api/health for persistence=postgresql, and run `npm run db:status` in the backend shell. Vercel's existing /api rewrite is unchanged; confirm its backend URL matches your deployed service.

Deployment is not verified until those hosted resources are actually connected and tested. Render database plan/availability and disk pricing should be checked in your account before provisioning.

## Simple persistence check

Add a medication and mark its current reminder Taken; book an appointment for an assigned patient; upload a test clinical PDF. Refresh, sign out/in, then restart the backend. Confirm the same medication and acknowledgement, appointment date/time and document remain with the same patient. Daily Taken applies to its date, so tomorrow's reminder should be due again. Stop PostgreSQL temporarily: startup must fail rather than switch to JSON; an already running API should return a generic unavailable error and recover its pool connection when the database returns.

## Files changed for this database task

Modified: .env.example, .gitignore, package.json, render.yaml, vitest.config.ts; server/db.js, server/handlers.js, server/http.js, server/index.js; src/store/authStore.ts, src/store/guardianStore.ts, src/components/WatchSimulator.tsx, src/components/guardian/RemindersTab.tsx, src/pages/DoctorPortal.tsx; src/test/alertEpisodePostgres.test.ts.

Added: server/migrate.js, server/database-cli.js, server/importData.js, server/reportFiles.js, server/local-postgres.js, server/migrations/001_existing_schema.sql, 002_persistence.sql, 003_constraints.sql, 004_schedule_order.sql; server/test/postgres.integration.test.js; src/test/reminderPersistence.test.ts; scripts/postgres-browser-check.mjs; this document. Private .env/local data/backups and uploads were also created outside version control. Other pre-existing uncommitted feature changes were preserved. Reports/RPT.pdf and report outputs were not edited.
