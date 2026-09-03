/* core.js — 共用工具：設定、儲存、ruby 渲染、TTS */
(function () {
  'use strict';

  // ---------- 儲存 ----------
  var SKEY = 'n2app.settings.v1';
  var PKEY = 'n2app.progress.v1';

  var DEFAULT_SETTINGS = {
    showFurigana: true, showZh: true, showEn: true, showEx: true, autoSpeak: false,
    fontSize: 100, rate: 0.9, voiceURI: '', theme: 'auto',
    pageSize: 5   // 一頁 5 個，跟測驗的編號分組一致
  };
  var SETTINGS_VERSION = 2;   // 每頁筆數從 10 改成 5 時遞增
  /* progress 結構
   * marks : { "v:12": "weak" | "known" }              手動標記
   * log   : { "2026-09-03": { n, ok, byType:{mc:{n,ok},…} } }   每日作答
   * wrong : { "g:5": 3 }                              近期錯誤佇列（會被答對抵銷）
   * seen  : { "v:1": 2 }                              累計出現次數
   * items : { "v:12": { a, m, s, last, due, box } }   每個項目的完整履歷
   *         a=累計作答 m=累計答錯 s=目前連續答對 last=上次日期 due=下次到期 box=Leitner 盒號
   * types : { mc:{n,ok}, fill:{n,ok}, sort:{n,ok}, card:{n,ok} }  各題型累計
   */
  var DEFAULT_PROGRESS = {
    marks: {}, log: {}, wrong: {}, seen: {}, items: {}, types: {}, v: 2
  };

  // Leitner 間隔（天）：答對往上升一格，答錯掉回第 0 格
  var INTERVALS = [1, 2, 4, 7, 14, 30];

  function read(key, def) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return JSON.parse(JSON.stringify(def));
      var o = JSON.parse(raw);
      for (var k in def) if (!(k in o)) o[k] = def[k];
      return o;
    } catch (e) { return JSON.parse(JSON.stringify(def)); }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var settings = read(SKEY, DEFAULT_SETTINGS);
  var progress = read(PKEY, DEFAULT_PROGRESS);

  // 設定升級：舊版存的 pageSize 是 10，會蓋掉新的預設值，這裡改回來一次。
  // 之後使用者自己改的值有 sv 標記，就不會再被動到。
  if (settings.sv !== SETTINGS_VERSION) {
    if (settings.pageSize === 10) settings.pageSize = DEFAULT_SETTINGS.pageSize;
    settings.sv = SETTINGS_VERSION;
    write(SKEY, settings);
  }

  /**
   * 舊版紀錄升級：保留原本欄位，補出 items／types，不刪任何東西。
   * 刻意用「內容」而不是版本號判斷 —— read() 會把 DEFAULT_PROGRESS 的
   * v:2 併進舊資料，靠版本號會誤判成已升級。只補缺的，所以可重複執行。
   */
  function migrate() {
    progress.items = progress.items || {};
    progress.types = progress.types || {};
    var keys = {};
    Object.keys(progress.seen || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(progress.wrong || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(progress.marks || {}).forEach(function (k) { keys[k] = 1; });
    var added = 0;
    Object.keys(keys).forEach(function (k) {
      if (progress.items[k]) return;
      added++;
      var a = progress.seen[k] || 0;
      var m = progress.wrong[k] || 0;
      // 舊資料沒有時間，一律設成今天到期，讓排程從現在重新開始
      progress.items[k] = {
        a: a, m: m, s: 0, last: '',
        due: today(), box: progress.marks[k] === 'known' ? 2 : 0
      };
    });
    progress.v = 2;
    if (added) write(PKEY, progress);
    return added;
  }

  function saveSettings() { write(SKEY, settings); applyTheme(); }
  function saveProgress() { write(PKEY, progress); }

  function applyTheme() {
    var t = settings.theme;
    if (t === 'auto') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.setProperty('--fs', settings.fontSize + '%');
    document.body.classList.toggle('no-furigana', !settings.showFurigana);
  }

  // ---------- 日期 ----------
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function dayKey(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  // ---------- 日期運算 ----------
  function parseDay(s) {
    if (!s) return null;
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function fmtDay(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(dayStr, n) {
    var d = parseDay(dayStr) || new Date();
    d.setDate(d.getDate() + n);
    return fmtDay(d);
  }
  /** b - a，相差幾天（可為負） */
  function daysBetween(a, b) {
    var da = parseDay(a), db = parseDay(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  // ---------- 每個項目的履歷與排程 ----------
  function getItem(key) {
    return progress.items[key] ||
      { a: 0, m: 0, s: 0, last: '', due: '', box: 0 };
  }

  /** 記錄一次複習結果並重新排下次到期日 */
  function review(key, correct) {
    var t = today();
    var it = progress.items[key] || { a: 0, m: 0, s: 0, last: '', due: '', box: 0 };
    it.a++;
    if (correct) {
      it.s++;
      it.box = Math.min(it.box + 1, INTERVALS.length - 1);
    } else {
      it.m++;
      it.s = 0;
      it.box = 0;
    }
    it.last = t;
    it.due = addDays(t, INTERVALS[it.box]);
    progress.items[key] = it;
    return it;
  }

  /**
   * 記錄一次作答。
   * @param {string} key   "v:12" 或 "g:5"
   * @param {boolean} correct
   * @param {string} qtype "mc" | "fill" | "sort" | "card"
   */
  function logAnswer(key, correct, qtype) {
    var t = today();
    var day = progress.log[t] || (progress.log[t] = { n: 0, ok: 0 });
    var isNew = !progress.items[key];
    day.n++;
    if (correct) day.ok++;

    // 當天每個項目的作答明細，供學習日誌逐項列出
    day.items = day.items || {};
    var di = day.items[key] || (day.items[key] = { n: 0, ok: 0 });
    di.n++; if (correct) di.ok++;
    if (isNew) markFresh(day, key);

    if (qtype) {
      day.byType = day.byType || {};
      var dt = day.byType[qtype] || (day.byType[qtype] = { n: 0, ok: 0 });
      dt.n++; if (correct) dt.ok++;
      var at = progress.types[qtype] || (progress.types[qtype] = { n: 0, ok: 0 });
      at.n++; if (correct) at.ok++;
    }

    progress.seen[key] = (progress.seen[key] || 0) + 1;
    if (!correct) progress.wrong[key] = (progress.wrong[key] || 0) + 1;
    else if (progress.wrong[key]) {
      progress.wrong[key]--;
      if (progress.wrong[key] <= 0) delete progress.wrong[key];
    }
    review(key, correct);
    saveProgress();
  }

  /** 當天第一次碰到的項目記成「新學」 */
  function markFresh(day, key) {
    day.fresh = day.fresh || [];
    if (day.fresh.indexOf(key) < 0) day.fresh.push(key);
  }

  /** 字卡的自評也計入排程（不計入測驗正確率，但要記進當天的活動） */
  function logCard(key, good) {
    var t = today();
    var day = progress.log[t] || (progress.log[t] = { n: 0, ok: 0 });
    var isNew = !progress.items[key];
    day.cards = day.cards || {};
    var dc = day.cards[key] || (day.cards[key] = { n: 0, ok: 0 });
    dc.n++; if (good) dc.ok++;
    if (isNew) markFresh(day, key);

    review(key, good);
    var at = progress.types.card || (progress.types.card = { n: 0, ok: 0 });
    at.n++; if (good) at.ok++;
    saveProgress();
  }

  // ---------- 學習日誌 ----------
  /** 這一天有沒有學習（測驗或字卡都算） */
  function dayUsed(k) {
    var d = progress.log[k];
    return !!(d && (d.n > 0 || (d.cards && Object.keys(d.cards).length)));
  }

  /** 某一天的完整明細 */
  function dayStat(k) {
    var d = progress.log[k] || {};
    var cards = d.cards || {}, items = d.items || {};
    var cardN = 0;
    Object.keys(cards).forEach(function (x) { cardN += cards[x].n; });
    return {
      key: k, n: d.n || 0, ok: d.ok || 0,
      pct: d.n ? Math.round(d.ok / d.n * 100) : null,
      byType: d.byType || {},
      items: items, cards: cards,
      cardCount: Object.keys(cards).length, cardReps: cardN,
      fresh: d.fresh || [],
      total: (d.n || 0) + cardN
    };
  }

  /** 有學習紀錄的日期，由新到舊 */
  function usedDays() {
    return Object.keys(progress.log).filter(dayUsed)
      .sort(function (a, b) { return a < b ? 1 : -1; });
  }

  /** 該日期所屬那一週的星期一 */
  function weekStart(k) {
    var d = parseDay(k);
    if (!d) return k;
    var dow = (d.getDay() + 6) % 7;          // 0 = 星期一
    d.setDate(d.getDate() - dow);
    return fmtDay(d);
  }

  /** 把有紀錄的日子彙整成每週一筆，由新到舊 */
  function weekStats() {
    var byWeek = {};
    usedDays().forEach(function (k) {
      var w = weekStart(k);
      var g = byWeek[w] || (byWeek[w] = {
        key: w, end: addDays(w, 6), days: [], n: 0, ok: 0,
        cardReps: 0, items: {}, cards: {}, fresh: []
      });
      var s = dayStat(k);
      g.days.push(s);
      g.n += s.n; g.ok += s.ok; g.cardReps += s.cardReps;
      Object.keys(s.items).forEach(function (key) {
        var t = g.items[key] || (g.items[key] = { n: 0, ok: 0 });
        t.n += s.items[key].n; t.ok += s.items[key].ok;
      });
      Object.keys(s.cards).forEach(function (key) {
        var t = g.cards[key] || (g.cards[key] = { n: 0, ok: 0 });
        t.n += s.cards[key].n; t.ok += s.cards[key].ok;
      });
      s.fresh.forEach(function (key) {
        if (g.fresh.indexOf(key) < 0) g.fresh.push(key);
      });
    });
    return Object.keys(byWeek).sort(function (a, b) { return a < b ? 1 : -1; })
      .map(function (w) {
        var g = byWeek[w];
        g.pct = g.n ? Math.round(g.ok / g.n * 100) : null;
        g.days.sort(function (a, b) { return a.key < b.key ? 1 : -1; });
        return g;
      });
  }

  /**
   * 今天該複習的項目。
   * @returns {{due:Array, newItems:Array}} due 依逾期天數排序，newItems 為完全沒碰過的
   */
  function reviewQueue(all) {
    var t = today(), due = [], fresh = [];
    all.forEach(function (x) {
      var key = x.kind + ':' + x.id;
      var it = progress.items[key];
      if (!it || !it.a) { fresh.push(x); return; }
      var over = daysBetween(it.due, t);       // >=0 表示已到期
      if (over >= 0) {
        x._over = over;
        x._rate = it.a ? it.m / it.a : 0;
        due.push(x);
      }
    });
    due.sort(function (a, b) {
      return (b._over - a._over) || (b._rate - a._rate);
    });
    return { due: due, newItems: fresh };
  }

  /** 頑固字：練過至少 3 次、錯誤率高、且不是剛開始學 */
  function leeches(all) {
    return all.map(function (x) {
      var it = progress.items[x.kind + ':' + x.id];
      if (!it || it.a < 3 || it.m < 2) return null;
      var rate = it.m / it.a;
      if (rate < 0.34) return null;
      return { item: x, a: it.a, m: it.m, rate: rate };
    }).filter(Boolean).sort(function (a, b) {
      return (b.m - a.m) || (b.rate - a.rate);
    });
  }

  /** 連續學習天數。只翻字卡沒作答的日子也算有學 */
  function streak() {
    var n = 0;
    for (var i = 0; i < 400; i++) {
      if (dayUsed(dayKey(-i))) n++;
      else if (i > 0) break;
    }
    return n;
  }

  // ---------- 文字處理 ----------
  // 標注格式：漢字{かな} 為注音；"/" 為文節分隔
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /** 轉成含 <ruby> 的 HTML（假名顯示與否由 CSS class 控制） */
  function ruby(anno) {
    var s = String(anno == null ? '' : anno).split('/').join('');
    // 只把緊接在 { 之前的「漢字連續」當作注音底字，避免吃掉前面的假名
    return esc(s).replace(/([々〆ヶ一-鿿]+)\{([^}]*)\}/g,
      function (_, base, rt) {
        return '<ruby>' + base + '<rt>' + rt + '</rt></ruby>';
      }).replace(/\{[^}]*\}/g, '');
  }
  /** 去掉注音與分隔，得到純日文原文 */
  function plain(anno) {
    return String(anno == null ? '' : anno)
      .replace(/\{[^}]*\}/g, '').split('/').join('');
  }
  /** 取得文節陣列（保留注音標記） */
  function chunks(anno) {
    return String(anno == null ? '' : anno).split('/').filter(function (x) { return x; });
  }
  /** 把整句轉成純假名（用於朗讀輔助，非必要） */
  function kana(anno) {
    return String(anno == null ? '' : anno)
      .replace(/[々〆ヶ一-鿿]+\{([^}]*)\}/g, '$1').split('/').join('');
  }

  // ---------- TTS ----------
  var voices = [];
  function ttsOK() {
    return !!(window.speechSynthesis && window.speechSynthesis.getVoices &&
      typeof window.SpeechSynthesisUtterance === 'function');
  }
  function loadVoices() {
    if (!ttsOK()) return;
    try {
      voices = (window.speechSynthesis.getVoices() || []).filter(function (v) {
        return /^ja/i.test(v.lang);
      });
    } catch (e) { voices = []; }
  }
  if (ttsOK()) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = function () {
      loadVoices();
      if (window.N2 && N2.onVoicesReady) N2.onVoicesReady();
    };
  }
  function speak(text) {
    if (!ttsOK() || !text) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(plain(text));
      u.lang = 'ja-JP';
      u.rate = settings.rate;
      var v = voices.filter(function (x) { return x.voiceURI === settings.voiceURI; })[0];
      if (v) u.voice = v;
      else if (voices[0]) u.voice = voices[0];
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ---------- 通用 ----------
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function markKey(kind, id) { return kind + ':' + id; }

  function getMark(kind, id) { return progress.marks[markKey(kind, id)] || ''; }
  function toggleMark(kind, id, value) {
    var k = markKey(kind, id);
    if (progress.marks[k] === value) delete progress.marks[k];
    else progress.marks[k] = value;
    saveProgress();
    return progress.marks[k] || '';
  }

  migrate();

  window.N2 = {
    settings: settings, progress: progress,
    saveSettings: saveSettings, saveProgress: saveProgress,
    applyTheme: applyTheme, resetProgress: function () {
      progress.marks = {}; progress.log = {}; progress.wrong = {};
      progress.seen = {}; progress.items = {}; progress.types = {};
      progress.v = 2;
      saveProgress();
    },
    migrate: migrate,
    DEFAULT_PROGRESS: DEFAULT_PROGRESS, INTERVALS: INTERVALS,
    today: today, dayKey: dayKey, streak: streak,
    parseDay: parseDay, addDays: addDays, daysBetween: daysBetween,
    logAnswer: logAnswer, logCard: logCard, review: review,
    getItem: getItem, reviewQueue: reviewQueue, leeches: leeches,
    dayUsed: dayUsed, dayStat: dayStat, usedDays: usedDays,
    weekStart: weekStart, weekStats: weekStats,
    ruby: ruby, plain: plain, chunks: chunks, kana: kana, esc: esc,
    speak: speak, getVoices: function () { return voices; },
    shuffle: shuffle, sample: sample, el: el,
    getMark: getMark, toggleMark: toggleMark, markKey: markKey
  };
})();
