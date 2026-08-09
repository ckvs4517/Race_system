/**
 * 賽事領域服務。
 * 定義共用生命週期；實際配對、統計與排名交給 formats 內的賽制策略。
 */
import { getTournamentFormat } from '../formats/registry.js';
import { startRoundRobinTieBreak as createRoundRobinTieBreak } from '../formats/round-robin.js';
import {
  createDefaultDrinkSettings,
  createEmptyDrinkSettings,
  normalizeDrinkSettings,
  normalizeParticipantDetails,
  normalizePhone,
  resolveDrinkSelection,
} from './drinks.js';

const BYE = '輪空';
const PENDING = '待定';

export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function requiredSeedCount(tournamentOrPlayers) {
  const tournament = Array.isArray(tournamentOrPlayers)
    ? { players: tournamentOrPlayers, format: 'single_elimination' }
    : tournamentOrPlayers;
  return getTournamentFormat(tournament.format).initialSeedCount(draftCompetitionPlayers(tournament));
}

export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}, drinkSettings = createDefaultDrinkSettings()) {
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
  };
}

export function duplicateTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  return {
    ...createTournament(`${normalized.name}（副本）`, normalized.players, normalized.format, normalized.arenaCount, normalized.eventInfo, normalized.drinkSettings),
    participantDetails: normalizeParticipantDetails(normalized.players, normalized.participantDetails),
  };
}

export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1, eventInfo = tournament.eventInfo || {}, drinkSettings = tournament.drinkSettings) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能再修改參賽名單。');
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validateDraftPlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  const participantStates = normalizeParticipantStates(cleanPlayers, normalized.participantStates, false);
  const participantDetails = normalizeParticipantDetails(cleanPlayers, normalized.participantDetails);
  const normalizedDrinkSettings = normalizeDrinkSettings(drinkSettings, normalized.drinkSettings);
  assertSelectedDrinkOptionsRemain(participantDetails, normalizedDrinkSettings);
  return {
    ...normalized,
    name: name.trim() || '未命名賽事',
    bracketVersion: 2,
    format: format.id,
    players: cleanPlayers,
    arenaCount: cleanArenaCount,
    eventInfo: normalizeEventInfo(eventInfo),
    seedPlayerIndexes: [],
    checkInVersion: 1,
    totalRounds: format.totalRounds?.(cleanPlayers) || null,
    participantStates,
    participantDetails,
    drinkSettings: normalizedDrinkSettings,
    rounds: [],
    seedDrawnAt: null,
    updatedAt: new Date().toISOString(),
    ...(format.initialState?.() || {}),
  };
}

export function setDraftPlayerCheckedIn(tournament, player, checkedIn) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const participantStates = {
    ...normalized.participantStates,
    [player]: { ...normalized.participantStates[player], status: 'active', checkedIn: Boolean(checkedIn) },
  };
  return rebuildDraftRoster(normalized, normalized.players, participantStates);
}

