/* 分頁、中英雙譯、例句朗讀 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const D = require('path').join(__dirname, '..') + require('path').sep;
const errs = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const OK = m => console.log('  ✓ ' + m);

let html = fs.readFileSync(D + 'index.html', 'utf8')
  .replace(/<link rel="stylesheet" href="css\/style.css">/,
    '<style>' + fs.readFileSync(D + 'css/style.css', 'utf8') + '</style>')
  .replace(/<script src="([^"]+)"><\/script>/g,
    (_, p) => '<script>' + fs.readFileSync(D + p, 'utf8') + '</script>');
const dom = new JSDOM(html, { url: 'https://x.test/', runScripts: 'dangerously',
  pretendToBeVisual: true });
const { window } = dom, doc = window.document, app = doc.getElementById('app');
// 記錄實際被朗讀的文字
const spoken = [];
window.speechSynthesis = { cancel() {}, getVoices: () => [], speak(u) { spoken.push(u.text); } };
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
const entries = () => [...app.querySelectorAll('.entry')];
const pageBtns = () => [...app.querySelectorAll('#v-pager-top .page-btn, #g-pager-top .page-btn')]
  .map(b => b.textContent);

console.log('\n=== 1. 單字分頁 ===');
click('[data-go="vocab"]');
entries().length === 10 ? OK('預設每頁 10 個') : E('每頁筆數 ' + entries().length);
const labels = pageBtns();
console.log('  分頁按鈕:', labels.join(' '));
labels[0] === '1–10' && labels[1] === '11–20' && labels[labels.length - 1] === '121–122'
  ? OK(`共 ${labels.length} 頁，最後一頁 121–122`) : E('分頁標籤不對');
app.querySelector('#v-count').textContent.includes('共 122 個')
  ? OK('計數列: ' + app.querySelector('#v-count').textContent) : E('計數列不對');
const firstIds = () => entries().map(e => +e.id.slice(1));
JSON.stringify(firstIds()) === JSON.stringify([1,2,3,4,5,6,7,8,9,10])
  ? OK('第 1 頁是 #1–#10') : E('第 1 頁內容: ' + firstIds());
click('[data-page="3"]');
JSON.stringify(firstIds()) === JSON.stringify([21,22,23,24,25,26,27,28,29,30])
  ? OK('點「21–30」跳到 #21–#30') : E('第 3 頁內容: ' + firstIds());
app.querySelector('[data-page="3"].page-btn').getAttribute('aria-pressed') === 'true'
  ? OK('當前頁高亮') : E('當前頁沒高亮');
app.querySelector('#v-count').textContent.includes('顯示 21–30')
  ? OK('計數列同步: ' + app.querySelector('#v-count').textContent) : E('計數列沒同步');
click('#v-pager-bottom .opt:last-child');   // ›
firstIds()[0] === 31 ? OK('下一頁鈕正常') : E('下一頁失敗: ' + firstIds()[0]);

console.log('\n=== 2. 每頁筆數 ===');
click('[data-size="20"]');
entries().length === 20 ? OK('切成每頁 20') : E('每頁 20 失敗: ' + entries().length);
pageBtns()[0] === '1–20' ? OK('分頁標籤跟著變成 1–20') : E('標籤沒更新: ' + pageBtns()[0]);
click('[data-size="0"]');
entries().length === 122 ? OK('「全部」一次列出 122 個') : E('全部失敗: ' + entries().length);
app.querySelector('.pager') === null ? OK('全部模式不顯示分頁列') : E('全部模式仍有分頁列');
click('[data-size="10"]');
JSON.parse(window.localStorage.getItem('n2app.settings.v1')).pageSize === 10
  ? OK('每頁筆數有存進 localStorage') : E('沒存檔');

console.log('\n=== 3. 篩選／搜尋後回到第 1 頁 ===');
click('[data-page="5"]');
click('[data-pos="動詞"]');
firstIds()[0] === 62 && entries().length === 10
  ? OK('換詞性後回到第 1 頁') : E('沒回到第 1 頁: ' + firstIds());
const vq = doc.querySelector('#v-q');
click('[data-pos="全部"]'); click('[data-page="7"]');
vq.value = '責任'; vq.dispatchEvent(new window.Event('input', { bubbles: true }));
entries().length === 2 ? OK('搜尋後回到第 1 頁且只剩 2 筆') : E('搜尋分頁錯誤: ' + entries().length);
app.querySelector('.pager') === null ? OK('結果少於一頁時不顯示分頁列') : E('不該有分頁列');
vq.value = ''; vq.dispatchEvent(new window.Event('input', { bubbles: true }));

console.log('\n=== 4. 文法分頁 ===');
click('[data-go="grammar"]');
entries().length === 10 ? OK('文法也是每頁 10 條') : E('文法每頁 ' + entries().length);
const gl = pageBtns();
gl[gl.length - 1] === '81–82' ? OK(`文法共 ${gl.length} 頁，最後一頁 81–82`) : E('文法標籤: ' + gl.join(' '));
click('[data-page="2"]');
+entries()[0].id.slice(1) === 11 ? OK('文法第 2 頁從 #11 開始') : E('文法翻頁失敗');

console.log('\n=== 5. 例句中英翻譯 ===');
click('[data-go="vocab"]');
const e1 = entries()[0];
const zh = e1.querySelector('.ex .exzh'), en = e1.querySelector('.ex .exen');
zh ? OK('單字例句有中譯：' + zh.textContent) : E('單字例句沒有中譯');
en ? OK('單字例句有英譯：' + en.textContent) : E('單字例句沒有英譯');
e1.querySelector('.en') ? OK('單字本身有英文：' + e1.querySelector('.en').textContent)
                        : E('單字本身沒有英文');
click('[data-go="grammar"]');
if (app.querySelector('[data-page="1"]')) click('[data-page="1"]');   // 回到第 1 頁
const g1 = entries()[0];
+g1.id.slice(1) === 1 ? OK('回到文法第 1 頁') : E('不在第 1 頁: ' + g1.id);
g1.querySelector('.zh') ? OK('文法有中文意思') : E('文法沒有中文意思');
g1.querySelector('.en') ? OK('文法有英文意思：' + g1.querySelector('.en').textContent)
                        : E('文法沒有英文意思');
g1.querySelector('.note') && /Note:/.test(g1.querySelector('.note').textContent)
  ? OK('文法「注意」有英文版') : E('文法注意沒有英文');
g1.querySelector('.ex .exzh') && g1.querySelector('.ex .exen')
  ? OK('文法例句中英俱全') : E('文法例句缺翻譯');

console.log('\n=== 6. EN 開關獨立於中譯 ===');
click('[data-toggle="showZh"]');            // 關中譯
let g2 = entries()[0];
(!g2.querySelector('.zh') && g2.querySelector('.en'))
  ? OK('只關中譯時英文仍在') : E('中英開關沒有獨立');
(!g2.querySelector('.ex .exzh') && g2.querySelector('.ex .exen'))
  ? OK('例句也是只剩英譯') : E('例句翻譯沒有獨立控制');
click('[data-toggle="showEn"]');            // 再關英文
g2 = entries()[0];
(!g2.querySelector('.en') && !g2.querySelector('.note'))
  ? OK('中英全關時只剩日文原文') : E('全關後仍有翻譯');
click('[data-toggle="showZh"]'); click('[data-toggle="showEn"]');

console.log('\n=== 7. 例句朗讀 ===');
click('[data-go="vocab"]');
const card = entries()[0];
const wordBtn = card.querySelector('.entry-actions [data-speak]');
const exBtn = card.querySelector('.ex-speak');
exBtn ? OK('每個例句都有朗讀鈕') : E('例句沒有朗讀鈕');
spoken.length = 0;
click(wordBtn);
spoken[0] === '影響' ? OK('單字鈕唸單字：「' + spoken[0] + '」') : E('單字朗讀內容: ' + spoken[0]);
spoken.length = 0;
click(exBtn);
spoken[0] === '彼の発言は世論に大きな影響を与えた。'
  ? OK('例句鈕唸整句：「' + spoken[0] + '」') : E('例句朗讀內容: ' + spoken[0]);
/[{}\/]/.test(spoken[0] || '') ? E('朗讀文字含標注符號') : OK('朗讀文字不含 {} 與 / 標記');
click('[data-go="grammar"]');
if (app.querySelector('[data-page="1"]')) click('[data-page="1"]');
spoken.length = 0;
click(entries()[0].querySelector('.ex-speak'));
spoken[0] === '長時間話し合ったあげく、結論は出なかった。'
  ? OK('文法例句朗讀正確') : E('文法例句朗讀: ' + spoken[0]);
const exCount = entries().filter(e => e.querySelector('.ex-speak')).length;
exCount === 10 ? OK('本頁 10 條都有例句朗讀鈕') : E('只有 ' + exCount + ' 條有朗讀鈕');

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
