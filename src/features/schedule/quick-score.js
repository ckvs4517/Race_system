/** 主控快速登分 interaction；正式賽果仍透過 Worker/domain 驗證。 */
import {
  applyQuickScoreChoice,
  createQuickScoreSelection,
  parseQuickScoreText,
  QUICK_SCORE_CHOICES,
  quickScoreSelectionStatus,
  readQuickScoreMode,
  selectQuickScoreSide,
  writeQuickScoreMode,
} from '../../core/quick-score.js';
import { executeTournamentAction, getState, selectMatch } from '../../data/store.js';
import { showToast } from '../../ui/toast.js';

let quickScoreDraft = null;

export function isQuickScoreModeEnabled() {
  return readQuickScoreMode();
}

export function bindQuickScoreControls(root, state, { requestRender, rememberScroll }) {
  mountQuickScoreInline(root, state, { requestRender, rememberScroll });

  root.querySelector('[data-action="toggle-quick-score"]')?.addEventListener('click', () => {
    const enabled = writeQuickScoreMode(!readQuickScoreMode());
    if (!enabled) quickScoreDraft = null;
    rememberScroll?.({ top: window.scrollY, left: window.scrollX });
    requestRender();
    showToast(enabled ? '快速登分模式已開啟。' : '快速登分模式已關閉。');
  });

  root.querySelectorAll('.match-card.is-ready').forEach((card) => card.addEventListener('click', () => {
    if (state.isAdmin && readQuickScoreMode()) {
      openQuickScoreInline(root, state, card, { requestRender, rememberScroll });
      return;
    }
    rememberScroll?.({ top: window.scrollY, left: window.scrollX });
    selectMatch(card.dataset.roundIndex, card.dataset.matchIndex);
    requestRender(true);
  }));
}

function quickScoreMatch(draft, state = getState()) {
  const tournament = state.tournaments.find((item) => item.id === draft?.tournamentId);
  const round = tournament?.rounds?.[draft?.roundIndex];
  const match = round?.matches?.[draft?.matchIndex];
  return { tournament, round, match };
}

function quickScoreChoiceButtons() {
  return QUICK_SCORE_CHOICES.map((value) => `<button type="button" data-quick-score-value="${value}" aria-pressed="false">${value}</button>`).join('');
}

function quickScoreInlineMarkup() {
  return `<form class="quick-score-inline-form" data-quick-score-form novalidate>
    <div class="quick-score-inline-heading"><span data-quick-score-context>快速登分</span><button type="button" data-quick-score-close>取消</button></div>
    <div class="quick-score-player-list" aria-label="選擇要輸入比分的選手">
      <button type="button" class="quick-score-player-row" data-quick-score-player="a" aria-pressed="true"><span data-quick-score-player-label="a">選手 A</span><strong data-quick-score-player-score="a">—</strong></button>
      <button type="button" class="quick-score-player-row" data-quick-score-player="b" aria-pressed="false"><span data-quick-score-player-label="b">選手 B</span><strong data-quick-score-player-score="b">—</strong></button>
    </div>
    <p class="quick-score-active-player">目前輸入：<b data-quick-score-active-player>選手 A</b></p>
    <div class="quick-score-choice-grid" role="group" aria-label="選擇最終分數">${quickScoreChoiceButtons()}</div>
    <p class="quick-score-result" data-quick-score-summary>請先選第一位選手的分數</p>
    <input type="hidden" name="score" data-quick-score-legacy-input>
    <button type="submit" class="button button-primary quick-score-submit" data-quick-score-submit disabled>選完兩邊比分後確認</button>
    <p class="quick-score-help">先替第一位選手點選 0～6 分，系統會自動切到第二位；需要修改時直接點選手列再重新選分數。</p>
    <p class="quick-score-error" data-quick-score-error role="alert" hidden></p>
  </form>`;
}

function removeQuickScoreInline(root) {
  root.querySelector('[data-quick-score-inline]')?.remove();
  root.querySelectorAll('.match-card.is-quick-scoring').forEach((card) => card.classList.remove('is-quick-scoring'));
}

