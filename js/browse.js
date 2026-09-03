/* browse.js — 單字／文法瀏覽頁（含分頁） */
(function () {
  'use strict';
  var S = N2.settings;

  var state = {
    vocab: { q: '', pos: '全部', only: '全部', page: 1 },
    grammar: { q: '', only: '全部', page: 1 }
  };

  // ---------- 共用小元件 ----------
  function actions(kind, id, speakText) {
    var m = N2.getMark(kind, id);
    return '<div class="entry-actions">' +
      (speakText ? '<button class="mini" data-speak="' + N2.esc(speakText) +
        '" title="朗讀單字">🔊</button>' : '') +
      '<button class="mini" data-mark="' + kind + ':' + id + '" ' +
      'aria-pressed="' + (m === 'weak') + '" title="標記待加強">★</button></div>';
  }

  /** 例句區塊：日文 + 朗讀鈕 + 中譯 + 英譯 */
  function exBlock(anno, zh, en) {
    if (!S.showEx) return '';
    return '<div class="ex">' +
      '<button class="mini ex-speak" data-speak="' + N2.esc(N2.plain(anno)) +
      '" title="朗讀例句">🔊</button>' +
      '<div class="ex-jp">' + N2.ruby(anno) + '</div>' +
      (S.showZh && zh ? '<span class="exzh">' + N2.esc(zh) + '</span>' : '') +
      (S.showEn && en ? '<span class="exen">' + N2.esc(en) + '</span>' : '') +
      '</div>';
  }

  /** 分頁列：1–10、11–20 … */
  function pager(total, page, id) {
    var size = S.pageSize;
    if (size === 0 || total <= size) return '';
    var pages = Math.ceil(total / size);
    var btns = [];
    for (var p = 1; p <= pages; p++) {
      var a = (p - 1) * size + 1, b = Math.min(p * size, total);
      btns.push('<button class="opt page-btn" data-page="' + p + '" aria-pressed="' +
        (p === page) + '">' + a + '–' + b + '</button>');
    }
    return '<div class="pager" id="' + id + '">' +
      '<button class="opt" data-page="' + Math.max(1, page - 1) + '"' +
      (page === 1 ? ' disabled' : '') + '>‹</button>' +
      btns.join('') +
      '<button class="opt" data-page="' + Math.min(pages, page + 1) + '"' +
      (page === pages ? ' disabled' : '') + '>›</button></div>';
  }

  function sizeChips() {
    return '<div class="opts size-chips">每頁' +
      [5, 10, 20, 0].map(function (n) {
        return '<button class="opt" data-size="' + n + '" aria-pressed="' +
          (S.pageSize === n) + '">' + (n === 0 ? '全部' : n) + '</button>';
      }).join('') + '</div>';
  }

  /**
   * 「這批」＝目前這一頁看到的東西。
   * 存進 __currentSet 給字卡與測驗用，並把按鈕文字改成實際數量，
   * 避免畫面顯示 5 個、按下去卻練到 122 個。
   */
  function setBatch(root, kind, shown) {
    window.__currentSet = { kind: kind, items: shown };
    var n = shown.length;
    var c = root.querySelector('#batch-cards'), q = root.querySelector('#batch-quiz');
    if (c) c.textContent = '用字卡背這 ' + n + ' 個';
    if (q) q.textContent = '測驗這 ' + n + ' 個';
  }

  function batchButtons(kind) {
    return '<div class="btn-group" style="margin:12px 0">' +
      '<button class="btn primary" id="batch-cards" data-start="cards-' +
      (kind === 'v' ? 'vocab' : 'grammar') + '">用字卡背這批</button>' +
      '<button class="btn" id="batch-quiz" data-start="quiz-' +
      (kind === 'v' ? 'vocab' : 'grammar') + '">測驗這批</button></div>';
  }

  function slice(arr, page) {
    if (!S.pageSize) return arr;
    return arr.slice((page - 1) * S.pageSize, page * S.pageSize);
  }
  function clampPage(total, page) {
    if (!S.pageSize) return 1;
    return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / S.pageSize)));
  }

  // ---------- 單字 ----------
  function vocabEntry(v) {
    return '<article class="card entry" id="v' + v.id + '">' +
      actions('v', v.id, v.word) +
      '<div class="idx">#' + v.id + ' · ' + v.pos + '</div>' +
      '<div class="jp">' + N2.ruby(v.wordRuby) + '</div>' +
      (S.showZh ? '<div class="zh">' + N2.esc(v.zh) + '</div>' : '') +
      (S.showEn && v.en ? '<div class="en">' + N2.esc(v.en) + '</div>' : '') +
      exBlock(v.ex, v.exZh, v.exEn) +
      '</article>';
  }

  function renderVocab(root) {
    var st = state.vocab;
    var poses = ['全部'].concat(VOCAB.reduce(function (a, v) {
      if (a.indexOf(v.pos) < 0) a.push(v.pos); return a;
    }, []));

    root.innerHTML =
      '<div class="page-head"><h1>單字</h1><span class="muted" id="v-count"></span></div>' +
      '<div class="filters">' +
      '<input class="search" id="v-q" placeholder="搜尋日文／假名／中文／英文…" value="' +
      N2.esc(st.q) + '"></div>' +
      '<div class="filters" id="v-pos">' +
      poses.map(function (p) {
        return '<button class="opt" data-pos="' + N2.esc(p) + '" aria-pressed="' +
          (st.pos === p) + '">' + N2.esc(p) + '</button>';
      }).join('') + '</div>' +
      '<div class="filters" id="v-only">' +
      ['全部', '待加強', '常錯'].map(function (p) {
        return '<button class="opt" data-only="' + p + '" aria-pressed="' +
          (st.only === p) + '">' + p + '</button>';
      }).join('') + '</div>' +
      sizeChips() +
      batchButtons('v') +
      '<div id="v-pager-top"></div>' +
      '<div class="list" id="v-list"></div>' +
      '<div id="v-pager-bottom"></div>';

    function list() {
      var q = st.q.trim().toLowerCase();
      return VOCAB.filter(function (v) {
        if (st.pos !== '全部' && v.pos !== st.pos) return false;
        if (st.only === '待加強' && N2.getMark('v', v.id) !== 'weak') return false;
        if (st.only === '常錯' && !N2.progress.wrong['v:' + v.id]) return false;
        if (!q) return true;
        return (v.word + v.reading + v.zh + v.en + N2.plain(v.ex) +
          v.exZh + v.exEn).toLowerCase().indexOf(q) >= 0;
      });
    }
    function paint() {
      var arr = list();
      st.page = clampPage(arr.length, st.page);
      var shown = slice(arr, st.page);
      root.querySelector('#v-list').innerHTML = shown.length
        ? shown.map(vocabEntry).join('')
        : '<div class="empty">沒有符合的單字</div>';
      root.querySelector('#v-pager-top').innerHTML = pager(arr.length, st.page, 'v-pg1');
      root.querySelector('#v-pager-bottom').innerHTML = pager(arr.length, st.page, 'v-pg2');
      root.querySelector('#v-count').textContent =
        (S.pageSize && arr.length > S.pageSize
          ? '顯示 ' + ((st.page - 1) * S.pageSize + 1) + '–' +
            Math.min(st.page * S.pageSize, arr.length) + '，共 '
          : '共 ') + arr.length + ' 個';
      setBatch(root, 'v', shown);
    }
    paint();
    root.__repaint = paint;

    root.querySelector('#v-q').addEventListener('input', function (e) {
      st.q = e.target.value; st.page = 1; paint();
    });
    root.querySelector('#v-pos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pos]'); if (!b) return;
      st.pos = b.dataset.pos; st.page = 1;
      [].forEach.call(this.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.pos === st.pos);
      });
      paint();
    });
    root.querySelector('#v-only').addEventListener('click', function (e) {
      var b = e.target.closest('[data-only]'); if (!b) return;
      st.only = b.dataset.only; st.page = 1;
      [].forEach.call(this.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.only === st.only);
      });
      paint();
    });
  }

  // ---------- 文法 ----------
  function gramEntry(g) {
    var h = '<article class="card entry" id="g' + g.id + '">' +
      actions('g', g.id, '') +
      '<div class="idx">#' + g.id + '</div>' +
      '<div class="jp">' + N2.esc(g.pattern) + '</div>' +
      (S.showZh ? '<div class="zh">' + N2.esc(g.meaning) + '</div>' : '') +
      (S.showEn ? '<div class="en">' + N2.esc(g.meaningEn) + '</div>' : '') +
      '<div class="usage"><b>接續</b>　' + g.usage.map(N2.esc).join('<br>　　　　') + '</div>';
    if (g.note && (S.showZh || S.showEn)) {
      h += '<div class="note">' +
        (S.showZh ? '注意：' + N2.esc(g.note) : '') +
        (S.showZh && S.showEn ? '<br>' : '') +
        (S.showEn ? '<i>Note: ' + N2.esc(g.noteEn) + '</i>' : '') + '</div>';
    }
    return h + exBlock(g.ex, g.exZh, g.exEn) + '</article>';
  }

  function renderGrammar(root) {
    var st = state.grammar;
    root.innerHTML =
      '<div class="page-head"><h1>文法</h1><span class="muted" id="g-count"></span></div>' +
      '<div class="filters">' +
      '<input class="search" id="g-q" placeholder="搜尋文法／中文／英文／例句…" value="' +
      N2.esc(st.q) + '"></div>' +
      '<div class="filters" id="g-only">' +
      ['全部', '待加強', '常錯'].map(function (p) {
        return '<button class="opt" data-only="' + p + '" aria-pressed="' +
          (st.only === p) + '">' + p + '</button>';
      }).join('') + '</div>' +
      sizeChips() +
      batchButtons('g') +
      '<div id="g-pager-top"></div>' +
      '<div class="list" id="g-list"></div>' +
      '<div id="g-pager-bottom"></div>';

    function list() {
      var q = st.q.trim().toLowerCase();
      return GRAMMAR.filter(function (g) {
        if (st.only === '待加強' && N2.getMark('g', g.id) !== 'weak') return false;
        if (st.only === '常錯' && !N2.progress.wrong['g:' + g.id]) return false;
        if (!q) return true;
        return (g.pattern + g.meaning + g.meaningEn + g.note + g.noteEn +
          g.usage.join('') + N2.plain(g.ex) + g.exZh + g.exEn)
          .toLowerCase().indexOf(q) >= 0;
      });
    }
    function paint() {
      var arr = list();
      st.page = clampPage(arr.length, st.page);
      var shown = slice(arr, st.page);
      root.querySelector('#g-list').innerHTML = shown.length
        ? shown.map(gramEntry).join('')
        : '<div class="empty">沒有符合的文法</div>';
      root.querySelector('#g-pager-top').innerHTML = pager(arr.length, st.page, 'g-pg1');
      root.querySelector('#g-pager-bottom').innerHTML = pager(arr.length, st.page, 'g-pg2');
      root.querySelector('#g-count').textContent =
        (S.pageSize && arr.length > S.pageSize
          ? '顯示 ' + ((st.page - 1) * S.pageSize + 1) + '–' +
            Math.min(st.page * S.pageSize, arr.length) + '，共 '
          : '共 ') + arr.length + ' 條';
      setBatch(root, 'g', shown);
    }
    paint();
    root.__repaint = paint;

    root.querySelector('#g-q').addEventListener('input', function (e) {
      st.q = e.target.value; st.page = 1; paint();
    });
    root.querySelector('#g-only').addEventListener('click', function (e) {
      var b = e.target.closest('[data-only]'); if (!b) return;
      st.only = b.dataset.only; st.page = 1;
      [].forEach.call(this.children, function (c) {
        c.setAttribute('aria-pressed', c.dataset.only === st.only);
      });
      paint();
    });
  }

  window.Browse = {
    renderVocab: renderVocab, renderGrammar: renderGrammar,
    setPage: function (route, p) { state[route].page = p; },
    resetPage: function () { state.vocab.page = 1; state.grammar.page = 1; }
  };
})();
