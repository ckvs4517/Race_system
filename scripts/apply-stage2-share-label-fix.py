from pathlib import Path

path = Path('src/domain/share-card.js')
text = path.read_text(encoding='utf-8')
old = "  if (round.phase === 'final') return round.name || '四強循環決賽';"
new = "  if (round.phase === 'final') return String(round.name || '').includes('第二階段') ? round.name : '四強循環決賽';"
if old not in text:
    raise RuntimeError('Expected generalized final phase label not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Legacy share-card labels preserved')
