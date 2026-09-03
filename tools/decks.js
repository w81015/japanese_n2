/* 題庫：資料完整性、紀錄隔離、依題庫決定可出題型 */
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
const dom = new JSDOM(rawHtml, { url: 'https://x.test/', runScripts: 'dangerously',
  pretendToBeVisual: true });
const { window } = dom, doc = window.document, app = doc.getElementById('app');
window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
const { N2, Quiz, Cards, Decks } = window;
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
const KANJI = /[一-鿿]/;

console.log('\n=== 1. 四個題庫都在 ===');
{
  const all = Decks.all();
  console.log('  ' + all.map(d => `${d.name}(${d.id})=${d.count}`).join('  '));
  all.length === 4 ? OK('共 4 個題庫') : E('題庫數: ' + all.length);
  const ids = all.map(d => d.id).join(',');
  ids === 'v,vl,g,gl' ? OK('id 依序 v, vl, g, gl') : E('id: ' + ids);
  Decks.get('v').count === 122 && Decks.get('g').count === 82
    ? OK('原本的 122 單字／82 文法沒被動到') : E('原有題庫數量變了');
  Decks.get('vl').count > 1300 ? OK(`單字表 ${Decks.get('vl').count} 字`) : E('單字表太少');
  Decks.get('gl').count > 250 ? OK(`文法表 ${Decks.get('gl').count} 條`) : E('文法表太少');
  Decks.kindOf('vl') === 'v' && Decks.kindOf('gl') === 'g'
    ? OK('新題庫的種類判定正確') : E('kindOf 錯誤');
}

console.log('\n=== 2. 新題庫的資料完整性 ===');
{
  const vl = Decks.items('vl');
  let bad = 0;
  vl.forEach(x => {
    if (!x.word || !x.reading || !x.zh || !x.pos) bad++;
    if (!/^[ぁ-んァ-ヶー・]+$/.test(x.reading)) { E(`#${x.id} 讀音不是假名: ${x.reading}`); bad++; }
    // 注音去掉後要等於原詞
    const strip = String(x.wordRuby || x.word).replace(/\{[^}]*\}/g, '');
    if (strip !== x.word) { E(`#${x.id} 注音還原不符: ${x.wordRuby}`); bad++; }
  });
  bad === 0 ? OK(`單字表 ${vl.length} 筆欄位齊全、讀音皆假名、注音可還原`) : E(`${bad} 筆有問題`);

  const gl = Decks.items('gl');
  bad = 0;
  gl.forEach(x => {
    if (!x.pattern || !x.meaning || !x.ex || !x.exZh) bad++;
    const s = x.ex;
    if (s.split('{').length !== s.split('}').length) { E(`#${x.id} 括號不對稱`); bad++; }
    for (const m of s.matchAll(/\{([^}]*)\}/g)) {
      if (!/^[ぁ-んァ-ヶー]+$/.test(m[1])) { E(`#${x.id} 注音非假名: ${m[1]}`); bad++; }
    }
    for (const m of s.matchAll(/(.)\{/g)) {
      if (!/[0-9一-鿿々]/.test(m[1])) { E(`#${x.id} 注音底字非漢字: ${m[1]}`); bad++; }
    }
  });
  bad === 0 ? OK(`文法表 ${gl.length} 條欄位齊全、振假名格式正確`) : E(`${bad} 條有問題`);
  const withRuby = gl.filter(x => x.ex.includes('{')).length;
  withRuby > gl.length * 0.9
    ? OK(`${withRuby}/${gl.length} 條例句有振假名`) : E('振假名太少: ' + withRuby);
}

console.log('\n=== 3. 學習紀錄以題庫隔離 ===');
{
  N2.logAnswer('v:1', true, 'mc');
  N2.logAnswer('vl:1', false, 'mc');
  const a = N2.getItem('v:1'), b = N2.getItem('vl:1');
  (a.a === 1 && a.m === 0 && b.a === 1 && b.m === 1)
    ? OK('精選單字 #1 與單字表 #1 是兩筆獨立紀錄') : E('紀錄互相干擾');
  N2.toggleMark('vl', 5, 'weak');
  (N2.getMark('vl', 5) === 'weak' && N2.getMark('v', 5) === '')
    ? OK('★ 標記也各自獨立') : E('標記互相干擾');
  Object.keys(N2.progress.items).some(k => k.startsWith('vl:'))
    ? OK('新題庫用 vl: 前綴，不會覆蓋舊的 v:') : E('命名空間不對');
}

