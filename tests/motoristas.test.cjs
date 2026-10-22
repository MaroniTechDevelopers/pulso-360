const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
// Extract named functions from the shipped HTML, preserving regexes/template strings
// by finding the next top-level declaration (the page keeps declarations at column 0).
function source(name){const start=html.indexOf('function '+name+'(');assert.notEqual(start,-1,name);const rest=html.slice(start);const next=rest.slice(1).search(/\n(?:function |async function |let |const |\/\*)/);return next<0?rest:rest.slice(0,next+1);}
function context(){
 const c=vm.createContext({console,Set,Map,Date,Number,String,Math});
 const names=['norm','cpfKey','opFamily','classMotCad','motCadPassClass','classMotLabel','cpfCurto','_motorWorkerCode','matchPontoCad'];
 for(const name of ['OP_FAMILIAS','OP_CANON','OP_NAOOP'])vm.runInContext(html.match(new RegExp('^const '+name+'=.*$','m'))[0],c);
 for(const name of names)vm.runInContext(source(name),c);
 vm.runInContext("function cpfDeNome(){return '';} function nomeCanon(n){return norm(n);}",c);
 vm.runInContext(html.split('// BEGIN DRIVER FILTER HELPERS')[1].split('// END DRIVER FILTER HELPERS')[0].replace(' — also exercised directly by regression tests.',''),c);
 return c;
}
const row=(extra={})=>({nome:'JOAO SILVA',cpf:'123.456.789-01',centro:'BITREM - SP',status:'ATIVO',ponto:true,dias:1,ultimo:'2026-10-22',classif:'ATIVO_PONTO',soPonto:false,...extra});
const rec=(extra={})=>({motoristaEscala:'JOAO SILVA',cpf:'12345678901',data:'2026-10-22',mov:[{ini:0,fim:1080}],...extra});
test('deduplica CPF formatado, preserva homônimos e não altera entrada',()=>{const c=context(),a=row(),b=row({cpf:'12345678901'}),d=row({cpf:'99988877766'});const out=c.dedupeMotoristas([a,b,d]);assert.equal(out.length,2);assert.equal(a.cpf,'123.456.789-01');});
test('cadastro sem CPF só é unido quando nome identifica CPF único',()=>{const c=context();assert.equal(c.dedupeMotoristas([row({cpf:''}),row(),row({cpf:'12345678901'})]).length,1);assert.equal(c.dedupeMotoristas([row({cpf:''}),row(),row({cpf:'99988877766'})]).length,3);});
test('troca sem CPF seguida de CPF não deixa duplicata reaparecer',()=>{const c=context();assert.equal(c.dedupeMotoristas([row({cpf:''}),row(),row({cpf:'12345678901',nome:'JOÃO SILVA'})]).length,1);});
test('Bitrem exclui sem CR, outra operação e cadastro só no ponto',()=>{const c=context();const rs=[row(),row({cpf:'22233344455',centro:''}),row({cpf:'33344455566',centro:'MERCADO LIVRE'}),row({cpf:'44455566677',soPonto:true})];assert.equal(c.selectMotoristas(rs,{op:'BITREM'}).length,1);assert.equal(c.selectMotoristas(rs).length,4);});
test('CR conflitante entre duplicatas não vaza para operação',()=>{const c=context();assert.equal(c.selectMotoristas([row(),row({centro:'MERCADO LIVRE'})],{op:'BITREM'}).length,0);});
test('filtros locais e indicadores usam conjunto único selecionado',()=>{const c=context();const rows=c.selectMotoristas([row(),row(),row({cpf:'99988877766',status:'INATIVO',classif:'INATIVO_PONTO'})],{f:'ATIVOS',q:'JOAO'});const sm=c.motoristasSummary(rows);assert.equal(rows.length,1);assert.equal(sm.totalTms,1);assert.equal(sm.ativos,1);assert.equal(sm.comP,1);});
test('18h inclui limite exato e mais, exclui 17h59 e ausência de movimento',()=>{const c=context();assert.equal(c.filterContinuousDrivers([rec()],1080).length,1);assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:1079}]})],1080).length,0);assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:1200}]})],1080).length,1);assert.equal(c.filterContinuousDrivers([rec({mov:[]})],1080).length,0);});
test('não soma trechos separados, duplicados ou sobrepostos',()=>{const c=context();assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:600},{ini:601,fim:1201}]})],1080).length,0);assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:600},{ini:0,fim:600}]})],1080).length,0);assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:600},{ini:500,fim:1080}]})],1080).length,1);});
test('continuidade atravessa meia-noite e respeita recorte de datas',()=>{const c=context();const rs=[rec({data:'2026-10-21',mov:[{ini:720,fim:1440}]}),rec({mov:[{ini:0,fim:360}]})];assert.equal(c.filterContinuousDrivers(rs,1080).length,2);assert.equal(c.filterContinuousDrivers(rs,1080,{de:'2026-10-22',ate:'2026-10-22'}).length,0);});
test('CPFs diferentes não acumulam direção por homonímia; inválidos são ignorados',()=>{const c=context();assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:600}]}),rec({cpf:'99988877766',mov:[{ini:600,fim:1200}]})],1080).length,0);assert.equal(c.filterContinuousDrivers([rec({mov:[{ini:0,fim:1500},{ini:null,fim:1080}]})],1080).length,0);});
test('worker e fallback não associam ponto de CPF diferente por nome',()=>{const c=context(),cad=row({cpf:'99988877766'}),pt={key:'C:12345678901',nome:cad.nome,cpf:'12345678901',nn:cad.nome,cn:cad.nome,dias:1};assert.equal(c.matchPontoCad(cad,{byCpf:{},byName:{[cad.nome]:pt},canonCount:{[cad.nome]:1},byCanon:{[cad.nome]:pt}}),null);let out;c.self={postMessage:r=>out=r};vm.runInContext(c._motorWorkerCode(),c);c.self.onmessage({data:{cads:[{...cad,nn:cad.nome,cn:cad.nome}],pts:[pt]}});assert.equal(out.rows.find(r=>r.cpf===cad.cpf).ponto,false);});
test('alertas sem movimento são preservados e sinalizados; fronteira final é exclusiva',()=>{const c=context(),alerts=[{t:59,tipo:'CELULAR'},{t:60},{t:120},{t:200}];const out=c.validateTimelineAlerts(alerts,[{a:60,b:120}]);assert.equal(out.length,4);assert.deepEqual(Array.from(out,a=>a.movimentoConfirmado),[false,true,false,false]);assert.equal(c.validateTimelineAlerts(alerts,[]).filter(a=>a.movimentoConfirmado).length,0);});
test('scripts inline publicados têm sintaxe válida',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim())new vm.Script(m[1]);}});
test('render, indicadores e CSV compartilham conjunto; exportação bloqueia durante processamento',async()=>{
 const c=context();const els=Object.fromEntries(['motCadBody','motCadSummary','motCadClass','motCadBusca','fOp','fMot','fBusca','fDirecao','expMotoristas'].map(k=>['#'+k,{value:'',innerHTML:'',dataset:{},disabled:false}]));
 els['#fOp'].value='BITREM';let rendered,csv;
 Object.assign(c,{$:s=>els[s],MOTOR_RENDER_JOB:0,MOTOR_DOM_KEY:'',MOTORISTAS_ROWS:[],MOTORISTAS_TMS:{},_motorCompareKey:()=>'',filterStateKey:()=>'',activeViewName:()=> 'motoristas',motoristasComparadosAsync:async()=>({rows:[row(),row(),row({cpf:'99988877766',centro:'MERCADO LIVRE'})]}),_renderMotoristasProgressivo:rs=>rendered=rs,setTimeout:fn=>fn(),motoristaVisibleRecords:()=>[],brDate:x=>x,baixarCsv:lines=>csv=lines});
 vm.runInContext(source('renderMotoristas'),c);vm.runInContext(source('exportMotoristas'),c);c.renderMotoristas();assert.equal(els['#expMotoristas'].disabled,true);c.exportMotoristas();assert.equal(csv,undefined);await new Promise(resolve=>setImmediate(resolve));assert.equal(rendered.length,1);assert.match(els['#motCadSummary'].innerHTML,/Exibindo: <b>1<\/b>/);assert.match(els['#motCadSummary'].innerHTML,/TMS: <b>1<\/b>/);c.exportMotoristas();assert.equal(csv.length-1,rendered.length);assert.equal(els['#expMotoristas'].disabled,false);
});
test('mesmo evento em jornadas sobrepostas aparece uma vez; eventos distintos no mesmo minuto são preservados',()=>{const c=context();const events=[{eventKey:'source-1',t:60,niv:'A',tipo:'CELULAR'},{eventKey:'source-1',t:60,niv:'A',tipo:'CELULAR'},{eventKey:'source-2',t:60,niv:'A',tipo:'CELULAR'}];const out=c.dedupeTimelineAlerts(events);assert.equal(out.length,2);assert.equal(c.dedupeTimelineAlerts([{t:60},{t:60}]).length,2);});
test('auditoria diferencia duplicata com identidade de coincidência por minuto',()=>{const c=context();const report=c.auditAlertDuplicates({JOAO:[['2026-10-22',60,'A','CELULAR',{key:'a'}],['2026-10-22',60,'A','CELULAR',{key:'a'}],['2026-10-22',60,'A','CELULAR',{key:'b'}]]});assert.equal(report.total,3);assert.equal(report.confirmed,1);assert.equal(report.candidates,1);});
test('evento AL_TL preserva identidade em registros sobrepostos, inclusive acentos',()=>{const c=context();Object.assign(c,{AL_TL:{'JOAO SILVA':[['2026-10-22',60,'A','CELULAR'],['2026-10-22',60,'A','CELULAR']]},tipoPareceCpf:()=>false});vm.runInContext(source('alertsForRec'),c);const a=c.alertsForRec(rec()),b=c.alertsForRec(rec({scopeIni:0,scopeFim:120}));assert.equal(a.length,2);assert.equal(c.dedupeTimelineAlerts([...a,...b]).length,2);});
test('importação síncrona e assíncrona deduplicam arquivos sobrepostos e preservam segundos/placas diferentes',async()=>{
 const c=context();for(const name of ['splitCSVLine','rowSigCells','_dedupeCell','_dedupeSig','dedupeAccept','placaKey','tipoPareceCpf','toMin'])vm.runInContext(source(name),c);
 Object.assign(c,{isoDate:x=>x,splitDT:x=>({date:x,time:''}),weekInfo:()=>({key:'2026-10-19'}),uoCurta:x=>x,uiYield:async()=>{}});
 vm.runInContext(html.slice(html.indexOf('function aggAlertas('),html.indexOf('function placaKey(')),c);
 const head='MOTORISTA;TIPO;NIVEL;DATA;HORA;PLACA;UO\n',event='JOAO SILVA;CELULAR;ALTO;2026-10-22;10:00:01;ABC1D23;BITREM\n',later=event.replace('10:00:01','10:00:02'),other=event.replace('ABC1D23','DEF4G56');
 for(const parse of [c.aggAlertas,c.aggAlertasAsync]){const seen=new Set(),diag={};const a=await parse(head+event+event+later+other,null,seen,diag),b=await parse(head+event,null,seen,diag);assert.equal(a.n,3);assert.equal(a.A['JOAO SILVA'].total,3);assert.equal(a.tl['JOAO SILVA'].length,3);assert.equal(b.n,0);assert.equal(diag.dup,2);assert.notEqual(a.tl['JOAO SILVA'][0][4].key,a.tl['JOAO SILVA'][1][4].key);}
});
test('filtro global inclui 18h no cache e devolve todos os registros do motorista elegível',()=>{
 const c=context(),els=Object.fromEntries(['fFecha','fOp','fDia','fDe','fAte','fMot','fStatus','fBusca','fDirecao'].map(k=>['#'+k,{value:''}]));els['#fDirecao'].value='18';
 const rows=[rec(),rec({data:'2026-10-21',mov:[]}),rec({motoristaEscala:'OUTRO',cpf:'99988877766',mov:[{ini:0,fim:1079}]})];Object.assign(c,{$:s=>els[s],DATA_REV:1,FILTER_CACHE_KEY:'',FILTER_CACHE_ROWS:null,FILTER_CACHE_DIV_COUNT:0,GLOBAL_DIV_COUNT:0,RECORDS:rows,activeRange:()=>null});
 for(const name of ['filterStateKey','_smallestPool','filtered'])vm.runInContext(source(name),c);
 assert.equal(c.filtered().length,2);assert.equal(c.filtered(),c.FILTER_CACHE_ROWS);els['#fDirecao'].value='';assert.equal(c.filtered().length,3);
});
