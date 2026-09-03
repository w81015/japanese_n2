const fs=require('fs'),vm=require('vm');
const D = require('path').join(__dirname, '..') + require('path').sep;
const store={};
const sandbox={console,
  localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v},
  matchMedia:()=>({matches:false,addEventListener(){}}),
  document:{documentElement:{setAttribute(){},style:{setProperty(){}}},
            body:{classList:{toggle(){}}}},
};
sandbox.window=sandbox;
vm.createContext(sandbox);
for(const f of ['data/vocab.js','data/grammar.js','data/vocab_list.js','data/grammar_list.js','js/decks.js','js/core.js','js/quiz.js'])
  vm.runInContext(fs.readFileSync(D+f,'utf8'),sandbox,{filename:f});
const {N2,Quiz,VOCAB,GRAMMAR}=sandbox;

const s='彼{かれ}の/発言{はつげん}は/世論{よろん}に/大{おお}きな/影響{えいきょう}を/与{あた}えた。';
console.log('plain :',N2.plain(s));
console.log('kana  :',N2.kana(s));
console.log('chunks:',N2.chunks(s).length);
console.log('ruby  :',N2.ruby(s).slice(0,70)+'...');

let bad=0;
for(const scope of ['v','g']){
  for(const type of ['mc','fill','sort']){
    Quiz.cfg.scope=scope;Quiz.cfg.types=[type];Quiz.cfg.count=200;Quiz.cfg.range='全部';
    if(!Quiz.start()){console.log('FAIL start',scope,type);bad++;continue;}
    let n=0,fills=0,sorts=0,mcs=0;
    while(true){const q=Quiz.current();if(!q)break;n++;
      if(q.type==='mc'){mcs++;
        if(q.options.length!==4){console.log('!! options',q.id,q.options.length);bad++;}
        if(q.options.indexOf(q.correct)<0){console.log('!! no correct',q.id);bad++;}
        if(new Set(q.options).size!==q.options.length){console.log('!! dup',q.id,q.options);bad++;}
      }
      if(q.type==='fill'){fills++;
        if(!/＿＿＿/.test(q.stem)){console.log('!! no blank',scope,q.id,q.stem);bad++;}
        if(!q.accept.length){console.log('!! no accept',q.id);bad++;}
      }
      if(q.type==='sort'){sorts++;
        if(q.pieces.length<3){console.log('!! few pieces',q.id);bad++;}
        if(q.answer.map(N2.plain).join('')!==q.correct){console.log('!! sort mismatch',q.id);bad++;}
      }
      Quiz.next();
    }
    console.log(scope.padEnd(8),type.padEnd(5),'產生',String(n).padStart(3),'題  mc',mcs,'fill',fills,'sort',sorts);
  }
}
let sv=VOCAB.filter(v=>N2.chunks(v.ex).length>=3).length;
let sg=GRAMMAR.filter(g=>N2.chunks(g.ex).length>=3).length;
console.log('可排序：單字',sv,'/',VOCAB.length,'　文法',sg,'/',GRAMMAR.length);
console.log('填空可用：單字',VOCAB.filter(v=>v.clozeIdx>=0).length,'　文法',GRAMMAR.filter(g=>g.cloze).length);
console.log(bad?('❌ 問題數 '+bad):'✅ 全部檢查通過');

// ---- 額外驗證：ruby 底字必須全是漢字，且渲染後純文字 == 原文 ----
console.log('\n--- ruby 驗證 ---');
let rb=0;
const strip=h=>h.replace(/<rt>.*?<\/rt>/g,'').replace(/<\/?ruby>/g,'')
                 .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
for(const set of [VOCAB,GRAMMAR]) for(const it of set){
  for(const field of ['ex','wordRuby']){
    const a=it[field]; if(!a) continue;
    // 檢查每個 { 前面是不是漢字
    for(const m of a.matchAll(/(.)\{/g))
      if(!/[々〆ヶ一-鿿]/.test(m[1])){console.log('!! 非漢字底字',it.id,field,a);rb++;}
    if(strip(N2.ruby(a))!==N2.plain(a)){console.log('!! ruby≠plain',it.id,field);console.log('  ',strip(N2.ruby(a)));console.log('  ',N2.plain(a));rb++;}
  }
}
console.log(rb?('❌ ruby 問題 '+rb):'✅ ruby 全部正確');
console.log('範例:',N2.ruby('彼{かれ}の/発言{はつげん}は/世論{よろん}に'));
console.log('kana:',N2.kana('案{あん}の定{じょう}、/彼{かれ}は/遅刻{ちこく}した。'));
