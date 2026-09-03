/* 複習排程、舊紀錄遷移、統計計算 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const D = require('path').join(__dirname, '..') + require('path').sep;
const errs = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const OK = m => console.log('  ✓ ' + m);

const rawHtml = fs.readFileSync(D + 'index.html', 'utf8')
  .replace(/<link rel="stylesheet" href="css\/style.css">/,
    '<style>' + fs.readFileSync(D + 'css/style.css', 'utf8') + '</style>')
  .replace(/<script src="([^"]+)"><\/script>/g,
    (_, p) => '<script>' + fs.readFileSync(D + p, 'utf8') + '</script>');

/** 開一個新的 app 實例，可預先塞入 localStorage 內容 */
function boot(seed) {
  const dom = new JSDOM(rawHtml, { url: 'https://x.test/', runScripts: 'outside-only' });
  if (seed) for (const k in seed) dom.window.localStorage.setItem(k, JSON.stringify(seed[k]));
  dom.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
  dom.window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  dom.window.eval(rawHtml.match(/<script>([\s\S]*?)<\/script>/g)
    .map(s => s.replace(/^<script>|<\/script>$/g, '')).join('\n;\n'));
  return dom.window;
}
const day = off => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};

console.log('\n=== 1. 舊版紀錄遷移（v1 → v2） ===');
{
  const w = boot({
    'n2app.progress.v1': {
      marks: { 'v:1': 'known', 'v:2': 'weak' },
      log: { [day(-1)]: { n: 10, ok: 7 } },
      wrong: { 'v:2': 3 },
      seen: { 'v:1': 5, 'v:2': 4, 'g:9': 2 }
    }
  });
  const p = w.N2.progress;
  p.v === 2 ? OK('版本升到 v2') : E('版本沒升級: ' + p.v);
  Object.keys(p.items).length === 3
    ? OK('三個舊項目都建了履歷') : E('items 數: ' + Object.keys(p.items).length);
  p.items['v:2'].a === 4 && p.items['v:2'].m === 3
    ? OK('舊的 seen/wrong 轉成 attempts/misses（4 次 3 錯）')
    : E('轉換錯誤: ' + JSON.stringify(p.items['v:2']));
  p.items['v:1'].box === 2 ? OK('標記「已掌握」的起始間隔較長（box 2）')
                           : E('box: ' + p.items['v:1'].box);
  (p.marks['v:1'] === 'known' && p.log[day(-1)].n === 10 && p.seen['v:1'] === 5)
    ? OK('原有的 marks / log / seen 完全保留，沒有資料遺失') : E('舊欄位被動到了');
  p.items['v:1'].due === day(0) ? OK('舊項目一律設為今天到期，排程從現在開始')
                                : E('due: ' + p.items['v:1'].due);
  // 再開一次不應該重跑
  const w2 = boot({ 'n2app.progress.v1': p });
  JSON.stringify(w2.N2.progress.items) === JSON.stringify(p.items)
    ? OK('重複開啟不會重跑遷移') : E('遷移不是冪等的');
}

console.log('\n=== 2. Leitner 間隔遞增 ===');
{
  const w = boot();
  const N = w.N2, K = 'v:1';
  const seq = [];
  for (let i = 0; i < 6; i++) { const it = N.review(K, true); seq.push(N.INTERVALS[it.box]); }
  JSON.stringify(seq) === JSON.stringify([2, 4, 7, 14, 30, 30])
    ? OK('連續答對，間隔 ' + seq.join('→') + ' 天後封頂')
    : E('間隔序列: ' + seq.join(','));
  const it = N.review(K, false);
  (it.box === 0 && it.s === 0 && N.INTERVALS[it.box] === 1)
    ? OK('答錯直接掉回第 1 格（明天再考）') : E('答錯後: ' + JSON.stringify(it));
  it.a === 7 && it.m === 1
    ? OK('累計 7 次作答、1 次答錯') : E('計數: a=' + it.a + ' m=' + it.m);
  const it2 = N.review(K, true);
  it2.due === day(2) ? OK('到期日 = 今天 + 間隔（' + it2.due + '）') : E('due: ' + it2.due);
}

