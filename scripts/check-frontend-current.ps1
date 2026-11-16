$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $repoRoot ".output-windows/public"

try {
  $page = Invoke-WebRequest -Uri "http://127.0.0.1:8080/" -UseBasicParsing -TimeoutSec 5
} catch {
  # No website is running yet.
  exit 1
}

$styleMatch = [regex]::Match($page.Content, 'href="(?<path>/assets/styles-[^"/]+\.css)"')
$styleIsCurrent = $false
if ($styleMatch.Success) {
  $assetPath = $styleMatch.Groups['path'].Value
  $builtStyle = Join-Path $publicDir ($assetPath.TrimStart('/') -replace '/', '\')
  if (Test-Path -LiteralPath $builtStyle) {
    try {
      $asset = Invoke-WebRequest -Uri ("http://127.0.0.1:8080" + $assetPath) -UseBasicParsing -TimeoutSec 5
      if ($asset.StatusCode -eq 200 -and $asset.Headers['Content-Type'] -match 'css') {
        $styleIsCurrent = $true
      }
    } catch { }
  }
}

# A previous Bun process can keep serving HTML from an old build after the
# frontend has been rebuilt. Its stylesheet then disappears from the new public folder.
$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -eq '127.0.0.1' } |
  Select-Object -First 1
if (-not $listener) {
  Write-Host "Port 8080 is occupied but its process could not be identified."
  exit 2
}
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
if (-not $process -or $process.Name -notmatch '^bun(\.exe)?$' -or
    $process.CommandLine -notmatch '\.output-windows[\\/]server[\\/]index\.mjs') {
  Write-Host "Port 8080 is used by a different process. Close it before starting NearBites."
  exit 2
}

$serverEntry = Join-Path $repoRoot ".output-windows/server/index.mjs"
if ($styleIsCurrent -and (Test-Path -LiteralPath $serverEntry) -and
    $process.CreationDate.ToUniversalTime() -ge (Get-Item -LiteralPath $serverEntry).LastWriteTimeUtc) {
  Write-Host "NearBites website and stylesheet are current."
  exit 0
}

Write-Host "Replacing a stale NearBites website process (PID $($listener.OwningProcess))."
& taskkill.exe /PID $listener.OwningProcess /F | Out-Host
if ($LASTEXITCODE -ne 0) { exit 2 }
exit 1
