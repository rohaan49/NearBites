$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $repoRoot ".output-windows/server/index.mjs"
$buildInputs = @(
  (Join-Path $repoRoot "src"),
  (Join-Path $repoRoot "vite.config.ts"),
  (Join-Path $repoRoot "package.json"),
  (Join-Path $repoRoot "bun.lock")
)

$buildIsCurrent = $false
if (Test-Path -LiteralPath $entry) {
  $entryTime = (Get-Item -LiteralPath $entry).LastWriteTimeUtc
  $latestInput = Get-ChildItem -LiteralPath $buildInputs -File -Recurse |
    Sort-Object -Property LastWriteTimeUtc -Descending |
    Select-Object -First 1
  $buildIsCurrent = $latestInput -and $entryTime -ge $latestInput.LastWriteTimeUtc
}

if ($buildIsCurrent) {
  Write-Host "Frontend build is current."
  exit 0
}

$bunExe = Join-Path $env:USERPROFILE ".bun/bin/bun.exe"
if (Test-Path -LiteralPath $bunExe) {
  Push-Location $repoRoot
  try {
    $env:NEARBITES_WINDOWS_PREVIEW = "1"
    & $bunExe run build
    exit $LASTEXITCODE
  }
  finally { Pop-Location }
}

$bunCommand = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCommand) {
  Write-Error "Bun was not found. Run SETUP-WINDOWS.bat first."
}
Push-Location $repoRoot
try {
  $env:NEARBITES_WINDOWS_PREVIEW = "1"
  & $bunCommand.Source run build
  exit $LASTEXITCODE
}
finally { Pop-Location }
