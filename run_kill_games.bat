@echo off
chcp 65001 >nul
title Kill All Games

echo.
echo 🛑 모든 게임 서버를 종료합니다...
echo.

echo 🔴 Node.js 프로세스 종료...
taskkill /IM node.exe /F 2>nul

echo 🔴 CMD 창들 종료...
taskkill /IM cmd.exe /F 2>nul

echo.
echo ✅ 완료! 모든 게임 서버가 종료되었습니다.
echo.

pause
