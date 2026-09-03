/* app.js — 路由、全域事件、設定面板 */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var S = N2.settings;
  var route = 'home';

  // ---------- 路由 ----------
  function go(r, push) {
    route = r;
    if (push !== false && location.hash !== '#' + r) location.hash = r;
    // 字卡模式時，讓對應的單字／文法分頁保持高亮
    var active = r;
    if (r === 'cards') {
      var d = Cards.deck();
      active = (d && Decks.kindOf(d.kind) === 'g') ? 'grammar' : 'vocab';
    }
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.go === active ? 'true' : 'false');
    });
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if (route === 'home') Stats.renderHome(app);
    else if (route === 'vocab') Browse.renderVocab(app);
    else if (route === 'grammar') Browse.renderGrammar(app);
    else if (route === 'cards') Cards.render(app);
    else if (route === 'quiz') Quiz.render(app);
    else if (route === 'stats') Stats.renderStats(app);
    else Stats.renderHome(app);
  }

  window.addEventListener('hashchange', function () {
    var r = location.hash.replace('#', '') || 'home';
    if (r !== route) go(r, false);
  });

  // ---------- 啟動流程 ----------
  function startAction(what) {
    // 只有正在瀏覽單字／文法清單時，才沿用當下的篩選結果；
    // 從首頁磁磚點進來一律是完整範圍
    var set = (route === 'vocab' || route === 'grammar') ? window.__currentSet : null;

    /** 「這批」＝清單頁當下那一頁的項目；從首頁磁磚進來則是完整範圍 */
    function batch(deckId, fallback) {
      return (set && set.kind === deckId && set.items.length) ? set.items : fallback;
    }
    /** 用固定的一批項目開測驗：題數配合數量，並清掉編號分組避免互相打架 */
    function quizOn(scope, items, whole) {
      var ids = items === whole ? null : items.map(function (x) { return x.id; });
      return Quiz.start({
        scope: scope, range: '全部', customIds: ids, blocks: [],
        count: ids ? Math.min(Math.max(ids.length, 5), 40) : Quiz.cfg.count
      });
    }

    if (what === 'cards-vocab' || what === 'cards-grammar' ||
        what === 'quiz-vocab' || what === 'quiz-grammar') {
      var isV = what.indexOf('vocab') >= 0;
      // 從清單頁進來就用該頁選的題庫，從首頁磁磚進來則用預設題庫
      var deckId = (route === 'vocab' || route === 'grammar')
        ? Browse.deckOf(route) : (isV ? 'v' : 'g');
      var whole = Decks.items(deckId);
      var items = batch(deckId, whole);
      if (what.indexOf('cards') === 0) { Cards.build(deckId, items); go('cards'); }
      else if (quizOn(deckId, items, whole)) go('quiz');
    } else if (what === 'review-cards' || what === 'review-quiz' ||
               what === 'learn-new' || what === 'leech-cards') {
      var all = Stats.allItems();
      var picked;
      if (what === 'learn-new') picked = N2.reviewQueue(all).newItems.slice(0, 10);
      else if (what === 'leech-cards') picked = N2.leeches(all).map(function (l) { return l.item; });
      else picked = N2.reviewQueue(all).due;
      if (!picked.length) { alert('目前沒有符合的項目。'); return; }

      // 複習清單可能橫跨多個題庫，但字卡與測驗一次只能處理一個，
      // 所以挑到期項目最多的那個題庫來練
      var byDeck = {};
      picked.forEach(function (x) { (byDeck[x.kind] = byDeck[x.kind] || []).push(x); });
      var best = Object.keys(byDeck).sort(function (a, b) {
        return byDeck[b].length - byDeck[a].length;
      })[0];
      var group = byDeck[best];

      if (what === 'review-quiz') {
        var ids = group.map(function (x) { return x.id; });
        if (Quiz.start({ scope: best, range: '全部', customIds: ids, blocks: [],
                         count: Math.min(Math.max(ids.length, 5), 40) })) go('quiz');
        return;
      }
      Cards.build(best, group.map(function (x) { return x.it; }), { shuffle: false });
      go('cards');
    } else if (what === 'quiz-wrongbook') {
      var wrongDecks = {};
      Object.keys(N2.progress.wrong).forEach(function (k) {
        var d = k.split(':')[0];
        wrongDecks[d] = (wrongDecks[d] || 0) + 1;
      });
      var pick = Object.keys(wrongDecks).sort(function (a, b) {
        return wrongDecks[b] - wrongDecks[a];
      })[0] || 'v';
      if (Quiz.start({ scope: pick, range: '常錯', count: 15,
                       customIds: null, blocks: [] })) go('quiz');
    }
  }

  // ---------- 全域點擊 ----------
  document.addEventListener('click', function (e) {
    var t = e.target;

    var goBtn = t.closest('[data-go]');
    if (goBtn) {
      if (goBtn.dataset.go === 'quiz') Quiz.quit();
      if (t.closest('.tabs') && goBtn.dataset.go === 'quiz') Quiz.cfg.customIds = null;
      go(goBtn.dataset.go); return;
    }

    var startBtn = t.closest('[data-start]');
    if (startBtn) { startAction(startBtn.dataset.start); return; }

    var sp = t.closest('[data-speak]');
    if (sp) { N2.speak(sp.dataset.speak); return; }

    // 學習日誌：切換每日／每週，或展開某一天
    var lv = t.closest('[data-logview]');
    if (lv) { Stats.setLogView(lv.dataset.logview); render(); return; }
    var lk = t.closest('[data-logkey]');
    if (lk) {
      Stats.toggleLog(lk.dataset.logkey);
      render();
      var el = app.querySelector('[data-logkey="' + lk.dataset.logkey + '"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      return;
    }

    // 題庫切換（單字／文法清單頁）
    var dk = t.closest('[data-deck]');
    if (dk && (route === 'vocab' || route === 'grammar')) {
      Browse.setDeck(route, dk.dataset.deck);
      render();
      return;
    }

    // 分頁
    var pg = t.closest('[data-page]');
    if (pg && (route === 'vocab' || route === 'grammar')) {
      Browse.setPage(route, +pg.dataset.page);
      if (app.__repaint) app.__repaint();
      window.scrollTo(0, 0);
      return;
    }
    var sz = t.closest('[data-size]');
    if (sz && (route === 'vocab' || route === 'grammar')) {
      S.pageSize = +sz.dataset.size;
      N2.saveSettings();
      Browse.resetPage();
      render();
      return;
    }

    var mk = t.closest('[data-mark]');
    if (mk) {
      var p = mk.dataset.mark.split(':');
      var v = N2.toggleMark(p[0], +p[1], 'weak');
      mk.setAttribute('aria-pressed', v === 'weak');
      return;
    }

    // 顯示切換
    var tg = t.closest('[data-toggle]');
    if (tg) {
      var k = tg.dataset.toggle;
      S[k] = !S[k];
      N2.saveSettings();
      syncChips();
      render();
      return;
    }

    // 字卡
    if (route === 'cards') {
      var dr = t.closest('[data-dir]');
      if (dr) { Cards.setDir(dr.dataset.dir); Cards.render(app); return; }
      if (t.closest('#flash')) { Cards.handle('flip', app); return; }
      var ca = t.closest('[data-act]');
      if (ca) { Cards.handle(ca.dataset.act, app); return; }
    }

    // 測驗
    var qa = t.closest('[data-act]');
    if (route === 'quiz' && qa) {
      var a = qa.dataset.act;
      if (a === 'quiz-start') {
        if (Quiz.start()) render();
      } else if (a === 'check') { Quiz.check(app); }
      else if (a === 'next-q') { Quiz.next(); render(); }
      else if (a === 'quiz-quit') { Quiz.quit(); render(); }
      else if (a === 'clear-custom') { Quiz.cfg.customIds = null; render(); }
      else if (a === 'quiz-again') { if (Quiz.again()) render(); }
      else if (a === 'quiz-wrong') { Quiz.retryWrong(); render(); }
      else if (a === 'say') { var c = Quiz.current(); if (c) N2.speak(N2.plain(c.item.ex)); }
      else if (a === 'hint') {
        var q = Quiz.current();
        app.querySelector('#hintbox').textContent = q.hint || '';
      } else if (a === 'sort-clear') {
        var q2 = Quiz.current(); q2.placed = []; Quiz.paintSort(app, q2);
      }
      return;
    }
    if (route === 'quiz') {
      var ch = t.closest('[data-choice]');
      if (ch) { Quiz.answerMC(app, +ch.dataset.choice); return; }
      var pl = t.closest('[data-place]');
      if (pl) {
        var qq = Quiz.current();
        if (Quiz.answered()) return;
        qq.placed = qq.placed || [];
        qq.placed.push(qq.pieces[+pl.dataset.place]);
        Quiz.paintSort(app, qq); return;
      }
      var up = t.closest('[data-unplace]');
      if (up) {
        var q3 = Quiz.current();
        if (Quiz.answered()) return;
        q3.placed.splice(+up.dataset.unplace, 1);
        Quiz.paintSort(app, q3); return;
      }
    }

    // 編號範圍的百位分頁
    var bp = t.closest('[data-blockpage]');
    if (bp && route === 'quiz' && !Quiz.active()) {
      Quiz.setBlockPage(bp.dataset.blockpage); render(); return;
    }

    // 編號範圍：5 個一組，可複選（只切換該顆按鈕，不重繪整頁）
    var blk = t.closest('[data-block]');
    if (blk && route === 'quiz' && !Quiz.active()) {
      Quiz.toggleBlock(blk.dataset.block);
      var sel = Quiz.validBlocks();
      app.querySelectorAll('[data-block]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.block === 'all'
          ? sel.length === 0
          : sel.indexOf(+b.dataset.block) >= 0);
      });
      Quiz.updateRangeInfo(app);
      return;
    }

    // 測驗設定
    var ss = t.closest('[data-set]');
    if (ss) {
      var name = ss.dataset.set, val = ss.dataset.val;
      if (name === 'count') val = +val;
      // 換範圍（單字↔文法）時編號上限不同，選取重設回全部
      // 換題庫時編號上限與可出題型都不同，選取與題型都要重算
      if (name === 'scope' && val !== Quiz.cfg.scope) {
        Quiz.cfg.blocks = []; Quiz.cfg.customIds = null; Quiz.setBlockPage(0);
      }
      if (name === 'types') {
        var i = Quiz.cfg.types.indexOf(val);
        if (i >= 0) {
          if (Quiz.effectiveTypes().length > 1) Quiz.cfg.types.splice(i, 1);
        } else Quiz.cfg.types.push(val);
      } else Quiz.cfg[name] = val;
      render();
      return;
    }
  });

  // ---------- 鍵盤 ----------
  document.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (route === 'cards') {
      if (e.code === 'Space') { e.preventDefault(); Cards.handle('flip', app); }
      else if (e.key === 'ArrowRight') Cards.handle('next', app);
      else if (e.key === 'ArrowLeft') Cards.handle('prev', app);
      else if (e.key.toLowerCase() === 's') Cards.handle('speak', app);
    } else if (route === 'quiz' && Quiz.active()) {
      var q = Quiz.current();
      if (!q) return;
      if (Quiz.answered() && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault(); Quiz.next(); render(); return;
      }
      if (Quiz.isChoice(q) && /^[1-4a-dA-D]$/.test(e.key)) {
        var idx = '1234'.indexOf(e.key);
        if (idx < 0) idx = 'abcd'.indexOf(e.key.toLowerCase());
        if (idx >= 0 && idx < q.options.length) Quiz.answerMC(app, idx);
      }
    }
  });

  // ---------- 顯示 chips ----------
  function syncChips() {
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', !!S[b.dataset.toggle]);
    });
    document.body.classList.toggle('no-furigana', !S.showFurigana);
  }

  // ---------- 設定面板 ----------
  var bd = document.getElementById('settings-backdrop');
  function fillVoices() {
    var sel = document.getElementById('set-voice');
    var vs = N2.getVoices();
    sel.innerHTML = vs.length
      ? vs.map(function (v) {
          return '<option value="' + N2.esc(v.voiceURI) + '"' +
            (v.voiceURI === S.voiceURI ? ' selected' : '') + '>' + N2.esc(v.name) + '</option>';
        }).join('')
      : '<option value="">（此裝置沒有日文語音）</option>';
  }
  N2.onVoicesReady = fillVoices;

  document.getElementById('btn-settings').addEventListener('click', function () {
    document.getElementById('set-fontsize').value = S.fontSize;
    document.getElementById('set-rate').value = S.rate;
    document.getElementById('set-theme').value = S.theme;
    fillVoices();
    bd.hidden = false;
  });
  function closeSheet() { bd.hidden = true; }
  document.getElementById('btn-close-settings').addEventListener('click', closeSheet);
  bd.addEventListener('click', function (e) { if (e.target === bd) closeSheet(); });

  document.getElementById('set-fontsize').addEventListener('input', function (e) {
    S.fontSize = +e.target.value; N2.saveSettings();
  });
  document.getElementById('set-rate').addEventListener('input', function (e) {
    S.rate = +e.target.value; N2.saveSettings();
  });
  document.getElementById('set-voice').addEventListener('change', function (e) {
    S.voiceURI = e.target.value; N2.saveSettings();
  });
  document.getElementById('set-theme').addEventListener('change', function (e) {
    S.theme = e.target.value; N2.saveSettings();
  });

  document.getElementById('btn-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(N2.progress, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'n2-progress-' + N2.today() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  });
  document.getElementById('btn-import').addEventListener('click', function () {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        ['marks', 'log', 'wrong', 'seen'].forEach(function (k) {
          if (o[k]) N2.progress[k] = o[k];
        });
        N2.saveProgress(); closeSheet(); render();
        alert('已匯入學習紀錄。');
      } catch (err) { alert('檔案格式不正確。'); }
    };
    r.readAsText(f);
  });
  document.getElementById('btn-reset').addEventListener('click', function () {
    if (confirm('確定要清除這台裝置上的所有學習紀錄嗎？此動作無法復原。')) {
      N2.resetProgress(); closeSheet(); render();
    }
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', function () { if (S.theme === 'auto') N2.applyTheme(); });
  }

  // ---------- 版面量測（讓第二列黏在頂列正下方，不論頂列多高） ----------
  function syncTopbarHeight() {
    var tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style
      .setProperty('--topbar-h', tb.offsetHeight + 'px');
  }
  window.addEventListener('resize', syncTopbarHeight);
  window.addEventListener('orientationchange', syncTopbarHeight);

  // ---------- 啟動 ----------
  N2.applyTheme();
  syncTopbarHeight();
  syncChips();
  go(location.hash.replace('#', '') || 'home', false);
})();
