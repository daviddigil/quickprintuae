# Update an existing local QuickPrint install to the latest code (Windows). Keeps your data.
# Run after `git pull`. Reuses the secrets of your running container so stored encrypted data (IBANs, 2FA, gateway keys) stays readable.
$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "Docker is not installed." -ForegroundColor Red; exit 1 }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker is not running. Open Docker Desktop, wait until it is running, then run this again." -ForegroundColor Red; exit 1 }

function New-Secret {
  $b = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

# the folder name is the compose project name; find this project's web container (running or stopped)
$old = @{}
$cid = (docker ps -a --filter "label=com.docker.compose.project.working_dir=$PSScriptRoot" --filter "label=com.docker.compose.service=web" --format "{{.ID}}" 2>$null | Select-Object -First 1)
if (-not $cid) { $cid = (docker ps -a --filter "label=com.docker.compose.service=web" --format "{{.ID}}" 2>$null | Select-Object -First 1) }
if ($cid) {
  foreach ($l in (docker inspect $cid --format "{{range .Config.Env}}{{println .}}{{end}}")) {
    if ($l -match "^(AUTH_SECRET|ENCRYPTION_KEY|CRON_SECRET|PAYMENTS_FAKE|DELIVERY_FAKE)=(.+)$") { $old[$Matches[1]] = $Matches[2] }
  }
  $p = (docker port $cid 3000 2>$null | Select-Object -First 1)
  if ($p -match ":(\d+)$") { $old["WEB_PORT"] = $Matches[1] }
}

$env_ = @{}
if (Test-Path ".env") {
  foreach ($l in (Get-Content ".env")) { if ($l -match "^([A-Z_]+)=(.*)$") { $env_[$Matches[1]] = $Matches[2] } }
}
$added = @(); $reused = @(); $created = @()
foreach ($k in @("AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET")) {
  if ($env_[$k]) { continue }
  if ($old[$k]) { $env_[$k] = $old[$k]; $reused += $k } else { $env_[$k] = New-Secret; $created += $k }
  $added += $k
}
foreach ($k in @("WEB_PORT", "PAYMENTS_FAKE", "DELIVERY_FAKE")) {
  if (-not $env_[$k] -and $old[$k]) { $env_[$k] = $old[$k]; $added += $k }
}
if (-not $env_["WEB_PORT"]) { $env_["WEB_PORT"] = "5050"; $added += "WEB_PORT" }

$hasData = [bool](docker volume ls --format "{{.Name}}" | Select-String "pgdata")
if ($created -contains "ENCRYPTION_KEY" -and $hasData) {
  Write-Host "STOP: your database already exists, but no ENCRYPTION_KEY could be recovered from an old container." -ForegroundColor Red
  Write-Host "A new key would make stored bank details, 2FA secrets and gateway keys unreadable. If you still have the old .env or key, put it in .env as ENCRYPTION_KEY=... and run this again." -ForegroundColor Red
  Write-Host "If this is only test data you can throw away, run:  docker compose down -v   then start-local.bat" -ForegroundColor Yellow
  exit 1
}

if ($added.Count -gt 0) {
  $lines = @("# Managed by update-local / start-local. Do not share or commit this file.") + ($env_.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" })
  [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot ".env"), $lines)
  if ($reused.Count) { Write-Host "Reused from your running container: $($reused -join ', ')" }
  if ($created.Count) { Write-Host "Created new: $($created -join ', ')" }
} else { Write-Host ".env already has everything it needs." }

Write-Host "Building and starting the latest QuickPrint (your data is kept)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Docker could not start QuickPrint. See the message above." -ForegroundColor Red; exit 1 }

$url = "http://localhost:$($env_['WEB_PORT'])"
Write-Host -NoNewline "Waiting for the app to be ready"
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  try { $r = Invoke-WebRequest -UseBasicParsing "$url/api/health" -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch { }
  Write-Host -NoNewline "."; Start-Sleep -Seconds 2
}
Write-Host ""
if (-not $ready) { Write-Host "Not ready after 4 minutes. Last log lines:" -ForegroundColor Red; docker compose logs --tail=25 web; exit 1 }
Write-Host "QuickPrint is updated and running:  $url" -ForegroundColor Green