console.log('\n=== 3. 錯誤次數不再被答對抹掉 ===');
{
  const w = boot();
  const N = w.N2, K = 'v:5';
  for (let i = 0; i < 5; i++) { N.logAnswer(K, false, 'mc'); N.logAnswer(K, true, 'mc'); }
  const old = N.progress.wrong[K] || 0;
  const it = N.getItem(K);
  (it.a === 10 && it.m === 5)
    ? OK(`累計履歷保留完整：10 次作答 5 次錯（舊的 wrong 計數是 ${old}）`)
    : E('履歷: ' + JSON.stringify(it));
  const lee = N.leeches(w.Stats.allItems());
  lee.some(l => l.item.kind === 'v' && l.item.id === 5)
    ? OK('錯一半的項目會被列為頑固項目') : E('頑固項目沒抓到它');
}

console.log('\n=== 4. 到期佇列 ===');
{
  const w = boot();
  const N = w.N2;
  const all = w.Stats.allItems();
  let q = N.reviewQueue(all);
  (q.due.length === 0 && q.newItems.length === all.length)
    ? OK(`全新狀態：0 項到期、${q.newItems.length} 項沒碰過`)
    : E(`due=${q.due.length} new=${q.newItems.length}`);

  // 手動造出三種狀態
  N.progress.items['v:1'] = { a: 3, m: 2, s: 0, last: day(-9), due: day(-4), box: 0 };
  N.progress.items['v:2'] = { a: 3, m: 0, s: 3, last: day(-1), due: day(0), box: 2 };
  N.progress.items['v:3'] = { a: 3, m: 0, s: 3, last: day(0), due: day(+5), box: 3 };
  q = N.reviewQueue(all);
  const ids = q.due.filter(x => x.kind === 'v').map(x => x.id);
  (ids.includes(1) && ids.includes(2) && !ids.includes(3))
    ? OK('逾期與今天到期的會進佇列，未到期的不會') : E('佇列: ' + ids);
  q.due[0].kind === 'v' && q.due[0].id === 1
    ? OK('逾期最久的排最前面（逾期 ' + q.due[0]._over + ' 天）')
    : E('排序錯誤，第一個是 ' + q.due[0].kind + q.due[0].id);
  !q.newItems.some(x => x.kind === 'v' && [1, 2, 3].includes(x.id))
    ? OK('練過的不會再算成「沒碰過」') : E('newItems 混進了練過的項目');
}

console.log('\n=== 5. 題型統計 ===');
{
  const w = boot();
  const N = w.N2;
  for (let i = 0; i < 10; i++) N.logAnswer('v:' + (i + 1), i < 9, 'mc');    // 90%
  for (let i = 0; i < 10; i++) N.logAnswer('v:' + (i + 20), i < 4, 'fill'); // 40%
  const t = N.progress.types;
  (t.mc.n === 10 && t.mc.ok === 9 && t.fill.n === 10 && t.fill.ok === 4)
    ? OK('四選一 9/10、填空 4/10 各自記錄') : E('題型統計: ' + JSON.stringify(t));
  const d = N.progress.log[day(0)];
  (d.byType.mc.n === 10 && d.byType.fill.n === 10)
    ? OK('當日紀錄也有分題型') : E('當日題型: ' + JSON.stringify(d.byType));
  d.n === 20 && d.ok === 13 ? OK('當日總計 13/20') : E('當日總計: ' + d.n + '/' + d.ok);
}

console.log('\n=== 6. 字卡自評計入排程 ===');
{
  const w = boot();
  const N = w.N2;
  N.logCard('g:7', true);
  const it = N.getItem('g:7');
  (it.a === 1 && it.due === day(2)) ? OK('字卡按「已掌握」→ 2 天後再出現')
                                    : E('字卡排程: ' + JSON.stringify(it));
  N.logCard('g:7', false);
  N.getItem('g:7').due === day(1) ? OK('字卡按「再看一次」→ 明天再出現')
                                  : E('due: ' + N.getItem('g:7').due);
  N.progress.types.card.n === 2 ? OK('字卡自評獨立計數，不混進測驗正確率')
                                : E('card 計數錯誤');
  const t = w.Stats.recentDays(1)[0];
  t.n === 0 ? OK('字卡不計入每日作答題數（只有測驗才算）') : E('字卡被算進每日題數了');
}

