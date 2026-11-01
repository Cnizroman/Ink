const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../supabase/functions/username-login/index.ts'),'utf8').replace(/^import .*;$/m,'');
function handler(options={}){
 let serve,lookups=0;const attempts=[];
 const service={rpc:async(name,args)=>{attempts.push({name,args});return options.rpcError?{error:{message:'private failure'}}:{data:options.allowed!==false,error:null};},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{lookups++;return {data:options.unknown?null:{id:'owner'},error:null};}})})}),auth:{admin:{getUserById:async()=>({data:{user:{email:'private@example.test'}}})}}};
 const auth={auth:{signInWithPassword:async()=>options.badPassword?{data:{},error:{message:'private auth failure'}}:{data:{session:{access_token:'session-token',refresh_token:'refresh-token',expires_in:3600},user:{id:options.wrongIdentity?'other':'owner',email:'private@example.test',private_extra:'never-return'}},error:null}}};
 const ctx=vm.createContext({Response,TextEncoder,TextDecoder,Uint8Array,crypto:require('node:crypto').webcrypto,Deno:{env:{get:name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'service':name==='SUPABASE_ANON_KEY'?'anon':'https://project.example.test'},serve:fn=>serve=fn},createClient:(_,key)=>key==='service'?service:auth});vm.runInContext(source,ctx);
 return {call:(body,method='POST')=>serve(new Request('https://project.example.test/functions/v1/username-login',{method,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body),headers:{'x-forwarded-for':'203.0.113.10'}}:{})})),attempts,get lookups(){return lookups;}};
}
const credentials={username:'cnizroman',password:'correct-password'};
test('Edge login handles preflight and rejects invalid/oversized bodies before privileged work',async()=>{
 const h=handler();assert.equal((await h.call(null,'OPTIONS')).status,200);assert.equal((await h.call(null,'GET')).status,405);
 for(const input of ['{','x'.repeat(4000),{username:'../admin',password:'correct-password'}])assert.equal((await h.call(input)).status,401);
 assert.equal(h.lookups,0);assert.equal(h.attempts.length,0);
});
test('Edge login rate limits before lookup and fails closed on limiter errors',async()=>{
 const h=handler({allowed:false}),r=await h.call(credentials);assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));assert.equal(h.lookups,0);
 assert.equal((await handler({rpcError:true}).call(credentials)).status,503);
});
test('unknown username and wrong password have indistinguishable public errors',async()=>{
 const a=await handler({unknown:true}).call(credentials),b=await handler({badPassword:true}).call(credentials);assert.equal(a.status,401);assert.equal(b.status,401);assert.equal(await a.text(),await b.text());
});
test('Edge returns only matching account session and never service keys or extra user metadata',async()=>{
 const h=handler(),r=await h.call(credentials);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const data=await r.json();assert.equal(data.user.id,'owner');assert.equal(data.user.private_extra,undefined);assert.equal(data.access_token,'session-token');
 assert.equal(h.attempts.length,2);for(const {args} of h.attempts)assert.match(args.p_key,/^[a-f0-9]{64}$/);assert.equal(h.attempts[0].args.p_limit,30);assert.equal(h.attempts[1].args.p_limit,10);
});
test('Edge never returns a session belonging to a different UID',async()=>{assert.equal((await handler({wrongIdentity:true}).call(credentials)).status,401);});
