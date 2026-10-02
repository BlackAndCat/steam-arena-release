// 界面像素件（界面重建 v3，2026-09-30 用户通过；样机见 tools/ui-lab.html）：框、按钮、齿轮、数字、笔迹都用代码逐像素画，放大 2 倍显示（全界面一种像素大小）。
// 规矩同 docs/art-style.md：四阶色 [描边, 暗, 固有, 亮]，左上光，不抗锯齿，不旋转，渐变用 Bayer 抖动。
// SA.PX = 画法（九宫格皮肤挂到 CSS 变量 --sk-*、齿轮、像素数字、木纹、笔迹……）；SA.PX.ui = 界面件（DOM，类名带 px- 前缀，样式在 css/style.css）。
window.SA = window.SA || {};

SA.PX = (() => {
  const P = SA.PAL, S = 2;   // 一个美术像素 = 2 CSS 像素
  const RAMP = {
    iron: { o: P.dark[0], d: P.iron[0], b: P.iron[1], l: P.iron[2], h: P.iron[3], hh: P.iron[4] },
    brass: { o: P.brass[0], d: P.brass[1], b: P.brass[2], l: P.brass[3] },
    paper: { o: P.paper[0], d: P.paper[1], a: P.paper[2], b: P.paper[3], l: P.paper[4], s: P.paper[2] },
    kraft: { o: P.kraft[0], d: P.kraft[1], b: P.kraft[3], l: P.kraft[4], s: P.kraft[2] },
    wood: { o: '#1e120a', d: P.leather[0], b: P.leather[1], l: P.leather[2] },
    fire: { o: P.fire[0], d: '#8c2a14', b: P.fire[1], l: P.fire[2] },
    flat: { o: P.dark[0], d: P.dark[1], b: P.dark[2], l: P.dark[3] },
    board: { o: P.dark[0], b: P.board[1], l: P.board[2], d: P.board[0] },
    blue: { o: P.blueprint[0], b: P.blueprint[1], g: P.blueprint[2], G: P.blueprint[3], ink: P.blueprint[4] },
  };
  const INK = P.ink, RED = P.fire[1], CHALK = '#e8e3d2';
  const NOTE = { o: '#6a5520', d: '#c9b25c', a: '#e2cc72', b: '#f4e49a', l: '#fff6c4', s: '#e9d886' };   // 便签的黄
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const hash = (x, y, s = 1) => { let v = (x * 374761393 + y * 668265263 + s * 982451653) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };

  function C(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const k = { c, g, w, h, p(x, y, col) { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }, r(x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, clr(x, y) { g.clearRect(x, y, 1, 1); } };
    return k;
  }
  // 四阶方块：描边 + 左上亮 + 右下暗；inset = 凹进去（亮暗对调）
  function box(k, x, y, w, h, R, inset) {
    k.r(x, y, w, h, R.o); k.r(x + 1, y + 1, w - 2, h - 2, R.b);
    k.r(x + 1, y + 1, w - 2, 1, inset ? R.d : R.l); k.r(x + 1, y + 1, 1, h - 2, inset ? R.d : R.l);
    k.r(x + 1, y + h - 2, w - 2, 1, inset ? R.l : R.d); k.r(x + w - 2, y + 1, 1, h - 2, inset ? R.l : R.d);
  }
  function box0(k, w, h, R) { k.r(0, 0, w, 1, R.o); k.r(0, h - 1, w, 1, R.o); k.r(0, 0, 1, h, R.o); k.r(w - 1, 0, 1, h, R.o); k.r(1, 1, w - 2, 1, R.l); k.r(1, 1, 1, h - 2, R.l); k.r(1, h - 2, w - 2, 1, R.d); k.r(w - 2, 1, 1, h - 2, R.d); }
  const rivet = (k, x, y, R = RAMP.iron) => { k.r(x, y, 2, 2, R.h); k.p(x, y, R.hh || R.l); k.p(x + 2, y + 1, R.o); k.p(x + 1, y + 2, R.o); k.p(x + 2, y + 2, R.d); };
  const brassRivet = (k, x, y) => { k.r(x, y, 2, 2, P.brass[2]); k.p(x, y, P.brass[3]); k.p(x + 2, y + 1, P.brass[0]); k.p(x + 1, y + 2, P.brass[0]); k.p(x + 2, y + 2, P.brass[0]); };
  function line(k, x0, y0, x1, y1, col, gap = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy, i = 0;
    for (;;) { if (!gap || hash(x0, y0, 7) > gap) k.p(x0, y0, col); i++; if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }

  // ---------- 木纹：一根根长纹线（不要零散杂点），偶尔一个节疤；vertical = 竖纹（柱子）----------
  function woodGrain(k, x0, y0, w, h, R, seed, mask, vertical) {
    const put = vertical ? (x, y, c) => k.p(y, x, c) : (x, y, c) => k.p(x, y, c);
    const inb = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && (!mask || mask(x, y));
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (inb(x, y)) put(x, y, R.b);
    const n = Math.max(2, Math.round(h / 3.2));
    for (let i = 0; i < n; i++) {
      let y = y0 + 1 + Math.floor(hash(i, 1, seed) * Math.max(1, h - 2));
      const col = hash(i, 2, seed) < 0.72 ? R.d : R.l, step = 14 + Math.floor(hash(i, 5, seed) * 18);
      const x = x0 + Math.floor(hash(i, 3, seed) * w * 0.6) - Math.floor(w * 0.2), len = Math.floor(w * (0.45 + hash(i, 4, seed) * 0.7));
      for (let t = 0; t < len; t++) {
        if (t && t % step === 0) y += hash(i * 31 + t, 6, seed) < 0.5 ? -1 : 1;
        y = Math.max(y0 + 1, Math.min(y0 + h - 2, y));
        if (inb(x + t, y)) put(x + t, y, col);
      }
    }
    const knots = Math.floor(w * h / 1100);
    for (let i = 0; i < knots; i++) {
      const cx = x0 + 5 + Math.floor(hash(i, 7, seed) * Math.max(1, w - 10)), cy = y0 + 2 + Math.floor(hash(i, 8, seed) * Math.max(1, h - 4));
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [1, 1], [0, 1], [-1, 1]]) if (inb(cx + dx, cy + dy)) put(cx + dx, cy + dy, R.d);
      if (inb(cx, cy)) put(cx, cy, R.o);
    }
  }
  const nail = (k, x, y) => { k.r(x, y, 2, 2, P.iron[2]); k.p(x, y, P.iron[4]); k.p(x + 1, y + 1, P.dark[0]); };
  // ---------- 笔迹：红笔手画的圈、波浪下划线、带箭头的注释线（画在纸上）----------
  const PEN = P.fire[1];
  function penLoop(w, h, col = PEN, seed = 5) {
    const k = C(w, h), cx = (w - 1) / 2, cy = (h - 1) / 2, a0 = -2.4 + hash(1, 1, seed) * 0.8, rx = cx - 1.2, ry = cy - 1.2;
    for (let t = 0; t <= 1.13; t += 0.0015) {
      const a = a0 + t * Math.PI * 2, wob = 1 + 0.045 * Math.sin(a * 2 + seed) + 0.025 * Math.sin(a * 5 + seed * 2), sh = t > 1 ? (t - 1) * 1.1 : 0;
      const x = Math.round(cx + Math.cos(a) * rx * (wob - sh * 0.5)), y = Math.round(cy + Math.sin(a) * ry * (wob - sh));
      k.p(x, y, col); if (t > 0.12 && t < 0.5) k.p(x, y + (Math.sin(a) > 0 ? -1 : 1), col);
    }
    return k.c;
  }
  function penUnder(w, col = PEN, seed = 3) {
    const k = C(w, 5);
    for (let x = 0; x < w; x++) { const y = 2 + Math.round(Math.sin(x / 4.2 + seed) * 1.2); k.p(x, y, col); if (x > 2 && x < w * 0.6) k.p(x, y + 1, col); }
    return k.c;
  }
  // pts = 三个点（起点、弯曲控制点、终点），终点画箭头
  function penArrow(w, h, pts, col = PEN) {
    const k = C(w, h), [[x0, y0], [x1, y1], [x2, y2]] = pts;
    for (let t = 0; t <= 1; t += 0.004) { const u = 1 - t; k.p(Math.round(u * u * x0 + 2 * u * t * x1 + t * t * x2), Math.round(u * u * y0 + 2 * u * t * y1 + t * t * y2), col); }
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    for (const s of [1, -1]) line(k, x2, y2, x2 - ux * 4 + uy * 3 * s, y2 - uy * 4 - ux * 3 * s, col);
    return k.c;
  }
  // 毛笔大字（海报标题）：用行楷 / 舒体 / 楷体在小画布上写，每个字随机歪一点、大小不一、上下错落，
  // 再二值化成硬像素（不抗锯齿），配一道硬投影和几点甩出来的墨点。放大 2 倍显示，和全界面同一种像素大小
  function brush(text, size = 40, col = RED, shadow = INK, seed = 7) {
    const chars = [...text], pad = Math.ceil(size * 0.35), TW = Math.ceil(chars.length * size + pad * 2), TH = Math.ceil(size * 1.6);
    const t = document.createElement('canvas'); t.width = TW; t.height = TH;
    const g = t.getContext('2d'); g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      const sz = size * (0.9 + hash(i, 1, seed) * 0.3), a = (hash(i, 2, seed) - 0.5) * 0.26, dy = (hash(i, 3, seed) - 0.5) * size * 0.18;
      g.save(); g.translate(pad + size * (i + 0.5), TH / 2 + dy); g.rotate(a);
      g.font = `bold ${Math.round(sz)}px "STXingkai","华文行楷","FZShuTi","方正舒体","STKaiti","华文楷体","KaiTi","楷体",serif`;
      g.fillText(ch, 0, 0); g.restore();
    });
    const d = g.getImageData(0, 0, TW, TH).data, on = (x, y) => x >= 0 && y >= 0 && x < TW && y < TH && d[(y * TW + x) * 4 + 3] > 120;
    const k = C(TW + 3, TH + 3);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (on(x, y)) k.p(x + 2, y + 2, shadow);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (on(x, y)) k.p(x, y, col);
    for (let i = 0; i < 9; i++) { const x = Math.floor(hash(i, 5, seed) * TW), y = Math.floor(hash(i, 6, seed) * TH); if (on(x - 3, y) || on(x + 3, y) || on(x, y - 3)) { k.p(x, y, col); if (i % 3 === 0) k.p(x + 1, y, col); } }   // 甩出来的墨点
    return trim(k.c);
  }
  // 图钉（钉海报）和胶带（贴便签）
  function pin() { const k = C(8, 10); k.r(1, 0, 6, 6, P.fire[0]); k.r(2, 1, 4, 4, P.fire[1]); k.r(2, 1, 2, 2, P.fire[3]); k.r(3, 6, 2, 1, P.dark[0]); k.r(4, 7, 1, 3, P.iron[3]); k.clr(1, 0); k.clr(6, 0); k.clr(1, 5); k.clr(6, 5); return k.c; }
  function tape(w = 26) { const k = C(w, 8); k.g.globalAlpha = 0.78; k.r(0, 0, w, 8, '#d8c48c'); k.g.globalAlpha = 1; k.r(0, 0, w, 1, '#efe0b0'); for (let y = 0; y < 8; y += 2) { k.clr(0, y); k.clr(w - 1, y + 1); } return k.c; }

  // 贴在木牌上的纸条：毛边、左边一片浆糊印、右上角翘起
  function paperLabel(w, h, seed = 3) {
    const k = C(w, h), R = RAMP.paper;
    paperFill(k, 0, 0, w, h, R, seed); deckle(k, w, h, R, seed);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < Math.min(9, w - 2); x++) if (bay(x, y) < 0.28) k.p(x, y, R.a);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4 - i; j++) k.clr(w - 1 - j, i);
    for (let i = 0; i < 4; i++) { k.p(w - 4 + i, i, R.o); if (i) k.p(w - 5 + i, i, R.l); }
    return k.c;
  }

  // ---------- 九宫格皮肤：{ url, c }，CSS 用 border-image: url c fill / (c*2)px repeat ----------
  const SKIN = {};
  function skin(name, c, m, paint) { const k = C(c * 2 + m, c * 2 + m); paint(k, k.w, k.h); SKIN[name] = { url: k.c.toDataURL(), c }; }
  function paperFill(k, x0, y0, w, h, R, seed, edge = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const hs = hash(x, y, seed);
      let col = R.b;
      if (hs < 0.03) col = R.s; else if (hs > 0.992) col = R.l;
      if (edge) { const e = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + h - 1 - y); if (e < edge && bay(x, y) > e / edge) col = R.a || R.s; }
      k.p(x, y, col);
    }
    // 纸纤维：稀疏的 2～3 像素短横
    for (let i = 0; i < w * h / 220; i++) { const x = x0 + Math.floor(hash(i, 3, seed) * (w - 3)), y = y0 + Math.floor(hash(i, 5, seed) * h); k.r(x, y, 2 + (i % 2), 1, hash(i, 9, seed) > 0.5 ? R.l : R.s); }
  }
  // 纸边（2026-09-30 用户：边上一圈零散的黑点像是后面还有内容）：一整圈连续的描边 + 里面一道受光 / 背光边 + band 宽的一圈旧纸色，
  // 全是平涂、不抖动，一眼看出「纸到这里为止」；四个角各切掉一个像素
  function deckle(k, w, h, R, seed, band = 1) {
    const o = R.o, l = R.l || R.b, a = R.a || R.s || R.b;
    for (let i = 1; i <= band; i++) { k.r(i, i, w - i * 2, 1, i === 1 ? l : a); k.r(i, i, 1, h - i * 2, i === 1 ? l : a); k.r(i, h - 1 - i, w - i * 2, 1, a); k.r(w - 1 - i, i, 1, h - i * 2, a); }
    k.r(0, 0, w, 1, o); k.r(0, h - 1, w, 1, o); k.r(0, 0, 1, h, o); k.r(w - 1, 0, 1, h, o);
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) { k.clr(x, y); k.p(x + dx, y + dy, o); }
  }
  function build() {
    // 铁板：平的，只在四角打铆钉；不要满屏纹理
    skin('iron', 6, 20, (k, w, h) => { box(k, 0, 0, w, h, RAMP.iron); for (const [x, y] of [[2, 2], [w - 5, 2], [2, h - 5], [w - 5, h - 5]]) rivet(k, x, y); });
    skin('ironIn', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, { o: P.dark[0], b: P.dark[1], l: P.iron[1], d: P.dark[0] }, true); });
    skin('brass', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.brass); k.r(2, 2, w - 5, 1, P.brass[3]); });
    skin('brassDn', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.brass, true); });
    skin('ironBtn', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.iron); for (const [x, y] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) brassRivet(k, x, y); });
    skin('ironBtnDn', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.iron, true); for (const [x, y] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) brassRivet(k, x, y); });
    skin('fire', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.fire); for (const [x, y] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) brassRivet(k, x, y); });
    skin('flat', 4, 16, (k, w, h) => { box(k, 0, 0, w, h, RAMP.flat); });
    skin('paper', 6, 40, (k, w, h) => { paperFill(k, 0, 0, w, h, RAMP.paper, 11); deckle(k, w, h, RAMP.paper, 11, 2); });
    skin('paperOld', 6, 40, (k, w, h) => { const R = { ...RAMP.paper, b: '#d4bf92', a: '#bba172', s: '#c2aa7a', l: '#e6d6ae' }; paperFill(k, 0, 0, w, h, R, 13); deckle(k, w, h, R, 13, 3); });
    skin('kraft', 4, 24, (k, w, h) => { paperFill(k, 0, 0, w, h, RAMP.kraft, 17); deckle(k, w, h, { ...RAMP.kraft, a: RAMP.kraft.d }, 17, 1); });
    skin('green', 4, 24, (k, w, h) => { const R = { o: '#2e3a26', b: '#cfdcb8', a: '#b8c89c', l: '#e2ecd0', s: '#bccb9f' }; paperFill(k, 0, 0, w, h, R, 19); deckle(k, w, h, R, 19, 2); });
    // 便签：黄纸、平涂边，右下角折起一个小角
    skin('note', 5, 30, (k, w, h) => { const R = NOTE; paperFill(k, 0, 0, w, h, R, 37); deckle(k, w, h, R, 37, 1);
      const cx = w - 5, cy = h - 5;   // 右下角 5×5：斜着切掉一角，折过来的那片画深一点
      for (let y = cy; y < h; y++) for (let x = cx; x < w; x++) { const u = x - cx, v = y - cy; if (u + v > 4) k.clr(x, y); else if (u + v === 4 || u === 0 || v === 0) k.p(x, y, R.o); else k.p(x, y, R.d); } });
    skin('wood', 5, 18, (k, w, h) => { woodGrain(k, 0, 0, w, h, RAMP.wood, 23); box0(k, w, h, RAMP.wood); });
    skin('board', 8, 32, (k, w, h) => {
      woodGrain(k, 0, 0, w, h, RAMP.wood, 29, (x, y) => x < 5 || y < 5 || x >= w - 5 || y >= h - 5); box0(k, w, h, RAMP.wood);
      for (let y = 5; y < h - 5; y++) for (let x = 5; x < w - 5; x++) k.p(x, y, hash(x >> 2, y >> 2, 29) < 0.18 && bay(x, y) < 0.35 ? RAMP.board.l : RAMP.board.b);
      k.r(5, 5, w - 10, 1, RAMP.board.d); k.r(5, 5, 1, h - 10, RAMP.board.d); k.r(4, 4, w - 8, 1, RAMP.wood.o); k.r(4, 4, 1, h - 8, RAMP.wood.o); k.r(4, h - 5, w - 8, 1, RAMP.wood.l); k.r(w - 5, 4, 1, h - 8, RAMP.wood.l);
    });
    skin('stamp', 3, 12, (k, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e < 2 && hash(x, y, 31) > 0.12) k.p(x, y, RED); } });
  }

  // ---------- 像素数字（5×7）：钱、数值、价格、评分都用它 ----------
  const G = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '£': ['00110', '01001', '01000', '11100', '01000', '01000', '11111'], ',': ['00', '00', '00', '00', '00', '01', '10'], '.': ['0', '0', '0', '0', '0', '0', '1'],
    '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'], '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
    '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'], '-': ['0000', '0000', '0000', '1111', '0000', '0000', '0000'],
    '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'], ':': ['0', '1', '0', '0', '0', '1', '0'],
    't': ['0100', '0100', '1110', '0100', '0100', '0101', '0010'], 'k': ['1000', '1000', '1001', '1010', '1100', '1010', '1001'],
    'm': ['00000', '00000', '11010', '10101', '10101', '10101', '10101'], 'h': ['1000', '1000', '1110', '1001', '1001', '1001', '1001'],
    'I': ['111', '010', '010', '010', '010', '010', '111'], 'V': ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
    '▲': ['00000', '00000', '00100', '01110', '11111', '00000', '00000'], '▼': ['00000', '00000', '11111', '01110', '00100', '00000', '00000'],
    ' ': ['00', '00', '00', '00', '00', '00', '00'], '→': ['00000', '00100', '00010', '11111', '00010', '00100', '00000'],
  };
  function numW(str) { let w = 0; for (const ch of str) w += ((G[ch] || G[' '])[0].length) + 1; return Math.max(1, w - 1); }
  function num(str, col = INK, o = {}) {
    str = String(str); const sh = o.shadow; const k = C(numW(str) + (sh ? 1 : 0), 7 + (sh ? 1 : 0));
    let x = 0;
    for (const ch of str) { const gl = G[ch] || G[' ']; gl.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') { if (sh) k.p(x + i + 1, y + 1, sh); } }); x += gl[0].length + 1; }
    x = 0;
    for (const ch of str) { const gl = G[ch] || G[' ']; gl.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') k.p(x + i, y, col); }); x += gl[0].length + 1; }
    return k.c;
  }

  // ---------- 齿轮：半径 R、n 个齿；ph = 转角；frames 张帧（转一个齿距）----------
  function gear(R, n, Rm = RAMP.brass, ph = 0, o = {}) {
    const sz = R * 2 + 1, k = C(sz, sz), c = R + 0.5, hole = o.hole == null ? R * 0.3 : o.hole;
    const inside = (x, y) => { const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy); if (d > R + 0.3) return false; if (d <= R - 1.7) return true; const t = (((Math.atan2(dy, dx) + ph) / (Math.PI * 2)) * n % 1 + 1) % 1; return t < 0.5; };
    for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
      if (!inside(x, y)) continue;
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      let col = Rm.b;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) col = Rm.o;
      else if (d < hole) col = Rm.o;
      else if (d < hole + 1.1) col = (dx + dy < 0) ? Rm.d : Rm.l;
      else if ((!inside(x - 1, y - 1) || !inside(x - 2, y - 1) || !inside(x - 1, y - 2))) col = Rm.l;
      else if ((!inside(x + 1, y + 1) || !inside(x + 2, y + 1) || !inside(x + 1, y + 2))) col = Rm.d;
      else if (o.spokes && d > R * 0.42 && d < R - 2.6 && Math.abs(Math.sin((Math.atan2(dy, dx) + ph) * o.spokes / 2)) > 0.55) col = Rm.d;
      k.p(x, y, col);
    }
    return k.c;
  }
  // 一整条齿轮帧（横排），给 CSS steps() 动画用
  function gearStrip(R, n, Rm, frames = 3) {
    const sz = R * 2 + 1, k = C(sz * frames, sz);
    for (let f = 0; f < frames; f++) k.g.drawImage(gear(R, n, Rm, (Math.PI * 2 / n) * f / frames), f * sz, 0);
    return { url: k.c.toDataURL(), sz, frames };
  }

  // ---------- 其余像素件 ----------
  // 五角星（声望）
  const STAR = ['...o...', '..ooo..', 'ooooooo', '.ooooo.', '..ooo..', '.oo.oo.', 'o.....o'];
  function star(on = true) { const k = C(7, 7); STAR.forEach((r, y) => { for (let x = 0; x < 7; x++) if (r[x] === 'o') k.p(x, y, on ? (y < 3 ? P.brass[3] : y < 5 ? P.brass[2] : P.brass[1]) : P.dark[2]); }); return k.c; }
  // 材料锭：wootz = 乌兹钢锭（紫）/ aether = 以太结晶（青）
  const INGOT = { wootz: ['#8f55d6', '#c8a4f0', '#5a2e96'], aether: ['#2fd6c4', '#a8f0ee', '#1f7a86'] };
  function ingot(kind = 'wootz') { const [col, hi, lo] = INGOT[kind] || INGOT.wootz, k = C(11, 6); k.r(1, 0, 9, 1, P.dark[0]); k.r(0, 1, 11, 5, P.dark[0]); k.r(1, 1, 9, 4, col); k.r(2, 1, 7, 1, hi); k.r(1, 4, 9, 1, lo); return k.c; }
  // 裁掉透明边
  function trim(src) {
    const g0 = src.getContext('2d', { willReadFrequently: true }), dd = g0.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (dd[(y * src.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return src;
    const k = C(x1 - x0 + 1, y1 - y0 + 1); k.g.drawImage(src, x0, y0, k.w, k.h, 0, 0, k.w, k.h); return k.c;
  }
  // 铜版画（报纸上的图）：明度拉伸后按档排横线，外轮廓和明暗交界描实线，火光套一点朱红
  function engrave(src, ink = [42, 26, 5], accent = null) {
    const w = src.width, hh = src.height, dd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data;
    const k = C(w, hh), out = k.g.createImageData(w, hh), o = out.data;
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= hh) ? 0 : dd[(y * w + x) * 4 + 3] > 8;
    const lum = (i) => (dd[i] * 0.3 + dd[i + 1] * 0.59 + dd[i + 2] * 0.11) / 255;
    let lo = 1, hi = 0;
    for (let i = 0; i < dd.length; i += 4) if (dd[i + 3] > 8) { const l = lum(i); if (l < lo) lo = l; if (l > hi) hi = l; }
    const L = (x, y) => Math.pow((lum((y * w + x) * 4) - lo) / Math.max(0.05, hi - lo), 0.7);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (!A(x, y)) continue;
      const put = (col) => { o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2]; o[i + 3] = 255; };
      if (accent && dd[i] > 200 && dd[i + 1] < 140 && dd[i + 2] < 90) { if ((x + y) % 2 === 0) put(accent); continue; }
      const edge = !A(x - 1, y) || !A(x + 1, y) || !A(x, y - 1) || !A(x, y + 1);
      const l = L(x, y), e = x + 1 < w && y + 1 < hh && A(x + 1, y) && A(x, y + 1) ? Math.max(Math.abs(l - L(x + 1, y)), Math.abs(l - L(x, y + 1))) : 0;
      let on = edge || e > 0.28;
      if (!on) { if (l < 0.18) on = y % 2 === 0 || x % 3 === 0; else if (l < 0.38) on = y % 2 === 0; else if (l < 0.6) on = y % 3 === 0; else if (l < 0.8) on = y % 4 === 0 && x % 2 === 0; }
      if (on) put(ink);
    }
    k.g.putImageData(out, 0, 0); return k.c;
  }
  // 回形针（黄铜丝）
  function clip() { const k = C(6, 15), B = RAMP.brass; const pts = ['.oooo.', 'o....o', 'o.oo.o', 'o.o..o', 'o.o..o', 'o.o..o', 'o.o..o', 'o.o..o', 'o.o..o', 'o.o..o', 'o.oo.o', 'o....o', 'o....o', '.o..o.', '..oo..']; pts.forEach((r, y) => { for (let x = 0; x < 6; x++) if (r[x] === 'o') k.p(x, y, x < 2 ? B.l : B.b); }); return k.c; }
  // 夹板的黄铜夹子
  function bigClip(w = 30) { const k = C(w, 11); box(k, 0, 2, w, 9, RAMP.brass); k.r(3, 0, w - 6, 3, P.brass[0]); k.r(4, 1, w - 8, 2, P.brass[2]); k.r(Math.floor(w / 2) - 4, 5, 8, 3, P.brass[0]); k.r(Math.floor(w / 2) - 3, 5, 6, 1, P.dark[0]); brassRivet(k, 2, 4); brassRivet(k, w - 5, 4); return k.c; }
  // 牛皮纸吊牌的头（尖角 + 黄铜鸡眼），接在九宫格身子左边
  function tagHead() { const k = C(8, 15), R = RAMP.kraft; for (let y = 0; y < 15; y++) { const inset = Math.abs(7 - y); for (let x = inset; x < 8; x++) k.p(x, y, x === inset ? R.o : (y === 0 || y === 14) ? R.o : R.b); } k.r(4, 6, 3, 3, P.brass[1]); k.p(4, 6, P.brass[3]); k.p(5, 7, P.dark[0]); return k.c; }
  // 气泡尾巴
  function tail() { const k = C(8, 6), R = RAMP.paper; for (let y = 0; y < 6; y++) for (let x = 0; x < 8 - y; x++) k.p(x, y, x === 0 || x === 7 - y ? R.o : R.b); k.r(0, 0, 8, 1, R.b); k.p(0, 0, R.o); k.p(7, 0, R.o); return k.c; }
  // 纸条的一段：横线（打过的划掉）、粉笔圈
  function chalkLine(w) { const k = C(w, 3); for (let x = 0; x < w; x++) { const y = x < w * 0.45 ? 1 : x < w * 0.8 ? 1 + (x % 7 === 0 ? 1 : 0) : 2 - (x > w * 0.92 ? 1 : 0); if (hash(x, 1, 41) > 0.1) k.p(x, y, CHALK); } return k.c; }
  function ellipse(w, h, col = CHALK, gap = 0.08, thick = 1) {
    const k = C(w, h), cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let t = 0; t < 1.06; t += 0.0025) { const a = t * Math.PI * 2 - 0.5, r = 1 + (t > 1 ? 0.04 : 0); const x = Math.round(cx + Math.cos(a) * (cx - 0.5) * r), y = Math.round(cy + Math.sin(a) * (cy - 0.5) * r); if (hash(x, y, 43) > gap) { k.p(x, y, col); if (thick > 1) k.p(x, y + 1, col); } }
    return k.c;
  }
  // 拉杆（调速杆）：铁底座 + 黄铜扇形齿板 + 三像素宽的铁杆 + 黄铜箍 + 皮握把，轴心是一只小黄铜齿轮
  // pos 0 = 往左扳到底（回院子，暗刻度）、0.5 = 立在正中（定位齿）、1 = 往右推到底（出战，红刻度）
  function lever(pos = 0) {
    const W = 50, H = 58, k = C(W, H), px = 25, py = 46, B = RAMP.brass;
    for (let y = 0; y < py; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.hypot(dx, dy), a = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (Math.abs(a) > 62 || dy > -3) continue;
      const tooth = d > 22 && d <= 24.6 && ((a + 64) % 8) < 4 && Math.abs(a) < 58;
      if (tooth) { k.p(x, y, d > 23.8 || ((a + 64) % 8) < 0.9 ? B.o : B.d); continue; }
      if (d < 16.2 || d > 22.2) continue;
      k.p(x, y, d < 17.1 || d > 21.3 || Math.abs(a) > 60 ? B.o : d < 18.2 ? B.l : a > 20 ? B.d : B.b);
    }
    // 两个刻度：待命（暗）/ 出战（红）
    for (const [ang, col] of [[-50, P.dark[0]], [50, P.fire[2]]]) { const r = ang * Math.PI / 180; k.r(Math.round(px + Math.sin(r) * 19.5) - 1, Math.round(py - Math.cos(r) * 19.5) - 1, 2, 2, col); }
    k.r(px - 1, py - 25, 2, 3, B.o); k.p(px - 1, py - 25, B.l);   // 正中的定位齿：杆平时立在这里
    box(k, 5, py, 40, 12, RAMP.iron); rivet(k, 8, py + 4); rivet(k, 39, py + 4);
    // 杆
    const ang = (-42 + 84 * pos) * Math.PI / 180, L = 31, ux = Math.sin(ang), uy = -Math.cos(ang), nx = -uy, ny = ux;
    for (let t = 0; t <= L; t += 0.5) { const cx = px + ux * t, cy = py + uy * t;
      k.p(Math.round(cx + nx * 1.4), Math.round(cy + ny * 1.4), P.dark[0]); k.p(Math.round(cx - nx * 1.4), Math.round(cy - ny * 1.4), P.dark[0]);
      k.p(Math.round(cx + nx * 0.5), Math.round(cy + ny * 0.5), P.iron[2]); k.p(Math.round(cx - nx * 0.5), Math.round(cy - ny * 0.5), P.iron[3]); }
    // 卡爪（咬在齿上）
    const cx0 = px + ux * 20, cy0 = py + uy * 20; k.r(Math.round(cx0) - 1, Math.round(cy0) - 1, 3, 3, P.dark[0]); k.p(Math.round(cx0), Math.round(cy0), P.iron[3]);
    // 黄铜箍 + 皮握把
    const gx = Math.round(px + ux * (L + 1)), gy = Math.round(py + uy * (L + 1));
    k.r(gx - 3, gy - 1, 7, 3, B.o); k.r(gx - 2, gy, 5, 1, B.l);
    k.r(gx - 3, gy - 9, 7, 9, P.leather[0]); k.r(gx - 2, gy - 8, 5, 7, P.leather[1]); k.r(gx - 2, gy - 8, 1, 7, P.leather[2]); k.clr(gx - 3, gy - 9); k.clr(gx + 3, gy - 9);
    // 轴心齿轮
    k.g.drawImage(gear(5, 7, RAMP.brass, 0.25 + pos), px - 5, py - 5);
    return k.c;
  }
  // ---------- 战斗仪表台（界面 A 驾驶台，2026-09-30 用户选定）----------
  // 压力表：黄铜外圈（hot = 烧红）+ 纸表盘 + 九道刻度 + 红区 + 指针；pct 0..1（略超 1 指针压过红区）
  function gauge(R, pct, red = 0.8, hot = false) {
    const D = R * 2 + 2, k = C(D, D), c = R + 0.5;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > R + 0.4) continue;
      const a = Math.atan2(x + 0.5 - c, -(y + 0.5 - c)) / Math.PI * 180, f = (a + 135) / 270;
      if (d > R - 1) k.p(x, y, hot ? P.fire[0] : P.brass[0]);
      else if (d > R - 3) k.p(x, y, hot ? (x + y < D ? P.fire[2] : P.fire[1]) : (x + y < D ? P.brass[3] : P.brass[1]));
      else if (d > R - 4) k.p(x, y, P.brass[0]);
      else if (d > R - 7 && d <= R - 5 && f >= red && f <= 1 && Math.abs(a) <= 135) k.p(x, y, P.fire[1]);
      else k.p(x, y, d < R - 9 ? RAMP.paper.l : RAMP.paper.b);
    }
    for (let i = 0; i <= 8; i++) { const a = (-135 + 270 * i / 8) * Math.PI / 180; k.p(Math.round(c - 0.5 + Math.sin(a) * (R - 5.5)), Math.round(c - 0.5 - Math.cos(a) * (R - 5.5)), INK); }
    const a = (-135 + 270 * Math.max(0, Math.min(1.04, pct))) * Math.PI / 180, m = Math.round(c - 0.5);
    line(k, m, m, Math.round(m + Math.sin(a) * (R - 6)), Math.round(m - Math.cos(a) * (R - 6)), pct >= red ? P.fire[1] : INK);
    k.r(m - 1, m - 1, 3, 3, P.brass[1]); k.p(m - 1, m - 1, P.brass[3]);
    return k.c;
  }
  // 竖液位管：上下黄铜盖 + 玻璃 + 液面（ramp 四阶，暗→亮）；warn = 玻璃框描红
  function tube(h, pct, ramp, warn = false) {
    const k = C(9, h);
    box(k, 0, 0, 9, 3, RAMP.brass); box(k, 0, h - 3, 9, 3, RAMP.brass);
    k.r(1, 3, 7, h - 6, warn ? P.fire[1] : P.dark[0]); k.r(2, 3, 5, h - 6, P.dark[1]);
    const lv = Math.round((h - 6) * Math.max(0, Math.min(1, pct)));
    for (let y = 0; y < lv; y++) { const yy = h - 4 - y; k.r(2, yy, 5, 1, ramp[2]); k.p(2, yy, ramp[3]); k.p(6, yy, ramp[1]); }
    if (lv) k.r(2, h - 3 - lv, 5, 1, ramp[3]);
    for (let y = 4; y < h - 4; y += 2) k.p(3, y, P.dark[3]);   // 玻璃上一道虚线反光
    return k.c;
  }
  // 指示灯：黄铜圈 + 玻璃（亮 = 灯色 + 白芯；暗 = 深玻璃）
  function lamp(on, col) {
    const k = C(11, 11);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const d = Math.hypot(x - 5, y - 5);
      if (d > 5.4) continue;
      if (d > 4.3) k.p(x, y, P.brass[0]);
      else if (d > 3.3) k.p(x, y, x + y < 9 ? P.brass[3] : P.brass[1]);
      else k.p(x, y, on ? (d < 1.6 ? '#fff4d8' : col) : (x + y < 9 ? P.dark[2] : P.dark[1]));
    }
    if (!on) k.p(4, 4, P.dark[3]);
    return k.c;
  }
  // 一排装甲片：n 片还在（黄铜）、其余打掉了（暗）
  function plates(n, of = 10) {
    const k = C(of * 6 + 1, 9);
    for (let i = 0; i < of; i++) { const on = i < n; box(k, i * 6, 0, 7, 9, on ? RAMP.brass : { o: P.dark[0], b: P.dark[1], l: P.dark[2], d: P.dark[0] }); if (on) k.p(i * 6 + 2, 2, P.brass[3]); }
    return k.c;
  }
  // 计时鼓：铁框 + 一格一格的纸字轮
  function drum(str) {
    const N = str.length, w = 6 + N * 8, k = C(w, 15);
    box(k, 0, 0, w, 15, RAMP.iron);
    box(k, 2, 2, N * 8 + 1, 11, { o: P.dark[0], b: P.dark[0], l: P.dark[0], d: P.dark[0] });
    [...str].forEach((ch, i) => {
      const x = 3 + i * 8, PR = RAMP.paper;
      for (let y = 3; y < 12; y++) k.r(x, y, 7, 1, y === 3 || y === 11 ? PR.d : y === 4 || y === 10 ? PR.a : PR.l);
      k.g.drawImage(num(ch, INK), x + 1, 4);
    });
    return k.c;
  }
  // 路标木牌：两块木板（长木纹、斜面、中缝）、箭头尖露出端面、靠柱子一头箍一条铁带、两颗铁钉、下沿磕掉两小块
  // 画的时候都按朝右画，dir = -1 时整张镜像（铁带就到了右边，贴着柱子）
  function sign(w, dir = 1, R = RAMP.wood, seed = 1) {
    const h = 26, tip = 12, k = C(w, h);
    const lim = (y) => w - Math.round(Math.abs(y - (h - 1) / 2) * tip / ((h - 1) / 2));   // 箭头尖：中间最长
    const put = (x, y, c) => k.p(dir > 0 ? x : w - 1 - x, y, c);
    const inside = (x, y) => y >= 0 && y < h && x >= 0 && x < lim(y);
    const kk = { p: put };
    woodGrain(kk, 0, 0, w, 12, R, seed, inside); woodGrain(kk, 0, 13, w, 13, R, seed + 5, inside);
    for (let x = 1; x < w; x++) { if (inside(x, 1)) put(x, 1, R.l); if (inside(x, 14)) put(x, 14, R.l); if (inside(x, 11)) put(x, 11, R.d); if (inside(x, 24)) put(x, 24, R.d); if (inside(x, 12)) put(x, 12, R.o); }
    for (let y = 0; y < h; y++) { const e = lim(y); if (e - 2 >= 0 && y !== 12) put(e - 2, y, R.l); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y) && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) put(x, y, R.o);
    for (const cx of [Math.round(w * 0.34), Math.round(w * 0.63)]) for (let x = cx; x < cx + 2; x++) { k.clr(dir > 0 ? x : w - 1 - x, h - 1); put(x, h - 2, R.o); }
    // 铁带（靠柱子一头）+ 两颗螺栓
    for (let y = 0; y < h; y++) { put(3, y, P.dark[0]); put(4, y, P.iron[3]); put(5, y, P.iron[2]); put(6, y, P.iron[1]); put(7, y, P.dark[0]); }
    for (const y of [4, 19]) { put(4, y, P.iron[4]); put(5, y, P.iron[3]); put(4, y + 1, P.iron[3]); put(5, y + 1, P.dark[0]); }
    // 靠箭头一头各钉一颗钉子
    for (const y of [5, 18]) { const x = lim(y) - 7; put(x, y, P.iron[4]); put(x + 1, y, P.iron[2]); put(x, y + 1, P.iron[2]); put(x + 1, y + 1, P.dark[0]); }
    return k.c;
  }
  // 竖木柱：竖纹 + 顶上一个小尖帽
  function post(hh = 290) {
    const w = 10, k = C(w, hh);
    woodGrain(k, 0, 0, hh, w, RAMP.wood, 61, null, true);
    k.r(0, 0, 1, hh, RAMP.wood.o); k.r(w - 1, 0, 1, hh, RAMP.wood.o); k.r(1, 0, 1, hh, RAMP.wood.l); k.r(w - 2, 0, 1, hh, RAMP.wood.d);
    k.r(0, 0, w, 1, RAMP.wood.o); k.r(1, 1, w - 2, 2, RAMP.wood.l);
    return k.c;
  }
  // 木箱：木纹板 + 斜撑 + 四颗钉子
  function crate(w = 40, h = 22) {
    const k = C(w, h), R = RAMP.wood;
    woodGrain(k, 0, 0, w, h, R, 71); box0(k, w, h, R);
    k.r(1, 7, w - 2, 1, R.o); k.r(1, 14, w - 2, 1, R.o);
    for (let i = 0; i < w - 4; i++) { const y = 2 + Math.round(i * (h - 5) / (w - 5)); k.p(2 + i, y, R.d); k.p(2 + i, y + 1, R.l); }
    for (const [x, y] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]]) nail(k, x, y);
    return k.c;
  }
  // 桌面 / 地板平铺块：两排长木板，接缝错开；只有木纹，没有杂点
  function planks(w = 128, h = 32) {
    const k = C(w, h), R = { o: '#1a0f08', d: '#291810', b: '#33200f', l: '#3f2814' };
    woodGrain(k, 0, 0, w, 15, R, 81); woodGrain(k, 0, 16, w, 16, R, 83);
    k.r(0, 15, w, 1, R.o); k.r(0, 31, w, 1, R.o); k.r(Math.round(w * 0.3), 0, 1, 15, R.o); k.r(Math.round(w * 0.78), 16, 1, 15, R.o);
    return k.c;
  }

  // ---------- 注册 CSS 变量 ----------
  let ready = false;
  const GEARS = {};
  function init(root = document.documentElement) {
    if (ready) return; ready = true;
    build();
    for (const [n, s] of Object.entries(SKIN)) root.style.setProperty(`--sk-${n}`, `url(${s.url})`);
    GEARS.btn = gearStrip(6, 8, RAMP.brass, 3); GEARS.btnIron = gearStrip(6, 8, RAMP.iron, 3);
    GEARS.small = gearStrip(4, 6, RAMP.brass, 3);
    root.style.setProperty('--gear-btn', `url(${GEARS.btn.url})`); root.style.setProperty('--gear-small', `url(${GEARS.small.url})`);
    root.style.setProperty('--px-desk', `url(${planks().toDataURL()})`);
    const b = C(32, 16);   // 砖墙：两排错缝砖
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const row = y >> 3, off = row ? 8 : 0, mort = (y % 8 === 7) || ((x + off) % 16 === 15); b.p(x, y, mort ? P.bg[0] : hash((x + off) >> 4, row, 9) < 0.5 ? P.bg[3] : P.bg[2]); if (!mort && (y % 8 === 0)) b.p(x, y, P.bg[4]); }
    root.style.setProperty('--px-brick', `url(${b.c.toDataURL()})`);
  }
  return { S, RAMP, INK, RED, CHALK, PEN, P, C, trim, engrave, box, rivet, brassRivet, line, num, numW, gear, gearStrip, star, ingot, clip, bigClip, tagHead, tail, chalkLine, ellipse, lever, gauge, tube, lamp, plates, drum, sign, post, crate, planks, paperLabel, brush, pin, tape, NOTE, penLoop, penUnder, penArrow, woodGrain, init, SKIN, GEARS, hash, bay };
})();