console.log('\n=== 7. 趨勢計算 ===');
{
  const w = boot();
  const N = w.N2;
  N.progress.log[day(-10)] = { n: 20, ok: 10 };   // 50%
  N.progress.log[day(-3)] = { n: 20, ok: 18 };    // 90%
  const days = w.Stats.recentDays(30);
  days.length === 30 ? OK('取到 30 天資料') : E('天數: ' + days.length);
  const d10 = days.find(x => x.k === day(-10)), d3 = days.find(x => x.k === day(-3));
  (d10.pct === 50 && d3.pct === 90) ? OK('每日正確率換算正確（50% → 90%）')
                                    : E(`${d10.pct} / ${d3.pct}`);
  days.filter(x => x.n === 0).length === 28
    ? OK('沒練的日子補 0，趨勢線只畫有練的點') : E('空白天數不對');
}

console.log('\n=== 8. 首頁與統計頁實際渲染 ===');
{
  const dom = new JSDOM(rawHtml, { url: 'https://x.test/', runScripts: 'dangerously',
    pretendToBeVisual: true });
  const w = dom.window, doc = w.document, app = doc.getElementById('app');
  const click = s => {
    const e = doc.querySelector(s);
    if (!e) { E('找不到 ' + s); return null; }
    e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return e;
  };
  // 造資料：3 項逾期、一批作答紀錄
  const N = w.N2;
  N.progress.items['v:1'] = { a: 5, m: 4, s: 0, last: day(-9), due: day(-4), box: 0 };
  N.progress.items['v:2'] = { a: 4, m: 3, s: 0, last: day(-6), due: day(-2), box: 0 };
  N.progress.items['g:3'] = { a: 6, m: 3, s: 0, last: day(-3), due: day(0), box: 1 };
  N.progress.log[day(-8)] = { n: 20, ok: 10 };
  N.progress.log[day(-1)] = { n: 20, ok: 18 };
  N.progress.types = { mc: { n: 30, ok: 27 }, fill: { n: 20, ok: 8 } };
  N.saveProgress();

  click('[data-go="home"]');
  const planN = app.querySelector('.plan-n');
  planN && planN.textContent === '3' ? OK('首頁顯示「3 項到期」') : E('首頁到期數: ' + (planN && planN.textContent));
  app.querySelectorAll('.plan-item').length === 3 ? OK('首頁列出 3 個待複習項目')
                                                  : E('列出 ' + app.querySelectorAll('.plan-item').length + ' 項');
  /逾期 4 天/.test(app.textContent) ? OK('顯示逾期天數') : E('沒有逾期天數');

  click('[data-go="stats"]');
  app.querySelector('svg.trend') ? OK('趨勢圖有畫出來') : E('沒有趨勢圖 SVG');
  app.querySelectorAll('svg.trend circle').length === 2
    ? OK('趨勢圖只在有練的兩天畫點') : E('點數: ' + app.querySelectorAll('svg.trend circle').length);
  /▲ 進步|▼ 退步|持平/.test(app.textContent) ? OK('有進步／退步的比較') : E('沒有趨勢比較');
  /四選一/.test(app.textContent) && /填空/.test(app.textContent)
    ? OK('題型正確率有拆開顯示') : E('沒有題型拆解');
  /90%/.test(app.textContent) && /40%/.test(app.textContent)
    ? OK('四選一 90%、填空 40% 計算正確') : E('題型百分比不對');
  const lee = app.textContent.match(/錯 \d+\/\d+/g);
  lee && lee.length >= 2 ? OK('頑固項目列出 ' + lee.length + ' 項（' + lee.join('、') + '）')
                         : E('頑固項目沒列出來');

  // 一鍵複習
  click('[data-start="review-cards"]');
  app.querySelector('.flash') ? OK('「用字卡複習」能開起來') : E('字卡沒開');
  const cnt = app.querySelector('.deck-top .muted');
  cnt && cnt.textContent.trim() === '1 / 2'
    ? OK('字卡只帶到期的 2 個單字') : E('字卡張數: ' + (cnt && cnt.textContent));
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
