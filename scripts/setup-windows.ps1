$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

function Find-Tool($name, $localPath) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    if (Test-Path $localPath) { return $localPath }
    return $null
}

$bun = Find-Tool 'bun.exe' (Join-Path $env:USERPROFILE '.bun\bin\bun.exe')
if (-not $bun) {
    Write-Host 'Installing Bun from bun.sh...'
    Invoke-Expression (Invoke-RestMethod 'https://bun.sh/install.ps1')
    $bun = Find-Tool 'bun.exe' (Join-Path $env:USERPROFILE '.bun\bin\bun.exe')
}
if (-not $bun) { throw 'Bun installation did not provide bun.exe.' }

$uv = Find-Tool 'uv.exe' (Join-Path $env:USERPROFILE '.local\bin\uv.exe')
if (-not $uv) {
    Write-Host 'Installing uv from astral.sh...'
    Invoke-Expression (Invoke-RestMethod 'https://astral.sh/uv/install.ps1')
    $uv = Find-Tool 'uv.exe' (Join-Path $env:USERPROFILE '.local\bin\uv.exe')
}
if (-not $uv) { throw 'uv installation did not provide uv.exe.' }

Write-Host 'Installing frontend packages...'
& $bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Frontend package installation failed.' }

Push-Location (Join-Path $root 'backend')
try {
    if (-not (Test-Path '.env')) { throw 'backend\.env is missing from the extracted archive.' }
    Write-Host 'Installing Python 3.12 and backend packages (the AI model dependencies are large)...'
    & $uv sync --frozen --python 3.12
    if ($LASTEXITCODE -ne 0) { throw 'Backend package installation failed.' }
    Write-Host 'Applying database migrations...'
    & $uv run --no-sync --env-file .env alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    Write-Host 'Loading seller training content...'
    & $uv run --no-sync --env-file .env python -m app.bootstrap_content
    if ($LASTEXITCODE -ne 0) { throw 'Training content setup failed.' }
} finally {
    Pop-Location
}

Write-Host 'NearBites setup is complete.'
