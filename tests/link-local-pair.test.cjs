'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const btoa=s=>Buffer.from(s,'binary').toString('base64');
const atob=s=>Buffer.from(s,'base64').toString('binary');
for(const spec of [{"path":"link-core.js","field":"NexusLinkCore","sourceApp":"gaming"}]){
 test(spec.path+' : jumelage local E2EE compatible Hub et relais supprimé',async()=>{
  let requests=0;
  const context={window:{},crypto:webcrypto,TextEncoder,TextDecoder,Date,Uint8Array,
   btoa,atob,fetch:async()=>{requests++;throw Error('RELAY_FORBIDDEN')}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',spec.path),'utf8'),context);
  const core=context.window[spec.field];
  const pair=await core.createPair(spec.sourceApp,['test_scope']);
  assert.equal(pair.sourceApp,spec.sourceApp);
  assert.equal(pair.scopes[0],'test_scope');
  const imported=core.readInvite(core.invitation(pair));
  assert.equal(imported.id,pair.id);
  assert.equal(imported.seed,pair.seed);
  const status=await core.status(imported);
  assert.equal(status.connected,true);
  assert.equal(status.localOnly,true);
  const key1=await core.sourceKey(imported,'entity-1');
  const key2=await core.sourceKey(imported,'entity-1');
  assert.equal(key1,key2);
  assert.match(key1,/^[0-9a-f]{64}$/);
  await assert.rejects(core.publish(imported,{entityId:'entity-1',scope:'test_scope',payload:{a:1}}),/RELAIS_HISTORIQUE_RETIRÉ/);
  await assert.rejects(core.inbox(imported),/RELAIS_HISTORIQUE_RETIRÉ/);
  assert.equal((await core.revoke(imported)).localOnly,true);
  assert.equal(requests,0,'aucun appel serveur hérité pour le jumelage ou la suppression');
 });
}
