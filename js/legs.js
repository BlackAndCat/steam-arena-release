// 腿部套件：游戏里的双足 / 四足底盘（sprites.js 的 biped / quad）和样机页（biped-lab、biped-v2、mech-kit）共用。
// 双足：六档腿型 + 探索版（DESIGNS），游戏按外观阶段选用；四足：蜘蛛腿（spiderLeg + carapace，SPIDERS 是各型号的腿形参数）。
// 每个设计都在 48 单位的格子坐标里描述，由一个小光栅器按任意像素密度画出来（1× = 48px 原生，2× = 96px 精细）：
// 形状先写进遮罩，再统一按「描边 / 暗面 / 固有色 / 亮面」四阶上色（光源左上），两种密度共用同一份造型代码，
// 只有标了 pn.hi 的细节（刻线、铆钉、齿纹）在 2× 才画。
window.SA = window.SA || {};

SA.LEGLAB = (() => {
  const P = SA.PAL, TAU = Math.PI * 2;

  // ---------- 颜色 → RGBA32 ----------
  const U32 = new Map();
  const col = (hex) => {
    let v = U32.get(hex);
    if (v === undefined) {
      const n = parseInt(hex.slice(1), 16);
      v = ((0xff << 24) | ((n & 0xff) << 16) | (((n >> 8) & 0xff) << 8) | (n >> 16)) >>> 0;
      U32.set(hex, v);
    }
    return v;
  };

  // ---------- 光栅器：画进自己的像素缓冲，flush() 时贴到目标画布 ----------
  function Pen(W, H) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx2 = cv.getContext('2d'), img = cx2.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const m = new Uint8Array(W * H);
    let s = 1, ox = 0, oy = 0, bx0 = W, by0 = H, bx1 = -1, by1 = -1;
    const PX = (u) => (u + ox) * s, PY = (u) => (u + oy) * s;
    const has = (i, j) => i >= 0 && j >= 0 && i < W && j < H && m[j * W + i] === 1;
    const put = (i, j, c) => { if (i >= 0 && j >= 0 && i < W && j < H) buf[j * W + i] = c; };
    function area(ux0, uy0, ux1, uy1, test) {
      const i0 = Math.max(0, Math.floor(PX(ux0)) - 1), i1 = Math.min(W - 1, Math.ceil(PX(ux1)) + 1);
      const j0 = Math.max(0, Math.floor(PY(uy0)) - 1), j1 = Math.min(H - 1, Math.ceil(PY(uy1)) + 1);
      for (let j = j0; j <= j1; j++) {
        const uy = (j + 0.5) / s - oy;
        for (let i = i0; i <= i1; i++) {
          if (!test((i + 0.5) / s - ox, uy)) continue;
          m[j * W + i] = 1;
          if (i < bx0) bx0 = i; if (i > bx1) bx1 = i; if (j < by0) by0 = j; if (j > by1) by1 = j;
        }
      }
    }
    const pen = {
      get s() { return s; }, get hi() { return s >= 2; },
      at(scale, ux, uy) { s = scale; ox = ux; oy = uy; return pen; },
      // 以 (ux, uy) 为支点整体放大 k 倍画（像素大小不变，形状用更多像素）；返回还原函数
      around(k, ux, uy) {
        const s0 = s, ox0 = ox, oy0 = oy;
        s = s0 * k; ox = (ux + ox0) / k - ux; oy = (uy + oy0) / k - uy;
        return () => { s = s0; ox = ox0; oy = oy0; };
      },
      disc(cx, cy, r) { area(cx - r, cy - r, cx + r, cy + r, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r); return pen; },
      rect(x, y, w, h) { area(x, y, x + w, y + h, (u, v) => u >= x && u < x + w && v >= y && v < y + h); return pen; },
      cap(ax, ay, bx, by, r) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        area(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, (x, y) => {
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
          return (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2 <= r * r;
        });
        return pen;
      },
      poly(pts) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        area(x0, y0, x1, y1, (x, y) => {
          let inside = false;
          for (let k = 0, n = pts.length, l = n - 1; k < n; l = k++) {
            const [xi, yi] = pts[k], [xj, yj] = pts[l];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
          }
          return inside;
        });
        return pen;
      },
      // 上色：ramp = [描边, 暗面, 固有色, 亮面]；bevel 'l' 只画亮边 / 's' 只画暗边 / '' 平涂；clip = [ux0, ux1] 横向裁切
      paint(ramp, o = {}) {
        if (bx1 < 0) return pen;
        const ol = o.outline !== false, bev = o.bevel === undefined ? 'ls' : o.bevel, bw = o.bw || 1;
        const c = ramp.map(col);
        const ci0 = o.clip ? Math.round(PX(o.clip[0])) : -1e9, ci1 = o.clip ? Math.round(PX(o.clip[1])) : 1e9;
        const i0 = Math.max(0, bx0 - 1, ci0), i1 = Math.min(W - 1, bx1 + 1, ci1 - 1), j0 = Math.max(0, by0 - 1), j1 = Math.min(H - 1, by1 + 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          if (!has(i, j)) {
            if (ol && (has(i - 1, j) || has(i + 1, j) || has(i, j - 1) || has(i, j + 1) ||
              has(i - 1, j - 1) || has(i + 1, j - 1) || has(i - 1, j + 1) || has(i + 1, j + 1))) buf[j * W + i] = c[0];
            continue;
          }
          let k = 1, v = c[2];
          for (; k <= bw; k++) {
            if (bev.includes('l') && (!has(i - k, j) || !has(i, j - k))) { v = c[3]; break; }
            if (bev.includes('s') && (!has(i + k, j) || !has(i, j + k))) { v = c[1]; break; }
          }
          buf[j * W + i] = v;
        }
        for (let j = by0; j <= by1; j++) m.fill(0, j * W + bx0, j * W + bx1 + 1);
        bx0 = W; by0 = H; bx1 = by1 = -1;
        return pen;
      },
      // 直接画（不进遮罩）：矩形（单位坐标）、单个物理像素、物理 1px 细线
      fill(x, y, w, h, c) {
        const v = col(c), i0 = Math.round(PX(x)), i1 = Math.round(PX(x + w)), j0 = Math.round(PY(y)), j1 = Math.round(PY(y + h));
        for (let j = Math.max(0, j0); j < Math.min(H, j1); j++) for (let i = Math.max(0, i0); i < Math.min(W, i1); i++) buf[j * W + i] = v;
        return pen;
      },
      dot(x, y, c) { put(Math.floor(PX(x)), Math.floor(PY(y)), col(c)); return pen; },
      ln(ax, ay, bx, by, c, w = 1) {
        const v = col(c), x0 = PX(ax), y0 = PY(ay), x1 = PX(bx), y1 = PY(by), o = Math.floor(w / 2);
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let k = 0; k <= n; k++) {
          const i = Math.floor(x0 + (x1 - x0) * k / n) - o, j = Math.floor(y0 + (y1 - y0) * k / n) - o;
          for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) put(i + a, j + b, v);
        }
        return pen;
      },
      // 把缓冲贴到目标画布并清空（画别的东西——比如车体——之前先 flush）
      flush(g) {
        cx2.putImageData(img, 0, 0);
        g.drawImage(cv, 0, 0);
        buf.fill(0);
        return pen;
      },
      blit(g, image, ux, uy) {
        g.imageSmoothingEnabled = false;
        g.drawImage(image, Math.round(PX(ux)), Math.round(PY(uy)), image.width * s, image.height * s);
      },
    };
    return pen;
  }

  // ---------- 几何 ----------
  // 骨骼坐标系：a 沿骨骼方向，f 朝「前」（骨骼朝下时 f>0 = +x = 车头方向）
  const bone = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const p = (a, f) => [ax + ux * a + uy * f, ay + uy * a - ux * f];
    return { len, p, pts: (arr) => arr.map(([a, f]) => p(a, f)), ang: Math.atan2(dy, dx) };
  };
  // 局部坐标系：u 向前，v 向下，整体转 ang（顺时针为正：脚尖朝下）
  const frame = (x, y, ang) => {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const p = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
    return { p, pts: (arr) => arr.map(([u, v]) => p(u, v)) };
  };
  // 两段 IK：kd = 1 膝盖朝前（人形），-1 膝盖朝后（反关节）。返回膝和实际够到的踝
  function ik(hx, hy, fx, fy, L1, L2, kd) {
    const dx = fx - hx, dy = fy - hy, d = Math.max(1, Math.min(Math.hypot(dx, dy), L1 + L2 - 0.01));
    const t = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const ang = Math.atan2(dy, dx) - kd * t;
    const kx = hx + Math.cos(ang) * L1, ky = hy + Math.sin(ang) * L1;
    const ex = fx - kx, ey = fy - ky, el = Math.hypot(ex, ey) || 1;
    return [kx, ky, kx + ex / el * L2, ky + ey / el * L2];
  }
  // 步态：S 步幅、H 抬脚高度。着地时脚往后蹬，抬起时往前摆；抬脚前半程脚尖朝下，后半程脚尖翘起
  function gait(o, ph, S, H) {
    if (!o.mv) return { x: 0, lift: 0, tilt: 0, sn: 0, c: 1 };
    if (o.plant) return plantGait(o, ph, o.plantS != null ? o.plantS : S, o.plantH != null ? o.plantH : H);
    const a = o.a + ph, c = Math.cos(a), sn = Math.sin(a);
    return { x: -S * c, lift: Math.max(0, sn) * H, tilt: 0.35 * Math.max(0, sn) * c, sn, c };
  }
  // 踩实地的步态（新版整件底盘用，o.plant）：前半个周期抬脚往前摆（先快后慢），后半个周期着地、脚相对车身匀速往后蹬。
  // 脚在胯前后 ±S 之间摆。步态周期要等于车走 4S（着地那半个周期车走 2S = 脚往后蹬的距离），脚才钉在地上不打滑：
  // 调用方按车走的距离推进步态角 a += 2π × 距离 / (4S)（腿放大画的，S 要按放大倍数折算）
  function plantGait(o, ph, S, H) {
    const u = ((((o.a + ph) / TAU) % 1) + 1) % 1;
    if (u < 0.5) {
      const w = u * 2, e = w * w * (3 - 2 * w), sn = Math.sin(Math.PI * w), c = Math.cos(Math.PI * w);
      return { x: -S + 2 * S * e, lift: sn * H, tilt: 0.35 * sn * c, sn, c };
    }
    const w = (u - 0.5) * 2;
    return { x: S - 2 * S * w, lift: 0, tilt: 0, sn: -Math.sin(Math.PI * w), c: -Math.cos(Math.PI * w) };
  }
  const yAt = (pts, u) => {
    for (let k = 1; k < pts.length; k++) if (u <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      return y0 + (y1 - y0) * (u - x0) / (x1 - x0 || 1);
    }
    return pts[pts.length - 1][1];
  };

  // ---------- 材质：近侧 / 远侧（远侧整体压暗一阶、描边用黑） ----------
  const NEAR = {
    dark: [P.dark[0], P.dark[1], P.dark[2], P.dark[3]],
    leg: [P.dark[0], P.dark[2], P.dark[3], P.iron[2]],
    iron: [P.iron[0], P.iron[1], P.iron[2], P.iron[3]],
    steel: [P.iron[0], P.iron[2], P.iron[3], P.iron[4]],
    brass: [P.brass[0], P.brass[1], P.brass[2], P.brass[3]],
    fire: [P.fire[0], P.fire[1], P.fire[2], P.fire[3]],
    leather: [P.black, P.leather[0], P.leather[1], P.leather[2]],
    steam: [P.dark[0], P.steam[0], P.steam[1], P.steam[2]],
    gauge: [P.gauge[0], P.gauge[0], P.gauge[1], P.gauge[2]],
  };
  const FAR = {};
  for (const k in NEAR) FAR[k] = [P.black, NEAR[k][0], NEAR[k][1], NEAR[k][2]];
  FAR.fire = [P.black, P.fire[0], P.fire[1], P.fire[2]];
  const flat = (c) => [c, c, c, c];

  // ---------- 通用零件 ----------
  function rivet(pn, x, y) {
    if (pn.hi) { pn.disc(x + 1, y + 1, 0.95).paint([P.iron[0], P.iron[2], P.iron[3], P.iron[4]], { outline: false }); pn.dot(x + 1.6, y + 1.6, P.iron[0]); return; }
    pn.fill(x, y, 2, 2, P.iron[4]).fill(x + 1, y + 1, 1, 1, P.iron[2]).fill(x + 2, y + 1, 1, 1, P.iron[0]).fill(x + 1, y + 2, 1, 1, P.iron[0]);
  }
  // 底盘顶部的车体底板：和上方模块的框架同色相接，没有模块压着时才描顶边（同 sprites.js）
  function floor(pn, x, y, o) {
    pn.fill(x, y, 48, 4, P.iron[1]);
    if (!o.top) { pn.fill(x, y, 48, 1, P.iron[0]); pn.fill(x, y + 1, 48, 1, P.iron[3]); }
    for (let rx = 4; rx < 48; rx += 8) pn.fill(x + rx, y + 2, 1, 1, P.iron[3]);
    pn.fill(x, y + 3, 48, 1, P.iron[0]);
  }
  // 横梁：相邻同类格子连成一根（越过格子边界再裁掉，接缝处没有描边）
  function beamBox(pn, x, y, o, ramp, top, h) {
    const x0 = o.connL ? x - 4 : x + 3, x1 = o.connR ? x + 52 : x + 45;
    pn.rect(x0, y + top, x1 - x0, h).paint(ramp, { clip: [x, x + 48] });
    return [Math.max(x0, x), Math.min(x1, x + 48)];
  }
  function gear(pn, cx, cy, r, n, rot, ramp, hub) {
    pn.disc(cx, cy, r - 0.9);
    const w = Math.PI / n * 0.5;
    for (let k = 0; k < n; k++) {
      const a = rot + k / n * TAU, at = (aa, rr) => [cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr];
      pn.poly([at(a - w * 1.2, r - 1.2), at(a - w * 0.8, r + 0.9), at(a + w * 0.8, r + 0.9), at(a + w * 1.2, r - 1.2)]);
    }
    pn.paint(ramp);
    if (hub) pn.disc(cx, cy, Math.max(0.9, r * 0.38)).paint(hub, { outline: false });
    if (pn.hi && r > 3.5) for (let k = 0; k < 4; k++) {
      const a = rot + k / 4 * TAU + 0.4;
      pn.ln(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * (r - 1.4), cy + Math.sin(a) * (r - 1.4), ramp[1]);
    }
  }
  function spring(pn, ax, ay, bx, by, turns, amp, M) {
    const B = bone(ax, ay, bx, by), n = turns * 2;
    let prev = B.p(0, 0);
    for (let k = 1; k <= n; k++) {
      const pt = B.p(B.len * k / (n + 1), k % 2 ? amp : -amp);
      pn.cap(prev[0], prev[1], pt[0], pt[1], 0.5); prev = pt;
    }
    const e = B.p(B.len, 0); pn.cap(prev[0], prev[1], e[0], e[1], 0.5);
    pn.paint(M.steam, { bevel: 'l' });
  }

  // ---------- 设计 ----------
  // 每个设计：leg(pn, L, ph, o) 画一条腿（近侧 / 远侧共用，材质取 L.M）；beam(pn, x, y, o) 画横梁（只在近侧层）；
  // mid(pn, L, o) 画在横梁之后、近侧腿之前（夹在两腿之间的东西）；over(pn, L, ph, o) 画在腿之后（挂在胯上的甲片）。
  // L = { far, M, hx, hy（胯）, gy（地面）, x, y（格子左上，已含起伏） }

  // T1 · 工装 Mk.II：箱形梁大腿 + 跨膝液压撑杆（缸体铰在大腿、活塞杆铰在小腿） + 双支杆小腿 + 带肋平脚（反关节）
  const MK2 = {
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 2 + g.x, L.gy - 4.5 - g.lift, 15, 16, -1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      // 平脚 + 踝座
      pn.poly(F.pts([[-6, 1.4], [7, 1.4], [10, 4.5], [-7, 4.5]])).poly(F.pts([[-2.4, -1.6], [2.4, -1.6], [2.4, 1.8], [-2.4, 1.8]])).paint(M.leg);
      if (pn.hi) for (const u of [-4, -1, 2, 5]) pn.ln(...F.p(u, 2.2), ...F.p(u + 0.8, 4), M.leg[1]);
      // 小腿：双支杆 + 斜撑
      pn.cap(...S.p(0, 1.8), ...S.p(S.len, 1.1), 1.1).cap(...S.p(0, -1.8), ...S.p(S.len, -1.1), 1.1).paint(M.leg, { bevel: 'l' });
      pn.ln(...S.p(2.5, 1.8), ...S.p(S.len - 3, -1.2), M.leg[pn.hi ? 3 : 2], pn.hi ? 2 : 1);
      pn.disc(ex, ey, 2).paint(M.iron);
      // 大腿：箱形梁 + 减重孔
      pn.cap(L.hx, L.hy, kx, ky, 3.2).paint(M.leg);
      for (const t of pn.hi ? [0.36, 0.66] : [0.5]) { const [px, py] = T.p(T.len * t, 0); pn.disc(px, py, pn.hi ? 1.2 : 0.6).paint(flat(M.dark[0]), { outline: false, bevel: '' }); }
      // 液压撑杆：一根笔直的缸 + 杆，从大腿上段前缘的托耳直接撑到小腿中段前缘的托耳（托耳只有半个单位高，缸杆贴着腿）。
      // 膝盖朝后的反关节腿，膝弯的前面是「内角」，撑杆跨在内角上：腿一弯它就被压短，撑杆一伸腿就被顶直，承重靠它
      const ta = T.len * 0.14, sa = S.len * 0.82, tp = T.p(ta, 4.6), sp = S.p(sa, 3.4);
      const rm = [tp[0] + (sp[0] - tp[0]) * 0.5, tp[1] + (sp[1] - tp[1]) * 0.5];
      pn.poly([T.p(ta - 1.8, 3), T.p(ta + 1.8, 3), tp]).poly([S.p(sa - 1.6, 2.6), S.p(sa + 1.6, 2.6), sp]).paint(M.iron, { bevel: '' });
      pn.cap(...sp, ...rm, 0.9).paint(M.steam, { bevel: 'l' });
      pn.cap(...tp, ...rm, 2.1).paint(M.iron, { bevel: 'l' });
      pn.cap(rm[0], rm[1], rm[0], rm[1], 2.4).paint(M.brass, { outline: false });
      pn.disc(tp[0], tp[1], 1.2).paint(M.brass, { bevel: 'l' }); pn.disc(sp[0], sp[1], 1).paint(M.brass, { bevel: 'l' });
      pn.disc(kx, ky, 3.3).paint(M.iron); pn.dot(kx - 1, ky - 1, M.iron[3]);
      pn.disc(L.hx, L.hy, 3.3).paint(M.iron); pn.disc(L.hx, L.hy, 1.2).paint(M.brass, { outline: false });
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.dark, 4, 11);
      pn.fill(a, y + 7, b - a, 1, P.dark[3]);
      if (pn.hi) for (let k = a + 5; k < b - 3; k += 6) pn.fill(k, y + 9, 3, 3, P.dark[1]);
      rivet(pn, x + 9, y + 8); rivet(pn, x + 37, y + 8);
    },
  };

  // T2 · 鹭步：三段鸟腿（膝盖朝前、跗关节高高翘在后），黄铜关节毂 + 膝后弹簧 + 三趾爪
  const HERON = {
    toe(pn, F, du, dv, ramp, M) {
      pn.poly(F.pts([[du - 0.5, dv - 1.4], [du + 4, dv - 1], [du + 7.5, dv + 0.6], [du + 9, dv + 2.3], [du + 6.5, dv + 1.7], [du + 3, dv + 1.7], [du - 0.5, dv + 1.4]])).paint(ramp);
      pn.dot(...F.p(du + 8.3, dv + 1.9), M.brass[3]);
    },
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 8, 6);
      const tx = L.hx + 5 + g.x, ty = L.gy - 2.2 - g.lift, F = frame(tx, ty, g.tilt);
      const [hax, hay] = F.p(-4.5, -10);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, hax, hay, 12, 14, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey);
      HERON.toe(pn, F, -1.4, -0.9, M.dark, M);
      spring(pn, ...T.p(T.len * 0.35, -2.8), ...S.p(S.len * 0.45, -1.6), 3, 1.2, M);
      pn.poly(F.pts([[0, -0.5], [-4.6, 1.3], [-4.2, 2.3], [0.6, 1.3]])).paint(M.leg);   // 后趾
      pn.cap(ex, ey, tx, ty, 1.5).paint(M.leg);                                          // 跗骨
      pn.cap(...S.p(0, 1.1), ...S.p(S.len, 0.8), 1).cap(...S.p(0, -1.2), ...S.p(S.len, -0.8), 0.9).paint(M.leg, { bevel: 'l' });
      pn.poly(T.pts([[-3, -3.2], [-3.5, 3], [T.len * 0.5, 4.2], [T.len + 1, 2], [T.len + 1, -2]])).paint(M.iron);
      pn.ln(...T.p(-1, 2.6), ...T.p(T.len - 1, 1.4), M.brass[2], pn.hi ? 2 : 1);
      if (pn.hi) pn.ln(...T.p(0, -1.6), ...T.p(T.len - 1, -1), M.iron[1]);
      HERON.toe(pn, F, 0, 0, M.leg, M);
      pn.disc(ex, ey, 2.1).paint(M.brass);
      pn.disc(kx, ky, 2.8).paint(M.brass); pn.dot(kx, ky, M.brass[0]);
      pn.disc(L.hx, L.hy, 3).paint(M.brass); pn.dot(L.hx, L.hy, M.brass[0]);
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.iron, 4, 9);
      pn.fill(a, y + 8, b - a, 1, P.brass[2]);
      rivet(pn, x + 24, y + 6); rivet(pn, x + 40, y + 6);
    },
  };

  // T3 · 掷弹兵：人形正膝，铆接圆筒大腿 + 喇叭口护胫 + 平头重靴；膝盖是一块压力表，膝后一根蒸汽活塞
  const GREN = {
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 4.5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + g.x, L.gy - 7 - g.lift, 14, 14.5, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt * 0.6);
      // 膝后活塞
      const p0 = T.p(T.len * 0.3, -4.2), p1 = S.p(S.len * 0.55, -4.2), pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      pn.cap(...pm, ...p1, 0.8).paint(M.steam, { bevel: 'l' });
      pn.cap(...p0, ...pm, 1.8).paint(M.dark);
      // 靴：平头、厚底、黄铜扣
      pn.poly(F.pts([[-5.5, -1], [3.5, -1], [4.5, 2.5], [9.5, 4], [11, 5.6], [10.6, 7], [-6, 7], [-6, 0]])).paint(M.leg);
      pn.poly(F.pts([[-6, 5.7], [10.9, 5.7], [10.6, 7], [-6, 7]])).paint(M.dark, { outline: false, bevel: '' });
      if (pn.hi) for (let u = -5; u < 10; u += 2) pn.dot(...F.p(u, 6.3), M.leg[3]);
      pn.poly(F.pts([[-1.5, 0.8], [1.5, 0.8], [1.5, 2.8], [-1.5, 2.8]])).paint(M.brass, { bevel: 'l' });
      // 护胫：往下张开的喇叭口
      pn.poly(S.pts([[-1, -3.4], [-1, 3.6], [S.len - 1, 4.8], [S.len + 1.5, 5], [S.len + 1.5, -4.6], [S.len - 1, -4.4]])).paint(M.iron);
      if (pn.hi) for (let a = 2; a < S.len; a += 3) { pn.dot(...S.p(a, 2.8), P.iron[4]); pn.dot(...S.p(a, -2.8), M.iron[1]); }
      else pn.ln(...S.p(1, 2.4), ...S.p(S.len - 1, 3.2), M.iron[3]);
      // 大腿：铆接圆筒 + 两道黄铜箍
      pn.cap(L.hx, L.hy, kx, ky, 4.6).paint(M.iron);
      for (const t of [0.3, 0.72]) { const a = T.len * t; pn.poly(T.pts([[a - 0.9, -4.7], [a + 0.9, -4.7], [a + 0.9, 4.7], [a - 0.9, 4.7]])).paint(M.brass, { outline: false }); }
      if (pn.hi) for (const a of [T.len * 0.12, T.len * 0.51, T.len * 0.9]) pn.dot(...T.p(a, 2.6), P.iron[4]);
      // 膝：压力表
      pn.disc(kx, ky, 4.4).paint(M.brass);
      pn.disc(kx, ky, 2.9).paint([M.dark[0], M.steam[1], M.steam[2], M.steam[3]], { outline: false, bevel: 's' });
      if (pn.hi) for (let k = 0; k < 5; k++) { const a = Math.PI * (0.9 + k * 0.3); pn.dot(kx + Math.cos(a) * 2.3, ky + Math.sin(a) * 2.3, k > 3 ? M.fire[2] : M.gauge[2]); }
      const na = -Math.PI * (o.mv ? 0.2 : 0.8);
      pn.ln(kx, ky, kx + Math.cos(na) * 2.4, ky + Math.sin(na) * 2.4, M.dark[0]);
      // 胯
      pn.disc(L.hx, L.hy, 4.8).paint(M.iron); pn.disc(L.hx, L.hy, 1.8).paint(M.dark, { outline: false });
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.iron, 4, 12);
      pn.fill(a, y + 12, b - a, 1, P.brass[2]); pn.fill(a, y + 13, b - a, 1, P.brass[1]);
      for (const rx of [5, 24, 40]) rivet(pn, x + rx, y + 7);
    },
  };

  // T4 · 蒸汽圣骑：哥特板甲。大腿甲 / 带扇形侧翼的护膝 / 护胫 / 分节尖头铁靴 + 马刺；横梁做成腰甲，胯上挂草摺
  const KNIGHT = {
    hipY: 13, bob: 2,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7.5, 5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4.5 - g.lift, 15.5, 15.5, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      L.T = T;
      // 铁靴：尖头、分节
      const top = [[-4.5, -1.5], [-1, -3], [3, -2], [8, 0.8], [14.5, 3.6]];
      pn.poly(F.pts([...top, [14, 4.5], [-4.5, 4.5]])).paint(M.steel);
      for (const u of pn.hi ? [0.5, 3, 5.5, 8.5] : [2, 6]) pn.ln(...F.p(u, yAt(top, u) + 0.6), ...F.p(u - 0.8, 4), M.steel[0]);
      // 马刺
      const [sx, sy] = F.p(-6.3, 1.4);
      pn.ln(...F.p(-4.5, 1.6), sx, sy, M.brass[1], Math.max(1, pn.s - 1));
      if (pn.hi) for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + (o.a || 0); pn.ln(sx, sy, sx + Math.cos(a) * 1.8, sy + Math.sin(a) * 1.8, M.brass[2]); }
      pn.disc(sx, sy, pn.hi ? 0.9 : 0.6).paint(M.brass, { bevel: 'l' });
      // 护胫
      pn.poly(S.pts([[-1, -3.2], [-1, 3.4], [S.len + 0.5, 2.6], [S.len + 0.5, -2.4], [S.len * 0.62, -3.4], [S.len * 0.32, -4.6]])).paint(M.steel);
      pn.ln(...S.p(1, 1.8), ...S.p(S.len - 1, 1.2), M.steel[3]);
      if (pn.hi) pn.ln(...S.p(1, 1.1), ...S.p(S.len - 1, 0.6), M.steel[1]);
      // 大腿甲
      pn.poly(T.pts([[-2, -4], [-2, 5.2], [T.len - 3, 4.4], [T.len - 0.5, 1], [T.len - 2.5, -3.2]])).paint(M.steel);
      pn.ln(...T.p(0, 2.2), ...T.p(T.len - 3, 1.8), M.steel[3]);
      if (pn.hi) { pn.ln(...T.p(0, 1.5), ...T.p(T.len - 3, 1.2), M.steel[1]); pn.ln(...T.p(1, -1.5), ...T.p(T.len - 4, -1.2), M.steel[1]); }
      // 护膝：黄铜扇形侧翼 + 钢护膝 + 前尖
      const wx = kx - 2.6, wy = ky + 0.3, nr = pn.hi ? 7 : 4;
      pn.disc(wx, wy, 5.4).poly([[wx - 1, wy - 5], [wx + 2.5, wy - 6.8], [wx + 3, wy - 3]]).paint(M.brass);
      for (let k = 0; k < nr; k++) { const a = Math.PI * (0.55 + k / (nr - 1) * 0.95); pn.ln(wx + Math.cos(a) * 1.4, wy + Math.sin(a) * 1.4, wx + Math.cos(a) * 4.6, wy + Math.sin(a) * 4.6, M.brass[1]); }
      pn.disc(kx + 0.6, ky, 2.9).poly([[kx + 2.2, ky - 1.5], [kx + 5.6, ky + 0.2], [kx + 2.2, ky + 1.6]]).paint(M.steel);
      pn.dot(kx - 0.2, ky - 1, M.steel[3]);
    },
    // 草摺：挂在胯上，跟着大腿转一半
    over(pn, L, ph, o) {
      const M = L.M, F = frame(L.hx, L.hy - 4, (L.T.ang - Math.PI / 2) * 0.55);
      pn.poly(F.pts([[-6, 0], [6.5, 0], [7.5, 7], [-5, 8]])).paint(M.steel);
      pn.poly(F.pts([[-5.2, 6.5], [7.4, 5.7], [7.7, 7.5], [-5, 8.5]])).paint(M.brass, { outline: false, bevel: 'l' });
      if (pn.hi) { pn.ln(...F.p(-5.5, 3.2), ...F.p(6.9, 3), M.steel[1]); pn.ln(...F.p(-5.5, 3.7), ...F.p(6.9, 3.5), M.steel[3]); }
      pn.dot(...F.p(-3.6, 1.4), M.steel[3]); pn.dot(...F.p(4.8, 1.4), M.steel[3]);
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.steel, 4, 10);
      pn.fill(a, y + 8, b - a, 1, P.iron[1]); pn.fill(a, y + 9, b - a, 1, P.iron[4]);
      pn.fill(a, y + 12, b - a, 1, P.brass[2]); pn.fill(a, y + 13, b - a, 1, P.brass[1]);
      for (const rx of [26, 42]) rivet(pn, x + rx, y + 5);
      // 纹章盾：隔一格一块
      if (o.ri % 2 === 0) {
        const cx = x + 34, cy = y + 9.2, sh = [[cx - 3.2, cy - 3.6], [cx + 3.2, cy - 3.6], [cx + 3.2, cy + 0.4], [cx, cy + 3.8], [cx - 3.2, cy + 0.4]];
        pn.poly(sh).paint([P.brass[0], P.brass[1], P.brass[2], P.brass[3]]);
        pn.poly([[cx - 2.2, cy - 2.6], [cx + 2.2, cy - 2.6], [cx + 2.2, cy + 0.2], [cx, cy + 2.6], [cx - 2.2, cy + 0.2]]).paint(flat(P.iron[1]), { outline: false });
        pn.fill(cx - 0.5, cy - 2.6, 1, 5, P.brass[3]); pn.fill(cx - 2.2, cy - 1.2, 4.4, 1, P.brass[3]);
      }
    },
  };

  // T5 · 钟表巨像：开框大腿里转着齿轮，膝盖是大齿轮，胫骨带棘轮齿；脚是一块宽脚板：脚跟一只发条盒、脚尖一枚小齿轮，鞋底是一排棘齿（防滑爪），踝上扣一只黄铜半球承窝
  const CLOCK = {
    hipY: 16,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 5);
      const ax = L.hx + 1.5 + g.x, ay = L.gy - 6.2 - g.lift;
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, ax, ay, 13, 13, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      // 鞋底棘齿（着地的那一排爪，脚落地时齿尖朝下嵌进地面）
      for (let u = -6; u < 10.5; u += 2.4) pn.poly(F.pts([[u, 5], [u + 2.4, 5], [u + 2.4, 6.2], [u, 6.2]]));
      pn.paint(M.dark, { outline: false, bevel: '' });
      // 脚板：脚跟厚、脚尖微翘，用亮一阶的钢色，顶上一根黄铜护条；脚尖一枚小齿轮半嵌在板里、随步子转
      pn.poly(F.pts([[-6, 1.6], [5.5, 1.2], [9.4, 2.6], [11.4, 4.2], [11.4, 5.2], [-6.4, 5.2], [-6.4, 2.6]])).paint(M.steel);
      pn.poly(F.pts([[-6.4, 4.2], [11.4, 4.2], [11.4, 5.2], [-6.4, 5.2]])).paint(M.dark, { outline: false, bevel: '' });
      pn.ln(...F.p(-5.6, 2.2), ...F.p(5.2, 1.8), M.brass[2], pn.hi ? 2 : 1);
      const tg = F.p(4.4, 3.4);
      gear(pn, tg[0], tg[1], 2.3, 7, (o.q || 0) / 2.3, M.brass, M.dark);
      // 胫：棘轮齿在后缘
      for (let a = 2; a < S.len - 2; a += pn.hi ? 2.2 : 3.2) pn.poly(S.pts([[a, -2], [a + 1.8, -2], [a + 1.8, -3.9]]));
      pn.paint(M.iron, { bevel: 'l' });
      pn.poly(S.pts([[0, -2.4], [0, 2.8], [S.len, 2.2], [S.len, -2]])).paint(M.iron);
      for (const a of [0.8, S.len - 1.4]) pn.poly(S.pts([[a - 0.8, -2.6], [a + 0.8, -2.6], [a + 0.8, 3], [a - 0.8, 3]])).paint(M.brass, { outline: false });
      // 踝：黄铜半球承窝扣在脚板上
      pn.poly(F.pts([[-3.4, 1.8], [3.8, 1.8], [2.4, -0.6], [-2.2, -0.6]])).paint(M.brass, { bevel: 'l' });
      pn.disc(ex, ey, 2.2).paint(M.brass); pn.dot(ex - 0.7, ey - 0.7, M.brass[3]);
      // 大腿：开框 + 齿轮
      pn.cap(L.hx, L.hy, kx, ky, 1.8).paint(M.leg);
      pn.cap(...T.p(0, -3.3), ...T.p(T.len, -2.7), 0.9).cap(...T.p(0, 3.5), ...T.p(T.len, 2.9), 0.9).paint(M.brass, { bevel: 'l' });
      for (const t of pn.hi ? [0.35, 0.65] : [0.5]) pn.ln(...T.p(T.len * t, -2.9), ...T.p(T.len * t, 3.1), M.brass[1], pn.hi ? 2 : 1);
      // 膝：大齿轮
      gear(pn, kx, ky, 4.6, 10, -o.a * 1.2 + ph, M.brass, M.iron);
      gear(pn, L.hx, L.hy, 3.6, 8, o.a * 1.5 + ph, M.brass, M.iron);
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      beamBox(pn, x, y, o, NEAR.iron, 4, 12);
      const w0 = o.connL ? x : x + 6, w1 = o.connR ? x + 48 : x + 42;
      pn.fill(w0, y + 7, w1 - w0, 6, P.dark[0]);
      for (let k = 0; k < 5; k++) {
        const gx = x + 6 + k * 9;
        if (gx < w0 + 1 || gx > w1 - 1) continue;
        gear(pn, gx, y + 10, 2.7, 6, (k % 2 ? -1 : 1) * (o.q || 0) / 2.7 + k * 0.5, NEAR.brass, NEAR.iron);
      }
      pn.fill(w0, y + 6, w1 - w0, 1, P.brass[2]); pn.fill(w0, y + 13, w1 - w0, 1, P.brass[1]);
      pn.fill(w0, y + 14, w1 - w0, 1, P.iron[0]);
    },
  };

  // T6 · 熔心龙骑：三段龙腿。鳞甲大腿里嵌一座小炉膛（发光 = 能源语义：底盘自带少量动力）、膝前尖刺、跗关节后刺、三爪
  const DRAGON = {
    talon(pn, F, du, dv, ramp, M) {
      pn.poly(F.pts([[du, dv - 1.4], [du + 4, dv - 1], [du + 7, dv + 0.4], [du + 8.8, dv + 2.4], [du + 7.6, dv + 2.6], [du + 5.5, dv + 1.8], [du, dv + 2]])).paint(ramp);
      pn.poly(F.pts([[du + 7, dv + 0.9], [du + 8.8, dv + 2.4], [du + 7.6, dv + 2.6]])).paint(M.brass, { outline: false, bevel: '' });
    },
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 8, 6);
      const tx = L.hx + 5 + g.x, ty = L.gy - 2.4 - g.lift, F = frame(tx, ty, g.tilt);
      const [hax, hay] = F.p(-5.5, -10);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, hax, hay, 12.5, 13.5, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), Mt = bone(ex, ey, tx, ty);
      DRAGON.talon(pn, F, -1.6, -0.9, M.dark, M);
      pn.poly(F.pts([[0.5, -0.5], [-4.5, 1.2], [-4.8, 2.4], [0.5, 1.5]])).paint(M.leg);      // 后爪
      pn.cap(ex, ey, tx, ty, 1.8).paint(M.leg);                                              // 跗骨
      pn.poly(Mt.pts([[0.5, 1.2], [Mt.len - 1.2, 1.4], [Mt.len - 2, 2.9], [1, 2.9]])).paint(M.iron);
      pn.poly([[ex + 0.5, ey - 1.8], [ex - 6.2, ey - 3.8], [ex - 0.5, ey + 1.6]]).paint(M.brass);   // 跗关节后刺
      pn.poly(S.pts([[-1, -3.2], [-1, 3.4], [S.len, 2.2], [S.len + 1, -1.8]])).paint(M.iron);
      if (pn.hi) pn.ln(...S.p(0.5, 1.6), ...S.p(S.len - 0.5, 1), M.iron[3]);
      // 大腿：鳞甲
      pn.poly(T.pts([[-3, -4.6], [-3, 5.4], [T.len * 0.6, 5.2], [T.len + 0.5, 2.6], [T.len + 0.5, -2.4], [T.len * 0.5, -4.4]])).paint(M.iron);
      const rows = pn.hi ? [0.5, 0.68, 0.86] : [0.62, 0.86];
      rows.forEach((t, r) => {
        for (const f of [-2.4, 0.4, 3.2]) {
          const a = T.len * t, ff = f + (r % 2) * 1.4;
          if (ff > 4.2) continue;
          pn.ln(...T.p(a - 1.4, ff - 1.3), ...T.p(a, ff), M.iron[0]); pn.ln(...T.p(a, ff), ...T.p(a - 1.4, ff + 1.3), M.iron[0]);
          if (pn.hi) pn.dot(...T.p(a - 1.2, ff), M.iron[3]);
        }
      });
      // 炉膛：一扇小炉窗，煤块忽明忽暗
      const fl = o.fl || 0;
      pn.poly(T.pts([[0, -2.2], [0, 3.2], [4.8, 3.2], [4.8, -2.2]])).paint([M.dark[0], M.fire[0], M.fire[1], M.fire[1]], { bevel: '' });
      for (let k = 0; k < (pn.hi ? 7 : 3); k++) {
        const aa = 0.8 + (k * 1.7) % 3.4, ffv = -1.3 + (k * 2.3) % 4.2;
        pn.dot(...T.p(aa, ffv), (k + fl) % 3 === 0 ? M.fire[3] : M.fire[2]);
      }
      pn.ln(...T.p(1.6, -2.2), ...T.p(1.6, 3.2), M.dark[0]); pn.ln(...T.p(3.2, -2.2), ...T.p(3.2, 3.2), M.dark[0]);
      // 膝：前刺 + 黄铜毂
      pn.poly([[kx + 1, ky - 2.2], [kx + 6.8, ky - 3.4], [kx + 2, ky + 1.8]]).paint(M.brass);
      pn.disc(kx, ky, 3).paint(M.brass); pn.dot(kx, ky, M.brass[0]);
      DRAGON.talon(pn, F, 0, 0, M.leg, M);
      pn.disc(L.hx, L.hy, 3.8).paint(M.iron); pn.disc(L.hx, L.hy, 1.5).paint(M.fire, { outline: false, bevel: '' });
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      // 下沿一排垂鳞
      for (let k = -1; k < 11; k++) { const sx = x + 2 + k * 5; if (!o.connL && sx < x + 3) continue; if (!o.connR && sx > x + 45) continue; pn.disc(sx, y + 14.2, 2.6); }
      pn.paint(NEAR.iron, { clip: [x, x + 48] });
      const [a, b] = beamBox(pn, x, y, o, NEAR.iron, 4, 11);
      pn.fill(a, y + 13, b - a, 1, P.brass[1]);
      // 通风缝里透出炉火
      pn.fill(x + 21, y + 7, 9, 3, P.dark[0]);
      for (let k = 0; k < 4; k++) pn.fill(x + 22 + k * 2, y + 8, 1, 1, (k + (o.fl || 0)) % 2 ? P.fire[3] : P.fire[2]);
      pn.fill(x + 20, y + 6, 11, 1, P.brass[2]); pn.fill(x + 20, y + 10, 11, 1, P.brass[1]);
      rivet(pn, x + 8, y + 7); rivet(pn, x + 40, y + 7);
    },
  };

  // ---------- 探索版 ----------
  // E1 · 高跷：没有膝盖的伸缩腿，靠套筒伸缩抬脚
  const STILT = {
    bob: 4,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 8.5, 6);
      const fx = L.hx + 1 + g.x, fy = L.gy - 2.4 - g.lift, B = bone(L.hx, L.hy, fx, fy), n = B.len;
      pn.poly([[fx - 3.5, fy + 0.2], [fx + 3.5, fy + 0.2], [fx + 4.6, fy + 2.4], [fx - 4.6, fy + 2.4]]).paint(M.leg);
      pn.disc(fx, fy, 1.4).paint(M.iron);
      pn.cap(...B.p(n * 0.55, 0), ...B.p(n - 1, 0), 0.9).paint(M.steam, { bevel: 'l' });
      pn.cap(...B.p(9, 0), ...B.p(n * 0.62, 0), 1.6).paint(M.iron);
      const collar = (a, w, ramp) => pn.poly(B.pts([[a - 0.8, -w], [a + 0.7, -w], [a + 0.7, w], [a - 0.8, w]])).paint(ramp);
      collar(n * 0.62, 2.1, M.brass);
      pn.cap(...B.p(-1, 0), ...B.p(11, 0), 2.4).paint(M.leg);
      collar(11, 2.9, M.brass);
      if (pn.hi) pn.ln(...B.p(0, 1.2), ...B.p(10, 1.2), M.leg[3]);
      pn.disc(L.hx, L.hy, 3.2).paint(M.brass); pn.dot(L.hx - 1, L.hy - 1, M.brass[3]);
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.dark, 4, 8);
      pn.fill(a, y + 7, b - a, 1, P.brass[1]);
      for (const hx of [16, 30]) pn.poly([[x + hx - 5, y + 11], [x + hx + 5, y + 11], [x + hx + 3, y + 15], [x + hx - 3, y + 15]]).paint(NEAR.dark);
    },
  };

  // E2 · 轮足：反关节腿末端是辐条轮，滑行不迈步——起伏最小
  const WHEEL = {
    bob: 1,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 3, 1.5);
      const wx = L.hx + 3 + g.x, wy = L.gy - 5.8 - g.lift;
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, wx, wy, 14, 15, -1);
      pn.cap(L.hx, L.hy, kx, ky, 2.6).paint(M.leg);
      pn.disc(wx, wy, 5.8).paint(M.dark);
      pn.disc(wx, wy, 4.4).paint(flat(M.iron[1]), { outline: false, bevel: '' });
      const ra = (o.q || 0) / 5.8;
      for (let k = 0; k < 6; k++) { const a = ra + k * Math.PI / 3; pn.ln(wx, wy, wx + Math.cos(a) * 4.3, wy + Math.sin(a) * 4.3, M.iron[3]); }
      if (pn.hi) for (let k = 0; k < 12; k++) { const a = ra + k * Math.PI / 6; pn.dot(wx + Math.cos(a) * 5.2, wy + Math.sin(a) * 5.2, M.dark[3]); }
      pn.disc(wx, wy, 1.5).paint(M.brass);
      // 挡泥板
      for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.05 + k * 0.12); pn.cap(wx + Math.cos(a) * 6.8, wy + Math.sin(a) * 6.8, wx + Math.cos(a + 0.12) * 6.8, wy + Math.sin(a + 0.12) * 6.8, 0.6); }
      pn.paint(M.iron, { bevel: 'l' });
      pn.cap(kx, ky, ex, ey, 1.5).paint(M.leg, { bevel: 'l' });
      pn.disc(kx, ky, 2.8).paint(M.iron);
      pn.disc(L.hx, L.hy, 3).paint(M.iron); pn.disc(L.hx, L.hy, 1.1).paint(M.brass, { outline: false });
    },
    beam: MK2.beam,
  };

  // E3 · 裙甲堡：大裙甲罩住大腿和膝盖，只露出护胫和铁靴碎步走
  const SKIRT = {
    bob: 2, hipY: 15,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 5, 3);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4 - g.lift, 15, 15, 1);
      L.T = bone(L.hx, L.hy, kx, ky);
      const S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      const top = [[-4, -1.5], [-1, -2.6], [4, -1.4], [8, 1.4], [11.5, 3.4]];
      pn.poly(F.pts([...top, [11, 4], [-4, 4]])).paint(M.steel);
      pn.ln(...F.p(3, yAt(top, 3) + 0.6), ...F.p(2.4, 3.6), M.steel[0]);
      pn.poly(S.pts([[-1, -3.2], [-1, 3.8], [S.len * 0.5, 4.2], [S.len + 0.5, 2.8], [S.len + 0.5, -2.6]])).paint(M.steel);
      pn.ln(...S.p(1, 1.8), ...S.p(S.len - 1, 1.2), M.steel[3]);
      pn.cap(L.hx, L.hy, kx, ky, 3).paint(M.leg);
      pn.disc(kx + 0.6, ky, 3).paint(M.iron);
    },
    over(pn, L, ph, o) {
      const M = L.M, F = frame(L.hx, L.hy - 3, (L.T.ang - Math.PI / 2) * 0.3);
      for (let k = 2; k >= 0; k--) {
        const v = k * 6, w0 = 7 + k * 2.3, w1 = w0 + 2.3;
        pn.poly(F.pts([[-w0, v], [w0, v], [w1, v + 8], [-w1, v + 8]])).paint(M.steel);
        pn.poly(F.pts([[-w1 + 0.5, v + 6.7], [w1 - 0.5, v + 6.7], [w1 - 0.3, v + 7.9], [-w1 + 0.3, v + 7.9]])).paint(k === 2 ? M.brass : M.iron, { outline: false, bevel: 'l' });
        if (pn.hi) for (const u of [-w0 + 2, 0, w0 - 2]) pn.dot(...F.p(u, v + 2), P.iron[4]);
      }
    },
    beam(pn, x, y, o) {
      floor(pn, x, y, o);
      const [a, b] = beamBox(pn, x, y, o, NEAR.steel, 4, 10);
      pn.fill(a, y + 12, b - a, 1, P.brass[2]); pn.fill(a, y + 13, b - a, 1, P.brass[1]);
    },
  };

  // E4 · 板簧跑刃：短大腿 + C 形叠层板簧刀片（跑步假肢），着地时压弯回弹
  const BLADE = {
    bob: 3,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 8, 6);
      const tx = L.hx + 4 + g.x, ty = L.gy - 1.4 - g.lift;
      const [kx, ky] = ik(L.hx, L.hy, tx - 5, ty - 11, 11, 13, 1);
      const load = o.mv ? Math.max(0, -g.sn) : 0.6;
      const P0 = [kx, ky], P1 = [kx - 3 - 2.5 * load, ky + 9], P2 = [tx - 9 - load, ty + 1], P3 = [tx + 2.5, ty];
      const bz = (t) => { const u = 1 - t; return [0, 1].map(i => u * u * u * P0[i] + 3 * u * u * t * P1[i] + 3 * u * t * t * P2[i] + t * t * t * P3[i]); };
      const N = 16, pts = Array.from({ length: N + 1 }, (_, k) => bz(k / N));
      // 副簧片（后面一层，短一截）
      for (let k = 1; k < N * 0.7; k++) { const a = pts[k - 1], b = pts[k]; pn.cap(a[0] - 1.3, a[1] + 0.6, b[0] - 1.3, b[1] + 0.6, 0.9); }
      pn.paint(M.iron, { bevel: 'l' });
      for (let k = 1; k <= N; k++) { const a = pts[k - 1], b = pts[k]; pn.cap(a[0], a[1], b[0], b[1], 1.4); }
      pn.paint(M.steel);
      pn.poly([[tx - 3, ty + 0.3], [tx + 3.5, ty - 0.1], [tx + 3.6, ty + 1.4], [tx - 3, ty + 1.4]]).paint(M.dark);
      pn.cap(L.hx, L.hy, kx, ky, 2.8).paint(M.leg);
      pn.disc(kx, ky, 3).paint(M.iron); pn.dot(kx + 0.5, ky + 0.5, M.brass[2]);
      pn.disc(L.hx, L.hy, 3).paint(M.iron); pn.disc(L.hx, L.hy, 1.1).paint(M.brass, { outline: false });
    },
    beam: HERON.beam,
  };

  // E5 · 圣堂 · 对开罩袍（v2）：圣骑 + 每条腿各挂一片白布罩袍（十字军罩袍 surcoat 的做法：腰带上垂下、前后对开、下摆锯齿）。
  // 布不是硬的：挂点在腰带上，跟着大腿转一部分，下摆随步伐比腰晚半拍甩动；白底、红十字、黄铜腰带和下摆镶边。
  const TABARD = {
    ...KNIGHT,
    over(pn, L, ph, o) {
      KNIGHT.over(pn, L, ph, o);
      const M = L.M, lag = o.mv ? Math.sin((o.a || 0) + ph - 0.9) : 0;
      // 布主要靠重力垂着：只跟大腿转 28%，再加下摆比腰晚半拍的甩动
      const F = frame(L.hx + 0.6, L.hy - 3, (L.T.ang - Math.PI / 2) * 0.28 + lag * 0.1);
      const k = L.tabk || 1, len = 20 * k, wt = 4.4 * k, wb = 6.4 * k, sw = lag * 1.6 * k;
      const cloth = [P.steam[0], P.steam[1], P.steam[2], '#f6f2e8'];
      const hem = [[wb + sw, len], [wb * 0.55 + sw * 0.9, len - 2.4], [wb * 0.1 + sw, len], [-wb * 0.35 + sw * 0.9, len - 2.4], [-wb + sw, len]];
      pn.poly(F.pts([[-wt, 0], [wt, 0], ...hem])).paint(cloth, { bevel: 'l' });
      pn.poly(F.pts([[-wt, 0], [wt, 0], [wt + 0.3, 1.8], [-wt - 0.3, 1.8]])).paint(M.brass, { outline: false, bevel: 'l' });
      pn.poly(F.pts([[-wb + sw, len - 1], [wb + sw, len - 1], [wb + sw, len], [-wb + sw, len]])).paint(M.brass, { outline: false, bevel: '' });
      const cs = sw * 0.6, red = [M.fire[0], M.fire[0], M.fire[1], M.fire[1]];
      pn.poly(F.pts([[-0.9 * k + cs, 4.4 * k], [0.9 * k + cs, 4.4 * k], [0.9 * k + cs, 14.4 * k], [-0.9 * k + cs, 14.4 * k]])).poly(F.pts([[-3 * k + cs, 7 * k], [3 * k + cs, 7 * k], [3 * k + cs, 8.8 * k], [-3 * k + cs, 8.8 * k]])).paint(red, { outline: false, bevel: '' });
      if (pn.hi) { pn.ln(...F.p(-2.4, 2), ...F.p(-2.8 + sw * 0.8, len - 3), cloth[1]); pn.ln(...F.p(2.6, 2), ...F.p(3 + sw * 0.8, len - 3), cloth[1]); }
    },
  };

  // 现役（对照）：直接调用游戏里的精灵
  const tmp = document.createElement('canvas'); tmp.width = 80; tmp.height = 64;
  const BASE = {
    game: true,
    draw(pn, g, x, y, o, part) {
      const t = tmp.getContext('2d'); t.clearRect(0, 0, 80, 64);
      SA.SPR.drawModule(t, 'biped', 0, 16, { moving: o.mv, phase: o.phase, bd: o.bd, part, ri: o.ri, connL: o.connL, connR: o.connR, top: o.top });
      pn.flush(g); pn.blit(g, tmp, x, y - 16);
    },
  };

  const DESIGNS = [
    { id: 'base', q: 0, tag: '现役', name: '双足底盘', sub: '对照组：两根小铁棍', d: BASE,
      note: '现役造型：两段反关节细腿 + 小方脚，1× 下只有 3px 粗。' },
    { id: 'mk2', q: 1, name: '工装 Mk.II', sub: '箱形梁 · 液压撑杆', d: MK2,
      note: '和现役同一套反关节步态，一眼是「同一条腿的正经版」：大腿换成带减重孔的箱形梁，小腿换成双支杆 + 斜撑，前方多一根会伸缩的液压撑杆，脚板有肋。' },
    { id: 'heron', q: 2, name: '鹭步', sub: '三段鸟腿 · 三趾爪', d: HERON,
      note: '剪影换成 Z 字：膝盖朝前、跗关节高高翘在后面，像鹭鸟。黄铜关节毂、膝后弹簧、三趾爪 + 后趾。轻快、细长，适合做「更快更晃」的精良款。' },
    { id: 'gren', q: 3, name: '掷弹兵', sub: '圆筒腿 · 压力表膝', d: GREN,
      note: '第一次换成人形正膝：铆接圆筒大腿 + 黄铜箍，喇叭口护胫，平头厚底重靴。膝盖是一块压力表（走起来指针打到高压），膝后一根蒸汽活塞。粗壮、稳。' },
    { id: 'knight', q: 4, name: '蒸汽圣骑', sub: '哥特板甲骑士', d: KNIGHT,
      note: '骑士机甲：大腿甲（带棱线）、护膝 + 黄铜扇形侧翼、护胫、分节尖头铁靴、脚跟马刺（2× 下是会转的星轮）。横梁做成腰甲，胯上挂一片跟着大腿摆的草摺，每隔一格一面纹章盾。' },
    { id: 'clock', q: 5, name: '钟表巨像', sub: '齿轮 · 棘齿脚板', d: CLOCK,
      note: '开框大腿里转着齿轮，膝盖是一只大齿轮，胫骨后缘是棘轮齿；脚改成一块宽脚板：脚跟发条盒、脚尖小齿轮、鞋底棘齿，踝上扣黄铜半球承窝。横梁开窗露出一排随步伐转动的齿轮组。' },
    { id: 'dragon', q: 6, name: '熔心龙骑', sub: '龙腿 · 炉膛 · 三爪', d: DRAGON,
      note: '三段龙腿：鳞甲大腿里嵌一扇小炉窗（煤块忽明忽暗），膝前尖刺、跗关节后刺、三爪 + 后爪，横梁下沿一排垂鳞、通风缝透出炉火。发光 = 能源语义，所以玩法上建议让它自带一点动力。' },
    { id: 'stilt', q: -1, name: '高跷', sub: '伸缩套筒 · 无膝', d: STILT,
      note: '探索：没有膝盖，腿是三节伸缩套筒，抬脚靠缩短。最细最高的剪影，起伏最大。' },
    { id: 'wheel', q: -1, name: '轮足', sub: '反关节 + 辐条轮', d: WHEEL,
      note: '探索：反关节腿末端是辐条轮，滑行不迈步，几乎不起伏。玩法可以是「双足里最稳的一款」。' },
    { id: 'skirt', q: -1, name: '裙甲堡', sub: '大裙甲 · 碎步', d: SKIRT,
      note: '探索：三层裙甲罩住大腿和膝盖，只露护胫和铁靴碎步走，剪影是钟形。最耐打的双足方向。' },
    { id: 'blade', q: -1, name: '板簧跑刃', sub: 'C 形叠层板簧', d: BLADE,
      note: '探索：短大腿 + C 形叠层板簧刀片（跑步假肢），着地时刀片被压弯、抬脚回弹。最快最弹。' },
    { id: 'tabard', q: -1, name: '圣堂 · 对开罩袍', sub: '圣骑 + 白布红十字', d: TABARD,
      note: '探索 v2：在蒸汽圣骑的基础上，每条腿各挂一片白布罩袍（十字军罩袍的做法：腰带上垂下、前后对开、锯齿下摆、红十字、黄铜镶边）。布挂在腰带上，跟着大腿转一部分，下摆比腰晚半拍甩动。' },
  ];

  // ---------- 新画 1 · 蒸汽人（1868 德德里克）：人形正膝，粗大的铆接汽缸大腿 + 直筒小腿 + 圆头铁靴；腿后一根蒸汽管，膝盖处随迈步喷白汽 ----------
  const STEAMMAN = {
    hipY: 14, bob: 2,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 4.5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + g.x, L.gy - 6.4 - g.lift, 14.5, 15, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt * 0.6);
      // 蒸汽管：从胯后沿着腿后缘垂到膝后，膝后阀口在抬腿时喷汽
      const p0 = T.p(1, -4.6), p1 = T.p(T.len - 1, -4.6), p2 = S.p(S.len * 0.4, -4.2);
      pn.cap(...p0, ...p1, 0.9).cap(...p1, ...p2, 0.9).paint(M.steam, { bevel: 'l' });
      pn.disc(p1[0], p1[1], 1.5).paint(M.brass, { bevel: 'l' });
      if (g.lift > 1.2 && o.mv) { pn.disc(p1[0] - 2.4, p1[1] - 1, 0.9 + g.lift * 0.12).paint(NEAR.steam, { outline: false, bevel: '' }); pn.dot(p1[0] - 3.4, p1[1] - 2.6, P.steam[2]); }
      // 圆头铁靴（无尖，像一只倒扣的锅）
      pn.poly(F.pts([[-5, -1], [2, -1.6], [7, 0.2], [10.4, 3.4], [10.8, 6.2], [-5.4, 6.6], [-5.4, 0]])).paint(M.leg);
      pn.poly(F.pts([[-5.4, 5], [10.7, 5], [10.8, 6.6], [-5.4, 6.6]])).paint(M.dark, { outline: false, bevel: '' });
      pn.poly(F.pts([[-1.5, 0.6], [2.5, 0.6], [2.5, 2.6], [-1.5, 2.6]])).paint(M.brass, { bevel: 'l' });
      // 小腿：直筒 + 三道箍
      pn.poly(S.pts([[-1, -3], [-1, 3.2], [S.len + 0.5, 3.6], [S.len + 0.5, -3.4]])).paint(M.iron);
      for (const a of [S.len * 0.25, S.len * 0.62, S.len * 0.95]) pn.poly(S.pts([[a - 0.8, -3.4], [a + 0.8, -3.4], [a + 0.8, 3.8], [a - 0.8, 3.8]])).paint(M.brass, { outline: false });
      if (pn.hi) for (let a = 2; a < S.len; a += 3) pn.dot(...S.p(a, 2.2), P.iron[4]);
      // 大腿：更粗的汽缸，纵向两条接缝
      pn.cap(L.hx, L.hy, kx, ky, 4.9).paint(M.iron);
      for (const t of [0.22, 0.5, 0.78]) { const a = T.len * t; pn.poly(T.pts([[a - 0.8, -5], [a + 0.8, -5], [a + 0.8, 5], [a - 0.8, 5]])).paint(M.brass, { outline: false }); }
      pn.ln(...T.p(1, 1.2), ...T.p(T.len - 1, 1.2), M.iron[1]);
      // 膝：黄铜球关节；胯：大铁毂
      pn.disc(kx, ky, 4.3).paint(M.brass); pn.dot(kx - 1.2, ky - 1.2, M.brass[3]);
      pn.disc(L.hx, L.hy, 4.9).paint(M.iron); pn.disc(L.hx, L.hy, 1.8).paint(M.brass, { outline: false });
    },
  };

  // ---------- 新画 2 · 风箱腿（T6 以太合金）：只有四个大件——铸造锥形大腿、皱褶风箱膝、锥形小腿、圆盘大脚 ----------
  // 现实参考：维多利亚时代的相机皮腔、风琴 / 铁匠风箱、卡车的空气弹簧——皮质褶皱天然能弯能伸缩，所以膝盖直接用一段风箱，
  // 内侧褶子被压紧、外侧被拉开（这里按弯折角把褶子画成一边窄一边宽）。腿部造型故意做简：大块面 + 几道黄铜箍，不堆零件。
  const BELLOWS = {
    hipY: 14, bob: 3,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 5.5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4.6 - g.lift, 14, 15, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      // 圆盘大脚：宽而低，黄铜镶边，底下一层深色胶垫
      pn.poly(F.pts([[-7.4, 3.2], [-4.6, 1.2], [5, 1.2], [8.6, 3.2], [8.6, 4.6], [-7.4, 4.6]])).paint(M.leg);
      pn.poly(F.pts([[-7.4, 3.6], [8.6, 3.6], [8.6, 4.6], [-7.4, 4.6]])).paint(M.dark, { outline: false, bevel: '' });
      pn.ln(...F.p(-6.4, 2.6), ...F.p(7.4, 2.6), M.brass[2], pn.hi ? 2 : 1);
      // 小腿：上粗下细的铸造锥
      pn.poly(S.pts([[5, -3.4], [5, 3.4], [S.len - 0.5, 2.2], [S.len - 0.5, -2.2]])).paint(M.iron);
      for (const t of [0.42, 0.86]) { const a = S.len * t, w = 3.4 - 1.2 * (a - 5) / (S.len - 5.5); pn.poly(S.pts([[a - 0.8, -w - 0.4], [a + 0.8, -w - 0.4], [a + 0.8, w + 0.4], [a - 0.8, w + 0.4]])).paint(M.brass, { outline: false, bevel: 'l' }); }
      if (pn.hi) pn.ln(...S.p(4, 2.2), ...S.p(S.len - 2, 1.2), M.iron[3]);
      pn.disc(ex, ey, 2.4).paint(M.brass); pn.dot(ex - 0.8, ey - 0.8, M.brass[3]);
      // 大腿：更粗的铸造锥，两端黄铜箍
      pn.poly(T.pts([[-1, -4.2], [-1, 4.2], [T.len - 4.6, 3.6], [T.len - 4.6, -3.6]])).paint(M.iron);
      for (const a of [1.2, T.len - 5.4]) pn.poly(T.pts([[a - 0.8, -4.6], [a + 0.8, -4.6], [a + 0.8, 4.6], [a - 0.8, 4.6]])).paint(M.brass, { outline: false, bevel: 'l' });
      if (pn.hi) pn.ln(...T.p(2, 2.4), ...T.p(T.len - 5, 1.8), M.iron[3]);
      // 膝：风箱。从大腿下端到小腿上端；褶子垂直于两端连线，内侧（后面）窄外侧（前面）宽，交替深浅
      const A = T.p(T.len - 4.6, 0), B = S.p(5, 0), dx = B[0] - A[0], dy = B[1] - A[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
      pn.cap(...A, ...B, 3.1).paint(M.leather);
      const N = 5;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N, cx = A[0] + dx * t, cy = A[1] + dy * t, wide = i % 2 === 0 ? 3.9 : 3.2;
        pn.cap(cx - nx * wide * 0.85, cy - ny * wide * 0.85, cx + nx * wide * 1.15, cy + ny * wide * 1.15, 0.5);
      }
      pn.paint(M.brass, { bevel: 'l' });
      pn.disc(L.hx, L.hy, 3.8).paint(M.iron); pn.disc(L.hx, L.hy, 1.4).paint(M.brass, { outline: false });
    },
  };

  // ---------- 新画 3 · 缩放仪平行腿：平行四连杆，脚板永远水平 ----------
  // 大腿、小腿各是一对等长平行杆，两端是竖直的铰板：胯板（固定）、膝板、踝板永远和胯板平行，
  // 所以脚板不管腿怎么弯都保持水平（俄亥俄州立「适应性悬挂行走车」的思路）。每段平行四边形的对角线是一根液压缸——对角线随腿弯曲而伸缩，这正是缸的用处。
  const PANTO = {
    hipY: 14, bob: 2,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7.5, 5.5), ws = 2.7;
      const ax = L.hx + 1 + g.x, ay = L.gy - ws - 1.7 - g.lift;
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, ax, ay, 15, 15, 1);
      const bars = (x0, y0, x1, y1) => { for (const s of [-1, 1]) pn.cap(x0, y0 + s * ws, x1, y1 + s * ws, 0.85); };
      // 对角液压缸：上一个铰点到下一个铰点（缸体 + 活塞杆各占一半）
      const ram = (x0, y0, x1, y1) => {
        const mx = x0 + (x1 - x0) * 0.5, my = y0 + (y1 - y0) * 0.5;
        pn.cap(mx, my, x1, y1, 0.55).paint(M.steam, { bevel: 'l' }); pn.cap(x0, y0, mx, my, 1.3).paint(M.iron);
      };
      // 远一层：后杆 + 液压缸；近一层：前杆
      pn.cap(L.hx, L.hy + ws, kx, ky + ws, 0.85).cap(kx, ky + ws, ex, ey + ws, 0.85).paint(M.iron, { bevel: 'l' });
      ram(L.hx, L.hy + ws, kx, ky - ws); ram(kx, ky + ws, ex, ey - ws);
      pn.cap(L.hx, L.hy - ws, kx, ky - ws, 0.85).cap(kx, ky - ws, ex, ey - ws, 0.85).paint(M.steel, { bevel: 'l' });
      // 铰板（竖直）：胯 / 膝 / 踝，铰点是黄铜销
      for (const [px, py, w] of [[L.hx, L.hy, 1.7], [kx, ky, 1.9], [ex, ey, 1.7]]) {
        pn.poly([[px - w, py - ws - 1.5], [px + w, py - ws - 1.5], [px + w, py + ws + 1.5], [px - w, py + ws + 1.5]]).paint(M.iron);
        for (const s of [-1, 1]) pn.disc(px, py + s * ws, 0.9).paint(M.brass, { outline: false, bevel: 'l' });
      }
      // 脚板：挂在踝板底下，永远水平；前掌长、后跟短，底下一排防滑齿
      const fy = ey + ws + 0.2;
      pn.poly([[ex - 6.4, fy], [ex + 8.2, fy], [ex + 11.2, fy + 1.2], [ex + 11.2, fy + 1.9], [ex - 6.8, fy + 1.9], [ex - 6.8, fy + 0.6]]).paint(M.leg);
      pn.poly([[ex - 6.8, fy + 1.1], [ex + 11.2, fy + 1.1], [ex + 11.2, fy + 1.9], [ex - 6.8, fy + 1.9]]).paint(M.dark, { outline: false, bevel: '' });
      pn.poly([[ex - 1.6, fy - 0.2], [ex + 1.6, fy - 0.2], [ex + 3.4, fy + 1.1], [ex - 3.4, fy + 1.1]]).paint(M.iron, { bevel: 'l' });
      if (pn.hi) for (let u = -5; u < 10; u += 2) pn.dot(ex + u, fy + 1.5, M.leg[3]);
      pn.disc(L.hx, L.hy, 2.6).paint(M.iron); pn.disc(L.hx, L.hy, 1).paint(M.brass, { outline: false });
    },
  };

  // ---------- 新画 4 · 圣堂骑士腿（T6 以太合金）：哥特板甲 + 十字军罩袍，再加上以太合金的「能量」语义 ----------
  // 剪影上比蒸汽圣骑多三样：① 护膝侧面三片向后掠的黄铜羽翼（膝盖像一顶带翼的头盔）；② 护胫后缘一片刀锋状的尾鳍；③ 铁靴又长又尖，脚跟一根后刺。
  // 大腿甲正中一条发光的能量脉（以太合金发光 = 能源语义，和熔心龙骑的炉膛同一语言）。罩袍沿用「对开罩袍」：白布红十字，腰带上垂下、比腰晚半拍甩动。
  const TEMPLAR = {
    hipY: 13, bob: 2,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7.5, 5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4.5 - g.lift, 15.5, 15.5, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      L.T = T; L.tabk = 0.72;
      // 铁靴：细长尖头、分节，脚跟一根后刺，靴尖一枚黄铜点
      const top = [[-4.5, -1.5], [-1, -3], [3, -2.2], [9, 0.4], [18, 3.8]];
      pn.poly(F.pts([...top, [17.4, 4.7], [-4.5, 4.7]])).paint(M.steel);
      for (const u of pn.hi ? [0.5, 3, 5.5, 8.5, 12] : [2, 6, 11]) pn.ln(...F.p(u, yAt(top, u) + 0.6), ...F.p(u - 0.8, 4.2), M.steel[0]);
      pn.poly(F.pts([[-4.5, 0.4], [-9, 3.4], [-4.5, 4]])).paint(M.brass, { bevel: 'l' });
      pn.poly(F.pts([[15, 3], [18.4, 3.9], [17.4, 4.7], [14.6, 4.6]])).paint(M.brass, { outline: false, bevel: '' });
      // 护胫：钢板 + 前脊；后缘一片刀锋尾鳍
      pn.poly(S.pts([[S.len * 0.14, -3], [S.len * 0.5, -9], [S.len * 0.9, -3.4]])).paint(M.brass, { bevel: 'l' });
      pn.poly(S.pts([[-1, -3.2], [-1, 3.4], [S.len + 0.5, 2.6], [S.len + 0.5, -2.4], [S.len * 0.62, -3.4], [S.len * 0.32, -4.6]])).paint(M.steel);
      pn.ln(...S.p(1, 1.8), ...S.p(S.len - 1, 1.2), M.steel[3]);
      if (pn.hi) { pn.ln(...S.p(1, 1.1), ...S.p(S.len - 1, 0.6), M.steel[1]); pn.ln(...S.p(2, -1.4), ...S.p(S.len - 2, -1), M.steel[1]); }
      // 大腿甲：正中一条发光的能量脉
      pn.poly(T.pts([[-2, -4], [-2, 5.2], [T.len - 3, 4.4], [T.len - 0.5, 1], [T.len - 2.5, -3.2]])).paint(M.steel);
      pn.ln(...T.p(0, 2.4), ...T.p(T.len - 3, 2), M.steel[3]);
      const vein = pn.hi ? 2 : 1;
      pn.ln(...T.p(1, 0), ...T.p(T.len - 4.5, 0), M.fire[1], vein + 1); pn.ln(...T.p(1, 0), ...T.p(T.len - 4.5, 0), M.fire[3], vein);
      // 护膝：圆盔 + 三片向后掠的黄铜羽翼 + 前尖
      for (let i = 0; i < 3; i++) pn.poly([[kx - 1, ky - 1.6 + i * 1.8], [kx - 7.4 - i * 1.6, ky - 3.6 + i * 2.6], [kx - 1, ky + 0.2 + i * 1.8]]).paint(M.brass, { bevel: 'l' });
      pn.disc(kx + 0.4, ky, 3.4).poly([[kx + 2.4, ky - 1.6], [kx + 6.4, ky + 0.2], [kx + 2.4, ky + 1.8]]).paint(M.steel);
      pn.dot(kx - 0.6, ky - 1.2, M.steel[3]); pn.disc(kx + 0.4, ky, 1).paint(M.fire, { outline: false, bevel: '' });
    },
    over(pn, L, ph, o) { TABARD.over(pn, L, ph, o); },
  };

  // ---------- 新画 5 · 锁甲骑士腿（T4 镀镍）：锁子甲 + 圆护膝 + 鸭嘴铁靴 ----------
  // 15 世纪末马克西米利安式装束的反面：不是尖靴哥特甲，而是「锁子甲底 + 局部板甲」——大腿、小腿后侧是锁环（点阵），前面只有窄窄一条板甲，膝盖一颗大圆护膝，
  // 脚是宽头圆嘴的「鸭嘴靴」（sabaton, 1500 年前后的样式）；胯上挂一片锁甲下摆（hauberk），下沿锯齿。
  const mailFill = (pn, B, a0, a1, f0, f1, ramp) => {   // 骨骼坐标系里的锁环点阵
    const st = pn.hi ? 1.5 : 2.4;
    for (let a = a0, r = 0; a < a1; a += st, r++) for (let f = f0 + (r % 2) * st / 2; f < f1; f += st) pn.dot(...B.p(a, f), ramp);
  };
  const MAIL = {
    hipY: 13, bob: 2,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7, 5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4.7 - g.lift, 15.5, 15.5, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      L.T = T;
      // 鸭嘴靴：宽头圆嘴，分节
      const top = [[-4.5, -1.5], [-1, -3], [3, -2], [8, 0], [12.4, 2.2]];
      pn.poly(F.pts([...top, [14.6, 3.2], [14.8, 4.7], [-4.5, 4.7]])).paint(M.steel);
      for (const u of pn.hi ? [1, 4, 7.4, 10.8] : [2.5, 7, 11]) pn.ln(...F.p(u, yAt(top, u) + 0.6), ...F.p(u - 0.5, 4.3), M.steel[0]);
      pn.poly(F.pts([[-4.5, 3.6], [14.8, 3.6], [14.8, 4.7], [-4.5, 4.7]])).paint(M.dark, { outline: false, bevel: '' });
      // 小腿：锁甲底 + 前面一条窄护胫板
      pn.poly(S.pts([[-1, -3.6], [-1, 3.2], [S.len + 0.5, 2.8], [S.len + 0.5, -2.8]])).paint(M.iron);
      mailFill(pn, S, 1, S.len - 1, -2.6, 1.2, M.iron[3]);
      pn.poly(S.pts([[-1, 1.2], [-1, 3.4], [S.len + 0.5, 3], [S.len + 0.5, 1.4]])).paint(M.steel);
      // 大腿：锁甲底 + 前面一条窄板 + 后缘锁甲垂片
      pn.poly(T.pts([[-2, -4.4], [-2, 5], [T.len - 3, 4.4], [T.len - 0.5, 1], [T.len - 2.5, -3.4]])).paint(M.iron);
      mailFill(pn, T, 0, T.len - 3, -3.4, 2.2, M.iron[3]);
      pn.poly(T.pts([[-2, 2.2], [-2, 5.2], [T.len - 3, 4.6], [T.len - 1.6, 2.4], [T.len - 3, 2]])).paint(M.steel);
      pn.ln(...T.p(0, 3.6), ...T.p(T.len - 4, 3.2), M.steel[3]);
      // 圆护膝：大圆盘 + 一圈黄铜铆钉 + 中心凸起
      pn.disc(kx + 0.4, ky, 3.9).paint(M.steel);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; pn.dot(kx + 0.4 + Math.cos(a) * 3, ky + Math.sin(a) * 3, M.brass[2]); }
      pn.disc(kx + 0.4, ky, 1.5).paint(M.brass, { bevel: 'l' });
    },
    // 锁甲下摆：挂在胯上，锯齿下沿，跟着大腿转一半
    over(pn, L, ph, o) {
      const M = L.M, F = frame(L.hx, L.hy - 4, (L.T.ang - Math.PI / 2) * 0.5), sw = o.mv ? Math.sin((o.a || 0) + ph - 0.9) * 1.2 : 0;
      const hem = [[8 + sw, 11], [6.5 + sw, 9.2], [4.6 + sw, 11], [2.6 + sw, 9.2], [0.6 + sw, 11], [-1.4 + sw, 9.2], [-3.4 + sw, 11], [-5.4 + sw, 9.2], [-7 + sw, 10.6]];
      pn.poly(F.pts([[-7, 0], [7, 0], ...hem])).paint(M.iron);
      for (let v = 1.4, r = 0; v < 9.6; v += pn.hi ? 1.5 : 2.4, r++) for (let u = -6 + (r % 2) * 0.8 + sw * v / 11; u < 6.6 + sw * v / 11; u += pn.hi ? 1.6 : 2.4) pn.dot(...F.p(u, v), M.iron[3]);
      pn.poly(F.pts([[-7, 0], [7, 0], [7.3, 1.6], [-7.3, 1.6]])).paint(M.brass, { outline: false, bevel: 'l' });
    },
  };

  // ---------- 新画 · 晶枝腿（T6 以太合金）：枯死的树枝、岩石、宝石 ----------
  // 大腿是一根扭曲的枯枝（树皮纹、断茬小枝），膝盖是一块棱角分明的岩石，小腿是更细的枯枝、背面长出一簇晶体，脚是一块扁平的岩板、趾尖嵌一根晶柱；
  // 膝盖岩里嵌着发光的宝石（以太合金的能量语义，和熔心龙骑的炉膛同一语言）。枝干是曲线（在骨骼两侧摆动，两端收回轴线，关节位置不变）。
  const rockPoly = (cx, cy, r, n, seed, sq = 1) => Array.from({ length: n }, (_, k) => { const a = k / n * TAU, j = 0.74 + 0.34 * Math.abs(Math.sin(seed + k * 2.3)); return [cx + Math.cos(a) * r * j, cy + Math.sin(a) * r * j * sq]; });
  const gemAt = (pn, x, y, ang, len, w, M) => {   // 拉长的晶柱：平底、尖头，中轴一条发光线
    const c = Math.cos(ang), s = Math.sin(ang), P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    pn.poly([P(0, -w), P(len * 0.72, -w), P(len, 0), P(len * 0.72, w), P(0, w)]).paint(M.steel);
    pn.ln(...P(0.6, 0), ...P(len * 0.8, 0), M.fire[3], pn.hi ? 2 : 1);
  };
  const branch = (pn, B, r0, r1, amp, ph, ramp, twigs) => {   // 沿骨骼画一根扭曲的枝：横向摆动 amp，两端回到轴线
    const N = 9, pt = (i) => B.p(B.len * i / N, amp * Math.sin(i * 1.25 + ph) * Math.sin(Math.PI * i / N));
    for (let i = 1; i <= N; i++) { const a = pt(i - 1), b = pt(i), r = r0 + (r1 - r0) * i / N; pn.cap(a[0], a[1], b[0], b[1], r); }
    pn.paint(ramp, { bevel: 'l' });
    if (pn.hi) for (let i = 1; i < N; i++) { const a = pt(i), r = r0 + (r1 - r0) * i / N; pn.ln(a[0] - r * 0.3, a[1] - r * 0.8, a[0] + r * 0.2, a[1] + r * 0.8, ramp[1]); }
    for (const [t, f, l] of twigs || []) { const a = pt(N * t), e = B.p(B.len * t + l * 0.5, f); pn.cap(a[0], a[1], e[0], e[1], 0.6).paint(ramp, { bevel: 'l' }); }
  };
  const CRYSTAL = {
    hipY: 14, bob: 3,
    leg(pn, L, ph, o) {
      const M = L.M, g = gait(o, ph, 7.5, 5.5);
      const [kx, ky, ex, ey] = ik(L.hx, L.hy, L.hx + 1 + g.x, L.gy - 4.8 - g.lift, 14.5, 15, 1);
      const T = bone(L.hx, L.hy, kx, ky), S = bone(kx, ky, ex, ey), F = frame(ex, ey, g.tilt);
      // 脚：扁平岩板，前掌翘起，趾尖嵌一根晶柱
      pn.poly(F.pts([[-7, 3.6], [-5.4, 0.8], [0.6, 1.4], [5.6, 0], [10.4, 2.6], [9.8, 4.8], [-6.6, 4.8]])).paint(M.steel);
      pn.poly(F.pts([[-6.6, 3.8], [9.8, 3.8], [9.8, 4.8], [-6.6, 4.8]])).paint(M.dark, { outline: false, bevel: '' });
      if (pn.hi) { pn.ln(...F.p(-2, 1.6), ...F.p(-0.6, 3.6), M.iron[1]); pn.ln(...F.p(4, 0.8), ...F.p(3, 3), M.iron[1]); }
      { const q = F.p(7, 1.6); gemAt(pn, q[0], q[1], -1.2 + g.tilt, 5, 1.3, M); }
      // 小腿：细枯枝 + 背面一簇晶体
      const sb = S.p(S.len * 0.34, -1.4), back = Math.atan2(Math.cos(S.ang), -Math.sin(S.ang));
      gemAt(pn, sb[0], sb[1], back - 0.55, 6, 1.4, M); gemAt(pn, sb[0], sb[1], back + 0.35, 8, 1.7, M); gemAt(pn, sb[0], sb[1], back - 0.05, 5, 1.2, M);
      branch(pn, S, 2.6, 1.8, 1.0, 1.7, M.iron, [[0.62, 4.6, 3]]);
      pn.disc(ex, ey, 2.2).paint(M.iron); pn.dot(ex - 0.7, ey - 0.7, M.iron[3]);
      // 大腿：粗枯枝，断茬小枝
      branch(pn, T, 3.8, 2.7, 1.4, 0.4, M.iron, [[0.35, -5.6, 3.5], [0.7, 5.4, 3]]);
      // 膝：岩石 + 发光宝石
      pn.poly(rockPoly(kx, ky, 5, 9, 0.7)).paint(M.steel);
      if (pn.hi) { pn.ln(kx - 3, ky - 1, kx + 0.5, ky + 1.6, M.iron[1]); pn.ln(kx + 0.5, ky + 1.6, kx + 3.4, ky - 0.4, M.iron[1]); }
      pn.poly([[kx - 1.8, ky - 0.4], [kx + 0.4, ky - 2.4], [kx + 2.4, ky - 0.4], [kx + 0.4, ky + 2.2]]).paint([M.fire[0], M.fire[1], M.fire[2], M.fire[3]], { bevel: 'l' });
      // 胯：小岩块
      pn.poly(rockPoly(L.hx, L.hy, 3.9, 8, 2.1)).paint(M.steel); pn.disc(L.hx, L.hy, 1.2).paint(M.fire, { outline: false, bevel: '' });
    },
  };

  DESIGNS.push(
    { id: 'steamman', q: -1, name: '蒸汽人', sub: '汽缸腿 · 圆头靴', d: STEAMMAN, note: '' },
    { id: 'bellows', q: -1, name: '风箱腿', sub: '风箱膝 · 铸造锥腿 · 圆盘脚', d: BELLOWS, note: '' },
    { id: 'panto', q: -1, name: '缩放仪平行腿', sub: '平行四连杆 · 脚板水平', d: PANTO, note: '' },
    { id: 'crystal', q: -1, name: '晶枝腿', sub: '枯枝 · 岩石 · 宝石', d: CRYSTAL, note: '' },
    { id: 'templar', q: -1, name: '圣堂骑士腿', sub: '羽翼护膝 · 能量脉 · 罩袍', d: TEMPLAR, note: '' },
    { id: 'mail', q: -1, name: '锁甲骑士腿', sub: '锁甲 · 圆护膝 · 鸭嘴靴', d: MAIL, note: '' });


  // ---------- 一格底盘 ----------
  // L = 一条腿的挂点；hx 可覆盖（整段巨腿模式下腿不在格子里的固定位置）
  const legAt = (D, far, x, y, o, hx) => ({
    far, M: far ? FAR : NEAR, x, y: y + o.bd,
    hx: hx != null ? hx : x + (far ? 30 : 16), hy: y + (D.hipY || 14) + o.bd - (far ? 3 : 0),
    gy: y + 47 - (far ? 3 : 0) + ((far ? o.g1 : o.g0) || 0),   // 悬挂：这只脚往下伸（正）/ 往上收（负）
  });
  // 腿长倍率 k：以胯为支点放大整条腿（和挂在胯上的甲片），横梁不变
  function drawLeg(pn, D, L, o, k) {
    const ph = L.far ? Math.PI : 0, back = pn.around(k || 1, L.hx, L.hy);
    D.leg(pn, L, ph, o); if (D.over) D.over(pn, L, ph, o);
    back();
  }
  // part: 'far' 只画远侧腿 / 'near' 只画横梁 + 近侧腿 / 省略 = 都画；o.noLegs 只画横梁（巨腿模式另外画腿）
  function drawCell(pn, g, D, x, y, o, part) {
    if (D.game) return D.draw(pn, g, x, y, o, part);
    if (part !== 'near' && !o.noLegs) drawLeg(pn, D, legAt(D, true, x, y, o), o, o.k);
    if (part === 'far') return;
    const L = legAt(D, false, x, y, o);
    D.beam(pn, x, y + o.bd, o);
    if (D.mid) D.mid(pn, L, o);
    if (!o.noLegs) drawLeg(pn, D, L, o, o.k);
  }

  // 步态状态 → 每格的绘制参数（同 sprites.js：12 帧一循环、每走 5px 换一帧；相邻格错开半个周期）
  function cellOpts(D, st, ri, rn, extra) {
    const N = st.frames, gf = st.mv ? SA.Dyn.frame(st.phase, N, 60 / N) : 0, a = gf / N * TAU;
    const amp = D.d.bob == null ? 3 : D.d.bob;
    return {
      mv: st.mv, a: a + ri * Math.PI, bd: amp - Math.round(Math.abs(Math.sin(a)) * amp),
      q: gf * 60 / N, phase: st.phase, fl: Math.floor(st.t * 8) % 4, ri, rn,
      connL: ri > 0, connR: ri < rn - 1, k: st.k || 1, ...extra,
    };
  }
  // 地面高度（格子坐标）：胯 + 腿长 × 倍率；现役精灵不缩放
  const groundY = (e, k) => (e.d.game ? 47 : (e.d.hipY || 14) + (47 - (e.d.hipY || 14)) * k);

  // ---------- 蜘蛛腿（四足） ----------
  // 每格两条：近侧一条、远侧一条，往前后张开。H.up = 膝盖高出胯多少（用膝高区分型号），H.kx 膝盖往外伸，H.reach 脚往外伸。
  // 脚到膝盖之间的小腿长度可变：悬挂伸缩时脚跟着地面走，小腿自己拉长缩短
  function spiderLeg(pn, M, hx, hy, gy, dir, ph, o, H) {
    const g = gait(o, ph, H.stride || 5, H.lift || 4);
    const fx = hx + dir * H.reach + g.x, fy = gy - g.lift;
    const kx = hx + dir * H.kx + g.x * (H.kf || 0.3), ky = hy - H.up - g.lift * 0.6;   // kf：膝盖跟着脚摆多少
    const F = bone(hx, hy, kx, ky), t = H.w || 1;   // t：腿的粗细倍数（新版四足用，游戏里现有的蜘蛛腿是 1）
    pn.disc(hx, hy, 3.2 * t).paint(M.iron); pn.disc(hx, hy, 1.2 * t).paint(M.brass, { outline: false });   // 髋关节毂先画：股节、胫节压在它前面
    pn.poly(F.pts([[0, -2.6 * t], [0, 2.6 * t], [F.len, 3.4 * t], [F.len, -3.4 * t]])).paint(M.leg);
    if (F.len > 14) pn.ln(...F.p(2, 0), ...F.p(F.len - 3, 0), M.leg[3]);
    const B = bone(kx, ky, fx, fy), a = B.len * 0.3;
    pn.poly(B.pts([[-1, -3.6 * t], [-1, 3.6 * t], [B.len * 0.45, 2.8 * t], [B.len - 3, 1.2 * t], [B.len + 1, 0], [B.len - 3, -1.2 * t], [B.len * 0.45, -2.4 * t]])).paint(M.leg);
    pn.poly(B.pts([[a - 0.9, -3.1 * t], [a + 0.9, -3.1 * t], [a + 0.9, 3.1 * t], [a - 0.9, 3.1 * t]])).paint(M.brass, { outline: false });
    pn.disc(kx, ky, 3.4 * t).paint(M.iron); pn.dot(kx - 1, ky - 1, M.iron[3]);
  }
  // 蜘蛛机身（一格）：压低的梯形甲壳，相邻同类格子连成一片
  function carapace(pn, x, y, connL, connR, top, w = 48) {
    pn.fill(x, y, w, 3, P.iron[1]); pn.fill(x, y + 2, w, 1, P.iron[0]);
    if (!top) { pn.fill(x, y, w, 1, P.iron[0]); pn.fill(x, y + 1, w, 1, P.iron[3]); }
    const x0 = connL ? x - 4 : x + 2, x1 = connR ? x + w + 4 : x + w - 2;
    pn.poly([[x0, y + 3], [x1, y + 3], [x1 - (connR ? 0 : 3), y + 14], [x0 + (connL ? 0 : 3), y + 14]]).paint(NEAR.dark, { clip: [x, x + w] });
    for (let k = 8; k < w; k += 16) pn.fill(x + k, y + 5, 1, 8, P.dark[0]);
    rivet(pn, x + 3, y + 6); rivet(pn, x + w - 6, y + 6);
    pn.fill(x0 < x ? x : x0 + 1, y + 11, Math.min(x1, x + w) - Math.max(x0, x) - 1, 1, P.brass[1]);
  }
  // 蜘蛛型号：伏地蛛 = 四足 T1（矮、宽、稳），高脚蛛 = 膝盖高出机身一大截
  const SPIDERS = {
    crawl: { name: '伏地蛛', up: 12, kx: 15, reach: 30 },
    tall: { name: '高脚蛛', up: 30, kx: 12, reach: 24 },
  };

  // ================= 新版整件底盘（四足 4×2、真双足 2×4）：只管外观和动画，坐标都是模块左上角 =================

  // 步幅（新版整件底盘，世界像素）：跟着车速变，慢走小步、快跑大步，脚在胯前后 ±步幅之间摆（跨过腿的轴线）
  const strideFor = (v) => Math.max(16, Math.min(40, 18 + v * 0.25));
  // 四足整件的步幅：小碎步，最多 ±13px，脚不出这一件的边界（战斗里按它推进步态角，脚不打滑）
  // 2026-09-29 六档进游戏：步幅加大、步频降低——慢走 14px、快跑 24px（原来 8～13），步态仍按距离推进（一整步 = 4 × 步幅），同样车速下步频更低
  const quadStride = (v) => Math.max(14, Math.min(24, 14 + v * 0.12));
  // 机身起伏：着地的腿像圆规一样绕脚转，脚离胯越远胯越低（R = 胯到脚的腿长）。phs = 各条腿的相位差，dx0 = 脚静止时离胯多远
  function strideBob(o, R, phs, dx0 = 0) {
    if (!o.mv) return 0;
    let d = 0;
    for (const ph of phs) {
      const g = plantGait(o, ph, o.stride || 15, 1);
      if (g.lift > 0) continue;
      const x = g.x + dx0;
      d = Math.max(d, R - Math.sqrt(Math.max(0, R * R - x * x)));
    }
    return Math.round(d);
  }
  // 机身起伏（2026-09-29）：对角两腿交替着地时（双支撑）最低、一对腿撑在胯正下方时最高，每步两次；幅度 2～3px 跟步幅变（o.amp 可覆盖，半人马 4.5）
  const quadBob = (o) => (o.mv ? Math.round((o.amp != null ? o.amp : 2 + ((o.stride || 14) - 14) / 10) * (1 - Math.abs(Math.sin(o.a || 0)))) : 0);
  const bipedBob = (o) => strideBob(o, 58, [0, Math.PI], 4);

  // 四足型号：腿形。reach = 脚静止时离胯多远（小 → 脚在胯下附近前后大幅摆动），kf = 膝盖跟着脚摆多少。伏地蛛矮宽稳，高脚蛛膝盖高出机身一大截
  // 伏地蛛的膝盖只比胯高一点、贴着甲壳上沿（2026-09-26）：原来膝盖高出机身 16px，会挡住车身两侧的模块和摆放格
  // 脚收在整件范围里（2026-09-26）：膝盖往外张、脚往回收，静止时脚离胯 4px，加上四足自己的小步幅（quadStride ≤ 13），
  // 走起来脚也不会伸出这一件的左右边界（原来脚伸出去四五十像素，车头车尾的腿像走出了车外）
  const QUADS = {
    crawl: { name: '伏地蛛', up: 5, kx: 10, reach: 4, kf: 0.45, w: 1.35 },
    tall: { name: '高脚蛛', up: 38, kx: 16, reach: 18, kf: 0.45, w: 1.25 },
  };
  // 四足 · 4×2（96×48）：一整块压低的蜘蛛甲壳 + 四条腿（近侧后 / 前、远侧后 / 前）。后腿往后张、前腿往前张，
  // 对角两条同相（近后 + 远前、近前 + 远后）大步交替。远侧腿压暗、往右上错开，画在车体后面。
  // o：{ mv, a（步态角）, stride（步幅，见 strideFor）, bd（机身起伏，见 quadBob）, g: [近后, 近前, 远后, 远前]（悬挂伸缩）, top（上面压着模块）, look: QUADS 的键 }
  // 接地点（模块内 x，静止时，伏地蛛）：近后 18、近前 78、远后 20、远前 80；走起来在这前后 ±步幅（quadStride）
  // part：'far' 只画远侧两条腿 / 'near' 只画甲壳 + 近侧两条腿 / 'shell' 只画甲壳 / 'legs' 只画近侧两条腿 / 省略 = 都画
  // connL / connR：左右紧挨着另一件四足（首尾相连的车体蜈蚣），甲壳连成一片
  const QUAD_HIPS = { nr: [22, 10], nf: [74, 10], fr: [24, 7], ff: [76, 7] };   // 远侧只往右错 2px，远侧的膝和脚也不出界
  function quadArt(pn, x, y, o, part) {
    const H = QUADS[o.look] || QUADS.crawl, bd = o.bd || 0, g = o.g || [0, 0, 0, 0], S = o.stride || 15;
    const lo = { ...o, plant: true, plantS: S, plantH: 5 + 0.3 * S };
    const leg = (M, [hx, hy], gy, dir, ph) => spiderLeg(pn, M, x + hx, y + hy + bd, gy, dir, ph, lo, H);
    if (!part || part === 'far') { leg(FAR, QUAD_HIPS.fr, y + 45 + g[2], -1, Math.PI); leg(FAR, QUAD_HIPS.ff, y + 45 + g[3], 1, 0); }
    if (part === 'far') return;
    if (part !== 'legs') {
      carapace(pn, x, y + bd, !!o.connL, !!o.connR, o.top, 96);
      pn.fill(x + 44, y + bd + 5, 8, 6, P.dark[0]); pn.fill(x + 45, y + bd + 6, 6, 4, P.brass[1]); pn.fill(x + 45, y + bd + 6, 6, 1, P.brass[3]);   // 甲壳正中的黄铜舱盖
    }
    if (part === 'shell') return;
    leg(NEAR, QUAD_HIPS.nr, y + 48 + g[0], -1, 0); leg(NEAR, QUAD_HIPS.nf, y + 48 + g[1], 1, Math.PI);
  }

  // 胯：腰部回转环（刻痕随步伐转）+ 倒梯形胯体 + 陀螺仪窗；左右腰挂位有模块时，胯体伸出同材质的法兰板压住，一颗大铆钉固定。
  // (cx, Y) = 胯列中心、胯顶。o：{ legId（决定胯的材质）, wL, wR, phase, t（陀螺转动）, tilt（陀螺偏向，平衡系统用）, wob（晃动幅度） }
  const PELVIS_MAT = { knight: 'steel', tabard: 'steel', templar: 'steel', mail: 'steel', skirt: 'steel', clock: 'brass', dragon: 'fire' };
  function ellipse(pn, cx, cy, rx, ry, tilt, front, back) {
    const n = 36, c = Math.cos(tilt), s = Math.sin(tilt);
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pn.dot(cx + x * c - y * s, cy + x * s + y * c, Math.sin(a) > 0 ? front : back);
    }
  }
  // ---------- 腰胯（真双足上两行的躯干）7 种新设计 + 现役对照 ----------
  // 每一种都画在同一块 48 宽的区域里（cx = 胯列中心，Y = 胯顶）：顶上 34 宽的黄铜环和上面的模块接（高 6），底下 Y+31 附近是腿的挂点（近侧 cx-2、远侧 cx+6），
  // 所以每一种胯的下沿都留出安装两只腿的位置；机构都是真的：连杆、曲柄、齿轮、滚珠按几何和步态角画，不是贴图。
  const hipRamp = (legId) => { const m = PELVIS_MAT[legId]; return m === 'steel' ? NEAR.steel : m === 'brass' ? NEAR.brass : NEAR.iron; };
  const ell = (pn, cx, cy, rx, ry, tilt, front, back) => {
    const n = 36, c = Math.cos(tilt), s = Math.sin(tilt);
    for (let k = 0; k < n; k++) { const a = k / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pn.dot(cx + x * c - y * s, cy + x * s + y * c, Math.sin(a) > 0 ? front : back); }
  };
  const topRing = (pn, cx, Y, o) => {   // 和上面模块相接的黄铜环（刻痕随步伐转）
    pn.rect(cx - 17, Y - 1, 34, 6).paint(NEAR.brass);
    const sp = Math.floor((o.phase || 0) / 3);
    for (let k = 0; k < 6; k++) pn.fill(cx - 16 + ((k * 6 + sp) % 32 + 32) % 32, Y + 1, 1, 3, P.brass[0]);
  };
  const neck = (pn, cx, Y) => pn.poly([[cx - 9, Y + 30], [cx + 9, Y + 30], [cx + 5, Y + 36], [cx - 5, Y + 36]]).paint(NEAR.dark);
  const trap = (pn, cx, Y, R, w0 = 20, w1 = 13, y0 = 5, y1 = 31) => pn.poly([[cx - w0, Y + y0], [cx + w0, Y + y0], [cx + w1, Y + y1], [cx - w1, Y + y1]]).paint(R);
  const drive = (o) => (o.mv ? (o.a || 0) * 1.5 : (o.t || 0) * 1.4);   // 机构的转角：走起来跟步态角，站着时慢慢空转

  // 注意：腿的胯关节盘（半径约 7～10 像素）压在 Y+22 以下的中间位置，所以机构都放在上面的 Y+5 ～ Y+22 这条带子里（左右两侧也可以用）。
  const HIPS = [
    { id: 'gyro', name: '现役 · 陀螺仪', sub: '对照：回转环 + 倒梯形 + 陀螺窗', draw: (pn, cx, Y, o) => pelvisGyro(pn, cx, Y, o) },

    // H1 万向陀螺：三层万向环（外环固定、中环绕竖轴转、内环绕横轴转），中心一颗飞轮转子——真陀螺仪的结构
    { id: 'gimbal', name: '万向陀螺', sub: '三层万向环，中环 / 内环各绕一根轴转', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId);
      topRing(pn, cx, Y, o); trap(pn, cx, Y, R); neck(pn, cx, Y);
      rivet(pn, cx - 18, Y + 7); rivet(pn, cx + 15, Y + 7);
      const gy = Y + 14, t = o.t || 0, tilt = (o.wob == null ? 0.04 : o.wob) * Math.sin(t * 9) + (o.tilt || 0);
      pn.disc(cx, gy, 9.6).paint(NEAR.dark, { bevel: 's' });
      ell(pn, cx, gy, 8.8, 8.8, 0, P.brass[3], P.brass[1]); ell(pn, cx, gy, 8, 8, 0, P.brass[2], P.brass[1]);   // 外环（固定，正对着我们）
      pn.fill(cx - 0.5, gy - 9.6, 1, 2, P.brass[2]); pn.fill(cx - 0.5, gy + 7.8, 1, 2, P.brass[2]);           // 外环 / 中环的竖轴销
      const s1 = t * 5, rx = 0.8 + 6.4 * Math.abs(Math.cos(s1));
      ell(pn, cx, gy, rx, 6.6, tilt, P.brass[3], P.brass[1]); ell(pn, cx, gy, Math.max(0.5, rx - 1), 6.6, tilt, P.brass[2], P.brass[0]);   // 中环：绕竖轴
      const s2 = t * 8, ry = 0.8 + 3.8 * Math.abs(Math.cos(s2));
      ell(pn, cx, gy, 4, ry, tilt, P.brass[3], P.brass[1]);                                                     // 内环：绕横轴
      pn.disc(cx, gy, 2).paint(NEAR.brass, { bevel: 'l' }); pn.dot(cx - 0.8, gy - 0.8, P.brass[3]);
    } },

    // H2 球窝髋：一颗大黄铜球关节嵌在带压盖螺栓的钢承窝里；球上有经线纬线，随步态转
    { id: 'ball', name: '球窝髋', sub: '黄铜球关节 + 钢承窝 + 压盖螺栓', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId);
      topRing(pn, cx, Y, o); trap(pn, cx, Y, R, 20, 15, 5, 31); neck(pn, cx, Y);
      const bx = cx + 1, by = Y + 14.5, rot = drive(o) * 0.5;
      pn.disc(bx, by, 10.4).paint(NEAR.steel, { bevel: 's' });                                                    // 承窝（钢）
      pn.disc(bx, by, 8.6).paint(NEAR.dark, { outline: false, bevel: 's' });
      pn.disc(bx, by, 8).paint(NEAR.brass);                                                                       // 球
      ell(pn, bx, by, Math.max(0.6, 7.8 * Math.abs(Math.sin(rot))), 7.8, 0, P.brass[0], P.brass[1]);                // 经线
      ell(pn, bx, by, 7.8, 2.2 + Math.sin(rot * 0.7) * 1.1, 0, P.brass[0], P.brass[1]);                             // 纬线
      pn.dot(bx - 3, by - 3.6, P.brass[3]); pn.dot(bx - 2, by - 4.2, P.brass[3]);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; if (Math.sin(a) > 0.55) continue; rivet(pn, bx + Math.cos(a) * 9.6 - 1, by + Math.sin(a) * 9.6 - 1); }   // 压盖螺栓
    } },

    // H3 蒸汽缸曲柄：左右各一只蒸汽缸，活塞杆经十字头、连杆推曲柄盘（两缸曲柄错 90°，就是蒸汽机车的传动）
    { id: 'cyl', name: '蒸汽缸曲柄', sub: '双缸 · 十字头 · 连杆 · 曲柄盘', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId), th = drive(o) * 1.3, cyy = Y + 13.5, rc = 2.6, Lr = 11;
      topRing(pn, cx, Y, o);
      trap(pn, cx, Y, R, 15, 12.5, 5, 31); neck(pn, cx, Y);
      for (const [side, ph2] of [[-1, 0], [1, Math.PI / 2]]) {
        const a = th + ph2, px = cx + Math.cos(a) * rc, py = cyy + Math.sin(a) * rc;
        const xh = px + side * Math.sqrt(Lr * Lr - (py - cyy) ** 2);            // 十字头在缸轴上的位置
        pn.rect(cx + side * 10 - (side > 0 ? 0 : 11), cyy - 5, 11, 10).paint(NEAR.iron);   // 缸体
        pn.rect(cx + side * 21 - (side > 0 ? 0 : 3), cyy - 6, 3, 12).paint(NEAR.brass);    // 缸盖
        pn.rect(cx + side * 10 - (side > 0 ? 0 : 2), cyy - 3, 2, 6).paint(NEAR.dark, { outline: false, bevel: '' });
        pn.cap(cx + side * 10, cyy, xh, cyy, 0.8).paint(NEAR.steam, { bevel: 'l' });   // 活塞杆
        pn.rect(xh - 1.4, cyy - 1.8, 2.8, 3.6).paint(NEAR.brass);                       // 十字头
        pn.cap(xh, cyy, px, py, 0.7).paint(NEAR.steel, { bevel: 'l' });                 // 连杆
      }
      pn.disc(cx, cyy, 4.6).paint(NEAR.brass); pn.disc(cx, cyy, 1.4).paint(NEAR.dark, { outline: false, bevel: '' });
      for (const ph2 of [0, Math.PI / 2]) { const a = th + ph2; pn.disc(cx + Math.cos(a) * rc, cyy + Math.sin(a) * rc, 0.9).paint(NEAR.steel, { bevel: 'l' }); }
    } },

    // H4 差速齿轮：胯体开一扇窗，露出咬合的齿轮组（转速比 = 齿数比反过来）
    { id: 'diff', name: '差速齿轮', sub: '开窗露出咬合的齿轮组', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId), th = drive(o);
      topRing(pn, cx, Y, o); trap(pn, cx, Y, R); neck(pn, cx, Y);
      pn.rect(cx - 17, Y + 6, 34, 16).paint(NEAR.dark, { bevel: 's' });
      const nA = 12, nB = 11, rA = 6.4, rB = 5.8, ay = Y + 14;
      const ax = cx - 8, bx = ax + rA + rB + 0.2;
      gear(pn, ax, ay, rA, nA, th, NEAR.brass, NEAR.iron);
      gear(pn, bx, ay, rB, nB, -th * nA / nB + Math.PI / nB, NEAR.steel, NEAR.iron);
      gear(pn, bx + 6.1, ay - 5.1, 2.2, 5, th * nB / 5 + 0.5, NEAR.brass, NEAR.iron);
      pn.fill(cx - 17, Y + 6, 34, 1, P.brass[2]); pn.fill(cx - 17, Y + 21, 34, 1, P.brass[1]);
    } },

    // H5 飞轮 + 瓦特调速器：飞轮经皮带带动竖轴，两只飞球随转速甩开（飞球高度 = 连杆几何：套筒 y = 2·l·cosφ）
    { id: 'governor', name: '飞轮调速器', sub: '飞轮 + 皮带 + 瓦特飞球', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId), th = drive(o), fast = o.mv ? 1 : 0;
      topRing(pn, cx, Y, o); trap(pn, cx, Y, R, 20, 14, 5, 31); neck(pn, cx, Y);
      const gx = cx + 13, top = Y + 7, base = Y + 21, phi = 0.5 + fast * 0.4 + Math.sin((o.t || 0) * 3) * 0.04, la = 7, lk = 4.2;
      const fx = cx - 12, fy = Y + 14;
      pn.ln(fx + 1, fy + 7.4, gx - 2, base + 1, P.dark[0]); pn.ln(fx + 2, fy + 8.2, gx - 1.6, base + 2, P.dark[0]);      // 皮带
      pn.disc(fx, fy, 8).paint(NEAR.dark, { bevel: 's' });
      pn.disc(fx, fy, 6.8).paint(NEAR.brass);
      pn.disc(fx, fy, 4.6).paint(NEAR.dark, { outline: false, bevel: 's' });
      for (let k = 0; k < 6; k++) { const a = th * 1.4 + k / 6 * TAU; pn.cap(fx, fy, fx + Math.cos(a) * 5.6, fy + Math.sin(a) * 5.6, 0.55); }
      pn.paint(NEAR.brass, { outline: false, bevel: '' });
      pn.disc(fx, fy, 1.5).paint(NEAR.steel, { bevel: 'l' });
      pn.cap(gx, top, gx, base, 0.9).paint(NEAR.steel, { bevel: 'l' });
      const sy = top + 2 * lk * Math.cos(phi);
      for (const s of [-1, 1]) {
        const bxx = gx + s * la * Math.sin(phi), byy = top + la * Math.cos(phi), ax = gx + s * lk * Math.sin(phi), ay = top + lk * Math.cos(phi);
        pn.cap(gx, top, bxx, byy, 0.55).cap(ax, ay, gx, sy, 0.5).paint(NEAR.brass, { bevel: 'l' });
        pn.disc(bxx, byy, 1.9).paint(NEAR.iron, { bevel: 'l' });
      }
      pn.disc(gx, top, 1.1).paint(NEAR.brass, { bevel: 'l' }); pn.rect(gx - 1.7, sy - 0.6, 3.4, 1.8).paint(NEAR.brass);
      pn.disc(gx, base - 0.5, 2).paint(NEAR.iron, { bevel: 'l' });
    } },

    // H6 马车板簧悬挂：胯体是一块「车厢」，用吊环挂在一副多层叠板簧（弓形）两端，腿挂在簧中央——维多利亚马车的悬挂
    { id: 'spring', name: '板簧悬挂', sub: '车厢挂在多层叠板簧上，腿挂在簧中央', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId), t = o.t || 0, flex = o.mv ? 1 * Math.sin((o.a || 0) * 2) : 0.5 * Math.sin(t * 3);
      topRing(pn, cx, Y, o);
      pn.poly([[cx - 20, Y + 5], [cx + 20, Y + 5], [cx + 18, Y + 15], [cx - 18, Y + 15]]).paint(R);      // 车厢
      rivet(pn, cx - 17, Y + 7); rivet(pn, cx + 14, Y + 7);
      pn.disc(cx, Y + 10, 3.8).paint(NEAR.dark, { bevel: 's' }); ell(pn, cx, Y + 10, 3, 3, 0, P.brass[2], P.brass[1]);
      const ang = t * 7; pn.ln(cx - Math.cos(ang) * 2.6, Y + 10 - Math.sin(ang) * 2.6, cx + Math.cos(ang) * 2.6, Y + 10 + Math.sin(ang) * 2.6, P.brass[3]);
      // 板簧：弓形（两端上翘挂在车厢下，中央最低压着腿）。最长一片在最外（最下）
      const sag = 9 + flex, yEnd = Y + 19;
      for (let k = 0; k < 5; k++) {
        const w = 23 - k * 3.8, off = -k * 1.5;
        for (let i = 0; i < 16; i++) {
          const u0 = -w + 2 * w * i / 16, u1 = -w + 2 * w * (i + 1) / 16;
          const yf = (u) => yEnd + off + sag * (1 - Math.min(1, (u / 23) ** 2));
          pn.cap(cx + u0, yf(u0), cx + u1, yf(u1), 0.8);
        }
        pn.paint(k === 0 ? NEAR.iron : NEAR.steel, { bevel: 'l' });
      }
      for (const s of [-1, 1]) {   // 吊环：车厢下角 → 簧端环眼
        pn.cap(cx + s * 17.5, Y + 15, cx + s * 22.6, yEnd - 0.4, 0.9).paint(NEAR.brass, { bevel: 'l' });
        pn.disc(cx + s * 22.6, yEnd, 1.5).paint(NEAR.brass, { bevel: 'l' });
      }
      pn.rect(cx - 5, Y + 21, 10, 7).paint(NEAR.brass); rivet(pn, cx - 4, Y + 22); rivet(pn, cx + 1, Y + 22);   // 中央夹块（U 形螺栓）
      pn.poly([[cx - 9, Y + 28], [cx + 9, Y + 28], [cx + 6, Y + 36], [cx - 6, Y + 36]]).paint(NEAR.dark);
    } },

    // H7 回转环滚珠座圈：上面一块转台，下面一圈滚珠座圈（前半圈的滚珠随步态滚过），底下是固定的下座——坦克炮塔座圈的思路
    { id: 'race', name: '滚珠座圈', sub: '炮塔式座圈 + 一圈滚珠 + 驱动小齿轮', draw(pn, cx, Y, o) {
      const R = hipRamp(o.legId), th = drive(o) * 0.9;
      topRing(pn, cx, Y, o);
      pn.poly([[cx - 20, Y + 5], [cx + 20, Y + 5], [cx + 21, Y + 11], [cx - 21, Y + 11]]).paint(R);      // 转台
      rivet(pn, cx - 18, Y + 6); rivet(pn, cx + 15, Y + 6);
      pn.rect(cx - 21, Y + 11, 42, 9).paint(NEAR.dark, { bevel: 's' });                                        // 座圈槽
      pn.fill(cx - 21, Y + 11, 42, 1, P.brass[2]); pn.fill(cx - 21, Y + 19, 42, 1, P.brass[1]);
      const nb = 9;
      for (let k = 0; k < nb; k++) {                                                                       // 滚珠：绕座圈中心转，只画在前半圈
        const a = th + k / nb * TAU, s = Math.sin(a);
        if (s < -0.05) continue;
        pn.disc(cx + Math.cos(a) * 18, Y + 15.4 + s * 1.2, 2).paint([P.iron[0], P.iron[3], P.iron[4], '#e6eaf0'], { bevel: 'l' });
      }
      pn.poly([[cx - 19, Y + 20], [cx + 19, Y + 20], [cx + 13, Y + 31], [cx - 13, Y + 31]]).paint(R);      // 下座
      neck(pn, cx, Y);
      gear(pn, cx + 19, Y + 24, 3.4, 8, -th * 2, NEAR.brass, NEAR.iron);                                    // 驱动转台的小齿轮（在下座外侧）
    } },
  ];

  // 每种腿配哪种腰胯（用户 2026-09-29 定）：T1 差速齿轮 · T2 蒸汽缸 · T3 飞轮调速器 · T4 蒸汽圣骑球窝髋（锁甲 / 缩放仪板簧悬挂） · T5 现役陀螺仪 · T6 万向陀螺；球窝髋给圣堂系列，滚珠座圈给裙甲堡
  const HIP_OF = { mk2: 'diff', wheel: 'cyl', heron: 'cyl', stilt: 'cyl', gren: 'governor', blade: 'governor', skirt: 'race', knight: 'ball', tabard: 'ball', templar: 'ball', mail: 'spring', panto: 'spring', clock: 'gyro', steamman: 'gyro', bellows: 'gyro', dragon: 'gimbal', crystal: 'gimbal' };

  function pelvisGyro(pn, cx, Y, o = {}) {
    const mat = PELVIS_MAT[o.legId] || 'iron';
    const R = mat === 'steel' ? NEAR.steel : mat === 'brass' ? NEAR.brass : NEAR.iron;
    for (const side of [-1, 1]) if (side < 0 ? o.wL : o.wR) {
      pn.poly([[cx + side * 17, Y + 7], [cx + side * 30, Y + 9], [cx + side * 30, Y + 23], [cx + side * 15, Y + 26]]).paint(R);
      pn.disc(cx + side * 25, Y + 16, 2.4).paint(NEAR.brass);
    }
    pn.rect(cx - 17, Y - 1, 34, 6).paint(NEAR.brass);
    const sp = Math.floor((o.phase || 0) / 3);
    for (let k = 0; k < 6; k++) pn.fill(cx - 16 + ((k * 6 + sp) % 32 + 32) % 32, Y + 1, 1, 3, P.brass[0]);
    pn.poly([[cx - 20, Y + 5], [cx + 20, Y + 5], [cx + 13, Y + 31], [cx - 13, Y + 31]]).paint(R);
    pn.poly([[cx - 9, Y + 30], [cx + 9, Y + 30], [cx + 5, Y + 36], [cx - 5, Y + 36]]).paint(NEAR.dark);
    rivet(pn, cx - 18, Y + 7); rivet(pn, cx + 15, Y + 7);
    const gy = Y + 18, tilt = (o.wob == null ? 0.04 : o.wob) * Math.sin((o.t || 0) * 9) + (o.tilt || 0);
    pn.disc(cx, gy, 8.5).paint(NEAR.dark, { bevel: 's' });
    ellipse(pn, cx, gy, 7, 7, tilt, P.brass[1], P.brass[1]);
    const spin = (o.t || 0) * 7, rx = 0.8 + 5.5 * Math.abs(Math.cos(spin));
    ellipse(pn, cx, gy, rx, 5.5, tilt, P.brass[3], P.brass[1]);
    ellipse(pn, cx, gy, Math.max(0.5, rx - 1), 5.5, tilt, P.brass[2], P.brass[0]);
    pn.ln(cx - Math.sin(tilt) * -7, gy - Math.cos(tilt) * 7, cx + Math.sin(tilt) * -7, gy + Math.cos(tilt) * 7, P.brass[2]);
    pn.disc(cx, gy, 1.6).paint(mat === 'fire' ? NEAR.fire : NEAR.brass, { outline: false });
  }

  // 胯的入口：o.hip（HIPS 的 id）优先，没有就按腿型查 HIP_OF；'gyro' 是原来的回转环 + 陀螺窗。左右腰挂位有模块时先在后面伸出法兰板
  function pelvis(pn, cx, Y, o = {}) {
    const id = o.hip || HIP_OF[o.legId] || 'gyro', H = HIPS.find(h => h.id === id);
    if (!H || id === 'gyro') return pelvisGyro(pn, cx, Y, o);
    const mat = PELVIS_MAT[o.legId], R = mat === 'steel' ? NEAR.steel : mat === 'brass' ? NEAR.brass : NEAR.iron;
    for (const side of [-1, 1]) if (side < 0 ? o.wL : o.wR) {
      pn.poly([[cx + side * 17, Y + 7], [cx + side * 30, Y + 9], [cx + side * 30, Y + 23], [cx + side * 15, Y + 26]]).paint(R);
      pn.disc(cx + side * 25, Y + 16, 2.4).paint(NEAR.brass);
    }
    H.draw(pn, cx, Y, o);
  }

  // 真双足 · 2×4（48×96）：上两行是胯，下两行是一对长腿。腿型沿用 DESIGNS 的六档，以胯为支点放大到地面（胯关节到地面 67px，约 2 倍），
  // 仍是原生像素；步幅按放大倍数折算，脚踩实地不打滑。远侧腿压暗、往右 8px 上 3px，画在躯干后面。
  // o：{ mv, a, stride（步幅，世界像素）, bd（起伏，见 bipedBob）, g: [近侧脚, 远侧脚], legs: DESIGNS 的 id, wL, wR, phase, t, tilt, wob }
  // 接地点（模块内 x，静止时）：近侧 26、远侧 34
  const BIPED_HIP = 29;
  function bipedArt(pn, x, y, o, part) {
    const e = DESIGNS.find(d => d.id === o.legs && !d.d.game) || DESIGNS.find(d => d.id === 'mk2'), D = e.d;
    const cx = x + 24, bd = o.bd || 0, ground = y + 96, g = o.g || [0, 0];
    const k = (96 - BIPED_HIP) / (47 - (D.hipY || 14));
    const S = o.stride || 15, lo = { ...o, plant: true, plantS: S / k, plantH: (4 + 0.3 * S) / k };
    const leg = (far) => {
      const L = legAt(D, far, cx - 24, y, lo, far ? cx + 6 : cx - 2);
      L.hy = y + BIPED_HIP + bd - (far ? 3 : 0);
      L.gy = L.hy + (ground - (far ? 3 : 0) + (far ? g[1] : g[0]) - L.hy) / k;
      drawLeg(pn, D, L, lo, k);
    };
    // part：'far' 远侧腿 / 'near' 胯 + 近侧腿 / 'shell' 只画胯 / 'legs' 只画近侧腿 / 省略 = 都画
    if (!part || part === 'far') leg(true);
    if (part === 'far') return;
    if (part !== 'legs') {
      pelvis(pn, cx, y + bd, { legId: e.id, hip: o.hip, mv: o.mv, a: o.a, wL: o.wL, wR: o.wR, phase: o.phase, t: o.t, tilt: o.tilt, wob: o.wob });
      if (D.mid) { const top = y + bd + 30, back = pn.around(k * 0.8, cx + 2, top); D.mid(pn, { M: NEAR, x: cx - 21.5, y: top - 12 }, lo); back(); }
    }
    if (part !== 'shell') leg(false);
  }

  // 真双足的躯干切角：画好的车体上，把露在外面的角切成斜角，箱子堆读起来像一副躯干（收腰、切肩）。
  // 腰挂和再往上两行（第 ROWS-6 ~ ROWS-3 行）的模块：底下和外侧都空着的底角切 12px（腰挂）/ 9px；所有模块顶上和外侧都空着的顶角切 6px。
  // g = 车体画布（SA.SPR.renderVehicle 的坐标：x = PADX + c × 24，y = r × 24），v = 载具，pc = 胯的列（胯那 2×2 格当作占着）
  function torsoCuts(g, v, pc, padx) {
    const K = SA.K, S = K.CELL, O = SA.V.occ(v, 'body');
    const has = (r, c) => r >= 0 && r < K.ROWS && c >= 0 && c < K.COLS && (!!O[r][c] || (c >= pc && c <= pc + 1 && r >= K.ROWS - 4 && r <= K.ROWS - 3));
    const cut = (x, y, side, n, top) => {
      for (let i = 0; i < n; i++) {
        const w = n - i, yy = top ? y + i : y - 1 - i;
        if (side < 0) { g.clearRect(x, yy, w, 1); g.fillStyle = P.iron[0]; g.fillRect(x + w, yy, 1, 1); }
        else { g.clearRect(x - w, yy, w, 1); g.fillStyle = P.iron[0]; g.fillRect(x - w - 1, yy, 1, 1); }
      }
    };
    SA.V.each(v, (cell, r, c, layer) => {
      if (layer !== 'body' || SA.isRam(cell.id)) return;
      const f = SA.fp(cell.id), b = r + f.h - 1, x0 = padx + c * S, x1 = padx + (c + f.w) * S;
      if (b >= K.ROWS - 6 && b <= K.ROWS - 3) {
        const n = b === K.ROWS - 3 ? 12 : 9;
        if (!has(b + 1, c) && !has(b, c - 1)) cut(x0, (b + 1) * S, -1, n);
        if (!has(b + 1, c + f.w - 1) && !has(b, c + f.w)) cut(x1, (b + 1) * S, 1, n);
      }
      if (!has(r - 1, c) && !has(r, c - 1) && !has(r - 1, c - 1)) cut(x0, r * S, -1, 6, true);
      if (!has(r - 1, c + f.w - 1) && !has(r, c + f.w) && !has(r - 1, c + f.w)) cut(x1, r * S, 1, 6, true);
    });
  }

  return { Pen, DESIGNS, HIPS, HIP_OF, drawCell, drawLeg, legAt, cellOpts, groundY, spiderLeg, carapace, SPIDERS, QUADS, quadArt, pelvis, bipedArt, torsoCuts, strideFor, quadStride, quadBob, bipedBob, U: { NEAR, FAR, gait, plantGait, ik, bone, frame, gear, rivet, flat, yAt } };
})();