export function addDraftPlayer(tournament, player, details = {}) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  const name = String(player || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  const players = [...normalized.players, name];
  validateDraftPlayers(players);
  const participantStates = {
    ...normalized.participantStates,
    [name]: { status: 'active', checkedIn: false },
  };
  const participantDetails = {
    ...normalized.participantDetails,
    [name]: normalizeDraftParticipantDetail(normalized, name, details),
  };
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function removeDraftPlayer(tournament, player) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const players = normalized.players.filter((candidate) => candidate !== player);
  const participantStates = { ...normalized.participantStates };
  const participantDetails = { ...normalized.participantDetails };
  delete participantStates[player];
  delete participantDetails[player];
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function updateDraftParticipant(tournament, player, nextName, details = {}) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const name = String(nextName || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  const players = normalized.players.map((candidate) => candidate === player ? name : candidate);
  validateDraftPlayers(players);
  const participantStates = { ...normalized.participantStates };
  const previousState = participantStates[player];
  delete participantStates[player];
  participantStates[name] = previousState;
  const participantDetails = { ...normalized.participantDetails };
  const previousDetails = participantDetails[player] || {};
  delete participantDetails[player];
  participantDetails[name] = normalizeDraftParticipantDetail(
    { ...normalized, participantDetails: { ...normalized.participantDetails, [name]: previousDetails } },
    name,
    details,
  );
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function addConfirmedParticipant(tournament, registration) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  const name = String(registration?.displayName || '').trim();
  if (!name) throw new Error('請輸入選手名稱。');
  if (normalized.players.includes(name)) throw new Error('這個選手名稱已經在正式名單中。');
  if (normalized.players.length >= normalized.registrationSettings.capacity) throw new Error('這場賽事的名額已滿。');
  const phone = String(registration?.phone || '').trim();
  if (!normalizePhone(phone)) throw new Error('請輸入聯絡電話。');
  const drink = resolveDrinkSelection(normalized.drinkSettings, registration?.drink);
  const players = [...normalized.players, name];
  validateDraftPlayers(players);
  const participantStates = {
    ...normalized.participantStates,
    [name]: { status: 'active', checkedIn: false },
  };
  const participantDetails = {
    ...normalized.participantDetails,
    [name]: {
      phone,
      notes: String(registration?.notes || '').trim().slice(0, 500),
      answers: registration?.answers && typeof registration.answers === 'object' ? structuredClone(registration.answers) : {},
      drink,
    },
  };
  assertUniqueParticipantPhone(players, participantDetails);
  return rebuildDraftRoster(normalized, players, participantStates, participantDetails);
}

export function drawRandomSeeds(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新抽選種子。');
  const format = getTournamentFormat(normalized.format);
  const competitionPlayers = draftCompetitionPlayers(normalized);
  const seedCount = format.initialSeedCount(competitionPlayers);
  if (seedCount === 0) return normalized;

  const indexes = competitionPlayers.map((player) => normalized.players.indexOf(player));
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  const seedPlayerIndexes = indexes.slice(0, seedCount);
  return {
    ...normalized,
    seedPlayerIndexes,
    rounds: [],
    seedDrawnAt: new Date().toISOString(),
  };
}

export function randomizeDraftTournament(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能重新隨機分組。');
  const players = [...normalized.players];
  for (let index = players.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [players[index], players[swapIndex]] = [players[swapIndex], players[index]];
  }
  const format = getTournamentFormat(normalized.format);
  const competitionPlayers = players.filter((player) => normalized.participantStates[player]?.checkedIn);
  return {
    ...normalized,
    players,
    seedPlayerIndexes: [],
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: [],
    seedDrawnAt: null,
    randomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function startTournament(tournament) {
  return confirmTournamentSchedule(randomizeTournamentSchedule(prepareTournamentSchedule(tournament)));
}

export function prepareTournamentSchedule(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (normalized.status !== '準備中') throw new Error('這場賽事已經開始或完成。');
  const competitionPlayers = draftCompetitionPlayers(normalized);
  validatePlayers(competitionPlayers, format);
  const participantStates = Object.fromEntries(normalized.players.map((player) => [player, {
    ...normalized.participantStates[player],
    status: normalized.participantStates[player].checkedIn ? 'active' : 'no_show',
  }]));
  return {
    ...normalized,
    status: '排程中',
    participantStates,
    totalRounds: format.totalRounds?.(competitionPlayers) || normalized.totalRounds,
    seedPlayerIndexes: [],
    rounds: [],
    playerStats: {},
    registrationSettings: revokeRegistrationSettings(normalized.registrationSettings),
    schedulingStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function randomizeTournamentSchedule(tournament, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('只有排程階段可以隨機分組。');
  const format = getTournamentFormat(normalized.format);
  const players = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const shuffled = [...players];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const seedIndexes = format.id === 'single_elimination' && shuffled.length % 2 ? [0] : [];
  return {
    ...normalized,
    rounds: [format.createOpeningRound(shuffled, seedIndexes)],
    ...(format.id === 'win_streak' ? { winStreakCurrent: null, winStreakCount: 0, winStreakQueue: shuffled.slice(2) } : {}),
    scheduleRandomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function updateOpeningPairings(tournament, pairs) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('只有排程階段可以調整對戰。');
  if (!normalized.rounds.length) throw new Error('請先隨機分組。');
  const activePlayers = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const cleanPairs = validateOpeningPairs(pairs, activePlayers);
  const format = getTournamentFormat(normalized.format);
  const byePlayer = cleanPairs.find(([, playerB]) => playerB === BYE)?.[0] || null;
  const seedIndexes = format.id === 'single_elimination' && byePlayer ? [activePlayers.indexOf(byePlayer)] : [];
  const template = format.createOpeningRound(activePlayers, seedIndexes);
  const round = {
    ...template,
    seedPlayer: byePlayer,
    seedReason: byePlayer ? (format.id === 'swiss' ? 'swiss-bye' : 'manual') : null,
    matches: cleanPairs.map(([playerA, playerB], index) => ({
      ...template.matches[index],
      id: template.matches[index]?.id || `r1m${index + 1}`,
      playerA,
      playerB,
      scoreA: null,
      scoreB: null,
      winner: playerB === BYE ? playerA : null,
      status: playerB === BYE ? '輪空晉級' : '可開始',
    })),
  };
  return {
    ...normalized,
    rounds: [round],
    scheduleAdjustedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function confirmTournamentSchedule(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '排程中') throw new Error('目前不是可確認賽程的階段。');
  const activePlayers = normalized.players.filter((player) => normalized.participantStates?.[player]?.status === 'active');
  const format = getTournamentFormat(normalized.format);
  // 奇數人循環賽以休息輪表示輪空，不建立假的「選手對輪空」節點。
  if (format.supportsOpeningPairingEdit !== false) validateOpeningPairs(normalized.rounds[0]?.matches?.map((match) => [match.playerA, match.playerB]) || [], activePlayers);
  const openingRound = structuredClone(normalized.rounds[0]);
  const stats = format.initializeStats(normalized.players);
  return {
    ...normalized,
    status: '進行中',
    rounds: [openingRound],
    playerStats: format.activateOpeningRound(openingRound, stats),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeTournament(tournament) {
  // 讀取前補齊新版欄位，讓舊備份仍可在新版程式中使用。
  if (tournament.bracketVersion === 2) {
    const format = getTournamentFormat(tournament.format || 'single_elimination');
    return {
      ...tournament,
      format: format.id,
      arenaCount: normalizeStoredArenaCount(tournament.arenaCount),
      eventInfo: normalizeEventInfo(tournament.eventInfo),
      totalRounds: format.id === 'swiss' && tournament.swissVersion === 2
        ? format.totalRounds(tournament.players || [])
        : tournament.totalRounds || format.totalRounds?.(tournament.players || []) || null,
      rounds: tournament.status === '準備中' ? [] : (Array.isArray(tournament.rounds) ? tournament.rounds : []),
      participantStates: normalizeParticipantStates(tournament.players || [], tournament.participantStates),
      participantDetails: normalizeParticipantDetails(tournament.players || [], tournament.participantDetails),
      checkInVersion: 1,
      registrationSettings: normalizeRegistrationSettings(tournament.registrationSettings),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
      ...(format.id === 'swiss' && tournament.status === '準備中' && tournament.swissVersion !== 2 ? format.initialState() : {}),
    };
  }

  const players = tournament.players || [];
  const hasRounds = Array.isArray(tournament.rounds) && tournament.rounds.length > 0;
  const hasCompletedMatch = hasRounds && tournament.rounds.some((round) => round.matches.some((match) => match.status === '已完成'));
  const isActiveLegacy = tournament.status === '已完成' || tournament.startedAt || hasCompletedMatch;
  if (isActiveLegacy) {
    return {
      ...tournament,
      format: 'single_elimination',
      arenaCount: 1,
      eventInfo: normalizeEventInfo(tournament.eventInfo),
      bracketVersion: 1,
      participantStates: normalizeParticipantStates(players, tournament.participantStates, true),
      participantDetails: normalizeParticipantDetails(players, tournament.participantDetails),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
      checkInVersion: 1,
      status: tournament.status === '已完成' ? '已完成' : '進行中',
      rounds: hasRounds ? advanceLegacyWins(tournament.rounds) : [],
    };
  }

  const migrated = createTournament(tournament.name, players, 'single_elimination');
  return rebuildDraftRoster(
    {
      ...migrated,
      id: tournament.id,
      created: tournament.created || migrated.created,
      registrationSettings: normalizeRegistrationSettings(tournament.registrationSettings),
      participantDetails: normalizeParticipantDetails(players, tournament.participantDetails),
      drinkSettings: normalizeDrinkSettings(tournament.drinkSettings, createEmptyDrinkSettings()),
    },
    players,
    createParticipantStates(players, true),
  );
}

export function buildRounds(tournament) {
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion === 1) return normalized.rounds;
  if (normalized.format !== 'single_elimination') return structuredClone(normalized.rounds);
  return projectFutureRounds(normalized.rounds);
}

export function getTournamentStandings(tournament) {
  const normalized = normalizeTournament(tournament);
  return getTournamentFormat(normalized.format).getStandings(normalized);
}

export function getSwissPhaseStandings(tournament, phase) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.getPhaseStandings) return [];
  return format.getPhaseStandings(normalized, phase);
}

export function startSwissQualifier(tournament, candidates) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startQualifier) throw new Error('這場賽事不支援資格加賽。');
  return format.startQualifier(normalized, candidates);
}

export function startSwissFinal(tournament, finalists, mode = 'round_robin') {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startFinal) throw new Error('這場賽事不支援四強循環決賽。');
  return format.startFinal(normalized, finalists, mode);
}

/** 以四輪瑞士輪積分榜直接結算，不建立額外四強賽程。 */
export function completeSwissByStandings(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.completeByStandings) throw new Error('這場賽事不支援瑞士輪積分榜結算。');
  return format.completeByStandings(normalized);
}

/** 建立並列名次者的循環加賽；加賽結果只用於決定該組最終名次。 */
export function startRoundRobinTieBreak(tournament, candidates) {
  return createRoundRobinTieBreak(normalizeTournament(tournament), candidates);
}

export function updateRegistrationSettings(tournament, settings) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能修改報名設定。');
  const nextSettings = normalizeRegistrationSettings({ ...normalized.registrationSettings, ...settings });
  return {
    ...normalized,
    registrationSettings: normalized.registrationSettings.enabled && !nextSettings.enabled
      ? revokeRegistrationSettings(nextSettings)
      : nextSettings,
    updatedAt: new Date().toISOString(),
  };
}

export function resetCompletedMatch(tournament, roundIndex, matchIndex) {
  // 回退前段比賽時捨棄後續輪次，避免舊勝者污染新的晉級路線。
  const normalized = normalizeTournament(tournament);
  if (normalized.bracketVersion !== 2) throw new Error('舊版進行中賽事不支援回退比賽。');
  if (normalized.status !== '進行中' && normalized.status !== '已完成') throw new Error('這場賽事目前不能重新比賽。');
  const rounds = structuredClone(normalized.rounds.slice(0, roundIndex + 1));
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '已完成') throw new Error('只有已完成的比賽可以重新開始。');

  match.scoreA = null;
  match.scoreB = null;
  match.winner = null;
  match.status = '可開始';
  delete match.completedAt;
  delete match.outcome;
  delete match.forfeitPlayer;
  delete match.resolutionReason;
  const format = getTournamentFormat(normalized.format);
  const resetPhase = rounds[roundIndex]?.phase || 'preliminary';
  const swissStage = normalized.format === 'swiss'
    ? resetPhase === 'preliminary' ? 'preliminary' : resetPhase
    : undefined;
  return {
    ...normalized,
    rounds,
    playerStats: format.rebuildStats(normalized.players, rounds),
    champion: null,
    status: '進行中',
    ...(swissStage ? {
      swissStage,
      finalists: swissStage === 'preliminary' ? [] : normalized.finalists,
      swissFinalMode: swissStage === 'preliminary' ? null : normalized.swissFinalMode,
      activeQualifierSeriesId: swissStage === 'qualifier' ? round.seriesId : normalized.activeQualifierSeriesId,
    } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB, random = Math.random) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('賽事尚未開始或已經完成。');
  validateFinalScore(scoreA, scoreB);
  if (normalized.bracketVersion === 1) return recordLegacyResult(normalized, roundIndex, matchIndex, scoreA, scoreB);

  const format = getTournamentFormat(normalized.format);
  const result = format.recordResult(normalized, roundIndex, matchIndex, scoreA, scoreB, random);
  return {
    ...normalized,
    ...result,
    status: result.champion ? '已完成' : '進行中',
  };
}

export function forfeitMatch(tournament, roundIndex, matchIndex, forfeitingPlayer, reason = '選手棄賽') {
  const normalized = normalizeTournament(tournament);
  return settleAdministrativeMatch(normalized, roundIndex, matchIndex, forfeitingPlayer, 'forfeit', reason);
}

export function withdrawPlayer(tournament, player, status = 'withdrawn') {
  // 退賽不可逆；若目前有待比賽對手，立即以 4：0 行政判定。
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '進行中') throw new Error('只有進行中的賽事可以標記選手退賽。');
  if (normalized.bracketVersion !== 2) throw new Error('舊版進行中賽事不支援選手退賽。');
  if (!normalized.players.includes(player)) throw new Error('找不到這位選手。');
  if (!['withdrawn', 'no_show'].includes(status)) throw new Error('不支援的退賽狀態。');
  if (normalized.participantStates[player]?.status !== 'active') throw new Error('這位選手已經退出賽事。');
  if (normalized.format === 'single_elimination' && (normalized.playerStats?.[player]?.losses || 0) > 0) throw new Error('這位選手已經在單淘汰賽中遭到淘汰。');

  const reason = status === 'no_show' ? '選手未出席' : '選手中途退賽';
  const participantStates = {
    ...normalized.participantStates,
    [player]: { status, reason, updatedAt: new Date().toISOString() },
  };
  const marked = { ...normalized, participantStates, updatedAt: new Date().toISOString() };
  const pending = findPendingMatch(marked, player);
  if (!pending) return marked;
  return settleAdministrativeMatch(marked, pending.roundIndex, pending.matchIndex, player, 'withdrawal', reason);
}

