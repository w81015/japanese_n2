/* 檢視挖空四選一實際長相 + 品質檢查 */
const fs=require('fs'),vm=require('vm');
const D = require('path').join(__dirname, '..') + require('path').sep;
const store={};
const sandbox={console,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},
  matchMedia:()=>({matches:false,addEventListener(){}}),
  document:{documentElement:{setAttribute(){},style:{setProperty(){}}},body:{classList:{toggle(){}}}}};
sandbox.window=sandbox; vm.createContext(sandbox);
for(const f of ['data/vocab.js','data/grammar.js','data/vocab_list.js','data/grammar_list.js','js/decks.js','js/core.js','js/quiz.js'])
  vm.runInContext(fs.readFileSync(D+f,'utf8'),sandbox,{filename:f});
const {N2,Quiz,VOCAB,GRAMMAR}=sandbox;
const txt=h=>h.replace(/<rt>.*?<\/rt>/g,'').replace(/<[^>]+>/g,m=>m.includes('blank')?'':'')
  .replace(/&lt;/g,'<').replace(/&amp;/g,'&');
const show=h=>h.replace(/<span class="blank">＿＿＿<\/span>/g,'［ ？ ］')
  .replace(/<rt>.*?<\/rt>/g,'').replace(/<\/?ruby>/g,'').replace(/<[^>]*>/g,'');

let bad=0;
for(const scope of ['v','g']){
  Quiz.cfg.scope=scope;Quiz.cfg.types=['cloze'];Quiz.cfg.count=(scope==='v'?VOCAB:GRAMMAR).length;
  Quiz.cfg.range='全部';Quiz.cfg.customIds=null;Quiz.cfg.from=null;Quiz.cfg.to=null;
  Quiz.start();
  let n=0,fallback=0,seen=new Set();
  const samples=[];
  while(true){const q=Quiz.current();if(!q)break;n++;
    if(q.type!=='cloze'){fallback++;Quiz.next();continue;}
    seen.add(q.id);
    if(q.options.length!==4){console.log('!! 選項數',q.id,q.options.length);bad++;}
    if(new Set(q.options).size!==4){console.log('!! 選項重複',q.id,q.options);bad++;}
    if(q.options.indexOf(q.correct)<0){console.log('!! 正解不在選項',q.id);bad++;}
    // 誘答不得與正解互為子字串（會有兩個答案都說得通）
    for(const o of q.options) if(o!==q.correct&&(o.includes(q.correct)||q.correct.includes(o)))
      {console.log('!! 誘答模稜兩可',q.id,q.correct,'vs',o);bad++;}
    // 題幹必須真的有空格，且不能洩漏答案
    if(!/class="blank"/.test(q.stem)){console.log('!! 沒有空格',q.id);bad++;}
    const plainStem=show(q.stem);
    if(plainStem.includes(q.correct)){console.log('!! 題幹洩漏答案',q.id,plainStem);bad++;}
    if(/[{}]/.test(plainStem)){console.log('!! 題幹殘留標注符號',q.id,plainStem);bad++;}
    if(samples.length<6) samples.push(q);
    Quiz.next();
  }
  console.log(`\n===== ${scope}：${n} 題，其中挖空題 ${n-fallback} 題（退回其他題型 ${fallback} 題）=====`);
  for(const q of samples){
    console.log('\n  ' + show(q.stem));
    q.options.forEach((o,i)=>console.log(`    ${'①②③④'[i]} ${o}${o===q.correct?'  ← 正解':''}`));
  }
  // ruby 是否保留
  Quiz.cfg.count=40;Quiz.start();
  let withRuby=0,tot=0;
  while(true){const q=Quiz.current();if(!q)break;
    if(q.type==='cloze'){tot++;if(/<ruby>/.test(q.stem))withRuby++;}
    Quiz.next();}
  console.log(`\n  題幹保留振假名：${withRuby}/${tot}`);
}
console.log('\n'+(bad?`❌ ${bad} 個問題`:'✅ 挖空四選一品質檢查全部通過'));
