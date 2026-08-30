/** 公開報名與主辦方報名管理 controller。 */
import { navigate } from '../../core/router.js';
import {
  executeTournamentAction,
  getPublicRegistration,
  loadTournamentRegistrations,
  submitPublicRegistration,
  updateRegistrationRecord,
  updateState,
  selectTournament,
} from '../../data/store.js';
import { bindPublicRegistration } from '../../views/registration.js';
import { bindRegistrationAdmin } from '../../views/registration-admin.js';
import { registrationRouteParams } from './url.js';

let publicRegistrationState = { key: '', loading: false, data: null, error: '', success: false };
let registrationEntryContext = { source: 'navigation', tournamentId: null };

export function getPublicRegistrationState() {
  return publicRegistrationState;
}

export function isScheduleRegistrationEntry(tournamentId) {
  return registrationEntryContext.source === 'schedule' && registrationEntryContext.tournamentId === tournamentId;
}

export function resetRegistrationNavigationContext() {
  registrationEntryContext = { source: 'navigation', tournamentId: null };
  updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
}

export async function openRegistrationAdminFromSchedule(tournamentId) {
  registrationEntryContext = { source: 'schedule', tournamentId };
  try {
    await loadTournamentRegistrations(tournamentId);
    navigate('registration');
  } catch (error) {
    registrationEntryContext = { source: 'navigation', tournamentId: null };
    throw error;
  }
}

export function syncPublicRegistrationRoute(requestRender) {
  const params = registrationRouteParams();
  const key = params ? `${params.tournamentId}/${params.token}` : '';
  if (key && publicRegistrationState.key !== key) {
    publicRegistrationState = { key, loading: true, data: null, error: '', success: false };
    queueMicrotask(() => loadPublicRegistration(params, requestRender));
  }
  if (!key) {
    publicRegistrationState = { key: '', loading: false, data: null, error: '報名連結格式不正確。', success: false };
  }
  return publicRegistrationState;
}

export function bindPublicRegistrationController(root, requestRender) {
  const params = registrationRouteParams();
  if (!params) return;
  bindPublicRegistration(root, async (registration) => {
    const result = await submitPublicRegistration(params.tournamentId, params.token, registration);
    publicRegistrationState = { ...publicRegistrationState, loading: false, success: true, error: '', result };
    requestRender();
  });
}

export function bindRegistrationAdminController(root, state) {
  bindRegistrationAdmin(root, {
    onSelect: async (tournamentId) => {
      try {
        await loadTournamentRegistrations(tournamentId);
      } catch (error) {
        alert(error.message);
      }
    },
    onBack: () => {
      if (registrationEntryContext.source === 'schedule' && registrationEntryContext.tournamentId) {
        const tournamentId = registrationEntryContext.tournamentId;
        registrationEntryContext = { source: 'navigation', tournamentId: null };
        updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
        selectTournament(tournamentId);
        navigate('schedule');
        return;
      }
      updateState((current) => ({ ...current, registrationTournamentId: null, registrations: [] }));
    },
    onSaveSettings: async (settings) => {
      try {
        await executeTournamentAction(state.registrationTournamentId, 'update_registration_settings', { settings });
      } catch (error) {
        alert(error.message);
      }
    },
    onStatus: async (registrationId, status) => {
      const label = { approved: '核准並加入正式名單', waitlist: '設為候補', rejected: '拒絕' }[status] || status;
      if (!confirm(`確定要將這筆報名「${label}」嗎？`)) return;
      try {
        await updateRegistrationRecord(registrationId, status);
      } catch (error) {
        alert(error.message);
      }
    },
  });
}

async function loadPublicRegistration(params, requestRender) {
  try {
    const data = await getPublicRegistration(params.tournamentId, params.token);
    publicRegistrationState = { ...publicRegistrationState, loading: false, data, error: '' };
  } catch (error) {
    publicRegistrationState = { ...publicRegistrationState, loading: false, data: null, error: error.message };
  }
  requestRender();
}
