/* 日檢問題1（漢字読み）與問題2（表記）的出題品質 */
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
const { N2, Quiz, VOCAB } = window;

const KANJI = /[一-鿿]/;
const KANA_ONLY = /^[ぁ-んー]+$/;
const SMALL = /[ゃゅょ]/;
const plain = h => h.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, '');
const underlined = h => (h.match(/<span class="ul">(.*?)<\/span>/) || [, ''])[1]
  .replace(/<[^>]*>/g, '');

/** 收集某題型對每個單字產生的題目 */
function collect(type) {
  Quiz.cfg.scope = 'v'; Quiz.cfg.types = [type];
  Quiz.cfg.count = VOCAB.length * 3; Quiz.cfg.range = '全部';
  Quiz.cfg.customIds = null; Quiz.cfg.blocks = [];
  Quiz.start();
  const map = new Map(); let fallback = 0;
  while (true) {
    const q = Quiz.current(); if (!q) break;
    if (q.type === type) { if (!map.has(q.id)) map.set(q.id, q); } else fallback++;
    Quiz.next();
  }
  return { map, fallback };
}

const kanjiWords = VOCAB.filter(v => KANJI.test(v.word));
console.log(`\n含漢字的單字共 ${kanjiWords.length} 個`);

console.log('\n=== 1. 資料欄位 ===');
{
  let bad = 0;
  kanjiWords.forEach(v => {
    const sent = N2.plain(v.ex);
    if (!v.qWord || !v.qKana) { E(`#${v.id} ${v.word} 缺 qWord/qKana`); bad++; return; }
    if (!sent.includes(v.qWord)) { E(`#${v.id} qWord「${v.qWord}」不在例句中`); bad++; }
    if (KANJI.test(v.qKana)) { E(`#${v.id} qKana 殘留漢字：${v.qKana}`); bad++; }
    if (!v.qWord.startsWith(v.qStem)) { E(`#${v.id} qWord 不是以語幹開頭`); bad++; }
    if (!v.wrongKanji || v.wrongKanji.length !== 3) { E(`#${v.id} 誘答漢字不足`); bad++; return; }
    if (new Set(v.wrongKanji).size !== 3) { E(`#${v.id} 誘答漢字重複`); bad++; }
    v.wrongKanji.forEach(w => {
      if (w === v.qStem) { E(`#${v.id} 誘答與正解相同：${w}`); bad++; }
      if (w.length !== v.qStem.length) { E(`#${v.id} 誘答字數不符：${w} vs ${v.qStem}`); bad++; }
      if (!KANJI.test(w)) { E(`#${v.id} 誘答不含漢字：${w}`); bad++; }
    });
  });
  if (!bad) OK(`${kanjiWords.length} 個單字的 qWord／qKana／3 個誘答漢字全部齊全且合法`);
  const nonKanji = VOCAB.filter(v => !KANJI.test(v.word));
  nonKanji.every(v => !v.qWord)
    ? OK(`${nonKanji.length} 個純假名／外來語沒有這兩種題（正確，它們沒有漢字可考）`)
    : E('純假名單字不該有 qWord');
}

console.log('\n=== 2. 漢字読み（問題1）===');
{
  const { map, fallback } = collect('reading');
  console.log(`  涵蓋 ${map.size} / ${kanjiWords.length} 個單字（湊不到誘答而改出別題：${fallback} 題）`);
  map.size >= kanjiWords.length - 2
    ? OK('幾乎每個含漢字的單字都能出題') : E(`涵蓋率太低：${map.size}`);
  let bad = 0;
  for (const [, q] of map) {
    const v = q.item;
    if (q.options.length !== 4) { E(`#${v.id} 選項不是 4 個`); bad++; }
    if (new Set(q.options).size !== 4) { E(`#${v.id} 選項重複：${q.options}`); bad++; }
    if (q.correct !== v.qKana) { E(`#${v.id} 正解不是該詞讀音`); bad++; }
    if (q.options.indexOf(q.correct) < 0) { E(`#${v.id} 正解不在選項中`); bad++; }
    // 每個選項都必須是合法假名，而且誘答一定要跟正解不同
    q.options.forEach(o => {
      if (!KANA_ONLY.test(o)) { E(`#${v.id} 選項不是純假名：${o}`); bad++; }
      if (/^[ゃゅょっん]/.test(o)) { E(`#${v.id} 選項開頭是小字或撥音：${o}`); bad++; }
      if (/[んっ][ゃゅょ]/.test(o)) { E(`#${v.id} 選項有不合法的假名組合：${o}`); bad++; }
    });
    // 題幹必須畫底線且顯示漢字，不能洩漏讀音
    const ul = underlined(q.stem);
    if (ul !== v.qWord) { E(`#${v.id} 底線標錯：「${ul}」應為「${v.qWord}」`); bad++; }
    if (!q.noFurigana) { E(`#${v.id} 沒有關掉振假名，等於送答案`); bad++; }
    if (plain(q.stem).includes(v.qKana)) { E(`#${v.id} 題幹洩漏讀音`); bad++; }
  }
  if (!bad) OK(`${map.size} 題全部合格：選項皆為合法假名、正解為該詞讀音、底線位置正確`);
}

