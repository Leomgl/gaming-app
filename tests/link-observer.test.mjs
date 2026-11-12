import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

const source=fs.readFileSync(new URL("../nexus-sync.js",import.meta.url),"utf8");
function boot({connected=true}={}){
 const seed="SENSITIVE-SEED-MUST-NOT-LEAVE-GAMING";
 const id="SENSITIVE-PAIR-ID-DO-NOT-SHARE";
 const state={
  connections:connected?[{id,seed,sourceApp:"gaming",scopes:["installed_summary"]}]:[],
  games:[{id:"SECRET_GAME_ID",title:"Secret game in library",owned:true,status:"installed"}],
  items:[],
  linkOutbox:connected?[{pairId:id,entityId:"secret-record",fingerprint:"a".repeat(64),revision:1,sentAt:new Date(Date.now()-60000).toISOString()}]:[]
 };
 let modalContent="";
 const adapter={state:()=>state,persist:async()=>{},toast:()=>{},modal:(_title,body)=>{modalContent=body},escape:s=>s,seasonDates:()=>[]};
 const context={
  window:{addEventListener(){}},
  document:{addEventListener(){},getElementById(){return {addEventListener(){}}}},
  navigator:{clipboard:{writeText:async()=>{}},onLine:true},
  localStorage:{getItem(){return null}},
  crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Date,console,
  setTimeout,clearTimeout
 };
 vm.runInNewContext(source,context);
 context.window.GamingNexusSync.attach(adapter);
 return {api:context.window.GamingNexusSync,contents:()=>modalContent};
}

test("Gaming read-only observer returns only technical fields",async()=>{
 const b=boot();
 const r=await b.api.observation();
 assert.equal(r.schema,"link.observation.v1");
 assert.equal(r.contractId,"gaming-nexus");
 assert.equal(r.app,"gaming");
 assert.equal(r.paired,true);
 assert.equal(r.possible,1);
 assert.equal(r.pending,1);
 assert.equal(r.scopeCount,1);
 assert.ok(r.lastPublishedAt);
 const output=JSON.stringify(r);
 for(const sensitive of ["SENSITIVE","SECRET","pairId","seed","fingerprint","title","priceCents","entityId"])
  assert.equal(output.includes(sensitive),false,"Found "+sensitive+" in diagnostic");
});
test("unpaired observer does not invent a relationship",async()=>{
 const b=boot({connected:false});
 const r=await b.api.observation();
 assert.equal(r.paired,false);
 assert.equal(r.possible,0);
 assert.equal(r.pending,0);
 assert.equal(r.scopeCount,0);
 assert.equal(r.lastPublishedAt,null);
});
test("observer handoff is only a local link fragment with redacted information",async()=>{
 const b=boot();
 await b.api.observe();
 const html=b.contents();
 assert.match(html,/#observe=LDO1\./);
 assert.match(html,/gaming-link-observe-code/);
 for(const leak of ["SENSITIVE-SEED", "SENSITIVE-PAIR-ID", "SECRET_GAME_ID", "Secret game in library"])
  assert.doesNotMatch(html,new RegExp(leak));
});
test("legacy sync and consent paths remain available",()=>{
 const b=boot();
 assert.equal(typeof b.api.preview,"function");
 assert.equal(typeof b.api.send,"function");
 assert.equal(typeof b.api.panel,"function");
 assert.equal(typeof b.api.queue,"function");
});
