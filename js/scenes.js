// 战斗场景：铁匠铺后院（序章，就是主页面的院子，画法在 js/home-scene.js）、野地（竞技场外遭遇战）、预选赛（其余竞技场比赛）。
// 每个场景分五层，从远到近：天空（不跟镜头）→ 远景（×0.05）→ 中远景（×0.15～0.2）→ 中景（×0.45）→ 地面（1:1，世界坐标）→ 近景（×1.4，压在车前面的画面最下沿）。
// 规则同 docs/art-style.md：硬像素、左上光、渐变用 4×4 Bayer 抖动；背景只用中低明度、低饱和，只有炉火、灯这类发光物可以亮。
// 纹理一次画好（按场景缓存），每帧只做平铺 / 圆筒采样，再叠一点程序化的小动效（烟、火星、风车、火车、人群、草）。
// 世界坐标：地平线 HZ = 408，中景底 GE = 538，地面纹理从 F0 = 552 开始，车在 GROUND = 648。画在 battle-view 的「视口像素」里（左上角 = 镜头角）。
window.SA = window.SA || {};

SA.Scenes = (() => {
  const P = SA.PAL, TAU = Math.PI * 2;
  const W = 1280, H = 720, GROUND = 648, HZ = 408, GE = 538, F0 = 552;
  const TW = 1248;   // 可平铺纹理的周期
  const SKY0 = -640;   // 天空纹理顶端的世界 y（镜头拉到最远时顶上还是天）
  const NAMES = { forge: '铁匠铺后院', wild: '野地', qual: '预选赛' };

  // 哪一场用哪个场景：序章 → 铁匠铺后院；竞技场外遭遇战 → 野地；其余（战役第一章起、街头赛、锦标赛、试驾场）→ 预选赛。opts.scene 可以直接指定
  function pick(opts = {}) {
    if (opts.scene && NAMES[opts.scene]) return opts.scene;
    if (opts.mode === 'side') return 'wild';
    if (opts.mode === 'campaign' && /^0,/.test(opts.storyKey || '')) return 'forge';
    return 'qual';
  }

  // ---------- 像素缓冲 ----------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const U32 = {};
  const u32 = (hex) => U32[hex] || (U32[hex] = (0xff000000 | (parseInt(hex.slice(5, 7), 16) << 16) | (parseInt(hex.slice(3, 5), 16) << 8) | parseInt(hex.slice(1, 3), 16)) >>> 0);
  // w × h 的画布；wrap = 横向循环（跨过右边界的东西从左边接着画），可平铺纹理都用它
  function Pix(w, h, wrap) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = new Uint32Array(img.data.buffer);
    const put = (px, py, col) => {
      if (col == null) return;
      px = Math.floor(px); py = Math.floor(py);
      if (py < 0 || py >= h) return;
      if (wrap) px = ((px % w) + w) % w; else if (px < 0 || px >= w) return;
      d[py * w + px] = typeof col === 'number' ? col : u32(col);
    };
    const has = (px, py) => { px = Math.floor(px); py = Math.floor(py); if (py < 0 || py >= h) return false; if (wrap) px = ((px % w) + w) % w; else if (px < 0 || px >= w) return false; return d[py * w + px] !== 0; };
    const rect = (x0, y0, ww, hh, col) => { for (let yy = Math.round(y0); yy < Math.round(y0 + hh); yy++) for (let xx = Math.round(x0); xx < Math.round(x0 + ww); xx++) put(xx, yy, col); };
    const disc = (cx, cy, r, col, ry = r) => {
      for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
        const dx = (xx + 0.5 - cx) / r, dy = (yy + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) put(xx, yy, typeof col === 'function' ? col(xx, yy, dx, dy) : col);
      }
    };
    const line = (x0, y0, x1, y1, col, th = 1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 0; i <= n; i++) { const k = i / n; rect(Math.round(x0 + (x1 - x0) * k - (th - 1) / 2), Math.round(y0 + (y1 - y0) * k - (th - 1) / 2), th, th, col); }
    };
    // 竖向抖动渐变：stops = [[y, 色]...]，相邻两色之间按 Bayer 过渡
    const vgrad = (x0, x1, stops) => {
      for (let i = 0; i < stops.length - 1; i++) {
        const [ya, ca] = stops[i], [yb, cb] = stops[i + 1];
        for (let yy = ya; yy < yb; yy++) for (let xx = x0; xx < x1; xx++) put(xx, yy, bayer(xx, yy) < (yy - ya) / (yb - ya) ? cb : ca);
      }
    };
    // 1px 外轮廓（只描在空白处），col = 描边色
    const outline = (col, x0 = 0, x1 = w) => {
      const o = u32(col), mark = [];
      for (let yy = 0; yy < h; yy++) for (let xx = x0; xx < x1; xx++) if (!d[yy * w + xx] && (has(xx - 1, yy) || has(xx + 1, yy) || has(xx, yy - 1) || has(xx, yy + 1))) mark.push(yy * w + xx);
      for (const i of mark) d[i] = o;
    };
    const done = () => { x.putImageData(img, 0, 0); return c; };
    return { c, w, h, put, has, rect, disc, line, vgrad, outline, done };
  }
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 起伏的山脊线：几组正弦叠加，保证在 TW 周期上首尾相接
  const ridge = (u, base, amps, seed) => amps.reduce((s, [a, k], i) => s + a * Math.sin((u / TW) * TAU * k + seed * (i + 1) * 1.7), base);

  // ---------- 每帧的采样 ----------
  // 平铺层：tex 顶边在世界 y0，横向按 rot 偏移（rot = 镜头 x × 视差）
  function strip(g, tex, y0, rot, vw, oy) {
    const per = tex.width, u = ((Math.round(rot) % per) + per) % per, y = Math.round(y0 - oy);
    for (let x = -u; x < vw; x += per) g.drawImage(tex, x, y);
  }
  // 纹理坐标 u 在平铺层上落在屏幕哪几列（可能有两三份）
  function spots(u, rot, per, vw, pad, fn) {
    const r = ((Math.round(rot) % per) + per) % per;
    for (let x = u - r - per; x < vw + pad; x += per) if (x > -pad) fn(x);
  }
  // 圆筒层（预选赛看台）：屏幕中间 1:1，越往两边越压缩，像绕着圆形场地转。tex 是两圈宽（采样跨接缝时不用拆）
  function drum(g, tex, y0, rot, vw, oy) {
    const K0 = 0.82, R = (vw / 2) / K0, per = tex.width / 2, th = tex.height, STEP = 4, y = Math.round(y0 - oy);
    const tx = (sx) => rot + Math.asin(Math.max(-1, Math.min(1, (sx - vw / 2) / (vw / 2))) * K0) * R;
    let t0 = tx(0);
    for (let sx = 0; sx < vw; sx += STEP) {
      const t1 = tx(sx + STEP), u = ((t0 % per) + per) % per;
      g.drawImage(tex, Math.floor(u), 0, Math.max(1, Math.round(t1 - t0)), th, sx, y, STEP, th);
      t0 = t1;
    }
  }
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function blob(g, cx, cy, r, c) {
    g.fillStyle = c;
    for (let y = -Math.floor(r); y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y))); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
  }
  // 一缕烟：从 (x, y) 往上飘、被风吹向右，t 是时间；k = 粗细倍数
  function smoke(g, x, y, t, seed, cols, k = 1, rise = 70, wind = 26) {
    for (let i = 0; i < 5; i++) {
      const f = ((t * 0.16 + i / 5 + seed * 0.37) % 1), r = (2 + f * 8) * k;
      g.globalAlpha = 0.5 * (1 - f) * (f < 0.08 ? f / 0.08 : 1);
      blob(g, x + f * wind * k + Math.sin(f * 5 + seed) * 2, y - f * rise * k, r, f < 0.35 ? cols[1] : cols[0]);
    }
    g.globalAlpha = 1;
  }
  // 天空：竖向抖动渐变做成 64 宽的图案，铺满整个视口（天空不跟镜头平移）
  function skyTex(stops) {
    const p = Pix(64, HZ + 160 - SKY0), seam = 12, st = [];
    // 一条条平的色带，只在交界处留 12px 抖动过渡（大面积整片抖动会像纱窗）
    stops.forEach(([y, c], i) => { if (i) st.push([y - SKY0 - seam, stops[i - 1][1]]); st.push([y - SKY0, c]); });
    p.vgrad(0, 64, st.filter(([y], i) => i === 0 || y > st[i - 1][0]));
    return p.done();
  }
  // 天空：64 宽的图案先铺成一张 2112 宽的整图（比镜头拉到最远时的视口还宽），每帧一次 drawImage，比图案填充快得多
  function paintSky(g, S, vw, vh, oy) {
    const top = SKY0 - oy;
    if (top > 0) R(g, 0, 0, vw, top, S.skyTop);
    if (!S.skyWide) { const [c, x] = mk(2112, S.sky.height); for (let i = 0; i < 2112; i += 64) x.drawImage(S.sky, i, 0); S.skyWide = c; }
    g.drawImage(S.skyWide, 0, top);
  }
  // 云：几团抖动的椭圆叠出来，下缘压暗、上缘受光
  function cloud(w, h, cols, seed) {
    const p = Pix(w, h), r = rng(seed), puffs = [];
    for (let i = 0; i < 7; i++) { const k = i / 6; puffs.push([w * (0.12 + 0.76 * k) + (r() - 0.5) * 10, h * 0.62 - Math.sin(k * Math.PI) * h * 0.25 * (0.6 + r() * 0.6), h * (0.22 + 0.2 * Math.sin(k * Math.PI)) + r() * 4]); }
    for (const [cx, cy, rr] of puffs) p.disc(cx, cy, rr * 1.5, (x, y, dx, dy) => (dy > 0.45 ? cols[0] : dy < -0.35 && dx < 0.3 ? cols[2] : bayer(x, y) < 0.5 - dy ? cols[1] : cols[0]), rr);
    for (let x = 0; x < w; x++) for (let y = Math.floor(h * 0.72); y < h; y++) if (p.has(x, y) && y > h * 0.8) p.put(x, y, bayer(x, y) < 0.5 ? 0 : cols[0]);
    return p.done();
  }
  // 云按时间往右飘（每朵速度不同），也带一点点视差；宽度按视口循环
  function clouds(g, S, vw, oy, camx, t) {
    for (const c of S.clouds) {
      const span = vw + c.img.width * 2, x = ((c.x + t * c.v - camx * c.par) % span + span) % span - c.img.width;
      g.drawImage(c.img, Math.round(x), Math.round(c.y - oy));
    }
  }
  // 一群鸟（剪影的小 v，翅膀两帧），每 period 秒飞过一次
  function birds(g, vw, oy, t, y0, period, col, dir = 1) {
    const ph = (t % period) / period, x0 = dir > 0 ? -60 + ph * (vw + 160) : vw + 60 - ph * (vw + 160);
    if (ph > 0.9) return;
    g.fillStyle = col;
    for (let i = 0; i < 6; i++) {
      const bx = Math.round(x0 - dir * (i % 2 ? 1 : -0.4) * i * 9), by = Math.round(y0 - oy + Math.abs(i - 2.5) * 5 + Math.sin(t * 2 + i) * 2);
      const up = Math.floor(t * 6 + i) % 2;
      g.fillRect(bx, by, 1, 1); g.fillRect(bx - 2, by - 1 + up * 2, 2, 1); g.fillRect(bx + 1, by - 1 + up * 2, 2, 1);
    }
  }

  // =====================================================================
  // 铁匠铺后院（序章）：就是主页面那个院子（js/home-scene.js 画的同一座铁匠铺、同一种天气）。
  // 院子的 1 个原生像素 = 世界 1 像素；院子墙根（y 272）对上中景底 GE。中景是一整圈院墙，铁匠铺和院门嵌在里面；
  // 远景是城市剪影，天空是院子的色带；地面是同一种夯土。老汤姆在门口铁砧前打铁、亲戚在旁边看（和老汤姆对打的那一关只剩亲戚）。
  // =====================================================================
  function buildForge() {
    const HS = SA.HomeScene, wk = HS.weather(), t = HS.theme(wk);
    const S = { id: 'forge', wk };
    const DY = GE - HS.BASE;   // 院子的 y + DY = 世界 y
    const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };
    const [g0, g1, g2] = t.ground, SH = `rgba(${t.sh.join(',')})`;
    // 天空：院子的几条色带（往上一直是最顶那一色）
    const bh = HS.HOR / t.sky.length, stops = [[SKY0, t.sky[0]]];
    t.sky.forEach((c, i) => { if (i) stops.push([Math.round(DY + i * bh), c]); });
    stops.push([HZ + 160, t.sky[t.sky.length - 1]]);
    S.skyTop = t.sky[0];
    S.sky = skyTex(stops);
    // 云：晴天几朵平涂的白云，雨天一排压低的乌云；夜里、雾天没有
    const flatCloud = (w, c0, c1) => { const [c, x] = mk(w, 12); const r = (a, b, ww, hh, col) => { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), Math.round(ww), Math.round(hh)); };
      r(0, 6, w, 5, c0); r(5, 3, w * 0.45, 3, c0); r(w * 0.4, 0, w * 0.34, 6, c0); r(2, 11, w - 4, 1, c1); return c; };
    S.clouds = t.rain ? [0, 1, 2, 3, 4].map(i => ({ img: flatCloud(260 + i * 30, t.cloud[1], shade(t.cloud[1], 0.8)), x: i * 330, y: DY + 18 + (i % 2) * 14, v: 6 + i, par: 0.02 }))
      : t.cloud ? [0, 1, 2].map(i => ({ img: flatCloud(52 + i * 14, t.cloud[0], t.cloud[1]), x: i * 520, y: DY + 14 + (i % 3) * 22, v: 3 + i * 0.8, par: 0.02 })) : [];
    // 远景：城市剪影（最低对比），亮窗排成行
    {
      const y0 = 380, p = Pix(TW, F0 - y0, true), r = rng(5), far = t.far[0], win = t.far[1], chim = [];
      for (let x = 0; x < TW;) {
        const w = 20 + Math.floor(r() * 30), top = 30 + Math.floor(r() * 40);
        p.rect(x, top, w, F0 - y0 - top, far);
        if (win) for (let wy = top + 5; wy < 110; wy += 9) for (let wx = x + 3; wx < x + w - 4; wx += 7) if (r() < 0.22) p.rect(wx, wy, 2, 3, win);
        if (r() < 0.3) { const cx = x + 3 + Math.floor(r() * (w - 8)); p.rect(cx, top - 26, 5, 26, far); chim.push([cx + 2, y0 + top - 28]); }
        x += w + (r() < 0.25 ? 8 : 0);
      }
      p.rect(640, 4, 12, 120, far); p.rect(638, 0, 16, 5, far); p.rect(642, -8, 8, 8, far); p.rect(643, 10, 6, 6, win || t.sky[3]);   // 钟塔
      p.rect(1000, 10, 10, 120, far); for (let k = 0; k < 24; k++) p.rect(1005 - k / 5, -14 + k, 1 + (k / 5) * 2, 1, far);   // 教堂尖塔
      S.far = p.done(); S.farY = y0; S.farChim = chim.slice(0, 4);
    }
    // 中景：一整圈院墙；铁匠铺（院子里那座，只要建筑层）嵌在 X0，院门在它右边；墙根前一条夯土
    {
      const y0 = 190, MW = TW * 2, X0 = 300, [c, g] = mk(MW, F0 - y0), ty = (hy) => hy + DY - y0;   // 院子 y → 纹理 y
      const R2 = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
      g.drawImage(HS.yardWall(wk, MW), 0, ty(222));
      g.clearRect(X0 + HS.L.gate[0], ty(222), HS.L.gate[1] - HS.L.gate[0], 50);
      R2(0, ty(HS.BASE), MW, F0 - GE, g0); R2(0, ty(HS.BASE), MW, 2, g1);
      if (t.spill) { g.fillStyle = `rgba(255,176,80,${t.spill})`; g.fillRect(X0 + 150, ty(HS.BASE) + 2, 90, F0 - GE - 2); }
      g.drawImage(HS.layer(wk, { build: true }), X0, ty(0));
      // 院墙边的两只木桶、一座煤气路灯（亮不亮看天气）
      for (const bx of [980, 1002]) { R2(bx, ty(252), 18, 22, t.wood[1]); R2(bx, ty(252), 18, 1, t.wood[0]); R2(bx, ty(258), 18, 2, t.iron[2]); R2(bx, ty(268), 18, 2, t.iron[2]); R2(bx + 1, ty(274), 16, 2, SH); }
      const lx = 1500; R2(lx, ty(196), 3, 80, t.iron[2]); R2(lx - 5, ty(194), 13, 3, t.iron[2]); R2(lx - 3, ty(182), 9, 12, t.iron[2]); R2(lx - 2, ty(184), 7, 8, t.lit ? '#ffd070' : t.iron[1]); R2(lx - 3, ty(276), 9, 2, SH);
      S.lamp = t.lit ? [lx - 2, y0 + ty(184)] : null;
      // 铁砧：门左边、墙根前一点点（老汤姆就在这儿打铁）
      const ax = X0 + 112, ay = F0 - y0 - 3;
      R2(ax - 10, ay - 1, 36, 3, SH);
      R2(ax, ay - 9, 12, 9, t.wood[1]); R2(ax - 1, ay - 9, 14, 1, t.wood[0]);
      R2(ax - 4, ay - 16, 22, 5, t.iron[2]); R2(ax - 8, ay - 16, 6, 3, t.iron[2]); R2(ax + 2, ay - 11, 10, 2, t.iron[1]); R2(ax - 4, ay - 16, 22, 1, t.iron[0]);
      S.anvil = [ax + 6, y0 + ay - 17];
      S.hearth = [X0 + HS.L.hearth[0], HS.L.hearth[1] + DY, HS.L.hearth[2] - HS.L.hearth[0], HS.L.hearth[3] - HS.L.hearth[1]];
      S.chimney = [X0 + (HS.L.chimney[0] + HS.L.chimney[2]) / 2, HS.L.chimney[1] + DY - 6];
      S.houseX = X0;
      S.mid = c; S.midY = y0;
    }
    // 地面（世界坐标 1:1）：院子那种平的夯土，稀疏石子；雨天几个映着天色的水洼
    const G = [shade(g1, 0.7), g1, g0, g2, shade(g2, 1.12)];
    S.floor = floorTex(G, (p, x, y) => {
      const d = y + F0, k = d - GROUND;
      if (d < GROUND) return g0;
      return k < 2 ? G[3] : k < 4 ? G[2] : (k - 8) % 14 === 0 && hash(x >> 3, k) < 0.6 ? G[0] : G[1];
    }, [], (p, r, Y) => {
      for (let i = 0; i < 90; i++) { const x = r() * TW, y = Y(556 + r() * 88), w = 1 + Math.floor(r() * 3); p.rect(x, y, w + 1, 1, g1); p.rect(x, y - 1, w, 1, g2); }
      if (t.rain) for (const px of [200, 640, 1010]) { const py = Y(600 + (px % 3) * 12); p.disc(px, py, 30, t.water, 3); p.rect(px - 14, py, 14, 1, t.sky[3]); }
    });
    // 近景：废料堆、半埋的车轮和齿轮剪影（地面最暗色），顶边描一道受光
    S.near = nearTex(1680, 64, (p, r) => {
      const N = shade(g1, 0.45);
      const heap = (cx, w, hh) => { for (let k = -w; k <= w; k++) { const tt = Math.round(hh * (1 - (k / w) ** 2) + (hash(cx + k, 1) - 0.5) * 3); p.rect(cx + k, 64 - tt, 1, tt, N); } };
      heap(140, 90, 30); heap(760, 70, 22); heap(1300, 110, 34);
      p.disc(120, 32, 18, (x, y, a, b) => (Math.hypot(a, b) > 0.7 || Math.abs(a) < 0.12 || Math.abs(b) < 0.12 ? N : null));
      p.disc(500, 58, 26, (x, y, a, b) => { const rr = Math.hypot(a, b), an = Math.atan2(b, a); return rr > 0.78 && Math.abs(((an / (TAU / 12)) % 1 + 1) % 1 - 0.5) > 0.22 ? null : rr < 0.3 && rr > 0.15 ? null : N; });
      for (let k = 0; k < 30; k++) { const x = Math.floor(r() * 1680), hh = 5 + Math.floor(r() * 9); p.line(x, 64, x + (r() - 0.5) * 6, 64 - hh, N); }
    }, [g1, shade(g1, 0.7)]);
    // ---- 每帧 ----
    const tom = (pose) => coalSprite('铁匠 老汤姆', pose, 'normal', 1), uncle = (pose, expr = 'normal') => coalSprite('远房亲戚', pose, expr, -1);
    // 雨天 / 夜里人回屋（和主页面同一套：home-scene.js 的 indoor / inside）：老汤姆在门里打铁，亲戚雨天站门口雨棚下、夜里在窗后打盹。
    // 屋里 / 门口的人和铁匠铺同一个比例（scene 尺寸），套上天气的轮廓光
    const IN = HS.indoor(wk), homeCache = {};
    const homeCoal = (name, pose, expr, look) => { const k = `${name}|${pose}|${expr}|${look}`; return homeCache[k] || (homeCache[k] = HS.lift(SA.Coal.draw(SA.Coal.byName[name], { size: 'scene', pose, expr, look }), wk)); };
    S.back = (g, vw, vh, oy, camx, tt, opts) => {
      paintSky(g, S, vw, vh, oy);
      if (t.stars) for (let i = 0; i < 40; i++) { const x = Math.round(hash(i, 1) * vw), y = Math.round(-300 + hash(i, 2) * (DY + 150 + 300) - oy); if (Math.sin(tt * (1 + hash(i, 3) * 2) + i) > -0.4) R(g, x, y, 1, 1, i % 3 ? '#6a7498' : '#e8ecf8'); }
      if (t.orb) { const [ox, oyy, r, col, ring] = t.orb, x = Math.round(ox < 320 ? vw * 0.12 : vw * 0.86), y = Math.round(oyy + DY - oy); if (ring) blob(g, x, y, r + 3, ring); blob(g, x, y, r, col); }
      clouds(g, S, vw, oy, camx, tt);
      if (wk === 'sun') birds(g, vw, oy, tt, DY + 40, 38, t.iron[2]);
      strip(g, S.far, S.farY, camx * 0.05, vw, oy);
      for (const [u, y] of S.farChim) spots(u, camx * 0.05, TW, vw, 60, (x) => smoke(g, x, y - oy, tt, u, [t.smoke, t.smoke], 0.6, 50, 20));
      strip(g, S.mid, S.midY, camx * 0.45, vw, oy);
      const rot = camx * 0.45, MW = S.mid.width, strike = (tt % 0.9) / 0.9;
      // 炉口的火（和主页面同一种画法）
      spots(S.hearth[0], rot, MW, vw, 120, (x) => {
        const [, hy, hw, hh] = S.hearth, y = hy - oy, f = Math.floor(tt * 10);
        for (let i = 0; i < hw; i++) { const h1 = 4 + Math.floor(hash(i, f) * 6 + Math.sin(i * 0.7 + tt * 5) * 1.5); for (let k = 0; k < Math.min(hh, h1); k++) R(g, x + i, y + hh - 1 - k, 1, 1, k < 2 ? '#b8391b' : k < h1 - 2 ? '#ef7a21' : '#ffd166'); }
        R(g, x, y + hh - 2, hw, 2, '#ffd166');
      });
      spots(S.chimney[0], rot, MW, vw, 120, (x) => smoke(g, x, S.chimney[1] - oy, tt, 3, [t.smoke, t.smoke], 1.2, t.rain ? 40 : 90, t.rain ? 60 : 40));
      if (S.lamp) spots(S.lamp[0], rot, MW, vw, 40, (x) => { R(g, x + 2, S.lamp[1] + 2 - oy, 3, 4 + (Math.sin(tt * 11) > 0 ? 1 : 0), '#fff1b8'); g.globalAlpha = 0.1; blob(g, x + 3, S.lamp[1] + 4 - oy, 22, '#ffc060'); g.globalAlpha = 1; });
      // 老汤姆打铁 + 远房亲戚（和老汤姆对打的那一关，他在对面车里，这里只剩亲戚）；脚下平涂影子
      const tomHere = !(opts && opts.storyKey === '0,2');
      if (IN) spots(S.houseX, rot, MW, vw, 460, (x) => {
        const oy2 = DY - oy, relAt = IN.rel;
        HS.inside(g, wk, { forge: tomHere ? homeCoal('铁匠 老汤姆', strike < 0.55 ? 'cheer' : 'point', 'normal', 1) : null, window: relAt === 'window' ? homeCoal('远房亲戚', 'idle', 'sleepy', 1) : null }, tt, x, oy2);
        if (tomHere && strike > 0.55 && strike < 0.8) { const [ax, ay] = HS.SPOT.anvil; for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.4, k = (strike - 0.55) / 0.25, d = 2 + k * (8 + (i % 3) * 4); R(g, x + ax + 8 + Math.cos(a) * d, oy2 + ay - 4 + Math.sin(a) * d + k * k * 5, 1, 1, k < 0.5 ? P.fire[3] : P.fire[2]); } }
        if (relAt === 'step') { const cheer = !tomHere && Math.floor(tt / 1.6) % 3 === 0; g.drawImage(homeCoal('远房亲戚', cheer ? 'cheer' : Math.floor(tt / 5) % 4 === 3 ? 'salute' : 'idle', cheer ? 'happy' : 'normal', 1), Math.round(x + HS.SPOT.step.x - 28), Math.round(oy2 + HS.SPOT.step.feet - 46)); }
        if (relAt === 'window') for (let i = 0; i < 3; i++) { const f = (tt * 0.4 + i / 3) % 1; g.globalAlpha = 1 - f; R(g, x + HS.L.window[2] + 3 + f * 10 + i, oy2 + HS.L.window[1] + 4 - f * 16 - i * 4, 3 + i, 1, '#e4e0d6'); } g.globalAlpha = 1;   // 窗边飘出的 z
      });
      if (!IN) spots(S.anvil[0], rot, MW, vw, 80, (x) => {
        const ay = S.anvil[1] - oy, foot = ay + 17 - 34;
        g.fillStyle = SH;
        if (tomHere) g.fillRect(Math.round(x - 36), Math.round(ay + 15), 26, 2);
        g.fillRect(Math.round(x + 12), Math.round(ay + 15), 26, 2);
        if (tomHere) {
          const up = strike < 0.55;
          g.drawImage(tom(up ? 'cheer' : 'hold'), x - 42, foot + (up ? 0 : 1));
          if (strike > 0.55 && strike < 0.8) for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.33, k = (strike - 0.55) / 0.25, d = 3 + k * (10 + (i % 3) * 5); R(g, x + Math.cos(a) * d, ay + Math.sin(a) * d + k * k * 6, 1, 1, k < 0.5 ? P.fire[3] : P.fire[2]); }
        }
        const cheer = !tomHere && Math.floor(tt / 1.6) % 3 === 0, bob = Math.floor(tt * 2) % 2;
        g.drawImage(uncle(cheer ? 'cheer' : Math.floor(tt / 5) % 4 === 3 ? 'salute' : 'idle', cheer ? 'happy' : 'normal'), x + 6, foot - bob);
      });
      // 雾：几条横雾慢慢飘（不跟镜头，像空气）
      if (t.fog) [[DY + 96, 14, 0.18, 4], [DY + 138, 18, 0.18, -3], [DY + 182, 14, 0.2, 5], [DY + 226, 20, 0.24, -4], [DY + 262, 16, 0.28, 3]].forEach(([y, hh, a, sp], i) => {
        g.fillStyle = `rgba(228,229,230,${a})`;
        const len = 420 + i * 60, period = len + 240, off = ((tt * sp * 6) % period + period) % period;
        for (let x = -period + off; x < vw; x += period) { g.fillRect(Math.round(x), Math.round(y - oy), len, hh); g.fillRect(Math.round(x) + 12, Math.round(y - oy) - 2, len - 24, 2); g.fillRect(Math.round(x) + 12, Math.round(y - oy) + hh, len - 24, 2); }
      });
      // 雨丝：1 像素宽、2:1 斜率（画在背景上，不挡车）
      if (t.rain) {
        g.fillStyle = 'rgba(196,212,232,.45)';
        const Pp = vh + 20, Q = vw + 60, f = Math.floor(tt * 12);
        for (let i = 0; i < 160; i++) { const u = (hash(i, 2) * Pp + f * 9) % Pp, y = u - 10, x = ((hash(i, 1) * Q - u / 2) % Q + Q) % Q - 30; for (let k = 0; k < 8; k++) g.fillRect(Math.round(x - (k >> 1)), Math.round(y + k), 1, 1); }
      }
    };
    S.front = (g, vw, vh, oy, camx, tt) => {
      nearLayer(g, S.near, vw, vh, camx);
      if (t.rain || t.fog) return;
      // 空气里飘的火星（从炉子那边来，很小）
      for (let i = 0; i < 8; i++) {
        const f = (tt * (0.06 + (i % 5) * 0.012) + i * 0.137) % 1, x = ((i * 211 + tt * 12 - camx * 1.2) % (vw + 80) + vw + 80) % (vw + 80) - 40 + Math.sin(tt * 1.7 + i) * 10;
        g.globalAlpha = f < 0.1 ? f * 10 : f > 0.8 ? (1 - f) * 5 : 1;
        R(g, x, vh - f * vh * 0.85, 1, 1, i % 3 ? P.fire[2] : P.fire[3]);
      }
      g.globalAlpha = 1;
    };
    return S;
  }

  // =====================================================================
  // 野地：阴天傍晚的荒原。远山、山头上转着的风车、高架桥上开过的蒸汽火车；中景是干砌石墙、电报线杆、歪脖子山楂树；
  // 近景是随风摆动的长草、蓟、栅栏桩，草籽飘过
  // =====================================================================
  function buildWild() {
    const S = { id: 'wild' };
    const C = {
      sky: [[SKY0, '#222a32'], [60, '#28313a'], [190, '#36404a'], [280, '#465052'], [340, '#585e56'], [390, '#6a6a56'], [430, '#787258'], [HZ + 160, '#787258']],
      hill1: '#4a525a', hill1D: '#444c54', hill2: '#3a4640', hill2D: '#34403a',
      field: ['#2a3526', '#313d2a', '#3a4830', '#4c5838'], stone: ['#2e302c', '#3c3e38', '#4c4e46', '#5a5c52'], wood: ['#221c16', '#2e261e', '#3c3226'],
      gorse: ['#1e2618', '#2a3420', '#6a6a3a'], near: '#0f130f', rim: '#2a3326',
      gnd: ['#1c1a14', '#262219', '#30291e', '#3a3226', '#4a4030'],
    };
    C.rim = ['#3e4a36', '#1e2a1c'];
    S.skyTop = C.sky[0][1];
    S.sky = skyTex(C.sky);
    S.clouds = [0, 1, 2, 3, 4].map(i => ({ img: cloud(220 + (i % 3) * 70, 44 + (i % 2) * 16, ['#3c464e', '#4c5456', '#76705c'], 31 + i), x: i * 380, y: 40 + (i % 3) * 70, v: 5 + (i % 3) * 2.5, par: 0.015 }));
    // 远景：两道远山 + 高架桥 + 山头风车塔
    {
      const y0 = 300, p = Pix(TW, F0 - y0, true);
      for (let x = 0; x < TW; x++) {
        const a = Math.round(ridge(x, 70, [[18, 1], [9, 3], [4, 7]], 1.3)), b = Math.round(ridge(x, 98, [[14, 2], [6, 5], [3, 11]], 2.9));
        for (let y = a; y < F0 - y0; y++) p.put(x, y, y < b ? (y - a < 2 ? '#5a6064' : C.hill1) : y - b < 2 ? '#48544a' : C.hill2);
      }
      // 高架桥：一排拱，桥面在 y0 + 88
      const vx0 = 120, vx1 = 620, deck = 88;
      for (let x = vx0; x < vx1; x++) {
        p.rect(x, deck, 1, 4, C.hill2D);
        const k = (x - vx0) % 36, pier = k < 6, crown = 6 + (15 - Math.sqrt(Math.max(0, 225 - (k - 21) ** 2)));   // 拱顶离桥面 6px，两边往下落
        for (let y = deck + 4; y < F0 - y0; y++) if (pier || y - deck - 4 < crown) p.put(x, y, C.hill2D);
      }
      S.viaduct = [vx0, vx1, y0 + deck];
      // 风车塔（叶片动效另画）
      const wx = 900, wy = Math.round(ridge(wx, 70, [[18, 1], [9, 3], [4, 7]], 1.3));
      for (let k = 0; k < 34; k++) p.rect(wx - 4 - k / 6, wy - 34 + k, 8 + k / 3, 1, C.hill2D);   // 上窄下宽的塔身
      p.rect(wx - 5, wy - 38, 10, 5, C.hill2D);
      S.mill = [wx, y0 + wy - 34];
      S.far = p.done(); S.farY = y0;
    }
    // 中远景：近一点的缓坡、树篱、石头农舍（冒烟）、草垛、零星的树
    {
      const y0 = 400, p = Pix(TW, F0 - y0, true), r = rng(3);
      for (let x = 0; x < TW; x++) {
        const top = Math.round(ridge(x, 42, [[10, 2], [5, 5]], 4.1));
        for (let y = top; y < F0 - y0; y++) p.put(x, y, y - top < 2 ? C.field[3] : y - top < 8 ? (bayer(x, y) < 0.5 ? C.field[2] : C.field[1]) : C.field[1]);   // 坡顶被夕阳照亮
        if (x % 3 === 0 && hash(x, 7) < 0.9) { const hy = top + 18 + Math.round(Math.sin(x / 60) * 6); p.rect(x, hy, 3, 3, C.field[0]); }   // 树篱线
      }
      const tree = (tx, ty, rr) => { p.rect(tx - 1, ty, 3, rr + 4, C.wood[0]); p.disc(tx, ty, rr, (x, y, a, b) => (b < -0.3 && a < 0 && bayer(x, y) < 0.5 ? C.field[2] : C.field[0])); };
      for (let i = 0; i < 9; i++) { const tx = Math.floor(r() * TW); tree(tx, Math.round(ridge(tx, 42, [[10, 2], [5, 5]], 4.1)) - 8, 6 + Math.floor(r() * 5)); }
      // 石头农舍：墙 + 石板屋顶 + 烟囱 + 亮窗
      const hx = 460, hy = Math.round(ridge(hx, 42, [[10, 2], [5, 5]], 4.1));
      p.rect(hx, hy - 20, 44, 26, C.stone[1]); for (let k = 0; k < 44; k++) p.rect(hx + k, hy - 20 - Math.floor(12 - Math.abs(k - 22) * 0.55), 1, Math.floor(12 - Math.abs(k - 22) * 0.55) + 1, C.stone[0]);
      p.rect(hx + 32, hy - 36, 5, 10, C.stone[0]); p.rect(hx + 8, hy - 12, 6, 6, '#8a6a3a'); p.rect(hx + 22, hy - 12, 8, 18, C.wood[0]);
      S.cottage = [hx + 34, y0 + hy - 37, hx + 8, y0 + hy - 12];
      // 草垛
      for (const sx of [180, 780, 1040]) { const sy = Math.round(ridge(sx, 42, [[10, 2], [5, 5]], 4.1)) + 6; p.disc(sx, sy, 10, (x, y, a, b) => (b < -0.2 && a < 0.2 ? '#4a4630' : '#3a3726'), 9); p.rect(sx - 10, sy, 21, 4, '#34321f'); }
      S.mid2 = p.done(); S.mid2Y = y0;
    }
    // 中景：干砌石墙 + 电报线杆 + 山楂树 + 荆豆丛 + 路牌 + 立石
    {
      const y0 = 300, p = Pix(TW, F0 - y0, true), r = rng(17), Y = (wy) => wy - y0;
      // 背后的荒草坡（整圈连续）
      for (let x = 0; x < TW; x++) { const top = Y(488) + Math.round(ridge(x, 0, [[6, 3], [3, 8]], 0.7)); for (let y = top; y < F0 - y0; y++) p.put(x, y, y - top < 1 ? C.field[3] : bayer(x, y) < 0.35 ? C.field[1] : C.field[2]); }
      // 干砌石墙：一块块圆角石头
      for (let x = 0; x < TW; x += 9) for (let row = 0; row < 4; row++) {
        if ((x > 540 && x < 620 && row > 1)) continue;   // 豁口
        const sx = x + (row % 2) * 4 + Math.floor(hash(x, row) * 3), sy = Y(GE) - 8 - row * 7, sw = 8 + Math.floor(hash(x, row + 9) * 3);
        p.rect(sx, sy, sw, 6, C.stone[1]); p.rect(sx, sy, sw, 1, C.stone[2]); p.rect(sx, sy, 1, 6, C.stone[2]); p.put(sx, sy, C.stone[0]); p.put(sx + sw - 1, sy + 5, C.stone[0]);
        p.rect(sx, sy + 6, sw, 1, C.stone[0]);
      }
      p.rect(0, Y(GE), TW, F0 - GE, C.gnd[1]);
      // 电报线杆（线另画，好让它随风轻晃）
      S.poles = [];
      for (let x = 80; x < TW; x += 312) { p.rect(x, Y(356), 3, Y(GE) - Y(356), C.wood[1]); p.rect(x, Y(356), 1, Y(GE) - Y(356), C.wood[2]); p.rect(x - 9, Y(362), 21, 2, C.wood[1]); p.rect(x - 7, Y(374), 17, 2, C.wood[1]); for (const k of [-8, -2, 5, 11]) p.put(x + k, Y(361), C.stone[3]); S.poles.push(x + 1); }
      // 山楂树：被风吹歪的树干 + 一侧茂密的树冠
      const tx = 610;
      p.line(tx, Y(GE), tx + 8, Y(470), C.wood[1], 5); p.line(tx + 8, Y(470), tx + 30, Y(420), C.wood[1], 4); p.line(tx + 14, Y(456), tx - 10, Y(430), C.wood[1], 3); p.line(tx + 26, Y(428), tx + 56, Y(410), C.wood[0], 2);
      for (let i = 0; i < 26; i++) { const cx = tx + 12 + r() * 60, cy = Y(412) + r() * 30 - (cx - tx) * 0.1; p.disc(cx, cy, 6 + r() * 6, (x, y, a, b) => (b < -0.2 && a < 0.2 && bayer(x, y) < 0.6 ? C.gorse[1] : C.gorse[0]), 5 + r() * 3); }
      S.tree = [tx + 40, y0 + Y(414)];
      // 荆豆丛（黄花点）
      for (const gx of [220, 420, 980, 1150]) { for (let i = 0; i < 6; i++) p.disc(gx + (i - 2.5) * 8 + r() * 4, Y(GE) - 6 - r() * 6, 7, (x, y, a, b) => (b < -0.3 && bayer(x, y) < 0.5 ? C.gorse[1] : C.gorse[0]), 6); for (let i = 0; i < 12; i++) p.put(gx - 20 + r() * 44, Y(GE) - 4 - r() * 14, C.gorse[2]); }
      // 路牌 + 立石
      p.rect(870, Y(486), 3, 52, C.wood[1]); p.rect(858, Y(488), 26, 7, C.wood[2]); p.rect(880, Y(489), 6, 5, C.wood[2]); p.rect(862, Y(499), 20, 6, C.wood[1]); p.rect(856, Y(500), 6, 4, C.wood[1]);
      p.disc(1060, Y(GE) - 20, 9, (x, y, a) => (a < -0.3 ? C.stone[2] : C.stone[1]), 22); p.rect(1051, Y(GE) - 4, 19, 4, C.stone[0]);
      // 翻倒的车轮
      p.disc(330, Y(GE) - 6, 12, (x, y, a, b) => { const rr = Math.hypot(a, b); return rr > 0.75 || rr < 0.2 || Math.abs(a) < 0.1 || Math.abs(b) < 0.1 ? C.wood[1] : null; }, 5);
      S.mid = p.done(); S.midY = y0;
      // 电报线一跨（杆距 312）：两根下垂的线，按风摆幅画 6 帧
      S.wires = [0, 1, 2, 3, 4, 5].map(f => {
        const q = Pix(314, 44), sway = (f / 5 * 2 - 1) * 1.5;
        for (const [wy, sag] of [[5, 14], [17, 17]]) for (let k = 0; k <= 312; k++) q.put(k, Math.round(wy + Math.sin(k / 312 * Math.PI) * (sag + sway)), '#1a1c1a');
        return q.done();
      });
      S.tufts = []; for (let i = 0; i < 70; i++) S.tufts.push([Math.floor(hash(i, 4) * TW), Math.floor(hash(i, 5) * 4) + 3]);
    }
    S.floor = floorTex(C.gnd, (p, x, y) => {
      const d = y + F0;
      if (d < GROUND - 26) { const k = (d - F0) / (GROUND - 26 - F0); return bayer(x, y) < 0.15 + k * 0.35 ? C.field[0] : C.field[1]; }
      if (d < GROUND) { const k = (d - (GROUND - 26)) / 26; return bayer(x, y) < k ? C.gnd[3] : C.gnd[2]; }
      return null;
    }, [['#141210', 0.04]], (p, r, Y) => {
      // 草地：一簇簇亮一点的草、零星的蓟花和金雀花；下面一条土路（两道车辙、积水、石子）
      for (let i = 0; i < 520; i++) { const x = Math.floor(r() * TW), y = Math.floor(Y(556 + r() * 62)), c = r() < 0.5 ? C.field[2] : C.field[3]; p.put(x, y, c); p.put(x - 1, y - 1, c); p.put(x + 1, y - 1, c); if (r() < 0.4) p.put(x, y - 2, c); }
      for (let i = 0; i < 50; i++) { const x = r() * TW, y = Y(560 + r() * 56), c = r() < 0.5 ? '#5e4a5e' : '#6e6a3a'; p.put(x, y + 1, C.field[3]); p.rect(x - 1, y - 1, 2, 2, c); }
      for (let x = 0; x < TW; x++) { p.put(x, Y(GROUND - 26), C.field[0]); if (hash(x >> 2, 3) < 0.85) p.put(x, Y(GROUND - 17), C.gnd[1]); if (hash(x >> 2, 5) < 0.85) p.put(x, Y(GROUND - 7), C.gnd[1]); }
      for (const px of [300, 820]) { p.rect(px, Y(GROUND - 19), 38, 3, '#3a4146'); p.rect(px + 4, Y(GROUND - 19), 12, 1, '#575e5c'); }
      for (let i = 0; i < 40; i++) { const x = r() * TW, y = Y(GROUND - 24 + r() * 22); p.rect(x, y, 2, 1, C.gnd[4]); }
    });
    S.near = nearTex(1520, 64, (p, r) => {
      // 栅栏桩 + 带刺铁丝、一块大圆石
      for (const fx of [200, 520, 1100]) { p.rect(fx, 8, 6, 56, C.near); p.rect(fx - 1, 6, 8, 3, C.near); }
      p.line(200, 18, 520, 22, C.near); p.line(200, 32, 520, 36, C.near);
      p.disc(820, 60, 40, C.near, 22);
    }, C.rim);
    // 近景的长草：固定位置、按时间摆（离画面近，摆幅大）
    // 近景的长草：12 帧一个循环（4 秒），每根草按自己的相位摆，帧里预先画好
    S.grass = []; { const r = rng(77); for (let i = 0; i < 90; i++) S.grass.push([r() * 1520, 12 + r() * 28, r() < 0.12 ? 'thistle' : r() < 0.3 ? 'reed' : 'blade', r() * TAU]); }
    S.grassFrames = Array.from({ length: 12 }, (_, f) => {
      const q = Pix(1520, 72, true), a = f / 12 * TAU, wind = Math.sin(a) * 0.6 + Math.sin(2 * a + 1) * 0.25, H0 = 71;
      for (const [u, hh, kind, ph] of S.grass) {
        const bend = (wind + Math.sin(a + ph) * 0.15) * hh * 0.35;
        for (let k = 0; k < hh; k++) { const ff = k / hh, x = u + bend * ff * ff; q.rect(Math.round(x), H0 - k, kind === 'reed' ? 2 : 1, 1, C.near); if (kind === 'blade' && k < hh * 0.6) q.put(Math.round(u + 3 + bend * 0.8 * ff * ff), H0 - k, C.near); }
        const tx = u + bend;
        if (kind === 'thistle') { q.disc(tx, H0 - hh - 2, 3, C.near); q.rect(Math.round(tx) - 2, H0 - hh - 6, 5, 2, '#3a2e3a'); }
        if (kind === 'reed') q.rect(Math.round(tx) - 1, H0 - hh - 6, 3, 7, C.near);
      }
      return q.done();
    });
    // ---- 每帧 ----
    S.back = (g, vw, vh, oy, camx, t) => {
      paintSky(g, S, vw, vh, oy);
      // 云后的淡太阳
      const sx = Math.round(vw * 0.72), sy = Math.round(318 - oy);
      g.globalAlpha = 0.1; blob(g, sx, sy, 70, '#9a8e66'); blob(g, sx, sy, 44, '#9a8e66'); g.globalAlpha = 1; blob(g, sx, sy, 18, '#b0a070');
      // 从云缝里斜着漏下来的几道光，慢慢变强变弱
      for (let i = 0; i < 4; i++) {
        const a = 0.035 + 0.025 * Math.sin(t * 0.3 + i * 1.7), x0 = sx - 180 + i * 70;
        g.globalAlpha = Math.max(0, a); g.fillStyle = '#b0a070';
        for (let y = -150; y < 180; y += 2) { const k = (y + 150) / 330, l = x0 + (-170 + i * 30) * k, r = x0 + 26 + (-146 + i * 30) * k; g.fillRect(Math.round(l), sy + y, Math.round(r - l), 2); }   // 按 2px 一行画，不做抗锯齿的斜边
      }
      g.globalAlpha = 1;
      clouds(g, S, vw, oy, camx, t);
      birds(g, vw, oy, t + 11, 170, 46, '#23282a', -1);
      strip(g, S.far, S.farY, camx * 0.04, vw, oy);
      const rF = camx * 0.04;
      // 风车叶片：四片十字，一直在转
      spots(S.mill[0], rF, TW, vw, 40, (x) => {
        const y = S.mill[1] - oy, a = t * 0.9;
        for (let k = 0; k < 4; k++) { const b = a + k * Math.PI / 2; for (let d = 2; d < 24; d++) { const px = x + Math.cos(b) * d, py = y + Math.sin(b) * d; R(g, px, py, 1, 1, C.hill2D); if (d > 8) R(g, px - Math.sin(b) * 2, py + Math.cos(b) * 2, 1, 1, C.hill2D); } }
        R(g, x - 1, y - 1, 3, 3, C.hill2D);
      });
      // 高架桥上的火车：每 40 秒开过一趟（车头 + 煤水车 + 四节车厢），后面拖一串白烟
      const [v0, v1, vy] = S.viaduct, span = v1 - v0 + 200, pos = (t * 28) % (span * 2.2) - 100;
      if (pos < span) spots(v0 + pos, rF, TW, vw, 200, (x) => {
        const y = vy - oy;
        for (let k = 0; k < 6; k++) { const cx = x - k * 17; if (cx < 0 && cx < -20) continue; R(g, cx - 14, y - 9, k ? 15 : 14, k ? 8 : 9, C.hill2D); if (k === 0) { R(g, cx - 4, y - 14, 3, 5, C.hill2D); R(g, cx - 14, y - 12, 5, 3, C.hill2D); } }
        for (let i = 0; i < 8; i++) { const f = i / 8, px = x - 2 - i * 9 - ((t * 20) % 9), py = y - 16 - f * 10 - Math.sin(i + t) * 1.5; g.globalAlpha = 0.55 * (1 - f); blob(g, px, py, 3 + f * 5, '#6e706a'); }
        g.globalAlpha = 1;
      });
      strip(g, S.mid2, S.mid2Y, camx * 0.15, vw, oy);
      spots(S.cottage[0], camx * 0.15, TW, vw, 60, (x) => smoke(g, x, S.cottage[1] - oy, t, 5, ['#4a5050', '#5c6260'], 0.7, 60, 40));
      spots(S.cottage[2], camx * 0.15, TW, vw, 10, (x) => { if (Math.sin(t * 0.7) > -0.8) R(g, x, S.cottage[3] - oy, 6, 6, '#a07a40'); });
      strip(g, S.mid, S.midY, camx * 0.45, vw, oy);
      const rM = camx * 0.45, sway = Math.sin(t * 0.8) * 1.5;
      // 电报线：两根杆之间下垂的弧，随风轻轻晃（6 帧预先画好）
      const wire = S.wires[Math.floor((Math.sin(t * 0.8) + 1) / 2 * 5.99)];
      for (const a of S.poles) spots(a, rM, TW, vw, 330, (x) => g.drawImage(wire, x, 356 - oy));
      // 墙头的草丛随风摆
      g.fillStyle = C.field[3];
      for (const [u, hh] of S.tufts) spots(u, rM, TW, vw, 10, (x) => { const s = Math.round(Math.sin(t * 2 + u) * 1.2 + sway * 0.5); g.fillRect(x + s, GE - 30 - hh - oy, 1, hh); g.fillRect(x + s + 2, GE - 29 - hh - oy, 1, hh - 1); });
      // 山楂树冠飘几片叶子
      spots(S.tree[0], rM, TW, vw, 200, (x) => { for (let i = 0; i < 4; i++) { const f = (t * 0.2 + i / 4) % 1; R(g, x + f * 160 + Math.sin(f * 12 + i) * 6, S.tree[1] - oy + f * 110 + i * 5, 2, 1, i % 2 ? C.gorse[1] : '#4a4a30'); } });
    };
    S.front = (g, vw, vh, oy, camx, t) => {
      nearLayer(g, S.near, vw, vh, camx);
      nearLayer(g, S.grassFrames[Math.floor(t * 3) % 12], vw, vh + 1, camx);
      // 飘过的草籽（蓟绒）
      for (let i = 0; i < 10; i++) {
        const span = vw + 100, x = ((i * 173 + t * (18 + i * 2) - camx * 1.1) % span + span) % span - 50, y = vh * (0.25 + (i % 5) * 0.12) + Math.sin(t * 1.3 + i) * 12;
        g.globalAlpha = 0.7; R(g, x, y, 1, 1, '#b4b2a4'); R(g, x - 1, y - 1, 3, 1, '#7a7a6e'); g.globalAlpha = 1;
      }
    };
    return S;
  }

  // =====================================================================
  // 预选赛：白天的临时赛场。远处伦敦天际线（钟楼、圆顶、吊车），天上飘着飞艇和两只热气球；
  // 中远景是游乐场（条纹帐篷、转着的摩天轮、螺旋滑梯塔）；中景是一圈木看台（人群起伏、挥帽子，顶上彩旗飘）；
  // 近景是前排观众的后脑勺和围绳，偶尔有彩纸飘过
  // =====================================================================
  function buildQual() {
    const S = { id: 'qual' };
    const C = {
      sky: [[SKY0, '#2a3442'], [60, '#313d4c'], [190, '#3c4a5a'], [290, '#4a5968'], [360, '#586672'], [420, '#66727a'], [HZ + 160, '#66727a']],
      city: '#4c5864', cityD: '#46525e', city2: '#3e4a56',
      red: ['#3e2224', '#56302e', '#6e4038'], cream: ['#4e4a42', '#625c50', '#767062'], navy: ['#1e2632', '#2a3444', '#3a4658'], green: ['#23302a', '#2e3e34'],
      wood: ['#1e1814', '#2a221c', '#382e24', '#463a2c'], crowd: ['#1a1818', '#262222', '#302a28', '#3e3530', '#4a3f38'],
      gnd: ['#221e18', '#2e2820', '#3a3228', '#463d30', '#554a3a'], near: '#0d0d10', rim: ['#4a505a', '#22252c'],
    };
    S.skyTop = C.sky[0][1];
    S.sky = skyTex(C.sky);
    S.clouds = [0, 1, 2].map(i => ({ img: cloud(180 + i * 60, 34 + i * 6, ['#4e5a68', '#5e6a76', '#7a8288'], 51 + i), x: i * 600, y: 60 + i * 60, v: 4 + i * 1.5, par: 0.02 }));
    // 气球（条纹）和飞艇的小精灵
    S.balloon = (() => { const p = Pix(24, 34); p.disc(12, 11, 11, (x, y, a) => (Math.floor((a + 1) * 3) % 2 ? (a < -0.3 ? C.red[2] : C.red[1]) : (a < -0.3 ? C.cream[2] : C.cream[1])), 11); p.line(5, 19, 9, 27, '#1e1c1c'); p.line(19, 19, 15, 27, '#1e1c1c'); p.rect(8, 27, 8, 6, C.wood[2]); p.rect(8, 27, 8, 1, C.wood[3]); p.outline('#1c1a1e'); return p.done(); })();
    S.airship = (() => {
      const p = Pix(120, 40);
      p.disc(56, 14, 50, (x, y, a, b) => (b < -0.4 ? C.cream[2] : b > 0.5 ? C.cream[0] : C.cream[1]), 12);
      for (let x = 14; x < 100; x += 12) for (let y = 3; y < 26; y++) if (p.has(x, y)) p.put(x, y, C.cream[0]);
      p.rect(100, 6, 12, 3, C.cream[0]); p.rect(104, 2, 6, 22, C.cream[0]); p.rect(98, 12, 18, 3, C.cream[0]);   // 尾翼
      p.rect(40, 28, 26, 6, C.navy[2]); p.rect(40, 28, 26, 1, C.cream[1]); for (let x = 43; x < 64; x += 5) p.rect(x, 30, 3, 2, '#7a6a40');   // 吊舱
      p.line(44, 25, 42, 28, C.navy[1]); p.line(62, 25, 64, 28, C.navy[1]);
      p.outline('#1c1e24');
      return p.done();
    })();
    // 远景：伦敦天际线（钟楼、圆顶、吊车）
    {
      const y0 = 270, p = Pix(TW, F0 - y0, true), r = rng(13);
      for (let x = 0; x < TW;) { const w = 20 + Math.floor(r() * 40), top = 120 + Math.floor(r() * 26); p.rect(x, top, w, F0 - y0 - top, r() < 0.5 ? C.city : C.cityD); if (r() < 0.4) p.rect(x + 4, top - 8, 4, 8, C.city); x += w; }
      // 钟楼
      const bx = 300; p.rect(bx, 30, 24, 130, C.city2); p.rect(bx - 2, 26, 28, 6, C.cityD); for (let k = 0; k < 22; k++) p.rect(bx + 12 - (22 - k) * 0.55, 4 + k, (22 - k) * 1.1 + 1, 1, C.city2);
      p.disc(bx + 12, 44, 8, '#5a5e5a'); p.rect(bx + 12, 38, 1, 6, C.city2); p.rect(bx + 12, 44, 4, 1, C.city2);
      S.clock = [bx + 12, y0 + 44];
      // 圆顶（有点像圣保罗）
      const dx = 760; p.disc(dx, 92, 34, C.city2, 30); p.rect(dx - 38, 92, 76, 70, C.city2); p.rect(dx - 3, 50, 6, 14, C.city2); p.rect(dx - 1, 44, 2, 6, C.city2);
      for (let k = -30; k <= 30; k += 10) p.rect(dx + k, 96, 3, 30, C.cityD);
      // 码头吊车
      for (const cx of [1000, 1110]) { p.rect(cx, 60, 4, 100, C.cityD); p.line(cx - 40, 64, cx + 30, 60, C.cityD, 2); p.line(cx + 2, 40, cx - 36, 64, C.cityD); p.line(cx + 2, 40, cx + 28, 60, C.cityD); p.rect(cx - 38, 64, 1, 30, C.cityD); }
      S.far = p.done(); S.farY = y0;
    }
    // 中远景：游乐场
    {
      const y0 = 240, p = Pix(TW, F0 - y0, true), r = rng(29), Y = (wy) => wy - y0, GL = 400;   // GL = 游乐场地面（被看台顶棚挡住，只露出上半截）
      for (let x = 0; x < TW; x++) { const top = Y(GL) + Math.round(Math.sin(x / 40) * 2); for (let y = top; y < F0 - y0; y++) p.put(x, y, bayer(x, y) < 0.4 ? C.green[0] : C.green[1]); }
      for (let i = 0; i < 16; i++) { const tx = Math.floor(r() * TW), rr = 7 + r() * 6; p.disc(tx, Y(GL - 4), rr, (x, y, a, b) => (b < -0.3 && a < 0 ? C.green[1] : C.green[0]), rr * 0.8); }
      // 条纹大帐篷：圆锥顶 + 竖条纹墙 + 顶尖小旗杆
      const tent = (cx, w, hh, cols) => {
        const top = Y(GL) - hh;
        for (let x = cx - w; x <= cx + w; x++) {
          const k = Math.abs(x - cx) / w, roof = Math.round(top + k * hh * 0.45), band = Math.floor((x - cx + w) / 6) % 2;
          for (let y = roof; y < Y(GL); y++) p.put(x, y, y < top + hh * 0.45 ? (band ? cols[0][1] : cols[1][1]) : (band ? cols[0][0] : cols[1][0]));
          p.put(x, Math.round(top + hh * 0.45), C.wood[1]);
          if (Math.abs(x - cx) % 7 === 3) p.put(x, Math.round(top + hh * 0.45) + 1, C.wood[1]);
        }
        p.rect(cx, top - 10, 1, 10, C.wood[1]);
        return [cx + 1, y0 + top - 10];
      };
      S.pennants = [tent(180, 50, 88, [C.red, C.cream]), tent(560, 36, 70, [C.navy, C.cream]), tent(1040, 56, 96, [C.red, C.cream])];
      // 螺旋滑梯塔
      const hx = 860; for (let y = Y(300); y < Y(GL); y++) { const k = (y - Y(300)) / 100, w = 5 + k * 8; p.rect(hx - w, y, w * 2, 1, (Math.floor((y - Y(300) + k * 6) / 6) % 2) ? C.cream[1] : C.red[1]); } p.rect(hx - 6, Y(292), 12, 8, C.red[2]); p.rect(hx - 1, Y(280), 2, 12, C.wood[1]);   // 螺旋滑梯塔
      // 摩天轮底座（轮子动效另画）
      const fx = 360, fy = Y(318); p.line(fx - 30, Y(GL), fx, fy, C.wood[1], 2); p.line(fx + 30, Y(GL), fx, fy, C.wood[1], 2);
      S.ferris = [fx, y0 + fy];
      S.mid2 = p.done(); S.mid2Y = y0;
    }
    // 中景：看台（圆筒贴图，4 帧人群动画）
    {
      const y0 = 330, h0 = F0 - y0, Y = (wy) => wy - y0, frames = [];
      const seats = []; { const r = rng(41); for (let row = 0; row < 7; row++) for (let x = 2; x < TW; x += 7) if (r() < 0.86) seats.push([x + Math.floor(r() * 2), row, Math.floor(r() * 5), r(), Math.floor(r() * 6)]); }
      const flagX = []; for (let x = 60; x < TW; x += 156) flagX.push(x);
      for (let f = 0; f < 4; f++) {
        const p = Pix(TW, h0, true);
        const standTop = Y(418), standBot = Y(GE);
        // 顶棚 + 立柱 + 花边
        p.rect(0, Y(384), TW, 6, C.wood[2]); p.rect(0, Y(384), TW, 1, C.wood[3]);
        for (let x = 0; x < TW; x++) { const sc = Y(390) + (x % 12 < 6 ? (x % 6 < 3 ? 2 : 3) : (x % 6 < 3 ? 3 : 2)); p.rect(x, Y(390), 1, sc - Y(390) + 1, Math.floor(x / 12) % 2 ? C.red[1] : C.cream[1]); }
        for (let x = 0; x < TW; x++) for (let y = Y(394); y < standBot; y++) p.put(x, y, y < standTop ? C.wood[0] : (y - standTop) % 16 < 12 ? (bayer(x, y) < 0.25 ? C.wood[1] : C.wood[0]) : C.wood[1]);   // 看台背板：一排排台阶
        for (let x = 20; x < TW; x += 104) { p.rect(x, Y(384), 4, standBot - Y(384), C.wood[2]); p.rect(x, Y(384), 1, standBot - Y(384), C.wood[3]); }
        // 台阶
        for (let row = 0; row < 7; row++) { const y = standTop + row * 16; p.rect(0, y + 12, TW, 4, C.wood[1]); p.rect(0, y + 12, TW, 1, C.wood[2]); }
        // 人群：碳球观众（圆头 + 帽子），每帧有人上下弹 / 举帽 / 挥小旗
        for (const [x, row, tone, ph, hat] of seats) {
          const y = standTop + row * 16 + 11, act = (Math.floor(ph * 4) + f) % 4, bob = ph < 0.55 ? (act === 1 ? 1 : 0) : 0, cheer = ph > 0.86 && act < 2;
          const col = C.crowd[1 + tone % 3], hy = y - 6 - bob - (cheer ? 1 : 0);
          p.rect(x, hy, 5, 6, col); p.put(x, hy, 0); p.put(x + 4, hy, 0); p.put(x + 1, hy + 1, C.crowd[4]);
          if (hat === 1) { p.rect(x, hy - 1, 5, 1, C.crowd[0]); p.rect(x + 1, hy - 4, 3, 3, C.crowd[0]); }         // 礼帽
          else if (hat === 2) { p.rect(x - 1, hy, 7, 1, C.crowd[0]); p.rect(x + 1, hy - 2, 3, 2, C.crowd[0]); }  // 圆顶礼帽
          else if (hat === 3) { p.rect(x - 1, hy, 7, 1, C.cream[1]); p.rect(x, hy - 1, 5, 1, C.cream[1]); }        // 女士草帽
          if (cheer) { const up = act === 0; p.rect(x + 5, hy - (up ? 5 : 3), 1, up ? 5 : 3, col); if (hat === 4) p.rect(x + 5, hy - 9, 4, 3, (f % 2) ? C.red[2] : C.navy[2]); else if (up) p.rect(x + 4, hy - 7, 3, 2, C.crowd[0]); }
        }
        // 前面的广告围板（抽象图案，不写字）
        p.rect(0, Y(GE) - 12, TW, 12, C.wood[1]);
        for (let x = 0; x < TW; x += 64) { const k = (x / 64) % 4, col = [C.red, C.navy, C.cream, C.green][k]; p.rect(x + 2, Y(GE) - 11, 60, 10, col[1] || col[0]); p.rect(x + 2, Y(GE) - 11, 60, 1, (col[2] || col[1])); if (k === 0) p.disc(x + 32, Y(GE) - 6, 4, C.cream[2]); else if (k === 1) for (let i = 0; i < 5; i++) p.rect(x + 10 + i * 10, Y(GE) - 8, 6, 4, C.cream[1]); else if (k === 2) p.rect(x + 12, Y(GE) - 7, 40, 2, C.red[1]); else p.disc(x + 32, Y(GE) - 6, 3, C.cream[1]); }
        // 顶棚上的旗杆 + 飘动的三角旗（4 帧飘动）
        for (const fx of flagX) {
          p.rect(fx, Y(350), 2, Y(384) - Y(350), C.wood[3]);
          for (let k = 0; k < 16; k++) { const wave = Math.round(Math.sin(k * 0.55 - f * Math.PI / 2) * (k / 16) * 3), hh = Math.round(10 * (1 - k / 18)); p.rect(fx + 2 + k, Y(351) + wave + (10 - hh) / 2, 1, hh, (fx / 156) % 2 ? C.red[2] : C.navy[2]); }
        }
        // 彩旗串：旗杆之间下垂的三角小旗
        for (let i = 0; i < flagX.length; i++) {
          const a = flagX[i], b = i + 1 < flagX.length ? flagX[i + 1] : flagX[0] + TW;
          for (let x = a; x < b; x++) { const k = (x - a) / (b - a), y = Y(356) + Math.round(Math.sin(k * Math.PI) * 18); p.put(x, y, C.wood[0]); if ((x - a) % 10 === 5) { const sw = (f + Math.floor(x / 10)) % 2; const col = [C.red[2], C.cream[2], C.navy[2]][Math.floor(x / 10) % 3]; for (let k2 = 0; k2 < 5; k2++) p.rect(x - 2 + Math.floor(k2 / 2) + sw * 0, y + 1 + k2, 5 - k2, 1, col); } }
        }
        p.rect(0, standBot, TW, h0 - standBot, C.gnd[1]);
        // 两圈宽，圆筒采样跨接缝用
        const [c2, x2] = mk(TW * 2, h0); x2.drawImage(p.done(), 0, 0); x2.drawImage(c2, 0, 0, TW, h0, TW, 0, TW, h0);
        frames.push(c2);
      }
      S.stands = frames; S.standsY = y0;
    }
    S.floor = floorTex(C.gnd, (p, x, y) => {
      const d = y + F0;
      if (d < GROUND) {
        const k = (d - F0) / (GROUND - F0), lane = (d - F0) % 24;
        if (lane === 0 && (x % 48) < 30) return '#5e5a4e';   // 白灰车道线
        if ((d - F0) % 6 === 3 && hash(x >> 2, d) < 0.6) return C.gnd[1];   // 耙过的沙道
        return bayer(x, y) < 0.3 + k * 0.4 ? C.gnd[3] : C.gnd[2];
      }
      return null;
    }, [['#1a1612', 0.04]], (p, r, Y) => {
      // 起跑区的白灰方格、撒落的彩票和稻草屑
      for (let x = 0; x < TW; x += 416) for (let yy = 0; yy < 5; yy++) for (let k = 0; k < 4; k++) if ((yy + k) % 2) p.rect(x + k * 4, Y(566) + yy * 4, 4, 4, '#4e483c');
      for (let i = 0; i < 70; i++) { const x = r() * TW, y = Y(556 + r() * 88); p.rect(x, y, 3, 2, r() < 0.5 ? '#625c50' : '#56302e'); }
      for (let i = 0; i < 120; i++) { const x = r() * TW, y = Y(556 + r() * 88); p.rect(x, y, 3, 1, '#554a3a'); }
    });
    S.near = nearTex(1400, 64, (p) => {
      // 围绳立柱（绳子另画成下垂弧线）
      for (let x = 60; x < 1400; x += 280) { p.rect(x, 20, 5, 44, C.near); p.disc(x + 2, 19, 4, C.near); }
    }, C.rim);
    // 围绳一跨、前排观众的脑袋（5 种帽子）都预先画好
    S.rope = (() => { const q = Pix(284, 14); for (let k = 0; k <= 280; k++) q.rect(2 + k, Math.round(Math.sin(k / 280 * Math.PI) * 10), 1, 2, '#2a1e18'); return q.done(); })();
    S.headImg = [0, 1, 2, 3, 4].map(hat => {
      const q = Pix(30, 64), x = 15, top = 16;
      q.disc(x, top + 8, 9, C.near); q.rect(x - 9, top + 8, 19, 64, C.near);
      if (hat === 1) { q.rect(x - 7, top - 11, 14, 12, C.near); q.rect(x - 11, top, 22, 3, C.near); }
      else if (hat === 2) { q.disc(x, top + 1, 7, C.near); q.rect(x - 11, top + 1, 22, 3, C.near); }
      else if (hat === 3) { q.rect(x - 13, top + 2, 26, 3, C.near); q.rect(x - 6, top - 3, 12, 5, C.near); }
      for (let xx = 0; xx < 30; xx++) for (let y = 0; y < 64; y++) if (q.has(xx, y)) { if (xx < x && hash(xx, y) < 0.9) q.put(xx, y, C.rim[0]); break; }   // 头顶左半边一道天光
      return q.done();
    });
    S.heads = []; { const r = rng(91); for (let x = 0; x < 1400;) { S.heads.push([x, 18 + r() * 10, Math.floor(r() * 5), r() * TAU]); x += 30 + r() * 60; } }
    // ---- 每帧 ----
    S.back = (g, vw, vh, oy, camx, t) => {
      paintSky(g, S, vw, vh, oy);
      const sx = Math.round(vw * 0.18), sy = Math.round(120 - oy);
      g.globalAlpha = 0.12; blob(g, sx, sy, 60, '#9a9a88'); blob(g, sx, sy, 38, '#9a9a88'); g.globalAlpha = 1; blob(g, sx, sy, 17, '#b2ae98');
      clouds(g, S, vw, oy, camx, t);
      // 飞艇：很慢地横穿天空；两只热气球上下飘
      const span = vw + 300, ax = ((t * 9 - camx * 0.03) % span + span) % span - 150;
      g.drawImage(S.airship, Math.round(ax), Math.round(150 - oy + Math.sin(t * 0.4) * 3));
      for (let i = 0; i < 2; i++) { const bx = ((vw * (0.45 + i * 0.35) + t * (2 + i) - camx * 0.04) % (vw + 60) + vw + 60) % (vw + 60) - 30; g.drawImage(S.balloon, Math.round(bx), Math.round(230 + i * 60 - oy + Math.sin(t * 0.5 + i * 2) * 8)); }
      strip(g, S.far, S.farY, camx * 0.05, vw, oy);
      // 钟楼上的分针在走
      spots(S.clock[0], camx * 0.05, TW, vw, 10, (x) => { const a = t * 0.2 - Math.PI / 2; R(g, x + Math.cos(a) * 5, S.clock[1] - oy + Math.sin(a) * 5, 1, 1, '#2c333b'); R(g, x + Math.cos(a) * 3, S.clock[1] - oy + Math.sin(a) * 3, 1, 1, '#2c333b'); });
      strip(g, S.mid2, S.mid2Y, camx * 0.15, vw, oy);
      const r2 = camx * 0.15;
      // 摩天轮：轮圈 + 8 根辐条 + 8 个吊厢（吊厢不跟着转，始终朝下）
      spots(S.ferris[0], r2, TW, vw, 50, (x) => {
        const y = S.ferris[1] - oy, a = t * 0.25, RR = 44;
        g.fillStyle = C.wood[2];
        for (let k = 0; k < 140; k++) { const b = k / 140 * TAU; g.fillRect(Math.round(x + Math.cos(b) * RR), Math.round(y + Math.sin(b) * RR), 1, 1); }
        for (let k = 0; k < 10; k++) {
          const b = a + k * TAU / 10;
          for (let d = 2; d < RR; d += 2) g.fillRect(Math.round(x + Math.cos(b) * d), Math.round(y + Math.sin(b) * d), 1, 1);
          const cx = Math.round(x + Math.cos(b) * RR), cy = Math.round(y + Math.sin(b) * RR);
          R(g, cx - 3, cy + 1, 7, 5, k % 2 ? C.red[2] : C.cream[2]); R(g, cx - 3, cy + 1, 7, 1, C.wood[1]);
        }
        R(g, x - 2, y - 2, 5, 5, C.wood[3]);
      });
      // 帐篷顶的小旗
      for (const [u, y] of S.pennants) spots(u, r2, TW, vw, 12, (x) => { for (let k = 0; k < 7; k++) R(g, x + k, y - oy + Math.round(Math.sin(t * 6 - k * 0.7) * (k / 7) * 1.5), 1, Math.max(1, 4 - Math.floor(k / 2)), C.red[2]); });
      drum(g, S.stands[Math.floor(t * 3.5) % 4], S.standsY, camx * 0.45, vw, oy);
      // 圆筒两边压暗，显出场地是一圈
      // 只压两边各 20%（中间 60% 不画，省掉一整屏的半透明混合）
      const bot = F0 - oy, ew = Math.ceil(vw * 0.2);
      if (!S.edge || S.edge.w !== ew) { const gr = g.createLinearGradient(0, 0, ew, 0); gr.addColorStop(0, 'rgba(7,8,12,0.55)'); gr.addColorStop(1, 'rgba(7,8,12,0)'); S.edge = { w: ew, gr }; }
      g.fillStyle = S.edge.gr; g.fillRect(0, 0, ew, bot);
      g.save(); g.translate(vw, 0); g.scale(-1, 1); g.fillRect(0, 0, ew, bot); g.restore();
    };
    S.front = (g, vw, vh, oy, camx, t) => {
      const per = S.near.width, rot = ((Math.round(camx * 1.4) % per) + per) % per;
      // 围绳：立柱之间下垂的粗绳
      for (let x0 = 60 - rot - per; x0 < vw + per; x0 += 280) if (x0 < vw + 10 && x0 + 284 > -10) g.drawImage(S.rope, x0, vh - 42);
      nearLayer(g, S.near, vw, vh, camx);
      // 前排观众的后脑勺（碳球 + 帽子剪影），跟着比赛一起一伏
      g.fillStyle = C.near;
      for (const [u, hh, hat, ph] of S.heads) for (let x = u - rot - per; x < vw + 30; x += per) {
        if (x < -30) continue;
        const bob = Math.round(Math.max(0, Math.sin(t * 2.4 + ph)) * 3), top = Math.round(vh - hh - bob);
        g.drawImage(S.headImg[hat], Math.round(x) - 15, top - 16);
        if (Math.sin(t * 0.7 + ph * 3) > 0.93) { const up = Math.floor(t * 5) % 2; g.fillRect(Math.round(x + 8), top - 10 - up * 3, 3, 14); g.fillRect(Math.round(x + 6), top - 14 - up * 3, 8, 4); }   // 举帽子欢呼
      }
      // 彩纸：几片慢慢飘落翻转
      const cols = [C.red[2], C.cream[2], C.navy[2], '#6e6a3a'];
      for (let i = 0; i < 12; i++) {
        const f = (t * 0.07 + i * 0.083) % 1, x = ((i * 157 + Math.sin(t * 0.9 + i) * 30 - camx * 1.2) % (vw + 40) + vw + 40) % (vw + 40) - 20, y = f * vh * 0.9;
        R(g, x, y, Math.abs(Math.sin(t * 5 + i)) > 0.5 ? 3 : 1, 2, cols[i % 4]);
      }
    };
    return S;
  }

  // ---------- 共用：地面纹理、近景纹理 ----------
  // 地面：TW × (H - F0)，paint 返回地面以上（后方场地）的颜色；地面以下是泥土截面（地层线 + 埋着的石子），specks = 散点
  function floorTex(G, paint, specks, deco) {
    const p = Pix(TW, H - F0, true);
    for (let y = 0; y < H - F0; y++) for (let x = 0; x < TW; x++) {
      const d = y + F0;
      let col = paint(p, x, y);
      if (col == null) {
        const k = d - GROUND;
        col = k < 2 ? G[3] : k < 4 ? G[2] : ((k - 8) % 14 === 0 && hash(x >> 2, k) < 0.7) ? G[0] : bayer(x, y) < 0.25 ? G[0] : G[1];
      }
      p.put(x, y, col);
    }
    for (const [c, dens] of specks) for (let i = 0; i < TW * (H - F0) * dens / 24; i++) { const x = Math.floor(hash(i, 91) * TW), y = Math.floor(hash(i, 97) * (H - F0)); p.rect(x, y, 2, 1, c); }
    if (deco) deco(p, rng(TW + specks.length), (wy) => wy - F0);
    for (let x = 0; x < TW; x++) p.put(x, GROUND - F0, G[4]);   // 地面线上 1px 受光
    return p.done();
  }
  // 近景：w × h 的剪影条（贴在画面最下沿），顶边 1px 描上场景的轮廓光
  function nearTex(w, h, paint, rim) {
    const p = Pix(w, h, true), r = rng(w);
    paint(p, r);
    const [rimA, rimB] = [].concat(rim).map(u32), mark = [];
    // 每列最上面一个像素描轮廓光（被炉火 / 天光照亮），下面一个像素半亮（抖动）
    for (let x = 0; x < w; x++) for (let y = 1; y < h; y++) if (p.has(x, y) && !p.has(x, y - 1)) { mark.push([x, y]); break; }
    for (const [x, y] of mark) { if (hash(x, y) < 0.85) p.put(x, y, rimA); if (rimB && (x + y) % 2 && p.has(x, y + 1)) p.put(x, y + 1, rimB); }
    return p.done();
  }
  function nearLayer(g, tex, vw, vh, camx) {
    const per = tex.width, u = ((Math.round(camx * 1.4) % per) + per) % per, y = vh - tex.height;
    for (let x = -u; x < vw; x += per) g.drawImage(tex, x, y);
  }
  // 场景里的碳球小人（sprite 尺寸 40×40），按 [人, 姿势, 表情, 朝向] 缓存
  const coalCache = {};
  function coalSprite(name, pose, expr, look) {
    const k = `${name}|${pose}|${expr}|${look}`;
    if (coalCache[k]) return coalCache[k];
    const ch = SA.Coal && SA.Coal.byName[name];
    return (coalCache[k] = ch ? SA.Coal.draw(ch, { size: 'sprite', pose, expr, look }) : document.createElement('canvas'));
  }

  // =====================================================================
  // 氛围层（不要求像素风，重点是质感）：画在设备分辨率上，平滑、可以虚化。
  //  fxBack（车后面）：远景和中景之间的景深雾、成团的雾带、灯的光晕和光锥、地上的树影、车底的软接触影子
  //  fxFront（车前面、HUD 下面）：贴地薄雾、整体调色、泛光、超近景的虚化剪影（比车移动得快；挡到车或准星时自动变淡）、
  //           空气里的飘浮物（火星、花粉、雨丝、雾里的浮尘）、镁光灯、暗角、胶片颗粒
  // 参考：低视角横版游戏「前景遮挡 + 体积光 + 雾」的做法。设置里能关（localStorage steam_arena_scene_fx = off），关掉就是纯像素画面
  // =====================================================================
  const FXKEY = 'steam_arena_scene_fx';
  let fxOn = (() => { try { return localStorage.getItem(FXKEY) !== 'off'; } catch (e) { return true; } })();
  function setFx(on) { fxOn = !!on; fxLevel = 2; try { sessionStorage.removeItem(LVKEY); } catch (e) { /* ignore */ } try { localStorage.setItem(FXKEY, fxOn ? 'on' : 'off'); } catch (e) { /* 不记也行 */ } }
  // 自动降档：整帧掉到 30 帧以下持续 1.5 秒就降一档（2 全开 → 1 精简：不要颗粒、调色、暗角、泛光、镁光灯 → 0 关），本次打开游戏内不再升回去。
  // 没有显卡加速的环境（软件渲染）里全屏混合很贵，有显卡时这一层只占一两毫秒
  // 定下来的档位记在 sessionStorage：同一次打开游戏，后面的战斗直接从这一档开始，不再卡一下
  const LVKEY = 'steam_arena_scene_fx_level';
  let fxLevel = (() => { try { const v = +sessionStorage.getItem(LVKEY); return v >= 0 && v <= 2 && sessionStorage.getItem(LVKEY) != null ? v : 2; } catch (e) { return 2; } })();
  const perf = { ema: 0, last: 0, slow: 0, warm: 0 };
  function watch(t) {
    const dt = perf.last ? t - perf.last : 0; perf.last = t;
    if (!dt || dt > 1) { perf.slow = 0; return; }   // 切到后台 / 暂停回来的那一帧不算
    perf.warm += dt; perf.ema = perf.ema ? perf.ema * 0.92 + dt * 0.08 : dt;
    if (perf.warm < 0.5) return;
    perf.slow = perf.ema > 1 / 30 ? perf.slow + dt : 0;
    if ((perf.slow > 1 || perf.ema > 1 / 12) && fxLevel > 0) {   // 慢到 12 帧以下立刻降，30 帧以下撑 1 秒再降
      fxLevel--; perf.slow = 0; perf.warm = 0; perf.ema = 0;
      try { sessionStorage.setItem(LVKEY, String(fxLevel)); } catch (e) { /* ignore */ }
      if (window.console) console.info(`[场景特效] 帧率偏低，自动降到第 ${fxLevel} 档`);
    }
  }
  const can = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const rgbaS = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // 虚化：先画在 1/k 的小画布上，再分两步平滑放大 —— 便宜，也不依赖 ctx.filter（Safari 没有）
  function soften(w, h, k, paint) {
    const s = can(w / k, h / k), sx = s.getContext('2d'); sx.scale(1 / k, 1 / k); paint(sx);
    const m = can(w / 2, h / 2), mx = m.getContext('2d'); mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(s, 0, 0, m.width, m.height);
    const c = can(w, h), cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.drawImage(m, 0, 0, w, h);
    return c;
  }
  // 光晕贴图：按颜色缓存的径向渐变（中心实、边缘柔和衰减）；黑色的同一张图就是软影子
  const glowCache = {};
  function glowTex(hex, size = 256) {
    const key = hex + size;
    if (glowCache[key]) return glowCache[key];
    const R0 = size / 2, c = can(size, size), x = c.getContext('2d'), gr = x.createRadialGradient(R0, R0, 0, R0, R0, R0);
    [[0, 1], [0.12, 0.62], [0.35, 0.25], [0.65, 0.07], [1, 0]].forEach(([k, a]) => gr.addColorStop(k, rgbaS(hex, a)));
    x.fillStyle = gr; x.fillRect(0, 0, size, size);
    return (glowCache[key] = c);
  }
  // 光锥：顶上窄、往下张开，两边和底下都是软边
  const coneCache = {};
  function coneTex(hex) {
    if (coneCache[hex]) return coneCache[hex];
    return (coneCache[hex] = soften(256, 512, 8, (x) => {
      const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, rgbaS(hex, 0.9)); gr.addColorStop(0.7, rgbaS(hex, 0.35)); gr.addColorStop(1, rgbaS(hex, 0));
      x.fillStyle = gr; x.beginPath(); x.moveTo(108, 0); x.lineTo(148, 0); x.lineTo(236, 500); x.lineTo(20, 500); x.closePath(); x.fill();
    }));
  }
  // 雾带贴图：一串软椭圆叠成的云团（横向首尾相接，可平铺）
  const fogCache = {};
  function fogTex(hex, seed) {
    const key = hex + seed;
    if (fogCache[key]) return fogCache[key];
    const r = rng(seed);
    return (fogCache[key] = soften(1024, 256, 8, (x) => {
      for (let i = 0; i < 46; i++) {
        const cx = r() * 1024, cy = 128 + (r() - 0.5) * 90, rx = 70 + r() * 150, ry = 22 + r() * 40;
        x.fillStyle = rgbaS(hex, 0.25 + r() * 0.4);
        for (const ox of [-1024, 0, 1024]) { x.beginPath(); x.ellipse(cx + ox, cy, rx, ry, 0, 0, TAU); x.fill(); }
      }
    }));
  }
  // ---------- 超近景剪影：离镜头极近，所以大、暗、虚 ----------
  // 每种画在「基准像素」里（1280 宽的画面），实际大小 × 镜头缩放；col = 剪影色（各场景压暗的主色）
  const NEAR = {
    bush: [560, 500, (x, col, r) => {
      x.strokeStyle = x.fillStyle = col; x.lineCap = 'round';
      const br = (px, py, len, a, w, d) => {
        const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
        x.lineWidth = w; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo((px + ex) / 2 + (r() - 0.5) * 30, (py + ey) / 2, ex, ey); x.stroke();
        if (d <= 1) for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(ex + (r() - 0.5) * 50, ey + (r() - 0.5) * 40, 18 + r() * 22, 12 + r() * 16, r() * 3, 0, TAU); x.fill(); }
        if (d > 0) for (let i = 0; i < 2 + (r() < 0.5 ? 1 : 0); i++) br(ex, ey, len * (0.62 + r() * 0.15), a + (r() - 0.5) * 1.3, w * 0.62, d - 1);
      };
      for (let i = 0; i < 4; i++) br(280 + (r() - 0.5) * 60, 500, 120 + r() * 50, -Math.PI / 2 + (r() - 0.5) * 0.9, 22, 4);
    }],
    grass: [380, 340, (x, col, r) => {
      x.fillStyle = col;
      for (let i = 0; i < 46; i++) {
        const bx = 20 + r() * 340, len = 120 + r() * 210, bend = (r() - 0.4) * 140, w = 5 + r() * 7;
        x.beginPath(); x.moveTo(bx - w, 340); x.quadraticCurveTo(bx + bend * 0.4, 340 - len * 0.6, bx + bend, 340 - len); x.quadraticCurveTo(bx + bend * 0.4 + w, 340 - len * 0.6, bx + w, 340); x.fill();
        if (r() < 0.12) { x.beginPath(); x.ellipse(bx + bend, 340 - len - 6, 9, 16, bend / 300, 0, TAU); x.fill(); }   // 穗子
      }
    }],
    scrap: [660, 300, (x, col) => {
      x.fillStyle = x.strokeStyle = col;
      x.beginPath(); x.ellipse(330, 330, 330, 120, 0, Math.PI, TAU); x.fill();                       // 废料堆
      x.save(); x.translate(200, 150); x.rotate(0.3); x.fillRect(-10, -150, 26, 260); x.restore();     // 斜插的管子
      x.lineWidth = 16; x.beginPath(); x.arc(470, 170, 70, 0, TAU); x.stroke();                       // 车轮
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; x.lineWidth = 7; x.beginPath(); x.moveTo(470, 170); x.lineTo(470 + Math.cos(a) * 70, 170 + Math.sin(a) * 70); x.stroke(); }
      x.beginPath(); for (let k = 0; k < 24; k++) { const a = k * TAU / 24, rr = k % 2 ? 46 : 60; x.lineTo(320 + Math.cos(a) * rr, 210 + Math.sin(a) * rr); } x.fill();   // 齿轮
    }],
    post: [760, 560, (x, col) => {
      x.fillStyle = x.strokeStyle = col;
      x.fillRect(340, 20, 54, 560); x.fillRect(330, 10, 74, 20);
      x.lineWidth = 4; for (const [y0, s] of [[150, 40], [260, 46]]) { x.beginPath(); x.moveTo(0, y0); x.quadraticCurveTo(190, y0 + s, 360, y0); x.quadraticCurveTo(560, y0 + s, 760, y0); x.stroke(); }
      for (let k = 30; k < 760; k += 60) x.fillRect(k, 158 + Math.sin(k / 120) * 10, 10, 6);   // 铁丝刺
    }],
    chain: [160, 470, (x, col) => {
      x.strokeStyle = x.fillStyle = col; x.lineWidth = 9;
      for (let y = 0; y < 380; y += 30) { x.beginPath(); x.ellipse(80, y + 15, (y / 30) % 2 ? 6 : 15, 18, 0, 0, TAU); x.stroke(); }
      x.lineWidth = 16; x.beginPath(); x.arc(80, 420, 34, -0.3, Math.PI * 1.1); x.stroke();          // 吊钩
    }],
    branch: [820, 400, (x, col, r) => {
      x.strokeStyle = x.fillStyle = col; x.lineCap = 'round';
      x.lineWidth = 34; x.beginPath(); x.moveTo(-20, 40); x.quadraticCurveTo(320, 60, 760, 150); x.stroke();
      for (let i = 0; i < 9; i++) {
        const t = 0.1 + i * 0.1, px = -20 + 780 * t, py = 40 + 110 * t * t, len = 80 + r() * 140, a = Math.PI / 2 + (r() - 0.5) * 1.4;
        x.lineWidth = 9; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
        for (let k = 0; k < 5; k++) { x.beginPath(); x.ellipse(px + Math.cos(a) * len * (0.5 + r() * 0.6) + (r() - 0.5) * 50, py + Math.sin(a) * len * (0.5 + r() * 0.6), 20 + r() * 18, 10 + r() * 10, r() * 3, 0, TAU); x.fill(); }
      }
    }],
    heads: [820, 300, (x, col, r) => {
      x.fillStyle = col;
      for (let i = 0; i < 6; i++) {
        const cx = 70 + i * 135 + (r() - 0.5) * 30, top = 90 + r() * 70, rr = 48 + r() * 14;
        x.beginPath(); x.ellipse(cx, top + rr, rr, rr * 1.05, 0, 0, TAU); x.fill(); x.fillRect(cx - rr * 1.5, top + rr * 1.6, rr * 3, 300);   // 后脑勺 + 肩膀
        const hat = i % 3;
        if (hat === 0) { x.fillRect(cx - rr * 0.75, top - rr * 0.9, rr * 1.5, rr * 1.2); x.fillRect(cx - rr * 1.2, top + rr * 0.25, rr * 2.4, 12); }   // 礼帽
        else if (hat === 1) { x.beginPath(); x.ellipse(cx, top + rr * 0.3, rr * 0.9, rr * 0.75, 0, Math.PI, TAU); x.fill(); x.fillRect(cx - rr * 1.3, top + rr * 0.25, rr * 2.6, 10); }   // 圆顶礼帽
      }
    }],
    bunting: [1100, 230, (x, col, r) => {
      x.strokeStyle = x.fillStyle = col; x.lineWidth = 5;
      const y = (k) => 30 + Math.sin(k * Math.PI) * 110;
      x.beginPath(); for (let k = 0; k <= 1; k += 0.02) x.lineTo(k * 1100, y(k)); x.stroke();
      for (let k = 0.04; k < 1; k += 0.07) { const px = k * 1100, py = y(k); x.beginPath(); x.moveTo(px - 28, py); x.lineTo(px + 28, py); x.lineTo(px + (r() - 0.5) * 10, py + 70 + r() * 20); x.fill(); }
    }],
  };
  // 按屏幕上的实际大小（缩放取 0.05 一档）缓存一张，每帧只做 1:1 的贴图，不做缩放和变形（没显卡时缩放 / 斜切都很慢）
  function nearImg(S, i, s) {
    S.fxNear = S.fxNear || [];
    const o = S.fx.near[i], [w, h, paint] = NEAR[o.kind], q = Math.round(s * 20) / 20, m = S.fxNear[i] || (S.fxNear[i] = {});
    if (!m.src) m.src = soften(w, h, o.blur || 7, (x) => paint(x, S.fx.nearCol, rng(31 + i * 17)));
    if (!m[q]) { const c = can(w * q, h * q), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(m.src, 0, 0, c.width, c.height); m[q] = c; }
    return m[q];
  }
  // 雾带：贴图横向平铺，按视差和时间平移；b = { y 世界中心, h 世界高, a, col, par, v, seed }
  function fogBand(g, c, b) {
    const tex = fogTex(b.col, b.seed || 3), Z = c.Z, dh = b.h * Z, dw = tex.width * (dh / tex.height) * 1.6;
    const y = (b.y - c.camy) * Z - dh / 2, off = ((c.camx * (b.par || 0.6) * Z + c.t * (b.v || 6) * Z) % dw + dw) % dw;
    g.globalAlpha = b.a;
    for (let x = -off; x < c.W; x += dw) g.drawImage(tex, x, y, dw + 1, dh);
    g.globalAlpha = 1;
  }
  // 灯：L = { x, y 视口像素, r 世界半径, col, a, flick, cone: [长, 半宽] }；mul = 强度倍数，grow = 半径倍数（泛光用）
  function drawLight(g, c, L, mul = 1, grow = 1) {
    const dx = (L.x + c.ox - c.camx) * c.Z, dy = (L.y + c.oy - c.camy) * c.Z;
    const fl = L.flick ? 0.82 + 0.18 * Math.sin(c.t * 13 + L.x) * Math.sin(c.t * 7.3 + L.y) : 1, r = L.r * c.Z * grow;
    g.globalAlpha = Math.min(1, L.a * fl * mul);
    g.drawImage(glowTex(L.col), dx - r, dy - r, r * 2, r * 2);
    if (L.cone && grow === 1) {
      const [len, wid] = L.cone, w = wid * 2 * c.Z, h = len * c.Z;
      g.globalAlpha = Math.min(1, L.a * fl * mul * 0.55);
      g.drawImage(coneTex(L.col), dx - w / 2, dy, w, h);
      g.fillStyle = rgbaS(L.col, 0.8);   // 光锥里飘的灰
      for (let i = 0; i < 10; i++) { const f = (c.t * 0.05 + hash(i, 5)) % 1, px = dx + (hash(i, 6) - 0.5) * w * (0.2 + f * 0.6) + Math.sin(c.t + i) * 4 * c.Z, py = dy + f * h * 0.9; g.globalAlpha = 0.5 * Math.sin(f * Math.PI); g.fillRect(px, py, 1.5 * c.Z, 1.5 * c.Z); }
    }
    g.globalAlpha = 1;
  }
  const vigCache = {};
  function vignette(W2, H2, a) {
    const k = `${W2}x${H2}x${a}`;
    if (vigCache[k]) return vigCache[k];
    const c = can(W2, H2), x = c.getContext('2d'), gr = x.createRadialGradient(W2 / 2, H2 * 0.48, Math.min(W2, H2) * 0.35, W2 / 2, H2 * 0.48, Math.hypot(W2, H2) * 0.6);
    gr.addColorStop(0, 'rgba(4,4,8,0)'); gr.addColorStop(1, `rgba(4,4,8,${a})`);
    x.fillStyle = gr; x.fillRect(0, 0, W2, H2);
    return (vigCache[k] = c);
  }
  let grainC = null;
  function grain() {
    if (grainC) return grainC;
    grainC = can(192, 192); const x = grainC.getContext('2d'), img = x.createImageData(192, 192);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return grainC;
  }
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

  // c = { W, H 设备画布, Z 设备像素 / 世界像素, camx, camy, ox, oy 视口左上角（世界）, vw, vh, t, opts, cars: [{ x0, x1, y0, y1, ground }], aim: [x, y] 世界 }
  function fxBack(id, g, c) {
    if (!fxOn) return;
    watch(c.t);
    if (!fxLevel) return;
    const full = fxLevel > 1;   // 精简档：只留超近景、小灯、光锥、车底影子和少量飘浮物，不画整屏的雾和大光晕
    const S = get(id), F = S.fx;
    if (!F) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const Z = c.Z, Y = (wy) => (wy - c.camy) * Z;
    if (F.haze && full) {   // 景深雾：远景和中景之间、地平线一带最浓
      const [col, a] = F.haze, y0 = Y(HZ - 160), y1 = Y(F0 + 20), gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, rgbaS(col, 0)); gr.addColorStop(0.6, rgbaS(col, a)); gr.addColorStop(1, rgbaS(col, a * 0.3));
      g.fillStyle = gr; g.fillRect(0, y0, c.W, y1 - y0);
    }
    if (full) for (const b of F.banks || []) fogBand(g, c, b);
    if (F.dapple && full) {   // 地上的树影：几团软暗斑，跟着地面走，慢慢晃
      const sh = glowTex('#000000');
      for (let i = 0; i < 9; i++) {
        const per = 2600, u = hash(i, 41) * per, x = (((u - c.camx) % per + per) % per - 300) * Z + Math.sin(c.t * 0.6 + i) * 6 * Z, w = (180 + hash(i, 42) * 220) * Z, h = 26 * Z;
        g.globalAlpha = F.dapple; g.drawImage(sh, x - w / 2, Y(GROUND - 30 - hash(i, 43) * 50) - h / 2, w, h);
      }
      g.globalAlpha = 1;
    }
    S.fxLights = F.lights ? F.lights(c) : [];
    g.globalCompositeOperation = 'lighter';
    for (const L of S.fxLights) if (full || L.r <= 120) drawLight(g, c, L);
    g.globalCompositeOperation = 'source-over';
    // 车底软影：贴着地面的一团扁椭圆，车越宽影子越长
    const sh = glowTex('#000000');
    for (const car of c.cars) {
      const x0 = (car.x0 - c.camx) * Z, x1 = (car.x1 - c.camx) * Z, w = (x1 - x0) * 1.25, h = 22 * Z;
      g.globalAlpha = F.shadow == null ? 0.45 : F.shadow; g.drawImage(sh, (x0 + x1) / 2 - w / 2, Y(car.ground) - h * 0.45, w, h);
    }
    g.globalAlpha = 1;
    g.restore();
  }
  function fxFront(id, g, c) {
    if (!fxOn || !fxLevel) return;
    const full = fxLevel > 1;
    const S = get(id), F = S.fx;
    if (!F) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const Z = c.Z, W2 = c.W, H2 = c.H, st = S.fxState || (S.fxState = { fade: {}, last: c.t, flash: [] }), dt = Math.max(0, Math.min(0.1, c.t - st.last)); st.last = c.t;
    if (F.mist && full) fogBand(g, c, F.mist);   // 贴地薄雾，从车轮前面飘过
    if (F.grade && full) { const [col, a, mode] = F.grade; g.globalCompositeOperation = mode; g.fillStyle = rgbaS(col, a); g.fillRect(0, 0, W2, H2); g.globalCompositeOperation = 'source-over'; }
    // 泛光：灯再叠一层更大更淡的光，溢到车身和前景上
    g.globalCompositeOperation = 'lighter';
    if (full) for (const L of S.fxLights || []) drawLight(g, c, L, F.bloom == null ? 0.3 : F.bloom, 1.8);
    // 镁光灯（预选赛看台）：偶尔「啪」地一闪
    if (F.flashes && full) {
      if (Math.random() < dt * F.flashes) st.flash.push({ x: Math.random() * W2, y: (418 + Math.random() * 90 - c.camy) * Z, life: 0.16 });
      for (const f of st.flash) { f.life -= dt; const r = 60 * Z * (0.6 + f.life * 3); g.globalAlpha = Math.max(0, f.life / 0.16); g.drawImage(glowTex('#f4f6ff'), f.x - r, f.y - r, r * 2, r * 2); }
      st.flash = st.flash.filter(f => f.life > 0);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // 超近景剪影：视差 2.1 倍（比车快一倍多），挡到车或准星时很快淡到 0.2
    const PAR = 2.1, per = 3600, keep = c.cars.map(k => ({ x0: (k.x0 - c.camx) * Z, x1: (k.x1 - c.camx) * Z, y0: (k.y0 - c.camy) * Z, y1: (k.y1 - c.camy) * Z }));
    if (c.aim) { const ax = (c.aim[0] - c.camx) * Z, ay = (c.aim[1] - c.camy) * Z; keep.push({ x0: ax - 40 * Z, x1: ax + 40 * Z, y0: ay - 40 * Z, y1: ay + 40 * Z }); }
    (F.near || []).forEach((o, i) => {
      const img = nearImg(S, i, (c.dpx || Z) * Math.max(0.8, Math.min(1.2, c.zoom || 1)) * (o.s || 1)), w = img.width, h = img.height;   // 镜头推近时它们不跟着放到满屏
      const x = (((o.u - c.camx * PAR) % per + per) % per - 900) * Z;
      if (x > W2 || x + w < 0) return;
      const y = o.top ? -(o.dy || 0) * Z : H2 - h + (o.dy || 0) * Z, box = { x0: x + w * 0.1, x1: x + w * 0.9, y0: y + h * 0.1, y1: y + h };
      const tgt = keep.some(k => overlap(box, k)) ? 0.2 : 1, cur = st.fade[i] == null ? tgt : st.fade[i];
      st.fade[i] = cur + (tgt - cur) * Math.min(1, dt * 7);
      g.globalAlpha = (o.a || 0.94) * st.fade[i];
      const sway = o.sway ? Math.sin(c.t * 0.8 + i * 1.7) * o.sway * h * 0.35 : 0;   // 风吹：整个轻轻左右挪
      g.drawImage(img, Math.round(x + sway), Math.round(y));
    });
    g.globalAlpha = 1;
    // 飘浮物
    const M = F.motes;
    if (M) {
      for (let i = 0, n = (M.n || 24) >> (full ? 0 : 1); i < n; i++) {
        const big = i < (M.bokeh || 0), par = big ? 2.4 : 1.3, sz = (big ? 10 + hash(i, 7) * 18 : M.size || 2) * Z;
        if (M.kind === 'rain') {   // 镜头前的雨丝：长、斜、半透明；近的更粗更虚
          const span = H2 + 200, f = ((c.t * (900 + hash(i, 3) * 400) * Z + hash(i, 4) * span) % span) - 100, Q = W2 + 200;
          const x = ((hash(i, 5) * Q - c.camx * 1.8 * Z - f * 0.18) % Q + Q) % Q - 100;
          g.strokeStyle = rgbaS(M.col, big ? 0.1 : 0.22); g.lineWidth = (big ? 3 : 1.2) * Z; g.beginPath(); g.moveTo(x, f); g.lineTo(x - 10 * Z, f + (big ? 110 : 60) * Z); g.stroke();
          continue;
        }
        const up = M.kind === 'ember' ? -1 : M.kind === 'specks' ? 1 : 0, sp = (M.speed || 20) * (0.6 + hash(i, 8)), span = H2 + 100;
        const fy = up ? ((hash(i, 9) * span + up * c.t * sp * Z) % span + span) % span - 50 : hash(i, 9) * H2 + Math.sin(c.t * 0.4 + i) * 30 * Z;
        const Q = W2 + 200, x = ((hash(i, 10) * Q + c.t * (M.drift || 8) * Z - c.camx * par * Z) % Q + Q) % Q - 100 + Math.sin(c.t * 1.3 + i) * 12 * Z;
        const tw = 0.6 + 0.4 * Math.sin(c.t * 3 + i * 2.3);
        g.globalCompositeOperation = M.glow ? 'lighter' : 'source-over';
        g.globalAlpha = (big ? 0.16 : M.a || 0.7) * tw;
        if (M.glow || big) g.drawImage(glowTex(M.col, big ? 128 : 32), x - sz * 2, fy - sz * 2, sz * 4, sz * 4);
        else { g.fillStyle = M.col; g.fillRect(x, fy, sz, sz); }
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (F.vig && full) g.drawImage(vignette(W2, H2, F.vig), 0, 0);
    if (F.grain && full) {   // 胶片颗粒：每帧换个偏移
      st.grainPat = st.grainPat || g.createPattern(grain(), 'repeat');
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = F.grain;
      g.translate(Math.floor(Math.random() * 192), Math.floor(Math.random() * 192)); g.fillStyle = st.grainPat; g.fillRect(-192, -192, W2 + 192, H2 + 192);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    g.restore();
  }

  // ---------- 各场景的氛围设置 ----------
  // lights(c) 返回这一帧的灯（视口像素坐标），位置和像素层的灯 / 窗 / 炉口对齐
  function fxConfig(id, S) {
    if (id === 'forge') {
      const HS = SA.HomeScene, wk = S.wk, t = HS.theme(wk), DY = GE - HS.BASE;
      const base = {
        sun: { grade: ['#ffb070', 0.14, 'soft-light'], haze: ['#e8d0a8', 0.22], motes: { kind: 'ember', col: '#ffb050', glow: 1, n: 16, bokeh: 3, speed: 26, size: 2 }, vig: 0.45, grain: 0.05, shadow: 0.42, door: 0.35 },
        rain: { grade: ['#40587a', 0.26, 'multiply'], haze: ['#7a8898', 0.4], banks: [{ y: GE - 30, h: 150, a: 0.35, col: '#9aa6b4', par: 0.5, v: 10, seed: 5 }], mist: { y: GROUND - 6, h: 70, a: 0.22, col: '#aab4c0', par: 1.3, v: 14, seed: 9 }, motes: { kind: 'rain', col: '#d0dcf0', n: 70, bokeh: 10 }, vig: 0.6, grain: 0.06, shadow: 0.3, door: 0.6 },
        night: { grade: ['#25305e', 0.42, 'multiply'], haze: ['#1c2444', 0.35], mist: { y: GROUND - 4, h: 60, a: 0.2, col: '#3a4468', par: 1.3, v: 6, seed: 11 }, motes: { kind: 'ember', col: '#ffa040', glow: 1, n: 22, bokeh: 4, speed: 30, size: 2 }, vig: 0.7, grain: 0.07, shadow: 0.5, door: 0.85, bloom: 0.45 },
        fog: { grade: ['#d0d4d8', 0.18, 'soft-light'], haze: ['#d4d6d8', 0.6], banks: [{ y: GE - 70, h: 200, a: 0.5, col: '#d6d8da', par: 0.4, v: 5, seed: 3 }, { y: GE + 20, h: 120, a: 0.45, col: '#e0e2e4', par: 0.8, v: -4, seed: 7 }], mist: { y: GROUND - 10, h: 110, a: 0.35, col: '#e4e6e8', par: 1.4, v: 8, seed: 13 }, motes: { kind: 'specks', col: '#f4f4f4', n: 40, bokeh: 6, speed: 18, size: 2.5, a: 0.6 }, vig: 0.4, grain: 0.06, shadow: 0.25, door: 0.5 },
      }[wk] || {};
      return { ...base, nearCol: wk === 'night' ? '#05060c' : wk === 'fog' ? '#3a3a3e' : '#0c0807', dapple: 0,
        near: [{ kind: 'scrap', u: 300, dy: 70 }, { kind: 'chain', u: 1250, top: 1, dy: 30, sway: 0.03 }, { kind: 'grass', u: 1900, dy: 30, sway: 0.05 }, { kind: 'bush', u: 2900, dy: 90, s: 0.9, sway: 0.03 }],
        lights: (c) => {
          const out = [], rot = c.camx * 0.45, MW = S.mid.width, oy2 = DY - c.oy;
          spots(S.houseX, rot, MW, c.vw, 500, (x) => {
            out.push({ x: x + 178, y: oy2 + 234, r: 110, col: '#ff8a30', a: base.door || 0.4, flick: 1 });   // 敞开的大门里的炉火
            if (t.lit) { out.push({ x: x + 402, y: oy2 + 166, r: 56, col: '#ffb050', a: 0.5 }); out.push({ x: x + 263, y: oy2 + 166, r: 34, col: '#ffd070', a: 0.65, flick: 1 }); }
            if (t.lamp) out.push({ x: x + 320, y: oy2 + 205, r: 26, col: '#ffe0a8', a: 0.55, cone: [70, 40] });   // 工作灯往下打一束光
          });
          if (S.lamp) spots(S.lamp[0], rot, MW, c.vw, 60, (x) => out.push({ x: x + 3, y: S.lamp[1] + 5 - c.oy, r: 40, col: '#ffc060', a: 0.55, flick: 1 }));
          if (t.orb) out.push({ x: t.orb[0] < 320 ? c.vw * 0.12 : c.vw * 0.86, y: t.orb[1] + DY - c.oy, r: wk === 'sun' ? 170 : 70, col: wk === 'sun' ? '#fff0c0' : '#c8d4f4', a: wk === 'sun' ? 0.4 : 0.3 });
          return out;
        } };
    }
    if (id === 'wild') return {
      grade: ['#ffc070', 0.16, 'soft-light'], haze: ['#c8b890', 0.34], banks: [{ y: 470, h: 120, a: 0.3, col: '#d0ccb4', par: 0.2, v: 3, seed: 21 }],
      mist: { y: GROUND - 8, h: 60, a: 0.14, col: '#d8d4c0', par: 1.3, v: 6, seed: 23 }, dapple: 0.2,
      motes: { kind: 'dust', col: '#ffe8b0', glow: 1, n: 30, bokeh: 4, drift: 10, size: 2 }, vig: 0.5, grain: 0.05, shadow: 0.4, nearCol: '#0a0d08',
      near: [{ kind: 'grass', u: 200, dy: 30, sway: 0.06 }, { kind: 'branch', u: 1000, top: 1, dy: 20, sway: 0.015 }, { kind: 'post', u: 1800, dy: 40, s: 0.9 }, { kind: 'bush', u: 2700, dy: 80, sway: 0.03 }, { kind: 'grass', u: 3300, dy: 40, s: 0.8, sway: 0.06 }],
      lights: (c) => {
        const out = [{ x: c.vw * 0.72, y: 318 - c.oy, r: 260, col: '#ffd890', a: 0.5 }];
        spots(S.cottage[2], c.camx * 0.15, TW, c.vw, 20, (x) => out.push({ x: x + 3, y: S.cottage[3] + 3 - c.oy, r: 16, col: '#ffb050', a: 0.55, flick: 1 }));
        return out;
      } };
    return {   // 预选赛：白天的薄尘、太阳泛光、看台上的镁光灯、前排观众和彩旗的超近景
      grade: ['#e0ecff', 0.1, 'soft-light'], haze: ['#a8b4c0', 0.28], mist: { y: GROUND - 4, h: 50, a: 0.14, col: '#d8c8a8', par: 1.3, v: 10, seed: 31 }, dapple: 0,
      flashes: 1.6, motes: { kind: 'dust', col: '#fff4d8', glow: 1, n: 20, bokeh: 3, drift: 6, size: 2 }, vig: 0.45, grain: 0.05, shadow: 0.45, nearCol: '#0b0b10',
      near: [{ kind: 'heads', u: 400, dy: 60 }, { kind: 'bunting', u: 1300, top: 1, dy: 10, sway: 0.01, a: 0.85 }, { kind: 'heads', u: 2300, dy: 80, s: 0.9 }, { kind: 'post', u: 3100, dy: 160, s: 0.8 }],
      lights: (c) => [{ x: c.vw * 0.18, y: 120 - c.oy, r: 280, col: '#fff4d8', a: 0.42 }],
    };
  }

  const built = {};
  function get(id) {
    const key = id === 'forge' && SA.HomeScene ? `forge:${SA.HomeScene.weather()}` : id;   // 铁匠铺后院跟着院子的天气，每种天气各建一次
    if (!built[key]) built[key] = id === 'forge' ? buildForge() : id === 'wild' ? buildWild() : buildQual();
    if (!built[key].fx) built[key].fx = fxConfig(id, built[key]);
    return built[key];
  }
  // 画背景（天空 → 中景）：画在世界画布的视口像素里；t = 秒（场景自己的时钟，不跟战斗暂停）
  function back(id, g, vw, vh, oy, camx, t, opts) { get(id).back(g, vw, vh, oy, camx, t, opts); }
  // 地面：世界坐标里平铺（调用前已经平移到镜头）
  function floor(id, g, cam) { const f = get(id).floor; for (let x = Math.floor((cam.x - 40) / TW) * TW; x < cam.x + cam.w + 40; x += TW) g.drawImage(f, x, F0); }
  // 近景：压在车前面，画在视口像素里（vh = 视口高，底边就是画面底边）
  function front(id, g, vw, vh, oy, camx, t) { get(id).front(g, vw, vh, oy, camx, t); }

  return { pick, get, back, floor, front, fxBack, fxFront, fxOn: () => fxOn, fxLevel: () => fxLevel, setFx, NAMES };
})();
