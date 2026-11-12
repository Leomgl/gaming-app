import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {webcrypto,randomBytes} from "node:crypto";

const source=fs.readFileSync(new URL("../link-audit.js",import.meta.url),"utf8");
const day=new Date("2026-11-12T22:40:00.000Z");
const seed=randomBytes(32).toString("base64url");
function helper(){
 const window={};
 vm.runInNewContext(source,{window,crypto:webcrypto,TextEncoder,btoa,atob,Date});
 return window.LinkAudit;
}
const key="a".repeat(64);
test("Gaming and Nexus with shared pairing derive identical ephemeral event tags",async()=>{
 const h=helper(),pair={seed};
 const gaming=await h.snapshot(pair,"gaming",[{sourceKey:key,revision:2}],day);
 const nexus=await h.snapshot(pair,"nexus",[{sourceKey:key,revision:2}],day);
 assert.equal(gaming.pairToken,nexus.pairToken);
 assert.equal(gaming.events[0].tag,nexus.events[0].tag);
 assert.match(gaming.events[0].tag,/^[A-Za-z0-9_-]{16}$/);
 assert.equal(gaming.total,1);
 for(const raw of [seed,key,"sourceKey","pairId","payload","title"]){
  assert.ok(!JSON.stringify(gaming).includes(raw),"secret exposed: "+raw.slice(0,8));
 }
});
test("Different pair seeds or UTC days do not correlate",async()=>{
 const h=helper(),a=await h.snapshot({seed},"gaming",[{sourceKey:key,revision:1}],day);
 const b=await h.snapshot({seed:randomBytes(32).toString("base64url")},"nexus",[{sourceKey:key,revision:1}],day);
 const c=await h.snapshot({seed},"nexus",[{sourceKey:key,revision:1}],new Date("2026-11-13T00:20:00.000Z"));
 assert.notEqual(a.pairToken,b.pairToken);
 assert.notEqual(a.events[0].tag,b.events[0].tag);
 assert.notEqual(a.pairToken,c.pairToken);
 assert.notEqual(a.events[0].tag,c.events[0].tag);
});
test("Audit snapshots are read-only and deduplicated",async()=>{
 const h=helper(),list=[{sourceKey:key,revision:1},{sourceKey:key,revision:3}];
 const before=JSON.stringify(list);
 const r=await h.snapshot({seed},"gaming",list,day);
 assert.equal(r.total,1);assert.equal(r.events[0].revision,3);
 assert.equal(JSON.stringify(list),before);
 assert.match(h.encode(r),/^LDA1\.[A-Za-z0-9_-]+$/);
 const noPair=await h.snapshot(null,"gaming",[],day);
 assert.equal(noPair.paired,false);
 assert.equal(noPair.total,0);
 assert.equal(noPair.pairToken,null);
});
