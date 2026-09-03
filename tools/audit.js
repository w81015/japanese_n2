/* 全專案稽核：CSS 可見性 + 路由 + 互動 + 資料完整性 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const D = require('path').join(__dirname, '..') + require("path").sep;
const errs = [], warns = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const W = m => { warns.push(m); console.log('  ⚠️  ' + m); };
const OK = m => console.log('  ✓ ' + m);

let html = fs.readFileSync(D + 'index.html', 'utf8');
// 把外部 css / js 換成 inline，讓 jsdom 真的套用
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/,
  '<style>' + fs.readFileSync(D + 'css/style.css', 'utf8') + '</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g,
  (_, p) => '<script>' + fs.readFileSync(D + p, 'utf8') + '</script>');

const dom = new JSDOM(html, { url: 'https://x.test/', runScripts: 'dangerously',
  pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const app = doc.getElementById('app');
window.addEventListener('error', e => E('未捕捉錯誤: ' + e.message));
const origErr = console.error;
const click = sel => {
  const e = typeof sel === 'string' ? doc.querySelector(sel) : sel;
  if (!e) { E('找不到元素 ' + sel); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return e;
};
const disp = sel => window.getComputedStyle(doc.querySelector(sel)).display;
// 清單頁的「共 N 個」＝篩選後的總數（__currentSet 只有當頁，不能拿來當總數）
const filtered = sel => {
  const m = (doc.querySelector(sel) || {}).textContent || '';
  return +(m.match(/共\s*(\d+)/) || [, 0])[1];
};
const onPage = () => app.querySelectorAll('.entry').length;

console.log('\n=== 1. CSS 可見性（[hidden] 是否真的隱藏） ===');
const bd = '#settings-backdrop';
if (disp(bd) === 'none') OK('設定面板初始為隱藏 (display:none)');
else E('設定面板一開啟網頁就蓋住畫面！display=' + disp(bd));
click('#btn-settings');
if (disp(bd) !== 'none') OK('點齒輪後面板顯示 (display:' + disp(bd) + ')');
else E('點齒輪後面板沒有出現');
click('#btn-close-settings');
if (disp(bd) === 'none') OK('按「完成」可以關閉面板');
else E('按「完成」關不掉面板');
click('#btn-settings');
doc.querySelector(bd).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
if (disp(bd) === 'none') OK('點背景也能關閉面板');
else E('點背景關不掉面板');
if (disp('#import-file') === 'none') OK('隱藏的檔案輸入框確實不可見');
else E('#import-file 沒有被隱藏');

console.log('\n=== 2. 五個分頁都能渲染 ===');
for (const [r, key] of [['home', '今天想練什麼'], ['vocab', '單字'],
                        ['grammar', '文法'], ['quiz', '測驗'], ['stats', '學習統計']]) {
  click(`[data-go="${r}"]`);
  const t = app.textContent;
  if (t.length > 40 && t.includes(key)) OK(`${r} (${t.length} 字)`);
  else E(`${r} 渲染異常，長度 ${t.length}`);
  const cur = doc.querySelector('.tabs button[aria-current="true"]');
  if (!cur || cur.dataset.go !== r) E(`${r} 分頁高亮不正確`);
}

console.log('\n=== 3. 單字頁 ===');
click('[data-go="vocab"]');
if (filtered('#v-count') === window.VOCAB.length)
  OK(`篩到全部 122 個（本頁顯示 ${onPage()} 個）`);
else E(`筆數不對：${app.querySelector('#v-count').textContent}`);
if (app.querySelectorAll('ruby').length > 20) OK('振假名 ruby 標籤已產生');
else E('ruby 數量過少：' + app.querySelectorAll('ruby').length);
// 詞性篩選
for (const pos of ['名詞', '動詞', 'い形容詞', 'な形容詞', '副詞', '外來語']) {
  click(`[data-pos="${pos}"]`);
  const got = filtered('#v-count');
  const want = window.VOCAB.filter(v => v.pos === pos).length;
  if (got === want) OK(`篩選 ${pos}: ${got} 個`);
  else E(`篩選 ${pos} 得到 ${got}，應為 ${want}`);
}
click('[data-pos="全部"]');
// 搜尋
const q = doc.querySelector('#v-q');
for (const [term, min] of [['責任', 1], ['けいけん', 1], ['影響', 1], ['zzzz', 0]]) {
  q.value = term; q.dispatchEvent(new window.Event('input', { bubbles: true }));
  const got = filtered('#v-count');
  if (term === 'zzzz' ? got === 0 : got >= min) OK(`搜尋「${term}」→ ${got} 筆`);
  else E(`搜尋「${term}」得到 ${got} 筆`);
}
q.value = ''; q.dispatchEvent(new window.Event('input', { bubbles: true }));

console.log('\n=== 4. 顯示開關 ===');
const chk = (key, sel, shouldBeZero) => {
  click(`[data-toggle="${key}"]`);
  const n = app.querySelectorAll(sel).length;
  if (shouldBeZero ? n === 0 : n > 0) OK(`${key} 切換正常 (${sel} = ${n})`);
  else E(`${key} 切換後 ${sel} = ${n}`);
};
chk('showZh', '.entry .zh', true);   chk('showZh', '.entry .zh', false);
chk('showEn', '.entry .en', true);   chk('showEn', '.entry .en', false);
chk('showEx', '.entry .ex', true);   chk('showEx', '.entry .ex', false);
click('[data-toggle="showFurigana"]');
const rtDisp = window.getComputedStyle(app.querySelector('rt')).display;
if (rtDisp === 'none') OK('關閉假名後 rt 真的隱藏');
else E('關閉假名後 rt 仍顯示 (display:' + rtDisp + ')');
click('[data-toggle="showFurigana"]');
if (window.getComputedStyle(app.querySelector('rt')).display !== 'none') OK('重新開啟假名正常');
else E('假名開不回來');

console.log('\n=== 5. 字卡 ===');
const pageIds = [...app.querySelectorAll('.entry')].map(e => e.id);
click('[data-start="cards-vocab"]');
if (app.querySelector('.flash')) OK('進入字卡');
else E('字卡沒有開啟');
const curTab = doc.querySelector('.tabs button[aria-current="true"]');
if (curTab && curTab.dataset.go === 'vocab') OK('字卡模式時單字分頁保持高亮');
else E('字卡模式分頁高亮錯誤');
if (!app.querySelector('.back')) OK('初始為正面');
else E('初始就翻面了');
click('#flash');
if (app.querySelector('.back')) OK('點卡片可翻面');
else E('翻面失敗');
const N = pageIds.length;
const cnt = () => app.querySelector('.deck-top .muted').textContent.trim();
if (cnt() === `1 / ${N}`) OK(`字卡張數等於當頁項目數（${N} 張）`);
else E('字卡張數: ' + cnt());
click('[data-act="next"]');
if (cnt() === `2 / ${N}`) OK('下一張正常');
else E('下一張計數錯誤：' + cnt());
click('[data-act="prev"]');
if (cnt() === `1 / ${N}`) OK('上一張正常');
else E('上一張計數錯誤');
click('[data-act="again"]');
if (cnt() === `2 / ${N + 1}`) OK('「再看一次」把卡片排到最後');
else E('再看一次行為錯誤：' + cnt());
click('[data-act="known"]');
if (Object.values(window.N2.progress.marks).includes('known')) OK('「已掌握」有寫入紀錄');
else E('已掌握沒有寫入');
// 篩選後開字卡只帶篩選結果
click('[data-go="vocab"]'); click('[data-pos="動詞"]');
const nVerbPage = onPage();
click('[data-start="cards-vocab"]');
if (app.querySelector('.deck-top .muted').textContent.includes('/ ' + nVerbPage))
  OK(`篩選後字卡帶當頁的 ${nVerbPage} 張`);
else E('字卡沒有沿用當頁內容');

console.log('\n=== 6. 測驗（四種題型各跑一輪） ===');
click('[data-go="grammar"]'); click('[data-go="vocab"]'); click('[data-pos="全部"]');
for (const scope of ['vocab', 'grammar']) {
  for (const type of ['cloze', 'mc', 'fill', 'sort']) {
    click('[data-go="quiz"]');
    click(`[data-set="scope"][data-val="${scope}"]`);
    // 先確保目標題型被選上，再移除其他（避免「至少要留一個」的限制擋住）
    const tb = t => doc.querySelector(`[data-set="types"][data-val="${t}"]`);
    if (tb(type).getAttribute('aria-pressed') !== 'true') click(tb(type));
    ['cloze', 'mc', 'fill', 'sort'].filter(t => t !== type).forEach(t => {
      if (tb(t).getAttribute('aria-pressed') === 'true') click(tb(t));
    });
    const chosen = ['cloze','mc','fill','sort'].filter(t => tb(t).getAttribute('aria-pressed')==='true');
    if (chosen.join() !== type) E(`題型選取失敗，實際=${chosen}`);
    click('[data-set="count"][data-val="10"]');
    click('[data-act="quiz-start"]');
    let n = 0, seen = {};
    for (let i = 0; i < 12; i++) {
      const t = app.querySelector('.q-type');
      if (!t) break;
      seen[t.textContent.split(' ')[0]] = 1; n++;
      if (app.querySelector('.choice')) click('.choice');
      else if (app.querySelector('#fill')) {
        app.querySelector('#fill').value = 'ダミー'; click('[data-act="check"]');
      } else {
        while (app.querySelector('[data-place]')) click('[data-place]');
        click('[data-act="check"]');
      }
      if (!app.querySelector('[data-act="next-q"]')) { E(`${scope}/${type} 第${n}題無回饋`); break; }
      click('[data-act="next-q"]');
    }
    const score = app.querySelector('.score .big');
    if (n === 10 && score) OK(`${scope}/${type}: 10 題完成，結果頁 ${score.textContent}，題型 ${Object.keys(seen)}`);
    else E(`${scope}/${type}: 只跑了 ${n} 題，結果頁=${!!score}`);
  }
}

console.log('\n=== 7. 錯題本 / 統計 ===');
const wrongN = Object.keys(window.N2.progress.wrong).length;
if (wrongN > 0) OK(`錯題本累積 ${wrongN} 項`);
else W('錯題本是空的（可能剛好全對）');
click('[data-go="stats"]');
if (app.textContent.includes('頑固項目')) OK('統計頁有頑固項目排行');
else E('統計頁缺少頑固項目排行');
if (app.textContent.includes('正確率趨勢')) OK('統計頁有趨勢圖');
else E('統計頁缺少趨勢圖');
if (app.textContent.includes('今天該複習')) OK('統計頁有待複習清單');
else E('統計頁缺少待複習清單');
if (app.querySelectorAll('.heat i').length === 42) OK('熱力圖 42 格');
else E('熱力圖格數 ' + app.querySelectorAll('.heat i').length);
const todayCell = app.querySelectorAll('.heat i')[41];
if (todayCell.getAttribute('data-l') !== '0') OK('今天的格子有顏色');
else E('今天作答了但熱力圖沒亮');
if (doc.querySelector('[data-start="review-quiz"]')) {
  click('[data-start="review-quiz"]');
  if (app.querySelector('.q-card')) OK('待複習清單可以直接開測驗');
  else E('待複習測驗沒開起來');
  click('[data-act="quiz-quit"]');
}

console.log('\n=== 8. 只考錯的 / 再考一次 ===');
click('[data-go="quiz"]'); click('[data-act="quiz-start"]');
for (let i = 0; i < 15; i++) {
  if (!app.querySelector('.q-type')) break;
  if (app.querySelector('.choice')) click('.choice');
  else if (app.querySelector('#fill')) { app.querySelector('#fill').value = 'x'; click('[data-act="check"]'); }
  else { while (app.querySelector('[data-place]')) click('[data-place]'); click('[data-act="check"]'); }
  click('[data-act="next-q"]');
}
if (doc.querySelector('[data-act="quiz-wrong"]')) {
  click('[data-act="quiz-wrong"]');
  if (app.querySelector('.q-card')) OK('「只考錯的」可以啟動');
  else E('只考錯的沒啟動');
  click('[data-act="quiz-quit"]');
}
// 回到全題型，任意作答一題檢查回饋區
click('[data-go="quiz"]');
['cloze', 'mc', 'fill', 'sort'].forEach(t => {
  const b = doc.querySelector(`[data-set="types"][data-val="${t}"]`);
  if (b.getAttribute('aria-pressed') !== 'true') click(b);
});
click('[data-act="quiz-start"]');
if (app.querySelector('.choice')) click('.choice');
else if (app.querySelector('#fill')) { app.querySelector('#fill').value = 'x'; click('[data-act="check"]'); }
else { while (app.querySelector('[data-place]')) click('[data-place]'); click('[data-act="check"]'); }
const fb = app.querySelector('.feedback');
if (fb) OK('作答後出現回饋區（' + app.querySelector('.q-type').textContent + '）');
else E('沒有回饋區');
if (fb && fb.querySelector('ruby')) OK('回饋區的例句有振假名');
else if (fb) E('回饋區沒有 ruby');
// 作答後不能改答案
const before = fb ? fb.textContent : '';
if (app.querySelector('.choice')) click('.choice:last-child');
if (fb && fb.textContent === before) OK('作答後鎖定，不能改答案');
else if (fb) E('作答後仍可改答案');

console.log('\n=== 9. 資料完整性 ===');
const { VOCAB, GRAMMAR, N2 } = window;
const need = { vocab: ['id', 'pos', 'word', 'wordRuby', 'reading', 'zh', 'ex', 'clozeIdx'],
               grammar: ['id', 'pattern', 'meaning', 'usage', 'ex', 'exZh', 'cloze'] };
let dbad = 0;
VOCAB.forEach(v => need.vocab.forEach(k => {
  if (v[k] === undefined || v[k] === null || v[k] === '') { E(`單字 #${v.id} 缺 ${k}`); dbad++; }
}));
GRAMMAR.forEach(g => need.grammar.forEach(k => {
  if (g[k] === undefined || g[k] === null || g[k] === '' ||
      (Array.isArray(g[k]) && !g[k].length)) { E(`文法 #${g.id} 缺 ${k}`); dbad++; }
}));
if (!dbad) OK(`欄位齊全：單字 ${VOCAB.length} 筆、文法 ${GRAMMAR.length} 筆`);
const strip = h => h.replace(/<rt>.*?<\/rt>/g, '').replace(/<\/?ruby>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
let rbad = 0;
[...VOCAB, ...GRAMMAR].forEach(it => ['ex', 'wordRuby'].forEach(f => {
  if (!it[f]) return;
  if (strip(N2.ruby(it[f])) !== N2.plain(it[f])) { E(`#${it.id} ${f} ruby 還原不符`); rbad++; }
  for (const m of it[f].matchAll(/(.)\{/g))
    if (!/[々〆ヶ一-鿿]/.test(m[1])) { E(`#${it.id} ${f} 注音底字含假名`); rbad++; }
}));
if (!rbad) OK('204 句例句的振假名標注全部可還原成原文');
const dupV = new Set(VOCAB.map(v => v.id)).size !== VOCAB.length;
const dupG = new Set(GRAMMAR.map(g => g.id)).size !== GRAMMAR.length;
if (!dupV && !dupG) OK('id 無重複');
else E('id 有重複');

console.log('\n=== 10. 設定持久化 ===');
click('#btn-settings');
const fsIn = doc.getElementById('set-fontsize');
fsIn.value = 130; fsIn.dispatchEvent(new window.Event('input', { bubbles: true }));
if (JSON.parse(window.localStorage.getItem('n2app.settings.v1')).fontSize === 130)
  OK('字級有寫入 localStorage');
else E('字級沒有存檔');
const th = doc.getElementById('set-theme');
th.value = 'dark'; th.dispatchEvent(new window.Event('change', { bubbles: true }));
if (doc.documentElement.getAttribute('data-theme') === 'dark') OK('深色模式套用');
else E('深色模式沒套用');
th.value = 'auto'; th.dispatchEvent(new window.Event('change', { bubbles: true }));
click('#btn-close-settings');
if (window.localStorage.getItem('n2app.progress.v1')) OK('學習紀錄有寫入 localStorage');
else E('學習紀錄沒存檔');

console.log('\n' + '='.repeat(46));
console.log(errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過');
if (warns.length) console.log(`⚠️  ${warns.length} 個提醒`);
process.exit(errs.length ? 1 : 0);
