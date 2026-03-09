# ═══════════════════════════════════════════════════════
# Shadow Messenger — Build Android APK
# Compiles debug APK via Gradle + bundled JDK 17
# ═══════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$MobileDir = Join-Path $ProjectRoot "apps\mobile"
$BuildsDir = Join-Path $ProjectRoot "builds"
$JdkDir = Join-Path $MobileDir "jdk\jdk-17.0.18+8"

Write-Host "`n=== Build Android APK ===" -ForegroundColor Cyan

# ── 1. Check JDK ──
Write-Host "`n[1/4] Checking JDK..." -ForegroundColor Yellow
if (Test-Path $JdkDir) {
    $env:JAVA_HOME = $JdkDir
    Write-Host "  Using bundled JDK: $JdkDir" -ForegroundColor Green
} else {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    if (-not $javaVersion) {
        Write-Host "  ERROR: JDK not found. Place JDK 17 in apps\mobile\jdk\" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Using system JDK: $javaVersion" -ForegroundColor Green
}

# ── 2. Check Android SDK ──
Write-Host "[2/4] Checking Android SDK..." -ForegroundColor Yellow
$localProps = Join-Path $MobileDir "local.properties"
if (-not (Test-Path $localProps)) {
    Write-Host "  ERROR: local.properties not found" -ForegroundColor Red
    exit 1
}
$sdkDir = (Get-Content $localProps | Where-Object { $_ -match "^sdk\.dir=" }) -replace "^sdk\.dir=", "" -replace "\\\\", "\"
if (-not (Test-Path $sdkDir)) {
    Write-Host "  WARNING: Android SDK not found at $sdkDir" -ForegroundColor DarkYellow
} else {
    Write-Host "  Android SDK: $sdkDir" -ForegroundColor Green
}

# ── 3. Build APK ──
Write-Host "[3/4] Building APK (gradlew assembleRelease)..." -ForegroundColor Yellow
Push-Location $MobileDir
& .\gradlew.bat assembleRelease 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Release build failed, trying debug..." -ForegroundColor DarkYellow
    & .\gradlew.bat assembleDebug 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
}
Write-Host "  Build complete" -ForegroundColor Green

# ── 4. Copy APK to builds/ ──
Write-Host "[4/4] Copying APK to builds/..." -ForegroundColor Yellow
if (-not (Test-Path $BuildsDir)) { New-Item -ItemType Directory -Path $BuildsDir -Force | Out-Null }
$apkFiles = Get-ChildItem ".\app\build\outputs\apk" -Recurse -Filter "*.apk" -ErrorAction SilentlyContinue
foreach ($f in $apkFiles) {
    $destName = "Shadow-Messenger-$(Get-Date -Format 'yyyyMMdd').apk"
    Copy-Item $f.FullName (Join-Path $BuildsDir $destName) -Force
    Write-Host "  -> builds\$destName" -ForegroundColor Green
}
Pop-Location

Write-Host "`n=== APK Build Complete! ===" -ForegroundColor Green
Write-Host "  Output: $BuildsDir" -ForegroundColor DarkGray
