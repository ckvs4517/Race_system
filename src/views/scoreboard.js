/** 獨立／正式比賽共用記分板。正式模式使用 Scoring V2 逐局得分事件。 */
import {
  SCORING_METHODS,
  addScoringEvent,
  calculateScore,
  removeScoringEvent,
  replaceScoringEvent,
  scoringEventLabel,
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
    ${isMatch ? scoringHistoryView(options.playerA || '選手 A', options.playerB || '選手 B') : ''}
    <div class="score-toolbar">${isMatch ? '' : '<button data-action="undo-score">↶ 復原上一步</button>'}<span>${isMatch ? '達到 4 分後仍需人工確認完成比賽' : '點擊按鈕記分，最低為 0 分'}</span><button data-action="swap-sides">⇄ ${isMatch ? '交換邊' : '交換選手'}</button></div>
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

function scoringHistoryView(playerA, playerB) {
  const methodButtons = SCORING_METHODS.map((method) => `<button type="button" data-edit-scoring-type="${method.type}" data-edit-adjustment=""><b>${escapeText(method.label)}</b><span>+${method.points}</span></button>`).join('');
  return `<div class="scoring-history-trigger">
    <button type="button" class="button button-secondary" data-action="open-scoring-history"><span>得分紀錄</span><b><i data-scoring-event-count>0</i> 筆</b></button>
    <span>可查看完整紀錄、變更判定或撤銷指定一局</span>
  </div>
  <dialog class="scoring-history-dialog" data-scoring-history-dialog>
    <div class="scoring-history-card">
      <div class="scoring-history-heading"><div><p class="kicker">SCORING HISTORY</p><h2>得分紀錄</h2></div><button type="button" data-close-scoring-history aria-label="關閉">×</button></div>
      <div class="scoring-history-score">
        <span><b data-history-player="a">${escapeText(playerA)}</b><strong data-history-score="a">0</strong></span>
        <i>:</i>
        <span><strong data-history-score="b">0</strong><b data-history-player="b">${escapeText(playerB)}</b></span>
      </div>
      <ol class="scoring-history-list" data-scoring-history-list><li class="is-empty">尚未記分</li></ol>
      <section class="scoring-event-editor" data-scoring-event-editor hidden>
        <div><p class="kicker">EDIT EVENT</p><h3>變更這筆得分</h3></div>
        <label>得分方</label>
        <div class="scoring-event-player-choice">
          <button type="button" data-edit-scoring-player="a">${escapeText(playerA)}</button>
          <button type="button" data-edit-scoring-player="b">${escapeText(playerB)}</button>
        </div>
        <label>得分方式</label>
        <div class="scoring-event-method-choice">
          ${methodButtons}
          <button type="button" data-edit-scoring-type="adjustment" data-edit-adjustment="1"><b>手動調整</b><span>+1</span></button>
          <button type="button" data-edit-scoring-type="adjustment" data-edit-adjustment="-1"><b>手動調整</b><span>−1</span></button>
        </div>
        <p class="scoring-event-editor-error" data-scoring-event-editor-error hidden></p>
        <div class="scoring-event-editor-actions"><button type="button" class="button button-secondary" data-cancel-scoring-event-edit>取消</button><button type="button" class="button button-primary" data-save-scoring-event-edit>儲存變更</button></div>
      </section>
    </div>
  </dialog>`;
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
  const historyDialog = root.querySelector('[data-scoring-history-dialog]');
  const historyEditor = root.querySelector('[data-scoring-event-editor]');
  let editingEventIndex = null;

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
      renderScoringHistory(root, scoringEvents, sidePlayers, options.playerA, options.playerB);
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
    const previous = history.pop(); if (!previous) return;
    score.a = previous.a; score.b = previous.b;
    render();
    notifyScoreChange();
  });

  root.querySelector('[data-action="open-scoring-history"]')?.addEventListener('click', () => {
    closeScoringEventEditor(historyEditor);
    historyDialog?.showModal();
  });
  root.querySelector('[data-close-scoring-history]')?.addEventListener('click', () => historyDialog?.close());
  root.querySelector('[data-cancel-scoring-event-edit]')?.addEventListener('click', () => {
    editingEventIndex = null;
    closeScoringEventEditor(historyEditor);
  });

  historyDialog?.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit-scoring-event]');
    if (editButton) {
      editingEventIndex = Number(editButton.dataset.editScoringEvent);
      openScoringEventEditor(historyEditor, scoringEvents[editingEventIndex], sidePlayers, options.playerA, options.playerB);
      return;
    }
    const removeButton = event.target.closest('[data-remove-scoring-event]');
    if (removeButton) {
      const index = Number(removeButton.dataset.removeScoringEvent);
      if (!confirm(`確定撤銷第 ${index + 1} 局的得分紀錄嗎？`)) return;
      try {
        const nextEvents = removeScoringEvent(scoringEvents, index);
        calculateScore(nextEvents, options.playerA, options.playerB);
        scoringEvents = nextEvents;
        editingEventIndex = null;
        closeScoringEventEditor(historyEditor);
        render();
        notifyScoreChange();
      } catch (error) {
        alert(error.message);
      }
      return;
    }
    const playerButton = event.target.closest('[data-edit-scoring-player]');
    if (playerButton && historyEditor) {
      historyEditor.dataset.player = playerButton.dataset.editScoringPlayer;
      updateScoringEventEditorSelection(historyEditor);
      return;
    }
    const methodButton = event.target.closest('[data-edit-scoring-type]');
    if (methodButton && historyEditor) {
      historyEditor.dataset.type = methodButton.dataset.editScoringType;
      historyEditor.dataset.adjustment = methodButton.dataset.editAdjustment || '';
      updateScoringEventEditorSelection(historyEditor);
    }
  });

  root.querySelector('[data-save-scoring-event-edit]')?.addEventListener('click', () => {
    if (!historyEditor || editingEventIndex === null) return;
    const player = historyEditor.dataset.player === 'b' ? sidePlayers.b : sidePlayers.a;
    const type = historyEditor.dataset.type || '';
    const adjustment = type === 'adjustment' ? Number(historyEditor.dataset.adjustment) : null;
    const errorNode = historyEditor.querySelector('[data-scoring-event-editor-error]');
    try {
      const nextEvents = replaceScoringEvent(scoringEvents, editingEventIndex, player, type, adjustment);
      calculateScore(nextEvents, options.playerA, options.playerB);
      scoringEvents = nextEvents;
      editingEventIndex = null;
      closeScoringEventEditor(historyEditor);
      render();
      notifyScoreChange();
    } catch (error) {
      if (errorNode) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    }
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

function renderScoringHistory(root, events, sidePlayers, playerA, playerB) {
  const count = root.querySelector('[data-scoring-event-count]');
  if (count) count.textContent = String(events.length);
  const list = root.querySelector('[data-scoring-history-list]');
  if (!list) return;

  const score = calculateScore(events, playerA, playerB);
  const scoreA = sidePlayers.a === playerA ? score.scoreA : score.scoreB;
  const scoreB = sidePlayers.b === playerB ? score.scoreB : score.scoreA;
  const playerANode = root.querySelector('[data-history-player="a"]');
  const playerBNode = root.querySelector('[data-history-player="b"]');
  const scoreANode = root.querySelector('[data-history-score="a"]');
  const scoreBNode = root.querySelector('[data-history-score="b"]');
  if (playerANode) playerANode.textContent = sidePlayers.a;
  if (playerBNode) playerBNode.textContent = sidePlayers.b;
  if (scoreANode) scoreANode.textContent = String(scoreA);
  if (scoreBNode) scoreBNode.textContent = String(scoreB);

  list.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('li');
    empty.className = 'is-empty';
    empty.textContent = '尚未記分';
    list.append(empty);
    return;
  }

  events.forEach((scoringEvent, index) => {
    const item = document.createElement('li');
    item.className = 'scoring-history-item';

    const sequence = document.createElement('span');
    sequence.className = 'scoring-history-sequence';
    sequence.textContent = String(index + 1).padStart(2, '0');

    const detail = document.createElement('div');
    const player = document.createElement('b');
    const method = document.createElement('span');
    player.textContent = scoringEvent.player;
    method.textContent = scoringEventLabel(scoringEvent);
    detail.append(player, method);

    const points = document.createElement('strong');
    points.textContent = scoringEvent.points > 0 ? `+${scoringEvent.points}` : String(scoringEvent.points);

    const actions = document.createElement('div');
    actions.className = 'scoring-history-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.editScoringEvent = String(index);
    edit.textContent = '變更';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removeScoringEvent = String(index);
    remove.textContent = '撤銷';
    actions.append(edit, remove);

    item.append(sequence, detail, points, actions);
    list.append(item);
  });
}

function openScoringEventEditor(editor, scoringEvent, sidePlayers, playerA, playerB) {
  if (!editor || !scoringEvent) return;
  const side = scoringEvent.player === sidePlayers.b ? 'b' : 'a';
  editor.dataset.player = side;
  editor.dataset.type = scoringEvent.type || '';
  editor.dataset.adjustment = scoringEvent.type === 'adjustment' ? String(scoringEvent.points) : '';
  editor.querySelector('[data-edit-scoring-player="a"]').textContent = sidePlayers.a || playerA;
  editor.querySelector('[data-edit-scoring-player="b"]').textContent = sidePlayers.b || playerB;
  const error = editor.querySelector('[data-scoring-event-editor-error]');
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
  updateScoringEventEditorSelection(editor);
  editor.hidden = false;
  editor.scrollIntoView({ block: 'nearest' });
}

function closeScoringEventEditor(editor) {
  if (!editor) return;
  editor.hidden = true;
  delete editor.dataset.player;
  delete editor.dataset.type;
  delete editor.dataset.adjustment;
  const error = editor.querySelector('[data-scoring-event-editor-error]');
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
}

function updateScoringEventEditorSelection(editor) {
  editor.querySelectorAll('[data-edit-scoring-player]').forEach((button) => {
    const selected = button.dataset.editScoringPlayer === editor.dataset.player;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  editor.querySelectorAll('[data-edit-scoring-type]').forEach((button) => {
    const selected = button.dataset.editScoringType === editor.dataset.type
      && (button.dataset.editScoringType !== 'adjustment' || button.dataset.editAdjustment === editor.dataset.adjustment);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
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
