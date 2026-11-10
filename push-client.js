/* Gaming Web Push client — device token kept in local IndexedDB, not in JSON exports. */
'use strict';
(()=>{
const API='/api/v1/gaming-push',STORE='state',KEY='gaming_push_settings_v1',DB='gaming-personal-v1';
let provider=null,timer=null;
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
function open(){return new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function read(){const db=await open();return new Promise((ok,no)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);r.onsuccess=()=>{db.close();ok(r.result||null)};r.onerror=()=>{db.close();no(r.error)}})}
async function write(value){const db=await open();return new Promise((ok,no)=>{const tx=db.transaction(STORE,'readwrite');if(value===null)tx.objectStore(STORE).delete(KEY);else tx.objectStore(STORE).put(value,KEY);tx.oncomplete=()=>{db.close();ok()};tx.onerror=()=>{db.close();no(tx.error)}})}
async function call(path,method='GET',token='',body){
let res;try{res=await fetch(API+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'})}catch{throw Error('Cloudflare est inaccessible.')}
const data=await res.json().catch(()=>({error:'RESPONSE_INVALID'}));
if(!res.ok||!data.ok){const messages={RATE_LIMITED:'Un test toutes les 90 secondes.',DEVICE_ALREADY_REGISTERED:'Abonnement déjà lié à une autre clé sur cet iPhone.',SUBSCRIPTION_EXPIRED:'Abonnement expiré. Réactive les notifications.',PUSH_DELIVERY_FAILED:'Envoi du push non confirmé.',UNAUTHORIZED:'Appareil non reconnu. Réactive les notifications.'};throw Error(messages[data.error]||data.error||'Erreur serveur '+res.status)}return data;
}
const available=()=>'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator;
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
async function enable(){
 if(!available())throw Error('Les notifications Web Push ne sont pas disponibles sur ce navigateur.');
 if(!installed())throw Error('Ouvre Gaming depuis son icône sur l’écran d’accueil de ton iPhone.');
 // Always request permission directly in the click handler, before network I/O.
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 if(permission!=='granted')throw Error('Autorise Gaming dans Réglages iPhone → Notifications.');
 const config=await call('/config');if(!config.ready||!config.publicKey)throw Error('Le serveur push n’est pas prêt.');
 const reg=await navigator.serviceWorker.ready;
 const old=await reg.pushManager.getSubscription();
 const sub=old||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:un64(config.publicKey)});
 const saved=await read(),token=saved?.token||b64(crypto.getRandomValues(new Uint8Array(32)));
 const answer=await call('/register','POST',token,{subscription:sub.toJSON()});
 await write({enabled:true,token,deviceId:answer.deviceId,lastSync:null,count:0});
 await sync();return true;
}
async function disable(){
 const saved=await read();if(!saved)return;
 if(saved.enabled){await call('/unsubscribe','POST',saved.token,{deviceId:saved.deviceId});}
 const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();
 await write(null);
}
async function sync(){
 const saved=await read();if(!saved?.enabled||!provider)return 0;
 const jobs=await provider(),result=await call('/schedule','POST',saved.token,{deviceId:saved.deviceId,jobs});
 await write({...saved,lastSync:new Date().toISOString(),count:result.scheduled});return result.scheduled;
}
function queue(){clearTimeout(timer);timer=setTimeout(()=>{timer=null;sync().catch(e=>console.warn('Gaming push: retry when online',e.message))},2000)}
function attach(fn){provider=fn;read().then(r=>{if(r?.enabled)queue()}).catch(()=>{})}
async function test(){const saved=await read();if(!saved?.enabled)throw Error('Notifications non activées.');return call('/test','POST',saved.token,{deviceId:saved.deviceId})}
window.GamingPush=Object.freeze({read,enable,disable,sync,test,attach,queue,available,installed});
})();