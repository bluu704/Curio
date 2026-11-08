@echo off
setlocal
title Curio - web version
echo.
echo  ==============================
echo    Curio web version
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

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js not found. Install the LTS version from https://nodejs.org
  goto :fail
)

rem Google sign-in: put the "Web application" client ID after the = below
rem (and add http://localhost:4173 to its authorised JavaScript origins), or enter it once in Settings - Cloud.
if not defined VITE_GOOGLE_CLIENT_ID set VITE_GOOGLE_CLIENT_ID=
set VITE_BASE=/

call npm install
if errorlevel 1 goto :fail
call npm run build:web
if errorlevel 1 goto :fail

echo.
echo  [OK] Website files are in %CD%\dist-web
echo.
echo  Opening http://localhost:4173  ^(close this window to stop^)
start "" http://localhost:4173
call npx vite preview -c vite.web.config.ts --port 4173 --strictPort
exit /b 0

:fail
echo.
echo  [X] Failed. Check the messages above.
pause
exit /b 1
