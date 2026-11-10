// GitHub source -> deterministic Cloudflare Worker bundle. Uses Node built-ins only.
import {readFile,writeFile} from 'node:fs/promises';
const names=['index.html','app.js','link-core.js','styles.css','sw.js','manifest.webmanifest','icon.svg'];
const types={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/link-core.js':'text/javascript; charset=utf-8','/styles.css':'text/css; charset=utf-8','/sw.js':'text/javascript; charset=utf-8','/manifest.webmanifest':'application/manifest+json; charset=utf-8','/icon.svg':'image/svg+xml'};
const files=Object.fromEntries(await Promise.all(names.map(async name=>['/'+name,await readFile(new URL('../'+name,import.meta.url),'utf8')])));
files['/']=files['/index.html'];
const runtime="export default {async fetch(request){const path=new URL(request.url).pathname;if(request.method!=='GET')return new Response('Method Not Allowed',{status:405});if(!Object.hasOwn(files,path))return new Response('Not Found',{status:404,headers:{'Content-Type':'text/plain;charset=utf-8'}});const headers={'Content-Type':types[path],'Cache-Control':path==='/'||path==='/index.html'||path==='/sw.js'?'no-cache':'public,max-age=180','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};if(path==='/sw.js')headers['Service-Worker-Allowed']='/';if(path==='/'||path==='/index.html')headers['Content-Security-Policy']=\"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;connect-src 'self' https://nexus-app-api.q9pfwtztsc.workers.dev;object-src 'none';base-uri 'none'\";return new Response(files[path],{headers});}}";
const bundle='const files='+JSON.stringify(files)+';const types='+JSON.stringify(types)+';'+runtime;
await writeFile(new URL('../worker.mjs',import.meta.url),bundle);
console.log('Built Gaming Worker',Object.keys(files).length,'routes');
