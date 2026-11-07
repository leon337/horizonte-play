@echo off
title Horizonte Play - Gemini Live e Commerce MCP
cd /d "%~dp0"
echo.
echo Iniciando Horizonte Play...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-gemini.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-commerce.ps1"
powershell.exe -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue){Start-Process 'http://127.0.0.1:5173/';exit 0}else{exit 1}"
if not errorlevel 1 (
  echo Horizonte ja esta aberto na porta 5173.
  exit /b 0
)
echo Iniciando Vite e abrindo navegador...
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo Nao foi possivel iniciar o jogo. Execute npm install na pasta.
  pause
)
