@echo off
setlocal
title Curio - build desktop app
echo.
echo  ==============================
echo    Curio desktop app build
echo  ==============================
echo.

rem ---- Source code: when this file sits alone, download the latest Curio next to it
if exist "%~dp0package.json" (
  if exist "%~dp0.git" where git >nul 2>nul && (echo  Updating source with git... & git -C "%~dp0." pull --ff-only)
  cd /d "%~dp0"
  goto :have_src
)
echo  [..] Downloading the latest Curio source...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest 'https://github.com/bluu704/Curio/archive/refs/heads/main.zip' -OutFile '%~dp0curio-src.zip' -UseBasicParsing; Expand-Archive -Force '%~dp0curio-src.zip' '%~dp0.'; Remove-Item '%~dp0curio-src.zip'"
if errorlevel 1 (
  echo  [X] Download failed. Check the internet connection and try again.
  goto :fail
)
for %%f in ("%~dp0client_secret*.json" "%~dp0google-oauth.json") do if exist "%%~f" copy /y "%%~f" "%~dp0Curio-main\" >nul
cd /d "%~dp0Curio-main"
echo  [OK] Source ready: %CD%
:have_src

rem ---- Tools
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js not found. Install the LTS version from https://nodejs.org and run this again.
  goto :fail
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo  [X] Rust not found. Install it from https://rustup.rs and run this again.
  echo      When asked, also install "Visual Studio C++ Build Tools".
  goto :fail
)
if not exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" (
  echo  [!] Visual Studio C++ Build Tools not found. If the build fails, install them from
  echo      https://visualstudio.microsoft.com/visual-cpp-build-tools/  ^(choose "Desktop development with C++"^)
  echo.
)
echo  [OK] Node.js / Rust

rem ---- Google sign-in (put client_secret_....json next to this file; it is never uploaded to GitHub)
set FOUND=
for %%f in (client_secret*.json) do set FOUND=%%f
if exist google-oauth.json set FOUND=google-oauth.json
if defined FOUND (
  echo  [OK] Google sign-in: %FOUND%
) else (
  echo  [i] No client_secret_....json - building without Google Drive sign-in.
)
echo.

rem ---- Build
echo  [1/2] npm install ^(first time: a few minutes^)
call npm install
if errorlevel 1 goto :fail
echo.
echo  [2/2] Building the app ^(first time: 10-20 minutes^)
call npm run tauri build
if errorlevel 1 goto :fail

echo.
echo  ==============================
echo    Done! Opening the installer folder
echo  ==============================
echo   msi : %CD%\target\release\bundle\msi
echo   exe : %CD%\target\release\bundle\nsis
if exist "target\release\bundle" start "" explorer "target\release\bundle"
pause
exit /b 0

:fail
echo.
echo  [X] Build failed. Check the messages above.
pause
exit /b 1
