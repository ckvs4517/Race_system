/** 建立／編輯準備中賽事的表單；送出前驗證名單與戰鬥台數。 */
import { pageHeader } from '../ui/shell.js';
import { icons } from '../ui/icons.js';
import { MAX_TOURNAMENT_PLAYERS, createTournament, updateDraftTournament } from '../domain/tournament.js';
import { createEmptyDrinkSettings } from '../domain/drinks.js';
import { listTournamentFormats } from '../formats/registry.js';
import {
  DEFAULT_SWISS_RANKING_RULE,
  SWISS_RANKING_RULE_BUCHHOLZ,
  SWISS_RANKING_RULE_LEGACY,
  normalizeSwissRankingRule,
} from '../domain/ranking/swiss-ranking.js';

const DEFAULT_EVENT_INFO_for_88cafe = {
  venueName: '88coffee&tattoo',
  address: '臺北市中山區中吉里松江路170巷9之5號',
  mapUrl: 'https://maps.app.goo.gl/xtbmRtKcF84CCBec6',
  postUrl: '',
};

export function manageView(tournament = null) {
  const isEditing = Boolean(tournament);
  const title = isEditing ? '編輯賽事' : '建立新賽事';
  const description = isEditing
    ? '賽事開始前可以修改名稱、賽制、戰鬥台數與參賽者；儲存後會重新產生預覽賽程。'
    : '先建立準備中的賽事，確認參賽名單後再正式開始。';
  const backButton = `<div class="header-actions">${isEditing ? '<button class="button button-secondary" data-action="cancel-edit">← 返回賽程</button>' : ''}<button class="button button-secondary" data-route="guide">查看操作說明</button></div>`;
  const participantRows = (tournament?.players || []).map((player) => participantEditorRow(player, tournament?.participantDetails?.[player]?.notes || '', player)).join('');
  const eventInfo = tournament?.eventInfo || { ...DEFAULT_EVENT_INFO_for_88cafe, ...defaultEventSchedule() };
  const selectedFormat = tournament?.format || 'single_elimination';
  const formatOptions = listTournamentFormats().map((format) => `<option value="${format.id}" ${format.id === selectedFormat ? 'selected' : ''}>${format.name}</option>`).join('');
  const swissStage2 = normalizeSwissStage2Config(tournament?.swissStage2Config);
  const swissRankingRule = normalizeSwissRankingRule(
    tournament?.swissRankingRule,
    tournament ? SWISS_RANKING_RULE_LEGACY : DEFAULT_SWISS_RANKING_RULE,
  );
  const swissRankingOptions = swissRankingRule === SWISS_RANKING_RULE_BUCHHOLZ
    ? `<option value="${SWISS_RANKING_RULE_BUCHHOLZ}" selected>對手強度排名（既有賽事相容）</option><option value="${SWISS_RANKING_RULE_LEGACY}">傳統排名</option>`
    : `<option value="${SWISS_RANKING_RULE_LEGACY}" selected>傳統排名</option>`;

  return `<section class="section-wrap page-section">
    ${pageHeader(isEditing ? 'EDIT TOURNAMENT' : 'TOURNAMENT SETUP', title, description, backButton)}
    <form class="setup-layout" data-tournament-form>
      <div class="form-panel">
        <div class="draft-notice"><i></i><div><b>準備中賽事</b><span>建立後會自動隨機分組；正式開始前仍可重新抽選。</span></div></div>
        <div class="step-heading"><span>01</span><div><b>基本資料</b><small>替這場賽事設定名稱</small></div></div>
        <label class="field"><span>賽事名稱</span><input name="name" maxlength="40" value="${escapeAttribute(tournament?.name || '')}" placeholder="例如：夏季陀螺公開賽" required></label>
        <label class="field"><span>比賽賽制</span><select name="format">${formatOptions}</select></label>
        <div data-swiss-stage2-settings ${selectedFormat === 'swiss' ? '' : 'hidden'}>
          <label class="field"><span>瑞士輪排名方式</span><select name="swissRankingRule">${swissRankingOptions}</select><small data-swiss-ranking-description>${swissRankingRuleDescription(swissRankingRule)}</small></label>
          <label class="field"><span>第二階段晉級人數</span><select name="swissAdvanceCount"><option value="4" ${swissStage2.advanceCount === 4 ? 'selected' : ''}>Top 4</option><option value="8" ${swissStage2.advanceCount === 8 ? 'selected' : ''}>Top 8</option></select><small>第一階段固定打 4 輪瑞士輪；第二階段實際賽制會在第一階段完成後再選擇。</small></label>
        </div>
        <label class="field"><span>戰鬥台數</span><input name="arenaCount" type="number" inputmode="numeric" min="1" max="8" step="1" value="${tournament?.arenaCount || 1}" required><small>可設定 1 至 8 台；賽程會平均分配到各戰鬥台。</small></label>
        <div class="step-heading"><span>02</span><div><b>活動資訊</b><small>選填；填寫後會顯示在公開賽事頁</small></div></div>
        <div class="field-grid field-grid-time">
          <label class="field"><span>比賽日期</span><input name="eventDate" type="date" value="${escapeAttribute(eventInfo.date || '')}"></label>
          <label class="field"><span>報到開始</span><input name="checkInStart" type="time" value="${escapeAttribute(eventInfo.checkInStart || '')}"></label>
          <label class="field"><span>報到截止</span><input name="checkInEnd" type="time" value="${escapeAttribute(eventInfo.checkInEnd || '')}"></label>
          <label class="field"><span>正式開賽</span><input name="startTime" type="time" value="${escapeAttribute(eventInfo.startTime || '')}"></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>比賽地點</span><input name="venueName" maxlength="80" value="${escapeAttribute(eventInfo.venueName || '')}" placeholder="例如：88coffee&tarttoo"></label>
          <label class="field"><span>地址</span><input name="address" maxlength="160" value="${escapeAttribute(eventInfo.address || '')}" placeholder="完整地址"></label>
        </div>
        <div class="field-grid">
          <label class="field"><span>地圖連結</span><input name="mapUrl" type="url" maxlength="500" value="${escapeAttribute(eventInfo.mapUrl || '')}" placeholder="https://maps.google.com/..."></label>
          <label class="field"><span>原始貼文連結</span><input name="postUrl" type="url" maxlength="500" value="${escapeAttribute(eventInfo.postUrl || '')}" placeholder="https://www.instagram.com/..."></label>
        </div>
        <label class="field"><span>活動備註</span><textarea class="event-notes" name="notes" maxlength="2000" placeholder="可貼上禁用清單、報名費、參賽規則、獎品及其他注意事項。">${escapeText(eventInfo.notes || '')}</textarea><small>保留換行，最多 2,000 字。</small></label>
        <div class="step-heading"><span>03</span><div><b>參賽者名單</b><small>逐筆可記錄備註；大量名單仍可一次貼上，最多 ${MAX_TOURNAMENT_PLAYERS} 位</small></div></div>
        <div class="manage-participant-list" data-manage-participant-list>${participantRows}</div>
        <div class="manage-participant-actions">
          <button type="button" class="button button-secondary" data-manage-add-player>＋ 新增選手</button>
          <details class="manage-participant-bulk"><summary>批次貼上選手名稱</summary><div>
            <label class="field"><span>一行一位</span><textarea data-manage-bulk-players placeholder="小明&#10;阿龍&#10;Spin Master&#10;烈焰之翼"></textarea><small>只加入尚未存在的名稱；加入後可逐筆補上電話末五碼、飲品或其他備註。</small></label>
            <button type="button" class="button button-secondary" data-manage-apply-bulk>加入名單</button>
          </div></details>
        </div>
        <div class="form-footer"><span data-player-count>目前 ${tournament?.players?.length || 0} 位參賽者</span><button class="button button-primary" type="submit">${isEditing ? '儲存變更' : '建立賽事與報到名單'} ${icons.arrow}</button></div>
      </div>
      <aside class="setup-aside"><div class="aside-icon">${icons.trophy}</div><p class="kicker">FORMAT</p><h2>四種賽制</h2><p><b>單淘汰賽</b>：輸掉一場即淘汰，勝者持續晉級。</p><p><b>瑞士制</b>：固定四輪預賽並先設定 Top 4／Top 8 晉級人數；第一階段完成後再選擇第二階段賽制。Top 4 可用循環／單淘汰，Top 8 另可使用瑞士輪。</p><p><b>循環賽</b>：3～8 人每人互打一次，依勝場與總得分排名。</p><p><b>連勝制</b>：3～8 人守擂，先連勝兩場者奪冠。</p><ul><li><i></i>建立時可先不填選手</li><li><i></i>依賽制限制報到人數</li><li><i></i>支援 1–8 台戰鬥台</li><li><i></i>支援批次貼上與逐筆備註</li><li><i></i>開始後鎖定全部設定</li></ul></aside>
    </form>
  </section>`;
}

