@echo off
chcp 65001 > nul
title 桃園市立圖書館 ‧ 中壢分館書目智慧檢索系統

cd /d "%~dp0"

echo ============================================================
echo   桃園市立圖書館 ‧ 中壢分館在館書目智慧檢索系統
echo ============================================================
echo.

REM 1. 檢查系統是否已安裝 Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [錯誤] 系統未偵測到 Python 環境！
    echo.
    echo 請先安裝 Python 3.10 以上版本，並在安裝時務必勾選：
    echo 「Add python.exe to PATH」（將 Python 加入環境變數）
    echo.
    echo 官方下載連結：https://www.python.org/downloads/
    echo.
    echo ============================================================
    pause
    exit /b 1
)

REM 2. 顯示環境資訊
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PYTHON_VER=%%i
echo [檢測] %PYTHON_VER% 運作正常
echo [檢測] 正在啟動後端服務與爬蟲核心 (FastAPI / Playwright)...
echo.

REM 3. 延遲 2 秒後於預設瀏覽器開啟系統介面
start "" cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8765"

REM 4. 啟動 Python 後端伺服器
python server.py

REM 若伺服器異常終止，保留視窗並提示
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ============================================================
    echo [提示] 伺服器已停止執行（結束代碼: %ERRORLEVEL%）。
    echo 若出現套件缺失，請嘗試在終端機執行：pip install -r requirements.txt
    echo ============================================================
)

pause
