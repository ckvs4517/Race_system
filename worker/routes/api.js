/** API routing/coordination. Business rules and D1 statements live outside this module. */
import { addConfirmedParticipant, MAX_TOURNAMENT_PLAYERS, randomizeDraftTournament } from '../tournament-domain.js';
import { listRegistrations, markRegistrationApproved, readRegistration, updateRegistrationStatus } from '../db/registrations.js';
import {
  deleteTournamentIfRevision,
  insertTournament,
  listTournaments,
  readTournament,
  replaceAllTournaments,
  updateTournamentIfRevision,
} from '../db/tournaments.js';
import { createToken, isAuthorized, safeEqual } from '../services/admin-auth.js';
import { validatePublicRegistrationAccess, publicRegistrationSummary, validateRegistration } from '../services/registration-validation.js';
import { applyTournamentAction } from '../services/tournament-actions.js';
import { withRevision, withoutRevision } from '../services/tournament-record.js';
import { validateTournament } from '../services/tournament-validation.js';
import {
  publicRegistrationFromPath,
  registrationIdFromPath,
  registrationListTournamentId,
  tournamentActionIdFromPath,
  tournamentIdFromPath,
} from './path-matchers.js';
import { collectionEtag, json, notModified, tournamentEtag } from './responses.js';

export async function handleApiRequest(request, env, url) {
  const publicRegistration = publicRegistrationFromPath(url.pathname);
  if (publicRegistration && request.method === 'GET') {
    const tournament = await readTournament(env.DB, publicRegistration.tournamentId);
    const accessError = validatePublicRegistrationAccess(tournament, publicRegistration.token);
    if (accessError) return json({ error: accessError }, accessError === '找不到這場報名活動。' ? 404 : 400);
    return json({ tournament: publicRegistrationSummary(tournament), registrationCount: tournament.players.length });
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
      if (await updateTournamentIfRevision(env.DB, nextTournament, tournament.revision)) {
        return json({ participant: { displayName: registration.displayName, drink: nextTournament.participantDetails?.[registration.displayName]?.drink || null } }, 201);
      }
    }
    return json({ error: '名單剛被更新，請再送出一次。' }, 409);
  }

  const adminRegistrationTournamentId = registrationListTournamentId(url.pathname);
  if (adminRegistrationTournamentId && request.method === 'GET') {
    if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
    return json({ registrations: await listRegistrations(env.DB, adminRegistrationTournamentId) });
  }

  const registrationId = registrationIdFromPath(url.pathname);
  if (registrationId && request.method === 'PUT') {
    if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
    const payload = await request.json();
    const status = String(payload.status || '');
    if (!['approved', 'waitlist', 'rejected'].includes(status)) return json({ error: '不支援的報名狀態。' }, 400);
    const registration = await readRegistration(env.DB, registrationId);
    if (!registration) return json({ error: '找不到這筆報名。' }, 404);
    if (status !== 'approved') {
      await updateRegistrationStatus(env.DB, registrationId, status);
      return json({ registration: { ...registration, status } });
    }

    const tournament = await readTournament(env.DB, registration.tournamentId);
    const expectedRevision = Number(payload.expectedRevision);
    if (!tournament || tournament.status !== '準備中') return json({ error: '只有準備中的賽事可以核准報名。' }, 409);
    if (!Number.isInteger(expectedRevision) || tournament.revision !== expectedRevision) return json({ error: '賽事名單已更新，請重新整理。', tournament }, 409);
    if (tournament.players.includes(registration.displayName)) {
      await markRegistrationApproved(env.DB, registrationId);
      return json({ registration: { ...registration, status: 'approved' }, tournament });
    }
    if (tournament.players.length >= MAX_TOURNAMENT_PLAYERS) return json({ error: `正式名單已達 ${MAX_TOURNAMENT_PLAYERS} 人上限。`, tournament }, 409);
    const nextTournament = withRevision(validateTournament({
      ...withoutRevision(tournament),
      players: [...tournament.players, registration.displayName],
      rounds: [],
      seedPlayerIndexes: [],
      seedDrawnAt: null,
      checkInVersion: 1,
      participantStates: {
        ...(tournament.participantStates || {}),
        [registration.displayName]: { status: 'active', checkedIn: false },
      },
    }), expectedRevision + 1);
    if (!(await updateTournamentIfRevision(env.DB, nextTournament, expectedRevision))) {
      return json({ error: '賽事名單已更新，請重新整理。', tournament: await readTournament(env.DB, tournament.id) }, 409);
    }
    await markRegistrationApproved(env.DB, registrationId);
    return json({ registration: { ...registration, status: 'approved' }, tournament: nextTournament });
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
    if (!(await updateTournamentIfRevision(env.DB, nextTournament, expectedRevision))) {
      return json({ error: '資料已由其他裁判更新。', tournament: await readTournament(env.DB, actionTournamentId) }, 409);
    }
    return json({ tournament: nextTournament });
  }

  if (url.pathname === '/api/tournaments' && request.method === 'GET') {
    const tournaments = await listTournaments(env.DB);
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
    if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
    const payload = await request.json();
    if (!Array.isArray(payload.tournaments) || payload.tournaments.length > 200) return json({ error: '賽事資料格式不正確。' }, 400);
    const tournaments = payload.tournaments.map((value) => withRevision(validateTournament(value), 1));
    await replaceAllTournaments(env.DB, tournaments);
    return json({ ok: true, count: tournaments.length, tournaments });
  }

  if (url.pathname === '/api/tournaments' && request.method === 'POST') {
    if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
    const payload = await request.json();
    const draft = validateTournament(payload.tournament);
    const shouldPrepareDraft = draft.status === '準備中' && draft.bracketVersion === 2;
    const tournament = withRevision(validateTournament(shouldPrepareDraft ? randomizeDraftTournament(draft) : draft), 1);
    const existing = await readTournament(env.DB, String(tournament.id));
    if (existing) return json({ error: '賽事識別碼重複，請重新建立。', tournament: existing }, 409);
    await insertTournament(env.DB, tournament);
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
    if (current.status !== '準備中' || tournament.status !== '準備中') return json({ error: '賽事開始後請使用正式賽事操作，不能整包覆寫資料。' }, 400);
    const nextTournament = withRevision(tournament, expectedRevision + 1);
    if (!(await updateTournamentIfRevision(env.DB, nextTournament, expectedRevision))) {
      return json({ error: '資料已由其他裁判更新。', tournament: await readTournament(env.DB, tournamentId) }, 409);
    }
    return json({ tournament: nextTournament });
  }

  if (tournamentId && request.method === 'DELETE') {
    if (!(await isAuthorized(request, env))) return json({ error: '後台登入已失效，請重新登入。' }, 401);
    const expectedRevision = Number(url.searchParams.get('revision'));
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return json({ error: '賽事版本資訊不正確。' }, 400);
    if (!(await deleteTournamentIfRevision(env.DB, tournamentId, expectedRevision))) {
      const latest = await readTournament(env.DB, tournamentId);
      return json({ error: latest ? '資料已由其他裁判更新。' : '這場賽事已被刪除。', tournament: latest }, 409);
    }
    return json({ ok: true });
  }

  return json({ error: '找不到此 API。' }, 404);
}
