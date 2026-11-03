@echo off
chcp 65001 >nul
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Для запуска этой версии установите Node.js 22 или новее с https://nodejs.org/
  pause
  popd
  exit /b 1
)
node scripts/server.cjs
set "GAME_EXIT=%ERRORLEVEL%"
popd
if not "%GAME_EXIT%"=="0" pause
exit /b %GAME_EXIT%
