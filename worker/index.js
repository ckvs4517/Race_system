/**
 * Cloudflare Worker 進入點。
 * `/api/*` 由此處理，其餘要求交給靜態資源服務；D1 revision 提供樂觀鎖保護。
 */
import {
  addConfirmedParticipant,
  addDraftPlayer,
  confirmTournamentSchedule,
  drawRandomSeeds,
  forfeitMatch,
  prepareTournamentSchedule,
  randomizeDraftTournament,
  randomizeTournamentSchedule,
  recordMatchResult,
  removeDraftPlayer,
  resetCompletedMatch,
  setDraftPlayerCheckedIn,
  startSwissFinal,
  startSwissQualifier,
  startTournament,
  updateOpeningPairings,
  updateDraftParticipant,
  updateRegistrationSettings,
  withdrawPlayer,
} from '../src/domain/tournament.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      const publicRegistration = publicRegistrationFromPath(url.pathname);
      if (publicRegistration && request.method === 'GET') {
        const tournament = await readTournament(env.DB, publicRegistration.tournamentId);
        const accessError = validatePublicRegistrationAccess(tournament, publicRegistration.token);
        if (accessError) return json({ error: accessError }, accessError === '找不到這場報名活動。' ? 404 : 400);
        return json({
          tournament: publicRegistrationSummary(tournament),
          registrationCount: tournament.players.length,
        });
      }

      if (publicRegistration && request.method === 'POST') {
        const payload = await request.json();
        if (payload.website) return json({ ok: true });
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const tournament = await readTournament(env.DB, publicRegistration.tournamentId);
          const accessError = validatePublicRegistrationAccess(tournament, publicRegistration.token);
          if (accessError) return json({ error: accessError }, accessError === '找不到這場報名活動。' ? 404 : 400);
          const registration = validateRegistration(payload, tournament);
          let updated;
          try {
            updated = addConfirmedParticipant(withoutRevision(tournament), registration);
          } catch (error) {
            const message = error.message || '參賽資料無法送出。';
            return json({ error: message }, /已經|名額已滿/.test(message) ? 409 : 400);
          }
          const nextTournament = withRevision(validateTournament(withoutRevision(updated)), tournament.revision + 1);
          const result = await env.DB.prepare('UPDATE tournaments SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
            .bind(JSON.stringify(withoutRevision(nextTournament)), nextTournament.revision, publicRegistration.tournamentId, tournament.revision).run();
          if (changedRows(result)) {
            return json({
              participant: {
                displayName: registration.displayName,
                drink: nextTournament.participantDetails?.[registration.displayName]?.drink || null,
              },
            }, 201);
          }
        }
        return json({ error: '名單剛被更新，請再送出一次。' }, 409);
      }

      const adminRegistrationTournamentId = registrationListTournamentId(url.pathname);
      if (adminRegistrationTournamentId && request.method === 'GET') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const result = await env.DB.prepare('SELECT id, tournament_id, display_name, phone, notes, answers, status, created_at, updated_at FROM registrations WHERE tournament_id = ? ORDER BY created_at ASC')
          .bind(adminRegistrationTournamentId).all();
        return json({ registrations: result.results.map(mapRegistrationRow) });
      }

      const registrationId = registrationIdFromPath(url.pathname);
      if (registrationId && request.method === 'PUT') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const payload = await request.json();
        const status = String(payload.status || '');
        if (!['approved', 'waitlist', 'rejected'].includes(status)) return json({ error: '不支援的報名狀態。' }, 400);
        const row = await env.DB.prepare('SELECT id, tournament_id, display_name, phone, notes, answers, status, created_at, updated_at FROM registrations WHERE id = ?')
          .bind(registrationId).first();
        if (!row) return json({ error: '找不到這筆報名。' }, 404);
        if (status !== 'approved') {
          await env.DB.prepare('UPDATE registrations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(status, registrationId).run();
          return json({ registration: { ...mapRegistrationRow(row), status } });
        }

        const tournament = await readTournament(env.DB, row.tournament_id);
        const expectedRevision = Number(payload.expectedRevision);
        if (!tournament || tournament.status !== '準備中') return json({ error: '只有準備中的賽事可以核准報名。' }, 409);
        if (!Number.isInteger(expectedRevision) || tournament.revision !== expectedRevision) return json({ error: '賽事名單已更新，請重新整理。', tournament }, 409);
        if (tournament.players.includes(row.display_name)) {
          await env.DB.prepare("UPDATE registrations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(registrationId).run();
          return json({ registration: { ...mapRegistrationRow(row), status: 'approved' }, tournament });
        }
        if (tournament.players.length >= 32) return json({ error: '正式名單已達 32 人上限。', tournament }, 409);
        const nextTournament = withRevision(validateTournament({
          ...withoutRevision(tournament),
          players: [...tournament.players, row.display_name],
          rounds: [],
          seedPlayerIndexes: [],
          seedDrawnAt: null,
          checkInVersion: 1,
          participantStates: {
            ...(tournament.participantStates || {}),
            [row.display_name]: { status: 'active', checkedIn: false },
          },
        }), expectedRevision + 1);
        const tournamentResult = await env.DB.prepare('UPDATE tournaments SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
          .bind(JSON.stringify(withoutRevision(nextTournament)), nextTournament.revision, String(tournament.id), expectedRevision).run();
        if (!changedRows(tournamentResult)) return json({ error: '賽事名單已更新，請重新整理。', tournament: await readTournament(env.DB, tournament.id) }, 409);
        await env.DB.prepare("UPDATE registrations SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(registrationId).run();
        return json({ registration: { ...mapRegistrationRow(row), status: 'approved' }, tournament: nextTournament });
      }

      const actionTournamentId = tournamentActionIdFromPath(url.pathname);
      if (actionTournamentId && request.method === 'POST') {
        if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
        const payload = await request.json();
        const expectedRevision = Number(payload.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ error: '賽事版本資訊不正確。' }, 400);
        const current = await readTournament(env.DB, actionTournamentId);
        if (!current) return json({ error: '找不到這場賽事。' }, 404);
        if (current.revision !== expectedRevision) return json({ error: '資料已由其他裁判更新。', tournament: current }, 409);
        let updated;
        try {
          updated = applyTournamentAction(withoutRevision(current), String(payload.type || ''), payload.payload || {});
        } catch (error) {
          return json({ error: error.message || '賽事操作無法執行。' }, 400);
        }
        const nextTournament = withRevision(validateTournament(withoutRevision(updated)), expectedRevision + 1);
        const result = await env.DB.prepare('UPDATE tournaments SET data = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?')
          .bind(JSON.stringify(withoutRevision(nextTournament)), nextTournament.revision, actionTournamentId, expectedRevision).run();
        if (!changedRows(result)) return json({ error: '資料已由其他裁判更新。', tournament: await readTournament(env.DB, actionTournamentId) }, 409);
        return json({ tournament: nextTournament });
      }

      if (url.pathname === '/api/tournaments' && request.method === 'GET') {
        const result = await env.DB.prepare('SELECT data, revision FROM tournaments ORDER BY updated_at DESC').all();
        const tournaments = result.results.map((row) => ({ ...JSON.parse(row.data), revision: Number(row.revision) || 0 }));
        const etag = collectionEtag(tournaments);
        if (request.headers.get('if-none-match') === etag) return notModified(etag);
        return json({ tournaments }, 200, { etag });
      }

      const tournamentId = tournamentIdFromPath(url.pathname);
      if (tournamentId && request.method === 'GET') {
        const tournament = await readTournament(env.DB, tournamentId);
        if (!tournament) return json({ error: '找不到這場賽事。' }, 404);
        const etag = tournamentEtag(tournament);
        if (request.headers.get('if-none-match') === etag) return notModified(etag);
        return json({ tournament }, 200, { etag });
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
        // 全量取代只供 JSON 備份還原；一般操作都使用單場賽事 API。
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
        const draft = validateTournament(payload.tournament);
        // 新賽事的隨機分組由伺服器產生，避免不同前端各自形成不同版本。
        const shouldPrepareDraft = draft.status === '準備中' && draft.bracketVersion === 2;
        const tournament = withRevision(validateTournament(shouldPrepareDraft ? randomizeDraftTournament(draft) : draft), 1);
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
        const current = await readTournament(env.DB, tournamentId);
        if (!current) return json({ error: '找不到這場賽事。' }, 404);
        if (current.revision !== expectedRevision) return json({ error: '資料已由其他裁判更新。', tournament: current }, 409);
        // 整包 PUT 只供草稿表單編輯；開賽後必須走後端 action，不能從前端竄改比分或晉級。
        if (current.status !== '準備中' || tournament.status !== '準備中') {
          return json({ error: '賽事開始後請使用正式賽事操作，不能整包覆寫資料。' }, 400);
        }
        const nextTournament = withRevision(tournament, expectedRevision + 1);
        // revision 不相符就不更新，避免過期裁判畫面覆蓋較新的賽果。
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
      if (String(error?.message || '').includes('UNIQUE')) return json({ error: '這位選手已經送出過報名。' }, 409);
      if (String(error?.message || '').startsWith('Invalid registration:')) return json({ error: String(error.message).slice(22) }, 400);
      console.error(error);
      return json({ error: '伺服器發生錯誤，請稍後再試。' }, 500);
    }
  },
};

