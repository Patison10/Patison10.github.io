@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Barbershop AI bot

where python >nul 2>nul || (echo Python not found. Install from https://www.python.org/downloads/ and tick "Add python.exe to PATH". & pause & exit /b 1)

if not exist .env (
  echo === First run setup ===
  set /p TG=Telegram bot token from BotFather: 
  set /p AI=OpenRouter API key: 
  set /p ADM=Your Telegram ID, from /myid: 
  call :write
)

if not exist .venv (
  python -m venv .venv || (pause & exit /b 1)
  .venv\Scripts\python -m pip install -q -r requirements.txt || (pause & exit /b 1)
)

:loop
echo [%date% %time%] bot started
.venv\Scripts\python -m bot.main
echo [%date% %time%] bot stopped, restart in 5s... (close window to quit)
timeout /t 5 /nobreak >nul
goto loop

:write
(
echo TELEGRAM_BOT_TOKEN=%TG%
echo ADMIN_IDS=%ADM%
echo AI_BASE_URL=https://openrouter.ai/api/v1
echo AI_API_KEY=%AI%
echo AI_MODEL=google/gemma-4-31b-it:free
echo AI_FALLBACK_MODELS=google/gemma-4-26b-a4b-it:free,poolside/laguna-s-2.1:free,poolside/laguna-xs-2.1:free
echo DB_PATH=barbershop.db
echo HISTORY_LIMIT=16
echo RATE_LIMIT_PER_MIN=8
) > .env
exit /b 0
