@echo off
setlocal
cd /d "%~dp0"
title Curio 빌드

echo.
echo  ==============================
echo    Curio 데스크톱 앱 만들기
echo  ==============================
echo.

rem ---- 1. 필요한 프로그램 확인
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js가 없어요.
  echo      https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행해 주세요.
  goto :fail
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo  [X] Rust가 없어요.
  echo      https://rustup.rs 에서 rustup-init.exe 를 받아 설치한 뒤 다시 실행해 주세요.
  echo      설치 중 "Visual Studio C++ Build Tools" 설치를 물어보면 같이 설치해 주세요.
  goto :fail
)
if not exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" (
  echo  [!] Visual Studio C++ 빌드 도구가 안 보여요. 빌드가 실패하면 아래에서 설치해 주세요.
  echo      https://visualstudio.microsoft.com/visual-cpp-build-tools/  ^("C++를 사용한 데스크톱 개발" 선택^)
  echo.
)
echo  [O] Node.js / Rust 확인

rem ---- 2. 구글 연결 정보 (client_secret_....json 을 이 폴더에 두면 앱에 들어가요)
set FOUND=
for %%f in (client_secret*.json) do set FOUND=%%f
if exist google-oauth.json set FOUND=google-oauth.json
if defined FOUND (
  echo  [O] 구글 연결 정보 %FOUND% 를 앱에 넣어요 ^(GitHub에는 올라가지 않아요^)
) else (
  echo  [i] client_secret_....json 이 없어서 구글 드라이브 연결 없이 만들어요.
  echo      필요하면 그 파일을 이 폴더에 넣고 다시 실행해 주세요.
)
echo.

rem ---- 3. 빌드
echo  [1/2] 필요한 파일 내려받는 중... ^(처음엔 몇 분 걸려요^)
call npm install
if errorlevel 1 goto :fail
echo.
echo  [2/2] 앱 만드는 중... ^(처음엔 10~20분 걸려요^)
call npm run tauri build
if errorlevel 1 goto :fail

echo.
echo  ==============================
echo    완료! 설치 파일 폴더를 열어요
echo  ==============================
echo   msi  : target\release\bundle\msi
echo   exe  : target\release\bundle\nsis
if exist "target\release\bundle" explorer "target\release\bundle"
pause
exit /b 0

:fail
echo.
echo  [X] 빌드하지 못했어요. 위에 나온 메시지를 확인해 주세요.
pause
exit /b 1
