/* LINK Hub E2EE shared source; bundled on each app's own origin. */
'use strict';
(()=>{
/**
 * LINK Hub V0.7 — E2EE envelopes for the NXL1 Gaming ⇄ Nexus pilot.
 * Not a relay and does not write to storage. The caller MUST persist the
 * sealed envelope before trying to publish and MUST reuse exactly that
 * nonce/ciphertext on all retries of the same event+revision.
 *
 * The server receives only opaque, AES-GCM-encrypted app records; NXL1 seeds,
 * pair IDs, raw entity IDs and business details remain in the two PWAs.
 */
const ENVELOPE_SCHEMA="link.hub.envelope.v1";
const encoder=new TextEncoder(),decoder=new TextDecoder("utf-8",{fatal:true});
const utf=s=>encoder.encode(s);
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64=value=>{
 if(typeof value!=="string"||!value.length||value.length>12000||!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)
  throw Error("INVALID_BASE64");
 const bin=atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4));
 return Uint8Array.from(bin,char=>char.charCodeAt(0));
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scope=/^[a-z][a-z0-9_]{2,39}$/;
const contract=/^[a-z][a-z0-9-]{2,39}$/;
const schemaVersion=/^[a-zA-Z0-9_.-]{1,32}$/;
const entity=/^[a-zA-Z0-9:_./-]{1,128}$/;
function validatePair(pair){
 if(!pair||typeof pair!=="object"||!uuid.test(pair.id)||typeof pair.seed!=="string"||
    !Array.isArray(pair.scopes)||pair.scopes.length===0)throw Error("INVALID_PAIRED_CONTEXT");
 const seed=unb64(pair.seed);
 if(seed.byteLength!==32)throw Error("INVALID_PAIR_SECRET");
 return seed;
}
async function derive(seed,label,algorithm,usages){
 const imported=await crypto.subtle.importKey("raw",seed,"HKDF",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",
  salt:utf("link.hub.envelope.v1"),info:utf(label)},imported,algorithm,false,usages);
}
function validateMeta(e){
 if(!e||typeof e!=="object"||!contract.test(e.contractId)||!scope.test(e.scope)||
    !schemaVersion.test(e.schemaVersion)||!Number.isSafeInteger(e.revision)||
    e.revision<1||e.revision>1000000||!contract.test(e.from)||!contract.test(e.to)||
    e.from===e.to)throw Error("INVALID_ENVELOPE_METADATA");
}
const aad=(pair,meta,messageId)=>utf(JSON.stringify([
 ENVELOPE_SCHEMA,pair.id,meta.from,meta.to,meta.contractId,meta.scope,
 meta.schemaVersion,meta.revision,messageId
]));
const safeJson=value=>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_PAYLOAD");
 const str=JSON.stringify(value);
 if(utf(str).byteLength>6000)throw Error("ENVELOPE_TOO_LARGE");
 return str;
};
async function messageIdentifiers(seed,meta,entityId){
 const key=await derive(seed,"idempotence",{name:"HMAC",hash:"SHA-256",length:256},["sign"]);
 const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,
  utf(JSON.stringify(["message",meta.from,meta.to,meta.contractId,meta.scope,entityId,meta.revision]))));
 const tag=b64(bytes.slice(0,18));
 return {messageId:"msg_"+tag,idempotencyKey:"key_"+tag};
}
/** Always store the returned envelope in the publisher outbox before first network send. */
async function sealForHub(pair,{entityId,payload,...meta}){
 const seed=validatePair(pair);
 validateMeta(meta);
 if(!entity.test(entityId)||!pair.scopes.includes(meta.scope))throw Error("SCOPE_OR_ENTITY_DENIED");
 const plaintext=safeJson({schema:ENVELOPE_SCHEMA,entityId,payload});
 const ids=await messageIdentifiers(seed,meta,entityId);
 const key=await derive(seed,"payload",{name:"AES-GCM",length:256},["encrypt"]);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,
  additionalData:aad(pair,meta,ids.messageId)},key,utf(plaintext));
 return Object.freeze({
  messageId:ids.messageId,idempotencyKey:ids.idempotencyKey,
  to:meta.to,contractId:meta.contractId,scope:meta.scope,
  schemaVersion:meta.schemaVersion,revision:meta.revision,
  nonce:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))
 });
}
/** Decrypt in the recipient only; caller checks consent and persists before ACK. */
async function openFromHub(pair,fromApp,toApp,item){
 const seed=validatePair(pair);
 const meta={from:fromApp,to:toApp,
  contractId:item?.contractId,scope:item?.scope,schemaVersion:item?.schemaVersion,revision:item?.revision};
 validateMeta(meta);
 if(!pair.scopes.includes(meta.scope)||item?.fromApp!==fromApp||
    typeof item.messageId!=="string"||!/^msg_[A-Za-z0-9_-]{24}$/.test(item.messageId))
  throw Error("UNEXPECTED_ENVELOPE");
 const iv=unb64(item.nonce);
 if(iv.byteLength!==12)throw Error("INVALID_NONCE");
 const encrypted=unb64(item.ciphertext);
 const key=await derive(seed,"payload",{name:"AES-GCM",length:256},["decrypt"]);
 let inner;
 try{
  const buffer=await crypto.subtle.decrypt({name:"AES-GCM",iv,
   additionalData:aad(pair,meta,item.messageId)},key,encrypted);
  inner=JSON.parse(decoder.decode(buffer));
 }catch{throw Error("ENVELOPE_AUTH_FAILED")}
 if(!inner||inner.schema!==ENVELOPE_SCHEMA||!entity.test(inner.entityId)||!inner.payload||
    typeof inner.payload!=="object"||Array.isArray(inner.payload))
  throw Error("INVALID_INNER_ENVELOPE");
 const expected=await messageIdentifiers(seed,meta,inner.entityId);
 if(expected.messageId!==item.messageId)throw Error("IDENTITY_MISMATCH");
 return Object.freeze({entityId:inner.entityId,payload:inner.payload,revision:item.revision,
  scope:item.scope,contractId:item.contractId,messageId:item.messageId});
}


