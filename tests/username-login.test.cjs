const test=require('node:test'),assert=require('node:assert/strict');
const {handler}=require('./helpers/username-login.cjs');
const credentials={username:'cnizroman',password:'correct-password'};
test('Edge login handles preflight and rejects invalid/oversized bodies before privileged work',async()=>{
 const h=handler(),preflight=await h.call(null,'OPTIONS');assert.equal(preflight.status,200);for(const name of ['authorization','apikey','content-type','prefer'])assert.ok(preflight.headers.get('access-control-allow-headers').toLowerCase().split(/,\s*/).includes(name),'missing CORS header: '+name);assert.equal((await h.call(null,'GET')).status,405);
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
