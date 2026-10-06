# Local-only G-Care Owner Portal

The owner website stays on the project owner's laptop. It is excluded from the normal public website build and has no Vercel owner route. Owner APIs reject production requests, non-loopback connections and non-local browser origins, even if owner credentials exist on Render. Do not deploy owner-dist.

## Setup

The owner's email is configured privately in local .env. Run `node server/owner-password.js` and choose a password of at least 12 characters. This hides password input and writes a PBKDF2 hash into ignored local .env automatically; no copying or identity-proof review is required for the owner. Start PostgreSQL using `npm run db:local`, start the backend with `npm run server`, then run `npm run owner:dev`. Open http://localhost:8081/owner.html. The owner preview binds only to 127.0.0.1. Password sign-in remains required. Owner credentials never belong in frontend variables or GitHub.

## Data scope

By default this manages local PostgreSQL, not Render accounts. A local private backend can be configured with a cloud database's external connection details, but it must remain local and use secure database connectivity. Proof metadata and files are separate: local access to cloud PostgreSQL does not copy uploaded proof files to your laptop. A private secure transfer/storage arrangement is needed for those documents. Do not disable backend authorization or expose database credentials in a browser to bridge this gap.

## Features and limits

Owners review submitted doctor/caretaker/guardian applications, download available proofs, approve/reject/suspend accounts and assign existing patients. Manual review and notes are required; caretaker and supervising-doctor patient restrictions stay in place. Read-only records show up to 500 patients, medications, appointments, alerts, report metadata, latest vitals and audit events. This is not arbitrary SQL or a full database export; password hashes, secrets and document storage paths are excluded. Sessions last at most one hour and logout revokes the token. Uploaded files need persistent storage/backups; lost evidence cannot be reconstructed from metadata. No MFA or public owner signup exists.

## Live database connection from your laptop

Save OWNER_DATABASE_URL privately in .env or .env.owner. Run npm run owner:server; this backend binds only to 127.0.0.1:8788, uses verified TLS, and verifies existing migrations without modifying them or seeding. npm run owner:dev proxies to that backend. Normal G-Care continues using DATABASE_URL and port 8787. Approval decisions in this mode affect the real website. Existing proofs uploaded on Render cannot be downloaded from your local disk; a protected remote proof transfer is still required.

## Live proof transfer activation

A random OWNER_PROOF_TRANSFER_KEY is saved only in ignored local .env. Copy this exact value privately to the Render backend Environment under the same name, then deploy the proof-transfer code. OWNER_PROOF_ORIGIN stays backend-only and points at https://g-care.onrender.com. A signed, account-specific request expires after 60 seconds; the server exposes only the requested proof after signature verification and records an audit event. This does not enable public owner sign-in or owner review APIs. Proofs already lost from ephemeral storage remain unavailable. Never share this key or put it in a VITE_ variable. The local website remains localhost-only.

## Review and patient enrollment

Owner-approved doctors may start with zero assigned patients; this grants sign-in but no patient records. Caretakers and guardians still require selected patients within their supervising doctor assignments. Owners can add a real patient profile through Patients → Add patient, then assign it under All accounts. No demo patients or vitals are automatically created in the live database. Refresh shows a loading state rather than fake zero counts. Signed proof transfer rejection is reported separately from confirmed missing upload storage. PDF previews use a local PDF.js canvas reader with page/zoom controls; images display in the modal. Word previews require a PDF/image copy.