console.log('\n=== 4. 可出題型依資料而定 ===');
{
  const t = id => Quiz.typesFor(id).join(',');
  console.log('  v  →', t('v'));
  console.log('  vl →', t('vl'));
  console.log('  g  →', t('g'));
  console.log('  gl →', t('gl'));
  Quiz.typesFor('v').includes('sort') ? OK('精選單字有排序（例句有文節）') : E('v 少了排序');
  !Quiz.typesFor('vl').includes('sort') && !Quiz.typesFor('vl').includes('cloze')
    ? OK('單字表沒有例句，正確地排除挖空與排序') : E('vl 不該有挖空／排序');
  Quiz.typesFor('vl').includes('reading') && Quiz.typesFor('vl').includes('writing')
    ? OK('單字表仍能出漢字読み與表記') : E('vl 缺漢字題');
  Quiz.typesFor('gl').includes('cloze') && !Quiz.typesFor('gl').includes('sort')
    ? OK('文法表有例句可挖空，但沒有文節所以不排序') : E('gl 題型不對');
  !Quiz.typesFor('gl').includes('reading')
    ? OK('文法題庫不出漢字読み') : E('gl 不該有漢字読み');
}

console.log('\n=== 5. 單字表出題品質 ===');
{
  ['reading', 'writing', 'mc'].forEach(type => {
    Quiz.cfg.scope = 'vl'; Quiz.cfg.types = [type]; Quiz.cfg.count = 60;
    Quiz.cfg.range = '全部'; Quiz.cfg.customIds = null; Quiz.cfg.blocks = [];
    if (!Quiz.start()) { E(`${type} 開不起來`); return; }
    let n = 0, wrong = 0, offType = 0;
    while (true) {
      const q = Quiz.current(); if (!q) break;
      n++;
      if (q.type !== type) offType++;
      else {
        if (q.options.length !== 4) { E(`${type} 選項數 ${q.options.length}`); wrong++; }
        if (new Set(q.options).size !== 4) { E(`${type} 選項重複`); wrong++; }
        if (q.options.indexOf(q.correct) < 0) { E(`${type} 正解不在選項`); wrong++; }
        if (q.deck !== 'vl') { E(`${type} 題目沒標題庫`); wrong++; }
        if (type === 'reading' && !/^[ぁ-んァ-ヶー]+$/.test(q.correct)) {
          E(`漢字読み正解不是假名: ${q.correct}`); wrong++;
        }
        if (type === 'writing' && !KANJI.test(q.correct)) {
          E(`表記正解沒有漢字: ${q.correct}`); wrong++;
        }
      }
      Quiz.next();
    }
    wrong === 0
      ? OK(`${type}: ${n} 題全部合格（改出別題 ${offType} 題）`)
      : E(`${type} 有 ${wrong} 個問題`);
  });
}

console.log('\n=== 6. 文法表出題品質 ===');
{
  Quiz.cfg.scope = 'gl'; Quiz.cfg.types = ['cloze', 'fill']; Quiz.cfg.count = 60;
  Quiz.cfg.blocks = []; Quiz.cfg.customIds = null;
  Quiz.start();
  let n = 0, bad = 0;
  while (true) {
    const q = Quiz.current(); if (!q) break;
    n++;
    if (q.deck !== 'gl') { E('題目沒標成 gl'); bad++; }
    if (q.type === 'cloze' || q.type === 'fill') {
      if (!/class="blank"/.test(q.stem)) { E(`#${q.id} 沒有空格`); bad++; }
      const plainStem = q.stem.replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, '');
      if (q.correct && plainStem.includes(q.correct)) { E(`#${q.id} 題幹洩漏答案`); bad++; }
    }
    Quiz.next();
  }
  bad === 0 ? OK(`${n} 題挖空／填空都有空格且不洩漏答案`) : E(`${bad} 個問題`);
}

console.log('\n=== 7. 介面：題庫切換 ===');
{
  click('[data-go="vocab"]');
  const chips = [...app.querySelectorAll('[data-deck]')].map(b => b.dataset.deck);
  JSON.stringify(chips) === JSON.stringify(['v', 'vl'])
    ? OK('單字頁有兩個題庫可切') : E('題庫鈕: ' + chips);
  const first = () => app.querySelector('.entry .jp').textContent;
  const before = first();
  click('[data-deck="vl"]');
  app.querySelector('[data-deck="vl"]').getAttribute('aria-pressed') === 'true'
    ? OK('切到單字表') : E('切換沒生效');
  app.querySelector('#v-count').textContent.includes(String(Decks.get('vl').count))
    ? OK('計數列顯示 ' + app.querySelector('#v-count').textContent) : E('計數沒更新');
  first() !== before ? OK(`內容換了（${before} → ${first()}）`) : E('內容沒換');
  app.querySelector('.no-ex') ? OK('明確標示這個題庫沒有例句') : E('沒提示缺例句');

  // 這一頁的 5 個要正確帶進字卡
  const ids = [...app.querySelectorAll('.entry')].map(e => e.id);
  ids[0].startsWith('vl') ? OK('條目 id 帶題庫前綴，避免跟精選撞號') : E('id: ' + ids[0]);
  click('#batch-cards');
  const deck = Cards.deck();
  (deck.kind === 'vl' && deck.items.length === 5)
    ? OK('字卡帶的是單字表的這 5 個') : E(`字卡: ${deck.kind} ${deck.items.length} 張`);

  click('[data-go="grammar"]');
  const gchips = [...app.querySelectorAll('[data-deck]')].map(b => b.dataset.deck);
  JSON.stringify(gchips) === JSON.stringify(['g', 'gl'])
    ? OK('文法頁也有兩個題庫') : E('文法題庫鈕: ' + gchips);
  click('[data-deck="gl"]');
  app.querySelectorAll('.entry').length === 5 ? OK('文法表也能瀏覽') : E('文法表列不出來');
}

