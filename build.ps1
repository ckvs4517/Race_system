$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$dist = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $dist.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Invalid build output path.'
}
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }

$serverDir = Join-Path $dist 'server'
$clientDir = Join-Path $dist 'client'
$openAiDir = Join-Path $dist '.openai'
$drizzleDir = Join-Path $openAiDir 'drizzle'
$sourceOpenAiDir = Join-Path $projectRoot '.openai'
$sourceDrizzleDir = Join-Path $sourceOpenAiDir 'drizzle'

New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
New-Item -ItemType Directory -Path $clientDir -Force | Out-Null
New-Item -ItemType Directory -Path $drizzleDir -Force | Out-Null

Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot 'worker') 'index.js') -Destination (Join-Path $serverDir 'index.js')
Copy-Item -LiteralPath (Join-Path $projectRoot 'index.html') -Destination (Join-Path $clientDir 'index.html')
Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination (Join-Path $clientDir 'src') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceOpenAiDir 'hosting.json') -Destination (Join-Path $openAiDir 'hosting.json')
Get-ChildItem -LiteralPath $sourceDrizzleDir -Filter '*.sql' | Copy-Item -Destination $drizzleDir -Force

Write-Output 'Build completed.'
