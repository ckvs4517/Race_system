/** HTTP response and cache validators for Worker routes. */
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function notModified(etag) {
  return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-cache' } });
}

export function tournamentEtag(tournament, visibility = 'public') {
  const prefix = visibility === 'admin' ? 'ta' : 't';
  return `\"${prefix}-${String(tournament.id)}-${Number(tournament.revision) || 0}\"`;
}

export function collectionEtag(tournaments, visibility = 'public') {
  const signature = tournaments.map((tournament) => `${tournament.id}:${Number(tournament.revision) || 0}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const prefix = visibility === 'admin' ? 'tla' : 'tl';
  return `\"${prefix}-${tournaments.length}-${(hash >>> 0).toString(36)}\"`;
}
