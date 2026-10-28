const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function source(name){const i=html.indexOf('function '+name+'(');assert.notEqual(i,-1,name);const tail=html.slice(i),next=tail.slice(1).search(/\n(?:function |async function |let |const |\/\*)/);return next<0?tail:tail.slice(0,next+1);}
function ctx(){const c=vm.createContext({console,Set,Map,Date,Math,Number,String});for(const n of ['norm','alertaEhVelocidade','alertaEhSemIdentificacaoMotorista','resumoSemAlertaIdentificacao','rankAlertSummary'])vm.runInContext(source(n),c);vm.runInContext(html.split('// BEGIN SPEED SCORE HELPERS')[1].split('// END SPEED SCORE HELPERS')[0],c);Object.assign(c,{AL_TL:null,BOL_DAY:null,activeRange:()=>null,alertasResumo:()=>({total:0,tipos:{}})});return c;}
const recs=[{data:'2026-10-21',mov:[{ini:0,fim:600}]}];
const ev=(v,extra={})=>['2026-10-21',100,'A','EXCESSO_VELOCIDADE',{velocidadeKmh:v,...extra}];
test('faixas informativas do KPI respeitam 80/90/100, sem alterar a nota',()=>{
  const c=ctx();vm.runInContext(source('faixaVelocidadeKpi'),c);
  for(const [kmh,key] of [[79.9,'abaixo80'],[80,'de80a89'],[89.9,'de80a89'],[90,'de90a99'],[99.9,'de90a99'],[100,'de100Mais'],[140,'de100Mais'],[null,'semKmh'],['90/80','semKmh']])assert.equal(c.faixaVelocidadeKpi(kmh),key);
  assert.equal(c.descontoVelocidade(90),5);assert.equal(c.descontoVelocidade(99),15);
});
test('KPI separa velocidade real por faixa e período; gravidade Trimble não define km/h',()=>{
  const c=ctx();for(const n of ['faixaVelocidadeKpi','aplicaResumoVelocidade','fichaVelocidadeFaixasHtml'])vm.runInContext(source(n),c);
  c.AL_TL={JOAO:[ev(80),ev(89.9),ev(90),ev(99.9),ev(100),ev(120),ev(79.9),ev(null),['2026-10-22',0,'A','EXCESSO_VELOCIDADE',{velocidadeKmh:120}],['2026-10-21',0,'A','CELULAR',{velocidadeKmh:120}]]};
  const v=c.aplicaResumoVelocidade('JOAO',{de:'2026-10-21',ate:'2026-10-21'},{total:10,tipos:{EXCESSO_VELOCIDADE:9,CELULAR:1}});
  assert.equal(v.velocidade.total,8);assert.equal(v.tipos['Excesso Velocidade'],8);
  assert.equal(v.velocidade.faixas.de80a89,2);assert.equal(v.velocidade.faixas.de90a99,2);assert.equal(v.velocidade.faixas.de100Mais,2);
  assert.equal(v.velocidade.faixas.abaixo80,1);assert.equal(v.velocidade.faixas.semKmh,1);
  const rendered=c.fichaVelocidadeFaixasHtml(v.velocidade);
  for(const label of ['80–89 km/h','90–99 km/h','≥100 km/h','abaixo de 80 km/h','sem km/h informado'])assert.ok(rendered.includes(label),label);
  assert.match(source('renderFicha'),/alertaEhVelocidade\(tp\)\?fichaVelocidadeFaixasHtml\(velR\)/);
});
test('boletim agregado sem pico por evento não inventa quantidades por faixa',()=>{
  const c=ctx();for(const n of ['faixaVelocidadeKpi','aplicaResumoVelocidade','fichaVelocidadeFaixasHtml'])vm.runInContext(source(n),c);
  c.AL_TL=null;
  const v=c.aplicaResumoVelocidade('JOAO',null,{total:3144,tipos:{'Excesso Velocidade':3144}});
  assert.equal(v.velocidade.total,3144);assert.equal(v.velocidade.faixas,null);
  const s=c.fichaVelocidadeFaixasHtml(v.velocidade);assert.match(s,/Faixas por km\/h indisponíveis/);
  assert.doesNotMatch(s,/speed-bin/);
});
test('faixas 85/86/90/91/98/99 com desconto de no máximo 15%',()=>{const c=ctx();for(const [v,p] of [[0,0],[85,0],[85.9,0],[86,5],[90,5],[90.5,10],[91,10],[98,10],[98.1,15],[99,15],[150,15]])assert.equal(c.descontoVelocidade(v),p);});
test('km/h aceita decimais brasileiros e rejeita valor ausente/limite textual',()=>{const c=ctx();for(const v of ['',null,undefined,'ALTO','90/80',-1,301])assert.equal(c.velocidadeKmh(v),null);assert.equal(c.velocidadeKmh('98,5 km/h'),98.5);});
test('coluna prioriza máxima registrada e nunca escolhe velocidade permitida/da via/média',()=>{const c=ctx();assert.equal(c.colunaVelocidade(['Velocidade permitida','Velocidade média','Velocidade máxima registrada']),2);assert.equal(c.colunaVelocidade(['Velocidade da via','Limite de velocidade']),-1);assert.equal(c.colunaVelocidade(['TIPO','Velocidade']),1);});
test('maior faixa é única, respeita período, ignora alertas alheios e deduplica ID',()=>{const c=ctx();c.AL_TL={JOAO:[ev(88,{key:'a'}),ev(95,{key:'b'}),ev(95,{key:'b'}),['2026-10-22',0,'A','EXCESSO_VELOCIDADE',{velocidadeKmh:120}],['2026-10-21',0,'A','CELULAR',{velocidadeKmh:120}]]};const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.penaltyPct,10);assert.equal(v.maxKmh,95);assert.equal(v.total,2);assert.equal(v.pending,false);});
test('base antiga sem km/h fica pendente sem converter severidade em faixa',()=>{const c=ctx();c.AL_TL={JOAO:[ev(null),['2026-10-21',101,'B','EXCESSO_VELOCIDADE']]};const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.unknown,2);assert.equal(v.penaltyPct,0);assert.equal(v.pending,true);assert.match(c.speedScoreText({velocidade:v}),/classificação pendente/);});
test('dados mistos aplicam maior faixa conhecida e preservam aviso de pendência',()=>{const c=ctx();c.AL_TL={JOAO:[ev(89),ev(null)]};const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.penaltyPct,5);assert.equal(v.pending,true);});
test('alertas para nota excluem velocidade do total, dos tipos e das severidades',()=>{const c=ctx();c.AL_TL={JOAO:[ev(110),['2026-10-21',101,'M','CELULAR'],['2026-10-21',102,'B','FADIGA']]};const a=c.rankAlertSummary('JOAO',recs);assert.equal(a.total,2);assert.equal(a.niveis.ALTO,undefined);assert.equal(a.niveis.MEDIO,1);assert.equal(a.niveis.BAIXO,1);assert.equal(a.tipos.EXCESSO_VELOCIDADE,undefined);assert.equal(c.AL_TL.JOAO.length,3);});
test('boletim e fallback agregado também excluem velocidade sem alterar fonte',()=>{const c=ctx();c.BOL_DAY={JOAO:{'2026-10-21':{t:5,tipos:{EXCESSO_VELOCIDADE:3,CELULAR:2}}}};assert.equal(c.rankAlertSummary('JOAO',recs).total,2);assert.equal(c.rankSpeedSummary('JOAO',recs).unknown,3);const a={total:5,tipos:{EXCESSO_VELOCIDADE:3,CELULAR:2},niveis:{ALTO:5}},b=c.rankWithoutSpeed(a);assert.equal(b.total,2);assert.equal(Object.keys(b.niveis).length,0);assert.equal(a.total,5);});
function scoreContext(){const c=ctx();for(const n of ['rankClamp','_rankScoreProfiles'])vm.runInContext(source(n),c);Object.assign(c,{ALERTS:{},BOL:null,MULTAS_N:1,MEDIA_OFF:false,BASES:{ponto:true},ALERT_CAP:150,MULTA_CAP:2,ALERT_TETO_TAXA:100,ALERT_TETO_NOTA:60});return c;}
const profile=pct=>({identMot:80,identCam:80,ajPonto:80,interjScore:80,extraScore:80,mediaScore:80,alertRate:30,multaRate:0.4,idDiv:0,velocidade:{penaltyPct:pct,maxKmh:pct===5?88:pct===10?95:105,unknown:0,pending:false}});
test('velocidade compõe 20%: outros componentes com nota 8 compõem 6,4 mais velocidade',()=>{const c=scoreContext();for(const [pct,expected] of [[0,84],[5,64+20*2/3],[10,64+20/3],[15,64]]){const p=profile(pct);c._rankScoreProfiles({JOAO:p});near(p.score,expected);near(p.components.reduce((s,x)=>s+x.w,0),100);assert.equal(p.components.find(x=>x.k==='velocidade').w,20);assert.equal(p.speedPenaltyPoints,0);}});
test('hora extra removida da nota; aderência depende só de jornada e ponto',()=>{
 const c=scoreContext(),a=profile(0),b=profile(0);
 a.extraScore=0;b.extraScore=100;a.ajPonto=94;b.ajPonto=94;
 c._rankScoreProfiles({A:a,B:b});near(a.score,b.score);
 assert.equal(a.components.some(x=>x.k==='extra'),false);
 assert.equal(a.components.find(x=>x.k==='jornada').v,94);
 assert.equal(a.components.find(x=>x.k==='jornada').w,20);
});
test('nomenclatura de identificação não modifica pesos ou pontuação',()=>{const c=scoreContext(),a=profile(0),b=profile(0);a.identCam=0;b.identCam=100;c._rankScoreProfiles({A:a,B:b});near(a.score,b.score);const comp=a.components.find(x=>x.k==='identMot');assert.equal(comp.lab,'Aderência de identificação e verificação do equipamento');near(comp.w,15);assert.ok(!a.components.some(x=>x.k==='identCam'));});
test('média informativa não altera classificação ou elegibilidade',()=>{
 const c=scoreContext(),a=profile(0),b=profile(0),d=profile(0);
 a.mediaScore=0;b.mediaScore=100;d.mediaScore=null;
 c._rankScoreProfiles({A:a,B:b,C:d});near(a.score,b.score);near(b.score,d.score);
 assert.ok(!a.components.some(x=>x.k==='media'));
 assert.doesNotMatch(source('resumoRankMelhorElegivel'),/if\(!MEDIA_OFF && p.media==null\)/);
 assert.match(html,/informativo · não compõe nota/);
});
test('divergência de condutor não reduz nota e nenhum desconto aparece no scorecard',()=>{const c=scoreContext(),a=profile(0),b=profile(0);a.idDiv=10;c._rankScoreProfiles({A:a,B:b});near(a.score,b.score);assert.doesNotMatch(source('renderScorecard'),/penal10/);assert.doesNotMatch(source('renderScorecardLight'),/penal10/);});
test('identificação 15% e multas 5% influenciam o score independentemente',()=>{
  const c=scoreContext(),a=profile(0),b=profile(0),d=profile(0);
  a.identMot=100;a.multaRate=0;
  b.identMot=0;b.multaRate=0;
  d.identMot=100;d.multaRate=2;
  c._rankScoreProfiles({A:a,B:b,D:d});
  const weight=Object.fromEntries(a.components.map(z=>[z.k,z.w]));
  near(weight.identMot,15);near(weight.multas,5);
  near(a.score-b.score,15);
  near(a.score-d.score,5);
  near(a.components.reduce((sum,z)=>sum+z.w,0),100);
});
test('cobertura da câmera não entra na nota e não altera o score ao variar de zero a 100',()=>{
  const c=scoreContext(),p0=profile(0),p100=profile(0),pMissing=profile(0);
  p0.identCam=0;p100.identCam=100;pMissing.identCam=null;
  c._rankScoreProfiles({ZERO:p0,COMPLETA:p100,AUSENTE:pMissing});
  for(const p of [p0,p100,pMissing]){
    assert.equal(p.components.some(x=>x.k==='identCam'),false);
    near(p.components.reduce((sum,x)=>sum+x.w,0),100);
    assert.ok(p.components.find(x=>x.k==='velocidade'));
    assert.ok(p.components.find(x=>x.k==='identMot'));
  }
  near(p0.score,p100.score);near(p100.score,pMissing.score);
  assert.equal(p0.identCam,0);assert.equal(p100.identCam,100);
  const lower=profile(0);lower.identMot=0;c._rankScoreProfiles({OTHER:lower});
  assert.ok(lower.score<p100.score,'identificação do próprio motorista continua compondo a nota');
});
test('pesos não incluem cobertura e WebView rejeita nota antiga pré-calculada',()=>{
  const s=source('_rankScoreProfiles');
  assert.doesNotMatch(s,/add\('identCam'/);
  assert.match(s,/add\('identMot'/);
  assert.match(html,/scoreRulesVersion:6/);
  assert.match(source('_loadPublishedWebview'),/data.scoreRulesVersion!==2&&data.scoreRulesVersion!==3&&data.scoreRulesVersion!==4&&data.scoreRulesVersion!==5&&data.scoreRulesVersion!==6/);
  assert.match(html,/identCam=aderRecs\(recs\)/);
  assert.doesNotMatch(html,/câmera \(5%\)/);
});
test('divergência não aplica desconto e recálculo mantém a mesma nota',()=>{const c=scoreContext(),p=profile(15);p.idDiv=1;c._rankScoreProfiles({JOAO:p});near(p.scoreBeforeSpeed,64);near(p.score,64);c._rankScoreProfiles({JOAO:p});near(p.score,64);});
test('só velocidade não aciona teto de outros alertas nem é removida da timeline',()=>{const c=ctx();c.AL_TL={JOAO:Array.from({length:50},()=>ev(110))};const a=c.rankAlertSummary('JOAO',recs);assert.equal(a.total,0);assert.equal(c.rankSpeedSummary('JOAO',recs).penaltyPct,15);assert.equal(c.AL_TL.JOAO.length,50);});
test('importações síncrona e assíncrona preservam km/h e ignoram limite da via',async()=>{const c=ctx();for(const n of ['splitCSVLine','rowSigCells','_dedupeCell','_dedupeSig','dedupeAccept','placaKey','tipoPareceCpf','toMin'])vm.runInContext(source(n),c);Object.assign(c,{isoDate:x=>x,splitDT:x=>({date:x,time:''}),weekInfo:()=>({key:'2026-10-19'}),uoCurta:x=>x,uiYield:async()=>{}});vm.runInContext(html.slice(html.indexOf('function aggAlertas('),html.indexOf('function placaKey(')),c);const csv='MOTORISTA;TIPO;NIVEL;DATA;HORA;PLACA;Velocidade permitida;Velocidade máxima\nJOAO;EXCESSO_VELOCIDADE;ALTO;2026-10-21;10:00:00;ABC1D23;80;95,5\n';for(const fn of [c.aggAlertas,c.aggAlertasAsync]){const a=await fn(csv,null,new Set(),{});assert.equal(a.tl.JOAO[0][4].velocidadeKmh,95.5);} });
test('maior velocidade após 5 mil eventos não é descartada pela importação',async()=>{const c=ctx();for(const n of ['splitCSVLine','rowSigCells','_dedupeCell','_dedupeSig','dedupeAccept','placaKey','tipoPareceCpf','toMin'])vm.runInContext(source(n),c);Object.assign(c,{isoDate:x=>x,splitDT:x=>({date:x,time:''}),weekInfo:()=>({key:'2026-10-19'}),uoCurta:x=>x,uiYield:async()=>{}});vm.runInContext(html.slice(html.indexOf('function aggAlertas('),html.indexOf('function placaKey(')),c);const csv='MOTORISTA;TIPO;NIVEL;DATA;HORA;PLACA;VELOCIDADE;ID\n'+Array.from({length:5001},(_,i)=>'JOAO;EXCESSO_VELOCIDADE;ALTO;2026-10-21;10:00:00;ABC1D23;'+(i===5000?105:88)+';'+i).join('\n');for(const fn of [c.aggAlertas,c.aggAlertasAsync]){const a=await fn(csv,null,new Set(),{});assert.equal(a.tl.JOAO.length,5001);assert.equal(a.tl.JOAO[5000][4].velocidadeKmh,105);}});
test('grave começa em 100 km/h: 99 e 99,9 não contam; 100 conta',()=>{const c=ctx();c.AL_TL={JOAO:[ev(99),ev(99.9),ev(100)]};const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.graveCount,1);assert.equal(v.recurrencePct,0);assert.equal(v.penaltyPct,15);});
test('reincidência exige três eventos distintos no período e não acumula 30% por ocorrência',()=>{const c=ctx();c.AL_TL={JOAO:[ev(100,{key:'a'}),ev(100,{key:'a'}),ev(110,{key:'b'}),['2026-10-22',0,'A','EXCESSO_VELOCIDADE',{key:'fora',velocidadeKmh:120}]]};let v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.graveCount,2);assert.equal(v.recurrencePct,0);c.AL_TL.JOAO.push(ev(120,{key:'c'}));v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.graveCount,3);assert.equal(v.recurrencePct,30);c.AL_TL.JOAO.push(ev(130,{key:'d'}));assert.equal(c.rankSpeedSummary('JOAO',recs).recurrencePct,50);});
test('reincidência de 30% incide sobre a nota 6,4 e recálculo é idempotente',()=>{const c=scoreContext(),p=profile(15);p.velocidade.graveCount=3;c._rankScoreProfiles({JOAO:p});near(p.scoreBeforeSpeed,64);assert.equal(p.speedPenaltyPoints,0);near(p.scoreBeforeRecurrence,64);assert.equal(p.speedRecurrencePct,30);near(p.speedRecurrencePoints,19.2);near(p.score,44.8);c._rankScoreProfiles({JOAO:p});near(p.score,44.8);});
test('duas graves afetam só velocidade, sem desconto adicional',()=>{const c=scoreContext(),p=profile(15);p.velocidade.graveCount=2;c._rankScoreProfiles({JOAO:p});near(p.score,64);near(p.speedRecurrencePoints,0);c.AL_TL={JOAO:[ev(null),ev(null),ev(null)]};const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.graveCount,0);assert.equal(v.recurrencePct,0);assert.equal(v.pending,true);});
test('reincidência vem após teto de alertas e divergência não gera desconto',()=>{const c=scoreContext(),p=profile(15);p.idDiv=1;p.velocidade.graveCount=4;p.alertRate=120;c._rankScoreProfiles({JOAO:p});near(p.scoreBeforeRecurrence,p.scoreBeforeSpeed);assert.ok(Math.abs(p.score-p.scoreBeforeRecurrence*0.5)<1e-10);p.alertRate=0;p.idDiv=0;p.velocidade.graveCount=0;c._rankScoreProfiles({JOAO:p});assert.equal(p.alertTeto,false);assert.equal(p.alertCapPoints,0);assert.equal(p.speedRecurrencePct,0);near(p.speedRecurrencePoints,0);});
test('scorecard exibe reincidência e base do desconto antes da nota final',()=>{const start=html.indexOf('const totalHtml=`<div class="sc-total">'),end=html.indexOf('\n',start),row=html.slice(start,end);assert.ok(row.indexOf('Reincidência grave')<row.indexOf('Nota final'));assert.match(row,/speedRecurrencePct}% sobre a nota restante/);assert.match(row,/speedRecurrencePoints\/10/);});

