@echo off
echo ===================================
echo  Gamenet Manager - Building Setup
echo ===================================
echo.
echo Installing dependencies...
call npm install
echo.
echo Building Windows installer...
call npm run dist:win
echo.
echo Done! Check the "dist" folder.
pause
