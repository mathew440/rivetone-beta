const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const backup=require('../backup.js');
const html=fs.readFileSync(path.join(root,'index-2.html'),'utf8');
function unzipStored(buffer){
  const result={};let p=0;
  while(buffer.readUInt32LE(p)===0x04034b50){
    const crc=buffer.readUInt32LE(p+14),size=buffer.readUInt32LE(p+18),nl=buffer.readUInt16LE(p+26),el=buffer.readUInt16LE(p+28);
    const name=buffer.subarray(p+30,p+30+nl).toString(),start=p+30+nl+el;
    const data=buffer.subarray(start,start+size);assert.equal(backup.crc32(data),crc);
    result[name]=data;p=start+size;
  }
  assert.equal(buffer.readUInt32LE(p),0x02014b50);return result;
}
test('local archive preserves unsaved records and binary drawings, excludes shared crew',async()=>{
  const file=new Blob([new Uint8Array([0,255,10,13,128])],{type:'application/pdf'});
  const current={notes:['unsaved update'],crew:[{name:'private shared crew'}],plans:[{sheet:'E1',fileId:'one'}],photos:[{src:'data:image/png;base64,AA=='}]};
  const built=await backup.build({current,stored:JSON.stringify({notes:['saved'],crew:['excluded']}),drawings:[{key:'one',blob:file}]});
  const entries=unzipStored(Buffer.from(await built.blob.arrayBuffer()));
  assert.deepEqual([...entries['drawings/0001.bin']],[0,255,10,13,128]);
  assert.deepEqual(JSON.parse(entries['local-records.json']).notes,['unsaved update']);
  assert.equal(JSON.parse(entries['local-records.json']).crew,undefined);
  assert.equal(JSON.parse(entries['last-saved-records.json']).crew,undefined);
  assert.deepEqual(built.manifest.warnings,[]);assert.equal(current.crew.length,1);
});
test('corrupt saved state and missing drawing are explicitly identified',async()=>{
  const built=await backup.build({current:{plans:[{fileId:'lost',sheet:'E5.1'}]},stored:'broken-json',drawings:[]});
  assert.equal(built.manifest.warnings.length,2);
  const entries=unzipStored(Buffer.from(await built.blob.arrayBuffer()));
  assert.equal(entries['last-saved-records-raw.txt'].toString(),'broken-json');
});
test('unreadable drawing fails rather than claiming a full backup',async()=>{
  await assert.rejects(backup.build({current:{},stored:null,drawings:[{key:'bad',blob:{}}]}),/unreadable/);
});
test('CRC matches known ZIP standard vector',()=>assert.equal(backup.crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('export reads only application storage and fails safely when blocked',async()=>{
  const prior=global.localStorage;let requested=[];
  global.localStorage={getItem(key){requested.push(key);throw new Error('blocked');}};
  try{await assert.rejects(backup.exportDevice({}),/storage cannot be read/);assert.deepEqual(requested,['rivetOneState']);}finally{global.localStorage=prior;}
});
function cloudHarness(){
  let mode='ok',onAuth,interval,queries=0,mutations=0;
  const session={user:{id:'u1',email:'test@example.invalid'}};
  const query=table=>{
    const chain={select(){queries++;return this;},eq(){return this;},order(){return this;},range(){return Promise.resolve(result());},maybeSingle(){return Promise.resolve(result());},single(){return Promise.resolve(result());}};
    const result=()=>mode==='failure'?{error:{message:'503'}}:mode==='denied'?{data:null}:{data:table==='rivet_memberships'?{display_name:'Test',role:'Admin'}:table==='rivet_workspaces'?{name:'Test workspace'}:[{id:'c1',name:'Crew',project_id:'p1'}]};
    for(const m of ['insert','update','delete'])chain[m]=()=>{mutations++;throw new Error('Unexpected mutation');};return chain;
  };
  const client={from:query,auth:{onAuthStateChange(fn){onAuth=fn;},async getSession(){return {data:{session}};},async signOut(){return {};}}};
  const context={window:null,navigator:{onLine:true},location:{hash:''},document:{hidden:false,addEventListener(){}},EventTarget,Event,URL,Date,AbortSignal,fetch(){throw Error('network forbidden');},setTimeout(){},setInterval(fn){interval=fn;}};
  context.window=context;context.addEventListener=()=>{};context.RIVETONE_CONFIG={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_test',workspaceId:'10000000-0000-4000-8000-000000000001'};context.supabase={createClient:()=>client};
  const source=html.match(/<script data-rivetone-source="crew-cloud.js">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(source,context);
  return {context,cloud:context.CrewCloud,setMode:x=>mode=x,get queries(){return queries;},get mutations(){return mutations;},tick:()=>interval(),auth:x=>onAuth('SIGNED_IN',x)};
}
test('outage marks stale crew read-only; reconnect restores access; logout clears identity',async()=>{
  const h=cloudHarness();await h.cloud.init();assert.equal(h.cloud.status().healthy,true);assert.ok(h.cloud.status().lastSuccess);assert.equal(h.cloud.canManage(),true);
  h.setMode('failure');await h.cloud.refresh();assert.equal(h.cloud.status().healthy,false);assert.equal(h.cloud.canManage(),false);assert.equal(h.cloud.roster('p1').length,1);
  await assert.rejects(h.cloud.add('p1',{name:'No write'}),/connected administrator/);assert.equal(h.mutations,0);
  const first=h.cloud.status().nextRefreshAt;await h.cloud.refresh();assert.ok(h.cloud.status().nextRefreshAt>first);
  h.setMode('ok');await h.cloud.refresh();assert.equal(h.cloud.canManage(),true);
  await h.cloud.signOut();assert.equal(h.cloud.status().authorized,false);assert.equal(h.cloud.status().lastSuccess,null);assert.equal(h.cloud.roster('p1').length,0);
});
test('startup during outage does not authorize access; offline makes no queries',async()=>{
  const h=cloudHarness();h.setMode('failure');await h.cloud.init();assert.equal(h.cloud.status().authorized,false);
  h.context.navigator.onLine=false;const before=h.queries;await h.cloud.refresh();h.tick();assert.equal(h.queries,before);assert.equal(h.cloud.canManage(),false);
});
test('revoked membership clears shared records',async()=>{
  const h=cloudHarness();await h.cloud.init();h.setMode('denied');await h.cloud.refresh();assert.equal(h.cloud.status().authorized,false);assert.equal(h.cloud.roster('p1').length,0);
});
test('connection UI does not report navigator online as successful cloud access',()=>{
  const context={window:{},document:{addEventListener(){}},module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'connection-ui.js'),'utf8'),context);
  const describe=context.module.exports.describe;
  assert.equal(describe({configured:true,signedIn:true,healthy:false},true).label,'Cloud unavailable');
  assert.equal(describe({configured:true,signedIn:true,healthy:true},false).label,'Device offline');
});
test('entry points match; scripts parse; export is outside sign-in gate; demo sync cannot erase notices',()=>{
  for(const file of ['index.html.html'])assert.equal(fs.readFileSync(path.join(root,file),'utf8'),html);
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!match[1].includes('src='))new vm.Script(match[2]);
  for(const file of ['backup.js','connection-ui.js','documents-cloud.js','documents-ui.js','sw.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));
  assert.match(html.slice(html.indexOf('id="introOverlay"'),html.indexOf('id="app"')),/data-device-backup/);
  assert.doesNotMatch(html,/state\.syncQueue=\[\]/);
  assert.match(html,/document\.getElementById\('app'\)\.inert = !allowed/);
});
