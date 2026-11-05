@echo off
title Janardhan editor - setup on this computer
echo.
echo  Janardhan General Stores - set up the catalogue editor on this computer
echo  ----------------------------------------------------------------------
echo.
rem Find Node.js and Git in their normal folders even if Windows has not updated PATH yet (that needs a restart)
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
where git >nul 2>nul
if errorlevel 1 (
  echo  Git is not installed. Install it from https://git-scm.com/download/win
  echo  ^(click Next on every screen^), then run this file again.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js was not found. Install it from https://nodejs.org ^(LTS, "Windows Installer .msi"^),
  echo  then RESTART the computer and run this file again.
  pause
  exit /b 1
)
set "DEST=%USERPROFILE%\Documents\Janardhan-Stores"
if exist "%DEST%\.git" (
  echo  Already set up in %DEST%
) else (
  echo  Downloading the shop website into %DEST% ...
  echo  ^(If a GitHub window asks you to sign in, sign in with the shop's GitHub account.^)
  git clone https://github.com/vamsi-0609/Janardhan-General-Stores.git "%DEST%"
  if errorlevel 1 (
    echo  Download failed. Check the internet and the GitHub sign-in, then run this file again.
    pause
    exit /b 1
  )
)
cd /d "%DEST%"
echo  Installing the editor's tools ^(about a minute^)...
call npm install --no-audit --no-fund
echo  Putting "Janardhan Editor" on the desktop...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Janardhan Editor.lnk');$s.TargetPath='%DEST%\Open Editor.cmd';$s.WorkingDirectory='%DEST%';$s.IconLocation='%SystemRoot%\System32\shell32.dll,43';$s.Save()"
echo.
echo  Done. Double-click "Janardhan Editor" on the desktop to open the editor.
echo.
pause
