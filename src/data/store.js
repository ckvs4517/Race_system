/**
 * 前端唯一狀態來源與雲端 API 存取層。
 * UI 不直接呼叫 fetch；畫面只讀取淺層狀態快照，寫入一律經過 store API。
 */
const AUTH_KEY = 'spin-admin-token';
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

let state = {
  tournaments: [],
  selectedTournamentId: null,
  selectedMatch: null,
  editingTournamentId: null,
  registrationTournamentId: null,
  registrations: [],
  isAdmin: false,
  loading: true,
  syncStatus: 'idle',
  error: null,
};

const listeners = new Set();
let refreshInFlight = false;
const responseEtags = new Map();
const EXPLICIT_RENDER_ACTIONS = new Set(['record_match', 'forfeit_match', 'replay_match']);

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

function authToken() {
  return sessionStorage.getItem(AUTH_KEY) || '';
}

/**
 * 呼叫後端 API，統一處理授權、ETag 與逾時。
 *
 * 行動瀏覽器在 Wi-Fi 切換、AP roaming 或背景喚醒後，fetch 偶爾可能長時間
 * 維持 pending。若沒有 timeout，呼叫端的按鈕會一直停在 disabled/saving 狀態，
 * polling 的 refreshInFlight 也會永遠佔用，直到整頁重新整理才恢復。
 *
 * @param {string} path API 路徑。
 * @param {RequestInit & { timeoutMs?: number }} options fetch 選項；timeoutMs 可覆寫預設逾時。
 * @returns {Promise<any>} API JSON payload，304 時回傳 { notModified: true }。
 */
async function api(path, options = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: upstreamSignal,
    ...fetchOptions
  } = options;
  const method = fetchOptions.method || 'GET';
  const headers = { ...(fetchOptions.headers || {}) };
  if (fetchOptions.body != null) headers['Content-Type'] = 'application/json';
  if (method === 'GET' && responseEtags.has(path)) headers['If-None-Match'] = responseEtags.get(path);
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortFromUpstream();
    else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
  }

  try {
    const response = await fetch(path, { ...fetchOptions, headers, signal: controller.signal });
    if (response.status === 304) return { notModified: true };
    const etag = response.headers.get('etag');
    if (method === 'GET' && etag) responseEtags.set(path, etag);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || '伺服器暫時無法處理要求。');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error('網路連線逾時，請確認連線後再試。');
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener?.('abort', abortFromUpstream);
  }
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
  // 防止輪詢尚未完成時又建立第二個相同要求；api() 的 timeout 確保此鎖一定會釋放。
  if (refreshInFlight) return false;
  refreshInFlight = true;
  try {
    const data = await api('/api/tournaments');
    if (data.notModified) return false;
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

export async function refreshTournament(tournamentId) {
  if (refreshInFlight || tournamentId == null) return false;
  refreshInFlight = true;
  try {
    const data = await api(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
    if (data.notModified || !data.tournament) return false;
    const current = state.tournaments.find((item) => item.id === data.tournament.id);
    if (current && Number(current.revision) === Number(data.tournament.revision)) return false;
    replaceTournament(data.tournament);
    state.syncStatus = 'updated';
    state.error = null;
    notify();
    return true;
  } catch (error) {
    if (error.status === 404) {
      state.tournaments = state.tournaments.filter((item) => item.id !== Number(tournamentId));
      reconcileSelections();
      notify();
    } else {
      state.error = error.message;
    }
    return false;
  } finally {
    refreshInFlight = false;
  }
}

export function getState() {
  // 畫面只讀取狀態；避免每次重繪都深拷貝全部賽事與數百場對戰。
  return { ...state, selectedMatch: state.selectedMatch ? { ...state.selectedMatch } : null };
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

export async function executeTournamentAction(tournamentId, type, payload = {}, { retryOnConflict = true } = {}) {
  requireAdmin();
  let base = state.tournaments.find((item) => item.id === tournamentId);
  if (!base) throw new Error('找不到這場賽事。');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    setSaving();
    try {
      const result = await api(`/api/tournaments/${encodeURIComponent(tournamentId)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ type, payload, expectedRevision: Number(base.revision) || 0 }),
      });
      replaceTournament(result.tournament);
      state.syncStatus = 'saved';
      state.error = null;
      // 正式記分、棄賽與重賽在 main.js 會先完成畫面導航後再 render。
      // 這裡若再 notify，會先重畫一次舊畫面，隨後又重畫賽程，造成平板額外負擔。
      if (!EXPLICIT_RENDER_ACTIONS.has(type)) notify();
      return result.tournament;
    } catch (error) {
      if (error.status === 409) {
        const latest = error.payload?.tournament;
        if (latest) replaceTournament(latest);
        else await refreshTournament(tournamentId);
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
  throw new Error('同步賽事操作時發生衝突。');
}

export async function loadTournamentRegistrations(tournamentId) {
  requireAdmin();
  const result = await api(`/api/tournaments/${encodeURIComponent(tournamentId)}/registrations`);
  state.registrationTournamentId = Number(tournamentId);
  state.registrations = Array.isArray(result.registrations) ? result.registrations : [];
  notify();
  return structuredClone(state.registrations);
}

export async function updateRegistrationRecord(registrationId, status) {
  requireAdmin();
  const tournament = state.tournaments.find((item) => item.id === state.registrationTournamentId);
  try {
    const result = await api(`/api/registrations/${encodeURIComponent(registrationId)}`, {
      method: 'PUT',
      body: JSON.stringify({ status, expectedRevision: Number(tournament?.revision) || 0 }),
    });
    if (result.tournament) replaceTournament(result.tournament);
    state.registrations = state.registrations.map((item) => item.id === registrationId ? result.registration : item);
    state.syncStatus = 'saved';
    state.error = null;
    notify();
    return structuredClone(result);
  } catch (error) {
    if (error.status === 409 && error.payload?.tournament) replaceTournament(error.payload.tournament);
    handleSaveError(error);
    throw error;
  }
}

export async function getPublicRegistration(tournamentId, token) {
  return api(`/api/public/registrations/${encodeURIComponent(tournamentId)}/${encodeURIComponent(token)}`);
}

export async function submitPublicRegistration(tournamentId, token, registration) {
  return api(`/api/public/registrations/${encodeURIComponent(tournamentId)}/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(registration),
  });
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
  state.registrationTournamentId = null;
  state.registrations = [];
  responseEtags.delete('/api/admin/session');
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