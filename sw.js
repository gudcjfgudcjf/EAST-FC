/* EAST FC 풋볼 매니저 — 서비스워커 v1 (앱 v138, 2026-10-26)
   원칙
   · 앱 본문(index.html)은 늘 네트워크 우선 → 깃허브에 새 파일을 올리면 다음에 열 때 바로 새 버전. 친구들이 뭘 다시 할 필요 없음
   · 네트워크가 없거나 8초 안에 응답이 없거나 깃허브가 오류 페이지를 주면 → 마지막으로 받아 둔 화면을 보여줌(운동장 오프라인 대비)
   · Firebase 실시간 DB · 카카오 API 요청은 절대 건드리지 않고 그대로 통과(캐시 X)
   · 캐시하는 건 앱 본문 · 아이콘 · manifest, 그리고 버전이 박힌 SDK 스크립트·웹폰트(있으면 바로 쓰고 뒤에서 새로 받아 둠)
   이 파일은 자주 바꿀 필요가 없음 — 앱 본문이 바뀌어도 그대로 동작. 캐시 이름만 올리면 옛 캐시는 자동으로 지워짐 */
const CACHE = 'efm-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-512-maskable.png'];
const SDK_HOSTS = ['www.gstatic.com', 't1.kakaocdn.net', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NET_TIMEOUT = 8000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나가 없어도(예: 로컬 테스트) 설치가 실패하지 않게 하나씩
    await Promise.allSettled(SHELL.map(async u => { const r = await fetch(u, { cache: 'reload' }); if (r && r.ok) await c.put(u, r); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); });
// 화면(내비게이션)은 주소 뒤 ?code ?vote ?ps 같은 걸 떼고 한 키로 저장 — 어떤 링크로 들어와도 같은 본문
const navKey = req => { const u = new URL(req.url); u.search = ''; u.hash = ''; return u.pathname.endsWith('/') ? u.href : u.href; };

async function netFirst(req) {
  const c = await caches.open(CACHE); const key = navKey(req);
  const hit = async () => (await c.match(key)) || (await c.match('./'));
  try {
    const r = await withTimeout(fetch(req), NET_TIMEOUT);
    if (r && r.ok) { c.put(key, r.clone()); return r; }
    const h = await hit(); return h || r;          // 깃허브가 404/5xx 를 주면 저장된 화면
  } catch (e) {
    const h = await hit(); if (h) return h; throw e;
  }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE); const h = await c.match(req); if (h) return h;
  const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r;
}
// 있으면 바로 쓰고, 뒤에서 새로 받아 다음을 위해 저장 — 잘못 저장된 게 있어도 다음 열 때 스스로 고쳐짐
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE); const h = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return h || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (err) { return; }
  if (req.mode === 'navigate') { e.respondWith(netFirst(req)); return; }
  if (url.origin === self.location.origin) {
    if (/\.(png|webmanifest|json)$/.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(netFirst(req)); return;        // 같은 곳의 html 등
  }
  if (SDK_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  // 그 외(Firebase DB · 카카오 API · 외부 링크)는 손대지 않음
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'EFM_PING' && e.source) e.source.postMessage({ type: 'EFM_PONG', cache: CACHE });
});
