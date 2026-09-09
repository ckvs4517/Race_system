/** Schedule 決策面板的相容 façade；實作依賽制責任拆到聚焦子模組。 */
import { readSwissStage2Config as readSwissStage2ConfigImpl } from './stage2-decision-panel.js';

export { roundRobinTieBreakPanel } from './round-robin-decision-panel.js';
export { swissChampionLabel, swissDecisionPanel, swissStageGuide } from './swiss-decision-panel.js';

export function readSwissStage2Config(tournament) {
  return readSwissStage2ConfigImpl(tournament);
}
