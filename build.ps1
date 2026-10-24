# build.ps1 — Скрипт автоматизации сборки и верификации
param(
    [string]$Version = "2.6.1"
)

$ErrorActionPreference = "Stop"

Write-Host "==> [1/3] Проверка синтаксиса JavaScript..." -ForegroundColor Cyan
node --check steam-curator-tracker.user.js
node --check steam-curators-sync.user.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Ошибка синтаксиса в юзерскриптах!"
    exit 1
}

Write-Host "==> [2/3] Запуск автоматических тестов..." -ForegroundColor Cyan
node test_tracker.js
node test_comparator.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Тесты не пройдены!"
    exit 1
}

Write-Host "==> [3/3] Создание архива релиза исходников..." -ForegroundColor Cyan
$archiveDir = Join-Path $PSScriptRoot "archives"
if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir | Out-Null
}

$zipName = "steam-curator-tracker_v$Version`_src.zip"
$zipPath = Join-Path $archiveDir $zipName

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$filesToArchive = @(
    "steam-curator-tracker.user.js",
    "steam-curators-sync.user.js",
    "README.md",
    "CHANGELOG.md",
    "AGENTS.md",
    "test_tracker.js",
    "test_comparator.js",
    "build.ps1"
)

Compress-Archive -Path $filesToArchive -DestinationPath $zipPath -Force
Write-Host "✅ Сборка успешно завершена! Создан архив: archives/$zipName" -ForegroundColor Green
