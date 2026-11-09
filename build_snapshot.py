# -*- coding: utf-8 -*-
r"""
PULSO 360 — BUILD DO SNAPSHOT FORA DO NAVEGADOR (opção 1)
=========================================================
Roda a MESMA lógica do painel (index.html) num Chromium headless com muita RAM,
injeta os CSVs locais (da estrutura "Relatório Integração 360"), gera o pacote
de publicação (pasta `dados/`) e grava no repositório. Opcionalmente commita/publica.

Assim o NAVEGADOR DO USUÁRIO nunca processa os 2 GB: ele só carrega o pacote pronto.
Pode rodar no robô (Task Scheduler), sem interface e sem gastar crédito.

PRÉ-REQUISITOS (uma vez só), no venv do robô:
    "C:\Pulso360\.venv\Scripts\python.exe" -m pip install playwright
    "C:\Pulso360\.venv\Scripts\python.exe" -m playwright install chromium

USO:
    "C:\Pulso360\.venv\Scripts\python.exe" build_snapshot.py            # gera dados/ (não commita)
    "C:\Pulso360\.venv\Scripts\python.exe" build_snapshot.py --push     # gera e git push (publica)
    ...  --dias 0      # período inteiro (padrão). Ex.: --dias 60 p/ limitar.
    ...  --headful     # abre o navegador (p/ depurar)
"""
import os, sys, re, time, glob, zipfile, io, threading, argparse, functools, http.server, socketserver

# ----------------- CONFIG -----------------
REPO = r"C:\Users\WSIMILAMORI\OneDrive - Transmaroni\Área de Trabalho\integracao-360"
DATA = r"C:\Users\WSIMILAMORI\Pulso360-SharePoint-UPLOAD\_ENVIAR 16-08 a 08-11 (padronizado)\Relatório Integração 360"
PORT = 8799
HEAP_MB = 8192
# input (selector) -> (subpasta na estrutura, extensões)  — ORDEM IMPORTA (jornada antes de mov)
STEPS = [
    ("#filePonto",     "01 - Jornada (Ponto)",        ("csv","CSV"), "pending && pending.ponto && pending.ponto.length>0",                 600),
    ("#fileMov",       "02 - Movimentacao (Trimble)", ("csv","CSV"), "typeof RECORDS!=='undefined' && RECORDS && RECORDS.length>0",         1800),
    ("#fileMotoristas","07 - Motoristas",             ("csv","CSV"), "MOTORISTAS_TMS && Object.keys(MOTORISTAS_TMS).length>0",               300),
    ("#fileAlertas",   "03 - Alertas",                ("csv","CSV"), "ALERTS && Object.keys(ALERTS).length>0",                               1800),
    ("#fileBoletim",   "04 - Boletim do Motorista",   ("csv","CSV"), "BOL && Object.keys(BOL).length>0",                                      300),
    ("#fileBdv",       "05 - Boletim do Veiculo",     ("csv","CSV"), "BDV && Object.keys(BDV).length>0",                                      300),
    ("#fileMetas",     "11 - Metas",                  ("xlsx",),      "(META_PLACA && Object.keys(META_PLACA).length>0) || (META_FAM && Object.keys(META_FAM).length>0)", 300),
    ("#fileMultas",    "12 - Multas",                 ("csv","CSV"),  "MULTAS && MULTAS.length>0",                                             300),
]

def log(*a): print("[build]", *a, flush=True)

def collect(subdir, exts, cutoff_iso):
    base = os.path.join(DATA, subdir)
    files = []
    for ext in exts:
        files += glob.glob(os.path.join(base, "**", "*."+ext), recursive=True)
    files = sorted(set(files))
    if cutoff_iso:
        def keep(p):
            m = re.search(r"(\d{4})-\d{2}-\d{2}", os.path.basename(p))
            return (m.group(0) >= cutoff_iso) if m else True
        files = [p for p in files if keep(p)]
    return files

