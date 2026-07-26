# Build the server, client, and migration structure for ChatGPT Sites.
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$buildScript = Join-Path (Join-Path $projectRoot 'scripts') 'build-site.mjs'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodeExecutable) {
  $windowsNode = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path -LiteralPath $windowsNode) { $nodeExecutable = $windowsNode }
}
if (-not $nodeExecutable) { throw 'Node.js was not found; the Sites artifact cannot be built.' }

& $nodeExecutable $buildScript
if ($LASTEXITCODE -ne 0) { throw "Sites build failed with exit code $LASTEXITCODE." }
