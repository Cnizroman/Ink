const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','belaya-golova.html'),'utf8');
const chapters=Object.fromEntries([...html.matchAll(/<h3 id="chapter-(\d+)">([\s\S]*?)(?=<h3 id="chapter-\d+"|<\/main>)/g)].map(m=>[m[1],m[2]]));
const count=s=>html.split(s).length-1;
test('all 16 chapters survive the scene consolidation',()=>{assert.equal(Object.keys(chapters).length,16);for(let i=1;i<=16;i++)assert.ok(chapters[i].length>300);});
test('bridge, consultation and missing-childhood discovery each occur once',()=>{
 assert.equal(count('Если я забуду себя, не пытайся вернуть меня.'),1);
 assert.match(chapters[3],/Под Старым мостом/);assert.doesNotMatch(chapters[4],/Под Старым мостом/);
 assert.equal(count('Вы стираете людей?'),1);assert.match(chapters[4],/Вы стираете людей/);assert.doesNotMatch(chapters[5],/Доктор Вельд встретил/);
 assert.equal(count('Первый официальный след'),1);assert.match(chapters[6],/Ни одной школьной записи/);assert.doesNotMatch(chapters[7],/Ни одной школьной записи/);
 assert.match(chapters[3],/Они нашли музыканта/);assert.doesNotMatch(chapters[4],/Музыкант забыл/);
});
test('room discovery and the name-recognition scene do not restart in later chapters',()=>{
 assert.equal(count('не называйте его Марком'),1);assert.match(chapters[5],/В подземной части Бюро они нашли комнату 17/);
 assert.doesNotMatch(chapters[6],/они нашли комнату 17|На столе лежал блокнот Марка/);
 assert.equal(count('Скажи своё имя'),1);assert.match(chapters[11],/Скажи своё имя/);assert.doesNotMatch(chapters[12],/Скажи своё имя|Первый рабочий день/);
 assert.doesNotMatch(chapters[11],/Вельд наконец рассказал правду/);
 assert.match(chapters[10],/запись с камер наблюдения/);
});
test('finale follows its existing tragic ending without jumping back before the choice',()=>{
 const final=chapters[16];const ordered=['Перед залом выбора','Они вошли вместе.','Когда система показала выбор','Перед тем как сделать выбор','Когда Альфред исчезал','Когда полностью белый Марк ушёл','<h3>Эпилог</h3>'];
 let last=-1;for(const phrase of ordered){const at=final.indexOf(phrase);assert.ok(at>last,phrase);last=at;}
 assert.equal(count('<h3>Эпилог</h3>'),1);assert.doesNotMatch(final,/Эпилог\. Если однажды забудешь/);
 assert.match(final,/Он сделал выбор и исчез/);assert.doesNotMatch(chapters[15],/Альфред продолжил работать переплётчиком/);
});
