/* 學習日誌：使用日期、每日／每週統計、當天做了哪些與對錯明細 */
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

function boot() {
  const dom = new JSDOM(rawHtml, { url: 'https://x.test/', runScripts: 'dangerously',
    pretendToBeVisual: true });
  dom.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
  dom.window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  return dom.window;
}
const day = off => {
  const d = new Date(); d.setDate(d.getDate() + off);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
};

console.log('\n=== 1. 作答會留下逐項明細 ===');
const w = boot();
{
  const N = w.N2;
  N.logAnswer('v:1', true, 'reading');
  N.logAnswer('v:1', false, 'writing');
  N.logAnswer('v:2', true, 'cloze');
  N.logCard('v:3', true);
  N.logCard('v:3', false);
  N.logCard('g:7', true);

  const s = N.dayStat(day(0));
  s.n === 3 && s.ok === 2 ? OK('測驗 3 題、答對 2 題') : E(`測驗 ${s.ok}/${s.n}`);
  (s.items['v:1'].n === 2 && s.items['v:1'].ok === 1)
    ? OK('v:1 記到「考了 2 次、對 1 次」') : E('v:1 明細: ' + JSON.stringify(s.items['v:1']));
  s.items['v:2'].ok === 1 ? OK('v:2 記到答對') : E('v:2 明細錯');
  (s.cards['v:3'].n === 2 && s.cards['v:3'].ok === 1)
    ? OK('字卡 v:3 記到「看了 2 次、按過 1 次已掌握」')
    : E('字卡明細: ' + JSON.stringify(s.cards['v:3']));
  s.cardCount === 2 && s.cardReps === 3
    ? OK('字卡共 2 個項目、3 張') : E(`字卡 ${s.cardCount} 項 ${s.cardReps} 張`);
  (s.byType.reading.n === 1 && s.byType.writing.n === 1 && s.byType.cloze.n === 1)
    ? OK('題型分別記錄') : E('題型: ' + JSON.stringify(s.byType));
  const fresh = new Set(s.fresh);
  (fresh.has('v:1') && fresh.has('v:2') && fresh.has('v:3') && fresh.has('g:7') && fresh.size === 4)
    ? OK('4 個都標成「第一次碰到」') : E('新學: ' + s.fresh);
}

console.log('\n=== 2. 只翻字卡的日子也算有學習 ===');
{
  const w2 = boot();
  const N = w2.N2;
  N.logCard('v:5', true);
  const s = N.dayStat(day(0));
  (s.n === 0 && s.cardReps === 1) ? OK('當天沒作答，只有 1 張字卡') : E('資料不對');
  N.dayUsed(day(0)) ? OK('dayUsed 判定為「有學習」') : E('沒被算成學習日');
  N.streak() === 1 ? OK('連續天數算進去了') : E('streak = ' + N.streak());
  N.usedDays().includes(day(0)) ? OK('出現在使用日期清單') : E('沒進使用日期清單');
}

console.log('\n=== 3. 使用日期清單（由新到舊，沒學的不列） ===');
{
  const N = w.N2;
  N.progress.log[day(-2)] = { n: 5, ok: 4, items: { 'v:9': { n: 5, ok: 4 } } };
  N.progress.log[day(-5)] = { n: 0, ok: 0 };                       // 空紀錄，不該算
  N.progress.log[day(-7)] = { n: 0, ok: 0, cards: { 'g:2': { n: 3, ok: 3 } } };
  N.saveProgress();
  const used = N.usedDays();
  const want = [day(0), day(-2), day(-7)];
  JSON.stringify(used) === JSON.stringify(want)
    ? OK(`列出 ${used.length} 天，由新到舊：${used.map(d => d.slice(5)).join(' > ')}`)
    : E('使用日期: ' + used);
  !used.includes(day(-5)) ? OK('n=0 且沒字卡的空日子被排除') : E('空日子被算進去了');
}

