const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path');
const D = require('path').join(__dirname, '..') + require('path').sep;
let html=fs.readFileSync(D+'index.html','utf8')
 .replace(/<link rel="stylesheet" href="css\/style.css">/, '<style>'+fs.readFileSync(D+'css/style.css','utf8')+'</style>')
 .replace(/<script src="([^"]+)"><\/script>/g,(_,p)=>'<script>'+fs.readFileSync(D+p,'utf8')+'</script>');
const dom=new JSDOM(html,{url:'https://x.test/',runScripts:'dangerously',pretendToBeVisual:true});
const {window}=dom,doc=window.document,app=doc.getElementById('app');
const errs=[];const E=m=>{errs.push(m);console.log('  ❌ '+m)};const OK=m=>console.log('  ✓ '+m);
const click=s=>{const e=typeof s==='string'?doc.querySelector(s):s;if(!e){E('找不到 '+s);return}
  e.dispatchEvent(new window.MouseEvent('click',{bubbles:true}));return e};
const setNum=(id,v)=>{const el=app.querySelector(id);el.value=String(v);
  el.dispatchEvent(new window.Event('input',{bubbles:true}));};
const blur=id=>{const el=app.querySelector(id);
  el.dispatchEvent(new window.FocusEvent('blur',{bubbles:false}));};

click('[data-go="quiz"]');
console.log('=== 題數選項 ===');
const counts=[...app.querySelectorAll('[data-set="count"]')].map(b=>b.dataset.val);
console.log('  '+counts.join(' / '));
counts.includes('5')?OK('有 5 題選項'):E('缺少 5 題選項');
click('[data-set="count"][data-val="5"]');
click('[data-act="quiz-start"]');
const total=app.querySelector('.deck-top .muted').textContent.trim();
total==='1 / 5'?OK('選 5 題 → 實際出 5 題'):E('題數不對: '+total);
for(let i=0;i<5;i++){
  if(app.querySelector('.choice'))click('.choice');
  else if(app.querySelector('#fill')){app.querySelector('#fill').value='x';click('[data-act="check"]');}
  else{while(app.querySelector('[data-place]'))click('[data-place]');click('[data-act="check"]');}
  click('[data-act="next-q"]');
}
app.querySelector('.score')?OK('5 題跑完進到結果頁'):E('沒進結果頁');

console.log('\n=== 編號範圍 ===');
click('[data-go="quiz"]');
const f=app.querySelector('#q-from'),t=app.querySelector('#q-to');
(f&&t)?OK(`預設 ${f.value}–${t.value}（單字共 ${window.VOCAB.length}）`):E('沒有編號輸入框');
console.log('  提示文字:',app.querySelector('#q-range-info').textContent);

setNum('#q-from',10); setNum('#q-to',20);
console.log('  輸入 10–20 →',app.querySelector('#q-range-info').textContent);
window.Quiz.poolSize()===11?OK('範圍 10–20 = 11 項'):E('應為 11 項，實際 '+window.Quiz.poolSize());
click('[data-set="count"][data-val="15"]');
click('[data-act="quiz-start"]');
let ids=new Set(),out=[];
for(let i=0;i<15;i++){const q=window.Quiz.current();if(!q)break;ids.add(q.id);
  if(q.id<10||q.id>20)out.push(q.id);
  if(app.querySelector('.choice'))click('.choice');
  else if(app.querySelector('#fill')){app.querySelector('#fill').value='x';click('[data-act="check"]');}
  else{while(app.querySelector('[data-place]'))click('[data-place]');click('[data-act="check"]');}
  click('[data-act="next-q"]');}
out.length===0?OK(`15 題全部落在 10–20（出現編號 ${[...ids].sort((a,b)=>a-b).join(',')}）`)
             :E('超出範圍的編號: '+out);

console.log('\n=== 邊界處理 ===');
click('[data-go="quiz"]'); click('[data-act="range-all"]');
setNum('#q-to',999); blur('#q-to');
app.querySelector('#q-to').value==='122'?OK('超過上限自動夾到 122'):E('夾值失敗: '+app.querySelector('#q-to').value);
setNum('#q-from',0); blur('#q-from');
app.querySelector('#q-from').value==='1'?OK('小於 1 自動夾到 1'):E('下限夾值失敗: '+app.querySelector('#q-from').value);
setNum('#q-from',50); setNum('#q-to',20); blur('#q-to');
const b=window.Quiz.bounds();
(b.from===20&&b.to===50)?OK('起訖顛倒自動對調 → 20–50'):E('對調失敗: '+JSON.stringify(b));
setNum('#q-from',''); blur('#q-from');
window.Quiz.bounds().from===1?OK('清空輸入框視為 1'):E('空值處理錯誤');

console.log('\n=== 快速區塊與「全部」 ===');
click('[data-go="quiz"]');
const presets=[...app.querySelectorAll('[data-preset]')].map(b=>b.dataset.preset);
console.log('  區塊:',presets.join(' '));
presets[0]==='1-20'&&presets[presets.length-1]==='121-122'?OK('單字切成 7 塊，最後一塊 121–122'):E('區塊不對');
click('[data-preset="41-60"]');
(app.querySelector('#q-from').value==='41'&&app.querySelector('#q-to').value==='60')
  ?OK('點 41–60 有帶入輸入框'):E('區塊按鈕沒生效');
app.querySelector('[data-preset="41-60"]').getAttribute('aria-pressed')==='true'
  ?OK('該區塊按鈕高亮'):E('高亮沒更新');
click('[data-act="range-all"]');
(app.querySelector('#q-from').value==='1'&&app.querySelector('#q-to').value==='122')
  ?OK('「全部」還原成 1–122'):E('全部按鈕沒生效');

console.log('\n=== 切換單字↔文法 ===');
click('[data-preset="101-120"]');
click('[data-set="scope"][data-val="grammar"]');
const gp=[...app.querySelectorAll('[data-preset]')].map(x=>x.dataset.preset);
(app.querySelector('#q-to').value==='82')?OK('切到文法後上限變 82、範圍重設'):E('切換沒重設: '+app.querySelector('#q-to').value);
gp[gp.length-1]==='81-82'?OK('文法區塊最後一塊 81–82'):E('文法區塊不對: '+gp.join(' '));
click('[data-preset="1-20"]');
click('[data-act="quiz-start"]');
let g_out=[];
for(let i=0;i<10;i++){const q=window.Quiz.current();if(!q)break;
  if(q.id<1||q.id>20)g_out.push(q.id);
  if(app.querySelector('.choice'))click('.choice');
  else if(app.querySelector('#fill')){app.querySelector('#fill').value='x';click('[data-act="check"]');}
  else{while(app.querySelector('[data-place]'))click('[data-place]');click('[data-act="check"]');}
  click('[data-act="next-q"]');}
g_out.length===0?OK('文法 1–20 範圍正確'):E('文法超出範圍: '+g_out);

console.log('\n'+(errs.length?`❌ ${errs.length} 個問題`:'✅ 全部通過'));
process.exit(errs.length?1:0);
