/** 行動瀏覽器從 BFCache、背景或斷網恢復時，立即重新驗證目前賽事資料。 */
import { getState, refreshTournament, refreshTournaments } from '../data/store.js';

let recoveryInFlight = false;

export async function recoverMobileSession() {
  if (recoveryInFlight || document.visibilityState !== 'visible' || navigator.onLine === false) return false;
  recoveryInFlight = true;
  try {
    const state = getState();
    if (state.selectedTournamentId != null) return await refreshTournament(state.selectedTournamentId);
    return await refreshTournaments();
  } finally {
    recoveryInFlight = false;
  }
}

window.addEventListener('pageshow', () => { void recoverMobileSession(); });
window.addEventListener('online', () => { void recoverMobileSession(); });
