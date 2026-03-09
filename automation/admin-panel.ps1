# ═══════════════════════════════════════════════════════
# Shadow Messenger — Admin Panel Launcher
# Starts the Python admin console for server management
# ═══════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ScriptDir = $PSScriptRoot

Write-Host "`n=== Shadow Messenger Admin Panel ===" -ForegroundColor Cyan

# ── Check Python ──
$python = $null
$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
    $python = $venvPython
    Write-Host "  Using venv Python: $python" -ForegroundColor Green
} else {
    $python = Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
    if (-not $python) {
        $python = Get-Command python3 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
    }
    if (-not $python) {
        Write-Host "  ERROR: Python not found" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Using system Python: $python" -ForegroundColor Green
}

# ── Install dependencies if needed ──
$reqFile = Join-Path $ScriptDir "requirements.txt"
if (Test-Path $reqFile) {
    Write-Host "  Installing dependencies..." -ForegroundColor Yellow
    & $python -m pip install -r $reqFile --quiet 2>$null
}

# ── Launch admin console ──
Write-Host "`n  Starting admin console..." -ForegroundColor Yellow
Write-Host "  Press Ctrl+C to exit`n" -ForegroundColor DarkGray

Push-Location $ScriptDir
& $python "admin_console.py"
Pop-Location
