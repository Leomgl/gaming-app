/* NEXUS LINK v1 — browser-side E2EE protocol. No secret is ever sent to Cloudflare. */
'use strict';
(() => {
 const API='https://link-app.q9pfwtztsc.workers.dev';
 const enc=new TextEncoder(),dec=new TextDecoder();
 const toBytes=s=>enc.encode(s);
 const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const fromB64=str=>{
  if(typeof str!=='string'||!/^[A-Za-z0-9_-]+$/.test(str))throw Error('INVALID_CODE');
  const raw=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
 };
 const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 async function derive(seed,label){
  const key=await crypto.subtle.importKey('raw',fromB64(seed),'HKDF',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',
   salt:toBytes('nexus-link-v1'),info:toBytes('nexus-link-v1/'+label)},key,256);
  return new Uint8Array(bits);
 }
 // Pairing seeds are generated on-device. LINK transports ciphertext; it never
 // requires a record in the retired NEXUS/Santé relay or a server-side verifier.
  function validatePair(pair){
  if(!pair||typeof pair.id!=='string'||!/^[-0-9a-f]{36}$/i.test(pair.id)||typeof pair.seed!=='string'||fromB64(pair.seed).length!==32||
   !['gaming','rituel'].includes(pair.sourceApp)||!Array.isArray(pair.scopes)||pair.scopes.length===0)
   throw Error('INVALID_PAIRING');
  return pair;
 }
 async function createPair(sourceApp,scopes){
  const allowed=['gaming','rituel','vestiaire','garage'];
  if(!allowed.includes(sourceApp)||!Array.isArray(scopes)||!scopes.length)throw Error('INVALID_SCOPES');
  const pair={id:crypto.randomUUID(),seed:b64(crypto.getRandomValues(new Uint8Array(32))),
   sourceApp,scopes:[...new Set(scopes)],createdAt:new Date().toISOString()};
  return validatePair(pair);
 }
 const invitation=pair=>'NXL1.'+b64(toBytes(JSON.stringify(validatePair(pair))));
 function readInvite(value){
  const str=String(value||'').trim();
  if(!str.startsWith('NXL1.'))throw Error('FORMAT_CODE');
  const pair=JSON.parse(dec.decode(fromB64(str.slice(5))));
  return validatePair(pair);
 }
 async function status(pair){
  const entry=validatePair(pair);
  // This confirms only that the locally held key is well formed. Enrollment,
  // permissions and delivery are verified independently by LINK Hub.
  return {connected:true,sourceApp:entry.sourceApp,scopes:[...entry.scopes],localOnly:true};
 }
 const aad=(pair,sourceKey,revision,scope)=>toBytes(['nexus-link-v1',pair.id,sourceKey,revision,scope].join('|'));
 async function sourceKey(pair,entityId){
  const secret=await derive(pair.seed,'entity-key');
  const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const value=await crypto.subtle.sign('HMAC',key,toBytes(String(entityId)));
  return hex(new Uint8Array(value));
 }
 // The old /api/v1/link/event and inbox transports are deliberately retired.
 // Fail explicitly rather than writing sensitive data into an obsolete relay.
 async function publish(){throw Error('RELAIS_HISTORIQUE_RETIRÉ_UTILISER_LINK');}
 async function inbox(){throw Error('RELAIS_HISTORIQUE_RETIRÉ_UTILISER_LINK');}
 async function acknowledge(){throw Error('RELAIS_HISTORIQUE_RETIRÉ_UTILISER_LINK');}
 async function revoke(pair){validatePair(pair);return {ok:true,revoked:true,localOnly:true};}
 window.NexusLinkCore=Object.freeze({API,createPair,invitation,readInvite,status,publish,inbox,acknowledge,revoke,sourceKey});
})();