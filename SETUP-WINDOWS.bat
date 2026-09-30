@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Read the error above and try again.
  pause
  exit /b 1
)
echo.
echo Setup complete. Double-click START-WINDOWS.bat to run NearBites.
pause
