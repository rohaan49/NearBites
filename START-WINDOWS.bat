@echo off
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" goto setup
if not exist "node_modules" goto setup

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-frontend-build.ps1"
if errorlevel 1 goto build_failed

echo Checking the NearBites API...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-backend-current.ps1"
if errorlevel 2 goto api_conflict
if errorlevel 1 start "NearBites API" "%~dp0scripts\run-backend.bat"

echo Checking the NearBites website...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-frontend-current.ps1"
if errorlevel 2 goto website_conflict
if errorlevel 1 start "NearBites website" "%~dp0scripts\run-frontend.bat"

echo Waiting for the API and website to become ready. The first startup can take a minute while the frontend builds.
set /a ATTEMPTS=0
:wait_for_services
set /a ATTEMPTS+=1
curl.exe --silent --fail --max-time 5 --output NUL "http://127.0.0.1:8000/api/v1/health" 2>nul
if errorlevel 1 goto wait_again
curl.exe --silent --fail --max-time 8 --output NUL "http://127.0.0.1:8080/" 2>nul
if errorlevel 1 goto wait_again
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check-frontend-current.ps1"
if errorlevel 1 goto wait_again

echo NearBites is ready at http://127.0.0.1:8080
start "" "http://127.0.0.1:8080"
exit /b 0

:wait_again
if %ATTEMPTS% GEQ 90 goto not_ready
timeout /t 2 /nobreak >nul
goto wait_for_services

:not_ready
echo NearBites did not become ready in 3 minutes.
echo Check the open "NearBites API" and "NearBites website" windows for the first error message.
echo If the website reports port 8080 is already in use, close the old NearBites website window and run this file again.
pause
exit /b 1

:setup
echo Dependencies are missing. Run SETUP-WINDOWS.bat first.
pause
exit /b 1

:build_failed
echo NearBites website build failed. Check the error above.
pause
exit /b 1

:website_conflict
echo Another process is using port 8080. Close it, then run Start Windows again.
pause
exit /b 1

:api_conflict
echo Another process is using port 8000. Close it, then run Start Windows again.
pause
exit /b 1
