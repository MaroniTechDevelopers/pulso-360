# -*- coding: utf-8 -*-
r"""
PULSO 360 — BUILD DO SNAPSHOT FORA DO NAVEGADOR
===============================================
Roda a MESMA logica do painel num Chromium headless com muita RAM e PUBLICA o pacote
(pasta `dados/`). O navegador do usuario so carrega o pacote pronto (nao processa os GBs).

MODO PADRAO = SHAREPOINT (a base e o SharePoint):
  O build faz login M365 salvo e usa o carregador do proprio painel (spLoadAll),
  que le TODAS as categorias direto do SharePoint, na ordem correta.

PRE-REQUISITOS (uma vez), no venv do robo:
  "C:\Pulso360\.venv\Scripts\python.exe" -m pip install playwright
  "C:\Pulso360\.venv\Scripts\python.exe" -m playwright install chromium

PASSO 1 (uma vez) — salvar o login M365:
  build_snapshot.bat --login
     -> abre o navegador; faca login Microsoft e aprove o acesso ao SharePoint.
     -> salva auth_state.json (NAO versionar; contem credenciais).

PASSO 2 — gerar/publicar (robo / Task Scheduler):
  build_snapshot.bat --push            # le do SharePoint, gera e publica (git push)
  build_snapshot.bat                    # idem, mas sem publicar (so gera dados/)
  build_snapshot.bat --push --dias 0    # 0 = periodo inteiro (padrao)

PLANO B (sem login, lendo a pasta local):
  build_snapshot.bat --local --push
"""
import os, sys, re, time, glob, zipfile, argparse, functools, http.server, socketserver

REPO = r"C:\Users\WSIMILAMORI\OneDrive - Transmaroni\Área de Trabalho\integracao-360"
PANEL_URL = "https://maronitechdevelopers.github.io/pulso-360/"   # origem registrada no MSAL (redirectUri)
AUTH_FILE = os.path.join(REPO, "auth_state.json")
HEAP_MB = 8192

# ----- plano B (modo --local): fonte em disco -----
DATA = r"C:\Users\WSIMILAMORI\Pulso360-SharePoint-UPLOAD\_ENVIAR 16-08 a 08-11 (padronizado)\Relatório Integração 360"
PORT = 8799
LOCAL_STEPS = [
    ("#filePonto",     "01 - Jornada (Ponto)",        ("csv","CSV"), "pending && pending.ponto && pending.ponto.length>0", 600),
    ("#fileMov",       "02 - Movimentacao (Trimble)", ("csv","CSV"), "typeof RECORDS!=='undefined' && RECORDS && RECORDS.length>0", 1800),
    ("#fileBdv",       "05 - Boletim do Veiculo",     ("csv","CSV"), "BDV && Object.keys(BDV).length>0", 600),
    ("#fileMotoristas","07 - Motoristas",             ("csv","CSV"), "MOTORISTAS_TMS && Object.keys(MOTORISTAS_TMS).length>0", 300),
    ("#fileTms",       "08 - Veiculos (TMS)",         ("csv","CSV"), "typeof TMS!=='undefined' && TMS && Object.keys(TMS).length>0", 300),
    ("#filePedidos",   "09 - Pedidos",                ("csv","CSV"), "(typeof PED_N!=='undefined' && PED_N>0)", 300),
    ("#fileBoletim",   "04 - Boletim do Motorista",   ("csv","CSV"), "BOL && Object.keys(BOL).length>0", 300),
    ("#fileMetas",     "11 - Metas",                  ("xlsx",),      "(META_PLACA && Object.keys(META_PLACA).length>0) || (META_FAM && Object.keys(META_FAM).length>0)", 300),
    ("#fileMultas",    "12 - Multas",                 ("csv","CSV"),  "MULTAS && MULTAS.length>0", 300),
    # Alertas por ÚLTIMO: antes dele, canonizamos o roster (flush) p/ o AL_TL (linha do tempo) casar os nomes.
    ("#fileAlertas",   "03 - Alertas",                ("csv","CSV"), "typeof AL_TL!=='undefined' && AL_TL && Object.keys(AL_TL).length>0", 1800),
]

def log(*a): print("[build]", *a, flush=True)

