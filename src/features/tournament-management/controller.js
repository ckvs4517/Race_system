/** 建立／編輯賽事 controller；只協調表單、store 與 navigation。 */
import { navigate } from '../../core/router.js';
import {
  createTournamentRecord,
  mutateTournament,
  selectEditingTournament,
  selectTournament,
} from '../../data/store.js';
import { bindManage } from '../../views/manage.js';

export function bindTournamentManagementController(root, state) {
  const editingTournament = state.tournaments.find((item) => item.id === state.editingTournamentId) || null;
  bindManage(root, {
    tournament: editingTournament,
    onSubmit: (tournament) => editingTournament ? saveTournamentChanges(tournament) : addTournament(tournament),
    onCancel: () => {
      selectEditingTournament(null);
      selectTournament(editingTournament?.id || null);
      navigate('schedule');
    },
  });
}

async function addTournament(tournament) {
  try {
    const saved = await createTournamentRecord(tournament);
    selectTournament(saved.id);
    navigate('schedule');
  } catch (error) {
    alert(error.message);
  }
}

async function saveTournamentChanges(updatedTournament) {
  try {
    const saved = await mutateTournament(updatedTournament.id, (current) => ({ ...updatedTournament, revision: current.revision }));
    selectEditingTournament(null);
    selectTournament(saved.id);
    navigate('schedule');
  } catch (error) {
    alert(error.message);
  }
}
