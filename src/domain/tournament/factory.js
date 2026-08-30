/** Low-level tournament record factory shared by creation and legacy normalization. */
import { getTournamentFormat } from '../../formats/registry.js';
import { DEFAULT_SWISS_RANKING_RULE } from '../ranking/swiss-ranking.js';
import { createDefaultDrinkSettings, normalizeDrinkSettings, normalizeParticipantDetails } from '../drinks.js';
import { normalizeEventInfo, validateArenaCount } from './metadata.js';
import { createParticipantStates, validateDraftPlayers } from './participant-model.js';
import { createRegistrationSettings } from './registration-settings.js';

export function createTournamentRecord(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createDefaultDrinkSettings()) {
  // 奇數單淘汰需先抽種子，因此建立時暫不產生首輪；其他情況可立即預覽。
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validateDraftPlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  return {
    id: Date.now(),
    name: name.trim() || '未命名賽事',
    format: format.id,
    bracketVersion: 2,
    players: cleanPlayers,
    arenaCount: cleanArenaCount,
    eventInfo: normalizeEventInfo(eventInfo),
    seedPlayerIndexes: [],
    created: new Date().toLocaleDateString('zh-TW'),
    status: '準備中',
    checkInVersion: 1,
    totalRounds: format.totalRounds?.(cleanPlayers) || null,
    participantStates: createParticipantStates(cleanPlayers, false),
    participantDetails: normalizeParticipantDetails(cleanPlayers),
    rounds: [],
    registrationSettings: createRegistrationSettings(),
    drinkSettings: normalizeDrinkSettings(drinkSettings, createDefaultDrinkSettings()),
    ...(format.initialState?.() || {}),
    ...(format.id === 'swiss' ? { swissRankingRule: DEFAULT_SWISS_RANKING_RULE } : {}),
  };
}
