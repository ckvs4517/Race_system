const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (url.pathname === '/api/tournaments' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT data FROM tournaments ORDER BY updated_at DESC').all();
        const tournaments = result.results.map((row) => JSON.parse(row.data));
        return json({ tournaments });
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
        const tournaments = payload.tournaments.map(validateTournament);
        const statements = [env.DB.prepare('DELETE FROM tournaments')];
        for (const tournament of tournaments) {
          statements.push(env.DB.prepare('INSERT INTO tournaments (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind(String(tournament.id), JSON.stringify(tournament)));
        }
        await env.DB.batch(statements);
        return json({ ok: true, count: tournaments.length });
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
