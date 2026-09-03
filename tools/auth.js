/* middleware.js 的 Basic 驗證邏輯 */
const fs = require('fs');
const path = require('path');
const errs = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const OK = m => console.log('  ✓ ' + m);

// middleware.js 是 ES module，這裡把 export 拿掉後在沙箱裡執行
const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8')
  .replace(/export\s+const\s+config/, 'const config')
  .replace(/export\s+default\s+function/, 'function');
const env = {};
const factory = new Function('process', 'atob', 'Response',
  src + '\nreturn { middleware, config };');
const { middleware, config } = factory(
  { env },
  s => Buffer.from(s, 'base64').toString('utf8'),
  class FakeResponse {
    constructor(body, init) {
      this.body = body;
      this.status = (init && init.status) || 200;
      this.headers = new Map(Object.entries((init && init.headers) || {}));
    }
  }
);

const req = auth => ({
  headers: { get: k => (k.toLowerCase() === 'authorization' ? auth : null) }
});
const basic = (u, p) => 'Basic ' + Buffer.from(u + ':' + p).toString('utf8')
  && 'Basic ' + Buffer.from(u + ':' + p).toString('base64');

console.log('\n=== 1. 沒設定帳密時完全不擋 ===');
{
  delete env.SITE_USER; delete env.SITE_PASS;
  middleware(req(null)) === undefined
    ? OK('沒有環境變數就直接放行（不會把自己鎖在外面）') : E('不該擋');
  env.SITE_USER = 'lin';
  middleware(req(null)) === undefined
    ? OK('只設了帳號沒設密碼，也還是放行') : E('半套設定不該啟用');
}

console.log('\n=== 2. 設好之後才真的擋 ===');
{
  env.SITE_USER = 'lin'; env.SITE_PASS = 'n2-secret';
  const r = middleware(req(null));
  r && r.status === 401 ? OK('沒帶認證 → 401') : E('沒擋下來');
  const wa = r && r.headers.get('WWW-Authenticate');
  wa && wa.startsWith('Basic realm=')
    ? OK('回應帶 WWW-Authenticate，瀏覽器才會跳出登入框') : E('缺 WWW-Authenticate: ' + wa);
  r.headers.get('Cache-Control') === 'no-store'
    ? OK('401 標成 no-store，不會被快取留下來') : E('缺 no-store');
}

console.log('\n=== 3. 各種錯誤的認證都要擋 ===');
{
  const cases = [
    ['帳號密碼都錯', basic('someone', 'wrong')],
    ['只有帳號對', basic('lin', 'wrong')],
    ['只有密碼對', basic('someone', 'n2-secret')],
    ['大小寫不同', basic('Lin', 'n2-secret')],
    ['密碼多一個字', basic('lin', 'n2-secret ')],
    ['密碼少一個字', basic('lin', 'n2-secre')],
    ['空密碼', basic('lin', '')],
    ['不是 Basic', 'Bearer abcdefg'],
    ['base64 壞掉', 'Basic !!!not-base64!!!'],
    ['沒有冒號', 'Basic ' + Buffer.from('linn2-secret').toString('base64')],
    ['空字串', 'Basic '],
  ];
  let bad = 0;
  cases.forEach(([name, header]) => {
    const r = middleware(req(header));
    if (!r || r.status !== 401) { E(`「${name}」竟然放行了`); bad++; }
  });
  bad === 0 ? OK(`${cases.length} 種錯誤認證全部擋下`) : E(`${bad} 種沒擋`);
}

console.log('\n=== 4. 正確的才放行 ===');
{
  middleware(req(basic('lin', 'n2-secret'))) === undefined
    ? OK('帳密正確 → 放行') : E('正確的帳密被擋了');
  // 密碼含非 ASCII 也要能用
  env.SITE_USER = 'リン'; env.SITE_PASS = '日本語N2';
  middleware(req('Basic ' + Buffer.from('リン:日本語N2', 'utf8').toString('base64')))
    === undefined ? OK('帳密含日文也能通過（UTF-8 解碼正確）') : E('非 ASCII 帳密失敗');
  env.SITE_USER = 'lin'; env.SITE_PASS = 'n2-secret';
}

console.log('\n=== 5. matcher 涵蓋範圍 ===');
{
  const m = config.matcher[0];
  const re = new RegExp('^' + m.replace(/^\//, '\\/') + '$');
  const hit = p => re.test(p);
  ['/', '/index.html', '/data/vocab_list.js', '/js/app.js', '/css/style.css']
    .every(hit) ? OK('首頁、資料檔、程式檔、樣式都在保護範圍') : E('有路徑沒被涵蓋');
  !hit('/_vercel/insights/script.js')
    ? OK('排除 Vercel 內部路徑') : E('不該擋 _vercel');
}

console.log('\n=== 6. 部署設定 ===');
{
  const vc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  vc.buildCommand === undefined
    ? OK('vercel.json 沒有停用 build，middleware 才會被編譯')
    : E('buildCommand 被設成 ' + JSON.stringify(vc.buildCommand) + '，middleware 可能不會生效');
  const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  !fs.existsSync(path.join(__dirname, '..', '.env'))
    ? OK('專案裡沒有 .env，帳密只放在 Vercel 後台') : E('出現 .env 檔');
  const mw = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8');
  !/SITE_PASS\s*=\s*['"]/.test(mw)
    ? OK('middleware.js 裡沒有寫死密碼') : E('密碼被寫死在程式裡');
}

console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
process.exit(errs.length ? 1 : 0);
