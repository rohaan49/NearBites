@echo off
cd /d "%~dp0..\backend"
".venv\Scripts\python.exe" -c "from dotenv import load_dotenv; load_dotenv('.env'); from alembic.config import main; main(argv=['upgrade','head'])"
if errorlevel 1 (
  echo Database migration failed. Backend was not started.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
echo.
echo Backend stopped. Check the error above if it did not start.
pause