function settleAdministrativeMatch(tournament, roundIndex, matchIndex, forfeitingPlayer, outcome, reason) {
  // 行政判定仍走一般記分流程，確保晉級、統計與下一輪只維護一套邏輯。
  const match = tournament.rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法判定棄賽。');
  if (![match.playerA, match.playerB].includes(forfeitingPlayer)) throw new Error('棄賽選手不在這場比賽中。');
  const scoreA = match.playerA === forfeitingPlayer ? 0 : 4;
  const scoreB = match.playerB === forfeitingPlayer ? 0 : 4;
  const result = recordMatchResult(tournament, roundIndex, matchIndex, scoreA, scoreB);
  const completed = result.rounds[roundIndex].matches[matchIndex];
  completed.outcome = outcome;
  completed.forfeitPlayer = forfeitingPlayer;
  completed.resolutionReason = reason;
  return result;
}

function findPendingMatch(tournament, player) {
  for (let roundIndex = tournament.rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
    const matchIndex = tournament.rounds[roundIndex].matches.findIndex((match) => match.status === '可開始' && [match.playerA, match.playerB].includes(player));
    if (matchIndex >= 0) return { roundIndex, matchIndex };
  }
  return null;
}

function projectFutureRounds(sourceRounds) {
  // 「待定」節點只供預覽，不寫回正式賽事資料。
  const rounds = structuredClone(sourceRounds);
  if (!rounds.length) return rounds;
  let entrantCount = rounds.at(-1).matches.length;
  let roundNumber = rounds.length + 1;
  while (entrantCount > 1) {
    const matchCount = Math.ceil(entrantCount / 2);
    rounds.push({
      name: entrantCount === 2 ? '冠軍賽' : `${entrantCount} 強`,
      projected: true,
      seedPlayer: null,
      seedReason: null,
      matches: Array.from({ length: matchCount }, (_, index) => ({
        id: `projected-r${roundNumber}m${index + 1}`,
        playerA: PENDING,
        playerB: PENDING,
        scoreA: null,
        scoreB: null,
        winner: null,
        status: '等待晉級',
      })),
    });
    entrantCount = matchCount;
    roundNumber += 1;
  }
  return rounds;
}

