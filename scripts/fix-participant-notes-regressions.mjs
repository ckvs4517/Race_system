import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/check-in.test.mjs';
let source = readFileSync(path, 'utf8');
const from = "assert.match(scheduleView([legacyDrinkTournament], legacyDrinkTournament.id, true), /舊飲品：果汁(無咖啡因)/, '舊飲品在無備註時保留唯讀提示');";
const to = "assert.ok(scheduleView([legacyDrinkTournament], legacyDrinkTournament.id, true).includes('舊飲品：果汁(無咖啡因)'), '舊飲品在無備註時保留唯讀提示');";
if (!source.includes(from)) throw new Error('legacy drink assertion pattern not found');
source = source.replace(from, to);
writeFileSync(path, source);
