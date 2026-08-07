/** 依任務關鍵字輸出最小檔案／規則／測試集合，避免 AI 每次重新掃描整個 repository。 */
const query = process.argv.slice(2).join(' ').trim().toLocaleLowerCase('zh-Hant');

const areas = [
  {
    name: 'Swiss / ranking / finals',
    terms: ['swiss', '瑞士', '排名', '排行榜', '四強', '資格', 'no_show', '未報到', '輪空', '配對'],
    files: ['src/formats/swiss.js', 'src/domain/tournament.js', 'src/views/schedule.js'],
    tests: ['tests/swiss.test.mjs', 'tests/check-in.test.mjs', 'tests/format-matrix.test.mjs'],
    rules: ['Checked-in players rank above no-show players.', 'Preliminary, qualifier, and final stats are phase-specific.', 'Do not regenerate already stored rounds.'],
  },
  {
    name: 'Single elimination',
    terms: ['single', '單淘汰', '淘汰', '晉級', '冠軍', '重賽'],
    files: ['src/formats/single-elimination.js', 'src/domain/tournament.js', 'src/views/schedule.js'],
    tests: ['tests/format-matrix.test.mjs', 'tests/tournament.test.html'],
    rules: ['Only active winners advance.', 'Replay invalidates dependent later rounds.', 'No-show players rank after all checked-in participants.'],
  },
  {
    name: 'Scoreboard / scoring',
    terms: ['score', '比分', '記分', '棄賽', 'forfeit', '平手'],
    files: ['src/views/scoreboard.js', 'src/main.js', 'src/domain/tournament.js', 'worker/index.js'],
    tests: ['tests/swiss.test.mjs', 'tests/api.test.mjs', 'tests/full-flow.test.html'],
    rules: ['Formal winner must have at least 4 points.', 'Ties cannot be confirmed.', 'Worker validates official actions.'],
  },
  {
    name: 'Registration / check-in / roster',
    terms: ['registration', '報名', '報到', '名單', '候補', '電話', 'check-in', 'checkin'],
    files: ['src/views/registration.js', 'src/views/registration-admin.js', 'src/views/schedule.js', 'src/core/roster-filter.js', 'src/domain/tournament.js', 'worker/index.js'],
    tests: ['tests/registration.test.mjs', 'tests/check-in.test.mjs', 'tests/roster-filter.test.mjs'],
    rules: ['Public endpoints never expose phone data.', 'Only checked-in active players enter pairings.', 'Closing registration revokes the old token.'],
  },
  {
    name: 'Sync / API / Worker',
    terms: ['sync', '同步', 'api', 'worker', 'd1', 'revision', 'etag', '衝突', '登入', 'pin'],
    files: ['src/data/store.js', 'worker/index.js', 'db/schema.ts', '.openai/drizzle/'],
    tests: ['tests/api.test.mjs', 'tests/sync.test.mjs', 'tests/action-sync.test.mjs', 'tests/registration.test.mjs'],
    rules: ['Keep revision optimistic locking.', 'Keep authorization on admin endpoints.', 'Keep ETag/304 reads side-effect free.'],
  },
  {
    name: 'UI / mobile / navigation',
    terms: ['ui', '手機', 'mobile', 'css', '畫面', '按鈕', '導覽', 'navigation', 'responsive'],
    files: ['src/styles/app.css', 'src/main.js', 'src/core/router.js', 'src/views/', 'src/ui/'],
    tests: ['tests/responsive-ui.test.mjs', 'tests/navigation.test.mjs', 'tests/full-flow.test.html'],
    rules: ['Do not move business rules into views.', 'Keep touch targets and mobile overflow usable.', 'Manual real-device verification is still required for Safari-specific behavior.'],
  },
  {
    name: 'Backup / restore / export',
    terms: ['backup', '備份', '還原', 'json', 'csv', 'png', '資料修復'],
    files: ['src/views/data-management.js', 'src/export/share-card-png.js', 'worker/index.js', 'scripts/validate-backup.mjs'],
    tests: ['tests/data-management.test.mjs', 'node scripts/validate-backup.mjs <backup.json>'],
    rules: ['Never overwrite the source backup.', 'Full restore replaces the cloud tournament collection.', 'Preserve unrelated tournaments and completed history.'],
  },
  {
    name: 'Build / Sites deployment',
    terms: ['deploy', '部署', 'sites', 'build', 'hosting', '上架'],
    files: ['scripts/build-site.mjs', 'scripts/verify-deployment.mjs', '.openai/hosting.json', '.openai/drizzle/', 'worker/index.js'],
    tests: ['node scripts/test-full.mjs', 'node scripts/build-site.mjs', 'node scripts/verify-deployment.mjs <site-url>'],
    rules: ['Update the existing Site.', 'Do not change project_id or D1 binding.', 'Code deployment must not restore or clear production data.'],
  },
];

const matched = query
  ? areas.filter((area) => area.terms.some((term) => query.includes(term)))
  : [];
const selected = matched.length ? matched : areas.slice(0, 1);

console.log(`# Spin League task context${query ? `: ${query}` : ''}`);
for (const area of selected) {
  console.log(`\n## ${area.name}`);
  console.log('Files:');
  area.files.forEach((file) => console.log(`- ${file}`));
  console.log('Tests:');
  area.tests.forEach((test) => console.log(`- ${test}`));
  console.log('Rules:');
  area.rules.forEach((rule) => console.log(`- ${rule}`));
}
console.log('\nShared references:');
console.log('- .agents/skills/spin-league-debug/references/invariants.md');
console.log('- .agents/skills/spin-league-test/references/test-matrix.md');
