const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('Google ownership verification is present once in the static HTML head',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const head=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head,'The verification must be available without JavaScript.');
  const tags=html.match(/<meta\b[^>]*name="google-site-verification"[^>]*>/gi)||[];
  assert.equal(tags.length,1);
  assert.ok(head.includes(tags[0]));
  assert.match(tags[0],/content="1noZFLQylrl-iUBmw-c7EK5XvvJ_8Dc96wBANOY7xBA"/);
  assert.ok(!html.includes('&lt;meta name="google-site-verification"'));
  assert.match(head,/<link rel="canonical" href="https:\/\/cnizroman\.github\.io\/Ink\/">/);
});
