// Real HTTP cross-origin checks: never launch this test with --disable-web-security.
process.chdir(require('node:path').resolve(__dirname,'..'));
const {chromium:pw}=require('playwright-core'),cp=require('@sparticuz/chromium'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {handler}=require('./helpers/username-login.cjs');
(async()=>{
 const edge=handler({dynamicCredentials:true});let postCount=0,preflightCount=0,lastLoginHeaders=null,serverFailure=false,signupFault='email_address_not_authorized',signupPosts=0;
 const profile={id:'owner',username:'cnizroman',display_name:'Cnizroman',role:'admin',is_founder:true,customization:{}};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1'),isEdge=url.pathname==='/functions/v1/username-login';
   if(req.method==='OPTIONS'&&isEdge)preflightCount++;
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   let response;
   if(isEdge){
    if(req.method==='POST'){postCount++;lastLoginHeaders=req.headers;}
    response=await edge.serve(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
    if(serverFailure&&req.method==='POST')response=new Response(JSON.stringify({code:'WORKER_ERROR',message:'Internal error'}),{status:500,headers:response.headers});
   }else{
    const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, prefer','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
    response=url.pathname==='/auth/v1/signup'&&req.method==='POST'?(signupPosts++,new Response(JSON.stringify(signupFault?{error_code:signupFault,msg:'Email address not authorized'}:{id:'new-writer',identities:[]}),{status:signupFault?400:200,headers:{...cors,'Content-Type':'application/json'}})):req.method==='OPTIONS'?new Response(null,{status:204,headers:cors}):new Response(JSON.stringify(url.pathname==='/rest/v1/profiles'?[profile]:[]),{headers:{...cors,'Content-Type':'application/json'}});
   }
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(_){res.writeHead(500);res.end();}
 });
 const web=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/supabase-config.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.CHERNILA_SUPABASE_CONFIG='+JSON.stringify({url:'http://127.0.0.1:'+server.address().port,publishableKey:'sb_publishable_fixture'})+';');return;}
  const filename=path.resolve(process.cwd(),'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!filename.startsWith(process.cwd()+path.sep)){res.writeHead(403);res.end();return;}
  try{let data=fs.readFileSync(filename);if(filename.endsWith('index.html'))data=Buffer.from(data.toString().replace(/<link[^>]*https:\/\/fonts\.[^>]*>/g,''));res.writeHead(200,{'Content-Type':filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.html')?'text/html':'application/octet-stream'});res.end(data);}catch(_){res.writeHead(404);res.end();}
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));const api='http://127.0.0.1:'+server.address().port;await new Promise(resolve=>web.listen(0,'0.0.0.0',resolve));const site='http://127.0.0.1:'+web.address().port;
  const libs=await cp.inflate(require('node:path').resolve(require.resolve('@sparticuz/chromium'),'../../bin/al2023.tar.br'));cp.setupLambdaEnvironment(libs+'/lib');
  browser=await pw.launch({executablePath:await cp.default.executablePath(),args:cp.default.args.filter(a=>a!=='--disable-web-security'),headless:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site+'/#/auth');await page.waitForSelector('#authForm');assert.equal(await page.evaluate(()=>Store.mode),'supabase');
  // Older published clients included Prefer in every request. The Edge preflight must support them.
  const legacy=await page.evaluate(async api=>{try{const r=await fetch(api+'/functions/v1/username-login',{method:'POST',headers:{apikey:'sb_publishable_fixture',Authorization:'Bearer sb_publishable_fixture','Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({username:'cnizroman',password:'correct-password'})});return {status:r.status};}catch(_){return {blocked:true};}},api);
  assert.equal(legacy.status,200,'Browser blocked legacy login at CORS preflight; expected successful POST');assert.equal(postCount,1);assert.ok(preflightCount>=1);
  await page.locator('[name=login]').fill('cnizroman');await page.locator('[name=password]').fill('correct-password');await page.locator('#authForm button').click();await page.waitForURL('**/#/studio');
  assert.equal(lastLoginHeaders.prefer,undefined,'PostgREST-only Prefer must not be sent to Edge');assert.equal(await page.evaluate(()=>Store.currentUser().role),'admin');
  await page.goto(site+'/#/admin');await page.waitForSelector('#badgeForm');
  await page.evaluate(()=>Store.logout());await page.goto(site+'/#/auth');await page.waitForSelector('#authForm');
  await page.locator('[name=login]').fill('cnizroman');await page.locator('[name=password]').fill('wrong-password');await page.locator('#authForm button').click();await page.getByText('Неверный логин или пароль.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>Store.currentUser()),null);
  serverFailure=true;await page.locator('[name=password]').fill('correct-password');await page.locator('#authForm button').click();await page.getByText(/HTTP 500/).waitFor();assert.equal(await page.evaluate(()=>Store.currentUser()),null);
  await page.goto(site+'/#/auth?mode=signup');await page.waitForSelector('#authForm [name=username]');await page.locator('[name=username]').fill('new_writer');await page.locator('[name=displayName]').fill('Writer');await page.locator('[name=email]').fill('writer@example.com');await page.locator('[name=password]').fill('secret-password');await page.locator('#authForm button').click();await page.getByText(/нужен собственный SMTP/).waitFor();assert.equal(await page.locator('#authFeedback').getAttribute('data-kind'),'error');assert.equal(await page.evaluate(()=>Store.currentUser()),null);
  signupFault=null;await page.locator('#authForm button').click();await page.locator('#authFeedback[data-kind=success]').waitFor();assert.match(await page.locator('#authFeedback').innerText(),/Подтвердите email/);assert.equal(await page.evaluate(()=>Store.currentUser()),null);assert.equal(await page.locator('[name=password]').inputValue(),'');assert.ok(page.url().endsWith('/#/auth?mode=signup'));assert.equal(signupPosts,2);assert.equal(await page.locator('#authForm button').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS real-CORS browser: legacy preflight, username login -> admin, no Prefer on Edge, credential vs infrastructure errors, signup SMTP errors and pending email confirmation; browser security enabled');
 }finally{if(browser)await browser.close();await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>web.close(resolve))]);}
})().catch(e=>{console.error(e);process.exit(1)});
