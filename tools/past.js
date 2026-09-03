/* 考古題：資料完整性、作答流程、答案校對、與統計的串接 */
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
window.speechSynthesis = { cancel() {}, getVoices: () => [], speak() {} };
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.scrollTo = () => {};          // jsdom 沒有實作，會噴一堆雜訊
const { N2, Past, PAST_PAPERS } = window;
const click = s => {
  const e = typeof s === 'string' ? doc.querySelector(s) : s;
  if (!e) { E('找不到 ' + s); return null; }
  e.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); return e;
};
const vis = e => e && window.getComputedStyle(e).display !== 'none';
const KANA = /^[ぁ-んァ-ヶー]+$/;

console.log('\n=== 1. 資料完整性 ===');
const paper = PAST_PAPERS[0];
{
  PAST_PAPERS.length === 1 ? OK('一份考卷') : E('考卷數: ' + PAST_PAPERS.length);
  paper.items.length === 54 ? OK('54 題') : E('題數: ' + paper.items.length);
  const ids = paper.items.map(q => q.id);
  JSON.stringify(ids) === JSON.stringify(ids.map((_, i) => i + 1))
    ? OK('題號 1–54 連續不重複') : E('題號有問題');
  const secs = paper.sections.map(s => s.no).join(',');
  secs === '1,2,3,4,5,6,7,8,9' ? OK('九個大題都在') : E('大題: ' + secs);

  let bad = 0;
  paper.items.forEach(q => {
    if (q.options.length !== 4) { E(`#${q.id} 選項不是 4 個`); bad++; }
    if (new Set(q.options).size !== 4) { E(`#${q.id} 選項重複`); bad++; }
    if (!(q.answer >= 1 && q.answer <= 4)) { E(`#${q.id} 答案不在 1–4`); bad++; }
    if (!q.note || q.note.length < 8) { E(`#${q.id} 沒有解析`); bad++; }
    const s = q.stem + q.options.join('');
    if (s.split('{').length !== s.split('}').length) { E(`#${q.id} 括號不對稱`); bad++; }
    for (const m of s.matchAll(/\{([^}]*)\}/g)) {
      if (!KANA.test(m[1])) { E(`#${q.id} 振假名不是假名: ${m[1]}`); bad++; }
    }
    if (/[�]/.test(JSON.stringify(q))) { E(`#${q.id} 有無法辨識的字`); bad++; }
  });
  bad === 0 ? OK('每題四個相異選項、答案在 1–4、有解析、振假名格式正確') : E(`${bad} 個問題`);

  const s1 = paper.items.filter(q => [1, 2, 5].includes(q.sec));
  s1.every(q => q.stem.includes('[[')) ? OK('問題1・2・5 都有畫底線的詞') : E('缺底線');
  const s8 = paper.items.filter(q => q.sec === 8);
  s8.every(q => (q.stem.match(/＿＿＿|＿★＿/g) || []).length === 4 && q.stem.includes('★'))
    ? OK('問題8 每題四個空格且標出★') : E('問題8 空格不對');
  s8.every(q => q.order && q.order[q.star - 1] === q.answer)
    ? OK('問題8 的語序、★位置、答案三者一致') : E('問題8 語序與答案兜不起來');
  const s9 = paper.items.filter(q => q.sec === 9);
  // 文章存在考卷上，五題共用一份，不重複塞進每一題
  (s9.length === 5 && s9.every(q => !q.passage) && paper.passage.length > 200)
    ? OK('問題9 五題共用考卷上的同一篇文章') : E('問題9 文章的存法不對');
  [50, 51, 52, 53, 54].every(n => paper.passage.includes(`【${n}】`))
    ? OK('文章裡五個空格都在') : E('文章缺空格');
  // 答案分布：全部押同一個號碼幾乎不可能，是我作答時偷懶的警訊
  const dist = [1, 2, 3, 4].map(n => paper.items.filter(q => q.answer === n).length);
  console.log('  答案分布 1/2/3/4 =', dist.join(' / '));
  Math.max(...dist) < 27 ? OK('答案分布沒有明顯偏向某一個號碼') : E('答案分布可疑');
}

