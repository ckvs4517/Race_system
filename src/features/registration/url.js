/** 報名連結格式集中管理，避免 schedule / registration 各自拼接 hash。 */
export function registrationUrl(tournamentId, token) {
  return `${location.origin}${location.pathname}#register/${encodeURIComponent(tournamentId)}/${encodeURIComponent(token)}`;
}

export function registrationRouteParams() {
  const match = location.hash.match(/^#register\/([^/]+)\/([^/]+)$/);
  return match ? { tournamentId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) } : null;
}
