const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='https://cnizroman.github.io/Ink/';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const head=name=>read(name).split(/<\/head>/i)[0];
function metadata(html,key){
 const tags=[...html.matchAll(/<meta\s+[^>]*>/gi)].map(m=>m[0]);
 const matches=tags.filter(tag=>new RegExp('(?:property|name)="'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"','i').test(tag));
 assert.equal(matches.length,1,'exactly one '+key);return matches[0].match(/\bcontent="([^"]*)"/i)?.[1];
}
test('home link preview is available to non-JavaScript crawlers and describes the platform, not the old book',()=>{
 const html=head('index.html');assert.ok(html.includes('<link rel="canonical" href="'+base+'">'));
 assert.equal(metadata(html,'og:url'),base);assert.equal(metadata(html,'og:site_name'),'Чернила');assert.equal(metadata(html,'og:type'),'website');
 assert.match(metadata(html,'og:title'),/Чернила.*авторов и читателей/);
 for(const key of ['description','og:description','twitter:description']){assert.match(metadata(html,key),/рассказы|романы|стихи/i);assert.ok(!/Никто не вспомнит|тетралоги/i.test(metadata(html,key)));}
 assert.equal(metadata(html,'twitter:title'),metadata(html,'og:title'));assert.equal(metadata(html,'twitter:card'),'summary_large_image');
 const image=metadata(html,'og:image');assert.equal(image,base+'assets/ink-social-card-v1.png');assert.equal(metadata(html,'og:image:secure_url'),image);assert.equal(metadata(html,'twitter:image'),image);
 assert.match(metadata(html,'og:image:alt'),/Чернила/);assert.equal(metadata(html,'twitter:image:alt'),metadata(html,'og:image:alt'));assert.equal(metadata(html,'og:image:type'),'image/png');
 const png=fs.readFileSync(path.join(root,new URL(image).pathname.slice('/Ink/'.length)));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 assert.equal(Number(metadata(html,'og:image:width')),png.readUInt32BE(16));assert.equal(Number(metadata(html,'og:image:height')),png.readUInt32BE(20));assert.ok(png.length<1024*1024);
 assert.match(read('assets/ink-social-card-v1.svg'),/Чернила/);assert.ok(!read('assets/ink-social-card-v1.svg').includes('Никто не вспомнит'));
});
test('static page canonical and social URLs, robots and sitemap use the deployed Ink repository',()=>{
 for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.html'))){
  const html=head(name);assert.ok(!html.includes('https://cnizroman.github.io/Nobody-came/'),name+' must not advertise the old repo');
  for(const tag of html.matchAll(/<(?:meta|link)\s+[^>]*>/gi)){
   if(!/(?:property|name)="(?:og:(?:url|image(?::secure_url)?)|twitter:image)"|rel="canonical"/.test(tag[0]))continue;
   const value=tag[0].match(/(?:content|href)="([^"]*)"/)?.[1];if(!value)continue;
   assert.ok(value.startsWith(base),name+': '+value);
   const relative=new URL(value).pathname.slice('/Ink/'.length)||'index.html';assert.ok(fs.existsSync(path.join(root,relative)),name+' references an existing local page/asset');
  }
 }
 assert.ok(read('robots.txt').includes('Sitemap: '+base+'sitemap.xml'));
 for(const loc of read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g))assert.ok(loc[1].startsWith(base));
 // Book pages keep their book-specific artwork, separate from the platform card.
 assert.equal(metadata(head('book1.html'),'og:image'),base+'assets/og-image.png');assert.ok(fs.existsSync(path.join(root,'assets/og-image.png')));
});
