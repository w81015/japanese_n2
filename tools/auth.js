/* middleware.js 的登入保護：cookie 簽章、登入表單、Basic 相容、部署設定 */
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const errs = [];
const E = m => { errs.push(m); console.log('  ❌ ' + m); };
const OK = m => console.log('  ✓ ' + m);

// middleware.js 是 ES module，這裡把 export 拿掉後在沙箱裡執行
const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.js'), 'utf8')
  .replace(/export\s+const\s+config/, 'const config')
  .replace(/export\s+default\s+async\s+function/, 'async function');
const env = {};
const factory = new Function(
  'process', 'crypto', 'TextEncoder', 'Response', 'URL', 'atob',
  src + '\nreturn { middleware, config };'
);
const { middleware, config } = factory(
  { env }, nodeCrypto.webcrypto, TextEncoder, Response, URL,
  s => Buffer.from(s, 'base64').toString('utf8')
);

const LOGIN = '/__login';
const req = (opts = {}) => ({
  method: opts.method || 'GET',
  url: 'https://x.test' + (opts.path || '/'),
  headers: new Headers(opts.headers || {}),
  formData: async () => {
    if (opts.form === 'broken') throw new Error('bad form');
    const f = new FormData();
    Object.entries(opts.form || {}).forEach(([k, v]) => f.append(k, v));
    return f;
  }
});
const page = { accept: 'text/html,application/xhtml+xml' };
const basic = (u, p) =>
  ({ authorization: 'Basic ' + Buffer.from(u + ':' + p).toString('base64') });
const cookieOf = res => (res.headers.get('set-cookie') || '').split(';')[0];
const forge = (exp, secret) =>
  'n2_auth=' + exp + '.' +
  nodeCrypto.createHmac('sha256', secret).update(String(exp)).digest('hex');

const PASS = 'n2-secret';

