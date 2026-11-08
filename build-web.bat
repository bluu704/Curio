@echo off
setlocal
cd /d "%~dp0"
title Curio 웹 버전

echo.
echo  ==============================
echo    Curio 웹 버전 만들기 / 켜기
echo  ==============================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js가 없어요. https://nodejs.org 에서 LTS 버전을 설치해 주세요.
  pause
  exit /b 1
)

rem 구글 로그인을 쓰려면 아래 줄의 = 뒤에 "웹 애플리케이션" 클라이언트 ID를 붙여 넣으세요.
rem (Google Cloud에서 승인된 자바스크립트 원본에 http://localhost:4173 추가)
rem 비워 두면 웹 화면의 설정 - 클라우드에서 한 번 입력해도 돼요.
if not defined VITE_GOOGLE_CLIENT_ID set VITE_GOOGLE_CLIENT_ID=
set VITE_BASE=/

call npm install
if errorlevel 1 goto :fail
call npm run build:web
if errorlevel 1 goto :fail

echo.
echo  [O] dist-web 폴더에 웹사이트 파일이 만들어졌어요.
echo      다른 호스팅에 올릴 땐 그 폴더 안의 파일을 그대로 올리면 돼요.
echo.
echo  지금 이 PC에서 열어요: http://localhost:4173  ^(끄려면 이 창을 닫으세요^)
start "" http://localhost:4173
call npx vite preview -c vite.web.config.ts --port 4173 --strictPort
exit /b 0

:fail
echo  [X] 만들지 못했어요. 위 메시지를 확인해 주세요.
pause
exit /b 1
