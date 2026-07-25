/**
 * 賽事領域服務。
 * 定義共用生命週期；實際配對、統計與排名交給 formats 內的賽制策略。
 */
import { getTournamentFormat } from '../formats/registry.js';

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

export function createTournament(name, players, formatId = 'single_elimination', arenaCount = 1, eventInfo = {}) {
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
    rounds: [],
    registrationSettings: createRegistrationSettings(),
    ...(format.initialState?.() || {}),
  };
}

export function duplicateTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  return createTournament(`${normalized.name}（副本）`, normalized.players, normalized.format, normalized.arenaCount, normalized.eventInfo);
}

export function updateDraftTournament(tournament, name, players, formatId = tournament.format, arenaCount = tournament.arenaCount || 1, eventInfo = tournament.eventInfo || {}) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能再修改參賽名單。');
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  validateDraftPlayers(cleanPlayers);
  const cleanArenaCount = validateArenaCount(arenaCount);
  const format = getTournamentFormat(formatId);
  const participantStates = normalizeParticipantStates(cleanPlayers, normalized.participantStates, false);
  const competitionPlayers = cleanPlayers.filter((player) => participantStates[player].checkedIn);
  const seedCount = format.initialSeedCount(competitionPlayers);
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
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    participantStates,
    rounds: seedCount || competitionPlayers.length < 2 ? [] : [format.createOpeningRound(competitionPlayers)],
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

export function addDraftPlayer(tournament, player) {
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
  return rebuildDraftRoster(normalized, players, participantStates);
}

export function removeDraftPlayer(tournament, player) {
  const normalized = normalizeTournament(tournament);
  assertDraftRosterChange(normalized);
  if (!normalized.players.includes(player)) throw new Error('找不到這位參賽者。');
  const players = normalized.players.filter((candidate) => candidate !== player);
  const participantStates = { ...normalized.participantStates };
  delete participantStates[player];
  return rebuildDraftRoster(normalized, players, participantStates);
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
  const relativeSeedIndexes = seedPlayerIndexes.map((index) => competitionPlayers.indexOf(normalized.players[index]));
  return {
    ...normalized,
    seedPlayerIndexes,
    rounds: [format.createOpeningRound(competitionPlayers, relativeSeedIndexes)],
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
  const seedCount = format.initialSeedCount(competitionPlayers);
  return {
    ...normalized,
    players,
    seedPlayerIndexes: [],
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: seedCount || competitionPlayers.length < 2 ? [] : [format.createOpeningRound(competitionPlayers)],
    seedDrawnAt: null,
    randomizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function startTournament(tournament) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (normalized.status !== '準備中') throw new Error('這場賽事已經開始或完成。');
  const competitionPlayers = draftCompetitionPlayers(normalized);
  validatePlayers(competitionPlayers);
  if (format.id === 'swiss' && competitionPlayers.length < 4) throw new Error('四輪瑞士制至少需要 4 位已報到選手。');
  if (normalized.seedPlayerIndexes.length !== format.initialSeedCount(competitionPlayers)) {
    throw new Error('請先完成種子選手抽選再開始賽事。');
  }
  const relativeSeedIndexes = normalized.seedPlayerIndexes.map((index) => competitionPlayers.indexOf(normalized.players[index]));
  const openingRound = format.createOpeningRound(competitionPlayers, relativeSeedIndexes);
  const stats = format.initializeStats(normalized.players);
  const participantStates = Object.fromEntries(normalized.players.map((player) => [player, {
    ...normalized.participantStates[player],
    status: normalized.participantStates[player].checkedIn ? 'active' : 'no_show',
  }]));
  return {
    ...normalized,
    status: '進行中',
    participantStates,
    totalRounds: format.totalRounds?.(competitionPlayers) || normalized.totalRounds,
    rounds: [openingRound],
    playerStats: format.activateOpeningRound(openingRound, stats),
    startedAt: new Date().toISOString(),
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
      participantStates: normalizeParticipantStates(tournament.players || [], tournament.participantStates),
      checkInVersion: 1,
      registrationSettings: normalizeRegistrationSettings(tournament.registrationSettings),
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
      checkInVersion: 1,
      status: tournament.status === '已完成' ? '已完成' : '進行中',
      rounds: hasRounds ? advanceLegacyWins(tournament.rounds) : [],
    };
  }

  const migrated = createTournament(tournament.name, players, 'single_elimination');
  return rebuildDraftRoster(
    { ...migrated, id: tournament.id, created: tournament.created || migrated.created },
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

export function startSwissFinal(tournament, finalists) {
  const normalized = normalizeTournament(tournament);
  const format = getTournamentFormat(normalized.format);
  if (format.id !== 'swiss' || !format.startFinal) throw new Error('這場賽事不支援四強循環決賽。');
  return format.startFinal(normalized, finalists);
}

export function updateRegistrationSettings(tournament, settings) {
  const normalized = normalizeTournament(tournament);
  if (normalized.status !== '準備中') throw new Error('賽事開始後不能修改報名設定。');
  return {
    ...normalized,
    registrationSettings: normalizeRegistrationSettings({ ...normalized.registrationSettings, ...settings }),
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

function validatePlayers(players) {
  if (players.length < 2 || players.length > 32) throw new Error('參賽者人數需要介於 2 至 32 位。');
  if (new Set(players).size !== players.length) throw new Error('參賽者名稱不可重複。');
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

function rebuildDraftRoster(tournament, players, participantStates) {
  validateDraftPlayers(players);
  const format = getTournamentFormat(tournament.format);
  const normalizedStates = normalizeParticipantStates(players, participantStates, false);
  const competitionPlayers = players.filter((player) => normalizedStates[player].checkedIn);
  const seedCount = format.initialSeedCount(competitionPlayers);
  return {
    ...tournament,
    players,
    checkInVersion: 1,
    participantStates: normalizedStates,
    seedPlayerIndexes: [],
    seedDrawnAt: null,
    totalRounds: format.totalRounds?.(competitionPlayers) || null,
    rounds: seedCount || competitionPlayers.length < 2 ? [] : [format.createOpeningRound(competitionPlayers)],
    updatedAt: new Date().toISOString(),
    ...(format.initialState?.() || {}),
  };
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
