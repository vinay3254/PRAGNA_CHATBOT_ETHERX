@echo off
echo ===================================================
echo Starting PRAGNA Chatbot System (Backend + Frontend)
echo ===================================================

:: Start Flask Backend
echo Starting Flask Backend on http://localhost:5001...
start "PRAGNA Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe app.py"

:: Start Vite Frontend
echo Starting Vite Frontend...
start "PRAGNA Frontend" cmd /k "cd /d %~dp0chatbot-ui-vite && npm run dev"

echo Both servers are starting up.
echo Backend URL: http://localhost:5001
echo Frontend URL: http://localhost:5181 (or first available port)
echo.
echo Press any key to exit this launcher window...
pause > nul
