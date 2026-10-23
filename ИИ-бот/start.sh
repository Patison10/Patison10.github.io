#!/usr/bin/env bash
# Запуск на Linux/macOS: ./start.sh (перезапускается сам при падении)
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Заполни .env и запусти снова"; exit 1; }
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
while true; do .venv/bin/python -m bot.main; echo "Бот остановился, перезапуск через 5с"; sleep 5; done
