"use strict";
/* Gaming V0.7 — encrypted inter-app sync, library, seasons and iOS push. */
const DB_NAME='gaming-personal-v1',STORE='state';
const STORAGE=[
 {id:'ps5-internal',type:'internal',label:'SSD interne PS5',capacityGB:null},
 {id:'ps5-m2',type:'m2',label:'SSD M.2',capacityGB:null},
 {id:'ps5-usb',type:'usb',label:'Disque USB externe',capacityGB:null}
];
const THEMES=[['night','Night Ops','Cockpit sombre actuel'],['nebula','Nebula','Sombre, bleu-violet'],['carbon','Carbon','Noir et contrasté'],['slate','Ardoise','Clair, doux et minimal']];
const ACCENTS=[['lime','Lime'],['cyan','Cyan'],['violet','Violet'],['amber','Ambre'],['red','Rouge']];
const INITIAL=()=>({version:1,games:[],items:[],storage:STORAGE.map(s=>({...s})),trash:[],connections:[],linkOutbox:[],preferences:{theme:'night',accent:'lime'}});
const today=()=>new Date().toLocaleDateString('sv-SE');
let data=INITIAL(),db=null,page='home',gameFilter='all',platformFilter='all',storageFilter='all',gameSort='recent',itemFilter='all',trackingTab='passes',calendarMonth=today().slice(0,7),calendarDay=today(),query='';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();

