const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Google ownership verification is present once in the static HTML head',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head,'The verification must be available without JavaScript.');
  const tags=html.match(/<meta\b[^>]*name="google-site-verification"[^>]*>/gi)||[];
  assert.equal(tags.length,1);
  assert.ok(head.includes(tags[0]));
  assert.match(tags[0],/content="1noZFLQylrl-iUBmw-c7EK5XvvJ_8Dc96wBANOY7xBA"/);
  assert.ok(!html.includes('&lt;meta name="google-site-verification"'));
  assert.match(head,/<link rel="canonical" href="https:\/\/cnizroman\.github\.io\/Ink\/">/);
});

test('Yandex ownership verification is present once in the static head alongside Google',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head,'The verification must be available without JavaScript.');
  const tags=html.match(/<meta\b[^>]*name="yandex-verification"[^>]*>/gi)||[];
  assert.equal(tags.length,1);
  assert.ok(head.includes(tags[0]));
  assert.match(tags[0],/content="f3798107dbb5423d"/);
  assert.ok(!html.includes('&lt;meta name="yandex-verification"'));
  assert.match(head,/<meta name="google-site-verification"/);
});

test('Yandex verification HTML file contains the exact token and no injected scripts or redirects',()=>{
  const html=fs.readFileSync('yandex_f3798107dbb5423d.html','utf8');
  assert.match(html,/<body>Verification: f3798107dbb5423d<\/body>/);
  assert.match(html,/<meta http-equiv="Content-Type" content="text\/html; charset=UTF-8">/);
  assert.doesNotMatch(html,/<script\b|kaspersky|http-equiv=["']refresh|&lt;html|^---/im);
  assert.equal((html.match(/Verification:/g)||[]).length,1);
});

test('host-root verification bundle is standalone and points to Ink without private content',()=>{
  const home=fs.readFileSync('site-root/index.html','utf8');
  const robots=fs.readFileSync('site-root/robots.txt','utf8');
  assert.match(home,/<meta name="yandex-verification" content="f3798107dbb5423d">/);
  assert.match(home,/<meta name="google-site-verification" content="1noZFLQylrl-iUBmw-c7EK5XvvJ_8Dc96wBANOY7xBA">/);
  assert.match(home,/<link rel="canonical" href="https:\/\/cnizroman.github.io\/Ink\/">/);
  assert.match(home,/<meta name="robots" content="noindex,follow">/);
  assert.match(home,/<a href="https:\/\/cnizroman.github.io\/Ink\/">/);
  assert.doesNotMatch(home,/<script\b|book3|content_key|publishableKey|supabase|http-equiv=["']refresh/i);
  assert.equal(fs.readFileSync('site-root/yandex_f3798107dbb5423d.html','utf8'),fs.readFileSync('yandex_f3798107dbb5423d.html','utf8'));
  assert.ok(fs.existsSync('site-root/.nojekyll'));
  assert.match(robots,/^User-agent: \*\nAllow: \/\n/m);
  assert.match(robots,/^Sitemap: https:\/\/cnizroman.github.io\/Ink\/sitemap.xml$/m);
});

test('sitemap advertises only existing public pages, not the protected story or ciphertext',()=>{
  const sitemap=fs.readFileSync('sitemap.xml','utf8');
  assert.match(sitemap,/<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.ok(urls.length>0);assert.equal(new Set(urls).size,urls.length);
  assert.doesNotMatch(sitemap,/book3|assets\/protected|legacy-book|studio|password/i);
  for(const value of urls){const url=new URL(value);assert.equal(url.origin,'https://cnizroman.github.io');assert.ok(url.pathname.startsWith('/Ink/'));assert.ok(fs.existsSync(url.pathname==='/Ink/'?'index.html':url.pathname.slice('/Ink/'.length)));}
  assert.match(fs.readFileSync('book3.html','utf8'),/name="robots" content="noindex,noarchive,nosnippet"/);
});

test('plain-text sitemap is UTF-8 without BOM and mirrors only public XML URLs',()=>{
  const xml=fs.readFileSync('sitemap.xml','utf8');
  const bytes=fs.readFileSync('sitemap.txt');
  assert.notDeepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf]);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const urls=text.trim().split(/\r?\n/);
  assert.deepEqual(urls,[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]));
  assert.ok(text.endsWith('\n'));assert.doesNotMatch(text,/book3|protected|<|>/);
});

test('HTTP diagnostic is bounded, anonymous, branch-scoped and does not inspect the protected book',()=>{
  const workflow=fs.readFileSync('.github/workflows/sitemap-http-diagnostic.yml','utf8');
  const script=fs.readFileSync('scripts/sitemap-http-probe.py','utf8');
  assert.match(workflow,/branches: \[arena\/380f637e-ink\]/);
  assert.match(workflow,/contents: read/);assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/timeout-minutes: 4/);assert.doesNotMatch(workflow,/secrets\.|pull_request_target/);
  assert.match(script,/timeout=20/);assert.match(script,/2_000_001/);
  assert.match(script,/NOT a request from Google infrastructure/);
  assert.doesNotMatch(script,/Authorization|Cookie|password|supabase|BOOK3_VAULT/);
});
