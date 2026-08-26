/** 只讀 Spin League JSON 備份檢查器；不會修改原始檔案。 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeTournament } from '../src/domain/tournament.js';

const fileArgument = process.argv[2];
if (!fileArgument) throw new Error('Usage: node scripts/validate-backup.mjs path/to/backup.json');
const filePath = resolve(process.cwd(), fileArgument);
const payload = JSON.parse(await readFile(filePath, 'utf8'));
const errors = [];
const warnings = [];

if (payload?.format !== 'spin-league-backup') errors.push('Top-level format must be spin-league-backup.');
if (payload?.version !== 1) errors.push('Only backup version 1 is supported.');
if (!Array.isArray(payload?.tournaments)) errors.push('Top-level tournaments must be an array.');
if (payload?.tournaments?.length > 200) errors.push('Backup exceeds the Worker restore limit of 200 tournaments.');

const tournamentIds = new Set();
for (const [index, tournament] of (payload.tournaments || []).entries()) {
  const label = `tournaments[${index}] ${JSON.stringify(tournament?.name || '')}`;
  if (!Number.isFinite(Number(tournament?.id))) errors.push(`${label}: invalid id.`);
  const id = String(tournament?.id);
  if (tournamentIds.has(id)) errors.push(`${label}: duplicate tournament id ${id}.`);
  tournamentIds.add(id);
  if (typeof tournament?.name !== 'string' || !tournament.name.trim()) errors.push(`${label}: missing name.`);
  if (!Array.isArray(tournament?.players)) errors.push(`${label}: players must be an array.`);
  if (!Array.isArray(tournament?.rounds)) errors.push(`${label}: rounds must be an array.`);

  const players = new Set(tournament?.players || []);
  if (players.size !== (tournament?.players || []).length) errors.push(`${label}: duplicate player names.`);
  const matchIds = new Set();
  for (const [roundIndex, round] of (tournament?.rounds || []).entries()) {
    if (!Array.isArray(round?.matches)) errors.push(`${label} round ${roundIndex + 1}: matches must be an array.`);
    for (const [matchIndex, match] of (round?.matches || []).entries()) {
      const matchLabel = `${label} round ${roundIndex + 1} match ${matchIndex + 1}`;
      if (!match?.id) warnings.push(`${matchLabel}: missing match id.`);
      else if (matchIds.has(match.id)) errors.push(`${matchLabel}: duplicate match id ${match.id}.`);
      else matchIds.add(match.id);
      for (const side of ['playerA', 'playerB']) {
        const value = match?.[side];
        if (value && !['輪空', '待定'].includes(value) && !players.has(value)) errors.push(`${matchLabel}: ${side} is not in the roster: ${value}.`);
      }
      if (match?.status === '已完成') {
        if (!Number.isFinite(match.scoreA) || !Number.isFinite(match.scoreB)) errors.push(`${matchLabel}: completed match needs numeric scores.`);
        if (match.scoreA === match.scoreB) errors.push(`${matchLabel}: completed match is tied.`);
        const expectedWinner = match.scoreA > match.scoreB ? match.playerA : match.playerB;
        if (match.winner !== expectedWinner) errors.push(`${matchLabel}: winner does not match scores.`);
        if (Math.max(match.scoreA, match.scoreB) < 4) warnings.push(`${matchLabel}: winner has fewer than 4 points.`);
      }
      if (match?.status === '可開始' && (match.scoreA != null || match.scoreB != null || match.winner)) {
        warnings.push(`${matchLabel}: uncompleted match already contains result data.`);
      }
    }
  }

  for (const player of tournament?.players || []) {
    const state = tournament?.participantStates?.[player];
    if (!state) warnings.push(`${label}: missing participant state for ${player}.`);
    if (state?.status === 'no_show' && state.checkedIn !== false) warnings.push(`${label}: no_show player ${player} is not explicitly checkedIn=false.`);
  }

  if (tournament?.format === 'swiss') validateSwiss(tournament, label, errors, warnings);
  try {
    normalizeTournament(structuredClone(tournament));
  } catch (error) {
    errors.push(`${label}: normalizeTournament rejected the data: ${error.message}`);
  }
}

console.log(`Backup: ${filePath}`);
console.log(`Tournaments: ${payload.tournaments?.length || 0}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
for (const message of errors) console.error(`ERROR ${message}`);
for (const message of warnings) console.warn(`WARN  ${message}`);
if (errors.length) process.exitCode = 1;
else console.log('PASS backup structure is restorable by the current code.');

function validateSwiss(tournament, label, errorsList, warningsList) {
  const preliminary = (tournament.rounds || []).filter((round) => (round.phase || 'preliminary') === 'preliminary');
  if (tournament.swissVersion === 2 && preliminary.length > 4) errorsList.push(`${label}: swissVersion 2 has more than four preliminary rounds.`);
  if (tournament.swissStage === 'preliminary' && preliminary.length >= 4 && preliminary.every(roundComplete)) {
    warningsList.push(`${label}: four preliminary rounds are complete but swissStage is still preliminary.`);
  }
  const expectedFinalists = tournament.swissFinalMode === 'standings'
    ? 0
    : Number(tournament.swissStage2Config?.advanceCount) === 8 ? 8 : 4;
  if (['final', 'completed'].includes(tournament.swissStage) && (tournament.finalists || []).length !== expectedFinalists) {
    errorsList.push(`${label}: final/completed Swiss stage requires exactly four finalists.`);
  }
  if (tournament.swissStage === 'qualification' && tournament.activeQualifierSeriesId) {
    warningsList.push(`${label}: qualification stage still has activeQualifierSeriesId.`);
  }
  if (tournament.swissStage === 'qualifier' && !tournament.activeQualifierSeriesId) {
    errorsList.push(`${label}: qualifier stage is missing activeQualifierSeriesId.`);
  }
}

function roundComplete(round) {
  return Array.isArray(round.matches) && round.matches.every((match) => Boolean(match.winner));
}