function validatePlayers(players, format = null) {
  const minimum = format?.minPlayers || 2;
  const maximum = format?.maxPlayers || 32;
  if (players.length < minimum || players.length > maximum) throw new Error(`${format?.name || '此賽制'}參賽者人數需要介於 ${minimum} 至 ${maximum} 位。`);
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
}

function validateOpeningPairs(pairs, activePlayers) {
  if (!Array.isArray(pairs)) throw new Error('賽程格式不正確。');
  const expectedMatchCount = Math.ceil(activePlayers.length / 2);
  if (pairs.length !== expectedMatchCount) throw new Error(`首輪需要 ${expectedMatchCount} 場配對。`);
  const cleanPairs = pairs.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error('每場比賽都需要兩個對戰位置。');
    const playerA = String(pair[0] || '').trim();
    const playerB = String(pair[1] || '').trim();
    if (!playerA || !playerB || playerA === BYE) throw new Error('每場比賽都必須指定有效選手。');
    if (playerA === playerB) throw new Error(`${playerA} 不能與自己對戰。`);
    return [playerA, playerB];
  });
  const assignedPlayers = cleanPairs.flat().filter((player) => player !== BYE);
  if (assignedPlayers.length !== activePlayers.length
    || new Set(assignedPlayers).size !== activePlayers.length
    || activePlayers.some((player) => !assignedPlayers.includes(player))) {
    throw new Error('每位已報到選手都必須剛好出現一次，不能重複或遺漏。');
  }
  const byeCount = cleanPairs.filter(([, playerB]) => playerB === BYE).length;
  const expectedByeCount = activePlayers.length % 2;
  if (byeCount !== expectedByeCount) throw new Error(expectedByeCount ? '奇數人賽程必須安排一位輪空。' : '偶數人賽程不能安排輪空。');
  return cleanPairs;
}

