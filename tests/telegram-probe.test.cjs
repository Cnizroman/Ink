const test=require('node:test'),assert=require('node:assert/strict');
const {probeRequests,summarize}=require('../scripts/telegram-oidc-probe.cjs');
test('anonymous Telegram HTTP probes compare order/encoding without changing callback, state or PKCE',()=>{
 const probes=probeRequests('123456789','https://project.test/auth/v1/callback');assert.equal(probes.length,14);
 const auth=probes.slice(1,6).map(p=>new URL(p.url));
 for(const url of auth){assert.equal(url.origin,'https://oauth.telegram.org');assert.equal(url.pathname,'/auth');assert.equal(url.searchParams.has('client_secret'),false);assert.equal(url.searchParams.get('client_id'),'123456789');assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('scope'),'openid profile');assert.equal(url.searchParams.get('state'),auth[0].searchParams.get('state'));assert.equal(url.searchParams.get('code_challenge'),auth[0].searchParams.get('code_challenge'));assert.equal(url.searchParams.get('code_challenge_method'),'S256');}
 for(const url of auth.slice(0,4))assert.equal(url.searchParams.get('redirect_uri'),'https://project.test/auth/v1/callback');
 assert.equal(auth[4].searchParams.has('redirect_uri'),false);
 assert.ok(auth[0].href.includes('scope=openid+profile'));assert.ok(auth[1].href.includes('scope=openid%20profile'));
 assert.equal([...auth[0].searchParams.keys()][1],'code_challenge');assert.equal([...auth[2].searchParams.keys()][1],'redirect_uri');
 assert.equal(new URL(probes.find(p=>p.label==='control_openid_only').url).searchParams.get('scope'),'openid');assert.equal(new URL(probes.find(p=>p.label==='control_double_encoded_callback').url).searchParams.get('redirect_uri'),'https%3A%2F%2Fproject.test%2Fauth%2Fv1%2Fcallback');assert.equal(probes.find(p=>p.label==='control_with_site_referrer').referrer,'https://cnizroman.github.io/');
 assert.notEqual(probeRequests()[1].url,probeRequests()[1].url);
 assert.throws(()=>probeRequests('not-a-public-id'),/public numeric/);
 assert.throws(()=>probeRequests('123','http://project.test/auth/v1/callback'),/HTTPS/);
});
test('HTTP probe reports never emit response bodies, cookies, authorization codes or state values',()=>{
 const body='<html>opaque-response-fixture</html>';
 const result=summarize('example',302,{'content-type':'text/html; charset=UTF-8','set-cookie':'fixture-cookie','location':'https://site.test/callback?code=fixture-code&state=fixture-state#fixture-fragment'},body);
 const json=JSON.stringify(result);for(const secret of ['opaque-response-fixture','fixture-cookie','fixture-code','fixture-state','fixture-fragment'])assert.ok(!json.includes(secret));
 assert.equal(result.http_status,302);assert.equal(result.response_kind,'html_document');assert.deepEqual(result.redirect,{origin:'https://site.test',query_keys:['code','state']});
 const error=summarize('example',200,{'content-type':'text/html'},'redirect_uri required');assert.equal(error.error_text,'redirect_uri required');assert.equal(error.response_kind,'telegram_error');
 const discovery=summarize('discovery',200,{'content-type':'application/json'},JSON.stringify({issuer:'https://oauth.telegram.org',authorization_endpoint:'https://oauth.telegram.org/auth',token_endpoint:'https://oauth.telegram.org/token'}));assert.equal(discovery.expected_issuer,true);assert.equal(discovery.expected_authorization_endpoint,true);assert.equal(discovery.expected_token_endpoint,true);
});
