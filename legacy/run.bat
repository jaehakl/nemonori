@echo off
chcp 65001 >nul
title Nemonori Unified Launcher

echo.
echo ========================================
echo    🎮 Nemonori 통합 게임 런처를 시작합니다
echo ========================================
echo.

echo 📦 의존성을 설치합니다...
call pnpm install

echo.
echo 🚀 통합 Vite 서버를 시작합니다...
echo 📍 접속 주소: http://localhost:3000
echo.

echo 💡 팁: 
echo    - 모든 게임이 하나의 서버에서 실행됩니다
echo    - URL 경로로 게임을 구분합니다:
echo      • 런처: http://localhost:3000
echo      • Text RPG: http://localhost:3000/text-rpg
echo      • Baseball: http://localhost:3000/baseball
echo      • Village Sim: http://localhost:3000/village-sim
echo.

call pnpm dev

pause
