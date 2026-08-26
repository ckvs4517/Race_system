from pathlib import Path

path = Path('src/views/schedule.js')
text = path.read_text(encoding='utf-8')
old = "if (round.seriesId === 'stage2-swiss' || String(round.name || '').startsWith('第二階段')) return 'STAGE 2';"
new = "if (round.seriesId === 'stage2-swiss' || String(round.name || '').includes('第二階段')) return 'STAGE 2';"
if old not in text:
    raise RuntimeError('Expected Stage 2 round label condition not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Stage 2 round label patch applied')
