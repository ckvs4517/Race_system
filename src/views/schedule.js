/** V2 賽程畫面 façade；各畫面責任位於 ./schedule/ 子模組。 */
import { tournamentDetailView } from './schedule/tournament-detail.js';
import { tournamentListView } from './schedule/tournament-list.js';

export function scheduleView(tournaments, selectedId, canManage = false) {
  const selected = tournaments.find((item) => item.id === selectedId);
  return selected ? tournamentDetailView(selected, canManage) : tournamentListView(tournaments, canManage);
}
