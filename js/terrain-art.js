// 地形美术：土坡（矿渣堆）、泥地、货箱、碎木的像素画法。战斗（battle.js）和 tools/terrain-lab.html 共用
// 规则同 docs/art-direction.md §9：只有 1px 一种像素、左上 45° 打光、外轮廓 1px 取材质最暗阶（不用纯黑）、
// 不做抗锯齿、不做运行时旋转；细节密度每 4×4 最多 1 个；场景只用中低明度（背景色 bg + 木色 leather），不抢载具
window.SA = window.SA || {};

SA.TerrainArt = (() => {
  const P = SA.PAL, B = P.bg, L = P.leather;
  // 确定性的伪随机：同一个坐标每次画出来都一样
  // 4×4 有序抖动（Bayer）：两种颜色之间按比例渐变，不出现色带和接缝
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // 静态层：土坡 + 泥地，按世界坐标画（W × H，只画一次）。ground[x] = 这一列的地面高度，GROUND = 平地高度
  function layer(ground, mud, W, H, GROUND) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const top = (x) => Math.round(ground[Math.max(0, Math.min(W, x))]);

    // ---- 土坡：矿渣堆 ----
    // 表层：1px 描边（最暗阶）→ 1px 受光边 → 亮层 → 抖动过渡 → 深层；顺着坡面每隔 7px 一道抖动的地层线
    // 朝左上的坡（往右升高）和坡顶受光，朝右下的坡背光暗一阶；受光判断用平滑地面 ±3 列的坡度，避免缓坡上一列亮一列暗
    const gy = (x) => ground[Math.max(0, Math.min(W, x))];
    for (let x = 0; x < W; x++) {
      const t = top(x);
      if (t >= GROUND) continue;
      const sl = gy(x + 3) - gy(x - 3);   // < 0：往右升高（朝左上，受光）；> 0：往右降低（背光）
      const LIT = [B[6], B[5], B[4], B[3], B[2]], SHADE = [B[5], B[4], B[3], B[2], B[1]];
      for (let y = t; y < GROUND; y++) {
        // 受光 → 背光按坡度渐变（坡顶附近用有序抖动过渡），不留一条竖着的接缝
        const k = Math.max(0, Math.min(1, (sl + 0.3) / 1.2));
        const ramp = bayer(x, y) < k ? SHADE : LIT;
        const d = y - t;
        let col = d === 0 ? ramp[0] : d === 1 ? ramp[1] : d < 5 ? ramp[2] : d < 9 ? ((x + y) & 1 ? ramp[2] : ramp[3]) : ramp[3];
        if (d > 6 && (d - 2) % 7 === 0 && (x & 1)) col = ramp[4];   // 地层线：跟着坡面起伏的一道虚线
        if (GROUND - y <= 2) col = B[2];          // 和平地接缝处压暗，像是埋进地里
        px(x, y, col);
      }
      // 外轮廓：头顶 1px；陡的台阶把侧面露出来的那几格也描上
      px(x, t - 1, B[1]);
      for (const n of [x - 1, x + 1]) { const tn = top(n); if (tn > t + 1) px(n, t, B[1], 1, Math.min(tn, GROUND) - t - 1); }
    }
    // 渣堆里嵌的石子和煤块：按 4×4 网格撒，一格最多一个
    for (let gx = 0; gx < W; gx += 4)
      for (let gy = 0; gy < GROUND; gy += 4) {
        const t = top(gx + 1);
        if (gy - t < 4 || gy + 3 >= GROUND - 2) continue;
        const r = hash(gx >> 2, gy >> 2);
        const ox = Math.floor(hash(gx, gy + 3) * 2), oy = Math.floor(hash(gx + 5, gy) * 2);   // 在自己的 4×4 格里错开一点，别排成点阵
        const qx = gx + ox, qy = gy + oy;
        if (r < 0.07) { px(qx, qy, B[5], 2, 1); px(qx, qy + 1, B[4], 2, 1); px(qx + 2, qy + 1, B[1]); px(qx + 1, qy + 2, B[1], 2, 1); }   // 石子：亮面在左上，影子在右下
        else if (r < 0.1) { px(qx, qy, P.dark[1], 2, 2); px(qx, qy, P.dark[3]); }                                  // 煤块
      }

    // ---- 泥地：一滩湿泥，微微鼓出地面 ----
    // 泥唇（受光亮边）→ 湿亮的表面带反光条纹 → 深色泥身往地下渗；两头 1px 台阶收窄，外轮廓用最暗阶
    for (const [a, b] of mud) {
      for (let x = Math.floor(a); x < b; x++) {
        const e = Math.min(x - a, b - 1 - x);
        const bump = e < 5 ? 0 : e < 14 ? 1 : 2;               // 鼓出地面的高度：两头贴平，中间最多 2px
        const s = top(x) - bump;
        const depth = Math.min(9, 3 + Math.floor(e / 3));     // 往地下渗的深度
        px(x, s - 1, B[0]);                                   // 外轮廓
        px(x, s, L[2]);                                       // 泥唇：受光的一道亮边
        for (let y = s + 1; y < top(x) + depth; y++) {
          const d = y - s;
          px(x, y, d < 3 ? L[1] : bayer(x, y) < (d - 3) / 6 ? B[1] : L[0]);   // 表面湿亮，越往下越暗
        }
        px(x, top(x) + depth, B[0]);                          // 底边描边
        const r = hash(x >> 3, 5);
        if (r < 0.5 && (x & 7) < 4 && e > 5) px(x, s + 1, P.steam[0]);          // 反光条纹：一段段的
        if (hash(x, 9) < 0.03 && e > 4) px(x, s + 1, P.steam[2]);               // 高光点
      }
      // 两头往外溅出来的几点泥
      for (const [ex, dir] of [[a, -1], [b, 1]])
        for (let i = 0; i < 4; i++) {
          const sx = Math.round(ex + dir * (3 + i * 4 + hash(i, ex) * 3)), sy = top(sx) - 1 - (i & 1);
          px(sx, sy, L[1], 2, 1); px(sx, sy + 1, B[0], 2, 1);
        }
    }
    return c;
  }

  // 货箱：木板 + 浅色边框 + 斜撑 + 铁包角，受损越重裂得越厉害。f = 剩余耐久比例，dx = 挨打 / 被推时的抖动
  function crate(g, x, y, w, h, f, dx = 0) {
    x = Math.round(x + dx); y = Math.round(y);
    const R = (a, b, ww, hh, col) => { g.fillStyle = col; g.fillRect(x + a, y + b, ww, hh); };
    R(0, 0, w, h, L[0]);                                   // 外轮廓（木头的最暗阶）
    R(1, 1, w - 2, h - 2, L[1]);                           // 木板
    for (let yy = 12; yy < h - 3; yy += 12) { R(4, yy, w - 8, 1, L[0]); R(4, yy + 1, w - 8, 1, '#7f5231'); }   // 板缝 + 下一块板的受光边
    R(1, 1, w - 2, 3, L[2]); R(1, 1, 3, h - 2, L[2]);      // 边框：左、上受光
    R(1, h - 4, w - 2, 3, '#55331f'); R(w - 4, 1, 3, h - 2, '#55331f');   // 边框：右、下背光
    R(4, 4, w - 8, 1, L[0]); R(4, 4, 1, h - 8, L[0]);      // 边框内侧的阴影线
    // 斜撑：2px 粗的像素台阶，下面垫 1px 影子
    const n = w - 9;
    for (let i = 0; i <= n; i++) {
      const bx = 4 + i, by = h - 6 - Math.round(i * (h - 11) / n);
      R(bx, by, 1, 2, L[2]); R(bx, by + 2, 1, 1, L[0]);
    }
    // 铁包角：左上高光、右下暗
    for (const [cx, cy] of [[0, 0], [w - 6, 0], [0, h - 6], [w - 6, h - 6]]) {
      R(cx, cy, 6, 6, P.iron[1]); R(cx + 1, cy + 1, 4, 4, P.iron[2]); R(cx + 1, cy + 1, 1, 1, P.iron[4]); R(cx + 4, cy + 4, 1, 1, P.iron[0]);
    }
    // 受损：裂纹（1px 最暗阶），重伤再敲掉一块露出里面
    if (f < 0.66) for (let i = 0; i < 6; i++) R(Math.round(w * 0.35) + i, Math.round(h * 0.2) + (i >> 1) + i, 1, 1, L[0]);
    if (f < 0.33) { R(Math.round(w * 0.55), Math.round(h * 0.45), 9, 7, B[1]); R(Math.round(w * 0.55), Math.round(h * 0.45), 9, 1, L[0]); for (let i = 0; i < 5; i++) R(Math.round(w * 0.2) + i, Math.round(h * 0.7) - i, 1, 1, L[0]); }
  }

  // 碎木：几块木板横七竖八躺在地上（带 1px 轮廓和受光顶边），几颗钉子
  function rubble(g, x0, x1, gy) {
    const pieces = [[0, 0, 16], [12, -3, 12], [24, 0, 18], [x1 - x0 - 16, -1, 14]];
    for (const [ox, oy, len] of pieces) {
      const x = Math.round(x0 + ox), y = Math.round(gy - 4 + oy);
      g.fillStyle = L[0]; g.fillRect(x - 1, y - 1, len + 2, 5);
      g.fillStyle = L[1]; g.fillRect(x, y, len, 3);
      g.fillStyle = L[2]; g.fillRect(x, y, len, 1);
      g.fillStyle = P.iron[3]; g.fillRect(x + 2, y + 1, 1, 1);
    }
  }

  return { layer, crate, rubble };
})();
