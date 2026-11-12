@echo off
cd /d "%~dp0.."
set "BUN_EXE=%USERPROFILE%\.bun\bin\bun.exe"
if not exist "%BUN_EXE%" set "BUN_EXE=bun"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ensure-frontend-build.ps1"
if errorlevel 1 (
  echo Frontend build failed. Read the build output above.
  pause
  exit /b 1
)
set "NITRO_HOST=127.0.0.1"
set "NITRO_PORT=8080"
"%BUN_EXE%" run .output-windows\server\index.mjs
echo.
echo Frontend stopped. Check the error above if it did not start.
pause