function validateTournament(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid tournament');
  if (!Number.isFinite(Number(value.id))) throw new Error('Invalid tournament id');
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) throw new Error('Invalid tournament name');
  if (!Array.isArray(value.players) || value.players.length > 32 || (value.status !== '準備中' && value.players.length < 2)) throw new Error('Invalid players');
  if (value.eventInfo != null) {
    if (typeof value.eventInfo !== 'object' || Array.isArray(value.eventInfo)) throw new Error('Invalid event info');
    const limits = { date: 10, checkInStart: 5, checkInEnd: 5, startTime: 5, venueName: 80, address: 160, mapUrl: 500, postUrl: 500, notes: 2000 };
    for (const [key, limit] of Object.entries(limits)) {
      if (value.eventInfo[key] != null && (typeof value.eventInfo[key] !== 'string' || value.eventInfo[key].length > limit)) throw new Error(`Invalid event info: ${key}`);
    }
  }
  if (value.registrationSettings != null) {
    const settings = value.registrationSettings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid registration settings');
    if (typeof settings.token !== 'string' || settings.token.length < 16 || settings.token.length > 100) throw new Error('Invalid registration token');
    if (!Number.isInteger(Number(settings.capacity)) || Number(settings.capacity) < 2 || Number(settings.capacity) > 32) throw new Error('Invalid registration capacity');
    if (typeof settings.deadline !== 'string' || settings.deadline.length > 30) throw new Error('Invalid registration deadline');
    if (!Array.isArray(settings.fields) || settings.fields.length > 20) throw new Error('Invalid registration fields');
  }
  if (value.drinkSettings != null) validateDrinkSettings(value.drinkSettings);
  if (value.participantDetails != null && (!value.participantDetails || typeof value.participantDetails !== 'object' || Array.isArray(value.participantDetails))) {
    throw new Error('Invalid participant details');
  }
  return value;
}