def start_server(root, port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
    class Q(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True; allow_reuse_address = True
    httpd = Q(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--push", action="store_true", help="git add/commit/push do dados/")
    ap.add_argument("--dias", type=int, default=0, help="janela de dias (0 = tudo)")
    ap.add_argument("--headful", action="store_true")
    args = ap.parse_args()

    cutoff = ""
    if args.dias and args.dias > 0:
        cutoff = time.strftime("%Y-%m-%d", time.localtime(time.time() - args.dias*86400))
        log("janela:", args.dias, "dias (desde", cutoff, ")")

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        log("ERRO: Playwright não instalado. Rode:")
        log(r'   "C:\Pulso360\.venv\Scripts\python.exe" -m pip install playwright')
        log(r'   "C:\Pulso360\.venv\Scripts\python.exe" -m playwright install chromium')
        sys.exit(2)

    httpd = start_server(REPO, PORT)
    url = f"http://127.0.0.1:{PORT}/index.html"
    log("servindo painel em", url)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=not args.headful,
            args=[f"--js-flags=--max-old-space-size={HEAP_MB}", "--disable-dev-shm-usage", "--no-sandbox"],
        )
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()
        page.set_default_timeout(180000)
        # começa VAZIO: bloqueia o snapshot antigo e o SharePoint para não carregar/estourar na abertura
        page.route(re.compile(r"/dados/|dados-mobile|manifesto\.json|graph\.microsoft|login\.microsoftonline"),
                   lambda route: route.abort())
        page.on("console", lambda m: log("console:", m.type, m.text[:200]) if m.type in ("error","warning") else None)
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_function("typeof filtered==='function' && typeof gerarDadosPublicacao==='function'", timeout=60000)
        # Fica na aba "Dados": ela ADIA as telas pesadas entre importações (consolida só no fim) → não trava a thread.
        try: page.evaluate("(()=>{try{if(typeof goTab==='function')goTab('dados');}catch(e){} var c=document.getElementById('dadosContent');if(c)c.style.display='block'; var g=document.getElementById('dadosGate');if(g)g.style.display='none';})()")
        except Exception: pass

        for sel, subdir, exts, ready_js, tmo in STEPS:
            files = collect(subdir, exts, cutoff)
            if not files:
                log(f"{subdir}: 0 arquivos (pulando)"); continue
            mb = sum(os.path.getsize(f) for f in files)/1e6
            log(f"{subdir}: injetando {len(files)} arquivo(s) ({mb:.0f} MB) em {sel} …")
            page.set_input_files(sel, files)
            try:
                page.wait_for_function(f"()=>{{ try{{ return ({ready_js}); }}catch(e){{ return false; }} }}", timeout=tmo*1000)
                log(f"   ok ({subdir})")
            except Exception as e:
                log(f"   AVISO: não confirmei conclusão de {subdir} em {tmo}s — seguindo. ({e})")

        # consolida e gera o pacote
        log("gerando pacote de publicação…")
        with page.expect_download(timeout=1800000) as dlinfo:
            page.evaluate("document.getElementById('btnSnapshot').click()")
        dl = dlinfo.value
        tmp_zip = os.path.join(REPO, "_dados_build.zip")
        dl.save_as(tmp_zip)
        log("pacote baixado:", tmp_zip, f"({os.path.getsize(tmp_zip)/1e6:.1f} MB)")
        browser.close()

    # extrai dados/ para o repositório
    out_dir = os.path.join(REPO, "dados")
    log("extraindo para", out_dir)
    os.makedirs(out_dir, exist_ok=True)
    # limpa partes/arquivos antigos para não deixar lixo não referenciado
    for old in glob.glob(os.path.join(out_dir, "parte-*.bin")) + [os.path.join(out_dir, "manifesto.json"), os.path.join(out_dir, "webviews.json")]:
        try: os.remove(old)
        except OSError: pass
    with zipfile.ZipFile(tmp_zip) as z:
        for n in z.namelist():
            if n.endswith("/"):
                continue
            # as entradas vêm como dados/arquivo
            rel = n
            dst = os.path.join(REPO, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with z.open(n) as src, open(dst, "wb") as f:
                f.write(src.read())
    os.remove(tmp_zip)
    log("dados/ atualizado.")

    if args.push:
        import subprocess
        def git(*a): return subprocess.run(["git","-C",REPO,*a], capture_output=True, text=True)
        git("add","dados")
        c = git("commit","-m","Atualiza snapshot de dados (build headless)")
        log("commit:", (c.stdout or c.stderr).strip().splitlines()[-1] if (c.stdout or c.stderr).strip() else "sem mudanças")
        p = git("push","origin","main")
        log("push:", (p.stdout or p.stderr).strip().splitlines()[-1] if (p.stdout or p.stderr).strip() else "ok")
        log("publicado — o painel reflete em ~1 min.")
    else:
        log("pronto (dados/ gerado; rode com --push para publicar).")

if __name__ == "__main__":
    main()
