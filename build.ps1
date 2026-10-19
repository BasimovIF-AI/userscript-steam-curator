# build.ps1 — Скрипт автоматизации сборки и верификации
param(
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

Write-Host "==> [1/3] Проверка синтаксиса JavaScript..." -ForegroundColor Cyan
node --check steam-curators-sync.user.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Ошибка синтаксиса в steam-curators-sync.user.js"
    exit 1
}

Write-Host "==> [2/3] Запуск тестов компаратора..." -ForegroundColor Cyan
node test_comparator.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Тесты компаратора не пройдены!"
    exit 1
}

Write-Host "==> [3/3] Создание архива релиза исходников..." -ForegroundColor Cyan
$archiveDir = Join-Path $PSScriptRoot "archives"
if (-not (Test-Path $archiveDir)) {
    New-Item -ItemType Directory -Path $archiveDir | Out-Null
}

$zipName = "steam-curators-sync_v$Version`_src.zip"
$zipPath = Join-Path $archiveDir $zipName

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

$filesToArchive = @(
    "steam-curators-sync.user.js",
    "README.md",
    "CHANGELOG.md",
    "AGENTS.md",
    "test_comparator.js",
    "build.ps1"
)

Compress-Archive -Path $filesToArchive -DestinationPath $zipPath -Force
Write-Host "✅ Сборка успешно завершена! Создан архив: archives/$zipName" -ForegroundColor Green