console.log('\n=== 8. 介面：測驗的題庫選單 ===');
{
  click('[data-go="quiz"]');
  const scopes = [...app.querySelectorAll('[data-set="scope"]')].map(b => b.dataset.val);
  JSON.stringify(scopes) === JSON.stringify(['v', 'vl', 'g', 'gl'])
    ? OK('測驗可選四個題庫') : E('選項: ' + scopes);
  click('[data-set="scope"][data-val="vl"]');
  const types = [...app.querySelectorAll('[data-set="types"]')].map(b => b.dataset.val);
  (types.includes('reading') && !types.includes('sort') && !types.includes('cloze'))
    ? OK('選單字表時只列得出來的題型：' + types.join('、')) : E('題型: ' + types);
  app.textContent.includes('沒有例句')
    ? OK('有說明為什麼題型變少') : E('沒有說明');

  // 先在精選單字把「漢字読み」勾起來
  click('[data-set="scope"][data-val="v"]');
  const rBtn = () => doc.querySelector('[data-set="types"][data-val="reading"]');
  if (rBtn().getAttribute('aria-pressed') !== 'true') click(rBtn());
  rBtn().getAttribute('aria-pressed') === 'true' ? OK('在精選單字勾選漢字読み')
                                                 : E('勾不起來');
  // 切到沒有這個題型的題庫，再切回來
  click('[data-set="scope"][data-val="gl"]');
  const gt = [...app.querySelectorAll('[data-set="types"]')].map(b => b.dataset.val);
  !gt.includes('reading') ? OK('文法表不列漢字読み') : E('gl 列了漢字読み');
  click('[data-set="scope"][data-val="v"]');
  rBtn() && rBtn().getAttribute('aria-pressed') === 'true'
    ? OK('切回精選單字後，原本勾的漢字読み還在（沒有被清掉）')
    : E('勾選沒保留');

  // 編號分組：題庫大的時候用百位分頁，不會一次塞 270 顆按鈕
  click('[data-set="scope"][data-val="vl"]');
  const pages = app.querySelectorAll('[data-blockpage]').length;
  pages === Math.ceil(Decks.get('vl').count / 100)
    ? OK(`單字表有 ${pages} 個百位區間可跳`) : E('百位分頁數: ' + pages);
  const shown = app.querySelectorAll('.blk').length;
  shown === 20 ? OK('一次只顯示該區間的 20 組（1–100）') : E('顯示 ' + shown + ' 組');
  click('[data-blockpage="3"]');
  const lbl = app.querySelector('.blk').textContent;
  lbl === '301–305' ? OK('跳到第 4 區間，第一組是 301–305') : E('第一組: ' + lbl);
  click('[data-block="301"]');
  window.Quiz.validBlocks().indexOf(301) >= 0 ? OK('在該區間內可以選取分組')
                                              : E('選不起來');
  click('[data-blockpage="0"]');
  app.querySelector('[data-blockpage="3"] i')
    ? OK('回到第 1 區間，第 4 區間仍標示已選 1 組') : E('跨區間的選取沒有標示');
  click('[data-block="all"]');
}

console.log('\n=== 9. 統計把四個題庫一起算 ===');
{
  click('[data-go="stats"]');
  const txt = app.textContent;
  ['精選單字', '單字表', '精選文法', '文法表'].every(n => txt.includes(n))
    ? OK('掌握度列出四個題庫') : E('統計頁沒列全題庫');
  const all = window.Stats.allItems();
  all.length === Decks.all().reduce((a, d) => a + d.count, 0)
    ? OK(`複習池共 ${all.length} 項（四個題庫加總）`) : E('allItems 數量: ' + all.length);
  const keys = new Set(all.map(x => x.kind + ':' + x.id));
  keys.size === all.length ? OK('每一項的紀錄鍵都唯一，不會互撞') : E('鍵有重複');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
