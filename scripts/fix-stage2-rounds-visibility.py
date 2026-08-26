from pathlib import Path

main_path = Path('src/main.js')
main = main_path.read_text(encoding='utf-8')
old = '''  const syncStage2RoundsField = () => {
    const roundsField = swissFinalForm?.querySelector('[data-stage2-rounds]');
    if (!roundsField) return;
    roundsField.hidden = swissFinalForm.querySelector('input[name="swissFinalMode"]:checked')?.value !== 'swiss';
  };'''
new = '''  const syncStage2RoundsField = () => {
    const roundsField = swissFinalForm?.querySelector('[data-stage2-rounds]');
    if (!roundsField) return;
    const roundsInput = roundsField.querySelector('input[name="swissStage2Rounds"]');
    const showRounds = swissFinalForm.querySelector('input[name="swissFinalMode"]:checked')?.value === 'swiss';
    roundsField.hidden = !showRounds;
    roundsField.style.display = showRounds ? '' : 'none';
    if (roundsInput) roundsInput.disabled = !showRounds;
  };'''
if old not in main:
    raise RuntimeError('expected main.js block not found')
main_path.write_text(main.replace(old, new, 1), encoding='utf-8')

css_path = Path('src/styles/app.css')
css = css_path.read_text(encoding='utf-8')
marker = '.swiss-final-mode-options small { color: var(--muted); line-height: 1.45; }\n'
rule = '[data-stage2-rounds][hidden] { display: none !important; }\n'
if rule not in css:
    if marker not in css:
        raise RuntimeError('expected app.css marker not found')
    css = css.replace(marker, marker + rule, 1)
css_path.write_text(css, encoding='utf-8')

print('Stage 2 rounds visibility fix applied')
