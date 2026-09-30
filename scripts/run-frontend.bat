@echo off
cd /d "%~dp0.."
set "BUN_EXE=%USERPROFILE%\.bun\bin\bun.exe"
if not exist "%BUN_EXE%" set "BUN_EXE=bun"
"%BUN_EXE%" run dev --host 127.0.0.1 --port 8080
echo.
echo Frontend stopped. Check the error above if it did not start.
pause
