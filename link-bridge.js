/* LINK silent consent bridge v1 — lives in app, no new permanent settings UI.
 * Never receives/stores a pairing seed, user data, ciphertext, or app state.
 * All commands need a visible user action. Existing E2EE transport is unchanged.
 */
'use strict';
(()=>{
 const APP_ID="gaming";
 const LINK_URL='https://link-app.q9pfwtztsc.workers.dev/';
 const SCHEMA='link.management.v1';
 const VALID_IDS=['gaming-nexus','rituel-nexus','vestiaire-nexus',
  'sante-summary-nexus','sante-calendar-nexus','rituel-garage','nexus-garage'];
 const FLOW_APP={
  'gaming-nexus':['gaming','nexus'],
  'rituel-nexus':['rituel','nexus'],
  'vestiaire-nexus':['vestiaire','nexus'],
  'sante-summary-nexus':['sante','nexus'],
  'sante-calendar-nexus':['sante','nexus'],
  'rituel-garage':['rituel','garage'],
  'nexus-garage':['nexus','garage']
 };
 const NONCE=/^[a-zA-Z0-9_-]{12,42}$/;
 let active=false;
 const plain=b=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(b.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-b.length%4)%4)),c=>c.charCodeAt(0)));
 const encoded=value=>{
  const raw=new TextEncoder().encode(JSON.stringify(value));let binary='';
  for(const x of raw)binary+=String.fromCharCode(x);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 };
 function requestFromHash(){
  if(!location.hash.startsWith('#link-control='))return null;
  const code=location.hash.slice('#link-control='.length);
  if(code.length>800||!/^[A-Za-z0-9_-]+$/.test(code)||code.length%4===1)return null;
  try{
   const p=JSON.parse(plain(code)),keys=['schema','id','flow','app','action','step'];
   if(!p||Array.isArray(p)||typeof p!=='object'||Object.keys(p).some(k=>!keys.includes(k))||
     keys.some(k=>!Object.hasOwn(p,k))||p.schema!==SCHEMA||!NONCE.test(p.id)||
     !VALID_IDS.includes(p.flow)||p.app!==APP_ID||
     !['inspect','sync'].includes(p.action)||!['source','target'].includes(p.step)||
     FLOW_APP[p.flow][p.step==='source'?0:1]!==APP_ID)return null;
   return p;
  }catch{return null}
 }
 function statusFor(flow){
  if(APP_ID==='gaming'){
   if(flow!=='gaming-nexus'||!window.GamingNexusSync?.observation)return 'unavailable';
   return window.GamingNexusSync.observation().then(s=>s.paired?'ok':'not-configured');
  }
  if(APP_ID==='nexus'){
   if(flow==='gaming-nexus'&&window.NexusGamingImport?.observation){
    return Promise.resolve(window.NexusGamingImport.observation()).then(s=>s.paired?'ok':'not-configured');
   }
   const ids={ 'rituel-nexus':'rituel','sante-summary-nexus':'sante','sante-calendar-nexus':'sante',
    'nexus-garage':'garage'};
   const source=ids[flow];
   if(!source)return 'unavailable';
   // No introspection of private vaults from LINK. Other Nexus flows are not certified yet.
   return 'unavailable';
  }
  return 'unavailable';
 }
 async function execute(flow,step){
  if(APP_ID==='gaming'&&flow==='gaming-nexus'&&step==='source'){
   const s=await statusFor(flow);
   if(s!=='ok')return s;
   if(!window.GamingNexusSync?.send)return 'unavailable';
   const r=await window.GamingNexusSync.send({quiet:false});
   return r?.busy?'unavailable':(r?.errors>0||r?.remaining>0)?'error':'ok';
  }
  if(APP_ID==='nexus'&&flow==='gaming-nexus'&&step==='target'){
   const s=await statusFor(flow);
   if(s!=='ok')return s;
   if(!window.NexusGamingImport?.synchronize)return 'unavailable';
   await window.NexusGamingImport.synchronize();
   return 'ok';
  }
  return 'unavailable';
 }
 function returnToLink(req,status){
  const result={schema:SCHEMA,id:req.id,flow:req.flow,app:APP_ID,
   action:req.action,step:req.step,status,at:new Date().toISOString()};
  // Result has no IDs, keys, medical data or content. Fragment is never sent to server.
  const href=LINK_URL+'#link-return='+encoded(result);
  location.assign(href);
 }
 function show(req){
  if(active)return;active=true;
  const dialog=document.createElement('dialog');dialog.className='link-bridge-dialog';
  dialog.setAttribute('aria-label','Autorisation LINK');
  const title=document.createElement('h3');
  title.textContent='LINK · '+(req.action==='inspect'?'Vérifier la connexion':'Synchroniser');
  const detail=document.createElement('p');
  detail.textContent='Liaison '+req.flow.replaceAll('-',' → ')+
   '. Cette opération reste dans '+APP_ID+' et nécessite ton accord. Aucun secret ne sera transmis à LINK.';
  const feedback=document.createElement('p');feedback.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='link-bridge-actions';
  const accept=document.createElement('button');accept.type='button';
  accept.textContent=req.action==='inspect'?'Autoriser la vérification':'Autoriser la synchronisation';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Annuler';
  cancel.className='link-bridge-secondary';
  actions.append(accept,cancel);dialog.append(title,detail,feedback,actions);
  document.body.append(dialog);
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  cancel.addEventListener('click',()=>returnToLink(req,'cancelled'));
  accept.addEventListener('click',async()=>{
   accept.disabled=true;cancel.disabled=true;feedback.textContent='Traitement local en cours…';
   let status='unavailable';
   try{status=req.action==='inspect'?await statusFor(req.flow):await execute(req.flow,req.step);}
   catch(e){status='error'}
   if(!['ok','not-configured','locked','unavailable','error'].includes(status))status='error';
   feedback.textContent='Retour à LINK…';
   returnToLink(req,status);
  });
 }
 function start(){
  const command=requestFromHash();
  if(command)show(command);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('hashchange',start);
})();
