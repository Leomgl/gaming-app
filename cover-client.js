/* Gaming Covers — free Wikimedia search, cautious automatic suggestion, manual override.
   No API key, no stored third-party binary, no backend catalogue. */
'use strict';
(()=>{
 let adapter=null;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const safeImg=url=>{
  try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='upload.wikimedia.org'&&u.href.length<=500?u.href:''}catch{return ''}
 };
 const normalizeTitle=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/\((jeu vidéo|video game|\d{4} video game)\)/g,'').replace(/[^a-z0-9]/g,'');
 async function suggestions(title){
  const search=String(title||'').trim().slice(0,100);
  if(!search)return [];
  const found=[],seen=new Set();
  for(const [lang,suffix] of [['fr','jeu vidéo'],['en','video game']]){
   const query=new URLSearchParams({action:'query',generator:'search',gsrsearch:search+' '+suffix,gsrnamespace:'0',gsrlimit:'8',
    prop:'pageimages|pageterms',piprop:'thumbnail',pithumbsize:'480',pilicense:'any',
    wbptterms:'description',format:'json',formatversion:'2',origin:'*'});
   let pages;
   try{
    const response=await fetch('https://'+lang+'.wikipedia.org/w/api.php?'+query,{credentials:'omit'});
    if(!response.ok)continue;
    const payload=await response.json();
    pages=Array.isArray(payload.query?.pages)?payload.query.pages:[];
   }catch{continue;}
   for(const page of pages){
    const image=safeImg(page.thumbnail?.source),id=Number(page.pageid);
    if(!image||!Number.isSafeInteger(id)||id<1||seen.has(image))continue;
    seen.add(image);
    const description=(page.terms?.description||[]).join(' ').slice(0,150);
    const exact=normalizeTitle(page.title)===normalizeTitle(search);
    const related=normalizeTitle(page.title).startsWith(normalizeTitle(search));
    const gaming=/jeu vidéo|jeu vid[eé]o|jeu de tir|jeu de rôle|battle royale|video game|game franchise|game series|game developed/i.test(description);
    found.push({image,source:'https://'+lang+'.wikipedia.org/?curid='+id,
     title:String(page.title||'').slice(0,120),description,lang,
     confident:exact&&gaming,score:(exact?100:related?40:0)+(gaming?20:0)});
   }
   if(found.some(x=>x.confident))break;
  }
  return found.sort((a,b)=>b.score-a.score).slice(0,10);
 }
 let current={gameId:'',items:[]};
 async function search(gameId,title,element){
  element.innerHTML='<p class="muted">Recherche des images disponibles…</p>';
  const result=await suggestions(title);
  if(current.gameId!==gameId)return;
  current.items=result;
  element.innerHTML=result.length?'<div class="g6-cover-grid">'+result.map((x,i)=>
   '<button type="button" class="g6-cover-choice" data-cover-choice="'+i+'">'+
   '<img src="'+esc(x.image)+'" loading="lazy" alt="">'+
   '<strong>'+esc(x.title)+'</strong><small>Wikipédia '+x.lang.toUpperCase()+
   (x.description?' · '+esc(x.description):'')+'</small></button>').join('')+'</div>':
   '<div class="empty"><strong>Aucun visuel trouvé</strong>Essaie un autre titre ou ajoute une URL HTTPS manuellement.</div>';
 }
 async function find(gameId){
  const g=adapter?.game(gameId);if(!g)return;
  current={gameId,items:[]};
  adapter.modal('Jaquette · '+g.title,
   '<div class="g6-cover-finder"><p class="hint">Recherche gratuite sur Wikipédia. Les suggestions peuvent être des logos ou illustrations : vérifie avant de choisir.</p>'+
   '<form id="g6-cover-search" class="form"><label>Titre à chercher'+
   '<input name="title" maxlength="100" required value="'+esc(g.title)+'"></label>'+
   '<button type="submit" class="btn">Chercher une jaquette</button></form>'+
   '<div id="g6-cover-results" aria-live="polite"></div>'+
   '<div class="formactions"><button type="button" class="btn secondary" id="g6-cover-manual">URL manuelle</button>'+
   (g.coverUrl?'<button type="button" class="btn secondary" id="g6-cover-clear">Retirer la jaquette</button>':'')+'</div></div>');
  const results=document.getElementById('g6-cover-results');
  const run=title=>search(gameId,title,results).catch(()=>{results.textContent='Recherche temporairement indisponible.'});
  document.getElementById('g6-cover-search')?.addEventListener('submit',e=>{
   e.preventDefault();run(new FormData(e.target).get('title')||g.title);
  });
  results?.addEventListener('click',async e=>{
   const btn=e.target.closest('[data-cover-choice]');if(!btn)return;
   const entry=current.gameId===gameId?current.items[Number(btn.dataset.coverChoice)]:null;
   if(!entry)return;
   btn.disabled=true;
   try{await adapter.save(gameId,entry.image,entry.source);current={gameId:'',items:[]};}
   catch(err){alert('Impossible de conserver la jaquette : '+err.message);btn.disabled=false;}
  });
  document.getElementById('g6-cover-manual')?.addEventListener('click',()=>adapter.edit(gameId));
  document.getElementById('g6-cover-clear')?.addEventListener('click',()=>adapter.save(gameId,'',''));
  await run(g.title);
 }
 async function auto(gameId,title){
  if(!navigator.onLine||!adapter||adapter.game(gameId)?.coverUrl)return;
  try{
   const options=await suggestions(title);
   const first=options.find(x=>x.confident);
   const g=adapter.game(gameId);
   if(first&&g&&g.title===title&&!g.coverUrl)await adapter.save(gameId,first.image,first.source,{quiet:true});
  }catch(err){console.warn('Recherche automatique de jaquette',err?.message||'indisponible')}
 }
 window.GamingCovers=Object.freeze({attach(a){adapter=a},find,auto,suggestions});
})();