console.log('\n=== 3. 表記（問題2）===');
{
  const { map, fallback } = collect('writing');
  console.log(`  涵蓋 ${map.size} / ${kanjiWords.length} 個單字（改出別題：${fallback} 題）`);
  map.size === kanjiWords.length ? OK('每個含漢字的單字都能出題') : E(`涵蓋率：${map.size}`);
  let bad = 0;
  for (const [, q] of map) {
    const v = q.item;
    if (q.options.length !== 4) { E(`#${v.id} 選項不是 4 個`); bad++; }
    if (new Set(q.options).size !== 4) { E(`#${v.id} 選項重複：${q.options}`); bad++; }
    if (q.correct !== v.qWord) { E(`#${v.id} 正解不是句中的形態`); bad++; }
    // 四個選項的送假名必須一致，否則光看字尾就能作答
    const okuri = v.qWord.slice(v.qStem.length);
    q.options.forEach(o => {
      if (!KANJI.test(o)) { E(`#${v.id} 選項沒有漢字：${o}`); bad++; }
      if (okuri && !o.endsWith(okuri)) { E(`#${v.id} 選項送假名不一致：${o}`); bad++; }
      if (o.length !== v.qWord.length) { E(`#${v.id} 選項長度不一：${o}`); bad++; }
    });
    // 題幹要把該詞換成假名，而且不能出現正解漢字
    const ul = underlined(q.stem);
    if (ul !== v.qKana) { E(`#${v.id} 底線處不是假名：「${ul}」`); bad++; }
    if (plain(q.stem).includes(v.qWord)) { E(`#${v.id} 題幹洩漏漢字`); bad++; }
  }
  if (!bad) OK(`${map.size} 題全部合格：四個選項送假名一致、題幹已改成假名且不洩漏答案`);
}

console.log('\n=== 4. 文法不會出這兩種題 ===');
{
  Quiz.cfg.scope = 'g'; Quiz.cfg.types = ['reading', 'writing'];
  Quiz.cfg.count = 20; Quiz.cfg.blocks = []; Quiz.cfg.customIds = null;
  Quiz.start();
  const types = new Set();
  while (true) {
    const q = Quiz.current(); if (!q) break;
    types.add(q.type); Quiz.next();
  }
  (!types.has('reading') && !types.has('writing'))
    ? OK(`文法自動改出其他題型（實際出了：${[...types].join('、')}）`)
    : E('文法竟然出了漢字読み／表記');
}

console.log('\n=== 5. 實際作答一輪 ===');
{
  const click = s => {
    const e = typeof s === 'string' ? doc.querySelector(s) : s;
    if (!e) { E('找不到 ' + s); return null; }
    e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
  };
  click('[data-go="quiz"]');
  click('[data-set="scope"][data-val="v"]');   // 上一段把範圍切成文法了
  doc.querySelector('[data-set="types"][data-val="reading"]')
    ? OK('切回單字後，設定頁出現「漢字読み／表記」的題型按鈕')
    : E('單字範圍下看不到新題型按鈕');
  ['reading', 'writing'].forEach(t => {
    const b = doc.querySelector(`[data-set="types"][data-val="${t}"]`);
    if (!b) { E(`設定頁沒有「${t}」的題型按鈕`); return; }
    if (b.getAttribute('aria-pressed') !== 'true') click(b);
  });
  ['cloze', 'mc', 'fill', 'sort'].forEach(t => {
    const b = doc.querySelector(`[data-set="types"][data-val="${t}"]`);
    if (b && b.getAttribute('aria-pressed') === 'true') click(b);
  });
  click('[data-set="count"][data-val="10"]');
  click('[data-act="quiz-start"]');
  const seen = new Set(); let n = 0;
  for (let i = 0; i < 10; i++) {
    const el = app.querySelector('.q-type'); if (!el) break;
    seen.add(el.textContent); n++;
    const cur = Quiz.current();
    if ((cur.type === 'reading' || cur.type === 'writing') && !app.querySelector('.q-noruby')) {
      E(`第 ${n} 題（${cur.typeLabel}）題幹沒有套用「不顯示振假名」`);
    }
    click('.choice');
    if (!app.querySelector('[data-act="next-q"]')) { E(`第 ${n} 題沒有回饋`); break; }
    click('[data-act="next-q"]');
  }
  n === 10 ? OK(`10 題跑完，題型：${[...seen].join('、')}`) : E(`只跑了 ${n} 題`);
  app.querySelector('.score') ? OK('進到結果頁') : E('沒進結果頁');
  const t = N2.progress.types;
  (t.reading || t.writing) ? OK('統計有分別記錄這兩種題型') : E('統計沒記到新題型');
}

console.log('\n=== 6. 字卡的漢字↔假名模式 ===');
{
  const click = s => {
    const e = typeof s === 'string' ? doc.querySelector(s) : s;
    if (!e) { E('找不到 ' + s); return null; }
    e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
  };
  click('[data-go="vocab"]');
  click('[data-start="cards-vocab"]');
  const dirs = [...app.querySelectorAll('[data-dir]')].map(b => b.dataset.dir);
  JSON.stringify(dirs) === JSON.stringify(['kanji', 'kana', 'jp2zh', 'zh2jp'])
    ? OK('字卡有四種方向：' + dirs.join('、')) : E('字卡方向: ' + dirs);
  click('[data-dir="kanji"]');
  let front = app.querySelector('.flash .front');
  (KANJI.test(front.textContent) && !front.querySelector('rt') ||
   window.getComputedStyle(front.querySelector('rt') || front).display === 'none')
    ? OK('「漢字 → 假名」正面只有漢字，不給注音') : E('正面洩漏了讀音');
  click('#flash');
  app.querySelector('.flash .back') ? OK('翻面後顯示讀音與中文') : E('翻不了面');
  click('[data-dir="kana"]');
  front = app.querySelector('.flash .front');
  (!KANJI.test(front.textContent) && /^[ぁ-んァ-ヶー]+$/.test(front.textContent.trim()))
    ? OK('「假名 → 漢字」正面只有假名：' + front.textContent.trim())
    : E('假名模式正面內容有問題：' + front.textContent);
  app.querySelector('.flash .back') === null
    ? OK('切換方向後自動翻回正面') : E('切換方向沒有翻回正面');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
