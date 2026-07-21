export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

export function createTournament(name, players) {
  const cleanPlayers = players.map((player) => player.trim()).filter(Boolean);
  const size = nextPowerOfTwo(cleanPlayers.length);
  const seeded = [...cleanPlayers, ...Array(size - cleanPlayers.length).fill('輪空')];

  return {
    id: Date.now(),
    name: name.trim() || '未命名賽事',
    players: cleanPlayers,
    seededPlayers: seeded,
    created: new Date().toLocaleDateString('zh-TW'),
    status: '準備中',
  };
}

export function buildRounds(tournament) {
  const players = tournament.seededPlayers || tournament.players;
  const size = nextPowerOfTwo(players.length);
  const seeded = [...players, ...Array(size - players.length).fill('輪空')];
  const rounds = [];
  let matchCount = size / 2;

  rounds.push({
    name: size === 2 ? '冠軍賽' : `${size} 強`,
    matches: Array.from({ length: matchCount }, (_, index) => ({
      playerA: seeded[index * 2],
      playerB: seeded[index * 2 + 1],
      status: '尚未開始',
    })),
  });

  while (matchCount > 1) {
    matchCount /= 2;
    rounds.push({
      name: matchCount === 1 ? '冠軍賽' : matchCount === 2 ? '準決賽' : `${matchCount * 2} 強`,
      matches: Array.from({ length: matchCount }, () => ({
        playerA: '待定',
        playerB: '待定',
        status: '等待晉級',
      })),
    });
  }

  return rounds;
}
