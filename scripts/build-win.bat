@echo off
REM Build Windows installer with bundled patched Chromium
echo Building BZ Browser for Windows (includes Chromium bundle step)...
call npm run pack:win
echo.
echo Done! Installer is in the release\ folder.
dir release\*.exe
