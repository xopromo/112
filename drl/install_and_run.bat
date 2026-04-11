@echo off
chcp 65001 >nul
title DRL Агент — Установка и запуск

echo.
echo ╔══════════════════════════════════════════╗
echo ║   DRL Торговый Агент — Тест гипотезы    ║
echo ╚══════════════════════════════════════════╝
echo.

:: ── Проверка Python ──────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo  ОШИБКА: Python не установлен!
    echo.
    echo  Что сделать:
    echo  1. Открой браузер
    echo  2. Зайди на: https://python.org/downloads
    echo  3. Нажми большую жёлтую кнопку Download Python
    echo  4. Запусти скачанный файл
    echo  5. ВАЖНО: поставь галочку "Add Python to PATH"
    echo  6. После установки снова запусти этот файл
    echo.
    pause
    exit /b 1
)
echo  [OK] Python найден

:: ── Проверяем что запускаем из корня проекта ─────────────────────
if not exist "drl\test_hypothesis.py" (
    echo.
    echo  ОШИБКА: Запускай этот файл из папки проекта 112
    echo  Правильно: дважды кликни install_and_run.bat находясь в папке 112\drl\
    echo.
    pause
    exit /b 1
)

:: ── Установка библиотек (один раз, ~5 минут) ─────────────────────
echo.
echo  [1/2] Устанавливаю библиотеки (подожди 3-5 минут)...
echo        gymnasium, stable-baselines3, pytorch...
echo.
pip install gymnasium stable-baselines3 numpy pandas matplotlib --quiet

if errorlevel 1 (
    echo.
    echo  ОШИБКА при установке. Попробуй запустить от имени администратора.
    pause
    exit /b 1
)
echo  [OK] Библиотеки установлены

:: ── Запуск теста ─────────────────────────────────────────────────
echo.
echo  [2/2] Запускаю тест (3-7 минут обучения)...
echo  ─────────────────────────────────────────────
echo.

python drl\test_hypothesis.py test_data\ohlcv.csv

echo.
echo  ─────────────────────────────────────────────
echo  Готово! Нажми любую клавишу чтобы закрыть.
pause >nul
