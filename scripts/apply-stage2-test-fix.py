from pathlib import Path

path = Path('tests/swiss.test.mjs')
text = path.read_text(encoding='utf-8')
old = "  ...createTournament('Top4第二階段選擇', players, 'swiss'),"
new = "  ...createTournament('Top4第二階段選擇', players.slice(0, 4), 'swiss'),"
if old not in text:
    raise RuntimeError('Expected Top4 choice probe not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Stage 2 test fixture patch applied')
