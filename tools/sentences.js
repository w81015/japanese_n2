/* 多例句：資料完整性、測驗會換句子、瀏覽頁列出全部、判分仍然正確 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const D = require('path').join(__dirname, '..') + require('path').sep;
const errs = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const OK = m => console.log('  ✓ ' + m);

const html = fs.readFileSync(D + 'index.html', 'utf8')
  .replace(/<link rel="stylesheet" href="css\/style.css">/,
    '<style>' + fs.readFileSync(D + 'css/style.css', 'utf8') + '</style>')
  .replace(/<script src="([^"]+)"><\/script>/g,
    (_, p) => '<script>' + fs.readFileSync(D + p, 'utf8') + '</script>');
const dom = new JSDOM(html, { url: 'https://x.test/', runScripts: 'dangerously',
  pretendToBeVisual: true });
const { window } = dom, doc = window.document, app = doc.getElementById('app');
window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.scrollTo = () => {};
const { N2, Quiz, Decks, VOCAB } = window;
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
const vis = e => e && window.getComputedStyle(e).display !== 'none';
const KANA = /^[ぁ-んァ-ヶー]+$/;

console.log('\n=== 1. 資料結構 ===');
const multi = VOCAB.filter(v => v.exs && v.exs.length > 1);
{
  VOCAB.every(v => Array.isArray(v.exs) && v.exs.length)
    ? OK('每個單字都有 exs 陣列') : E('有單字沒有 exs');
  const total = VOCAB.reduce((a, v) => a + v.exs.length, 0);
  console.log(`  ${VOCAB.length} 個單字、共 ${total} 句，其中 ${multi.length} 個有多句`);
  multi.length >= 20 ? OK(`${multi.length} 個單字有兩句以上`) : E('多句的單字太少');

  // 舊欄位必須原封不動指向第一句，既有程式才不會壞
  VOCAB.every(v => v.ex === v.exs[0].ex && v.exZh === v.exs[0].exZh &&
                   v.exEn === v.exs[0].exEn)
    ? OK('頂層 ex／exZh／exEn 仍等於第一句') : E('頂層欄位跟第一句對不上');
  VOCAB.every(v => v.clozeIdx === v.exs[0].clozeIdx &&
                   v.clozeAnswer === v.exs[0].clozeAnswer &&
                   v.clozeKana === v.exs[0].clozeKana &&
                   v.clozeTail === v.exs[0].clozeTail)
    ? OK('頂層挖空欄位也仍等於第一句') : E('頂層挖空欄位對不上');
}

console.log('\n=== 2. 每一句自己的欄位都要合格 ===');
{
  let bad = 0;
  VOCAB.forEach(v => {
    v.exs.forEach((s, i) => {
      const w = `#${v.id} 第 ${i + 1} 句`;
      if (!s.ex || !s.exZh || !s.exEn) { E(`${w} 缺欄位`); bad++; return; }
      if (!['core', 'exam', 'life'].includes(s.use)) { E(`${w} use=${s.use}`); bad++; }
      if (s.ex.split('{').length !== s.ex.split('}').length) { E(`${w} 括號不對稱`); bad++; }
      for (const m of s.ex.matchAll(/\{([^}]*)\}/g)) {
        if (!KANA.test(m[1])) { E(`${w} 注音不是假名：${m[1]}`); bad++; }
      }
      for (const m of s.ex.matchAll(/(.)\{/g)) {
        if (!/[0-9一-鿿々]/.test(m[1])) { E(`${w} 注音底下不是漢字：${m[1]}`); bad++; }
      }
      // 挖空要挖得到，而且挖出來的就是這個單字
      const cs = N2.chunks(s.ex);
      if (!(s.clozeIdx >= 0 && s.clozeIdx < cs.length)) {
        E(`${w} clozeIdx ${s.clozeIdx} 超出 ${cs.length} 個文節`); bad++; return;
      }
      if (N2.plain(cs[s.clozeIdx]) !== s.clozeAnswer + s.clozeTail) {
        E(`${w} 挖空還原不符：${N2.plain(cs[s.clozeIdx])} vs ${s.clozeAnswer}+${s.clozeTail}`);
        bad++;
      }
      if (!N2.plain(s.ex).includes(s.clozeAnswer)) { E(`${w} 答案不在句子裡`); bad++; }
      if (!KANA.test(s.clozeKana)) { E(`${w} clozeKana 不是假名：${s.clozeKana}`); bad++; }
    });
  });
  bad === 0 ? OK('全部例句：注音格式、挖空位置、答案還原都正確') : E(`${bad} 個問題`);

  // 同一個單字的句子不可以重複
  let dup = 0;
  VOCAB.forEach(v => {
    if (new Set(v.exs.map(s => s.ex)).size !== v.exs.length) { E(`#${v.id} 有重複例句`); dup++; }
  });
  dup === 0 ? OK('同一個單字的例句沒有重複') : E(`${dup} 個單字有重複例句`);

  const uses = {};
  VOCAB.forEach(v => v.exs.forEach(s => { uses[s.use] = (uses[s.use] || 0) + 1; }));
  console.log('  用途分布:', Object.keys(uses).map(k => `${k} ${uses[k]}`).join('、'));
}

console.log('\n=== 3. csv 是唯一的手打來源 ===');
{
  const csv = fs.readFileSync(D + 'data/sentences.csv', 'utf8').trim().split('\n');
  const head = csv[0].split(',');
  JSON.stringify(head) === JSON.stringify(['deck', 'id', 'use', 'ja', 'zh', 'en'])
    ? OK('csv 欄位是 deck/id/use/ja/zh/en') : E('csv 欄位: ' + head);
  csv.length - 1 === VOCAB.reduce((a, v) => a + v.exs.length - 1, 0)
    ? OK(`csv ${csv.length - 1} 行，全部都進到資料檔了`)
    : E(`csv ${csv.length - 1} 行，但資料檔多出 ${VOCAB.reduce((a, v) => a + v.exs.length - 1, 0)} 句`);
  !csv[0].includes('{') && !csv.slice(1).some(l => l.includes('{'))
    ? OK('csv 裡沒有振假名，注音是產生出來的（不會有兩份真相）') : E('csv 混進了注音');
}

console.log('\n=== 4. 測驗會換句子 ===');
{
  const v = multi[0];
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(Quiz.withSentence(v).ex);
  seen.size === v.exs.length
    ? OK(`#${v.id} ${v.word} 抽 200 次，${v.exs.length} 句都出現過`)
    : E(`只抽到 ${seen.size} / ${v.exs.length} 句`);

  const one = VOCAB.find(x => x.exs.length === 1);
  Quiz.withSentence(one) === one ? OK('只有一句的項目原封不動回傳') : E('單句被複製了');

  // 換句子只換跟句子有關的欄位
  const alt = Quiz.withSentence(v, 1);
  (alt.id === v.id && alt.word === v.word && alt.zh === v.zh &&
   JSON.stringify(alt.wrongKanji) === JSON.stringify(v.wrongKanji))
    ? OK('換句子不會動到單字本身的欄位') : E('換句子把別的欄位也改掉了');
  (alt.ex === v.exs[1].ex && alt.clozeAnswer === v.exs[1].clozeAnswer &&
   alt.clozeIdx === v.exs[1].clozeIdx)
    ? OK('挖空欄位跟著換成該句自己的') : E('挖空欄位沒跟著換');
  alt.exUse === v.exs[1].use ? OK('帶上該句的用途標記') : E('沒有 exUse');
}

console.log('\n=== 5. 實際出題時題幹會變化 ===');
{
  const ids = multi.slice(0, 5).map(v => v.id);
  const stems = new Set();
  for (let round = 0; round < 12; round++) {
    Quiz.start({ scope: 'v', types: ['cloze'], count: 20, range: '全部',
                 customIds: ids, blocks: [] });
    while (true) {
      const q = Quiz.current(); if (!q) break;
      if (q.type === 'cloze') stems.add(q.id + '|' + q.stem);
      Quiz.next();
    }
  }
  const perItem = {};
  [...stems].forEach(s => {
    const id = s.split('|')[0];
    perItem[id] = (perItem[id] || 0) + 1;
  });
  const varied = Object.keys(perItem).filter(k => perItem[k] > 1).length;
  varied >= 4
    ? OK(`5 個單字裡有 ${varied} 個出現過不只一種題幹`)
    : E(`只有 ${varied} 個有變化，測驗沒換句子`);
}

console.log('\n=== 6. 多句不會弄壞判分 ===');
{
  let n = 0, wrong = 0;
  for (let round = 0; round < 6; round++) {
    Quiz.start({ scope: 'v', types: ['cloze', 'fill', 'sort'], count: 30,
                 range: '全部', customIds: null, blocks: [] });
    while (true) {
      const q = Quiz.current(); if (!q) break;
      n++;
      if (q.type === 'cloze') {
        if (q.options.length !== 4) { E(`挖空選項 ${q.options.length} 個`); wrong++; }
        if (q.options.indexOf(q.correct) < 0) { E('正解不在選項'); wrong++; }
        const plainStem = q.stem.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, '');
        if (plainStem.includes(q.correct)) { E(`#${q.id} 題幹洩漏答案`); wrong++; }
      } else if (q.type === 'fill') {
        if (!q.accept || !q.accept.length) { E('填空沒有可接受的答案'); wrong++; }
        // 可接受的答案必須真的出現在這一句裡，換句子後才不會拿別句的答案來判
        else if (!N2.plain(q.item.ex).includes(q.accept[0])) {
          E(`#${q.id} 填空答案「${q.accept[0]}」不在題目那一句裡`); wrong++;
        }
      } else if (q.type === 'sort') {
        if (q.pieces.length < 3) { E('排序詞塊少於 3 個'); wrong++; }
        const joined = q.answer.map(N2.plain).join('');
        if (joined !== N2.plain(q.item.ex)) { E(`#${q.id} 排序答案接不回原句`); wrong++; }
      }
      Quiz.next();
    }
  }
  wrong === 0 ? OK(`${n} 題挖空／填空／排序全部合格`) : E(`${wrong} 個問題`);
}

console.log('\n=== 7. 漢字読み與表記維持用第一句 ===');
{
  // 這兩種題型的底線位置是照第一句算的，換句子會對不上
  let bad = 0, n = 0;
  for (let round = 0; round < 4; round++) {
    Quiz.start({ scope: 'v', types: ['reading', 'writing'], count: 40,
                 range: '全部', customIds: null, blocks: [] });
    while (true) {
      const q = Quiz.current(); if (!q) break;
      if (q.type === 'reading' || q.type === 'writing') {
        n++;
        if (q.item.ex !== q.item.exs[0].ex) { E(`#${q.id} 用了非第一句`); bad++; }
        const plainStem = q.stem.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, '');
        if (!plainStem.includes(q.item.qWord) && !plainStem.includes(q.item.qKana)) {
          E(`#${q.id} 題幹裡找不到要考的詞`); bad++;
        }
      }
      Quiz.next();
    }
  }
  bad === 0 ? OK(`${n} 題漢字読み／表記都用第一句，底線位置正確`) : E(`${bad} 題有問題`);
}

console.log('\n=== 8. 瀏覽頁列出全部例句 ===');
{
  click('.tabs [data-go="vocab"]');
  const first = app.querySelector('.entry');
  const blocks = first.querySelectorAll('.ex');
  const v = VOCAB[0];
  blocks.length === v.exs.length
    ? OK(`#${v.id} 列出 ${blocks.length} 句`) : E(`列出 ${blocks.length} 句，應該 ${v.exs.length}`);
  const tags = [...first.querySelectorAll('.ex-use')].map(e => e.textContent);
  (tags.includes('考試') && tags.includes('生活'))
    ? OK('每句標出考試／生活：' + tags.join('、')) : E('沒有用途標籤: ' + tags);
  vis(blocks[blocks.length - 1]) ? OK('最後一句看得見（沒被樣式蓋掉）') : E('例句被藏起來');
  first.querySelectorAll('.ex-speak').length === blocks.length
    ? OK('每句都有自己的朗讀鈕') : E('朗讀鈕數量不對');
  const speak = [...first.querySelectorAll('.ex-speak')].map(b => b.dataset.speak);
  new Set(speak).size === speak.length
    ? OK('每個朗讀鈕唸的是各自那一句') : E('朗讀內容重複了');
  speak.every(s => !s.includes('{') && !s.includes('/'))
    ? OK('朗讀內容是純日文，沒有標注符號') : E('朗讀內容混進標注');
}

console.log('\n=== 9. 關掉例句與中譯時的行為 ===');
{
  click('[data-toggle="showEx"]');
  app.querySelectorAll('.entry .ex').length === 0
    ? OK('關掉「例句」後全部隱藏') : E('例句沒隱藏');
  click('[data-toggle="showEx"]');
  click('[data-toggle="showZh"]');
  app.querySelectorAll('.entry .ex .exzh').length === 0
    ? OK('關掉「中譯」後每一句的中文都不見') : E('還有中譯');
  click('[data-toggle="showZh"]');
  app.querySelectorAll('.entry .ex .exzh').length > 1
    ? OK('打開後多句的中文都回來') : E('中譯沒回來');
}

console.log('\n=== 10. 其他題庫沒被影響 ===');
{
  const vl = Decks.items('vl');
  vl.every(x => !x.exs) ? OK('單字表沒有例句，也沒被硬塞 exs') : E('單字表多了 exs');
  !Quiz.typesFor('vl').includes('cloze')
    ? OK('單字表仍然不出挖空題') : E('單字表不該有挖空');
  const gl = Decks.items('gl');
  gl.every(x => x.ex) ? OK('文法表的單句例句照舊') : E('文法表壞了');
  click('.tabs [data-go="grammar"]');
  app.querySelector('.entry .ex') ? OK('文法頁例句正常') : E('文法頁例句不見了');
  click('.tabs [data-go="past"]');
  app.querySelector('.sec-list') ? OK('考古題頁正常') : E('考古題頁壞了');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
