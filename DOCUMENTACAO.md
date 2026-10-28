# Painel Pulso 360 — Documentação Técnica

> **Grupo Maroni / Transmaroni** — Integração de Condutor & Jornada (Trimble × Ponto × Identificação)
> Documento de referência da base de código. Última revisão: **2026-09-25**.

Este documento descreve **tudo** o que o painel faz e **como** faz, para que qualquer pessoa
consiga manter, auditar ou reimplementar a solução sem precisar decifrar o código do zero.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Como rodar e publicar](#3-como-rodar-e-publicar)
4. [Fontes de dados (relatórios)](#4-fontes-de-dados-relatórios)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Regras de negócio e cálculos](#6-regras-de-negócio-e-cálculos)
7. [Configurações (CFG)](#7-configurações-cfg)
8. [Interface — abas e telas](#8-interface--abas-e-telas)
9. [Linha do tempo](#9-linha-do-tempo)
10. [Ficha do motorista e PDFs](#10-ficha-do-motorista-e-pdfs)
11. [Tratativas (base de dados de acompanhamento)](#11-tratativas-base-de-dados-de-acompanhamento)
12. [Persistência dos dados](#12-persistência-dos-dados)
13. [Integração Microsoft 365 (Graph / MSAL)](#13-integração-microsoft-365-graph--msal)
14. [Segurança e privacidade](#14-segurança-e-privacidade)
15. [Glossário](#15-glossário)
16. [Inventário de funções](#16-inventário-de-funções)
17. [Guia de manutenção](#17-guia-de-manutenção)
18. [Pendências e roadmap](#18-pendências-e-roadmap)

---

## 1. Visão geral

O **Painel Pulso 360** cruza, por **motorista + dia**, quatro dimensões da operação:

- **Folha de ponto** (jornada batida pelo colaborador);
- **Movimentação do veículo** (Trimble — quando e onde o veículo rodou, km, litros);
- **Identificação facial** (câmera Trimble / Boletim do Veículo — quem estava dirigindo);
- **Alertas de telemetria** (celular, cinto, fadiga, distração, velocidade).

A partir desse cruzamento ele aponta **divergências** (ex.: veículo rodou sem ponto, condutor
diferente do escalado, condução fora da jornada, descanso entre jornadas abaixo do mínimo da CLT),
calcula **indicadores de aderência**, gera **fichas por motorista** (a "capivara") e permite ao
gestor **registrar tratativas** com histórico.

**Público-alvo:** gestão de frota, PMO e RH/DP do Grupo Maroni.

**Indicador central:** _Aderência de jornada_ — quanto do tempo de condução aconteceu **dentro** do
horário do ponto (linguagem positiva; substituiu o antigo termo interno "dedo duro").

---

## 2. Arquitetura

- **Arquivo único, self-contained:** `index.html` (produção) — todo o HTML, CSS e JavaScript num
  só arquivo. **Não há backend, banco de dados nem build.** Abre direto no navegador.
- **Fonte de trabalho:** `../PROJETOS/Dedo Duro/Painel-Ponto-x-Movimentacao-x-Trimble.html`
  (o `publicar.bat` copia esse arquivo para `index.html` antes de publicar).
- **Título da aba:** `Conferência Ponto × Movimentação × Trimble — Pulso 360`.
- **Linguagem:** JavaScript puro (sem framework). Manipulação direta do DOM.
- **Não existe versão em Python.** Toda a lógica descrita neste documento roda no navegador,
  em JS. Uma eventual reimplementação em Python (pandas/Streamlit) usaria estas mesmas regras.

### Bibliotecas externas (carregadas via CDN, com `defer`)

| Biblioteca | Versão | CDN | Para quê |
|---|---|---|---|
| **SheetJS (xlsx)** | 0.18.5 | cdnjs | Ler planilhas `.xlsx/.xls` (abastecimento, metas, saúde de câmeras) |
| **JSZip** | 3.10.1 | cdnjs | Abrir o `.zip` da movimentação Trimble |
| **MSAL Browser** (`@azure/msal-browser`) | 3.10.0 | jsdelivr | Login Microsoft 365 (SharePoint via Graph) |

> Os CSVs funcionam **sem internet**; as libs só são necessárias para `.xlsx`, `.zip` e login M365.

### Estado global (variáveis principais em memória)

| Variável | O que guarda |
|---|---|
| `RAW` | Linhas cruas importadas `{ ponto, mov, trim, bdv, ... , bases }` ou `null` (→ modo demo) |
| `REAL` | `true` se há dados reais carregados; `false` = dados de demonstração |
| `BASES` | Quais fontes estão carregadas: `{ ponto, mov, trim }` (controla quais flags disparam) |
| `RECORDS` | Registros já processados por `analyze()` — a base de tudo que a tela mostra |
| `CFG` | Parâmetros de negócio (tolerâncias, mínimos) — ver seção 7 |
| `MOV_TOT` / `MOV_IDN` | Por `placa\|dia`: minutos totais de movimento × minutos **identificados** |
| `MOV_UNSEG` | Por `placa\|dia`: trechos de movimento **sem** condutor identificado |
| `PLACA_MOV` / `PLACA_UO` | Movimento e operação (UO) por placa, vindos do Boletim do Veículo |
| `BOL`, `ALERTS`, `ABAST`, `META*`, `SAUDE`, `BDV`, `PED_*` | Índices auxiliares por relatório |
| `NOME2CPF` / `CPF2NOME` | De-para nome ↔ CPF (para casar pedido × identificação) |
| `TRAT_CACHE` | Cache das tratativas (SharePoint + localStorage) |

---

## 3. Como rodar e publicar

### Rodar localmente
Basta abrir `index.html` (ou a versão de trabalho) no navegador. Nenhuma instalação.

### Publicar (GitHub Pages)
1. Editar sempre a **versão de trabalho** em `../PROJETOS/Dedo Duro/Painel-Ponto-x-Movimentacao-x-Trimble.html`.
2. Rodar `publicar.bat` — ele:
   - copia a versão de trabalho para `index.html`;
   - `git add index.html` (+ `dados.enc` se existir);
   - `git commit` e `git push origin main`.
3. Em ~1 minuto sai no ar em: **https://maronitechdevelopers.github.io/pulso-360/**

```
publicar.bat            # publica o painel
git push origin main    # equivalente manual do passo de push
```

> **Backup / versionamento:** o histórico vive no Git (repositório `pulso-360`; pasta local `integracao-360`). Cada
> publicação é um commit. Para restaurar uma versão antiga: `git log` → `git checkout <hash> -- index.html`.

---

## 4. Fontes de dados (relatórios)

O painel aceita **11 tipos** de relatório. A detecção do tipo é **automática** pelo conteúdo do
cabeçalho (função `detectTipo`), então o nome do arquivo não precisa ser exato.

| # | Tipo (chave) | Formato | Como é reconhecido | Alimenta |
|---|---|---|---|---|
| 1 | `jornada` (ponto) | CSV/XLSX | cabeçalho tem `ENTRADA 1` ou `SAIDA 1` | jornada, hora extra, almoço, interjornada |
| 2 | `mov` (movimentação Trimble) | ZIP/CSV | `.zip`, ou cabeçalho com `OCORRENCIA`/`DATA/HORA INICIAL` | condução, km, litros, fora da jornada |
| 3 | `bdv` / `boletim` (Boletim do Veículo) | CSV | `SEM MOTORISTA`+`PLACA`, ou `MOTORISTA`+`CPF`+`MEDIA CONSUMO` | **identificação** (aderência), operação (UO), saúde da câmera |
| 4 | `alertas` | CSV | `TIPO`+`NIVEL`, ou `EXCESSO DE VELOCIDADE` | alertas de telemetria (por tipo/severidade/horário) |
| 5 | `pedidos` | CSV | `CPF MOTORISTAS`+`DATA CARREGAMENTO` | vínculo condutor × placa (pedido), operação por viagem |
| 6 | `tms` | CSV | `CENTRO RESULTADO`+`RENAVAM` | dados de veículo/centro de resultado |
| 7 | `motoristas` (Relatório de Motoristas) | CSV | `DATA ADMISSAO` | **data de admissão** (tempo de casa) |
| 8 | `abast` (abastecimento) | XLSX | nome contém `ABASTEC` | média realizada (km/l) por motorista |
| 9 | `metas` | XLSX | nome contém `MEDIA`/`META` | metas de média por operação/placa |
| 10 | `saude` (saúde das câmeras) | XLSX | nome contém `CAVALO`/`CAMERA`/`SAUDE`/`CAM` | plano de manutenção de câmeras |

**Encoding:** os CSVs são decodificados de forma tolerante (`decodeText`): tenta UTF-8 e cai para
**cp1252/latin1** quando detecta acentuação quebrada (comum nos relatórios da Rodopar/Trimble).
O parser de CSV (`splitCSVLine`) respeita aspas e detecta o delimitador.

> **Boletim do Veículo** é a fonte **preferencial de identificação** (gap #3): a coluna
> `MOTORISTAS` preenchida no dia em que a placa moveu = condutor identificado. `applyBDV()` grava
> `PLACA_MOV` (movimento por placa/dia) e `PLACA_UO` (operação pela UO) antes de resolver operações.

---

## 5. Modelo de dados

### Chave
Cada registro é único por **operação + dia + placa + motorista** (`_key`).
A unidade de análise, porém, é sempre **motorista + dia**.

### Pipeline
```
RAW.records  (ou demoRecords())
      │  build()
      ▼
RECORDS = base.map(analyze)      ← deriva todos os campos
      │  + backfill de operação por motorista (só dias sem veículo)
      │  + cálculo de INTERJORNADA (por motorista, dias consecutivos)
      ▼
filtered()   ← aplica os filtros da barra (fechamento, operação, dia, motorista, status, busca)
      ▼
renderAll()  ← desenha a aba ativa a partir dos registros filtrados
```

### Campos derivados por `analyze(rec)` (principais)
| Campo | Significado |
|---|---|
| `operacao` | Operação do **veículo** (UO/placa) > pedido (viagem) > departamento da jornada |
| `punches[]`, `entrada`, `saida` | Batidas do ponto (min do dia), 1ª e última |
| `horasPonto` | Soma dos pares trabalhados (**em minutos**) |
| `mov[]`, `horasMov`, `km`, `litros`, `media` | Movimentação, tempo conduzido (**min**), km, litros, km/l |
| `primMov`, `ultMov` | 1º e último minuto de movimento |
| `segs[]`, `trimbleMot`, `semelhanca` | Segmentos Trimble, condutor predominante, % de semelhança médio |
| `foraJornada` | Minutos de movimento **fora** da janela `[entrada−tol, saida+tol]` |
| `horasDedoDuro` | Fora da jornada; se rodou **sem ponto**, é 100% do movimento |
| `ddReal` | Fora da jornada **só quando há ponto** (não infla o farol com pendência) |
| `horaExtra` | `horasPonto − CFG.jornadaMin` quando positivo |
| `condutorDivergente`, `idDivergente` | Condutor do pedido ≠ identificado; identificação ≠ escalado |
| `interjornada` | Minutos de descanso até a jornada anterior (preenchido em `build()`) |
| `flags[]`, `sev` | Lista de apontamentos + severidade consolidada |

> ⚠️ **`horasPonto`, `horasMov`, `foraJornada`, `ddReal`, `interjornada` estão todos em MINUTOS.**
> Não multiplicar por 60 nos cálculos de aderência (esse foi um bug já corrigido).

---

## 6. Regras de negócio e cálculos

### 6.1 Operação do motorista
Prioridade em `analyze`: **UO da Trimble/placa** (`operacaoDaPlaca`) → **pedido por viagem**
(`opDaViagem`) → departamento da jornada. Em `build()`, dias **sem veículo** (só ponto) herdam a
operação predominante do condutor — assim a contagem por operação não empurra veículos para a
operação errada.

### 6.2 Jornada e hora extra
- `horasPonto` = soma dos pares de batidas.
- **Hora extra** = `horasPonto − CFG.jornadaMin` (padrão `jornadaMin = 440 min = 7h20`), quando > 0.

### 6.3 Fora da jornada ("condução fora do horário do ponto")
- Janela da jornada = `[entrada − tol, saida + tol]` (`tol` padrão 20 min).
- `foraJornada` = minutos de movimento **antes** da entrada ou **depois** da saída.
- Vira flag `dedo_duro` quando `foraJornada > CFG.fora` (padrão 15 min).

### 6.4 Aderência de jornada (indicador central) — `aderJornada(recs)`
Percentual **positivo** do tempo de condução que ficou **dentro** do ponto, só sobre dias **com ponto**:
```
aderJornada = (Σ horasMov − Σ ddReal) / Σ horasMov      (0–100%, sobre dias com punches)
```
Cores (`ajColor`): **≥90% bom · ≥70% atenção · <70% crítico**.

### 6.5 Identificação — aderência da câmera — `aderRecs(recs)`
Ponderada **pelo tempo** (reflete a trilha vermelha da linha do tempo):
```
identificação = Σ MOV_IDN / Σ MOV_TOT      (minutos identificados ÷ minutos de movimento)
```
Usa `MOV_TOT`/`MOV_IDN` por `placa|dia` (do Boletim/movimentação).

**Regra da nota (27/10/2026):** a cobertura da câmera continua sendo medida para
saúde do equipamento e auditoria de identificação, mas **não compõe a nota do
motorista**, nem restringe a seleção dos melhores colocados. A identificação
do motorista em si continua sendo um componente distinto da nota.
O peso-base anteriormente atribuído à cobertura (5) é redistribuído
proporcionalmente entre os demais critérios ativos; velocidade mantém
peso de 15% quando apurada.

**Regra final de 28/10/2026:** aderência de jornada e ponto, alertas (exceto velocidade), velocidade e interjornada têm peso de 20% cada; identificação do motorista e multas de conduta possuem 10% cada. Aderência de jornada e ponto mantém 60% para condução dentro do ponto e 40% para cobertura de ponto. **Hora extra e média de combustível não compõem a nota** e permanecem informativas. Divergência de condutor não gera desconto extra, embora continue disponível para tratativas e análise. Reincidência grave de velocidade e teto de alertas continuam conforme regras existentes. Componentes ausentes têm seus pesos redistribuídos proporcionalmente; com velocidade apurada, o peso dela fica fixo em 20%.

O WebView precisa de pacote `scoreRulesVersion=5` para exibir a nota atual; pacotes anteriores ocultam a nota e a bonificação, mantendo dados informativos sem baixar a base integral.
> **Por que ponderar pelo tempo:** a média simples dos %s diários mascarava dias longos sem
> identificação (aparecia 97% com a trilha cheia de vermelho). Corrigido.

### 6.6 Aderência do motorista — `aderMotoristaRecs(recs)`
Quanto do movimento da(s) placa(s) foi do próprio motorista:
```
aderênciaMotorista = Σ horasMov (do motorista) / Σ MOV_TOT (das placas dele)
```
Mantida **junto** com a aderência da câmera na capivara (decisão do usuário: "manter ambos").

### 6.7 Interjornada (CLT — 11h de descanso) — calculado em `build()`
Por motorista, ordenando os dias trabalhados; entre um dia e o seguinte:
```
descanso = (início da jornada do dia atual) − (fim da jornada do dia anterior)   [em minutos]
```
- Guardado em `rec.interjornada` (no **dia que começou cedo demais**).
- Se `descanso < CFG.interjornadaMin` (padrão `660 min = 11h`) → flag `interjornada` (atenção).
- **Visualização:** **marcador 🛌 na trilha do Ponto** (estilo dos alertas: ícone + haste vermelha),
  posicionado no **início do dia** que não cumpriu as 11h; KPI "Descanso mín" no cabeçalho do card;
  bloco "Descanso entre jornadas" na ficha e no PDF.
- **Limitação conhecida (v1):** jornadas que cruzam a meia-noite ainda não são tratadas com precisão total.

### 6.8 Almoço
- Pausas entre pares de batidas; a maior pausa `≥ CFG.almocoMin` (30 min) é o almoço (`lunch`).
- **Caso A** `almoco_dirigido`: dirigiu durante a janela do almoço (interseção movimento × pausa ≥ 10 min).
- **Caso B** `sem_pausa`: jornada longa (`span ≥ jornadaMaxH×60`, padrão 6h) **sem** pausa registrada.

### 6.9 Média (km/l)
`media = km / litros` por registro. `mediaDe(nome)` usa o relatório de **abastecimento** quando
disponível; metas por `metaDe(operacao)` / `metaVeic(placa, operacao)`. Farol vs. meta em `farolMediaVs`.

### 6.10 Divergências (flags) — catálogo completo
Cada flag só dispara quando a **base necessária** está carregada (`BASES`).

| Chave (`k`) | Severidade | Rótulo curto (`DIV_TIPOS`) | Condição |
|---|---|---|---|
| `mov_nao_enc` | pendente | Movimentação não encontrada | tem ponto mas sem movimento na base |
| `id_nao_enc` | pendente | Identificação não encontrada | tem ponto/movimento mas sem Trimble |
| `mov_sem_ponto` | crítico | Ponto a registrar | veículo rodou sem ponto no dia |
| `sem_mov` | atenção | Praticamente sem movimento | tem ponto e placa, movimento < `movMin` |
| `id_diverg` | crítico | Condutor a confirmar | câmera reconheceu ≠ escalado |
| `semelhanca_baixa` | atenção | Cadastro facial a revisar | semelhança < `CFG.sem` |
| `dedo_duro` | atenção | Condução fora do horário do ponto | `foraJornada > CFG.fora` |
| `mov_antes_entrada` | atenção | Início antes de bater a entrada | 1º movimento < `entrada − tol` |
| `almoco_dirigido` | atenção | Pausa de almoço a conferir | dirigiu ≥10 min no almoço |
| `sem_pausa` | atenção | Sem pausa de almoço registrada | jornada longa sem intervalo |
| `hora_extra` | atenção | Jornada além de 7h20 | `horaExtra > 0` |
| `condutor_nao_vinc` | crítico | Vínculo condutor × placa a confirmar | CPF do pedido ≠ CPF identificado |
| `interjornada` | atenção | Descanso < 11h entre jornadas | `interjornada < interjornadaMin` |

**Severidade consolidada (`sev`):** crítico > atenção > pendente > conforme.
Rótulos exibidos (`SEV_LABEL`): `conforme`→"Tudo certo", `atencao`→"Atenção", `critico`→"Prioridade",
`pendente`→"A conferir".

### 6.11 Alertas de telemetria
Tipos (`ALERTA_DEF`): **Celular 📱 · Cinto 🔒 · Fadiga 😴 · Distração 👁️ · Velocidade ⏱️**.
Níveis: **A**lto / **M**édio / **B**aixo. O **total** de alertas vem do Boletim (todos os tipos);
a **severidade** vem do relatório de alertas (na prática, excesso de velocidade). Por isso o painel
mostra, ex.: "total 2.199 · 9 em nível alto" — não é inconsistência, são recortes diferentes.

---

## 7. Configurações (CFG)

Definidas em `loadCfg()`, salvas em `localStorage` (`ddPMT_cfg`), editáveis na aba **Dados**.
Toda alteração re-executa `build()` + `renderAll()`.

| Chave | Padrão | Unidade | Significado |
|---|---|---|---|
| `tol` | 20 | min | Tolerância da janela da jornada (antes/depois do ponto) |
| `sem` | 80 | % | Semelhança mínima da identificação facial |
| `fora` | 15 | min | Mínimo de "fora da jornada" para virar apontamento |
| `movMin` | 5 | min | Movimento mínimo para considerar que o veículo rodou |
| `farolAmareloMax` | 60 | min | Limite do farol amarelo |
| `meta` | 2.40 | km/l | Meta padrão de média |
| `almocoMin` | 30 | min | Pausa mínima considerada como almoço |
| `jornadaMaxH` | 6 | h | Jornada longa sem pausa vira `sem_pausa` |
| `precoLitro` | 6.00 | R$ | Preço do litro (estimativas de custo) |
| `jornadaMin` | 440 | min | Jornada padrão (7h20) — acima disso é hora extra |
| `interjornadaMin` | 660 | min | Descanso mínimo entre jornadas (11h — CLT) |

---

## 8. Interface — abas e telas

Barra de abas (`#tabs`):

| Aba (`data-tab`) | Conteúdo |
|---|---|
| `semana` | **Resumo semanal** — KPIs gerais + cards por operação/semana |
| `aderencia` | **Aderência** — % por operação, placas que puxam o índice, plano de ação |
| `linha` | **Linha do tempo** — Ponto / Descanso / Direção / Alertas / Identificação com zoom |
| `diverg` | **Pontos de atenção** — lista de divergências (com filtro por tipo) + badge de contagem |
| `media` | **Média** — km/l vs. meta |
| `tabela` | **Consolidado** — tabela completa dos registros |
| `operacao` | **Operação por placa** |
| `saude` | **Saúde das câmeras** — plano de manutenção |
| `semid` | **Placas sem ID** — placas sem identificação + plano por categoria |
| `dados` | **Dados & como usar** — importação, configs, SharePoint, snapshot (**restrita a admin**) |

**Filtros globais** (barra superior): Fechamento, Operação, Dia, De/Até, Motorista, Status, Busca.
**Fechamento** = período do dia **16** de um mês ao dia **15** do seguinte (competência = mês do dia 15).

**KPIs do Resumo** (`renderKpis`): ① Identificação (aderência da câmera) · Placas (total/OK/p/ação) ·
③ Aderência de jornada · Cobertura de ponto · Movimento sem ponto · Ponto sem movimento ·
Interjornada < 11h · ④ Média / ⚠ Alertas · Horas extras. KPIs clicáveis levam à aba correspondente.

**Tema:** claro por padrão + alternância para escuro (persistido em `ddPMT_theme`). Identidade Maroni
(navy `#111827` + ouro `#f5c800`, logo do rinoceronte).

---

## 9. Linha do tempo

Renderizada por `buildWeekCards` (por motorista) e `buildPlacaCards` (por placa); pintura e zoom
em `renderZoom` / `setupZoom`. Cada card guarda seu estado de zoom em `ZTL[id]`.

**Faixas (lanes):**
- **Ponto** — intervalos trabalhados (batidas). Traz também o **marcador 🛌 de interjornada**
  (descanso < 11h) no início do dia que não cumpriu — mesmo estilo dos marcadores de alerta.
- **Direção** — movimento do veículo (com placa; hachurado quando sem identificação; contorno quando fora da jornada).
- **Alertas** — marcadores por tipo/severidade no horário exato.
- **Identificação** — verde (identificado) / vermelho (sem ID) / destacado (condutor divergente).

**Zoom:** roda do mouse dá zoom (período → dia → horas), arrastar navega, duplo-clique reseta.
Régua e grade adaptam a escala automaticamente.

---

## 10. Ficha do motorista e PDFs

- `openFicha(nome)` → `renderFicha()` monta a "capivara": KPIs (identificação da câmera, aderência
  do motorista, aderência de jornada, hora extra, alertas, **descanso entre jornadas**), pontos de
  atenção × pontos fortes (`fichaPontos`), **plano de ação** (`planoDeAcao`), leitura geral e
  histórico de tratativas. `fichaMetrics(nome)` é a **fonte única** das métricas da ficha.
- **PDF da ficha** (`exportFichaPDF`): versão imprimível/e-mail da capivara, com os mesmos KPIs
  (inclui "Alertas por tipo" e "Descanso entre jornadas"), plano de ação e histórico de tratativas.
- **PDF do painel** (`exportPainelPDF`): visão consolidada.
- Infra de PDF: `pdfShell`, `pdfKpi`, `pdfEsc`, `pdfOpen` (abre janela e dispara impressão).

---

## 11. Tratativas (base de dados de acompanhamento)

Permite ao gestor **iniciar uma tratativa** com o motorista e manter **histórico** (quantas vezes,
qual ação tomada, observação, data, gestor). Objetivo: o painel funcionar "como um site de fato,
com base de dados fixa, independente de atualização".

- **Persistência dupla:**
  - **SharePoint List** `Tratativas Pulso 360` (compartilhada) — criada automaticamente por
    `spEnsureTratList` com as colunas: `MotoristaKey, Cpf, DataTratativa, Gestor, GestorEmail,
    TipoAcao, Observacao, Operacao, Placa, Sinais`.
  - **localStorage** (`integ360_tratativas`) — cache/local por navegador.
- **Chave** (`tratKey`): CPF quando conhecido (`cpf:<cpf>`), senão nome normalizado (`nome:<NOME>`).
- Funções: `tratList`, `tratAdd`, `tratSyncFromSP`, `openTratModal`, `salvarTratativa`.
- UI: botão **"Iniciar tratativa"** na ficha (`#btnTratativa`) + modal `#tratModal`.

> A gravação na Lista depende do consentimento do TI (ver seção 13). Sem isso, as tratativas
> ficam no localStorage do navegador.

---

## 12. Persistência dos dados

Três camadas, com papéis diferentes:

| Camada | Chave/Local | Escopo | Papel |
|---|---|---|---|
| **localStorage** | `ddPMT_data` (dados), `ddPMT_cfg`, `ddPMT_theme`, `integ360_*` | por navegador | Guardar o último import, configs, tema, tratativas locais |
| **SharePoint** | site `gestao.desenvolvimento` / pasta `Relatório Pulso 360` + Lista de tratativas | compartilhado (M365) | Fonte oficial e compartilhada (quando o TI liberar) |
| **Snapshot criptografado** | arquivo `dados.enc` + chave no link (`#k=...`) | compartilhável | Distribuir os dados pelo link **sem** depender do SharePoint |

### Snapshot criptografado (interino, sem SharePoint)
- `gerarSnapshot()` serializa o estado (`snapshotState`), **comprime** (gzip via `CompressionStream`)
  e **criptografa** (Web Crypto **AES-GCM**). Gera `dados.enc` + um link com a **chave no fragmento**
  (`#k=<base64url>`), que nunca vai ao servidor.
- `carregarSnapshotDoLink(k)` (no INIT, ao detectar `#k=`) baixa `dados.enc`, descriptografa,
  descomprime (`_gunz`) e restaura (`restoreState`).
- O arquivo no repositório público é **inútil sem a chave** que está apenas no link compartilhado.
- Helpers: `_b64/_unb64/_b64url/_unb64url`, `_gz/_gunz`.

---

## 13. Integração Microsoft 365 (Graph / MSAL)

Configuração em `SP_CFG`:

| Campo | Valor |
|---|---|
| `clientId` | `42461f0c-08c1-48dd-a12b-b891c8747427` |
| `tenantId` | `8babaf2b-248f-4651-98d6-1e5312fbe00a` |
| `redirectUri` | `https://maronitechdevelopers.github.io/pulso-360/` |
| `siteHost` | `grupotransmaroni.sharepoint.com` |
| `sitePath` | `/sites/gestao.desenvolvimento` |
| `folder` | `Relatório Pulso 360` |
| `tratList` | `Tratativas Pulso 360` |
| `scopes` | `Sites.ReadWrite.All`, `User.Read` |
| `adminEmails` | `maroni.tech@transmaroni.com.br` |

- **Login (delegado, PKCE):** `spMsal()` cria o `PublicClientApplication`; `spToken(interactive)`
  faz `acquireTokenSilent` → `acquireTokenPopup`. Cache em localStorage.
- **Leitura de relatórios:** `spLoadAll()` lista a pasta via Graph
  (`/drive/root:/{folder}:/children`), baixa cada arquivo pelo `@microsoft.graph.downloadUrl`
  (CORS aberto), detecta o tipo pelo cabeçalho (`detectTipo`) e carrega o **mais recente por tipo**.
- **Escrita (tratativas):** `POST /lists` (cria a Lista) e `/lists/{id}/items`.
- **Registro do app (Azure AD):** SPA / **permissões delegadas** (não application-only). O
  `redirectUri` do app precisa ser exatamente a URL do GitHub Pages.

> **Pendência com o TI:** o consentimento **admin** de `Sites.ReadWrite.All` está pendente. Até lá:
> - o **login de identidade** (`User.Read`) já funciona e libera a aba **Dados**;
> - **ler relatórios / gravar tratativas / criar pastas** no SharePoint **não** funciona;
> - o **snapshot criptografado** funciona sem depender do TI.
>
> ⚠️ **Nunca** colocar `client_secret` neste arquivo — o site é público e exporia o segredo. O fluxo
> é de navegador (público/PKCE), que **não usa** segredo.

---

## 14. Segurança e privacidade

- O repositório é **público** (GitHub Pages), mas o `index.html` **não contém dados** de motoristas.
- Dados sensíveis (CPF, nomes) entram só via **import local** ou **SharePoint (com login M365)**.
- A **proteção real** dos dados é o **login M365 + SharePoint**. O gate da aba **Dados**
  (`isAdmin`/`applyDadosGate`, por e-mail) é **guarda-corpo de UX**, não segurança de fato.
- O **snapshot** protege os dados por **criptografia** (a chave viaja só no link, fora do servidor).
- Compartilhar o link com dados reais = compartilhar a chave; tratar o link como confidencial.

---

## 15. Glossário

| Termo | Significado |
|---|---|
| **Capivara** | Apelido interno da **ficha do motorista** (resumo individual). |
| **Aderência de jornada** | % do tempo de condução dentro do horário do ponto (indicador central). |
| **Fora da jornada** | Movimento fora da janela do ponto (antes de bater / depois de sair). |
| **Interjornada** | Descanso entre o fim de uma jornada e o início da próxima (CLT: mín. 11h). |
| **Fechamento** | Período de competência: dia 16 → dia 15 do mês seguinte. |
| **UO** | Unidade Operacional / operação, vinda do Boletim do Veículo. |
| **BDV** | Boletim do Veículo (fonte preferencial de identificação). |
| **Tratativa** | Ação do gestor com o motorista, registrada com histórico. |

---

## 16. Inventário de funções

**Utilitários:** `norm`, `toMin`, `hm`, `hDec`, `isoDate`, `brDate`, `firstName`, `isoWeek`,
`weekInfo`, `cpfKey`, `col`, `numBR`, `splitDT`, `durSec`, `placaKey`, `uoCurta`, `opFamily`.

**Núcleo de dados:** `loadCfg`/`saveCfg`, `loadData`/`saveData`, `analyze`, `build`, `filtered`,
`fillFilters`.

**Aderência:** `aderDe`, `aderRecs`, `aderMotoristaRecs`, `aderJornada`, `ajColor`.

**Render:** `renderAll`, `renderKpis`, `renderSemana`, `renderAderencia`, `renderTimelines`,
`renderZoom`, `renderDiverg`, `renderTable`, `renderMedia`, `renderSaude`, `renderPlacasSemId`,
`renderBatimento`, `renderFicha`.

**Linha do tempo:** `buildWeekCards`, `buildPlacaCards`, `setupZoom`, `wireZtlDrag`, `timelinesHTML`,
`tlWindow`, `fechamento`, `fechaMin`, `dayFilter`, `activeRange`.

**Ficha / PDF:** `openFicha`, `fichaMetrics`, `fichaPontos`, `planoDeAcao`, `recomendacao`,
`capinha`, `exportFichaPDF`, `exportPainelPDF`, `pdfShell`, `pdfKpi`, `pdfOpen`, `pdfEsc`.

**Importadores:** `readFile`, `decodeText`, `parseCSV`, `splitCSVLine`, `aggAlertas`, `loadAlertas`,
`aggBoletim`, `loadBoletim`, `aggBoletimVeiculo`, `applyBDV`, `loadBoletimVeiculo`, `loadMotoristas`,
`loadSaude`, `aggPedidos`, `loadPedidos`, `loadAbastecimento`, `loadMetas`, `loadXlsxSheet`,
`ingest`, `ingestMovZip`, `ingestTMS`, `finalizeRecords`, `updateDropStatus`.

**Exportação CSV:** `exportCsv`, `exportSemana`, `exportSaude`, `exportMedia`, `exportOperacao`,
`baixarCsv`.

**Microsoft 365 / Graph:** `SP_CFG`, `spMsal`, `spToken`, `gget`, `gpost`, `spHead`, `spGrab`,
`detectTipo`, `spLoadAll`, `spSiteId`, `spEnsureTratList`, `spLoginId`, `spEmail`, `isAdmin`,
`applyDadosGate`.

**Tratativas:** `tratLocalLoad/Save`, `tratKey`, `tratList`, `tratAdd`, `tratSyncFromSP`,
`openTratModal`, `salvarTratativa`, `spSignedIn`, `spGestor`.

**Snapshot:** `snapshotState`, `restoreState`, `gerarSnapshot`, `carregarSnapshotDoLink`,
`mostrarLinkSnapshot`, `_gz/_gunz`, `_b64*`.

**Navegação/tema:** `goTab`, `focusRecord`, `focusPlaca`, `applyTheme`, `bindCfg`.

---

## 17. Guia de manutenção

- **Editar sempre** a versão de trabalho (`../PROJETOS/Dedo Duro/Painel-Ponto-x-Movimentacao-x-Trimble.html`),
  depois `publicar.bat`.
- **Mudar um parâmetro de negócio:** ajuste o padrão em `loadCfg()` (linha ~981) e o input
  correspondente na aba Dados (`bindCfg`).
- **Adicionar um relatório novo:** crie o `agg*/load*`, registre a detecção em `detectTipo`,
  ligue em `spLoadAll` e adicione o slot de import na aba Dados.
- **Ajustar uma regra/flag:** tudo está em `analyze()` (linhas ~989–1095) e no cálculo de
  interjornada em `build()` (~1109–1118).
- **Mexer na linha do tempo:** coleta em `buildWeekCards` (~1317), pintura em `renderZoom` (~1452),
  estilos das faixas no CSS (`.seg.*`, `.lane*`, ~173–200).
- **Testar rápido:** abrir com `?v=<n>` para furar cache; forçar violações no console
  (`CFG.interjornadaMin=900; build(); renderAll();`) e depois restaurar (`=660`).

---

## 18. Pendências e roadmap

- [ ] **TI:** consentimento admin de `Sites.ReadWrite.All` (app `42461f0c`) → habilita leitura de
      relatórios, gravação de tratativas e criação da estrutura de pastas no SharePoint.
- [ ] Após liberação: botão **"Organizar pastas no SharePoint"** e leitura da estrutura
      **Tipo → ano → mês → dia** (pegar o mais recente por tipo).
- [ ] Decisão do **nome do projeto** (sugestões já levantadas).
- [ ] Palavra final para o campo "Fora da jornada" na capinha (alternativa sugerida: "Extrajornada").
- [ ] Refinar interjornada para **jornadas que cruzam a meia-noite**.
- [ ] Opcional: enxugar o `dados.enc` (~16 MB) removendo campos pesados do snapshot.

---

*Documento mantido junto ao código em `integracao-360/DOCUMENTACAO.md`. Ao alterar regras ou
adicionar telas, atualize as seções 6, 7 e 8.*
