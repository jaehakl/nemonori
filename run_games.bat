@echo off
chcp 65001 >nul
title Nemonori Games (Auto-Kill)

echo.
echo ========================================
echo    🎮 Nemonori 게임을 시작합니다
echo ========================================
echo.
echo 🚨 이 창을 닫으면 모든 게임 서버가 자동으로 종료됩니다!
echo.

echo 📦 의존성을 설치합니다...
call pnpm install

echo.
echo 🚀 게임 서버들을 시작합니다...
echo.

start "Text RPG" cmd /k "cd /d %~dp0games\text-rpg && pnpm dev"
start "Baseball" cmd /k "cd /d %~dp0games\baseball && pnpm dev"  
start "Village Sim" cmd /k "cd /d %~dp0games\village-sim && pnpm dev"

echo.
echo 🌐 게임 런처 서버를 시작합니다...
start "Launcher Server" cmd /k "cd /d %~dp0 && npx http-server . -p 8080"

echo.
echo ⏳ 서버들이 시작될 때까지 잠시 기다립니다...
timeout /t 15 /nobreak >nul

echo.
echo 🌐 게임 런처를 엽니다...
start "" "http://localhost:8080"

echo.
echo ========================================
echo ✅ 모든 게임이 시작되었습니다!
echo ========================================
echo.
echo 📍 접속 주소:
echo    - 게임 런처: http://localhost:8080
echo    - Text RPG: http://localhost:5173
echo    - Baseball: http://localhost:5174
echo    - Village Sim: http://localhost:5175
echo.
echo 💡 팁: 
echo    - 각 서버 창을 최소화하여 사용하세요
echo    - 게임을 종료하려면 이 창을 닫으세요
echo.

echo 게임을 계속 실행하려면 이 창을 열어두세요...
echo 종료하려면 이 창을 닫으세요 (자동으로 모든 서버가 종료됩니다)
echo.

:keep_alive
timeout /t 60 /nobreak >nul
echo 게임이 실행 중입니다... (종료하려면 이 창을 닫으세요)
goto keep_alive
