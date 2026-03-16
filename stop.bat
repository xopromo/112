@echo off
title Остановка VK Sales Bot

echo Останавливаю VK Sales Bot...

:: Находим процесс на порту 5001 и убиваем его
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5001 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: На всякий случай — также ищем pythonw с нашим модулем
taskkill /F /FI "WINDOWTITLE eq VK Sales Bot" >nul 2>&1

echo Сервер остановлен.
timeout /t 2 >nul
