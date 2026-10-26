# Regressão — Motoristas, direção contínua e alertas

Execute na raiz, com Node.js 22 ou superior:

```sh
node --test tests/*.test.cjs
```

Os testes usam as funções do próprio `index.html`, sem dependências externas ou dados pessoais reais. O workflow `Regressão Pulso 360` executa o mesmo comando em pushes e pull requests.

## Comportamento

- Tabela, `Exibindo`, indicadores da aba Motoristas e CSV usam o conjunto filtrado e deduplicado. A tabela carrega em blocos e informa quantas linhas já foram carregadas; o CSV inclui todo o conjunto. A exportação fica bloqueada durante novo processamento.
- CPF com pontuação e CPF numérico com zero inicial são normalizados. CPFs diferentes não são unidos por homonímia. Um cadastro sem CPF só é unido a um com CPF quando o nome tem uma única correspondência.
- O filtro de operação na aba Motoristas exige Centro de Resultado do cadastro TMS. Cadastros só no Ponto, sem centro, de outras operações ou com centros conflitantes entre duplicatas ficam fora desse recorte. Sem filtro, continuam acessíveis. Conflitos não são resolvidos por ordem arbitrária de arquivo.
- `Direção contínua ≥ 18h` exige união ininterrupta de intervalos de movimentação no período ativo. Uma lacuna de qualquer duração interrompe a contagem; sobreposições e repetições não somam tempo. A continuidade pode atravessar meia-noite. Depois de identificar o motorista, mantém seus registros dentro do recorte, inclusive os dias sem movimento. Cada aba mantém seu filtro independente.
- Alertas não provam movimento: eventos são preservados e a linha do tempo sinaliza os que não coincidem com os intervalos canônicos da faixa Direção. Eventos com veículo parado podem ser legítimos; dados de movimentação também podem faltar. A conferência é temporal por condutor, não validação de placa quando o snapshot antigo não a contém.
- O mesmo evento da fonte é desenhado uma única vez no grupo da linha do tempo, mesmo que entre em jornadas sobrepostas. Dois eventos de mesma classificação/minuto são preservados se tiverem identidades diferentes. Novas importações retêm a assinatura da linha original, placa e horário, incluindo segundos do CSV.
- Em Dados, a auditoria distingue identidades repetidas e coincidências de minuto/tipo. É limitada aos eventos com horário existentes em `AL_TL` (limite preexistente: 5.000 por motorista). Totais do Boletim e eventos do relatório de Alertas vêm de fontes e granularidades diferentes; não são apresentados como uma reconciliação integral da base.

## Evidências desta alteração

19 testes automatizados locais passaram, incluindo importação síncrona/assíncrona com arquivos sobrepostos, eventos no mesmo minuto com segundos/placas diferentes, worker, filtro global/cache e integração de renderização/indicadores/CSV com DOM simulado.

O teste visual local foi tentado, mas o Chromium do Playwright não está instalado no ambiente. A versão publicada anterior à alteração foi aberta no navegador remoto: carregou 151.621 registros, dados até 21/10/2026, atualização em 21/10/2026 às 12:14 (diferente da base da imagem do usuário). No condutor selecionado, os três períodos de fechamento mostraram 53, 550 e 634 marcadores. Houve respectivamente 26, 236 e 289 marcadores adicionais com título e posição idênticos a outro marcador. São repetições visuais observadas, não uma contagem confirmada de eventos duplicados na fonte: eventos distintos podem coincidir no mesmo minuto. A revisão do código e os testes confirmaram que jornadas sobrepostas podem repetir a referência ao mesmo evento.

Não houve validação visual da alteração no GitHub Pages. A conferência dos eventos originais por ID, placa e segundos ainda é necessária para concluir a quantidade de duplicatas na fonte.

## Conferência na versão publicada após integração

1. Abrir com a base real e selecionar Bitrem. Conferir nomes, Centro de Resultado, indicadores e total do CSV. Rolar a tabela para carregar os demais blocos.
2. Ativar `Direção contínua ≥ 18h`. Conferir trechos de 17h59, 18h e 18h01, virada de dia e intervalos com parada. Trocar período/operação e limpar filtros.
3. Abrir o condutor da imagem e conferir os alertas de 25/09/2026 por ID, data/hora com segundos, placa e tipo no relatório original da Trimble. Comparar as faixas de movimento no mesmo fuso horário.
4. Conferir o diagnóstico em Dados e os avisos `sem movimento correspondente` na linha do tempo. Não tratar uma coincidência de minuto como duplicata confirmada nem um alerta sem movimento como evento necessariamente inválido.