function validateDraftPlayers(players) {
  if (players.length > 32) throw new Error('參賽者人數不可超過 32 位。');
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
}

function assertDraftRosterChange(tournament) {
  if (tournament.status !== '準備中') throw new Error('賽事開始後不能再修改報到名單。');
}

function draftCompetitionPlayers(tournament) {
  if (tournament.status !== '準備中' || tournament.checkInVersion !== 1) return tournament.players || [];
  return (tournament.players || []).filter((player) => tournament.participantStates?.[player]?.checkedIn);
}

function rebuildDraftRoster(tournament, players, participantStates, participantDetails = tournament.participantDetails) {
  validateDraftPlayers(players);
  const format = getTournamentFormat(tournament.format);
  const normalizedStates = normalizeParticipantStates(players, participantStates, false);
  const competitionPlayers = players.filter((player) => normalizedStates[player].checkedIn);
  return {
    ...tournament,
    players,
    checkInVersion: 1,
    participantStates: normalizedStates,
    participantDetails: normalizeParticipantDetails(players, participantDetails),
    seedPlayerIndexes: [],
    seedDrawnAt: null,
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: [],
    updatedAt: new Date().toISOString(),
    ...(format.initialState?.() || {}),
  };
}

function normalizeDraftParticipantDetail(tournament, player, value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const existing = tournament.participantDetails?.[player] || {};
  const hasDrinkUpdate = Object.prototype.hasOwnProperty.call(source, 'drink');
  return {
    phone: String(source.phone ?? existing.phone ?? '').trim().slice(0, 40),
    notes: String(source.notes ?? existing.notes ?? '').trim().slice(0, 500),
    answers: source.answers && typeof source.answers === 'object' ? structuredClone(source.answers) : structuredClone(existing.answers || {}),
    drink: hasDrinkUpdate
      ? (source.drink ? resolveDrinkSelection(tournament.drinkSettings, source.drink, { allowMissing: true }) : null)
      : (existing.drink || null),
  };
}

