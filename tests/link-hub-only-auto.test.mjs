import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=readFileSync(new URL('../nexus-sync.js',import.meta.url),'utf8');
test('Gaming ne publie pas sur ancien relais si LINK échoue en auto',async()=>{
 const data={connections:[{id:'pair-test',sourceApp:'gaming',seed:'opaque',scopes:['installed_summary']}],
  games:[],items:[],linkOutbox:[]};
 let timer,legacyWrites=0,hubAttempts=0;
 const window={addEventListener(){},NexusLinkCore:{publish:async()=>{legacyWrites++;}},
  LinkHubBus:{publish:async()=>{hubAttempts++;throw Error('LINK momentanément indisponible')}}};
 const localStorage={getItem:key=>key==='gaming_link_auto_v1'?'yes':'',setItem(){}};
 const context={window,localStorage,navigator:{onLine:true},document:{addEventListener(){}},crypto:webcrypto,
  TextEncoder,TextDecoder,console,Date,setTimeout:fn=>{timer=fn;return 1},clearTimeout(){}};
 vm.runInNewContext(source,context,{filename:'nexus-sync.js'});
 window.GamingNexusSync.attach({state:()=>data,persist:async()=>{},toast:()=>{},seasonDates:()=>[]});
 window.GamingNexusSync.queue(true);
 assert.equal(typeof timer,'function');
 await timer();
 assert.equal(hubAttempts,1,'LINK est essayé en premier');
 assert.equal(legacyWrites,0,'aucun envoi automatique vers l’ancien relais');
 assert.equal(typeof window.GamingNexusSync.send,'function','envoi historique manuel préservé');
});
test('Gaming garde une voie explicite de secours et renouvelle son cache iPhone',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(source,/id="g7-send-legacy"/);
 assert.match(source,/getElementById\('g7-send-legacy'\)/);
 assert.match(source,/try\{await sendHub\(\);await panel\(\)\}/);
 assert.doesNotMatch(source,/try\{await sendHub\(\)\}catch\{await send\(\)\}/);
 assert.match(html,/nexus-sync\.js\?v=0132/);
 assert.match(sw,/gaming-v0\.21-link-only-auto/);
});
