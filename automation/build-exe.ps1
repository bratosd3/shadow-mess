# ═══════════════════════════════════════════════════════
# Shadow Messenger — Build Desktop EXE (Windows Installer)
# Builds NSIS installer via electron-builder
# ═══════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$DesktopDir = Join-Path $ProjectRoot "apps\desktop"
$BuildsDir = Join-Path $ProjectRoot "builds"

Write-Host "`n=== Build Desktop EXE ===" -ForegroundColor Cyan

# ── 1. Check Node.js ──
Write-Host "`n[1/4] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "  ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js $nodeVersion" -ForegroundColor Green

# ── 2. Install dependencies ──
Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
Push-Location $DesktopDir
npm install 2>&1 | Out-Null
Write-Host "  Dependencies installed" -ForegroundColor Green

# ── 3. Build NSIS installer ──
Write-Host "[3/4] Building installer (electron-builder)..." -ForegroundColor Yellow
npx electron-builder --win nsis 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  Build complete" -ForegroundColor Green

# ── 4. Copy to builds/ ──
Write-Host "[4/4] Copying installer to builds/..." -ForegroundColor Yellow
if (-not (Test-Path $BuildsDir)) { New-Item -ItemType Directory -Path $BuildsDir -Force | Out-Null }
$exeFiles = Get-ChildItem ".\dist\*.exe" -ErrorAction SilentlyContinue
foreach ($f in $exeFiles) {
    Copy-Item $f.FullName (Join-Path $BuildsDir $f.Name) -Force
    Write-Host "  -> builds\$($f.Name)" -ForegroundColor Green
}
Pop-Location

Write-Host "`n=== EXE Build Complete! ===" -ForegroundColor Green
Write-Host "  Output: $BuildsDir" -ForegroundColor DarkGray