const fmt=s=>s?new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Date à confirmer';
const euro=n=>n==null?'—':(n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const euros=s=>{if(String(s??'').trim()==='')return null;const n=Number(String(s).trim().replace(',','.'));return Number.isFinite(n)&&n>=0&&n<10000000?Math.round(n*100):NaN};
const validDate=s=>!s||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T12:00:00').getTime())&&new Date(s+'T12:00:00').toLocaleDateString('sv-SE')===s);
const select=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const relativeDays=date=>date?Math.round((new Date(date+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000):null;
const gameTitle=id=>data.games.find(g=>g.id===id)?.title||'Aucun jeu associé';
const storageName=id=>data.storage.find(s=>s.id===id)?.label||'Sans emplacement';
const isOwned=g=>g.owned===true||(g.owned==null&&g.status!=='wishlist');
const gameStatus=g=>g.status==='wishlist'?'À acheter':g.status==='uninstalled'?'Non installé':g.status==='backlog'?'À jouer':g.platform==='PS5'&&g.storageId==='ps5-usb'?'Stocké · transfert requis':g.status==='stored'?'Stocké':'Installé';
const onDevice=g=>['installed','stored'].includes(g.status);
const needsInstall=g=>isOwned(g)&&!onDevice(g);
const types={pass:'Pass',dlc:'DLC',release:'Nouveauté',event:'Événement',expense:'Dépense prévue'};
let saveChain=Promise.resolve(),toastTimer;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function load(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function normalize(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.games)||!Array.isArray(raw.items))throw Error('Format Gaming invalide');
 const d=INITIAL();d.games=raw.games.filter(x=>x&&typeof x==='object'&&x.id&&x.title).slice(0,10000)
 .map(g=>({...g,owned:typeof g.owned==='boolean'?g.owned:g.status!=='wishlist'}));
 d.items=raw.items.filter(x=>x&&typeof x==='object'&&x.id&&x.title).slice(0,10000);
 d.trash=Array.isArray(raw.trash)?raw.trash.filter(x=>x&&x.id&&x.record).slice(0,10000):[];
 d.connections=Array.isArray(raw.connections)?raw.connections.filter(x=>x&&x.id&&x.seed&&x.sourceApp==='gaming').slice(0,5):[];
 d.linkOutbox=Array.isArray(raw.linkOutbox)?raw.linkOutbox.filter(x=>x&&typeof x.pairId==='string'&&typeof x.entityId==='string'&&Number.isSafeInteger(x.revision)&&x.revision>=1&&x.revision<=1e6&&/^[a-f0-9]{64}$/.test(x.fingerprint||'')).slice(0,4000):[];
 const prefs=raw.preferences&&typeof raw.preferences==='object'?raw.preferences:{};
 d.preferences={theme:select(prefs.theme,THEMES.map(x=>x[0]),'night'),accent:select(prefs.accent,ACCENTS.map(x=>x[0]),'lime')};
 for(const s of d.storage){const v=Array.isArray(raw.storage)?raw.storage.find(x=>x.id===s.id):null;if(v){const n=Number(v.capacityGB);s.capacityGB=v.capacityGB==null||v.capacityGB===''?null:Number.isFinite(n)&&n>=0&&n<=1e5?n:null;}}
 return d;
}
function storeSnapshot(snapshot){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(snapshot,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function persist(){const snapshot=JSON.parse(JSON.stringify(data));saveChain=saveChain.catch(()=>{}).then(()=>storeSnapshot(snapshot));window.GamingPush?.queue?.();window.GamingNexusSync?.queue?.();return saveChain.catch(e=>{toast('Échec de sauvegarde locale : export nécessaire.');throw e;});}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function modal(title,body){$('modal-title').textContent=title;$('modal-body').innerHTML=body;$('overlay').hidden=false;}
function closeModal(){$('overlay').hidden=true;$('modal-body').innerHTML='';}
function go(next){page=next;render();window.scrollTo({top:0,behavior:'instant'});}
const empty=(title,detail)=>`<div class="empty"><strong>${title}</strong>${detail}</div>`;
const section=(title,description,content,action='')=>`<section class="section"><div class="heading"><div><h2>${title}</h2>${description?`<p>${description}</p>`:''}</div>${action}</div>${content}</section>`;

function applyAppearance(){
 const prefs=data.preferences||{theme:'night',accent:'lime'};
 const theme=select(prefs.theme,THEMES.map(x=>x[0]),'night');
 const accent=select(prefs.accent,ACCENTS.map(x=>x[0]),'lime');
 document.documentElement.setAttribute('data-theme',theme);
 document.documentElement.setAttribute('data-accent',accent);
 const color={night:'#0e131d',nebula:'#161329',carbon:'#0b0d10',slate:'#f2f4f1'}[theme];
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
}
async function setAppearance(which,value){
 const options=which==='theme'?THEMES:which==='accent'?ACCENTS:null;
 if(!options||!options.some(x=>x[0]===value))return;
 data.preferences={...(data.preferences||{theme:'night',accent:'lime'}),[which]:value};
 applyAppearance();await persist();render();toast('Apparence mise à jour.');
}
const gameIsOnUsb=g=>g.storageId==='ps5-usb'&&onDevice(g);
const linkedItems=id=>data.items.filter(item=>item.gameId===id);
const gameFlag=g=>g.favorite?'★':'☆';
const validGameStorage=(g,id)=>data.storage.some(s=>s.id===id)&&onDevice(g);
function storageUsage(id){
 const games=data.games.filter(g=>g.storageId===id&&onDevice(g));
 const withSize=games.filter(g=>Number.isFinite(Number(g.sizeGB))&&g.sizeGB!==null&&g.sizeGB!=='');
 const knownGB=withSize.reduce((sum,g)=>sum+Number(g.sizeGB),0);
 return {games,knownGB,unknownCount:games.length-withSize.length};
}
async function moveGame(id,target){
 const g=data.games.find(x=>x.id===id);
 if(!g||!validGameStorage(g,target))return;
 const destination=data.storage.find(s=>s.id===target);
 if(g.storageId===target){toast('Le jeu est déjà sur ce support.');return;}
 const previous=g.storageId;
 g.storageId=target;
 if(g.platform==='PS5'&&target==='ps5-usb')g.status='stored';
 else g.status='installed';
 g.owned=true;
 g.updatedAt=new Date().toISOString();
 await persist();render();gameDetail(id);
 toast(g.platform==='PS5'&&target==='ps5-usb'?'Jeu stocké sur USB : transfert requis pour jouer.':'Emplacement mis à jour.');
}

async function markGameUninstalled(id){
 const g=data.games.find(x=>x.id===id);
 if(!g||!isOwned(g)||!onDevice(g))return;
 if(!confirm('Marquer « '+g.title+' » comme désinstallé ? Gaming ne supprimera aucun fichier de la console.'))return;
 g.status='uninstalled';g.storageId='';g.owned=true;g.updatedAt=new Date().toISOString();
 await persist();render();gameDetail(id);toast('Jeu classé dans « Possédés non installés ».');
}

function gameDetail(id){
 const g=data.games.find(x=>x.id===id);if(!g)return;
 const related=linkedItems(id),usage=storageUsage(g.storageId);
 const playable=g.platform!=='PS5'||g.storageId!=='ps5-usb';
 modal('Fiche jeu · '+g.title,`<div class="g3-detail">
  <div class="g3-cover g5-detail-cover">${gamePoster(g,true)}<div><small>${esc(g.platform)}</small>
   <h3>${esc(g.title)}</h3><p>${esc(g.genre||'Genre non renseigné')}${g.favorite?' · ★ Favori':''}</p></div></div>
  <div class="g6-detail-cover-bar"><button class="btn secondary small" data-action="find-cover" data-id="${esc(g.id)}">Trouver une jaquette</button>
    ${g.coverSource?`<a class="g6-cover-credit" href="${esc(g.coverSource)}" target="_blank" rel="noopener noreferrer">Source Wikipédia</a>`:''}</div>
  <div class="g3-summary-grid">
   <div><small>État</small><strong>${esc(gameStatus(g))}</strong></div>
   <div><small>Bibliothèque</small><strong>${isOwned(g)?'Possédé':'Non possédé'}</strong></div>
   <div><small>Taille</small><strong>${g.sizeGB==null?'Inconnue':Number(g.sizeGB).toLocaleString('fr-FR')+' Go'}</strong></div>
   <div><small>Emplacement</small><strong>${esc(storageName(g.storageId))}</strong></div>
   <div><small>Suivis liés</small><strong>${related.length}</strong></div>
  </div>
  ${!playable&&gameIsOnUsb(g)?'<div class="g3-warning">Jeu PS5 conservé sur USB. Pour le lancer, transfère-le sur le SSD interne ou M.2 compatible.</div>':''}
  ${g.notes?`<div class="g3-detail-note"><strong>Notes</strong><p>${esc(g.notes)}</p></div>`:''}
  ${needsInstall(g)?`<div class="g3-detail-block"><div class="row"><h4>Jeu possédé · non installé</h4>
     <button class="btn small" data-action="install-game" data-id="${esc(g.id)}">Renseigner l’installation</button></div>
     <p class="hint">Tu possèdes ce jeu. Il est conservé dans ta bibliothèque sans compter dans le stockage.</p></div>`:''}
  ${validGameStorage(g,g.storageId)?`<div class="g3-detail-block"><h4>Déplacer le jeu</h4>
   <div class="g3-targets">${data.storage.map(loc=>`<button data-action="move-game" data-id="${esc(g.id)}" data-target="${esc(loc.id)}" ${loc.id===g.storageId?'disabled':''}>${esc(loc.label)}${loc.id===g.storageId?' ✓':''}</button>`).join('')}</div>
   <p class="hint">Déplacement déclaré manuellement : cette action ne déplace pas physiquement les fichiers sur ta console.</p>
   ${isOwned(g)?`<button class="btn secondary small" data-action="uninstall-game" data-id="${esc(g.id)}">Marquer comme désinstallé</button>`:''}</div>`:''}
  <div class="g3-detail-block"><div class="row"><h4>Passes, DLC et événements</h4><button class="btn secondary small" data-action="new-related-item" data-id="${esc(g.id)}">＋ Lier</button></div>
   ${related.length?related.map(itemRow).join(''):empty('Aucun suivi lié','Ajoute un pass, une sortie ou un événement à ce jeu.')}
  </div>
  <div class="formactions"><button class="btn secondary" data-action="close">Fermer</button>
   <button class="btn" data-action="edit-game" data-id="${esc(g.id)}">Modifier la fiche</button></div>
 </div>`);
}


const SEASON_REMINDERS=[['mid','Mi-saison'],['14d','2 semaines avant la fin'],['7d','1 semaine avant la fin']];
function seasonReminderFlags(pass){
 // Old V0.4 passes have no flags; preserve old choices but use season defaults on new passes.
 const source=Array.isArray(pass.seasonReminders)?pass.seasonReminders:['mid','14d','7d'];
 return [...new Set(source.filter(x=>SEASON_REMINDERS.some(([id])=>id===x)))];
}
function seasonDates(pass){
 if(!pass||pass.kind!=='pass'||!pass.startDate||!pass.date||!validDate(pass.startDate)||!validDate(pass.date)||pass.startDate>pass.date)return [];
 const start=new Date(pass.startDate+'T12:00:00'),end=new Date(pass.date+'T12:00:00');
 const dayMs=86400000;
 const midpoint=new Date(start.getTime()+Math.floor((end.getTime()-start.getTime())/(2*dayMs))*dayMs);
 const fmtDay=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
 const options=[
  {id:'mid',title:'Mi-saison',date:fmtDay(midpoint)},
  {id:'14d',title:'Fin de saison dans 2 semaines',date:fmtDay(new Date(end.getTime()-14*dayMs))},
  {id:'7d',title:'Fin de saison dans 1 semaine',date:fmtDay(new Date(end.getTime()-7*dayMs))}
 ];
 const enabled=seasonReminderFlags(pass);
 const seen=new Set();
 return options.filter(x=>enabled.includes(x.id)&&x.date>=pass.startDate&&x.date<=pass.date&&!seen.has(x.date)&&seen.add(x.date))
  .map(x=>({...x,time:'10:00'}));
}
function seasonProgress(pass){
 if(!pass.startDate||!pass.date||!validDate(pass.startDate)||!validDate(pass.date)||pass.startDate>=pass.date)return null;
 const start=new Date(pass.startDate+'T12:00:00').getTime(),end=new Date(pass.date+'T12:00:00').getTime();
 const now=new Date(today()+'T12:00:00').getTime();
 return Math.max(0,Math.min(100,Math.round((now-start)/(end-start)*100)));
}
const seasonNumber=pass=>Number.isSafeInteger(Number(pass.seasonNumber))&&Number(pass.seasonNumber)>0?Number(pass.seasonNumber):null;
const ownershipLabel=pass=>pass.passOwned===true||pass.status==='paid'&&pass.passOwned!==false?'Pass acheté':'Pass non acheté';
const coverSafe=value=>{
 if(typeof value!=='string'||!value.trim())return '';
 try{const url=new URL(value.trim());return url.protocol==='https:'&&url.username===''&&url.password===''&&url.href.length<=500?url.href:'';}catch{return '';}
};
function gamePoster(g,small=false){
 const genre=(g.genre||'').toLowerCase();
 const mood=/course|race|automobile|driving|simulation/.test(genre)?'speed':/fps|shooter|action|militaire|battle/.test(genre)?'tactical':/survie|survival|mmo|rpg|aventure/.test(genre)?'explore':'default';
 const url=coverSafe(g.coverUrl);
 return `<div class="g5-poster g5-${mood} ${small?'g5-poster-small':''}">
  ${url?`<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}
  <span class="g5-poster-glyph" aria-hidden="true">${esc((g.title||'G').slice(0,1).toUpperCase())}</span>
  <span class="g5-poster-platform">${esc(g.platform)}</span>
 </div>`;
}
function gameTile(g){
 const passes=linkedItems(g.id).filter(i=>i.kind==='pass');
 const active=passes.find(i=>i.status==='active'||i.status==='planned');
 return `<article class="g5-game-card">
   <button type="button" class="g5-game-cover-action" data-action="view-game" data-id="${esc(g.id)}" aria-label="Ouvrir la fiche de ${esc(g.title)}">
    ${gamePoster(g)}
   </button>
   <div class="g5-game-info"><div class="row"><button class="g5-game-title" data-action="view-game" data-id="${esc(g.id)}">${esc(g.title)}</button>
   <button class="g5-favorite" data-action="toggle-favorite" data-id="${esc(g.id)}" aria-label="${g.favorite?'Retirer des':'Ajouter aux'} favoris" aria-pressed="${!!g.favorite}">${g.favorite?'★':'☆'}</button></div>
   <div class="g5-game-meta">${isOwned(g)?'✓ Possédé':'○ Non possédé'} · ${esc(gameStatus(g))}${onDevice(g)?' · '+esc(storageName(g.storageId)):''}</div>
   ${active?`<div class="g5-game-season">◷ Saison ${seasonNumber(active)??'—'} · ${esc(active.date?fmt(active.date):'fin inconnue')}</div>`:''}
   <div class="g5-game-actions">
   ${needsInstall(g)?`<button class="btn secondary small" data-action="install-game" data-id="${esc(g.id)}">＋ Installer</button>`:''}
   <button class="btn secondary small" data-action="view-game" data-id="${esc(g.id)}">Fiche</button>
   <button class="btn secondary small" data-action="find-cover" data-id="${esc(g.id)}">Jaquette</button>
   <button class="btn secondary small" data-action="new-related-item" data-id="${esc(g.id)}">＋ Pass / DLC</button></div>
   </div>
 </article>`;
}
async function toggleFavorite(id){
 const game=data.games.find(g=>g.id===id);
 if(!game)return;
 game.favorite=!game.favorite;game.updatedAt=new Date().toISOString();
 await persist();render();toast(game.favorite?'Ajouté aux favoris.':'Favori retiré.');
}

function gameRow(g){
 const warning=g.platform==='PS5'&&gameIsOnUsb(g);
 const linked=linkedItems(g.id).length;
 return `<div class="item g3-game-row"><button class="g3-tile" data-action="view-game" data-id="${esc(g.id)}" aria-label="Ouvrir ${esc(g.title)}">${esc(g.title.slice(0,1).toUpperCase())}</button>
 <div class="item-body"><button class="g3-game-name" data-action="view-game" data-id="${esc(g.id)}">${esc(g.title)} ${g.favorite?'<span class="g3-favorite">★</span>':''}</button>
 <small>${esc(g.platform)} · ${esc(gameStatus(g))} · ${esc(storageName(g.storageId))}</small>
 <div class="g3-game-tags">${g.genre?`<span>${esc(g.genre)}</span>`:''}${g.sizeGB!=null?`<span>${Number(g.sizeGB).toLocaleString('fr-FR')} Go</span>`:''}
 ${linked?`<span>${linked} suivi(s)</span>`:''}</div>
 ${warning?'<p class="warning">USB : transfert requis avant de jouer sur PS5.</p>':''}</div>
 <div class="item-end"><button data-action="view-game" data-id="${esc(g.id)}">Ouvrir</button>
 <button data-action="edit-game" data-id="${esc(g.id)}">Modifier</button></div></div>`;
}

const REMINDER_PRESETS=[[10080,'7 jours'],[1440,'1 jour'],[120,'2 heures'],[45,'45 min'],[15,'15 min']];
const isDated=item=>!!(item.date&&validDate(item.date));
const isConfirmed=item=>isDated(item)&&item.dateConfidence==='confirmed';
const isActiveItem=item=>!['canceled','finished'].includes(item.status);
function reminderMinutes(item){
 const list=Array.isArray(item?.reminderMinutes)?item.reminderMinutes:[];
 return [...new Set(list.map(Number).filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=40320))].sort((a,b)=>b-a).slice(0,10);
}
function reminderLabel(minutes){
 if(minutes%10080===0)return minutes/10080+' sem.';
 if(minutes%1440===0)return minutes/1440+' j';
 if(minutes%60===0)return minutes/60+' h';
 return minutes+' min';
}
function passProgress(t){
 const target=Number(t.targetLevel),current=Number(t.currentLevel);
 if(!Number.isFinite(target)||target<1||!Number.isFinite(current)||current<0)return null;
 return {level:Math.min(Math.round(current),Math.round(target)),target:Math.round(target),
  pct:Math.max(0,Math.min(100,Math.round(100*current/target)))};
}
function deadline(t){
 const days=relativeDays(t.date);
 if(days===null)return {label:'Sans échéance',tone:'unknown'};
 if(t.dateConfidence!=='confirmed')return {label:'Date '+(t.dateConfidence==='tentative'?'provisoire':'à confirmer'),tone:'unknown'};
 if(days<0)return {label:'Échéance passée',tone:'past'};
 if(days===0)return {label:"Aujourd'hui",tone:'urgent'};
 if(days===1)return {label:'Demain',tone:'urgent'};
 if(days<=7)return {label:'J-'+days,tone:'soon'};
 return {label:'J-'+days,tone:'normal'};
}
function passCard(t){
 const due=deadline(t),season=seasonNumber(t),pct=seasonProgress(t),steps=seasonDates(t);
 const purchased=t.passOwned===true||t.passOwned==null&&t.status==='paid';
 return `<article class="g4-pass-card card g5-season-card">
  <div class="row g4-pass-head"><div><span class="eyebrow">${esc(gameTitle(t.gameId))} · ${season?'SAISON '+season:'SAISON NON RENSEIGNÉE'}</span>
    <h3>${esc(t.title)}</h3></div><span class="g4-deadline g4-${due.tone}">${esc(due.label)}</span></div>
  <div class="g5-season-states"><span class="g5-owned ${purchased?'is-owned':''}">${purchased?'✓ Pass acheté':'○ Pass non acheté'}</span>
  <span class="g5-season-status">${esc(t.status==='finished'?'Terminée':t.status==='canceled'?'Annulée':t.status==='planned'?'À venir':'Suivie')}</span></div>
  <div class="g4-pass-progress"><div class="row"><span class="muted">Avancement de la saison</span>
    <strong>${pct==null?'Dates à compléter':pct+' %'}</strong></div>
    <div class="bars"><i style="width:${pct??0}%"></i></div></div>
  <div class="g5-season-dates"><div><small>Début</small><strong>${fmt(t.startDate)}</strong></div>
  <div><small>Fin</small><strong>${fmt(t.date)}</strong></div></div>
  <div class="g5-season-alerts"><span class="muted">Rappels activés :</span> ${steps.length?steps.map(m=>`<span>${esc(m.title)}</span>`).join(''):'Aucun'}</div>
  <div class="g5-game-actions"><button class="btn secondary small" data-action="view-game" data-id="${esc(t.gameId)}" ${!data.games.some(g=>g.id===t.gameId)?'disabled':''}>Voir le jeu</button>
  <button class="btn secondary small" data-action="edit-item" data-id="${esc(t.id)}">Modifier la saison</button></div>
 </article>`;
}
async function changePassLevel(id,delta){
 const t=data.items.find(x=>x.id===id&&x.kind==='pass');if(!t)return;
 const p=passProgress(t);if(!p)return;
 t.currentLevel=Math.max(0,Math.min(p.target,p.level+delta));
 t.updatedAt=new Date().toISOString();
 await persist();render();toast('Progression mise à jour.');
}
function shiftMonth(delta){
 const year=Number(calendarMonth.slice(0,4)),month=Number(calendarMonth.slice(5,7));
 const d=new Date(year,month-1+delta,1,12);
 calendarMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
 const valid=calendarDay.startsWith(calendarMonth);
 if(!valid)calendarDay=calendarMonth+'-01';
 render();
}
function calendarMarkup(){
 const [year,month]=calendarMonth.split('-').map(Number);
 const first=new Date(year,month-1,1,12),last=new Date(year,month,0,12).getDate();
 const startOffset=(first.getDay()+6)%7;
 const slots=Math.ceil((startOffset+last)/7)*7;
 const title=first.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
 const valid=data.items.filter(t=>isDated(t)&&t.kind!=='expense'&&isActiveItem(t));
 const milestones=data.items.filter(p=>p.kind==='pass'&&isActiveItem(p)&&isConfirmed(p)).flatMap(p=>
   seasonDates(p).map(m=>({...p,id:p.id,title:m.title+' · '+p.title,kind:'event',date:m.date,dateConfidence:'confirmed',priceCents:null,reminderMinutes:[]})));
 valid.push(...milestones);
 const byDay={};
 valid.forEach(t=>{(byDay[t.date]??=[]).push(t)});
 const days=Array.from({length:slots},(_,i)=>{
  const day=i-startOffset+1;
  if(day<1||day>last)return '<div class="g4-calendar-blank" aria-hidden="true"></div>';
  const date=calendarMonth+'-'+String(day).padStart(2,'0'),ev=byDay[date]||[];
  const certain=ev.some(isConfirmed);
  return `<button type="button" class="g4-calendar-day ${date===calendarDay?'selected':''} ${date===today()?'today':''}"
   data-action="calendar-day" data-date="${date}" aria-label="${day} : ${ev.length} événement(s)" aria-pressed="${date===calendarDay}">
   <span>${day}</span>${ev.length?`<i class="${certain?'':'tentative'}" title="${ev.length} événement(s)"></i>`:''}</button>`;
 }).join('');
 const selected=byDay[calendarDay]||[];
 return `<div class="g4-calendar-wrap card">
 <div class="row g4-calendar-title"><button class="btn secondary small" data-action="calendar-prev" aria-label="Mois précédent">‹</button>
  <h3>${esc(title)}</h3><button class="btn secondary small" data-action="calendar-next" aria-label="Mois suivant">›</button></div>
 <div class="g4-calendar-grid g4-weekdays">${['L','M','M','J','V','S','D'].map(x=>`<strong>${x}</strong>`).join('')}</div>
 <div class="g4-calendar-grid">${days}</div>
 <div class="g4-calendar-legend"><span>● Date confirmée</span><span>○ Date à confirmer</span></div>
 <div class="g4-calendar-selected"><h4>${fmt(calendarDay)} · ${selected.length} élément(s)</h4>
  ${selected.length?selected.map(itemRow).join(''):empty('Aucun événement ce jour','Sélectionne un jour marqué ou ajoute une échéance.')}</div></div>`;
}
function calendarDateToUTC(date,time){
 if(!validDate(date)||!date)return null;
 const clock=/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'')?time:'18:00';
 const d=new Date(date+'T'+clock+':00');
 return Number.isFinite(d.getTime())?d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''):null;
}
function escapeIcs(value){
 return String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function foldIcs(str){
 const lines=String(str).split('\r\n');
 return lines.map(line=>{
  let output='',count=0;
  for(const char of line){
   const bytes=new TextEncoder().encode(char).length;
   if(count+bytes>73){output+='\r\n ';count=1;}
   output+=char;count+=bytes;
  }
  return output;
 }).join('\r\n');
}
function buildCalendarIcs(items=data.items){
 const eligible=items.filter(t=>t.kind!=='expense'&&isActiveItem(t)&&isConfirmed(t));
 const extra=items.filter(t=>t.kind==='pass'&&isActiveItem(t)&&isConfirmed(t)).flatMap(p=>seasonDates(p).map(m=>({
   ...p,id:p.id+'-'+m.id,title:m.title+' · '+p.title,date:m.date,kind:'event',reminderTime:'10:00',reminderMinutes:[0]
 })));
 eligible.push(...extra);
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gaming Personal//Calendar V04//FR',
  'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Gaming'];
 for(const t of eligible){
  const start=calendarDateToUTC(t.date,t.reminderTime||'18:00');
  if(!start)continue;
  const end=new Date(new Date(t.date+'T'+(/^([01]\d|2[0-3]):[0-5]\d$/.test(t.reminderTime||'')?t.reminderTime:'18:00')+':00').getTime()+3600000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const uidPart=encodeURIComponent(String(t.id)).replace(/%/g,'_');
  lines.push('BEGIN:VEVENT','UID:'+uidPart+'@gaming-personal',
   'DTSTAMP:'+stamp,'DTSTART:'+start,'DTEND:'+end,
   'SUMMARY:'+escapeIcs((t.kind==='pass'?'Fin de pass · ':'')+t.title),
   'DESCRIPTION:'+escapeIcs([types[t.kind],gameTitle(t.gameId),
    t.notes||'','Créé manuellement dans Gaming'].filter(Boolean).join(' — ')));
  for(const minutes of reminderMinutes(t))
   lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escapeIcs(t.title),
    'TRIGGER:-PT'+minutes+'M','END:VALARM');
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return {count:eligible.length,content:foldIcs(lines.join('\r\n'))+'\r\n'};
}
function downloadCalendar(){
 const result=buildCalendarIcs();
 if(!result.count){toast('Aucune date confirmée à exporter.');return;}
 const blob=new Blob([result.content],{type:'text/calendar;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='gaming-calendrier-'+today()+'.ics';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),10000);
 toast(result.count+' événement(s) exporté(s) au calendrier.');
}


async function seasonPushJobs(){
 const now=Math.floor(Date.now()/1000),jobs=[];
 const hash=async str=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 for(const p of data.items){
  if(p.kind!=='pass'||!isConfirmed(p)||!isActiveItem(p))continue;
  for(const m of seasonDates(p)){
   const fireAt=Math.floor(new Date(m.date+'T10:00:00').getTime()/1000);
   if(!Number.isFinite(fireAt)||fireAt<=now+20||fireAt>now+366*86400)continue;
   jobs.push({id:await hash('gaming-season-v1:'+p.id+':'+m.id+':'+m.date+':'+fireAt),milestone:m.id,fireAt});
  }
 }
 return jobs.sort((a,b)=>a.fireAt-b.fireAt).slice(0,250);
}
async function pushPanel(){
 const push=window.GamingPush;
 if(!push){toast('Actualise Gaming pour charger le module de notifications.');return}
 let state;try{state=await push.read()}catch{toast('Stockage des notifications indisponible.');return}
 const permission=push.available()?Notification.permission:'indisponible';
 modal('Notifications Gaming',`<div class="g5-push-panel">
  <div class="notice">Les véritables notifications iPhone peuvent te rappeler la mi-saison, J−14 et J−7 même quand Gaming est fermée. Cloudflare ne reçoit pas les noms des jeux ou leurs prix.</div>
  <div class="g5-push-status">
   <div>App installée <strong>${push.installed()?'Oui':'Non'}</strong></div>
   <div>Autorisation <strong>${esc(permission)}</strong></div>
   <div>Service <strong>${state?.enabled?'Actif':'Inactif'}</strong></div>
   <div>Rappels <strong>${Number(state?.count)||0}</strong></div>
  </div>
  <p class="hint">Rappels à 10 h, uniquement pour les dates confirmées. Les réglages sont individuels pour chaque saison, pass acheté ou non.</p>
  <div class="formactions">
   <button id="g5-enable" type="button" class="btn">${state?.enabled?'Resynchroniser':'Activer les notifications'}</button>
   ${state?.enabled?'<button id="g5-test" type="button" class="btn secondary">Tester</button><button id="g5-disable" type="button" class="btn danger">Désactiver</button>':''}
  </div>
  <p class="hint">Cloudflare vérifie toutes les 5 minutes environ. Modifications hors ligne : actualisation au prochain lancement connecté.</p>
 </div>`);
 $('g5-enable')?.addEventListener('click',async e=>{
  e.currentTarget.disabled=true;
  try{
   if(state?.enabled){const count=await push.sync();toast(count+' rappel(s) synchronisé(s).')}
   else{await push.enable();toast('Notifications Gaming activées.')}
   await pushPanel();
  }catch(err){alert(err.message);$('g5-enable').disabled=false}
 });
 $('g5-test')?.addEventListener('click',async e=>{
  e.currentTarget.disabled=true;try{await push.test();toast('Notification test demandée.')}
  catch(err){alert(err.message)}finally{e.currentTarget.disabled=false}
 });
 $('g5-disable')?.addEventListener('click',async()=>{
  if(!confirm('Désactiver les notifications Gaming de cet iPhone ?'))return;
  try{await push.disable();toast('Notifications désactivées.');await pushPanel()}
  catch(err){alert(err.message)}
 });
}

function itemRow(t){
 const dateLabel=deadline(t),isPass=t.kind==='pass',progress=isPass?passProgress(t):null;
 return `<div class="item g4-item"><span class="item-logo">${({pass:'◷',dlc:'✦',release:'★',event:'◇',expense:'€'})[t.kind]||'✦'}</span>
 <div class="item-body"><strong>${esc(t.title)}</strong><small>${esc(types[t.kind]||'Suivi')} · ${esc(gameTitle(t.gameId))} · ${fmt(t.date)}
  ${t.priceCents!=null?' · '+euro(t.priceCents):''}</small>
 <span class="chip ${dateLabel.tone==='urgent'||dateLabel.tone==='soon'?'warn':''}">${esc(dateLabel.label)}</span>
 ${isPass&&progress?`<span class="chip">${progress.pct}% du pass</span>`:''}
 ${t.status==='paid'?'<span class="chip">Payé (non synchronisé)</span>':t.status==='active'?'<span class="chip">Actif</span>':''}
 ${t.kind!=='pass'&&reminderMinutes(t).length?`<span class="chip">${reminderMinutes(t).length} rappel(s) préparé(s)</span>`:''}</div>
 <div class="item-end"><button data-action="edit-item" data-id="${esc(t.id)}">Modifier</button>
 <button class="red" data-action="delete-item" data-id="${esc(t.id)}">Supprimer</button></div></div>`;
}
function home(){
 const installed=data.games.filter(onDevice),owned=data.games.filter(isOwned),notInstalled=owned.filter(g=>!onDevice(g)),active=data.items.filter(t=>t.kind==='pass'&&t.status==='active');
 const upcoming=data.items.filter(t=>t.date&&t.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
 const planned=data.items.filter(t=>t.kind!=='pass'&&t.priceCents!=null&&!['paid','canceled'].includes(t.status));
 return `<div class="hero"><div class="eyebrow">TON UNIVERS · CENTRALISÉ</div><h1 class="title">Prêt à <span>jouer.</span></h1>
 <p>Bibliothèque, supports, passes, DLC, nouveautés et événements. Un cockpit perso, sans abonnement.</p>
 <div class="actions"><button class="btn" data-action="new-game">＋ Ajouter un jeu</button><button class="btn secondary" data-action="new-item" data-kind="pass">◷ Nouveau pass</button></div></div>
 <div class="grid" style="margin-top:13px"><div class="card"><span class="eyebrow">JEUX POSSÉDÉS</span><div class="metric">${owned.length}</div><div class="muted">${notInstalled.length} non installé(s)</div></div>
 <div class="card"><span class="eyebrow">PASSES</span><div class="metric">${active.length}</div><div class="muted">actifs</div></div>
 <div class="card"><span class="eyebrow">À PRÉVOIR</span><div class="metric" style="font-size:22px">${euro(planned.reduce((sum,t)=>sum+t.priceCents,0))}</div><div class="muted">non comptabilisés</div></div></div>
 ${section('Capture rapide','Ajoute ce que tu veux suivre.',`<div class="quick">
 <button data-action="new-game"><span>▦</span>Jeu</button><button data-action="new-item" data-kind="pass"><span>◷</span>Pass</button>
 <button data-action="new-item" data-kind="dlc"><span>✦</span>DLC</button><button data-action="new-item" data-kind="expense"><span>€</span>Dépense</button></div>`)}
 ${section('Prochainement','Les dates importantes, saisies par toi.',upcoming.length?`<div class="card">${upcoming.map(itemRow).join('')}</div>`:empty('Aucune échéance','Ajoute un pass ou une sortie avec une date.'),'<button class="btn secondary small" data-nav="tracking">Suivi →</button>')}
 ${section('Ma bibliothèque','Les derniers jeux enregistrés.',owned.length?`<div class="g5-game-grid">${owned.slice(-4).reverse().map(gameTile).join('')}</div>`:empty('Encore vide','Ajoute un jeu pour commencer.'),'<button class="btn secondary small" data-nav="games">Tous les jeux →</button>')}
 <p class="hint">Les jeux et tailles ne sont pas importés de la PlayStation. Les informations restent locales et ne sont pas transmises à NEXUS.</p>`;
}
function games(){
 const rows=data.games.filter(g=>{
  const stateMatch=gameFilter==='all'||(gameFilter==='usb'?onDevice(g)&&g.storageId==='ps5-usb':
 gameFilter==='favorites'?!!g.favorite:gameFilter==='owned'?isOwned(g):
 gameFilter==='owned-uninstalled'?needsInstall(g):
 gameFilter==='wishlist'?!isOwned(g):g.status===gameFilter);
  return stateMatch&&(platformFilter==='all'||g.platform===platformFilter)&&(storageFilter==='all'||g.storageId===storageFilter)&&[g.title||'',g.genre||'',g.notes||''].join(' ').toLowerCase().includes(query.toLowerCase());
 }).sort((a,b)=>{
  if(gameSort==='name')return String(a.title).localeCompare(String(b.title),'fr');
  if(gameSort==='size')return Number(b.sizeGB||0)-Number(a.sizeGB||0);
  if(gameSort==='favorite')return Number(!!b.favorite)-Number(!!a.favorite)||String(a.title).localeCompare(String(b.title),'fr');
  return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
 });
 const platforms=[...new Set(data.games.map(g=>g.platform).filter(Boolean))].sort();
 return `<div class="eyebrow">BIBLIOTHÈQUE · V0.6</div><div class="row"><h1 class="title">Mes jeux<span style="color:var(--accent)">.</span></h1><button class="btn small" data-action="new-game">＋ Ajouter</button></div>
 <p class="sub">${data.games.length} jeu(x) répertorié(s). Chaque fiche regroupe stockage, informations et suivis associés.</p>
 <div class="g6-library-covers"><button class="btn secondary small" data-action="auto-covers">Trouver mes jaquettes</button>
 <span class="hint">Recherche gratuite · jusqu’à six jeux par fois · association seulement si résultat fiable</span></div>
 <div class="g3-lib-tools"><label class="g3-search-label"><span class="sr-only">Rechercher un jeu</span><input id="game-search" value="${esc(query)}" placeholder="Rechercher titre, genre ou notes…" autocomplete="off"></label>
 <div class="g3-select-row"><label>Plateforme<select id="g3-platform"><option value="all">Toutes</option>${platforms.map(p=>`<option value="${esc(p)}" ${platformFilter===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>
 <label>Trier par<select id="g3-sort"><option value="recent" ${gameSort==='recent'?'selected':''}>Ajout récent</option><option value="name" ${gameSort==='name'?'selected':''}>Nom A → Z</option><option value="favorite" ${gameSort==='favorite'?'selected':''}>Favoris</option><option value="size" ${gameSort==='size'?'selected':''}>Taille</option></select></label></div></div>
 ${storageFilter!=='all'?`<div class="g3-storage-active-filter">Emplacement : ${esc(storageName(storageFilter))} <button data-action="clear-storage-filter">Retirer ✕</button></div>`:''}
 <div class="tabs">${[['all','Tous'],['owned','Possédés'],['owned-uninstalled','Non installés'],['installed','Installés'],['stored','Stockés'],['usb','USB'],['favorites','Favoris'],['wishlist','À acheter'],['backlog','À jouer']].map(([id,label])=>`<button class="${gameFilter===id?'active':''}" data-action="filter-games" data-filter="${id}">${label}</button>`).join('')}</div>
 <div class="g5-game-grid">${rows.length?rows.map(gameTile).join(''):empty('Aucun jeu dans cette vue','Change tes filtres ou crée une nouvelle fiche.')}</div>
 <p class="hint g3-results">Résultats : ${rows.length} sur ${data.games.length} jeu(x). Les données sont locales et les fiches sont conservées pendant les mises à jour.</p>`;
}
function storage(){
 const active=data.games.filter(g=>g.storageId&&onDevice(g));
 const known=active.reduce((n,g)=>n+(g.sizeGB==null?0:Number(g.sizeGB)||0),0);
 const missing=active.filter(g=>g.sizeGB==null).length;
 return `<div class="eyebrow">CONSOLE · SUPPORTS</div><h1 class="title">Stockage<span style="color:var(--accent)">.</span></h1>
 <p class="sub">Un aperçu basé sur tes fiches, pas sur une lecture automatique de la PS5.</p>
 <div class="g3-storage-total card"><div><span class="eyebrow">JEUX RÉFÉRENCÉS</span><div class="metric">${known.toLocaleString('fr-FR',{maximumFractionDigits:1})} <small>Go connus</small></div>
 <span class="muted">${active.length} jeux · ${missing} jeu(x) sans taille renseignée</span></div><span class="g3-storage-emblem" aria-hidden="true">▤</span></div>
 <div class="grid g3-storage-grid">${data.storage.map(loc=>{
  const {games,knownGB,unknownCount}=storageUsage(loc.id),cap=loc.capacityGB==null?null:Number(loc.capacityGB);
  const ratio=cap&&cap>0?Math.min(100,Math.round(100*knownGB/cap)):0;
  return `<section class="card g3-storage-card"><span class="eyebrow">${loc.type==='usb'?'EXTERNE':loc.type==='m2'?'EXTENSION':'CONSOLE'}</span>
  <h2>${esc(loc.label)}</h2><div class="metric">${knownGB.toLocaleString('fr-FR',{maximumFractionDigits:1})} <small>Go connus</small></div>
  <div class="bars" role="progressbar" aria-label="Capacité référencée" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}"><i style="width:${ratio}%"></i></div>
  <p class="muted">${games.length} jeu(x) · ${cap!==null?cap.toLocaleString('fr-FR')+' Go indiqués':'capacité inconnue'}</p>
  ${cap!==null&&knownGB>cap?'<p class="warning">Ta liste dépasse la capacité renseignée.</p>':''}
  ${unknownCount?`<p class="warning">${unknownCount} jeu(x) sans taille, estimation incomplète.</p>`:''}
  ${loc.type==='usb'?'<p class="warning">Jeux PS5 conservés, non jouables directement.</p>':''}
  <div class="actions"><button class="btn secondary small" data-action="edit-storage" data-id="${esc(loc.id)}">Capacité</button>
  <button class="btn secondary small" data-action="filter-storage" data-id="${esc(loc.id)}">Voir les jeux</button></div></section>`;
 }).join('')}</div>
 ${section('Jeux par support','Ouvre une fiche pour déclarer un changement d’emplacement.',`<div class="card">${active.length?active.map(gameRow).join(''):empty('Aucun jeu associé','Ajoute un jeu et sélectionne un emplacement.')}</div>`)}
 <div class="notice">Les jeux PS5 sur USB doivent être retransférés vers le SSD interne ou un M.2 compatible pour être lancés. Les jeux PS4 compatibles peuvent fonctionner depuis USB. Les mouvements dans Gaming sont déclaratifs : ils ne déplacent pas les fichiers de la console.</div>`;
}
function tracking(){
 const rows=data.items.filter(t=>itemFilter==='all'||t.kind===itemFilter).sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
 const passes=data.items.filter(t=>t.kind==='pass').sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
 const planned=data.items.filter(t=>t.kind!=='pass'&&t.priceCents!=null&&!['paid','canceled'].includes(t.status));
 const due7=data.items.filter(t=>isConfirmed(t)&&isActiveItem(t)&&relativeDays(t.date)>=0&&relativeDays(t.date)<=7).length;
 let content='';
 if(trackingTab==='passes'){
   content=`<div class="grid g4-pass-stats">
    <div class="card"><span class="eyebrow">PASSES ACTIFS</span><div class="metric">${passes.filter(t=>t.status==='active').length}</div><span class="muted">en cours</span></div>
    <div class="card"><span class="eyebrow">ÉCHÉANCES 7 J</span><div class="metric">${due7}</div><span class="muted">dates confirmées</span></div>
    <div class="card"><span class="eyebrow">À PRÉVOIR</span><div class="metric" style="font-size:22px">${euro(planned.reduce((n,t)=>n+t.priceCents,0))}</div><span class="muted">hors dépenses réelles</span></div>
   </div>${section('Mes saisons et passes','Dates, numéros de saison et rappels, que tu aies acheté le pass ou non.',
    passes.length?`<div class="g4-pass-list">${passes.map(passCard).join('')}</div>`:empty('Aucune saison suivie','Ajoute une saison, même sans acheter son pass de combat.'),
    '<button class="btn secondary small" data-action="new-item" data-kind="pass">＋ Pass</button>')}`;
 }else if(trackingTab==='calendar'){
   content=`<div class="g4-calendar-toolbar"><div><strong>Calendrier Gaming</strong><p class="muted">Sélectionne un jour pour voir ses échéances.</p></div>
   <button class="btn secondary small" data-action="export-calendar">↓ Export .ics</button></div>
   ${calendarMarkup()}
   <div class="notice">Les rappels sont enregistrés dans Gaming. Pour recevoir des alertes iPhone, exporte les événements confirmés en .ics puis importe-les dans ton calendrier avec ses notifications activées. Aucun push Gaming autonome n'est activé pour l'instant.</div>`;
 }else{
   content=`<div class="tabs g4-kind-tabs">${[['all','Tous'],['pass','Pass'],['dlc','DLC'],['release','Nouveautés'],['event','Événements'],['expense','Dépenses']].map(([id,label])=>`<button class="${itemFilter===id?'active':''}" data-action="filter-items" data-filter="${id}">${label}</button>`).join('')}</div>
   <div class="card">${rows.length?rows.map(itemRow).join(''):empty('Aucun suivi','Ajoute un pass, DLC, événement ou achat prévu.')}</div>
   ${section('Dépenses à prévoir','Séparées des dépenses réelles NEXUS.',`<div class="card row"><span class="muted">${planned.length} poste(s) à prévoir</span><strong class="money">${euro(planned.reduce((n,t)=>n+t.priceCents,0))}</strong></div>`)}`;
 }
 return `<div class="eyebrow">PASSES · CALENDRIER · SUIVI</div><div class="row">
 <h1 class="title">Suivi<span style="color:var(--accent)">.</span></h1><button class="btn small" data-action="new-item" data-kind="pass">＋ Ajouter</button></div>
 <p class="sub">Organise les saisons, DLC, sorties et échéances, jeu par jeu.</p>
 <div class="tabs g4-main-tabs">${[['passes','Pass de combat'],['calendar','Calendrier'],['all','Tout le suivi']].map(([id,label])=>`<button class="${trackingTab===id?'active':''}" data-action="tracking-tab" data-tab="${id}">${label}</button>`).join('')}</div>
 ${content}
 <p class="hint g4-link-note">Les propositions envoyées à NEXUS passent par LINK pour examen. Aucun achat n'est inscrit au budget sans validation.</p>`;
}
function settings(){
 return `<div class="eyebrow">CONTRÔLE & SÉCURITÉ</div><h1 class="title">Réglages<span style="color:var(--accent)">.</span></h1>
 <p class="sub">Gaming est indépendant, stocké localement et utilisable hors connexion.</p>
 ${section('Personnalisation','Un style Gaming à ton image, comme dans NEXUS.',`<div class="card g3-customize">
  <h3>Ambiance</h3><p class="hint">Choisis une base. Les données et la navigation restent identiques.</p>
  <div class="g3-theme-choices">${THEMES.map(([id,name,desc])=>`<button type="button" class="g3-theme-card ${data.preferences.theme===id?'selected':''}" data-action="choose-theme" data-value="${id}" aria-pressed="${data.preferences.theme===id}">
   <span class="g3-theme-sample g3-sample-${id}"><i></i><i></i><i></i></span><strong>${name}</strong><small>${desc}</small></button>`).join('')}</div>
  <h3>Couleur principale</h3><div class="g3-accent-choices">${ACCENTS.map(([id,name])=>`<button type="button" class="g3-accent-choice ${data.preferences.accent===id?'selected':''}" data-action="choose-accent" data-value="${id}" aria-pressed="${data.preferences.accent===id}">
   <span class="g3-accent-dot g3-dot-${id}"></span>${name}</button>`).join('')}</div>
  <p class="hint">Ces préférences sont incluses dans la sauvegarde JSON et restent présentes après une mise à jour.</p>
 </div>`)}
  ${section('Données','Conserve une copie de ta bibliothèque.',`<div class="card">
 <div class="setting"><div><strong>Exporter mes données</strong><p>Une sauvegarde JSON de tous les jeux, événements et supports.</p></div><button class="btn secondary small" data-action="export">Export</button></div>
 <div class="setting"><div><strong>Importer un JSON</strong><p>Remplace les données locales après confirmation.</p></div><button class="btn secondary small" data-action="import">Import</button></div>
 <div class="setting"><div><strong>Corbeille</strong><p>${data.trash.length} élément(s) récupérable(s).</p></div><button class="btn secondary small" data-action="trash">Voir</button></div></div>`)}
 ${section('Connexions','LINK centralise le contrôle des échanges. Les anciens jumelages restent disponibles en secours.',`<div class="card"><div class="setting"><div><strong>Centre LINK</strong><p>Permissions, connexions et diagnostics dans une seule application.</p></div><a class="btn secondary small" href="https://link-app.q9pfwtztsc.workers.dev/" target="_blank" rel="noopener noreferrer">Gérer dans LINK</a></div><details class="g4-legacy-link"><summary class="hint">Ancien canal · dépannage et compatibilité</summary><div class="setting"><div><strong>Jumelage historique NEXUS</strong><p>${data.connections.length?'Gaming conserve son jumelage chiffré historique pour la compatibilité.':'Aucune connexion active. Crée un jumelage depuis les réglages de NEXUS.'}</p></div><button class="btn secondary small" data-action="link-panel">${data.connections.length?'Tester':'Jumeler'}</button></div>
 <div class="setting"><div><strong>LINK · Observateur</strong><p>Préparer un relevé technique local pour LINK, sans exposer les clés, les noms des jeux ou les achats.</p></div><button class="btn secondary small" data-action="link-observe">Observer</button></div>
 
  </details>
  <div class="setting"><div><strong>Notifications iPhone</strong><p>Mi-saison, J−14 et J−7, avec choix par pass.</p></div><button class="btn secondary small" data-action="push-settings">Configurer</button></div></div>`)}
 ${section('À propos','Gaming V0.7 · synchronisation NEXUS',`<div class="card"><p class="hint">Aucun compte ni abonnement. Pas d'API PSN, pas de synchronisation automatique. iOS peut évincer les données d'un site : exporte régulièrement ton JSON, notamment avant toute migration de domaine ou désinstallation.</p></div>`)}`;
}
function render(){const pages={home,games,storage,tracking,settings};$('root').innerHTML=(pages[page]||home)();document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===page);b.setAttribute('aria-current',b.dataset.nav===page?'page':'false');});}
const field=(label,name,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const selectField=(label,name,opts,current)=>`<label>${label}<select name="${name}">${opts.map(([v,text])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const gameOptions=id=>[['','Aucun jeu'],...data.games.map(g=>[g.id,g.title])].map(([val,label])=>`<option value="${esc(val)}" ${val===id?'selected':''}>${esc(label)}</option>`).join('');

const gamingCoversAdapter={
 game:id=>data.games.find(g=>g.id===id),games:()=>data.games,
 modal,
 edit:id=>gameForm(id),
 async save(id,url,source,options={}){
  const g=data.games.find(x=>x.id===id);if(!g)return;
  g.coverUrl=coverSafe(url);
  g.coverSource=g.coverUrl&&source?String(source).slice(0,500):'';
  g.updatedAt=new Date().toISOString();
  await persist();
  if(!options.quiet){closeModal();render();gameDetail(id);toast(g.coverUrl?'Jaquette enregistrée.':'Jaquette retirée.');}
  else render();
 }
};

function gameForm(id,requestedStatus=''){
 const old=data.games.find(g=>g.id===id),g=old||{},oldTitle=old?.title;
 modal(old?'Modifier un jeu':'Ajouter un jeu',`<form id="edit-form" class="form">
 ${field('Nom','title',g.title||'','required maxlength="120" placeholder="Ex. Delta Force"')}
 <div class="formgrid">${selectField('Plateforme','platform',[['PS5','PS5'],['PS4','PS4'],['PC','PC'],['Xbox','Xbox'],['Switch','Switch'],['other','Autre']],g.platform||'PS5')}
 ${selectField('Installation','status',[['installed','Installé / jouable'],['stored','Stocké (USB, archive)'],['uninstalled','Non installé'],['backlog','À jouer plus tard'],['wishlist','À acheter']],requestedStatus||g.status||'installed')}</div>
 <label class="g5-owned-input"><input type="checkbox" name="owned" ${isOwned(g)?'checked':''}>
    <span><strong>Je possède ce jeu</strong><small>Reste dans la bibliothèque même quand il est désinstallé.</small></span></label>
 <div class="formgrid">${selectField('Support','storageId',[['','Aucun'],...data.storage.map(s=>[s.id,s.label])],g.storageId||(g.status==='uninstalled'||g.status==='wishlist'||g.status==='backlog'?'':'ps5-internal'))}
 ${field('Taille en Go (facultatif)','sizeGB',g.sizeGB??'','type="number" min="0" max="100000" step="0.1"')}</div>
 ${field('Genre (facultatif)','genre',g.genre||'','maxlength="50" placeholder="FPS, MMO, course, simulation…"')}
 ${field('Image de jaquette (URL HTTPS, optionnelle)','coverUrl',g.coverUrl||'','type="url" maxlength="500" placeholder="https://site.fr/jaquette.jpg"')}
 <p class="hint">Sans image, Gaming utilise une couverture graphique par genre. Les jaquettes externes nécessitent Internet.</p>
 <div class="formgrid">${field('Dernière session','lastPlayedAt',g.lastPlayedAt||'','type="date"')}
 <label class="g3-checkbox"><input type="checkbox" name="favorite" ${g.favorite?'checked':''}><span>★ Jeu favori</span></label></div>
 <label>Notes<textarea name="notes" maxlength="2000">${esc(g.notes||'')}</textarea></label>
 <p class="hint">Les jeux et leurs tailles sont déclarés manuellement, jamais récupérés de la console.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),title=String(v.title||'').trim(),size=v.sizeGB===''?null:Number(v.sizeGB);
 if(!title||size!=null&&(!Number.isFinite(size)||size<0||size>100000)||!validDate(String(v.lastPlayedAt||''))){toast('Nom, taille ou date invalide.');return}
 let status=select(v.status,['installed','stored','uninstalled','wishlist','backlog'],'installed');
 let owned=v.owned==='on'||v.owned===true;
 if(!owned&&status!=='wishlist')status='wishlist';
 if(owned&&status==='wishlist')status='uninstalled';
 const platform=select(v.platform,['PS5','PS4','PC','Xbox','Switch','other'],'PS5');
 if(platform==='PS5'&&v.storageId==='ps5-usb'&&status==='installed')status='stored';
 if(status==='stored'&&v.storageId!=='ps5-usb'&&platform==='PS5')status='installed';
 if(onDevice({status})&&!data.storage.some(x=>x.id===v.storageId)){
  toast('Indique un support de stockage pour un jeu installé ou stocké.');return;
 }
 const record={...g,id:g.id||uid(),title:title.slice(0,120),platform,
 status,owned,storageId:onDevice({status})?v.storageId||'':'',sizeGB:size,genre:String(v.genre||'').trim().slice(0,50),coverUrl:coverSafe(v.coverUrl),coverSource:coverSafe(v.coverUrl)===coverSafe(g.coverUrl)?g.coverSource||'':'',favorite:v.favorite==='on'||v.favorite===true,lastPlayedAt:String(v.lastPlayedAt||''),notes:String(v.notes||'').slice(0,2000),
 createdAt:g.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,record);else data.games.push(record);
 await persist();closeModal();render();toast('Jeu enregistré.');
 if(!record.coverUrl&&(!old||oldTitle!==record.title))window.GamingCovers?.auto?.(record.id,record.title);
 });
}
function itemForm(id,kind='pass',defaultGameId=''){
 const old=data.items.find(i=>i.id===id),t=old||{},chosenKind=t.kind||kind;
 const isPass=chosenKind==='pass';
 const status=t.status==='paid'&&isPass?'active':t.status||'active';
 const oldMinutes=reminderMinutes(t);
 const extras=oldMinutes.filter(m=>!REMINDER_PRESETS.some(p=>p[0]===m)).join(', ');
 const owned=!!(t.passOwned===true||t.passOwned==null&&t.status==='paid');
 const reminderFlags=seasonReminderFlags(t);
 modal(old?'Modifier un suivi':'Ajouter un suivi',`<form id="edit-form" class="form">
 ${selectField('Type','kind',[['pass','Pass de combat / saison'],['dlc','DLC'],['release','Nouveauté'],['event','Événement'],['expense','Dépense prévue']],chosenKind)}
 ${field('Nom du suivi','title',t.title||'','required maxlength="140" placeholder="Ex. Passe de combat"')}
 <label>Jeu associé<select name="gameId">${gameOptions(t.gameId||defaultGameId||'')}</select></label>
 <div id="g5-pass-editor" ${isPass?'':'hidden'} class="g5-pass-editor">
  ${field('Numéro de saison','seasonNumber',t.seasonNumber??'','type="number" min="1" max="10000" step="1" placeholder="Ex. 12 pour Delta Force"')}
  <div class="formgrid">
    ${field('Début de saison','startDate',t.startDate||'','type="date"')}
    ${field('Fin de saison','date',t.date||'','type="date"')}
  </div>
  <label class="g5-ownership-control"><input type="checkbox" name="passOwned" ${owned?'checked':''}>
    <span><strong>J’ai acheté le pass</strong><small>Décoché = saison suivie sans achat (Fortnite, etc.)</small></span></label>
  ${selectField('État de la saison','statusPass',[['planned','À venir'],['active','En cours'],['finished','Terminée'],['canceled','Annulée']],status)}
  ${field('Prix du pass, facultatif (€)','pricePass',t.priceCents!=null?(t.priceCents/100).toFixed(2):'','inputmode="decimal" placeholder="Ex. 6,99"')}
  ${field('Date réelle d’achat du pass (facultative)','paidDate',t.paidDate||'','type="date"')}
  <p class="hint">Pour permettre l’inscription automatique dans le budget NEXUS, indique le prix réellement payé et la date d’achat. La date de fin de saison reste indépendante.</p>
  ${selectField('Fiabilité des dates','dateConfidencePass',[['confirmed','Confirmées'],['tentative','Provisoires'],['unknown','À confirmer']],t.dateConfidence||'confirmed')}
  <div class="g5-season-options"><strong>Notifications de saison</strong>
   <p class="hint">Un rappel à 10 h, à mi-saison puis à 2 semaines et 1 semaine avant la fin. Les alertes sont facultatives et indépendantes de l’achat du pass.</p>
   ${SEASON_REMINDERS.map(([code,label])=>`<label class="g4-reminder-choice"><input type="checkbox" name="seasonReminder" value="${code}" ${reminderFlags.includes(code)?'checked':''}><span>${label}</span></label>`).join('')}
  </div>
 </div>
 <div id="g5-other-editor" ${isPass?'hidden':''} class="g5-other-editor">
  <div class="formgrid">
    ${field('Date importante','otherDate',t.date||'','type="date"')}
    ${selectField('État','statusOther',[['planned','À prévoir'],['active','Actif'],['paid','Payé'],['finished','Terminé'],['canceled','Annulé']],t.status||'planned')}
  </div>
  ${field('Montant indicatif (€)','priceOther',t.priceCents!=null?(t.priceCents/100).toFixed(2):'','inputmode="decimal" placeholder="Ex. 19,99"')}
  ${selectField('Fiabilité de la date','dateConfidenceOther',[['confirmed','Confirmée'],['tentative','Provisoire'],['unknown','À confirmer']],t.dateConfidence||'unknown')}
  <div class="g4-form-reminders"><h3>Rappels de cet événement</h3>
   ${field('Heure locale','reminderTime',t.reminderTime||'18:00','type="time"')}
   <div class="g4-reminder-options">${REMINDER_PRESETS.map(([minutes,label])=>`<label class="g4-reminder-choice">
    <input type="checkbox" name="reminderPreset" value="${minutes}" ${oldMinutes.includes(minutes)?'checked':''}><span>${label}</span></label>`).join('')}</div>
   ${field('Autres rappels en minutes (virgules)','customReminders',extras,'placeholder="Ex. 30, 90"')}</div>
 </div>
 ${field('Lien / source, facultatif','sourceUrl',t.sourceUrl||'','type="url" maxlength="500" placeholder="https://..."')}
 <label>Notes<textarea name="notes" maxlength="2000">${esc(t.notes||'')}</textarea></label>
 <p class="hint">Gaming conserve ton suivi. Un achat payé peut être transmis à NEXUS si le lien « Pass acheté » est autorisé. Son inscription automatique au budget dépend d’une autorisation distincte dans NEXUS.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button>
 <button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=new FormData(e.target),v=Object.fromEntries(fd);
  const itemKind=select(v.kind,['pass','dlc','release','event','expense'],'event'),isPass=itemKind==='pass';
  const title=String(v.title||'').trim(),startDate=isPass?String(v.startDate||''):'';
  const date=String(isPass?v.date||'':v.otherDate||''),amount=euros(isPass?v.pricePass:v.priceOther);
  const paidDate=isPass?String(v.paidDate||''):'';
  const number=v.seasonNumber===''||v.seasonNumber==null?null:Number(v.seasonNumber);
  const status=isPass?select(v.statusPass,['planned','active','finished','canceled'],'active'):select(v.statusOther,['planned','active','paid','finished','canceled'],'planned');
  const dateConfidence=isPass?select(v.dateConfidencePass,['confirmed','tentative','unknown'],'confirmed'):
   select(v.dateConfidenceOther,['confirmed','tentative','unknown'],'unknown');
  const seasonReminders=isPass?[...new Set(fd.getAll('seasonReminder'))].filter(x=>SEASON_REMINDERS.some(([code])=>code===x)):[];
  const reminderTime=isPass?'10:00':String(v.reminderTime||'18:00');
  const customSource=isPass?'':String(v.customReminders||'').trim();
  const custom=customSource?customSource.split(/[,;\s]+/).filter(Boolean).map(Number):[];
  const otherReminders=isPass?[]:[...new Set([...fd.getAll('reminderPreset').map(Number),...custom])];
  if(!title||Number.isNaN(amount)||!validDate(date)||!validDate(startDate)||!validDate(paidDate)||
   isPass&&(number!==null&&(!Number.isSafeInteger(number)||number<1||number>10000)||
    !startDate||!date||startDate>=date)||
   !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)||
   otherReminders.length>10||otherReminders.some(n=>!Number.isSafeInteger(n)||n<0||n>40320)){
   toast(isPass?'Renseigne un début et une fin de saison valides.':'Vérifie les dates et les rappels.');return;
  }
  const record={...t,id:t.id||uid(),kind:itemKind,title:title.slice(0,140),
   gameId:data.games.some(g=>g.id===v.gameId)?v.gameId:'',date,status,priceCents:amount,dateConfidence,
   startDate,seasonNumber:isPass?number:null,
   passOwned:isPass?fd.get('passOwned')==='on':false,
   paidDate:isPass&&fd.get('passOwned')==='on'?paidDate:'',
   seasonReminders:isPass?seasonReminders:[],
   reminderTime,reminderMinutes:isPass?[]:otherReminders.sort((a,b)=>b-a),
   sourceUrl:String(v.sourceUrl||'').trim().slice(0,500),notes:String(v.notes||'').slice(0,2000),
   createdAt:t.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  // Old levels from previous app versions remain in legacy records, but are no longer shown/required.
  if(old)Object.assign(old,record);else data.items.push(record);
  await persist();closeModal();render();toast(isPass?'Saison enregistrée.':'Suivi enregistré.');
 });
}
function storageForm(id){
 const s=data.storage.find(x=>x.id===id);if(!s)return;
 modal('Capacité · '+s.label,`<form id="edit-form" class="form">
 ${field('Capacité déclarée en Go','capacityGB',s.capacityGB??'','type="number" min="0" max="100000" step="0.1"')}
 <p class="hint">Ce chiffre est saisi par toi. Gaming ne mesure pas automatiquement le disque.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
 e.preventDefault();const raw=new FormData(e.target).get('capacityGB'),v=raw===''?null:Number(raw);
 if(v!=null&&(!Number.isFinite(v)||v<0||v>100000)){toast('Capacité invalide.');return}
 s.capacityGB=v;await persist();closeModal();render();toast('Capacité mise à jour.');
 });
}
async function remove(kind,id){
 const group=kind==='game'?'games':'items',item=data[group].find(x=>x.id===id);if(!item)return;
 if(!confirm('Placer « '+item.title+' » dans la corbeille ?'))return;
 data.trash.push({id:uid(),kind,record:JSON.parse(JSON.stringify(item)),deletedAt:new Date().toISOString()});
 data[group]=data[group].filter(x=>x.id!==id);await persist();render();toast('Déplacé dans la corbeille.');
}
function trash(){
 modal('Corbeille Gaming',`<div class="card">${data.trash.length?data.trash.map(t=>`<div class="item"><div class="item-body"><strong>${esc(t.record.title)}</strong><small>${t.kind==='game'?'Jeu':'Suivi'}</small></div>
 <button class="btn secondary small" data-action="restore" data-id="${esc(t.id)}">Restaurer</button></div>`).join(''):empty('Corbeille vide','Aucune suppression.')}</div>
 <div class="formactions"><button class="btn secondary" data-action="close">Fermer</button>${data.trash.length?'<button class="btn danger" data-action="purge">Vider</button>':''}</div>`);
}
async function restore(id){
 const t=data.trash.find(x=>x.id===id);if(!t)return;
 const group=t.kind==='game'?'games':'items';if(data[group].some(x=>x.id===t.record.id)){toast('Conflit : élément déjà présent.');return}
 data[group].push(t.record);data.trash=data.trash.filter(x=>x.id!==id);
 await persist();closeModal();render();toast('Élément restauré.');
}
function exportBackup(){
 const blob=new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'});
 const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='gaming-'+today()+'.json';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),8000);toast('Export JSON généré.');
}
async function importBackup(file){
 if(!file||file.size>8*1024*1024){toast('Fichier trop volumineux.');return}
 try{
 const parsed=JSON.parse(await file.text()),incoming=normalize(parsed.data||parsed);
 if(!confirm('Remplacer toutes les données Gaming locales ? Conserve d’abord un export JSON.'))return;
 data=incoming;applyAppearance();await persist();closeModal();render();toast('Sauvegarde importée.');
 }catch(e){toast('Erreur import : '+String(e.message).slice(0,80));}
}

 function linkPanel(){
  const pair=data.connections[0];
  if(!window.NexusLinkCore){toast('Module LINK indisponible. Recharge la page.');return;}
  if(!pair){
   modal('Connecter NEXUS',`<form id="link-form" class="form">
    <div class="notice">Dans NEXUS, ouvre Réglages → Applications & connexions, coche une autorisation Gaming, puis touche « Jumeler ». Copie le code généré et colle-le ci-dessous.</div>
    <label>Code de jumelage<textarea name="code" rows="5" required placeholder="NXL1. …" style="overflow-wrap:anywhere;word-break:break-all"></textarea></label>
    <p class="hint">Ce code est privé et permet de chiffrer les messages. Ne le communique pas dans une conversation.</p>
    <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button class="btn" type="submit">Connecter</button></div></form>`);
   $('link-form').addEventListener('submit',async e=>{
    e.preventDefault();
    try{
     const code=new FormData(e.target).get('code'),info=window.NexusLinkCore.readInvite(code);
     if(info.sourceApp!=='gaming')throw Error('CODE_OTHER_APP');
     const remote=await window.NexusLinkCore.status(info);
     if(remote.sourceApp!=='gaming')throw Error('PAIR_MISMATCH');
     data.connections=[info];await persist();closeModal();render();toast('Gaming est jumelée à NEXUS.');
    }catch(err){toast('Code refusé : '+String(err.message).slice(0,75));}
   });
   return;
  }
  modal('NEXUS LINK · Gaming',`<div class="form">
   <div class="notice">La connexion est configurée. Tu peux maintenant transmettre les propositions chiffrées à NEXUS pour validation. Aucune dépense ni date n’est créée automatiquement.</div>
   <div class="setting"><div><strong>Connexion active</strong><p>${pair.scopes.length} permission(s) configurée(s) depuis NEXUS.</p></div><span class="chip">Chiffrée</span></div>
   <div class="formactions"><button class="btn secondary" data-action="link-status">Vérifier</button>
    <button class="btn" data-action="link-sync">Synchroniser avec NEXUS</button>
    <button class="btn secondary" data-action="link-test">Envoyer un test</button>
    <button class="btn danger" data-action="link-forget">Dissocier sur cet appareil</button></div>
   <p class="hint">Pour révoquer le jumelage côté serveur, utilise NEXUS → Applications & connexions.</p></div>`);
 }
 async function linkStatus(){
  const pair=data.connections[0];if(!pair)return;
  try{const r=await window.NexusLinkCore.status(pair);toast(r.connected?'Connexion NEXUS LINK active.':'Lien non actif.');}
  catch(e){toast('Connexion indisponible ou révoquée : '+String(e.message).slice(0,55));}
 }
 async function sendLinkTest(){
  const pair=data.connections[0];if(!pair)return;
  try{
   const scope=pair.scopes[0];
   await window.NexusLinkCore.publish(pair,{entityId:'ping-'+crypto.randomUUID(),revision:1,scope,
    payload:{type:'test.ping',title:'Message de test Gaming',sourceApp:'gaming',createdAt:new Date().toISOString()}});
   toast('Test chiffré envoyé. Ouvre Messages dans NEXUS.');
  }catch(e){toast('Échec du test : '+String(e.message).slice(0,70));}
 }
 async function forgetLink(){
  if(!confirm('Dissocier Gaming localement ? Tu pourras révoquer le lien sur NEXUS.'))return;
  data.connections=[];await persist();closeModal();render();toast('Connexion locale dissociée.');
 }

