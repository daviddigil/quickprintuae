# One-command local start for QuickPrint (Windows). Creates secrets automatically, builds, starts and opens your browser.
# Normally started by double-clicking start-local.bat
$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker is not installed. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
  exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker is installed but not running. Open Docker Desktop, wait until it says it is running, then run this again." -ForegroundColor Red
  exit 1
}

function New-Secret {
  $b = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

if (-not (Test-Path ".env")) {
  $lines = @(
    "# Created by start-local - LOCAL TRIAL ONLY (simulated payment + courier).",
    "AUTH_SECRET=$(New-Secret)",
    "ENCRYPTION_KEY=$(New-Secret)",
    "CRON_SECRET=$(New-Secret)",
    "WEB_PORT=5050",
    "PAYMENTS_FAKE=1",
    "DELIVERY_FAKE=1"
  )
  [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot ".env"), $lines)
  Write-Host "Created .env with fresh secrets."
}

Write-Host "Building and starting QuickPrint (first time takes 3-5 minutes)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker could not start QuickPrint. If the message above says a port is already allocated, open the .env file here, change WEB_PORT=5050 to WEB_PORT=5060, and run this again." -ForegroundColor Red
  exit 1
}

$port = ((Get-Content ".env" | Where-Object { $_ -match "^WEB_PORT=" }) -replace "WEB_PORT=", "").Trim()
if (-not $port) { $port = "5050" }
$url = "http://localhost:$port"

Write-Host -NoNewline "Waiting for the app to be ready"
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  try { $r = Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch { }
  Write-Host -NoNewline "."
  Start-Sleep -Seconds 2
}
Write-Host ""
if (-not $ready) {
  Write-Host "Not ready after 4 minutes. Last log lines:" -ForegroundColor Red
  docker compose logs --tail=25 web
  exit 1
}

Write-Host "QuickPrint is running:  $url/s/demo" -ForegroundColor Green
Write-Host "  Shop owner login : $url/login   owner@demo.ae / owner12345"
Write-Host "  Superadmin login : $url/login   admin@quickprint.ae / change-me-now"
Write-Host "  Stop it later    : double-click stop-local.bat"
Start-Process "$url/s/demo"