function validateRegistration(payload, tournament) {
  const displayName = cleanRegistrationText(payload.displayName, 60, '請輸入選手名稱。');
  const phone = cleanRegistrationText(payload.phone, 40, '請輸入聯絡電話。');
  const notes = cleanOptionalRegistrationText(payload.notes, 500, '備註內容過長。');
  const answers = {};
  const suppliedAnswers = payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers) ? payload.answers : {};
  for (const field of tournament.registrationSettings.fields || []) {
    const raw = suppliedAnswers[field.id];
    const value = field.type === 'checkbox' ? Boolean(raw) : cleanOptionalRegistrationText(raw, field.type === 'textarea' ? 1000 : 200, `${field.label}內容過長。`);
    if (field.required && (value === '' || value === false)) throw new Error(`Invalid registration:請填寫${field.label}。`);
    answers[field.id] = value;
  }
  return {
    displayName,
    phone,
    notes,
    answers,
    drink: payload.drink,
  };
}

function validateDrinkSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid drink settings');
  if (typeof settings.enabled !== 'boolean') throw new Error('Invalid drink settings');
  if (!Array.isArray(settings.coffeeFlavors) || settings.coffeeFlavors.length > 20) throw new Error('Invalid drink settings');
  if (!Array.isArray(settings.caffeineFreeOptions) || settings.caffeineFreeOptions.length > 30) throw new Error('Invalid drink settings');
  if (String(settings.notice || '').length > 500 || String(settings.changeNotice || '').length > 500) throw new Error('Invalid drink settings');
}

