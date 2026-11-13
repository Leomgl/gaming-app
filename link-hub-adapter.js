/* LINK Hub pilot: no silent updates and zero background D1 polling. */
'use strict';
(()=>{
/**
 * LINK Hub V0.7 — optional app-side SDK.
 *
 * Each PWA owns its identity, keys, consent and durable business storage.
 * The SDK never stores a token, never encrypts business data, and never
 * acknowledges an inbound message until the host says it is durable.
 * An app must FIRST encrypt with its existing E2EE pairing key.
 */
const HUB_ENDPOINT="https://link-app.q9pfwtztsc.workers.dev";
function createHubClient({appId,tokenProvider,fetchImpl=fetch,endpoint=HUB_ENDPOINT}={}){
 if(typeof appId!=="string"||!/^[a-z][a-z0-9-]{2,40}$/.test(appId)||
    typeof tokenProvider!=="function"||typeof fetchImpl!=="function"||
    !/^https:\/\//.test(endpoint))throw Error("INVALID_SDK_CONFIG");
 async function request(path,{method="GET",body,signal}={}){
  const credential=await tokenProvider();
  if(typeof credential!=="string"||!/^[a-f0-9]{64}$/i.test(credential))throw Error("HUB_NOT_ENROLLED");
  const res=await fetchImpl(endpoint+path,{
   method,signal,cache:"no-store",
   headers:{Authorization:"Bearer "+credential,...(body?{"content-type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  let answer;try{answer=await res.json()}catch{throw Error("INVALID_HUB_RESPONSE")}
  if(!res.ok)throw Error(typeof answer.error==="string"?answer.error:"HUB_REQUEST_FAILED");
  return answer;
 }
 return Object.freeze({
  appId,
  /** Opaque, already encrypted envelope, prepared by the original app. */
  publish:envelope=>request("/api/v2/hub/publish",{method:"POST",body:envelope}),
  inbox:({limit=30,signal}={})=>{
   if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error("INVALID_LIMIT");
   return request("/api/v2/hub/inbox?limit="+limit,{signal});
  },
  /** ACK requires explicit durable persist proof from the consuming app. */
  acknowledge:(messageId,status,receipt)=>{
   if(!receipt||receipt.durable!==true||!["persisted","rejected"].includes(status))
    throw Error("DURABLE_ACK_REQUIRED");
   return request("/api/v2/hub/ack",{method:"POST",body:{messageId,status}});
  },
  async drain(persist,{limit=30,signal}={}){
   if(typeof persist!=="function")throw Error("PERSISTENCE_CALLBACK_REQUIRED");
   const {messages=[]}=await this.inbox({limit,signal});
   let saved=0,failed=0;
   for(const envelope of messages){
    let result;
    try{result=await persist(envelope)}catch{failed++;continue}
    if(!result||result.durable!==true){failed++;continue}
    if(result.status!=="persisted"&&result.status!=="rejected"){failed++;continue}
    try{await this.acknowledge(envelope.messageId,result.status,result);saved++}
    catch{failed++} // Server retries; caller must dedupe locally.
   }
   return {seen:messages.length,acknowledged:saved,needsRetry:failed};
  }
 });
}

/**
 * One-time enrollment called FROM the installed PWA's own origin.
 * The caller provides its IndexedDB/secure local persistence callback.
 * Neither the invitation nor the issued capability is put in a URL,
 * localStorage automatically, or LINK's public app bundle.
 */
async function enrollHubClient({appId,invitation,persistCredential,
 fetchImpl=fetch,endpoint=HUB_ENDPOINT}={}){
 if(typeof appId!=="string"||!/^[a-z][a-z0-9-]{2,39}$/.test(appId)||
    typeof invitation!=="string"||!/^[a-f0-9]{64}$/i.test(invitation)||
    typeof persistCredential!=="function"||typeof fetchImpl!=="function"||
    typeof endpoint!=="string"||!/^https:\/\//.test(endpoint))
  throw Error("INVALID_ENROLLMENT");
 const response=await fetchImpl(endpoint+"/api/v2/hub/enroll",{
  method:"POST",cache:"no-store",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({appId,invitation})
 });
 const body=await response.json().catch(()=>({error:"INVALID_HUB_RESPONSE"}));
 if(!response.ok)throw Error(body?.error||"ENROLLMENT_FAILED");
 if(body?.appId!==appId||typeof body.credential!=="string"||
    !/^[a-f0-9]{64}$/i.test(body.credential)||!Number.isFinite(Date.parse(body.expiresAt)))
  throw Error("INVALID_ENROLLMENT_RESPONSE");
 await persistCredential({appId,credential:body.credential,expiresAt:body.expiresAt});
 return Object.freeze({registered:true,appId,expiresAt:body.expiresAt,
  transportEnabled:body.transportEnabled===true});
}

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


const APP_ID="gaming";
const STORE_DB="link-hub-"+APP_ID+"-v1";
let adapterConfig={};
let storeHandle=null;
const isStandalone=()=>!/(iPad|iPhone|iPod)/.test(navigator.userAgent)||
 navigator.standalone===true||window.matchMedia?.("(display-mode: standalone)")?.matches;
function openStore(){
 if(storeHandle)return storeHandle;
 storeHandle=new Promise((resolve,reject)=>{
  const q=indexedDB.open(STORE_DB,1);
  q.onupgradeneeded=()=>{
   const db=q.result;
   if(!db.objectStoreNames.contains("secrets"))db.createObjectStore("secrets");
   if(!db.objectStoreNames.contains("outbox"))db.createObjectStore("outbox");
  };
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(Error("LOCAL_HUB_STORAGE_UNAVAILABLE"));
 });
 return storeHandle;
}
async function dbGet(name,key){
 const db=await openStore();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(name,"readonly"),request=tx.objectStore(name).get(key);
  request.onsuccess=()=>resolve(request.result??null);
  request.onerror=()=>reject(Error("LOCAL_READ_FAILED"));
 });
}
async function dbPut(name,key,value){
 const db=await openStore();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(name,"readwrite");
  tx.objectStore(name).put(value,key);
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(Error("LOCAL_WRITE_FAILED"));
  tx.onabort=()=>reject(Error("LOCAL_WRITE_ABORTED"));
 });
}
async function credential(){
 const c=await dbGet("secrets","hubCredential");
 return c&&c.appId===APP_ID&&/^[a-f0-9]{64}$/i.test(c.credential)&&
  Date.parse(c.expiresAt)>Date.now()?c:null;
}
function client(){
 return createHubClient({appId:APP_ID,tokenProvider:async()=>{
  const c=await credential();
  return c?.credential??"";
 }});
}
async function enroll(invitation){
 if(!isStandalone())throw Error("OUVRE_L_ICONE_PWA_INSTALLÉE");
 const value=String(invitation??"").trim();
 const result=await enrollHubClient({appId:APP_ID,invitation:value,
  persistCredential:async secret=>dbPut("secrets","hubCredential",secret)});
 return {appId:APP_ID,registered:result.registered,transportEnabled:result.transportEnabled};
}
async function publishPilot(){
 if(APP_ID!=="gaming")throw Error("SOURCE_NOT_GAMING");
 const p=adapterConfig.pair?.(),job=await adapterConfig.preview?.();
 if(!p||!job)throw Error("JUMELAGE_OU_RÉSUMÉ_ABSENT");
 if(job.scope!=="installed_summary"||!p.scopes.includes(job.scope))throw Error("PÉRIMÈTRE_NON_AUTORISÉ");
 if(!await credential())throw Error("INSCRIPTION_LINK_NÉCESSAIRE");
 const key="gaming-nexus:"+p.id+":"+job.entityId+":"+job.revision;
 const saved=await dbGet("outbox",key);
 if(saved&&saved.fingerprint!==job.fingerprint)throw Error("RÉVISION_EN_CONFLIT");
 if(saved?.deliveredAt)return {sent:0,alreadyPublished:true};
 let record=saved;
 if(!record){
  const envelope=await sealForHub(p,{from:"gaming",to:"nexus",entityId:job.entityId,
   contractId:"gaming-nexus",scope:job.scope,schemaVersion:"gaming.proposal.v1",
   revision:job.revision,payload:job.payload});
  record={envelope,fingerprint:job.fingerprint,createdAt:new Date().toISOString()};
  // Persist THE ACTUAL ENCRYPTED BYTES before network I/O for retry stability.
  await dbPut("outbox",key,record);
 }
 const result=await client().publish(record.envelope);
 if(result.accepted!==true)throw Error("PUBLICATION_NON_CONFIRMÉE");
 await dbPut("outbox",key,{...record,deliveredAt:new Date().toISOString()});
 return {sent:1,replay:result.replay===true};
}
async function receivePilot(){
 if(APP_ID!=="nexus")throw Error("DESTINATION_NOT_NEXUS");
 if(!await credential())throw Error("INSCRIPTION_LINK_NÉCESSAIRE");
 const p=adapterConfig.pair?.();
 if(!p||typeof adapterConfig.ingest!=="function")throw Error("JUMELAGE_OU_IMPORT_NON_DISPONIBLE");
 let imported=0;
 const result=await client().drain(async item=>{
  if(item.fromApp!=="gaming"||item.contractId!=="gaming-nexus"||
      !p.scopes.includes(item.scope))throw Error("SOURCE_OU_PÉRIMÈTRE_NON_AUTORISÉ");
  const opened=await openFromHub(p,"gaming","nexus",item);
  const sourceKey=await window.NexusLinkCore.sourceKey(p,opened.entityId);
  const response=await adapterConfig.ingest({messageId:item.messageId,
   pairId:p.id,scope:item.scope,revision:item.revision,
   sourceKey,payload:opened.payload});
  if(response?.durable===true){imported++;return {durable:true,status:"persisted"}}
  return {durable:false};
 },{limit:20});
 return {seen:result.seen,acknowledged:result.acknowledged,
  needsRetry:result.needsRetry,imported};
}
const selectClasses=APP_ID==="gaming"?"btn secondary":"btn btn-neutral";
function attach(config){adapterConfig={...config}}
function mount(el){
 if(!el)return;
 // This controls-only form is embedded in the EXISTING app's LINK screen.
 // All changes to permissions, bridge definitions and revocation belong in LINK.
 el.replaceChildren();
 const wrapper=document.createElement("section");
 wrapper.style.cssText="padding:12px;border:1px solid rgba(120,160,185,.34);border-radius:12px;margin-top:14px";
 const heading=document.createElement("strong");heading.textContent="LINK Hub · contact unique";
 const intro=document.createElement("p");intro.style.fontSize="12px";
 intro.textContent="Inscription une seule fois dans cette PWA. LINK gère les passerelles et autorisations ; aucun ancien lien n’est effacé.";
 const status=document.createElement("p");status.style.fontSize="12px";status.setAttribute("role","status");
 const input=document.createElement("textarea");input.rows=2;
 input.placeholder="Code d’invitation de LINK (64 caractères)";
 input.setAttribute("aria-label","Invitation temporaire LINK");input.autocomplete="off";
 input.spellcheck=false;input.autocapitalize="off";
 input.style.cssText="display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:9px;border-radius:8px;font-size:13px";
 const enrollButton=document.createElement("button");enrollButton.type="button";enrollButton.className=selectClasses;
 enrollButton.textContent="Inscrire cette application à LINK";
 const syncButton=document.createElement("button");syncButton.type="button";syncButton.className=selectClasses;
 syncButton.textContent=APP_ID==="gaming"?"Envoyer le résumé test vers Nexus":"Recevoir les propositions via LINK";
 syncButton.style.marginLeft="5px";
 wrapper.append(heading,intro,status,input,enrollButton,syncButton);
 el.append(wrapper);
 const refresh=async()=>{
  const c=await credential().catch(()=>null);
  status.textContent=c?"Application inscrite · communication HTTPS chiffrée disponible si la passerelle est autorisée.":
   "Non inscrite. Dans LINK → Accès propriétaire → Invitation "+(APP_ID==="gaming"?"Gaming":"Nexus")+", copie le code ici.";
  syncButton.disabled=!c;
 };
 let busy=false;
 async function run(fn){
  if(busy)return;busy=true;enrollButton.disabled=true;syncButton.disabled=true;
  try{await fn()}catch(e){
   status.textContent="LINK : "+String(e?.message||"ERREUR").slice(0,90)+
    " · aucune donnée supprimée.";
  }finally{busy=false;await refresh().catch(()=>{});enrollButton.disabled=false}
 }
 enrollButton.addEventListener("click",()=>void run(async()=>{
  await enroll(input.value);
  input.value="";
  status.textContent="Inscription LINK enregistrée localement.";
 }));
 syncButton.addEventListener("click",()=>void run(async()=>{
  const result=APP_ID==="gaming"?await publishPilot():await receivePilot();
  status.textContent=APP_ID==="gaming"
   ?(result.alreadyPublished?"Résumé déjà envoyé, aucune écriture supplémentaire.":"Résumé chiffré transmis à LINK.")
   :(result.acknowledged+" proposition(s) enregistrée(s) dans Nexus, "+result.needsRetry+" à réessayer.");
  // Let Nexus re-render pending proposal list only after the durable ACK.
  if(APP_ID==="nexus"&&result.acknowledged>0)adapterConfig.onReceived?.();
 }));
 void refresh();
}
window.LinkHubAdapter=Object.freeze({attach,mount,enroll,publishPilot,receivePilot});

})();
