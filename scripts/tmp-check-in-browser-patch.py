from pathlib import Path

path = Path('tests/full-flow.test.js')
text = path.read_text(encoding='utf-8')


def rep(old, new):
    global text
    if old not in text:
        raise SystemExit(f'pattern not found: {old[:120]!r}')
    text = text.replace(old, new, 1)


rep(
    '  setDraftPlayerCheckedIn,\n',
    '  setDraftPlayerCheckedIn,\n  setAllDraftPlayersCheckedIn,\n',
)
rep(
    """async function checkInAllPlayers() {
  while (true) {
    const input = document.querySelector('[data-check-in-player]:not(:checked)');
    if (!input) break;
    input.click();
    await waitUntil(() => !document.contains(input));
    await pause();
  }
}
""",
    """async function checkInAllPlayers() {
  const button = document.querySelector('[data-check-in-all]');
  if (!button) throw new Error('找不到全部報到按鈕');
  button.click();
  await waitUntil(() => [...records.values()].some((tournament) => (
    tournament.players.length > 0
      && tournament.players.every((player) => tournament.participantStates?.[player]?.checkedIn)
  )));
  await waitUntil(() => [...document.querySelectorAll('[data-check-in-player]')].every((input) => input.checked));
}
""",
)
rep(
    "    set_check_in: () => setDraftPlayerCheckedIn(source, payload.player, payload.checkedIn),\n",
    "    set_check_in: () => setDraftPlayerCheckedIn(source, payload.player, payload.checkedIn),\n    set_all_check_in: () => setAllDraftPlayersCheckedIn(source),\n",
)

path.write_text(text, encoding='utf-8')
print('Patched browser full-flow test for bulk check-in')
