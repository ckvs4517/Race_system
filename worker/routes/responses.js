/** HTTP response and cache validators for Worker routes. */
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function notModified(etag) {
  return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-cache' } });
}

export function tournamentEtag(tournament) {
  return `\"t-${String(tournament.id)}-${Number(tournament.revision) || 0}\"`;
}

export function collectionEtag(tournaments) {
  const signature = tournaments.map((tournament) => `${tournament.id}:${Number(tournament.revision) || 0}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `\"tl-${tournaments.length}-${(hash >>> 0).toString(36)}\"`;
}
