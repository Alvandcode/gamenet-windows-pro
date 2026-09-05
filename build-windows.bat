@echo off
setlocal
echo ===================================
echo  Gamenet Manager Pro - Build Setup
echo ===================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20 LTS from https://nodejs.org
  pause
  exit /b 1
)

echo [1/3] Validating project...
call npm run validate
if errorlevel 1 (
  echo [ERROR] Validation failed. Fix errors above.
  pause
  exit /b 1
)

echo.
echo [2/3] Installing dependencies (clean)...
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [3/3] Building Windows installer...
call npm run dist:win
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

echo.
echo Done! Check the "dist" folder.
pause
