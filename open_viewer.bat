@echo off
echo Starting Simple Telegram Viewer...

if not exist files.json (
    echo.
    echo [WARNING] files.json not found!
    echo Please run 'python sort_reactions.py' first to generate a dataset.
    echo.
    pause
    exit /b
)

echo Opening browser...
start http://localhost:8000/web/view_results.html

echo Starting HTTP Server...
python -m http.server 8000
