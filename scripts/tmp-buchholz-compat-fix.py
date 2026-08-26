from pathlib import Path

for filename in ['src/views/schedule.js', 'src/domain/share-card.js']:
    path = Path(filename)
    text = path.read_text()
    text = text.replace("preliminary: '第一階段瑞士輪',", "preliminary: '瑞士輪',")
    text = text.replace("qualifier: '資格加賽',", "qualifier: '同分加賽',")
    text = text.replace("final: '決賽',", "final: '四強／決賽',")
    path.write_text(text)

path = Path('src/domain/share-card.js')
text = path.read_text()
text = text.replace("if (round.phase === 'final') return '決賽';", "if (round.phase === 'final') return '四強循環決賽';")
path.write_text(text)

path = Path('tests/swiss-ranking.test.mjs')
text = path.read_text().replace("stage.label === '第一階段瑞士輪'", "stage.label === '瑞士輪'")
path.write_text(text)

print('Legacy presentation labels preserved')
