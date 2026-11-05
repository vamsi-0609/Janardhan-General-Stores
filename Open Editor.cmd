@echo off
title Janardhan catalogue editor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install it from https://nodejs.org  ^(the LTS button^), then open this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First time on this computer: installing the editor's tools. This takes a minute...
  call npm install --no-audit --no-fund
)
echo Starting the Janardhan catalogue editor...
node editor\server.mjs
echo.
echo The editor has stopped. You can close this window.
pause
