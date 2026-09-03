/* past.js — 考古題：依大題作答、對答案、校對正解 */
(function () {
  'use strict';

  var PAPERS = window.PAST_PAPERS || [];
  var state = { paper: PAPERS[0] ? PAPERS[0].id : '', sec: 0, idx: 0, view: 'home' };

  function paper() {
    for (var i = 0; i < PAPERS.length; i++) if (PAPERS[i].id === state.paper) return PAPERS[i];
    return PAPERS[0];
  }
  function key(q) { return paper().id + ':' + q.id; }

  /** 正解：使用者校對過就用他的，否則用資料檔裡的推測值 */
  function answerOf(q) {
    var k = N2.pastKey(key(q));
    return k ? k.n : q.answer;
  }
  function confirmed(q) { return !!N2.pastKey(key(q)); }

  function items(sec) {
    var all = paper().items;
    return sec ? all.filter(function (q) { return q.sec === sec; }) : all;
  }
  /** 問題9 五題共用一篇文章，文章存在考卷上而不是每一題裡 */
  function passageOf(q) { return q.sec === 9 ? paper().passage : ''; }
  function pick(q) { return N2.pastPick(key(q)); }
  function answered(q) { return pick(q) > 0; }

  function tally(list) {
    var done = 0, ok = 0, todo = 0;
    list.forEach(function (q) {
      if (!answered(q)) return;
      done++;
      if (pick(q) === answerOf(q)) ok++;
    });
    list.forEach(function (q) { if (!confirmed(q)) todo++; });
    return { n: list.length, done: done, ok: ok, unchecked: todo,
             pct: done ? Math.round(ok / done * 100) : null };
  }

  // ---------- 文字 ----------
  /** 題幹裡的 [[…]] 是卷面上畫底線的部分 */
  function stemHtml(s) {
    var out = '', rest = String(s || '');
    while (true) {
      var a = rest.indexOf('[[');
      if (a < 0) { out += N2.ruby(rest); break; }
      var b = rest.indexOf(']]', a);
      if (b < 0) { out += N2.ruby(rest); break; }
      out += N2.ruby(rest.slice(0, a)) +
        '<span class="ul">' + N2.ruby(rest.slice(a + 2, b)) + '</span>';
      rest = rest.slice(b + 2);
    }
    return out;
  }
  function passageHtml(text, hi) {
    return String(text || '').split('\n').map(function (p) {
      var h = N2.ruby(p);
      // 把【50】這種空格標出來，正在作答的那一格再加重
      return '<p>' + h.replace(/【(\d+)】/g, function (m, n) {
        return '<b class="pg-blank' + (+n === hi ? ' on' : '') + '">' + n + '</b>';
      }) + '</p>';
    }).join('');
  }

  // ---------- 首頁：大題清單 ----------
  function renderHome(root) {
    var p = paper();
    if (!p) { root.innerHTML = '<section class="card"><p>沒有考古題資料。</p></section>'; return; }
    var t = tally(p.items);

    root.innerHTML =
      '<section class="card">' +
        '<h1>' + N2.esc(p.name) + '</h1>' +
        '<p class="muted">' + p.items.length + ' 題 · 來源 ' + N2.esc(p.source) + '</p>' +
        '<div class="warn" id="past-warn">' +
          '<b>答案未經官方校對。</b>這份考卷的 PDF 沒有附解答，網站上的正解是推測的。' +
          '對完答案後可以直接在該題把正解改掉，改過或按過「答案沒問題」的會標成' +
          '<span class="tag ok">已校對</span>。' +
          '目前還有 <b>' + t.unchecked + '</b> 題沒校對。' +
        '</div>' +
        '<div class="past-sum">' +
          '<span><b>' + t.done + '</b> / ' + t.n + ' 已作答</span>' +
          (t.pct === null ? '' : '<span>正確率 <b>' + t.pct + '%</b></span>') +
          '<span>已校對 <b>' + (t.n - t.unchecked) + '</b> / ' + t.n + '</span>' +
        '</div>' +
        '<div class="btn-group">' +
          '<button class="btn primary" data-past="run" data-sec="0">' +
            (t.done ? '接著作答' : '從第 1 題開始') + '</button>' +
          (t.done ? '<button class="btn ghost" data-past="wrong">只看答錯的</button>' : '') +
          (t.done ? '<button class="btn ghost" data-past="reset">清除作答</button>' : '') +
        '</div>' +
      '</section>' +
      '<section class="card">' +
        '<h2>大題</h2>' +
        '<div class="sec-list">' + p.sections.map(function (s) {
          var st = tally(items(s.no));
          return '<button class="sec-row" data-past="run" data-sec="' + s.no + '">' +
            '<span class="sec-no">問題' + s.no + '</span>' +
            '<span class="sec-name">' + N2.esc(s.name) +
              '<i>第 ' + s.from + '–' + s.to + ' 題</i></span>' +
            '<span class="sec-stat">' +
              (st.done ? st.done + '/' + st.n + '　' + (st.pct === null ? '' : st.pct + '%')
                       : '<i class="muted">未作答</i>') +
              (st.unchecked ? '<i class="tag warn-tag">' + st.unchecked + ' 待確認</i>' : '') +
            '</span></button>';
        }).join('') + '</div>' +
      '</section>';
  }

  // ---------- 作答 ----------
  function list() {
    if (state.view === 'wrong') {
      return paper().items.filter(function (q) {
        return answered(q) && pick(q) !== answerOf(q);
      });
    }
    return items(state.sec);
  }

  function current() {
    var l = list();
    if (!l.length) return null;
    if (state.idx >= l.length) state.idx = l.length - 1;
    if (state.idx < 0) state.idx = 0;
    return l[state.idx];
  }

  function renderRun(root) {
    var l = list(), q = current();
    if (!q) {
      root.innerHTML = '<section class="card"><p>這裡沒有題目。</p>' +
        '<button class="btn" data-past="home">回考古題</button></section>';
      return;
    }
    var p = paper(), ans = answerOf(q), my = pick(q), done = my > 0;
    var st = tally(l);

    root.innerHTML =
      '<section class="card past-run">' +
        '<div class="deck-top">' +
          '<button class="btn ghost sm" data-past="home">← 大題</button>' +
          '<span class="muted">' + (state.idx + 1) + ' / ' + l.length +
            (st.done ? '　答對 ' + st.ok + '/' + st.done : '') + '</span>' +
        '</div>' +

        '<div class="q-type">問題' + q.sec + '　' + N2.esc(q.secName) +
          '<span class="q-no">第 ' + q.id + ' 題</span></div>' +

        (passageOf(q) ? '<div class="passage">' +
          passageHtml(passageOf(q), q.id) + '</div>' : '') +

        // 問題1 考的就是讀音，題幹給振假名等於送答案
        (q.stem ? '<div class="q-stem' + (q.sec === 1 ? ' q-noruby' : '') +
            (q.stem.length > 40 ? ' q-cloze' : '') + '">' + stemHtml(q.stem) + '</div>'
          : '<div class="q-stem q-cloze muted">請看上面文章中的 ' + q.id + ' 號空格</div>') +

        '<div class="choices">' + q.options.map(function (o, i) {
          var n = i + 1, cls = 'choice';
          if (done) {
            if (n === ans) cls += ' correct';
            else if (n === my) cls += ' wrong';
          }
          return '<button class="' + cls + '" data-past-choice="' + n + '"' +
            (done ? ' disabled' : '') + '><span class="k">' + n + '</span>' +
            '<span>' + N2.ruby(o) + '</span></button>';
        }).join('') + '</div>' +

        (done ? feedback(q, ans, my) : '') +

        '<div class="past-nav">' +
          '<button class="btn ghost" data-past="prev"' +
            (state.idx ? '' : ' disabled') + '>上一題</button>' +
          '<button class="btn' + (done ? ' primary' : ' ghost') + '" data-past="next"' +
            (state.idx < l.length - 1 ? '' : ' disabled') + '>下一題</button>' +
        '</div>' +
        '<div class="q-jump">' + l.map(function (x, i) {
          // 答對答錯的顏色與「目前這一題」的外框各自獨立，兩種狀態同時看得到
          var c = 'jump';
          if (answered(x)) c += (pick(x) === answerOf(x) ? ' ok' : ' ng');
          if (i === state.idx) c += ' on';
          return '<button class="' + c + '" data-past-jump="' + i + '">' + x.id + '</button>';
        }).join('') + '</div>' +
      '</section>';
    root.__paper = p;
  }

  function feedback(q, ans, my) {
    var right = my === ans;
    var chk = confirmed(q);
    return '<div class="feedback ' + (right ? 'ok' : 'ng') + '">' +
        '<b>' + (right ? '答對了' : '答錯了') + '</b>' +
        '　正解 ' + ans + '　' + N2.ruby(q.options[ans - 1]) +
        (chk ? '<span class="tag ok-tag">已校對</span>'
             : '<span class="tag warn-tag">待確認</span>') +
      '</div>' +
      '<div class="note">' + N2.esc(q.note) + '</div>' +
      '<div class="keyfix">' +
        (chk
          ? '<span class="muted">這題的正解你已經確認過了。</span>' +
            '<button class="btn ghost sm" data-past="unconfirm">取消確認</button>'
          : '<span class="muted">跟你手邊的解答對過了嗎？</span>' +
            '<button class="btn ghost sm" data-key-set="' + ans + '">答案沒問題</button>' +
            '<span class="keyfix-alt">正解其實是' +
              [1, 2, 3, 4].map(function (n) {
                return '<button class="btn ghost sm" data-key-set="' + n + '">' + n + '</button>';
              }).join('') + '</span>') +
      '</div>';
  }

  // ---------- 對外 ----------
  function render(root) {
    if (state.view === 'home') renderHome(root);
    else renderRun(root);
  }

  function open(sec) {
    state.sec = +sec || 0;
    state.view = 'run';
    var l = list();
    // 接著上次沒作答的地方
    var i = 0;
    while (i < l.length && answered(l[i])) i++;
    state.idx = i < l.length ? i : 0;
  }

  function answer(n) {
    var q = current();
    if (!q || answered(q)) return false;
    N2.setPastPick(key(q), n);
    N2.logAnswer(key(q), n === answerOf(q), 'past');
    return true;
  }

  function setKey(n) {
    var q = current();
    if (!q) return false;
    N2.setPastKey(key(q), +n);
    return true;
  }
  function unconfirm() {
    var q = current();
    if (!q) return false;
    N2.clearPastKey(key(q));
    return true;
  }

  function nav(d) {
    var l = list();
    var i = state.idx + (d === 'next' ? 1 : -1);
    if (i < 0 || i >= l.length) return false;
    state.idx = i;
    return true;
  }

  window.Past = {
    render: render, state: state, papers: PAPERS,
    paper: paper, items: items, list: list, current: current,
    answerOf: answerOf, confirmed: confirmed, pick: pick, answered: answered,
    tally: tally, key: key, stemHtml: stemHtml,
    open: open, answer: answer, setKey: setKey, unconfirm: unconfirm, nav: nav,
    home: function () { state.view = 'home'; },
    wrongOnly: function () { state.view = 'wrong'; state.idx = 0; },
    jump: function (i) { state.idx = +i; },
    // 只清作答，校對過的正解留著——那是使用者花時間對出來的
    reset: function () { N2.clearPastPicks(paper().id); state.idx = 0; }
  };
})();
