@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto missing
where npm >nul 2>nul
if errorlevel 1 goto missing
node scripts/start.mjs
if errorlevel 1 pause
exit /b
:missing
echo 请先安装 Node.js 20.19+ 或 22.12+：https://nodejs.org/
echo 安装后，重新双击此文件即可。
pause
exit /b 1
