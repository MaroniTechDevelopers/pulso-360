@echo off
setlocal
cd /d "%~dp0"
set "PY=C:\Pulso360\.venv\Scripts\python.exe"
if not exist "%PY%" (
  echo ERRO: Python do robo nao encontrado em %PY%
  pause
  exit /b 1
)
"%PY%" -c "import playwright" 1>nul 2>nul
if errorlevel 1 (
  echo Primeira vez: instalando Playwright e Chromium...
  "%PY%" -m pip install playwright
  "%PY%" -m playwright install chromium
)
echo.
echo Gerando o pacote de dados (pode levar 15-20 min)...
"%PY%" "%~dp0build_snapshot.py" %*
echo.
echo Concluido.
pause
