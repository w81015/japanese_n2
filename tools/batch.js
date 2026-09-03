/* 清單頁的「用字卡背這批 / 測驗這批」必須剛好等於畫面上那一頁 */
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
const { N2, Quiz, Cards, VOCAB, GRAMMAR } = window;
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
/** 畫面上這一頁實際列出的編號 */
const shownIds = () => [...app.querySelectorAll('.entry')].map(e => +e.id.slice(1));
const answerOne = () => {
  if (app.querySelector('.choice')) click('.choice');
  else if (app.querySelector('#fill')) {
    app.querySelector('#fill').value = 'x'; click('[data-act="check"]');
  } else {
    while (app.querySelector('[data-place]')) click('[data-place]');
    click('[data-act="check"]');
  }
  click('[data-act="next-q"]');
};
const same = (a, b) => JSON.stringify([...a].sort((x, y) => x - y)) ===
                       JSON.stringify([...b].sort((x, y) => x - y));

console.log('\n=== 1. 按鈕文字要說出實際數量 ===');
click('[data-go="vocab"]');
{
  const c = doc.querySelector('#batch-cards').textContent;
  const q = doc.querySelector('#batch-quiz').textContent;
  console.log('  ' + c + ' ／ ' + q);
  (c.includes('5') && q.includes('5'))
    ? OK('第 1 頁（5 個）的按鈕寫「這 5 個」') : E(`按鈕文字：${c} / ${q}`);
  click('[data-size="20"]');
  doc.querySelector('#batch-cards').textContent.includes('20')
    ? OK('改成每頁 20 後按鈕跟著變成「這 20 個」')
    : E('按鈕文字沒更新：' + doc.querySelector('#batch-cards').textContent);
  click('[data-size="5"]');
}

console.log('\n=== 2. 字卡：選 1–5 就只背這 5 個 ===');
{
  const ids = shownIds();
  same(ids, [1, 2, 3, 4, 5]) ? OK('目前這頁是 #1–#5') : E('這頁是 ' + ids);
  click('#batch-cards');
  const deck = Cards.deck();
  same(deck.items.map(x => x.id), ids)
    ? OK(`字卡剛好帶到這 5 個：${deck.items.map(x => x.id).sort((a, b) => a - b)}`)
    : E('字卡帶了 ' + deck.items.length + ' 張：' + deck.items.map(x => x.id));
  app.querySelector('.deck-top .muted').textContent.trim() === '1 / 5'
    ? OK('字卡進度顯示 1 / 5') : E('進度: ' + app.querySelector('.deck-top .muted').textContent);
}

console.log('\n=== 3. 字卡：翻到第 4 頁（16–20）也要對得上 ===');
{
  click('[data-go="vocab"]');
  click('[data-page="4"]');
  const ids = shownIds();
  same(ids, [16, 17, 18, 19, 20]) ? OK('這頁是 #16–#20') : E('這頁是 ' + ids);
  click('#batch-cards');
  same(Cards.deck().items.map(x => x.id), ids)
    ? OK('字卡帶的正是 #16–#20') : E('字卡帶了 ' + Cards.deck().items.map(x => x.id));
}

console.log('\n=== 4. 測驗：只考這一頁的 5 個 ===');
{
  click('[data-go="vocab"]');
  click('[data-page="6"]');
  const ids = shownIds();
  same(ids, [26, 27, 28, 29, 30]) ? OK('這頁是 #26–#30') : E('這頁是 ' + ids);
  click('#batch-quiz');
  app.querySelector('.q-card') ? OK('測驗有開起來') : E('測驗沒開');
  const total = app.querySelector('.deck-top .muted').textContent.trim();
  total === '1 / 5' ? OK('題數配合數量，出 5 題') : E('題數: ' + total);
  const asked = new Set(); const out = [];
  for (let i = 0; i < 5; i++) {
    const q = Quiz.current(); if (!q) break;
    asked.add(q.id);
    if (!ids.includes(q.id)) out.push(q.id);
    answerOne();
  }
  out.length === 0 ? OK(`5 題全在 #26–#30（考到 ${[...asked].sort((a, b) => a - b)}）`)
                   : E('考到範圍外的: ' + out);
  same(asked, ids) ? OK('5 個全部都被考到，沒有重複也沒有漏掉') : E('只考到 ' + [...asked]);
}

