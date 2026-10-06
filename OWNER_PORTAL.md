# G-Care Owner Portal

The owner portal is a separate HTML entry and can be deployed as a separate Vercel project. It uses the existing backend and PostgreSQL database through protected `/api/owner/*` endpoints. There is no owner signup and no owner role in the public user table.

## Private setup

Set `OWNER_EMAIL` to the owner's email in the backend environment. Run `node server/owner-password.js` locally: it prompts for a password without displaying it and outputs a PBKDF2 hash. Copy the hash into Render's `OWNER_PASSWORD_HASH`; do not put either a plaintext password or the hash in frontend variables, GitHub, or chat. Restart/redeploy the backend after configuration. No default owner password exists. Credentials absent means the portal is disabled. Changing the email or hash invalidates existing owner tokens.

## Separate website deployment

Create a second Vercel project from the same repository, on branch `dev`. Set Build Command to `npm run build:owner` and Output Directory to `owner-dist`. Use the existing install configuration. The repository's API rewrite forwards requests to `https://g-care.onrender.com`; leave `VITE_API_URL` unset when using this same-origin proxy. This gives the owner a separate website URL with its own login and bundle. The main site has an additional `/owner` entry for local verification and optional access; the backend authorization protects both entries. If using a different backend address, change the API rewrite. A separate domain does not replace permission checks.

Local `npm run dev` exposes the portal at http://localhost:8080/owner.html. The backend must be running and privately configured. Local and Render databases remain separate.

## Capabilities and limits

Applications show submitted IDs, issuer, private proof download, reviewer notes, status, and assigned patients. Owners can approve/reject/suspend submitted doctor, caretaker and guardian accounts; caretaker eligibility and supervising doctor's patient boundaries remain enforced. Approval needs at least one patient and a review note. Existing verified doctors retain their original review workflow. Legacy/demo accounts without submitted evidence cannot be silently promoted. Proof contents require human checking; upload acceptance does not verify identity.

The records screen shows up to 500 records per collection: patients, medications, appointments, alerts, report metadata, latest vitals and audit events. It is read-only, not arbitrary SQL or a full database export. Password hashes, JWT secrets, database credentials, report bytes and storage paths are excluded. Owner tokens are stored separately in tab session storage, accepted for at most one hour, and revoked on logout. Ordinary portal tokens cannot access owner endpoints. Owner tokens cannot access the ordinary role endpoints. Login and proof views plus approval changes are audited. API rate limits still apply. No MFA is currently implemented.

## Persistent uploaded evidence

Render must use a persistent disk with `DATA_DIR` pointing to its mount path. PostgreSQL persists proof metadata, but proof files live under `DATA_DIR/verification-proofs`. A free ephemeral service can lose files after a deployment; metadata cannot reconstruct a lost proof. The portal reports unavailable proofs instead of inventing evidence. Back up files and database together. Existing files already lost need to be supplied again before review.
