@echo off
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis : https://nodejs.org ^(version LTS^)
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node server.js
