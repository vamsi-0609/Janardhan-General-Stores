@echo off
title Janardhan catalogue editor
cd /d "%~dp0"
echo Starting the Janardhan catalogue editor...
node editor\server.mjs
echo.
echo The editor has stopped. You can close this window.
pause
