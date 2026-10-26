const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function _parseSnapshotStreamLarge('),html.indexOf('async function _lerSnapshotMultipart('));
function ctx(){const c=vm.createContext({TextDecoderStream});vm.runInContext(source,c);return c;}
function stream(text,chunkSize=17){const bytes=new TextEncoder().encode(text);let i=0;return new ReadableStream({pull(c){if(i>=bytes.length){c.close();return;}c.enqueue(bytes.slice(i,i+chunkSize));i+=chunkSize;}});}
const plain=x=>JSON.parse(JSON.stringify(x));
test('snapshot incremental preserva todos os campos, unicode, escapes, números e containers vazios',async()=>{
 const sample={v:3,REAL:true,RAW:{schema:3,records:[{motorista:'JOÃO "SILVA" \\ teste',data:'2026-10-26',nested:{a:[1,null,false,true,-12.3e4]}},{empty:[],obj:{}}],dsrDays:{JOAO:{'2026-10-26':3}},alertas:{JOAO:{total:2}}},AL_TL:{JOAO:[['2026-10-26',60,'A','CELULAR',{key:'a',cpf:'01234567890'}]]},number:1e-9,text:'ação 😀',empty:{},arr:[]};
 const text=JSON.stringify(sample),c=ctx();for(const size of [1,2,7,64,4096])assert.deepEqual(plain(await c._parseSnapshotStreamLarge(stream(text,size))),sample);
});
test('não depende da ordem ou espaçamento de RAW.records e preserva chaves especiais como JSON.parse',async()=>{const c=ctx(),text=' { "AL_TL": {"__proto__": [{"ok":true}]}, "RAW" : {"schema": 3, "records" : []}, "v":3 } ';assert.deepEqual(plain(await c._parseSnapshotStreamLarge(stream(text,3))),JSON.parse(text));});
test('rejeita JSON truncado, vírgulas inválidas, lixo final e registros ausentes',async()=>{const c=ctx();for(const text of ['{"RAW":{"records":[','{"RAW":{"records":[1,]}}','{"RAW":{"records":[]},}','{"RAW":{"records":[]}}{}','{"RAW":{"records":[]},"x":tru}','{"RAW":{}}'])await assert.rejects(()=>c._parseSnapshotStreamLarge(stream(text,2)));});
test('lê campos grandes além de RAW.records sem montar texto global',async()=>{
 const c=ctx(),sample={RAW:{records:Array.from({length:500},(_,i)=>({i,ponto:['08:00','16:00']})),alertas:{JOAO:{events:Array.from({length:500},(_,i)=>({i,t:'celular'}))}}},AL_TL:Object.fromEntries(Array.from({length:30},(_,j)=>['DRV'+j,Array.from({length:200},(_,i)=>['2026-10-26',i,'A','VELOCIDADE',{kmh:101}])]))};
 assert.deepEqual(plain(await c._parseSnapshotStreamLarge(stream(JSON.stringify(sample),1024))),sample);
 assert.doesNotMatch(source,/suffix\.join|prefix\+|const skeleton/);
});
test('carregador multipart lê gzip grande e rejeita JSON inválido sem travar a escrita',async()=>{
 const {gzipSync}=require('node:zlib');
 const text=JSON.stringify({v:3,REAL:true,RAW:{schema:3,records:[{motorista:'TESTE'}]},AL_TL:{}});
 const c=ctx();Object.assign(c,{DecompressionStream,Response,REAL:false,PUBLISHED_AT_LOADED:0,$:()=>null,fetch:async()=>new Response(gzipSync(text))});
 vm.runInContext(html.slice(html.indexOf('async function _lerSnapshotMultipart('),html.indexOf('async function _lerSnapshotLegado(')),c);
 const m={v:1,compression:'gzip',rawBytes:1024*1024*1024,publishedAt:123,parts:[{file:'parte-001.bin'}]};
 const s=await c._lerSnapshotMultipart(m);assert.equal(s.RAW.records.length,1);assert.equal(s.publishedAt,123);
 c.fetch=async()=>new Response(gzipSync('{"RAW":{"records":[]},invalid}'));
 let timer;try{await assert.rejects(Promise.race([c._lerSnapshotMultipart(m),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('leitor travado')),2000);})]),/JSON|Unexpected|Expected/);}finally{clearTimeout(timer);}
});
