import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to) {
  const source = await readFile(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one target, found ${count}`);
  await writeFile(path, source.replace(from, to));
}

await replaceOnce(
  'src/formats/swiss.js',
  "const BYE = '輪空';\nconst PRELIMINARY_ROUNDS = 4;",
  "const BYE = '輪空';\nconst PRELIMINARY_ROUNDS = 4;\nconst SWISS_BYE_POINTS = 4;",
);

await replaceOnce(
  'src/formats/swiss.js',
  `    seedPlayer: byePlayer,\n    seedReason: byePlayer ? 'swiss-bye' : null,\n    matches:`,
  `    seedPlayer: byePlayer,\n    seedReason: byePlayer ? 'swiss-bye' : null,\n    // 新產生的瑞士輪明確記錄輪空排名積分，讓舊 round 缺少欄位時仍維持歷史 0 分。\n    byePoints: SWISS_BYE_POINTS,\n    matches:`,
);

await replaceOnce(
  'src/formats/swiss.js',
  `  stats[byeMatch.playerA].wins += 1;\n  stats[byeMatch.playerA].pointsFor += 4;\n  stats[byeMatch.playerA].byeCount += 1;`,
  `  stats[byeMatch.playerA].wins += 1;\n  stats[byeMatch.playerA].pointsFor += Number(round.byePoints) || 0;\n  stats[byeMatch.playerA].byeCount += 1;`,
);

await replaceOnce(
  'src/formats/swiss.js',
  `    if (match.playerB === BYE) {\n      applyBye({ matches: [match] }, stats);\n      return;\n    }`,
  `    if (match.playerB === BYE) {\n      applyBye({ matches: [match], byePoints: round.byePoints }, stats);\n      return;\n    }`,
);

await replaceOnce(
  'tests/swiss.test.mjs',
  `const firstBye = odd.rounds[0].seedPlayer;\nassert.ok(firstBye);\nassert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');`,
  `const firstBye = odd.rounds[0].seedPlayer;\nassert.ok(firstBye);\nassert.equal(odd.rounds[0].byePoints, 4, '新產生的瑞士輪應記錄輪空 4 分規則');\nassert.equal(odd.playerStats[firstBye].wins, 1, '輪空應計為一勝');`,
);

await replaceOnce(
  'tests/swiss.test.mjs',
  `odd = finishCurrentRound(odd);\nassert.notEqual(odd.rounds[1].seedPlayer, firstBye, '有其他選擇時不可連續輪空');\n\nlet swissWithdrawal`,
  `odd = finishCurrentRound(odd);\nassert.notEqual(odd.rounds[1].seedPlayer, firstBye, '有其他選擇時不可連續輪空');\n\nconst historicalByeProbe = {\n  ...createTournament('舊輪空資料', ['舊A', '舊B', '舊C'], 'swiss'),\n  status: '進行中',\n  participantStates: {\n    '舊A': { status: 'active', checkedIn: true },\n    '舊B': { status: 'active', checkedIn: true },\n    '舊C': { status: 'active', checkedIn: true },\n  },\n  rounds: [{\n    name: '瑞士制第 1 輪',\n    phase: 'preliminary',\n    phaseRound: 1,\n    seriesId: 'preliminary',\n    // 舊資料沒有 byePoints，必須維持當時只加勝場、不加總得分的語意。\n    matches: [\n      { id: 'legacy-bye', playerA: '舊A', playerB: '輪空', scoreA: null, scoreB: null, winner: '舊A', status: '輪空晉級' },\n      completedMatch('legacy-played', '舊B', '舊C', 4, 1),\n    ],\n  }],\n};\nconst historicalByeRows = getSwissPhaseStandings(historicalByeProbe, 'preliminary');\nconst historicalByePlayer = historicalByeRows.find((row) => row.player === '舊A');\nassert.equal(historicalByePlayer.wins, 1, '舊輪空仍應保留一勝');\nassert.equal(historicalByePlayer.totalPoints, 0, '舊 round 沒有 byePoints 時不可回溯增加 4 分');\n\nlet swissWithdrawal`,
);

console.log('Applied Swiss BYE history compatibility patch.');
