// 主页面的场景：老汤姆的铁匠铺院子（界面重建 v3，专门给主页面画的，不借战斗背景）。
// 原生 640×360，显示放大 2 倍（和人物、车同一种像素大小）。四种天气：晴 / 雨 / 夜 / 雾（同一张图换一套颜色 + 各自的动效）。
// 画法（2026-09-30 按像素画经验重做，参考 Slynyrd Pixelblog 45、Pixel Parmesan「Dithering for Pixel Artists」、Graveyard Keeper 的雾和光）：
//  · 大面积用平涂，砖缝和砖只差一阶，偶尔几块砖深一点浅一点；抖动只留给天空色带交界那一行，不再满屏杂点。
//  · 墙和地分得开：墙根一道石砌勒脚（顶上一条受光面）→ 一道接缝暗线 → 地面是水平的夯土院子；门口一条石板路越往前石板越大（透视），把视线引到门里。
//  · 门做成欢迎人的样子：石拱门、两扇门板贴墙敞开、门楣上挂铁砧招牌、门口雨棚 + 提灯、一级石台阶，门里炉火发暖光，夜里 / 雨里洒到路上。
//  · 车后面那段墙故意留空（只挂一盏工作灯），给车当干净的背景；远景（城市）对比最低，雾天几乎看不见。
//  · 所有东西都站在地上：人物、道具、路标的脚都落在同一条「站位线」上，脚下一块平涂的接触影子；晴天影子往右后方拉（太阳在左上），其他天气影子在正下方。
// base(wk) = 静态底图（按天气缓存）；fx(g, t, wk) = 每帧叠上去的动效（炉火、烟、雨丝 / 水花 / 水洼涟漪、雾带、星星）。
window.SA = window.SA || {};

