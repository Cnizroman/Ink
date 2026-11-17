const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function pngSize(file){const b=fs.readFileSync(file);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return [b.readUInt32BE(16),b.readUInt32BE(20)];}
test('versioned branded install and browser icons have correct dimensions and manifest purposes',()=>{
 const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
 assert.equal(manifest.scope,'./');assert.equal(manifest.start_url,'./index.html');
 for(const [name,size] of [['assets/ink-app-v2-192.png',192],['assets/ink-app-v2-512.png',512],['assets/ink-apple-v2-180.png',180],['assets/ink-favicon-v2-48.png',48]])assert.deepEqual(pngSize(name),[size,size]);
 assert.ok(manifest.icons.some(i=>i.purpose==='maskable'&&i.sizes==='512x512'&&fs.existsSync(i.src)));
 assert.ok(manifest.icons.some(i=>i.purpose==='any'&&i.sizes==='192x192'&&fs.existsSync(i.src)));
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/ink-apple-v2-180\.png/);assert.match(html,/ink-favicon-v2-48\.png/);
});
test('editorial hero and grouping remain data-driven with accessible decorative art',()=>{
 const js=fs.readFileSync('app.js','utf8'), css=fs.readFileSync('app.css','utf8');
 assert.match(js,/hero-art" aria-hidden="true"/);assert.match(js,/function shelfEntries\(list\)/);assert.match(js,/function workTiles\(list\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/\.hero-main/);assert.match(css,/\.studio-side-label/);
});
