process.chdir(require('node:path').resolve(__dirname,'..'));
const {chromium:pw}=require('playwright-core'),cp=require('@sparticuz/chromium'),assert=require('node:assert/strict');
(async()=>{
 const libs=await cp.inflate(require('node:path').resolve(require.resolve('@sparticuz/chromium'),'../../bin/al2023.tar.br'));cp.setupLambdaEnvironment(libs+'/lib');
 const browser=await pw.launch({executablePath:await cp.default.executablePath(),args:cp.default.args.filter(a=>a!=='--disable-web-security'),headless:true}),context=await browser.newContext({serviceWorkers:'block',viewport:{width:1200,height:900}});
 const owner='11111111-1111-4111-8111-111111111111';let profile={id:owner,username:'cnizroman',display_name:'Cnizroman',role:'admin',is_founder:true,customization:{}};
 const files=new Map();let failProfile=false,failUpload=false,linked=false,redirect='',identityReads=0,providerEnabled=false;
 await context.addInitScript(({owner})=>localStorage.setItem('chernila_session_v2',JSON.stringify({authorId:owner,token:'original-session'})),{owner});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method();
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, prefer, x-upsert','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
  const json=(value,status=200)=>route.fulfill({status,headers:cors,contentType:'application/json',body:JSON.stringify(value)});
  if(u.hostname==='127.0.0.1')return route.continue();
  if(u.hostname==='github.com')return route.fulfill({contentType:'text/html',body:'<h1>OAuth provider fixture — no real network request</h1>'});
  if(!u.hostname.endsWith('.supabase.co'))return route.abort();if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(u.pathname==='/auth/v1/settings')return json({external:{github:providerEnabled}});
  if(u.pathname==='/auth/v1/user/identities/authorize'){redirect=u.searchParams.get('redirect_to');return json({url:'https://github.com/login/oauth/authorize?client_id=test-fixture'});}
  if(u.pathname==='/auth/v1/user'){identityReads++;return json({id:owner,email_confirmed_at:'2026-01-01T00:00:00Z',identities:[{identity_id:'email-id',provider:'email'},...(linked?[{identity_id:'github-id',provider:'github',identity_data:{user_name:'actual_owner'}}]:[])]});}
  if(u.pathname==='/auth/v1/user/identities/github-id'&&method==='DELETE'){linked=false;return json({});}
  if(u.pathname==='/rest/v1/profiles'){if(method==='PATCH'){if(failProfile)return json({message:'profile write denied'},403);profile={...profile,...req.postDataJSON()};}return json([profile]);}
  if(u.pathname.startsWith('/rest/v1/'))return json([]);
  if(u.pathname.startsWith('/storage/v1/object/public/profile-media/')){const key=u.pathname.split('/profile-media/')[1],file=files.get(key);return file?route.fulfill({contentType:file.type,body:file.buffer}):route.fulfill({status:404});}
  if(u.pathname.startsWith('/storage/v1/object/profile-media/')&&method==='POST'){
   if(failUpload)return json({message:'storage unavailable'},400);
   const key=u.pathname.split('/profile-media/')[1];files.set(key,{type:req.headers()['content-type'],buffer:req.postDataBuffer()});return json({Key:'profile-media/'+key});
  }
  if(u.pathname==='/storage/v1/object/profile-media'&&method==='DELETE'){for(const key of req.postDataJSON().prefixes)files.delete(key);return json([]);}
  return json({message:'unmocked route'},404);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8000/#/profile');await page.waitForSelector('#profileForm');
 assert.equal(await page.evaluate(()=>Store.mode),'supabase');assert.equal(await page.locator('[name=avatarUrl]').count(),0);
 const photo=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#336699';x.fillRect(0,0,600,400);return c.toDataURL().split(',')[1];}),'base64');
 const choose=async slot=>{await page.locator('#'+slot+'Picker input[type=file]').setInputFiles({name:'device.png',mimeType:'image/png',buffer:photo});await page.waitForSelector('#'+slot+'Picker canvas:not([hidden])');};
 await choose('avatarUrl');await choose('bannerUrl');await page.locator('#profileForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileFeedback').innerText==='Профиль сохранён.');
 assert.equal(files.size,2);assert.ok(profile.customization.avatarUrl.startsWith('https://'));assert.ok(!JSON.stringify(profile.customization).includes('data:'));
 const oldAvatar=profile.customization.avatarUrl;await page.waitForFunction(()=>document.querySelector('[data-network=github]').innerText.includes('Не настроено'));assert.equal(await page.locator('[data-connect-social=github]').isDisabled(),true);assert.equal(await page.locator('[data-connect-social=discord]').isDisabled(),true);providerEnabled=true;await page.locator('#reloadConnections').click();await page.waitForFunction(()=>!document.querySelector('[data-connect-social=github]').disabled);
 await choose('avatarUrl');failProfile=true;await page.locator('#profileForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileFeedback').innerText.startsWith('Не сохранено:'));
 assert.equal(profile.customization.avatarUrl,oldAvatar);assert.equal(files.size,2);
 failProfile=false;const cleanup=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/storage/'));await page.locator('#profileForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileFeedback').innerText==='Профиль сохранён.');
 await cleanup;
 assert.notEqual(profile.customization.avatarUrl,oldAvatar);assert.equal(files.size,2);
 const previous=profile.customization.avatarUrl;await choose('avatarUrl');failUpload=true;await page.locator('#profileForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileFeedback').innerText.startsWith('Не сохранено:'));assert.equal(profile.customization.avatarUrl,previous);assert.equal(files.size,2);failUpload=false;
 // Discard a failed replacement before exercising real identity linking.
 await page.reload();await page.waitForSelector('#profileForm');await page.waitForFunction(()=>!document.querySelector('[data-connect-social=github]').disabled);
 assert.equal(await page.locator('.connected-label').count(),0);await page.locator('[data-connect-social=github]').click();await page.waitForURL('https://github.com/login/oauth/authorize?client_id=test-fixture');assert.ok(redirect.includes('ink_social='));
 linked=true;await page.goto(redirect+'#access_token=oauth-session&refresh_token=oauth-refresh');await page.waitForSelector('.connected-label');
 assert.ok(!page.url().includes('access_token'));assert.equal(await page.evaluate(()=>Store.currentUser().id),owner);assert.equal(await page.evaluate(()=>Store.session.token),'oauth-session');assert.match(await page.locator('#socialConnections').innerText(),/actual_owner/);await page.locator('[data-publish-social=github]').click();await page.locator('#profileForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#profileFeedback').innerText==='Профиль сохранён.');assert.equal(profile.customization.socialLinks[0].url,'https://github.com/actual_owner');
 await page.locator('[data-unlink-social="github-id"]').click();await page.waitForFunction(()=>!document.querySelector('.connected-label'));assert.equal(linked,false);assert.ok(identityReads>2);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS mocked-cloud browser: device crop -> binary Storage -> profile URLs; failed writes clean new files and retain old images; real identity-link redirect/callback, nonce/account validation, token removal, server-backed connected status and unlink');
})().catch(e=>{console.error(e);process.exit(1)});