function participantEditorRow(player = '', notes = '', originalName = '') {
  return `<div class="manage-participant-row" data-manage-participant-row data-original-name="${escapeAttribute(originalName)}">
    <label class="field"><span>選手名稱</span><input name="participantName" maxlength="60" autocomplete="off" value="${escapeAttribute(player)}" placeholder="輸入選手名稱"></label>
    <label class="field"><span>備註</span><input name="participantNotes" maxlength="500" value="${escapeAttribute(notes)}" placeholder="例如：12345 · 無糖綠茶 · 已付款"></label>
    <button type="button" class="button button-secondary button-danger-quiet" data-manage-remove-player>移除</button>
  </div>`;
}

function defaultEventSchedule(now = new Date()) {
  const date = new Date(now);
  const time = (offsetMinutes) => {
    const value = new Date(date.getTime() + offsetMinutes * 60_000);
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  };
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    checkInStart: time(0),
    checkInEnd: time(30),
    startTime: time(60),
  };
}

export function bindManage(root, options) {
  const form = root.querySelector('[data-tournament-form]');
  const participantList = root.querySelector('[data-manage-participant-list]');
  const count = root.querySelector('[data-player-count]');
  const getParticipants = () => [...participantList.querySelectorAll('[data-manage-participant-row]')].map((row) => ({
    name: row.querySelector('[name="participantName"]').value.trim(),
    notes: row.querySelector('[name="participantNotes"]').value.trim(),
    originalName: row.dataset.originalName || '',
  })).filter((item) => item.name);
  const syncParticipantCount = () => { count.textContent = `目前 ${getParticipants().length} 位參賽者`; };
  const appendParticipant = (name = '', notes = '', originalName = '') => {
    participantList.insertAdjacentHTML('beforeend', participantEditorRow(name, notes, originalName));
    syncParticipantCount();
  };
  const syncSwissStage2Fields = () => {
    const panel = root.querySelector('[data-swiss-stage2-settings]');
    if (panel) panel.hidden = form.elements.format.value !== 'swiss';
  };
  const syncSwissRankingDescription = () => {
    const description = root.querySelector('[data-swiss-ranking-description]');
    if (description) description.textContent = swissRankingRuleDescription(form.elements.swissRankingRule?.value);
  };
  participantList.addEventListener('input', syncParticipantCount);
  form.elements.format.addEventListener('change', syncSwissStage2Fields);
  form.elements.swissRankingRule?.addEventListener('change', syncSwissRankingDescription);
  syncSwissStage2Fields();
  syncSwissRankingDescription();
  root.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => options.onCancel?.());
  participantList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-manage-remove-player]');
    if (!button) return;
    button.closest('[data-manage-participant-row]')?.remove();
    syncParticipantCount();
  });
  root.querySelector('[data-manage-add-player]')?.addEventListener('click', () => appendParticipant());
  root.querySelector('[data-manage-apply-bulk]')?.addEventListener('click', () => {
    const bulk = root.querySelector('[data-manage-bulk-players]');
    const existing = new Set(getParticipants().map((item) => item.name));
    bulk.value.split('\n').map((value) => value.trim()).filter(Boolean).forEach((name) => {
      if (existing.has(name)) return;
      appendParticipant(name);
      existing.add(name);
    });
    bulk.value = '';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const participants = getParticipants();
    const playerList = participants.map((item) => item.name);
    if (playerList.length > MAX_TOURNAMENT_PLAYERS) return alert(`參賽者人數不可超過 ${MAX_TOURNAMENT_PLAYERS} 位。`);
    try {
      const participantDetails = Object.fromEntries(participants.map(({ name, notes, originalName }) => {
        const previous = options.tournament?.participantDetails?.[originalName] || {};
        return [name, { ...previous, notes }];
      }));
      const eventInfo = {
        date: form.elements.eventDate.value,
        checkInStart: form.elements.checkInStart.value,
        checkInEnd: form.elements.checkInEnd.value,
        startTime: form.elements.startTime.value,
        venueName: form.elements.venueName.value,
        address: form.elements.address.value,
        mapUrl: form.elements.mapUrl.value,
        postUrl: form.elements.postUrl.value,
        notes: form.elements.notes.value,
      };
      // 編輯舊賽事時原樣保留 legacy drink data；新賽事預設使用停用的空飲品設定。
      const drinkSettings = options.tournament?.drinkSettings || createEmptyDrinkSettings();
      let result = options.tournament
        ? updateDraftTournament(options.tournament, form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings, participantDetails)
        : createTournament(form.elements.name.value, playerList, form.elements.format.value, form.elements.arenaCount.value, eventInfo, drinkSettings, participantDetails);
      result = applySwissStage2Config(result, form);
      result = applySwissRankingRule(result, form);
      options.onSubmit(result);
    } catch (error) {
      alert(error.message);
    }
  });
}