// ---------- 界面件（DOM）：游戏和样机页共用。类名都带 px- 前缀，样式在 css/style.css「像素界面件」一节 ----------
SA.PX.ui = (() => {
  const X = SA.PX, P = SA.PAL;
  // SA.h 在 js/ui.js 里；样机页不加载 ui.js，用这里的同款
  const hh = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
    return el;
  };
  const h = (...a) => (SA.h || hh)(...a);
  // 画布按 s 倍（默认 2）最近邻显示
  function img(src, s = X.S, style = '') {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    c.className = 'px-img'; c.style.width = `${src.width * s}px`; c.style.height = `${src.height * s}px`;
    if (style) c.style.cssText += style;
    return c;
  }
  const num = (str, col = X.INK, sh) => { const c = img(X.num(str, col, { shadow: sh })); c.classList.add('px-n'); return c; };
  const sk = (name, kids, style = '', cls = '') => h('div', { class: `px-sk px-sk-${name} ${cls}`, style }, kids);
  // 按钮：pri = 黄铜 + 会转的齿轮；sec = 铁板 + 四颗黄铜铆钉；dng = 炉火红；off = 暗铁
  function btn(label, o = {}) {
    const kind = o.kind || 'sec';
    return h('button', { type: 'button', class: `px-btn ${kind} ${o.sm ? 'sm' : ''} ${o.big ? 'big' : ''} ${o.dn ? 'dn' : ''} ${o.spin ? 'spin' : ''}`, onclick: o.onclick || null, title: o.title || null, disabled: kind === 'off' || null },
      kind === 'pri' && o.gear !== false ? h('i', { class: 'g' }) : null, o.icon || null, label != null ? h('span', {}, label) : null);
  }
  const plate = (text, style = '') => h('span', { class: 'px-sk px-sk-brass px-plate', style }, text);
  function tag(kids, color) {
    return h('span', { class: 'px-tag' }, img(X.tagHead()), h('span', { class: 'px-sk px-sk-kraft body' }, color ? h('i', { style: `width:6px;height:14px;background:${color};display:block` }) : null, kids));
  }
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  const matTag = (mt) => { const m = SA.MATS[mt]; return tag([num(ROMAN[mt]), h('span', {}, m.name), m.rank ? h('b', { style: `color:${X.PEN}` }, m.rank) : null], m.chip); };
  const stamp = (kids, style = '') => h('span', { class: 'px-sk px-sk-stamp px-stamp', style }, kids);
  // 齿条表：小齿轮推着带齿的条；棋盘点 = 装上以后多出来 / 少掉的；红竖线 = 上限；超了整条变红
  const RAMPS = { power: P.gauge, weight: P.iron.slice(1), speed: P.glass, heat: P.fire, water: P.water, hp: P.brass };
  function rack(pct, o = {}) {
    const W = o.w || 70, k = X.C(W, 11), L = W - 10, len = Math.round(Math.max(0, Math.min(1, pct)) * L);
    const R4 = o.over ? P.fire : (RAMPS[o.k] || P.brass);
    X.box(k, 6, 1, W - 6, 9, { o: P.dark[0], b: P.dark[1], l: P.iron[0], d: P.dark[0] }, true);
    for (let x = 0; x < len; x++) { const xx = 8 + x; k.p(xx, 4, R4[3]); k.p(xx, 5, R4[2]); k.p(xx, 6, R4[1]); if (x % 3 === 1) k.p(xx, 3, R4[2]); }
    if (len) k.r(8 + len, 3, 1, 4, R4[0]);
    if (o.d) { const a = Math.round(Math.min(1, pct + Math.min(0, o.d)) * L), b = Math.round(Math.min(1, pct + Math.max(0, o.d)) * L), col = o.good === false ? P.fire[2] : P.gauge[2]; for (let x = a; x < b; x++) for (let y = 3; y < 7; y++) if ((x + y) % 2 === 0) k.p(8 + x, y, col); }
    if (o.lim != null) { const lx = 8 + Math.round(o.lim * L); k.r(lx, 0, 1, 11, P.fire[1]); k.p(lx - 1, 0, P.fire[1]); k.p(lx + 1, 0, P.fire[1]); }
    k.g.drawImage(X.gear(5, 7, X.RAMP.brass, len * 0.35), 0, 0);
    return k.c;
  }
  // g = { k, name, val, pct, delta }；o = { w, lim, light }
  function meter(g, o = {}) {
    const bad = g.pct >= 1 && ['power', 'weight', 'heat'].includes(g.k);
    const good = g.delta ? (g.k === 'weight' || g.k === 'heat' ? g.delta < 0 : g.delta > 0) : true;
    const val = String(g.val).replace(/\s/g, '');
    return h('div', { class: 'px-row', style: `grid-template-columns:44px ${(o.w || 70) * 2}px 1fr;${o.light ? 'color:#e4e0d6;text-shadow:2px 2px 0 #0b0e15' : ''}` }, h('span', { class: 'nm' }, g.name),
      img(rack(g.pct, { k: g.k, over: bad, d: g.delta, good, lim: o.lim, w: o.w })),
      h('span', { style: 'display:flex;gap:4px;align-items:center;justify-content:flex-end' }, num(val, bad ? X.RED : o.light ? '#e4e0d6' : X.INK, o.light ? P.dark[0] : undefined), g.delta ? num(g.delta > 0 ? '▲' : '▼', good ? P.gauge[1] : X.RED) : null));
  }
  // 计数器：齿轮带着纸字轮（钱）+ 声望星 + 材料锭；o = { money, rep, ingots（乌兹钢锭数）或 ingotList [[wootz|aether, 数]], onclick }
  function counter(o) {
    const s = String(Math.max(0, Math.round(o.money))).padStart(5, '0'), N = s.length + 1, W = 9 + N * 8 + 4, k = X.C(W, 15);
    X.box(k, 6, 0, W - 6, 15, X.RAMP.iron);
    X.box(k, 9, 2, N * 8 + 1, 11, { o: P.dark[0], b: P.dark[0], l: P.dark[0], d: P.dark[0] });
    ['£', ...s].forEach((ch, i) => {
      const x = 10 + i * 8, PR = X.RAMP.paper;
      for (let y = 3; y < 12; y++) k.r(x, y, 7, 1, y === 3 || y === 11 ? PR.d : y === 4 || y === 10 ? PR.a : PR.l);
      k.g.drawImage(X.num(ch, i ? X.INK : X.RED), x + 1, 4);
    });
    k.g.drawImage(X.gear(6, 8, X.RAMP.brass, 0.2), 0, 1);
    const stars = h('span', { style: 'display:flex;gap:2px' }, [0, 1, 2, 3, 4].map(i => img(X.star(i < o.rep))));
    const list = o.ingotList || (o.ingots ? [['wootz', o.ingots]] : []);
    return sk('iron', [img(k.c), stars, list.map(([kind, n]) => h('span', { style: 'display:flex;gap:4px;align-items:center' }, img(X.ingot(kind)), num(`×${n}`, '#e4e0d6', P.dark[0])))],
      `display:inline-flex;gap:12px;align-items:center;padding:0 4px;${o.onclick ? 'cursor:pointer' : ''}`, 'px-drop');
  }
  // 换层旋钮：黄铜齿轮上一根指针，指向哪边就是哪边
  function toggle(a, b, right, onclick) {
    const k = X.C(15, 15); k.g.drawImage(X.gear(7, 9, X.RAMP.brass, 0.1), 0, 0);
    const ex = right ? 13 : 1; X.line(k, 7, 7, ex, 3, P.dark[0]); X.line(k, 7, 8, ex, 4, P.dark[0]); k.r(6, 6, 3, 3, P.dark[0]); k.p(6, 6, P.iron[3]);
    const lab = (t, on) => sk('paper', t, `padding:0 2px;font:bold 14px SimSun,serif;white-space:nowrap;text-shadow:none;color:${on ? '#2a1a05' : '#9a845f'}`);
    const el = sk('iron', [lab(a, !right), img(k.c, X.S, 'cursor:pointer'), lab(b, right)], 'display:inline-flex;gap:6px;align-items:center;padding:0 2px');
    if (onclick) { el.style.cursor = 'pointer'; el.addEventListener('click', onclick); }
    return el;
  }
  const card = (kids, style = '') => h('div', { style: `position:relative;${style}` }, img(X.clip(), X.S, 'position:absolute;left:14px;top:-12px;z-index:2'), sk('paper', kids, 'padding:4px 6px', 'px-drop'));
  // 黄铜角框：能点 / 选中
  function brackets(w, hh2, col = P.brass[2]) {
    const k = X.C(Math.round(w / 2), Math.round(hh2 / 2)), L = 5;
    for (const [x, y, sx, sy] of [[0, 0, 1, 1], [k.w - 1, 0, -1, 1], [0, k.h - 1, 1, -1], [k.w - 1, k.h - 1, -1, -1]]) for (let i = 0; i < L; i++) { k.p(x + sx * i, y, col); k.p(x, y + sy * i, col); k.p(x + sx * i, y + sy, P.brass[0]); k.p(x + sx, y + sy * i, P.brass[0]); }
    return img(k.c, X.S, 'position:absolute;left:0;top:0;pointer-events:none');
  }
  // 对话气泡（纸 + 尾巴）：b.set(说话人, html)，加 .on 显示
  function bubble(x, y, tailX) {
    const inner = h('span', {});
    const b = h('div', { class: 'px-bubble', style: `left:${x}px;top:${y}px` }, sk('paper', inner, 'padding:2px 6px', 'px-drop'), img(X.tail(), X.S, `left:${tailX}px`));
    b.lastChild.classList.add('tl');
    b.set = (who, html) => { inner.innerHTML = `<span class="who">${who}</span>${html}`; };
    return b;
  }
  // 悬浮说明：鼠标停 0.2 秒弹出一张纸条（跟着鼠标，贴着窗口边会翻到另一侧）；按下 / 移开就收。build() 每次弹出时现做内容
  let tipBox = null, tipT = null, tipE = null;
  function tipPlace() {
    if (!tipBox || tipBox.style.display !== 'block' || !tipE) return;
    const r = tipBox.getBoundingClientRect();
    let x = tipE.clientX + 18, y = tipE.clientY + 16;
    if (x + r.width > innerWidth - 8) x = tipE.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = innerHeight - 8 - r.height;
    tipBox.style.left = `${Math.max(8, Math.round(x))}px`; tipBox.style.top = `${Math.max(8, Math.round(y))}px`;
  }
  function tipHide() { clearTimeout(tipT); if (tipBox) tipBox.style.display = 'none'; }
  function tip(el, build) {
    el.addEventListener('pointerenter', (e) => {
      tipE = e; clearTimeout(tipT);
      tipT = setTimeout(() => {
        if (!el.isConnected) return;
        if (!tipBox) { tipBox = h('div', { class: 'px-tip px-ui' }); document.body.append(tipBox); }
        tipBox.innerHTML = ''; tipBox.append(sk('paper', build(), 'padding:2px 8px 4px', 'px-drop'));
        tipBox.style.display = 'block'; tipPlace();
      }, 200);
    });
    el.addEventListener('pointermove', (e) => { tipE = e; tipPlace(); });
    el.addEventListener('pointerleave', tipHide);
    el.addEventListener('pointerdown', tipHide);
    return el;
  }
  // 双向拉杆（出战黑板右下）：杆起始立在正中。按住往左扳到底 = left.go（回院子），往右推到底 = right.go（出战）；
  // 没扳到底就松手，杆弹回中间。两端各一行小字说明，杆快到哪头，哪头的字就亮起来。没有按钮。
  // o.left / o.right = { label, go, disabled（不能走时的原因，推到底只提示不执行）}；没有 left 时杆只能往右推
  function throttle(o = {}) {
    const N = 40, cache = new Map();
    const frame = (p) => { const q = Math.round(p * N); if (!cache.has(q)) cache.set(q, X.lever(q / N)); return cache.get(q); };
    const lv = img(frame(0.5));
    lv.style.cssText += ';cursor:grab;touch-action:none';
    const side = (s, x) => h('span', { class: `px-thr-t ${s}${x && x.disabled ? ' off' : ''}`, title: x && x.disabled ? x.disabled : null }, x ? x.label : '');
    const L = side('l', o.left), R = side('r', o.right);
    const box = h('div', { class: 'px-thr', title: o.title || null }, L, lv, R);
    const RANGE = 44;   // 杆头从正中到一端在屏幕上走的距离（CSS px），鼠标拖多少杆头就走多少
    let pos = 0.5, drag = null, raf = 0;
    const draw = () => {
      const g = lv.getContext('2d'); g.clearRect(0, 0, lv.width, lv.height); g.drawImage(frame(pos), 0, 0);
      L.classList.toggle('hot', !!o.left && pos < 0.2); R.classList.toggle('hot', pos > 0.8);
    };
    // 弹回中间：带一点回弹，像弹簧把杆拉回定位齿
    const settle = (from = pos) => {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3) * Math.cos(k * 4.2);
        pos = from + (0.5 - from) * e; draw();
        if (k < 1 && lv.isConnected) raf = requestAnimationFrame(step); else { pos = 0.5; draw(); }
      };
      raf = requestAnimationFrame(step);
    };
    // 只点了一下没拖：杆往右轻轻晃一下再回来，提示它是拖的
    const nudge = () => { pos = 0.62; draw(); settle(0.62); };
    lv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); cancelAnimationFrame(raf);
      try { lv.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有活动指针 */ }
      lv.style.cursor = 'grabbing';
      // 院子舞台整体按窗口缩放：拖动距离换算回舞台里的像素
      drag = { x: e.clientX, p: pos, moved: false, k: lv.getBoundingClientRect().width / (lv.offsetWidth || 1) || 1 };
    });
    lv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      pos = Math.max(o.left ? 0 : 0.5, Math.min(1, drag.p + dx / (RANGE * drag.k) / 2)); draw();
    });
    const release = () => {
      if (!drag) return;
      const moved = drag.moved; drag = null; lv.style.cursor = 'grab';
      if (!moved) { nudge(); return; }
      const act = pos <= 0.08 ? o.left : pos >= 0.92 ? o.right : null;
      if (act && act.disabled) { if (SA.UI && SA.UI.toast) SA.UI.toast(act.disabled); settle(); return; }
      if (act) { pos = pos < 0.5 ? 0 : 1; draw(); act.go(); setTimeout(() => { if (lv.isConnected) settle(); }, 700); return; }
      settle();
    };
    lv.addEventListener('pointerup', release);
    lv.addEventListener('pointercancel', release);
    return box;
  }
  // 纸上的笔迹：红笔圈 / 波浪下划线 / 手写字
  const loop = (kids, w, hh2, seed = 5, style = '') => h('span', { style: `position:relative;display:inline-block;${style}` }, kids, img(X.penLoop(w, hh2, X.PEN, seed), X.S, `position:absolute;left:50%;top:50%;margin-left:-${w}px;margin-top:-${hh2}px;pointer-events:none`));
  const underline = (kids, w, seed = 3) => h('span', { style: 'position:relative;display:inline-block' }, kids, img(X.penUnder(w, X.PEN, seed), X.S, 'position:absolute;left:-4px;bottom:-9px;pointer-events:none'));
  const hand = (text, size = 17, style = '') => h('span', { class: 'px-hand', style: `font-size:${size}px;${style}` }, text);
  function dial(pct, label) {
    const k = X.C(23, 23), c = 11.5;
    for (let y = 0; y < 23; y++) for (let x = 0; x < 23; x++) { const d = Math.hypot(x + 0.5 - c, y + 0.5 - c); if (d > 11.3) continue; k.p(x, y, d > 10.3 ? P.brass[0] : d > 8.6 ? (x + y < 20 ? P.brass[3] : P.brass[1]) : d > 7.8 ? P.brass[0] : X.RAMP.paper.l); }
    for (let i = 0; i <= 6; i++) { const a = (-135 + 270 * i / 6) * Math.PI / 180; k.p(Math.round(c - 0.5 + Math.sin(a) * 6.5), Math.round(c - 0.5 - Math.cos(a) * 6.5), X.INK); }
    const a = (-135 + 270 * pct) * Math.PI / 180; X.line(k, 11, 11, 11 + Math.sin(a) * 6, 11 - Math.cos(a) * 6, X.RED); k.r(10, 10, 3, 3, P.brass[1]); k.p(10, 10, P.brass[3]);
    return h('div', { style: 'display:grid;justify-items:center;gap:2px' }, img(k.c), label ? h('span', { style: 'font:bold 12px SimSun,serif' }, label) : null);
  }
  // 路标：木牌（go = 刷红漆）+ 贴一张纸条写字；dir = 1 朝右 / -1 朝左
  const RED_WOOD = { o: '#2a0e06', d: P.fire[0], b: '#7e2a12', l: '#a8421c' };
  function sign(text, dir, w, o = {}) {
    const lw = [...text].length * 11 + 14;
    return h('div', { class: 'px-hot', style: `position:relative;width:${w * 2}px;height:52px`, onclick: o.onclick || null, title: o.title || null },
      img(X.sign(w, dir, o.go ? RED_WOOD : X.RAMP.wood, o.seed || 3)),
      h('div', { style: `position:absolute;top:9px;${dir > 0 ? 'left:26px' : 'right:26px'};width:${lw * 2}px;height:34px` }, img(X.paperLabel(lw, 17, (o.seed || 3) + 2), X.S, 'position:absolute;left:0;top:0'),
        h('span', { class: 'px-sign-t', style: o.go ? `color:${X.PEN}` : '' }, text)));
  }
  return { h, img, num, sk, btn, plate, tag, matTag, stamp, rack, meter, counter, toggle, card, brackets, bubble, throttle, loop, underline, hand, dial, sign, tip, tipHide, RED_WOOD };
})();
