@echo off
title VK Sales Bot - Ustanovka

echo.
echo =====================================
echo   VK Sales Bot - Ustanovka
echo =====================================
echo.

:: Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo PYTHON НЕ НАЙДЕН!
    echo.
    echo Сделай следующее:
    echo 1. Открой браузер
    echo 2. Зайди: https://python.org/downloads
    echo 3. Нажми Download Python
    echo 4. Запусти скачанный файл
    echo 5. ВАЖНО: поставь галочку "Add Python to PATH"
    echo 6. После установки снова запусти этот файл
    echo.
    pause
    exit /b 1
)

echo [1/3] Python найден OK
echo.

:: Создаём виртуальное окружение
if not exist "venv\" (
    echo [2/3] Создаю окружение...
    python -m venv venv
    if errorlevel 1 (
        echo ОШИБКА при создании окружения
        pause
        exit /b 1
    )
) else (
    echo [2/3] Окружение уже есть OK
)

:: Устанавливаем пакеты
echo [3/3] Устанавливаю пакеты (подожди 1-2 минуты)...
venv\Scripts\pip install --upgrade pip >nul 2>&1
venv\Scripts\pip install vk-api flask apscheduler

if errorlevel 1 (
    echo ОШИБКА при установке пакетов
    pause
    exit /b 1
)

:: Конфиг
if not exist "vk_sales\config.json" (
    copy "vk_sales\config.example.json" "vk_sales\config.json" >nul
)

echo.
echo =====================================
echo   Установка завершена успешно!
echo =====================================
echo.
echo Теперь дважды кликни на файл: start.bat
echo.
pause
