const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {pack,unpack}=require('../scripts/protect-legacy-book.cjs');
const read=name=>fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
test('legacy gate and old alias contain neither reader nor reversible passwords',()=>{
 for(const name of ['book3.html','book3-final-voice.html']){
  const html=read(name);assert.doesNotMatch(html,/<main\b|<template\b|id="book-content"|const _[pb]\s*=/i);
 }
 assert.doesNotMatch(read('book3.html'),/src="script.js"/);
 assert.match(read('book3-final-voice.html'),/url=book3.html/);
 assert.equal(fs.existsSync(require('node:path').join(__dirname,'..','final-voice-with-shot-balanced-2.mp3')),false);
});
test('text and audio are authenticated AES-GCM ciphertext and require the private key',()=>{
 const source='<header>Title</header><main><p>PRIVATE TEST BODY</p><audio><source src="secret.mp3"></audio></main><footer>End</footer>';
 const result=pack(source,Buffer.from('PRIVATE TEST VOICE'));
 assert.equal(unpack(result.payload,{assetId:result.assetId,key:result.key}).audio.toString(),'PRIVATE TEST VOICE');
 assert.match(unpack(result.payload,{assetId:result.assetId,key:result.key}).html,/PRIVATE TEST BODY/);
 assert.throws(()=>unpack(Buffer.concat([result.payload,Buffer.from(' ')]),{assetId:result.assetId,key:result.key}),/integrity/);
 assert.equal(result.assetId,crypto.createHash('sha256').update(result.payload).digest('hex'));
 assert.ok(!result.payload.includes('PRIVATE TEST BODY'));assert.ok(!result.payload.includes(result.key));
 const payload=JSON.parse(result.payload),open=(part,key,aad)=>{
  const sealed=Buffer.from(part.data,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(part.iv,'base64'));
  dec.setAuthTag(sealed.subarray(-16));dec.setAAD(Buffer.from(aad));return Buffer.concat([dec.update(sealed.subarray(0,-16)),dec.final()]).toString();
 };
 assert.match(open(payload.document,result.key,payload.aad+':text'),/PRIVATE TEST BODY/);
 assert.doesNotMatch(open(payload.document,result.key,payload.aad+':text'),/<source/);
 assert.equal(open(payload.voice,result.key,payload.aad+':audio'),'PRIVATE TEST VOICE');
 assert.notEqual(payload.document.iv,payload.voice.iv);
 assert.throws(()=>open(payload.document,'00'.repeat(32),payload.aad+':text'));
 assert.throws(()=>open(payload.document,result.key,payload.aad+':audio'));
 assert.throws(()=>pack(source.replace('<p>','<p onclick="steal()">'),Buffer.from('voice')),/Executable/);
});
test('old plaintext cache is invalidated and never used as an offline fallback',()=>{
 const sw=read('sw.js');assert.match(sw,/chernila-v23/);assert.match(sw,/final-voice-with-shot-balanced-2/);assert.match(sw,/cache:'no-store'/);
 const client=read('legacy-book.js');assert.match(client,/unlock_legacy_book/);assert.doesNotMatch(client,/localStorage|sessionStorage|indexedDB/);
 assert.match(client,/SHA-256/);assert.match(client,/pagehide/);assert.match(client,/persisted/);
});