(async () => {

  console.log('\n=== 1. 沒設密碼時完全不擋 ===');
  {
    delete env.SITE_USER; delete env.SITE_PASS;
    await middleware(req({ headers: page })) === undefined
      ? OK('沒有環境變數就直接放行（不會把自己鎖在外面）') : E('不該擋');
    env.SITE_USER = 'lin';
    await middleware(req({ headers: page })) === undefined
      ? OK('只設了帳號沒設密碼，也還是放行') : E('半套設定不該啟用');
  }

  console.log('\n=== 2. 設好之後回的是登入表單，不是空白的 401 ===');
  env.SITE_USER = 'lin'; env.SITE_PASS = PASS;
  {
    const r = await middleware(req({ headers: page }));
    r && r.status === 401 ? OK('沒登入 → 401') : E('沒擋下來');
    const html = await r.text();
    /<form[^>]+method="post"/i.test(html)
      ? OK('回應是一頁真的登入表單（不必依賴瀏覽器的 Basic 對話框）') : E('沒有表單');
    html.includes('action="' + LOGIN + '?next=')
      ? OK('表單送到 ' + LOGIN + '，並帶著原本要去的路徑') : E('表單 action 不對');
    /name="u"/.test(html) && /name="p"/.test(html)
      ? OK('有帳號與密碼兩個欄位') : E('缺欄位');
    /type="password"/.test(html) ? OK('密碼欄是 password 型態') : E('密碼沒遮');
    !html.includes(PASS) ? OK('頁面裡沒有洩漏密碼') : E('密碼出現在 HTML 裡');
    r.headers.get('cache-control') === 'no-store'
      ? OK('標成 no-store，不會被快取留下來') : E('缺 no-store');
    (r.headers.get('content-type') || '').includes('text/html')
      ? OK('content-type 是 text/html，瀏覽器會當網頁畫出來') : E('content-type 不對');
  }

  console.log('\n=== 3. 非網頁請求不回整頁 HTML ===');
  {
    const r = await middleware(req({ path: '/data/vocab_list.js', headers: { accept: '*/*' } }));
    r && r.status === 401 ? OK('資料檔一樣擋住（前端密碼框擋不住這個）') : E('資料檔沒擋');
    !/<form/.test(await r.text()) ? OK('回純文字而不是登入頁') : E('不該回整頁 HTML');
  }

  console.log('\n=== 4. 送出表單：錯的擋、對的發 cookie ===');
  let good = '';
  {
    const cases = [
      ['帳號密碼都錯', { u: 'someone', p: 'wrong' }],
      ['只有帳號對', { u: 'lin', p: 'wrong' }],
      ['只有密碼對', { u: 'someone', p: PASS }],
      ['大小寫不同', { u: 'Lin', p: PASS }],
      ['密碼多一個空白', { u: 'lin', p: PASS + ' ' }],
      ['密碼少一個字', { u: 'lin', p: PASS.slice(0, -1) }],
      ['空密碼', { u: 'lin', p: '' }],
      ['什麼都沒填', {}],
      ['表單壞掉', 'broken']
    ];
    let bad = 0;
    for (const [name, form] of cases) {
      const r = await middleware(req({ method: 'POST', path: LOGIN, headers: page, form }));
      if (!r || r.status !== 401 || r.headers.get('set-cookie')) {
        E(`「${name}」竟然放行了`); bad++;
      }
    }
    bad === 0 ? OK(`${cases.length} 種錯誤輸入全部擋下，也沒發出 cookie`) : E(`${bad} 種沒擋`);

    const r0 = await middleware(req({
      method: 'POST', path: LOGIN, headers: page, form: { u: 'lin', p: 'wrong' }
    }));
    (await r0.text()).includes('帳號或密碼不正確')
      ? OK('錯的時候有講清楚原因') : E('沒有錯誤訊息');

    const r1 = await middleware(req({
      method: 'POST', path: LOGIN + '?next=%2Fstats', headers: page,
      form: { u: 'lin', p: PASS }
    }));
    r1 && r1.status === 303 ? OK('帳密正確 → 303 轉址') : E('狀態碼: ' + (r1 && r1.status));
    r1.headers.get('location') === '/stats'
      ? OK('登入後回到原本要去的頁面') : E('location: ' + r1.headers.get('location'));
    const sc = r1.headers.get('set-cookie') || '';
    sc.includes('HttpOnly') && sc.includes('Secure') && sc.includes('SameSite=Lax')
      ? OK('cookie 有 HttpOnly／Secure／SameSite=Lax') : E('cookie 屬性不足: ' + sc);
    /Max-Age=15552000/.test(sc) ? OK('有效期 180 天，不用天天重登') : E('Max-Age: ' + sc);
    !sc.includes(PASS) ? OK('cookie 裡沒有密碼本身，只有簽章') : E('cookie 洩漏密碼');
    good = cookieOf(r1);
  }

  console.log('\n=== 5. cookie 驗證 ===');
  {
    await middleware(req({ headers: { ...page, cookie: good } })) === undefined
      ? OK('帶著剛發的 cookie → 放行') : E('正確的 cookie 被擋');
    await middleware(req({
      path: '/data/vocab_list.js', headers: { accept: '*/*', cookie: good }
    })) === undefined ? OK('資料檔也一起放行') : E('資料檔被擋');
    await middleware(req({
      headers: { ...page, cookie: 'other=1; ' + good + '; x=2' }
    })) === undefined ? OK('跟其他 cookie 混在一起也能認得') : E('cookie 解析失敗');

    const exp = good.split('=')[1].split('.')[0];
    const forged = [
      ['改到期時間', 'n2_auth=' + (Number(exp) + 1) + '.' + good.split('.')[1]],
      ['改簽章', good.slice(0, -1) + (good.slice(-1) === 'a' ? 'b' : 'a')],
      ['沒有簽章', 'n2_auth=' + exp],
      ['亂填', 'n2_auth=whatever'],
      ['空的', 'n2_auth='],
      ['用別的密碼簽的', forge(Date.now() + 10000, 'another-secret')],
      ['已經過期', forge(Date.now() - 1000, PASS)]
    ];
    let bad = 0;
    for (const [name, c] of forged) {
      const r = await middleware(req({ headers: { ...page, cookie: c } }));
      if (!r || r.status !== 401) { E(`「${name}」的 cookie 竟然通過`); bad++; }
    }
    bad === 0 ? OK(`${forged.length} 種偽造／過期的 cookie 全部擋下`) : E(`${bad} 種沒擋`);
  }

  console.log('\n=== 6. Basic 驗證仍相容（方便用 curl 檢查）===');
  {
    await middleware(req({ headers: { ...page, ...basic('lin', PASS) } })) === undefined
      ? OK('curl -u 帳號:密碼 可以直接通過') : E('正確的 Basic 被擋');
    const bad = [
      ['密碼錯', basic('lin', 'wrong')],
      ['帳號錯', basic('someone', PASS)],
      ['不是 Basic', { authorization: 'Bearer abcdefg' }],
      ['base64 壞掉', { authorization: 'Basic !!!not-base64!!!' }],
      ['沒有冒號', { authorization: 'Basic ' + Buffer.from('linn2').toString('base64') }]
    ];
    let n = 0;
    for (const [name, h] of bad) {
      const r = await middleware(req({ headers: { ...page, ...h } }));
      if (!r || r.status !== 401) { E(`「${name}」竟然放行`); n++; }
    }
    n === 0 ? OK(`${bad.length} 種錯誤的 Basic 全部擋下`) : E(`${n} 種沒擋`);
  }

  console.log('\n=== 7. 轉址不能被拿來當跳板 ===');
  {
    const evil = ['https://evil.test/x', '//evil.test/x', 'javascript:alert(1)', LOGIN];
    let bad = 0;
    for (const next of evil) {
      const r = await middleware(req({
        method: 'POST', path: LOGIN + '?next=' + encodeURIComponent(next),
        headers: page, form: { u: 'lin', p: PASS }
      }));
      if (r.headers.get('location') !== '/') {
        E(`next=${next} → ${r.headers.get('location')}`); bad++;
      }
    }
    bad === 0 ? OK(`${evil.length} 種外部網址都被改回站內首頁`) : E(`${bad} 個可被導向外部`);
  }

  console.log('\n=== 8. 非 ASCII 帳密 ===');
  {
    env.SITE_USER = 'リン'; env.SITE_PASS = '日本語N2';
    const r = await middleware(req({
      method: 'POST', path: LOGIN, headers: page, form: { u: 'リン', p: '日本語N2' }
    }));
    r.status === 303 ? OK('帳密含日文也能登入') : E('非 ASCII 帳密失敗');
    await middleware(req({ headers: { ...page, cookie: cookieOf(r) } })) === undefined
      ? OK('發出的 cookie 也能通過驗證') : E('非 ASCII 密碼簽出的 cookie 驗不過');
    env.SITE_USER = 'lin'; env.SITE_PASS = PASS;
  }

  console.log('\n=== 9. 只設密碼、不設帳號 ===');
  {
    delete env.SITE_USER;
    const r = await middleware(req({ headers: page }));
    !/name="u"/.test(await r.text()) ? OK('表單只問密碼，不顯示帳號欄') : E('不該有帳號欄');
    const r2 = await middleware(req({
      method: 'POST', path: LOGIN, headers: page, form: { p: PASS }
    }));
    r2.status === 303 ? OK('只填密碼就能登入') : E('只設密碼時登不進去');
    env.SITE_USER = 'lin';
  }

  console.log('\n=== 10. matcher 涵蓋範圍 ===');
  {
    const re = new RegExp('^' + config.matcher[0].replace(/^\//, '\\/') + '$');
    ['/', '/index.html', '/data/vocab_list.js', '/js/app.js', '/css/style.css', LOGIN]
      .every(p => re.test(p)) ? OK('首頁、資料檔、程式檔、樣式、登入路徑都在範圍內')
      : E('有路徑沒被涵蓋');
    !re.test('/_vercel/insights/script.js')
      ? OK('排除 Vercel 內部路徑') : E('不該擋 _vercel');
  }

  console.log('\n=== 11. 部署設定 ===');
  {
    const root = path.join(__dirname, '..');
    const vc = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    vc.buildCommand === undefined
      ? OK('vercel.json 沒有停用 build，middleware 才會被編譯')
      : E('buildCommand 被設成 ' + JSON.stringify(vc.buildCommand));
    !fs.existsSync(path.join(root, '.env'))
      ? OK('專案裡沒有 .env，帳密只放在 Vercel 後台') : E('出現 .env 檔');
    const mw = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');
    !/SITE_PASS\s*=\s*['"]/.test(mw)
      ? OK('middleware.js 裡沒有寫死密碼') : E('密碼被寫死在程式裡');
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    /^\.env$/m.test(gi) ? OK('.env 有進 .gitignore') : E('.env 沒被忽略');
  }

  console.log('\n' + (errs.length ? `❌ ${errs.length} 個問題` : '✅ 全部通過'));
  process.exit(errs.length ? 1 : 0);

})();
