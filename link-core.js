/* NEXUS LINK v1 — browser-side E2EE protocol. No secret is ever sent to Cloudflare. */
'use strict';
(() => {
 const API='https://nexus-link-api.q9pfwtztsc.workers.dev';
 const enc=new TextEncoder(),dec=new TextDecoder();
 const toBytes=s=>enc.encode(s);
 const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const fromB64=str=>{
  if(typeof str!=='string'||!/^[A-Za-z0-9_-]+$/.test(str))throw Error('INVALID_CODE');
  const raw=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
 };
 const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 const digest=async bytes=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 async function derive(seed,label){
  const key=await crypto.subtle.importKey('raw',fromB64(seed),'HKDF',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:toBytes('nexus-link-v1'),info:toBytes('nexus-link-v1/'+label)},key,256);
  return new Uint8Array(bits);
 }
 const token=async (pair,role)=>b64(await derive(pair.seed,role==='read'?'read-token':'write-token'));
 async function jsonRequest(path,{method='GET',bearer='',body=null,params={}}={}){
  const url=new URL(API+path);
  for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
  const headers={'accept':'application/json'};
  if(body!==null)headers['content-type']='application/json';
  if(bearer)headers.authorization='Bearer '+bearer;
  const response=await fetch(url,{method,headers,body:body!==null?JSON.stringify(body):undefined,cache:'no-store'});
  const result=await response.json().catch(()=>({ok:false,error:'INVALID_SERVER_RESPONSE'}));
  if(!response.ok||!result.ok)throw new Error(result.error||('HTTP_'+response.status));
  return result;
 }
 function validatePair(pair){
  if(!pair||typeof pair.id!=='string'||!/^[-0-9a-f]{36}$/i.test(pair.id)||typeof pair.seed!=='string'||fromB64(pair.seed).length!==32||
   !['gaming','rituel'].includes(pair.sourceApp)||!Array.isArray(pair.scopes)||pair.scopes.length===0)
   throw Error('INVALID_PAIRING');
  return pair;
 }
 async function createPair(sourceApp,scopes){
  if(!['gaming','rituel'].includes(sourceApp)||!Array.isArray(scopes)||!scopes.length)throw Error('INVALID_SCOPES');
  const pair={id:crypto.randomUUID(),seed:b64(crypto.getRandomValues(new Uint8Array(32))),sourceApp,scopes:[...new Set(scopes)],createdAt:new Date().toISOString()};
  const writer=await token(pair,'write'),reader=await token(pair,'read');
  await jsonRequest('/api/v1/link/pair',{method:'POST',body:{
   id:pair.id,sourceApp,scopes:pair.scopes,writerVerifier:hex(await digest(toBytes(writer))),readerVerifier:hex(await digest(toBytes(reader)))
  }});
  return pair;
 }
 const invitation=pair=>'NXL1.'+b64(toBytes(JSON.stringify(validatePair(pair))));
 function readInvite(value){
  const str=String(value||'').trim();
  if(!str.startsWith('NXL1.'))throw Error('FORMAT_CODE');
  const pair=JSON.parse(dec.decode(fromB64(str.slice(5))));
  return validatePair(pair);
 }
 async function status(pair){
  validatePair(pair);
  return jsonRequest('/api/v1/link/status',{bearer:await token(pair,'write'),params:{id:pair.id}});
 }
 const aad=(pair,sourceKey,revision,scope)=>toBytes(['nexus-link-v1',pair.id,sourceKey,revision,scope].join('|'));
 async function sourceKey(pair,entityId){
  const secret=await derive(pair.seed,'entity-key');
  const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const value=await crypto.subtle.sign('HMAC',key,toBytes(String(entityId)));
  return hex(new Uint8Array(value));
 }
 async function encryptionKey(pair){
  return crypto.subtle.importKey('raw',await derive(pair.seed,'data-key'),'AES-GCM',false,['encrypt','decrypt']);
 }
 async function publish(pair,{entityId,revision=1,scope,payload}){
  validatePair(pair);
  if(!pair.scopes.includes(scope))throw Error('SCOPE_DENIED');
  const source=await sourceKey(pair,entityId),iv=crypto.getRandomValues(new Uint8Array(12));
  const encoded=toBytes(JSON.stringify(payload));
  if(encoded.byteLength>6000)throw Error('EVENT_TOO_LARGE');
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(pair,source,revision,scope)},await encryptionKey(pair),encoded);
  return jsonRequest('/api/v1/link/events',{method:'POST',bearer:await token(pair,'write'),body:{
   connectionId:pair.id,sourceKey:source,revision,scope,nonce:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))
  }});
 }
 async function inbox(pair){
  validatePair(pair);
  const response=await jsonRequest('/api/v1/link/inbox',{bearer:await token(pair,'read'),params:{id:pair.id}});
  const key=await encryptionKey(pair);
  const out=[];
  for(const item of response.messages||[]){
   if(!pair.scopes.includes(item.scope))continue;
   try{
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(item.nonce),additionalData:aad(pair,item.sourceKey,item.revision,item.scope)},key,fromB64(item.ciphertext));
    out.push({...item,payload:JSON.parse(dec.decode(plaintext))});
   }catch{out.push({id:item.id,scope:item.scope,invalid:true});}
  }
  return out;
 }
 async function acknowledge(pair,messageId){
  return jsonRequest('/api/v1/link/ack',{method:'POST',bearer:await token(pair,'read'),body:{connectionId:pair.id,messageId}});
 }
 async function revoke(pair){
  return jsonRequest('/api/v1/link/revoke',{method:'POST',bearer:await token(pair,'read'),body:{connectionId:pair.id}});
 }
 window.NexusLinkCore=Object.freeze({API,createPair,invitation,readInvite,status,publish,inbox,acknowledge,revoke,sourceKey});
})();