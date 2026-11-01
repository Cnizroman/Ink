const {test}=require('node:test');const assert=require('node:assert/strict');const {render}=require('../text-format.js');
test('reader and preview support safe inline formatting and structured blocks',()=>{
 const html=render('**Жирный** *Курсив* __Подчёркнутый__ ~~Удалённый~~ ==Важное==\n\n:::dialog Анна\n— Привет.\n:::\n\n:::note Автор\nПримечание\n:::\n\n:::spoiler Развязка\nСкрыто\n:::\n\n:::center\nПо центру\n:::\n\n- Один\n- Два');
 for(const tag of ['strong','em','u','del','mark','aside','details','ul','li'])assert.ok(html.includes('<'+tag));
 assert.ok(html.includes('text-align-center'));assert.ok(html.includes('Анна'));
});
test('raw HTML and dangerous attributes are escaped inside every block',()=>{
 const html=render(':::dialog <img src=x onerror=alert(1)>\n<script>alert(1)</script>\n:::\n\n**<svg onload=alert(2)>**');
 assert.ok(!html.includes('<script'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<svg'));assert.ok(html.includes('&lt;script&gt;'));
});
test('poetry preserves line breaks and blank lines',()=>{
 const html=render('Первая\n\nТретья',true);assert.equal((html.match(/class="line"/g)||[]).length,3);
});
