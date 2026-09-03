/* 判分正確性：對每一筆資料，用「正解」作答必須判對，用錯答案必須判錯 */
const fs=require('fs'),vm=require('vm');
const D = require('path').join(__dirname, '..') + require('path').sep;
const store={};
const sandbox={console,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},
  matchMedia:()=>({matches:false,addEventListener(){}}),
  document:{documentElement:{setAttribute(){},style:{setProperty(){}}},body:{classList:{toggle(){}}}}};
sandbox.window=sandbox; vm.createContext(sandbox);
for(const f of ['data/vocab.js','data/grammar.js','js/core.js','js/quiz.js'])
  vm.runInContext(fs.readFileSync(D+f,'utf8'),sandbox,{filename:f});
const {N2,Quiz,VOCAB,GRAMMAR}=sandbox;

// 取出 quiz.js 內部的 norm（用同樣邏輯重建）
const kataToHira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const norm=s=>kataToHira(String(s||''))
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
  .replace(/[\s　～~・"'’”「」（）()]/g,'').toLowerCase();

let bad=0,nf=0,ns=0;
for(const scope of ['vocab','grammar']){
  Quiz.cfg.scope=scope;Quiz.cfg.range='全部';Quiz.cfg.customIds=null;
  const all = scope==='vocab'?VOCAB:GRAMMAR;
  Quiz.cfg.count=all.length*3; Quiz.cfg.types=['fill']; Quiz.start();
  const seenFill=new Set();
  while(true){const q=Quiz.current();if(!q)break;
    if(q.type==='fill'&&!seenFill.has(q.id)){seenFill.add(q.id);nf++;
      const okAll=q.accept.every(a=>q.accept.some(b=>norm(b)===norm(a)));
      // 每個 accept 值都必須被判對
      for(const a of q.accept)
        if(!q.accept.some(b=>norm(b)===norm(a))){console.log('!! accept 判定失敗',scope,q.id,a);bad++;}
      // 明顯錯誤答案必須判錯
      if(q.accept.some(b=>norm(b)===norm('でたらめ回答')))
        {console.log('!! 亂答被判對',scope,q.id);bad++;}
      // 空白必須判錯
      if(q.accept.some(b=>norm(b)===norm('')))
        {console.log('!! 空白被判對',scope,q.id);bad++;}
      // 片假名/平假名互換要能通過
      const a0=q.accept[0];
      if(/[ァ-ヶ]/.test(a0)&&!q.accept.some(b=>norm(b)===norm(kataToHira(a0))))
        {console.log('!! 片假名轉換失敗',scope,q.id);bad++;}
    }
    Quiz.next();
  }
  Quiz.cfg.types=['sort']; Quiz.start();
  const seenSort=new Set();
  while(true){const q=Quiz.current();if(!q)break;
    if(q.type==='sort'&&!seenSort.has(q.id)){seenSort.add(q.id);ns++;
      // 依正確順序排列必須等於 correct
      const byOrder=q.pieces.slice().sort((a,b)=>a.i-b.i).map(p=>N2.plain(p.t)).join('');
      if(byOrder!==q.correct){console.log('!! 排序還原失敗',scope,q.id,byOrder,'≠',q.correct);bad++;}
      // 打亂後（若順序不同）必須判錯
      const shuffled=q.pieces.map(p=>N2.plain(p.t)).join('');
      if(shuffled!==q.correct&&shuffled===q.correct){bad++;}
      if(q.pieces.length<3){console.log('!! 排序題詞塊<3',scope,q.id);bad++;}
    }
    Quiz.next();
  }
}
console.log(`填空題檢查 ${nf} 筆、排序題檢查 ${ns} 筆`);
// 抽樣秀出實際題目長相
Quiz.cfg.scope='grammar';Quiz.cfg.types=['fill'];Quiz.cfg.count=3;Quiz.start();
for(let i=0;i<3;i++){const q=Quiz.current();
  console.log(`\n[${q.typeLabel}] ${q.stem.replace(/<[^>]+>/g,'▁▁▁')}\n  可接受答案: ${q.accept.join(' / ')}`);
  Quiz.next();}
console.log('\n'+(bad?`❌ ${bad} 個判分問題`:'✅ 判分邏輯全部正確'));
