@echo off
title VK Sales Bot

if not exist "venv\" (
    echo Первый запуск - устанавливаю зависимости...
    python -m venv venv
    venv\Scripts\pip install --upgrade pip >nul 2>&1
    venv\Scripts\pip install vk-api flask apscheduler
)

echo.
echo =====================================
echo   VK Sales Bot
echo =====================================
echo.
echo  Запускаю...
echo.
echo  Открой браузер и перейди:
echo.
echo       http://localhost:5001
echo.
echo  Для остановки закрой это окно.
echo ─────────────────────────────────────
echo.

:: Открываем браузер через 2 секунды
start "" cmd /c "timeout /t 2 >nul && start http://localhost:5001"

:: Запускаем Flask
venv\Scripts\python -c "import sys; sys.path.insert(0,'.'); from vk_sales.web_app import run_web; run_web()"