# ---------- util ----------
def _save_and_publish(download, push):
    tmp_zip = os.path.join(REPO, "_dados_build.zip")
    download.save_as(tmp_zip)
    log("pacote baixado:", f"{os.path.getsize(tmp_zip)/1e6:.1f} MB")
    out_dir = os.path.join(REPO, "dados"); os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, "parte-*.bin")) + [os.path.join(out_dir, "manifesto.json"), os.path.join(out_dir, "webviews.json")]:
        try: os.remove(old)
        except OSError: pass
    with zipfile.ZipFile(tmp_zip) as z:
        for n in z.namelist():
            if n.endswith("/"): continue
            dst = os.path.join(REPO, n.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(n) as src, open(dst, "wb") as f: f.write(src.read())
    os.remove(tmp_zip)
    log("dados/ atualizado.")
    if push:
        import subprocess
        def git(*a): return subprocess.run(["git","-C",REPO,*a], capture_output=True, text=True)
        git("add","dados")
        git("commit","-m","Atualiza snapshot de dados (build headless, fonte SharePoint)")
        p=git("push","origin","main")
        log("push:", (p.stdout or p.stderr).strip().splitlines()[-1] if (p.stdout or p.stderr).strip() else "ok")
        log("publicado — o painel reflete em ~1 min.")
    else:
        log("pronto (dados/ gerado; rode com --push para publicar).")

# ---------- LOGIN (uma vez) ----------
def do_login():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=False)
        ctx = b.new_context()
        pg = ctx.new_page(); pg.set_default_timeout(300000)
        pg.goto(PANEL_URL, wait_until="domcontentloaded")
        pg.wait_for_function("typeof goTab==='function' && typeof spSignedIn==='function'", timeout=60000)
        pg.evaluate("try{goTab('dados')}catch(e){}")
        log("Abrindo o login da Microsoft — FACA O LOGIN e aprove o acesso ao SharePoint na janela...")
        try: pg.click("#dadosLogin", timeout=15000)
        except Exception: pass
        pg.wait_for_function("spSignedIn && spSignedIn()", timeout=300000)
        log("Login OK. Confirmando acesso ao SharePoint (aprove se pedir)...")
        try: pg.evaluate("async()=>{ try{ await spToken(true); }catch(e){} }")
        except Exception: pass
        ok = pg.evaluate("async()=>{ try{ return !!(await spToken(false)); }catch(e){ return false; } }")
        ctx.storage_state(path=AUTH_FILE)
        b.close()
        log("sessao salva em auth_state.json · acesso SharePoint:", "OK" if ok else "NAO confirmado (tente de novo)")

# ---------- BUILD via SharePoint ----------
def do_build_sharepoint(push, dias):
    from playwright.sync_api import sync_playwright
    if not os.path.exists(AUTH_FILE):
        log("Sem login salvo. Rode primeiro:  build_snapshot.bat --login"); sys.exit(2)
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=[f"--js-flags=--max-old-space-size={HEAP_MB}","--disable-dev-shm-usage","--no-sandbox"])
        ctx = b.new_context(storage_state=AUTH_FILE, accept_downloads=True)
        pg = ctx.new_page(); pg.set_default_timeout(3600000)
        pg.route(re.compile(r"/dados/|dados-mobile|manifesto\.json"), lambda r: r.abort())  # comeca vazio
        pg.on("console", lambda m: log("console:", m.text[:160]) if m.type=="error" else None)
        pg.goto(PANEL_URL, wait_until="domcontentloaded")
        pg.wait_for_function("typeof spLoadAll==='function' && typeof gerarDadosPublicacao==='function' && typeof spToken==='function'", timeout=60000)
        # confirma sessao SEM abrir popup (spToken(false) devolve null se expirou)
        tok = pg.evaluate("async()=>{ try{ return !!(await spToken(false)); }catch(e){ return false; } }")
        if not tok:
            log("Sessao M365 expirou. Rode de novo:  build_snapshot.bat --login"); b.close(); sys.exit(3)
        pg.evaluate(f"()=>{{ var d=document.getElementById('spDias'); if(d) d.value='{int(dias)}'; }}")
        log(f"Lendo do SharePoint (janela: {'tudo' if int(dias)==0 else str(dias)+' dias'}) e processando... pode levar bastante.")
        with pg.expect_download(timeout=3600000) as dlinfo:
            pg.evaluate("async()=>{ await spLoadAll(true); await gerarDadosPublicacao(); }")
        _save_and_publish(dlinfo.value, push)
        b.close()

