import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const adapter=readFileSync(new URL("../link-hub-adapter.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
test("Gaming LINK adapter initializes without network reads, polling or altering local data",()=>{
 let io=0;
 const context={window:{},navigator:{},console,TextEncoder,TextDecoder,
  fetch(){io++;throw Error("UNEXPECTED_NETWORK")},
  indexedDB:{open(){io++;throw Error("UNEXPECTED_STORAGE")}},
  crypto:{getRandomValues(){throw Error("UNEXPECTED_RANDOM")}}};
 vm.runInNewContext(adapter,context);
 assert.equal(io,0);
 assert.equal(typeof context.window.LinkHubAdapter.enroll,"function");
 assert.equal(typeof context.window.LinkHubAdapter.publishPilot,"function");
 assert.match(adapter,/dbPut\("outbox",key,record\)/);
 assert.match(adapter,/await client\(\)\.publish\(record\.envelope\)/);
 assert.match(adapter,/scope!=="installed_summary"/);
 assert.doesNotMatch(adapter,/setInterval\s*\(/);
 assert.doesNotMatch(adapter,/localStorage\.setItem\s*\(/);
});
test("Gaming CSP/cache include only HTTPS hub and preserve all paused push routines",()=>{
 assert.match(html,/link-hub-adapter\.js\?v=0131/);
 assert.match(sw,/gaming-v0\.17/);
 assert.match(sw,/link-hub-adapter\.js\?v=0131/);
 assert.match(readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8"),/https:\/\/link-app\.q9pfwtztsc\.workers\.dev/);
 assert.match(readFileSync(new URL("../backend/push.js",import.meta.url),"utf8"),/PUSH_TEMPORARILY_PAUSED/);
});
