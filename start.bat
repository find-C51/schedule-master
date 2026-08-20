@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   日程智排 - AI 每日时间规划智能体
echo ============================================
echo.
echo 正在启动服务（单端口，前后端合一）...
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
echo.
echo ============================================
echo  电脑访问:  http://localhost:8000
echo  手机访问:  同一 WiFi/热点下，用下面的 IP
echo ============================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    echo            http://%%a:8000
)
echo.
echo 手机浏览器打开后，添加到主屏幕即可安装为 App
echo ============================================
pause
