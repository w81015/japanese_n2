/* cards.js — 字卡模式 */
(function () {
  'use strict';
  var S = N2.settings;
  var deck = null;

  function build(kind, items, opts) {
    opts = opts || {};
    var arr = items.slice();
    if (opts.shuffle !== false) arr = N2.shuffle(arr);
    deck = { kind: kind, items: arr, i: 0, flipped: false, done: 0, dir: opts.dir || 'jp2zh' };
    return deck;
  }

  function front(kind, it, dir) {
    if (kind === 'v') {
      return dir === 'zh2jp' ? N2.esc(it.zh) : N2.ruby(it.wordRuby);
    }
    return dir === 'zh2jp' ? N2.esc(it.meaning) : N2.esc(it.pattern);
  }

  function exBox(it) {
    return '<div class="ex">' + N2.ruby(it.ex) +
      (S.showZh && it.exZh ? '<span class="exzh">' + N2.esc(it.exZh) + '</span>' : '') +
      (S.showEn && it.exEn ? '<span class="exen">' + N2.esc(it.exEn) + '</span>' : '') +
      '</div>';
  }

  function back(kind, it, dir) {
    var h = '';
    if (kind === 'v') {
      h += '<div class="zh">' + (dir === 'zh2jp' ? N2.ruby(it.wordRuby) : N2.esc(it.zh)) + '</div>';
      h += '<div class="rd">' + N2.esc(it.reading) +
        (S.showEn && it.en ? '　·　' + N2.esc(it.en) : '') + '</div>';
      if (it.ex) h += exBox(it);
    } else {
      h += '<div class="zh">' + (dir === 'zh2jp' ? N2.esc(it.pattern) : N2.esc(it.meaning)) + '</div>';
      if (S.showEn) h += '<div class="rd" style="color:var(--ink-3);font-style:italic">' +
        N2.esc(it.meaningEn) + '</div>';
      h += '<div class="rd">' + N2.esc(it.usage[0] || '') + '</div>';
      if (it.note && (S.showZh || S.showEn)) {
        h += '<div class="ex" style="background:var(--warn-soft);color:var(--warn)">' +
          (S.showZh ? '注意：' + N2.esc(it.note) : '') +
          (S.showZh && S.showEn ? '<br>' : '') +
          (S.showEn ? '<i>Note: ' + N2.esc(it.noteEn) + '</i>' : '') + '</div>';
      }
      if (it.ex) h += exBox(it);
    }
    return h;
  }

  function render(root) {
    if (!deck || !deck.items.length) {
      root.innerHTML = '<div class="empty">這個範圍沒有卡片。<br><br>' +
        '<button class="btn primary" data-go="vocab">去選單字</button></div>';
      return;
    }
    if (deck.i >= deck.items.length) return renderDone(root);

    var it = deck.items[deck.i];
    var id = deck.kind === 'v' ? it.id : it.id;
    var mark = N2.getMark(deck.kind, id);
    var pct = Math.round(deck.i / deck.items.length * 100);

    root.innerHTML =
      '<div class="deck-top">' +
      '<button class="btn ghost" data-go="' + (deck.kind === 'v' ? 'vocab' : 'grammar') + '">← 返回</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
      '<span class="muted">' + (deck.i + 1) + ' / ' + deck.items.length + '</span></div>' +

      '<div class="card flash" id="flash">' +
      '<div class="front">' + front(deck.kind, it, deck.dir) + '</div>' +
      (deck.flipped
        ? '<div class="back">' + back(deck.kind, it, deck.dir) + '</div>'
        : '<div class="hint">點一下翻面　·　空白鍵</div>') +
      '</div>' +

      '<div class="deck-nav">' +
      '<button class="btn" data-act="prev"' + (deck.i === 0 ? ' disabled' : '') + '>← 上一張</button>' +
      '<button class="btn" data-act="speak">🔊 朗讀</button>' +
      '<button class="mini" data-mark="' + deck.kind + ':' + id + '" style="width:auto;padding:0 14px" aria-pressed="' +
      (mark === 'weak') + '">★ 待加強</button>' +
      '</div>' +

      '<div class="deck-actions">' +
      '<button class="btn" data-act="again">再看一次</button>' +
      '<button class="btn" data-act="next">下一張 →</button>' +
      '<button class="btn primary" data-act="known">已掌握 ✓</button>' +
      '</div>';

    if (S.autoSpeak) N2.speak(deck.kind === 'v' ? it.word : N2.plain(it.ex));
  }

  function renderDone(root) {
    root.innerHTML = '<div class="card score">' +
      '<div class="big">🎉</div><h2>這一輪完成了</h2>' +
      '<p class="muted">共 ' + deck.items.length + ' 張卡片</p>' +
      '<div class="btn-group" style="justify-content:center;margin-top:16px">' +
      '<button class="btn primary" data-act="restart">再來一輪</button>' +
      '<button class="btn" data-go="' + (deck.kind === 'v' ? 'vocab' : 'grammar') + '">返回清單</button>' +
      '<button class="btn" data-go="quiz">去測驗</button></div></div>';
  }

  function handle(act, root) {
    if (!deck) return;
    var it = deck.items[deck.i];
    if (act === 'flip') { deck.flipped = !deck.flipped; }
    else if (act === 'next') { deck.i++; deck.flipped = false; }
    else if (act === 'prev') { deck.i = Math.max(0, deck.i - 1); deck.flipped = false; }
    else if (act === 'again') {
      N2.logCard(deck.kind + ':' + it.id, false);   // 掉回第一格，明天再出現
      deck.items.push(it); deck.i++; deck.flipped = false;
    }
    else if (act === 'known') {
      var k = deck.kind + ':' + it.id;
      N2.progress.marks[k] = 'known';
      N2.logCard(k, true);                          // 往上升一格，拉長間隔
      deck.i++; deck.flipped = false;
    }
    else if (act === 'speak') { N2.speak(deck.kind === 'v' ? it.word : N2.plain(it.ex)); return; }
    else if (act === 'restart') { deck.i = 0; deck.flipped = false; deck.items = N2.shuffle(deck.items); }
    render(root);
  }

  window.Cards = { build: build, render: render, handle: handle, deck: function () { return deck; } };
})();
