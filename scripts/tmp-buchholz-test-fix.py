from pathlib import Path

path = Path('tests/swiss.test.mjs')
text = path.read_text()
old = "assertRecordAndPointsOrder(preliminary);"
new = "assertBuchholzOrder(preliminary);"
if old not in text:
    raise SystemExit('missing Swiss order assertion')
text = text.replace(old, new, 1)
old = '''function assertRecordAndPointsOrder(rows) {
  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    if (previous.wins === row.wins && previous.losses === row.losses) {
      assert.ok(previous.totalPoints >= row.totalPoints, '勝敗相同時總得分較高者排前面');
      if (previous.totalPoints > row.totalPoints) assert.ok(previous.rank < row.rank, '總得分不同時不可並列名次');
    }
  });
}
'''
new = '''function assertBuchholzOrder(rows) {
  rows.slice(1).forEach((row, index) => {
    const previous = rows[index];
    if (previous.wins !== row.wins) return;
    assert.ok(previous.opponentWins >= row.opponentWins, '勝場相同時對手勝場總和較高者排前面');
    if (previous.opponentWins === row.opponentWins) {
      assert.ok(previous.totalPoints >= row.totalPoints, '勝場與對手勝場相同時總得分較高者排前面');
    }
  });
}
'''
if old not in text:
    raise SystemExit('missing legacy Swiss order helper')
path.write_text(text.replace(old, new, 1))
print('Swiss regression expectation updated for Buchholz')