console.log('\n=== 4. 每週彙整 ===');
{
  const N = w.N2;
  const mon = N.weekStart(day(0));
  const d = N.parseDay(mon);
  d.getDay() === 1 ? OK(`週起算日是星期一（${mon}）`) : E('週起算不是星期一: ' + mon);
  ['2026-09-03', '2026-08-31', '2026-09-06'].forEach(k => {
    const s = N.weekStart(k);
    const wd = N.parseDay(s).getDay();
    if (wd !== 1) E(`${k} 的週起算算錯: ${s}`);
  });
  OK('跨月與週日的邊界都落在正確的星期一');

  const weeks = N.weekStats();
  weeks.length >= 1 ? OK(`彙整出 ${weeks.length} 週`) : E('沒有週資料');
  const total = weeks.reduce((a, x) => a + x.n, 0);
  const dayTotal = N.usedDays().reduce((a, k) => a + N.dayStat(k).n, 0);
  total === dayTotal ? OK(`每週題數加總 ${total} 等於每日加總`) : E(`${total} ≠ ${dayTotal}`);
  const merged = weeks.find(x => x.days.length > 1);
  if (merged) {
    const sum = merged.days.reduce((a, x) => a + x.n, 0);
    merged.n === sum ? OK(`同一週的 ${merged.days.length} 天有合併（共 ${merged.n} 題）`)
                     : E('合併數字不對');
  } else OK('目前每週各只有一天，無需合併');
}

console.log('\n=== 5. 統計頁的日誌區塊 ===');
{
  const doc = w.document, app = doc.getElementById('app');
  const click = s => {
    const e = typeof s === 'string' ? doc.querySelector(s) : s;
    if (!e) { E('找不到 ' + s); return null; }
    e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return e;
  };
  click('[data-go="stats"]');
  app.textContent.includes('學習日誌') ? OK('統計頁有「學習日誌」') : E('沒有日誌區塊');
  const rows = app.querySelectorAll('.lg-entry');
  rows.length === 3 ? OK(`列出 3 天`) : E('列出 ' + rows.length + ' 列');
  app.textContent.includes('共 3 天有學習')
    ? OK('標題顯示總學習天數') : E('沒有總天數');

  // 預設收合
  app.querySelector('.lg-detail') === null ? OK('預設全部收合') : E('預設就展開了');

  // 展開今天
  click(`[data-logkey="${day(0)}"]`);
  const det = app.querySelector('.lg-detail');
  det ? OK('點一下展開明細') : E('展不開');
  const txt = det ? det.textContent : '';
  txt.includes('第一次碰到') ? OK('明細有「第一次碰到」') : E('缺新學區塊');
  txt.includes('字卡') ? OK('明細有字卡區塊') : E('缺字卡區塊');
  txt.includes('測驗') ? OK('明細有測驗區塊') : E('缺測驗區塊');
  txt.includes('2 對 / 1 錯') ? OK('顯示當天對錯：2 對 / 1 錯') : E('對錯摘要: ' + txt.slice(0, 80));

  const wrong = app.querySelectorAll('.lg-row.bad');
  wrong.length === 1 ? OK('答錯的項目被標紅（1 個）') : E('標紅數: ' + wrong.length);
  wrong[0] && wrong[0].textContent.includes('1/2')
    ? OK('錯的那筆顯示 1/2') : E('分數顯示: ' + (wrong[0] || {}).textContent);
  const good = [...app.querySelectorAll('.lg-row')].filter(r => !r.classList.contains('bad'));
  good.length === 1 ? OK('全對的項目正常顯示（1 個）') : E('全對數: ' + good.length);

  // 再點一次收合
  click(`[data-logkey="${day(0)}"]`);
  app.querySelector('.lg-detail') === null ? OK('再點一次收合') : E('收不起來');
}

