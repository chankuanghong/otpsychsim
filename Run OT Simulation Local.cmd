@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js first, then run this shortcut again.
  pause
  exit /b 1
)

echo Starting OT Simulation Lab...
echo.
echo Local app URL:
echo http://127.0.0.1:8792
echo.
echo Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the local server.
echo.

start "" "http://127.0.0.1:8792"
node local-server.js

pause
