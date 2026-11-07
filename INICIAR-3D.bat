@echo off
title Projeto Base 3D
cd /d "%~dp0"
echo.
echo Iniciando Projeto Base 3D...
echo A janela do navegador sera aberta automaticamente.
echo Para encerrar, pressione Ctrl+C nesta janela.
echo.
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Execute npm install nesta pasta.
  pause
)
