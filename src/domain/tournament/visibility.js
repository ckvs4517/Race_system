/** Public/private tournament projection. Keep personal registration data out of public API/state. */
export function toPublicTournament(tournament) {
  if (!tournament || typeof tournament !== 'object') return tournament;
  const { participantDetails: _participantDetails, registrationSettings, ...publicTournament } = tournament;
  if (registrationSettings && typeof registrationSettings === 'object') {
    const { token: _token, ...publicRegistrationSettings } = registrationSettings;
    publicTournament.registrationSettings = publicRegistrationSettings;
  }
  return publicTournament;
}