console.log('\n=== 2. 頂列與首頁 ===');
{
  const tab = doc.querySelector('.tabs [data-go="past"]');
  tab ? OK('頂列有「考古題」分頁') : E('沒有分頁');
  click(tab);
  vis(app.querySelector('.sec-list')) ? OK('進到大題清單') : E('沒看到大題清單');
  app.querySelectorAll('.sec-row').length === 9
    ? OK('列出九個大題') : E('大題列數: ' + app.querySelectorAll('.sec-row').length);
  const warn = app.querySelector('#past-warn');
  warn && /未經官方校對/.test(warn.textContent)
    ? OK('明確標示答案未經校對') : E('沒有標示答案未校對');
  /54 題沒校對/.test(warn.textContent)
    ? OK('提示還有 54 題待確認') : E('待確認數不對: ' + warn.textContent.slice(-30));
}

console.log('\n=== 3. 作答一個大題 ===');
{
  click('.sec-row[data-sec="1"]');
  const q = Past.current();
  (q && q.sec === 1 && q.id === 1) ? OK('從問題1 第 1 題開始') : E('起始題不對');
  app.querySelectorAll('.choice').length === 4 ? OK('四個選項') : E('選項數不對');
  app.querySelector('.q-stem.q-noruby')
    ? OK('漢字読み題關掉振假名，不會送答案') : E('問題1 沒關振假名');
  app.querySelector('.q-stem .ul')
    ? OK('題幹畫出底線的詞') : E('底線沒畫出來');
  app.querySelectorAll('.jump').length === 5 ? OK('題號列有 5 顆') : E('題號列不對');

  // 故意答錯
  const wrongN = q.answer === 1 ? 2 : 1;
  click(`[data-past-choice="${wrongN}"]`);
  app.querySelector('.feedback.ng') ? OK('答錯有回饋') : E('沒有回饋');
  app.querySelector('.choice.correct') ? OK('標出正解') : E('沒標正解');
  app.querySelector('.choice.wrong') ? OK('標出你選錯的那個') : E('沒標錯誤選項');
  /待確認/.test(app.querySelector('.feedback').textContent)
    ? OK('正解旁邊標「待確認」') : E('沒有待確認標記');
  app.querySelector('.note') ? OK('顯示解析') : E('沒有解析');
  app.querySelectorAll('.choice[disabled]').length === 4
    ? OK('答完就不能再改') : E('答完還能點');
  N2.pastPick('past1:1') === wrongN ? OK('記住你選的答案') : E('沒記住作答');
  N2.progress.wrong['past1:1'] ? OK('進到錯題本') : E('沒進錯題本');
  N2.progress.types.past && N2.progress.types.past.n === 1
    ? OK('統計把考古題記成獨立題型') : E('統計沒記到 past 題型');
  N2.dayStat(N2.today()).items['past1:1']
    ? OK('學習日誌記到這一題') : E('日誌沒記到');
}

console.log('\n=== 4. 校對正解 ===');
{
  const q = Past.current();
  const before = Past.answerOf(q);
  const alt = before === 4 ? 3 : 4;
  click(`[data-key-set="${alt}"]`);
  Past.answerOf(q) === alt ? OK(`把正解從 ${before} 改成 ${alt}`) : E('改不動正解');
  Past.confirmed(q) ? OK('改過的題目標成已校對') : E('沒標成已校對');
  /已校對/.test(app.querySelector('.feedback').textContent)
    ? OK('畫面上看得到「已校對」') : E('畫面沒更新');
  N2.pastKey('past1:1').n === alt ? OK('校對結果存進 localStorage') : E('沒存起來');

  // 改回原本的答案，並確認「答案沒問題」也算校對
  click('[data-past="unconfirm"]');
  !Past.confirmed(q) ? OK('可以取消確認') : E('取消不了');
  Past.answerOf(q) === before ? OK('取消後回到原本的推測值') : E('沒回到推測值');
  click(`[data-key-set="${before}"]`);
  (Past.confirmed(q) && Past.answerOf(q) === before)
    ? OK('按「答案沒問題」也算校對過') : E('確認沒生效');

  // 清除學習紀錄不該把校對結果一起洗掉
  N2.resetProgress();
  N2.pastKey('past1:1')
    ? OK('清除學習紀錄後，校對過的正解還在') : E('校對結果被清掉了');
}

