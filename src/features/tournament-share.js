/** 在賽事資訊列加入公開分享按鈕、QR Code 與可分享的深連結。 */
import { getState, updateState } from '../data/store.js';
import { currentRoute } from '../core/router.js';
import { sharedTournamentIdFromHash, tournamentQrImageUrl, tournamentShareUrl } from '../core/tournament-share.js';

const app = document.querySelector('#app');
let dialog = null;
let lastShareTournamentId = null;

function currentTournament() {
  const state = getState();
  return state.tournaments.find((item) => item.id === state.selectedTournamentId) || null;
}

function syncSelectionFromHash() {
  if (currentRoute() !== 'schedule') return;
  const tournamentId = sharedTournamentIdFromHash(location.hash);
  if (tournamentId == null) return;
  const state = getState();
  if (state.loading || state.selectedTournamentId === tournamentId) return;
  if (!state.tournaments.some((item) => item.id === tournamentId)) return;
  updateState((current) => ({ ...current, selectedTournamentId: tournamentId, selectedMatch: null }));
}

function syncHashFromSelection() {
  if (currentRoute() !== 'schedule') return;
  const state = getState();
  const sharedId = sharedTournamentIdFromHash(location.hash);
  if (state.selectedTournamentId != null) {
    if (sharedId === state.selectedTournamentId) return;
    history.replaceState(null, '', `${location.pathname}${location.search}#schedule/${state.selectedTournamentId}`);
    return;
  }
  if (sharedId != null) history.replaceState(null, '', `${location.pathname}${location.search}#schedule`);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function closeShareDialog() {
  if (!dialog) return;
  dialog.close();
  dialog.remove();
  dialog = null;
  lastShareTournamentId = null;
}

function createShareDialog(tournament) {
  closeShareDialog();
  const shareUrl = tournamentShareUrl(tournament.id, location.href);
  const qrUrl = tournamentQrImageUrl(shareUrl);

  dialog = document.createElement('dialog');
  dialog.className = 'tournament-share-dialog';
  dialog.innerHTML = `
    <div class="tournament-share-card">
      <div class="tournament-share-heading">
        <div><p class="kicker">SHARE TOURNAMENT</p><h2></h2></div>
        <button type="button" class="tournament-share-close" aria-label="關閉">×</button>
      </div>
      <p class="tournament-share-description">掃描 QR Code 即可直接查看這場賽事的最新賽況、賽程與排行榜。</p>
      <div class="tournament-share-qr-wrap">
        <img class="tournament-share-qr" alt="賽事公開連結 QR Code" width="320" height="320">
        <p class="tournament-share-qr-error" hidden>QR Code 暫時無法載入，仍可使用下方連結。</p>
      </div>
      <label class="tournament-share-url"><span>公開賽事網址</span><input type="text" readonly></label>
      <div class="tournament-share-actions">
        <button type="button" class="button button-primary" data-copy-tournament-link>複製連結</button>
        <button type="button" class="button button-secondary" data-native-share-tournament>分享</button>
      </div>
    </div>`;

  dialog.querySelector('h2').textContent = tournament.name;
  const input = dialog.querySelector('.tournament-share-url input');
  input.value = shareUrl;
  const image = dialog.querySelector('.tournament-share-qr');
  image.src = qrUrl;
  image.addEventListener('error', () => {
    image.hidden = true;
    dialog.querySelector('.tournament-share-qr-error').hidden = false;
  }, { once: true });

  dialog.querySelector('.tournament-share-close').addEventListener('click', closeShareDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeShareDialog();
  });
  dialog.querySelector('[data-copy-tournament-link]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try {
      await copyText(shareUrl);
      button.textContent = '已複製';
      setTimeout(() => { if (button.isConnected) button.textContent = '複製連結'; }, 1600);
    } catch {
      input.focus();
      input.select();
    }
  });

  const shareButton = dialog.querySelector('[data-native-share-tournament]');
  if (!navigator.share) shareButton.hidden = true;
  else shareButton.addEventListener('click', async () => {
    try {
      await navigator.share({
        title: tournament.name,
        text: `查看「${tournament.name}」最新賽況、賽程與排行榜`,
        url: shareUrl,
      });
    } catch (error) {
      if (error?.name !== 'AbortError') await copyText(shareUrl);
    }
  });

  document.body.append(dialog);
  lastShareTournamentId = tournament.id;
  dialog.showModal();
}

function enhanceTournamentPage() {
  syncHashFromSelection();
  const tournament = currentTournament();
  const heading = app?.querySelector('.event-info-heading');
  if (!tournament || !heading || heading.querySelector('[data-share-current-tournament]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'event-info-share-button';
  button.dataset.shareCurrentTournament = String(tournament.id);
  button.textContent = '分享賽事';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    createShareDialog(currentTournament() || tournament);
  });
  heading.querySelector('.event-info-toggle')?.before(button);
}

window.addEventListener('hashchange', () => {
  queueMicrotask(() => {
    syncSelectionFromHash();
    enhanceTournamentPage();
  });
});

window.addEventListener('load', () => {
  syncSelectionFromHash();
  enhanceTournamentPage();
});

if (app) {
  new MutationObserver(() => enhanceTournamentPage()).observe(app, { childList: true, subtree: true });
  queueMicrotask(enhanceTournamentPage);
}

window.addEventListener('pagehide', () => {
  if (dialog?.open) dialog.close();
});
