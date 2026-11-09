@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PY=C:\Pulso360\.venv\Scripts\python.exe
echo == Pulso 360 — build do snapshot (fora do navegador) ==
"%PY%" -c "import playwright" 2>nul || (
  echo Primeira vez: instalando Playwright + Chromium...
  "%PY%" -m pip install playwright
  "%PY%" -m playwright install chromium
)
echo.
echo Gerando o pacote de dados...
"%PY%" build_snapshot.py %*
echo.
pause
