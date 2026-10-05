import { dbService } from './db.js';
import { canReviewAccounts } from './accessPolicy.js';

export async function reviewAccess(reviewer, accountId, decision, elderIds, note, ownerReview = false) {
  const account = await dbService.findUserById(accountId);
  if (!account) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  const verification = account.profile?.accessVerification;
  if (!verification?.proofId || !verification?.issuer || (!verification?.proofReference && !verification?.proofFile?.id)) {
    throw Object.assign(new Error('The applicant must submit verification evidence first.'), { statusCode: 400 });
  }
  if (!ownerReview && (!canReviewAccounts(reviewer) || account.role === 'doctor' || verification.supervisingDoctorId !== reviewer.id)) {
    throw Object.assign(new Error('You cannot review this account.'), { statusCode: 403 });
  }
  if (!['approved', 'rejected', 'suspended'].includes(decision) || !note?.trim()) {
    throw Object.assign(new Error('Choose a decision and record the evidence review.'), { statusCode: 400 });
  }
  const assigned = decision === 'approved' ? [...new Set(elderIds || [])] : [];
  if (decision === 'approved') {
    if (!assigned.length) throw Object.assign(new Error('Select the patients this account may access.'), { statusCode: 400 });
    if (account.role === 'caretaker' && !['nurse', 'assistant'].includes(verification.staffKind)) {
      throw Object.assign(new Error('Caretaker access is restricted to a nurse or doctor assistant.'), { statusCode: 400 });
    }
    if (account.role !== 'doctor') {
      const doctor = await dbService.findUserById(verification.supervisingDoctorId);
      if (!canReviewAccounts(doctor)) throw Object.assign(new Error('A verified supervising doctor is required.'), { statusCode: 400 });
      if (assigned.some(id => !doctor.assignedElderIds?.includes(id))) {
        throw Object.assign(new Error('A patient is outside the supervising doctor’s assignments.'), { statusCode: 403 });
      }
    }
    for (const id of assigned) if (!(await dbService.getElderById(id))) {
      throw Object.assign(new Error('Patient not found'), { statusCode: 400 });
    }
  }
  const updated = await dbService.setUserAccess(account.id, {
    ...verification, status: decision, reviewedBy: reviewer.id,
    reviewedAt: new Date().toISOString(), reviewNote: note.trim().slice(0, 1000),
  }, assigned);
  await dbService.addAuditLog(reviewer, 'review_access', 'user', account.id, { decision, assignedElderIds: assigned });
  return updated;
}
