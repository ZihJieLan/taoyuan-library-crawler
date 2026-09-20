@echo off
cd /d "%~dp0"

echo ============================================================
echo   Pushing code to GitHub: ZihJieLan/taoyuan-library-crawler
echo ============================================================
echo.

git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ============================================================
    echo   SUCCESS! Your project has been uploaded to GitHub!
    echo   Please refresh your browser (F5) to see the repository.
    echo ============================================================
) else (
    echo ============================================================
    echo   Upload failed or cancelled.
    echo ============================================================
)

echo.
pause