console.log('\n=== 5. 篩選＋分頁一起用 ===');
{
  click('[data-go="vocab"]');
  click('[data-pos="動詞"]');
  const p1 = shownIds();
  p1.length === 5 ? OK('動詞第 1 頁 5 個：' + p1) : E('第 1 頁 ' + p1);
  click('[data-page="2"]');
  const p2 = shownIds();
  console.log('  動詞第 2 頁：' + p2);
  p2.every(id => VOCAB.find(v => v.id === id).pos === '動詞')
    ? OK('第 2 頁仍然全是動詞') : E('混進了別的詞性');
  click('#batch-quiz');
  const out = [];
  for (let i = 0; i < 5; i++) {
    const q = Quiz.current(); if (!q) break;
    if (!p2.includes(q.id)) out.push(q.id);
    answerOne();
  }
  out.length === 0 ? OK('測驗只考動詞第 2 頁那幾個') : E('考到範圍外: ' + out);
  click('[data-go="vocab"]'); click('[data-pos="全部"]');
}

console.log('\n=== 6. 每頁「全部」時就是全部 ===');
{
  click('[data-size="0"]');
  shownIds().length === VOCAB.length ? OK('一次列出 122 個') : E('列出 ' + shownIds().length);
  click('#batch-cards');
  Cards.deck().items.length === VOCAB.length
    ? OK('字卡帶滿 122 張') : E('字卡 ' + Cards.deck().items.length + ' 張');
  click('[data-go="vocab"]'); click('[data-size="5"]');
}

console.log('\n=== 7. 文法頁同樣對得上 ===');
{
  click('[data-go="grammar"]');
  click('[data-page="3"]');
  const ids = shownIds();
  same(ids, [11, 12, 13, 14, 15]) ? OK('文法這頁是 #11–#15') : E('這頁是 ' + ids);
  click('#batch-cards');
  const d = Cards.deck();
  (d.kind === 'g' && same(d.items.map(x => x.id), ids))
    ? OK('文法字卡帶的正是 #11–#15') : E('字卡: ' + d.kind + ' ' + d.items.map(x => x.id));
  click('[data-go="grammar"]'); click('[data-page="3"]');
  click('#batch-quiz');
  const out = [];
  for (let i = 0; i < 5; i++) {
    const q = Quiz.current(); if (!q) break;
    if (q.kind !== 'g' || !ids.includes(q.id)) out.push(q.kind + q.id);
    answerOne();
  }
  out.length === 0 ? OK('文法測驗只考 #11–#15') : E('考到範圍外: ' + out);
}

console.log('\n=== 8. 首頁磁磚仍然是完整範圍 ===');
{
  click('[data-go="vocab"]'); click('[data-page="2"]');   // 先在清單頁選一頁
  click('[data-go="home"]');
  click('[data-start="cards-vocab"]');
  Cards.deck().items.length === VOCAB.length
    ? OK('從首頁進字卡是完整 122 張，不會被清單頁的分頁影響')
    : E('首頁字卡只有 ' + Cards.deck().items.length + ' 張');
}

console.log('\n=== 9. 編號分組不會跟「這批」互相打架 ===');
{
  // 先在測驗頁選一個跟等下那批完全不重疊的分組
  click('[data-go="quiz"]');
  click('[data-block="1"]');            // 1–5
  Quiz.validBlocks().length === 1 ? OK('先選了分組 1–5') : E('分組沒選上');
  click('[data-go="vocab"]');
  click('[data-page="9"]');             // 41–45，跟 1–5 完全不重疊
  const ids = shownIds();
  click('#batch-quiz');
  app.querySelector('.q-card')
    ? OK('即使先前選過分組，「測驗這批」仍能正常開始')
    : E('被舊的分組擋住，測驗開不起來');
  const out = [];
  for (let i = 0; i < 5; i++) {
    const q = Quiz.current(); if (!q) break;
    if (!ids.includes(q.id)) out.push(q.id);
    answerOne();
  }
  out.length === 0 ? OK(`考的是 #${ids[0]}–#${ids[ids.length - 1]}，舊分組已被清掉`)
                   : E('考到範圍外: ' + out);
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
