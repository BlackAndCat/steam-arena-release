// 出征（卷轴路线）的画面：路线物件、地标、难民、货箱、煤仓。战斗画面（js/battle-view.js）、出征黑板和样机页（tools/current.html）共用。
// 计划见 docs/expedition-plan.md §3.3、§7；造型 2026-10-06 用户定：货箱、煤仓三套造型分三个等级，样板先用 A（板条货筐、漏斗煤斗）。
// 全按世界像素 1:1 画（和车同一尺度），规则同 docs/art-direction.md：1px 像素、左上光、外轮廓取材质最暗阶、不做抗锯齿。
// 物件统一返回 { c, ax, ay }：画布 + 落地点（底边中点），按状态缓存；货箱 / 煤仓画进调用方给的画布（模块格子坐标）。
window.SA = window.SA || {};

SA.RouteArt = (() => {
  const P = SA.PAL;
  const IR = P.iron, BR = P.brass, RU = P.rust;
  const WOOD = ['#22130c', '#3b2418', '#55331f', '#6b4128', '#7f5231', '#9a6a3f', '#b88a5a'];
  const COAL = ['#08090c', '#13151a', '#1f232b', '#323844', '#535c6e'];
  const SACK = ['#2e2216', '#4f3b26', '#735838', '#977850', '#b49768'];
  const TARP = ['#2a271d', '#47412f', '#665e45', '#878063', '#a69f80'];
  const BRICK = ['#241310', '#43241c', '#62362a', '#7e4a3a', '#9a6250'];
  const STONE = ['#24221e', '#38352f', '#4f4b43', '#6a655a', '#878172'];
  const IVY = ['#121a0d', '#1f2c15', '#2e411f', '#42592b'];
  const GLOW = ['#1d4a4a', '#3f8f8a', '#7fd8cc', '#d4fff4'];   // 遗迹的以太光
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- 像素笔：1px 一格，左上光 ----------
  function wrap(c) {
    const g = c.getContext('2d');
    const q = {
      c, g,
      R(x, y, w, h, col) { if (w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
      px(x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); },
      // ramp = [描边, 暗面, 固有色, 亮面]
      box(x, y, w, h, ramp) { q.R(x, y, w, h, ramp[0]); q.R(x + 1, y + 1, w - 2, h - 2, ramp[2]); q.R(x + 1, y + h - 2, w - 2, 1, ramp[1]); q.R(x + w - 2, y + 1, 1, h - 2, ramp[1]); q.R(x + 1, y + 1, w - 2, 1, ramp[3]); q.R(x + 1, y + 1, 1, h - 2, ramp[3]); },
      disc(cx, cy, r, col) { for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) { const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy; if (dx * dx + dy * dy <= r * r) q.px(xx, yy, typeof col === 'function' ? col(dx / r, dy / r) : col); } },
      line(x0, y0, x1, y1, col, w = 1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1, o = Math.floor(w / 2); for (let i = 0; i <= n; i++) q.R(Math.round(x0 + (x1 - x0) * i / n) - o, Math.round(y0 + (y1 - y0) * i / n) - o, w, w, col); },
      img(src, x, y) { g.drawImage(src, Math.round(x), Math.round(y)); },
    };
    return q;
  }
  const pen = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return wrap(c); };
  const WOODB = [WOOD[1], WOOD[2], WOOD[4], WOOD[5]], IRONB = [IR[0], IR[1], IR[2], IR[3]], BRASSB = [BR[0], BR[1], BR[2], BR[3]];
  const skid = (q, x, y, w) => { q.R(x + 1, y, w - 2, 2, IR[0]); q.R(x + 2, y, w - 4, 1, IR[2]); q.R(x + 3, y + 2, 5, 2, IR[0]); q.R(x + w - 8, y + 2, 5, 2, IR[0]); q.R(x + 4, y + 2, 3, 1, IR[2]); q.R(x + w - 7, y + 2, 3, 1, IR[2]); };

  // ---------- 货物：麻袋 / 木箱 / 木桶 / 坐着的难民 / 遗迹件。都站在 rim（货箱口）上，下半截被箱壁挡住 ----------
  function sackAt(q, cx, rim) {
    const prof = [2, 3, 4, 4, 5, 5, 5, 5, 5], top = rim - 8;
    q.R(cx - 1, top - 2, 2, 2, SACK[3]); q.px(cx - 2, top - 3, SACK[4]); q.px(cx + 1, top - 3, SACK[2]);   // 扎口的穗
    prof.forEach((hw, i) => { const y = top + i; q.R(cx - hw, y, hw * 2, 1, SACK[2]); q.px(cx - hw, y, SACK[0]); q.px(cx + hw - 1, y, SACK[0]); if (hw > 2) { q.px(cx - hw + 1, y, SACK[3]); q.px(cx + hw - 2, y, SACK[1]); } });
    q.R(cx - 2, top, 4, 1, SACK[0]); q.R(cx - 3, top + 1, 6, 1, SACK[1]);
    q.px(cx - 3, top + 4, SACK[4]);
  }
  function crateAt(q, cx, rim) { const x = cx - 5, y = rim - 8; q.box(x, y, 10, 10, WOODB); q.R(x + 1, y + 4, 8, 1, WOOD[2]); q.px(x + 1, y + 1, IR[3]); q.px(x + 8, y + 1, IR[3]); }
  function barrelAt(q, cx, rim) {
    const x = cx - 4, y = rim - 9;
    for (let i = 0; i < 9; i++) { const e = i === 0 || i === 8; q.R(x + i, y + (e ? 1 : 0), 1, e ? 10 : 12, e ? WOOD[1] : i < 3 ? WOOD[5] : i > 6 ? WOOD[2] : WOOD[3]); }
    q.R(x, y + 2, 9, 1, IR[1]); q.R(x + 1, y + 2, 2, 1, IR[3]); q.R(x, y + 7, 9, 1, IR[1]); q.R(x + 1, y + 7, 2, 1, IR[3]);
    q.R(x + 1, y - 1, 7, 1, WOOD[1]); q.R(x + 2, y, 5, 1, WOOD[4]);
  }
  const riders = new Map();
  function rider(seed, expr) {
    const k = `${seed}|${expr || ''}`;
    if (!riders.has(k)) riders.set(k, SA.Coal.draw(SA.Coal.crew(`难民${seed}`), { size: 'mini', expr }));
    return riders.get(k);
  }
  function riderAt(q, cx, rim, seed) { q.img(rider(seed), cx - 5, rim - 9); q.R(cx + 3, rim - 4, 3, 3, SACK[0]); q.px(cx + 4, rim - 3, SACK[3]); }   // 碳球 + 肩上的小包袱
  function relicAt(q, cx, rim) { q.box(cx - 4, rim - 7, 8, 8, BRASSB); q.R(cx - 3, rim - 4, 6, 1, BR[0]); q.px(cx, rim - 3, GLOW[3]); q.px(cx - 1, rim - 3, GLOW[2]); for (const [dx, dy] of [[-5, -8], [4, -9], [5, -2], [-6, -3]]) q.px(cx + dx, rim + dy, GLOW[2]); }
  function contents(q, load, xs, rim, seed = 0) {
    let n = 0;
    load.forEach((k, i) => {
      const cx = xs[i];
      if (cx == null) return;
      if (k === 'refugee') riderAt(q, cx, rim, seed + i);
      else if (k === 'relic') relicAt(q, cx, rim);
      else [sackAt, crateAt, barrelAt][(n++ + seed) % 3](q, cx, rim);
    });
  }

  // ---------- ③ 货箱三套：A 板条货筐 · B 篷布货厢 · C 铆接铁货柜（2×2 = 48×48；小货箱 1×1 = 24×24）----------
  // load：货物数组（'supply' | 'refugee' | 'relic'），按货位顺序从车尾往车头摆
  function cargoA(q, x, y, load) {
    contents(q, load, [x + 9, x + 19, x + 29, x + 39], y + 25);
    q.R(x + 3, y + 24, 42, 18, '#160e09');                       // 板缝里透出的暗腔
    for (const sy of [24, 30, 36]) {
      q.R(x + 3, y + sy, 42, 5, WOOD[3]); q.R(x + 3, y + sy, 42, 1, WOOD[5]); q.R(x + 3, y + sy + 4, 42, 1, WOOD[2]);
      for (let i = 0; i < 42; i += 1) if (hash(i, sy) < 0.1) q.px(x + 3 + i, y + sy + 2, WOOD[4]);
    }
    for (const bx of [15, 31]) { q.R(x + bx, y + 23, 2, 19, IR[1]); q.R(x + bx, y + 23, 1, 19, IR[3]); for (const sy of [26, 32, 38]) q.px(x + bx, y + sy, IR[4]); }
    for (const cx of [0, 44]) { q.R(x + cx, y + 21, 4, 22, IR[0]); q.R(x + cx + 1, y + 22, 2, 20, IR[2]); q.R(x + cx + 1, y + 22, 1, 20, IR[3]); q.px(x + cx + 1, y + 22, IR[4]); }
    q.R(x + 1, y + 41, 46, 2, IR[0]); q.R(x + 2, y + 41, 44, 1, IR[2]);
    skid(q, x, y + 43, 48);
  }
  function cargoB(q, x, y, load) {
    const refs = load.filter(k => k === 'refugee').length, sup = load.filter(k => k !== 'refugee').length;
    q.box(x + 1, y + 31, 46, 12, WOODB); q.R(x + 2, y + 36, 44, 1, WOOD[1]); q.R(x + 2, y + 37, 44, 1, WOOD[4]);
    for (const cx of [1, 43]) { q.R(x + cx, y + 31, 4, 12, IR[1]); q.R(x + cx + 1, y + 32, 2, 10, IR[2]); q.px(x + cx + 1, y + 32, IR[4]); }
    skid(q, x, y + 43, 48);
    // 篷布：三道篷骨撑起的拱，车尾（左）开口；空车在篷骨之间往下塌，物资越多鼓得越高
    const L = 2, Rr = 45, R0 = 9, hoops = [14, 24, 34];
    const bump = (i) => { for (let j = 0; j < sup; j++) if (Math.abs(i - [29, 19, 39, 12][j]) <= 2) return 1; return 0; };
    const sag = (i) => (load.length ? 0 : hoops.some(h => Math.abs(i - (h + 5)) <= 2) ? 1 : 0);
    const topAt = (i) => {
      let t = y + 6;
      if (i < L + R0) t += Math.round(R0 - Math.sqrt(Math.max(0, R0 * R0 - (L + R0 - i) ** 2)));
      else if (i > Rr - R0) t += Math.round(R0 - Math.sqrt(Math.max(0, R0 * R0 - (i - (Rr - R0)) ** 2)));
      return t + sag(i) - bump(i);
    };
    for (let i = L; i <= Rr; i++) {
      const t = topAt(i), hoop = hoops.includes(i), lit = hoops.includes(i - 1);
      for (let yy = t; yy < y + 31; yy++) {
        const edge = yy === t || i === L || i === Rr;
        q.px(x + i, yy, edge ? TARP[0] : hoop ? TARP[1] : lit ? TARP[3] : i <= L + 2 || yy <= t + 1 ? TARP[3] : i >= Rr - 2 ? TARP[1] : TARP[2]);
      }
    }
    q.R(x + L, y + 29, Rr - L + 1, 2, TARP[1]);
    for (let i = L + 3; i < Rr; i += 6) { q.px(x + i, y + 31, SACK[3]); q.px(x + i, y + 32, SACK[1]); }
    // 车尾开口：拉绳收口的椭圆，里面是坐着的人 / 麻袋
    const ox = x + 8, oy = y + 21, rx = 4.6, ry = 8.4;
    const hole = pen(16, 22), hq = hole;
    hq.R(0, 0, 16, 22, '#120c08');
    if (refs > 0) hq.img(rider(7), 2, 2);
    if (refs > 1) hq.img(rider(9), 4, 9);
    if (sup > 0 && refs < 2) sackAt(hq, 8, 22);
    for (let yy = 0; yy < 22; yy++) for (let xx = 0; xx < 16; xx++) { const dx = (xx + 0.5 - 8) / rx, dy = (yy + 0.5 - 11) / ry; if (dx * dx + dy * dy > 1) hq.g.clearRect(xx, yy, 1, 1); }
    q.img(hole.c, ox - 8, oy - 11);
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; q.px(ox + Math.cos(t) * (rx + 0.6), oy + Math.sin(t) * (ry + 0.6), a % 3 ? TARP[3] : TARP[1]); }
    if (refs > 2) { q.img(rider(11), x + 18, y + 25 - 9); }                                         // 多出来的人挤在车斗边上
    if (refs > 3) { q.img(rider(13), x + 27, y + 25 - 9); }
    // 车头篷骨上挂一盏马灯
    q.R(x + 43, y + 9, 1, 3, IR[1]); q.box(x + 42, y + 12, 4, 5, BRASSB); q.R(x + 43, y + 13, 2, 3, P.fire[2]); q.px(x + 43, y + 13, P.fire[3]);
  }
  function cargoC(q, x, y, load) {
    q.R(x + 1, y + 7, 4, 16, IR[0]); q.R(x + 2, y + 8, 2, 14, IR[2]); q.R(x + 2, y + 8, 1, 14, IR[3]); q.px(x + 2, y + 10, IR[4]); q.px(x + 2, y + 19, IR[4]);   // 掀起来的箱盖
    q.line(x + 5, y + 12, x + 9, y + 22, IR[1]);                                                                                                            // 撑杆
    contents(q, load, [x + 12, x + 21, x + 30, x + 39], y + 23);
    q.box(x + 1, y + 22, 46, 21, IRONB);
    for (const sx of [16, 31]) { q.R(x + sx, y + 23, 1, 19, IR[1]); q.R(x + sx + 1, y + 23, 1, 19, IR[3]); }
    for (let xx = 4; xx < 46; xx += 4) { q.px(x + xx, y + 24, IR[4]); q.px(x + xx, y + 40, IR[4]); }
    q.R(x + 2, y + 29, 44, 4, RU[1]); q.R(x + 2, y + 29, 44, 1, RU[2]);                       // 褪色的漆带
    for (const [dx, dy] of [[21, 34], [22, 34], [23, 34], [23, 35], [22, 36], [23, 37], [21, 38], [22, 38], [23, 38]]) q.px(x + dx, y + dy, P.steam[1]);   // 刷上去的「3」号
    q.R(x + 45, y + 25, 2, 1, IR[0]); q.R(x + 46, y + 25, 1, 7, IR[0]); q.R(x + 45, y + 31, 2, 1, IR[0]);   // 车头一侧的把手
    skid(q, x, y + 43, 48);
  }
  function smallA(q, x, y, load) {
    contents(q, load, [x + 12], y + 11);
    q.R(x + 2, y + 10, 20, 11, '#160e09');
    for (const sy of [10, 16]) { q.R(x + 2, y + sy, 20, 5, WOOD[3]); q.R(x + 2, y + sy, 20, 1, WOOD[5]); q.R(x + 2, y + sy + 4, 20, 1, WOOD[2]); }
    for (const cx of [0, 21]) { q.R(x + cx, y + 8, 3, 13, IR[0]); q.R(x + cx + 1, y + 9, 1, 11, IR[3]); }
    skid(q, x, y + 20, 24);
  }
  function smallB(q, x, y, load) {
    q.box(x + 1, y + 15, 22, 6, WOODB); skid(q, x, y + 20, 24);
    for (let i = 2; i <= 21; i++) { const d = Math.abs(i - 11.5) / 10, t = y + 4 + Math.round(9 * (1 - Math.sqrt(Math.max(0, 1 - d * d)))) - (load.length ? 1 : 0); for (let yy = t; yy < y + 15; yy++) q.px(x + i, yy, yy === t || i === 2 || i === 21 ? TARP[0] : i < 5 ? TARP[3] : i > 18 ? TARP[1] : i === 12 ? TARP[1] : TARP[2]); }
    q.R(x + 4, y + 9, 5, 6, '#120c08');
    if (load[0] === 'refugee') { const r = rider(5); q.g.save(); q.g.beginPath(); q.g.rect(x + 4, y + 9, 5, 6); q.g.clip(); q.img(r, x + 1, y + 6); q.g.restore(); }
    else if (load[0]) q.R(x + 5, y + 11, 3, 4, SACK[2]);
  }
  function smallC(q, x, y, load) {
    q.R(x + 1, y + 1, 3, 10, IR[0]); q.R(x + 2, y + 2, 1, 8, IR[3]);
    contents(q, load, [x + 13], y + 11);
    q.box(x + 1, y + 10, 22, 11, IRONB); q.R(x + 2, y + 14, 20, 2, RU[1]); for (let xx = 3; xx < 22; xx += 4) q.px(x + xx, y + 12, IR[4]);
    skid(q, x, y + 20, 24);
  }
  const CARGO = {
    A: { name: 'A 板条货筐', big: cargoA, small: smallA, desc: '敞口木条筐 + 两道铁箍 + 铁角柱。装了什么一眼就看见：麻袋、木箱、木桶、探出头的难民都露在筐口上。最轻、最便宜的感觉，前期就有。' },
    B: { name: 'B 篷布货厢', big: cargoB, small: smallB, desc: '木车斗 + 三道篷骨撑起的篷布，车尾一个收口的开口，人从里面往外看；物资越多篷布鼓得越高，空车时篷布塌下去；车头挂一盏马灯。最有「逃难大篷车」的味道，但装了几件要看驾驶台的货位格。' },
    C: { name: 'C 铆接铁货柜', big: cargoC, small: smallC, desc: '铆接铁皮柜，箱盖掀起来用撑杆撑着，货物和人从口上露出来；褪色漆带上刷着编号。最结实、最像军用补给车，和装甲件放一起不突兀。' },
  };

  // ---------- ④ 煤仓三套（1×2 = 24×48），lv = 煤量 0～1 ----------
  function lumps(q, x0, y0, w, h, seed, solid = true) {
    if (solid) q.R(x0, y0, w, h, COAL[1]);
    for (let yy = 0; yy < h; yy += 2) for (let xx = (yy >> 1) % 2; xx < w; xx += 3) {
      const r = hash(xx + seed, yy + seed * 7);
      if (r < 0.55) { q.px(x0 + xx, y0 + yy, COAL[2]); if (r < 0.25) q.px(x0 + xx, y0 + yy, COAL[3]); if (r < 0.08) q.px(x0 + xx, y0 + yy, COAL[4]); }
    }
  }
  function binA(q, x, y, lv) {
    // 漏斗：上宽下窄，前面一条浮子刻度槽（黄铜浮标的高度 = 煤量）
    const y0 = y + 8, y1 = y + 31, xl = (yy) => x + 1 + Math.round((yy - y0) * 5 / (y1 - y0)), xr = (yy) => x + 22 - Math.round((yy - y0) * 5 / (y1 - y0));
    if (lv > 0.7) { for (let i = 2; i <= 21; i++) { const hh = Math.round(7 * Math.sin(Math.PI * (i - 1) / 21) * (lv - 0.55) / 0.45); for (let k = 0; k <= hh; k++) q.px(x + i, y0 - 1 - k, k === hh ? COAL[0] : COAL[1]); } lumps(q, x + 3, y0 - 6, 18, 6, 3, false); }
    for (let yy = y0; yy <= y1; yy++) { const a = xl(yy), b = xr(yy); q.R(a, yy, b - a + 1, 1, IR[2]); q.px(a, yy, IR[0]); q.px(b, yy, IR[0]); q.px(a + 1, yy, IR[3]); q.px(b - 1, yy, IR[1]); }
    q.R(x, y0 - 1, 24, 2, IR[0]); q.R(x + 1, y0 - 1, 22, 1, IR[3]);                      // 口沿
    if (lv <= 0.7 && lv > 0.03) for (let i = 2; i < 22; i += 3) q.px(x + i, y0 - 2, COAL[2]);   // 口沿下露出一点煤
    q.R(xl(y1), y1, xr(y1) - xl(y1) + 1, 1, IR[0]);
    for (let xx = 4; xx < 21; xx += 4) { q.px(x + xx, y0 + 3, IR[4]); q.px(x + xx, y0 + 4, IR[1]); }
    // 浮子槽
    q.R(x + 11, y0 + 5, 3, 16, IR[0]); q.R(x + 12, y0 + 6, 1, 14, '#0c0e14');
    const fy = y0 + 19 - Math.round(lv * 13); q.R(x + 10, fy, 5, 2, BR[2]); q.px(x + 10, fy, BR[3]);
    // 腿 + 往车头斜下去的溜槽
    for (const lx of [5, 17]) { q.R(x + lx, y1, 2, 13, IR[0]); q.px(x + lx, y1, IR[3]); }
    q.line(x + 12, y1 + 1, x + 22, y1 + 8, IR[1], 3); q.line(x + 12, y1, x + 22, y1 + 7, IR[3]);
    if (lv > 0.03) { q.px(x + 23, y1 + 9, COAL[3]); q.px(x + 22, y1 + 11, COAL[2]); }
    skid(q, x, y + 44, 24);
  }
  function binB(q, x, y, lv) {
    // 铆接圆筒煤柜：圆顶 + 黄铜加煤口；筒身中间一条玻璃视窗看煤位；底下螺旋送煤管 + 手轮
    q.R(x + 10, y + 0, 4, 2, BR[1]); q.R(x + 10, y + 0, 4, 1, BR[3]);
    for (let i = 0; i < 20; i++) { const d = Math.abs(i - 9.5) / 10, h = Math.round(5 * Math.sqrt(1 - d * d)); q.R(x + 2 + i, y + 7 - h, 1, h, i < 4 ? IR[3] : i > 15 ? IR[1] : IR[2]); q.px(x + 2 + i, y + 7 - h, IR[0]); }
    for (let i = 0; i < 20; i++) { const t = i / 19; q.R(x + 2 + i, y + 7, 1, 33, i === 0 || i === 19 ? IR[0] : t < 0.18 ? IR[4] : t < 0.4 ? IR[3] : t > 0.8 ? IR[1] : IR[2]); }
    for (const by of [9, 37]) { q.R(x + 2, y + by, 20, 2, IR[1]); q.R(x + 3, y + by, 5, 1, IR[4]); }
    const wy = y + 13, wh = 22, lh = Math.round(wh * lv);
    q.R(x + 7, wy - 1, 10, wh + 2, IR[0]); q.R(x + 8, wy, 8, wh, P.glass[0]);
    if (lh > 0) lumps(q, x + 8, wy + wh - lh, 8, lh, 11);
    if (lh > 0) q.R(x + 8, wy + wh - lh, 8, 1, COAL[3]);
    q.R(x + 9, wy + 1, 1, Math.min(8, wh - lh), P.glass[1]);
    for (let k = 0; k <= 4; k++) q.px(x + 18, wy + Math.round(k * wh / 4), BR[2]);
    q.R(x + 1, y + 40, 23, 4, IR[0]); q.R(x + 2, y + 41, 21, 2, IR[2]); q.R(x + 2, y + 41, 21, 1, IR[3]);
    q.disc(x + 3.5, y + 42, 3, (a, b) => (Math.hypot(a, b) > 0.6 ? BR[1] : BR[0])); q.px(x + 2, y + 40, BR[3]);
    skid(q, x, y + 44, 24);
  }
  function binC(q, x, y, lv) {
    // 煤袋架：铁架三层、每层两袋；用掉一袋就空一格
    for (const lx of [0, 21]) { q.R(x + lx, y + 2, 3, 43, IR[0]); q.R(x + lx + 1, y + 3, 1, 41, IR[3]); }
    for (const sy of [16, 31]) { q.R(x, y + sy, 24, 2, IR[0]); q.R(x + 1, y + sy, 22, 1, IR[2]); }
    const n = Math.round(lv * 6), slots = [[45, 7], [45, 16], [30, 7], [30, 16], [15, 7], [15, 16]];
    slots.slice(0, n).forEach(([by, cx], i) => {
      const top = y + by - 12;
      for (let k = 0; k < 12; k++) { const hw = k < 2 ? 2 : k < 4 ? 3 : 4, yy = top + k; q.R(x + cx - hw, yy, hw * 2 + 1, 1, SACK[1]); q.px(x + cx - hw, yy, SACK[0]); q.px(x + cx + hw, yy, SACK[0]); if (hw > 2) q.px(x + cx - hw + 1, yy, SACK[2]); }
      q.R(x + cx - 1, top - 1, 3, 2, COAL[2]); q.px(x + cx, top - 2, COAL[3]);   // 袋口露出的煤
      q.R(x + cx - 2, top + 6, 5, 2, COAL[1]); q.px(x + cx - 2, top + 6, COAL[3]);   // 煤灰印
      q.R(x + cx - 4, top + 11, 9, 1, SACK[0]);
    });
    if (n === 0) { q.R(x + 4, y + 42, 9, 2, SACK[1]); q.R(x + 4, y + 42, 9, 1, SACK[2]); }       // 空了：一只瘪袋子
    q.R(x, y + 45, 24, 3, IR[0]); q.R(x + 1, y + 45, 22, 1, IR[2]);
  }
  const BIN = {
    A: { name: 'A 漏斗煤斗', draw: binA, desc: '上宽下窄的铁漏斗，满了煤堆冒出口沿；前面一条浮子槽，黄铜浮标的高度就是煤量；底下溜槽斜着往锅炉送煤。最像真机器。' },
    B: { name: 'B 圆筒煤柜', draw: binB, desc: '铆接圆筒 + 圆顶黄铜加煤口，筒身一条玻璃视窗直接看煤位，底下螺旋送煤管和手轮。和现在的水罐（大水窗）是一家人，读数最清楚。' },
    C: { name: 'C 煤袋架', draw: binC, desc: '三层铁架摞着六袋煤，用掉一袋空一格，数袋子就知道还剩多少。最土、最有逃难感，也最好笑。' },
  };
  // ---------- ⑤ 路线上的东西（世界像素 1:1）。每个返回 { c, ax, ay }：(ax, ay) = 落地点（底边中点）----------
  const art = new Map();
  const cached = (k, make) => { if (!art.has(k)) art.set(k, make()); return art.get(k); };
  const coalPile = (full) => cached(`coal${full}`, () => {
    const q = pen(66, 30);
    if (full) {
      for (let i = 0; i < 62; i++) { const u = (i - 31) / 31, hh = Math.round(20 * Math.pow(Math.max(0, 1 - u * u), 0.85)); q.R(2 + i, 29 - hh, 1, hh + 1, COAL[1]); q.px(2 + i, 29 - hh, COAL[0]); if (u < -0.2) q.px(2 + i, 30 - hh, COAL[3]); }
      for (let k = 0; k < 70; k++) { const u = hash(k, 1) * 2 - 1, hh = 20 * Math.pow(Math.max(0, 1 - u * u), 0.85), xx = Math.round(33 + u * 30), yy = Math.round(29 - hash(k, 2) * hh); if (yy < 29 - hh + 2) continue; q.R(xx, yy, 2, 2, COAL[2]); q.px(xx, yy, u < 0.2 ? COAL[4] : COAL[3]); }
      q.line(50, 2, 42, 22, WOOD[5], 2); q.line(51, 3, 43, 23, WOOD[2]); q.R(48, 1, 6, 2, WOOD[4]);   // 插着的铁锹
      q.R(39, 21, 6, 5, IR[3]); q.R(39, 21, 6, 1, IR[4]);
    } else {
      for (let k = 0; k < 26; k++) { const xx = 4 + Math.round(hash(k, 3) * 56), yy = 27 - Math.round(hash(k, 4) * 3); q.R(xx, yy, 2, 2, COAL[2]); q.px(xx, yy, COAL[3]); }
      q.R(18, 27, 26, 2, WOOD[4]); q.R(18, 27, 26, 1, WOOD[5]); q.R(44, 25, 7, 4, IR[3]);                   // 铁锹倒在地上
    }
    return { c: q.c, ax: 33, ay: 30 };
  });
  const supplyCache = (taken) => cached(`supply${taken}`, () => {
    const q = pen(62, 36);
    q.box(2, 31, 58, 5, WOODB); for (let xx = 8; xx < 58; xx += 10) q.R(xx, 32, 1, 3, WOOD[1]);   // 货板
    if (!taken) {
      q.box(4, 10, 25, 21, WOODB); q.R(5, 20, 23, 1, WOOD[1]); q.R(5, 21, 23, 1, WOOD[4]);
      for (const [cx, cy] of [[4, 10], [24, 10], [4, 26], [24, 26]]) { q.R(cx, cy, 5, 5, IR[1]); q.px(cx + 1, cy + 1, IR[4]); }
      q.line(6, 12, 26, 29, SACK[3]); q.line(26, 12, 6, 29, SACK[3]);                             // 捆箱子的麻绳
      sackAt(q, 37, 31); q.R(30, 23, 1, 8, SACK[0]);
      barrelAt(q, 51, 31);
    } else { q.line(10, 30, 26, 29, SACK[3]); q.line(26, 29, 30, 30, SACK[2]); }
    return { c: q.c, ax: 31, ay: 36 };
  });
  const spoils = () => cached('spoils', () => {
    const q = pen(44, 18);
    q.box(2, 9, 18, 9, IRONB); q.line(18, 16, 30, 8, IR[3], 2); q.box(22, 11, 14, 7, [RU[0], RU[1], RU[2], RU[3]]);
    q.disc(30, 9, 6, (a, b) => { const r = Math.hypot(a, b), ang = Math.atan2(b, a); return r < 0.35 ? IR[0] : r > 0.8 && Math.cos(ang * 8) < 0.2 ? null : a + b < -0.3 ? IR[4] : IR[2]; });
    q.px(29, 8, BR[3]); q.R(36, 13, 6, 5, BR[1]); q.R(36, 13, 6, 1, BR[3]);
    return { c: q.c, ax: 22, ay: 18 };
  });
  const waterTower = () => cached('water', () => {
    const q = pen(52, 118);
    for (const [x0, x1] of [[8, 4], [42, 46]]) q.line(x0, 40, x1, 117, IR[1], 3);   // 两条斜腿
    q.line(8, 60, 44, 90, IR[0]); q.line(44, 60, 8, 90, IR[0]); q.line(6, 92, 46, 116, IR[0]); q.line(46, 92, 6, 116, IR[0]);
    for (let yy = 50; yy < 116; yy += 6) q.R(1, yy, 6, 1, WOOD[4]);                 // 梯子
    q.R(1, 48, 1, 70, WOOD[3]); q.R(6, 48, 1, 70, WOOD[3]);
    for (let i = 0; i < 38; i++) { const e = i === 0 || i === 37; q.R(7 + i, 8, 1, 33, e ? WOOD[1] : i < 6 ? WOOD[5] : i > 31 ? WOOD[2] : i % 6 === 0 ? WOOD[2] : WOOD[3]); }
    for (const hy of [12, 24, 36]) { q.R(7, hy, 38, 2, IR[1]); q.R(8, hy, 8, 1, IR[3]); }
    for (let i = 0; i < 44; i++) { const h = Math.round(8 - Math.abs(i - 21.5) * 0.36); q.R(4 + i, 9 - h, 1, h, i < 18 ? STONE[3] : STONE[1]); q.px(4 + i, 9 - h, STONE[0]); }
    q.R(44, 38, 6, 3, IR[1]); q.R(48, 38, 2, 14, P.leather[1]); q.R(47, 52, 4, 3, BR[2]);      // 出水管 + 皮管 + 黄铜阀
    return { c: q.c, ax: 26, ay: 118 };
  });
  const barricade = (st) => cached(`bar${st}`, () => {
    const q = pen(88, 80), G = 79;
    const log = (x0, y0, x1, y1) => { q.line(x0, y0, x1, y1, WOOD[1], 4); q.line(x0, y0 - 1, x1, y1 - 1, WOOD[4], 2); q.line(x1, y1, x1 + Math.sign(x1 - x0) * 4, y1 - 3, WOOD[5]); };
    const drum = (x0, y0, dent) => { q.box(x0, y0, 16, 20, [IR[0], RU[1], RU[2], RU[3]]); q.R(x0 + 1, y0 + 5, 14, 1, IR[1]); q.R(x0 + 1, y0 + 14, 14, 1, IR[1]); if (dent) { q.R(x0 + 9, y0 + 7, 4, 4, RU[1]); q.px(x0 + 9, y0 + 7, RU[0]); } };
    if (st < 2) {
      log(2, G, 30, G - 34); log(30, G, 4, G - 30);                                                 // 交叉的削尖木桩
      drum(30, G - 20, false); if (st === 0) drum(31, G - 40, true);
      if (st === 0) { for (let i = 0; i < 22; i++) q.R(48 + i, 12 + Math.round(i * 0.15), 1, G - 12 - Math.round(i * 0.15), i === 0 || i === 21 ? IR[0] : i % 4 < 2 ? IR[3] : IR[2]); for (let yy = 22; yy < G; yy += 14) q.px(50, yy, IR[4]); }   // 竖起来的瓦楞铁皮
      else { q.R(48, G - 6, 30, 6, IR[0]); for (let i = 0; i < 28; i++) q.px(49 + i, G - 5, i % 4 < 2 ? IR[3] : IR[2]); q.R(49, G - 4, 28, 3, IR[2]); }
      q.R(80, 8, 2, G - 8, WOOD[2]); q.px(80, 8, WOOD[5]);                                          // 旗杆 + 破布旗
      for (let i = 0; i < 12; i++) q.R(70 + i - 12 + 12, 9 + (i % 3 === 0 ? 1 : 0), 1, 8 - (i > 8 ? i - 8 : 0), i < 3 ? RU[3] : RU[2]);
    } else {
      q.line(4, G - 2, 34, G - 6, WOOD[1], 4); q.line(4, G - 3, 34, G - 7, WOOD[4], 2);
      q.line(20, G - 1, 44, G - 3, WOOD[2], 3);
      q.box(44, G - 14, 20, 14, [IR[0], RU[1], RU[2], RU[3]]); q.R(52, G - 13, 1, 12, IR[1]);       // 侧躺的油桶
      q.R(62, G - 4, 24, 4, IR[0]); q.R(63, G - 4, 22, 1, IR[3]);
    }
    return { c: q.c, ax: 44, ay: 80 };
  });
  function bricks(q, x0, y0, w, h, seed = 0) {
    q.R(x0, y0, w, h, BRICK[2]);
    for (let yy = 0; yy < h; yy++) {
      if (yy % 4 === 3) { q.R(x0, y0 + yy, w, 1, BRICK[1]); continue; }
      const off = (Math.floor(yy / 4) % 2) * 4;
      for (let xx = 0; xx < w; xx++) if ((xx + off) % 8 === 7) q.px(x0 + xx, y0 + yy, BRICK[1]);
      if (yy % 4 === 0) for (let xx = 0; xx < w; xx++) if ((xx + off) % 8 < 3 && hash(Math.floor((xx + off) / 8) + seed, Math.floor(yy / 4)) < 0.35) q.px(x0 + xx, y0 + yy, BRICK[3]);
    }
  }
  function ivy(q, x0, y0, w, h, seed) { for (let k = 0; k < w * h / 18; k++) { const xx = x0 + Math.round(hash(k, seed) * w), yy = y0 + Math.round(Math.pow(hash(k, seed + 1), 0.6) * h); q.R(xx, yy, 3, 2, IVY[1]); q.px(xx, yy, IVY[3]); q.px(xx + 1, yy + 1, IVY[0]); } }
  const ruinGate = (st) => cached(`gate${st}`, () => {
    const q = pen(128, 160), G = 159;
    // 两根砖门柱 + 石帽；右柱顶上塌了一块；左柱爬满常春藤
    bricks(q, 0, 30, 24, G - 30, 1); q.R(0, 30, 1, G - 30, BRICK[0]); q.R(23, 30, 1, G - 30, BRICK[0]);
    q.box(-2, 22, 28, 9, [STONE[0], STONE[1], STONE[3], STONE[4]]); q.box(2, 16, 20, 7, [STONE[0], STONE[1], STONE[2], STONE[4]]);
    bricks(q, 104, 46, 24, G - 46, 2); q.R(104, 46, 1, G - 46, BRICK[0]); q.R(127, 46, 1, G - 46, BRICK[0]);
    for (let i = 0; i < 24; i++) { const j = Math.round(hash(i, 9) * 6 + (i > 12 ? 4 : 0)); q.g.clearRect(104 + i, 46, 1, j); q.px(104 + i, 46 + j, BRICK[0]); }
    ivy(q, 0, 30, 18, 90, 4); ivy(q, 104, 120, 12, 36, 6);
    // 铸铁大门：上半竖栅（矛尖）、下半铆接铁板；中间铁链 + 黄铜挂锁
    const leaf = (x0, w, skew) => {
      for (let xx = x0 + 2; xx < x0 + w - 1; xx += 5) { q.R(xx, 48 + skew, 2, 50, IR[1]); q.px(xx, 48 + skew, IR[3]); q.R(xx, 44 + skew, 2, 4, IR[2]); q.px(xx, 43 + skew, IR[4]); }
      q.R(x0, 58 + skew, w, 3, IR[0]); q.R(x0, 58 + skew, w, 1, IR[3]);
      q.box(x0, 98 + skew, w, G - 98 - skew, IRONB);
      for (let yy = 102; yy < G - 2; yy += 9) for (let xx = x0 + 3; xx < x0 + w - 2; xx += 6) q.px(xx, yy + skew, IR[4]);
      q.R(x0, 98 + skew, 1, G - 98 - skew, IR[0]); q.R(x0 + w - 1, 46 + skew, 1, G - 46 - skew, IR[0]); q.R(x0, 46 + skew, 1, 52, IR[0]);
    };
    if (st < 2) {
      leaf(24, 40, st === 1 ? 3 : 0); leaf(64, 40, 0);
      if (st === 1) { for (let i = 0; i < 8; i++) q.px(34 + i, 110 + (i % 3), IR[0]); q.R(30, 120, 8, 6, IR[1]); q.px(30, 120, IR[0]); }   // 凹痕
      if (st === 0) { q.line(46, 100, 82, 104, IR[3], 2); q.box(60, 102, 7, 8, BRASSB); q.R(62, 99, 3, 3, BR[1]); q.g.clearRect(63, 100, 1, 2); }
      else { q.line(60, 102, 62, 128, IR[3], 2); q.line(70, 104, 68, 122, IR[3], 2); }        // 铁链断了垂下来
    } else {
      q.R(24, G - 6, 44, 6, IR[0]); q.R(25, G - 6, 42, 1, IR[3]); q.R(25, G - 5, 42, 4, IR[2]);   // 倒在地上的门扇
      q.R(70, G - 4, 34, 4, IR[0]); q.R(71, G - 4, 32, 1, IR[3]);
    }
    return { c: q.c, ax: 64, ay: 160 };
  });
  const relicChest = () => cached('relic', () => {
    const q = pen(30, 24);
    q.box(2, 9, 26, 15, WOODB); for (let i = 0; i < 26; i++) { const h = Math.round(4 * Math.sqrt(1 - ((i - 12.5) / 13) ** 2)); q.R(2 + i, 9 - h, 1, h + 1, WOOD[3]); q.px(2 + i, 9 - h, WOOD[1]); if (i < 8) q.px(2 + i, 10 - h, WOOD[5]); }
    for (const bx of [5, 23]) { q.R(bx, 5, 3, 19, BR[1]); q.R(bx, 5, 1, 19, BR[3]); }
    q.R(2, 9, 26, 2, BR[1]); q.R(2, 9, 26, 1, BR[3]);
    q.disc(15, 16, 4, (a, b) => (Math.hypot(a, b) < 0.45 ? GLOW[3] : BR[2])); q.px(15, 16, GLOW[2]);   // 齿轮纹章 + 以太光
    return { c: q.c, ax: 15, ay: 24 };
  });
  const startSign = () => cached('sign', () => {
    const q = pen(56, 84);
    q.R(26, 10, 4, 74, WOOD[2]); q.R(26, 10, 1, 74, WOOD[4]);
    const board = (y, dir) => { const x0 = dir > 0 ? 28 : 2; q.box(x0, y, 26, 10, WOODB); const tip = dir > 0 ? x0 + 26 : x0 - 1; for (let k = 0; k < 5; k++) q.R(tip + (dir > 0 ? k : -k), y + k, 1, 10 - k * 2, WOOD[dir > 0 ? 3 : 4]); };
    board(16, 1); board(32, -1);
    q.R(33, 20, 14, 1, '#d8d2c0'); q.R(44, 19, 1, 3, '#d8d2c0'); q.px(45, 20, '#d8d2c0');            // 粉笔画的箭头（往煤场）
    q.R(8, 35, 8, 2, '#d8d2c0'); q.R(10, 37, 4, 3, '#d8d2c0');                                        // 粉笔画的铁砧（回家）
    q.R(31, 4, 1, 6, IR[1]); q.box(29, 0, 6, 6, BRASSB); q.R(30, 2, 4, 3, P.fire[2]);
    return { c: q.c, ax: 28, ay: 84 };
  });
  // 地标（画在路后面）：废弃的维多利亚水泵站、旧煤场的井架和绞车房、运煤小火车
  const pumpHouse = () => cached('pump', () => {
    const q = pen(320, 270), G = 269;
    bricks(q, 262, 6, 30, G - 6, 5); q.R(262, 6, 1, G - 6, BRICK[0]); q.R(291, 6, 1, G - 6, BRICK[0]);
    for (let i = 0; i < 30; i++) { const j = Math.round(hash(i, 3) * 10); q.g.clearRect(262 + i, 6, 1, j); q.px(262 + i, 6 + j, BRICK[0]); }
    q.R(258, 40, 38, 5, STONE[2]); q.R(258, 40, 38, 1, STONE[4]);
    bricks(q, 20, 80, 236, G - 80, 7); q.R(20, 80, 1, G - 80, BRICK[0]); q.R(255, 80, 1, G - 80, BRICK[0]);
    for (let i = 0; i < 118; i++) { const yy = 80 - Math.round(i * 0.5); q.R(20 + i, yy, 1, 80 - yy, STONE[1]); q.px(20 + i, yy, STONE[0]); if (i % 7 === 0) q.R(20 + i, yy + 1, 1, 80 - yy - 1, STONE[0]); }   // 左半边石板屋顶还在
    for (let k = 0; k < 5; k++) q.line(140 + k * 22, 21 + k * 11, 150 + k * 22, 80, WOOD[1], 2);                                                            // 右半边只剩椽子
    q.line(138, 21, 256, 80, WOOD[2], 3);
    q.R(18, 112, 240, 6, STONE[2]); q.R(18, 112, 240, 1, STONE[4]); q.R(18, G - 22, 240, 22, STONE[1]); q.R(18, G - 22, 240, 1, STONE[3]);
    for (const wx of [42, 104, 166, 218]) {
      const w = wx === 218 ? 22 : 30, top = 130;
      for (let yy = top; yy < 210; yy++) { const dy = yy - top, hw = dy < w / 2 ? Math.sqrt(Math.max(0, (w / 2) ** 2 - (w / 2 - dy) ** 2)) : w / 2; q.R(wx + w / 2 - hw, yy, hw * 2, 1, '#120c0a'); }
      q.R(wx - 2, 210, w + 4, 4, STONE[2]); q.R(wx + w / 2, top + 4, 1, 76, IR[1]); q.R(wx, 170, w, 1, IR[1]);
      if (hash(wx, 1) < 0.6) { q.px(wx + 6, 150, P.glass[1]); q.px(wx + 7, 151, P.glass[2]); }
    }
    ivy(q, 20, 90, 60, 150, 8); ivy(q, 230, 200, 40, 60, 9);
    for (let k = 0; k < 18; k++) { const xx = 230 + Math.round(hash(k, 5) * 60), yy = G - Math.round(hash(k, 6) * 12); q.R(xx, yy, 5, 4, BRICK[2]); q.px(xx, yy, BRICK[3]); }
    return { c: q.c, ax: 150, ay: 270 };
  });
  const depot = () => cached('depot', () => {
    const q = pen(360, 300), G = 299;
    // 井架：两条桁架腿 + 后撑，顶上大绞轮
    const girder = (x0, y0, x1, y1) => { q.line(x0 - 3, y0, x1 - 3, y1, IR[1], 2); q.line(x0 + 3, y0, x1 + 3, y1, IR[1], 2); const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 14); for (let k = 0; k < n; k++) { const a = k / n, b = (k + 1) / n; q.line(x0 - 3 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + 3 + (x1 - x0) * b, y0 + (y1 - y0) * b, IR[0]); } };
    girder(70, G, 118, 64); girder(170, G, 128, 64); girder(250, G, 132, 70);
    q.R(104, 60, 40, 6, IR[0]); q.R(105, 60, 38, 1, IR[3]);
    q.disc(124, 38, 24, (a, b) => { const r = Math.hypot(a, b), ang = Math.atan2(b, a), spoke = Math.abs(Math.sin(ang * 3)) * r * 24 < 1.3; return r > 0.9 ? IR[0] : r > 0.78 ? (a + b < -0.2 ? IR[3] : IR[2]) : r < 0.16 ? IR[3] : r < 0.24 ? IR[0] : spoke ? IR[1] : null; });
    q.R(122, 36, 4, 4, IR[0]); q.px(123, 37, IR[4]);
    q.R(145, 40, 1, 220, IR[0]);
    // 绞车房 + 烟囱
    bricks(q, 220, 190, 120, G - 190, 3); q.R(220, 190, 1, G - 190, BRICK[0]); q.R(339, 190, 1, G - 190, BRICK[0]);
    for (let i = 0; i < 124; i++) { const yy = 190 - Math.round(16 - Math.abs(i - 62) * 0.26); q.R(218 + i, yy, 1, 190 - yy, STONE[1]); q.px(218 + i, yy, STONE[0]); }
    bricks(q, 312, 110, 14, 70, 4); q.R(310, 108, 18, 4, STONE[2]);
    for (const wx of [236, 278]) { q.R(wx, 222, 22, 40, '#120c0a'); q.R(wx + 2, 224, 18, 16, '#8a6a3a'); q.R(wx + 10, 224, 1, 16, IR[1]); q.R(wx - 2, 262, 26, 3, STONE[2]); }
    for (let k = 0; k < 40; k++) { const xx = 6 + Math.round(hash(k, 7) * 60), yy = G - Math.round(Math.pow(hash(k, 8), 1.4) * 22); q.R(xx, yy, 3, 2, COAL[2]); q.px(xx, yy, COAL[3]); }
    return { c: q.c, ax: 180, ay: 300 };
  });
  const train = () => cached('train', () => {
    const q = pen(250, 70), G = 69;
    q.R(0, G - 3, 250, 3, IR[0]); for (let xx = 2; xx < 250; xx += 9) q.R(xx, G - 2, 5, 2, WOOD[2]);   // 铁轨 + 枕木
    q.box(2, G - 20, 124, 8, WOODB); for (const wx of [18, 46, 82, 110]) q.disc(wx, G - 8, 6, (a, b) => (Math.hypot(a, b) < 0.4 ? IR[3] : IR[1]));   // 平板车
    q.R(0, G - 18, 3, 4, IR[0]);
    q.box(132, G - 44, 66, 32, [IR[0], P.dark[2], P.dark[3], IR[2]]); q.box(176, G - 62, 24, 50, [IR[0], P.dark[2], P.dark[3], IR[2]]);   // 小水柜机车：锅炉 + 驾驶室
    q.R(180, G - 56, 8, 8, '#8a6a3a'); q.R(140, G - 56, 7, 12, IR[1]); q.R(138, G - 58, 11, 3, IR[0]);
    q.R(132, G - 30, 66, 2, BR[1]); for (const wx of [146, 166, 188]) q.disc(wx, G - 9, 8, (a, b) => (Math.hypot(a, b) < 0.35 ? BR[2] : Math.hypot(a, b) > 0.8 ? IR[0] : P.dark[3]));
    q.R(200, G - 22, 6, 4, IR[0]);
    return { c: q.c, ax: 0, ay: 70 };
  });

  // 路边等车的难民一家：路牌杆 + 挥动的白布 + 三个碳球（车近了挥手 / 欢呼，接不了就垂头），脚边各一个包袱
  // g 已经平移到世界坐标；x = 这家人的位置，y = 地面高度；o = { seed, near, sad }
  function refugees(g, x, y, t, o = {}) {
    const seed = o.seed || 0, near = !!o.near, sad = !!o.sad;
    g.fillStyle = WOOD[2]; g.fillRect(Math.round(x + 34), Math.round(y - 52), 3, 52);
    const wave = Math.floor(t * 4) % 2;
    g.fillStyle = '#d8d2c0'; g.fillRect(Math.round(x + 37), Math.round(y - 52 + wave), 12, 7); g.fillRect(Math.round(x + 45), Math.round(y - 45 + wave), 4, 3);
    [[-24, 0], [-4, 1], [14, 2]].forEach(([dx, k]) => {
      const pose = sad ? 'idle' : near ? (Math.floor(t * 3 + k) % 2 ? 'wave' : 'cheer') : 'hold';
      const c = cached(`ref${seed + k}|${pose}|${sad}|${near}`, () => ({ c: SA.Coal.draw(SA.Coal.crew(`难民${seed + k}`), { size: 'sprite', pose, expr: sad ? 'sad' : near ? 'happy' : 'normal', look: -1 }) })).c;
      g.drawImage(c, Math.round(x + dx - 20), Math.round(y - 33));
      g.fillStyle = SACK[1]; g.fillRect(Math.round(x + dx + 6), Math.round(y - 6), 7, 6); g.fillStyle = SACK[3]; g.fillRect(Math.round(x + dx + 6), Math.round(y - 6), 7, 1);
    });
  }
  // 长地形（土坡 + 泥地）：SA.TerrainArt.layer 能按任意宽度画；切成 1280 宽的块缓存，免得一张画布太大
  function terrainTiles(ground, mud, len, H, GROUND, tw = 1280) {
    const full = SA.TerrainArt.layer(ground, mud, len, H, GROUND), tiles = [];
    for (let x = 0; x < len; x += tw) { const c = document.createElement('canvas'); c.width = Math.min(tw, len - x + 1); c.height = H; c.getContext('2d').drawImage(full, -x, 0); tiles.push({ x, c }); }
    return tiles;
  }
  // 物件按种类取图：kind 对应 B.ter.props / pickups 的 kind，state 是状态（路障 / 遗迹门 0 完好 · 1 破损 · 2 打开；煤堆、物资是否被捡走）
  function prop(kind, state) {
    switch (kind) {
      case 'barricade': return barricade(state || 0);
      case 'ruinDoor': return ruinGate(state || 0);
      case 'coal': return coalPile(!state);
      case 'supply': return supplyCache(!!state);
      case 'spoils': return spoils();
      case 'relic': return relicChest();
      case 'water': return waterTower();
      case 'sign': return startSign();
      case 'pump': return pumpHouse();
      case 'depot': return depot();
      case 'train': return train();
      default: return null;
    }
  }
  // 路线上的布景（纯画面，不进规则数据）：出发路牌、遗迹门后面的水泵站、终点的井架和运煤小火车。按路线定义里的物件位置推出来
  function dress(def) {
    if (!def) return [];
    const out = [{ kind: 'sign', x: 260 }];
    const door = (def.props || []).find(p => p.kind === 'ruinDoor');
    if (door) out.push({ kind: 'pump', x: door.x + 60, back: true });
    const end = def.end && (def.end.x != null ? def.end.x : def.end);
    if (end != null) out.push({ kind: 'depot', x: end + 90, back: true }, { kind: 'train', x: end + 60 });
    return out;
  }

  // ---------- 界面件（原生像素画，界面上放大 2 倍显示，和 js/ui-px.js 一套规矩）----------
  const FRAME = [P.dark[0], IR[0], IR[1], IR[2]];
  // 路程条（路线模式顶上替换计时鼓）：铁框里一道槽，黄铜填到当前进度；槽上方标遭遇（打完变暗）、难民、遗迹、终点小旗；一辆小车在槽上走
  // marks：[{ at: 0～1, kind: 'fight' | 'done' | 'refugee' | 'refugeeGone' | 'relic' | 'relicGone' | 'water' }]
  function strip(w, marks, prog) {
    const q = pen(w, 15), x0 = 6, x1 = w - 9, at = (k) => Math.round(x0 + (x1 - x0) * Math.max(0, Math.min(1, k)));
    q.box(0, 0, w, 15, FRAME); q.px(2, 2, IR[3]); q.px(w - 3, 2, IR[3]); q.px(2, 12, IR[3]); q.px(w - 3, 12, IR[3]);
    q.R(x0, 10, x1 - x0, 2, P.dark[0]); q.R(x0, 10, at(prog) - x0, 2, BR[2]); q.R(x0, 10, at(prog) - x0, 1, BR[3]);
    for (const m of marks) {
      const x = at(m.at);
      if (m.kind === 'fight' || m.kind === 'done') { const c = m.kind === 'done' ? [IR[0], IR[1], IR[2]] : [RU[0], RU[2], RU[3]]; q.R(x - 2, 4, 5, 5, c[0]); q.R(x - 1, 5, 3, 3, c[1]); q.px(x - 1, 5, c[2]); if (m.kind === 'done') { q.px(x - 1, 5, IR[0]); q.px(x + 1, 7, IR[0]); } }
      else if (m.kind === 'refugee' || m.kind === 'refugeeGone') { const c = m.kind === 'refugee' ? '#e8e3d2' : IR[2]; q.R(x - 1, 4, 3, 3, c); q.R(x - 2, 7, 5, 2, c); }
      else if (m.kind === 'relic' || m.kind === 'relicGone') { const c = m.kind === 'relic' ? GLOW[2] : IR[2]; q.R(x - 1, 4, 3, 5, c); q.R(x - 2, 5, 5, 3, c); if (m.kind === 'relic') q.px(x, 6, GLOW[3]); }
      else if (m.kind === 'water') { q.R(x - 1, 5, 3, 4, P.water[2]); q.px(x, 4, P.water[2]); q.px(x - 1, 6, P.water[3]); }
    }
    q.R(x1 + 1, 2, 1, 10, '#e8e3d2'); q.R(x1 + 2, 2, 4, 3, RU[3]); q.px(x1 + 2, 4, RU[2]);
    const cx = at(prog); q.R(cx - 3, 8, 7, 3, BR[1]); q.R(cx - 2, 7, 4, 1, BR[3]); q.R(cx - 2, 8, 5, 1, BR[3]); q.px(cx - 2, 11, P.dark[0]); q.px(cx + 2, 11, P.dark[0]);
    return q.c;
  }
  // 煤表：铁框里一排 10 格煤块，见底时剩下的格子红闪
  function coalGauge(lv, blink) {
    const n = 10, q = pen(n * 6 + 5, 12), k = Math.ceil(Math.max(0, Math.min(1, lv)) * n - 1e-6), low = lv < 0.2;
    q.box(0, 0, n * 6 + 5, 12, FRAME);
    for (let i = 0; i < n; i++) {
      const x = 3 + i * 6;
      if (i < k) { const c = low && blink ? [P.fire[0], P.fire[1], P.fire[2]] : [COAL[1], COAL[2], COAL[4]]; q.R(x, 3, 5, 6, c[0]); q.R(x, 3, 4, 5, c[1]); q.px(x, 3, c[2]); q.px(x + 2, 5, c[2]); }
      else q.R(x, 3, 5, 6, P.dark[1]);
    }
    return q.c;
  }
  // 货位格：每格一个黄铜框，装的东西按货物清单画（麻袋 / 木箱 / 木桶轮流、难民、遗迹件）
  function cargoSlots(load, max) {
    const n = Math.max(1, max || 0), q = pen(n * 16 + 1, 16);
    let sup = 0;
    for (let i = 0; i < n; i++) {
      const x = i * 16;
      q.box(x, 0, 17, 16, [BR[0], BR[1], '#2a2016', BR[2]]);
      const k = load[i];
      if (!k) continue;
      const kind = typeof k === 'string' ? k : k.kind;
      if (kind === 'refugee') q.img(rider(i + 1), x + 3, 3);
      else if (kind === 'relic') relicAt(q, x + 8, 14);
      else [sackAt, crateAt, barrelAt][sup++ % 3](q, x + 8, 14);
    }
    return q.c;
  }
  // 返航汽笛：黄铜汽笛 + 拉链 + 拉环
  function whistle() {
    const q = pen(12, 18);
    q.box(3, 2, 7, 9, BRASSB); q.R(4, 3, 1, 7, BR[3]); q.R(2, 0, 9, 3, BR[1]); q.R(3, 0, 7, 1, BR[3]); q.R(4, 11, 5, 2, BR[0]);
    q.R(6, 13, 1, 2, IR[2]); q.box(3, 14, 7, 4, IRONB);
    return q.c;
  }
  // ---------- 小机械（docs/expedition-plan.md §12）：拾荒爬车 · 滚桶炸弹 · 发条步兵 · 步哨炮车 ----------
  // 都朝左画（迎着往右开的玩家），世界像素 1:1；mob(kind, frame) 返回 { c, ax, ay }（落地点 = 底边中点），按帧缓存
  const TIN = ['#2a2d33', '#454a52', '#6a707a', '#9aa1aa', '#c8ced4'];   // 镀锡铁皮（发条兵的脸、肚子）
  const COAT = ['#3a1712', '#5e241a', '#7e3424', '#9c4a34'];            // 褪色的红军装
  function crawler(f) {
    const q = pen(32, 22), ph = f % 2;
    // 履带：一圈铁带 + 三个负重轮，链节按帧错开
    q.R(3, 14, 26, 7, IR[0]); q.R(4, 15, 24, 5, IR[1]); q.R(4, 15, 24, 1, IR[2]);
    for (let x = 4 + ph * 2; x < 28; x += 4) { q.px(x, 14, IR[2]); q.px(x, 20, IR[2]); }
    for (const wx of [8, 16, 24]) { q.disc(wx, 17.5, 2.2, IR[2]); q.px(wx - 1, 16, IR[3]); q.px(wx, 18, IR[0]); }
    // 车身：锈铁小箱 + 铆钉；背后一截小烟囱
    q.box(8, 6, 17, 9, [RU[0], RU[1], RU[2], RU[3]]); for (const rx of [10, 15, 20]) q.px(rx, 8, IR[4]);
    q.R(23, 1, 3, 6, IR[0]); q.R(24, 2, 1, 5, IR[2]); q.R(22, 0, 5, 2, IR[1]);
    // 背上的破烂筐：铁丝格 + 冒出来的齿轮和一截管子
    q.R(9, 2, 12, 4, IR[0]); for (let x = 10; x < 21; x += 2) q.px(x, 3, IR[2]); q.R(10, 4, 10, 1, IR[1]);
    q.disc(13, 1.5, 2, (a, b) => (Math.hypot(a, b) > 0.6 ? BR[1] : BR[0])); q.px(12, 0, BR[3]); q.R(16, 0, 4, 2, IR[3]); q.px(16, 0, IR[4]);
    // 抓钳：从车头伸出的臂 + 一开一合的两片钳口
    q.R(3, 9, 6, 2, IR[1]); q.px(4, 9, IR[3]);
    const open = ph ? 2 : 1;
    q.R(0, 9 - open, 4, 1, IR[2]); q.px(0, 10 - open, IR[2]); q.R(0, 11 + open, 4, 1, IR[2]); q.px(0, 10 + open, IR[2]); q.R(3, 8 - open, 1, 2 + open * 2 + 2, IR[0]);
    return { c: q.c, ax: 16, ay: 22 };
  }
  function rollBarrel(f) {
    const q = pen(26, 26), a = f / 8 * Math.PI * 2, cx = 12.5, cy = 13.5, r = 10;
    q.disc(cx, cy, r, (u, v) => { const d = Math.hypot(u, v); return d > 0.88 ? RU[0] : u + v < -0.5 ? RU[3] : u + v > 0.6 ? RU[1] : RU[2]; });
    // 两道铁箍跟着转：画成过圆心的两条弦
    for (const off of [-0.5, 0.5]) { const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux; for (let t = -r + 1; t <= r - 1; t += 0.5) { const x = cx + ux * t + nx * off * r * 0.8, y = cy + uy * t + ny * off * r * 0.8; if (Math.hypot(x - cx, y - cy) < r - 0.8) q.px(x, y, IR[1]); } }
    for (let k = 0; k < 4; k++) { const b = a + k * Math.PI / 2; q.px(cx + Math.cos(b) * (r - 3), cy + Math.sin(b) * (r - 3), IR[4]); }
    // 引信：从桶口伸出来，跟着桶转；头上一点火星（按帧闪）
    const fx = cx + Math.cos(a - 0.6) * (r + 1), fy = cy + Math.sin(a - 0.6) * (r + 1);
    q.line(cx + Math.cos(a - 0.6) * (r - 2), cy + Math.sin(a - 0.6) * (r - 2), fx, fy, SACK[3]);
    q.px(fx, fy, f % 2 ? P.fire[3] : P.fire[2]); if (f % 2) { q.px(fx + 1, fy - 1, P.fire[2]); q.px(fx - 1, fy - 1, P.fire[3]); }
    return { c: q.c, ax: 12, ay: 24 };
  }
  function soldier(f) {
    const q = pen(16, 28), step = [0, 1, 0, -1][f % 4];
    // 腿：灰裤子，走路一前一后
    q.R(5 + step, 20, 2, 7, IR[1]); q.R(8 - step, 20, 2, 7, IR[2]); q.R(4 + step, 26, 3, 2, IR[0]); q.R(8 - step, 26, 3, 2, IR[0]);
    // 身子：红军装 + 两条白交叉带 + 铜扣
    q.box(4, 11, 8, 10, COAT); q.line(5, 12, 10, 19, P.steam[2]); q.line(10, 12, 5, 19, P.steam[1]); q.px(7, 16, BR[3]);
    // 头：镀锡圆脸 + 两点眼睛 + 八字胡；高筒军帽（帽徽黄铜）
    q.disc(8, 8, 3.2, (u, v) => (u + v < -0.4 ? TIN[4] : TIN[3])); q.px(6, 8, TIN[0]); q.px(9, 8, TIN[0]); q.R(6, 10, 4, 1, TIN[1]);
    q.R(5, 0, 7, 6, P.dark[1]); q.R(5, 0, 7, 1, P.dark[3]); q.R(4, 5, 9, 1, P.dark[0]); q.px(8, 2, BR[3]); q.px(8, 3, BR[2]);
    // 小火枪：斜扛，枪口朝左前
    q.line(1, 9, 9, 17, WOOD[3]); q.line(0, 8, 3, 11, IR[2]); q.px(0, 8, IR[3]);
    // 背后的发条钥匙：转动（4 帧：横 / 斜 / 竖 / 斜）
    const kx = 13, ky = 14; q.R(12, 14, 2, 1, BR[1]);
    const ks = [[[0, -2], [0, 2]], [[-1, -2], [1, 2]], [[-2, 0], [2, 0]], [[-1, 2], [1, -2]]][f % 4];
    for (const [dx, dy] of ks) { q.R(kx + 1 + Math.max(0, dx), ky + Math.min(0, dy), 2, 2, BR[2]); q.px(kx + 1 + Math.max(0, dx), ky + Math.min(0, dy), BR[3]); }
    return { c: q.c, ax: 8, ay: 28 };
  }
  function sentry(f) {
    const q = pen(38, 28), rec = f % 3 === 1 ? 2 : 0;
    // 车架后拖着地 + 远侧轮
    q.line(20, 21, 36, 26, WOOD[1], 3); q.line(20, 20, 36, 25, WOOD[4]);
    q.disc(22, 20, 6, IR[0]);
    // 挡弹板（在炮管后面）：铆接铁板
    q.box(12, 3, 10, 15, [IR[0], IR[1], IR[2], IR[3]]); for (const ry of [5, 15]) { q.px(14, ry, IR[4]); q.px(19, ry, IR[4]); }
    // 炮管从挡弹板中间穿出来、朝左，开火那一帧往后缩；炮口一圈黄铜
    q.R(1 + rec, 8, 20, 5, IR[0]); q.R(2 + rec, 9, 18, 3, IR[2]); q.R(2 + rec, 9, 18, 1, IR[4]); q.R(2 + rec, 11, 18, 1, IR[1]);
    q.R(0 + rec, 7, 3, 7, BR[1]); q.R(0 + rec, 7, 3, 1, BR[3]); q.R(17, 7, 3, 7, BR[0]);
    if (f % 3 === 1) { q.R(0, 9, 1, 3, P.fire[3]); }
    // 近侧大轮（在炮管下面）：辐条 + 铁箍
    q.disc(15, 20, 7, (u, v) => { const d = Math.hypot(u, v), ang = Math.atan2(v, u); return d > 0.8 ? (u + v < 0 ? IR[3] : IR[1]) : d < 0.22 ? BR[2] : Math.abs(Math.sin(ang * 3)) * d < 0.2 ? WOOD[4] : null; });
    return { c: q.c, ax: 19, ay: 28 };
  }
  const MOBS = { crawler: { draw: crawler, frames: 2 }, barrel: { draw: rollBarrel, frames: 8 }, soldier: { draw: soldier, frames: 4 }, sentry: { draw: sentry, frames: 3 } };
  const mob = (kind, frame = 0) => { const m = MOBS[kind]; return m ? cached(`mob:${kind}:${frame % m.frames}`, () => m.draw(frame % m.frames)) : null; };
  // 散架的碎件（翻滚：按 90° 转四个朝向，像素画不旋转）；scrap = 飞上车的金属片
  const PIECES = {
    gear: (q) => q.disc(3.5, 3.5, 3.4, (u, v) => { const d = Math.hypot(u, v), a = Math.atan2(v, u); return d < 0.3 ? null : d > 0.75 && Math.cos(a * 6) < 0 ? null : u + v < 0 ? BR[3] : BR[1]; }),
    plate: (q) => { q.R(0, 1, 6, 4, IR[0]); q.R(1, 1, 5, 3, IR[2]); q.px(1, 1, IR[4]); q.px(4, 2, IR[4]); },
    spring: (q) => { for (let y = 0; y < 7; y++) q.px(y % 2 ? 3 : 1, y, IR[3]); q.px(2, 0, IR[2]); },
    key: (q) => { q.R(0, 2, 5, 2, BR[2]); q.R(4, 0, 2, 6, BR[1]); q.px(0, 2, BR[3]); },
    wheel: (q) => q.disc(3.5, 3.5, 3.5, (u, v) => { const d = Math.hypot(u, v); return d > 0.7 ? IR[1] : d < 0.25 ? BR[2] : Math.abs(u) < 0.2 || Math.abs(v) < 0.2 ? WOOD[4] : null; }),
    coat: (q) => { q.R(0, 0, 5, 4, COAT[2]); q.R(0, 0, 5, 1, COAT[3]); q.px(2, 2, P.steam[2]); },
    stave: (q) => { q.R(0, 0, 7, 2, RU[2]); q.R(0, 0, 7, 1, RU[3]); q.px(3, 1, IR[1]); },
    scrap: (q) => { q.R(0, 0, 3, 3, IR[2]); q.px(0, 0, IR[4]); q.px(2, 2, IR[1]); },
  };
  function piece(type, rot = 0) {
    return cached(`piece:${type}:${rot & 3}`, () => {
      const q = pen(8, 8); (PIECES[type] || PIECES.plate)(q);
      if (!(rot & 3)) return { c: q.c, ax: 4, ay: 4 };
      const o = pen(8, 8); o.g.translate(4, 4); o.g.rotate((rot & 3) * Math.PI / 2); o.g.drawImage(q.c, -4, -4);
      return { c: o.c, ax: 4, ay: 4 };
    });
  }
  // 每种机械散架时掉哪些碎件
  const DEBRIS = { crawler: ['gear', 'plate', 'wheel', 'spring', 'plate'], barrel: ['stave', 'stave', 'plate', 'stave'], soldier: ['coat', 'key', 'spring', 'gear'], sentry: ['wheel', 'plate', 'plate', 'gear', 'spring'] };

  return { PAL: { WOOD, COAL, SACK, TARP, BRICK, STONE, IVY, GLOW }, hash, wrap, pen, CARGO, BIN, contents, sackAt, crateAt, barrelAt, relicAt, rider, prop, refugees, terrainTiles, dress, strip, coalGauge, cargoSlots, whistle, MOBS, mob, piece, DEBRIS };
})();
