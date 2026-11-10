const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('old site protected page embeds the existing server-protected Ink gate without old client vault',()=>{
  const html=fs.readFileSync('old-site-protection/book3.html','utf8');
  assert.match(html,/src="https:\/\/cnizroman\.github\.io\/Ink\/book3\.html"/);
  assert.doesNotMatch(html,/book3-vault|book3-gate|book-content|passwordOverlay/);
});

test('old site admin calls existing owner-only RPC and enforces matching 5-character password',()=>{
  const html=fs.readFileSync('old-site-protection/reviews-admin.html','utf8');
  assert.match(html,/sb\.rpc\('set_legacy_book_password',\{p_password:password\}\)/);
  assert.match(html,/\[\.\.\.password\]\.length<5/);
  assert.match(html,/new TextEncoder\(\)\.encode\(password\)\.length>72/);
  assert.match(html,/password!==second\.value/);
  assert.match(html,/data\?\.saved!==true/);
  assert.match(html,/first\.value='';second\.value=''/);
});

test('old site service worker retires its own stale cache and fails closed for old protected files',()=>{
  const js=fs.readFileSync('old-site-protection/sw.js','utf8');
  assert.match(js,/nobody-v12/);assert.match(js,/k\.startsWith\('nobody-'\)/);
  assert.match(js,/cache:'no-store'/);assert.match(js,/book3-\(\?:gate\|vault\)/);
  assert.match(js,/status:503/);
});
