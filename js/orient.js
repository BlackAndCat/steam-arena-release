// 横屏模式：手机浏览器不肯转屏时（微信 / QQ 内置浏览器、手机开了竖屏锁定），把整个游戏转 90° 显示。
// 做法：打开「横屏模式」后本页只当外壳——不跑游戏，铺一个 iframe 载入同一个首页，竖屏时把 iframe 转 90°。
// 游戏在 iframe 里看到的就是一块横着的窗口：媒体查询、vh、innerWidth、触点坐标都由浏览器换算好，游戏代码不用改。
// 手机真的横过来（浏览器跟着转了）时 iframe 不旋转，直接铺满。设置开关记在 localStorage（sa-land / sa-land-flip）。
// 必须紧跟 js/release.js 加载：外壳模式下用 <plaintext> 吞掉后面的脚本标签，外层页面不再加载游戏。
window.SA = window.SA || {};
(function () {
  const KEY = 'sa-land', FLIP = 'sa-land-flip', QUERY = /(?:^|[?&])land=1(?:&|$)/;
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return read(k) === v; } catch (e) { return false; } };
  // 父页面是本游戏的横屏外壳（同源）就说明游戏正在外壳里；被别的网站嵌入时读不到父页面，照常当顶层处理
  const shell = (() => { try { return window.parent !== window && window.parent.SA_SHELL ? window.parent.SA_SHELL : null; } catch (e) { return null; } })();
  const touch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  // 回到普通页面：网址上挂着 land=1 就去掉再打开，否则原地重载（只改 # 不会重载）
  const plain = () => {
    const search = location.search.replace(/([?&])land=1(&|$)/, (m, a, b) => (b ? a : '')).replace(/[?&]$/, '');
    if (search === location.search) location.reload(); else location.href = location.pathname + search + location.hash;
  };

  SA.Orient = {
    touch,
    on: () => !!shell,                       // 正在横屏外壳里
    can: () => !!shell || touch(),           // 设置里要不要给这个开关：手机 / 平板，或者已经开着
    rotated: () => !!shell && shell.rotated(),
    enter() {
      if (write(KEY, '1')) location.reload();
      else location.href = location.pathname + (location.search ? location.search + '&' : '?') + 'land=1' + location.hash;   // 存不了设置（隐私模式）就挂在网址上
    },
    exit() {
      write(KEY, null);
      if (shell) shell.exit(); else plain();
    },
    flip() {
      write(FLIP, read(FLIP) === '1' ? null : '1');
      if (shell) shell.layout();
    },
  };
  if (shell) { document.documentElement.classList.add('sa-inshell'); return; }
  if (read(KEY) !== '1' && !QUERY.test(location.search)) return;
  if (!document.body || typeof document.write !== 'function') return;

  // ---------- 外壳 ----------
  const root = document.documentElement;
  root.classList.add('sa-shell');
  for (const id of ['sa-text-startup-hide', 'app', 'modal', 'toast']) { const el = document.getElementById(id); if (el) el.remove(); }
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  const css = document.createElement('style');
  css.textContent = 'html.sa-shell,html.sa-shell body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;background:#0b0e15;opacity:1}'
    + '.sa-shell-safe{position:fixed;top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);visibility:hidden;pointer-events:none}'
    + '.sa-shell-frame{position:fixed;left:0;top:0;display:block;border:0;margin:0;padding:0;transform-origin:0 0;background:#0b0e15}';
  document.head.append(css);
  const safe = document.createElement('div');
  safe.className = 'sa-shell-safe';
  const frame = document.createElement('iframe');
  frame.className = 'sa-shell-frame';
  frame.setAttribute('allow', 'fullscreen');
  frame.src = location.pathname + location.search + location.hash;
  let rot = false;
  function layout() {
    const r = safe.getBoundingClientRect();
    let x = r.left, y = r.top, w = r.width, hh = r.height;
    if (!(w > 0 && hh > 0)) { x = 0; y = 0; w = window.innerWidth; hh = window.innerHeight; }
    x = Math.round(x); y = Math.round(y); w = Math.round(w); hh = Math.round(hh);
    rot = hh > w;
    const s = frame.style;
    // 默认手机逆时针横过来（顶部朝左，大多数横屏游戏的方向）：画面顶边贴着屏幕右边；翻转 = 顺时针横过来
    if (!rot) { s.width = `${w}px`; s.height = `${hh}px`; s.transform = `translate(${x}px,${y}px)`; }
    else if (read(FLIP) !== '1') { s.width = `${hh}px`; s.height = `${w}px`; s.transform = `translate(${x + w}px,${y}px) rotate(90deg)`; }
    else { s.width = `${hh}px`; s.height = `${w}px`; s.transform = `translate(${x}px,${y + hh}px) rotate(-90deg)`; }
    root.dataset.rot = rot ? '1' : '0';
  }
  window.SA_SHELL = {
    layout,
    rotated: () => rot,
    exit: plain,
  };
  document.body.append(safe, frame);
  layout();
  window.addEventListener('resize', layout);
  // iOS 转屏后尺寸要过一会儿才稳定，再补两次
  window.addEventListener('orientationchange', () => { layout(); setTimeout(layout, 250); setTimeout(layout, 700); });
  frame.addEventListener('load', () => {
    layout();
    try { document.title = frame.contentDocument.title || document.title; } catch (e) { /* 同源才读得到 */ }
    try { frame.contentWindow.focus(); } catch (e) { /* 外接键盘才用得到 */ }
  });
  // 外层不再加载游戏：后面的脚本标签全部当成看不见的纯文本
  document.write('<plaintext style="display:none">');
})();
