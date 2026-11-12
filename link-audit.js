/* LINK audit v1: pair-scoped, day-scoped ephemeral HMAC tokens.
 * No keys, IDs, sourceKey, payload or persistent stable alias leave the app.
 * This is an opt-in, manually exported diagnostic, NOT a signed server ACK.
 */
'use strict';
(()=>{
 const MAX_ITEMS=128,MAX_REV=1000000;
 const encoder=new TextEncoder();
 const bytes=s=>encoder.encode(s);
 const toB64=b=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 function fromB64(s){
  if(typeof s!=='string'||s.length>80||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('INVALID_PAIR_SEED');
  const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  const out=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(out.length!==32)throw Error('INVALID_PAIR_SEED');
  return out;
 }
 async function keyFromPair(pair){
  if(!pair||typeof pair!=='object'||typeof pair.seed!=='string')throw Error('NO_PAIR');
  const seed=await crypto.subtle.importKey('raw',fromB64(pair.seed),'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',
   salt:bytes('link.audit.v1'),info:bytes('pair-bound-ephemeral-tags-v1')},
    seed,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']);
 }
 async function token(key,input){
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(input)));
  return toB64(sig.slice(0,12)); // 96 bits; private pair and UTC day scoped
 }
 function utcDay(date){return new Date(date).toISOString().slice(0,10)}
 async function snapshot(pair,side,rows,now=new Date()){
  if(!['gaming','nexus'].includes(side)||!Array.isArray(rows)||rows.length>10000)
    throw Error('INVALID_AUDIT_INPUT');
  const nowMs=new Date(now).getTime();
  if(!Number.isFinite(nowMs))throw Error('INVALID_DATE');
  if(!pair){return {schema:'link.audit.v1',contractId:'gaming-nexus',side,
    createdAt:new Date(nowMs).toISOString(),day:utcDay(nowMs),paired:false,
    pairToken:null,total:0,limited:false,events:[]};}
  const key=await keyFromPair(pair),day=utcDay(nowMs),unique=new Map();
  for(const r of rows){
   if(typeof r?.sourceKey!=='string'||!/^[0-9a-f]{64}$/i.test(r.sourceKey)||
     !Number.isSafeInteger(r.revision)||r.revision<1||r.revision>MAX_REV)
    continue;
   const t=await token(key,'event|'+day+'|'+r.sourceKey.toLowerCase());
   unique.set(t,Math.max(unique.get(t)||0,r.revision));
  }
  const eventList=[...unique].sort(([a],[b])=>a.localeCompare(b));
  return {schema:'link.audit.v1',contractId:'gaming-nexus',side,
   createdAt:new Date(nowMs).toISOString(),day,paired:true,
   pairToken:await token(key,'pair|'+day),
   total:eventList.length,limited:eventList.length>MAX_ITEMS,
   events:eventList.slice(0,MAX_ITEMS).map(([tag,revision])=>({tag,revision}))};
 }
 function encode(report){
  const str=JSON.stringify(report),b=encoder.encode(str);
  if(b.length>12500)throw Error('AUDIT_TOO_LARGE');
  let bin='';for(const x of b)bin+=String.fromCharCode(x);
  return 'LDA1.'+toB64(b);
 }
 window.LinkAudit=Object.freeze({snapshot,encode,utcDay,MAX_ITEMS});
})();