const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (url.pathname === '/api/tournaments' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT data, revision FROM tournaments ORDER BY updated_at DESC').all();
        const tournaments = result.results.map((row) => ({ ...JSON.parse(row.data), revision: Number(row.revision) || 0 }));
        return json({ tournaments });
      }

      const tournamentId = tournamentIdFromPath(url.pathname);
      if (tournamentId && request.method === 'GET') {
        const tournament = await readTournament(env.DB, tournamentId);
        return tournament ? json({ tournament }) : json({ error: '找不到這場賽事。' }, 404);
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        const { pin = '' } = await request.json();
        if (!env.ADMIN_PIN || !env.TOKEN_SECRET) return json({ error: '後台尚未完成安全設定。' }, 503);
        if (!(await safeEqual(String(pin), env.ADMIN_PIN))) return json({ error: 'PIN 不正確。' }, 401);
        return json({ token: await createToken(env.TOKEN_SECRET) });
      }

      if (url.pathname === '/api/admin/session' && request.method === 'GET') {
        return json({ authenticated: await isAuthorized(request, env) });
      }

      if (url.pathname === '/api/tournaments' && request.method === 'PUT') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const payload = await request.json();
        if (!Array.isArray(payload.tournaments) || payload.tournaments.length > 200) return json({ error: '賽事資料格式不正確。' }, 400);
        const tournaments = payload.tournaments.map((value) => withRevision(validateTournament(value), 1));
        const statements = [env.DB.prepare('DELETE FROM tournaments')];
        for (const tournament of tournaments) {
          statements.push(env.DB.prepare('INSERT INTO tournaments (id, data, revision, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').bind(String(tournament.id), JSON.stringify(withoutRevision(tournament)), tournament.revision));
        }
        await env.DB.batch(statements);
        return json({ ok: true, count: tournaments.length, tournaments });
      }

      if (url.pathname === '/api/tournaments' && request.method === 'POST') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const payload = await request.json();
        const tournament = withRevision(validateTournament(payload.tournament), 1);
        const existing = await readTournament(env.DB, String(tournament.id));
        if (existing) return json({ error: '賽事識別碼重複，請重新建立。', tournament: existing }, 409);
        await env.DB.prepare('INSERT INTO tournaments (id, data, revision, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
          .bind(String(tournament.id), JSON.stringify(withoutRevision(tournament)), tournament.revision).run();
        return json({ tournament }, 201);
      }

      if (tournamentId && request.method === 'PUT') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const payload = await request.json();
        const expectedRevision = Number(payload.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ error: '賽事版本資訊不正確。' }, 400);
        const tournament = validateTournament(payload.tournament);
        if (String(tournament.id) !== tournamentId) return json({ error: '賽事識別碼不一致。' }, 400);
        const nextTournament = withRevision(tournament, expectedRevision + 1);
        const result = await env.DB.prepare('UPDATE tournaments SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
          .bind(JSON.stringify(withoutRevision(nextTournament)), nextTournament.revision, tournamentId, expectedRevision).run();
        if (!changedRows(result)) {
          const latest = await readTournament(env.DB, tournamentId);
          return json({ error: '資料已由其他裁判更新。', tournament: latest }, 409);
        }
        return json({ tournament: nextTournament });
      }

      if (tournamentId && request.method === 'DELETE') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const expectedRevision = Number(url.searchParams.get('revision'));
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ error: '賽事版本資訊不正確。' }, 400);
        const result = await env.DB.prepare('DELETE FROM tournaments WHERE id = ? AND revision = ?').bind(tournamentId, expectedRevision).run();
        if (!changedRows(result)) {
          const latest = await readTournament(env.DB, tournamentId);
          return json({ error: latest ? '資料已由其他裁判更新。' : '這場賽事已被刪除。', tournament: latest }, 409);
        }
        return json({ ok: true });
      }

      return json({ error: '找不到此 API。' }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: '伺服器發生錯誤，請稍後再試。' }, 500);
    }
  },
};

function validateTournament(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid tournament');
  if (!Number.isFinite(Number(value.id))) throw new Error('Invalid tournament id');
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) throw new Error('Invalid tournament name');
  if (!Array.isArray(value.players) || value.players.length < 2 || value.players.length > 32) throw new Error('Invalid players');
  return value;
}

function tournamentIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readTournament(database, id) {
  const row = await database.prepare('SELECT data, revision FROM tournaments WHERE id = ?').bind(String(id)).first();
  return row ? { ...JSON.parse(row.data), revision: Number(row.revision) || 0 } : null;
}

function withRevision(tournament, revision) {
  return { ...tournament, revision };
}

function withoutRevision(tournament) {
  const copy = { ...tournament };
  delete copy.revision;
  return copy;
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0) > 0;
}

async function isAuthorized(request, env) {
  if (!env.TOKEN_SECRET) return false;
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await sign(payload, env.TOKEN_SECRET);
  if (!(await safeEqual(signature, expected))) return false;
  try {
    const claims = JSON.parse(decodeBase64Url(payload));
    return claims.role === 'admin' && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function createToken(secret) {
  const payload = encodeBase64Url(JSON.stringify({ role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }));
  return `${payload}.${await sign(payload, secret)}`;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([left, right].map((value) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
  const aa = new Uint8Array(a); const bb = new Uint8Array(b);
  let mismatch = 0;
  for (let index = 0; index < aa.length; index += 1) mismatch |= aa[index] ^ bb[index];
  return mismatch === 0;
}

function encodeBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