console.log('\n=== 5. 走完一整個大題 ===');
{
  click('.tabs [data-go="past"]');
  click('.sec-row[data-sec="2"]');
  let n = 0;
  for (let i = 0; i < 5; i++) {
    const q = Past.current(); if (!q) break;
    if (q.sec !== 2) { E(`第 ${i + 1} 題跑到問題${q.sec} 去了`); break; }
    if (!Past.answered(q)) click(`[data-past-choice="${q.answer}"]`);
    n++;
    const next = app.querySelector('[data-past="next"]');
    if (next && !next.disabled) click(next);
  }
  n === 5 ? OK('五題都作答了') : E(`只跑了 ${n} 題`);
  const t = Past.tally(Past.items(2));
  (t.done === 5 && t.ok === 5) ? OK('全對，統計 5/5') : E(`統計: ${t.ok}/${t.done}`);
  app.querySelectorAll('.jump.ok').length === 5
    ? OK('題號列五顆都變成答對的顏色') : E('題號列沒更新');
  app.querySelector('.jump.on.ok')
    ? OK('目前這一題同時看得到答對顏色與外框') : E('兩種狀態沒有同時顯示');

  click('[data-past="home"]');
  const row = app.querySelectorAll('.sec-row')[1];
  /5\/5/.test(row.textContent) ? OK('大題清單顯示 5/5') : E('清單沒更新: ' + row.textContent);
}

console.log('\n=== 6. 只看答錯的 ===');
{
  click('.sec-row[data-sec="3"]');
  const q = Past.current();
  click(`[data-past-choice="${q.answer === 1 ? 2 : 1}"]`);   // 故意錯一題
  click('[data-past="home"]');
  const wb = app.querySelector('[data-past="wrong"]');
  wb ? OK('有「只看答錯的」') : E('沒有這個按鈕');
  click(wb);
  const l = Past.list();
  l.every(x => Past.answered(x) && Past.pick(x) !== Past.answerOf(x))
    ? OK(`清單裡 ${l.length} 題全部都是答錯的`) : E('混進了答對的題目');
  l.some(x => x.id === q.id) ? OK('剛答錯的那題在裡面') : E('剛答錯的題目沒出現');
  l.every(x => Past.items(0).indexOf(x) >= 0)
    ? OK('橫跨所有大題，不受目前大題限制') : E('錯題清單來源不對');
}

console.log('\n=== 7. 問題8 與問題9 的版面 ===');
{
  click('.tabs [data-go="past"]');
  click('.sec-row[data-sec="8"]');
  const s = app.querySelector('.q-stem').textContent;
  (s.includes('★') && (s.match(/＿＿＿|＿★＿/g) || []).length === 4)
    ? OK('問題8 顯示四個空格與★') : E('問題8 版面: ' + s.slice(0, 40));

  click('[data-past="home"]');
  click('.sec-row[data-sec="9"]');
  const pg = app.querySelector('.passage');
  pg ? OK('問題9 顯示文章') : E('沒有文章');
  pg.querySelectorAll('.pg-blank').length === 5
    ? OK('文章裡五個空格都標出來') : E('空格數: ' + pg.querySelectorAll('.pg-blank').length);
  const on = pg.querySelector('.pg-blank.on');
  (on && on.textContent === '50') ? OK('目前這一題的空格有highlight') : E('沒有標出目前空格');
  vis(pg) ? OK('文章區塊看得見') : E('文章被藏起來了');
}

console.log('\n=== 8. 鍵盤與清除作答 ===');
{
  click('.tabs [data-go="past"]');
  click('.sec-row[data-sec="4"]');
  const q = Past.current();
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: '3', bubbles: true }));
  Past.pick(q) === 3 ? OK('按數字鍵可以作答') : E('鍵盤作答沒反應');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  Past.current().id === q.id + 1 ? OK('方向鍵可以換題') : E('方向鍵沒反應');

  window.confirm = () => true;
  click('[data-past="home"]');
  click('[data-past="reset"]');
  Past.tally(paper.items).done === 0 ? OK('清除作答後歸零') : E('沒清乾淨');
  N2.pastKey('past1:1') ? OK('清除作答不會動到校對過的正解') : E('把校對結果一起清掉了');
}

