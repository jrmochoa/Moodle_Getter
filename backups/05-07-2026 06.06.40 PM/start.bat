@echo off
title Moodle Activity Report - Local Server
echo.
echo  ============================================
echo    Moodle Activity Report - Local Server
echo  ============================================
echo.
echo  BEFORE clicking Generate Report:
echo    1. Log into Moodle as Admin in your browser
echo    2. Open DevTools (F12) ^> Application ^> Cookies
echo    3. Copy the value of "MoodleSession"
echo    4. Paste it into the Session Cookie field
echo.

:: Try Node.js first
where node >nul 2>&1
if %errorlevel% == 0 (
    echo  Starting with Node.js...
    echo  Opening http://localhost:8080 in browser...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    node "%~dp0server.js"
    goto :done
)

:: Try Python
where python >nul 2>&1
if %errorlevel% == 0 (
    echo  Starting with Python...
    echo  Opening http://localhost:8080 in browser...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    python "%~dp0server.py"
    goto :done
)

:: Try Python 3 explicitly
where python3 >nul 2>&1
if %errorlevel% == 0 (
    echo  Starting with Python 3...
    echo  Opening http://localhost:8080 in browser...
    timeout /t 1 /nobreak >nul
    start "" "http://localhost:8080"
    python3 "%~dp0server.py"
    goto :done
)

echo.
echo  ERROR: Node.js or Python is required.
echo.
echo  Install Node.js from:  https://nodejs.org
echo  Install Python from:   https://python.org
echo.

:done
pause
