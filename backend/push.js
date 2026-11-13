const te=new TextEncoder();
const b64=(buf)=>{let s='';for(const b of buf)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const un64=(s)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
const sha=async(s)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const hkdf=async(ikm,salt,info,size)=>crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']),size*8).then(x=>new Uint8Array(x));
const JOB_ID=/^[a-f0-9]{64}$/;
function validSub(s){
  if(!s||typeof s.endpoint!=='string'||!s.keys)return false;
  let url;try{url=new URL(s.endpoint);}catch{return false;}
  if(url.protocol!=='https:'||url.username||url.password||url.port||s.endpoint.length>2500)return false;
  const h=url.hostname.toLowerCase();
  if(!['push.apple.com','fcm.googleapis.com','push.services.mozilla.com'].some(d=>h===d||h.endsWith('.'+d)))return false;
  try{return un64(s.keys.p256dh).length===65&&un64(s.keys.auth).length===16;}catch{return false;}
}
async function webPush(device,env,payload){
  if(!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)throw new Error('VAPID is not configured');
  const p=un64(device.p256dh),auth=un64(device.auth);
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sender=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  const receiver=await crypto.subtle.importKey('raw',p,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiver},ephemeral.privateKey,256));
  const ikm=await hkdf(shared,auth,concat(te.encode('WebPush: info\0'),p,sender),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,te.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(ikm,salt,te.encode('Content-Encoding: nonce\0'),12);
  const plaintext=concat(te.encode(JSON.stringify(payload)),new Uint8Array([2]));
  if(plaintext.length>3700)throw new Error('Payload too large');
  const aes=await crypto.subtle.importKey('raw',cek,{name:'AES-GCM'},false,['encrypt']);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},aes,plaintext));
  const rs=new Uint8Array([0,0,16,0]); // 4096-byte single record
  const content=concat(salt,rs,new Uint8Array([sender.length]),sender,encrypted);
  const vapid=await crypto.subtle.importKey('jwk',JSON.parse(env.VAPID_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const aud=new URL(device.endpoint).origin;
  const header=b64(te.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims=b64(te.encode(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+3600,sub:'https://gaming-app.q9pfwtztsc.workers.dev'})));
  const unsigned=header+'.'+claims;
  const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},vapid,te.encode(unsigned)));
  const jwt=unsigned+'.'+b64(sig);
  const reply=await fetch(device.endpoint,{method:'POST',headers:{
    'Authorization':'vapid t='+jwt+', k='+env.VAPID_PUBLIC_KEY,
    'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','TTL':'3600'
  },body:content});
  if(reply.status===404||reply.status===410)return 'gone';
  if(!reply.ok)throw new Error('Push endpoint '+reply.status);
  return 'sent';
}

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
const AUTH=/^Bearer ([A-Za-z0-9_-]{43})$/;
async function bodyJson(request,max=50000){
 const length=Number(request.headers.get('content-length')||0);
 if(length>max)throw new Error('INVALID_PAYLOAD');
 const content=await request.text();if(content.length>max)throw new Error('INVALID_PAYLOAD');
 try{return JSON.parse(content)}catch{throw new Error('INVALID_JSON')}
}
async function checkDevice(request,env,payload){
 const bearer=AUTH.exec(request.headers.get('authorization')||'');
 const id=payload?.deviceId;
 if(!bearer||typeof id!=='string'||!JOB_ID.test(id))return null;
 const hashed=await sha('gaming-push-v1:'+bearer[1]);
 const device=await env.DB.prepare('SELECT * FROM push_devices WHERE device_id=? AND token_hash=?')
  .bind(id,hashed).first();
 return device;
}
export async function pushRouter(request,env){
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://gaming-app.q9pfwtztsc.workers.dev')return json({ok:false,error:'ORIGIN_DENIED'},403);
 const path=new URL(request.url).pathname;
 // EMERGENCY 2026-11-13: pause push scheduling to protect free D1 write quota.
 if(path==='/api/v1/gaming-push/schedule')return json({ok:false,error:'PUSH_TEMPORARILY_PAUSED'},503);
 if(path==='/api/v1/gaming-push/config'&&request.method==='GET')
  return json({ok:true,ready:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_JWK&&env.DB),publicKey:env.VAPID_PUBLIC_KEY||null,intervalMinutes:5});
 if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 let payload;try{payload=await bodyJson(request)}catch(e){return json({ok:false,error:e.message},400)}
 if(path==='/api/v1/gaming-push/register'){
  const auth=AUTH.exec(request.headers.get('authorization')||'');
  if(!auth||!validSub(payload?.subscription))return json({ok:false,error:'INVALID_REGISTRATION'},400);
  if(!env.PUSH_RATE_PEPPER)return json({ok:false,error:'NOT_CONFIGURED'},503);
  const nowAt=Date.now();
  const key=await sha('gaming-register:'+new Date(nowAt).toISOString().slice(0,10)+':'+(request.headers.get('CF-Connecting-IP')||'unknown')+':'+env.PUSH_RATE_PEPPER);
  const limited=await env.DB.prepare(`INSERT INTO push_register_rate(day_key,count,updated_at) VALUES(?,1,?)
   ON CONFLICT(day_key) DO UPDATE SET count=count+1,updated_at=excluded.updated_at WHERE count<20 RETURNING count`)
   .bind(key,nowAt).first();
  if(!limited)return json({ok:false,error:'REGISTRATION_RATE_LIMIT'},429);
  const sub=payload.subscription,deviceId=await sha(sub.endpoint);
  const tokenHash=await sha('gaming-push-v1:'+auth[1]),now=Math.floor(Date.now()/1000);
  const existing=await env.DB.prepare('SELECT token_hash FROM push_devices WHERE device_id=?').bind(deviceId).first();
  if(existing&&existing.token_hash!==tokenHash)return json({ok:false,error:'DEVICE_ALREADY_REGISTERED'},409);
  const total=await env.DB.prepare('SELECT COUNT(*) AS n FROM push_devices').first();
  if(!existing&&Number(total?.n)>=500)return json({ok:false,error:'CAPACITY_LIMIT'},503);
  await env.DB.prepare(`INSERT INTO push_devices(device_id,token_hash,endpoint,p256dh,auth,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET
    endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at`)
   .bind(deviceId,tokenHash,sub.endpoint,sub.keys.p256dh,sub.keys.auth,now,now).run();
  return json({ok:true,deviceId});
 }
 const device=await checkDevice(request,env,payload);
 if(!device)return json({ok:false,error:'UNAUTHORIZED'},401);
 if(path==='/api/v1/gaming-push/unsubscribe'){
  await env.DB.prepare('DELETE FROM push_devices WHERE device_id=? AND token_hash=?')
   .bind(device.device_id,device.token_hash).run();
  return json({ok:true});
 }
 if(path==='/api/v1/gaming-push/test'){
  const now=Math.floor(Date.now()/1000);
  if(now-device.last_test<90)return json({ok:false,error:'RATE_LIMITED'},429);
  await env.DB.prepare('UPDATE push_devices SET last_test=? WHERE device_id=?').bind(now,device.device_id).run();
  try{
   const result=await webPush(device,env,{title:'Gaming · Notifications',body:'Ton iPhone peut recevoir les rappels des saisons.',tag:'gaming-push-test'});
   if(result==='gone'){
    await env.DB.prepare('DELETE FROM push_devices WHERE device_id=?').bind(device.device_id).run();
    return json({ok:false,error:'SUBSCRIPTION_EXPIRED'},410);
   }
   return json({ok:true});
  }catch(e){console.error('Gaming push test',String(e).slice(0,140));return json({ok:false,error:'PUSH_DELIVERY_FAILED'},502)}
 }
 if(path==='/api/v1/gaming-push/schedule'){
  const list=payload?.jobs;
  if(!Array.isArray(list)||list.length>250)return json({ok:false,error:'INVALID_JOBS'},400);
  const now=Math.floor(Date.now()/1000),jobs=[];
  for(const entry of list){
   if(!JOB_ID.test(entry?.id)||!['mid','14d','7d'].includes(entry.milestone)||
      !Number.isSafeInteger(entry.fireAt)||entry.fireAt<now-600||entry.fireAt>now+366*86400)
    return json({ok:false,error:'INVALID_JOB'},400);
   jobs.push(entry);
  }
  const unique=new Map(jobs.map(j=>[j.id,j]));
  const statements=[env.DB.prepare('DELETE FROM push_jobs WHERE device_id=? AND delivered_at IS NULL').bind(device.device_id)];
  for(const entry of unique.values()){
   statements.push(env.DB.prepare('INSERT OR IGNORE INTO push_jobs(device_id,job_id,milestone,fire_at) VALUES(?,?,?,?)')
    .bind(device.device_id,entry.id,entry.milestone,entry.fireAt));
  }
  await env.DB.batch(statements);
  return json({ok:true,scheduled:unique.size});
 }
 return json({ok:false,error:'NOT_FOUND'},404);
}
export async function deliverDue(env){
 if(!env.DB||!env.VAPID_PRIVATE_JWK||!env.VAPID_PUBLIC_KEY)return;
 const now=Math.floor(Date.now()/1000);
 const due=await env.DB.prepare(`SELECT j.device_id,j.job_id,j.milestone,j.fire_at,d.endpoint,d.p256dh,d.auth
  FROM push_jobs j INNER JOIN push_devices d ON j.device_id=d.device_id
  WHERE j.delivered_at IS NULL AND j.fire_at<=? AND j.fire_at>=?
  ORDER BY j.fire_at ASC LIMIT 40`).bind(now,now-86400).all();
 for(const row of due.results||[]){
  const marked=await env.DB.prepare('UPDATE push_jobs SET delivered_at=? WHERE device_id=? AND job_id=? AND delivered_at IS NULL')
   .bind(now,row.device_id,row.job_id).run();
  if(!marked.meta?.changes)continue;
  try{
   const body={
    mid:'La saison que tu suis arrive à mi-parcours.',
    '14d':'Une saison suivie se termine dans deux semaines.',
    '7d':'Une saison suivie se termine dans une semaine.'
   }[row.milestone]||'Un rappel Gaming est disponible.';
   const status=await webPush(row,env,{title:'Gaming · Saison',body,tag:'gaming-'+row.job_id.slice(0,16)});
   if(status==='gone')await env.DB.prepare('DELETE FROM push_devices WHERE device_id=?').bind(row.device_id).run();
  }catch(e){
   console.error('Gaming scheduled push failure',String(e).slice(0,120));
   await env.DB.prepare('UPDATE push_jobs SET delivered_at=NULL WHERE device_id=? AND job_id=? AND delivered_at=?')
    .bind(row.device_id,row.job_id,now).run();
  }
 }
 await env.DB.prepare('DELETE FROM push_jobs WHERE delivered_at IS NOT NULL AND delivered_at<?').bind(now-30*86400).run();
 await env.DB.prepare('DELETE FROM push_jobs WHERE delivered_at IS NULL AND fire_at<?').bind(now-86400).run();
 await env.DB.prepare('DELETE FROM push_register_rate WHERE updated_at<?').bind((now-2*86400)*1000).run();
}