console.log('\n=== 9. 接進首頁與統計 ===');
{
  // 重新答幾題，讓首頁與統計有東西可顯示
  click('.tabs [data-go="past"]');
  click('.sec-row[data-sec="1"]');
  for (let i = 0; i < 3; i++) {
    const q = Past.current(); if (!q) break;
    click(`[data-past-choice="${i === 0 ? (q.answer === 1 ? 2 : 1) : q.answer}"]`);
    const nx = app.querySelector('[data-past="next"]');
    if (nx && !nx.disabled) click(nx);
  }

  click('.tabs [data-go="home"]');
  const pc = [...app.querySelectorAll('.bar-row .lbl')].map(e => e.textContent);
  pc.includes('已作答') && pc.includes('已校對正解')
    ? OK('首頁有考古題的作答與校對進度') : E('首頁沒有考古題區塊: ' + pc.join(','));
  const jump = [...app.querySelectorAll('[data-go="past"]')]
    .filter(b => !b.closest('.tabs'));
  jump.length ? OK('首頁可以直接跳去考古題') : E('首頁沒有入口');
  click(jump[0]);
  app.querySelector('.q-jump') || app.querySelector('.sec-list')
    ? OK('點了會進到考古題') : E('跳轉失敗');

  click('.tabs [data-go="stats"]');
  const lbls = [...app.querySelectorAll('.bar-row .lbl')].map(e => e.textContent);
  lbls.includes('考古題')
    ? OK('統計頁的正確率拆解有「考古題」一列') : E('拆解沒有考古題: ' + lbls.join(','));

  // 學習日誌預設收合，展開今天才看得到逐題明細
  const dayRow = app.querySelector('[data-logkey]');
  if (!dayRow) E('學習日誌沒有今天的紀錄');
  else {
    click(dayRow);
    /第 \d+ 題/.test(app.textContent)
      ? OK('學習日誌認得考古題，列出「第 N 題」') : E('日誌顯示不出考古題');
    /問題\d/.test(app.textContent)
      ? OK('日誌一併標出屬於哪個大題') : E('日誌沒標大題');
  }

  // 錯題本不能把考古題丟給測驗（考古題不是題庫，會炸）
  Object.keys(N2.progress.wrong).some(k => k.indexOf('past1:') === 0)
    ? OK('考古題答錯有進錯題本') : E('錯題本沒收到');
  click('.tabs [data-go="home"]');
  const wbtn = app.querySelector('[data-start="quiz-wrongbook"]');
  if (wbtn) {
    click(wbtn);
    const sc = window.Quiz.cfg.scope;
    window.Decks.get(sc) ? OK('錯題本測驗挑到真的題庫（' + sc + '）')
                         : E('錯題本挑到不存在的題庫: ' + sc);
  } else {
    OK('首頁目前沒有錯題本入口，跳過');
  }
}

console.log('\n=== 10. 其他頁面沒被影響 ===');
{
  click('.tabs [data-go="vocab"]');
  app.querySelector('.entry') ? OK('單字頁正常') : E('單字頁壞了');
  click('.tabs [data-go="quiz"]');
  app.querySelector('.setup') ? OK('測驗設定頁正常') : E('測驗頁壞了');
  click('.tabs [data-go="stats"]');
  app.querySelector('.card') ? OK('統計頁正常') : E('統計頁壞了');
  click('.tabs [data-go="home"]');
  app.querySelector('.tiles') ? OK('首頁正常') : E('首頁壞了');
  const bd = doc.getElementById('settings-backdrop');
  !vis(bd) ? OK('設定面板預設是關的') : E('設定面板擋住畫面');
  [...doc.querySelectorAll('.tabs button')].map(b => b.dataset.go).join(',')
    === 'home,vocab,grammar,quiz,past,stats'
    ? OK('頂列六個分頁，考古題排在測驗與統計之間') : E('分頁順序不對');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