/** LINK Hub bus: common transport used by every PWA.
 * No automatic polling. Secrets are stored by app-specific enrollment.
 * Outbox stores ONLY ciphertext, never plaintext business records.
 */
const APP_ID="gaming", HUB_ORIGIN="https://link-app.q9pfwtztsc.workers.dev";
const AUTH_DB="link-hub-gaming-v1", OUTBOX_DB="link-hub-"+APP_ID+"-outbox-v1";
let authDBPromise=null,outboxDBPromise=null;
function dbOpen(name,store,readonly=false){
 const request=indexedDB.open(name,1);
 return new Promise((resolve,reject)=>{
  request.onupgradeneeded=()=>{
   if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error("LOCAL_HUB_STORAGE_UNAVAILABLE"));
 });
}
function currentDB(kind){
 if(kind==="auth")return authDBPromise??=dbOpen(AUTH_DB,"secrets",true);
 return outboxDBPromise??=dbOpen(OUTBOX_DB,"envelopes");
}
async function getRecord(db,store,key){
 return new Promise((resolve,reject)=>{
  let tx;
  try{tx=db.transaction(store,"readonly")}catch{return reject(Error("MISSING_LINK_ENROLLMENT"))}
  const req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result??null);
  req.onerror=()=>reject(Error("LINK_READ_FAILED"));
 });
}
async function putRecord(db,store,key,value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,"readwrite");
  tx.objectStore(store).put(value,key);
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(Error("LINK_WRITE_FAILED"));
  tx.onabort=()=>reject(Error("LINK_WRITE_ABORTED"));
 });
}
async function identity(){
 const db=await currentDB("auth");
 const token=await getRecord(db,"secrets","hubCredential");
 if(!token||token.appId!==APP_ID||!/^[a-f0-9]{64}$/i.test(token.credential||"")||
  Date.parse(token.expiresAt)<=Date.now())throw Error("INSCRIPTION_LINK_NÉCESSAIRE");
 return token.credential;
}
async function req(path,opts={}){
 const token=await identity();
 const response=await fetch(HUB_ORIGIN+path,{method:opts.body?"POST":"GET",
  cache:"no-store",headers:{Authorization:"Bearer "+token,...(opts.body?{"content-type":"application/json"}:{})},
  ...(opts.body?{body:JSON.stringify(opts.body)}:{})});
 const body=await response.json().catch(()=>({error:"LINK_REPONSE_INVALIDE"}));
 if(!response.ok)throw Error(body.error||"LINK_REQUETE_REJETEE");
 return body;
}
async function hashBody(body){
 const bytes=new TextEncoder().encode(JSON.stringify(body));
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
  .map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function publish({pair,from=APP_ID,to,contractId,scope,entityId,revision,payload,schemaVersion}){
 if(from!==APP_ID||typeof to!=="string"||to===from||!Number.isSafeInteger(revision)||
  revision<1||revision>1_000_000||!pair?.scopes?.includes(scope))
  throw Error("CONTRAT_OU_PERMISSION_INVALIDE");
 const fingerprint=await hashBody(payload);
 const key=[pair.id,from,to,contractId,scope,entityId,revision].join("|");
 const db=await currentDB("outbox");
 let record=await getRecord(db,"envelopes",key);
 if(record&&record.fingerprint!==fingerprint)throw Error("MÊME_RÉVISION_DONNÉES_DIFFÉRENTES");
 if(!record){
  const envelope=await sealForHub(pair,{from,to,contractId,scope,entityId,revision,
   payload,schemaVersion:schemaVersion||contractId+".v1"});
  record={envelope,fingerprint,createdAt:new Date().toISOString()};
  await putRecord(db,"envelopes",key,record);
 }
 if(record.deliveredAt)return {accepted:true,alreadyDelivered:true};
 const result=await req("/api/v2/hub/publish",{body:record.envelope});
 if(result.accepted!==true)throw Error("PUBLICATION_NON_CONFIRMÉE");
 await putRecord(db,"envelopes",key,{...record,deliveredAt:new Date().toISOString()});
 return {accepted:true,replay:result.replay===true};
}
async function receive({pair,from,contractId,scopes,persist,limit=30}){
 if(!pair||typeof from!=="string"||from===APP_ID||!Array.isArray(scopes)||
  !scopes.length||scopes.some(s=>!pair.scopes.includes(s))||
  typeof persist!=="function")throw Error("RECEPTION_NON_CONFIGURÉE");
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error("LIMITE_INVALIDE");
 const inbox=await req("/api/v2/hub/inbox?limit="+limit);
 let matched=0,acknowledged=0,failed=0;
 for(const item of inbox.messages||[]){
  if(item.fromApp!==from||item.contractId!==contractId||!scopes.includes(item.scope))continue;
  matched++;
  try{
   const opened=await openFromHub(pair,from,APP_ID,item);
   const saved=await persist({from,scope:item.scope,revision:item.revision,
    messageId:item.messageId,entityId:opened.entityId,payload:opened.payload});
   if(!saved?.durable||!["persisted","rejected"].includes(saved.status))throw Error("ECRITURE_NON_VÉRIFIÉE");
   await req("/api/v2/hub/ack",{body:{messageId:item.messageId,status:saved.status}});
   acknowledged++;
  }catch(e){failed++;}
 }
 return {matched,acknowledged,failed};
}
window.LinkHubBus=Object.freeze({appId:APP_ID,publish,receive});

})();
