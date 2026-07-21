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

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

function authToken() {
  return sessionStorage.getItem(AUTH_KEY) || '';
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = authToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || '伺服器暫時無法處理要求。');
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

export function getState() {
  return structuredClone(state);
}

export function updateState(updater) {
  const previousTournaments = state.tournaments;
  state = updater(getState());
  notify();
  if (state.tournaments !== previousTournaments) persistTournaments();
}

async function persistTournaments() {
  if (!state.isAdmin) {
    state.error = '只有登入後台才能修改正式賽事。';
    notify();
    await initializeStore();
    return;
  }
  state.syncStatus = 'saving';
  state.error = null;
  notify();
  try {
    await api('/api/tournaments', { method: 'PUT', body: JSON.stringify({ tournaments: state.tournaments }) });
    state.syncStatus = 'saved';
  } catch (error) {
    state.syncStatus = 'error';
    state.error = error.message;
    await initializeStore();
  }
  notify();
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
