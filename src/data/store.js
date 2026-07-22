/**
 * 前端唯一狀態來源與雲端 API 存取層。
 * UI 不直接呼叫 fetch；回傳值使用 structuredClone，避免畫面直接修改 store。
 */
const AUTH_KEY = 'spin-admin-token';

let state = {
  tournaments: [],
  selectedTournamentId: null,
  selectedMatch: null,
  editingTournamentId: null,
  isAdmin: false,
  loading: true,
  syncStatus: 'idle',
  error: null,
};

const listeners = new Set();
let refreshInFlight = false;

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

function authToken() {
  return sessionStorage.getItem(AUTH_KEY) || '';
}

async function api(path, options = {}) {
  // 管理權杖只存在 sessionStorage，關閉分頁後瀏覽器會自動清除。
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '伺服器暫時無法處理要求。');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function initializeStore() {
  state.loading = true;
  state.error = null;
  notify();
  try {
    const [data, session] = await Promise.all([
      api('/api/tournaments'),
      authToken() ? api('/api/admin/session') : Promise.resolve({ authenticated: false }),
    ]);
    state.tournaments = Array.isArray(data.tournaments) ? data.tournaments : [];
    state.isAdmin = Boolean(session.authenticated);
    if (!state.isAdmin) sessionStorage.removeItem(AUTH_KEY);
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    notify();
  }
}

export async function refreshTournaments() {
  // 防止 3 秒輪詢尚未完成時又建立第二個相同要求。
  if (refreshInFlight) return false;
  refreshInFlight = true;
  try {
    const data = await api('/api/tournaments');
    const incoming = Array.isArray(data.tournaments) ? data.tournaments : [];
    if (sameTournamentVersions(state.tournaments, incoming)) return false;
    state.tournaments = incoming;
    reconcileSelections();
    state.syncStatus = 'updated';
    state.error = null;
    notify();
    return true;
  } catch (error) {
    state.error = error.message;
    return false;
  } finally {
    refreshInFlight = false;
  }
}

export function getState() {
  return structuredClone(state);
}

export function updateState(updater) {
  state = updater(getState());
  notify();
}

export async function createTournamentRecord(tournament) {
  requireAdmin();
  setSaving();
  try {
    const result = await api('/api/tournaments', { method: 'POST', body: JSON.stringify({ tournament }) });
    state.tournaments = [result.tournament, ...state.tournaments.filter((item) => item.id !== result.tournament.id)];
    state.syncStatus = 'saved';
    state.error = null;
    notify();
    return structuredClone(result.tournament);
  } catch (error) {
    handleSaveError(error);
    throw error;
  }
}

