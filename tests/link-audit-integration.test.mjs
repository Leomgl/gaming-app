import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto} from "node:crypto";

const audit=fs.readFileSync(new URL("../link-audit.js",import.meta.url),"utf8");
const sync=fs.readFileSync(new URL("../nexus-sync.js",import.meta.url),"utf8");
const seed=Buffer.alloc(32,7).toString("base64url");
function boot(){
 const state={
  connections:[{id:"11111111-1111-4111-8111-111111111111",seed,sourceApp:"gaming",scopes:["installed_summary"]}],
  games:[],items:[],
  linkOutbox:[{pairId:"11111111-1111-4111-8111-111111111111",entityId:"PRIVATE-ENTITY-ID",revision:2,
   sentAt:new Date().toISOString(),fingerprint:"secret"}]
 };
 let content="",mutations=0,publishCount=0;
 const window={
  addEventListener(){},
  NexusLinkCore:{sourceKey:async()=>("a".repeat(64)),publish(){publishCount++;throw Error("NO_PUBLISH")}}
 };
 const context={window,crypto:webcrypto,TextEncoder,btoa,atob,Date,setTimeout,clearTimeout,
  navigator:{onLine:false,clipboard:{writeText:async()=>{}}},document:{addEventListener(){},getElementById(){return {addEventListener(){}}}},
  localStorage:{getItem(){return null}},console};
 vm.runInNewContext(audit,context);
 vm.runInNewContext(sync,context);
 window.GamingNexusSync.attach({state:()=>state,seasonDates:()=>[],
  persist(){mutations++},toast(){},modal:(_,html)=>{content=html;}});
 return {api:window.GamingNexusSync,state,content:()=>content,mutations:()=>mutations,publishes:()=>publishCount};
}
test("Gaming audit only consults published outbox and returns temporary HMAC tags",async()=>{
 const t=boot(),before=JSON.stringify(t.state),r=await t.api.auditSnapshot();
 assert.equal(r.total,1);assert.equal(r.events[0].revision,2);
 assert.equal(r.events[0].tag.length,16);assert.equal(r.paired,true);
 for(const s of [seed,"PRIVATE-ENTITY-ID","sourceKey","fingerprint","pairId"])
  assert.doesNotMatch(JSON.stringify(r),new RegExp(s));
 assert.equal(JSON.stringify(t.state),before);
 assert.equal(t.mutations(),0);
 assert.equal(t.publishes(),0);
});
test("Gaming audit button builds local URL fragment and does not send events",async()=>{
 const t=boot();await t.api.auditPanel();
 assert.match(t.content(),/#audit=LDA1\./);
 assert.match(t.content(),/Copier le code/);
 assert.doesNotMatch(t.content(),/PRIVATE-ENTITY-ID/);
 assert.equal(t.mutations(),0);
 assert.equal(t.publishes(),0);
});
