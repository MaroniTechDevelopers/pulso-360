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

- A ficha acrescenta DSR ao lado da interjornada, com quantidade, origem e datas. Pausas contínuas de pelo menos 35h são indícios operacionais, sem somar intervalos separados ou multiplicar pausas longas. Ponto e movimentação interrompem a pausa. Férias, afastamentos e batidas incompletas identificados ficam fora dos candidatos.
- Novas importações de Jornada preservam os dias do espelho, incluindo linhas de DSR sem batida, em RAW.dsrDays. Um descanso marcado requer pausa compatível e cobertura diária para aparecer como registrado e conferido. Bases antigas sem esses metadados permanecem inconclusivas, mesmo quando exibem pausas indicativas. A análise não certifica remuneração ou conformidade integral.
- Sinaliza DSR marcado com trabalho/movimentação e sequências de sete ou mais dias com trabalho registrado. Usa todo o histórico do condutor para preservar contexto antes do filtro e descarta dias de férias conhecidos. Sem registros não significa descanso. Não muda os pesos ou descontos da nota.
- O filtro de direção e sua evidência agora usam a mesma rotina. A ficha mostra uma janela representativa com maior acumulado por dia de término, com início, fim, minutos efetivamente dirigidos e botão para localizar a ocorrência. Janelas sobrepostas não são contadas como infrações independentes.
- A faixa vermelha Direção 24h representa a janela de análise, incluindo as pausas; a faixa Direção original continua representando apenas movimento. Ambas acompanham zoom e recorte. Janelas que atravessam uma semana aparecem nas duas partes pertinentes.
- Referências de critério consultadas: CLT arts. 66/67 e 235-D; ADI 5322/STF; OJ 410/TST. O indicador oferece conferência operacional, sem presumir aplicação de convenção coletiva específica ou cálculo de valores devidos.
