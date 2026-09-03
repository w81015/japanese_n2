/**
 * HTTP Basic 驗證 —— 在 Vercel 的 Edge Middleware 執行，擋在所有靜態檔案之前。
 *
 * 沒通過驗證就連 HTML 都拿不到，跟前端密碼框不同（那種只是把畫面蓋住，
 * data/*.js 照樣能下載）。
 *
 * 帳密放在 Vercel 的環境變數，不進版控：
 *   SITE_USER / SITE_PASS
 * 兩個都沒設的話就完全不擋，本機用 `vercel dev` 或直接開 index.html 不受影響。
 */

export const config = {
  // 靜態資源與 favicon 也一起擋；排除 Vercel 內部路徑
  matcher: ['/((?!_vercel|_next/static).*)']
};

/** 不論字串長短都跑完，避免用回應時間猜密碼 */
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= x.charCodeAt(i % x.length || 0) ^ y.charCodeAt(i % y.length || 0);
  }
  return diff === 0;
}

function unauthorized() {
  return new Response('需要登入', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="N2 日本語", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      // 未驗證的回應不要被任何快取留下來
      'Cache-Control': 'no-store'
    }
  });
}

export default function middleware(request) {
  const user = process.env.SITE_USER;
  const pass = process.env.SITE_PASS;

  // 沒設定帳密就不啟用，避免自己把自己鎖在外面
  if (!user || !pass) return;

  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('basic ')) return unauthorized();

  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch (e) {
    return unauthorized();
  }

  const i = decoded.indexOf(':');
  if (i < 0) return unauthorized();

  const okUser = safeEqual(decoded.slice(0, i), user);
  const okPass = safeEqual(decoded.slice(i + 1), pass);
  if (!okUser || !okPass) return unauthorized();

  // 通過就放行給後面的靜態檔案
  return;
}
