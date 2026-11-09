@echo off
title Janardhan catalogue editor
cd /d "%~dp0"
rem Find Node.js and Git in their normal folders even if Windows has not updated PATH yet
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
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
rem One line on purpose: a sync may update this file while the editor runs.
node editor\run.mjs & echo. & echo The editor has stopped. You can close this window. & pause & exit /b
