@echo off
chcp 65001 >nul 2>&1
title VK Sales Bot — Установка

echo.
echo ╔════════════════════════════════════╗
echo ║     VK Sales Bot — Установка       ║
echo ╚════════════════════════════════════╝
echo.

:: Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ✗ Python не найден!
    echo.
    echo Нужно установить Python:
    echo 1. Открой браузер
    echo 2. Зайди на https://python.org/downloads
    echo 3. Нажми большую кнопку "Download Python"
    echo 4. Запусти скачанный файл
    echo 5. ВАЖНО: поставь галочку "Add Python to PATH"
    echo 6. После установки снова запусти этот файл
    echo.
    pause
    exit /b 1
)

echo [1/3] Python найден ✓
echo.

:: Создаём виртуальное окружение
if not exist "venv\" (
    echo [2/3] Создаю окружение...
    python -m venv venv
) else (
    echo [2/3] Окружение уже есть ✓
)

:: Устанавливаем пакеты
echo [3/3] Устанавливаю пакеты (может занять минуту)...
venv\Scripts\pip install --quiet --upgrade pip
venv\Scripts\pip install --quiet vk-api flask

:: Копируем конфиг если нет
if not exist "vk_sales\config.json" (
    copy "vk_sales\config.example.json" "vk_sales\config.json" >nul
)

echo.
echo ╔════════════════════════════════════╗
echo ║    ✓ Установка завершена!          ║
echo ╚════════════════════════════════════╝
echo.
echo Теперь дважды кликни на файл: start.bat
echo.
pause
