$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"

try {
  $health = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/v1/health" -UseBasicParsing -TimeoutSec 5
  if ($health.StatusCode -ne 200) { exit 1 }
} catch {
  exit 1
}

$listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
  Select-Object -First 1
if (-not $listener) {
  Write-Host "Port 8000 is responding but its process could not be identified."
  exit 2
}
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
if (-not $process -or $process.Name -notmatch '^python(\.exe)?$' -or
    $process.CommandLine -notmatch 'uvicorn\s+app\.main:app' -or
    $process.CommandLine -notmatch '--port\s+8000') {
  Write-Host "Port 8000 is used by a different process. Close it before starting NearBites."
  exit 2
}

$sourceFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $backendDir "app") -File -Recurse -Filter "*.py"
  Get-ChildItem -LiteralPath (Join-Path $backendDir "migrations") -File -Recurse -Filter "*.py"
  Get-Item -LiteralPath (Join-Path $backendDir "pyproject.toml")
  Get-Item -LiteralPath (Join-Path $backendDir ".env")
)
$latestInput = $sourceFiles |
  Sort-Object -Property LastWriteTimeUtc -Descending |
  Select-Object -First 1
$startedUtc = $process.CreationDate.ToUniversalTime()
if (-not $latestInput -or $latestInput.LastWriteTimeUtc -le $startedUtc) {
  Write-Host "NearBites API is current."
  exit 0
}

Write-Host "Replacing the older NearBites API process (PID $($listener.OwningProcess))."
& taskkill.exe /PID $listener.OwningProcess /F | Out-Host
if ($LASTEXITCODE -ne 0) { exit 2 }
exit 1