export async function mutateTournament(tournamentId, updater, { retryOnConflict = false } = {}) {
  // 樂觀鎖：送出操作所依據的 revision，後端只接受最新版本。
  requireAdmin();
  let base = state.tournaments.find((item) => item.id === tournamentId);
  if (!base) throw new Error('找不到這場賽事。');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let updated;
    try {
      updated = updater(structuredClone(base));
    } catch (error) {
      if (attempt > 0) throw new Error('這場比賽已由其他裁判更新，已載入最新賽果。');
      throw error;
    }
    setSaving();
    try {
      const result = await api(`/api/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: 'PUT',
        body: JSON.stringify({ tournament: updated, expectedRevision: Number(base.revision) || 0 }),
      });
      replaceTournament(result.tournament);
      state.syncStatus = 'saved';
      state.error = null;
      notify();
      return structuredClone(result.tournament);
    } catch (error) {
      if (error.status === 409) {
        // 先套用伺服器最新版；可安全合併的操作最多自動重試一次。
        const latest = error.payload?.tournament;
        if (latest) replaceTournament(latest);
        else await refreshTournaments();
        base = state.tournaments.find((item) => item.id === tournamentId);
        if (retryOnConflict && attempt === 0 && base) continue;
        const conflict = new Error('資料已由其他裁判更新，已載入最新內容，請確認後再操作。');
        state.syncStatus = 'conflict';
        state.error = conflict.message;
        notify();
        throw conflict;
      }
      handleSaveError(error);
      throw error;
    }
  }
  throw new Error('同步賽事資料時發生衝突。');
}

export async function deleteTournamentRecord(tournamentId) {
  requireAdmin();
  const tournament = state.tournaments.find((item) => item.id === tournamentId);
  if (!tournament) throw new Error('找不到這場賽事。');
  setSaving();
  try {
    await api(`/api/tournaments/${encodeURIComponent(tournamentId)}?revision=${Number(tournament.revision) || 0}`, { method: 'DELETE' });
    state.tournaments = state.tournaments.filter((item) => item.id !== tournamentId);
    reconcileSelections();
    state.syncStatus = 'saved';
    state.error = null;
    notify();
  } catch (error) {
    if (error.status === 409) await refreshTournaments();
    handleSaveError(error);
    throw error;
  }
}

export async function replaceTournamentRecords(tournaments) {
  requireAdmin();
  setSaving();
  try {
    const result = await api('/api/tournaments', { method: 'PUT', body: JSON.stringify({ tournaments }) });
    state.tournaments = Array.isArray(result.tournaments) ? result.tournaments : [];
    reconcileSelections();
    state.syncStatus = 'saved';
    state.error = null;
    notify();
  } catch (error) {
    handleSaveError(error);
    throw error;
  }
}

export async function loginAdmin(pin) {
  const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ pin }) });
  sessionStorage.setItem(AUTH_KEY, result.token);
  state.isAdmin = true;
  state.error = null;
  notify();
}

export function logoutAdmin() {
  sessionStorage.removeItem(AUTH_KEY);
  state.isAdmin = false;
  state.editingTournamentId = null;
  notify();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function selectTournament(id) {
  state.selectedTournamentId = id == null ? null : Number(id);
  state.selectedMatch = null;
}

export function selectMatch(roundIndex, matchIndex) {
  state.selectedMatch = roundIndex == null || matchIndex == null
    ? null
    : { roundIndex: Number(roundIndex), matchIndex: Number(matchIndex) };
}

export function selectEditingTournament(id) {
  state.editingTournamentId = id == null ? null : Number(id);
}

function setSaving() {
  state.syncStatus = 'saving';
  state.error = null;
}

function handleSaveError(error) {
  state.syncStatus = error.status === 409 ? 'conflict' : 'error';
  state.error = error.message;
  notify();
}

function requireAdmin() {
  if (!state.isAdmin) throw new Error('只有登入後台才能修改正式賽事。');
}

function replaceTournament(tournament) {
  state.tournaments = state.tournaments.map((item) => item.id === tournament.id ? tournament : item);
  if (!state.tournaments.some((item) => item.id === tournament.id)) state.tournaments.unshift(tournament);
  reconcileSelections();
}

function reconcileSelections() {
  // 雲端刷新後，清除已刪除賽事或已被其他裁判完成的目前選取項目。
  if (state.selectedTournamentId != null && !state.tournaments.some((item) => item.id === state.selectedTournamentId)) {
    state.selectedTournamentId = null;
    state.selectedMatch = null;
  }
  if (state.selectedMatch && state.selectedTournamentId != null) {
    const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
    const match = tournament?.rounds?.[state.selectedMatch.roundIndex]?.matches?.[state.selectedMatch.matchIndex];
    if (!match || match.status !== '可開始') state.selectedMatch = null;
  }
  if (state.editingTournamentId != null && !state.tournaments.some((item) => item.id === state.editingTournamentId)) state.editingTournamentId = null;
}

function sameTournamentVersions(current, incoming) {
  if (current.length !== incoming.length) return false;
  const currentVersions = new Map(current.map((item) => [String(item.id), Number(item.revision) || 0]));
  return incoming.every((item) => currentVersions.get(String(item.id)) === (Number(item.revision) || 0));
}