function hydrateQuickScoreInline(inline) {
  if (!quickScoreDraft) return false;
  const { tournament, round, match } = quickScoreMatch(quickScoreDraft);
  if (!tournament || !round || !match || tournament.status !== '進行中' || match.status !== '可開始') return false;

  const form = inline.querySelector('[data-quick-score-form]');
  const activeSide = quickScoreDraft.activeSide === 'b' ? 'b' : 'a';
  const activeScore = activeSide === 'a' ? quickScoreDraft.scoreA : quickScoreDraft.scoreB;
  const status = quickScoreSelectionStatus(quickScoreDraft);

  form.querySelector('[data-quick-score-context]').textContent = `${quickScoreDraft.arenaLabel || '戰鬥台 1'} · ${round.name}`;
  form.querySelector('[data-quick-score-player-label="a"]').textContent = match.playerA;
  form.querySelector('[data-quick-score-player-label="b"]').textContent = match.playerB;
  form.querySelector('[data-quick-score-player-score="a"]').textContent = quickScoreDraft.scoreA ?? '—';
  form.querySelector('[data-quick-score-player-score="b"]').textContent = quickScoreDraft.scoreB ?? '—';
  form.querySelector('[data-quick-score-active-player]').textContent = activeSide === 'a' ? match.playerA : match.playerB;

  form.querySelectorAll('[data-quick-score-player]').forEach((button) => {
    const selected = button.dataset.quickScorePlayer === activeSide;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.disabled = Boolean(quickScoreDraft.submitting);
  });
  form.querySelectorAll('[data-quick-score-value]').forEach((button) => {
    const selected = Number(button.dataset.quickScoreValue) === activeScore;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.disabled = Boolean(quickScoreDraft.submitting);
  });

  const summary = form.querySelector('[data-quick-score-summary]');
  if (quickScoreDraft.scoreA === null && quickScoreDraft.scoreB === null) summary.textContent = '請先選第一位選手的分數';
  else summary.textContent = `${match.playerA} ${quickScoreDraft.scoreA ?? '—'} : ${quickScoreDraft.scoreB ?? '—'} ${match.playerB}`;

  const hiddenInput = form.querySelector('[name="score"]');
  hiddenInput.value = quickScoreDraft.scoreText || (status.complete ? `${status.scoreA}:${status.scoreB}` : '');

  const errorNode = form.querySelector('[data-quick-score-error]');
  const displayError = quickScoreDraft.error || status.error;
  errorNode.textContent = displayError || '';
  errorNode.hidden = !displayError;

  const submit = form.querySelector('[data-quick-score-submit]');
  submit.disabled = Boolean(quickScoreDraft.submitting) || !status.valid;
  if (quickScoreDraft.submitting) submit.textContent = '正在同步…';
  else if (status.valid) {
    const prefix = quickScoreDraft.error ? '重新送出' : '確認';
    submit.textContent = `${prefix} ${match.playerA} ${status.scoreA} : ${status.scoreB} ${match.playerB}`;
  } else submit.textContent = '選完兩邊比分後確認';

  form.querySelector('[data-quick-score-close]').disabled = Boolean(quickScoreDraft.submitting);
  form.setAttribute('aria-busy', quickScoreDraft.submitting ? 'true' : 'false');
  return true;
}

function focusQuickScoreInline(inline) {
  if (!quickScoreDraft || quickScoreDraft.submitting) return;
  inline.querySelector(`[data-quick-score-player="${quickScoreDraft.activeSide === 'b' ? 'b' : 'a'}"]`)?.focus();
}