function swissRankingRuleDescription(rule) {
  const normalized = normalizeSwissRankingRule(rule, SWISS_RANKING_RULE_LEGACY);
  if (normalized === SWISS_RANKING_RULE_BUCHHOLZ) {
    return '對手強度排名：勝場 → 對手勝場總和 → 總得分 → 兩人直接對戰；賽事開始後鎖定。';
  }
  return '傳統排名：勝場 → 敗場較少 → 總得分；完全同分時維持原始順序，賽事開始後鎖定。';
}

function normalizeSwissStage2Config(value = {}) {
  return { advanceCount: Number(value?.advanceCount) === 8 ? 8 : 4 };
}

function applySwissStage2Config(tournament, form) {
  const next = { ...tournament };
  delete next.swissStage2Config;
  if (next.format !== 'swiss') return next;
  next.swissStage2Config = normalizeSwissStage2Config({
    advanceCount: form.elements.swissAdvanceCount?.value,
  });
  return next;
}

function applySwissRankingRule(tournament, form) {
  const next = { ...tournament };
  delete next.swissRankingRule;
  if (next.format !== 'swiss') return next;
  next.swissRankingRule = normalizeSwissRankingRule(
    form.elements.swissRankingRule?.value,
    DEFAULT_SWISS_RANKING_RULE,
  );
  return next;
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
