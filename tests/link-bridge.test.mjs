import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../link-bridge.js",import.meta.url),"utf8");
const APP_ID="gaming";
const encode=x=>btoa(JSON.stringify(x)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
function createHarness(action="inspect",overrides={},paired=true,standalone=false){
 const request={schema:"link.management.v1",id:"LocalReqToken123",flow:"gaming-nexus",app:APP_ID,
  action,step:APP_ID==="gaming"?"source":"target",...overrides};
 const nodes=[],callbacks={},location={
  hash:"#link-control="+encode(request),assigned:null,
  assign(url){this.assigned=url}
 };
 const make=tag=>{
  const el={tag,type:"",children:[],textContent:"",disabled:false,
   setAttribute(){},append(...children){this.children.push(...children)},
   addEventListener(type,fn){(callbacks[type]??=[]).push({element:this,fn})},
   showModal(){this.open=true}};
  return el;
 };
 const document={readyState:"complete",body:{append(el){nodes.push(el)}},createElement:make,
  addEventListener(){}};
 let sent=0,received=0;
 const context={document,location,window:{addEventListener(){},
   matchMedia:()=>({matches:standalone}),
   GamingNexusSync:{observation:async()=>({paired}),send:async()=>{sent++;return{count:2,errors:0}}},
   NexusGamingImport:{observation:()=>({paired}),synchronize:async()=>{received++;return{received:2}}}
  },navigator:{standalone},TextEncoder,TextDecoder,btoa,atob,Date};
 vm.runInNewContext(source,context,{filename:"link-bridge.js"});
 return{nodes,callbacks,location,run:async()=>{
  const list=callbacks.click||[];
  const accept=list.find(x=>String(x.element.textContent).startsWith("Autoriser"));
  assert.ok(accept,"accept button rendered");
  await accept.fn();
 },getSent:()=>sent,getReceived:()=>received};
}
test("headless bridge is inert unless LINK launches it",()=>{
 const h=createHarness("revoke");
 assert.equal(h.nodes.length,0);
 assert.equal(h.location.assigned,null);
});
test("LINK inspection asks for a local tap and returns only safe metadata",async()=>{
 const h=createHarness("inspect");
 assert.equal(h.nodes.length,1);
 assert.equal(h.location.assigned,null);
 await h.run();
 assert.ok(h.location.assigned.startsWith("https://link-app.q9pfwtztsc.workers.dev/#link-return="));
 const value=h.location.assigned.split("#link-return=")[1];
 const reply=JSON.parse(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)));
 assert.equal(reply.app,APP_ID);
 assert.equal(reply.status,"ok");
 assert.equal(reply.flow,"gaming-nexus");
 assert.ok(!JSON.stringify(reply).includes("seed"));
 assert.deepEqual(Object.keys(reply).sort(),
  ["schema","id","flow","app","action","step","status","at"].sort());
 assert.equal(h.getSent(),0);assert.equal(h.getReceived(),0);
});
test("sync cannot run before consent and uses existing secured transfer",async()=>{
 const h=createHarness("sync");
 assert.equal(h.getSent(),0);assert.equal(h.getReceived(),0);
 await h.run();
 assert.equal(APP_ID==="gaming"?h.getSent():h.getReceived(),1);
});
test("forged app or forbidden flow is ignored",()=>{
 const bad=createHarness("sync",{app:"sante"});
 assert.equal(bad.nodes.length,0);
 const forbidden=createHarness("sync",{flow:"rituel-garage"});
 assert.equal(forbidden.nodes.length,0);
});

test("Safari-like isolated storage never claims the existing PWA pairing was deleted",async()=>{
 const h=createHarness("inspect",{},false,false);
 await h.run();
 const raw=h.location.assigned.split("#link-return=")[1];
 const reply=JSON.parse(atob(raw.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-raw.length%4)%4)));
 assert.equal(reply.status,"context-isolated");
 assert.equal(h.getSent(),0);
 assert.equal(h.getReceived(),0);
 const standalone=createHarness("inspect",{},false,true);
 await standalone.run();
 const b=standalone.location.assigned.split("#link-return=")[1];
 const result=JSON.parse(atob(b.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-b.length%4)%4)));
 assert.equal(result.status,"not-configured");
});