document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return}
 const btn=e.target.closest('[data-action]');if(!btn)return;
 const act=btn.dataset.action,id=btn.dataset.id;
 if(act==='close')return closeModal();
 if(act==='link-panel')return linkPanel();
 if(act==='link-status')return linkStatus();
 if(act==='link-test')return sendLinkTest();
 if(act==='link-sync')return window.GamingNexusSync?.panel?.();
  if(act==='link-observe')return window.GamingNexusSync?.observe?.();
 
 if(act==='link-forget')return forgetLink();
 if(act==='view-game')return gameDetail(id);
 if(act==='find-cover')return window.GamingCovers?.find?.(id);
 if(act==='auto-covers'){
  if(!window.GamingCovers){toast('Module de jaquettes indisponible.');return}
  btn.disabled=true;
  try{const found=await window.GamingCovers.fillMissing();
   toast(found.matched+' jaquette(s) trouvée(s) sur '+found.scanned+' recherche(s).');
  }catch(err){alert(err.message||'Recherche indisponible.')}finally{btn.disabled=false}
  return;
 }
 if(act==='uninstall-game')return markGameUninstalled(id);
 if(act==='install-game')return gameForm(id,'installed');
 if(act==='toggle-favorite')return toggleFavorite(id);
 if(act==='move-game')return moveGame(id,btn.dataset.target);
 if(act==='new-related-item')return itemForm(null,'pass',id);
 if(act==='filter-storage'){storageFilter=btn.dataset.id;gameFilter='all';platformFilter='all';go('games');return}
 if(act==='clear-storage-filter'){storageFilter='all';render();return}
 if(act==='choose-theme')return setAppearance('theme',btn.dataset.value);
 if(act==='choose-accent')return setAppearance('accent',btn.dataset.value);
 if(act==='new-game')return gameForm();
 if(act==='edit-game')return gameForm(id);
 if(act==='delete-game')return remove('game',id);
 if(act==='new-item')return itemForm(null,btn.dataset.kind||'pass');
 if(act==='edit-item')return itemForm(id);
 if(act==='delete-item')return remove('item',id);
 if(act==='edit-storage')return storageForm(id);
 if(act==='filter-games'){gameFilter=btn.dataset.filter;render();return}
 if(act==='filter-items'){itemFilter=btn.dataset.filter;render();return}
 if(act==='tracking-tab'){trackingTab=btn.dataset.tab;render();return}
 if(act==='pass-level')return changePassLevel(id,Number(btn.dataset.delta));
 if(act==='calendar-prev')return shiftMonth(-1);
 if(act==='calendar-next')return shiftMonth(1);
 if(act==='calendar-day'){calendarDay=btn.dataset.date;render();return}
 if(act==='export-calendar')return downloadCalendar();
 if(act==='push-settings')return pushPanel();
 if(act==='export')return exportBackup();
 if(act==='import')return $('import-file').click();
 if(act==='trash')return trash();
 if(act==='restore')return restore(id);
 if(act==='purge'){
 if(prompt('Tape VIDER pour supprimer définitivement la corbeille.')!=='VIDER')return;
 data.trash=[];await persist();trash();toast('Corbeille vidée.');return;
 }
});
document.addEventListener('input',e=>{
 if(e.target.id!=='game-search')return;
 query=e.target.value;const pos=e.target.selectionStart;render();
 const input=$('game-search');input?.focus();input?.setSelectionRange(pos,pos);
});
document.addEventListener('change',e=>{
 if(e.target.id==='g3-platform'){platformFilter=e.target.value;render();}
 if(e.target.id==='g3-sort'){gameSort=e.target.value;render();}
 if(e.target.name==='status'&&e.target.closest?.('#edit-form')){
  const checkbox=$('edit-form')?.querySelector?.('input[name="owned"]');
  if(checkbox){
   if(e.target.value==='wishlist')checkbox.checked=false;
   else if(e.target.value==='uninstalled'||e.target.value==='installed'||e.target.value==='stored')checkbox.checked=true;
  }
 }
 if(e.target.name==='kind'){
 const pass=$('g5-pass-editor'),other=$('g5-other-editor');
 if(pass)pass.hidden=e.target.value!=='pass';
 if(other)other.hidden=e.target.value==='pass';
}
});
$('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importBackup(file)});
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closeModal()});
window.addEventListener('online',()=>window.GamingPush?.queue?.());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.GamingPush?.queue?.()});
document.addEventListener('error',e=>{if(e.target?.matches?.('.g5-poster img, .g6-cover-choice img'))e.target.remove();},true);
(async()=>{try{db=await openDB();const existing=await load();if(existing)data=normalize(existing);applyAppearance();window.GamingCovers?.attach?.(gamingCoversAdapter);
 window.GamingNexusSync?.attach?.({
  state:()=>data,persist,toast,modal,escape:esc,seasonDates
 });
 render();window.GamingPush?.attach?.(seasonPushJobs);
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}catch(e){$('root').innerHTML='<div class="empty"><strong>Stockage inaccessible</strong>Active le stockage local Safari et recharge la page.</div>';}})();