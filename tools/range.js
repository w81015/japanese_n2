/* 題數選項與「5 個一組、可複選」的編號範圍 */
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
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
const blocks = () => [...app.querySelectorAll('.blk')];
const pressed = () => blocks().filter(b => b.getAttribute('aria-pressed') === 'true')
  .map(b => b.textContent);
const info = () => app.querySelector('#q-range-info').textContent;
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

console.log('\n=== 1. 題數選項 ===');
click('[data-go="quiz"]');
const counts = [...app.querySelectorAll('[data-set="count"]')].map(b => b.dataset.val);
console.log('  ' + counts.join(' / '));
counts.includes('5') ? OK('有 5 題選項') : E('缺少 5 題選項');
click('[data-set="count"][data-val="5"]');
click('[data-act="quiz-start"]');
app.querySelector('.deck-top .muted').textContent.trim() === '1 / 5'
  ? OK('選 5 題 → 實際出 5 題') : E('題數不對');
for (let i = 0; i < 5; i++) answerOne();
app.querySelector('.score') ? OK('5 題跑完進到結果頁') : E('沒進結果頁');

console.log('\n=== 2. 分組是 5 個一組，且沒有輸入框 ===');
click('[data-go="quiz"]');
app.querySelector('input[type="number"]') === null
  ? OK('設定頁沒有任何數字輸入框，全部用點選') : E('還有數字輸入框');
const labels = blocks().map(b => b.textContent);
console.log('  前幾組:', labels.slice(0, 6).join(' '), '…', labels.slice(-2).join(' '));
labels.length === Math.ceil(window.VOCAB.length / 5)
  ? OK(`單字 ${window.VOCAB.length} 個切成 ${labels.length} 組`) : E('組數: ' + labels.length);
labels[0] === '1–5' && labels[1] === '6–10' && labels[labels.length - 1] === '121–122'
  ? OK('第一組 1–5、最後一組 121–122（不足 5 個也正確）') : E('分組標籤不對');
pressed().length === 0 ? OK('預設不選任何組') : E('預設有選: ' + pressed());
info().includes('全部 122 項') ? OK('提示文字: ' + info()) : E('提示文字: ' + info());
app.querySelector('[data-block="all"]').getAttribute('aria-pressed') === 'true'
  ? OK('「全部」按鈕預設是亮的') : E('「全部」沒亮');

console.log('\n=== 3. 複選與取消 ===');
click('[data-block="1"]');
JSON.stringify(pressed()) === JSON.stringify(['1–5'])
  ? OK('點 1–5 → 選取一組') : E('選取: ' + pressed());
info() === '已選 1 組，共 5 項' ? OK('提示: ' + info()) : E('提示: ' + info());
app.querySelector('[data-block="all"]').getAttribute('aria-pressed') === 'false'
  ? OK('有選取時「全部」自動暗掉') : E('「全部」狀態沒更新');
click('[data-block="11"]'); click('[data-block="26"]');
JSON.stringify(pressed()) === JSON.stringify(['1–5', '11–15', '26–30'])
  ? OK('可以複選三組（不連續也可以）') : E('複選: ' + pressed());
info() === '已選 3 組，共 15 項' ? OK('提示: ' + info()) : E('提示: ' + info());
window.Quiz.poolSize() === 15 ? OK('出題池 = 15 項') : E('池子大小: ' + window.Quiz.poolSize());
click('[data-block="11"]');
JSON.stringify(pressed()) === JSON.stringify(['1–5', '26–30'])
  ? OK('再點一次可取消該組') : E('取消後: ' + pressed());

console.log('\n=== 4. 出題只會落在選取的組 ===');
click('[data-set="count"][data-val="25"]');
click('[data-act="quiz-start"]');
const seen = new Set(); const out = [];
for (let i = 0; i < 25; i++) {
  const q = window.Quiz.current(); if (!q) break;
  seen.add(q.id);
  const ok = (q.id >= 1 && q.id <= 5) || (q.id >= 26 && q.id <= 30);
  if (!ok) out.push(q.id);
  answerOne();
}
out.length === 0
  ? OK(`25 題全部落在 1–5 與 26–30（出現 ${[...seen].sort((a, b) => a - b).join(',')}）`)
  : E('超出選取範圍: ' + out);
seen.size === 10 ? OK('10 個項目都有被考到') : E('只考到 ' + seen.size + ' 項');

console.log('\n=== 5.「全部」清空選取 ===');
click('[data-go="quiz"]');
JSON.stringify(pressed()) === JSON.stringify(['1–5', '26–30'])
  ? OK('離開再回來，選取狀態保留') : E('選取沒保留: ' + pressed());
click('[data-block="all"]');
pressed().length === 0 ? OK('點「全部」清空選取') : E('沒清空: ' + pressed());
info().includes('全部 122 項') ? OK('提示回到全部') : E('提示: ' + info());

console.log('\n=== 6. 切換單字↔文法 ===');
click('[data-block="21"]'); click('[data-block="116"]');   // 116 只有單字才有
JSON.stringify(pressed()) === JSON.stringify(['21–25', '116–120'])
  ? OK('先在單字選兩組') : E('選取: ' + pressed());
click('[data-set="scope"][data-val="g"]');
pressed().length === 0 ? OK('切到文法後選取自動清空') : E('殘留選取: ' + pressed());
const gl = blocks().map(b => b.textContent);
gl.length === Math.ceil(window.GRAMMAR.length / 5) && gl[gl.length - 1] === '81–82'
  ? OK(`文法 ${window.GRAMMAR.length} 條切成 ${gl.length} 組，最後一組 81–82`)
  : E('文法分組: ' + gl.length + ' 組，最後 ' + gl[gl.length - 1]);
click('[data-block="1"]'); click('[data-block="6"]');
click('[data-set="count"][data-val="10"]');
click('[data-act="quiz-start"]');
const gout = [];
for (let i = 0; i < 10; i++) {
  const q = window.Quiz.current(); if (!q) break;
  if (q.id < 1 || q.id > 10) gout.push(q.id);
  answerOne();
}
gout.length === 0 ? OK('文法 1–10 範圍正確') : E('文法超出範圍: ' + gout);

console.log('\n=== 7. 空集合的處理 ===');
// 先清掉錯題紀錄，確保這一組內真的沒有符合條件的項目
window.N2.progress.wrong = {}; window.N2.progress.marks = {}; window.N2.saveProgress();
click('[data-go="quiz"]');
click('[data-block="all"]');
click('[data-block="1"]');
click('[data-set="range"][data-val="常錯"]');
let alerted = '';
window.alert = m => { alerted = m; };
if (window.Quiz.poolSize() === 0) {
  click('[data-act="quiz-start"]');
  alerted.includes('1 組') ? OK('選取組內沒有符合條件時，提示說得很清楚')
                           : E('提示訊息: ' + alerted);
  app.querySelector('.setup') ? OK('沒有硬啟動，留在設定頁') : E('不該進入測驗');
} else {
  OK('這組剛好有常錯題（' + window.Quiz.poolSize() + ' 項），跳過空集合檢查');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