test('quatro ou mais graves descontam 50% após pontuação com velocidade 20%',()=>{const c=scoreContext();for(const count of [4,5,10]){const p=profile(15);p.velocidade.graveCount=count;c._rankScoreProfiles({JOAO:p});near(p.scoreBeforeRecurrence,64);assert.equal(p.speedRecurrencePct,50);near(p.speedRecurrencePoints,32);near(p.score,32);c._rankScoreProfiles({JOAO:p});near(p.score,32);}});
test('tabela de reincidência: 0–2 sem extra, 3 com 30%, 4+ com 50%',()=>{const c=ctx();for(const [n,pct] of [[0,0],[1,0],[2,0],[3,30],[4,50],[5,50]])assert.equal(c.descontoReincidencia(n),pct);});
test('leiaute real Trimble: EXCESSO é km/h do evento e LIMIAR não é velocidade atingida',async()=>{const c=ctx();for(const n of ['splitCSVLine','rowSigCells','_dedupeCell','_dedupeSig','dedupeAccept','placaKey','tipoPareceCpf','toMin'])vm.runInContext(source(n),c);Object.assign(c,{isoDate:x=>x,splitDT:x=>({date:x,time:''}),weekInfo:()=>({key:'2026-10-19'}),uoCurta:x=>x,uiYield:async()=>{}});vm.runInContext(html.slice(html.indexOf('function aggAlertas('),html.indexOf('function placaKey(')),c);const csv='PLACA;MOTORISTA;TIPO;NIVEL;RÓTULO;LIMIAR;EXCESSO;DURACAO;DATA;HORA;ALERTA DESCONSIDERADO\nABC1D23;JOAO;EXCESSO_VELOCIDADE;BAIXO;-;81 Km/h;92 Km/h;00:00:11;2026-10-21;10:00:00;Não\nABC1D23;JOAO;EXCESSO_VELOCIDADE;BAIXO;-;81 Km/h;86 Km/h;00:00:16;2026-10-21;10:01:00;Não\nABC1D23;JOAO;EXCESSO_VELOCIDADE;ALTO;-;81 Km/h;101 Km/h;00:00:16;2026-10-21;10:02:00;Sim\n';for(const fn of [c.aggAlertas,c.aggAlertasAsync]){const a=await fn(csv,null,new Set(),{});assert.equal(a.n,2);assert.equal(a.tl.JOAO[0][4].velocidadeKmh,92);assert.equal(a.tl.JOAO[0][4].velocidadeFonte,'EXCESSO');assert.equal(a.tl.JOAO[1][4].velocidadeKmh,86);c.AL_TL=a.tl;const v=c.rankSpeedSummary('JOAO',recs);assert.equal(v.penaltyPct,10);assert.equal(v.graveCount,0);}});
test('coluna EXCESSO como fallback nunca seleciona LIMIAR e mantém prioridade de velocidade explícita',()=>{const c=ctx();assert.equal(c.colunaVelocidade(['TIPO','NIVEL','LIMIAR','EXCESSO','DURACAO']),3);assert.equal(c.colunaVelocidade(['TIPO','LIMIAR','EXCESSO','Velocidade máxima']),3);assert.equal(c.colunaVelocidade(['TIPO','LIMIAR']),-1);});

