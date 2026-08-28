/** Public registration validation and safe public projection. */
export function validateRegistration(payload, tournament) {
  const displayName = cleanRegistrationText(payload.displayName, 60, '請輸入選手名稱。');
  const phone = cleanRegistrationText(payload.phone, 40, '請輸入聯絡電話。');
  const notes = cleanOptionalRegistrationText(payload.notes, 500, '備註內容過長。');
  const answers = {};
  const suppliedAnswers = payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers) ? payload.answers : {};
  for (const field of tournament.registrationSettings.fields || []) {
    const raw = suppliedAnswers[field.id];
    const value = field.type === 'checkbox' ? Boolean(raw) : cleanOptionalRegistrationText(raw, field.type === 'textarea' ? 1000 : 200, `${field.label}內容過長。`);
    if (field.required && (value === '' || value === false)) throw new Error(`Invalid registration:請填寫${field.label}。`);
    answers[field.id] = value;
  }
  return { displayName, phone, notes, answers, drink: payload.drink };
}

export function validatePublicRegistrationAccess(tournament, token) {
  if (!tournament || !tournament.registrationSettings || tournament.registrationSettings.token !== token) return '找不到這場報名活動。';
  if (!tournament.registrationSettings.enabled) return '這場賽事目前沒有開放報名。';
  if (tournament.status !== '準備中') return '這場賽事已經停止報名。';
  if (tournament.registrationSettings.deadline && new Date(tournament.registrationSettings.deadline).getTime() < Date.now()) return '這場賽事的報名時間已截止。';
  return '';
}

export function publicRegistrationSummary(tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    eventInfo: tournament.eventInfo || {},
    capacity: tournament.registrationSettings.capacity,
    deadline: tournament.registrationSettings.deadline,
    fields: tournament.registrationSettings.fields || [],
    drinkSettings: tournament.drinkSettings || { enabled: false, items: [] },
  };
}

function cleanRegistrationText(value, maximumLength, missingMessage) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`Invalid registration:${missingMessage}`);
  if (text.length > maximumLength) throw new Error(`Invalid registration:${missingMessage.replace('請輸入', '').replace('。', '')}內容過長。`);
  return text;
}

function cleanOptionalRegistrationText(value, maximumLength, longMessage) {
  const text = String(value || '').trim();
  if (text.length > maximumLength) throw new Error(`Invalid registration:${longMessage}`);
  return text;
}
