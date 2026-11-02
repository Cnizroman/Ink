const {test}=require('node:test'),assert=require('node:assert/strict');
const {networks,socialLink,cleanSocialLinks,validateImage,cropRect}=require('../profile-tools.js');
test('social chooser builds network links and distinguishes real OAuth from public links',()=>{
  assert.deepEqual(socialLink('telegram','@roman'),{network:'telegram',url:'https://t.me/roman'});
  assert.equal(socialLink('youtube','@channel').url,'https://www.youtube.com/@channel');
  assert.ok(networks.find(n=>n.id==='github').provider);assert.equal(networks.find(n=>n.id==='vk').provider,null);
  for(const input of ['javascript:alert(1)','https://evil.test/me','https://github.com.evil.test/me','https://user:pass@github.com/me'])assert.throws(()=>socialLink('github',input));
  assert.throws(()=>cleanSocialLinks([{network:'github',url:'https://github.com/a'},{network:'github',url:'https://github.com/b'}]));
});
test('image constraints reject unsafe types, oversized files and invalid crop geometry',()=>{
  for(const file of [{type:'image/svg+xml',size:100},{type:'text/html',size:100},{type:'image/png',size:0},{type:'image/png',size:13*1024*1024}])assert.throws(()=>validateImage(file));
  validateImage({type:'image/webp',size:1024});
  const c=cropRect(1600,900,512,512);assert.equal(c.sw,c.sh);assert.ok(c.sx>=0&&c.sy>=0&&c.sx+c.sw<=1600&&c.sy+c.sh<=900);
  for(const x of [0,50,100])for(const y of [0,50,100])for(const z of [1,2,3]){const r=cropRect(400,800,1600,500,x,y,z);assert.ok(r.sx>=0&&r.sy>=0&&r.sx+r.sw<=400.0001&&r.sy+r.sh<=800.0001);}
  assert.throws(()=>cropRect(0,200,512,512));
});

test('verified identity links are derived safely and X aliases match actual providers',()=>{
 const {identityLink,providers}=require('../profile-tools.js'),find=id=>networks.find(n=>n.id===id);
 assert.deepEqual(providers(find('twitter')),['twitter','x']);assert.deepEqual(providers(find('telegram')),['custom:telegram']);
 assert.equal(identityLink(find('github'),{identity_data:{user_name:'real_owner'}}).url,'https://github.com/real_owner');
 assert.equal(identityLink(find('github'),{identity_data:{user_name:'javascript:alert(1)'}}),null);
 assert.equal(identityLink(find('discord'),{identity_data:{sub:'123456789012345678'}}).url,'https://discord.com/users/123456789012345678');
 assert.equal(identityLink(find('discord'),{identity_data:{user_name:'not-a-discord-id'}}),null);
 assert.equal(identityLink(find('telegram'),{identity_data:{preferred_username:'real_owner'}}).url,'https://t.me/real_owner');
 assert.equal(identityLink(find('telegram'),{identity_data:{sub:'12345678',name:'Display name'}}),null);
 assert.equal(identityLink(find('telegram'),{identity_data:{preferred_username:'https://evil.test'}}),null);
 assert.equal(identityLink(find('telegram'),{identity_data:{preferred_username:'someone?start=evil'}}),null);
 assert.equal(identityLink(find('linkedin'),{identity_data:{public_profile_url:'https://evil.test/'}}),null);
});

test('all social brands use safe local SVGs with a non-interpolated fallback',()=>{
 const {socialIcon}=require('../profile-tools.js');
 for(const n of networks){const icon=socialIcon(n.id);assert.ok(icon.includes(`data-social-icon="${n.id}"`));assert.match(icon,/viewBox="0 0 24 24"/);assert.match(icon,/aria-hidden="true"/);assert.match(icon,/<path d="[Mm]/);assert.ok(!/https?:|<script|<image|onload|foreignObject/.test(icon));}
 for(const value of ['<script>alert(1)</script>','constructor','__proto__',undefined])assert.ok(socialIcon(value).includes('data-social-icon="website"'));
});
test('Telegram authorization normalizes HTML separators, removes Auth-only controls, and preserves callback/state/PKCE',()=>{
 const {socialAuthTarget}=require('../profile-tools.js'),callback='https://project.test/auth/v1/callback';
 const original=new URL('https://oauth.telegram.org/auth');original.search=new URLSearchParams({client_id:'fixture',redirect_uri:callback,response_type:'code',scope:'openid profile',state:'fixture-state',code_challenge:'fixture-challenge',code_challenge_method:'S256',nonce:'fixture-nonce',redirect_to:'https://site.test/Ink/?ink_social=fixture',skip_http_redirect:'true'}).toString();
 for(const raw of [original.href,original.href.replace(/&/g,'&amp;'),original.href.replace(/&/g,'&amp;amp;')]){
  const result=socialAuthTarget(raw,'telegram',callback);for(const name of ['client_id','redirect_uri','response_type','scope','state','code_challenge','code_challenge_method','nonce'])assert.equal(result.searchParams.get(name),original.searchParams.get(name));assert.equal(result.searchParams.has('redirect_to'),false);assert.equal(result.searchParams.has('skip_http_redirect'),false);assert.ok(![...result.searchParams.keys()].some(k=>k.startsWith('amp;')));
 }
 // Percent-encoded data is not HTML-decoded; arbitrary parameter values stay intact.
 const encoded=new URL(original);encoded.searchParams.set('state','opaque%26&amp;payload=value');assert.equal(socialAuthTarget(encoded.href,'telegram',callback).searchParams.get('state'),'opaque%26&amp;payload=value');
 for(const name of ['client_id','redirect_uri','response_type','scope','state']){const broken=new URL(original);broken.searchParams.delete(name);assert.throws(()=>socialAuthTarget(broken.href,'telegram',callback),new RegExp(name));broken.searchParams.set(name,'');assert.throws(()=>socialAuthTarget(broken.href,'telegram',callback),new RegExp(name));}
 for(const name of ['client_id','redirect_uri','response_type','scope','state']){const duplicate=new URL(original);duplicate.searchParams.append(name,original.searchParams.get(name));assert.throws(()=>socialAuthTarget(duplicate.href,'telegram',callback),new RegExp(name));}for(const [name,value] of [['response_type','token'],['scope','profile']]){const broken=new URL(original);broken.searchParams.set(name,value);assert.throws(()=>socialAuthTarget(broken.href,'telegram',callback),/code и openid/);}assert.throws(()=>socialAuthTarget(original.href,'telegram','https://other.test/callback'),/callback/);
 const native=new URL('https://github.com/login/oauth/authorize?state=fixture&redirect_to=https%3A%2F%2Fsite.test&skip_http_redirect=true');assert.equal(socialAuthTarget(native.href,'github',callback).href,native.href);
 for(const raw of ['javascript:alert(1)','https://user:password@oauth.telegram.org/auth','http://oauth.telegram.org/auth'])assert.throws(()=>socialAuthTarget(raw,'telegram',callback),/небезопасную/);
});
