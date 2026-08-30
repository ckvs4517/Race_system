/** Server-authoritative tournament action dispatch. */
import {
  MAX_TOURNAMENT_PLAYERS,
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
  completeSwissByStandings,
  completeTournamentEarly,
  setDraftPlayerCheckedIn,
  setAllDraftPlayersCheckedIn,
  startSwissFinal,
  startSwissQualifier,
  startRoundRobinTieBreak,
  startTournament,
  updateOpeningPairings,
  updateDraftParticipant,
  updateRegistrationSettings,
  withdrawPlayer,
} from '../tournament-domain.js';

export function applyTournamentAction(tournament, type, payload) {
  switch (type) {
    case 'set_check_in': return setDraftPlayerCheckedIn(tournament, String(payload.player || ''), Boolean(payload.checkedIn));
    case 'set_all_check_in': return setAllDraftPlayersCheckedIn(tournament);
    case 'add_player': return addDraftPlayer(tournament, String(payload.player || ''), payload.details || {});
    case 'update_participant': return updateDraftParticipant(tournament, String(payload.player || ''), String(payload.nextName || ''), payload.details || {});
    case 'remove_player': return removeDraftPlayer(tournament, String(payload.player || ''));
    case 'remove_players': {
      const players = Array.isArray(payload.players) ? [...new Set(payload.players.map(String))] : [];
      if (!players.length || players.length > MAX_TOURNAMENT_PLAYERS) throw new Error('請選擇要移除的選手。');
      return players.reduce((current, player) => removeDraftPlayer(current, player), tournament);
    }
    case 'draw_seeds': return drawRandomSeeds(tournament);
    case 'randomize_bracket': return randomizeDraftTournament(tournament);
    case 'start_tournament': return startTournament(tournament);
    case 'prepare_tournament_schedule': return prepareTournamentSchedule(tournament);
    case 'randomize_schedule': return randomizeTournamentSchedule(tournament);
    case 'update_opening_pairings': return updateOpeningPairings(tournament, Array.isArray(payload.pairs) ? payload.pairs : []);
    case 'confirm_tournament_schedule': return confirmTournamentSchedule(tournament);
    case 'record_match': return recordMatchResult(tournament, Number(payload.roundIndex), Number(payload.matchIndex), Number(payload.scoreA), Number(payload.scoreB));
    case 'forfeit_match': return forfeitMatch(tournament, Number(payload.roundIndex), Number(payload.matchIndex), String(payload.player || ''));
    case 'replay_match': return resetCompletedMatch(tournament, Number(payload.roundIndex), Number(payload.matchIndex));
    case 'withdraw_player': return withdrawPlayer(tournament, String(payload.player || ''), payload.status === 'no_show' ? 'no_show' : 'withdrawn');
    case 'start_swiss_qualifier': return startSwissQualifier(tournament, Array.isArray(payload.players) ? payload.players.map(String) : []);
    case 'start_swiss_final': return startSwissFinal(tournament, Array.isArray(payload.players) ? payload.players.map(String) : [], String(payload.mode || 'round_robin'), Number(payload.rounds) || 4);
    case 'complete_swiss_by_standings': return completeSwissByStandings(tournament);
    case 'complete_tournament_early': return completeTournamentEarly(tournament);
    case 'start_round_robin_tiebreak': return startRoundRobinTieBreak(tournament, Array.isArray(payload.players) ? payload.players.map(String) : []);
    case 'update_registration_settings': return updateRegistrationSettings(tournament, payload.settings || {});
    default: throw new Error('不支援的賽事操作。');
  }
}
