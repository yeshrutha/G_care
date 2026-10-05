// Owner approval is a local administrative operation, never a public signup role.
// Run only after independently checking the doctor's submitted evidence.
import fs from 'node:fs/promises';
import { readProofFile } from './verificationFiles.js';
import { initDb, dbService, closeDb } from './db.js';
import { reviewAccess } from './accessReview.js';
import { publicAccount } from './accessPolicy.js';

const [command, email, decision, patients, ...reviewWords] = process.argv.slice(2);
await initDb();
try {
if (command === 'list') {
  const users = await dbService.listUsers();
  console.log(JSON.stringify(users.filter(u => u.role === 'doctor' && u.profile?.accessVerification).map(publicAccount), null, 2));
} else if (command === 'proof' && email && decision) {
  const account = await dbService.findUserByEmail(email);
  if (account?.role !== 'doctor' || !account.profile?.accessVerification?.proofFile) throw new Error('No uploaded doctor proof found.');
  await fs.writeFile(decision, await readProofFile(account.profile.accessVerification.proofFile), { flag: 'wx', mode: 0o600 });
  console.log('Proof exported for owner review.');
} else if (command === 'review' && email && ['approved', 'rejected', 'suspended'].includes(decision)) {
  const account = await dbService.findUserByEmail(email);
  if (!account || account.role !== 'doctor') throw new Error('Use the owner tool only for a doctor account. Verified doctors review their own staff/guardians.');
  const user = await reviewAccess({ id: 'project-owner', name: 'Project Owner' }, account.id, decision,
    patients === '-' ? [] : (patients || '').split(',').filter(Boolean), reviewWords.join(' '), true);
  console.log(JSON.stringify({ email: user.email, status: user.profile.accessVerification.status, assignedElderIds: user.assignedElderIds }, null, 2));
} else {
  console.log('Usage: node server/review-access.js list');
  console.log('Usage: node server/review-access.js proof <doctor-email> <new-output-file>');
  console.log('Usage: node server/review-access.js review <doctor-email> approved <comma-separated-patient-IDs> <evidence-review-note>');
  console.log('For rejection/suspension, use - for the patient IDs. Back up the data and stop the API before owner review; restart afterward.');
  process.exitCode = 1;
}

} finally { await closeDb(); }
