const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','belaya-golova.html'),'utf8');
const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1];
const chapters=Object.fromEntries([...html.matchAll(/<h3 id="chapter-(\d+)">([\s\S]*?)(?=<h3 id="chapter-\d+"|<\/main>)/g)].map(m=>[m[1],m[2]]));
const count=s=>html.split(s).length-1;
test('the supplied author revision is preserved verbatim inside main',()=>{
 assert.equal(crypto.createHash('sha256').update(main).digest('hex'),'09303ef27bfe747deeb35023741e9bd059afa35f9a838a6f43b9d4cbf2c585cb');
 assert.match(html,/https:\/\/cnizroman.github.io\/Ink\/belaya-golova.html/);assert.doesNotMatch(html,/https:\/\/cnizroman.github.io\/Nobody-came\//);
});
test('author revision has 17 sections: 16 numbered chapters and one epilogue',()=>{
 assert.equal(Object.keys(chapters).length,16);assert.equal((main.match(/<h3\b/g)||[]).length,17);assert.equal(count('<h3>Эпилог</h3>'),1);
 assert.match(chapters[15],/Последняя ночь/);assert.match(chapters[16],/Выбор/);
 assert.match(html,/<img[^>]+src="assets\/alfred.png"/);assert.match(html,/data-review-book="belaya-golova"/);
});
test('bridge and first consultation are not replayed in following chapters',()=>{
 assert.equal(count('Если я забуду себя, не пытайся вернуть меня'),1);
 assert.match(chapters[3],/Под Старым мостом/);assert.doesNotMatch(chapters[4],/Под Старым мостом|Музыкант забыл/);
 assert.equal(count('Вы стираете людей?'),1);assert.match(chapters[4],/Вы стираете людей/);assert.doesNotMatch(chapters[5],/Доктор Вельд встретил/);
});
test('notebook instruction and say-your-name scene are each present once',()=>{
 assert.equal(count('не называйте его Марком'),1);assert.match(chapters[5],/Под Бюро они нашли комнату/);
 assert.doesNotMatch(chapters[6],/они нашли комнату 17|На столе лежал блокнот Марка|А теперь я думаю, что ошибалась/);
 assert.equal(count('Скажи своё имя'),1);assert.doesNotMatch(chapters[11],/Скажи своё имя/);assert.match(chapters[12],/Скажи своё имя/);
 assert.match(chapters[12],/Но вместо этого сказал:<\/p>\s*<p>«Альфред»\.<\/p>/);
});
test('choice precedes disappearance and the single epilogue',()=>{
 const final=chapters[16],ordered=['Перед залом выбора','Они вошли вместе.','Когда система показала выбор','Перед тем как сделать выбор','Когда Альфред исчезал','<h3>Эпилог</h3>'];
 let last=-1;for(const phrase of ordered){const at=final.indexOf(phrase);assert.ok(at>last,phrase);last=at;}
 assert.doesNotMatch(final,/Эпилог\. Если однажды забудешь/);assert.match(final,/Он сделал выбор и исчез/);
});