// ================= 四足整件六档 + 变体（2026-09-29 进游戏，探索过程见 tools/archive/quad-tiers.html） =================
// 拓扑沿用伏地蛛：一块压低的车体 + 四条腿；胯 (22,10) / (74,10)，远侧 (24,7) / (76,7)，地面在 y+48（远侧 y+45）。
// 每档换腿的构造和车体工艺（T1 工装 Mk.II · T2 桁架爬机 · T3 板簧拖车 · T4 曲柄步行机（温室）· T5 汽锤步行机 · T6 哥特教堂），
// 另有 9 种唯一变体（SET 里 main 不为 true 的），游戏暂时只用六档主线，变体等 astra 定获得方式后按 key 接入（sprites.js 的 quad 支持 look 覆盖）。
// 画腿的规则：腿粗（大腿 6～8px）、按层画（驱动件 → 大腿 → 胯销 → 连杆 → 小腿 → 膝销 → 脚 → 踝销，远侧腿倒序）、机身按步态起伏。
SA.LEGLAB.Q6 = (() => {
  const LL = SA.LEGLAB, U = LL.U, P = SA.PAL, { NEAR, FAR, gait, ik, bone, gear, rivet } = U;
  const TAU = Math.PI * 2;
  const ball = (pn, ramp, x, y, r) => { pn.disc(x, y, r).paint(ramp); if (r > 1.6) pn.dot(x - r * 0.4, y - r * 0.4, ramp[3]); };
  const band = (pn, B, a, w, ramp, t = 0.8) => pn.poly(B.pts([[a - t, -w], [a + t, -w], [a + t, w], [a - t, w]])).paint(ramp, { outline: false, bevel: 'l' });
  const slab = (B, a0, a1, w0, w1) => B.pts([[a0, -w0], [a0, w0], [a1, w1], [a1, -w1]]);   // 沿骨骼的梯形板
  const GLASS = { near: [P.glass[0], P.glass[1], P.glass[2], P.glass[3]], far: [P.black, P.glass[0], P.glass[1], P.glass[2]] };
  const HIPS = { nr: [22, 10], nf: [74, 10], fr: [24, 7], ff: [76, 7] };
  const ell = (pn, cx, cy, rx, ry, tilt, front, back) => {
    const n = Math.max(16, Math.round((rx + ry) * 4)), c = Math.cos(tilt), s = Math.sin(tilt);
    for (let k = 0; k < n; k++) { const a = k / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pn.dot(cx + x * c - y * s, cy + x * s + y * c, Math.sin(a) > 0 ? front : back); }
  };

  // 遮挡层（近侧腿从小到大画；远侧腿倒过来）
  const Z = { DRV: 0, TH: 1, HIP: 2, LNK: 3, SH: 4, KN: 5, FT: 6, AN: 7 };

  // ---------- 腿 ----------
  // c = { pn, M, far, hx, hy, gy, dir（-1 后腿 / 1 前腿）, ph, o（步态参数）, g（gait 结果）, t, L(z, fn) 按层登记 }
  const footOf = (c, H) => [c.hx + c.dir * (H.reach == null ? 4 : H.reach) + c.g.x, c.gy - c.g.lift];
  const kneeOf = (c, H) => [c.hx + c.dir * (H.kx == null ? 10 : H.kx) + c.g.x * (H.kf == null ? 0.45 : H.kf), c.hy - (H.up == null ? 5 : H.up) - c.g.lift * 0.6];
  const hub = (c, r = 3.4) => c.L(Z.HIP, () => { ball(c.pn, c.M.iron, c.hx, c.hy, r); c.pn.disc(c.hx, c.hy, r * 0.38).paint(c.M.brass, { outline: false }); });
  const shoe = (pn, M, F, w = 5, h = 3.4, ramp) => pn.poly([[F[0] - w, F[1]], [F[0] - w + 1.4, F[1] - h], [F[0] + w - 1.4, F[1] - h], [F[0] + w, F[1]]]).paint(ramp || M.leg);
  const boot = (pn, M, F, dir, back, toe, h, ramp) => pn.poly([[F[0] - dir * back, F[1]], [F[0] - dir * back, F[1] - h], [F[0] + dir * (toe - 3.5), F[1] - h], [F[0] + dir * toe, F[1] - 1.6], [F[0] + dir * toe, F[1]]]).paint(ramp || M.leg);

  // 常春藤：沿骨骼 a0～a1 绕一根藤（正弦摆动），每隔 step 长一片叶子（左右交替），偶尔一朵小花。绿色是植物本色，不参与材质换色
  const IVY = ['#1c2616', '#2f4024', '#46592f', '#61744a'];   // 压暗的橄榄绿（v6：原来的压力表绿太艳）；饱和度保持在 0.35 以上，否则材质层会把它当金属换色
  const leafRamp = (far, dark) => (far ? [P.black, IVY[0], IVY[0], IVY[1]] : dark ? [IVY[0], IVY[0], IVY[1], IVY[1]] : IVY);
  const leaf = (pn, x, y, s, far) => pn.poly([[x, y], [x + s * 2.2, y - 1.4], [x + s * 2.8, y + 0.4], [x + s * 1, y + 1.4]]).paint(leafRamp(far), { bevel: 'l' });
  function vine(pn, B, a0, a1, amp, ph, far, step) {
    let q0 = B.p(a0, Math.sin(a0 * 0.7 + ph) * amp);
    for (let a = a0 + 1; a <= a1; a += 1) { const q = B.p(a, Math.sin(a * 0.7 + ph) * amp); pn.cap(q0[0], q0[1], q[0], q[1], 0.55); q0 = q; }
    pn.paint(leafRamp(far, 1), { outline: false, bevel: '' });
    let k = 0;
    for (let a = a0 + 1.5; a < a1; a += step, k++) {
      const f = Math.sin(a * 0.7 + ph) * amp, q = B.p(a, f);
      leaf(pn, q[0], q[1], k % 2 ? 1 : -1, far);
      if (!far && k % 4 === 3) pn.dot(q[0] + (k % 2 ? -1 : 1), q[1] - 1, '#c4b27a');
    }
  }

  const LEGS = {
    // T1 工装 Mk.II：箱形梁大腿 + 跨膝液压撑杆 + 双支杆小腿 + 带肋平脚（脚尖朝外）
    mk2(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H), K = kneeOf(c, H), inn = -dir;
      const B = bone(K[0], K[1], F[0], F[1] - 3.6), n = B.len, T = bone(hx, hy, K[0], K[1]);
      const P1 = T.p(T.len * 0.4, inn * 4), P2 = B.p(n * 0.42, inn * 3.4), D = bone(P1[0], P1[1], P2[0], P2[1]);
      L(Z.TH, () => { pn.poly(slab(T, -2, T.len + 1.5, 4, 3.2)).paint(M.iron); pn.ln(...T.p(1, 0), ...T.p(T.len - 1, 0), M.iron[1]); });
      hub(c, 3.8);
      L(Z.LNK, () => {
        pn.cap(...D.p(D.len * 0.45, 0), ...P2, 0.9).paint(M.steel, { bevel: 'l' });
        pn.cap(...P1, ...D.p(D.len * 0.52, 0), 1.8).paint(M.brass, { bevel: 'l' });
        ball(pn, M.iron, P1[0], P1[1], 1.2); ball(pn, M.iron, P2[0], P2[1], 1.2);
      });
      L(Z.SH, () => {
        for (const s of [-2.4, 2.4]) pn.cap(...B.p(1, s), ...B.p(n, s * 0.5), 1.15);
        pn.paint(M.leg, { bevel: 'l' });
        for (const a of [n * 0.36, n * 0.72]) band(pn, B, a, 3.2, M.iron, 0.8);
      });
      L(Z.KN, () => { ball(pn, M.iron, K[0], K[1], 3.4); pn.dot(K[0], K[1], M.brass[2]); });
      L(Z.FT, () => {
        const x = F[0], y = F[1];
        boot(pn, M, F, dir, 5, 8, 3.4, M.iron);
        for (const u of [-2.5, 0.5, 3.5]) pn.fill(x + dir * u, y - 2.8, 1, 2.4, M.iron[1]);
      });
      L(Z.AN, () => ball(pn, M.iron, ...B.p(n, 0), 1.7));
    },

    // T2 桁架爬机：箱形大腿 + 往下收窄的铆接格构小腿（两根弦杆 + 之字形腹杆，透空），铸铁平底靴
    truss(c, H) {
      const { pn, M, hx, hy, L } = c, F = footOf(c, H), K = kneeOf(c, H);
      const B = bone(K[0], K[1], F[0], F[1] - 3.4), n = B.len, w0 = 5.2, w1 = 2.2, wAt = (a) => w0 + (w1 - w0) * a / n, T = bone(hx, hy, K[0], K[1]);
      L(Z.TH, () => { pn.poly(slab(T, -2, T.len + 1, 3.6, 3)).paint(M.iron); if (pn.hi) pn.ln(...T.p(1.5, 0), ...T.p(T.len - 1.5, 0), M.iron[0]); });
      hub(c, 3.8);
      L(Z.SH, () => {
        const k = 5;
        for (let i = 0; i < k; i++) { const a0 = n * i / k, a1 = n * (i + 1) / k, s = i % 2 ? 1 : -1; pn.cap(...B.p(a0, s * (wAt(a0) - 0.8)), ...B.p(a1, -s * (wAt(a1) - 0.8)), 0.55); }
        pn.paint(M.iron, { outline: false, bevel: '' });
        pn.cap(...B.p(0, -w0), ...B.p(n, -w1), 1.05).cap(...B.p(0, w0), ...B.p(n, w1), 1.05).paint(M.iron, { bevel: 'l' });
        for (const a of [n * 0.02, n * 0.98]) pn.poly(B.pts([[a - 0.7, -wAt(a)], [a + 0.7, -wAt(a)], [a + 0.7, wAt(a)], [a - 0.7, wAt(a)]])).paint(M.iron, { outline: false });
        for (let i = 1; i < k; i++) { const a = n * i / k; for (const s of [-1, 1]) pn.dot(...B.p(a, s * wAt(a)), M.brass[3]); }
      });
      L(Z.KN, () => { ball(pn, M.iron, K[0], K[1], 3.4); pn.dot(K[0], K[1], M.brass[2]); });
      L(Z.FT, () => { shoe(pn, M, F, 5.5, 3.6); pn.fill(F[0] - 3.5, F[1] - 4.2, 7, 1, M.brass[1]); });
    },

    // T2 裙甲堡的腿：大腿和膝盖藏在裙甲里，只露出往下张开的粗护胫和脚尖朝外的铁靴（碎步）
    skirt(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H);
      const T0 = [hx + c.g.x * 0.35, hy + 12], B = bone(T0[0], T0[1], F[0], F[1] - 4.4), n = B.len;
      L(Z.SH, () => {
        pn.poly(slab(B, 0, n, 3.4, 4.6)).paint(M.iron);
        pn.ln(...B.p(2, 0), ...B.p(n - 1, 0), M.iron[3]);
        band(pn, B, n * 0.55, 4.4, M.brass, 0.7);
      });
      L(Z.FT, () => { boot(pn, M, F, dir, 5, 7.5, 4.6); pn.fill(F[0] - 4.5, F[1] - 5, 9, 1, M.iron[3]); });
    },

    // T3 板簧拖车：大腿是一叠弓形板簧（中段卡箍），小腿是直撑杆 + 螺旋减震，脚是带抓地齿的履带板。
    // 挤压感：着地承重时膝盖往下沉 4.5px，减震弹簧被压短、线圈变密、往两边鼓；板簧被压平。抬脚时弹簧弹回原长、板簧回弓
    leaf(c, H) {
      const { pn, M, hx, hy, g, L } = c, F = footOf(c, H), K0 = kneeOf(c, H);
      const comp = c.o.mv ? Math.max(0, 1 - g.lift / 3) : 0.6, K = [K0[0], K0[1] + 4.5 * comp];
      const B = bone(K[0], K[1], F[0], F[1] - 3.4), n = B.len, T = bone(hx, hy, K[0], K[1]), Lt = T.len;
      const tube = 11, rod = 10, s0 = tube, s1 = Math.max(tube + 4, n - rod), bulge = 3 + 1.8 * comp;
      L(Z.TH, () => {
        for (const [f0, f1, d] of [[0.3, 0.7, 3.6], [0.14, 0.86, 1.8], [0, 1, 0]]) {
          let q0 = null;
          for (let i = 0; i <= 6; i++) { const u = f0 + (f1 - f0) * i / 6, q = T.p(Lt * u, -(2.8 * (1 - 0.75 * comp) * Math.sin(Math.PI * u)) + d); if (q0) pn.cap(q0[0], q0[1], q[0], q[1], 0.95); q0 = q; }
          pn.paint(M.steel, { bevel: 'l' });
        }
        pn.poly(T.pts([[Lt * 0.5 - 1.3, -3.4], [Lt * 0.5 + 1.3, -3.4], [Lt * 0.5 + 1.3, 5.2], [Lt * 0.5 - 1.3, 5.2]])).paint(M.dark);
      });
      hub(c, 3.6);
      L(Z.SH, () => {
        pn.cap(...B.p(s0 - 1, 0), ...B.p(s1 + 1, 0), 1).paint(M.steel, { bevel: '' });   // 穿过弹簧的导杆
        const N = 5;
        for (let k = 0; k < N; k++) { const a = s0 + 1 + (s1 - s0 - 2) * k / (N - 1); pn.cap(...B.p(a - 1, -bulge), ...B.p(a + 1, bulge), 0.85); }
        pn.paint(M.steel, { bevel: 'l' });
        pn.cap(...B.p(0, 0), ...B.p(s0, 0), 2.7).paint(M.iron, { bevel: 'l' });
        pn.cap(...B.p(s1, 0), ...B.p(n, 0), 1.9).paint(M.steel, { bevel: 'l' });
        for (const a of [s0, s1]) pn.poly(slab(B, a - 0.9, a + 0.9, 3.9, 3.9)).paint(M.brass, { bevel: 'l' });   // 弹簧座
      });
      L(Z.KN, () => ball(pn, M.iron, K[0], K[1], 3.2));
      L(Z.FT, () => {
        const x = F[0], y = F[1];
        pn.rect(x - 7, y - 3.8, 14, 2.8).paint(M.iron);
        for (const u of [-6, -2, 2]) pn.rect(x + u, y - 1.2, 3, 1.2).paint(M.leg, { outline: false });
      });
    },

    // T3 掷弹兵：人形正膝（膝盖朝外、在半高处）。铆接圆筒大腿 + 黄铜箍，膝盖是一只压力表，喇叭口护胫，平头重靴；膝后一根蒸汽活塞
    gren(c, H) {
      const { pn, M, hx, hy, dir, far, L } = c, F = footOf(c, H), inn = -dir;
      const [kx, ky, ex, ey] = ik(hx, hy, F[0], F[1] - 4.6, H.l1 || 17, H.l2 || 19, dir);
      const B = bone(kx, ky, ex, ey), n = B.len, T = bone(hx, hy, kx, ky);
      L(Z.TH, () => {
        pn.cap(hx, hy, kx, ky, 4.2).paint(M.iron);
        for (const a of [T.len * 0.3, T.len * 0.72]) band(pn, T, a, 4.3, M.brass, 0.8);
        if (pn.hi) for (let a = 2; a < T.len - 1; a += 2.6) pn.dot(...T.p(a, dir * 2.2), M.iron[4]);
      });
      hub(c, 3.8);
      L(Z.LNK, () => pn.cap(...T.p(T.len * 0.5, inn * 4), ...B.p(n * 0.45, inn * 3.6), 0.9).paint(M.steel, { bevel: 'l' }));
      L(Z.SH, () => {
        pn.poly(B.pts([[0, -3], [0, 3], [n * 0.65, 3.2], [n + 0.6, 5], [n + 0.6, -5], [n * 0.65, -3.2]])).paint(M.iron);
        pn.ln(...B.p(3, 0), ...B.p(n - 1, 0), M.iron[3]);
      });
      L(Z.KN, () => {
        pn.disc(kx, ky, 4.2).paint(M.brass);
        pn.disc(kx, ky, 2.9).paint(far ? FAR.steam : NEAR.steam, { outline: false, bevel: '' });
        const na = -2.4 + (c.o.mv ? Math.sin((c.o.a || 0) + c.ph) * 1.2 + 1.2 : Math.sin((c.t || 0) * 2) * 0.3);
        pn.ln(kx, ky, kx + Math.cos(na) * 2.4, ky + Math.sin(na) * 2.4, far ? P.dark[0] : P.fire[1]);
      });
      L(Z.FT, () => { boot(pn, M, F, dir, 5.5, 8, 5); pn.fill(F[0] + (dir > 0 ? 2.5 : -5.5), F[1] - 4.6, 3, 1, M.brass[2]); });
    },

    // T3 步行履带（迪普洛克 Pedrail，1900s）：膝盖朝里的两段粗支腿，脚是一段履带：三只负重轮、履带板随步子走
    pedrail(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H), A = [F[0], F[1] - 5.6];
      const [kx, ky] = ik(hx, hy, A[0], A[1], H.l1 || 16, H.l2 || 21, -dir), T = bone(hx, hy, kx, ky);
      L(Z.TH, () => { pn.poly(slab(T, -2, T.len + 1.5, 3.6, 3)).paint(M.iron); if (pn.hi) for (let a = 2; a < T.len - 1; a += 3) pn.dot(...T.p(a, 0), M.iron[4]); else pn.ln(...T.p(1, 0), ...T.p(T.len - 1, 0), M.iron[1]); });
      hub(c, 3.6);
      L(Z.SH, () => pn.cap(kx, ky, ...A, 2.4).paint(M.steel, { bevel: 'l' }));
      L(Z.KN, () => ball(pn, M.steel, kx, ky, 3));
      L(Z.FT, () => {
        const x = F[0], y = F[1], half = 7;
        pn.poly([[A[0] - 3, A[1] - 1], [A[0] + 3, A[1] - 1], [A[0] + 2, A[1] + 2.6], [A[0] - 2, A[1] + 2.6]]).paint(M.iron);
        pn.cap(x - half, y - 2.8, x + half, y - 2.8, 2.8).paint(M.leg);
        const sh = ((c.o.mv ? -c.g.x : (c.t || 0) * 3) % 2.6 + 2.6) % 2.6;
        for (let u = -half - 1 + sh; u < half + 1; u += 2.6) { pn.dot(x + u, y - 5.4, M.iron[3]); pn.dot(x + u, y - 0.3, M.iron[2]); }
        for (const u of [-4.2, 0, 4.2]) ball(pn, M.iron, x + u, y - 2.8, 1.5);
      });
      L(Z.AN, () => ball(pn, M.brass, A[0], A[1], 1.4));
    },

    // T4 曲柄步行机（温室）：夸张的高膝——膝盖最高点超出车体顶板约 24px（半个底盘高），像温室里爬满藤的铁架。
    // 车体侧面的六辐飞轮在大腿后面转，曲柄销推一根滑槽推杆去带大腿；大腿、小腿都缠着常春藤（叶子、几朵小花），膝上垂下几缕藤蔓随风摆；平掌
    crank(c, H) {
      const { pn, M, hx, hy, dir, o, far, t, L } = c, F = footOf(c, H), g = c.g;
      const K = [hx + dir * (H.kx || 7) + g.x * 0.3, hy - (H.up || 34) - g.lift * 0.3];
      const A = (o.mv ? (o.a || 0) + c.ph : (t || 0) * 1.2) * dir, C = [hx - dir * 11, hy + 1], R = 5.6, Pn = [C[0] + Math.cos(A) * 3.8, C[1] + Math.sin(A) * 3.8];
      const T = bone(hx, hy, K[0], K[1]), B = bone(K[0], K[1], F[0], F[1] - 3.6), Mid = T.p(T.len * 0.3, 0);
      L(Z.DRV, () => {
        pn.disc(C[0], C[1], R).paint(M.brass);
        pn.disc(C[0], C[1], R - 1.4).paint(M.dark, { outline: false, bevel: '' });
        for (let k = 0; k < 6; k++) { const a = A + k / 6 * TAU; pn.ln(C[0], C[1], C[0] + Math.cos(a) * (R - 1.2), C[1] + Math.sin(a) * (R - 1.2), M.brass[2]); }
        ball(pn, M.brass, C[0], C[1], 1.4);
      });
      L(Z.TH, () => {
        pn.poly(slab(T, -1.5, T.len + 1.5, 3.4, 2.6)).paint(M.steel); pn.ln(...T.p(1, 0), ...T.p(T.len - 1, 0), M.steel[3]);
        vine(pn, T, 4, T.len - 3, 2.2, 0.4 + c.ph, far, 6);
      });
      hub(c, 3.6);
      L(Z.LNK, () => {
        pn.cap(...Pn, ...Mid, 1.1).paint(M.iron, { bevel: 'l' });
        if (pn.hi) { const Rr = bone(Pn[0], Pn[1], Mid[0], Mid[1]); pn.ln(...Rr.p(Rr.len * 0.4, 0), ...Rr.p(Rr.len * 0.85, 0), M.dark[0]); }
        ball(pn, M.iron, Pn[0], Pn[1], 1.5); ball(pn, M.brass, Mid[0], Mid[1], 1.2);
      });
      L(Z.SH, () => {
        pn.poly(slab(B, 0, B.len, 2.8, 2)).paint(M.steel);
        pn.ln(...B.p(1, -1), ...B.p(B.len - 1, -0.8), M.steel[3]);
        for (const a of [B.len * 0.3, B.len * 0.62]) band(pn, B, a, 3.1, M.brass, 0.8);
        vine(pn, B, 4, B.len * 0.7, 2.4, 2 + c.ph, far, 6.5);
      });
      L(Z.KN, () => {
        ball(pn, M.steel, K[0], K[1], 3.4);
        for (const [dx, len, ph] of [[1.8, 10, 1.3]]) {   // 膝上垂下的藤
          const sw = Math.sin(t * 2 + ph + c.ph) * 1.2; let q0 = [K[0] + dx * dir, K[1] + 1];
          for (let i = 1; i <= 4; i++) { const u = i / 4, q = [K[0] + dx * dir + sw * u * u, K[1] + 1 + len * u]; pn.cap(q0[0], q0[1], q[0], q[1], 0.45); q0 = q; }
          pn.paint(leafRamp(far, 1), { outline: false, bevel: '' });
          for (let i = 1; i <= 2; i++) { const u = i / 2.4; leaf(pn, K[0] + dx * dir + sw * u * u + (i % 2 ? 1 : -1), K[1] + 1 + len * u, i % 2 ? 1 : -1, far); }
        }
      });
      L(Z.FT, () => { const ex = F[0], ey = F[1] - 3.6; pn.poly([[ex - 6, ey + 3.6], [ex - 5, ey + 0.4], [ex + 5, ey + 0.4], [ex + 6.5, ey + 3.6]]).paint(M.iron); pn.fill(ex - 3.5, ey + 1.4, 7, 1, M.brass[2]); });
      L(Z.AN, () => ball(pn, M.brass, F[0], F[1] - 3.6, 1.6));
    },

    // T4 蒸汽圣骑（龟足）：更粗的龟足柱腿，纹路改成盔甲——大腿是三片分节甲片（每片一道棱、两端铆钉），小腿是一摞往下张开的分节胫甲（一片压一片、中间一道脊线、黄铜铆钉），
    // 膝上大圆护膝 + 扇翼，脚是圆厚的龟足垫 + 三枚钝甲。剪影：四根粗壮的盔甲柱 + 圆脚，配车体侧面一排风筝盾
    knight(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H), A = [F[0], F[1] - 5];
      const [kx, ky, ex, ey] = ik(hx, hy, A[0], A[1], H.l1 || 14, H.l2 || 18, dir);
      const B = bone(kx, ky, ex, ey), n = B.len, T = bone(hx, hy, kx, ky);
      L(Z.TH, () => {
        pn.poly(slab(T, -2.5, T.len + 1, 6.2, 5.2)).paint(M.steel);
        for (const u of [0.3, 0.62]) { const a = T.len * u; pn.ln(...T.p(a, -6), ...T.p(a, 6), M.steel[0]); pn.ln(...T.p(a + 1, -5.6), ...T.p(a + 1, 5.6), M.steel[3]); }
        pn.ln(...T.p(0, 0), ...T.p(T.len, 0), M.steel[3]);
      });
      hub(c, 4.4);
      L(Z.SH, () => {
        pn.poly(slab(B, -1, n, 5.4, 7)).paint(M.steel);
        for (let a = 2.5; a < n - 1; a += 3.4) {   // 分节胫甲：每一片的下沿暗线 + 上沿亮线 + 两端铆钉
          const w = 5.4 + 1.6 * a / n;
          pn.ln(...B.p(a, -w), ...B.p(a, w), M.steel[0]); pn.ln(...B.p(a + 0.9, -w + 0.4), ...B.p(a + 0.9, w - 0.4), M.steel[3]);
          for (const s of [-1, 1]) pn.dot(...B.p(a + 1.8, s * (w - 1.3)), M.brass[3]);
        }
        pn.ln(...B.p(0, 0), ...B.p(n - 1, 0), M.steel[3]);
        band(pn, B, 0.5, 5.8, M.brass, 0.9);
      });
      L(Z.KN, () => {
        pn.poly([[kx, ky - 4], [kx + dir * 7.5, ky - 2.8], [kx + dir * 6.8, ky + 2.6], [kx, ky + 2]]).paint(M.brass);
        pn.ln(kx + dir * 2, ky - 1.5, kx + dir * 6.5, ky - 1, M.brass[1]);
        ball(pn, M.steel, kx, ky, 4.6); pn.disc(kx, ky, 2).paint(M.steel, { outline: false, bevel: 's' }); pn.dot(kx, ky, M.brass[3]);
      });
      L(Z.FT, () => {
        const x = F[0], y = F[1], pts = [];
        for (let k = 0; k <= 10; k++) { const a = Math.PI + k / 10 * Math.PI; pts.push([x + Math.cos(a) * 8, y + Math.sin(a) * 5.8]); }
        pn.poly(pts).paint(M.steel);
        pn.fill(x - 7, y - 1.6, 14, 1, M.steel[1]);
        for (const u of [2.4, 4.8, 7]) pn.disc(x + dir * u, y - 1, 1.2).paint(M.brass, { outline: false, bevel: 'l' });
      });
    },

    // T4 螳臂步行机（替换仪表步行机）：以螳螂腿为灵感——高膝，大腿是一片带棱线的三角甲板、下缘一排倒刺，
    // 小腿是一把长长的刀形胫甲，越往下越细，末端就是脚：一根锋利的钢尖（黄铜箍 + 一根后刺），只用尖点着地。强调尖脚
    mantis(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H), K = kneeOf(c, H), inn = -dir;
      const T = bone(hx, hy, K[0], K[1]), B = bone(K[0], K[1], F[0], F[1]), n = B.len;
      L(Z.TH, () => {
        for (let a = 3; a < T.len - 2; a += 3) pn.poly(T.pts([[a, inn * 3.2], [a + 1.8, inn * 3.2], [a + 0.6, inn * 6]]));
        pn.paint(M.steel, { bevel: 'l' });
        pn.poly(T.pts([[-1.5, -4.2], [-1.5, 4.2], [T.len * 0.55, 5], [T.len + 1.5, 3], [T.len + 1.5, -3], [T.len * 0.55, -3.8]])).paint(M.steel);
        pn.ln(...T.p(1, 0), ...T.p(T.len - 1, 0), M.steel[3]);
      });
      hub(c, 3.8);
      L(Z.SH, () => {
        pn.poly(B.pts([[-1, -4.4], [-1, 4.4], [n * 0.35, 4], [n * 0.72, 2.6], [n * 0.9, 1.2], [n, 0], [n * 0.9, -1], [n * 0.72, -2], [n * 0.35, -3.2]])).paint(M.steel);
        pn.ln(...B.p(1, -0.6), ...B.p(n - 3, -0.3), M.steel[3]);
        band(pn, B, n * 0.2, 4.2, M.brass, 0.8);
        pn.poly(B.pts([[n * 0.6, dir * 2.4], [n * 0.68, dir * 2], [n * 0.52, dir * 6.4]])).paint(M.steel);   // 胫上后刺
        band(pn, B, n * 0.8, 2, M.brass, 0.7);
        pn.dot(...B.p(n - 0.5, 0), M.steel[3]);
      });
      L(Z.KN, () => { pn.poly([[K[0], K[1] - 2.2], [K[0] + dir * 6.5, K[1] - 3], [K[0], K[1] + 2]]).paint(M.steel); ball(pn, M.iron, K[0], K[1], 3.2); pn.dot(K[0], K[1], M.brass[3]); });
    },

    // T5 汽锤步行机（内史密斯蒸汽锤）：胯上耳轴吊着一只更粗的竖直汽缸，缸底伸出两根并排的活塞杆（中间镂空），下端一只十字头连着砧形铁脚。
    // 走路姿势：着地的半个周期里锤头连续砸地三下（铁脚抬起 2.5px 再砸下，每砸一下缸底喷一口汽）；抬脚 = 活塞缩回
    hammer(c, H) {
      const { pn, M, hx, hy, dir, g, o, L } = c, F = footOf(c, H);
      let strike = 0, hit = false;
      if (o.mv && g.lift === 0) { const u = ((((o.a || 0) + c.ph) / TAU) % 1 + 1) % 1, w = (u - 0.5) * 2, s = Math.abs(Math.sin(w * Math.PI * 3)); strike = 2.5 * s; hit = s < 0.3; }
      F[1] -= strike;
      const B = bone(hx, hy, F[0], F[1] - 5.2), n = B.len, cyl = 19;
      L(Z.SH, () => {
        for (const f of [-2.6, 2.6]) pn.cap(...B.p(cyl - 1, f), ...B.p(n - 1, f), 1.15);
        pn.paint(M.steel, { bevel: 'l' });
        pn.poly(slab(B, n - 2.4, n + 0.6, 4.2, 4.2)).paint(M.iron);   // 十字头
      });
      L(Z.TH, () => {
        pn.poly(slab(B, -2.5, cyl, 5.8, 5.8)).paint(M.steel);
        pn.poly(slab(B, cyl - 2, cyl + 1, 6.8, 6.8)).paint(M.iron);
        pn.poly(slab(B, 1, 3.6, 6.8, 6.8)).paint(M.iron);
        for (const a of [cyl * 0.45, cyl * 0.72]) band(pn, B, a, 5.9, M.brass, 0.7);
        pn.ln(...B.p(5, -3), ...B.p(cyl - 3, -3), M.steel[3]);
        if (pn.hi) for (const a of [2.3, cyl - 0.5]) for (const f of [-5.6, 5.6]) pn.dot(...B.p(a, f), M.brass[3]);
        if (hit && !c.far) { const q = B.p(cyl + 1, dir * -7); pn.disc(q[0] - dir * 1.5, q[1] - 1, 1.8).paint(NEAR.steam, { outline: false, bevel: '' }); pn.disc(q[0] - dir * 3.2, q[1] - 2.6, 1.2).paint(NEAR.steam, { outline: false, bevel: '' }); }
      });
      L(Z.HIP, () => { ball(pn, M.iron, hx, hy, 4.8); pn.disc(hx, hy, 1.8).paint(M.brass, { outline: false }); });   // 耳轴
      L(Z.FT, () => {
        const x = F[0], y = F[1];
        pn.poly([[x - 7.5, y], [x - 6.5, y - 2], [x - 3, y - 2.8], [x - 4.6, y - 5.4], [x + 4.6, y - 5.4], [x + 3, y - 2.8], [x + 6.5, y - 2], [x + 7.5, y]]).paint(M.iron);
        if (hit && strike < 0.8 && !c.far) { pn.dot(x - 8.5, y - 0.5, P.steam[1]); pn.dot(x + 8.5, y - 0.5, P.steam[1]); }
      });
    },

    // T5 锚链铁甲：人形正膝，锻铁大腿 + 缠两道锚链箍的小腿，脚是一只船锚——锚冠着地、两只锚爪往上弯
    anchor(c, H) {
      const { pn, M, hx, hy, dir, L } = c, F = footOf(c, H), A = [F[0], F[1] - 8.5];
      const [kx, ky, ex, ey] = ik(hx, hy, A[0], A[1], H.l1 || 15, H.l2 || 16, dir);
      const B = bone(kx, ky, ex, ey), n = B.len, T = bone(hx, hy, kx, ky), x = F[0], y = F[1];
      L(Z.TH, () => { pn.poly(slab(T, -1.5, T.len + 1, 4.4, 3.2)).paint(M.iron); pn.ln(...T.p(1, 0), ...T.p(T.len - 1, 0), M.iron[3]); });
      hub(c, 4);
      L(Z.SH, () => {
        pn.poly(slab(B, 0, n, 3.2, 2.4)).paint(M.iron);
        for (const a of [n * 0.35, n * 0.62]) { pn.poly(slab(B, a - 1.4, a + 1.4, 3.6, 3.6)).paint(M.steel, { bevel: 'l' }); pn.ln(...B.p(a, -2.6), ...B.p(a, 2.6), M.steel[0]); }
      });
      L(Z.KN, () => { ball(pn, M.iron, kx, ky, 3.2); pn.dot(kx, ky, M.brass[3]); });
      L(Z.FT, () => {
        pn.cap(ex, ey, x, y - 1.6, 1.5).paint(M.steel, { bevel: 'l' });
        pn.fill(x - 3, y - 6.2, 6, 1.2, M.steel[1]);
        for (const s of [-1, 1]) {
          pn.cap(x, y - 1.3, x + s * 3.6, y - 1.1, 1.2).cap(x + s * 3.6, y - 1.1, x + s * 5.6, y - 4.2, 1.2);
          pn.poly([[x + s * 7.4, y - 3.2], [x + s * 5.8, y - 7.2], [x + s * 4.2, y - 3.6]]);
        }
        pn.paint(M.steel, { bevel: 'l' });
        pn.disc(x, y - 1.4, 1.4).paint(M.brass, { outline: false });
      });
      L(Z.AN, () => { pn.disc(ex, ey, 2).paint(M.steel); pn.dot(ex, ey, P.dark[0]); });
    },

    // ---- T6 重做 ----
    // T6 哥特教堂（主线）：大腿是一道飞扶壁（上缘平直、下缘是拱，中间镂一个三叶孔），小腿是一根石砌方柱（每层一道缝、中段一个发光的尖拱龛），
    // 膝上立一座小尖塔（卷叶饰 + 黄铜尖顶），脚是两级台座
    gothic(c, H) {
      const { pn, M, hx, hy, dir, far, t, L } = c, F = footOf(c, H), A = [F[0], F[1] - 4.4];
      const [kx, ky, ex, ey] = ik(hx, hy, A[0], A[1], H.l1 || 19, H.l2 || 22, dir);
      const T = bone(hx, hy, kx, ky), B = bone(kx, ky, ex, ey), n = B.len, Lt = T.len, up = -dir;   // up：飞扶壁的上缘在哪一侧
      L(Z.TH, () => {
        const us = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
        pn.poly(us.map(u => T.p(Lt * u, up * 3.4)).concat(us.slice().reverse().map(u => T.p(Lt * u, up * (3.4 - (6.6 - 3.8 * Math.sin(Math.PI * u))))))).paint(M.steel);
        pn.ln(...T.p(1, up * 2.6), ...T.p(Lt - 1, up * 2.6), M.steel[3]);
        const q = T.p(Lt * 0.5, up * 1.8); for (const [dx, dy] of [[0, -0.9], [-0.9, 0.5], [0.9, 0.5]]) pn.dot(q[0] + dx, q[1] + dy, P.dark[0]);
      });
      hub(c, 3.8);
      L(Z.SH, () => {
        pn.poly(slab(B, -1, n, 3.6, 4.4)).paint(M.steel);
        for (let a = 4; a < n - 1; a += 4.2) pn.ln(...B.p(a, -3.6 - a / n * 0.8), ...B.p(a, 3.6 + a / n * 0.8), M.steel[1]);
        const m = B.p(n * 0.5, 0), glow = far ? P.glass[0] : (Math.sin(t * 3 + c.ph) > 0 ? P.glass[3] : P.glass[2]);
        pn.poly([[m[0] - 1.4, m[1] + 3], [m[0] - 1.4, m[1] - 1], [m[0], m[1] - 3], [m[0] + 1.4, m[1] - 1], [m[0] + 1.4, m[1] + 3]]).paint([P.dark[0], glow, glow, glow], { bevel: '' });
      });
      L(Z.KN, () => {
        pn.poly([[kx - 3.4, ky + 1], [kx + 3.4, ky + 1], [kx + 1.6, ky - 5], [kx, ky - 10], [kx - 1.6, ky - 5]]).paint(M.steel);
        for (const v of [-2.5, -5.5]) { pn.dot(kx - 2.2 - v * 0.15, ky + v, M.brass[2]); pn.dot(kx + 2 + v * 0.15, ky + v, M.brass[2]); }
        pn.dot(kx, ky - 10.4, M.brass[3]);
        pn.fill(kx - 3.6, ky + 0.5, 7.2, 1.5, M.brass[1]);
      });
      L(Z.FT, () => { const x = F[0], y = F[1]; pn.rect(x - 7, y - 2.4, 14, 2.4).paint(M.steel); pn.rect(x - 5, y - 4.8, 10, 2.4).paint(M.steel); });
    },

    // T6 黑龙（v8 重做，不再有透火）：粗壮的三段龙腿（膝朝前、跗关节朝后，脚尖统一朝车头）。
    // 大腿是三片带中脊的厚甲板上压下（每片在下一片上投一道阴影），膝上一块厚膝甲 + 一根粗角刺，小腿两片甲 + 跗关节后刺，
    // 跖骨粗短，脚是三根粗弯爪 + 一根后爪、爪根有指节垫
    dragon(c, H) {
      const { pn, M, hx, hy, L } = c, F = footOf(c, H), Hk = [F[0] - 6, F[1] - 12.5];
      const [kx, ky, ex, ey] = ik(hx, hy, Hk[0], Hk[1], H.l1 || 16, H.l2 || 13, 1);
      const T = bone(hx, hy, kx, ky), B = bone(kx, ky, ex, ey), n = B.len, x = F[0], y = F[1];
      const lame = (Bn, a0, a1, w0, w1, R) => {   // 一片厚甲：先投影、再甲面、再中脊和两颗粗糙斑点
        pn.poly(slab(Bn, a0 + 1.4, a1 + 1.4, w0, w1)).paint(DSH, { outline: false, bevel: '' });
        pn.poly(slab(Bn, a0, a1, w0, w1)).paint(R);
        pn.ln(...Bn.p(a0 + 0.8, 0), ...Bn.p(a1 - 1, 0), R[3]);
        pn.dot(...Bn.p((a0 + a1) / 2, w0 * 0.5), R[1]); pn.dot(...Bn.p(a0 + 1.5, -w0 * 0.55), R[1]);
      };
      L(Z.TH, () => {
        pn.poly(slab(T, -3, T.len + 1, 7.4, 5.4)).paint(M.steel);
        const Lt = T.len;
        for (const [a0, a1, w0, w1] of [[Lt * 0.62, Lt + 1, 6, 5.4], [Lt * 0.3, Lt * 0.7, 6.8, 6.2], [-3, Lt * 0.38, 7.6, 7]]) lame(T, a0, a1, w0, w1, M.steel);
        pn.ln(...T.p(0, 6.6), ...T.p(Lt, 4.6), M.steel[3]);   // 前缘亮边
      });
      hub(c, 4.6);
      L(Z.SH, () => {
        pn.poly(slab(B, 0, n, 5.2, 3.8)).paint(M.steel);
        for (const [a0, a1, w0, w1] of [[n * 0.5, n, 4.6, 3.8], [0, n * 0.56, 5.4, 4.8]]) lame(B, a0, a1, w0, w1, M.steel);
        pn.ln(...B.p(1, 4.6), ...B.p(n - 1, 3.4), M.steel[3]);   // 前缘亮边
        pn.poly([[ex - 1, ey - 2.4], [ex - 8.5, ey - 4], [ex - 7.5, ey - 2.6], [ex - 1.4, ey + 2.4]]).paint(M.steel);   // 跗关节后刺（粗）
      });
      L(Z.KN, () => {
        pn.poly([[kx - 2.4, ky - 2.4], [kx + 4, ky - 6], [kx + 9, ky - 8.5], [kx + 7, ky - 4.5], [kx + 3, ky + 2]]).paint(M.steel);   // 膝角
        pn.ln(kx + 1, ky - 2, kx + 7.5, ky - 7, M.steel[3]);
        pn.disc(kx, ky, 4.4).paint(M.steel); pn.ln(kx - 2.6, ky - 1.5, kx + 2.4, ky - 2.8, M.steel[3]); pn.dot(kx - 1, ky + 1.5, M.steel[1]);
      });
      L(Z.FT, () => {
        pn.cap(ex, ey, x, y - 3, 2.8).paint(M.steel, { bevel: 'l' });
        pn.ln(ex + 1.5, ey, x + 1.5, y - 4, M.steel[3]);
        const claw = (pts, r0) => { for (let k = 1; k < pts.length; k++) pn.cap(...pts[k - 1], ...pts[k], r0 - k * 0.45); };
        claw([[x + 0.5, y - 3.4], [x + 4.5, y - 4.2], [x + 8, y - 2.4], [x + 9.4, y]], 2);
        claw([[x, y - 4.2], [x + 3, y - 6.4], [x + 6, y - 6], [x + 7.2, y - 3.6]], 1.8);
        claw([[x - 0.5, y - 3], [x - 3.6, y - 3.4], [x - 6, y - 1.6], [x - 6.6, y]], 1.8);
        pn.paint(M.iron, { bevel: 'l' });
        for (const [u, v] of [[9.2, -0.4], [7.2, -3.8], [-6.5, -0.4]]) pn.dot(x + u, y + v, M.steel[3]);
        for (const u of [2.2, 5.6]) pn.dot(x + u, y - 1.2, M.leg[1]);   // 指节垫下的暗缝
        ball(pn, M.iron, x, y - 3.4, 2.4);
      });
      L(Z.AN, () => { ball(pn, M.iron, ex, ey, 3); pn.dot(ex - 1, ey - 1, M.iron[3]); });
    },
    // ---- v9 新腿：每种一个带参数的腿函数，LEG_VARIANTS 里是 4 个方案（不同的长度、姿态、脚形、附件）----

    // T6 大本钟 · 时钟指针腿：胯下一根可伸缩的塔身，下端一只钟面（毂），毂上三根（或六根）表针像无辐圈的车轮一样转着走——总是朝下最近的那根针尖撑地。
    // 转角按走过的距离算（滚一段 ≈ 针长），毂的高度 = 撑地那根针的竖直投影，所以会一顿一顿地起伏（塔身伸缩吃掉一部分）
    // H：len 针长、kind（equal 三根等长 / hms 时分秒三根不等长 / six 前后两层共六根 / pend 塔身是一根摆锤，毂前后摆）、face 钟面半径
    hands(c, H) {
      const { pn, M, hx, hy, dir, o, far, L } = c, S = o.plantS || 14, dist = (o.a || 0) / TAU * 4 * S + c.ph * 3;
      const len = H.len || 11, lens = H.kind === 'hms' ? [len * 0.72, len, len * 1.18] : [len, len, len];
      const th = dist / (len * 0.95), set = (k0, n) => Array.from({ length: n }, (_, i) => th + k0 + i * TAU / n);
      const front = set(0, 3), back = H.kind === 'six' ? set(Math.PI / 3, 3) : [];
      let reachDown = 0;
      front.concat(back).forEach((a, i) => { reachDown = Math.max(reachDown, lens[i % 3] * Math.cos(a)); });
      const hubX = hx + dir * (H.reach == null ? 2 : H.reach) + (H.kind === 'pend' ? Math.sin((o.a || 0) + c.ph) * 4 : 0);
      const hb = [hubX, c.gy - Math.max(len * 0.5, reachDown)], face = H.face || 4.6;
      const tip = (a, l) => [hb[0] - Math.sin(a) * l, hb[1] + Math.cos(a) * l];
      const hand = (a, l, R, w) => {   // 宝玑式表针：细针杆 + 矛形针尖 + 尾端一小颗配重（v9：去掉月环，免得三根针糊成一团）
        const e = tip(a, l), tl = tip(a + Math.PI, l * 0.22), s0 = tip(a, l - 2.6), nx = Math.cos(a), ny = Math.sin(a);
        pn.cap(...tl, ...s0, w).paint(R, { bevel: 'l' });
        pn.poly([[s0[0] + nx * 1.7, s0[1] + ny * 1.7], [e[0], e[1]], [s0[0] - nx * 1.7, s0[1] - ny * 1.7]]).paint(R);
        pn.disc(tl[0], tl[1], w + 0.7).paint(R);
      };
      L(Z.TH, () => {
        if (H.kind === 'pend') { pn.cap(hx, hy, ...hb, 1.6).paint(M.steel, { bevel: 'l' }); const m = [(hx + hb[0]) / 2, (hy + hb[1]) / 2]; pn.disc(m[0], m[1], 3.2).paint(M.brass); pn.dot(m[0], m[1], M.brass[0]); }
        else {
          const B = bone(hx, hy, hb[0], hb[1]), n = B.len;
          pn.poly(slab(B, n * 0.45, n, 2.8, 2.8)).paint(M.iron);
          pn.poly(slab(B, -1, n * 0.55, 4, 3.6)).paint(M.steel);
          pn.ln(...B.p(1, -1.5), ...B.p(n * 0.5, -1.4), M.steel[1]); pn.ln(...B.p(1, 1.5), ...B.p(n * 0.5, 1.4), M.steel[1]);
          band(pn, B, n * 0.55, 4.2, M.brass, 0.8);
        }
      });
      hub(c, 3.8);
      L(Z.SH, () => { back.forEach((a) => hand(a, len, M.iron, 0.7)); });
      L(Z.KN, () => {
        pn.disc(hb[0], hb[1], face + 1.1).paint(M.brass);
        pn.disc(hb[0], hb[1], face).paint(far ? FAR.steam : NEAR.steam, { outline: false, bevel: '' });
        for (let k = 0; k < 12; k += 3) pn.dot(hb[0] + Math.cos(k / 12 * TAU) * (face - 1), hb[1] + Math.sin(k / 12 * TAU) * (face - 1), P.dark[1]);
      });
      L(Z.FT, () => { front.forEach((a, i) => hand(a, lens[i], M.brass, H.kind === 'hms' ? [1, 0.75, 0.5][i] : 0.7)); ball(pn, M.brass, hb[0], hb[1], 1.4); });
    },

    // T5 半人马 · 马腿：后腿 = 髋 → 膝（朝前）→ 跗关节（朝后，最高的那个尖）→ 管骨 → 球节 → 系骨 → 蹄；前腿 = 肩 → 肘（朝后）→ 腕（前膝）→ 管骨 → 球节 → 蹄。
    // 抬腿时管骨往后折、蹄底翻向后方（马的收蹄），落地时蹄底放平。走得更快、颠得更厉害（见 SET 的 fast / bob）
    // H：style（war 战马：甲板 + 蹄毛 / race 赛马：修长 + 液压肌腱 / draft 挽马：汽缸肌肉 + 弹簧球节 / cav 一战骑兵：铆接甲 + 板簧刀片脚）、l1 l2 l3 三段长、fold 收蹄幅度、w 粗细倍数
    horse(c, H) {
      const { pn, M, hx, hy, dir, g, far, L } = c, F = footOf(c, H), hind = dir < 0, st = H.style || 'war', w = H.w || 1;
      const fold = Math.min(1, g.lift / 5) * (H.fold || 1);
      const Fl = [F[0] - 1.2 - fold * 1.5, F[1] - 4.8 + fold * 1.4];   // 球节
      const tau = (hind ? 0.12 : -0.04) + fold * (hind ? 0.55 : 0.95), l3 = H.l3 || 11;
      const C = [Fl[0] + Math.sin(tau) * l3, Fl[1] - Math.cos(tau) * l3];   // 跗关节 / 腕
      const [kx, ky] = ik(hx, hy, C[0], C[1], H.l1 || 15, H.l2 || 13, hind ? 1 : -1);
      const T = bone(hx, hy, kx, ky), B = bone(kx, ky, C[0], C[1]), Cn = bone(C[0], C[1], Fl[0], Fl[1]);
      const R = st === 'war' ? M.steel : st === 'cav' ? M.iron : M.steel;
      L(Z.TH, () => {
        pn.poly(slab(T, -3, T.len + 1, 6.4 * w, 4.4 * w)).paint(R);
        pn.ln(...T.p(0, 5 * w), ...T.p(T.len, 3.4 * w), R[3]);
        if (st === 'war') for (const a of [T.len * 0.35, T.len * 0.7]) { pn.ln(...T.p(a, -6 * w), ...T.p(a, 6 * w), R[0]); pn.dot(...T.p(a + 1.5, 4 * w), M.brass[3]); }
        if (st === 'cav') for (let a = 1; a < T.len; a += 3) pn.dot(...T.p(a, -4 * w), R[3]);
        if (st === 'draft') { const p = T.p(1, -7), q = T.p(T.len * 0.8, -5.5); pn.cap(...p, ...T.p(T.len * 0.45, -6.4), 2).paint(M.brass, { bevel: 'l' }); pn.cap(...T.p(T.len * 0.4, -6.2), ...q, 1).paint(M.steel, { bevel: 'l' }); }
      });
      hub(c, 4.2 * w);
      L(Z.SH, () => {
        pn.poly(slab(B, -1, B.len, 4.4 * w, 3 * w)).paint(R);
        pn.ln(...B.p(0, 3.4 * w), ...B.p(B.len - 1, 2.2 * w), R[3]);
        if (st === 'war') pn.poly(slab(B, 1, B.len * 0.6, 5 * w, 4.4 * w)).paint(M.steel);
        if (st === 'draft') pn.cap(...B.p(1, 5), ...B.p(B.len - 2, 4), 1).paint(M.steel, { bevel: 'l' });
      });
      L(Z.KN, () => {
        ball(pn, R, kx, ky, 3.6 * w);
        if (hind) pn.poly([[C[0] - 2.4, C[1] - 1.5], [C[0] - 5.4 * w, C[1] - 3.4], [C[0] - 2, C[1] + 2]]).paint(R);   // 跗关节后尖
        ball(pn, R, C[0], C[1], 2.9 * w);
      });
      L(Z.FT, () => {
        pn.poly(slab(Cn, 0, Cn.len, 2.4 * w, 2.1 * w)).paint(R);
        if (st === 'race') pn.ln(...Cn.p(0, -2.6 * w), ...Cn.p(Cn.len, -2.3 * w), P.glass[2]);   // 液压肌腱
        const x = F[0], y = F[1], tilt = fold * 1.3, rot = (u, v) => [Fl[0] + u * Math.cos(tilt) - v * Math.sin(tilt), Fl[1] + u * Math.sin(tilt) + v * Math.cos(tilt)];
        if (st === 'cav') {   // 板簧刀片脚：一片 C 形弹簧钢代替系骨和蹄
          let q0 = Fl; for (let k = 1; k <= 6; k++) { const u = k / 6, q = rot(3.5 * Math.sin(Math.PI * u * 0.9), 4.6 * u); pn.cap(q0[0], q0[1], q[0], q[1], 1.2 - u * 0.4); q0 = q; }
          pn.paint(M.steel, { bevel: 'l' }); pn.poly([rot(-1, 4.4), rot(4.5, 4.4), rot(4.5, 5), rot(-1, 5)]).paint(M.leg);
        } else {
          const hw = (st === 'draft' ? 3.6 : st === 'race' ? 2.4 : 3.2) * w;
          pn.poly([rot(-1.4, 0), rot(1.6, 0), rot(hw + 1.2, 4.8), rot(-hw + 0.6, 4.8)]).paint(M.leg);   // 系骨 + 蹄
          pn.poly([rot(-hw + 0.6, 4.2), rot(hw + 1.2, 4.2), rot(hw + 1.2, 4.9), rot(-hw + 0.6, 4.9)]).paint(M.iron, { outline: false });   // 蹄铁
          if (!far) for (const u of [-hw + 1.6, 0.6, hw]) pn.dot(...rot(u, 4.5), M.steel[3]);
          if (st === 'war') for (let k = -2; k <= 2; k++) pn.poly([rot(k * 1.3 - 0.8, 0.5), rot(k * 1.3 + 0.8, 0.5), rot(k * 1.3 - 0.4, 3.4)]).paint(M.steel, { outline: false });   // 蹄毛（钢穗）
          if (st === 'draft') { const Sb = bone(C[0], C[1], Fl[0], Fl[1]); let q0 = Sb.p(Sb.len * 0.55, 0); for (let k = 1; k <= 5; k++) { const r = Sb.p(Sb.len * (0.55 + 0.45 * k / 6), k % 2 ? 2.4 : -2.4); pn.cap(q0[0], q0[1], r[0], r[1], 0.55); q0 = r; } pn.paint(M.brass, { bevel: 'l' }); }
        }
        ball(pn, R, Fl[0], Fl[1], 2.4 * w);
      });
    },
  };

  // ---------- 车体（顶板 y..y+3 和上面的模块相接，只画在 y+3 以下） ----------
  const deck = (pn, x, y, o) => {
    pn.fill(x, y, 96, 3, P.iron[1]); pn.fill(x, y + 2, 96, 1, P.iron[0]);
    if (!o.top) { pn.fill(x, y, 96, 1, P.iron[0]); pn.fill(x, y + 1, 96, 1, P.iron[3]); }
  };
  const rivRow = (pn, x, y, x0, x1, step) => { for (let u = x0; u <= x1; u += step) rivet(pn, x + u, y); };
  const HULL = {
    // T1 现役：伏地蛛甲壳 + 正中黄铜舱盖（游戏代码原样）
    base(pn, x, y, o) {
      LL.carapace(pn, x, y, false, false, o.top, 96);
      pn.fill(x + 44, y + 5, 8, 6, P.dark[0]); pn.fill(x + 45, y + 6, 6, 4, P.brass[1]); pn.fill(x + 45, y + 6, 6, 1, P.brass[3]);
    },
    // T2 熟铁板梁
    girder(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 2, y + 3], [x + 94, y + 3], [x + 92, y + 16], [x + 4, y + 16]]).paint(NEAR.iron);
      pn.fill(x + 3, y + 3, 90, 2, P.iron[1]); pn.fill(x + 4, y + 13, 88, 2, P.iron[1]); pn.fill(x + 4, y + 13, 88, 1, P.iron[0]);
      for (let u = 8; u < 92; u += 12) { if (Math.abs(u - 48) < 8) continue; pn.fill(x + u, y + 5, 1, 8, P.iron[3]); pn.fill(x + u + 1, y + 5, 1, 8, P.iron[0]); }
      if (pn.hi) { rivRow(pn, x, y + 3, 5, 90, 3); rivRow(pn, x, y + 13, 6, 89, 3); } else { for (let u = 6; u < 92; u += 4) { pn.dot(x + u, y + 4, P.iron[4]); pn.dot(x + u, y + 14, P.iron[3]); } }
      pn.disc(x + 48, y + 9, 4.2).paint(NEAR.iron); pn.fill(x + 45, y + 8, 6, 1, P.brass[2]); pn.fill(x + 45, y + 10, 6, 1, P.brass[1]);
    },
    // T3 一战陆地巡洋舰
    landship(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 1, y + 3], [x + 95, y + 3], [x + 95, y + 8], [x + 87, y + 19], [x + 9, y + 19], [x + 1, y + 8]]).paint(NEAR.iron);
      pn.fill(x + 2, y + 11, 92, 1, P.iron[0]); pn.fill(x + 2, y + 12, 92, 1, P.iron[3]);
      for (const u of [24, 48, 72]) pn.fill(x + u, y + 4, 1, 7, P.iron[0]);
      if (pn.hi) { rivRow(pn, x, y + 5, 4, 91, 3.5); rivRow(pn, x, y + 14, 12, 84, 3.5); } else { for (let u = 4; u < 93; u += 4) pn.dot(x + u, y + 5, P.iron[4]); for (let u = 12; u < 85; u += 4) pn.dot(x + u, y + 14, P.iron[4]); }
      for (const u of [80, 84, 88]) pn.fill(x + u, y + 7, 2, 1, P.black);
      pn.disc(x + 48, y + 14, 3.4).paint(NEAR.iron); pn.disc(x + 48, y + 14, 1.4).paint(NEAR.dark, { outline: false }); pn.dot(x + 47, y + 13, P.iron[4]);
    },

    // ---- T4 候选 ----
    // A 水晶宫温室：铸铁框 + 一排圆拱玻璃窗，檐口黄铜线，下沿垂一排铸铁吊饰（维多利亚铁艺花边）
    conserv(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.rect(x + 2, y + 3, 92, 13).paint(NEAR.iron);
      pn.fill(x + 3, y + 4, 90, 1, P.brass[2]); pn.fill(x + 3, y + 5, 90, 1, P.brass[1]);
      for (let i = 0; i < 9; i++) {
        const cx = x + 7 + i * 10.25;
        pn.rect(cx - 3.4, y + 9, 6.8, 5).disc(cx, y + 9, 3.4).paint(GLASS.near, { bevel: 'l' });
        pn.fill(cx - 0.5, y + 6.5, 1, 7.5, P.iron[1]); pn.fill(cx - 3.4, y + 10.5, 6.8, 1, P.iron[1]);
        if (i % 3 === 1) { pn.fill(cx - 2.5, y + 12.5, 5, 1.5, IVY[1]); pn.dot(cx - 1.5, y + 11.5, IVY[2]); pn.dot(cx + 1, y + 11.5, IVY[2]); }   // 窗里的盆栽
      }
      pn.fill(x + 3, y + 14.5, 90, 1.5, P.iron[1]);
      for (let u = 5; u < 93; u += 5.8) { pn.poly([[x + u - 1.4, y + 16], [x + u + 1.4, y + 16], [x + u, y + 19.5]]).paint(NEAR.iron); pn.dot(x + u, y + 20, P.brass[2]); }
      for (const [u, len] of [[40, 7], [86, 6]]) {   // 檐下垂下的常春藤
        const sw = Math.sin((o.t || 0) * 2 + u) * 0.8;
        pn.ln(x + u, y + 16, x + u + sw, y + 16 + len, IVY[1]);
        for (let i = 3; i < len; i += 3.5) leaf(pn, x + u + sw * i / len, y + 16 + i, (i | 0) % 2 ? 1 : -1, false);
      }
    },
    // B 蒸汽游艇：船形车体（下沿是一道弧、船首尖），镀金护舷线、一排黄铜舷窗、船首一道卷草金饰
    yacht(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 1, y + 3], [x + 96, y + 3], [x + 96, y + 5], [x + 91, y + 12], [x + 82, y + 18], [x + 62, y + 21.5], [x + 32, y + 21.5], [x + 13, y + 18.5], [x + 4, y + 13], [x + 1, y + 9]]).paint(NEAR.steel);
      pn.fill(x + 2, y + 6, 93, 1, P.brass[2]); pn.fill(x + 2, y + 7, 92, 1, P.brass[1]);
      for (const u of [30, 64]) pn.fill(x + u - 6, y + 17, 12, 1, P.iron[1]);
      for (const u of [14, 26, 38, 58, 70, 82]) { pn.disc(x + u, y + 11.5, 2.3).paint(NEAR.brass); pn.disc(x + u, y + 11.5, 1.2).paint(GLASS.near, { outline: false, bevel: '' }); }
      let q0 = null; for (let k = 0; k <= 10; k++) { const a = k / 10 * TAU * 1.1, r = 2.6 * (1 - k / 14), q = [x + 90 + Math.cos(a) * r, y + 9 + Math.sin(a) * r]; if (q0) pn.cap(q0[0], q0[1], q[0], q[1], 0.5); q0 = q; }
      pn.paint(NEAR.brass, { bevel: '' });
      pn.disc(x + 48, y + 13, 3).paint(NEAR.brass); pn.dot(x + 48, y + 13, P.brass[0]);
    },
    // C 铁路沙龙车厢：镶板车厢 + 圆角窗，两头敞开的车尾平台和黄铜栏杆，车底一副「皇后柱」张拉桁架（拉杆 + 两根短柱 + 花篮螺丝）
    railcar(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.rect(x + 9, y + 3, 78, 12).paint(NEAR.steel);
      for (let i = 0; i < 7; i++) { const u = x + 13 + i * 10.4; pn.rect(u, y + 5.5, 6.4, 5).paint(GLASS.near, { bevel: 'l' }); pn.fill(u, y + 12, 6.4, 1, P.brass[1]); }
      pn.fill(x + 10, y + 4, 76, 1, P.brass[2]); pn.fill(x + 10, y + 13.5, 76, 1, P.iron[1]);
      for (const [a, b] of [[1, 9], [87, 95]]) {
        pn.rect(x + a, y + 13.5, b - a, 2).paint(NEAR.iron);
        pn.fill(x + a, y + 6, b - a, 1, P.brass[2]);
        for (let u = a + 1; u < b; u += 2.4) pn.fill(x + u, y + 6, 1, 7.5, P.brass[1]);
      }
      for (const [a, b] of [[[12, 15.5], [34, 22]], [[34, 22], [62, 22]], [[62, 22], [84, 15.5]]]) pn.cap(x + a[0], y + a[1], x + b[0], y + b[1], 0.7);
      pn.paint(NEAR.iron, { bevel: 'l' });
      for (const u of [34, 62]) pn.rect(x + u - 0.8, y + 15, 1.6, 7).paint(NEAR.iron, { outline: false });
      pn.rect(x + 46, y + 21, 4, 2).paint(NEAR.brass);
    },

    // ---- T5 候选 ----
    // A 铁甲舰炮廓：斜装甲、三扇带盖炮门、下沿一道装甲带和大螺栓，船首下方一只撞角
    ironclad(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 1, y + 3], [x + 95, y + 3], [x + 95, y + 14], [x + 92, y + 19], [x + 4, y + 19], [x + 1, y + 14]]).paint(NEAR.iron);
      pn.rect(x + 2, y + 13, 92, 5).paint(NEAR.steel, { bevel: 'l' });
      for (let u = 6; u < 92; u += 8) pn.rect(x + u - 1, y + 14.5, 2.4, 2.4).paint(NEAR.iron, { outline: false, bevel: 'l' });
      for (const u of [34, 48, 62]) { pn.rect(x + u - 3, y + 7, 6, 4.5).paint(NEAR.dark); pn.poly([[x + u - 3.6, y + 7], [x + u + 3.6, y + 7], [x + u + 3, y + 4.2], [x + u - 3, y + 4.2]]).paint(NEAR.steel); }
      pn.poly([[x + 82, y + 18], [x + 95, y + 17], [x + 99, y + 20.5], [x + 95, y + 23], [x + 84, y + 22]]).paint(NEAR.steel);
      pn.disc(x + 82, y + 8, 1.8).paint(NEAR.dark);
    },
    // B 机车锅炉：一整根卧式锅炉（黄铜箍），车头是烟箱（圆门、铰链带、把手），车尾是火箱（火门透着炉火），底下一条走板
    boiler(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.rect(x + 1, y + 3, 14, 17).paint(NEAR.iron);
      const hot = Math.sin((o.t || 0) * 5) > 0; pn.rect(x + 5, y + 10, 6, 5).paint(NEAR.dark); pn.fill(x + 6, y + 11, 4, 3, P.fire[hot ? 3 : 2]);
      pn.cap(x + 22, y + 11, x + 80, y + 11, 8.2).paint(NEAR.steel);
      for (let u = 26; u < 80; u += 11) { pn.fill(x + u, y + 3, 2, 16, P.brass[2]); pn.fill(x + u + 1, y + 3, 1, 16, P.brass[1]); }
      pn.ln(x + 20, y + 6, x + 80, y + 6, P.iron[4]);
      pn.rect(x + 83, y + 3, 12, 16).paint(NEAR.dark);
      pn.disc(x + 89, y + 11, 5.2).paint(NEAR.iron); pn.fill(x + 85, y + 9, 8, 1, P.iron[1]); pn.fill(x + 85, y + 13, 8, 1, P.iron[1]); pn.dot(x + 89, y + 11, P.brass[3]);
      pn.fill(x + 1, y + 19, 94, 2, P.iron[1]); pn.fill(x + 1, y + 19, 94, 1, P.iron[3]);
    },
    // 半人马（钢）：流线的铆接钢车体——两头倒圆、腰线两排铆钉、正中黄铜号牌「III」、车头四道百叶散热口、车尾一根往下弯的排气管
    cavalry(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 1, y + 3], [x + 95, y + 3], [x + 95, y + 9], [x + 90, y + 16], [x + 7, y + 16], [x + 1, y + 10]]).paint(NEAR.iron);
      pn.fill(x + 3, y + 9, 90, 1, P.iron[0]); pn.fill(x + 3, y + 10, 90, 1, P.iron[3]);
      if (pn.hi) { rivRow(pn, x, y + 5, 6, 90, 3.5); rivRow(pn, x, y + 12, 10, 86, 3.5); } else { for (let u = 6; u < 91; u += 4) pn.dot(x + u, y + 5.5, P.iron[4]); for (let u = 10; u < 87; u += 4) pn.dot(x + u, y + 12.5, P.iron[4]); }
      pn.rect(x + 42, y + 5, 12, 6).paint(NEAR.brass); for (const u of [45, 47.5, 50]) pn.fill(x + u, y + 6.5, 1, 3, P.brass[0]);
      for (const u of [80, 83, 86, 89]) pn.ln(x + u, y + 5, x + u - 1.5, y + 8.5, P.black);
      pn.cap(x + 3, y + 12, x - 1, y + 17, 1.2).paint(NEAR.steel, { bevel: 'l' });
    },
    // C 鹦鹉螺潜艇：雪茄形铆接艇身，艇首大圆观察窗，底下一排锯齿龙骨，艇尾一只转动的螺旋桨
    nautilus(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.cap(x + 12, y + 10.5, x + 84, y + 10.5, 8).paint(NEAR.iron);
      for (let u = 18; u < 82; u += 8) pn.ln(x + u, y + 4, x + u, y + 17, P.iron[1]);
      for (let u = 18; u <= 78; u += 5) pn.poly([[x + u - 2.2, y + 17], [x + u + 2.2, y + 17], [x + u - 0.4, y + 22.5]]).paint(NEAR.steel);
      for (const u of [30, 40, 56, 66]) { pn.disc(x + u, y + 9, 1.6).paint(NEAR.brass); pn.dot(x + u, y + 9, P.glass[2]); }
      pn.disc(x + 86, y + 10.5, 5).paint(NEAR.brass); pn.disc(x + 86, y + 10.5, 3.4).paint(GLASS.near, { outline: false, bevel: 'l' });
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; pn.ln(x + 86, y + 10.5, x + 86 + Math.cos(a) * 3.4, y + 10.5 + Math.sin(a) * 3.4, P.brass[1]); }
      const r = (o.mv ? (o.a || 0) * 3 : (o.t || 0) * 5);
      for (let k = 0; k < 3; k++) { const a = r + k / 3 * TAU, h = Math.sin(a) * 5; pn.poly([[x + 2.5, y + 10.5], [x + 1.2, y + 10.5 + h], [x + 3.8, y + 10.5 + h]]); }
      pn.paint(NEAR.brass, { bevel: '' });
      pn.disc(x + 3, y + 10.5, 1.6).paint(NEAR.iron);
    },

    // ---- T6 候选 ----
    // A 哥特教堂：石砌立面，扶壁柱顶上各一枚金十字，两侧尖拱彩窗（以太光慢慢流过），正中一段凸出的门楼：上面玫瑰窗、下面一道尖拱木门（铁铰链），
    // 下沿垂一排倒挂的尖拱花边；进游戏时配两面下垂的旗帜（FRONT.banners）遮住胯部
    gothic(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.rect(x + 1, y + 3, 94, 15).paint(NEAR.iron);
      for (let r = 6; r < 17; r += 3.5) pn.fill(x + 2, y + r, 92, 1, P.iron[1]);   // 石缝
      const t = o.t || 0;
      for (const [i, cx] of [14, 26, 70, 82].entries()) {
        const on = Math.sin(t * 2 - i * 0.8) > 0.3, c1 = i % 2 ? P.glass[on ? 3 : 2] : P.fire[on ? 3 : 2];
        pn.poly([[x + cx - 2.8, y + 16], [x + cx - 2.8, y + 9], [x + cx, y + 5.5], [x + cx + 2.8, y + 9], [x + cx + 2.8, y + 16]]).paint([P.dark[0], c1, c1, c1], { bevel: '' });
        pn.fill(x + cx - 0.5, y + 8, 1, 8, P.dark[0]); pn.fill(x + cx - 2.8, y + 12, 5.6, 1, P.dark[0]);
      }
      for (const u of [8, 20, 32, 64, 76, 88]) { pn.rect(x + u - 1.6, y + 4, 3.2, 14).paint(NEAR.steel, { bevel: 'l' }); pn.fill(x + u - 0.5, y + 4.5, 1, 3, P.brass[2]); pn.fill(x + u - 1.5, y + 5.5, 3, 1, P.brass[2]); }
      // 门楼
      pn.rect(x + 37, y + 3, 22, 16).paint(NEAR.steel);
      pn.fill(x + 38, y + 4, 20, 1, P.brass[2]);
      const on = 0.5 + 0.5 * Math.sin(t * 1.6);
      pn.disc(x + 48, y + 8.5, 4.2).paint(NEAR.iron);
      pn.disc(x + 48, y + 8.5, 3).paint([P.dark[0], P.glass[1], on > 0.5 ? P.glass[3] : P.glass[2], P.white], { outline: false, bevel: 'l' });
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; pn.ln(x + 48, y + 8.5, x + 48 + Math.cos(a) * 3, y + 8.5 + Math.sin(a) * 3, P.dark[0]); }
      pn.poly([[x + 44.5, y + 19], [x + 44.5, y + 15], [x + 48, y + 12.8], [x + 51.5, y + 15], [x + 51.5, y + 19]]).paint(NEAR.leather, { bevel: 'l' });
      pn.fill(x + 47.5, y + 14, 1, 5, P.black); pn.fill(x + 45, y + 15.5, 2, 1, P.iron[3]); pn.fill(x + 49, y + 15.5, 2, 1, P.iron[3]);
      for (let u = 3; u < 93; u += 6) { if (u > 36 && u < 58) continue; let q0 = null; for (let k = 0; k <= 6; k++) { const s = k / 6, q = [x + u + 6 * s, y + 18 + 3 * Math.sin(Math.PI * s)]; if (q0) pn.cap(q0[0], q0[1], q[0], q[1], 0.55); q0 = q; } }
      pn.paint(NEAR.steel, { bevel: '' });
      for (let u = 3; u <= 93; u += 6) { if (u > 36 && u < 60) continue; pn.fill(x + u - 0.5, y + 18, 1, 4, P.iron[3]); pn.dot(x + u, y + 22, P.brass[2]); }
    },
    // B 大本钟：威斯敏斯特钟楼式的厚重石砌车体——垂直式哥特窗格（竖棂 + 横档 + 镀金檐带），正中一只大钟面（金框、罗马刻度、指针在走），
    // 两侧各一块小钟面，下沿一排粗壮的挑檐托石
    bigben(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.rect(x + 1, y + 3, 94, 17).paint(NEAR.steel);
      pn.fill(x + 2, y + 4, 92, 1, P.brass[2]); pn.fill(x + 2, y + 5, 92, 1, P.brass[1]);
      for (let u = 4; u < 93; u += 4) { if (u > 34 && u < 62) continue; pn.fill(x + u, y + 6, 1, 11, P.iron[1]); }
      for (const r of [9.5, 13.5]) { pn.fill(x + 2, y + r, 32, 1, P.brass[1]); pn.fill(x + 62, y + r, 32, 1, P.brass[1]); }
      pn.fill(x + 2, y + 17, 92, 1.5, P.iron[1]);
      const t = o.t || 0, clock = (cx, cy, R) => {
        pn.rect(cx - R - 1.5, cy - R - 1.5, R * 2 + 3, R * 2 + 3).paint(NEAR.iron);
        pn.disc(cx, cy, R).paint(NEAR.brass);
        pn.disc(cx, cy, R - 1.3).paint(NEAR.steam, { outline: false, bevel: '' });
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; pn.dot(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2), k % 3 ? P.dark[3] : P.dark[0]); }
        const mA = t * 2 - Math.PI / 2, hA = t * 0.17 + 1;
        pn.ln(cx, cy, cx + Math.cos(mA) * (R - 2), cy + Math.sin(mA) * (R - 2), P.brass[0]); pn.ln(cx, cy, cx + Math.cos(hA) * (R - 3.2), cy + Math.sin(hA) * (R - 3.2), P.brass[0]);
        pn.dot(cx, cy, P.brass[3]);
      };
      clock(x + 48, y + 11.5, 7);
      for (let u = 4; u <= 92; u += 6) pn.rect(x + u - 1.6, y + 20, 3.2, 2.8).paint(NEAR.steel, { bevel: 'l' });
    },
    // C 黑龙车体（v8）：没有火光——车体本身只露出顶板下一条厚边和两头的角板，其余被裙板（龙鳞裙板三方案之一）盖住
    drake(pn, x, y, o) {
      deck(pn, x, y, o);
      pn.poly([[x + 1, y + 3], [x + 95, y + 3], [x + 93, y + 18], [x + 3, y + 18]]).paint(NEAR.iron);
      pn.fill(x + 2, y + 3, 92, 1.5, P.iron[1]);
      for (const [a, s] of [[2, 1], [94, -1]]) pn.poly([[x + a, y + 3], [x + a + s * 6, y + 3], [x + a + s * 2, y + 14]]).paint(NEAR.steel);   // 两头的角板
    },

  };
  // 每档的车体候选（T4～T6 重新探索）；SET 里的变体默认用第一种
  const HULL_CANDS = {
    4: [['conserv', 'A 水晶宫温室', '铸铁框 + 一排圆拱玻璃窗，檐口黄铜线，下沿一排铸铁吊饰（1851 水晶宫、维多利亚温室）'],
      ['yacht', 'B 蒸汽游艇', '船形车体：下沿一道弧、船首尖，镀金护舷线、六只黄铜舷窗、船首卷草金饰'],
      ['railcar', 'C 铁路沙龙车厢', '镶板车厢 + 圆角窗，两头敞开的车尾平台和黄铜栏杆，车底一副皇后柱张拉桁架']],
    5: [['ironclad', 'A 铁甲舰炮廓', '斜装甲、三扇带盖炮门、装甲带和大螺栓，船首下方一只撞角（1860 年代铁甲舰）'],
      ['boiler', 'B 机车锅炉', '整根卧式锅炉 + 黄铜箍，车头烟箱（圆门），车尾火箱（炉火），底下走板'],
      ['nautilus', 'C 鹦鹉螺潜艇', '雪茄形铆接艇身、艇首大圆观察窗、锯齿龙骨、艇尾螺旋桨（凡尔纳，1870）']],
    6: [['gothic', 'A 哥特教堂', '石砌立面 + 扶壁柱顶金十字，尖拱彩窗（以太光流过），正中门楼：玫瑰窗 + 尖拱木门，下沿倒挂尖拱花边（主线另配两面胯位燕尾旗）'],
      ['bigben', 'B 大本钟', '威斯敏斯特钟楼式厚重石砌车体：垂直式哥特窗格、镀金檐带，正中大钟面（指针在走），下沿一排粗挑檐托石'],
      ['drake', 'C 黑龙', '厚边车体 + 龙脊甲裙板（三种裙板见「黑龙 · 车体裙板」），没有透火，全是有厚度的甲片', 'spine']],
  };

  // 车体的附加层：BACK 画在车体后面（露出车体下沿的部分），FRONT 画在近侧腿前面
  const BACK = {
    // 锚链铁甲：两根锚链——前面一根短的吊在锚链孔下晃（走路时往后甩），车腹正中一根长的垂到地面、只拖一小截（四节）。
    // o.trail：1 = 前进（拖在车后，左边），-1 = 后退（拖到车前），中间值 = 正在换边
    drag(pn, x, y, o) {
      const s = o.trail == null ? 1 : o.trail, g = o.gy - 1, t = o.t || 0, jit = o.mv ? Math.sin((o.a || 0) * 4) * 0.4 : 0;
      const link = (px, py, i) => { if (i % 2) pn.fill(px - 0.5, py - 1, 1, 2, P.iron[3]); else { pn.disc(px, py, 1.5).paint(NEAR.steel, { bevel: 'l' }); pn.dot(px, py, P.dark[0]); } };
      const H0 = [x + 44, y + 19], pts = [];
      for (let k = 0; k <= 11; k++) { const u = k / 11, cc = [H0[0] - s * 3, g - 4], b = [H0[0] - s * 9, g]; pts.push([(1 - u) ** 2 * H0[0] + 2 * u * (1 - u) * cc[0] + u * u * b[0], (1 - u) ** 2 * H0[1] + 2 * u * (1 - u) * cc[1] + u * u * b[1]]); }
      for (let k = 1; k <= 4; k++) pts.push([H0[0] - s * (9 + k * 2.4) + jit, g]);
      pts.forEach(([px, py], i) => i && link(px, py, i));
      const H1 = [x + 64, y + 19], ang = Math.sin(t * 2.4) * 0.3 + (o.mv ? 0.35 * s : 0), N = 5;   // 短链：钟摆
      for (let i = 1; i <= N; i++) { const r = i * 2.3; link(H1[0] - Math.sin(ang) * r, H1[1] + Math.cos(ang) * r, i); }
      for (const H of [H0, H1]) { pn.disc(H[0], H[1] - 1.5, 2.4).paint(NEAR.steel); pn.dot(H[0], H[1] - 1.5, P.black); }
    },
    chains(pn, x, y, o) {      // 锚链铁甲：两个锚链孔之间垂下两段锚链
      const sw = Math.sin((o.t || 0) * 1.6) * 1.2;
      for (const [a, b, sag] of [[30, 66, 12], [36, 60, 7]]) {
        const N = Math.round((b - a) / 2.4);
        for (let i = 0; i <= N; i++) {
          const u = i / N, px = x + a + (b - a) * u + sw * Math.sin(Math.PI * u), py = y + 18 + sag * 4 * u * (1 - u);
          if (i % 2) pn.fill(px - 0.5, py - 1, 1, 2, P.iron[3]); else { pn.disc(px, py, 1.5).paint(NEAR.steel, { bevel: 'l' }); pn.dot(px, py, P.dark[0]); }
        }
      }
      for (const u of [30, 66]) { pn.disc(x + u, y + 17, 2.4).paint(NEAR.steel); pn.dot(x + u, y + 17, P.black); }
    },
  };
  const FRONT = {
    sideskirt(pn, x, y, o) {   // 步行履带：一战坦克式侧裙板，六块铆接钢板从车体中部垂到 y+28，把胯（腿根）和大腿上部整个罩住，每块一个排泥孔
      for (let i = 0; i < 6; i++) {
        const a = x + 3 + i * 15, b = a + 15;
        pn.poly([[a, y + 6], [b, y + 6], [b, y + 27], [a + 1, y + 28.5]]).paint(i % 2 ? NEAR.iron : NEAR.steel);
        pn.rect(a + 5, y + 19, 5, 3.4).paint(NEAR.dark, { bevel: '' });
        pn.fill(a + 1, y + 13, b - a - 1, 1, P.iron[0]);
        if (pn.hi) { for (let u = a + 2; u < b - 1; u += 3) { rivet(pn, u, y + 7); rivet(pn, u, y + 25.5); } } else for (let u = a + 2; u < b - 1; u += 3) { pn.dot(u, y + 7.5, P.iron[4]); pn.dot(u, y + 26, P.iron[4]); }
      }
      pn.fill(x + 3, y + 6, 90, 1, P.iron[3]);
    },
    banners(pn, x, y, o) {     // 哥特教堂：两个胯位各垂一面燕尾旗（深红底、金边、金十字），遮住胯和大腿根，随风摆
      const t = o.t || 0, cloth = [P.fire[0], P.fire[0], P.fire[1], P.fire[2]];
      for (const [cx, ph] of [[22, 0], [74, 1.7]]) {
        const top = y + 13, bot = y + 33, sw = Math.sin(t * 2 + ph) * 1.4, sl = (v) => sw * (v - top) / (bot - top);
        pn.poly([[x + cx - 5.5, top], [x + cx + 5.5, top], [x + cx + 5.5 + sl(bot), bot], [x + cx + sl(bot - 4), bot - 4.5], [x + cx - 5.5 + sl(bot), bot]]).paint(cloth, { bevel: 's' });
        for (const s of [-4.3, 4.3]) pn.ln(x + cx + s, top + 1, x + cx + s + sl(bot - 1), bot - 1.5, P.brass[2]);
        const m = (v) => x + cx + sl(v);
        pn.fill(m(top + 10) - 0.5, top + 4, 1.2, 9, P.brass[3]); pn.fill(m(top + 7) - 3, top + 6.5, 6.2, 1.2, P.brass[3]);
        pn.rect(x + cx - 7, top - 1, 14, 1.6).paint(NEAR.brass); pn.dot(x + cx - 7.5, top - 0.3, P.brass[3]); pn.dot(x + cx + 7, top - 0.3, P.brass[3]);
      }
    },
    skirt(pn, x, y, o) {       // 裙甲堡：车体下沿垂下一圈钟形铆接熟铁裙甲
      const N = 8, top = y + 14, bot = y + 32;
      for (let i = 0; i < N; i++) {
        const t0 = 4 + i * 88 / N, t1 = 4 + (i + 1) * 88 / N, fl = (u) => 48 + (u - 48) * 1.07;
        pn.poly([[x + t0, top], [x + t1, top], [x + fl(t1), bot - (i % 2 ? 0 : 1.5)], [x + fl(t0), bot - (i % 2 ? 0 : 1.5)]]).paint(i % 2 ? NEAR.iron : NEAR.steel);
        if (pn.hi) { rivet(pn, x + (t0 + t1) / 2 - 1, top + 2); rivet(pn, x + (fl(t0) + fl(t1)) / 2 - 1, bot - 4); } else pn.dot(x + (t0 + t1) / 2, top + 2, P.iron[4]);
      }
      pn.fill(x + 3, top, 90, 2, P.brass[1]); pn.fill(x + 3, top, 90, 1, P.brass[2]);
    },
    shields(pn, x, y, o) {     // 蒸汽圣骑：车体侧面一排骑士风筝盾，尖底垂出车体下沿
      for (const [cx, k] of [[7, 0], [36, 1], [48, 0], [60, 1], [89, 0]]) {
        const pts = [[cx - 4.6, y + 5], [cx + 4.6, y + 5], [cx + 4.6, y + 12], [cx + 2.4, y + 18], [cx, y + 22.5], [cx - 2.4, y + 18], [cx - 4.6, y + 12]].map(([u, v]) => [x + u, v]);
        pn.poly(pts).paint(NEAR.brass);
        pn.poly(pts.map(([u, v]) => [u + (x + cx - u) * 0.26, v + (y + 11 - v) * 0.2])).paint(NEAR.steel, { outline: false });
        if (k) pn.ln(x + cx - 3, y + 7, x + cx + 3, y + 14, P.brass[1], pn.hi ? 2 : 1); else { pn.ln(x + cx - 3, y + 14, x + cx, y + 9, P.brass[1]); pn.ln(x + cx, y + 9, x + cx + 3, y + 14, P.brass[1]); }
      }
    },
  };

  // ---------- 黑龙：车体裙板 3 方案（v8：不要透火，专注物理甲片和龙的质感）----------
  // 每片甲都有厚度：先在下一片上投一道 1.5px 的阴影，再画甲面（亮边 / 暗边）、中脊和几颗粗糙斑点；上排压下排，所以从最下一排开始画
  const DSH = [P.black, P.black, P.dark[0], P.dark[0]];
  const PLATE = [P.dark[0], P.iron[1], P.iron[2], P.iron[3]];
  const armor = (pn, pts, keel, ramp = PLATE, dy = 1.6) => {
    pn.poly(pts.map(([u, v]) => [u, v + dy])).paint(DSH, { outline: false, bevel: '' });
    pn.poly(pts).paint(ramp);
    if (keel) { pn.ln(keel[0], keel[1], keel[2], keel[3], P.iron[4]); pn.ln(keel[0] + 1, keel[1] + 1, keel[2] + 1, keel[3], P.iron[1]); }
  };
  const horn = (pn, x, y, dx, dy, w) => { pn.poly([[x - w, y], [x + w, y], [x + dx * 0.6 + w * 0.3, y + dy * 0.6], [x + dx, y + dy]]).paint([P.dark[0], P.iron[2], P.iron[3], P.iron[4]]); pn.ln(x - w * 0.2, y + 0.5, x + dx * 0.85, y + dy * 0.85, P.iron[4]); };
  const SKIRTS = {
    // A 龙脊甲：三层带中脊的大盾鳞（每片 13px 宽），最下一层是长长的尖角甲垂到 y+28；上层压下层、层层投影
    spine(pn, x, y, o) {
      for (const [t0, h, off, long] of [[14, 8.5, 0, 1], [9, 8, 6.5, 0], [4, 8, 0, 0]]) {
        for (let u = 2 + off - 13; u < 94; u += 13) {
          const a = Math.max(x + 2, x + u), b = Math.min(x + 94, x + u + 13), cx = x + u + 6.5, bt = y + t0 + h;
          if (b - a < 3) continue;
          const pts = (long ? [[a, y + t0], [b, y + t0], [b, bt - 5], [cx, bt + 2], [a, bt - 5]] : [[a, y + t0], [b, y + t0], [b, bt - 3], [cx + 3, bt - 0.5], [cx, bt], [cx - 3, bt - 0.5], [a, bt - 3]]).map(([px, py]) => [Math.min(x + 94, Math.max(x + 2, px)), py]);
          armor(pn, pts, cx > x + 4 && cx < x + 92 ? [cx, y + t0 + 1, cx, bt - 2] : null);
          if (cx > x + 4 && cx < x + 92) { pn.dot(cx - 3, y + t0 + 3, P.iron[1]); pn.dot(cx + 3.5, y + t0 + 4.5, P.iron[1]); }
        }
      }
    },
    // B 龙腹横甲：四条横向的宽腹甲（像龙 / 蛇的腹鳞），每条一片压一片、下沿微微下垂，甲面有横向的细纹；两头各一块弯角护板，最下一条挂五根粗尖角
    belly(pn, x, y, o) {
      for (let k = 2; k >= 0; k--) {
        const t0 = y + 4 + k * 5.5, b = t0 + 7.6, pts = [[x + 8, t0], [x + 88, t0]];
        for (let px = 88; px >= 8; px -= 2) pts.push([x + px, b - 1.6 + 1.6 * Math.sin(Math.PI * (px - 8) / 80)]);
        armor(pn, pts, null);
        for (let px = 20; px < 80; px += 15) { pn.ln(x + px, t0 + 1, x + px, b - 1, P.iron[0]); pn.ln(x + px + 1, t0 + 1, x + px + 1, b - 1.5, P.iron[3]); }   // 腹甲的分节缝
        pn.ln(x + 9, t0 + 1, x + 87, t0 + 1, P.iron[3]);
      }
      for (let u = 20; u < 80; u += 15) horn(pn, x + u + 7.5, y + 22.5, 0, 6, 2.6);
      for (const [a, s] of [[2, 1], [94, -1]]) armor(pn, [[x + a, y + 4], [x + a + s * 9, y + 4], [x + a + s * 8, y + 16], [x + a + s * 3, y + 26], [x + a, y + 20]], [x + a + s * 5, y + 6, x + a + s * 4, y + 22]);
    },
    // C 棘背甲：两个胯位各一副三层圆肩甲（一层比一层窄），每层两颗粗锥形骨刺朝外下方；中间一块带脊的胸甲，下沿两根向下的粗角
    horns(pn, x, y, o) {
      armor(pn, [[x + 37, y + 4], [x + 59, y + 4], [x + 59, y + 15], [x + 48, y + 21], [x + 37, y + 15]], [x + 48, y + 5, x + 48, y + 19]);
      horn(pn, x + 43, y + 17, -1.5, 8, 2.6); horn(pn, x + 53, y + 17, 1.5, 8, 2.6);
      for (const cx of [22, 74]) {
        for (const [t0, hw, h] of [[11, 11, 10], [4, 14, 10]]) {
          const pts = [[x + cx - hw, y + t0]];
          for (let k = 0; k <= 8; k++) { const a = Math.PI * k / 8; pts.push([x + cx - Math.cos(a) * hw, y + t0 + 2 + Math.sin(a) * (h - 2)]); }
          pts.push([x + cx + hw, y + t0]);
          armor(pn, pts, [x + cx, y + t0 + 1, x + cx, y + t0 + h - 1.5]);
        }
        for (const [s, t0, hw] of [[-1, 4, 14], [1, 4, 14], [-1, 11, 11], [1, 11, 11]]) horn(pn, x + cx + s * hw * 0.62, y + t0 + 6.5, s * 5, 5.5, 2.2);
      }
    },
  };
  const SKIRT_LIST = [
    ['spine', 'A 龙脊甲', '三层带中脊的大盾鳞（每片 13px），最下一层是长尖角甲垂到车体下方；上层压下层、每层在下一层上投影，甲面有粗糙斑点'],
    ['belly', 'B 龙腹横甲', '四条横向宽腹甲一条压一条（像龙腹的横鳞），甲面横向细纹；两头各一块弯角护板，最下挂五根粗尖角'],
    ['horns', 'C 棘背甲', '两个胯位各一副三层圆肩甲，每层两颗粗锥形骨刺朝外下方；中间一块带脊的胸甲，下沿两根粗角'],
  ];

  // ---------- v9 新腿的 4 个方案（页面「新腿方案」区块逐个展示；SET 里用第一个） ----------
  const LEG_VARIANTS = {
    hands: [
      ['A 三针轮', '三根等长的宝玑针（细针杆 + 矛形针尖 + 配重），像无辐圈车轮一样转着撑地；塔身伸缩吃掉一部分起伏', { kind: 'equal', len: 12, face: 5.4 }],
      ['B 时分秒', '时针短粗、分针中、秒针细长，三根不等长——撑地的针长短交替，走起来一瘸一拐', { kind: 'hms', len: 12, face: 5.2 }],
      ['C 双层六针', '前后两层各三根、错开 60°，六个撑点更平稳；后层暗色', { kind: 'six', len: 11, face: 5 }],
      ['D 摆锤', '塔身换成一根带摆锤盘的摆杆，毂随步态前后摆 ±4px，三根等长针', { kind: 'pend', len: 13, face: 5.4 }],
    ],
    horse: [
      ['A 战马', '厚甲板大腿 + 分节铆甲，护胫甲片，蹄毛是一圈钢穗，大蹄 + 蹄铁钉', { style: 'war', l1: 15, l2: 13, l3: 11, w: 1.1, fold: 1 }],
      ['B 赛马', '更修长（管骨更长、站得更高），管骨后一条液压肌腱，小蹄，收蹄幅度最大', { style: 'race', l1: 16, l2: 15, l3: 13, w: 0.95, fold: 1.3 }],
      ['C 挽马', '短粗柱腿，大腿外侧一只汽缸当肌肉，球节上一只黄铜弹簧，最大的蹄', { style: 'draft', l1: 13, l2: 12, l3: 9, w: 1.25, fold: 0.8 }],
      ['D 一战骑兵', '铆接铁甲腿，系骨和蹄换成一片 C 形板簧刀片脚（像跑步假肢）', { style: 'cav', l1: 15, l2: 14, l3: 10, w: 1.05, fold: 1.1 }],
    ],
  };

  // ---------- 编制（15 种 = 主线 6 + 变体 9） ----------
  // mt 材质档；hull 车体；back / front 车体附加层；leg 腿型；main 主线；kept = 之前采用的
  const SET = [
    { mt: 1, key: 'mk2', main: true, name: '工装 Mk.II', hull: 'base', leg: 'mk2', ref: '现役伏地蛛 + 双足 T1 工装 Mk.II',
      idea: '现役甲壳不动，腿换成双足 T1 的做法：箱形梁大腿、跨膝液压撑杆（在大腿和小腿之间那一层）、镂空的双支杆小腿、脚尖朝外的带肋平脚。' },
    { mt: 2, key: 'truss', main: true, kept: true, name: '桁架爬机', hull: 'girder', leg: 'truss', ref: '维多利亚铁桥 / 格构铁塔',
      idea: '小腿是往下收窄的铆接格构梁（透空），大腿是实心箱梁，铸铁平底靴；车体是一段熟铁板梁。' },
    { mt: 2, key: 'skirtfort', name: '裙甲堡', hull: 'girder', front: 'skirt', leg: 'skirt', ref: '双足裙甲堡',
      idea: '车体下沿垂下一圈八块钟形铆接熟铁裙甲，罩住大腿和膝盖，只露出粗护胫和脚尖朝外的铁靴。' },
    { mt: 3, key: 'leaf', main: true, kept: true, name: '板簧拖车', hull: 'landship', leg: 'leaf', ref: '一战炮兵牵引车',
      idea: '大腿是一叠弓形板簧（中段卡箍），小腿是粗撑杆 + 螺旋减震，脚是带抓地齿的履带板；车体是陆地巡洋舰装甲壳。' },
    { mt: 3, key: 'gren', name: '掷弹兵', hull: 'landship', leg: 'gren', ref: '双足掷弹兵',
      idea: '人形正膝，膝盖朝外、落在半高处：铆接圆筒大腿 + 黄铜箍，膝盖是一只压力表，喇叭口护胫、平头重靴，膝后一根蒸汽活塞。' },
    { mt: 3, key: 'pedrail', name: '步行履带', hull: 'landship', front: 'sideskirt', leg: 'pedrail', ref: '迪普洛克 Pedrail（1900 年代，一战坦克的前身之一）',
      idea: '膝盖朝里的两段粗支腿，每只脚是一段履带：三只负重轮、履带板随步子走；车体下挂一圈一战坦克式侧裙板（六块铆接钢板 + 排泥孔），罩住胯和大腿上部。' },
    { mt: 4, key: 'crank', main: true, kept: true, name: '曲柄步行机', hull: 'conserv', leg: 'crank', ref: '切比雪夫步行机 / 维多利亚机械玩具',
      idea: '水晶宫温室车体（窗里摆着盆栽、檐下垂着常春藤）。夸张的高膝：膝盖最高点超出车体顶板约 24px（半个底盘高）。飞轮在大腿后面转、推杆带大腿；大腿小腿都缠着常春藤（叶子 + 几朵小花），膝上垂下几缕藤蔓随风摆。' },
    { mt: 4, key: 'knight', name: '蒸汽圣骑', hull: 'conserv', front: 'shields', leg: 'knight', ref: '龟足 / 象足 + 骑士的护膝与风筝盾',
      idea: '腿换成龟足：短粗的甲板大腿、往下张开的柱状小腿（三排龟甲鳞 + 黄铜箍边），膝上圆护膝 + 小扇翼，脚是圆厚的龟足垫、前缘三枚钝甲；车体侧面挂一排五面风筝盾。' },
    { mt: 4, key: 'mantis', name: '螳臂步行机', hull: 'railcar', leg: 'mantis', ref: '螳螂的腿和胫刺（替换仪表步行机）',
      idea: '高膝，大腿是一片带棱线的三角甲板、下缘一排倒刺；小腿是一把越往下越细的长刀形胫甲，末端就是脚——一根钢尖（黄铜箍 + 一根后刺），只用尖点着地。四只尖脚是剪影的重点。车体用铁路沙龙车厢。' },
    { mt: 5, key: 'hammer', main: true, kept: true, name: '汽锤步行机', hull: 'ironclad', leg: 'hammer', ref: '内史密斯蒸汽锤',
      idea: '每条腿是一台吊在耳轴上的更粗的竖直汽缸，缸底伸出两根并排的活塞杆（中间镂空）、十字头连砧形铁脚。着地的半个周期里锤头连续砸地三下，每砸一下缸底喷汽、脚边扬尘。' },
    { mt: 5, key: 'centaur', name: '半人马', hull: 'cavalry', leg: 'horse', H: LEG_VARIANTS.horse[0][2], fast: 1.7, bob: 4.5, ref: '马的腿骨结构（膝朝前的后腿、肘朝后的前腿、跗关节、球节、蹄）；四个方案见「新腿方案」',
      idea: '钢制的马腿四足：后腿髋 → 膝（朝前）→ 跗关节（朝后的尖）→ 管骨 → 球节 → 蹄，前腿肩 → 肘（朝后）→ 腕 → 管骨 → 蹄；抬腿时管骨往后折、蹄底翻向后方。走得明显更快（同一车速下 1.7 倍）、颠得更厉害（机身起伏约 4～5px）。车体是流线铆接钢壳 + 黄铜号牌。' },
    { mt: 5, key: 'anchor', name: '锚链铁甲', hull: 'nautilus', back: 'drag', leg: 'anchor', ref: '维多利亚铁甲舰的锚与锚链',
      idea: '人形正膝，锻铁大腿、缠两道锚链箍的小腿，每只脚是一只船锚；车腹下两根锚链：前面一根短的吊着晃（走路时往后甩），正中一根长的垂到地面、只拖一小截；拖地那截跟着前进 / 后退换到车后（页面顶上可以切方向）。' },
    { mt: 6, key: 'gothic', main: true, name: '哥特教堂', hull: 'gothic', front: 'banners', leg: 'gothic', ref: '哥特复兴教堂：飞扶壁、尖塔、彩窗、玫瑰窗、燕尾旗',
      idea: '车体是教堂立面：石缝、扶壁柱顶金十字、尖拱彩窗（以太光流过），正中门楼（玫瑰窗 + 尖拱木门）。两个胯位各垂一面深红燕尾旗（金边、金十字），遮住胯和大腿根。腿：飞扶壁大腿、石砌方柱小腿（发光尖拱龛），膝上小尖塔，两级台座。' },
    { mt: 6, key: 'bigben', name: '大本钟', hull: 'bigben', leg: 'hands', H: LEG_VARIANTS.hands[0][2], ref: '威斯敏斯特钟楼 + 宝玑表针；时钟指针腿（四个方案见「新腿方案」）',
      idea: '厚重钟楼车体（大钟面指针在走）。腿：胯下一根可伸缩的塔身，下端一只钟面，钟面上三根宝玑针像无辐圈车轮一样转着撑地前进，撑地的针一换，车就一顿。' },
    { mt: 6, key: 'dragon', name: '黑龙', hull: 'drake', front: 'belly', leg: 'dragon', ref: '龙腹横鳞 + 中世纪板甲的叠片做法',
      idea: '车体下挂龙腹横甲：三条横向宽腹甲一条压一条（分节缝、投影），两头弯角护板，下挂五根粗尖角。腿是粗壮的三段龙腿：大腿三片厚甲、厚膝甲 + 角刺、跗关节粗后刺、三根粗弯爪 + 后爪。' },
  ];
  const LEG_H = { crank: { reach: 4, up: 34, kx: 7 }, skirt: { reach: 3 }, gren: { reach: 3 }, pedrail: { reach: 2 }, knight: { reach: 2 }, mantis: { up: 2, kx: 12, reach: 3 }, anchor: { reach: 3 }, dragon: { reach: 0 }, gothic: { reach: 3 }, hands: { reach: 2 }, horse: { reach: 3 } };

  // 机身起伏：对角两腿交替着地（plantGait：一对腿在 u=0.75、另一对在 u=0.25 撑在胯正下方 = 最高；u=0、0.5 双支撑 = 最低），每步两次
  // 步幅（v7）：跟车速变——慢走 14px、快跑 24px（原来最多 13）；步态角按走过的距离推进：Δa = 2π·距离 / (4·步幅)，所以同样的车速步频更低，脚不打滑
  const strideOf = (v) => Math.max(14, Math.min(24, 14 + v * 0.12));
  const bobOf = (o) => (o.mv ? Math.round((o.amp != null ? o.amp : 2 + ((o.stride || 14) - 14) / 10) * (1 - Math.abs(Math.sin(o.a || 0)))) : 0);

  // 画一只整件四足（游戏和样机共用）。(ox, oy) = 模块左上角；e = SET 里的一项。
  // o = { mv, a 步态角, stride 步幅, bd 机身下沉（不给就按 bobOf 算）, g: [近后, 近前, 远后, 远前] 四只脚的悬挂伸缩, top, t 秒, trail 锚链方向,
  //       hull / front / back / skirt / legH（样机页换件对照用） }
  // part：'far' 只画远侧两条腿 / 'near' 车体 + 近侧腿 + 前挂件 / 'shell' 只画车体和挂件 / 'legs' 只画近侧腿 / 省略 = 都画
  function draw(pn, ox, oy, e, o = {}, part) {
    const S = o.stride || 14, lo = { mv: !!o.mv, a: o.a || 0, plant: true, plantS: S, plantH: 4 + 0.3 * S };
    const y = oy + (o.bd != null ? o.bd : bobOf({ ...o, amp: e.bob })), H = { ...(LEG_H[e.leg] || {}), ...(e.H || {}), ...(o.legH || {}) }, gg = o.g || [0, 0, 0, 0];
    const ho = { t: o.t || 0, top: !!o.top, mv: !!o.mv, a: o.a || 0, gy: oy + 48, trail: o.trail };
    const leg = (M, far, [hx, hy], gy, dir, ph) => {
      const q = [], c = { pn, M, far, hx: ox + hx, hy: y + hy, gy, dir, ph, o: lo, t: o.t || 0, L: (z, fn) => q.push([z, q.length, fn]) };
      c.g = gait(lo, ph, 5, 4);
      LEGS[e.leg](c, H);
      q.sort((a, b) => (far ? b[0] - a[0] : a[0] - b[0]) || a[1] - b[1]);
      for (const [, , fn] of q) fn();
    };
    if (!part || part === 'far') { leg(FAR, true, HIPS.fr, oy + 45 + gg[2], -1, Math.PI); leg(FAR, true, HIPS.ff, oy + 45 + gg[3], 1, 0); }
    if (part === 'far') return;
    const hull = o.hull || e.hull, back = o.hull ? o.back : e.back, front = o.skirt || (o.hull ? o.front : e.front);
    if (part !== 'legs') { if (back) BACK[back](pn, ox, y, ho); HULL[hull](pn, ox, y, ho); }
    if (part !== 'shell') { leg(NEAR, false, HIPS.nr, oy + 48 + gg[0], -1, 0); leg(NEAR, false, HIPS.nf, oy + 48 + gg[1], 1, Math.PI); }
    if (part !== 'legs' && front) (FRONT[front] || SKIRTS[front])(pn, ox, y, ho);
  }
  // 样机页用：画到一张透明画布上（自己建光栅器）
  function figure(g, ox, oy, e, o = {}) {
    const pn = LL.Pen(g.canvas.width, g.canvas.height).at(1, 0, 0);
    draw(pn, ox, oy, e, o);
    pn.flush(g);
  }
  const BY_KEY = Object.fromEntries(SET.map(e => [e.key, e]));
  // 游戏里按材料取的六档主线（外观阶段 = 材料 1～6）
  const MAIN = [1, 2, 3, 4, 5, 6].map(mt => SET.find(e => e.mt === mt && e.main).key);
  return { SET, BY_KEY, MAIN, draw, figure, LEGS, HULL, HULL_CANDS, SKIRT_LIST, LEG_VARIANTS, bobOf, strideOf };
})();
