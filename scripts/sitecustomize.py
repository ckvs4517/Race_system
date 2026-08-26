from pathlib import Path
import subprocess

path = Path(__file__)
repo = path.resolve().parents[1]
path.unlink(missing_ok=True)
subprocess.run(['npm', 'ci'], cwd=repo, check=True)
