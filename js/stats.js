/* stats.js — 首頁（今天該練什麼）與統計頁（趨勢與弱點） */
(function () {
  'use strict';

  var TYPE_NAME = {
    cloze: '挖空四選一', mc: '語意四選一', fill: '填空', sort: '排序', card: '字卡'
  };

  /** 把單字與文法合成一份帶 kind 的清單 */
  function allItems() {
    return VOCAB.map(function (v) { return { kind: 'v', id: v.id, it: v }; })
      .concat(GRAMMAR.map(function (g) { return { kind: 'g', id: g.id, it: g }; }));
  }

  function counts() {
    var c = { vk: 0, vw: 0, gk: 0, gw: 0 };
    VOCAB.forEach(function (v) {
      var m = N2.getMark('v', v.id);
      if (m === 'known') c.vk++; if (m === 'weak') c.vw++;
    });
    GRAMMAR.forEach(function (g) {
      var m = N2.getMark('g', g.id);
      if (m === 'known') c.gk++; if (m === 'weak') c.gw++;
    });
    return c;
  }

  function totals() {
    var n = 0, ok = 0;
    for (var d in N2.progress.log) { n += N2.progress.log[d].n; ok += N2.progress.log[d].ok; }
    return { n: n, ok: ok, pct: n ? Math.round(ok / n * 100) : 0 };
  }

  function label(x) {
    return x.kind === 'v'
      ? N2.ruby(x.it.wordRuby) + '　<span class="muted">' + N2.esc(x.it.zh) + '</span>'
      : N2.esc(x.it.pattern) + '　<span class="muted">' + N2.esc(x.it.meaning) + '</span>';
  }

  function bar(lbl, done, total, tone) {
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="bar-row"><span class="lbl">' + N2.esc(lbl) + '</span>' +
      '<span class="bar"><i style="width:' + pct + '%' +
      (tone ? ';background:' + tone : '') + '"></i></span>' +
      '<span class="val">' + done + '/' + total + '</span></div>';
  }

  function pctBar(lbl, pct, n, tone) {
    return '<div class="bar-row"><span class="lbl">' + N2.esc(lbl) + '</span>' +
      '<span class="bar"><i style="width:' + pct + '%' +
      (tone ? ';background:' + tone : '') + '"></i></span>' +
      '<span class="val">' + pct + '%<small> ·' + n + '</small></span></div>';
  }

  function toneFor(pct) {
    return pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--bad)';
  }

  // ---------- 首頁 ----------
  function renderHome(root) {
    var c = counts(), t = totals();
    var todayLog = N2.progress.log[N2.today()] || { n: 0, ok: 0 };
    var q = N2.reviewQueue(allItems());
    var dueN = q.due.length, newN = q.newItems.length;

    var plan = dueN
      ? '<div class="card plan"><div class="plan-head">' +
        '<div><div class="plan-n">' + dueN + '</div>' +
        '<div class="plan-lbl">項到期，該複習了</div></div>' +
        '<button class="btn primary" data-start="review-cards">開始複習 →</button></div>' +
        '<div class="plan-list">' +
        q.due.slice(0, 6).map(function (x) {
          var it = N2.getItem(x.kind + ':' + x.id);
          return '<div class="plan-item">' + label(x) +
            '<span class="tag ' + (x._over > 3 ? 'late' : '') + '">' +
            (x._over === 0 ? '今天' : '逾期 ' + x._over + ' 天') + '</span></div>';
        }).join('') +
        (dueN > 6 ? '<div class="muted" style="padding:6px 2px">…還有 ' +
          (dueN - 6) + ' 項</div>' : '') +
        '</div>' +
        '<div class="btn-group" style="margin-top:10px">' +
        '<button class="btn" data-start="review-quiz">改用測驗複習</button></div></div>'
      : '<div class="card plan"><div class="plan-head">' +
        '<div><div class="plan-n">✓</div>' +
        '<div class="plan-lbl">' + (t.n ? '今天的複習都做完了' : '還沒開始，挑一個地方下手吧') +
        '</div></div>' +
        (newN ? '<button class="btn primary" data-start="learn-new">學 ' +
          Math.min(newN, 10) + ' 個新的 →</button>' : '') +
        '</div></div>';

    root.innerHTML =
      '<section class="card hero"><h1>今天想練什麼？</h1>' +
      '<p>' + VOCAB.length + ' 個 N2 單字 · ' + GRAMMAR.length +
      ' 條 N2 文法。全部離線可用，紀錄存在這台裝置上。</p></section>' +

      plan +

      '<div class="kpis">' +
      '<div class="card kpi"><b>' + N2.streak() + '</b><span>連續學習天數</span></div>' +
      '<div class="card kpi"><b>' + todayLog.n + '</b><span>今日作答題數</span></div>' +
      '<div class="card kpi"><b>' + t.pct + '%</b><span>累積正確率</span></div>' +
      '<div class="card kpi"><b>' + newN + '</b><span>還沒碰過</span></div>' +
      '</div>' +

      '<div class="tiles">' +
      tile('🃏', '單字字卡', '翻卡背 ' + VOCAB.length + ' 個單字', 'cards-vocab') +
      tile('📘', '文法字卡', '翻卡背 ' + GRAMMAR.length + ' 條文法', 'cards-grammar') +
      tile('✍️', '單字測驗', '四選一 · 填空 · 排序', 'quiz-vocab') +
      tile('🧩', '文法測驗', '四選一 · 填空 · 排序', 'quiz-grammar') +
      '</div>' +

      '<h3 style="margin:22px 0 10px">進度</h3><div class="card" style="padding:14px 16px">' +
      bar('單字掌握', c.vk, VOCAB.length) +
      bar('文法掌握', c.gk, GRAMMAR.length) +
      bar('★ 待加強', c.vw + c.gw, VOCAB.length + GRAMMAR.length, 'var(--warn)') +
      '</div>';
  }

  function tile(emoji, title, desc, start) {
    return '<button class="tile" data-start="' + start + '">' +
      '<div class="t-emoji">' + emoji + '</div>' +
      '<div class="t-title">' + title + '</div>' +
      '<div class="t-desc">' + desc + '</div></button>';
  }

  // ---------- 趨勢圖（純 SVG，無外部套件） ----------
  function trendChart(days) {
    var pts = days.filter(function (d) { return d.n > 0; });
    if (pts.length < 2) {
      return '<div class="empty">再練幾天就會出現趨勢線</div>';
    }
    var W = 640, H = 150, PL = 30, PR = 8, PT = 10, PB = 22;
    var iw = W - PL - PR, ih = H - PT - PB;
    var n = pts.length;
    var x = function (i) { return PL + (n === 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (p) { return PT + ih - (p / 100) * ih; };

    var line = pts.map(function (d, i) {
      return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.pct).toFixed(1);
    }).join(' ');
    var area = line + ' L' + x(n - 1).toFixed(1) + ' ' + (PT + ih) +
      ' L' + x(0).toFixed(1) + ' ' + (PT + ih) + ' Z';

    var grid = [0, 50, 100].map(function (v) {
      return '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + y(v) + '" y2="' + y(v) +
        '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (PL - 6) + '" y="' + (y(v) + 4) +
        '" text-anchor="end" font-size="10" fill="var(--ink-3)">' + v + '</text>';
    }).join('');

    var dots = pts.map(function (d, i) {
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d.pct).toFixed(1) +
        '" r="3" fill="var(--brand)"><title>' + d.k + '：' + d.pct + '%（' +
        d.ok + '/' + d.n + ' 題）</title></circle>';
    }).join('');

    var first = pts[0], last = pts[n - 1];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend" ' +
      'preserveAspectRatio="none" role="img" aria-label="每日正確率趨勢">' +
      grid +
      '<path d="' + area + '" fill="var(--brand-soft)"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--brand)" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>' + dots +
      '<text x="' + PL + '" y="' + (H - 6) + '" font-size="10" fill="var(--ink-3)">' +
      first.k.slice(5) + '</text>' +
      '<text x="' + (W - PR) + '" y="' + (H - 6) + '" text-anchor="end" ' +
      'font-size="10" fill="var(--ink-3)">' + last.k.slice(5) + '</text>' +
      '</svg>';
  }

  function recentDays(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) {
      var k = N2.dayKey(-i), l = N2.progress.log[k] || { n: 0, ok: 0 };
      out.push({ k: k, n: l.n, ok: l.ok, pct: l.n ? Math.round(l.ok / l.n * 100) : 0 });
    }
    return out;
  }

  // ---------- 統計頁 ----------
  function renderStats(root) {
    var c = counts(), t = totals();
    var all = allItems();
    var q = N2.reviewQueue(all);
    var lee = N2.leeches(all);
    var days30 = recentDays(30);

    // 最近 7 天 vs 前 7 天，看有沒有在進步
    var last7 = days30.slice(-7), prev7 = days30.slice(-14, -7);
    var agg = function (arr) {
      var n = 0, ok = 0;
      arr.forEach(function (d) { n += d.n; ok += d.ok; });
      return { n: n, pct: n ? Math.round(ok / n * 100) : null };
    };
    var a7 = agg(last7), b7 = agg(prev7);
    var delta = (a7.pct !== null && b7.pct !== null) ? a7.pct - b7.pct : null;

    // 熱力圖
    var heat = recentDays(42).map(function (d) {
      var lv = d.n === 0 ? 0 : d.n < 10 ? 1 : d.n < 25 ? 2 : 3;
      return '<i data-l="' + lv + '" title="' + d.k + '：' + d.n + ' 題"></i>';
    }).join('');

    // 依題型
    var types = N2.progress.types || {};
    var typeRows = Object.keys(TYPE_NAME).filter(function (k) {
      return types[k] && types[k].n;
    }).map(function (k) {
      var pct = Math.round(types[k].ok / types[k].n * 100);
      return pctBar(TYPE_NAME[k], pct, types[k].n, toneFor(pct));
    }).join('');

    // 依詞性（單字）與 單字/文法
    var byPos = {};
    VOCAB.forEach(function (v) {
      var it = N2.progress.items['v:' + v.id];
      if (!it || !it.a) return;
      var g = byPos[v.pos] || (byPos[v.pos] = { a: 0, m: 0 });
      g.a += it.a; g.m += it.m;
    });
    var posRows = Object.keys(byPos).map(function (p) {
      var g = byPos[p], pct = Math.round((g.a - g.m) / g.a * 100);
      return pctBar(p, pct, g.a, toneFor(pct));
    }).join('');

    var kindAgg = function (arr, kind) {
      var a = 0, m = 0;
      arr.forEach(function (x) {
        var it = N2.progress.items[kind + ':' + x.id];
        if (it) { a += it.a; m += it.m; }
      });
      return a ? { pct: Math.round((a - m) / a * 100), n: a } : null;
    };
    var kv = kindAgg(VOCAB, 'v'), kg = kindAgg(GRAMMAR, 'g');

    root.innerHTML =
      '<div class="page-head"><h1>學習統計</h1></div>' +

      '<div class="kpis">' +
      '<div class="card kpi"><b>' + N2.streak() + '</b><span>連續天數</span></div>' +
      '<div class="card kpi"><b>' + t.n + '</b><span>總作答數</span></div>' +
      '<div class="card kpi"><b>' + t.pct + '%</b><span>累積正確率</span></div>' +
      '<div class="card kpi"><b>' + q.due.length + '</b><span>今天待複習</span></div>' +
      '</div>' +

      // --- 趨勢 ---
      '<h3 style="margin:20px 0 10px">正確率趨勢 <span class="muted">近 30 天</span></h3>' +
      '<div class="card" style="padding:14px 16px">' +
      (delta === null ? '' :
        '<div class="delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '') + '">' +
        (delta > 0 ? '▲ 進步 ' + delta : delta < 0 ? '▼ 退步 ' + Math.abs(delta) : '持平') +
        (delta ? ' 個百分點' : '') +
        '<span class="muted">　最近 7 天 ' + a7.pct + '%（' + a7.n + ' 題）' +
        '　前 7 天 ' + b7.pct + '%（' + b7.n + ' 題）</span></div>') +
      trendChart(days30) + '</div>' +

      // --- 待複習 ---
      '<h3 style="margin:20px 0 10px">今天該複習</h3>' +
      (q.due.length
        ? '<div class="card">' + q.due.slice(0, 20).map(function (x) {
            var it = N2.getItem(x.kind + ':' + x.id);
            return '<div class="review-item"><div class="r-q">' + label(x) + '</div>' +
              '<div class="r-a muted">' +
              (x._over === 0 ? '今天到期' : '逾期 ' + x._over + ' 天') +
              '　·　答對 ' + (it.a - it.m) + '/' + it.a +
              '　·　間隔 ' + N2.INTERVALS[it.box] + ' 天' +
              (it.last ? '　·　上次 ' + it.last.slice(5) : '') + '</div></div>';
          }).join('') + '</div>' +
          '<div class="btn-group" style="margin-top:12px">' +
          '<button class="btn primary" data-start="review-cards">用字卡複習</button>' +
          '<button class="btn" data-start="review-quiz">用測驗複習</button></div>'
        : '<div class="card"><div class="empty">' +
          (t.n ? '目前沒有到期項目，明天再來 👍' : '還沒有紀錄，先去測驗或翻字卡') +
          '</div></div>') +

      // --- 弱點拆解 ---
      '<h3 style="margin:20px 0 10px">正確率拆解</h3>' +
      '<div class="card" style="padding:14px 16px">' +
      (kv || kg
        ? (kv ? pctBar('單字', kv.pct, kv.n, toneFor(kv.pct)) : '') +
          (kg ? pctBar('文法', kg.pct, kg.n, toneFor(kg.pct)) : '') +
          (typeRows ? '<div class="sub-head">依題型</div>' + typeRows : '') +
          (posRows ? '<div class="sub-head">依詞性（單字）</div>' + posRows : '') +
          '<div class="muted" style="margin-top:10px;font-size:.8rem">' +
          '「四選一」高、「填空」低，代表認得出來但寫不出來。</div>'
        : '<div class="empty">還沒有足夠的作答紀錄</div>') +
      '</div>' +

      // --- 頑固字 ---
      '<h3 style="margin:20px 0 10px">頑固項目 ' +
      '<span class="muted">練過 3 次以上、錯誤率仍高</span></h3>' +
      (lee.length
        ? '<div class="card">' + lee.slice(0, 20).map(function (w) {
            return '<div class="review-item"><div class="r-q">' + label(w.item) +
              '<span class="tag bad">錯 ' + w.m + '/' + w.a + '　' +
              Math.round(w.rate * 100) + '%</span></div>' +
              '<div class="r-a muted">' + N2.ruby(w.item.it.ex) + '</div></div>';
          }).join('') + '</div>' +
          '<div class="btn-group" style="margin-top:12px">' +
          '<button class="btn primary" data-start="leech-cards">把這些做成字卡</button></div>'
        : '<div class="card"><div class="empty">目前沒有反覆答錯的項目</div></div>') +

      // --- 掌握度與熱力圖 ---
      '<h3 style="margin:20px 0 10px">掌握度</h3>' +
      '<div class="card" style="padding:14px 16px">' +
      bar('單字 已掌握', c.vk, VOCAB.length, 'var(--ok)') +
      bar('單字 待加強', c.vw, VOCAB.length, 'var(--warn)') +
      bar('文法 已掌握', c.gk, GRAMMAR.length, 'var(--ok)') +
      bar('文法 待加強', c.gw, GRAMMAR.length, 'var(--warn)') + '</div>' +

      '<h3 style="margin:20px 0 10px">最近六週</h3>' +
      '<div class="card" style="padding:14px 16px"><div class="heat">' + heat + '</div>' +
      '<div class="muted" style="margin-top:8px">每格一天，顏色越深當天練得越多</div></div>';
  }

  window.Stats = {
    renderHome: renderHome, renderStats: renderStats,
    allItems: allItems, recentDays: recentDays
  };
})();