# ---------- BUILD via pasta local (plano B) ----------
def _collect(subdir, exts, cutoff):
    base=os.path.join(DATA, subdir); files=[]
    for ext in exts: files += glob.glob(os.path.join(base,"**","*."+ext), recursive=True)
    files=sorted(set(files))
    if cutoff:
        files=[p for p in files if (re.search(r"(\d{4})-\d{2}-\d{2}", os.path.basename(p)) or [None]) and (re.search(r"(\d{4})-\d{2}-\d{2}", os.path.basename(p)).group(0)>=cutoff if re.search(r"(\d{4})-\d{2}-\d{2}", os.path.basename(p)) else True)]
    return files
def do_build_local(push, dias):
    from playwright.sync_api import sync_playwright
    cutoff = time.strftime("%Y-%m-%d", time.localtime(time.time()-int(dias)*86400)) if int(dias)>0 else ""
    handler=functools.partial(http.server.SimpleHTTPRequestHandler, directory=REPO)
    class Q(socketserver.ThreadingMixIn, socketserver.TCPServer): daemon_threads=True; allow_reuse_address=True
    httpd=Q(("127.0.0.1",PORT),handler); import threading; threading.Thread(target=httpd.serve_forever,daemon=True).start()
    with sync_playwright() as pw:
        b=pw.chromium.launch(headless=True, args=[f"--js-flags=--max-old-space-size={HEAP_MB}","--disable-dev-shm-usage","--no-sandbox"])
        ctx=b.new_context(accept_downloads=True); pg=ctx.new_page(); pg.set_default_timeout(180000)
        pg.route(re.compile(r"/dados/|dados-mobile|manifesto\.json|graph\.microsoft|login\.microsoftonline"), lambda r:r.abort())
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="domcontentloaded")
        pg.wait_for_function("typeof gerarDadosPublicacao==='function'", timeout=60000)
        pg.evaluate("(()=>{try{if(typeof goTab==='function')goTab('dados');}catch(e){} var c=document.getElementById('dadosContent');if(c)c.style.display='block'; var g=document.getElementById('dadosGate');if(g)g.style.display='none';})()")
        for sel, subdir, exts, ready, tmo in LOCAL_STEPS:
            files=_collect(subdir, exts, cutoff)
            if not files: log(f"{subdir}: 0 arquivos (pulando)"); continue
            if sel=="#fileAlertas":
                # canoniza o roster (consolida tudo) ANTES de ler os alertas, p/ o AL_TL casar os nomes
                log("consolidando (canonizando roster) antes dos alertas...")
                try: pg.evaluate("()=>{ try{ flushImportChanges(false); }catch(e){} }")
                except Exception: pass
                try: pg.wait_for_function("typeof RECORD_DRIVER_NAMES_N!=='undefined' && RECORD_DRIVER_NAMES_N && RECORD_DRIVER_NAMES_N.size>0", timeout=120000)
                except Exception: pass
                pg.wait_for_timeout(3000)
            log(f"{subdir}: {len(files)} arquivo(s) -> {sel}")
            pg.set_input_files(sel, files)
            try: pg.wait_for_function(f"()=>{{try{{return ({ready});}}catch(e){{return false;}}}}", timeout=tmo*1000); log("   ok")
            except Exception as e: log(f"   AVISO: {subdir} nao confirmou em {tmo}s — seguindo.")
        with pg.expect_download(timeout=1800000) as dlinfo:
            pg.evaluate("document.getElementById('btnSnapshot').click()")
        _save_and_publish(dlinfo.value, push)
        b.close()
    httpd.shutdown()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true", help="salva o login M365 (uma vez)")
    ap.add_argument("--local", action="store_true", help="plano B: le a pasta local em vez do SharePoint")
    ap.add_argument("--push", action="store_true", help="git push do dados/ (publica)")
    ap.add_argument("--dias", type=int, default=0, help="janela de dias (0 = tudo)")
    args=ap.parse_args()
    try:
        import playwright  # noqa
    except Exception:
        log("Playwright nao instalado. Rode:")
        log(r'   "C:\Pulso360\.venv\Scripts\python.exe" -m pip install playwright')
        log(r'   "C:\Pulso360\.venv\Scripts\python.exe" -m playwright install chromium'); sys.exit(2)
    if args.login: do_login()
    elif args.local: do_build_local(args.push, args.dias)
    else: do_build_sharepoint(args.push, args.dias)

if __name__ == "__main__":
    main()
