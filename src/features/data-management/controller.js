/** 備份／匯入頁 controller；不改變備份格式或 D1 schema。 */
import {
  replaceTournamentRecords,
  selectEditingTournament,
  selectTournament,
} from '../../data/store.js';
import { normalizeTournament } from '../../domain/tournament.js';
import { bindDataManagement } from '../../views/data-management.js';

export function bindDataManagementController(root, state, requestRender) {
  bindDataManagement(root, state.tournaments, {
    onImport: async (tournaments) => {
      const normalized = tournaments.map(normalizeTournament);
      try {
        await replaceTournamentRecords(normalized);
        selectTournament(null);
        selectEditingTournament(null);
        alert(`已匯入 ${normalized.length} 場賽事並完成雲端同步。`);
        requestRender();
      } catch (error) {
        alert(error.message);
      }
    },
  });
}
