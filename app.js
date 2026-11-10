"use strict";
/* Gaming V0.3 — library, storage and configurable visual identity. NEXUS LINK stays test-only. */
const DB_NAME='gaming-personal-v1',STORE='state';
const STORAGE=[
 {id:'ps5-internal',type:'internal',label:'SSD interne PS5',capacityGB:null},
 {id:'ps5-m2',type:'m2',label:'SSD M.2',capacityGB:null},
 {id:'ps5-usb',type:'usb',label:'Disque USB externe',capacityGB:null}
];
const THEMES=[['night','Night Ops','Cockpit sombre actuel'],['nebula','Nebula','Sombre, bleu-violet'],['carbon','Carbon','Noir et contrasté'],['slate','Ardoise','Clair, doux et minimal']];
const ACCENTS=[['lime','Lime'],['cyan','Cyan'],['violet','Violet'],['amber','Ambre'],['red','Rouge']];
const INITIAL=()=>({version:1,games:[],items:[],storage:STORAGE.map(s=>({...s})),trash:[],connections:[],preferences:{theme:'night',accent:'lime'}});
let data=INITIAL(),db=null,page='home',gameFilter='all',platformFilter='all',storageFilter='all',gameSort='recent',itemFilter='all',query='';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const today=()=>new Date().toLocaleDateString('sv-SE');
const fmt=s=>s?new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'Date à confirmer';
const euro=n=>n==null?'—':(n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const euros=s=>{if(String(s??'').trim()==='')return null;const n=Number(String(s).trim().replace(',','.'));return Number.isFinite(n)&&n>=0&&n<10000000?Math.round(n*100):NaN};
const validDate=s=>!s||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T12:00:00').getTime())&&new Date(s+'T12:00:00').toLocaleDateString('sv-SE')===s);
const select=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const relativeDays=date=>date?Math.round((new Date(date+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000):null;
const gameTitle=id=>data.games.find(g=>g.id===id)?.title||'Aucun jeu associé';
const storageName=id=>data.storage.find(s=>s.id===id)?.label||'Sans emplacement';
const gameStatus=g=>g.status==='wishlist'?'Souhait':g.status==='backlog'?'À jouer':g.platform==='PS5'&&g.storageId==='ps5-usb'?'Stocké · transfert requis':g.status==='stored'?'Stocké':'Installé';
const types={pass:'Pass',dlc:'DLC',release:'Nouveauté',event:'Événement',expense:'Dépense prévue'};
let saveChain=Promise.resolve(),toastTimer;
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function load(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function normalize(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.games)||!Array.isArray(raw.items))throw Error('Format Gaming invalide');
 const d=INITIAL();d.games=raw.games.filter(x=>x&&typeof x==='object'&&x.id&&x.title).slice(0,10000);
 d.items=raw.items.filter(x=>x&&typeof x==='object'&&x.id&&x.title).slice(0,10000);
 d.trash=Array.isArray(raw.trash)?raw.trash.filter(x=>x&&x.id&&x.record).slice(0,10000):[];
 d.connections=Array.isArray(raw.connections)?raw.connections.filter(x=>x&&x.id&&x.seed&&x.sourceApp==='gaming').slice(0,5):[];
 const prefs=raw.preferences&&typeof raw.preferences==='object'?raw.preferences:{};
 d.preferences={theme:select(prefs.theme,THEMES.map(x=>x[0]),'night'),accent:select(prefs.accent,ACCENTS.map(x=>x[0]),'lime')};
 for(const s of d.storage){const v=Array.isArray(raw.storage)?raw.storage.find(x=>x.id===s.id):null;if(v){const n=Number(v.capacityGB);s.capacityGB=v.capacityGB==null||v.capacityGB===''?null:Number.isFinite(n)&&n>=0&&n<=1e5?n:null;}}
 return d;
}
function storeSnapshot(snapshot){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(snapshot,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function persist(){const snapshot=JSON.parse(JSON.stringify(data));saveChain=saveChain.catch(()=>{}).then(()=>storeSnapshot(snapshot));return saveChain.catch(e=>{toast('Échec de sauvegarde locale : export nécessaire.');throw e;});}
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
const gameIsOnUsb=g=>g.storageId==='ps5-usb'&&!['wishlist','backlog'].includes(g.status);
const linkedItems=id=>data.items.filter(item=>item.gameId===id);
const gameFlag=g=>g.favorite?'★':'☆';
const validGameStorage=(g,id)=>data.storage.some(s=>s.id===id)&&!['wishlist','backlog'].includes(g.status);
function storageUsage(id){
 const games=data.games.filter(g=>g.storageId===id&&!['wishlist','backlog'].includes(g.status));
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
 else if(g.status==='stored')g.status='installed';
 g.updatedAt=new Date().toISOString();
 await persist();render();gameDetail(id);
 toast(g.platform==='PS5'&&target==='ps5-usb'?'Jeu stocké sur USB : transfert requis pour jouer.':'Emplacement mis à jour.');
}
function gameDetail(id){
 const g=data.games.find(x=>x.id===id);if(!g)return;
 const related=linkedItems(id),usage=storageUsage(g.storageId);
 const playable=g.platform!=='PS5'||g.storageId!=='ps5-usb';
 modal('Fiche jeu · '+g.title,`<div class="g3-detail">
  <div class="g3-cover"><span>${esc(g.title.slice(0,1).toUpperCase())}</span><div><small>${esc(g.platform)}</small>
   <h3>${esc(g.title)}</h3><p>${esc(g.genre||'Genre non renseigné')}${g.favorite?' · ★ Favori':''}</p></div></div>
  <div class="g3-summary-grid">
   <div><small>État</small><strong>${esc(gameStatus(g))}</strong></div>
   <div><small>Taille</small><strong>${g.sizeGB==null?'Inconnue':Number(g.sizeGB).toLocaleString('fr-FR')+' Go'}</strong></div>
   <div><small>Emplacement</small><strong>${esc(storageName(g.storageId))}</strong></div>
   <div><small>Suivis liés</small><strong>${related.length}</strong></div>
  </div>
  ${!playable&&gameIsOnUsb(g)?'<div class="g3-warning">Jeu PS5 conservé sur USB. Pour le lancer, transfère-le sur le SSD interne ou M.2 compatible.</div>':''}
  ${g.notes?`<div class="g3-detail-note"><strong>Notes</strong><p>${esc(g.notes)}</p></div>`:''}
  ${validGameStorage(g,g.storageId)?`<div class="g3-detail-block"><h4>Déplacer le jeu</h4>
   <div class="g3-targets">${data.storage.map(loc=>`<button data-action="move-game" data-id="${esc(g.id)}" data-target="${esc(loc.id)}" ${loc.id===g.storageId?'disabled':''}>${esc(loc.label)}${loc.id===g.storageId?' ✓':''}</button>`).join('')}</div>
   <p class="hint">Déplacement déclaré manuellement : cette action ne déplace pas physiquement les fichiers sur ta console.</p></div>`:''}
  <div class="g3-detail-block"><div class="row"><h4>Passes, DLC et événements</h4><button class="btn secondary small" data-action="new-related-item" data-id="${esc(g.id)}">＋ Lier</button></div>
   ${related.length?related.map(itemRow).join(''):empty('Aucun suivi lié','Ajoute un pass, une sortie ou un événement à ce jeu.')}
  </div>
  <div class="formactions"><button class="btn secondary" data-action="close">Fermer</button>
   <button class="btn" data-action="edit-game" data-id="${esc(g.id)}">Modifier la fiche</button></div>
 </div>`);
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
function itemRow(t){
 const diff=relativeDays(t.date),when=t.date?diff<0?'Date passée':diff===0?"Aujourd'hui":diff===1?'Demain':diff+' jours':'Date à confirmer';
 return `<div class="item"><span class="item-logo">${({pass:'◷',dlc:'✦',release:'★',event:'◇',expense:'€'})[t.kind]||'✦'}</span>
 <div class="item-body"><strong>${esc(t.title)}</strong><small>${esc(types[t.kind]||'Suivi')} · ${esc(gameTitle(t.gameId))} · ${fmt(t.date)}
 ${t.priceCents!=null?' · '+euro(t.priceCents):''}</small>
 <span class="chip ${diff!=null&&diff>=0&&diff<=7?'warn':''}">${esc(when)}</span>
 ${t.status==='paid'?'<span class="chip">Payé (non synchronisé)</span>':t.status==='active'?'<span class="chip">Actif</span>':''}</div>
 <div class="item-end"><button data-action="edit-item" data-id="${esc(t.id)}">Modifier</button>
 <button class="red" data-action="delete-item" data-id="${esc(t.id)}">Supprimer</button></div></div>`;
}
function home(){
 const installed=data.games.filter(g=>['installed','stored'].includes(g.status)),active=data.items.filter(t=>t.kind==='pass'&&t.status==='active');
 const upcoming=data.items.filter(t=>t.date&&t.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
 const planned=data.items.filter(t=>t.priceCents!=null&&!['paid','canceled'].includes(t.status));
 return `<div class="hero"><div class="eyebrow">TON UNIVERS · CENTRALISÉ</div><h1 class="title">Prêt à <span>jouer.</span></h1>
 <p>Bibliothèque, supports, passes, DLC, nouveautés et événements. Un cockpit perso, sans abonnement.</p>
 <div class="actions"><button class="btn" data-action="new-game">＋ Ajouter un jeu</button><button class="btn secondary" data-action="new-item" data-kind="pass">◷ Nouveau pass</button></div></div>
 <div class="grid" style="margin-top:13px"><div class="card"><span class="eyebrow">JEUX</span><div class="metric">${installed.length}</div><div class="muted">installés ou stockés</div></div>
 <div class="card"><span class="eyebrow">PASSES</span><div class="metric">${active.length}</div><div class="muted">actifs</div></div>
 <div class="card"><span class="eyebrow">À PRÉVOIR</span><div class="metric" style="font-size:22px">${euro(planned.reduce((sum,t)=>sum+t.priceCents,0))}</div><div class="muted">non comptabilisés</div></div></div>
 ${section('Capture rapide','Ajoute ce que tu veux suivre.',`<div class="quick">
 <button data-action="new-game"><span>▦</span>Jeu</button><button data-action="new-item" data-kind="pass"><span>◷</span>Pass</button>
 <button data-action="new-item" data-kind="dlc"><span>✦</span>DLC</button><button data-action="new-item" data-kind="expense"><span>€</span>Dépense</button></div>`)}
 ${section('Prochainement','Les dates importantes, saisies par toi.',upcoming.length?`<div class="card">${upcoming.map(itemRow).join('')}</div>`:empty('Aucune échéance','Ajoute un pass ou une sortie avec une date.'),'<button class="btn secondary small" data-nav="tracking">Suivi →</button>')}
 ${section('Ma bibliothèque','Les derniers jeux enregistrés.',installed.length?`<div class="card">${installed.slice(-4).reverse().map(gameRow).join('')}</div>`:empty('Encore vide','Ajoute un jeu pour commencer.'),'<button class="btn secondary small" data-nav="games">Tous les jeux →</button>')}
 <p class="hint">Les jeux et tailles ne sont pas importés de la PlayStation. Les informations restent locales et ne sont pas transmises à NEXUS.</p>`;
}
function games(){
 const rows=data.games.filter(g=>{
  const stateMatch=gameFilter==='all'||(gameFilter==='usb'?g.storageId==='ps5-usb':gameFilter==='favorites'?!!g.favorite:g.status===gameFilter);
  return stateMatch&&(platformFilter==='all'||g.platform===platformFilter)&&(storageFilter==='all'||g.storageId===storageFilter)&&[g.title||'',g.genre||'',g.notes||''].join(' ').toLowerCase().includes(query.toLowerCase());
 }).sort((a,b)=>{
  if(gameSort==='name')return String(a.title).localeCompare(String(b.title),'fr');
  if(gameSort==='size')return Number(b.sizeGB||0)-Number(a.sizeGB||0);
  if(gameSort==='favorite')return Number(!!b.favorite)-Number(!!a.favorite)||String(a.title).localeCompare(String(b.title),'fr');
  return String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
 });
 const platforms=[...new Set(data.games.map(g=>g.platform).filter(Boolean))].sort();
 return `<div class="eyebrow">BIBLIOTHÈQUE · V0.3</div><div class="row"><h1 class="title">Mes jeux<span style="color:var(--accent)">.</span></h1><button class="btn small" data-action="new-game">＋ Ajouter</button></div>
 <p class="sub">${data.games.length} jeu(x) répertorié(s). Chaque fiche regroupe stockage, informations et suivis associés.</p>
 <div class="g3-lib-tools"><label class="g3-search-label"><span class="sr-only">Rechercher un jeu</span><input id="game-search" value="${esc(query)}" placeholder="Rechercher titre, genre ou notes…" autocomplete="off"></label>
 <div class="g3-select-row"><label>Plateforme<select id="g3-platform"><option value="all">Toutes</option>${platforms.map(p=>`<option value="${esc(p)}" ${platformFilter===p?'selected':''}>${esc(p)}</option>`).join('')}</select></label>
 <label>Trier par<select id="g3-sort"><option value="recent" ${gameSort==='recent'?'selected':''}>Ajout récent</option><option value="name" ${gameSort==='name'?'selected':''}>Nom A → Z</option><option value="favorite" ${gameSort==='favorite'?'selected':''}>Favoris</option><option value="size" ${gameSort==='size'?'selected':''}>Taille</option></select></label></div></div>
 ${storageFilter!=='all'?`<div class="g3-storage-active-filter">Emplacement : ${esc(storageName(storageFilter))} <button data-action="clear-storage-filter">Retirer ✕</button></div>`:''}
 <div class="tabs">${[['all','Tous'],['installed','Installés'],['stored','Stockés'],['usb','USB'],['favorites','Favoris'],['wishlist','Souhaits'],['backlog','À jouer']].map(([id,label])=>`<button class="${gameFilter===id?'active':''}" data-action="filter-games" data-filter="${id}">${label}</button>`).join('')}</div>
 <div class="card">${rows.length?rows.map(gameRow).join(''):empty('Aucun jeu dans cette vue','Change tes filtres ou crée une nouvelle fiche.')}</div>
 <p class="hint g3-results">Résultats : ${rows.length} sur ${data.games.length} jeu(x). Les données sont locales et les fiches sont conservées pendant les mises à jour.</p>`;
}
function storage(){
 const active=data.games.filter(g=>g.storageId&&!['wishlist','backlog'].includes(g.status));
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
 const planned=data.items.filter(t=>t.priceCents!=null&&!['paid','canceled'].includes(t.status));
 return `<div class="eyebrow">PASSES · DLC · NOUVEAUTÉS</div><div class="row"><h1 class="title">Suivi<span style="color:var(--accent)">.</span></h1><button class="btn small" data-action="new-item" data-kind="pass">＋ Ajouter</button></div>
 <p class="sub">Tes échéances et tes dépenses prévues liées aux jeux.</p>
 <div class="tabs">${[['all','Tous'],['pass','Pass'],['dlc','DLC'],['release','Nouveautés'],['event','Événements'],['expense','Dépenses']].map(([id,label])=>`<button class="${itemFilter===id?'active':''}" data-action="filter-items" data-filter="${id}">${label}</button>`).join('')}</div>
 <div class="card">${rows.length?rows.map(itemRow).join(''):empty('Aucun suivi','Ajoute un pass, DLC, événement ou achat prévu.')}</div>
 ${section('Dépenses à prévoir','Non enregistrées dans NEXUS.',`<div class="card row"><span class="muted">${planned.length} poste(s) à prévoir</span><strong class="money">${euro(planned.reduce((s,t)=>s+t.priceCents,0))}</strong></div>`)}
 <div class="notice">NEXUS LINK n'est pas encore activé. Même lorsqu'un pass est marqué « Payé », aucune dépense n'est créée dans NEXUS avant une future connexion et validation.</div>`;
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
 ${section('Connexions','Les ponts entre applications viendront plus tard.',`<div class="card"><div class="setting"><div><strong>NEXUS LINK</strong><p>${data.connections.length?'Gaming est jumelée à NEXUS. Seuls les tests de liaison sont actifs.':'Aucune connexion active. Crée un jumelage depuis les réglages de NEXUS.'}</p></div><button class="btn secondary small" data-action="link-panel">${data.connections.length?'Tester':'Jumeler'}</button></div>
 <div class="setting"><div><strong>Notifications push</strong><p>Non activées dans cette bêta.</p></div><span class="chip">À venir</span></div></div>`)}
 ${section('À propos','Gaming V0.3 · bibliothèque et personnalisation',`<div class="card"><p class="hint">Aucun compte ni abonnement. Pas d'API PSN, pas de synchronisation automatique. iOS peut évincer les données d'un site : exporte régulièrement ton JSON, notamment avant toute migration de domaine ou désinstallation.</p></div>`)}`;
}
function render(){const pages={home,games,storage,tracking,settings};$('root').innerHTML=(pages[page]||home)();document.querySelectorAll('[data-nav]').forEach(b=>{b.classList.toggle('active',b.dataset.nav===page);b.setAttribute('aria-current',b.dataset.nav===page?'page':'false');});}
const field=(label,name,value='',extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const selectField=(label,name,opts,current)=>`<label>${label}<select name="${name}">${opts.map(([v,text])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const gameOptions=id=>[['','Aucun jeu'],...data.games.map(g=>[g.id,g.title])].map(([val,label])=>`<option value="${esc(val)}" ${val===id?'selected':''}>${esc(label)}</option>`).join('');
function gameForm(id){
 const old=data.games.find(g=>g.id===id),g=old||{};
 modal(old?'Modifier un jeu':'Ajouter un jeu',`<form id="edit-form" class="form">
 ${field('Nom','title',g.title||'','required maxlength="120" placeholder="Ex. Delta Force"')}
 <div class="formgrid">${selectField('Plateforme','platform',[['PS5','PS5'],['PS4','PS4'],['PC','PC'],['Xbox','Xbox'],['Switch','Switch'],['other','Autre']],g.platform||'PS5')}
 ${selectField('État','status',[['installed','Installé'],['stored','Stocké'],['wishlist','Souhait'],['backlog','À jouer']],g.status||'installed')}</div>
 <div class="formgrid">${selectField('Support','storageId',[['','Aucun'],...data.storage.map(s=>[s.id,s.label])],g.storageId||'ps5-internal')}
 ${field('Taille en Go (facultatif)','sizeGB',g.sizeGB??'','type="number" min="0" max="100000" step="0.1"')}</div>
 ${field('Genre (facultatif)','genre',g.genre||'','maxlength="50" placeholder="FPS, MMO, course, simulation…"')}
 <div class="formgrid">${field('Dernière session','lastPlayedAt',g.lastPlayedAt||'','type="date"')}
 <label class="g3-checkbox"><input type="checkbox" name="favorite" ${g.favorite?'checked':''}><span>★ Jeu favori</span></label></div>
 <label>Notes<textarea name="notes" maxlength="2000">${esc(g.notes||'')}</textarea></label>
 <p class="hint">Les jeux et leurs tailles sont déclarés manuellement, jamais récupérés de la console.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),title=String(v.title||'').trim(),size=v.sizeGB===''?null:Number(v.sizeGB);
 if(!title||size!=null&&(!Number.isFinite(size)||size<0||size>100000)||!validDate(String(v.lastPlayedAt||''))){toast('Nom, taille ou date invalide.');return}
 let status=select(v.status,['installed','stored','wishlist','backlog'],'installed');
 const platform=select(v.platform,['PS5','PS4','PC','Xbox','Switch','other'],'PS5');
 if(platform==='PS5'&&v.storageId==='ps5-usb'&&status==='installed')status='stored';
 const record={...g,id:g.id||uid(),title:title.slice(0,120),platform,
 status,storageId:['wishlist','backlog'].includes(status)?'':v.storageId||'',sizeGB:size,genre:String(v.genre||'').trim().slice(0,50),favorite:v.favorite==='on'||v.favorite===true,lastPlayedAt:String(v.lastPlayedAt||''),notes:String(v.notes||'').slice(0,2000),
 createdAt:g.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,record);else data.games.push(record);
 await persist();closeModal();render();toast('Jeu enregistré.');
 });
}
function itemForm(id,kind='pass',defaultGameId=''){
 const old=data.items.find(i=>i.id===id),t=old||{};
 modal(old?'Modifier un suivi':'Ajouter un suivi',`<form id="edit-form" class="form">
 ${selectField('Type','kind',[['pass','Pass de combat'],['dlc','DLC'],['release','Nouveauté'],['event','Événement'],['expense','Dépense prévue']],t.kind||kind)}
 ${field('Libellé','title',t.title||'','required maxlength="140" placeholder="Ex. Passe Delta Force"')}
 <label>Jeu associé<select name="gameId">${gameOptions(t.gameId||defaultGameId||'')}</select></label>
 <div class="formgrid">${field('Date importante','date',t.date||'','type="date"')}
 ${selectField('Statut','status',[['planned','À prévoir'],['active','Actif'],['paid','Payé'],['finished','Terminé'],['canceled','Annulé']],t.status||'planned')}</div>
 <div class="formgrid">${field('Prix (€) (facultatif)','price',t.priceCents!=null?(t.priceCents/100).toFixed(2):'','inputmode="decimal" placeholder="Ex. 6,99"')}
 ${selectField('Fiabilité de la date','dateConfidence',[['unknown','À confirmer'],['tentative','Provisoire'],['confirmed','Confirmée']],t.dateConfidence||'unknown')}</div>
 ${field('Lien / source (optionnel)','sourceUrl',t.sourceUrl||'','type="url" maxlength="500" placeholder="https://..."')}
 <label>Notes<textarea name="notes" maxlength="2000">${esc(t.notes||'')}</textarea></label>
 <p class="hint">Une dépense prévue n'est pas une dépense réelle. Aucune information n'est envoyée à NEXUS.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),amount=euros(v.price),date=String(v.date||'');
 if(!String(v.title||'').trim()||Number.isNaN(amount)||!validDate(date)){toast('Libellé, prix ou date invalide.');return}
 const rec={...t,id:t.id||uid(),kind:select(v.kind,['pass','dlc','release','event','expense'],'event'),title:String(v.title).trim().slice(0,140),
 gameId:data.games.some(g=>g.id===v.gameId)?v.gameId:'',date,status:select(v.status,['planned','active','paid','finished','canceled'],'planned'),
 priceCents:amount,dateConfidence:select(v.dateConfidence,['unknown','tentative','confirmed'],'unknown'),
 sourceUrl:String(v.sourceUrl||'').trim().slice(0,500),notes:String(v.notes||'').slice(0,2000),
 createdAt:t.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,rec);else data.items.push(rec);
 await persist();closeModal();render();toast('Suivi enregistré.');
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
   <div class="notice">La connexion est configurée. Pour l'instant, seuls les messages de test sont envoyés. Aucune dépense, aucun jeu et aucun rendez-vous ne sont transférés.</div>
   <div class="setting"><div><strong>Connexion active</strong><p>${pair.scopes.length} permission(s) configurée(s) depuis NEXUS.</p></div><span class="chip">Chiffrée</span></div>
   <div class="formactions"><button class="btn secondary" data-action="link-status">Vérifier</button>
    <button class="btn" data-action="link-test">Envoyer un test</button>
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
 if(act==='link-forget')return forgetLink();
 if(act==='view-game')return gameDetail(id);
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
});
$('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importBackup(file)});
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closeModal()});
(async()=>{try{db=await openDB();const existing=await load();if(existing)data=normalize(existing);applyAppearance();render();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}catch(e){$('root').innerHTML='<div class="empty"><strong>Stockage inaccessible</strong>Active le stockage local Safari et recharge la page.</div>';}})();