## DSR e evidência de direção em 24h — 26/10/2026

- O DSR usa exclusivamente as datas com batidas na jornada de ponto. Exibe dias com ponto versus dias do período, dias sem marcação, DSR informado no espelho e sequências de sete ou mais dias com ponto. Trinta marcações em trinta dias geram alerta de sequência de trinta dias. Movimentação e duração das pausas não alteram essa conferência.
- Uma data conta apenas uma vez, inclusive com registros duplicados ou jornada noturna. O contexto anterior ao filtro preserva o início da sequência; registros posteriores ao fim do filtro não aumentam a contagem. Batida única conta como dia marcado, mas permanece sinalizada como incompleta.
- Novas importações preservam DSR sem batida em RAW.dsrDays. Dia sem ponto fica como folga a confirmar, sem ser convertido automaticamente em DSR. Férias/afastamentos são separados. DSR indicado no mesmo dia de batida é conflito. O indicador não muda pesos ou descontos da nota.
- O filtro de direção e sua evidência agora usam a mesma rotina. A ficha mostra uma janela representativa com maior acumulado por dia de término, com início, fim, minutos efetivamente dirigidos e botão para localizar a ocorrência. Janelas sobrepostas não são contadas como infrações independentes.
- O destaque vermelho Direção 24h aparece somente na interseção dos trechos de direção da janela com os movimentos canônicos efetivamente desenhados. Paradas, cards sem direção e trechos de até um minuto ocultos na faixa Direção não recebem destaque. O rótulo Σ indica o acumulado da janela completa; a ficha mantém início e fim dessa janela. Zoom e troca de semana recortam os trechos; o botão prioriza o card com movimento real.
- Referências de critério consultadas: CLT arts. 66/67 e 235-D; ADI 5322/STF; OJ 410/TST. O indicador oferece conferência operacional, sem presumir aplicação de convenção coletiva específica ou cálculo de valores devidos.

## Identidade por CPF — 26/10/2026

- Jornada preserva o CPF e o nome original, resolve o nome de exibição pelo cadastro TMS e deduplica jornadas pela identidade/documento. O vínculo temporal da movimentação com a jornada usa essa identidade, inclusive nos parsers objeto, CSV síncrono e assíncrono.
- Alertas, Boletim e abastecimento preservam CPF/aliases e passam pelo mesmo resolvedor. O cadastro de motorista exige correspondência de CPF no worker e no fallback. Multas com CPF explícito divergente não são atribuídas pela grafia. Nomes semelhantes não geram vínculo; CPF inválido, ausente ou ambíguo permanece pendente. Um alias exato já comprovado em uma fonte pode resolver o CPF.
- A abertura da base existente consolida aliases por CPF conhecido e reanalisa os registros. Ponto já carregado pode ser reaproveitado em movimentação da mesma data/CPF quando existe jornada única ou sobreposição temporal sem empate. Não desloca jornadas entre datas por aproximação. A importação nova mantém o cruzamento temporal noturno original com CPF.
- O caso real JONATHAN/JONATAHN SILVA SANTOS teve CPF igual confirmado: 103 registros reunidos no nome TMS; 45 dos 52 registros com movimento recuperaram o ponto da data; preservados 51 dias de ponto, a quantidade de registros e os eventos de alertas. Dias sem ponto correspondente continuam pendentes.
- Metadados de CPF/alias ficam no snapshot para as próximas aberturas. Se uma base antiga não reteve CPF ou alias comprovado, a vinculação exige reimportar a fonte com o documento; o nome não é corrigido por similaridade.
- O valor principal do KPI DSR passa a mostrar dias sem marcação para conferência (dias do período menos dias com ponto e férias/afastamentos identificados). Exemplo: 24/30 dias com ponto apresenta 6, separando os DSRs informados no espelho dos dias a confirmar. Sem fonte de ponto, mantém indisponível.
