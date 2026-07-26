# 將原始碼整理成 ChatGPT Sites 接受的 server、client 與 migration 結構。
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$dist = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $dist.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Invalid build output path.'
}
# dist 是可重建產物；先確認輸出路徑位於專案內，再移除舊建置。
if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }

$serverDir = Join-Path $dist 'server'
$serverDomainDir = Join-Path $serverDir 'domain'
$serverFormatsDir = Join-Path $serverDir 'formats'
$clientDir = Join-Path $dist 'client'
$openAiDir = Join-Path $dist '.openai'
$drizzleDir = Join-Path $openAiDir 'drizzle'
$sourceOpenAiDir = Join-Path $projectRoot '.openai'
$sourceDrizzleDir = Join-Path $sourceOpenAiDir 'drizzle'

New-Item -ItemType Directory -Path $serverDir -Force | Out-Null
New-Item -ItemType Directory -Path $clientDir -Force | Out-Null
New-Item -ItemType Directory -Path $drizzleDir -Force | Out-Null

$serverEntry = Join-Path $serverDir 'index.js'
$workerEntry = Join-Path (Join-Path $projectRoot 'worker') 'index.js'
$serverSource = [System.IO.File]::ReadAllText($workerEntry)
if ([string]::IsNullOrWhiteSpace($serverSource)) { throw 'Worker source could not be read.' }
$serverSource = $serverSource.Replace("from '../src/domain/tournament.js'", "from './domain/tournament.js'")
[System.IO.File]::WriteAllText($serverEntry, $serverSource, [System.Text.UTF8Encoding]::new($false))
if ((Get-Item -LiteralPath $serverEntry).Length -lt 20000) { throw 'Worker entry build failed.' }
Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot 'src') 'domain') -Destination $serverDomainDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path (Join-Path $projectRoot 'src') 'formats') -Destination $serverFormatsDir -Recurse -Force
# Sites 只封裝 server 目錄內的 Worker 模組，因此將共用規則放進 server 並改寫建置產物的相對路徑。
Copy-Item -LiteralPath (Join-Path $projectRoot 'index.html') -Destination (Join-Path $clientDir 'index.html')
Copy-Item -LiteralPath (Join-Path $projectRoot 'src') -Destination (Join-Path $clientDir 'src') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $sourceOpenAiDir 'hosting.json') -Destination (Join-Path $openAiDir 'hosting.json')
Get-ChildItem -LiteralPath $sourceDrizzleDir -Filter '*.sql' | Copy-Item -Destination $drizzleDir -Force

Write-Output 'Build completed.'
