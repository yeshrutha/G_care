// Authenticated caches are per tab; public demo previews keep their existing cache.
// The server remains authoritative for access and persistence.
export function patientStorage(): Storage {
  return window.sessionStorage.getItem('gcare_auth_token') ? window.sessionStorage : window.localStorage;
}
