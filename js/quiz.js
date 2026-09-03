/* quiz.js — 四選一／填空／排序 */
(function () {
  'use strict';

  var BLOCK = 5;   // 編號分組大小：1–5、6–10、…

  var cfg = { scope: 'vocab',
              types: ['reading', 'writing', 'cloze', 'mc', 'fill', 'sort'], count: 15,
              range: '全部', customIds: null, customLabel: '',
              blocks: [] };   // 已選的組（存每組起始編號）；空陣列 = 全部
  var run = null;   // { qs:[], i:0, answers:[], answered:false }

  function maxId(scope) {
    var arr = (scope || cfg.scope) === 'grammar' ? GRAMMAR : VOCAB;
    return arr.reduce(function (m, x) { return x.id > m ? x.id : m; }, 0);
  }
  /** 目前範圍可切成哪些組 */
  function blockList(scope) {
    var hi = maxId(scope), out = [];
    for (var s = 1; s <= hi; s += BLOCK) out.push({ s: s, e: Math.min(s + BLOCK - 1, hi) });
    return out;
  }
  /** 丟掉超出目前範圍的選取（例如從單字切到文法） */
  function validBlocks() {
    var hi = maxId();
    return (cfg.blocks || []).filter(function (s) { return s >= 1 && s <= hi; })
      .sort(function (a, b) { return a - b; });
  }
  function inSelectedBlocks(id) {
    var sel = validBlocks();
    if (!sel.length) return true;                       // 沒選就是全部
    return sel.some(function (s) { return id >= s && id < s + BLOCK; });
  }

  // ---------- 文字正規化（填空判定） ----------
  function kataToHira(s) {
    return s.replace(/[ァ-ヶ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }
  function norm(s) {
    return kataToHira(String(s || ''))
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[\s　～~・"'’”「」（）()]/g, '')
      .toLowerCase();
  }

  // ---------- 題目產生 ----------
  function pool() {
    var items;
    if (cfg.scope === 'grammar') items = GRAMMAR.slice();
    else items = VOCAB.slice();
    var kind = cfg.scope === 'grammar' ? 'g' : 'v';
    items = items.filter(function (x) { return inSelectedBlocks(x.id); });
    if (cfg.range === '待加強') {
      items = items.filter(function (x) { return N2.getMark(kind, x.id) === 'weak'; });
    } else if (cfg.range === '常錯') {
      items = items.filter(function (x) { return N2.progress.wrong[kind + ':' + x.id]; });
    } else if (cfg.range === '未掌握') {
      items = items.filter(function (x) { return N2.getMark(kind, x.id) !== 'known'; });
    }
    if (cfg.customIds && cfg.customIds.length) {
      var set = {};
      cfg.customIds.forEach(function (i) { set[i] = 1; });
      items = items.filter(function (x) { return set[x.id]; });
    }
    return { kind: kind, items: items };
  }

  function distractors(all, item, field, n) {
    var out = [];
    var others = N2.shuffle(all.filter(function (x) { return x.id !== item.id; }));
    for (var i = 0; i < others.length && out.length < n; i++) {
      var val = field(others[i]);
      if (val && val !== field(item) && out.indexOf(val) < 0) out.push(val);
    }
    return out;
  }

  function makeMC(kind, item, all) {
    var variants;
    if (kind === 'v') {
      variants = [
        { label: '日 → 中', stem: N2.ruby(item.wordRuby), sub: '選出正確的中文意思',
          f: function (x) { return x.zh; } },
        { label: '中 → 日', stem: N2.esc(item.zh), sub: '選出對應的日文單字',
          f: function (x) { return x.word; }, jp: true },
        { label: '讀音', stem: N2.esc(item.word), sub: '選出正確的讀法',
          f: function (x) { return x.reading; } }
      ];
      if (!/[一-鿿]/.test(item.word)) variants.pop();  // 外來語不考讀音
    } else {
      variants = [
        { label: '文法 → 意思', stem: N2.esc(item.pattern), sub: '選出正確的中文意思',
          f: function (x) { return x.meaning; } },
        { label: '意思 → 文法', stem: N2.esc(item.meaning), sub: '選出對應的文法',
          f: function (x) { return x.pattern; }, jp: true },
        { label: '例句判斷', stem: N2.ruby(item.ex), sub: '這個句子用的是哪個文法？',
          f: function (x) { return x.pattern; }, jp: true }
      ];
    }
    var v = variants[Math.floor(Math.random() * variants.length)];
    var correct = v.f(item);
    var opts = N2.shuffle([correct].concat(distractors(all, item, v.f, 3)));
    return {
      type: 'mc', kind: kind, id: item.id, item: item,
      typeLabel: '四選一 · ' + v.label, stem: v.stem, sub: v.sub,
      options: opts, correct: correct, jpOptions: !!v.jp
    };
  }

  /**
   * 把例句挖空，回傳 { html, answer, accept }。
   * 單字挖掉目標詞（助詞留在空格外），文法挖掉該文法的字串。
   */
  function clozeStem(kind, item, blankHtml) {
    blankHtml = blankHtml || '<span class="blank">＿＿＿</span>';
    if (kind === 'v') {
      if (item.clozeIdx < 0) return null;
      var cs = N2.chunks(item.ex);
      return {
        html: cs.map(function (c, i) {
          return i === item.clozeIdx ? blankHtml + N2.esc(item.clozeTail || '') : N2.ruby(c);
        }).join(''),
        answer: item.clozeAnswer,
        accept: [item.clozeAnswer, item.clozeKana, item.word, item.reading]
      };
    }
    if (!item.cloze) return null;
    var cut = blankAnno(item.ex, item.cloze);
    if (!cut) return null;
    return {
      html: N2.ruby(cut.pre) + blankHtml + N2.ruby(cut.post),
      answer: item.cloze,
      accept: [item.cloze].concat(item.variants || [])
    };
  }

  /**
   * 在「標注過的例句」裡挖掉一段純文字，前後段都還保有振假名。
   * 做法是先算出 純文字索引 → 標注字串索引 的對照表再切開。
   */
  function blankAnno(anno, needle) {
    var plain = '', map = [], i = 0;
    while (i < anno.length) {
      var c = anno[i];
      if (c === '/') { i++; continue; }                       // 文節分隔
      if (c === '{') {                                        // 跳過注音
        while (i < anno.length && anno[i] !== '}') i++;
        i++; continue;
      }
      plain += c; map.push(i); i++;
    }
    var at = plain.indexOf(needle);
    if (at < 0) return null;
    var s = map[at];
    var last = at + needle.length - 1;
    var e = last < map.length ? map[last] + 1 : anno.length;
    // 被挖掉的最後一個字若帶注音，注音也要一起拿掉
    while (e < anno.length && anno[e] === '{') {
      while (e < anno.length && anno[e] !== '}') e++;
      e++;
    }
    return { pre: anno.slice(0, s), post: anno.slice(e) };
  }

  /** 取字尾的假名（用來挑「長得像」的誘答，例如都以「した」「する」結尾） */
  function tailOf(s) {
    var m = String(s || '').match(/[ぁ-んァ-ヶー]+$/);
    return m ? m[0] : '';
  }

  /** 兩個選項若互為子字串，會造成模稜兩可，不能同時出現 */
  function conflicts(a, b) {
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  /**
   * 日檢式挖空四選一：句中挖空，四個選項都是實際會出現在句中的形態。
   * 誘答優先挑「同詞性且字尾相同」的，讓選項看起來一致，逼你靠語意判斷。
   */
  function makeClozeMC(kind, item, all) {
    var st = clozeStem(kind, item);
    if (!st) return null;
    var correct = st.answer;
    var myTail = tailOf(correct);

    var valueOf = function (x) {
      return kind === 'v' ? x.clozeAnswer : x.cloze;
    };
    var pool = all.filter(function (x) {
      var v = valueOf(x);
      return x.id !== item.id && v && !conflicts(v, correct);
    });

    var tiers = kind === 'v'
      ? [
          function (x) { return x.pos === item.pos && tailOf(x.clozeAnswer) === myTail; },
          function (x) { return tailOf(x.clozeAnswer) === myTail; },  // 形態一致優先於詞性
          function (x) { return x.pos === item.pos; },
          function () { return true; }
        ]
      : [
          function (x) { return tailOf(x.cloze) === myTail && myTail; },
          function (x) { return Math.abs(x.cloze.length - correct.length) <= 2; },
          function () { return true; }
        ];

    var opts = [];
    for (var t = 0; t < tiers.length && opts.length < 3; t++) {
      var cand = N2.shuffle(pool.filter(tiers[t]));
      for (var i = 0; i < cand.length && opts.length < 3; i++) {
        var v = valueOf(cand[i]);
        if (opts.some(function (o) { return conflicts(o, v); })) continue;
        opts.push(v);
      }
    }
    if (opts.length < 3) return null;

    return {
      type: 'cloze', kind: kind, id: item.id, item: item,
      typeLabel: '挖空四選一',
      stem: st.html,
      sub: '＿＿＿に入る最もよいものを、一つえらびなさい。',
      options: N2.shuffle([correct].concat(opts)),
      correct: correct, jpOptions: true
    };
  }

  // ================= 日檢問題1：漢字読み =================
  // 誘答不是別的單字的讀音（那樣太好猜），而是把正解讀音做「典型的誤讀變形」：
  // 長音有無、促音有無、濁音清音、拗音有無 —— 跟真正的日檢一樣。
  var VOICED = {
    'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
    'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど',
    'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ'
  };
  var UNVOICED = {};
  Object.keys(VOICED).forEach(function (k) { UNVOICED[VOICED[k]] = k; });
  // 長音只會接在「お段」後面加う、「え段」後面加い。
  // 這兩串必須是單一字元（拗音的長音靠小字「ょ」代表，例如きょう）。
  var O_ROW = 'おこそとのほもよろごぞどぼぽょ';
  var E_ROW = 'えけせてねへめれげぜでべぺ';
  var SMALL = { 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ' };
  var I_ROW = 'きしちにひみりぎじびぴ';   // 拗音只接在い段後面

  /** 產生一批「聽起來很像但錯的」讀音 */
  function misreadings(r) {
    var out = [];
    var push = function (s) { if (s && s !== r && out.indexOf(s) < 0) out.push(s); };
    var i;

    // 1. 長音：有 → 拿掉；沒有 → 加上
    for (i = 1; i < r.length; i++) {
      if (r[i] === 'う' && O_ROW.indexOf(r[i - 1]) >= 0) push(r.slice(0, i) + r.slice(i + 1));
      if (r[i] === 'い' && E_ROW.indexOf(r[i - 1]) >= 0) push(r.slice(0, i) + r.slice(i + 1));
    }
    for (i = 0; i < r.length; i++) {
      if (O_ROW.indexOf(r[i]) >= 0 && r[i + 1] !== 'う') push(r.slice(0, i + 1) + 'う' + r.slice(i + 1));
      if (E_ROW.indexOf(r[i]) >= 0 && r[i + 1] !== 'い') push(r.slice(0, i + 1) + 'い' + r.slice(i + 1));
    }
    // 2. 促音：有 → 拿掉；沒有 → 在か・さ・た・ぱ行前插入
    if (r.indexOf('っ') >= 0) push(r.replace('っ', ''));
    for (i = 1; i < r.length; i++) {
      if ('かきくけこさしすせそたちつてとぱぴぷぺぽ'.indexOf(r[i]) >= 0 && r[i - 1] !== 'っ') {
        push(r.slice(0, i) + 'っ' + r.slice(i));
      }
    }
    // 3. 濁音 ↔ 清音
    for (i = 0; i < r.length; i++) {
      if (VOICED[r[i]]) push(r.slice(0, i) + VOICED[r[i]] + r.slice(i + 1));
      if (UNVOICED[r[i]]) push(r.slice(0, i) + UNVOICED[r[i]] + r.slice(i + 1));
    }
    // 4. 拗音：小字 → 大字；い段字後面多一個小字
    for (i = 0; i < r.length; i++) {
      if (SMALL[r[i]]) push(r.slice(0, i) + SMALL[r[i]] + r.slice(i + 1));
    }
    for (i = 0; i < r.length; i++) {
      if (I_ROW.indexOf(r[i]) >= 0 && !SMALL[r[i + 1]]) {
        push(r.slice(0, i + 1) + 'ょ' + r.slice(i + 1));
        push(r.slice(0, i + 1) + 'ゅ' + r.slice(i + 1));
      }
    }
    // 5. 撥音「ん」的有無 —— 例：いじ ↔ いんじ
    if (r.indexOf('ん') >= 0) push(r.replace('ん', ''));
    for (i = 1; i < r.length; i++) {
      // 不能插在小字前面（んょ 之類不是合法的假名組合）
      if (r[i] !== 'ん' && !SMALL[r[i]] && r[i - 1] !== 'ん' && r[i - 1] !== 'っ') {
        push(r.slice(0, i) + 'ん' + r.slice(i));
      }
    }
    return out;
  }

  /** 把例句中的目標詞畫底線（該詞本身不加振假名，否則等於送答案） */
  function underlineWord(item) {
    var cut = blankAnno(item.ex, item.qWord);
    if (!cut) return null;
    return N2.ruby(cut.pre) +
      '<span class="ul">' + N2.esc(item.qWord) + '</span>' +
      N2.ruby(cut.post);
  }

  function makeReading(kind, item) {
    if (kind !== 'v' || !item.qWord || !item.qKana) return null;
    var stem = underlineWord(item);
    if (!stem) return null;
    var opts = N2.sample(misreadings(item.qKana), 3);
    if (opts.length < 3) return null;
    return {
      type: 'reading', kind: kind, id: item.id, item: item,
      typeLabel: '漢字読み', stem: stem,
      sub: '＿＿の言葉の読み方として最もよいものを、一つえらびなさい。',
      options: N2.shuffle([item.qKana].concat(opts)),
      correct: item.qKana, jpOptions: true, noFurigana: true
    };
  }

  // ================= 日檢問題2：表記 =================
  function makeWriting(kind, item) {
    if (kind !== 'v' || !item.qWord || !item.wrongKanji || item.wrongKanji.length < 3) {
      return null;
    }
    var cut = blankAnno(item.ex, item.qWord);
    if (!cut) return null;
    // 句中的目標詞改成假名，選項則是各種漢字寫法
    var kana = item.qKana;
    var okuri = item.qWord.slice(item.qStem.length);   // 送假名，四個選項共用
    var opts = item.wrongKanji.slice(0, 3).map(function (k) { return k + okuri; });
    var correct = item.qWord;
    if (opts.indexOf(correct) >= 0) return null;
    return {
      type: 'writing', kind: kind, id: item.id, item: item,
      typeLabel: '表記', stem: N2.ruby(cut.pre) +
        '<span class="ul">' + N2.esc(kana) + '</span>' + N2.ruby(cut.post),
      sub: '＿＿の言葉を漢字で書くとき、最もよいものを、一つえらびなさい。',
      options: N2.shuffle([correct].concat(opts)),
      correct: correct, jpOptions: true, noFurigana: true
    };
  }

  function makeFill(kind, item) {
    var st = clozeStem(kind, item);
    if (!st) return null;
    var accept = st.accept.filter(function (a, i) {
      return a && st.accept.indexOf(a) === i;
    });
    return {
      type: 'fill', kind: kind, id: item.id, item: item,
      typeLabel: '填空', stem: st.html, sub: '輸入空格中該填的內容（可用假名）',
      accept: accept,
      hint: '提示：' + (kind === 'v'
        ? item.zh + (item.en ? '（' + item.en + '）' : '')
        : item.meaning),
      correct: accept[0]
    };
  }

  function makeSort(kind, item) {
    var cs = N2.chunks(item.ex);
    if (cs.length < 3) return null;
    return {
      type: 'sort', kind: kind, id: item.id, item: item,
      typeLabel: '排序重組', stem: '', sub: '點選詞塊，排成正確的句子',
      pieces: N2.shuffle(cs.map(function (c, i) { return { i: i, t: c }; })),
      answer: cs,
      hint: N2.settings.showZh ? item.exZh : item.exEn,
      correct: cs.map(N2.plain).join('')
    };
  }

  /** 這些題型是四選一，共用選項的渲染與鍵盤操作 */
  var CHOICE_TYPES = ['mc', 'cloze', 'reading', 'writing'];
  function isChoice(q) { return q && CHOICE_TYPES.indexOf(q.type) >= 0; }

  // 只有單字能出的題型（文法沒有漢字讀音／表記可考）
  var VOCAB_ONLY = ['reading', 'writing'];

  var MAKERS = {
    reading: makeReading,
    writing: makeWriting,
    cloze: makeClozeMC,
    mc: makeMC,
    fill: function (kind, item) { return makeFill(kind, item); },
    sort: function (kind, item) { return makeSort(kind, item); }
  };

  function build() {
    var p = pool();
    if (!p.items.length) return [];
    var makers = cfg.types.filter(function (t) {
      if (!MAKERS[t]) return false;
      if (p.kind !== 'v' && VOCAB_ONLY.indexOf(t) >= 0) return false;
      return true;
    });
    if (!makers.length) makers = ['cloze'];

    var src = N2.shuffle(p.items);
    var qs = [], guard = 0, idx = 0;
    while (qs.length < cfg.count && guard++ < cfg.count * 12) {
      var item = src[idx % src.length]; idx++;
      var t = makers[Math.floor(Math.random() * makers.length)];
      var q = MAKERS[t](p.kind, item, p.items);
      // 這一題做不出來（例如詞塊太少、湊不到誘答）就退回語意四選一
      if (!q) q = makeClozeMC(p.kind, item, p.items) || makeMC(p.kind, item, p.items);
      qs.push(q);
    }
    return qs;
  }

  // ---------- 畫面 ----------
  function renderSetup(root) {
    function opts(name, list, cur, multi) {
      return list.map(function (o) {
        var on = multi ? cur.indexOf(o.v) >= 0 : cur === o.v;
        return '<button class="opt" data-set="' + name + '" data-val="' + o.v +
          '" aria-pressed="' + on + '">' + o.t + '</button>';
      }).join('');
    }
    root.innerHTML =
      '<div class="page-head"><h1>測驗</h1></div>' +
      (cfg.customIds && cfg.customIds.length
        ? '<div class="card" style="padding:12px 15px;margin-bottom:12px">' +
          '<span class="tag">指定範圍</span> 只考你剛才篩選的 ' + cfg.customIds.length +
          ' 個項目　<button class="btn ghost" data-act="clear-custom">改考全部</button></div>'
        : '') +
      '<div class="card setup">' +
      '<h3>範圍</h3><div class="opts">' + opts('scope',
        [{ v: 'vocab', t: '單字（' + VOCAB.length + '）' },
         { v: 'grammar', t: '文法（' + GRAMMAR.length + '）' }], cfg.scope) + '</div>' +
      rangeBlock() +
      '<h3>挑選</h3><div class="opts">' + opts('range',
        [{ v: '全部', t: '全部' }, { v: '未掌握', t: '未掌握' },
         { v: '待加強', t: '★ 待加強' }, { v: '常錯', t: '常錯題' }], cfg.range) + '</div>' +
      '<h3>題型（可複選）</h3><div class="opts">' +
      (cfg.scope === 'vocab'
        ? opts('types', [{ v: 'reading', t: '漢字読み' }, { v: 'writing', t: '表記' }],
               cfg.types, true)
        : '') +
      opts('types',
        [{ v: 'cloze', t: '挖空四選一' }, { v: 'mc', t: '語意四選一' },
         { v: 'fill', t: '填空' }, { v: 'sort', t: '排序' }],
        cfg.types, true) + '</div>' +
      '<div class="muted" style="font-size:.8rem;margin-top:6px">' +
      (cfg.scope === 'vocab'
        ? '漢字読み＝日檢問題1，看漢字選假名；表記＝問題2，看假名選漢字。'
        : '') +
      '挖空四選一＝日檢問題4，句子挖空選詞；語意四選一＝日中互譯。</div>' +
      '<h3>題數</h3><div class="opts">' + opts('count',
        [{ v: 5, t: '5' }, { v: 10, t: '10' }, { v: 15, t: '15' },
         { v: 25, t: '25' }, { v: 40, t: '40' }], cfg.count) + '</div>' +
      '<button class="btn primary wide" data-act="quiz-start">開始測驗</button>' +
      '</div>';
    updateRangeInfo(root);
  }

  /** 編號範圍：5 個一組，可複選。不選＝全部 */
  function rangeBlock() {
    var sel = validBlocks();
    var chips = blockList().map(function (b) {
      return '<button class="opt blk" data-block="' + b.s + '" aria-pressed="' +
        (sel.indexOf(b.s) >= 0) + '">' + b.s + '–' + b.e + '</button>';
    });
    return '<h3>編號範圍 <span class="muted">5 個一組，可複選</span></h3>' +
      '<div class="range-row">' +
      '<button class="opt" data-block="all" aria-pressed="' + (sel.length === 0) +
      '">全部</button>' +
      '<span class="muted" id="q-range-info"></span></div>' +
      '<div class="opts blk-grid" id="q-blocks">' + chips.join('') + '</div>';
  }

  function updateRangeInfo(root) {
    var r = root || document;
    var info = r.querySelector('#q-range-info');
    if (!info) return;
    var sel = validBlocks();
    var n = pool().items.length;
    info.textContent = sel.length
      ? '已選 ' + sel.length + ' 組，共 ' + n + ' 項'
      : '全部 ' + n + ' 項';
    info.style.color = n ? '' : 'var(--bad)';
    var all = r.querySelector('[data-block="all"]');
    if (all) all.setAttribute('aria-pressed', sel.length === 0);
  }

  /** 點一組：已選就取消、沒選就加入；點「全部」則清空選取 */
  function toggleBlock(val) {
    if (val === 'all') { cfg.blocks = []; return; }
    var s = +val;
    var sel = validBlocks();
    var i = sel.indexOf(s);
    if (i >= 0) sel.splice(i, 1); else sel.push(s);
    cfg.blocks = sel.sort(function (a, b) { return a - b; });
  }

  function renderQ(root) {
    var q = run.qs[run.i];
    var pct = Math.round(run.i / run.qs.length * 100);
    var head =
      '<div class="deck-top">' +
      '<button class="btn ghost" data-act="quiz-quit">← 離開</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<span class="muted">' + (run.i + 1) + ' / ' + run.qs.length + '</span></div>';

    var body = '<div class="card q-card"><div class="q-type">' + q.typeLabel + '</div>';

    if (isChoice(q)) {
      body += '<div class="q-stem' + (q.type === 'mc' ? '' : ' q-cloze') +
        (q.noFurigana ? ' q-noruby' : '') + '">' + q.stem + '</div>' +
        '<div class="q-sub">' + q.sub + '</div>' +
        '<div class="choices" id="choices">' +
        q.options.map(function (o, i) {
          return '<button class="choice" data-choice="' + i + '">' +
            '<span class="k">' + 'ABCD'[i] + '</span><span>' + N2.esc(o) + '</span></button>';
        }).join('') + '</div>';
    } else if (q.type === 'fill') {
      body += '<div class="q-stem">' + q.stem + '</div>' +
        '<div class="q-sub">' + q.sub + '</div>' +
        '<input class="fill-in" id="fill" autocomplete="off" autocapitalize="off" ' +
        'autocorrect="off" spellcheck="false" placeholder="在這裡作答…">' +
        '<div class="q-foot"><button class="btn" data-act="hint">看提示</button>' +
        '<button class="btn primary" data-act="check">送出</button></div>' +
        '<div id="hintbox" class="muted" style="margin-top:8px"></div>';
    } else {
      body += '<div class="q-sub">' + q.sub +
        (q.hint ? '　<span class="muted">（' + N2.esc(q.hint) + '）</span>' : '') + '</div>' +
        '<div class="sort-target" id="sort-target"></div>' +
        '<div class="sort-pool" id="sort-pool"></div>' +
        '<div class="q-foot"><button class="btn" data-act="sort-clear">清空</button>' +
        '<button class="btn primary" data-act="check">送出</button></div>';
    }
    body += '<div id="fb"></div></div>';
    root.innerHTML = head + body;

    if (q.type === 'sort') paintSort(root, q);
    if (q.type === 'fill') {
      var f = root.querySelector('#fill');
      f.focus();
      f.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); check(root); }
      });
    }
    if (N2.settings.autoSpeak && q.type === 'mc' && q.kind === 'g') {
      N2.speak(N2.plain(q.item.ex));
    }
  }

  function paintSort(root, q) {
    q.placed = q.placed || [];
    var tgt = root.querySelector('#sort-target');
    var pl = root.querySelector('#sort-pool');
    tgt.innerHTML = q.placed.map(function (p, i) {
      return '<button class="piece" data-unplace="' + i + '">' + N2.ruby(p.t) + '</button>';
    }).join('') || '<span class="muted" style="padding:6px">依序點下方詞塊</span>';
    pl.innerHTML = q.pieces.map(function (p, i) {
      return q.placed.indexOf(p) >= 0 ? '' :
        '<button class="piece" data-place="' + i + '">' + N2.ruby(p.t) + '</button>';
    }).join('');
  }

  function feedback(root, ok, q, yourAnswer) {
    var fb = root.querySelector('#fb');
    var it = q.item;
    var detail = '';
    var S = N2.settings;
    var line = function (cls, txt) {
      return txt ? '<div class="' + cls + '">' + N2.esc(txt) + '</div>' : '';
    };
    if (q.kind === 'v') {
      detail = '<b>' + N2.ruby(it.wordRuby) + '</b>（' + N2.esc(it.reading) + '）' +
        (S.showZh ? '　' + N2.esc(it.zh) : '') +
        (S.showEn && it.en ? '　<i>' + N2.esc(it.en) + '</i>' : '') +
        '<div class="fb-ex">' + N2.ruby(it.ex) + '</div>' +
        (S.showZh ? line('fb-zh', it.exZh) : '') +
        (S.showEn ? line('fb-en', it.exEn) : '');
    } else {
      detail = '<b>' + N2.esc(it.pattern) + '</b>' +
        (S.showZh ? '　' + N2.esc(it.meaning) : '') +
        (S.showEn ? line('fb-en', it.meaningEn) : '') +
        (it.note && S.showZh ? line('fb-zh', '注意：' + it.note) : '') +
        (it.noteEn && S.showEn ? line('fb-en', 'Note: ' + it.noteEn) : '') +
        '<div class="fb-ex">' + N2.ruby(it.ex) + '</div>' +
        (S.showZh ? line('fb-zh', it.exZh) : '') +
        (S.showEn ? line('fb-en', it.exEn) : '');
    }
    fb.innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'ng') + '">' +
      (ok ? '✓ 答對了' : '✗ 答錯了　正確答案：' + N2.esc(q.correct)) +
      '<div class="fb-detail">' + detail + '</div></div>' +
      '<div class="q-foot"><button class="btn" data-act="say">🔊 朗讀例句</button>' +
      '<button class="btn primary" data-act="next-q">' +
      (run.i + 1 >= run.qs.length ? '看結果' : '下一題 →') + '</button></div>';

    run.answers.push({ q: q, ok: ok, you: yourAnswer });
    run.answered = true;
    N2.logAnswer(q.kind + ':' + q.id, ok, q.type);
    if (!ok) { N2.progress.marks[q.kind + ':' + q.id] = 'weak'; N2.saveProgress(); }
    if (N2.settings.autoSpeak) N2.speak(N2.plain(it.ex));
  }

  function check(root) {
    if (run.answered) return;
    var q = run.qs[run.i];
    if (q.type === 'fill') {
      var val = root.querySelector('#fill').value;
      var ok = q.accept.some(function (a) { return norm(a) === norm(val); });
      var inp = root.querySelector('#fill');
      inp.classList.add(ok ? 'ok' : 'ng'); inp.disabled = true;
      feedback(root, ok, q, val || '（空白）');
    } else if (q.type === 'sort') {
      var got = (q.placed || []).map(function (p) { return N2.plain(p.t); }).join('');
      var ok2 = got === q.correct;
      root.querySelectorAll('#sort-pool .piece, #sort-target .piece')
        .forEach(function (b) { b.disabled = true; });
      feedback(root, ok2, q, got || '（未作答）');
    }
  }

  function answerMC(root, idx) {
    if (run.answered) return;
    var q = run.qs[run.i];
    var picked = q.options[idx];
    var ok = picked === q.correct;
    root.querySelectorAll('.choice').forEach(function (b, i) {
      b.disabled = true;
      if (q.options[i] === q.correct) b.classList.add('correct');
      else if (i === idx) b.classList.add('wrong');
    });
    feedback(root, ok, q, picked);
  }

  function renderResult(root) {
    var ok = run.answers.filter(function (a) { return a.ok; }).length;
    var n = run.answers.length;
    var pct = n ? Math.round(ok / n * 100) : 0;
    var wrong = run.answers.filter(function (a) { return !a.ok; });
    root.innerHTML =
      '<div class="card score"><div class="big">' + pct + '%</div>' +
      '<h2>' + ok + ' / ' + n + ' 題答對</h2>' +
      '<p class="muted">' + (pct >= 90 ? '穩了，換下一批吧' :
        pct >= 70 ? '不錯，把錯的再看一次' : '把錯題整理一下，再考一次') + '</p>' +
      '<div class="btn-group" style="justify-content:center;margin-top:16px">' +
      '<button class="btn primary" data-act="quiz-again">再考一次</button>' +
      (wrong.length ? '<button class="btn" data-act="quiz-wrong">只考錯的 (' + wrong.length + ')</button>' : '') +
      '<button class="btn" data-go="quiz">改設定</button></div></div>' +
      (wrong.length ? '<h3 style="margin:18px 0 10px">錯題檢討</h3><div class="card">' +
        wrong.map(function (a) {
          var it = a.q.item;
          return '<div class="review-item"><div class="r-q">' +
            (a.q.kind === 'v' ? N2.ruby(it.wordRuby) + '　' + N2.esc(it.zh)
              : N2.esc(it.pattern) + '　' + N2.esc(it.meaning)) + '</div>' +
            '<div class="r-a"><span class="r-you">你的答案：' + N2.esc(a.you) + '</span>　' +
            '<span class="r-ans">正解：' + N2.esc(a.q.correct) + '</span></div>' +
            '<div class="r-a muted">' + N2.ruby(it.ex) + '</div></div>';
        }).join('') + '</div>' : '');
  }

  function render(root) {
    if (!run) return renderSetup(root);
    if (run.i >= run.qs.length) return renderResult(root);
    renderQ(root);
  }

  function start(overrides) {
    if (overrides) {
      // 從別處指定範圍時（首頁磁磚等），編號範圍回到全部
      if (overrides.scope && overrides.scope !== cfg.scope &&
          overrides.blocks === undefined) { cfg.blocks = []; }
      for (var k in overrides) cfg[k] = overrides[k];
    }
    cfg.blocks = validBlocks();
    var qs = build();
    if (!qs.length) {
      var sel = cfg.blocks;
      alert(sel.length
        ? '你選的 ' + sel.length + ' 組之中，沒有符合「' + cfg.range +
          '」的項目。請多選幾組或把「挑選」改成全部。'
        : '沒有符合「' + cfg.range + '」的項目。');
      return false;
    }
    run = { qs: qs, i: 0, answers: [], answered: false };
    return true;
  }

  function next() { run.i++; run.answered = false; }

  window.Quiz = {
    cfg: cfg, render: render, start: start, next: next, check: check,
    answerMC: answerMC, paintSort: paintSort, isChoice: isChoice,
    misreadings: misreadings,
    BLOCK: BLOCK, maxId: maxId, blockList: blockList,
    validBlocks: validBlocks, toggleBlock: toggleBlock,
    updateRangeInfo: updateRangeInfo,
    poolSize: function () { return pool().items.length; },
    active: function () { return !!run; },
    current: function () { return run ? run.qs[run.i] : null; },
    answered: function () { return run && run.answered; },
    quit: function () { run = null; },
    retryWrong: function () {
      var w = run.answers.filter(function (a) { return !a.ok; });
      run = { qs: N2.shuffle(w.map(function (a) { return a.q; }))
        .map(function (q) { q.placed = []; return q; }), i: 0, answers: [], answered: false };
    },
    again: function () { return start(); }
  };
})();
