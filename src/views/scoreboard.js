import { pageHeader } from '../ui/shell.js';

export function scoreboardView() {
  return `<section class="section-wrap page-section">
    ${pageHeader('QUICK MATCH', '獨立記分板', '適合練習與臨時對戰；比分不會連動正式賽事。', '<button class="button button-secondary" data-action="reset-score">重設比分</button>')}
    <div class="scoreboard" data-scoreboard>
      ${scoreSide('a', 'BLUE SIDE', '選手 A', 'blue')}
      <div class="versus"><span>VS</span><i></i></div>
      ${scoreSide('b', 'RED SIDE', '選手 B', 'red')}
    </div>
    <div class="score-toolbar"><button data-action="undo-score">↶ 復原上一步</button><span>點擊按鈕記分，最低為 0 分</span><button data-action="swap-sides">⇄ 交換選手</button></div>
  </section>`;
}

function scoreSide(id, label, name, color) {
  return `<article class="score-side ${color}"><div class="side-label">${label}</div><input data-name="${id}" value="${name}" aria-label="${name}名稱"><div class="score-value" data-score="${id}">0</div><div class="score-actions"><button class="score-add" data-target="${id}" data-value="1"><b>＋</b><span>加 1 分</span></button><button class="score-subtract" data-target="${id}" data-value="-1"><b>−</b><span>減 1 分</span></button></div></article>`;
}

export function bindScoreboard(root) {
  const score = { a: 0, b: 0 };
  const history = [];
  const render = () => Object.entries(score).forEach(([key, value]) => { root.querySelector(`[data-score="${key}"]`).textContent = value; });
  const snapshot = () => history.push({ ...score });

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

  root.querySelector('[data-action="swap-sides"]')?.addEventListener('click', () => {
    snapshot(); [score.a, score.b] = [score.b, score.a];
    const names = root.querySelectorAll('[data-name]'); [names[0].value, names[1].value] = [names[1].value, names[0].value]; render();
  });
}
