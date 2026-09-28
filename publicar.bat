@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Publicando o Painel Pulso 360 no GitHub Pages ==
echo.
copy /Y "..\PROJETOS\Dedo Duro\Painel-Ponto-x-Movimentacao-x-Trimble.html" "index.html" >nul
git add index.html
if exist dados.enc git add dados.enc
if exist dados_*.enc git add dados_*.enc
git commit -m "Atualizacao do painel Pulso 360"
git push origin main
echo.
echo Pronto. Em ~1 minuto a atualizacao aparece em:
echo    https://maronitechdevelopers.github.io/pulso-360/
echo.
pause
