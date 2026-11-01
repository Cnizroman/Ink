const {test}=require('node:test'),assert=require('node:assert/strict');
const {fileName,matches,replaceAll,parseDraft,outline}=require('../workshop-tools.js');
const {render}=require('../text-format.js');
test('search handles Cyrillic whole words, literal punctuation and case without regex execution',()=>{
  assert.equal(matches('Кот котик скот кот','кот',{wholeWord:true}).length,2);
  assert.equal(matches('Кот кот','кот',{caseSensitive:true}).length,1);
  assert.equal(matches('[a] [b]','[a]').length,1);
  assert.equal(matches('a.*b a---b','a.*b').length,1);
  assert.equal(matches('text','').length,0);
  assert.equal(replaceAll('кот кот',matches('кот кот','кот'),'$&'),'$& $&');
});
test('draft import is validated, preserves private notes and never executes file contents',()=>{
  const d=parseDraft(JSON.stringify({body:'<script>bad()</script>',title:'Глава',notes:'План'}),true);
  assert.equal(d.notes,'План');assert.ok(!render(d.body).includes('<script>'));
  assert.throws(()=>parseDraft('{bad json',true));assert.throws(()=>parseDraft('{"body":12}',true));assert.throws(()=>parseDraft('x'.repeat(400001)));
});
test('document outline indexes all heading levels and formatting permits only hex colors',()=>{
  const text='# Раздел\n\nТекст\n## Сцена\n### Пункт';const h=outline(text);
  assert.equal(h.length,3);assert.equal(text.slice(h[1].at,h[1].at+2),'##');
  const html=render('# Раздел\n\n## Сцена\n\n### Пункт\n\n{color:#aabbcc}Слово{/color} {mark:#ffdd00}Важное{/mark}');
  assert.ok(html.includes('<h2>'));assert.ok(html.includes('<h3>'));assert.ok(html.includes('<h4>'));assert.ok(html.includes('color:#aabbcc'));
  const bad=render('{color:red;position:fixed}<img src=x onerror=alert(1)>{/color}');assert.ok(!bad.includes('style='));assert.ok(!bad.includes('<img'));
});

test('exports retain extensions and portable filenames for Cyrillic titles',()=>{assert.equal(fileName('Первая глава','json'),'pervaya-glava.json');assert.equal(fileName('../Глава: 2?','md'),'glava-2.md');});