function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,actual+' ≈ '+expected);}
function cardContext(){const c=ctx();for(const n of ['scEsc','scFmt','scSpeedCard','scSpeedSnapshot'])vm.runInContext(source(n),c);return c;}
test('cartão distingue ocorrência, ausência e falta de dados sem declarar ausência em base antiga',()=>{const c=cardContext();for(const [v,status,label] of [[{total:0,known:0,unknown:0},'clear','Sem ocorrência'],[{total:2,known:2,maxKmh:95,penaltyPct:10},'occurrence','Com ocorrência'],[{total:2,known:0,unknown:2,pending:true},'occurrence','Pendente de classificação'],[null,'pending','Não apurado'],[{total:0,available:false},'pending','Não apurado']]){const out=c.scSpeedCard({velocidade:v});assert.match(out,new RegExp('data-speed-status="'+status+'"'));assert.ok(out.includes(label));if(status==='pending'||v&&v.pending)assert.ok(!out.includes('Sem ocorrência de velocidade'));}});
test('cartão velocidade exibe peso 20% e reincidência sobre o saldo final',()=>{const c=cardContext(),z=scoreContext(),p=profile(15);p.velocidade.total=4;p.velocidade.known=4;p.velocidade.graveCount=4;z._rankScoreProfiles({JOAO:p});const out=c.scSpeedCard(p);for(const str of ['+0,0 de 2,0 pts','105 km/h','peso <b>20%</b>','reincidência: 50% sobre a nota calculada','−3,2 pts'])assert.ok(out.includes(str),str);near(p.score,32);});
test('base leve preserva valores e deduções com os novos pesos',()=>{const c=cardContext(),z=scoreContext(),p=profile(15);p.velocidade.total=3;p.velocidade.known=3;p.velocidade.graveCount=3;z._rankScoreProfiles({JOAO:p});const light=JSON.parse(JSON.stringify(c.scSpeedSnapshot(p)));assert.equal(c.scSpeedCard(light),c.scSpeedCard(p));near(light.speedRecurrencePoints,19.2);near(light.scoreBeforeRecurrence,64);assert.match(source('_buildWebviewPayload'),/scSpeedSnapshot\(p\)/);});
test('painel e webview inserem indicador próprio junto aos alertas e exibem descontos no fechamento',()=>{for(const n of ['renderScorecard','renderScorecardLight']){const f=source(n);assert.match(f,/speedIndex=comps.findIndex\(c=>c.k==='alertas'\)/);assert.match(f,/compCards.splice\(speedIndex<0\?0:speedIndex\+1,0,scSpeedCard\(/);assert.doesNotMatch(f,/speedPenaltyPoints\/10/);assert.match(f,/speedRecurrencePoints\/10/);}});

test('pesos 20/20/20/20/15/5 e velocidade fixa quando outros faltam',()=>{const c=scoreContext(),p=profile(5);c._rankScoreProfiles({JOAO:p});const w=Object.fromEntries(p.components.map(z=>[z.k,z.w]));for(const k of ['jornada','alertas','interj','velocidade'])near(w[k],20);near(w.identMot,15);near(w.multas,5);near(Object.values(w).reduce((sum,v)=>sum+v,0),100);p.identMot=null;c._rankScoreProfiles({JOAO:p});near(p.components.find(x=>x.k==='velocidade').w,20);near(p.components.filter(x=>x.k!=='velocidade').reduce((sum,x)=>sum+x.w,0),80);});
test('velocidade sem km/h é retirada da nota sem virar zero',()=>{const c=scoreContext(),p=profile(0);p.velocidade={available:true,total:3,known:0,unknown:3,pending:true,graveCount:0};c._rankScoreProfiles({JOAO:p});near(p.score,80);assert.equal(p.speedPending,true);assert.ok(!p.components.some(x=>x.k==='velocidade'));});
test('sem excesso contribui 2 pontos e faixas preservam deduplicação',()=>{const c=scoreContext();c.AL_TL={JOAO:[]};const p=profile(0);p.velocidade=c.rankSpeedSummary('JOAO',recs);c._rankScoreProfiles({JOAO:p});near(p.score,84);c.AL_TL.JOAO=[ev(88),ev(88),ev(88)];p.velocidade=c.rankSpeedSummary('JOAO',recs);c._rankScoreProfiles({JOAO:p});near(p.score,64+20*2/3);assert.equal(p.speedRecurrencePct,0);});
test('webview antigo retém identidade e oculta nota de pacote anterior',()=>{const load=source('_loadPublishedWebview');assert.match(load,/MOBILE_LEGACY=data.scoreRulesVersion!==6/);assert.match(source('renderScorecardLight'),/Nota aguardando atualização/);assert.match(html,/WebView não usa o snapshot de 1 GB/);assert.match(source('_buildWebviewPayload'),/scoreRulesVersion:6/);});
