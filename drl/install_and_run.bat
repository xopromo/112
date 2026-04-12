@echo off
title DRL Agent - Setup and Run

:: Get the folder where this bat file lives (the drl\ folder)
set DRL_DIR=%~dp0
:: Go up one level to the project root
cd /d "%DRL_DIR%.."

echo.
echo ==========================================
echo   DRL Trading Agent - Hypothesis Test
echo ==========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    echo.
    echo Steps to fix:
    echo 1. Open browser
    echo 2. Go to: https://python.org/downloads
    echo 3. Click the big Download Python button
    echo 4. Run the installer
    echo 5. IMPORTANT: check the box "Add Python to PATH"
    echo 6. After install, run this file again
    echo.
    pause
    exit /b 1
)

echo [OK] Python found
python --version

:: Check we are in the right folder
if not exist "drl\test_hypothesis.py" (
    echo.
    echo ERROR: Wrong folder.
    echo This file must be inside the 112 project folder.
    echo.
    pause
    exit /b 1
)

echo [OK] Project folder found
echo.

:: Install libraries (~5 minutes, needs internet)
echo [1/2] Installing libraries (wait 3-5 min)...
echo       gymnasium, stable-baselines3, matplotlib...
echo.
pip install gymnasium stable-baselines3 numpy pandas matplotlib

if errorlevel 1 (
    echo.
    echo ERROR during install.
    echo Try: right-click this file, Run as Administrator
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Libraries installed
echo.

:: Run the test
echo [2/2] Running test...
echo   3 windows x 150K steps = ~15-20 min
echo   Watch the progress below.
echo ------------------------------------------
echo.

python drl\test_hypothesis.py test_data\ohlcv.csv --steps 150000 --windows 3

echo.
echo ------------------------------------------
echo Done! The chart is saved in: drl\result.png
echo Open that file to see the results.
echo.
pause