console.log('\n=== 6. 每日／每週切換 ===');
{
  const doc = w.document, app = doc.getElementById('app');
  const click = s => {
    const e = doc.querySelector(s);
    if (!e) { E('找不到 ' + s); return null; }
    e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return e;
  };
  const pressed = () => [...app.querySelectorAll('[data-logview]')]
    .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);
  JSON.stringify(pressed()) === JSON.stringify(['每日']) ? OK('預設是每日') : E('預設: ' + pressed());
  click('[data-logview="week"]');
  JSON.stringify(pressed()) === JSON.stringify(['每週']) ? OK('可切到每週') : E('切換失敗');
  const rows = app.querySelectorAll('.lg-entry');
  rows.length === w.N2.weekStats().length
    ? OK(`每週檢視列出 ${rows.length} 週`) : E('週數: ' + rows.length);
  app.textContent.match(/\d+ 天/) ? OK('每週那列有標「幾天」') : E('沒有天數標示');
  const first = app.querySelector('.lg-entry .lg-date').textContent;
  /\d+\/\d+–\d+\/\d+/.test(first) ? OK('週標題是日期區間：' + first) : E('週標題: ' + first);

  click('.lg-head');
  const det = app.querySelector('.lg-detail');
  det ? OK('週也能展開') : E('週展不開');
  app.querySelector('.lg-week-days') ? OK('展開後列出該週的每一天') : E('沒有每日分列');

  click('[data-logview="day"]');
  app.querySelector('.lg-detail') === null ? OK('切換檢視時自動收合') : E('切換後仍展開');
}

console.log('\n=== 7. 熱力圖把字卡算進活動量 ===');
{
  const w3 = boot();
  const doc = w3.document, app = doc.getElementById('app');
  const click = s => {
    const e = doc.querySelector(s);
    e.dispatchEvent(new w3.MouseEvent('click', { bubbles: true })); return e;
  };
  for (let i = 0; i < 12; i++) w3.N2.logCard('v:' + (i + 1), true);
  click('[data-go="stats"]');
  const cells = app.querySelectorAll('.heat i');
  const todayCell = cells[cells.length - 1];
  todayCell.getAttribute('data-l') !== '0'
    ? OK('只翻字卡的日子熱力圖也會亮（等級 ' + todayCell.getAttribute('data-l') + '）')
    : E('字卡沒被算進活動量');
  todayCell.getAttribute('title').includes('字卡 12 張')
    ? OK('滑鼠提示寫出測驗與字卡數量') : E('提示: ' + todayCell.getAttribute('title'));
}

console.log('\n=== 8. 舊紀錄不會壞 ===');
{
  const dom = new JSDOM(rawHtml, { url: 'https://x.test/', runScripts: 'outside-only' });
  dom.window.localStorage.setItem('n2app.progress.v1', JSON.stringify({
    marks: {}, log: { '2026-08-20': { n: 10, ok: 7 } }, wrong: {}, seen: { 'v:1': 3 }
  }));
  dom.window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
  dom.window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  dom.window.eval(rawHtml.match(/<script>([\s\S]*?)<\/script>/g)
    .map(s => s.replace(/^<script>|<\/script>$/g, '')).join('\n;\n'));
  const N = dom.window.N2;
  const s = N.dayStat('2026-08-20');
  (s.n === 10 && s.ok === 7) ? OK('舊的每日總計仍讀得到') : E('舊資料讀取失敗');
  (Object.keys(s.items).length === 0 && s.cardReps === 0 && s.fresh.length === 0)
    ? OK('舊日子沒有明細，安全地當成空的') : E('舊資料產生了假明細');
  N.usedDays().includes('2026-08-20') ? OK('舊日子仍列在使用日期中') : E('舊日子不見了');
  const doc = dom.window.document;
  doc.querySelector('[data-go="stats"]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  doc.getElementById('app').textContent.includes('這天沒有明細紀錄') ||
  doc.getElementById('app').textContent.includes('學習日誌')
    ? OK('統計頁能正常渲染舊紀錄') : E('舊紀錄讓統計頁壞掉');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
