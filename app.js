"use strict";
/* Gaming V0.1 — standalone, offline-first, no PlayStation API and no NEXUS sync */
const DB_NAME='gaming-personal-v1',STORE='state';
const STORAGE=[
 {id:'ps5-internal',type:'internal',label:'SSD interne PS5',capacityGB:null},
 {id:'ps5-m2',type:'m2',label:'SSD M.2',capacityGB:null},
 {id:'ps5-usb',type:'usb',label:'Disque USB externe',capacityGB:null}
];
const INITIAL=()=>({version:1,games:[],items:[],storage:STORAGE.map(s=>({...s})),trash:[]});
let data=INITIAL(),db=null,page='home',gameFilter='all',itemFilter='all',query='';
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
function gameRow(g){
 const warning=g.platform==='PS5'&&g.storageId==='ps5-usb'&&!['wishlist','backlog'].includes(g.status);
 return `<div class="item"><span class="item-logo">${esc(String(g.title||'G').slice(0,1).toUpperCase())}</span>
 <div class="item-body"><strong>${esc(g.title)}</strong><small>${esc(g.platform)} · ${esc(gameStatus(g))} · ${esc(storageName(g.storageId))}
 ${g.sizeGB!=null?' · '+Number(g.sizeGB).toLocaleString('fr-FR')+' Go':''}</small>
 ${warning?'<p class="warning">PS5 sur USB : transfert obligatoire pour jouer.</p>':''}</div>
 <div class="item-end"><button data-action="edit-game" data-id="${esc(g.id)}">Modifier</button>
 <button class="red" data-action="delete-game" data-id="${esc(g.id)}">Supprimer</button></div></div>`;
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
 const rows=data.games.filter(g=>(gameFilter==='all'||(gameFilter==='usb'?g.storageId==='ps5-usb':g.status===gameFilter))&&g.title.toLowerCase().includes(query.toLowerCase()))
 .sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
 return `<div class="eyebrow">BIBLIOTHÈQUE</div><div class="row"><h1 class="title">Mes jeux<span style="color:var(--accent)">.</span></h1><button class="btn small" data-action="new-game">＋ Ajouter</button></div>
 <p class="sub">${data.games.length} jeu(x) répertorié(s). Classe-les par plateforme et emplacement.</p>
 <div class="tabs">${[['all','Tous'],['installed','Installés'],['stored','Stockés'],['usb','USB'],['wishlist','Souhaits'],['backlog','À jouer']].map(([id,label])=>`<button class="${gameFilter===id?'active':''}" data-action="filter-games" data-filter="${id}">${label}</button>`).join('')}</div>
 <div class="card" style="margin-bottom:12px"><input id="game-search" value="${esc(query)}" placeholder="Rechercher un jeu..." style="width:100%;background:#101926;border:1px solid #3e4e63;border-radius:9px;color:white;padding:10px"></div>
 <div class="card">${rows.length?rows.map(gameRow).join(''):empty('Aucun jeu','Change le filtre ou ajoute ton premier jeu.')}</div>`;
}
function storage(){
 return `<div class="eyebrow">CONSOLE · SUPPORTS</div><h1 class="title">Stockage<span style="color:var(--accent)">.</span></h1>
 <p class="sub">Capacités et tailles saisies à la main. Les chiffres ne représentent pas les données système de la PS5.</p>
 <div class="grid">${data.storage.map(s=>{
 const games=data.games.filter(g=>g.storageId===s.id&&!['wishlist','backlog'].includes(g.status));
 const used=games.reduce((n,g)=>n+(Number(g.sizeGB)||0),0),cap=Number(s.capacityGB)||0;
 return `<div class="card"><span class="eyebrow">${s.type==='usb'?'EXTERNE':s.type==='m2'?'EXTENSION':'CONSOLE'}</span>
 <h2 style="font-size:17px;margin:10px 0">${esc(s.label)}</h2><div class="metric">${used.toLocaleString('fr-FR',{maximumFractionDigits:1})} <small style="font-size:12px">Go</small></div>
 <div class="bars"><i style="width:${cap?Math.min(100,Math.round(used/cap*100)):0}%"></i></div>
 <div class="muted">${games.length} jeu(x) · ${cap?cap+' Go configurés':'Capacité inconnue'}</div>
 ${s.type==='usb'?'<p class="warning">PS5 sur USB : non jouable directement.</p>':''}
 <div class="actions"><button class="btn secondary small" data-action="edit-storage" data-id="${esc(s.id)}">Capacité ✎</button></div></div>`;
 }).join('')}</div>
 ${section('Jeux répertoriés','Pour déplacer un jeu, modifie son emplacement.',`<div class="card">${data.games.filter(g=>g.storageId).length?data.games.filter(g=>g.storageId).map(gameRow).join(''):empty('Aucun jeu associé','Ajoute un jeu avec son emplacement.')}</div>`)}
 <div class="notice">Les jeux PS5 peuvent être conservés sur USB, mais doivent être transférés sur le SSD interne ou un M.2 compatible avant d'être lancés. Les jeux PS4 compatibles peuvent être lancés depuis USB.</div>`;
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
 ${section('Données','Conserve une copie de ta bibliothèque.',`<div class="card">
 <div class="setting"><div><strong>Exporter mes données</strong><p>Une sauvegarde JSON de tous les jeux, événements et supports.</p></div><button class="btn secondary small" data-action="export">Export</button></div>
 <div class="setting"><div><strong>Importer un JSON</strong><p>Remplace les données locales après confirmation.</p></div><button class="btn secondary small" data-action="import">Import</button></div>
 <div class="setting"><div><strong>Corbeille</strong><p>${data.trash.length} élément(s) récupérable(s).</p></div><button class="btn secondary small" data-action="trash">Voir</button></div></div>`)}
 ${section('Connexions','Les ponts entre applications viendront plus tard.',`<div class="card"><div class="setting"><div><strong>NEXUS LINK</strong><p>Non connecté. Aucun échange n'a lieu.</p></div><span class="chip warn">À venir</span></div>
 <div class="setting"><div><strong>Notifications push</strong><p>Non activées dans cette bêta.</p></div><span class="chip">À venir</span></div></div>`)}
 ${section('À propos','Gaming V0.1 · bêta privée',`<div class="card"><p class="hint">Aucun compte ni abonnement. Pas d'API PSN, pas de synchronisation automatique. iOS peut évincer les données d'un site : exporte régulièrement ton JSON, notamment avant toute migration de domaine ou désinstallation.</p></div>`)}`;
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
 <label>Notes<textarea name="notes" maxlength="2000">${esc(g.notes||'')}</textarea></label>
 <p class="hint">Les jeux et leurs tailles sont déclarés manuellement, jamais récupérés de la console.</p>
 <div class="formactions"><button type="button" class="btn secondary" data-action="close">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form>`);
 $('edit-form').addEventListener('submit',async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target)),title=String(v.title||'').trim(),size=v.sizeGB===''?null:Number(v.sizeGB);
 if(!title||size!=null&&(!Number.isFinite(size)||size<0||size>100000)){toast('Nom ou taille invalide.');return}
 const status=select(v.status,['installed','stored','wishlist','backlog'],'installed');
 const record={...g,id:g.id||uid(),title:title.slice(0,120),platform:select(v.platform,['PS5','PS4','PC','Xbox','Switch','other'],'PS5'),
 status,storageId:['wishlist','backlog'].includes(status)?'':v.storageId||'',sizeGB:size,notes:String(v.notes||'').slice(0,2000),
 createdAt:g.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 if(old)Object.assign(old,record);else data.games.push(record);
 await persist();closeModal();render();toast('Jeu enregistré.');
 });
}
function itemForm(id,kind='pass'){
 const old=data.items.find(i=>i.id===id),t=old||{};
 modal(old?'Modifier un suivi':'Ajouter un suivi',`<form id="edit-form" class="form">
 ${selectField('Type','kind',[['pass','Pass de combat'],['dlc','DLC'],['release','Nouveauté'],['event','Événement'],['expense','Dépense prévue']],t.kind||kind)}
 ${field('Libellé','title',t.title||'','required maxlength="140" placeholder="Ex. Passe Delta Force"')}
 <label>Jeu associé<select name="gameId">${gameOptions(t.gameId||'')}</select></label>
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
 data=incoming;await persist();closeModal();render();toast('Sauvegarde importée.');
 }catch(e){toast('Erreur import : '+String(e.message).slice(0,80));}
}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return}
 const btn=e.target.closest('[data-action]');if(!btn)return;
 const act=btn.dataset.action,id=btn.dataset.id;
 if(act==='close')return closeModal();
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
$('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await importBackup(file)});
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closeModal()});
(async()=>{try{db=await openDB();const existing=await load();if(existing)data=normalize(existing);render();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}catch(e){$('root').innerHTML='<div class="empty"><strong>Stockage inaccessible</strong>Active le stockage local Safari et recharge la page.</div>';}})();