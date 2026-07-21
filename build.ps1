$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$dist = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $dist.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Invalid build output path.'
}
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }

New-Item -ItemType Directory -Path (Join-Path $dist 'server') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist 'client') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dist '.openai\drizzle') -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot 'worker\index.js') -Destination (Join-Path $dist 'server\index.js')
Copy-Item -LiteralPath (Join-Path $projectRoot 'index.html') -Destination (Join-Path $dist 'client\index.html')
Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination (Join-Path $dist 'client\src') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot '.openai\hosting.json') -Destination (Join-Path $dist '.openai\hosting.json')
Copy-Item -LiteralPath (Join-Path $projectRoot '.openai\drizzle\0000_create_tournaments.sql') -Destination (Join-Path $dist '.openai\drizzle\0000_create_tournaments.sql')

Write-Output 'Build completed.'
