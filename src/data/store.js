const STORAGE_KEY = 'spin-tournaments';

function readTournaments() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

let state = {
  tournaments: readTournaments(),
  selectedTournamentId: null,
};

const listeners = new Set();

export function getState() {
  return structuredClone(state);
}

export function updateState(updater) {
  state = updater(getState());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tournaments));
  listeners.forEach((listener) => listener(getState()));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function selectTournament(id) {
  state.selectedTournamentId = Number(id);
}
