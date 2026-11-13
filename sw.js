const CACHE='gaming-v0.16';const CORE=['/','/index.html','/styles.css','/app.js?v=0120','/link-core.js','/link-hub-adapter.js?v=0130','/push-client.js','/cover-client.js','/link-audit.js?v=0120','/nexus-sync.js?v=0130','/link-bridge.js?v=0061','/manifest.webmanifest','/icon.svg'];self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gaming-v')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||new URL(e.request.url).pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}return r}).catch(()=>caches.match(e.request)));});
self.addEventListener('push',e=>{
 let payload={};try{payload=e.data?.json()||{}}catch{}
 const title=typeof payload.title==='string'&&payload.title.length<100?payload.title:'Gaming · Rappel';
 const body=typeof payload.body==='string'&&payload.body.length<220?payload.body:'Une saison approche de son échéance.';
 e.waitUntil(self.registration.showNotification(title,{body,tag:typeof payload.tag==='string'&&payload.tag.length<60?payload.tag:'gaming-season',icon:'/icon.svg',badge:'/icon.svg'}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{
  for(const c of list){if(c.url.startsWith(self.location.origin)){await c.focus();return}}
  await self.clients.openWindow('/');
 }));
});
