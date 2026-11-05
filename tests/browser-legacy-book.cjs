process.chdir(require('node:path').resolve(__dirname,'..'));
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),lambda=require('@sparticuz/chromium').default,{pack}=require('../scripts/protect-legacy-book.cjs');
(async()=>{
 const fixture=pack('<header><h1>Protected fixture</h1></header><main><h3>Test chapter</h3><p>PRIVATE BROWSER FIXTURE BODY</p><div data-final-voice><button class="final-voice-play">Play</button><audio></audio><span class="final-voice-status"></span><span class="final-voice-current"></span><span class="final-voice-duration"></span><div class="final-voice-wave"><i></i></div></div></main><footer>End</footer>',Buffer.from('private test audio'));
 let assetRequests=0;
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/sw-test'){res.setHeader('Content-Type','text/html');res.end('<html><body>Cache test</body></html>');return;}
  if(pathname===`/assets/protected/book3-${fixture.assetId}.json`){assetRequests++;res.setHeader('Content-Type','application/json');res.end(fixture.payload);return;}
  const file=path.resolve('.','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(403);res.end();return;}
  try {res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const cp=require('@sparticuz/chromium'),libs=await cp.inflate(path.resolve(require.resolve('@sparticuz/chromium'),'../../bin/al2023.tar.br'));cp.setupLambdaEnvironment(libs+'/lib');
 const browser=await chromium.launch({args:lambda.args.filter(a=>a!=='--disable-web-security'&&a!=='--single-process'),executablePath:await lambda.executablePath(),headless:true});
 try {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1000,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=req.url();
   if(url.endsWith('/rest/v1/rpc/unlock_legacy_book')){
    const password=req.postDataJSON().p_password;
    if(password==='network-failure')return route.abort();
    const data=password==='reader-test-password'?{asset_id:fixture.assetId,key:fixture.key}:password==='not-yet-set'?{error:'password_not_set'}:{error:'incorrect_password'};
    return route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
   }
   if(url.startsWith(origin+'/'))return route.continue();return route.abort();
  });
  const load=()=>page.goto(origin+'/book3.html');
  await load();assert.equal(await page.locator('main,.reader-tools,audio,template').count(),0);assert.equal(assetRequests,0);
  await page.locator('#book3Gate').evaluate(el=>el.remove());assert.equal(await page.locator('main,audio').count(),0);assert.equal(assetRequests,0);
  await load();
  for(const [password,expected] of [['wrong','Неверный пароль'],['network-failure','Нет соединения'],['not-yet-set','Доступ не подтверждён']]){
   await page.locator('#book3Password').fill(password);await page.locator('button[type=submit]').click();
   await page.waitForFunction(text=>document.getElementById('book3AccessStatus').textContent.includes(text),expected);
   assert.equal(await page.locator('main,audio').count(),0);assert.equal(await page.locator('#book3Password').inputValue(),'');assert.equal(assetRequests,0);
  }
  await page.locator('#book3Password').fill('reader-test-password');await page.locator('button[type=submit]').click();
  await page.waitForSelector('main');await page.waitForSelector('.reader-tools');
  assert.match(await page.locator('main').innerText(),/PRIVATE BROWSER FIXTURE BODY/);assert.equal(await page.locator('#book3Gate').count(),0);assert.equal(assetRequests,1);
  assert.equal(await page.locator('audio').first().getAttribute('src'),null);
  await page.locator('.final-voice-play').click();await page.waitForFunction(()=>document.querySelector('[data-final-voice] audio').src.startsWith('blob:'));
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage})+JSON.stringify({...sessionStorage}));assert.ok(!stored.includes(fixture.key));assert.ok(!stored.includes('reader-test-password'));assert.ok(!stored.includes('PRIVATE BROWSER FIXTURE BODY'));
  await page.reload();assert.equal(await page.locator('main,audio').count(),0);
  await page.goto(origin+'/book3-final-voice.html');await page.waitForURL('**/book3.html');assert.equal(await page.locator('main').count(),0);
  // Password controls are wired to the legacy-specific server method, not the ordinary story RPC.
  await page.goto(origin+'/#/');await page.waitForFunction(()=>window.Store?.state);
  await page.evaluate(async()=>{await Store.login({login:'cnizroman',password:'demo1234'});window.savedLegacyPassword=null;Store.setLegacyBookPassword=async(id,password)=>{window.savedLegacyPassword={id,password};};});
  await page.goto(origin+'/#/studio/work/gde-nas-net');await page.waitForSelector('[data-legacy-book]',{state:'attached'});
  await page.locator('.story-access summary').click();await page.locator('[name=storyPassword]').fill('vivid');await page.locator('[name=confirmStoryPassword]').fill('vivid');await page.locator('#storyPasswordForm button').click();
  await page.waitForFunction(()=>window.savedLegacyPassword);assert.deepEqual(await page.evaluate(()=>window.savedLegacyPassword),{id:'gde-nas-net',password:'vivid'});
  assert.deepEqual(errors,[]);
  // Real service worker: purge a pre-existing plaintext v22 cache and fail closed offline.
  const cacheContext=await browser.newContext(),cachePage=await cacheContext.newPage();
  await cacheContext.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  await cachePage.goto(origin+'/sw-test');
  await cachePage.evaluate(async()=>{const c=await caches.open('chernila-v22');await c.put('book3.html',new Response('OLD PRIVATE PLAINTEXT'));await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;});
  await cachePage.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await cachePage.evaluate(async()=>(await caches.keys()).includes('chernila-v22')),false);
  await cacheContext.setOffline(true);
  const offline=await cachePage.evaluate(async()=>{const r=await fetch('book3.html');return {status:r.status,text:await r.text()};});
  assert.equal(offline.status,503);assert.ok(!offline.text.includes('OLD PRIVATE PLAINTEXT'));await cacheContext.close();
  console.log('PASS: DOM-removal bypass blocked, no plaintext before unlock, wrong/unset password, network failure, AES text/audio, reload, alias, owner password UI and stale-cache offline protection');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
