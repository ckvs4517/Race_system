/** 主控快速登分 interaction；正式賽果仍透過 Worker/domain 驗證。 */
import { parseQuickScoreText, readQuickScoreMode, writeQuickScoreMode } from '../../core/quick-score.js';
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

function updateQuickScoreInlineSubmitLabel(form) {
  const submit = form.querySelector('[data-quick-score-submit]');
  const input = form.querySelector('[name="score"]');
  if (!submit) return;
  const prefix = quickScoreDraft?.error ? '重新送出' : '確認登分';
  try {
    const score = parseQuickScoreText(input?.value || '');
    submit.textContent = `${prefix} ${score.scoreA} : ${score.scoreB}`;
  } catch {
    submit.textContent = prefix;
  }
}

function quickScoreInlineMarkup() {
  return `<form class="quick-score-inline-form" data-quick-score-form novalidate>
    <div class="quick-score-inline-heading"><span data-quick-score-context>快速登分</span><button type="button" data-quick-score-close>取消</button></div>
    <div class="quick-score-inline-entry"><label><span class="sr-only">最終比分</span><input type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" name="score" placeholder="例如 42" aria-label="最終比分" required></label><button type="submit" class="button button-primary" data-quick-score-submit>確認登分</button></div>
    <p class="quick-score-help">可輸入 42、4:2、4 2 或 4-2；任一方達到或超過 4 分即結束，敗方必須低於 4 分。</p>
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
  form.querySelector('[data-quick-score-context]').textContent = `${quickScoreDraft.arenaLabel || '戰鬥台 1'} · ${round.name} · ${match.playerA} vs ${match.playerB}`;
  const input = form.querySelector('[name="score"]');
  input.value = quickScoreDraft.scoreText ?? '';
  const errorNode = form.querySelector('[data-quick-score-error]');
  errorNode.textContent = quickScoreDraft.error || '';
  errorNode.hidden = !quickScoreDraft.error;
  const submit = form.querySelector('[data-quick-score-submit]');
  submit.disabled = Boolean(quickScoreDraft.submitting);
  if (quickScoreDraft.submitting) submit.textContent = '正在同步…';
  else updateQuickScoreInlineSubmitLabel(form);
  return true;
}

function focusQuickScoreInline(inline) {
  if (!quickScoreDraft || quickScoreDraft.submitting) return;
  const input = inline.querySelector('[name="score"]');
  input?.focus();
  input?.select?.();
}

function bindQuickScoreInlineForm(root, inline, { requestRender, rememberScroll }) {
  const form = inline.querySelector('[data-quick-score-form]');
  const input = form.querySelector('[name="score"]');
  const errorNode = form.querySelector('[data-quick-score-error]');

  const syncDraft = () => {
    if (!quickScoreDraft) return;
    quickScoreDraft.scoreText = input.value;
    quickScoreDraft.error = '';
    errorNode.textContent = '';
    errorNode.hidden = true;
    updateQuickScoreInlineSubmitLabel(form);
  };
  input.addEventListener('input', syncDraft);
  form.querySelector('[data-quick-score-close]')?.addEventListener('click', () => {
    quickScoreDraft = null;
    removeQuickScoreInline(root);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!quickScoreDraft || quickScoreDraft.submitting) return;
    syncDraft();
    let score;
    try {
      score = parseQuickScoreText(input.value);
    } catch (error) {
      quickScoreDraft.error = error.message;
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      updateQuickScoreInlineSubmitLabel(form);
      return;
    }

    const { tournament, match } = quickScoreMatch(quickScoreDraft);
    if (!tournament || match?.status !== '可開始') {
      quickScoreDraft.error = '這場對局已被更新，請確認最新賽程。';
      errorNode.textContent = quickScoreDraft.error;
      errorNode.hidden = false;
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
    scoreText: '',
    error: '',
    submitting: false,
  };
  mountQuickScoreInline(root, state, callbacks);
}
