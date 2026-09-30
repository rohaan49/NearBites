@echo off
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" goto setup
if not exist "node_modules" goto setup
start "NearBites API" "%~dp0scripts\run-backend.bat"
start "NearBites frontend" "%~dp0scripts\run-frontend.bat"
timeout /t 8 /nobreak >nul
start "" "http://127.0.0.1:8080"
echo NearBites is starting. Keep the two server windows open.
exit /b 0
:setup
echo Dependencies are missing. Run SETUP-WINDOWS.bat first.
pause
exit /b 1