SA.HomeScene = (() => {
  const W = 640, H = 360, BASE = 272, FEET = 299, HOR = 226;
  const B = SA.PAL.brass;
  const hash = (x, y, s = 1) => { let v = (x * 374761393 + y * 668265263 + s * 982451653) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  // 位置（home.js 也用它们摆人物和道具）：门、炉口、窗、烟囱、车顶上的工作灯、院门、风向标
  const L = { door: [152, 176, 238, 262], hearth: [166, 229, 190, 241], window: [384, 148, 420, 184], chimney: [300, 14, 324, 48], lamp: [320, 200], gate: [552, 600], vane: [72, 42] };
  const PUDDLES = [[396, 294, 22, 3], [92, 322, 16, 2], [470, 338, 26, 3], [250, 352, 14, 2], [586, 302, 18, 2]];
  const ORDER = ['sun', 'rain', 'night', 'fog'];
  const NAME = { sun: '晴', rain: '雨', night: '夜', fog: '雾' };
  // 每种天气一套颜色（同一张图换色，像 Pokémon 金银的昼夜换色板）
  const T = {
    sun: {
      sky: ['#4f86c6', '#6b9dd6', '#8db6e2', '#b4d0ea'], cloud: ['#f6f8fa', '#d3dde8'], orb: [40, 22, 9, '#fff3c0', '#ffe8a0'],
      far: ['#9ab0c8', null], brick: ['#a65a3e', '#8e4c34', '#b86c4c', '#86462f'], stone: ['#d8ccb8', '#b0a490', '#857a68'],
      roof: ['#7d8898', '#5b6678', '#454e5e'], wood: ['#b07a48', '#8c5a34', '#6b4128', '#3b2418'], iron: ['#8a96a8', '#5a6478', '#343c4e'],
      ground: ['#b49872', '#957b5c', '#cbb38c'], path: ['#c9bda6', '#968a74', '#b8ab92'], weed: '#6a8a3a',
      inside: ['#4a3024', '#3a261c', '#e08a3a'], glass: ['#5d7fa6', '#b4d0ea'], lit: false, lamp: 0, spill: 0.1, eave: 0.22,
      sh: [70, 45, 30, 0.42], cast: 'sun', rim: [[255, 246, 214, 0.35], [255, 246, 214, 0.2]], ring: null, smoke: '#eeece6', water: '#6f9cc4',
    },
    rain: {
      sky: ['#3d4756', '#4a5464', '#566070', '#626c7c'], cloud: ['#6c7686', '#343d4a'], orb: null,
      far: ['#57606e', '#c89a58'], brick: ['#6a4638', '#5a3b2f', '#76503f', '#4e3226'], stone: ['#8e8e8c', '#6e6e6e', '#4e4e52'],
      roof: ['#7a8698', '#343b48', '#262c36'], wood: ['#6e4a30', '#553823', '#40291a', '#24160e'], iron: ['#7c889a', '#4a5466', '#2a3140'],
      ground: ['#4c4640', '#38332e', '#6a625a'], path: ['#6c6862', '#48443f', '#605c56'], weed: '#3e5a32',
      inside: ['#5a3424', '#4a2a1c', '#f09a48'], glass: ['#e8a050', '#ffd48a'], lit: true, lamp: 0.16, spill: 0.2, eave: 0.12,
      sh: [10, 10, 16, 0.45], cast: 'drop', rim: [[214, 230, 246, 0.35], [255, 200, 130, 0.25]], ring: [226, 236, 248, 0.32], smoke: '#7a808a', water: '#626c7c', rain: true,
    },
    night: {
      sky: ['#0b1024', '#111a34', '#18233f', '#1f2c4a'], cloud: null, orb: [590, 30, 7, '#f2ecd2', '#27335a'], stars: true,
      far: ['#161d33', '#e8a850'], brick: ['#3c2c3c', '#302331', '#4a3648', '#261a26'], stone: ['#5e5e72', '#44445a', '#30303f'],
      roof: ['#3c4258', '#222739', '#181b28'], wood: ['#4a3440', '#382632', '#2a1c26', '#180f16'], iron: ['#5a6478', '#3a4256', '#22283a'],
      ground: ['#2e2c3a', '#201f2b', '#44425a'], path: ['#3e3c4e', '#2a2836', '#363446'], weed: null,
      inside: ['#8a4424', '#6a3418', '#ffb050'], glass: ['#f0a848', '#ffe0a0'], lit: true, lamp: 0.22, spill: 0.3, eave: 0,
      sh: [4, 4, 10, 0.55], cast: 'drop', rim: [[255, 214, 150, 0.45], [255, 190, 120, 0.3]], ring: [255, 196, 120, 0.42], smoke: '#3a4056', water: '#1f2c4a',
    },
    fog: {
      sky: ['#aeb2b6', '#b9bcbf', '#c3c5c7', '#cccdce'], cloud: null, orb: null,
      far: ['#b8bbbe', null], brick: ['#8c6c60', '#7e6056', '#98786a', '#745852'], stone: ['#bcb8b0', '#9c988f', '#807c74'],
      roof: ['#8a8e96', '#6e737c', '#5c6068'], wood: ['#8a6a50', '#745640', '#5e4432', '#443226'], iron: ['#8a92a0', '#6a7282', '#4e5564'],
      ground: ['#8e887e', '#78726a', '#a49e92'], path: ['#a8a298', '#86807a', '#9c968c'], weed: '#6a7a5a',
      inside: ['#5a3a2a', '#4a2e20', '#e89048'], glass: ['#d8a060', '#f0c890'], lit: true, lamp: 0.1, spill: 0.1, eave: 0.08,
      sh: [60, 56, 52, 0.3], cast: 'drop', rim: [[255, 255, 255, 0.12], [255, 210, 150, 0.15]], ring: null, smoke: '#d6d6d6', water: '#b9bcbf', fog: true,
    },
  };
  const th = (wk) => T[wk] || T.sun;
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const cache = {};
  // 天气：这次打开游戏第一次用到时随机一种，之后记住（sessionStorage，只是看的偏好，不进存档）；风向标点一下换下一种。序章在院子里打，和主页面同一种天气
  const WKEY = 'steam_arena_home_weather';
  function weather(force) {
    let v = force;
    if (!ORDER.includes(v)) { try { v = sessionStorage.getItem(WKEY); } catch (e) { v = null; } }
    if (!ORDER.includes(v)) v = ORDER[Math.floor(Math.random() * ORDER.length)];
    try { sessionStorage.setItem(WKEY, v); } catch (e) { /* 隐私模式等：不记也行 */ }
    return v;
  }

  // 平涂砖墙：砖缝只比砖暗一阶，偶尔一块深一点 / 浅一点
  const bricksOf = (R, t) => (x0, y0, x1, y1) => {
    const [bc, mc, lc, dc] = t.brick;
    R(x0, y0, x1 - x0, y1 - y0, bc);
    for (let row = Math.floor(y0 / 6); row * 6 < y1; row++) {
      const top = row * 6, off = row % 2 ? 6 : 0;
      if (top + 5 >= y0 && top + 5 < y1) R(x0, top + 5, x1 - x0, 1, mc);
      for (let bx = Math.floor((x0 + off) / 12); bx * 12 - off < x1; bx++) {
        const left = bx * 12 - off, v = hash(bx, row, 11), cl = Math.max(x0, left), cr = Math.min(x1, left + 11), ct = Math.max(y0, top), cb = Math.min(y1, top + 5);
        if (cr > cl && cb > ct) { if (v > 0.92) R(cl, ct, cr - cl, cb - ct, lc); else if (v < 0.05) R(cl, ct, cr - cl, cb - ct, dc); }
        if (left + 11 >= x0 && left + 11 < x1 && cb > ct) R(left + 11, ct, 1, cb - ct, mc);
      }
    }
  };
  function layer(wk, parts) {
    const key = wk + '|' + Object.keys(parts).filter(k => parts[k]).join(',');
    if (cache[key]) return cache[key];
    const t = th(wk);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const R = (x, y, w, h, col) => { if (w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const p = (x, y, col) => R(x, y, 1, 1, col);
    const oval = (cx, cy, rx, ry, col) => { for (let y = -ry; y <= ry; y++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1)))); R(cx - hw, cy + y, hw * 2, 1, col); } };
    const [s0, s1, s2] = t.stone, [w0, w1, w2, w3] = t.wood, [i0, i1, i2] = t.iron, [g0, g1, g2] = t.ground;
    const [wx0, wy0, wx1, wy1] = L.window, [n0, n1, nGlow] = t.inside, [lx, ly] = L.lamp, [fc, fw] = t.far;
    const pathL = (y) => Math.round(146 - (y - 277) * 0.9), pathR = (y) => Math.round(244 - (y - 277) * 0.3);

    if (parts.sky) {
    // ---------- 天空：几条平涂色带，交界处一行棋盘格过渡 ----------
    const bh = HOR / t.sky.length;
    t.sky.forEach((col, i) => R(0, i * bh, W, bh + 1, col));
    for (let i = 1; i < t.sky.length; i++) { const y = Math.round(i * bh); for (let x = y & 1; x < W; x += 2) p(x, y, t.sky[i - 1]); }
    if (t.stars) for (let i = 0; i < 46; i++) p(Math.floor(hash(i, 1, 3) * W), Math.floor(hash(i, 2, 3) * 150), hash(i, 3, 3) > 0.6 ? '#e8ecf8' : '#6a7498');
    if (t.orb) { const [ox, oy, r, col, ring] = t.orb; if (ring) oval(ox, oy, r + 3, r + 3, ring); oval(ox, oy, r, r, col); if (wk === 'night') { p(ox - 2, oy - 1, '#d8d0b0'); R(ox + 1, oy + 2, 2, 1, '#d8d0b0'); } }
    if (t.cloud && !t.rain) {   // 晴天：三朵干净的云（叠起来的圆角块 + 底下一行阴影）
      for (const [cx, cy, w] of [[180, 26, 52], [430, 18, 66], [604, 56, 40]]) { R(cx - w / 2, cy, w, 4, t.cloud[0]); R(cx - w / 2 + 5, cy - 3, w * 0.45, 3, t.cloud[0]); R(cx - w / 10, cy - 6, w * 0.34, 6, t.cloud[0]); R(cx - w / 2 + 2, cy + 4, w - 4, 1, t.cloud[1]); }
    }
    if (t.rain) {   // 雨天：压得很低的一整片云，底边起伏
      for (let x = 0; x < W; x++) { const e = 40 + Math.round(5 * Math.sin(x / 23) + 3 * Math.sin(x / 9 + 1)); R(x, 0, 1, e, t.cloud[1]); R(x, e, 1, 2, t.cloud[0]); }
    }
    }
    if (parts.far) {
    // ---------- 远景：城市剪影（最低对比），右边露出来 ----------
    for (const [x, y, w] of [[452, 170, 30], [482, 150, 20], [502, 176, 44], [546, 160, 24], [570, 182, 40], [610, 164, 30]]) {
      R(x, y, w, HOR - y, fc);
      if (fw) for (let wy = y + 5; wy < HOR - 8; wy += 9) for (let wx = x + 3; wx < x + w - 4; wx += 7) if (hash(wx, wy, 7) > 0.78) R(wx, wy, 2, 3, fw);   // 亮窗排成行，稀一点
    }
    for (const [x, top] of [[488, 120], [598, 132]]) R(x, top, 5, HOR - top, fc);
    R(528, 118, 12, HOR - 118, fc); R(526, 114, 16, 5, fc); R(530, 106, 8, 8, fc); R(533, 102, 2, 4, fc);   // 钟塔
    R(531, 124, 6, 6, fw || t.sky[3]); p(534, 126, fc); p(534, 127, fc);
    if (t.fog) R(0, 50, W, HOR - 50, rgba('#d0d2d4', 0.45));   // 雾：远景几乎化掉

    }
    if (parts.ground) {
    // ---------- 地面：平的夯土院子 + 墙根接缝影子 + 稀疏的石子 ----------
    R(0, BASE, W, H - BASE, g0); R(0, BASE, W, 2, g1);
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash(i, 5, 71) * W), y = 280 + Math.floor(hash(i, 6, 71) * 78), w = 1 + Math.floor((y - 272) / 32);
      if (x > pathL(y) - 3 && x < pathR(y) + 3) continue;
      R(x, y, w + 1, 1, g1); R(x, y - 1, w, 1, g2);
    }
    // 石板路：从台阶往前、往左下铺开，越往前每块越大
    for (let y = 277, row = 0; y < H; row++) {
      const hgt = 3 + Math.floor(row / 2), sw = 10 + row * 3, xl = pathL(y), xr = pathR(y);
      R(xl, y, xr - xl, hgt, t.path[0]); R(xl, y + hgt - 1, xr - xl, 1, t.path[1]);
      for (let x = xl - (((xl % sw) + sw) % sw) - (row % 2 ? sw / 2 : 0); x < xr; x += sw) {
        if (hash(Math.round(x), row, 51) > 0.72) R(Math.max(xl, x + 1), y, Math.min(x + sw, xr) - Math.max(xl, x + 1), hgt - 1, t.path[2]);
        if (x > xl) R(x, y, 1, hgt, t.path[1]);
      }
      y += hgt;
    }
    // 水洼（雨天）：映着天色，亮窗 / 工作灯底下有一条暖色倒影
    if (t.rain) for (const [px, py, rx, ry] of PUDDLES) { oval(px, py, rx, ry, t.water); R(px - rx + 3, py - ry - 1, rx * 2 - 6, 1, g1); R(px - rx / 2, py, rx / 2, 1, t.sky[3]); if (Math.abs(px - (wx0 + wx1) / 2) < rx) R((wx0 + wx1) / 2 - 3, py - ry + 1, 6, ry * 2 - 1, rgba(t.glass[0], 0.6)); }
    // 门里的炉光洒到台阶和石板路上
    if (t.spill) {
      for (let y = 277; y < H; y++) { const xl = pathL(y) + 4, xr = pathR(y) - 4, k = (y - 277) / (H - 277); R(xl, y, xr - xl, 1, rgba(nGlow, t.spill * (1 - k * 0.7))); R(xl + (xr - xl) * 0.25, y, (xr - xl) * 0.5, 1, rgba(nGlow, t.spill * 0.6 * (1 - k))); }
    }

    }
    if (parts.build) {
    // ---------- 右边：院墙 + 院门（路标就立在门前）----------
    const [bc, mc, lc, dc] = t.brick, bricks = bricksOf(R, t);
    bricks(452, 228, W, 256);
    R(452, 222, W - 452, 2, s0); R(452, 224, W - 452, 3, s1); R(452, 227, W - 452, 1, s2);   // 墙帽
    // ---------- 勒脚（整条墙根）：顶上一条受光面 → 立面 → 接缝暗线；地面从这里开始 ----------
    R(0, 256, W, 16, s1); R(0, 256, W, 2, s0); R(0, 271, W, 1, s2);
    for (let x = 18; x < W; x += 22) R(x, 258, 1, 13, s2);
    // 院门：两根石门柱，门洞里看得见远处的街
    const [gx0, gx1] = L.gate;
    if (parts.far) {
      R(gx0, 222, gx1 - gx0, 50, t.sky[t.sky.length - 1]);
      R(gx0, 232, gx1 - gx0, 26, fc); if (fw) { R(gx0 + 8, 238, 2, 2, fw); R(gx0 + 30, 242, 2, 2, fw); }
      R(gx0, 258, gx1 - gx0, 14, t.fog ? '#b0aea8' : s2); R(gx0, 258, gx1 - gx0, 1, s1);
      if (t.fog) R(gx0, 222, gx1 - gx0, 50, rgba('#d0d2d4', 0.4));
    } else g.clearRect(gx0, 222, gx1 - gx0, 50);   // 只要建筑层（战斗场景）时，门洞透出后面的远景
    for (const x of [gx0 - 8, gx1]) { R(x, 208, 8, 64, s1); R(x, 208, 1, 64, s0); R(x + 7, 208, 1, 64, s2); for (let y = 218; y < 272; y += 12) R(x, y, 8, 1, s2); R(x - 2, 204, 12, 4, s0); R(x - 2, 207, 12, 1, s2); }

    // ---------- 铁匠铺：烟囱（在屋顶后面）→ 屋顶 → 砖墙 ----------
    const [cx0, cy0, cx1, cy1] = L.chimney;
    bricks(cx0, cy0, cx1, cy1); R(cx0 - 3, cy0 - 4, cx1 - cx0 + 6, 4, s1); R(cx0 - 3, cy0 - 4, cx1 - cx0 + 6, 1, s0); R(cx1 - 2, cy0, 2, cy1 - cy0, dc);
    const [r0, r1, r2] = t.roof;
    for (let y = 44; y < 86; y++) {
      const right = 440 + Math.round((y - 44) * 0.48), left = Math.max(-10, Math.round(10 - (y - 44) * 0.48)), k = (y - 44) % 6;
      R(left, y, right - left, 1, k === 0 ? r0 : k === 5 ? r2 : r1);
      if (k === 1) { const off = Math.floor((y - 44) / 6) % 2 ? 7 : 0; for (let x = off + 14; x < right - 2; x += 14) if (x > left + 1) R(x, y, 1, 4, r2); }
      p(right - 1, y, r2); p(left, y, r0);
    }
    R(10, 41, 431, 3, r2); R(10, 41, 431, 1, r0);   // 屋脊
    bricks(0, 90, 452, 256);
    R(-10, 86, 472, 4, w2); R(-10, 86, 472, 1, w1); R(-10, 89, 472, 1, w3);   // 檐板
    if (t.eave) R(0, 90, 452, 5, rgba('#000000', t.eave));   // 屋檐下的影子
    for (let k = 0, y = 90; y < 256; k++, y += 10) { const w = k % 2 ? 10 : 6; for (const x of [452 - w, 0]) { R(x, y, w, 9, s1); R(x, y, w, 1, s0); R(x, y + 9, w, 1, s2); } }   // 墙角石（两头）

    // ---------- 大门：石拱 + 敞开的门板 + 门里的炉子 ----------
    const [dx0, dy0, dx1, dy1] = L.door, mid = (dx0 + dx1) / 2, rad = (dx1 - dx0) / 2;
    const archTop = (x) => dy0 - Math.round(14 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - mid) / rad) ** 2)));
    const ringTop = (x) => dy0 - Math.round(20 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - mid) / (rad + 6)) ** 2)));
    for (let x = dx0 - 6; x < dx1 + 6; x++) { const top = ringTop(x); R(x, top, 1, dy0 + 4 - top, s1); p(x, top, s0); if ((x - dx0) % 8 === 0) R(x, top + 1, 1, 5, s2); }
    R(mid - 4, ringTop(mid) - 2, 8, 9, s0); R(mid - 4, ringTop(mid) + 6, 8, 1, s2); R(mid + 3, ringTop(mid) - 2, 1, 9, s2);   // 拱心石
    for (const x of [dx0 - 5, dx1]) { R(x, dy0, 5, dy1 - dy0, s1); R(x, dy0, 1, dy1 - dy0, s0); for (let y = dy0 + 10; y < dy1; y += 12) R(x, y, 5, 1, s2); }   // 门边石
    for (let x = dx0; x < dx1; x++) R(x, archTop(x), 1, dy1 - archTop(x), n0);   // 门里的后墙
    R(dx0, 250, dx1 - dx0, dy1 - 250, n1);
    oval(178, 236, 34, 26, rgba(nGlow, t.lit ? 0.22 : 0.12)); oval(178, 236, 20, 15, rgba(nGlow, t.lit ? 0.22 : 0.12));   // 炉火照亮的一片
    R(dx0, archTop(dx0), 3, dy1 - archTop(dx0), rgba('#000000', 0.25));
    // 炉罩 + 烟道 + 砖炉台 + 炉口（火在 fx 里画）
    R(172, archTop(172), 12, 190 - archTop(172), i2); R(172, archTop(172), 2, 190 - archTop(172), i1);
    for (let y = 190; y < 220; y++) { const inset = Math.round((220 - y) * 0.45); R(154 + inset, y, 48 - inset * 2, 1, y % 5 === 0 ? i2 : i1); }
    R(152, 218, 52, 2, i0);
    R(158, 220, 40, 3, s1); R(158, 220, 40, 1, s0);
    R(160, 223, 36, 27, '#5a2c1e'); for (let y = 227; y < 250; y += 4) R(160, y, 36, 1, '#3a1a12');
    const [hx0, hy0, hx1, hy1] = L.hearth; R(hx0, hy0, hx1 - hx0, hy1 - hy0, '#140a08');
    // 后墙上挂的工具剪影：锤、钳、马蹄铁
    const sil = rgba('#000000', 0.45);
    R(209, 194, 1, 14, sil); R(206, 194, 7, 3, sil); R(217, 192, 1, 18, sil); R(219, 192, 1, 18, sil); R(216, 208, 5, 2, sil);
    for (let a = 0.4; a < Math.PI * 1.6; a += 0.25) p(Math.round(229 + Math.cos(a + 1.57) * 4), Math.round(202 + Math.sin(a + 1.57) * 4), sil);
    // 门板：竖木板 + 两道铁合页，敞开贴在墙上
    const leaf = (x0) => { for (let x = 0; x < 22; x++) R(x0 + x, dy0 + 2, 1, dy1 - dy0 - 2, x % 5 === 4 ? w3 : x % 5 === 0 ? w0 : w1); R(x0, dy0 + 2, 22, 1, w0); for (const y of [dy0 + 14, dy1 - 18]) { R(x0 + 2, y, 18, 2, i2); p(x0 + 3, y, i0); } };
    leaf(dx0 - 28); leaf(dx1 + 6);
    // 台阶：一级石阶，比勒脚往外凸
    R(144, 264, 102, 3, s0); R(144, 267, 102, 9, s1); R(144, 276, 102, 1, s2); R(178, 267, 1, 9, s2); R(212, 267, 1, 9, s2);
    // 雨棚 + 下面的影子 + 两个铁托架
    R(134, 146, 122, 2, r0); R(134, 148, 122, 4, r1); R(134, 152, 122, 1, r2); R(138, 153, 114, 3, rgba('#000000', 0.18));
    for (const x of [140, 249]) for (let k = 0; k < 6; k++) { p(x, 153 + k, i2); p(x + (x < 200 ? k : -k), 158 - k, i2); }
    // 招牌：两根链子挂在檐板下，木牌上画铁砧
    for (const x of [180, 210]) for (let y = 91; y < 126; y += 2) p(x, y, i1);
    R(174, 126, 42, 20, w3); R(175, 127, 40, 18, w1); R(175, 127, 40, 1, w0);
    R(184, 132, 22, 3, i2); R(181, 132, 4, 2, i2); R(189, 135, 12, 3, i2); R(186, 138, 18, 2, i2); R(184, 132, 22, 1, i0);
    // 门边的提灯（亮 = 有灯光）
    if (t.lit) { oval(263, 167, 14, 12, rgba('#ffc060', 0.12)); oval(263, 167, 8, 7, rgba('#ffc060', 0.14)); }
    R(256, 158, 8, 1, i2); R(263, 158, 1, 3, i2); R(259, 160, 9, 2, i2); R(260, 162, 7, 9, i2); R(261, 163, 5, 7, t.lit ? '#ffd070' : i1); p(263, 163, t.lit ? '#fff1b8' : i0); R(261, 171, 5, 1, i2);

    // ---------- 窗：石过梁 + 窗台，夜里 / 雨里亮灯 ----------
    if (t.lit) { oval((wx0 + wx1) / 2, (wy0 + wy1) / 2, 30, 26, rgba(t.glass[0], 0.1)); }
    R(wx0 - 4, wy0 - 5, wx1 - wx0 + 8, 5, s1); R(wx0 - 4, wy0 - 5, wx1 - wx0 + 8, 1, s0);
    R(wx0, wy0, wx1 - wx0, wy1 - wy0, w3); R(wx0 + 2, wy0 + 2, wx1 - wx0 - 4, wy1 - wy0 - 4, t.glass[0]);
    if (t.lit) R(wx0 + 2, wy0 + 2, 15, 13, t.glass[1]);
    else for (let k = 0; k < 12; k++) { p(wx0 + 6 + k, wy0 + 16 - k, t.glass[1]); p(wx0 + 12 + k, wy0 + 28 - k, t.glass[1]); }
    R((wx0 + wx1) / 2 - 1, wy0 + 2, 2, wy1 - wy0 - 4, w3); R(wx0 + 2, (wy0 + wy1) / 2 - 1, wx1 - wx0 - 4, 2, w3);
    R(wx0 - 5, wy1, wx1 - wx0 + 10, 4, s1); R(wx0 - 5, wy1, wx1 - wx0 + 10, 1, s0); R(wx0 - 5, wy1 + 3, wx1 - wx0 + 10, 1, s2);

    if (t.spill) { R(146, 264, 98, 12, rgba(nGlow, t.spill)); }
    // ---------- 车顶上的工作灯：车后那段墙留空，灯亮时往墙上和地上打一束光，车就站在亮处前面 ----------
    if (t.lamp) {
      for (let y = ly + 7; y < BASE; y++) { const k = (y - ly - 7) / (BASE - ly - 7); R(lx - 5 - k * 34, y, 10 + k * 68, 1, rgba('#ffd9a0', t.lamp)); R(lx - 3 - k * 16, y, 6 + k * 32, 1, rgba('#ffe6bf', t.lamp * 0.8)); }
    }
    R(lx - 2, 188, 5, 8, i2); R(lx - 1, 189, 3, 6, i1); R(lx, 196, 1, 4, i2);
    R(lx - 4, 200, 9, 1, B[0]); R(lx - 5, 201, 11, 2, B[1]); R(lx - 6, 203, 13, 2, B[2]); R(lx - 5, 201, 11, 1, B[3]);
    R(lx - 2, 205, 5, 2, t.lamp ? '#fff1b8' : i1);

    }
    if (parts.ground) {
    if (t.weed) for (let i = 0; i < 18; i++) { const x = Math.floor(hash(i, 8, 73) * W); if (x > 140 && x < 250) continue; p(x, 271, t.weed); p(x - 1, 270, t.weed); p(x + 1, 269, t.weed); }
    if (t.lamp) { oval(lx, 284, 70, 11, rgba('#ffd9a0', t.lamp)); oval(lx, 283, 42, 6, rgba('#ffe6bf', t.lamp * 0.8)); }
    // ---------- 水桶（淬火用）：站在站位线上 ----------
    oval(68, FEET, 10, 2, `rgba(${t.sh.join(',')})`);
    for (let x = 0; x < 16; x++) { const b = Math.round(Math.sin(x / 15 * Math.PI) * 1.5); R(60 + x, 281 - b, 1, FEET - 281 + b, x % 4 === 0 ? w3 : x < 4 ? w0 : w1); }
    R(60, 285, 16, 2, i2); R(60, 294, 16, 2, i2); R(61, 280, 14, 2, t.water); R(63, 280, 5, 1, t.sky[3]);
    }
    if (t.fog) { if (!parts.sky) g.globalCompositeOperation = 'source-atop'; R(0, 0, W, BASE, rgba('#d8d9da', 0.14)); g.globalCompositeOperation = 'source-over'; }   // 雾：整片背景再退一点
    return (cache[key] = c);
  }
  const ALL = { sky: true, far: true, ground: true, build: true };
  // 主页面用的整张图
  function base(wk) { return layer(wk, ALL); }
  // 战斗场景（序章在院子里打）用：一段 w 宽的院墙（墙帽 + 砖 + 勒脚），高 50，对应院子 y 222..272
  function yardWall(wk, w) {
    const t = th(wk), c = document.createElement('canvas'); c.width = w; c.height = 50;
    const g = c.getContext('2d');
    const R = (x, y, ww, hh, col) => { if (ww <= 0 || hh <= 0) return; g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y - 222), Math.round(ww), Math.round(hh)); };
    const [s0, s1, s2] = t.stone;
    bricksOf(R, t)(0, 228, w, 256);
    R(0, 222, w, 2, s0); R(0, 224, w, 3, s1); R(0, 227, w, 1, s2);
    R(0, 256, w, 16, s1); R(0, 256, w, 2, s0); R(0, 271, w, 1, s2);
    for (let x = 18; x < w; x += 22) R(x, 258, 1, 13, s2);
    return c;
  }

  // ---------- 动效：炉火、烟、星星、雨、雾 ----------
  function fx(g, time, wk) {
    const t = th(wk);
    g.clearRect(0, 0, W, H);
    const R = (x, y, w, h, col) => { if (col) g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const f = Math.floor(time * 10);
    const [mx0, my0, mx1, my1] = L.hearth, mw = mx1 - mx0, mh = my1 - my0;
    for (let x = 0; x < mw; x++) {
      const h1 = 4 + Math.floor(hash(x, f, 31) * 6 + Math.sin(x * 0.7 + time * 5) * 1.5);
      for (let y = 0; y < Math.min(mh, h1); y++) R(mx0 + x, my1 - 1 - y, 1, 1, y < 2 ? '#b8391b' : y < h1 - 2 ? '#ef7a21' : '#ffd166');
    }
    R(mx0, my1 - 2, mw, 2, '#ffd166');
    // 烟：一串方块往上飘、变大变淡（雨天压得低、往右吹）
    const [cx0, cy0, cx1] = L.chimney;
    for (let i = 0; i < 6; i++) {
      const k = (time * 0.16 + i / 6) % 1, s = 3 + Math.round(k * 8);
      g.globalAlpha = 0.6 * (1 - k);
      R((cx0 + cx1) / 2 - s / 2 + Math.sin(k * 5 + i) * 3 + k * (t.rain ? 44 : 22), cy0 - 4 - k * (t.rain ? 26 : 56), s, s, t.smoke);
      g.globalAlpha = 1;
    }
    if (t.stars) for (let i = 0; i < 8; i++) if (hash(i, Math.floor(time * 2), 81) > 0.6) R(Math.floor(hash(i, 1, 83) * W), Math.floor(hash(i, 2, 83) * 40), 1, 1, '#ffffff');
    if (t.rain) {
      // 雨丝：1 像素宽、2:1 斜率，每帧往下 7 像素（参考 4 帧雨的做法，数量压到不糊背景）
      g.fillStyle = 'rgba(196,212,232,.5)';
      const P = H + 20, Q = W + 60;
      for (let i = 0; i < 80; i++) {
        const u = (hash(i, 2, 61) * P + f * 7) % P, y = u - 10, x = ((hash(i, 1, 61) * Q - u / 2) % Q + Q) % Q - 30;
        for (let k = 0; k < 6; k++) g.fillRect(Math.round(x - (k >> 1)), Math.round(y + k), 1, 1);
      }
      // 地上的水花：竖一点 → 空心小环 → 两个点往外 → 没了
      g.fillStyle = 'rgba(214,226,240,.7)';
      for (let i = 0; i < 16; i++) {
        const x = Math.round(hash(i, 3, 63) * W), y = 280 + Math.round(hash(i, 4, 63) * 76), ph = (f + i * 3) % 6;
        if (ph === 0) g.fillRect(x, y - 2, 1, 2);
        else if (ph === 1) { g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 2, y - 1, 1, 1); g.fillRect(x - 1, y - 2, 1, 1); g.fillRect(x + 1, y - 2, 1, 1); }
        else if (ph === 2) { g.fillRect(x - 3, y - 2, 1, 1); g.fillRect(x + 3, y - 2, 1, 1); }
      }
      // 水洼涟漪
      g.fillStyle = 'rgba(226,234,244,.55)';
      PUDDLES.forEach(([px, py, rx], i) => { const r = ((f + i * 5) % 8) * 2; if (r > 1 && r < rx - 2) { g.fillRect(px - r, py, 1, 1); g.fillRect(px + r, py, 1, 1); g.fillRect(Math.round(px - r / 2), py - 1, r, 1); } });
    }
    if (t.fog) {
      // 雾带：几条横着的长条，各自慢慢飘（参考 Graveyard Keeper：一层层横雾，越低越密）
      [[96, 14, 0.18, 4], [138, 18, 0.18, -3], [182, 14, 0.2, 5], [226, 20, 0.24, -4], [260, 16, 0.28, 3]].forEach(([y, hh, a, sp], i) => {
        g.fillStyle = `rgba(228,229,230,${a})`;
        const len = 220 + i * 30, period = len + 120, off = ((time * sp * 4) % period + period) % period;
        for (let x = -period + off; x < W; x += period) { g.fillRect(Math.round(x), y, len, hh); g.fillRect(Math.round(x) + 8, y - 2, len - 16, 2); g.fillRect(Math.round(x) + 8, y + hh, len - 16, 2); }
      });
    }
  }

  // ---------- 接触影子：平涂两层椭圆（不抖动）----------
  function shadow(w, h, wk) {
    const [r, gg, b, a] = th(wk).sh, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const ov = (rx, ry, al) => { g.fillStyle = `rgba(${r},${gg},${b},${al})`; for (let y = 0; y < h; y++) { const dy = (y + 0.5 - h / 2) / ry; if (Math.abs(dy) >= 1) continue; const hw = Math.round(rx * Math.sqrt(1 - dy * dy)); g.clearRect(Math.round(w / 2 - hw), y, hw * 2, 1); g.fillRect(Math.round(w / 2 - hw), y, hw * 2, 1); } };
    ov(w / 2, h / 2, a * 0.6); ov(w * 0.36, h * 0.3, a);
    return c;
  }
  // 车的影子：晴天把车的剪影压扁、往右后方拉（太阳在左上）；别的天气是车底下的椭圆。返回画布和相对车图左上角的偏移（原生像素）
  function carShadow(src, wk) {
    const t = th(wk), w = src.width, h = src.height, d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const [r, gg, b, a] = t.sh;
    if (t.cast !== 'sun') { const c = shadow(w + 12, 8, wk); return { c, ox: -6, oy: h - 4 }; }
    const ow = w + Math.ceil(h * 0.5) + 2, oh = Math.ceil(h * 0.28) + 3, c = document.createElement('canvas'); c.width = ow; c.height = oh;
    const g = c.getContext('2d'), img = g.createImageData(ow, oh), o = img.data;
    const put = (x, y) => { if (x < 0 || y < 0 || x >= ow || y >= oh) return; const j = (y * ow + x) * 4; o[j] = r; o[j + 1] = gg; o[j + 2] = b; o[j + 3] = Math.round(a * 255); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { const up = h - 1 - y; put(x + Math.round(up * 0.5), oh - 2 - Math.round(up * 0.28)); if (up === 0) put(x, oh - 1); }
    g.putImageData(img, 0, 0);
    return { c, ox: 0, oy: h - 1 - (oh - 2) };
  }
  // 车：外面描一圈 1 像素暗边（剪影最要紧）；朝光的边提亮一层轮廓光（晴天是阳光，夜里 / 雨里是灯光）；背景暗的天气再加一圈亮边。
  // 返回的画布四周各多 HERO_PAD 像素。
  const HERO_PAD = 2;
  function hero(src, wk) {
    const t = th(wk), w = src.width, h = src.height, d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, P = HERO_PAD;
    const c = document.createElement('canvas'); c.width = w + P * 2; c.height = h + P * 2;
    const g = c.getContext('2d'), out = g.createImageData(c.width, c.height), o = out.data;
    const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 8;
    const near = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.abs(i) + Math.abs(j) <= r && A(x + i, y + j)) return true; return false; };
    const [top, left] = t.rim, ring = t.ring;
    for (let y = -P; y < h + P; y++) for (let x = -P; x < w + P; x++) {
      const j = ((y + P) * c.width + (x + P)) * 4;
      if (A(x, y)) {
        const i = (y * w + x) * 4; let rr = d[i], gg = d[i + 1], bb = d[i + 2];
        const L1 = !A(x - 1, y) ? left : !A(x, y - 1) ? top : null;
        if (L1) { rr += (L1[0] - rr) * L1[3]; gg += (L1[1] - gg) * L1[3]; bb += (L1[2] - bb) * L1[3]; }
        o[j] = rr; o[j + 1] = gg; o[j + 2] = bb; o[j + 3] = 255;
      } else if (near(x, y, 1)) { o[j] = 11; o[j + 1] = 9; o[j + 2] = 12; o[j + 3] = 255; }
      else if (ring && near(x, y, 2) && y < h - 1) { o[j] = ring[0]; o[j + 1] = ring[1]; o[j + 2] = ring[2]; o[j + 3] = Math.round(ring[3] * 255); }
    }
    g.putImageData(out, 0, 0);
    return c;
  }
  // 人物：背景暗的天气在剪影外加一圈淡淡的亮边，免得黑煤球融进夜色
  function lift(src, wk) {
    const ring = th(wk).ring;
    if (!ring) return src;
    const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 8;
    g.fillStyle = `rgba(${ring[0]},${ring[1]},${ring[2]},${ring[3] * 0.7})`;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!A(x, y) && (A(x - 1, y) || A(x + 1, y) || A(x, y - 1))) g.fillRect(x, y, 1, 1);
    return c;
  }
  // ---------- 雨天 / 夜里人回屋 ----------
  // 谁在哪：forge = 门里炉子和铁砧之间打铁（被炉火逆光照着，只露出门洞里那一截）；step = 门口台阶上、雨棚底下；
  // window = 亮着灯的窗后，只剩剪影。晴天、雾天都在院子里（null）
  const INDOOR = { rain: { tom: 'forge', rel: 'step', tim: 'window' }, night: { tom: 'forge', rel: 'window', tim: 'step' } };
  const indoor = (wk) => INDOOR[wk] || null;
  // 站位（原生坐标）：门里的人脚踩 258（门里地面），台阶上的人脚踩 265，窗后的人身子中心对着窗中下部；x 都是身子中心
  const SPOT = { forge: { x: 206, feet: 258 }, step: { x: 150, feet: 265 }, window: { x: 402, y: 174 }, anvil: [220, 248] };
  const lookCache = new WeakMap();
  const once = (src, k, make) => { let m = lookCache.get(src); if (!m) lookCache.set(src, m = {}); return m[k] || (m[k] = make()); };
  // 逆光：整只压暗，朝炉子那一侧（左边）和头顶描一道炉火色的轮廓光
  function backlit(src) {
    return once(src, 'back', () => {
      const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,14,8,0.5)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      const A = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 8;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!A(x, y)) continue;
        if (!A(x - 1, y)) { g.fillStyle = '#ffb050'; g.fillRect(x, y, 1, 1); if (A(x + 1, y)) { g.fillStyle = 'rgba(255,150,70,0.45)'; g.fillRect(x + 1, y, 1, 1); } }
        else if (!A(x, y - 1)) { g.fillStyle = 'rgba(240,140,60,0.55)'; g.fillRect(x, y, 1, 1); }
      }
      return c;
    });
  }
  // 窗后的剪影：整只填成深色，眼睛那几个最亮的像素留一点暖光（看得出是谁在往外看）
  function silhouette(src) {
    return once(src, 'sil', () => {
      const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] <= 8) continue;
        g.fillStyle = d[i] + d[i + 1] + d[i + 2] > 690 ? '#8a5a30' : '#3a1e12';
        g.fillRect(x, y, 1, 1);
      }
      return c;
    });
  }
  // 画屋里的人：g 的原点对着院子原生坐标 (ox, oy)；who = { forge: 帧, window: 帧 }（scene 尺寸 56×56，身子中心 (28, 34)，脚底 46）
  // time 用来让窗后的人踱步 / 打盹时点头。门口台阶上的人由调用方自己画（他在屋外，画在雨丝前面）
  function inside(g, wk, who, time, ox = 0, oy = 0) {
    const t = th(wk), [dx0, , dx1, dy1] = L.door, [wx0, wy0, wx1, wy1] = L.window;
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(ox + x), Math.round(oy + y), w, h); };
    if (who.forge) {
      g.save(); g.beginPath(); g.rect(ox + dx0, oy + 150, dx1 - dx0, dy1 - 150 - 1); g.clip();
      const [ax, ay] = SPOT.anvil;   // 屋里的铁砧（逆光）：木墩 + 砧身，砧面描一道火光
      R(ax + 4, ay + 2, 10, 9, t.wood[3]); R(ax, ay - 3, 20, 5, t.iron[2]); R(ax - 4, ay - 3, 5, 3, t.iron[2]); R(ax + 5, ay + 1, 9, 2, t.iron[2]); R(ax - 4, ay - 3, 24, 1, '#ffb050');
      g.drawImage(backlit(who.forge), Math.round(ox + SPOT.forge.x - 28), Math.round(oy + SPOT.forge.feet - 46));
      g.restore();
    }
    if (who.window) {
      const gx = wx0 + 2, gy = wy0 + 2, gw = wx1 - wx0 - 4, gh = wy1 - wy0 - 4, mx = (wx0 + wx1) / 2, my = (wy0 + wy1) / 2;
      const walk = who.windowPace ? Math.round(Math.sin(time * 0.5) * 9) : 0, bob = who.windowPace ? 0 : Math.floor(time * 0.7) % 2;
      g.save(); g.beginPath(); g.rect(ox + gx, oy + gy, gw, gh); g.clip();
      g.drawImage(silhouette(who.window), Math.round(ox + SPOT.window.x - 28 + walk), Math.round(oy + SPOT.window.y - 34 + bob));
      g.restore();
      R(mx - 1, gy, 2, gh, t.wood[3]); R(gx, my - 1, gw, 2, t.wood[3]);   // 窗棂压在剪影前面
    }
  }
  return { base, layer, yardWall, fx, shadow, carShadow, hero, lift, weather, indoor, inside, SPOT, HERO_PAD, W, H, BASE, FEET, HOR, L, ORDER, NAME, theme: th };
})();
