/** 獨立／正式比賽共用記分板。正式模式使用 Scoring V2 逐局得分事件。 */
import {
  SCORING_METHODS,
  addScoringEvent,
  calculateScore,
  scoringEventLabel,
  undoScoringEvent,
} from '../domain/scoring.js';
import { pageHeader } from '../ui/shell.js';

export function scoreboardView(options = {}) {
  const isMatch = options.mode === 'match';
  const title = isMatch ? options.tournamentName : '獨立記分板';
  const description = isMatch
    ? `${options.roundName} · 依勝利方式逐局記分，確認結果後再一次保存正式賽果。`
    : '適合練習與臨時對戰；比分不會連動正式賽事。';
  const action = isMatch
    ? '<button class="button button-secondary" data-action="back-bracket">← 返回賽程</button>'
    : '<button class="button button-secondary" data-action="reset-score">重設比分</button>';

  return `<section class="section-wrap page-section">
    ${pageHeader(isMatch ? 'MATCH SCORING' : 'QUICK MATCH', title, description, action)}
    <div class="scoreboard ${isMatch ? 'match-mode scoring-v2' : ''}" data-scoreboard>
      ${scoreSide('a', 'BLUE SIDE', options.playerA || '選手 A', 'blue', isMatch)}
      <div class="versus"><span>VS</span><i></i></div>
      ${scoreSide('b', 'RED SIDE', options.playerB || '選手 B', 'red', isMatch)}
    </div>
    ${isMatch ? scoringEventLogView() : ''}
    <div class="score-toolbar"><button data-action="undo-score">↶ ${isMatch ? '撤銷上一局' : '復原上一步'}</button><span>${isMatch ? '達到 4 分後仍需人工確認完成比賽' : '點擊按鈕記分，最低為 0 分'}</span><button data-action="swap-sides">⇄ ${isMatch ? '交換邊' : '交換選手'}</button></div>
    ${isMatch ? `${manualAdjustmentView(options.playerA || '選手 A', options.playerB || '選手 B')}
    <div class="match-confirm"><p>勝方必須至少取得 4 分；Server 會重新驗證逐局事件加總與正式比分。</p><p class="match-sync-error" data-match-sync-error role="alert" hidden></p><button class="button button-primary" data-action="complete-match">確認結果並完成比賽</button></div>
    <div class="match-administrative"><div><b>棄賽判定</b><span>裁判判定後，對手將以 4：0 獲勝。</span></div><div><button class="button button-secondary" data-forfeit-player="${escapeAttribute(options.playerA || '')}">${escapeText(options.playerA || '選手 A')} 棄賽</button><button class="button button-secondary" data-forfeit-player="${escapeAttribute(options.playerB || '')}">${escapeText(options.playerB || '選手 B')} 棄賽</button></div></div>` : ''}
  </section>`;
}

function scoreSide(id, label, name, color, isMatch) {
  const controls = isMatch
    ? `<div class="scoring-methods" aria-label="${escapeAttribute(name)}得分方式">${SCORING_METHODS.map((method) => `<button class="scoring-method" data-scoring-player="${id}" data-scoring-type="${method.type}"><b>${escapeText(method.label)}</b><span>+${method.points}</span></button>`).join('')}</div>`
    : '<div class="score-actions"><button class="score-add" data-target="' + id + '" data-value="1"><b>＋</b><span>加 1 分</span></button><button class="score-subtract" data-target="' + id + '" data-value="-1"><b>−</b><span>減 1 分</span></button></div>';
  return `<article class="score-side ${color}"><div class="side-label">${label}</div><input data-name="${id}" value="${escapeAttribute(name)}" aria-label="${escapeAttribute(name)}名稱" ${isMatch ? 'readonly' : ''}><div class="score-value" data-score="${id}">0</div>${controls}</article>`;
}

function scoringEventLogView() {
  return `<section class="scoring-event-log" aria-live="polite"><div><b>最近得分</b><span>顯示最近 3 筆；完整紀錄會保存到歷史 Round</span></div><ol data-scoring-event-log><li class="is-empty">尚未記分</li></ol></section>`;
}

