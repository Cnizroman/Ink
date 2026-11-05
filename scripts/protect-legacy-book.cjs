// Offline packer. Keep the source HTML, MP3 and generated key OUTSIDE Git.
// Usage: node scripts/protect-legacy-book.cjs SOURCE.html AUDIO.mp3
// The private key is written only to ignored .cache/book3-secret.json.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function seal(bytes,key,aad){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(aad));
 return {iv:iv.toString('base64'),data:Buffer.concat([cipher.update(bytes),cipher.final(),cipher.getAuthTag()]).toString('base64')};
}
function pack(source,audio){
 const html=['header','main','footer'].map(tag=>{
  const fragment=source.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,'i'))?.[0];
  if(!fragment)throw new Error(`Missing ${tag}`);return fragment;
 }).join('\n').replace(/<source\b[^>]*>/gi,'').replace(/(<audio\b[^>]*?)\s+src=(["']).*?\2/gi,'$1');
 // The current owner-edited source is authoritative; never restore the stale alternate template.
 if(/<script\b|\bon\w+\s*=/i.test(html))throw new Error('Executable markup is not allowed in the book fragment');
 const key=crypto.randomBytes(32),aad='ink:book3:v1';
 const document=seal(Buffer.from(html),key,aad+':text'),voice=seal(audio,key,aad+':audio');
 const payload=Buffer.from(JSON.stringify({v:1,aad,document,voice}));
 const assetId=crypto.createHash('sha256').update(payload).digest('hex');
 return {payload,assetId,key:key.toString('hex')};
}
function unpack(payload,secret){
 if(crypto.createHash('sha256').update(payload).digest('hex')!==secret.assetId)throw new Error('Asset integrity mismatch');
 const data=JSON.parse(payload),open=(part,suffix)=>{
  const bytes=Buffer.from(part.data,'base64'),dec=crypto.createDecipheriv('aes-256-gcm',Buffer.from(secret.key,'hex'),Buffer.from(part.iv,'base64'));
  dec.setAAD(Buffer.from(data.aad+suffix));dec.setAuthTag(bytes.subarray(-16));return Buffer.concat([dec.update(bytes.subarray(0,-16)),dec.final()]);
 };
 return {html:open(data.document,':text').toString(),audio:open(data.voice,':audio')};
}
if(require.main===module && process.argv[2]==='unpack'){
 const secret=JSON.parse(fs.readFileSync(process.argv[3]||'.cache/book3-secret.json','utf8'));
 if(!/^[a-f0-9]{64}$/.test(secret.assetId)||!/^[a-f0-9]{64}$/.test(secret.key))throw new Error('Invalid private metadata');
 const {html,audio}=unpack(fs.readFileSync(`assets/protected/book3-${secret.assetId}.json`),secret);
 fs.mkdirSync('.cache',{recursive:true});
 fs.writeFileSync('.cache/book3-author.html','<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Где нас нет</title><link rel="stylesheet" href="../style.css"><link rel="stylesheet" href="../book3.css"></head><body class="theme-book3"><div class="container">'+html+'</div></body></html>',{mode:0o600});
 fs.writeFileSync('.cache/book3-author.mp3',audio,{mode:0o600});
 console.log('Private author copies written to ignored .cache/book3-author.html and .cache/book3-author.mp3. Never commit these files.');
}else if(require.main===module){
 const [sourceFile,audioFile]=process.argv.slice(2);
 if(!sourceFile||!audioFile)throw new Error('Usage: node scripts/protect-legacy-book.cjs SOURCE.html AUDIO.mp3');
 const {payload,assetId,key}=pack(fs.readFileSync(sourceFile,'utf8'),fs.readFileSync(audioFile));
 const destination=path.resolve('assets/protected');fs.mkdirSync(destination,{recursive:true});
 // No automatic deletion: publishing a new revision must not destroy existing readers mid-release.
 fs.writeFileSync(path.join(destination,`book3-${assetId}.json`),payload);
 fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/book3-secret.json',JSON.stringify({assetId,key},null,2),{mode:0o600});
 console.log('Encrypted asset written. Private deployment metadata: .cache/book3-secret.json (DO NOT COMMIT).');
}
module.exports={pack,seal,unpack};
