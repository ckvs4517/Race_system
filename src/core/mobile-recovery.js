/** 行動瀏覽器從 BFCache 或斷網恢復時，立即重新驗證目前賽事資料。 */
import { getState, refreshTournament, refreshTournaments } from '../data/store.js';

let recoveryInFlight = false;

export async function recoverMobileSession() {
  if (recoveryInFlight || document.visibilityState !== 'visible' || navigator.onLine === false) return false;
  const state = getState();
  if (state.loading) return false;

  recoveryInFlight = true;
  try {
    if (state.selectedTournamentId != null) return await refreshTournament(state.selectedTournamentId);
    return await refreshTournaments();
  } finally {
    recoveryInFlight = false;
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) void recoverMobileSession();
});
window.addEventListener('online', () => { void recoverMobileSession(); });
