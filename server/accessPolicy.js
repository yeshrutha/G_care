// Approval is separate from the role a person requests during registration.
export const DEMO_ACCOUNT_IDS = new Set([
  'user-demo-caretaker', 'user-demo-doctor', 'user-demo-guardian',
  'user-1790536871126-xdfb0l', 'user-1790535155932-ufytv9', 'user-1790535120996-1p6bav',
]);
export const DEMO_PATIENT_IDS = ['elder-1', 'elder-2', 'elder-3'];
export function isDemoAccount(user) {
  return process.env.DEMO_AUTH_ENABLED !== 'false' && process.env.NODE_ENV !== 'production'
    && DEMO_ACCOUNT_IDS.has(user?.id) && !user?.profile?.accessVerification;
}
export function hasApprovedAccess(user) {
  return user?.profile?.accessVerification?.status === 'approved' || isDemoAccount(user);
}
export function canReviewAccounts(user) {
  return user?.role === 'doctor' && user?.profile?.accessVerification?.status === 'approved';
}
export function safeEditableProfile(profile) {
  const allowed = ['elderName', 'elderAge', 'elderLanguage', 'elderConditions', 'elderPhone', 'elderAddress', 'hospital', 'specialization'];
  return Object.fromEntries(allowed.filter(k => typeof profile?.[k] === 'string').map(k => [k, profile[k].slice(0, 500)]));
}
export function publicAccount(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return { ...safe, accessStatus: isDemoAccount(user) ? 'demo' : (user.profile?.accessVerification?.status || 'pending') };
}
