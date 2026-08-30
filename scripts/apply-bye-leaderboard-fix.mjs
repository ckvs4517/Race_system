import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to) {
  const source = await readFile(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one replacement target, found ${count}`);
  await writeFile(path, source.replace(from, to));
}

await replaceOnce(
  'src/views/schedule/leaderboard.js',
  `    round.matches.filter((match) => match.status === '已完成' && [match.playerA, match.playerB].includes(player)).forEach((match) => {\n      const group = groups.get(key);\n      const isA = match.playerA === player;\n      group.points += Number(isA ? match.scoreA : match.scoreB) || 0;\n      if (match.winner === player) group.wins += 1; else group.losses += 1;\n    });`,
  `    round.matches.filter((match) => ['已完成', '輪空晉級'].includes(match.status) && [match.playerA, match.playerB].includes(player)).forEach((match) => {\n      const group = groups.get(key);\n      const isA = match.playerA === player;\n      const opponent = isA ? match.playerB : match.playerA;\n      if (opponent === '輪空') {\n        group.wins += 1;\n        group.points += Number(round.byePoints) || 0;\n        return;\n      }\n      group.points += Number(isA ? match.scoreA : match.scoreB) || 0;\n      if (match.winner === player) group.wins += 1; else group.losses += 1;\n    });`,
);

await replaceOnce(
  'tests/swiss.test.mjs',
  `assert.equal(odd.playerStats[firstBye].matchesPlayed, 0, '輪空不是實際出賽，不應增加出賽場次');\nodd = finishCurrentRound(odd);`,
  `assert.equal(odd.playerStats[firstBye].matchesPlayed, 0, '輪空不是實際出賽，不應增加出賽場次');\nconst oddLeaderboard = scheduleView([odd], odd.id, true);\nconst oddPlayerStart = oddLeaderboard.indexOf(\`<strong>\${firstBye}\`);\nconst oddPlayerEnd = oddLeaderboard.indexOf('</details>', oddPlayerStart);\nconst oddPlayerSection = oddLeaderboard.slice(oddPlayerStart, oddPlayerEnd);\nassert.match(oddPlayerSection, /<span>1<\\/span><span>0<\\/span><b>4<\\/b>/, '排行榜勝敗與總得分必須包含輪空');\nassert.match(oddPlayerSection, /<b>瑞士輪<\\/b><i>1 勝 0 敗 · 4 分/, '排行榜展開的階段成績也必須把輪空算成勝場');\nodd = finishCurrentRound(odd);`,
);

await replaceOnce(
  'tests/swiss.test.mjs',
  `assert.equal(historicalByePlayer.totalPoints, 0, '舊 round 沒有 byePoints 時不可回溯增加 4 分');\n\nlet swissWithdrawal`,
  `assert.equal(historicalByePlayer.totalPoints, 0, '舊 round 沒有 byePoints 時不可回溯增加 4 分');\nconst historicalByeView = scheduleView([historicalByeProbe], historicalByeProbe.id, true);\nconst historicalPlayerStart = historicalByeView.indexOf('<strong>舊A');\nconst historicalPlayerEnd = historicalByeView.indexOf('</details>', historicalPlayerStart);\nconst historicalPlayerSection = historicalByeView.slice(historicalPlayerStart, historicalPlayerEnd);\nassert.match(historicalPlayerSection, /<span>1<\\/span><span>0<\\/span><b>0<\\/b>/, '舊輪空在排行榜仍應顯示一勝但不回溯補分');\nassert.match(historicalPlayerSection, /<b>瑞士輪<\\/b><i>1 勝 0 敗 · 0 分/, '舊輪空的階段成績要顯示勝場且維持歷史 0 分');\n\nlet swissWithdrawal`,
);

console.log('Applied Swiss BYE leaderboard display fix.');
