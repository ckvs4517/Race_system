import { createTournament, normalizeTournament, recordMatchResult } from '../src/domain/tournament.js';
import { scheduleView } from '../src/views/schedule.js';

const assertions = [];
function expect(condition, message) {
  if (!condition) throw new Error(message);
  assertions.push(message);
}

try {
  let tournament = createTournament('五人測試賽', ['A', 'B', 'C', 'D', 'E']);
  expect(tournament.rounds.length === 3, '五人賽產生三輪');
  expect(tournament.rounds[0].matches.filter((match) => match.status === '輪空晉級').length === 3, '三位選手自動輪空晉級');
  expect(tournament.rounds[0].matches[3].status === '可開始', '剩餘兩位選手可開始比賽');
  expect(tournament.rounds[1].matches[0].status === '可開始', '兩位輪空勝者已進入準決賽');

  tournament = recordMatchResult(tournament, 0, 3, 3, 1);
  expect(tournament.rounds[1].matches[1].playerB === 'D', '首輪勝者進入正確準決賽位置');
  expect(tournament.rounds[1].matches[1].status === '可開始', '第二場準決賽已可開始');

  tournament = recordMatchResult(tournament, 1, 0, 2, 3);
  tournament = recordMatchResult(tournament, 1, 1, 3, 0);
  expect(tournament.rounds[2].matches[0].status === '可開始', '兩場準決賽勝者進入冠軍賽');
  tournament = recordMatchResult(tournament, 2, 0, 4, 2);
  expect(tournament.champion === 'B', '冠軍與最終比分正確保存');
  expect(tournament.status === '已完成', '賽事完成狀態正確');

  const migrated = normalizeTournament({ id: 1, name: '舊賽事', players: ['甲', '乙', '丙'] });
  expect(migrated.rounds[0].matches[0].status === '輪空晉級', '舊資料可轉換並自動處理輪空');
  expect(scheduleView([tournament], null).includes('data-delete-tournament'), '賽事列表提供獨立刪除按鈕');

  document.querySelector('#result').textContent = `PASS ${assertions.length}\n${assertions.join('\n')}`;
} catch (error) {
  document.querySelector('#result').textContent = `FAIL\n${error.stack}`;
}
