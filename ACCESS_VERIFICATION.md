# Account verification and patient access

New registrations request a role; they do not grant it. Doctor, caretaker and guardian signup requires a proof ID, issuing organization/person and an uploaded PDF, JPG, PNG, WebP or Word document (maximum 5 MB). Existing reference-only requests remain reviewable. Evidence is submitted for manual review; no automatic professional registry validation is implemented. Files are private in DATA_DIR/verification-proofs; only an assigned verified doctor can download caretaker/guardian proof through the authenticated API. PostgreSQL stores file metadata in the user profile, not document bytes. Back up this directory with the database. The project owner reviews doctor proof locally: node server/review-access.js proof <doctor-email> <new-output-file>. The export refuses to overwrite an existing file. Upload validation checks size, format signatures and Word ZIP entries; it does not authenticate document contents or provide malware scanning.

## Approval workflow

1. Register a doctor with a new email and submit genuine evidence. The account remains pending and receives no login token.
2. The project owner independently checks the evidence. Owner review is a local administrative tool, not a publicly selectable role. Back up the data, stop the API, and run from this project directory:

   `node server/review-access.js list`

   `node server/review-access.js review <doctor-email> approved <comma-separated-patient-IDs> <evidence-review-note>`

   Use `rejected` or `suspended` with `-` for patient IDs when appropriate. Restart the API after review so its JSON state reloads. Only approve patient assignments you have verified.
3. The approved doctor signs in and opens **Review nurse / guardian access**. They review their own applicants, select permitted patients, and record a review note before approving, rejecting or suspending access.
4. Staff signup offers only Nurse or Doctor Assistant. Family relationships belong to Guardian signup. Guardians require a verified patient/consent link and see only selected patients.

Existing unverified non-demo accounts are denied patient access. This change does not silently approve or migrate them; new registration with an unused email is required for the current signup workflow. Local known seed accounts remain limited to the three demo patients and cannot approve real applicants. They are disabled in production. Set `DEMO_AUTH_ENABLED=false` for any deployment containing real patient information.

## Enforcement

Patient permissions are checked on the server using the current stored account, approval state, supervising doctor and explicit patient assignments. Claiming a role or changing a patient name in the profile cannot grant access. Anonymous dashboard/device reads and the former anonymous demo API fallback are removed. Alert edits/deletes, vitals, reminders, medication, medical records and patient assistant context are scoped to permitted patients. A suspended account cannot keep using an already issued token.

Authenticated sessions and patient caches are per browser tab; login/logout clear previous patient state. The server remains the authority for access. Hardware ingestion without a portal login requires `DEVICE_API_KEY` and `DEVICE_ELDER_ID`, and can write only that configured patient's telemetry. Update prototype configuration accordingly.

Production startup requires a private `JWT_SECRET` of at least 32 characters, excluding the former public development placeholder. Development without a suitable configured secret uses a random per-process signing key; restarting then requires signing in again. Do not reuse a public example secret.

## Files changed for this feature

Server: `server/accessPolicy.js`, `server/accessReview.js`, `server/review-access.js`, `server/auth.js`, `server/http.js`, `server/config.js`, `server/db.js`, `server/handlers.js`.

Client: `src/components/VerificationFields.tsx`, `src/pages/AccessReview.tsx`, `src/pages/Login.tsx`, `src/pages/GuardianLogin.tsx`, `src/components/ProtectedRoute.tsx`, `src/lib/api.ts`, `src/lib/patientStorage.ts`, `src/store/authStore.ts`, `src/store/index.ts`, `src/store/guardianStore.ts`, `src/lib/anomalyDetector.ts`, `src/App.tsx`, `src/pages/Dashboard.tsx`, `src/pages/DoctorPortal.tsx`, `src/components/WatchSimulator.tsx`.

Tests added: `src/test/roleVerificationPrivacy.test.ts`, `src/test/roleVerificationUI.test.tsx`. Existing alert/workflow fixtures and API mocks were updated to use explicit assignments and the session helpers.

## Validation and limits

138 automated tests across 17 files passed, including 21 new server/privacy and UI/session tests. The production build passed. Tests use isolated temporary JSON data and synthetic evidence; no real account was approved or real evidence verified. JSON approval survives database reload in tests. PostgreSQL implementation exists but this approval workflow was not exercised against a live PostgreSQL deployment.

The separate full TypeScript check still fails on existing reminder, watch, appointment, dashboard and test typing problems. Passing the Vite build is not a claim that this type check passes. This work is not a complete security audit or clinical validation. The previously generated report PDF predates these login changes.
