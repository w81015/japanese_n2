/**
 * 登入保護 —— 在 Vercel 的 Edge Middleware 執行，擋在所有靜態檔案之前。
 *
 * 沒通過驗證就連 HTML 都拿不到，跟前端密碼框不同（那種只是把畫面蓋住，
 * data/*.js 照樣能下載）。
 *
 * 為什麼不用瀏覽器內建的 Basic 登入框：Vercel 會把回應裡的 WWW-Authenticate
 * 標頭拿掉，瀏覽器因此不會跳出對話框，只會顯示 401 的內容。所以這裡自己給一頁
 * 登入表單，驗證過就發一個簽名的 cookie（180 天），手機加到主畫面也不會一直問。
 *
 * 帳密放在 Vercel 的環境變數，不進版控：
 *   SITE_USER（可留空）／ SITE_PASS
 * SITE_PASS 沒設的話就完全不擋，本機直接開 index.html 不受影響。
 */

export const config = {
  // 靜態資源與 favicon 也一起擋；排除 Vercel 內部路徑
  matcher: ['/((?!_vercel|_next/static).*)']
};

const COOKIE = 'n2_auth';
const MAX_AGE = 60 * 60 * 24 * 180;   // 180 天
const LOGIN_PATH = '/__login';
const ENC = new TextEncoder();

/** 不論字串長短都跑完，避免用回應時間猜密碼 */
function safeEqual(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length, 1);
  for (let i = 0; i < n; i++) {
    diff |= (x.charCodeAt(i) | 0) ^ (y.charCodeAt(i) | 0);
  }
  return diff === 0;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(value));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** cookie 內容是「到期時間.簽章」，改了任何一邊簽章就對不起來 */
async function issue(secret) {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return exp + '.' + await hmac(exp, secret);
}

async function valid(token, secret) {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 0) return false;
  const exp = token.slice(0, i);
  if (!/^\d{1,15}$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(token.slice(i + 1), await hmac(exp, secret));
}

function cookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const j = part.indexOf('=');
    if (j > 0 && part.slice(0, j).trim() === name) return part.slice(j + 1).trim();
  }
  return '';
}

/** 只允許站內路徑，避免被拿來當跳板 */
function safeNext(v) {
  return (typeof v === 'string' && /^\/(?!\/)/.test(v) && v !== LOGIN_PATH) ? v : '/';
}

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function loginPage(request, opts) {
  const needUser = opts.needUser, next = opts.next, error = opts.error;
  // 非網頁請求（例如 js/css）就不必回一整頁 HTML
  const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
  if (!wantsHtml) {
    return new Response('需要登入', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>N2 日本語</title>
<style>
  :root{color-scheme:light dark;--bg:#faf8f5;--fg:#1c1a17;--mut:#6b645c;
        --line:#ded7cd;--card:#fff;--accent:#b4462f}
  @media (prefers-color-scheme:dark){
    :root{--bg:#16150f;--fg:#eee8dd;--mut:#9a9287;--line:#33302a;
          --card:#201e18;--accent:#e0785c}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
       background:var(--bg);color:var(--fg);
       font:16px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans TC",sans-serif}
  form{width:100%;max-width:340px;background:var(--card);border:1px solid var(--line);
       border-radius:16px;padding:28px 24px}
  h1{margin:0 0 4px;font-size:22px;letter-spacing:.06em}
  .sub{margin:0 0 22px;color:var(--mut);font-size:13px}
  label{display:block;margin-bottom:14px;font-size:13px;color:var(--mut)}
  input{display:block;width:100%;margin-top:6px;padding:11px 12px;font-size:16px;
        color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:9px}
  input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
  button{width:100%;margin-top:8px;padding:12px;font-size:16px;font-weight:600;
         color:#fff;background:var(--accent);border:0;border-radius:9px;cursor:pointer}
  .err{margin:0 0 16px;padding:9px 12px;border-radius:9px;font-size:13px;
       color:var(--accent);background:rgba(180,70,47,.12)}
</style>
</head>
<body>
<form method="post" action="${esc(LOGIN_PATH)}?next=${encodeURIComponent(next)}">
  <h1>N2 日本語</h1>
  <p class="sub">請先登入</p>
  ${error ? '<p class="err">' + esc(error) + '</p>' : ''}
  ${needUser ? `<label>帳號
    <input name="u" autocomplete="username" autocapitalize="off"
           autocorrect="off" spellcheck="false" required autofocus>
  </label>` : ''}
  <label>密碼
    <input name="p" type="password" autocomplete="current-password"
           required${needUser ? '' : ' autofocus'}>
  </label>
  <button type="submit">進入</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export default async function middleware(request) {
  const user = process.env.SITE_USER || '';
  const pass = process.env.SITE_PASS || '';

  // 沒設密碼就不啟用，避免自己把自己鎖在外面
  if (!pass) return;

  const url = new URL(request.url);

  // 送出登入表單
  if (request.method === 'POST' && url.pathname === LOGIN_PATH) {
    const next = safeNext(url.searchParams.get('next'));
    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return loginPage(request, { needUser: !!user, next: next, error: '表單讀取失敗，請再試一次' });
    }
    const okUser = !user || safeEqual(form.get('u'), user);
    const okPass = safeEqual(form.get('p'), pass);
    if (!okUser || !okPass) {
      return loginPage(request, { needUser: !!user, next: next, error: '帳號或密碼不正確' });
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: next,
        'set-cookie': COOKIE + '=' + await issue(pass) +
          '; Path=/; Max-Age=' + MAX_AGE + '; HttpOnly; Secure; SameSite=Lax',
        'cache-control': 'no-store'
      }
    });
  }

  // 已經登入過
  if (await valid(cookie(request, COOKIE), pass)) return;

  // 保留 Basic 驗證，方便用 curl -u 檢查
  const header = request.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('basic ')) {
    let decoded = '';
    try { decoded = atob(header.slice(6).trim()); } catch (e) { decoded = ''; }
    const i = decoded.indexOf(':');
    if (i >= 0 &&
        (!user || safeEqual(decoded.slice(0, i), user)) &&
        safeEqual(decoded.slice(i + 1), pass)) return;
  }

  return loginPage(request, {
    needUser: !!user,
    next: safeNext(url.pathname + url.search),
    error: ''
  });
}
