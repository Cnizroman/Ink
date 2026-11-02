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
