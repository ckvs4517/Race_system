import { pageHeader } from '../ui/shell.js';

export function scoreboardView(options = {}) {
  const isMatch = options.mode === 'match';
  const title = isMatch ? options.tournamentName : '獨立記分板';
  const description = isMatch
    ? `${options.roundName} · 確認結果後將保存比分並自動更新晉級選手。`
    : '適合練習與臨時對戰；比分不會連動正式賽事。';
  const action = isMatch
    ? '<button class="button button-secondary" data-action="back-bracket">← 返回賽程</button>'
    : '<button class="button button-secondary" data-action="reset-score">重設比分</button>';

  return `<section class="section-wrap page-section">
    ${pageHeader(isMatch ? 'MATCH SCORING' : 'QUICK MATCH', title, description, action)}
    <div class="scoreboard ${isMatch ? 'match-mode' : ''}" data-scoreboard>
      ${scoreSide('a', 'BLUE SIDE', options.playerA || '選手 A', 'blue', isMatch)}
      <div class="versus"><span>VS</span><i></i></div>
      ${scoreSide('b', 'RED SIDE', options.playerB || '選手 B', 'red', isMatch)}
    </div>
    <div class="score-toolbar"><button data-action="undo-score">↶ 復原上一步</button><span>${isMatch ? '確認前仍可調整比分' : '點擊按鈕記分，最低為 0 分'}</span><button data-action="swap-sides" ${isMatch ? 'disabled' : ''}>⇄ 交換選手</button></div>
    ${isMatch ? '<div class="match-confirm"><p>請確認最終比分正確，送出後勝者會自動晉級。</p><button class="button button-primary" data-action="complete-match">確認結果並完成比賽</button></div>' : ''}
  </section>`;
}

function scoreSide(id, label, name, color, readonly) {
  return `<article class="score-side ${color}"><div class="side-label">${label}</div><input data-name="${id}" value="${escapeAttribute(name)}" aria-label="${escapeAttribute(name)}名稱" ${readonly ? 'readonly' : ''}><div class="score-value" data-score="${id}">0</div><div class="score-actions"><button class="score-add" data-target="${id}" data-value="1"><b>＋</b><span>加 1 分</span></button><button class="score-subtract" data-target="${id}" data-value="-1"><b>−</b><span>減 1 分</span></button></div></article>`;
}

export function bindScoreboard(root, options = {}) {
  const score = { a: options.scoreA || 0, b: options.scoreB || 0 };
  const history = [];
  const render = () => Object.entries(score).forEach(([key, value]) => { root.querySelector(`[data-score="${key}"]`).textContent = value; });
  const snapshot = () => history.push({ ...score });

  render();
  root.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => {
    snapshot();
    const target = button.dataset.target;
    score[target] = Math.max(0, score[target] + Number(button.dataset.value));
    render();
  }));

  root.querySelector('[data-action="reset-score"]')?.addEventListener('click', () => {
    if (!confirm('確定要重設雙方比分嗎？')) return;
    snapshot(); score.a = 0; score.b = 0; render();
  });

  root.querySelector('[data-action="undo-score"]')?.addEventListener('click', () => {
    const previous = history.pop(); if (!previous) return;
    score.a = previous.a; score.b = previous.b; render();
  });

  root.querySelector('[data-action="swap-sides"]:not([disabled])')?.addEventListener('click', () => {
    snapshot(); [score.a, score.b] = [score.b, score.a];
    const names = root.querySelectorAll('[data-name]'); [names[0].value, names[1].value] = [names[1].value, names[0].value]; render();
  });

  root.querySelector('[data-action="back-bracket"]')?.addEventListener('click', () => options.onBack?.());
  root.querySelector('[data-action="complete-match"]')?.addEventListener('click', async (event) => {
    if (score.a === score.b) return alert('目前比分相同，請完成決勝後再確認結果。');
    const winner = score.a > score.b ? options.playerA : options.playerB;
    if (!confirm(`確定由「${winner}」獲勝並晉級嗎？`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在同步賽果…';
    await options.onComplete?.(score.a, score.b);
  });
}

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
