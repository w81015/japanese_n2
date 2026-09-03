/* decks.js — 題庫登記表
 *
 * 四個題庫並存，各自獨立記錄學習進度。
 * 每個題庫的 id 同時是學習紀錄的命名空間前綴（"v:12"、"vl:340"…），
 * 所以 'v' 與 'g' 必須維持原樣，舊紀錄才不會失效。
 */
(function () {
  'use strict';

  var LIST = [
    {
      id: 'v', kind: 'v', name: '精選單字', short: '精選',
      note: '有例句、中英雙譯', data: window.VOCAB || []
    },
    {
      id: 'vl', kind: 'v', name: '單字表', short: '字表',
      note: '完整 N2 單字表，無例句', data: window.VOCAB_LIST || []
    },
    {
      id: 'g', kind: 'g', name: '精選文法', short: '精選',
      note: '有例句、注意事項、中英雙譯', data: window.GRAMMAR || []
    },
    {
      id: 'gl', kind: 'g', name: '文法表', short: '文法表',
      note: '完整 N2 文型表，附例句', data: window.GRAMMAR_LIST || []
    }
  ];

  var BY_ID = {};
  LIST.forEach(function (d) {
    BY_ID[d.id] = d;
    d.count = d.data.length;
    // 資料裡有什麼決定這個題庫出得了哪些題型
    var s = d.data[0] || {};
    d.has = {
      ex: !!s.ex,                       // 例句
      chunks: !!(s.ex && s.ex.indexOf('/') >= 0),   // 例句有文節分隔 → 可排序
      cloze: s.clozeIdx !== undefined || !!s.cloze, // 已標好挖空位置
      kanjiQ: !!s.qWord || d.kind === 'v',          // 可出漢字読み／表記
      wrongKanji: !!(s.wrongKanji && s.wrongKanji.length),
      en: !!s.en, note: !!s.note
    };
  });

  function get(id) { return BY_ID[id] || LIST[0]; }
  function items(id) { return get(id).data; }
  function kindOf(id) { return get(id).kind; }
  function ofKind(k) {
    return LIST.filter(function (d) { return d.kind === k && d.count; });
  }
  /** 有資料的題庫才顯示 */
  function all() { return LIST.filter(function (d) { return d.count; }); }

  /** 依 "vl:340" 這種鍵找回原始資料 */
  function lookup(key) {
    var p = String(key).split(':');
    var d = BY_ID[p[0]];
    if (!d) return null;
    var id = +p[1];
    for (var i = 0; i < d.data.length; i++) {
      if (d.data[i].id === id) return { deck: d, it: d.data[i] };
    }
    return null;
  }

  window.Decks = {
    all: all, get: get, items: items, kindOf: kindOf,
    ofKind: ofKind, lookup: lookup
  };
})();
