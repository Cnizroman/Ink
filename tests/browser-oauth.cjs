// Model GoTrue's real 302-vs-JSON contract over local HTTP/TLS, without network interception.
process.chdir(require('node:path').resolve(__dirname,'..'));
const {chromium:pw}=require('playwright-core'),cp=require('@sparticuz/chromium'),assert=require('node:assert/strict');
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
(async()=>{
 fs.mkdirSync('.cache',{recursive:true});const cert=path.resolve('.cache/oauth-test-cert.pem'),key=path.resolve('.cache/oauth-test-key.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const owner='11111111-1111-4111-8111-111111111111',profile={id:owner,username:'cnizroman',display_name:'Cnizroman',role:'admin',is_founder:true,customization:{}};
 let site,apiOrigin,providerOrigin,linked=false,malformed=false;const authorizations=[],preflights=[];
 const provider=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(req,res)=>{
  const url=new URL(req.url,providerOrigin),callback=url.searchParams.get('redirect_to');
  if(url.pathname==='/approve'||url.pathname==='/deny'){
   const target=new URL(callback);if(url.pathname==='/approve'){linked=true;target.hash='access_token=oauth-session&refresh_token=oauth-refresh&expires_at='+Math.floor(Date.now()/1000+3600);}else target.hash='error=access_denied&error_description=Cancelled';
   res.writeHead(302,{Location:target.href});res.end();return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});const q=encodeURIComponent(callback);
  res.end('<h1 id="fakeProvider">Test OAuth provider</h1><a id="approve" href="/approve?redirect_to='+q+'">Allow</a> <a id="deny" href="/deny?redirect_to='+q+'">Cancel</a>');
 });
 const api=http.createServer((req,res)=>{
  const url=new URL(req.url,apiOrigin),cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, prefer','Access-Control-Allow-Methods':'GET,OPTIONS'};
  const json=(data,status=200)=>{res.writeHead(status,{...cors,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='OPTIONS'){preflights.push(url.pathname);res.writeHead(204,cors);res.end();return;}
  if(url.pathname==='/auth/v1/settings')return json({external:{github:true}});
  if(url.pathname==='/auth/v1/user')return json({id:owner,email_confirmed_at:'2026-01-01T00:00:00Z',identities:[{identity_id:'email-id',provider:'email'},...(linked?[{identity_id:'github-id',provider:'github',identity_data:{user_name:'real_owner'}}]:[])]});
  if(url.pathname==='/auth/v1/user/identities/authorize'){
   authorizations.push({params:url.searchParams,headers:req.headers});const target=new URL(providerOrigin+'/authorize');target.searchParams.set('redirect_to',url.searchParams.get('redirect_to'));
   if(malformed)return json({message:'Missing OAuth URL'});
   if(url.searchParams.get('skip_http_redirect')!=='true'){res.writeHead(302,{...cors,Location:target.href});res.end();return;}
   return json({url:target.href});
  }
  return json(url.pathname==='/rest/v1/profiles'?[profile]:[]);
 });
 const web=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/supabase-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.CHERNILA_SUPABASE_CONFIG='+JSON.stringify({url:apiOrigin,publishableKey:'sb_publishable_fixture'})+';');return;}
  const filename=path.resolve(process.cwd(),'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!filename.startsWith(process.cwd()+path.sep)){res.writeHead(403);res.end();return;}
  try{let data=fs.readFileSync(filename);if(filename.endsWith('index.html'))data=Buffer.from(data.toString().replace(/<link[^>]*https:\/\/fonts\.[^>]*>/g,''));res.writeHead(200,{'Content-Type':filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);}catch(_){res.writeHead(404);res.end();}
 });
 let browser;
 try{
  const listen=server=>new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));await listen(provider);providerOrigin='https://127.0.0.1:'+provider.address().port;await listen(api);apiOrigin='http://127.0.0.1:'+api.address().port;await listen(web);site='http://127.0.0.1:'+web.address().port;
  const libs=await cp.inflate(path.resolve(require.resolve('@sparticuz/chromium'),'../../bin/al2023.tar.br'));cp.setupLambdaEnvironment(libs+'/lib');
  browser=await pw.launch({executablePath:await cp.default.executablePath(),args:cp.default.args.filter(a=>a!=='--disable-web-security'),headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'});
  await context.addInitScript(({owner})=>{if(!localStorage.getItem('chernila_session_v2'))localStorage.setItem('chernila_session_v2',JSON.stringify({authorId:owner,token:'original-session'}));},{owner});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(site+'/#/profile');await page.waitForFunction(()=>document.querySelector('[data-connect-social=github]')&&!document.querySelector('[data-connect-social=github]').disabled);
  const start=async()=>{await page.locator('[data-connect-social=github]').click();await page.waitForURL(providerOrigin+'/**',{timeout:6000}).catch(async()=>{throw new Error('OAuth navigation failed: '+await page.locator('#socialStatus').textContent());});await page.waitForSelector('#fakeProvider');};
  await start();assert.equal(authorizations[0].params.get('skip_http_redirect'),'true');assert.equal(authorizations[0].headers.prefer,undefined);assert.equal(authorizations[0].headers.authorization,'Bearer original-session');assert.ok(preflights.includes('/auth/v1/user/identities/authorize'));
  await page.locator('#deny').click();await page.waitForSelector('[data-connect-social=github]');assert.equal(await page.evaluate(()=>Store.session.token),'original-session');assert.equal(await page.evaluate(()=>sessionStorage.getItem('chernila_social_pending')),null);assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'#/profile');
  malformed=true;await page.waitForFunction(()=>!document.querySelector('[data-connect-social=github]').disabled);await page.locator('[data-connect-social=github]').click();await page.waitForFunction(()=>document.querySelector('#socialStatus').innerText.includes('не вернул ссылку'));assert.equal(await page.evaluate(()=>sessionStorage.getItem('chernila_social_pending')),null);
  malformed=false;await start();await page.locator('#approve').click();await page.waitForSelector('[data-network=github] .connected-label');assert.equal(await page.evaluate(()=>Store.currentUser().id),owner);assert.equal(await page.evaluate(()=>Store.session.token),'oauth-session');assert.equal(new URL(page.url()).search,'');assert.equal(new URL(page.url()).hash,'#/profile');assert.deepEqual(errors,[]);
  console.log('PASS OAuth HTTP/TLS: JSON authorization instead of fetch 302, browser navigation, cancellation, malformed response, confirmed same-account callback and token scrubbing; no request interception');
 }finally{if(browser)await browser.close();await Promise.all([provider,api,web].map(server=>new Promise(resolve=>server.close(resolve))));}
})().catch(e=>{console.error(e);process.exit(1)});