function manualAdjustmentView(playerA, playerB) {
  return `<details class="scoring-manual-adjustment">
    <summary>手動調整比分</summary>
    <p>僅在誤觸或特殊裁判判定時使用；每次調整仍會保存成 scoring event。</p>
    <div>
      <span>${escapeText(playerA)}</span>
      <button type="button" data-adjust-player="a" data-adjustment="-1">−1</button>
      <button type="button" data-adjust-player="a" data-adjustment="1">+1</button>
      <span>${escapeText(playerB)}</span>
      <button type="button" data-adjust-player="b" data-adjustment="-1">−1</button>
      <button type="button" data-adjust-player="b" data-adjustment="1">+1</button>
    </div>
  </details>`;
}

export function bindScoreboard(root, options = {}) {
  const isMatch = options.mode === 'match';
  const score = { a: options.scoreA ?? 0, b: options.scoreB ?? 0 };
  const sidePlayers = { a: options.playerA, b: options.playerB };
  const history = [];
  let scoringEvents = Array.isArray(options.scoringEvents) ? structuredClone(options.scoringEvents) : [];
  const syncErrorNode = root.querySelector('[data-match-sync-error]');
  const completeButton = root.querySelector('[data-action="complete-match"]');

  const canonicalScore = () => {
    if (isMatch) return calculateScore(scoringEvents, options.playerA, options.playerB);
    return sidePlayers.a === options.playerA
      ? { scoreA: score.a, scoreB: score.b }
      : { scoreA: score.b, scoreB: score.a };
  };
  const sideScore = (side, canonical = canonicalScore()) => sidePlayers[side] === options.playerA ? canonical.scoreA : canonical.scoreB;
  const render = () => {
    const canonical = canonicalScore();
    if (isMatch) {
      root.querySelector('[data-score="a"]').textContent = sideScore('a', canonical);
      root.querySelector('[data-score="b"]').textContent = sideScore('b', canonical);
      renderScoringEvents(root, scoringEvents);
      const finished = Math.max(canonical.scoreA, canonical.scoreB) >= 4;
      root.querySelectorAll('[data-scoring-type]').forEach((button) => { button.disabled = finished; });
      root.querySelectorAll('[data-adjustment="1"]').forEach((button) => { button.disabled = finished; });
      root.querySelectorAll('[data-adjustment="-1"]').forEach((button) => {
        button.disabled = sideScore(button.dataset.adjustPlayer, canonical) <= 0;
      });
      return;
    }
    Object.entries(score).forEach(([key, value]) => { root.querySelector(`[data-score="${key}"]`).textContent = value; });
  };
  const snapshot = () => history.push({ ...score });
  const showSyncError = (message = '') => {
    if (!syncErrorNode) return;
    syncErrorNode.textContent = message;
    syncErrorNode.hidden = !message;
  };
  const notifyScoreChange = () => {
    const current = canonicalScore();
    options.onScoreChange?.(current.scoreA, current.scoreB, structuredClone(scoringEvents));
    showSyncError('');
    if (completeButton) completeButton.textContent = '確認結果並完成比賽';
  };

  render();
  if (options.syncError) {
    showSyncError(options.syncError);
    if (completeButton) completeButton.textContent = '重新送出比分';
  }

  if (isMatch) {
    root.querySelectorAll('[data-scoring-type]').forEach((button) => button.addEventListener('click', () => {
      const current = canonicalScore();
      if (Math.max(current.scoreA, current.scoreB) >= 4) return;
      scoringEvents = addScoringEvent(scoringEvents, sidePlayers[button.dataset.scoringPlayer], button.dataset.scoringType);
      render();
      notifyScoreChange();
    }));
    root.querySelectorAll('[data-adjustment]').forEach((button) => button.addEventListener('click', () => {
      const delta = Number(button.dataset.adjustment);
      const current = canonicalScore();
      if (delta > 0 && Math.max(current.scoreA, current.scoreB) >= 4) return;
      const currentSideScore = sideScore(button.dataset.adjustPlayer, current);
      if (delta < 0 && currentSideScore <= 0) return;
      scoringEvents = addScoringEvent(scoringEvents, sidePlayers[button.dataset.adjustPlayer], 'adjustment', delta);
      render();
      notifyScoreChange();
    }));
  } else {
    root.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
      snapshot();
      const target = button.dataset.target;
      score[target] = Math.max(0, score[target] + Number(button.dataset.value));
      render();
      notifyScoreChange();
    }));
  }

  root.querySelector('[data-action="reset-score"]')?.addEventListener('click', () => {
    if (!confirm('確定要重設雙方比分嗎？')) return;
    snapshot(); score.a = 0; score.b = 0; render();
    notifyScoreChange();
  });

  root.querySelector('[data-action="undo-score"]')?.addEventListener('click', () => {
    if (isMatch) {
      if (!scoringEvents.length) return;
      scoringEvents = undoScoringEvent(scoringEvents);
    } else {
      const previous = history.pop(); if (!previous) return;
      score.a = previous.a; score.b = previous.b;
    }
    render();
    notifyScoreChange();
  });

  root.querySelector('[data-action="swap-sides"]')?.addEventListener('click', () => {
    if (!isMatch) {
      snapshot();
      [score.a, score.b] = [score.b, score.a];
    }
    [sidePlayers.a, sidePlayers.b] = [sidePlayers.b, sidePlayers.a];
    const names = root.querySelectorAll('[data-name]');
    [names[0].value, names[1].value] = [sidePlayers.a, sidePlayers.b];
    render();
    notifyScoreChange();
  });

  root.querySelector('[data-action="back-bracket"]')?.addEventListener('click', () => options.onBack?.());
  completeButton?.addEventListener('click', async (event) => {
    const current = canonicalScore();
    if (current.scoreA === current.scoreB) return alert('目前比分相同，請完成決勝後再確認結果。');
    if (Math.max(current.scoreA, current.scoreB) < 4) return alert('勝方最終比分必須至少為 4 分。');
    if (Math.min(current.scoreA, current.scoreB) >= 4) return alert('敗方最終比分必須低於 4 分。');
    const winner = current.scoreA > current.scoreB ? options.playerA : options.playerB;
    if (!confirm(`確定由「${winner}」獲勝並完成這場比賽嗎？`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在同步賽果…';
    try {
      await options.onComplete?.(current.scoreA, current.scoreB, structuredClone(scoringEvents));
    } catch (error) {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '重新送出比分';
        showSyncError(`同步失敗：${error?.message || '請確認網路後再試一次。'}`);
      }
    }
  });

  root.querySelectorAll('[data-forfeit-player]').forEach((button) => button.addEventListener('click', async () => {
    const player = button.dataset.forfeitPlayer;
    const opponent = player === options.playerA ? options.playerB : options.playerA;
    if (!confirm(`確定判定「${player}」棄賽嗎？\n「${opponent}」將以 4：0 獲勝。`)) return;
    const controls = [...root.querySelectorAll('[data-forfeit-player], [data-action="complete-match"]')];
    const originalLabels = new Map(controls.map((item) => [item, item.textContent]));
    controls.forEach((item) => { item.disabled = true; });
    button.textContent = '正在同步判定…';
    try {
      await options.onForfeit?.(player);
    } catch (error) {
      controls.forEach((item) => {
        if (!item.isConnected) return;
        item.disabled = false;
        item.textContent = originalLabels.get(item) || item.textContent;
      });
      reportScoreboardActionError(error);
    }
  }));
}

function renderScoringEvents(root, events) {
  const list = root.querySelector('[data-scoring-event-log]');
  if (!list) return;
  list.replaceChildren();
  const recent = events.slice(-3).reverse();
  if (!recent.length) {
    const empty = document.createElement('li');
    empty.className = 'is-empty';
    empty.textContent = '尚未記分';
    list.append(empty);
    return;
  }
  recent.forEach((event) => {
    const item = document.createElement('li');
    const player = document.createElement('b');
    const method = document.createElement('span');
    const points = document.createElement('i');
    player.textContent = event.player;
    method.textContent = scoringEventLabel(event);
    points.textContent = event.points > 0 ? `+${event.points}` : String(event.points);
    item.append(player, method, points);
    list.append(item);
  });
}

function reportScoreboardActionError(error) {
  alert(error?.message || '同步失敗，請確認網路後再試一次。');
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
