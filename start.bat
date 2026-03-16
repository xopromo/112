@echo off
title VK Sales Bot

if not exist "venv\" (
    echo Сначала запусти install.bat !
    pause
    exit /b 1
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