function cleanRegistrationText(value, maximumLength, missingMessage) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Invalid registration:${missingMessage}`);
  if (text.length > maximumLength) throw new Error(`Invalid registration:${missingMessage.replace('請輸入', '').replace('。', '')}內容過長。`);
  return text;
}

function cleanOptionalRegistrationText(value, maximumLength, longMessage) {
  const text = String(value || '').trim();
  if (text.length > maximumLength) throw new Error(`Invalid registration:${longMessage}`);
  return text;
}

function validatePublicRegistrationAccess(tournament, token) {
  if (!tournament || !tournament.registrationSettings || tournament.registrationSettings.token !== token) return '找不到這場報名活動。';
  if (!tournament.registrationSettings.enabled) return '這場賽事目前沒有開放報名。';
  if (tournament.status !== '準備中') return '這場賽事已經停止報名。';
  if (tournament.registrationSettings.deadline && new Date(tournament.registrationSettings.deadline).getTime() < Date.now()) return '這場賽事的報名時間已截止。';
  return '';
}

function publicRegistrationSummary(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    eventInfo: tournament.eventInfo || {},
    capacity: tournament.registrationSettings.capacity,
    deadline: tournament.registrationSettings.deadline,
    fields: tournament.registrationSettings.fields || [],
    drinkSettings: tournament.drinkSettings || { enabled: false, coffeeFlavors: [], caffeineFreeOptions: [] },
  };
}

function mapRegistrationRow(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    displayName: row.display_name,
    phone: row.phone,
    notes: row.notes,
    answers: JSON.parse(row.answers || '{}'),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicRegistrationFromPath(pathname) {
  const match = pathname.match(/^\/api\/public\/registrations\/([^/]+)\/([^/]+)$/);
  return match ? { tournamentId: decodeURIComponent(match[1]), token: decodeURIComponent(match[2]) } : null;
}

function registrationListTournamentId(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)\/registrations$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function registrationIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/registrations\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function tournamentActionIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)\/actions$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function tournamentIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/tournaments\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function applyTournamentAction(tournament, type, payload) {
  switch (type) {
    case 'set_check_in':
      return setDraftPlayerCheckedIn(tournament, String(payload.player || ''), Boolean(payload.checkedIn));
    case 'add_player':
      return addDraftPlayer(tournament, String(payload.player || ''), payload.details || {});
    case 'update_participant':
      return updateDraftParticipant(tournament, String(payload.player || ''), String(payload.nextName || ''), payload.details || {});
    case 'remove_player':
      return removeDraftPlayer(tournament, String(payload.player || ''));
    case 'remove_players': {
      const players = Array.isArray(payload.players) ? [...new Set(payload.players.map(String))] : [];
      if (!players.length || players.length > 32) throw new Error('請選擇要移除的選手。');
      return players.reduce((current, player) => removeDraftPlayer(current, player), tournament);
    }
    case 'draw_seeds':
      return drawRandomSeeds(tournament);
    case 'randomize_bracket':
      return randomizeDraftTournament(tournament);
    case 'start_tournament':
      return startTournament(tournament);
    case 'prepare_tournament_schedule':
      return prepareTournamentSchedule(tournament);
    case 'randomize_schedule':
      return randomizeTournamentSchedule(tournament);
    case 'update_opening_pairings':
      return updateOpeningPairings(tournament, Array.isArray(payload.pairs) ? payload.pairs : []);
    case 'confirm_tournament_schedule':
      return confirmTournamentSchedule(tournament);
    case 'record_match':
      return recordMatchResult(tournament, Number(payload.roundIndex), Number(payload.matchIndex), Number(payload.scoreA), Number(payload.scoreB));
    case 'forfeit_match':
      return forfeitMatch(tournament, Number(payload.roundIndex), Number(payload.matchIndex), String(payload.player || ''));
    case 'replay_match':
      return resetCompletedMatch(tournament, Number(payload.roundIndex), Number(payload.matchIndex));
    case 'withdraw_player':
      return withdrawPlayer(tournament, String(payload.player || ''), payload.status === 'no_show' ? 'no_show' : 'withdrawn');
    case 'start_swiss_qualifier':
      return startSwissQualifier(tournament, Array.isArray(payload.players) ? payload.players.map(String) : []);
    case 'start_swiss_final':
      return startSwissFinal(tournament, Array.isArray(payload.players) ? payload.players.map(String) : []);
    case 'update_registration_settings':
      return updateRegistrationSettings(tournament, payload.settings || {});
    default:
      throw new Error('不支援的賽事操作。');
  }
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

function tournamentEtag(tournament) {
  return `"t-${String(tournament.id)}-${Number(tournament.revision) || 0}"`;
}

function collectionEtag(tournaments) {
  const signature = tournaments.map((tournament) => `${tournament.id}:${Number(tournament.revision) || 0}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `"tl-${tournaments.length}-${(hash >>> 0).toString(36)}"`;
}

function notModified(etag) {
  return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-cache' } });
}

async function isAuthorized(request, env) {
  // 權杖是短期 HMAC 簽章，不需在資料庫保存工作階段。
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
  // 先雜湊為固定長度再逐位比較，降低字串比較時間差洩漏資訊。
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

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
