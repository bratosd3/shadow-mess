# ═══════════════════════════════════════════════════════
# Shadow Messenger — Auto Deploy Script
# Pushes to GitHub + triggers Render deploy
# ═══════════════════════════════════════════════════════

param(
    [string]$Message = "update: auto deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    [switch]$SkipBuild,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Shadow Messenger Deploy ===" -ForegroundColor Cyan

# ── 1. Check git status ──
Write-Host "`n[1/4] Checking git status..." -ForegroundColor Yellow
$status = git status --porcelain 2>$null
if (-not $status -and -not $Force) {
    Write-Host "  No changes to commit. Use -Force to push anyway." -ForegroundColor DarkGray
} else {
    # ── 2. Git add + commit ──
    Write-Host "[2/4] Committing changes..." -ForegroundColor Yellow
    git add -A
    git commit -m $Message
    if ($LASTEXITCODE -ne 0 -and -not $Force) {
        Write-Host "  Commit failed or nothing to commit" -ForegroundColor Red
    }
}

# ── 3. Git push ──
Write-Host "[3/4] Pushing to GitHub..." -ForegroundColor Yellow
git push origin main 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Trying 'master' branch..." -ForegroundColor DarkYellow
    git push origin master 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Push to current branch
        $branch = git rev-parse --abbrev-ref HEAD
        git push origin $branch 2>&1
    }
}

# ── 4. Trigger Render deploy (if deploy hook is configured) ──
Write-Host "[4/4] Triggering Render deploy..." -ForegroundColor Yellow
$hookFile = Join-Path $PSScriptRoot ".render-hook"
if (Test-Path $hookFile) {
    $hookUrl = (Get-Content $hookFile -Raw).Trim()
    try {
        Invoke-RestMethod -Uri $hookUrl -Method Post -TimeoutSec 30
        Write-Host "  Render deploy triggered!" -ForegroundColor Green
    } catch {
        Write-Host "  Render hook failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Render will auto-deploy from GitHub push." -ForegroundColor DarkGray
    }
} else {
    Write-Host "  No .render-hook file found." -ForegroundColor DarkGray
    Write-Host "  Render will auto-deploy from GitHub push if connected." -ForegroundColor DarkGray
    Write-Host "  To add manual deploy hook: save Render Deploy Hook URL to .render-hook" -ForegroundColor DarkGray
}

Write-Host "`n=== Deploy complete! ===" -ForegroundColor Green
Write-Host "  Commit: $Message" -ForegroundColor DarkGray
