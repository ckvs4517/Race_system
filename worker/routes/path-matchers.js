/** API pathname parsing kept separate from request handlers. */
export function publicRegistrationFromPath(pathname) {
  const match = pathname.match(/^\/api\/public\/registrations\/([^/]+)\/([^/]+)$/);
  return match ? { tournamentId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) } : null;
}

export function registrationListTournamentId(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)\/registrations$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function registrationIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/registrations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function tournamentActionIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)\/actions$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function tournamentIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