function assertUniqueParticipantPhone(players, participantDetails) {
  const seen = new Set();
  for (const player of players) {
    const phone = normalizePhone(participantDetails?.[player]?.phone);
    if (!phone) continue;
    if (seen.has(phone)) throw new Error('這支聯絡電話已經在正式名單中。');
    seen.add(phone);
  }
}

function assertSelectedDrinkOptionsRemain(participantDetails, settings) {
  for (const details of Object.values(participantDetails || {})) {
    const drink = details?.drink;
    if (!drink || drink.category === 'legacy') continue;
    if (!settings.items.some((item) => item.id === drink.itemId || item.name === drink.displayName)) {
      throw new Error(`飲品「${drink.displayName}」已有選手選擇，不能刪除；可以改為停用。`);
    }
  }
}

function validateFinalScore(scoreA, scoreB) {
  if (![scoreA, scoreB].every((score) => Number.isInteger(score) && score >= 0)) throw new Error('比分必須是 0 以上的整數。');
  if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
  if (Math.max(scoreA, scoreB) < 4) throw new Error('勝方最終比分必須至少為 4 分。');
}

function createParticipantStates(players, checkedIn = true) {
  return Object.fromEntries(players.map((player) => [player, { status: 'active', checkedIn }]));
}

function normalizeParticipantStates(players, states = {}, defaultCheckedIn = true) {
  return Object.fromEntries(players.map((player) => [player, {
    ...(states?.[player] || {}),
    status: ['active', 'withdrawn', 'no_show'].includes(states?.[player]?.status) ? states[player].status : 'active',
    checkedIn: typeof states?.[player]?.checkedIn === 'boolean' ? states[player].checkedIn : defaultCheckedIn,
  }]));
}

function validateArenaCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('戰鬥台數需要介於 1 至 8 台。');
  return count;
}

function normalizeStoredArenaCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 8 ? count : 1;
}

function normalizeEventInfo(value = {}) {
  const info = value && typeof value === 'object' ? value : {};
  return {
    date: cleanEventText(info.date, 10, '比賽日期'),
    checkInStart: cleanEventText(info.checkInStart, 5, '報到開始時間'),
    checkInEnd: cleanEventText(info.checkInEnd, 5, '報到截止時間'),
    startTime: cleanEventText(info.startTime, 5, '開賽時間'),
    venueName: cleanEventText(info.venueName, 80, '比賽地點'),
    address: cleanEventText(info.address, 160, '地址'),
    mapUrl: cleanEventUrl(info.mapUrl, '地圖連結'),
    postUrl: cleanEventUrl(info.postUrl, '貼文連結'),
    notes: cleanEventText(info.notes, 2000, '備註'),
  };
}

function createRegistrationSettings() {
  return {
    enabled: false,
    token: createPublicToken(),
    capacity: 32,
    deadline: '',
    fields: [],
  };
}

function revokeRegistrationSettings(settings = {}) {
  return {
    ...normalizeRegistrationSettings(settings),
    enabled: false,
    token: createPublicToken(),
  };
}

function normalizeRegistrationSettings(value = {}) {
  const settings = value && typeof value === 'object' ? value : {};
  const capacity = Number(settings.capacity);
  const fields = Array.isArray(settings.fields) ? settings.fields
    .filter((field) => field && typeof field === 'object' && typeof field.id === 'string' && typeof field.label === 'string')
    .slice(0, 20)
    .map((field) => ({
      id: field.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
      label: field.label.slice(0, 80),
      type: ['text', 'textarea', 'checkbox'].includes(field.type) ? field.type : 'text',
      required: Boolean(field.required),
    }))
    .filter((field) => field.id && field.label) : [];
  return {
    enabled: Boolean(settings.enabled),
    token: typeof settings.token === 'string' && settings.token.length >= 16 ? settings.token : createPublicToken(),
    capacity: Number.isInteger(capacity) && capacity >= 2 && capacity <= 32 ? capacity : 32,
    deadline: typeof settings.deadline === 'string' ? settings.deadline.slice(0, 30) : '',
    fields,
  };
}

function createPublicToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function cleanEventText(value, maximumLength, label) {
  const text = String(value || '').trim();
  if (text.length > maximumLength) throw new Error(`${label}內容過長。`);
  return text;
}

function cleanEventUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 500) throw new Error(`${label}內容過長。`);
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label}必須是有效的 http 或 https 網址。`);
  }
}

function recordLegacyResult(tournament, roundIndex, matchIndex, scoreA, scoreB) {
  const rounds = structuredClone(tournament.rounds);
  const match = rounds[roundIndex]?.matches[matchIndex];
  if (!match || match.status !== '可開始') throw new Error('這場比賽目前無法記分。');
  if (scoreA === scoreB) throw new Error('比分相同時無法確認勝者。');
  match.scoreA = scoreA;
  match.scoreB = scoreB;
  match.winner = scoreA > scoreB ? match.playerA : match.playerB;
  match.status = '已完成';
  match.completedAt = new Date().toISOString();
  const updatedRounds = advanceLegacyWins(rounds);
  const champion = updatedRounds.at(-1).matches[0].winner;
  return { ...tournament, rounds: updatedRounds, champion: champion || null, status: champion ? '已完成' : '進行中' };
}

function advanceLegacyWins(sourceRounds) {
  const rounds = structuredClone(sourceRounds);
  rounds.forEach((round, roundIndex) => {
    round.matches.forEach((match, matchIndex) => {
      if (!match.winner && match.status !== '已完成') {
        const realPlayers = [match.playerA, match.playerB].filter((player) => player !== BYE && player !== PENDING);
        if (realPlayers.length === 1 && [match.playerA, match.playerB].includes(BYE)) {
          match.winner = realPlayers[0];
          match.status = '輪空晉級';
        }
      }
      if (!match.winner || roundIndex === rounds.length - 1) return;
      const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
      if (matchIndex % 2 === 0) nextMatch.playerA = match.winner;
      else nextMatch.playerB = match.winner;
      if (!nextMatch.winner && nextMatch.playerA !== PENDING && nextMatch.playerB !== PENDING) nextMatch.status = '可開始';
    });
  });
  return rounds;
}
