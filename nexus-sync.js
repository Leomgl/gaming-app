/* Gaming -> NEXUS LINK: encrypted consented proposals. v1. */
'use strict';
(()=>{
let adapter=null,busy=false,timer=null;
const K='gaming_link_auto_v1';
const text=(x,n=140)=>String(x??'').trim().slice(0,n);
const valid=d=>typeof d==='string'&&/^\d{4}-\d\d-\d\d$/.test(d)&&!isNaN(new Date(d+'T12:00:00').getTime());
const dateNow=()=>{let d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const sha=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const pair=()=>adapter?.state().connections?.find(x=>x.sourceApp==='gaming');
const auto=()=>{try{return localStorage.getItem(K)==='yes'}catch{return false}};
const setAuto=enabled=>{try{localStorage.setItem(K,enabled?'yes':'no')}catch{}};
function build(){
 const p=pair();if(!p)return [];
 const d=adapter.state(),scope=new Set(p.scopes),out=[],gname=id=>text(d.games.find(g=>g.id===id)?.title||'Jeu inconnu',100);
 const push=(id,permission,target,title,meta={})=>{
  if(!scope.has(permission))return;
  const payload={type:'gaming.proposal.v1',sourceApp:'gaming',destination:target,sourceId:text(id,140),
    title:text(title,140),game:text(meta.game,100),details:text(meta.details,500),
    date:valid(meta.date)?meta.date:'',time:/^([01]\d|2[0-3]):[0-5]\d$/.test(meta.time||'')?meta.time:'10:00',
    priceCents:Number.isSafeInteger(meta.priceCents)&&meta.priceCents>=0?meta.priceCents:null,
    currency:'EUR',isPaid:meta.isPaid===true,paymentDate:valid(meta.paymentDate)?meta.paymentDate:'',
    season:Number.isInteger(meta.season)&&meta.season>0?meta.season:null};
  out.push({entityId:permission+':'+id+':'+target,scope:permission,payload});
 };
 for(const it of d.items){
  if(!it?.id||!it?.title||it.status==='canceled')continue;
  const name=gname(it.gameId),title=text(it.title),date=valid(it.date)?it.date:'';
  const price=Number.isSafeInteger(it.priceCents)&&it.priceCents>0?it.priceCents:null;
  if(it.kind==='pass'){
   const season=Number.isSafeInteger(Number(it.seasonNumber))&&Number(it.seasonNumber)>0?Number(it.seasonNumber):null;
   const titlePrefix=name+(season?' · Saison '+season:'');
   const purchased=it.passOwned===true||it.passOwned==null&&it.status==='paid';
   if(date&&it.dateConfidence==='confirmed'&&it.status!=='finished'){
    push(it.id+':end','pass_deadline','events',titlePrefix+' · Fin de saison',
      {game:name,date,season,details:'Pass '+(purchased?'acheté':'non acheté')+'.'});
    for(const milestone of adapter.seasonDates(it)){
     if(milestone.date<dateNow())continue;
     push(it.id+':'+milestone.id,'pass_deadline','tasks',titlePrefix+' · '+milestone.title,
      {game:name,date:milestone.date,season,details:'Rappel Gaming prévu à 10 h.'});
    }
   }
   if(purchased&&price!=null)push(it.id+':paid','pass_paid','transactions',titlePrefix+' · Pass de combat',
    {game:name,priceCents:price,season,isPaid:true,paymentDate:valid(it.paidDate)?it.paidDate:'',
     details:valid(it.paidDate)?'Achat de pass confirmé dans Gaming, le '+it.paidDate+'.':'Achat confirmé dans Gaming. Renseigner la date réelle avant validation NEXUS.'});
  }else if(it.kind==='expense'){
   if(!['finished','paid'].includes(it.status))
    push(it.id,'future_spending','purchases',name+' · '+title,
      {game:name,date,priceCents:price,details:'Achat gaming à prévoir.'});
  }else if(it.kind==='dlc'||it.kind==='release'){
   const permission=it.kind==='dlc'?'dlc_release':'game_release';
   if(date&&it.dateConfidence==='confirmed')
    push(it.id+':date',permission,'events',name+' · '+title,{game:name,date,details:'Date suivie dans Gaming.'});
   if(!['finished','paid'].includes(it.status))
    push(it.id+':purchase',permission,'purchases',name+' · '+title,{game:name,date,priceCents:price,details:'Achat éventuel à prévoir.'});
  }else if(it.kind==='event'&&date&&it.dateConfidence==='confirmed')
   push(it.id,'gaming_event','events',name+' · '+title,{game:name,date,details:'Événement Gaming.'});
 }
 if(scope.has('installed_summary')){
  const owned=d.games.filter(g=>g.owned===true||(g.owned==null&&g.status!=='wishlist')).length;
  const installed=d.games.filter(g=>g.status==='installed').length;
  const stored=d.games.filter(g=>g.status==='stored').length;
  push('library-summary','installed_summary','notes','Gaming · Bibliothèque',
   {game:'Gaming',details:owned+' possédés · '+installed+' installés · '+stored+' stockés.'});
 }
 return out.slice(0,400);
}
async function preview(){
 const p=pair();if(!p)return {total:0,changed:0,jobs:[]};
 const old=adapter.state().linkOutbox||[],jobs=[];
 for(const job of build()){
  const fingerprint=await sha(JSON.stringify(job.payload));
  const previous=old.find(x=>x.pairId===p.id&&x.entityId===job.entityId);
  jobs.push({...job,fingerprint,changed:!previous||previous.fingerprint!==fingerprint,
   revision:!previous||previous.fingerprint!==fingerprint?Math.min(1e6,(previous?.revision||0)+1):previous.revision});
 }
 return {total:jobs.length,changed:jobs.filter(x=>x.changed).length,jobs};
}
async function send(opts={}){
 if(busy)return {busy:true};
 const p=pair();if(!p)throw Error('Jumelle Gaming à NEXUS.');
 if(!navigator.onLine)throw Error('Connexion Internet nécessaire.');
 if(!window.NexusLinkCore)throw Error('Module NEXUS LINK indisponible.');
 busy=true;let count=0,errors=0;
 try{
  const state=await preview();
  for(const job of state.jobs.filter(j=>j.changed).slice(0,35)){
   try{
    await window.NexusLinkCore.publish(p,{entityId:job.entityId,scope:job.scope,revision:job.revision,payload:job.payload});
    const arr=adapter.state().linkOutbox;
    const index=arr.findIndex(x=>x.pairId===p.id&&x.entityId===job.entityId);
    const entry={pairId:p.id,entityId:job.entityId,revision:job.revision,fingerprint:job.fingerprint,sentAt:new Date().toISOString()};
    if(index>=0)arr[index]=entry;else arr.push(entry);
    await adapter.persist();count++;
   }catch(e){errors++;console.warn('Gaming LINK',e.message)}
  }
  if(!opts.quiet)adapter.toast(count+' proposition(s) transmise(s)'+(errors?', '+errors+' échec(s)':'')+'.');
  return {count,errors,remaining:Math.max(0,state.changed-count)};
 }finally{busy=false}
}
function queue(){if(!auto()||!pair())return;clearTimeout(timer);timer=setTimeout(()=>{
 timer=null;send({quiet:true}).catch(e=>console.warn('Lien Gaming',e.message));
},4000)}
async function panel(){
 const p=pair();if(!p)return adapter.toast('Connecte Gaming à NEXUS pour synchroniser.');
 const stats=await preview();
 adapter.modal('Gaming → NEXUS',`<div class="g7-sync">
 <div class="notice">Envoi chiffré des propositions. Aucune dépense ni rendez-vous ne sera créé sans validation dans NEXUS.</div>
 <div class="g7-stats"><div><strong>${stats.total}</strong><small>propositions possibles</small></div>
 <div><strong>${stats.changed}</strong><small>à envoyer ou actualiser</small></div></div>
 <p class="hint">Autorisations de ton jumelage : ${p.scopes.map(x=>adapter.escape(x)).join(', ')}. Pour les modifier, révoque le lien depuis NEXUS et jumelle à nouveau.</p>
 <label class="g7-auto"><input id="g7-auto" type="checkbox" ${auto()?'checked':''}>
 <span><strong>Synchronisation automatique (facultative)</strong><small>Envoie les nouveautés quand Gaming est ouverte et connectée.</small></span></label>
 <div class="formactions"><button class="btn" id="g7-send">Envoyer maintenant</button>
 <button class="btn secondary" id="g7-refresh">Actualiser</button></div>
 <p class="hint">Les changements de date ou de montant sont proposés à nouveau. Supprimer un élément dans Gaming ne supprime rien de NEXUS.</p></div>`);
 document.getElementById('g7-auto')?.addEventListener('change',e=>{setAuto(e.target.checked);if(e.target.checked)queue();});
 document.getElementById('g7-send')?.addEventListener('click',async e=>{
  e.currentTarget.disabled=true;try{await send();await panel()}catch(err){alert(err.message);e.currentTarget.disabled=false}
 });
 document.getElementById('g7-refresh')?.addEventListener('click',()=>panel());
}
function attach(model){adapter=model;window.addEventListener('online',queue);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});if(auto())queue()}
window.GamingNexusSync=Object.freeze({attach,build,preview,send,panel,queue});
})();