function bindQuickScoreInlineForm(root, inline, { requestRender, rememberScroll }) {
  const form = inline.querySelector('[data-quick-score-form]');
  const hiddenInput = form.querySelector('[name="score"]');

  const syncLegacyTextDraft = () => {
    if (!quickScoreDraft) return;
    const text = hiddenInput.value.trim();
    quickScoreDraft.scoreText = text;
    quickScoreDraft.error = '';
    if (text) {
      try {
        const score = parseQuickScoreText(text);
        quickScoreDraft.scoreA = score.scoreA;
        quickScoreDraft.scoreB = score.scoreB;
      } catch (error) {
        quickScoreDraft.scoreA = null;
        quickScoreDraft.scoreB = null;
        quickScoreDraft.error = error.message;
      }
    }
    hydrateQuickScoreInline(inline);
  };

  hiddenInput.addEventListener('input', syncLegacyTextDraft);
  form.querySelector('[data-quick-score-close]')?.addEventListener('click', () => {
    quickScoreDraft = null;
    removeQuickScoreInline(root);
  });
  form.querySelectorAll('[data-quick-score-player]').forEach((button) => button.addEventListener('click', () => {
    if (!quickScoreDraft || quickScoreDraft.submitting) return;
    quickScoreDraft = { ...selectQuickScoreSide(quickScoreDraft, button.dataset.quickScorePlayer), error: '' };
    hydrateQuickScoreInline(inline);
  }));
  form.querySelectorAll('[data-quick-score-value]').forEach((button) => button.addEventListener('click', () => {
    if (!quickScoreDraft || quickScoreDraft.submitting) return;
    quickScoreDraft = { ...applyQuickScoreChoice(quickScoreDraft, button.dataset.quickScoreValue), error: '', scoreText: '' };
    const status = quickScoreSelectionStatus(quickScoreDraft);
    if (status.complete) quickScoreDraft.scoreText = `${status.scoreA}:${status.scoreB}`;
    hydrateQuickScoreInline(inline);
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!quickScoreDraft || quickScoreDraft.submitting) return;
    if (hiddenInput.value.trim() && hiddenInput.value.trim() !== quickScoreDraft.scoreText) syncLegacyTextDraft();

    const score = quickScoreSelectionStatus(quickScoreDraft);
    if (!score.valid) {
      quickScoreDraft.error = score.error || '請先選完兩邊比分。';
      hydrateQuickScoreInline(inline);
      return;
    }

    const { tournament, match } = quickScoreMatch(quickScoreDraft);
    if (!tournament || match?.status !== '可開始') {
      quickScoreDraft.error = '這場對局已被更新，請確認最新賽程。';
      hydrateQuickScoreInline(inline);
      return;
    }

    const draft = { ...quickScoreDraft };
    const scrollPosition = { top: window.scrollY, left: window.scrollX };
    quickScoreDraft.submitting = true;
    quickScoreDraft.error = '';
    hydrateQuickScoreInline(inline);
    try {
      await executeTournamentAction(tournament.id, 'record_match', {
        roundIndex: draft.roundIndex,
        matchIndex: draft.matchIndex,
        scoreA: score.scoreA,
        scoreB: score.scoreB,
      }, { retryOnConflict: false });
      quickScoreDraft = null;
      rememberScroll?.(scrollPosition);
      requestRender();
      showToast(`已登錄 ${match.playerA} ${score.scoreA}：${score.scoreB} ${match.playerB}`);
    } catch (error) {
      const latest = getState();
      const latestMatch = latest.tournaments.find((item) => item.id === draft.tournamentId)
        ?.rounds?.[draft.roundIndex]?.matches?.[draft.matchIndex];
      if (latestMatch?.status !== '可開始') {
        quickScoreDraft = null;
        rememberScroll?.(scrollPosition);
        requestRender();
        showToast('這場對局已由其他裝置完成或變更，已載入最新賽果。', 'error');
        return;
      }
      quickScoreDraft = { ...draft, error: error.message || '同步失敗，請確認網路後重新送出。', submitting: false };
      rememberScroll?.(scrollPosition);
      requestRender();
    }
  });
}

function mountQuickScoreInline(root, state, callbacks, focus = true) {
  removeQuickScoreInline(root);
  if (!state.isAdmin || !readQuickScoreMode() || !quickScoreDraft || quickScoreDraft.tournamentId !== state.selectedTournamentId) return;
  const { tournament, match } = quickScoreMatch(quickScoreDraft, state);
  if (!tournament || tournament.status !== '進行中' || match?.status !== '可開始') {
    quickScoreDraft = null;
    return;
  }
  const card = root.querySelector(`.match-card.is-ready[data-round-index="${quickScoreDraft.roundIndex}"][data-match-index="${quickScoreDraft.matchIndex}"]`);
  if (!card) {
    quickScoreDraft = null;
    return;
  }
  card.classList.add('is-quick-scoring');
  const inline = document.createElement('div');
  inline.className = 'quick-score-inline';
  inline.dataset.quickScoreInline = '';
  inline.innerHTML = quickScoreInlineMarkup();
  card.insertAdjacentElement('afterend', inline);
  if (!hydrateQuickScoreInline(inline)) {
    quickScoreDraft = null;
    removeQuickScoreInline(root);
    return;
  }
  bindQuickScoreInlineForm(root, inline, callbacks);
  if (focus) queueMicrotask(() => focusQuickScoreInline(inline));
}

function openQuickScoreInline(root, state, card, callbacks) {
  const tournament = state.tournaments.find((item) => item.id === state.selectedTournamentId);
  const roundIndex = Number(card.dataset.roundIndex);
  const matchIndex = Number(card.dataset.matchIndex);
  const match = tournament?.rounds?.[roundIndex]?.matches?.[matchIndex];
  if (!state.isAdmin || !tournament || tournament.status !== '進行中' || match?.status !== '可開始') return;
  const sameMatch = quickScoreDraft?.tournamentId === tournament.id
    && quickScoreDraft?.roundIndex === roundIndex
    && quickScoreDraft?.matchIndex === matchIndex;
  if (sameMatch) {
    const inline = root.querySelector('[data-quick-score-inline]');
    if (inline) focusQuickScoreInline(inline);
    return;
  }
  const arenaLabel = card.closest('.battle-station')?.querySelector('.battle-station-title span')?.textContent?.trim() || '戰鬥台 1';
  quickScoreDraft = {
    tournamentId: tournament.id,
    roundIndex,
    matchIndex,
    arenaLabel,
    ...createQuickScoreSelection(),
    scoreText: '',
    error: '',
    submitting: false,
  };
  mountQuickScoreInline(root, state, callbacks);
}
