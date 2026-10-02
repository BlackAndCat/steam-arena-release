// 程序化像素精灵（48px 格）。不再用角标图标：每个模块靠自身造型一眼可辨。
// 驾驶舱 = 黄铜拱门剖面 + Q 版护目镜驾驶员；水箱 = 带水位的方块；锅炉 = 铁栅栏后闷燃的煤；
// 直射炮 = 水平长管；高抛炮 = 朝天粗管；撞击武器 = 锈钢铲斗/撞角/撞锤；履带 = 一战铆接履带框架。
window.SA = window.SA || {};

SA.SPR = (() => {
  // C：模块精灵的原生尺寸（48px = 2×2 子格）；S：网格子格（24px）。精灵按 C 画，摆放位置按 S 算
  const P = SA.PAL, K = SA.K, C = K.ART, S = K.CELL;
  const PADX = 28;               // 左右留白：炮管最多伸出半格（24px）
  let ctx = null;

  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // ramp = [描边, 暗面, 固有色, 亮面]，光源统一左上
  const box = (x, y, w, h, ramp) => {
    R(x, y, w, h, ramp[0]);
    R(x + 1, y + 1, w - 2, h - 2, ramp[2]);
    R(x + 1, y + h - 2, w - 2, 1, ramp[1]);
    R(x + w - 2, y + 1, 1, h - 2, ramp[1]);
    R(x + 1, y + 1, w - 2, 1, ramp[3]);
    R(x + 1, y + 1, 1, h - 2, ramp[3]);
  };
  const disc = (cx, cy, r, c) => {
    ctx.fillStyle = c;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) ctx.fillRect(xx, yy, 1, 1);
      }
  };
  const line = (x0, y0, x1, y1, w, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    ctx.fillStyle = c;
    const o = Math.floor(w / 2);
    for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n) - o, Math.round(y0 + (y1 - y0) * i / n) - o, w, w);
  };
  const rivet = (x, y, lite = P.iron[4], dk = P.iron[0]) => { R(x, y, 2, 2, lite); R(x + 1, y + 1, 1, 1, P.iron[2]); R(x + 2, y + 1, 1, 1, dk); R(x + 1, y + 2, 1, 1, dk); };
  // 拱形：上半圆 + 下方矩形
  const arch = (cx, top, bottom, rad, col) => {
    const cy = top + rad;
    ctx.fillStyle = col;
    for (let yy = top; yy < bottom; yy++) {
      const dy = yy + 0.5 - cy;
      const hw = dy < 0 ? Math.sqrt(Math.max(0, rad * rad - dy * dy)) : rad;
      ctx.fillRect(Math.round(cx - hw), yy, Math.round(hw * 2), 1);
    }
  };

  const IRON = [P.iron[0], P.iron[1], P.iron[2], P.iron[3]];
  const IRONL = [P.iron[0], P.iron[2], P.iron[3], P.iron[4]];
  const DARK = [P.dark[0], P.dark[1], P.dark[2], P.dark[3]];
  const BRASS = [P.brass[0], P.brass[1], P.brass[2], P.brass[3]];
  const RUST = [P.rust[0], P.rust[1], P.rust[2], P.rust[3]];

  // 可转动的炮组：先在离屏按「水平」画好，再以耳轴为支点转到仰角 a（度，向上为正）贴回来；最近邻缩放保持像素风
  const gunLayer = document.createElement('canvas');
  gunLayer.width = 112; gunLayer.height = 64;
  function turn(px, py, a, draw) {
    const main = ctx, lg = gunLayer.getContext('2d');
    lg.clearRect(0, 0, 112, 64);
    ctx = lg;
    draw(40 - px, 32 - py);          // 画的时候支点落在离屏 (40, 32)
    ctx = main;
    main.save();
    main.imageSmoothingEnabled = false;
    main.translate(px, py); main.rotate(-(a || 0) * Math.PI / 180);
    main.drawImage(gunLayer, -40, -32);
    main.restore();
  }

  // 后坐量化档 k（0~8）→ 该武器的制退位移（px）
  const rcPx = (id, k) => Math.round((k || 0) / 8 * (SA.MODULES[id].rcPx || 0));

  // ---------- 改装挂件（V3）：炮盾 / 加固裙板 / 加厚撞面 / 附加装甲，每级多挂一层，画成冷铁（材料装饰层照常换色）----------
  const bolted = (x, y, w, h) => { box(x, y, w, h, IRONL); if (w >= 5 && h >= 5) { R(x + 1, y + 1, 1, 1, P.iron[4]); R(x + w - 2, y + h - 2, 1, 1, P.iron[1]); } };
  // 炮盾：立在耳轴前面的防盾，炮管画在它上面（所以不用开炮口缝）。cx = 防盾左边，cy = 耳轴高度，hh = 一级的半高；
  // 一级一块板，二级加高并在顶上折边，三级再叠一层加强板
  function gunShield(cx, cy, lv, hh) {
    if (!lv) return;
    const h1 = hh + (lv - 1) * 3;
    box(cx, cy - h1, 5, h1 * 2, IRON); R(cx + 1, cy - h1 + 1, 1, h1 * 2 - 2, P.iron[4]);
    for (let k = cy - h1 + 3; k < cy + h1 - 3; k += 6) { R(cx + 2, k, 2, 2, P.iron[1]); R(cx + 2, k, 1, 1, P.iron[4]); }
    if (lv >= 2) { R(cx - 3, cy - h1, 8, 2, P.iron[0]); R(cx - 3, cy - h1, 8, 1, P.iron[3]); }
    if (lv >= 3) box(cx + 4, cy - h1 + 4, 3, h1 * 2 - 8, IRONL);
  }
  // 非武器的挂件：精灵画完以后贴上去（武器的炮盾在 DRAW 里画，要压在炮管下面）
  function attach(id, q, f, x, y) {
    const lv = q.up, m = SA.MODULES[id];
    if (!lv || SA.isWeapon(id)) return;
    if (m.layer === 'chassis') {
      if (id === 'track') {   // 裙板盖住上段履带和侧框上沿，三级分段
        // 2026-09-29 履带改六档后：裙板从上段链带（y+18）往下盖，一级只盖住上段，三级盖到负重轮上沿（T6 自带全包裙板，加固板叠在它外面一层）
        const x0 = x + (q.connL ? 0 : 6), x1 = x + (q.connR ? C : 44), hh = [0, 7, 11, 16][lv], y0 = y + 18;
        box(x0, y0, x1 - x0, hh, IRONL);
        R(x0 + 1, y0 - 2 + hh, x1 - x0 - 2, 1, P.iron[1]);
        for (let k = x0 + 4; k < x1 - 2; k += 8) rivet(k, y0 + 2);
        if (lv >= 3) for (let k = x0 + 12; k < x1 - 2; k += 12) R(k, y0 + 1, 1, hh - 2, P.iron[0]);
      } else { box(x + 4, y + 1, 40, 3 + lv * 2, IRONL); for (let k = 8; k < 42; k += 10) rivet(x + k, y + 2); }
      return;
    }
    if (m.layer === 'ram') {
      if (id === 'bucket') {   // 犁壁前沿再贴一条耐磨板，一级比一级厚（犁壁前沿：(24,5) → (41,41)）
        for (let yy = 6; yy <= 41; yy++) { const x0 = x + 24 + Math.round((yy - 5) * 17 / 36); R(x0, y + yy, lv + 1, 1, P.iron[0]); R(x0, y + yy, lv, 1, yy % 8 === 0 ? P.iron[4] : P.iron[3]); }
      } else if (id === 'spike') {   // 舰艏撞角身上套竖加强箍（上沿斜坡、下沿平直之间）
        for (let i = 0; i < lv; i++) { const u = 14 + i * 8, top = u < 20 ? 6 + (u - 6) * 2 / 14 : 8 + (u - 20) * 22 / 26, bot = 42 - (u - 6) * 4 / 34; box(x + u, y + Math.round(top), 3, Math.round(bot - top), IRONL); }
      } else if (id === 'piston') {   // 锤面加厚（锤面跟着蓄力位置走）
        const cc = (q.c == null ? 10 : q.c) / 10, hx = x + 12 + 19 - cc * 14.5 + 6;
        box(Math.round(hx + 14), y + 6, 1 + lv * 2, 36, IRONL);
      }
      return;
    }
    // 附加装甲：左右两侧先挂竖板，三级再加一条底板
    const W = f.w * S, H = f.h * S, t = W > S ? 5 : 3, y0 = y + Math.round(H * 0.2), hh = Math.round(H * 0.65);
    bolted(x + 1, y0, t, hh);
    if (lv >= 2) bolted(x + W - 1 - t, y0, t, hh);
    if (lv >= 3) bolted(x + 2, y + H - t - 1, W - 4, t);
  }

  // 履带节：xa..xb 范围内按 8px 节距排布，off 为滚动偏移
  function links(xa, xb, yy, h, off, grouser) {
    R(xa, yy, xb - xa, h, P.dark[0]);
    for (let lx = xa - 8 + (((off % 8) + 8) % 8); lx < xb; lx += 8) {
      const a = Math.max(lx, xa), b = Math.min(lx + 7, xb);
      if (b <= a) continue;
      R(a, yy + 1, b - a, h - 2, P.dark[2]);
      R(a, yy + 1, b - a, 1, P.dark[3]);
      if (grouser && lx + 2 >= xa && lx + 5 <= xb) R(lx + 2, yy + h, 3, 2, P.dark[3]);
    }
  }
  // 下段履带：逐列画，高度跟着 hAt(本格内 x) 走，折线穿过各组负重轮底部；链节图案按画布绝对 x 排（格宽 48 是节距 8 的整数倍，跨格不错位）
  function belt(x, xa, xb, yy, hAt, ph) {
    for (let cx = xa; cx < xb; cx++) {
      const t = yy + Math.round(hAt(cx - x)), p = (((cx + ph) % 8) + 8) % 8;
      R(cx, t, 1, 6, P.dark[0]);
      if (p !== 7) { R(cx, t + 1, 1, 4, P.dark[2]); R(cx, t + 1, 1, 1, P.dark[3]); }
      if (p >= 2 && p <= 4) R(cx, t + 6, 1, 2, P.dark[3]);
    }
  }
  // 折线插值：pts = [[x, h], …]（x 递增），两端之外取端点
  function polyAt(pts) {
    return (lx) => {
      if (lx <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (lx <= pts[i][0]) { const [x0, h0] = pts[i - 1], [x1, h1] = pts[i]; return h0 + (h1 - h0) * (lx - x0) / Math.max(1, x1 - x0); }
      return pts[pts.length - 1][1];
    };
  }
  function spokedWheel(cx, cy, r, ph, spokes, hub = P.iron[3]) {
    disc(cx, cy, r + 1.5, P.dark[0]);
    disc(cx, cy, r + 0.5, P.dark[1]);
    for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2 + ph;
      R(Math.round(cx - 1 + Math.cos(ang) * (r + 0.5)), Math.round(cy - 1 + Math.sin(ang) * (r + 0.5)), 2, 2, P.dark[3]);
    }
    disc(cx, cy, r - 2, P.dark[3]);
    disc(cx, cy, r - 3.2, P.dark[2]);
    for (let a = 0; a < spokes; a++) {
      const ang = a / spokes * Math.PI * 2 + ph;
      line(Math.round(cx), Math.round(cy), Math.round(cx + Math.cos(ang) * (r - 3)), Math.round(cy + Math.sin(ang) * (r - 3)), 1, P.iron[2]);
    }
    disc(cx, cy, 2.4, hub);
    R(Math.round(cx) - 1, Math.round(cy) - 1, 1, 1, P.iron[4]);
  }
  // 履带绕过尾部链轮的半圈（左半椭圆环），链节按弧长 8px 节距排布、随 ph 滚动，外侧带履齿
  function wrapBand(cx, cy, rx, ry, ph) {
    const th = 6, rm = (rx + ry) / 2 - th / 2;
    for (let yy = Math.floor(cy - ry - 2); yy <= Math.ceil(cy + ry + 2); yy++)
      for (let xx = Math.floor(cx - rx - 2); xx < cx; xx++) {
        const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
        const eo = (dx / rx) ** 2 + (dy / ry) ** 2;
        const ei = (dx / (rx - th)) ** 2 + (dy / (ry - th)) ** 2;
        const eg = (dx / (rx + 2)) ** 2 + (dy / (ry + 2)) ** 2;
        let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
        const m = ((Math.floor((a - Math.PI / 2) * rm + ph) % 8) + 8) % 8;
        if (eo <= 1 && ei > 1) {
          const e1 = (dx / (rx - 1)) ** 2 + (dy / (ry - 1)) ** 2, e2 = (dx / (rx - th + 1)) ** 2 + (dy / (ry - th + 1)) ** 2;
          const edge = e1 > 1 || e2 <= 1 || m === 7;
          R(xx, yy, 1, 1, edge ? P.dark[0] : m === 0 ? P.dark[3] : P.dark[2]);
        } else if (eo > 1 && eg <= 1 && m >= 2 && m <= 4) R(xx, yy, 1, 1, P.dark[3]);
      }
  }
  // 腿式底盘：腿用 js/legs.js 的光栅器画（形状先写进遮罩，再按描边 / 暗面 / 固有色 / 亮面四阶上色，光源左上）。
  // 外观阶段 → 腿型：双足取 legs.js 的 DESIGNS（真双足 bipedArt），四足取 legs.js 的 Q6（六档主线 MAIN）
  // 双足六档（外观阶段 = 材料 1~6）：工装 Mk.II → 鹭步 → 掷弹兵 → 蒸汽圣骑 → 钟表巨像 → 熔心龙骑；每档配的腰胯见 legs.js 的 HIP_OF。
  // 唯一变体（高跷 / 板簧跑刃 / 裙甲堡 / 锁甲骑士 / 缩放仪 / 蒸汽人 / 风箱腿 / 圣堂骑士腿 / 晶枝腿）已在 legs.js 的 DESIGNS 里，等 astra 定获得方式再接
  const BIPED_LOOK = ['mk2', 'heron', 'gren', 'knight', 'clock', 'dragon'];
  // 四足六档（外观阶段 = 材料 1~6）：工装 Mk.II → 桁架爬机 → 板簧拖车 → 曲柄步行机（温室）→ 汽锤步行机 → 哥特教堂；
  // 9 种唯一变体（裙甲堡、掷弹兵、步行履带、蒸汽圣骑、螳臂、半人马、锚链铁甲、大本钟、黑龙）已在 Q6.SET 里，等 astra 定获得方式后由 cell.look 覆盖
  const QUAD_LOOK = () => SA.LEGLAB.Q6.MAIN;
  const pens = new Map();
  function penFor(cv) {
    const k = `${cv.width}x${cv.height}`;
    let p = pens.get(k);
    if (!p) { p = SA.LEGLAB.Pen(cv.width, cv.height); pens.set(k, p); }
    return p.at(1, 0, 0);
  }
  // 腿式底盘（有腿、要画远侧腿的底盘）；amp 是旧逐格画法留下的起伏幅度，整件四足 / 真双足改用 quadBob / bipedBob
  const BOB = { biped: 3, quad: 1 };
  const gfOf = (a) => ((Math.round(a / (Math.PI * 2 / 12)) % 12) + 12) % 12;   // 腿的步态帧：战斗给的是步态角（每走 4 × 步幅一圈），12 帧一循环
  // 底盘顶部的车体底板：与上方模块的框架同色相接；没有模块压着时才描顶边
  function floor(x, y, o, h = 5) {
    R(x, y, C, h, P.iron[1]);
    if (!o.top) { R(x, y, C, 1, P.iron[0]); R(x, y + 1, C, 1, P.iron[3]); }
    for (let rx = 4; rx < C; rx += 8) R(x + rx, y + h - 2, 1, 1, P.iron[3]);
    R(x, y + h - 1, C, 1, P.iron[0]);
  }

  // Q 版小黑炭球：毛茸茸的圆身子 + 萌萌的大眼睛 + 两只小短手。不是纯黑：身子带色、上沿有亮边、毛尖更深
  // pal = [毛尖, 身子, 亮边]；look = 眼珠朝向（-1 左 / 1 右）；blink = 眨眼；hands = [[肩x, 肩y, 手x, 手y], …]
  function soot(cx, cy, rad, pal, o = {}) {
    const [tip, body, rim] = pal;
    for (let i = 0; i < 16; i++) {   // 毛刺
      const a = i / 16 * Math.PI * 2 + (i % 2) * 0.2, rr = rad + 1.5 + (i % 3 === 0 ? 1.5 : 0);
      R(Math.round(cx + Math.cos(a) * rr) - 1, Math.round(cy + Math.sin(a) * rr) - 1, 2, 2, tip);
    }
    disc(cx, cy, rad + 0.6, tip);
    disc(cx, cy, rad - 0.4, body);
    for (let i = 0; i <= 6; i++) {   // 左上亮边
      const a = Math.PI * (1.05 + i * 0.07);
      R(Math.round(cx + Math.cos(a) * (rad - 1.5)), Math.round(cy + Math.sin(a) * (rad - 1.5)), 1, 1, rim);
    }
    for (const [sx, sy, hx, hy] of o.hands || []) {   // 小短手：两像素粗，末端一颗圆拳
      line(sx, sy, hx, hy, 3, tip); line(sx, sy, hx, hy, 1, body);
      disc(hx, hy, 1.6, tip); R(Math.round(hx) - 1, Math.round(hy) - 1, 1, 1, rim);
    }
    const look = o.look || 0, ey = cy - 1, er = rad * 0.42, gap = rad * 0.45;
    for (const ex of [cx - gap, cx + gap]) {   // 大眼睛：白底 + 黑瞳 + 高光
      if (o.blink) { R(Math.round(ex - er), Math.round(ey), Math.round(er * 2) + 1, 1, P.steam[2]); continue; }
      disc(ex, ey, er + 0.8, P.black); disc(ex, ey, er, P.white);
      R(Math.round(ex + look) - 1, Math.round(ey) - 1, 3, 4, P.black);
      R(Math.round(ex + look) - 1, Math.round(ey) - 1, 1, 1, P.white);
    }
  }
  const SOOT_PILOT = ['#141824', '#2f3850', '#6a7a9c'];     // 驾驶员：蓝灰炭球
  // 舷窗里的 1×1 大小驾驶员（驾驶舱和联合驾驶舱共用，联合驾驶舱里的驾驶员不放大）。
  // f = 动画帧（1、2 帧往下沉一格，3 帧眨眼）；st ≥ 2 = 史诗起的换装：皮飞行帽 + 黄铜护目镜
  function pilot(cx, cy, f, blink, st) {
    const bob = f === 1 || f === 2 ? 1 : 0, yy = cy + bob;
    disc(cx, yy, 3.3, SOOT_PILOT[0]); disc(cx, yy, 2.6, SOOT_PILOT[1]);
    R(cx - 2, yy - 2, 1, 1, SOOT_PILOT[2]);
    if (st >= 2) {
      R(cx - 2, yy - 4, 5, 2, P.leather[1]); R(cx - 1, yy - 4, 3, 1, P.leather[2]);
      R(cx - 4, yy - 1, 9, 1, P.brass[1]);
      for (const ex of [cx - 2, cx + 1]) { R(ex, yy - 1, 2, 2, P.brass[2]); R(ex, yy - 1, 1, 1, P.glass[3]); R(ex + 1, yy, 1, 1, P.glass[1]); }
      return;
    }
    for (const ex of [cx - 2, cx + 1]) {
      if (f === 3 && blink) { R(ex, yy, 2, 1, P.steam[2]); continue; }
      R(ex, yy - 1, 2, 2, P.white); R(ex + 1, yy, 1, 1, P.black);
    }
  }
  // 黄铜舷窗，里面坐一个驾驶员；seed 让几个驾驶员的动画错开
  function porthole(cx, cy, o, seed) {
    disc(cx, cy, 6.2, P.black); disc(cx, cy, 5.4, P.brass[1]);
    for (const [px, py] of [[-4, -4], [-2, -5], [-5, -2]]) R(cx + px, cy + py, 1, 1, P.brass[3]);
    disc(cx, cy, 4.3, P.glass[0]);
    const f = ((o.lv || 0) + seed) % 4;
    pilot(cx, cy + 1, f, ((o.seed || 0) + seed) % 2 === 0, o.st || 1);
    R(cx - 3, cy - 3, 1, 1, P.glass[3]);
  }
  const SOOT_CO = ['#1c1318', '#4a3040', '#8a6078'];        // 副驾驶：暖棕紫炭球

  // ---------- 公共装饰零件（2026-09-27 定稿，规则见 docs/visual-rules.md，样机 tools/cannon-lab.html）----------
  // 两类：铁件（包角铁、散热口）在 DRAW 里画，跟着材料换色；身份件（铆钉、珐琅铭牌、压力表）在 OVER 里、材质处理之后画，颜色按档位固定。
  // 位置一律按模块立面的分区放（接缝铆钉 → 散热区 → 铭牌区；包角位；表位），互相至少空 1 像素，不压散热口和观察缝。
  const RIVET_TIER = { brass: [P.brass[3], P.brass[2], P.brass[0]], steel: ['#e2eef0', '#9fb4b8', '#2c3637'] };   // T1～3 黄铜，镀镍起钢质淡青
  const PART = {
    // 散热口：暗线 + 下面一道亮线；rows 单列横槽 / grid 双列 / louver 斜百叶
    vents(x, y, z, style, n) {
      const slot = (sx, sy, w) => { R(x + sx, y + sy, w, 1, P.iron[0]); R(x + sx, y + sy + 1, w, 1, P.iron[3]); };
      if (style === 'rows') { const gap = n <= 2 ? 4 : 3; for (let i = 0; i < n; i++) slot(z.x, z.y + 1 + i * gap, 12); }
      else if (style === 'grid') { for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) slot(z.x + c * 8, z.y + i * 3, 6); }
      else if (style === 'louver') { for (let i = 0; i < n; i++) for (let k = 0; k < 7; k++) { R(x + z.x + i * 4 + (k >> 1), y + z.y + k, 1, 1, P.iron[0]); R(x + z.x + i * 4 + (k >> 1) + 1, y + z.y + k, 1, 1, P.iron[3]); } }
    },
    // 包角铁：L 形角铁 5×5 + 一颗铆钉；fx / fy 是朝向
    corner(x, y, fx = 1, fy = 1) {
      const X = (dx) => (fx > 0 ? x + dx : x + 4 - dx), Y = (dy) => (fy > 0 ? y + dy : y + 4 - dy);
      for (let i = 0; i < 5; i++) { R(X(i), Y(0), 1, 1, P.dark[0]); R(X(0), Y(i), 1, 1, P.dark[0]); R(X(i), Y(1), 1, 1, P.dark[3]); R(X(1), Y(i), 1, 1, P.dark[3]); }
      R(X(1), Y(1), 1, 1, P.iron[4]); R(X(2), Y(2), 1, 1, P.dark[0]);
    },
    // 铆钉（身份件）：2×2 钉头 + 右下暗影，颜色 c = [亮, 中, 影]
    rivet(x, y, c) { R(x, y, 2, 2, c[0]); R(x + 1, y + 1, 1, 1, c[1]); R(x + 2, y + 1, 1, 1, c[2]); R(x + 1, y + 2, 1, 1, c[2]); },
    // 接缝铆钉：在 x0～x1 之间等距打 n 颗
    seam(x, y, z, n, c) { const step = n > 1 ? (z.x1 - z.x0) / (n - 1) : 0; for (let i = 0; i < n; i++) PART.rivet(Math.round(x + z.x0 + i * step), y + z.y, c); },
    // 珐琅铭牌 10×6：黄铜边框 + 深色底 + 两道黄铜刻字——放在任何底色上都分得开
    plate(x, y) {
      R(x, y, 10, 6, P.brass[0]); R(x + 1, y + 1, 8, 4, P.brass[2]); R(x + 1, y + 1, 8, 1, P.brass[3]);
      R(x + 2, y + 2, 6, 2, '#1c1a1f'); R(x + 3, y + 2, 4, 1, P.brass[1]); R(x + 3, y + 3, 3, 1, P.brass[1]);
    },
    // 压力表 直径 11：黄铜圈 + 蒸汽白表盘 + 绿区 + 指针
    gauge(cx, cy) {
      disc(cx, cy, 5, P.brass[0]); disc(cx, cy, 4, P.brass[2]); disc(cx, cy, 3.2, P.steam[2]);
      R(Math.round(cx - 3), Math.round(cy - 3), 1, 1, P.brass[3]);
      for (let i = 0; i < 4; i++) { const a = Math.PI * (1.6 + i * 0.14); R(Math.round(cx - 0.5 + Math.cos(a) * 2.4), Math.round(cy - 0.5 + Math.sin(a) * 2.4), 1, 1, P.gauge[1]); }
      line(Math.round(cx - 0.5), Math.round(cy - 0.5), Math.round(cx - 2.5), Math.round(cy - 2), 1, P.dark[0]);
      R(Math.round(cx - 0.5), Math.round(cy - 0.5), 1, 1, P.fire[1]);
    },
  };
  // 直射火炮 2×2 的立面分区（模块内坐标）：炮组左边露出来的那块立面 x 4～25、y 16～38
  const CANNON_ZONE = { seam: { y: 18, x0: 10, x1: 23 }, vent: { x: 7, y: 22 }, plate: { x: 7, y: 32 }, gauge: { x: 11, y: 11 } };
  // 六档：炮塔、炮管、散热口排法 + 数量、接缝铆钉（数量 + 材质）、零件。形体只在 T3、T5 变（方 → 方平顶 → 斜向板）
  const CANNON_TIERS = [
    { t: 'square', b: 1, vent: ['rows', 2], riv: [2, 'brass'], parts: [] },
    { t: 'square', b: 1, vent: ['rows', 2], riv: [2, 'brass'], parts: [] },
    { t: 'box', b: 2, vent: ['rows', 3], riv: [3, 'brass'], parts: ['corners'] },
    { t: 'box', b: 2, vent: ['rows', 3], riv: [3, 'steel'], parts: ['corners', 'plate', 'gauge'] },
    { t: 'slant', b: 3, vent: ['grid', 3], riv: [4, 'steel'], parts: ['corners', 'plate', 'gauge'] },
    { t: 'slant', b: 3, vent: ['louver', 4], riv: [4, 'steel'], parts: ['corners', 'plate', 'gauge'] },
  ];
  const cannonBase = (x, y) => { box(x + 3, y + 16, 42, 29, IRON); R(x + 4, y + 39, 40, 1, P.brass[2]); R(x + 4, y + 40, 40, 1, P.brass[1]); };
  const CANNON_TOWER = {
    square(x, y) { box(x + 10, y + 7, 22, 10, IRON); R(x + 14, y + 10, 12, 1, P.iron[0]); cannonBase(x, y); },
    box(x, y) { box(x + 5, y + 5, 28, 12, IRON); R(x + 18, y + 9, 11, 2, P.dark[0]); box(x + 11, y + 1, 8, 5, IRON); cannonBase(x, y); },
    slant(x, y) {
      for (let yy = 5; yy <= 16; yy++) {
        const xr = x + 31 + Math.round((yy - 5) * 1.2);
        R(x + 5, y + yy, xr - x - 5, 1, P.iron[2]); R(x + 5, y + yy, 1, 1, P.iron[0]); R(xr - 1, y + yy, 1, 1, P.iron[0]); R(xr - 2, y + yy, 1, 1, P.iron[4]);
      }
      R(x + 5, y + 4, 26, 1, P.iron[0]); R(x + 6, y + 5, 24, 1, P.iron[4]);
      R(x + 17, y + 9, 10, 2, P.dark[0]); box(x + 11, y, 8, 5, IRON); cannonBase(x, y);
    },
  };
  // ---------- 火炮家族（2026-09-27 定稿，样机 tools/gun-family-lab.html，规则 docs/visual-rules.md）----------
  // 窄区散热口（中炮）：slits 竖缝 / slits2 密排竖缝 / grid2 两行短竖缝 / louver2 两行斜百叶；(zx, zy) 是区的左上角，h 是缝高
  function slimVents(x, y, zx, zy, h, style, n) {
    const slit = (sx, sy, hh) => { R(x + sx, y + sy, 1, hh, P.iron[0]); R(x + sx + 1, y + sy, 1, hh, P.iron[3]); };
    if (style === 'slits') for (let i = 0; i < n; i++) slit(zx + i * 3, zy, h);
    else if (style === 'slits2') for (let i = 0; i < n; i++) slit(zx + i * 2, zy, h);
    else if (style === 'grid2') for (const ry of [0, 3]) for (let i = 0; i < n; i++) slit(zx + i * 2, zy + ry, 2);
    else if (style === 'louver2') for (const ry of [0, 3]) for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) { R(x + zx + i * 2 + k, y + zy + ry + k, 1, 1, P.iron[0]); R(x + zx + i * 2 + k + 1, y + zy + ry + k, 1, 1, P.iron[3]); }
  }
  // 小压力表 直径 7（2×1 模块用；1×1 不放）
  function gaugeS(cx, cy) {
    disc(cx, cy, 3.4, P.brass[0]); disc(cx, cy, 2.6, P.steam[2]);
    R(Math.round(cx - 2), Math.round(cy - 2), 1, 1, P.brass[3]);
    R(Math.round(cx + 1), Math.round(cy - 2), 1, 1, P.gauge[1]); R(Math.round(cx + 2), Math.round(cy - 1), 1, 1, P.gauge[1]);
    line(Math.round(cx - 0.5), Math.round(cy - 0.5), Math.round(cx - 2), Math.round(cy - 1.5), 1, P.dark[0]);
  }

  // ---------- 竖式锅炉 boiler_s（1×2，2026-09-28 定稿 A3 立式 · 拱形炉口，样机 tools/boiler-lab.html）----------
  // 立式锅炉筒 + 右上烟囱 + 占下半个模块的拱形大炉口（18 × 24，火 14 × 20）+ 黄铜拱心石。六档同火炮家族：
  // 原形圆筒 → 方包壳平顶 → 斜肩板；散热口 3 竖缝 → 4 密排 → 两行 → 两行斜百叶；盖板下铆钉 2 → 3 → 4（T1～3 黄铜、镀镍起钢质淡青）；
  // 钢起底座两端包角铁；镀镍起左上小压力表。代码和样机 boiler-lab.js 的 v2Base(true) / v2Over 逐行对应
  const BOILER_S_TIERS = [
    { f: 'raw', vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { f: 'raw', vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { f: 'box', vent: ['slits2', 4], riv: [3, 'brass'], parts: ['corners'] },
    { f: 'box', vent: ['slits2', 4], riv: [3, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', vent: ['grid2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', vent: ['louver2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
  ];
  const BOILER_S_ZONE = { stack: [15, 5, 2, 10], riv: 12, vent: 15, door: [3, 19, 18, 24], gauge: [7.5, 5.5] };
  const px = (x, y, c) => R(x, y, 1, 1, c);
  const slimW = (style, n) => (style === 'slits' ? n * 3 - 1 : n * 2 + (style === 'louver2' ? 1 : 0));
  const riveXs = (n, x0, x1) => (n === 2 ? [x0 + 1, x1 - 3] : Array.from({ length: n }, (_, i) => Math.round(x0 + (x1 - x0 - 2) * i / (n - 1))));
  // 竖放圆柱明暗（左边受光），ramp = 五阶（描边 → 最亮）
  const IRON5 = [P.iron[0], P.iron[1], P.iron[2], P.iron[3], P.iron[4]];
  const DARK5 = [P.dark[0], P.dark[1], P.dark[2], P.dark[3], P.iron[2]];
  function cylV(x0, y0, w, h, ramp = IRON5) {
    for (let i = 0; i < w; i++) {
      const t = i / (w - 1);
      R(x0 + i, y0, 1, h, ramp[i === 0 || i === w - 1 ? 0 : t < 0.14 ? 3 : t < 0.3 ? 4 : t < 0.42 ? 3 : t < 0.78 ? 2 : 1]);
    }
  }
  // 烟囱：cap = rim 翻边（T1～2）/ box 方帽 + 挡雨缝（T3～4）/ slant 斜罩（T5～6）
  function stackV(x0, w, y0, y1, cap) {
    cylV(x0, y0, w, y1 - y0, DARK5);
    if (cap === 'rim') { R(x0 - 1, y0 - 2, w + 2, 2, P.dark[0]); R(x0, y0 - 2, w, 1, P.dark[3]); }
    else if (cap === 'box') {
      R(x0 - 2, y0 - 5, w + 4, 3, P.dark[0]); R(x0 - 1, y0 - 4, w + 2, 1, P.dark[3]);
      R(x0 + 1, y0 - 2, 1, 2, P.dark[0]); R(x0 + w - 2, y0 - 2, 1, 2, P.dark[0]);
      R(x0 - 1, y0 + 3, w + 2, 2, P.dark[0]); R(x0, y0 + 3, w, 1, P.dark[3]);
    } else {
      for (let k = 0; k < 4; k++) { R(x0 - 3 + k, y0 - 5 + k, w + 6 - k * 2, 1, k === 0 ? P.dark[3] : P.dark[2]); px(x0 - 3 + k, y0 - 5 + k, P.dark[0]); px(x0 + w + 2 - k, y0 - 5 + k, P.dark[0]); }
      R(x0 - 3, y0 - 6, w + 6, 1, P.dark[0]);
      R(x0 - 1, y0 + 3, w + 2, 2, P.dark[0]); R(x0, y0 + 3, w, 1, P.dark[3]);
    }
  }
  // 斜肩包壳：顶上两角各切掉 d 像素的 45° 斜板
  function slantShell(x, y, w, h, d) {
    box(x, y, w, h, IRONL);
    for (let k = 0; k < d; k++) {
      const n = d - k;
      ctx.clearRect(x, y + k, n, 1); ctx.clearRect(x + w - n, y + k, n, 1);
      px(x + n, y + k, P.iron[0]); px(x + w - 1 - n, y + k, P.iron[0]);
      if (k > 0) { px(x + n, y + k, P.iron[4]); px(x + w - 1 - n, y + k, P.iron[1]); }
    }
  }
  // 大炉膛的火：暗炉膛 + 后壁余光 + 煤缝窜起的火舌（芯黄 → 橙 → 红尖，火力决定高度，4 帧摇曳）+ 煤层
  const FL_SWAY = [0, 1, 0, -1], FL_TALL = [1, 0.8, 0.92, 0.72];
  function fireBig(x0, y0, w, h, lv, fr) {
    R(x0, y0, w, h, P.dark[0]);
    const bed = Math.max(4, Math.round(h * 0.3)), by = y0 + h - bed;
    const fh = Math.round((h - bed) * [0, 0.5, 0.75, 0.95][lv]);
    for (let yy = by - Math.round(fh * 0.7); yy < by; yy++) for (let i = 0; i < w; i++) if (((i + yy + fr) & 1) === 0) px(x0 + i, yy, P.fire[0]);
    const n = Math.max(2, Math.round(w / 5)), step = w / n;
    for (let k = 0; k < n; k++) {
      const c = x0 + (k + 0.5) * step + FL_SWAY[(fr + k) % 4], H = Math.max(3, Math.round(fh * FL_TALL[(fr + k * 2) % 4])), hw = step * 0.62 + 0.5;
      for (let r = 0; r < H; r++) {
        const t = r / H, half = hw * Math.pow(1 - t, 0.8);
        for (let i = 0; i < w; i++) {
          const dx = Math.abs(x0 + i + 0.5 - c); if (dx > half) continue;
          const inner = dx <= half * 0.5;
          px(x0 + i, by - 1 - r, t < 0.45 && inner ? P.fire[3] : t < 0.75 && inner ? P.fire[2] : t < 0.4 ? P.fire[2] : P.fire[1]);
        }
      }
    }
    if (lv >= 2) px(x0 + (2 + fr * 3) % w, by - fh - 2 + (fr % 2), P.fire[2]);
    if (lv >= 3) { px(x0 + (w - 3 - fr * 4 + w * 4) % w, by - fh - 1 - (fr % 2), P.fire[3]); px(x0 + (5 + fr * 5) % w, by - fh - 4, P.fire[1]); }
    R(x0, by, w, bed, P.fire[1]);
    let lx = 0, k = 0;
    while (lx < w) {
      const lw = Math.min([4, 3, 4, 3][k % 4], w - lx), top = by + (k % 2), X = x0 + lx;
      R(X, top, lw, y0 + h - 1 - top, P.dark[1]); px(X, top, P.dark[3]); if (lw > 1) R(X + 1, top, lw - 1, 1, P.dark[2]);
      const hot = (k * 5 + fr) % 4;
      if (lx + lw < w) R(X + lw - 1, top + 1, 1, Math.max(1, y0 + h - 3 - top), hot < lv ? P.fire[Math.min(3, lv - 1 + (hot === 0 ? 1 : 0))] : P.fire[0]);
      lx += lw; k++;
    }
    R(x0, y0 + h - 1, w, 1, P.fire[lv >= 3 ? 2 : 1]);
  }
  // 拱形炉口：暗铁厚框 + 半圆拱 + 黄铜拱心石 + 炉栅横档 + 左侧两只黄铜铰链 + 右侧门闩
  function archMouth(x, y, w, h, lv, fr) {
    box(x, y, w, h, IRON);
    const fx = x + 2, fy = y + 2, fw = w - 4, fh = h - 4;
    fireBig(fx, fy, fw, fh, lv, fr);
    const r = fw / 2, cx = fx + r, cy = fy + r;
    for (let yy = fy; yy < cy; yy++) for (let xx = fx; xx < fx + fw; xx++) {
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) px(xx, yy, P.iron[2]); else if (d > r - 1) px(xx, yy, P.dark[0]);
    }
    R(cx - 1, fy - 2, 2, 3, P.brass[2]); px(cx - 1, fy - 2, P.brass[3]); R(cx - 1, fy + 1, 2, 1, P.brass[0]);
    R(fx - 1, fy + fh, fw + 2, 1, P.iron[0]);
    R(x - 1, y + 3, 2, 3, P.brass[1]); px(x - 1, y + 3, P.brass[3]); R(x - 1, y + h - 6, 2, 3, P.brass[1]); px(x - 1, y + h - 6, P.brass[3]);
    R(x + w - 2, y + (h >> 1) - 1, 2, 3, P.brass[2]); px(x + w - 2, y + (h >> 1) - 1, P.brass[3]);
  }
  function boilerS(x, y, q) {
    const T = BOILER_S_TIERS[(q.mt || 1) - 1], Z = BOILER_S_ZONE;
    stackV(x + Z.stack[0], Z.stack[1], y + Z.stack[2], y + Z.stack[3] + 1, T.f === 'raw' ? 'rim' : T.f);
    if (T.f === 'raw') { cylV(x + 3, y + 11, 18, 32); box(x + 2, y + 9, 20, 3, IRONL); }
    else if (T.f === 'box') { box(x + 2, y + 10, 20, 33, IRONL); box(x + 1, y + 8, 22, 3, IRON); }
    else { slantShell(x + 2, y + 9, 20, 34, 4); R(x + 6, y + 8, 12, 2, P.iron[0]); R(x + 7, y + 8, 10, 1, P.iron[3]); }
    if (T.parts.includes('gauge')) R(x + 7, y + 8, 1, 2, P.iron[0]);
    const [vs, vn] = T.vent, two = vs === 'grid2' || vs === 'louver2';
    slimVents(x, y, 12 - (slimW(vs, vn) >> 1), Z.vent - (two ? 1 : 0), two ? 2 : 3, vs, vn);
    archMouth(x + Z.door[0], y + Z.door[1], Z.door[2], Z.door[3], q.lv || 2, q.fr || 0);
    box(x + 1, y + 43, 22, 5, IRON); R(x + 2, y + 44, 20, 1, P.iron[3]);
    if (T.parts.includes('corners')) { PART.corner(x + 1, y + 43, 1, -1); PART.corner(x + 19, y + 43, -1, -1); }
  }
  function boilerSOver(x, y, q) {
    const T = BOILER_S_TIERS[(q.mt || 1) - 1];
    for (const rx of riveXs(T.riv[0], 4, 20)) PART.rivet(x + rx, y + BOILER_S_ZONE.riv, RIVET_TIER[T.riv[1]]);
    if (T.parts.includes('gauge')) gaugeS(x + BOILER_S_ZONE.gauge[0], y + BOILER_S_ZONE.gauge[1]);
  }

  // ---------- 水罐 tank_tall（1×2）/ 小水罐 tank_s（1×1）（2026-09-28 定稿 W1 大水窗罐 + 两道紫铜加强箍，样机 tools/boiler-lab.html）----------
  // 铁罐身 + 几乎占满罐身的玻璃水窗（圆柱明暗的水、水面波纹、上升气泡，水位跟着剩余水量）+ 左侧滴水的黄铜龙头 + 两道紫铜加强箍。
  // 形体在 T3、T5 跃迁：圆角罐 → 方罐 + 平顶盖板 → 四角斜切的八角罐。1×2 另有：顶部铆钉 2 → 3 → 4、钢起底部包角铁、镀镍起左上小压力表、
  // 窗边刻度；1×1 只靠剪影（不放铆钉 / 包角铁 / 压力表），两道箍夹住水窗。紫铜是饱和色，材质处理不动，六档都是紫铜
  const COPPER = ['#3b2820', '#6b4632', '#8f6044', '#b3825c'];   // 2026-09-28 用户：原来的紫铜太突兀 → 压暗、降饱和（仍 ≥ 0.28，材质处理不动）
  const TANK_TIERS = [
    { f: 'raw', riv: [2, 'brass'], parts: [] },
    { f: 'raw', riv: [2, 'brass'], parts: [] },
    { f: 'box', riv: [3, 'brass'], parts: ['corners'] },
    { f: 'box', riv: [3, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', riv: [4, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', riv: [4, 'steel'], parts: ['corners', 'gauge'] },
  ];
  // 罐身：按形状判定逐像素上色（外沿描边、左上两像素亮、右下两像素暗）；raw = 圆角 r、box = 直角、slant = 四角 45° 切 d
  function tankShell(x, y, w, h, f, r) {
    const d = r - 1;
    const inside = (xx, yy) => {
      if (xx < x || yy < y || xx >= x + w || yy >= y + h) return false;
      if (f === 'box') return true;
      const ex = xx < x + r ? x + r - xx : xx >= x + w - r ? xx - (x + w - r - 1) : 0, ey = yy < y + r ? y + r - yy : yy >= y + h - r ? yy - (y + h - r - 1) : 0;
      return f === 'slant' ? ex + ey <= d + 1 : ex * ex + ey * ey <= r * r + r * 0.6;
    };
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!inside(xx, yy)) continue;
      if (!inside(xx - 1, yy) || !inside(xx + 1, yy) || !inside(xx, yy - 1) || !inside(xx, yy + 1)) { px(xx, yy, P.iron[0]); continue; }
      px(xx, yy, !inside(xx - 2, yy) || !inside(xx, yy - 2) ? P.iron[4] : !inside(xx + 2, yy) || !inside(xx, yy + 2) ? P.iron[2] : P.iron[3]);
    }
  }
  // 水窗里的水（lv 0~1）
  function waterWin(x, y, w, h, lv, fr) {
    R(x, y, w, h, P.glass[0]);
    for (let i = 0; i < w; i += 3) px(x + i + (i % 2), y + 1, P.glass[1]);
    const lh = Math.max(0, Math.min(h, Math.round(h * lv))), top = y + h - lh;
    if (lh > 0) {
      for (let i = 0; i < w; i++) { const t = i / Math.max(1, w - 1); R(x + i, top, 1, lh, i === 0 || i === w - 1 ? P.water[0] : t < 0.3 ? P.water[2] : t > 0.78 ? P.water[0] : P.water[1]); }
      if (w > 6) R(x + Math.round(w * 0.2), top + 2, 1, Math.max(0, lh - 3), P.water[3]);
      for (let i = 0; i < w; i++) { const wave = ((i + fr) % 4) < 2; px(x + i, top, wave ? P.water[3] : P.water[2]); if (lh > 1 && wave) px(x + i, top + 1, P.water[2]); }
      if (lh > 5) for (const [bx, sp] of [[0.35, 0], [0.62, 5], [0.5, 11]]) { const yy = y + h - 2 - ((fr * 3 + sp) % Math.max(1, lh - 4)); if (yy > top + 2) px(x + Math.round(w * bx), yy, P.water[3]); }
    }
    R(x + 1, y + 1, 1, Math.max(1, Math.round(h * 0.45)), P.glass[3]);
    if (h > 12) px(x + 1, y + Math.round(h * 0.45) + 2, P.glass[2]);
  }
  // 紫铜加强箍：收在罐身宽度里（不外伸），按圆柱明暗上色（左 1/3 亮、右 1/5 暗，和水、罐身同一光向），下沿一道暗线，两端压进罐身描边
  function copperHoop(x, y, w) {
    for (let i = 0; i < w; i++) { const t = i / (w - 1), end = i === 0 || i === w - 1; R(x + i, y, 1, 1, end ? COPPER[0] : t < 0.3 ? COPPER[3] : t > 0.8 ? COPPER[1] : COPPER[2]); R(x + i, y + 1, 1, 1, end ? COPPER[0] : COPPER[1]); }
  }
  function tankTap(x, y, fr, dropTo) {
    R(x, y, 3, 2, P.brass[1]); R(x, y, 3, 1, P.brass[3]);
    R(x, y + 2, 2, 2, P.brass[1]); px(x, y + 2, P.brass[2]); R(x + 1, y - 2, 1, 2, P.brass[2]);
    const dy = y + 4 + fr * 2; if (dy < dropTo) { px(x, dy, P.water[3]); if (fr > 0) px(x, dy - 1, P.water[2]); }
  }
  const tankSkid = (x, y, w, h = 3) => { box(x, y, w, h, IRON); R(x + 1, y + h, 3, 1, P.iron[0]); R(x + w - 4, y + h, 3, 1, P.iron[0]); };
  const tankLv = (q) => (q.lv == null ? 1 : q.lv / 29);
  function tankTall(x, y, q) {
    const T = TANK_TIERS[(q.mt || 1) - 1], fr = q.fr || 0;
    R(x + 11, y + 1, 9, 2, P.brass[1]); R(x + 11, y + 1, 9, 1, P.brass[3]); px(x + 15, y + 1, P.brass[0]);        // 顶上手轮
    R(x + 13, y + 3, 4, 3, P.iron[3]); R(x + 13, y + 3, 1, 3, P.iron[4]);
    tankShell(x + 2, y + 5, 20, 39, T.f, 4);
    if (T.f === 'box') box(x + 1, y + 4, 22, 3, IRON);
    R(x + 4, y + 11, 16, 27, P.iron[0]);
    waterWin(x + 5, y + 12, 14, 25, tankLv(q), fr);
    for (let yy = y + 14; yy <= y + 35; yy += 5) R(x + 20, yy, 1, 1, P.iron[4]);                                    // 窗边刻度
    copperHoop(x + 2, y + 19, 20); copperHoop(x + 2, y + 29, 20);
    tankTap(x, y + 33, fr, y + 44);
    tankSkid(x + 3, y + 44, 18);
    if (T.parts.includes('corners')) { PART.corner(x + 2, y + 39, 1, -1); PART.corner(x + 17, y + 39, -1, -1); }
  }
  function tankTallOver(x, y, q) {
    const T = TANK_TIERS[(q.mt || 1) - 1];
    for (const rx of riveXs(T.riv[0], 5, 19)) PART.rivet(x + rx, y + 7, RIVET_TIER[T.riv[1]]);
    if (T.parts.includes('gauge')) gaugeS(x + 5.5, y + 3.5);
  }
  function tankSmall(x, y, q) {
    const T = TANK_TIERS[(q.mt || 1) - 1], fr = q.fr || 0;
    R(x + 9, y + 0, 6, 2, P.brass[1]); R(x + 9, y + 0, 6, 1, P.brass[3]); R(x + 11, y + 2, 2, 1, P.iron[0]);        // 注水口盖
    tankShell(x + 2, y + 3, 20, 18, T.f, 3);
    if (T.f === 'box') box(x + 1, y + 2, 22, 3, IRON);
    R(x + 4, y + 7, 16, 12, P.iron[0]);
    waterWin(x + 5, y + 8, 14, 10, tankLv(q), fr);
    copperHoop(x + 2, y + 5, 20); copperHoop(x + 2, y + 19, 20);
    tankTap(x, y + 13, fr % 2, y + 21);
    tankSkid(x + 3, y + 21, 18, 2);
  }

  // ---------- 驾驶舱家族（2026-09-29 定稿，样机 tools/archive/cockpits.html）：单人 C 方窗驾驶箱 · 双人 A 双层驾驶台 · 四人 A 机车驾驶室 ----------
  // 看得见舱里的煤球驾驶员 + 会动的操纵件。分层画：back（DRAW[id]，q.layer 为空）→ cockpitCrew 按 COCKPIT_ART 的座位画驾驶员（剪在舱窗里）
  // → mid（四人舱：抬高的平台前沿、栏杆、小楼梯，把驾驶员分成后 2 前 2）→ 前排驾驶员 → front（操纵杆、汽笛拉索、舵轮、挡板）。
  // mid / front 用 drawModule(..., { layer }) 取带材质的缓存精灵；动画帧 fr（60 帧 = 6 秒一轮）。舱内墙面是暖色皮木色（不是金属，材质层不换）
  const COCKPIT_ART = {
    helmet: { win: [4, 4, 16, 12], rows: [[[12, 11]]] },
    cockpit_pair: { win: [4, 4, 16, 38], rows: [[[10, 19], [14, 37]]] },
    cockpit: { win: [7, 8, 34, 30], rows: [[[18, 20], [30, 20]], [[11, 33], [37, 33]]], mid: true },
  };
  const CK = (() => {
    const Rr = (x, y, w, h, c) => R(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);
    const p1 = (x, y, c) => Rr(x, y, 1, 1, c);
    const ringDots = (cx, cy, r, c) => { const n = Math.ceil(r * 7); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p1(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r), c); } };
    function room(x0, y0, w, h, floor = true) {
      Rr(x0, y0, w, h, P.leather[1]);
      Rr(x0, y0, w, 2, P.leather[0]); Rr(x0, y0 + 2, w, 1, P.leather[2]);
      if (floor) { Rr(x0, y0 + h - 2, w, 2, P.dark[2]); Rr(x0, y0 + h - 2, w, 1, P.dark[1]); }
    }
    // 舱壁上的圆形舱门：和墙同色系（不抢驾驶员），一圈暗框 + 左上亮边 + 左侧铰链 + 中间小手轮 + 右侧把手，一眼能认出是门（2026-09-29 取代墙上的竖缝线）
    const hatch = (cx, cy, r) => {
      disc(cx, cy, r, P.leather[0]); disc(cx, cy, r - 1, P.leather[1]);
      for (let k = 0; k < 10; k++) { const a = Math.PI * 1.05 + k / 10 * Math.PI * 0.8; p1(Math.floor(cx + Math.cos(a) * (r - 1.4)), Math.floor(cy + Math.sin(a) * (r - 1.4)), P.leather[2]); }
      Rr(cx - r - 1, cy - 1, 2, 3, P.leather[0]);
      ringDots(cx, cy, 1.5, P.leather[0]); p1(Math.floor(cx), Math.floor(cy), P.leather[0]);
      p1(Math.floor(cx + r - 2), Math.floor(cy), P.brass[1]);
    };
    const lamp = (x, y) => { Rr(x - 1, y - 2, 3, 1, P.brass[1]); disc(x + 0.5, y + 0.5, 1.4, P.brass[2]); p1(x, y, P.fire[3]); };
    const gauge = (cx, cy, r, v) => { disc(cx, cy, r, P.brass[0]); disc(cx, cy, r - 1, P.steam[2]); const a = Math.PI * (0.75 + 1.5 * v), L = Math.max(1.5, r - 1.5); line(Math.round(cx - 0.5), Math.round(cy - 0.5), Math.round(cx - 0.5 + Math.cos(a) * L), Math.round(cy - 0.5 + Math.sin(a) * L), 1, P.dark[0]); };
    const lever = (x, y, len, ang) => { const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len; line(x, y, Math.round(ex), Math.round(ey), 1, P.brass[1]); disc(ex + 0.5, ey + 0.5, 1.3, P.brass[0]); p1(Math.floor(ex), Math.floor(ey), P.brass[3]); disc(x + 0.5, y + 0.5, 1.4, P.iron[0]); };
    const wheelS = (cx, cy, r, rot, n) => { ringDots(cx, cy, r, P.brass[0]); ringDots(cx, cy, r - 0.8, P.brass[2]); for (let k = 0; k < n; k++) { const a = rot + k / n * Math.PI * 2; line(cx, cy, Math.round(cx + Math.cos(a) * (r + 1.4)), Math.round(cy + Math.sin(a) * (r + 1.4)), 1, P.brass[1]); p1(Math.floor(cx + Math.cos(a) * (r + 1.8)), Math.floor(cy + Math.sin(a) * (r + 1.8)), P.brass[3]); } disc(cx, cy, 1.3, P.brass[3]); };
    const pullOf = (T, per) => { const p = ((T % per) + per) % per / per; return p < 0.12 ? p / 0.12 : p < 0.3 ? 1 : p < 0.4 ? 1 - (p - 0.3) / 0.1 : 0; };
    const cord = (x, y, len, pull) => { const e = y + len + Math.round(pull * 3); for (let yy = y; yy < e; yy += 2) p1(x, yy, P.brass[1]); ringDots(x + 0.5, e + 1.5, 1.4, P.brass[2]); };
    const puffUp = (x, y, T) => { for (let k = 0; k < 2; k++) { const p = ((T * 0.12 + k / 2) % 1); disc(x + Math.sin(p * 6 + k) * 1.2, y - p * 4, 0.8 + p * 1.4, p < 0.5 ? P.steam[2] : P.steam[1]); } };
    return { Rr, p1, room, hatch, lamp, gauge, lever, wheelS, pullOf, cord, puffUp };
  })();
  // T = 动画时刻（和样机的 60ms 一格对齐）：fr 0～59 → T 0～100
  const ckT = (q) => (q.fr || 0) * 100 / 60;
  // 单人 1×1 · 方窗驾驶箱：铆接方箱开一扇宽窗，窗上遮阳眉，窗下沿露出方向盘上半圈（左右转一点）
  function helmetArt(x, y, q) {
    const { Rr, room, lamp, wheelS } = CK, T = ckT(q);
    if (q.layer === 'front') {
      Rr(x + 3, y + 3, 18, 2, P.iron[0]); Rr(x + 3, y + 3, 18, 1, P.iron[3]);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 24, 16); ctx.clip(); wheelS(x + 12, y + 18, 5, 0.3 * Math.sin(T * Math.PI * 2 / 100), 3); ctx.restore();
      Rr(x + 3, y + 15, 18, 2, P.iron[1]); Rr(x + 3, y + 15, 18, 1, P.iron[4]);
      return;
    }
    box(x + 1, y + 1, 22, 22, IRON); rivet(x + 3, y + 19); rivet(x + 19, y + 19);
    room(x + 4, y + 4, 16, 12); CK.hatch(x + 7.5, y + 9.5, 3.2); lamp(x + 16, y + 6);
  }
  // 双人 1×2 · 双层驾驶台：一扇高窗里上下两层——上层站在格栅平台上对传声管喊话，下层扳操纵杆；舱壁两只压力表、一盏灯
  function cockpitPairArt(x, y, q) {
    const { Rr, p1, room, lamp, gauge, lever } = CK, T = ckT(q);
    if (q.layer === 'front') {
      Rr(x + 3, y + 24, 18, 2, P.brass[1]); for (let u = 4; u < 20; u += 3) p1(x + u, y + 25, P.brass[0]);
      line(x + 16, y + 4, x + 16, y + 13, 2, P.brass[1]); disc(x + 15, y + 14, 1.6, P.brass[2]); p1(x + 15, y + 14, P.dark[0]);
      lever(x + 18, y + 41, 9, -0.5 + 0.35 * Math.sin(T * Math.PI * 2 / 100));
      Rr(x + 3, y + 41, 18, 2, P.iron[1]); Rr(x + 3, y + 41, 18, 1, P.iron[4]);
      return;
    }
    box(x + 1, y + 1, 22, 46, IRON); room(x + 4, y + 4, 16, 38); lamp(x + 12, y + 7);
    CK.hatch(x + 16, y + 17, 3.5); gauge(x + 16.5, y + 8.5, 2, 0.5); gauge(x + 7, y + 30, 2.4, 0.35);
    Rr(x + 4, y + 24, 16, 2, P.dark[2]);
    for (const yy of [43, 2]) { rivet(x + 3, y + yy); rivet(x + 19, y + yy); }
  }
  // 四人 2×2 · 机车驾驶室：后墙是锅炉背板（三只表、黄铜管、灯）；后排两人站在带栏杆的抬高平台上，右边一道小楼梯下到地板；
  // 前排左边扳粗调节杆、右边拉汽笛（顶上冒汽），中间一只大换向舵轮；最前面一块铆接侧板挡住下半身
  function cockpitArt(x, y, q) {
    const { Rr, p1, room, lamp, gauge, pullOf, cord, puffUp } = CK, T = ckT(q);
    if (q.layer === 'mid') {
      Rr(x + 7, y + 28, 26, 10, P.dark[1]); Rr(x + 7, y + 28, 26, 1, P.dark[0]);
      Rr(x + 7, y + 25, 26, 3, P.leather[0]); Rr(x + 7, y + 25, 26, 1, P.brass[2]);
      Rr(x + 7, y + 22, 26, 1, P.brass[2]); for (let u = 9; u < 33; u += 4) Rr(x + u, y + 22, 1, 3, P.brass[1]);
      for (let k = 0; k < 3; k++) { const sx = x + 33 + k * 3, sy = y + 25 + k * 4; Rr(sx, sy, 4, 2, P.leather[0]); Rr(sx, sy, 4, 1, P.brass[1]); Rr(sx, sy + 2, 4, 2, P.dark[1]); }
      Rr(x + 33, y + 22, 1, 4, P.brass[1]); line(x + 33, y + 22, x + 41, y + 33, 1, P.brass[2]);
      return;
    }
    if (q.layer === 'front') {
      const pl = pullOf(T, 100);
      Rr(x, y + 3, 48, 5, P.iron[0]); Rr(x + 1, y + 3, 46, 3, P.iron[3]); Rr(x + 1, y + 6, 46, 1, P.brass[2]);
      Rr(x + 39, y, 3, 3, P.brass[2]); if (pl > 0.5) puffUp(x + 40, y, T);
      cord(x + 40, y + 8, 18, pl);
      box(x + 2, y + 38, 44, 10, IRON); for (const u of [5, 36, 41]) rivet(x + u, y + 41);
      Rr(x + 8, y + 41, 8, 4, P.brass[1]); Rr(x + 9, y + 42, 6, 2, P.brass[2]);
      const la = -0.15 + 0.4 * Math.sin(T * Math.PI * 2 / 100), lx = x + 14, ly = y + 38, ex = lx + Math.sin(la) * 13, ey = ly - Math.cos(la) * 13;
      line(lx, ly, Math.round(ex), Math.round(ey), 2, P.brass[0]); line(lx, ly - 1, Math.round(ex), Math.round(ey - 1), 1, P.brass[2]); disc(ex + 0.5, ey + 0.5, 2, P.brass[0]); disc(ex, ey, 1.2, P.brass[3]); disc(lx + 0.5, ly + 0.5, 2, P.iron[0]);
      const cx = x + 27, cy = y + 36, r = 5.4, rot = T * 0.04;
      disc(cx, cy, r + 1, P.brass[0]); disc(cx, cy, r, P.brass[2]); disc(cx, cy, r - 1.2, P.dark[1]);
      for (let k = 0; k < 6; k++) { const a = rot + k / 6 * Math.PI * 2; line(cx, cy, Math.round(cx + Math.cos(a) * (r + 2.6)), Math.round(cy + Math.sin(a) * (r + 2.6)), 1, P.brass[1]); disc(cx + Math.cos(a) * (r + 2.6), cy + Math.sin(a) * (r + 2.6), 1, P.brass[3]); }
      disc(cx, cy, 1.8, P.brass[3]);
      return;
    }
    box(x + 2, y + 7, 5, 40, IRON); box(x + 41, y + 7, 5, 40, IRON);
    room(x + 7, y + 8, 34, 30, false);
    CK.hatch(x + 11, y + 13, 3.3);
    Rr(x + 7, y + 17, 34, 2, P.brass[1]); Rr(x + 7, y + 17, 34, 1, P.brass[2]);
    gauge(x + 19, y + 12, 2.6, 0.5); gauge(x + 27, y + 11.5, 3, 0.4); gauge(x + 35, y + 12, 2.4, 0.6);
    lamp(x + 38, y + 10);
    void p1;
  }

  // ---------- 2026-09-29 定稿的四个模块（样机 tools/archive/five-modules.html）：小臼炮 · 装弹机 · 加压舱 · 冷凝器 ----------
  // 各档只换材质颜色（装饰层），造型不变。这几个造型带斜线和圆形零件，画法用一套按像素判定上色的小工具（外沿描边、左上亮、右下暗），坐标一律取整。
  const K5 = (() => {
    const Rr = (x, y, w, h, c) => R(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);
    const p1 = (x, y, c) => Rr(x, y, 1, 1, c);
    function shape(test, x0, y0, x1, y1, r = IRONL) {
      const inn = (xx, yy) => test(xx + 0.5, yy + 0.5);
      for (let yy = Math.floor(y0); yy <= Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx <= Math.ceil(x1); xx++) {
        if (!inn(xx, yy)) continue;
        if (!inn(xx - 1, yy) || !inn(xx + 1, yy) || !inn(xx, yy - 1) || !inn(xx, yy + 1)) { R(xx, yy, 1, 1, r[0]); continue; }
        R(xx, yy, 1, 1, !inn(xx - 2, yy) || !inn(xx, yy - 2) ? r[3] : !inn(xx + 2, yy) || !inn(xx, yy + 2) ? r[1] : r[2]);
      }
    }
    const inPoly = (pts) => (x, y) => { let s = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
    const poly = (pts, r) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); shape(inPoly(pts), Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, r); };
    const ball = (cx, cy, rr, r) => shape((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr, cx - rr - 1, cy - rr - 1, cx + rr + 1, cy + rr + 1, r);
    const vtube = (x, y, w, h, r = IRONL) => { Rr(x, y, w, h, r[0]); Rr(x + 1, y, w - 2, h, r[2]); Rr(x + 1, y, 1, h, r[3]); if (w > 3) Rr(x + w - 2, y, 1, h, r[1]); };
    const htube = (x, y, w, h, r = IRONL) => { Rr(x, y, w, h, r[0]); Rr(x, y + 1, w, h - 2, r[2]); Rr(x, y + 1, w, 1, r[3]); if (h > 3) Rr(x, y + h - 2, w, 1, r[1]); };
    const gear = (cx, cy, r, n, rot, ramp = BRASS) => { shape((x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot; return d <= r - 1 || (d <= r + 0.6 && Math.cos(a * n) > 0.2); }, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, ramp); disc(cx, cy, Math.max(0.8, r * 0.3), P.iron[0]); };
    const shellH = (x, y, l = 9) => { Rr(x, y, l - 3, 3, P.brass[1]); Rr(x, y, l - 3, 1, P.brass[3]); Rr(x, y + 2, l - 3, 1, P.brass[0]); Rr(x + l - 3, y, 2, 3, P.iron[3]); p1(x + l - 1, y + 1, P.iron[3]); p1(x + l - 3, y, P.iron[4]); p1(x, y + 1, P.brass[0]); };
    function gauge5(cx, cy, r, v) {
      disc(cx, cy, r, P.brass[0]); disc(cx, cy, r - 1, P.steam[2]);
      const a = Math.PI * (0.75 + 1.5 * v), L = Math.max(1.5, r - 1.5);
      line(Math.round(cx - 0.5), Math.round(cy - 0.5), Math.round(cx - 0.5 + Math.cos(a) * L), Math.round(cy - 0.5 + Math.sin(a) * L), 1, P.dark[0]);
    }
    const LEATHER = [P.black, P.leather[0], P.leather[1], P.leather[2]];
    return { Rr, p1, shape, poly, ball, vtube, htube, gear, shellH, gauge5, LEATHER };
  })();

  // 小臼炮 1×1 · 炮塔臼炮：低矮的半球装甲炮塔（铆钉一圈），粗短炮管从炮塔里伸出来俯仰，炮管根部一块跟着炮管转的装甲防盾，
  // 炮口是厚箍 + 口沿暗线（侧面看不到炮膛圆洞）。耳轴 (12,13)，炮口离耳轴 18（module-art 的 piv / blen），后坐沿炮管退 rcPx
  function mortarS(x, y, q) {
    const { Rr, p1, poly, ball } = K5, ar = (q.a == null ? 55 : q.a) * Math.PI / 180, c = Math.cos(ar), s = Math.sin(ar), back = rcPx('mortar_s', q.k);
    const at = (u, v) => [x + 12 + c * (u - back) + s * v, y + 13 - s * (u - back) + c * v];
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 24, 20); ctx.clip(); ball(x + 12, y + 20, 10.5, IRON); ctx.restore();
    for (let i = 0; i < 7; i++) { const aa = Math.PI + i / 6 * Math.PI; p1(x + 12 + Math.cos(aa) * 8.6, y + 19 + Math.sin(aa) * 8.6, P.iron[4]); }
    for (const pts of [[[1, -3.2], [15, -3.6], [15, 3.6], [1, 3.2]], [[14.5, -4.8], [18, -4.8], [18, 4.8], [14.5, 4.8]], [[-3.5, -5.6], [3.5, -5.6], [4.5, -3.6], [4.5, 3.6], [3.5, 5.6], [-3.5, 5.6]]]) poly(pts.map(([u, v]) => at(u, v)), IRONL);
    const m0 = at(17.6, -4), m1 = at(17.6, 4); line(Math.round(m0[0]), Math.round(m0[1]), Math.round(m1[0]), Math.round(m1[1]), 1, P.iron[1]);
    const h0 = at(15.2, -4.4), h1 = at(15.2, 4.4); line(Math.round(h0[0]), Math.round(h0[1]), Math.round(h1[0]), Math.round(h1[1]), 1, P.iron[4]);
    const pc = at(0, 0); disc(pc[0], pc[1], 1.5, P.brass[2]); p1(pc[0] - 1, pc[1] - 1, P.brass[3]);
    box(x, y + 19, 24, 5, IRON);
    void Rr;
  }
  // 装弹机 1×1 · 链式扬弹机：竖框里上下两只链轮，链子前面挂着三发横放的黄铜炮弹往上送，到顶从右边出弹口推出去。fr = 18 帧一轮
  function autoloaderArt(x, y, fr) {
    const { Rr, gear, shellH } = K5, sh = fr / 18, rot = fr * Math.PI / 8;
    box(x + 3, y + 1, 18, 23, IRON); Rr(x + 5, y + 3, 14, 19, P.dark[1]);
    gear(x + 12, y + 5, 3.4, 8, rot); gear(x + 12, y + 19, 3.4, 8, rot);
    Rr(x + 8, y + 5, 1, 14, P.iron[3]); Rr(x + 15, y + 5, 1, 14, P.iron[3]);
    for (let i = 0; i < 3; i++) { const yy = y + 18 - ((sh + i / 3) % 1) * 13; shellH(x + 6, Math.round(yy - 1), 9); }
    Rr(x + 19, y + 3, 3, 4, P.dark[0]);
  }
  // 加压舱 · 风箱增压器：皮风箱被曲柄一压一放，把气打进旁边的储气包，储气包上的压力表跟着摆；不发光（不是锅炉）。
  // 用户定：以后加压舱是 1×2（数据改动已交接 astra）；数据还是 1×1 时画同一套造型的 1×1 版。fr = 16 帧一轮
  function pressureArt(x, y, fr) {
    const { Rr, p1, poly, vtube, htube, gauge5, LEATHER } = K5, ph = fr / 16 * Math.PI * 2, s = (Math.sin(ph) + 1) / 2;
    if (SA.fp('pressure_chamber').h >= 2) {
      const top = y + 14 + s * 9;
      box(x + 1, y + 43, 22, 5, IRON); rivet(x + 3, y + 45); rivet(x + 19, y + 45);
      vtube(x + 13, y + 11, 10, 32); disc(x + 18, y + 11, 5, P.iron[0]); disc(x + 18, y + 11, 4.2, P.iron[3]); disc(x + 16.5, y + 9.5, 1.5, P.iron[4]);
      for (const yy of [19, 36]) { Rr(x + 13, y + yy, 10, 2, P.brass[1]); Rr(x + 13, y + yy, 10, 1, P.brass[3]); }
      gauge5(x + 18, y + 27.5, 3.6, 0.25 + 0.55 * s);
      Rr(x + 17, y + 3, 3, 3, P.brass[1]); Rr(x + 16, y + 3, 5, 1, P.brass[3]);
      if (fr < 2) { disc(x + 18.5, y + 1.5, 1.4, P.steam[2]); disc(x + 17.5, y - 0.5, 1, P.steam[1]); }   // 安全阀泄一口汽
      const h = y + 41 - top; for (let i = 0; i < 6; i++) { const yy = top + i * h / 6; poly([[x + 2, yy], [x + 10, yy], [x + 11.5, yy + h / 12], [x + 10, yy + h / 6], [x + 2, yy + h / 6], [x + 0.5, yy + h / 12]], LEATHER); }
      Rr(x + 1, top - 2, 11, 2, P.brass[1]); Rr(x + 1, top - 2, 11, 1, P.brass[3]); Rr(x + 1, y + 40, 11, 3, P.brass[0]); Rr(x + 1, y + 40, 11, 1, P.brass[2]);
      htube(x + 11, y + 38, 3, 3, IRONL);
      const C = [x + 6, y + 6], pin = [C[0] + Math.cos(ph - Math.PI / 2) * 2.6, C[1] + Math.sin(ph - Math.PI / 2) * 2.6];
      disc(C[0], C[1], 4, P.iron[0]); disc(C[0], C[1], 3.2, P.iron[3]); disc(C[0], C[1], 1.2, P.brass[2]);
      line(Math.round(pin[0]), Math.round(pin[1]), x + 6, Math.round(top - 2), 2, P.iron[0]); line(Math.round(pin[0]), Math.round(pin[1]), x + 6, Math.round(top - 2), 1, P.iron[4]);
      p1(pin[0], pin[1], P.brass[3]);
      return;
    }
    const top = y + 5 + s * 5;
    box(x + 1, y + 20, 22, 4, IRON);
    Rr(x + 1, top - 2, 11, 2, P.brass[1]); Rr(x + 1, top - 2, 11, 1, P.brass[3]);
    const h = y + 19 - top; for (let i = 0; i < 4; i++) { const yy = top + i * h / 4; poly([[x + 2, yy], [x + 11, yy], [x + 12, yy + h / 8], [x + 11, yy + h / 4], [x + 2, yy + h / 4], [x + 1, yy + h / 8]], LEATHER); }
    Rr(x + 1, y + 18, 11, 2, P.brass[1]);
    htube(x + 11, y + 15, 3, 3, IRONL);
    vtube(x + 14, y + 7, 8, 13); disc(x + 18, y + 7, 4, P.iron[0]); disc(x + 18, y + 7, 3.2, P.iron[3]);
    gauge5(x + 18, y + 13, 2.8, 0.3 + 0.5 * s);
  }
  // 冷凝器 1×2 · 盘管冷凝柱：实心铁柱外绕一条盘管（只看得到朝前的一股股斜管），管外凝着青色水珠、管的低端往下滴水，柱底一只青色出水嘴。fr = 12 帧一轮
  function condenserArt(x, y, fr) {
    const { Rr, p1, vtube } = K5;
    vtube(x + 6, y + 3, 12, 40); disc(x + 12, y + 3, 6, P.iron[0]); disc(x + 12, y + 3, 5, P.iron[3]);
    box(x + 3, y + 43, 18, 5, IRON);
    // 一道连贯的水流：顺着每股盘管的低端往下流到下一股，最后流进底下的出水嘴；亮点顺着水流往下走（2026-09-29：水珠减到隔一股一颗，免得密恐）
    Rr(x + 21, y + 10, 1, 31, P.water[1]);
    for (let k = 0; k < 3; k++) p1(x + 21, y + 10 + ((fr * 2.5 + k * 10) % 30), P.water[3]);
    for (let i = 0; i < 7; i++) {
      const yy = y + 7 + i * 5;
      line(x + 3, yy, x + 21, yy + 2, 2, P.brass[0]); line(x + 3, yy - 1, x + 21, yy + 1, 1, P.brass[2]); p1(x + 2, yy + 1, P.brass[1]); p1(x + 21, yy + 3, P.brass[0]);
      if (i % 2) { const bx = x + 8 + (i % 3) * 3, by = Math.round(yy + (bx - x - 3) * 2 / 18 + 1.6); p1(bx, by, P.water[2]); p1(bx, by + 1, P.water[1]); }   // 凝在管上的水珠（隔一股一颗）
    }
    Rr(x + 19, y + 40, 4, 2, P.water[1]); Rr(x + 19, y + 40, 4, 1, P.water[2]); p1(x + 21, y + 42 + (fr % 4), P.water[2]);   // 出水嘴 + 落下的一滴
  }

  // ---------- 观察镜 1×1（2026-09-29 定稿，样机 tools/archive/periscope.html 的 D 轭架望远镜）----------
  // 转台 + U 形轭架 + 两颗黄铜耳轴夹一支斜向上的黄铜望远镜（前端物镜、后端目镜），镜筒慢慢俯仰搜索，物镜偶尔闪光。
  // 各档只换材质颜色（装饰层），造型不变；镜头收在 24px 里。fr = 俯仰帧（24 帧一轮）
  function periscopeArt(x, y, fr) {
    const Rn = (a, b, w, h, c) => R(Math.round(a), Math.round(b), Math.round(w), Math.round(h), c);
    const tilt = Math.sin(fr / 24 * Math.PI * 2) * 1.2, pv = [x + 12, y + 12], t = fr * 7;
    box(x + 3, y + 19, 18, 5, IRON); for (let u = 5; u < 20; u += 4) R(x + u + ((t >> 3) % 4), y + 21, 1, 1, P.iron[1]);   // 转台上的刻痕
    box(x + 5, y + 10, 3, 10, IRONL); box(x + 16, y + 10, 3, 10, IRONL);                                                  // 轭架
    const dx = 10, dy = -3.2 + tilt, a = [pv[0] - dx, pv[1] - dy], b = [pv[0] + dx, pv[1] + dy];
    line(a[0], a[1], b[0], b[1], 4, P.brass[0]); line(a[0], a[1] - 0.5, b[0], b[1] - 0.5, 2, P.brass[2]); line(a[0], a[1] - 1, b[0], b[1] - 1, 1, P.brass[3]);
    for (const u of [0.3, 0.7]) { const q = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; Rn(q[0] - 0.5, q[1] - 2, 1, 4, P.brass[0]); }
    Rn(b[0], b[1] - 2.5, 2, 5, P.brass[0]);                                                                               // 物镜箍
    const lx = Math.round(b[0] + 1), ly = Math.round(b[1] - 2);
    R(lx, ly, 2, 4, P.glass[0]); R(lx, ly, 2, 3, P.glass[1]); R(lx + 1, ly + 1, 1, 1, fr === 0 ? P.white : P.glass[3]);  // 物镜玻璃
    Rn(a[0] - 1, a[1] - 1, 2, 2, P.dark[0]);                                                                              // 目镜
    disc(x + 6.5, y + 12, 1.6, P.brass[3]); disc(x + 17.5, y + 12, 1.6, P.brass[3]);                                      // 耳轴
  }

  // ---------- 机枪家族（2026-09-28 定稿，样机 tools/archive/mg-family-v2.html）：车载枪座，没有三脚架 / 立柱 / 握把 ----------
  // 固定部分 = 装甲壳（跟材料换色，T1～2 铸造圆角 → T3～4 方壳平顶 → T5～6 斜面装甲）；转动部分 = 防盾 + 枪（绕耳轴转到仰角）。
  // 枪口 ① 直口箍 → ② 助退喇叭 / 加箍 → ③ 方制退器；1×1 只靠剪影；1×2 固定壳上放铆钉 2 → 3 → 4、散热口、钢起包角铁、镀镍起小压力表
  const MG_TIERS = [
    { f: 'raw', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { f: 'raw', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { f: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'brass'], parts: ['corners'] },
    { f: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', b: 3, vent: ['grid2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
    { f: 'slant', b: 3, vent: ['louver2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
  ];
  // 按形状判定逐像素上色（外沿描边、左上亮、右下暗）
  function shadeIn(x, y, w, h, inside) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (!inside(xx, yy)) continue;
      if (!inside(xx - 1, yy) || !inside(xx + 1, yy) || !inside(xx, yy - 1) || !inside(xx, yy + 1)) { px(xx, yy, P.iron[0]); continue; }
      px(xx, yy, !inside(xx - 2, yy) || !inside(xx, yy - 2) ? P.iron[4] : !inside(xx + 2, yy) || !inside(xx, yy + 2) ? P.iron[2] : P.iron[3]);
    }
  }
  // 装甲壳形体：raw = 四角圆 r / box = 直角 / slant = 顶上两角 45° 切（右上切得更多：迎弹面）
  function armorIn(x, y, w, h, f, r) {
    return (xx, yy) => {
      if (xx < x || yy < y || xx >= x + w || yy >= y + h) return false;
      if (f === 'box') return true;
      const ex = xx < x + r ? x + r - xx : xx >= x + w - r ? xx - (x + w - r - 1) : 0, ey = yy < y + r ? y + r - yy : yy >= y + h - r ? yy - (y + h - r - 1) : 0;
      if (f === 'raw') return ex * ex + ey * ey <= r * r + r * 0.6;
      const tx = xx - x, ty = yy - y, d = r + 2;
      return !(ty + tx < d - 2 || ty + (w - 1 - tx) < d + 1);
    };
  }
  const armorShell = (x, y, w, h, f, r) => { shadeIn(x, y, w, h, armorIn(x, y, w, h, f, r)); if (f === 'box') { R(x - 1, y - 1, w + 2, 2, P.iron[0]); R(x, y - 1, w, 1, P.iron[3]); } };
  // 枪的零件（水平画，C / M = 耳轴）
  function gTube(x0, x1, M, hh) {
    for (let xx = x0; xx < x1; xx++) {
      R(xx, M - hh, 1, hh * 2 + 1, P.iron[0]);
      if (hh > 0) { R(xx, M - hh + 1, 1, hh * 2 - 1, P.iron[3]); px(xx, M - hh + 1, P.iron[4]); if (hh > 1) px(xx, M + hh - 1, P.iron[2]); }
    }
  }
  const gRing = (x0, w, M, hh) => { const ix = w > 2 ? x0 + 1 : x0, iw = w > 2 ? w - 2 : w; R(x0, M - hh, w, hh * 2 + 1, P.iron[0]); R(ix, M - hh + 1, iw, hh * 2 - 1, P.iron[3]); R(ix, M - hh + 1, iw, 1, P.iron[4]); };
  const gBrass = (x0, w, M, hh) => { R(x0, M - hh, w, hh * 2 + 1, P.brass[0]); R(x0, M - hh + 1, w, hh * 2 - 1, P.brass[1]); R(x0, M - hh + 1, 1, hh * 2 - 1, P.brass[3]); };
  function gMuzzle(end, M, b, hh = 1) {
    if (b === 1) { gRing(end - 2, 2, M, hh + 1); px(end - 1, M, P.black); return end; }
    if (b === 2) { for (let i = 0; i < 4; i++) gRing(end - 4 + i, 1, M, hh + 1 + (i >> 1)); px(end - 1, M, P.black); return end; }
    gRing(end - 5, 5, M, hh + 2); R(end - 4, M - hh - 1, 3, 1, P.dark[0]); R(end - 4, M + hh + 1, 3, 1, P.dark[0]); px(end - 1, M, P.black); return end;
  }
  const gFlash = (end, M, k) => { if (k >= 6) { R(end, M - 1, 3, 3, P.fire[3]); px(end + 3, M, P.fire[2]); px(end + 1, M - 2, P.fire[2]); px(end + 1, M + 2, P.fire[2]); } };
  // 车载机枪 mg_s（1×1）· 侧舷枪座：贴车体的法兰 + 鼓出的半圆枪座 + 竖枪缝；转动的小圆防盾 + 带两道散热圈的枪管（用户定：不要供弹槽）。
  // 耳轴 (15,11)，枪口末端 x 34（blen 19）
  function mgS(x, y, q) {
    const T = MG_TIERS[(q.mt || 1) - 1];
    box(x + 2, y + 2, 6, 21, IRON);
    shadeIn(x + 6, y + 3, 17, 18, (xx, yy) => {
      if (xx < x + 6 || yy < y + 3 || yy > y + 20) return false;
      const dy = yy + 0.5 - (y + 12), dx = xx + 0.5 - (x + 8);
      if (T.f === 'box') return xx <= x + 20;
      if (T.f === 'slant') return xx <= x + 21 - Math.max(0, Math.abs(dy) - 4);
      return dx * dx / 196 + dy * dy / 90 <= 1;
    });
    R(x + 13, y + 5, 4, 14, P.dark[0]);
    const d = rcPx('mg_s', q.k);
    turn(x + 15, y + 11, q.a, (X, Y) => {
      const C = X + x + 15 - d, M = Y + y + 11;
      gTube(C + 2, C + 19, M, 1);
      for (const rx of [C + 5, C + 8]) gRing(rx, 2, M, 3);
      if (T.b >= 2) gBrass(C + 11, 2, M, 2);
      gFlash(gMuzzle(C + 19 + (T.b === 3 ? 2 : 0), M, T.b), M, q.k || 0);
      disc(C + 0.5, M + 0.5, 4, P.iron[0]); disc(C + 0.5, M + 0.5, 3, P.iron[3]); px(C - 1, M - 1, P.iron[4]);
    });
  }
  // 重机枪 mg_heavy（1×2）· 蒸汽加特林：下半蒸汽机壳（飞轮 + 活塞缸，开火时转）+ 传动轴 + 座圈；上面六管加特林 + 顶上高竖弹匣。
  // 耳轴 (12,12)，枪口末端 x 34（T5～6 方制退器 x 37；blen 22）
  function mgH(x, y, q) {
    const T = MG_TIERS[(q.mt || 1) - 1], f = q.f || 0;
    box(x + 10, y + 15, 4, 8, IRONL); R(x + 9, y + 17, 6, 2, P.brass[1]); R(x + 9, y + 17, 6, 1, P.brass[3]);
    armorShell(x + 2, y + 22, 20, 22, T.f, 3);
    const wx = x + 9, wy = y + 33, an = (f % 6) * Math.PI / 9;   // 三根辐条（四根像准星），6 帧转一格
    disc(wx + 0.5, wy + 0.5, 6, P.iron[0]); disc(wx + 0.5, wy + 0.5, 5, P.brass[1]); disc(wx + 0.5, wy + 0.5, 4, P.dark[1]);
    for (let k = 0; k < 3; k++) { const aa = an + k * Math.PI * 2 / 3; line(wx, wy, Math.round(wx + Math.cos(aa) * 4), Math.round(wy + Math.sin(aa) * 4), 2, P.brass[2]); }
    disc(wx + 0.5, wy + 0.5, 1.5, P.brass[3]);
    box(x + 16, y + 28, 5, 10, IRON); R(x + 17, y + 29, 1, 8, P.iron[4]); R(x + 17, y + 25 + [0, 2, 3, 2][f % 4], 3, 3, P.iron[3]);
    const [vs, vn] = T.vent, two = vs === 'grid2' || vs === 'louver2';
    slimVents(x, y, 12 - (slimW(vs, vn) >> 1), 39 - (two ? 1 : 0), 2, vs, vn);
    box(x + 1, y + 44, 22, 4, IRON); R(x + 2, y + 45, 20, 1, P.iron[3]);
    if (T.parts.includes('corners')) { PART.corner(x + 2, y + 39, 1, -1); PART.corner(x + 17, y + 39, -1, -1); }
    box(x + 4, y + 19, 16, 4, IRON);
    const d = rcPx('mg_heavy', q.k);
    turn(x + 12, y + 12, q.a, (X, Y) => {
      const C = X + x + 12 - d, M = Y + y + 12;
      R(C + 3, M - 4, 19, 9, P.iron[0]);
      [-3, 0, 3].forEach((dy, i) => { const lit = (i + f) % 3 === 0; R(C + 3, M + dy - 1, 19, 2, lit ? P.iron[4] : P.iron[3]); R(C + 3, M + dy, 19, 1, lit ? P.iron[3] : P.iron[2]); });
      gBrass(C + 3, 2, M, 5); gBrass(C + 12, 2, M, 5); gBrass(C + 20, 2, M, 5);
      if (T.b === 3) { gRing(C + 22, 3, M, 5); R(C + 23, M - 4, 2, 1, P.dark[0]); R(C + 23, M + 4, 2, 1, P.dark[0]); }
      gFlash(C + (T.b === 3 ? 25 : 22), M, q.k || 0);
      shadeIn(C - 7, M - 4, 11, 9, armorIn(C - 7, M - 4, 11, 9, T.f, 2));
      R(C - 5, M - 13, 6, 10, P.brass[0]); R(C - 4, M - 12, 4, 9, P.brass[2]); R(C - 4, M - 12, 1, 9, P.brass[3]);
      for (let i = 0; i < 4; i++) R(C - 3, M - 11 + i * 2, 2, 1, P.brass[1]);
    });
  }
  function mgHOver(x, y, q) {
    const T = MG_TIERS[(q.mt || 1) - 1];
    for (const rx of riveXs(T.riv[0], 4, 14)) PART.rivet(x + rx, y + 23, RIVET_TIER[T.riv[1]]);
    if (T.parts.includes('gauge')) gaugeS(x + 17.5, y + 25.5);
  }

  // ---------- 机炮 mg · 蒸汽离心炮 / 双联机枪 mg2 · 双嘴汽转球（2×2，2026-09-28 定稿，样机 tools/archive/mg-mg2-v3.html）----------
  // 都是绕一根垂直于画面的横轴俯仰：轴心凸台（旋转接头）、轴承臂、铜管、锅炉 / 火盆、圆形主体的明暗都固定（光是世界的）；
  // 主体上的铆钉 / 接缝、防盾、炮管 / 喷嘴跟着俯仰。为了手感（用户定）：开火时只有「炮管 / 喷嘴」沿自身轴线后坐（弹簧缓冲，rcPx），
  // 鼓和球套在轴上不滑；开火冒白汽（炮口一团 + 安全阀），离心炮不烧火药所以没有火光，汽转球喷嘴带几颗火星。
  // 车体下壳和零件照 2×2 规则：接缝铆钉 2 → 3 → 4（T1～3 黄铜、镀镍起钢质淡青）、散热口 横槽 → 双列 → 斜百叶、钢起包角铁、镀镍起铭牌 + 大压力表。
  // 所有绕轴的圆按耳轴像素角点画（disc(C, M, r)），转动时不半像素跳
  const AC_TIERS = [
    { f: 'raw', b: 1, vent: ['rows', 2], riv: [2, 'brass'], parts: [] },
    { f: 'raw', b: 1, vent: ['rows', 2], riv: [2, 'brass'], parts: [] },
    { f: 'box', b: 2, vent: ['rows', 3], riv: [3, 'brass'], parts: ['corners'] },
    { f: 'box', b: 2, vent: ['rows', 3], riv: [3, 'steel'], parts: ['corners', 'plate', 'gauge'] },
    { f: 'slant', b: 3, vent: ['grid', 3], riv: [4, 'steel'], parts: ['corners', 'plate', 'gauge'] },
    { f: 'slant', b: 3, vent: ['louver', 3], riv: [4, 'steel'], parts: ['corners', 'plate', 'gauge'] },
  ];
  const AC_PIV = { mg: [29, 20], mg2: [20, 20] }, AC_TOP = { mg: 28, mg2: 30 };
  const BRONZE4 = [P.brass[0], P.brass[1], P.brass[2], P.brass[3]], IRONR = [P.iron[0], P.iron[2], P.iron[3], P.iron[4]];
  // 车体下壳：壳（armorShell）+ 接缝 + 散热口 + 底座 + 底角包角铁；铆钉、铭牌、压力表在 OVER
  function acHull(x, y, T, top) {
    armorShell(x + 3, y + top, 42, 44 - top, T.f, 4);
    R(x + 5, y + top + 3, 38, 1, P.iron[1]); R(x + 5, y + top + 4, 38, 1, P.iron[4]);
    const [vs, vn] = T.vent; PART.vents(x, y, { x: 19, y: top + 7 }, vs, vs === 'louver' ? vn : Math.min(vn, 2));
    box(x + 2, y + 44, 44, 4, IRON); R(x + 3, y + 45, 42, 1, P.iron[3]);
    if (T.parts.includes('corners')) { PART.corner(x + 3, y + 39, 1, -1); PART.corner(x + 40, y + 39, -1, -1); }
  }
  function acOver(x, y, q, top) {
    const T = AC_TIERS[(q.mt || 1) - 1], n = T.riv[0];
    for (let i = 0; i < n; i++) PART.rivet(Math.round(x + 20 + 21 * i / (n - 1)), y + top + 4, RIVET_TIER[T.riv[1]]);
    if (T.parts.includes('plate')) PART.plate(x + 34, y + top + 7);
    if (T.parts.includes('gauge')) PART.gauge(x + 10.5, y + (top + 47) / 2);
  }
  // 铸造锥形炮身（x0 半高 h0 → x1 半高 h1）/ 加强箍 / 老式口部（b1 郁金香口 → b2 + 黄铜口箍 → b3 冠状口）
  function acCast(x0, x1, M, h0, h1, ramp) {
    for (let xx = x0; xx < x1; xx++) {
      const hh = Math.round(h0 + (h1 - h0) * (xx - x0) / Math.max(1, x1 - x0 - 1));
      R(xx, M - hh, 1, hh * 2 + 1, ramp[0]);
      if (hh > 0) { R(xx, M - hh + 1, 1, hh * 2 - 1, ramp[2]); px(xx, M - hh + 1, ramp[3]); if (hh > 2) px(xx, M - hh + 2, ramp[3]); if (hh > 1) px(xx, M + hh - 1, ramp[1]); }
    }
  }
  const acBand = (x0, w, M, hh, ramp) => { R(x0, M - hh, w, hh * 2 + 1, ramp[0]); R(x0, M - hh + 1, w, hh * 2 - 1, ramp[1]); px(x0, M - hh + 1, ramp[3]); };
  function acMuzzle(end, M, hh, b, ramp) {
    acBand(end - 3, 3, M, hh + 1, ramp); px(end - 1, M, P.black); if (hh > 1) { px(end - 1, M - 1, P.black); px(end - 1, M + 1, P.black); }
    if (b >= 2) acBand(end - 6, 2, M, hh + 1, BRONZE4);
    if (b === 3) { acBand(end, 2, M, hh + 2, ramp); for (const dy of [-hh - 2, hh + 2]) px(end + 1, M + dy, P.dark[0]); px(end + 1, M, P.black); return end + 2; }
    return end;
  }
  // 炮口白汽：开火那几帧一大团往前散，后坐回来时剩一缕往上飘
  function acSteam(end, M, k, f) {
    if (k >= 4) {
      const p = f % 3;
      R(end + p, M - 2, 4, 4, P.steam[2]); R(end + 1 + p, M - 3, 2, 1, P.steam[2]); px(end + 4 + p, M - 3, P.steam[1]); px(end + 4 + p, M + 2, P.steam[1]);
      if (k >= 6) { R(end + 4 + p, M - 1, 2, 2, P.steam[1]); px(end + 7 + p, M - 2, P.steam[0]); }
    } else if (k >= 1) { px(end + 1, M - 2, P.steam[1]); px(end + 2, M - 4, P.steam[0]); }
  }
  // 安全阀 / 锅炉顶上冒的白汽（开火时）
  function acPuff(x0, y0, f, n = 3) { for (let i = 0; i < n; i++) { const p = (f + i * 2) % 6; R(x0 + ((i * 3 + p) % 3) - 1, y0 - p, p < 3 ? 2 : 1, p < 3 ? 2 : 1, P.steam[p < 2 ? 2 : p < 4 ? 1 : 0]); } }
  function acPipe(pts) {
    for (let i = 1; i < pts.length; i++) { const [a, b] = pts[i - 1], [c, d] = pts[i]; line(a, b, c, d, 2, COPPER[1]); line(a, b - (a === c ? 0 : 1), c, d - (a === c ? 0 : 1), 1, COPPER[3]); }
    for (const [a, b] of pts.slice(1, -1)) { R(a - 1, b - 1, 3, 3, COPPER[0]); px(a, b, COPPER[2]); }
  }
  const acValve = (vx, vy) => { R(vx, vy, 3, 4, P.brass[1]); px(vx, vy, P.brass[3]); R(vx - 1, vy - 1, 5, 1, P.brass[0]); R(vx + 1, vy - 3, 1, 2, P.brass[2]); };
  function acArm(x0, y0, x1, y1) { line(x0, y0, x1, y1, 4, P.iron[0]); line(x0, y0 - 1, x1, y1 - 1, 2, P.iron[3]); line(x0, y0 - 1, x1, y1 - 1, 1, P.iron[4]); }
  function acHub(cx, cy) { disc(cx, cy, 3.6, P.brass[0]); disc(cx, cy, 2.8, P.brass[2]); px(cx - 2, cy - 2, P.brass[3]); R(cx - 1, cy - 1, 2, 2, P.iron[0]); px(cx - 1, cy - 1, P.iron[4]); }
  function acRound(cx, cy, r, ramp) { disc(cx, cy, r, ramp[0]); disc(cx, cy, r - 1, ramp[1]); disc(cx - 0.8, cy - 0.8, r - 2, ramp[2]); disc(cx - r * 0.38, cy - r * 0.38, Math.max(1.2, r * 0.22), ramp[3]); }

  // 机炮 · 蒸汽离心炮（1861 温南斯蒸汽炮）：小立式锅炉 → 铜管 → 轴心旋转接头 → 离心鼓；鼓壳 + 锥形防盾跟着俯仰，炮管在防盾里后坐，
  // 鼓里的转子开火时转。耳轴 (29,20)，炮口末端 x 51（blen 22）
  function acGun(x, y, q) {
    const T = AC_TIERS[(q.mt || 1) - 1], f = q.f || 0, k = q.k || 0, on = k >= 4, [pvx, pvy] = AC_PIV.mg, dx = x + pvx, dy = y + pvy;
    acHull(x, y, T, AC_TOP.mg);
    R(x + 7, y + 11, 10, 18, P.iron[0]); R(x + 8, y + 12, 8, 16, P.iron[3]); R(x + 8, y + 12, 2, 16, P.iron[4]); R(x + 14, y + 12, 2, 16, P.iron[2]);   // 小立式锅炉（不发光）
    disc(x + 12, y + 12, 5, P.iron[0]); disc(x + 12, y + 12, 4, P.iron[3]); px(x + 10, y + 10, P.iron[4]);
    R(x + 8, y + 17, 8, 1, P.brass[1]); R(x + 8, y + 24, 8, 1, P.brass[1]); R(x + 9, y + 20, 6, 2, P.dark[0]);
    R(x + 13, y + 3, 3, 6, P.dark[0]); R(x + 13, y + 4, 1, 5, P.dark[3]); R(x + 12, y + 2, 5, 2, P.dark[0]);
    acValve(x + 9, y + 5); if (on) acPuff(x + 10, y + 3, f);
    acRound(dx, dy, 10, BRONZE4);
    disc(dx, dy, 6.5, P.iron[0]); disc(dx, dy, 5.6, P.dark[1]);
    const d = rcPx('mg', k);
    turn(dx, dy, q.a, (X, Y) => {
      const C = X + dx, M = Y + dy;
      acCast(C + 9 - d, C + 22 - d, M, 4, 3, IRONR); acBand(C + 15 - d, 2, M, 4, IRONR);                           // 炮管（在防盾里后坐）
      acSteam(acMuzzle(C + 22 - d, M, 3, T.b, IRONR), M, k, f);
      for (let i = 0; i < 4; i++) { const hh = 5 + i; R(C + 8 + i, M - hh, 1, hh * 2 + 1, P.iron[0]); R(C + 8 + i, M - hh + 1, 1, hh * 2 - 1, i === 3 ? P.iron[2] : P.iron[3]); px(C + 8 + i, M - hh + 1, P.iron[4]); }   // 锥形防盾（不后坐）
      for (let i = 0; i < 6; i++) { const a = (i + 0.5) * Math.PI / 3, rx = Math.round(C + Math.cos(a) * 8) - 1, ry = Math.round(M + Math.sin(a) * 8) - 1; R(rx, ry, 2, 2, P.brass[0]); px(rx, ry, P.brass[3]); }
      const spin = on ? (f % 4) * Math.PI / 8 : 0;
      for (let i = 0; i < 4; i++) { const a = spin + i * Math.PI / 2; line(C, M, Math.round(C + Math.cos(a) * 5), Math.round(M + Math.sin(a) * 5), 1, P.iron[3]); }
    });
    acArm(x + 22, y + 30, dx, dy);
    acPipe([[x + 16, y + 14], [x + 20, y + 14], [x + 20, y + 20], [dx - 3, dy]]);
    acHub(dx, dy);
  }
  // 双联机枪 · 双嘴汽转球（希罗汽转球）：铁叉 + 火盆 + 黄铜球（明暗固定），赤道接缝 + 两根弯嘴跟着俯仰，喷嘴开火时交替伸缩后坐 + 喷白汽。
  // 耳轴 (20,20)，喷嘴末端 x 45（blen 25）
  function acTwin(x, y, q) {
    const T = AC_TIERS[(q.mt || 1) - 1], f = q.f || 0, k = q.k || 0, [pvx, pvy] = AC_PIV.mg2, dx = x + pvx, dy = y + pvy;
    acHull(x, y, T, AC_TOP.mg2);
    for (const fx of [9, 28]) { R(x + fx, y + 17, 3, 13, P.iron[0]); R(x + fx + 1, y + 18, 1, 11, P.iron[3]); }
    R(x + 14, y + 27, 12, 3, P.iron[0]); R(x + 15, y + 28, 10, 1, P.dark[1]); px(x + 17, y + 28, P.fire[0]); px(x + 22, y + 28, P.fire[0]);   // 火盆（余烬暗红，不发光）
    acRound(dx, dy, 9, BRONZE4);
    const d = rcPx('mg2', k);
    turn(dx, dy, q.a, (X, Y) => {
      const C = X + dx, M = Y + dy;
      R(C - 8, M - 1, 16, 2, P.brass[0]); R(C - 8, M - 1, 16, 1, P.brass[1]);
      for (const i of [-6, -3, 3, 6]) px(C + i, M - 2, P.brass[3]);
      for (const [i, sy] of [-1, 1].entries()) {
        const MM = M + sy * 5, hot = (f + i) % 2 ? k : 0, dd = (f + i) % 2 ? d : 0;
        line(C + 6, M + sy * 4, C + 10, MM, 3, P.brass[0]); line(C + 6, M + sy * 4, C + 10, MM, 1, P.brass[2]);
        acCast(C + 10, C + 13, MM, 2, 2, BRONZE4);                                                                  // 喷嘴根套（不动）
        acCast(C + 13 - dd, C + 25 - dd, MM, 1, 1, BRONZE4);                                                        // 伸缩喷嘴（交替后坐）
        const end = acMuzzle(C + 25 - dd, MM, 1, T.b, BRONZE4);
        acSteam(end, MM, hot, f);
        if (hot >= 6) { px(end + 1, MM - 2, P.fire[3]); px(end + 4, MM + 1, P.fire[2]); }
      }
    });
    acArm(x + 13, y + 30, dx, dy);
    acPipe([[x + 5, y + 30], [x + 5, y + 25], [dx - 3, dy + 2]]);
    acHub(dx, dy);
  }
  // 中炮 2×1 的立面分区：T1～2 敞开炮架（散热口在炮组下方、铆钉在前挡板脚）；T3～6 炮廓（表位左上、散热区在表位下、铆钉压炮廓和底座的接缝）
  const CANNON_M_ZONE = {
    open: { vent: { x: 11, y: 18, h: 3 }, rivets: { y: 19, xs: [27, 30] } },
    hood: { vent: { x: 3, y: 13, h: 5 }, rivets: { y: 18, x0: 4, x1: 28 }, gauge: { x: 6.5, y: 8.5 } },
  };
  const CANNON_M_TIERS = [
    { h: 'open', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { h: 'open', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { h: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'brass'], parts: ['corners'] },
    { h: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'steel'], parts: ['corners', 'gauge'] },
    { h: 'slant', b: 3, vent: ['grid2', 3], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
    { h: 'slant', b: 3, vent: ['louver2', 3], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
  ];
  const CANNON_M_HOOD = {
    open(x, y) { box(x + 1, y + 12, 30, 12, IRON); R(x + 2, y + 22, 28, 1, P.brass[2]); box(x + 26, y + 12, 7, 11, IRON); },   // 敞开炮架 + 低矮前挡板
    box(x, y) { box(x + 1, y + 18, 33, 6, IRON); R(x + 2, y + 22, 31, 1, P.brass[2]); box(x + 2, y + 3, 29, 16, IRON); R(x + 3, y + 4, 27, 1, P.iron[4]); },   // 方平顶炮廓
    slant(x, y) {                                                                                                                                             // 前沿斜板
      box(x + 1, y + 18, 33, 6, IRON); R(x + 2, y + 22, 31, 1, P.brass[2]);
      for (let yy = 3; yy <= 18; yy++) {
        const xr = x + 26 + Math.round((yy - 3) * 0.35);
        R(x + 2, y + yy, xr - x - 2, 1, P.iron[2]); R(x + 2, y + yy, 1, 1, P.iron[0]); R(xr - 1, y + yy, 1, 1, P.iron[0]); R(xr - 2, y + yy, 1, 1, P.iron[4]); R(x + 3, y + yy, 1, 1, P.iron[3]);
      }
      R(x + 2, y + 3, 24, 1, P.iron[0]); R(x + 3, y + 4, 22, 1, P.iron[4]);
    },
  };
  // 小炮 1×1：只靠剪影，不放身份件（visual-rules §3.5）。滑架 → 方箱 → 斜板炮座；铸造瓶身 → 方套箱 → 斜肩套箱
  const CANNON_S_TIERS = [
    { m: 'slide', form: 'cast' }, { m: 'slide', form: 'cast' },
    { m: 'box', form: 'jacket' }, { m: 'box', form: 'jacket' },
    { m: 'slant', form: 'slant' }, { m: 'slant', form: 'slant' },
  ];
  const CANNON_S_MOUNT = {
    slide(x, y) { box(x + 1, y + 19, 23, 5, DARK); R(x + 2, y + 19, 21, 1, P.iron[3]); for (const wx of [4, 20]) { disc(x + wx, y + 22.5, 2, P.dark[0]); R(x + wx, y + 22, 1, 1, P.iron[3]); } },
    box(x, y) { box(x + 1, y + 19, 23, 5, IRON); R(x + 2, y + 20, 21, 1, P.iron[4]); },
    slant(x, y) {
      for (let yy = 19; yy <= 23; yy++) {
        const xr = x + 20 + Math.round((yy - 19) * 0.8);
        R(x + 1, y + yy, xr - x - 1, 1, P.iron[2]); R(x + 1, y + yy, 1, 1, P.iron[0]); R(xr - 1, y + yy, 1, 1, P.iron[0]); R(xr - 2, y + yy, 1, 1, P.iron[4]);
      }
      R(x + 1, y + 19, 20, 1, P.iron[0]); R(x + 2, y + 20, 18, 1, P.iron[4]); R(x + 1, y + 23, 23, 1, P.iron[0]);
    },
  };
  // 侧炮 2×2（侧挂层）：挂板（跟材料）+ 暗铁悬吊臂 + 吊着的长炮；零件只放挂板上
  const SIDE_ZONE = {
    post: { vent: { x: 12, y: 5, h: 4 }, rivets: { y: 5, xs: [7, 24] } },
    box: { vent: { x: 15, y: 8, h: 5 }, rivets: { y: 3, x0: 14, x1: 26 }, gauge: { x: 8.5, y: 10.5 } },
  };
  const SIDE_TIERS = [
    { h: 'post', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { h: 'post', b: 1, vent: ['slits', 3], riv: [2, 'brass'], parts: [] },
    { h: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'brass'], parts: ['corners'] },
    { h: 'box', b: 2, vent: ['slits2', 4], riv: [3, 'steel'], parts: ['corners', 'gauge'] },
    { h: 'slant', b: 3, vent: ['grid2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
    { h: 'slant', b: 3, vent: ['louver2', 4], riv: [4, 'steel'], parts: ['corners', 'gauge'] },
  ];
  // 悬吊臂：上下法兰；T1～2 粗方柱 + 两道加强筋，T3～4 双柱 + 两道横撑，T5～6 实心腹板 + 竖筋
  const SIDE_ARM = (() => {
    const col = (x, y, w, h) => { R(x, y, w, h, P.dark[0]); R(x + 1, y, w - 2, h, P.dark[2]); R(x + 1, y, 1, h, P.dark[3]); };
    const flange = (x, y, w) => { R(x, y, w, 2, P.dark[0]); R(x + 1, y, w - 2, 1, P.dark[3]); };
    const rib = (x, y, w) => { R(x, y, w, 1, P.dark[0]); R(x, y + 1, w, 1, P.dark[3]); };
    return {
      post(x, y) { col(x + 13, y + 12, 7, 15); rib(x + 13, y + 16, 7); rib(x + 13, y + 21, 7); flange(x + 10, y + 12, 13); flange(x + 10, y + 25, 13); },
      truss(x, y) {
        col(x + 11, y + 16, 5, 11); col(x + 20, y + 16, 5, 11);
        for (const ry of [19, 23]) { R(x + 16, y + ry, 4, 2, P.dark[0]); R(x + 16, y + ry, 4, 1, P.dark[3]); }
        flange(x + 9, y + 16, 18); flange(x + 9, y + 25, 18);
      },
      solid(x, y) {
        R(x + 11, y + 16, 14, 11, P.dark[0]); R(x + 12, y + 16, 12, 11, P.dark[2]); R(x + 12, y + 16, 1, 11, P.dark[3]);
        for (const vx of [15, 20]) { R(x + vx, y + 17, 1, 9, P.dark[0]); R(x + vx + 1, y + 17, 1, 9, P.dark[3]); }
        flange(x + 9, y + 16, 18); flange(x + 9, y + 25, 18);
      },
    };
  })();
  const SIDE_HANG = {
    post(x, y) { box(x + 5, y + 3, 23, 9, IRON); R(x + 6, y + 4, 21, 1, P.iron[4]); SIDE_ARM.post(x, y); },
    box(x, y) { box(x + 3, y + 2, 29, 14, IRON); R(x + 4, y + 3, 27, 1, P.iron[4]); SIDE_ARM.truss(x, y); },
    slant(x, y) {
      for (let yy = 2; yy <= 15; yy++) {
        const xr = x + 26 + Math.round((yy - 2) * 0.4);
        R(x + 3, y + yy, xr - x - 3, 1, P.iron[2]); R(x + 3, y + yy, 1, 1, P.iron[0]); R(x + 4, y + yy, 1, 1, P.iron[3]); R(xr - 1, y + yy, 1, 1, P.iron[0]); R(xr - 2, y + yy, 1, 1, P.iron[4]);
      }
      R(x + 3, y + 2, 23, 1, P.iron[0]); R(x + 4, y + 3, 21, 1, P.iron[4]); R(x + 3, y + 15, 28, 1, P.iron[0]);
      SIDE_ARM.solid(x, y);
    },
  };
  // ---------- 齿轮与传动件（2026-09-27 定稿，样机 tools/gun-family-lab.html 齿轮 v6）----------
  // 对称齿轮：直径 D 取偶数、圆心落在像素角上；只算 1/8 扇区（0 ≤ y ≤ x）再镜像到 8 个扇区 → 像素级完全对称，没有杂边。
  // 矩形齿（径向 2px 深、横向 tw 宽，齿数是 4 的倍数、0° 有一个齿）；辐条沿坐标轴或对角线。
  // 整只齿轮一种纯色（没有描边、没有明暗）：后面的大齿轮暗、前面的小齿轮亮；轮毂一个实心圆、轴孔 2×2。
  // 转动只在 4 个对称帧之间切换：齿相位 0 / 半齿 × 辐条正 / 斜。齿轮画在 UNDER[id]（材质处理之后垫在最后面），颜色固定真黄铜。
  const GEAR_SPEC = {
    XS: { D: 8, n: 8, tw: 2, rim: 0, hub: 1.2, sw: 0, spokes: 0, tone: 2 },
    S: { D: 10, n: 8, tw: 2, rim: 0, hub: 1.6, sw: 0, spokes: 0, tone: 2 },
    M: { D: 14, n: 8, tw: 2, rim: 2, hub: 2.2, sw: 2, spokes: 4, tone: 2 },
    L: { D: 20, n: 12, tw: 2, rim: 2, hub: 3, sw: 2, spokes: 4, tone: 2 },
    XL: { D: 24, n: 16, tw: 2, rim: 3, hub: 3.6, sw: 4, spokes: 4, tone: 1 },
    XXL: { D: 32, n: 20, tw: 2, rim: 3, hub: 4.6, sw: 4, spokes: 4, tone: 1 },
  };
  function gearSymMask(sp, frame) {
    const R0 = sp.D / 2, rb = R0 - 2, half = (frame & 1) ? 0.5 : 0, diag = (frame & 2) ? Math.PI / 4 : 0;
    return (ox, oy) => {
      const d = Math.hypot(ox, oy);
      if (d > R0) return 0;
      if (d > rb) {
        for (let k = 0; k < sp.n; k++) {
          const t = (k + half) * Math.PI * 2 / sp.n;
          if (ox * Math.cos(t) + oy * Math.sin(t) > rb - 0.5 && Math.abs(-ox * Math.sin(t) + oy * Math.cos(t)) < sp.tw / 2) return 1;
        }
        return 0;
      }
      if (d < 1) return 3;
      if (d <= sp.hub) return 2;
      if (!sp.spokes || d > rb - sp.rim) return 1;
      for (let k = 0; k < sp.spokes; k++) {
        const t = diag + k * Math.PI * 2 / sp.spokes;
        if (ox * Math.cos(t) + oy * Math.sin(t) > 0 && Math.abs(-ox * Math.sin(t) + oy * Math.cos(t)) < sp.sw / 2) return 1;
      }
      return 0;
    };
  }
  // 金属感（v7，用户：纯色做底图不错，在此基础上加高光和阴影，但不要硬描边）：形状仍然 8 向对称，只在颜色上加光——
  //   ① 斜面：朝左上的边（上 / 左是空的）亮一阶，朝右下的边暗一阶——是本色的邻阶，不是深色描边；
  //   ② 轮缘 + 齿：左上一段弧亮一阶（再叠斜面就是最亮的高光），右下一段弧暗一阶；
  //   ③ 轮毂：比本体亮一阶，左上一个更亮的高光点；轴孔最深。暗部最低只到本色下一阶，不出现描边色。
  // 1/8 扇区镜像成整张 D×D 网格（0 空 / 1 本体 / 2 轮毂 / 3 轴孔）
  function gearGrid(sp, frame) {
    const m = gearSymMask(sp, frame), D = sp.D, h = D / 2, g = new Uint8Array(D * D);
    for (let j = 0; j < h; j++) for (let i = j; i < h; i++) {
      const v = m(i + 0.5, j + 0.5);
      if (!v) continue;
      for (const [a, b] of [[i, j], [j, i]]) for (const sx of [1, -1]) for (const sy of [1, -1]) g[(sy > 0 ? h + b : h - b - 1) * D + (sx > 0 ? h + a : h - a - 1)] = v;
    }
    return g;
  }
  // 按网格上色，返回 [[dx, dy, 颜色], ...]（dx / dy 相对圆心左上角）
  function gearPaint(sp, g) {
    const D = sp.D, h = D / 2, base = sp.tone, rimIn = h - 2 - sp.rim - 0.5, out = [];
    const RAMP = GEAR_RAMP;
    const at = (i, j) => (i < 0 || j < 0 || i >= D || j >= D) ? 0 : g[j * D + i];
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
      const v = g[j * D + i];
      if (!v) continue;
      const ox = i + 0.5 - h, oy = j + 0.5 - h, d = Math.hypot(ox, oy), nd = (ox + oy) / (d * Math.SQRT2 || 1);
      let k;
      if (v === 3) k = 0;
      else if (v === 2) k = base + 1 + (ox + oy < -1 ? 1 : 0) - ((at(i + 1, j) !== 2 || at(i, j + 1) !== 2) && ox + oy > 0 ? 1 : 0);
      else {
        let s = 0;
        if (!sp.spokes || d > rimIn) s += nd < -0.55 ? 1 : nd > 0.55 ? -1 : 0;          // 轮缘 / 齿的弧光
        const lit = !at(i, j - 1) || !at(i - 1, j), dark = !at(i, j + 1) || !at(i + 1, j);
        if (lit && !dark) s += 1; else if (dark && !lit) s -= 1;                          // 斜面
        k = base + Math.max(-1, Math.min(2, s));
      }
      out.push([i - h, j - h, RAMP[Math.max(1, Math.min(4, k))]]);
      if (v === 3) out[out.length - 1][2] = RAMP[0];
    }
    return out;
  }
  // 齿轮色阶 = 黄铜挪开一个色值（蓝通道 ±1）：肉眼一样，但材质处理按精确色匹配黄铜、认不出它，饱和色又原样保留 →
  // 齿轮可以画在 DRAW 的任何层次（夹在炮耳架和炮管之间、被炮床挡住……），在所有材料上都是纯黄铜
  const GEAR_RAMP = [...P.brass, '#f6dc92'].map(h => { const n = parseInt(h.slice(1), 16), b = n & 255; return '#' + ((n & 0xffff00) | (b > 0 ? b - 1 : 1)).toString(16).padStart(6, '0'); });
  const gearCache = new Map();   // 上好色的像素表，按（尺寸, 帧）缓存
  PART.gear = (cx, cy, size, frame = 0) => {
    const sp = GEAR_SPEC[size], key = size + frame;
    if (!gearCache.has(key)) gearCache.set(key, gearPaint(sp, gearGrid(sp, frame)));
    for (const [dx, dy, c] of gearCache.get(key)) R(cx + dx, cy + dy, 1, 1, c);
  };
  // 预制齿轮组：超大（D24，一整个 24px 块）在最后，大、中、小依次叠在前面咬合；(x, y) = 超大齿轮圆心。
  // 在 destination-over 下画，先画的在前面：小 → 中 → 大 → 超大
  const GEARSET = [[43, -7, 'S', 1], [34, -4, 'M', 0], [20, -3, 'L', 1], [0, 0, 'XL', 0]];
  PART.gearSet = (x, y) => { for (const [dx, dy, size, f] of GEARSET) PART.gear(x + dx, y + dy, size, f); };
  // 传动杆（2px 铁杆，上沿亮）+ 黄铜轴套；连杆（任意方向的直杆，两端黄铜销）
  PART.shaft = (x0, x1, y0) => { R(x0, y0, x1 - x0, 2, P.iron[0]); R(x0, y0, x1 - x0, 1, P.iron[3]); };
  PART.collar = (x0, y0) => { R(x0, y0 - 1, 2, 4, P.brass[1]); R(x0, y0 - 1, 1, 4, P.brass[3]); };
  PART.link = (x0, y0, x1, y1) => { line(x0, y0, x1, y1, 2, P.iron[0]); line(x0, y0, x1, y1, 1, P.iron[3]); disc(x0 + 0.5, y0 + 0.5, 1.3, P.brass[2]); disc(x1 + 0.5, y1 + 0.5, 1.3, P.brass[2]); };
  // 重炮 3×2（镀镍起，T4～T6）：台阶形炮耳架（T5～6 前沿斜切）+ 带滚轮的铁滑轨；背景齿轮组 + 传动杆
  const HEAVY_TIERS = { 4: { slant: false, heavy: false, riv: 3 }, 5: { slant: true, heavy: true, riv: 4 }, 6: { slant: true, heavy: true, riv: 4 } };
  const heavyTier = (mt) => HEAVY_TIERS[Math.max(4, Math.min(6, mt || 4))];
  const HEAVY_CHEEK = {
    step: [...Array(8).fill(34), ...Array(8).fill(30), ...Array(25).fill(25), ...Array(4).fill(31)],
    slant: [...Array(8).fill(34), ...Array(8).fill(30), ...Array(19).fill(25), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => 25 + Math.round(i * 1.4))],
  };
  // 台阶形墙板：tops[i] 是 x0 + i 这一列的上沿，底边统一到 bot
  function steppedPlate(x, y, x0, tops, bot) {
    tops.forEach((t, i) => {
      const xx = x + x0 + i, prev = i ? tops[i - 1] : 99, next = i < tops.length - 1 ? tops[i + 1] : 99;
      R(xx, y + t, 1, bot - t + 1, P.iron[2]); R(xx, y + t, 1, 1, P.iron[0]); R(xx, y + t + 1, 1, 1, P.iron[4]); R(xx, y + bot, 1, 1, P.iron[0]);
      if (prev > t) R(xx, y + t, 1, Math.min(prev, bot) - t + 1, P.iron[0]);
      if (prev > t && i) R(xx + 1, y + t + 1, 1, Math.min(prev, bot) - t - 1, P.iron[3]);
      if (next > t) R(xx, y + t, 1, Math.min(next, bot) - t + 1, P.iron[0]);
    });
  }

  // 臼炮 2×2（高抛火炮）：炮床 + 炮耳座 + 越往炮口越粗的短炮管；两侧活动大齿轮在 UNDER.mortar
  const MORTAR_TIERS = [
    { bed: 'block', cheek: 'block', hoops: 0, fat: false, vent: ['slits', 3], riv: [2, 'brass'], corners: false },
    { bed: 'block', cheek: 'block', hoops: 0, fat: false, vent: ['slits', 3], riv: [2, 'brass'], corners: false },
    { bed: 'step', cheek: 'box', hoops: 1, fat: true, vent: ['slits2', 4], riv: [3, 'brass'], corners: true },
    { bed: 'step', cheek: 'box', hoops: 1, fat: true, vent: ['slits2', 4], riv: [3, 'steel'], corners: true },
    { bed: 'slant', cheek: 'trap', hoops: 2, fat: true, vent: ['grid2', 4], riv: [4, 'steel'], corners: true },
    { bed: 'slant', cheek: 'trap', hoops: 2, fat: true, vent: ['louver2', 4], riv: [4, 'steel'], corners: true },
  ];
  const MORTAR_ZONE = { block: { vent: { x: 8, y: 40, h: 3 }, riv: { y: 38, x0: 33, x1: 40 } }, step: { vent: { x: 6, y: 42, h: 3 }, riv: { y: 36, x0: 32, x1: 38 } } };
  const MORTAR_BED = {
    block(x, y) { box(x + 3, y + 36, 42, 11, IRON); R(x + 4, y + 37, 40, 1, P.iron[4]); R(x + 4, y + 45, 40, 1, P.brass[2]); },
    step(x, y) { box(x + 2, y + 40, 44, 7, IRON); R(x + 3, y + 41, 42, 1, P.iron[4]); box(x + 8, y + 35, 32, 6, IRON); R(x + 9, y + 36, 30, 1, P.iron[4]); },
    slant(x, y) {
      for (let yy = 40; yy <= 46; yy++) {
        const xr = x + 40 + Math.round((yy - 40) * 0.9);
        R(x + 2, y + yy, xr - x - 2, 1, P.iron[2]); R(x + 2, y + yy, 1, 1, P.iron[0]); R(x + 3, y + yy, 1, 1, P.iron[3]); R(xr - 1, y + yy, 1, 1, P.iron[0]); R(xr - 2, y + yy, 1, 1, P.iron[4]);
      }
      R(x + 2, y + 40, 38, 1, P.iron[0]); R(x + 3, y + 41, 37, 1, P.iron[4]); R(x + 2, y + 46, 44, 1, P.iron[0]);
      box(x + 8, y + 35, 32, 6, IRON); R(x + 9, y + 36, 30, 1, P.iron[4]);
    },
  };
  const MORTAR_CHEEK = {   // 炮耳座：画在炮管前面（近侧墙板），夹住炮尾
    block(x, y) { box(x + 18, y + 26, 13, 11, IRON); R(x + 19, y + 27, 11, 1, P.iron[4]); },
    box(x, y) { box(x + 16, y + 25, 17, 11, IRON); R(x + 17, y + 26, 15, 1, P.iron[4]); R(x + 17, y + 31, 15, 1, P.iron[1]); },
    trap(x, y) {
      for (let yy = 25; yy <= 35; yy++) {
        const k = Math.round((yy - 25) * 0.4), x0 = x + 18 - k, x1 = x + 31 + k;
        R(x0, y + yy, x1 - x0, 1, P.iron[2]); R(x0, y + yy, 1, 1, P.iron[0]); R(x0 + 1, y + yy, 1, 1, P.iron[3]); R(x1 - 1, y + yy, 1, 1, P.iron[0]); R(x1 - 2, y + yy, 1, 1, P.iron[4]);
      }
      R(x + 18, y + 25, 13, 1, P.iron[0]); R(x + 19, y + 26, 11, 1, P.iron[4]);
    },
  };
  // 臼炮炮管：按旋转后的坐标逐像素算（u 沿炮管、v 垂直，负 = 向光），82° 也不锯齿；越往炮口越粗
  function mortarTube(cx, cy, aDeg, d, T, fire) {
    const a = aDeg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const c1 = T.fat ? 7 : 6, b1 = T.fat ? 8 : 7, segs = [[-7, -4, 3], [-4, 5, c1], [5, 21, b1], [21, 25, b1 + 1]];
    const hoopU = T.hoops === 2 ? [[10, 12], [15, 17]] : T.hoops === 1 ? [[13, 15]] : [];
    const uv = (px0, py0) => { const dx = px0 + 0.5 - cx, dy = py0 + 0.5 - cy; return [dx * cs - dy * sn + d, dx * sn + dy * cs]; };
    const hwAt = (u) => { for (const [u0, u1, hw] of segs) if (u >= u0 && u < u1) return hw + (hoopU.some(([h0, h1]) => u >= h0 && u < h1) ? 1 : 0); return -1; };
    const inside = (px0, py0) => { const [u, v] = uv(px0, py0), hw = hwAt(u); return hw > 0 && Math.abs(v) <= hw; };
    for (let py0 = cy - 34; py0 <= cy + 14; py0++) for (let px0 = cx - 14; px0 <= cx + 34; px0++) {
      if (!inside(px0, py0)) continue;
      const [u, v] = uv(px0, py0), hw = hwAt(u);
      let c = P.iron[3];
      if (!inside(px0 - 1, py0) || !inside(px0 + 1, py0) || !inside(px0, py0 - 1) || !inside(px0, py0 + 1)) c = P.iron[0];
      else if (u > 23.5 && Math.abs(v) < hw - 2) c = P.black;
      else if (u >= 3 && u < 5) c = v < 0 ? P.brass[3] : P.brass[1];
      else if (v < -hw + 2.2) c = P.iron[4];
      else if (v > hw * 0.45) c = P.iron[2];
      if (c === P.iron[3] && hoopU.some(([h0]) => u >= h0 && u < h0 + 1)) c = P.iron[4];
      R(px0, py0, 1, 1, c);
    }
    if (fire) for (let t = 25; t < 31; t++) { const w = Math.max(1, 5 - (t - 25) * 0.7); for (let q = -w; q <= w; q++) R(Math.round(cx + cs * (t - d) + sn * q), Math.round(cy - sn * (t - d) + cs * q), 1, 1, t < 28 ? P.fire[3] : P.fire[2]); }
  }

  // 方形固定螺栓（耳轴）：火炮家族共用
  const trunnionBolt = (cx, cy) => { R(cx - 2, cy - 2, 5, 5, P.brass[0]); R(cx - 1, cy - 1, 3, 3, P.brass[3]); R(cx, cy, 1, 1, P.brass[0]); };

  // ---------- 巨炮 4×4（96×96，只有 T6，2026-09-28 定稿，样机 tools/gun-family-lab.html 巨炮 v6）----------
  // 攻城臼炮阵地：背景钢板墙 + 龙门吊 + 吊弹 + 燃煤仓 + 齿轮组；中层脚手架 + 操作员小煤球；前景粗短炮筒 + 象牙白炮口箍（椭圆弧）+ 俯仰丝杠；
  // 遮挡层（墙板、回转支承转盘、弹簧底座）画在炮筒前面。所有笔触裁在 96×96 里。
  // 耳轴 (48,58)，炮口端面中心离耳轴 34（module-art 的 piv / blen）；画面按炮口朝天 55°～85° 设计，静止 75°。
  // 代码和样机逐行对应（样机的 px / rivetC / corner / gearSym 换成这里的 R / PART.rivet / PART.corner / PART.gear），改样机时同步改这里。
  // o = { a: 仰角（度）, k: 后坐 0～1 }（和样机一致；DRAW / OVER 入口把量化档 q.k 0～8 换算过来）
  const px1 = (x, y, c) => R(x, y, 1, 1, c);
  const G_P = { x: 48, y: 58 };
  const G_SEGS = [[-16, -12, 9], [-12, -2, 14], [-2, 20, 16], [20, 25, 17], [25, 34, 20]];   // v5：炮身加长 1/5（42 → 50），炮口箍 9 长、半宽 20
  const G_HOOPS = [[4, 7], [12, 15]];
  const G_END = 34;
  const G_TILT = 0.38;   // v6：截面椭圆的扁度（短轴 / 长轴）；炮口端面、箍的下沿、铁箍、接缝都用这一个比例，才读成同一根圆筒
  const G_WOOD = P.leather;
  // 工字钢立柱：两侧翼缘 + 中间腹板
  function gIbeamV(x0, y0, y1) { R(x0, y0, 5, y1 - y0, P.dark[0]); R(x0 + 1, y0, 1, y1 - y0, P.dark[3]); R(x0 + 2, y0, 1, y1 - y0, P.dark[1]); R(x0 + 3, y0, 1, y1 - y0, P.dark[3]); }
  // 桁架梁：上下弦 + 之字腹杆
  function gTrussH(x0, x1, y0, h) {
    R(x0, y0, x1 - x0, 2, P.dark[0]); R(x0, y0, x1 - x0, 1, P.dark[3]); R(x0, y0 + h - 2, x1 - x0, 2, P.dark[0]); R(x0, y0 + h - 2, x1 - x0, 1, P.dark[3]);
    for (let xx = x0; xx + h * 2 <= x1; xx += h * 2) { line(xx, y0 + h - 2, xx + h, y0 + 1, 1, P.dark[2]); line(xx + h, y0 + 1, xx + h * 2, y0 + h - 2, 1, P.dark[2]); }
  }
  function giantTube(x, y, o) {
    const a = (o.a == null ? 75 : o.a) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), d = Math.round((o.k || 0) * 7);
    const cx = x + G_P.x, cy = y + G_P.y;
    const uv = (px0, py0) => { const dx = px0 + 0.5 - cx, dy = py0 + 0.5 - cy; return [dx * cs - dy * sn + d, dx * sn + dy * cs]; };
    const hwAt = (u) => { for (const [u0, u1, hw] of G_SEGS) if (u >= u0 && u < u1) return hw + (G_HOOPS.some(([h0, h1]) => u >= h0 && u < h1) ? 1 : 0); return -1; };
    const inside = (px0, py0) => { const [u, v] = uv(px0, py0), hw = hwAt(u); return hw > 0 && Math.abs(v) <= hw; };
    for (let py0 = cy - 50; py0 <= cy + 30; py0++) for (let px0 = cx - 40; px0 <= cx + 40; px0++) {
      if (!inside(px0, py0)) continue;
      const [u, v] = uv(px0, py0), hw = hwAt(u), uc = u + G_TILT * Math.sqrt(Math.max(0, hw * hw - v * v));   // uc：按椭圆弧弯过的截面位置
      let c = P.iron[3];
      if (!inside(px0 - 1, py0) || !inside(px0 + 1, py0) || !inside(px0, py0 - 1) || !inside(px0, py0 + 1)) c = P.iron[0];
      else if (uc >= -1 && uc < 2) c = v < 0 ? P.brass[3] : P.brass[1];
      else if (v < -hw + 3) c = P.iron[4];
      else if (v > hw * 0.5) c = P.iron[2];
      if (c === P.iron[3] && G_HOOPS.some(([h0]) => uc >= h0 && uc < h0 + 1)) c = P.iron[4];
      if (c === P.iron[3] && Math.abs(uc - 20) < 0.5) c = P.iron[2];
      px1(px0, py0, c);
    }
    if ((o.k || 0) >= 0.85) for (let t = G_END; t < G_END + 12; t++) { const w = Math.max(1, 13 - (t - G_END) * 1.1); for (let q = -w; q <= w; q++) px1(Math.round(cx + cs * (t - d) + sn * q), Math.round(cy - sn * (t - d) + cs * q), t < G_END + 5 ? P.fire[3] : P.fire[2]); }
  }
  // 炮口端面（v4：镶边象牙白，镀镍配色）：垂直于炮筒的圆，看成略倾斜的椭圆——外沿、象牙白厚边（朝上一半亮）、内沿、黑洞 + 远侧内壁。
  // 象牙白是低饱和色，材质处理会把它当成铁换掉，所以放在 OVER（材质之后）画
  const G_IVORY = ['#63593c', '#9c8d60', '#c5bca1', '#efede6'];
  function giantMuzzle(x, y, o) {
    const a = (o.a == null ? 75 : o.a) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), d = Math.round((o.k || 0) * 7);
    const cx = x + G_P.x, cy = y + G_P.y, R0 = 20, Rs = R0 * G_TILT, Ri = 0.66, U0 = 25;
    const uv = (px0, py0) => { const dx = px0 + 0.5 - cx, dy = py0 + 0.5 - cy; return [dx * cs - dy * sn + d, dx * sn + dy * cs]; };
    // v6（用户：白色包口不是圆弧形、很怪）：箍的下沿不再是直线，而是和端面同扁度的椭圆弧（中间往炮尾方向鼓），整只箍读成一段圆筒
    const lowAt = (v) => U0 - Rs * Math.sqrt(Math.max(0, 1 - (v / R0) ** 2));
    const inCollar = (px0, py0) => { const [u, v] = uv(px0, py0); return Math.abs(v) <= R0 && u >= lowAt(v) && u < G_END; };
    // 象牙白炮口箍：包住炮筒最上面 9 个单位（v5：往下延伸盖住一截炮身），按圆筒打光
    for (let py0 = cy - 60; py0 <= cy + 20; py0++) for (let px0 = cx - 40; px0 <= cx + 40; px0++) {
      if (!inCollar(px0, py0)) continue;
      const [u, v] = uv(px0, py0);
      let c = G_IVORY[2];
      if (!inCollar(px0 - 1, py0) || !inCollar(px0 + 1, py0) || !inCollar(px0, py0 - 1) || !inCollar(px0, py0 + 1)) c = G_IVORY[0];
      else if (v < -R0 + 4) c = G_IVORY[3];
      else if (v > R0 * 0.45) c = G_IVORY[1];
      if (c === G_IVORY[2] && u < lowAt(v) + 1.5) c = G_IVORY[1];   // 下沿一道阴影（沿椭圆弧）：看出箍的厚度
      px1(px0, py0, c);
    }
    // 炮口端面：略倾斜的椭圆——外沿、厚边（朝上一半亮）、内沿、黑洞 + 远侧内壁
    for (let py0 = cy - 60; py0 <= cy + 20; py0++) for (let px0 = cx - 40; px0 <= cx + 40; px0++) {
      const [u, v] = uv(px0, py0), uu = u - G_END;
      const e = (uu / Rs) ** 2 + (v / R0) ** 2;
      if (e > 1) continue;
      let c;
      if (e > 0.86) c = G_IVORY[0];
      else if (e > Ri * Ri) c = uu > 0 ? (v < 0 ? G_IVORY[3] : G_IVORY[2]) : G_IVORY[1];
      else if (e > Ri * Ri * 0.8) c = G_IVORY[0];
      else c = uu > Rs * 0.15 ? P.black : P.dark[1];
      px1(px0, py0, c);
    }
  }
  // 操作员小煤球：条纹工程师帽 + 护目镜，手扶操纵杆（cx, cy = 身体中心）
  function gEngineer(cx, cy) {
    disc(cx, cy, 4.6, '#141824'); disc(cx, cy, 3.8, '#2f3850'); px1(cx - 2, cy - 2, '#6a7a9c');
    R(cx - 1, cy - 1, 2, 2, P.white); px1(cx, cy, P.black); R(cx + 2, cy - 1, 2, 2, P.white); px1(cx + 3, cy, P.black);   // 眼睛看向炮
    R(cx - 5, cy - 5, 10, 3, P.water[1]); for (let i = 0; i < 10; i += 2) R(cx - 5 + i, cy - 5, 1, 3, P.steam[2]);         // 条纹工程师帽
    R(cx - 4, cy - 6, 8, 1, P.water[1]); R(cx + 3, cy - 3, 4, 1, P.dark[0]);                                                   // 帽顶 + 帽檐
    line(cx + 3, cy + 1, cx + 7, cy - 4, 1, P.iron[0]); disc(cx + 7.5, cy - 4.5, 1.2, P.fire[2]);                            // 操纵杆
    R(cx + 3, cy + 1, 2, 1, '#141824');                                                                                          // 小手
  }
  // 俯仰丝杠（代替 v1 的齿弧）：转盘上的铰座 → 炮筒下侧的吊耳，一根带螺纹的粗杆，随仰角伸缩；超大齿轮在后面驱动它
  function giantJack(x, y, o) {
    const a = (o.a == null ? 75 : o.a) * Math.PI / 180, d = Math.round((o.k || 0) * 7), u = 8 - d, v = 17.5;   // 吊耳在炮筒下侧
    const lx = Math.round(x + G_P.x + Math.cos(a) * u + Math.sin(a) * v), ly = Math.round(y + G_P.y - Math.sin(a) * u + Math.cos(a) * v);
    const bx = x + 68, by = y + 72, n = Math.max(Math.abs(lx - bx), Math.abs(ly - by)) || 1;
    line(bx, by, lx, ly, 4, P.iron[0]); line(bx, by, lx, ly, 2, P.iron[3]);
    for (let t = 2; t < n - 2; t += 3) px1(Math.round(bx + (lx - bx) * t / n), Math.round(by + (ly - by) * t / n), P.iron[4]);   // 螺纹
    R(bx - 3, by - 1, 7, 4, P.dark[0]); R(bx - 2, by - 1, 5, 1, P.dark[3]);                                                      // 铰座
    disc(lx + 0.5, ly + 0.5, 2.4, P.brass[0]); disc(lx + 0.5, ly + 0.5, 1.4, P.brass[2]);                                       // 吊耳
  }
  // 背景钢板墙：每块 24×24 的钢板（v5：原来 12×12 四块合一）压一个 X 字加强肋，接缝上一排 1px 细铆钉（每 3px 一颗）；整体压暗，只做底纹
  function gPlateWall(x0, y0, x1, y1) {
    R(x0, y0, x1 - x0, y1 - y0, P.dark[1]);
    for (let py0 = y0; py0 < y1; py0 += 24) for (let px0 = x0; px0 < x1; px0 += 24) {
      const w = Math.min(24, x1 - px0), h = Math.min(24, y1 - py0), n = Math.min(w, h);
      for (let t = 1; t < n - 1; t++) { px1(px0 + t, py0 + t, P.dark[2]); px1(px0 + n - 1 - t, py0 + t, P.dark[2]); }
      R(px0, py0, w, 1, P.dark[0]); R(px0, py0, 1, h, P.dark[0]);
      for (let t = 3; t < w; t += 3) px1(px0 + t, py0 + 1, P.dark[3]);
      for (let t = 3; t < h; t += 3) px1(px0 + 1, py0 + t, P.dark[3]);
    }
  }
  // 独立燃煤仓：挂在右立柱上的漏斗仓，顶上一堆煤块，仓壁铆接、一道 X 撑、一道黄铜箍，底下一个卸煤闸门
  function gCoalBunker(x0, y0) {
    for (let yy = 0; yy <= 26; yy++) {
      const k = Math.max(0, Math.round((yy - 12) * 0.45)), l = x0 + k, r = x0 + 18 - k;
      R(l, y0 + yy, r - l, 1, P.iron[2]); px1(l, y0 + yy, P.iron[0]); px1(l + 1, y0 + yy, P.iron[3]); px1(r - 1, y0 + yy, P.iron[0]);
    }
    R(x0, y0, 18, 1, P.iron[0]); R(x0, y0 + 26, 18, 1, P.iron[0]);
    line(x0 + 2, y0 + 3, x0 + 15, y0 + 11, 1, P.iron[1]); line(x0 + 15, y0 + 3, x0 + 2, y0 + 11, 1, P.iron[1]);   // X 撑
    R(x0 + 1, y0 + 13, 16, 1, P.brass[1]);
    for (let i = 0; i < 5; i++) { PART.rivet(x0 + 2 + i * 3, y0 + 1, RIVET_TIER.steel); }
    for (const [cx0, cy0, rr] of [[3, -1, 2.5], [7, -2, 3], [12, -2, 3], [15, -1, 2.2], [9, 0, 2]]) { disc(x0 + cx0, y0 + cy0, rr, P.dark[0]); disc(x0 + cx0 - 0.6, y0 + cy0 - 0.6, rr - 1, P.dark[2]); }   // 煤堆
    R(x0 + 6, y0 + 27, 7, 4, P.dark[0]); R(x0 + 7, y0 + 28, 5, 1, P.dark[3]); R(x0 + 7, y0 + 30, 5, 1, P.brass[1]);   // 卸煤闸门
    R(x0 + 17, y0 + 4, 5, 2, P.dark[0]); R(x0 + 17, y0 + 18, 5, 2, P.dark[0]);                                         // 挂到立柱上的托架
  }
  // 巨型炮弹（黄铜）：弹底朝上挂在吊钩上，弹头朝下。cx = 中线，y0 = 弹底上沿
  function gShell(cx, y0) {
    const rows = [];
    rows.push([6, 'base']);                                             // 弹底（比弹体宽一点）
    for (let i = 0; i < 9; i++) rows.push([5, i === 6 || i === 7 ? 'band' : 'body']);   // 弹体 + 紫铜弹带
    for (let i = 0; i < 8; i++) rows.push([Math.max(1, Math.round(5 * Math.sqrt(1 - ((i + 0.5) / 8) ** 2))), 'nose']);   // 弧形弹头
    rows.forEach(([hw, kind], j) => {
      const yy = y0 + j;
      for (let xx = cx - hw; xx < cx + hw; xx++) {
        const t = (xx - (cx - hw)) / (hw * 2 - 1 || 1);
        let c = kind === 'band' ? (t < 0.3 ? '#dd9a6a' : t > 0.75 ? '#74391f' : '#b0603a') : (t < 0.25 ? P.brass[3] : t > 0.72 ? P.brass[1] : P.brass[2]);
        if (xx === cx - hw || xx === cx + hw - 1 || kind === 'base' && (j === 0)) c = kind === 'band' ? '#3b1e16' : P.brass[0];
        if (kind === 'nose' && j === rows.length - 1) c = P.brass[0];
        px1(xx, yy, c);
      }
    });
    R(cx - 2, y0 - 2, 4, 2, P.iron[0]); px1(cx - 1, y0 - 2, P.iron[4]);   // 吊环
  }
  function giantBase(x, y, o) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 96, 96); ctx.clip();   // v5：所有笔触都裁在 96×96 里，不溢出格子
    // ---- 背景：钢板墙（X 加强肋 + 细密铆钉）→ 龙门吊 + 支撑梁 ----
    gPlateWall(x + 6, y + 9, x + 90, y + 70);
    R(x + 6, y + 36, 84, 3, P.dark[0]); R(x + 6, y + 36, 84, 1, P.dark[3]);                                               // 中间一道系梁
    gIbeamV(x + 1, y + 6, y + 80); gIbeamV(x + 90, y + 6, y + 80);
    gTrussH(x + 1, x + 95, y + 2, 7);
    for (const [x0, dir] of [[6, 1], [90, -1]]) for (let t = 0; t < 10; t++) R(x + x0 + (dir > 0 ? t : -t - 1), y + 9 + t, 1, 10 - t, t < 2 ? P.dark[0] : P.dark[2]);   // 立柱和梁的角撑板
    // 吊车 + 悬吊炮弹（挪到脚手架上方，操作员旁边）
    R(x + 33, y + 9, 12, 4, P.dark[0]); R(x + 34, y + 9, 10, 1, P.dark[3]); disc(x + 35.5, y + 9, 1.5, P.dark[2]); disc(x + 42.5, y + 9, 1.5, P.dark[2]);
    for (let yy = 13; yy < 16; yy++) px1(x + 39, y + yy, yy % 2 ? P.iron[4] : P.iron[1]);
    R(x + 38, y + 16, 3, 2, P.iron[0]);
    gShell(x + 39, y + 18);
    // 燃煤仓（挂在右立柱上）
    gCoalBunker(x + 70, y + 12);
    // 大中齿轮：巨型在炮耳架右后、大在它左上、中在右边咬着巨型（脚手架后面试过一只，透过立杆和爬梯显得碎，去掉）
    PART.gear(x + 76, y + 60, 'XXL', 0); PART.gear(x + 60, y + 44, 'L', 1); PART.gear(x + 90, y + 50, 'M', 0);
    // ---- 中层：左侧脚手架 ----
    for (const px0 of [9, 26]) { R(x + px0, y + 26, 2, 53, P.iron[0]); R(x + px0, y + 26, 1, 53, P.iron[3]); }
    for (const ly of [26, 48, 66]) { R(x + 9, y + ly, 19, 2, P.iron[0]); R(x + 9, y + ly, 19, 1, P.iron[3]); }
    line(x + 11, y + 50, x + 25, y + 64, 1, P.iron[2]); line(x + 25, y + 50, x + 11, y + 64, 1, P.iron[2]);
    R(x + 7, y + 44, 24, 3, G_WOOD[1]); R(x + 7, y + 44, 24, 1, G_WOOD[2]); for (let i = 10; i < 30; i += 6) px1(x + i, y + 45, G_WOOD[0]);
    for (let ry = 50; ry < 78; ry += 4) R(x + 14, y + ry, 6, 1, P.iron[4]);
    R(x + 13, y + 48, 1, 30, P.iron[0]); R(x + 20, y + 48, 1, 30, P.iron[0]);
    // ---- 前景：炮筒 + 俯仰丝杠 ----
    giantTube(x, y, o);
    giantJack(x, y, o);
    // ---- 遮挡层：墙板、转盘、底座都画在炮筒前面（v5 整体下移、底座变矮）----
    // 算过：55°～85° 加满后坐，炮尾四角落在 x 23～61、y 63～85；墙板左沿在 y 63 处是 x 27（v5 斜率 0.8），转盘 / 底座盖住其余
    for (const [x0, x1] of [[24, 32], [72, 62]]) { line(x + x0, y + 72, x + x1, y + 58, 3, P.iron[0]); line(x + x0, y + 72, x + x1, y + 58, 1, P.iron[3]); }   // 墙板两侧斜撑梁
    for (let yy = 56; yy <= 72; yy++) {
      const k = Math.round((72 - yy) * 0.8), x0 = x + 20 + k, x1 = x + 74 - k;
      R(x0, y + yy, x1 - x0, 1, P.iron[2]); px1(x0, y + yy, P.iron[0]); px1(x0 + 1, y + yy, P.iron[3]); px1(x1 - 1, y + yy, P.iron[0]); px1(x1 - 2, y + yy, P.iron[4]);
    }
    R(x + 33, y + 56, 28, 1, P.iron[0]); R(x + 34, y + 57, 26, 1, P.iron[4]); R(x + 26, y + 68, 42, 1, P.iron[1]);
    // 转盘（v6，用户：底座要更有质感）：回转支承——上沿倒角高光、一圈黄铜齿圈（齿和齿槽交替）、下面一排螺栓，两端露出轴承端面
    R(x + 12, y + 72, 72, 7, P.dark[0]);
    R(x + 13, y + 73, 70, 1, P.iron[4]); R(x + 13, y + 74, 70, 1, P.iron[2]);
    for (let t = 0; t < 70; t++) { const tooth = t % 3 !== 2; px1(x + 13 + t, y + 75, tooth ? P.brass[3] : P.brass[0]); px1(x + 13 + t, y + 76, tooth ? P.brass[1] : P.brass[0]); }
    R(x + 13, y + 77, 70, 1, P.dark[2]); for (let t = 3; t < 70; t += 6) px1(x + 13 + t, y + 77, P.iron[4]);
    for (const ex of [12, 81]) { R(x + ex, y + 73, 3, 5, P.iron[1]); px1(x + ex + 1, y + 74, P.iron[4]); px1(x + ex + 1, y + 76, P.dark[0]); }
    // 加固底座（v5 变矮：15 高）：粗斜撑支腿 + 地脚板 + 上弦 + 一排黄铜螺旋弹簧 + 下弦
    for (const [x0, dir] of [[6, -1], [89, 1]]) {
      line(x + x0, y + 80, x + x0 + dir * 4, y + 90, 5, P.iron[0]); line(x + x0, y + 80, x + x0 + dir * 4, y + 90, 3, P.iron[2]); line(x + x0, y + 80, x + x0 + dir * 4, y + 90, 1, P.iron[4]);
    }
    R(x + 0, y + 89, 14, 7, P.iron[0]); R(x + 1, y + 90, 12, 1, P.iron[4]); R(x + 1, y + 91, 12, 4, P.iron[2]);
    R(x + 82, y + 89, 14, 7, P.iron[0]); R(x + 83, y + 90, 12, 1, P.iron[4]); R(x + 83, y + 91, 12, 4, P.iron[2]);
    box(x + 5, y + 79, 86, 15, IRON);
    // v6：上下弦做出厚度（亮面 + 投影），弹簧仓用铁立柱隔成一格一格，像火车转向架的悬挂舱
    R(x + 6, y + 80, 84, 1, P.iron[4]); R(x + 6, y + 81, 84, 1, P.iron[0]);                                                  // 上弦（下沿投影）
    R(x + 6, y + 82, 84, 10, P.dark[0]); R(x + 6, y + 82, 84, 1, P.black);                                                   // 弹簧仓（加高到 10），上沿压一道黑影
    R(x + 6, y + 92, 84, 1, P.iron[4]);                                                                                       // 下弦亮面
    for (const sx of [6, 20, 34, 48, 62, 76, 88]) {                                                                           // 铁立柱隔板：左亮右暗 + 中间一颗螺栓
      const w = sx === 6 || sx === 88 ? 2 : 3;
      R(x + sx, y + 82, w, 10, P.iron[2]); R(x + sx, y + 82, 1, 10, P.iron[4]);
      if (w === 3) { R(x + sx + 2, y + 82, 1, 10, P.iron[0]); px1(x + sx + 1, y + 85, P.iron[4]); px1(x + sx + 1, y + 86, P.dark[0]); }
    }
    for (let i = 0; i < 6; i++) gCoilSpring(x + 13 + i * 14, y + 82, 10);                                                     // 六根黄铜螺旋弹簧，一格一根
    R(x + G_P.x - 4, y + G_P.y - 4, 9, 9, P.brass[0]); R(x + G_P.x - 3, y + G_P.y - 3, 7, 7, P.brass[3]); R(x + G_P.x - 2, y + G_P.y - 2, 5, 5, P.brass[1]); px1(x + G_P.x, y + G_P.y, P.brass[0]);
    gEngineer(x + 19, y + 38);
    PART.corner(x + 5, y + 89, 1, -1); PART.corner(x + 86, y + 89, -1, -1);
    ctx.restore();
  }
  // 黄铜螺旋弹簧（v6，用户：v5 还是看不出是弹簧——8px 里 2.5 圈，每圈只落 1～2px，读成一摞横条）：
  // 窄一点（7 宽）、圈距 4px，每圈拆成一笔后半圈（右上 → 左下，暗）和一笔前半圈（左 → 右下，亮 + 下面一道阴影），
  // 圈与圈之间露出暗槽；中间一根暗铁导杆从缝里透出来；上下端板比弹簧宽。cx = 中线，y0 = 顶，h = 高
  function gCoilSpring(cx, y0, h) {
    const hw = 3, pitch = 4, top = y0 + 1, n = Math.floor((h - 2) / pitch);
    R(cx, top, 1, h - 2, P.dark[3]);                                                                            // 导杆
    for (let k = 0; k < n; k++) {
      const yy = top + k * pitch;
      line(cx + hw, yy, cx - hw, yy + 2, 1, P.brass[0]);                                                         // 后半圈
      line(cx - hw, yy + 2, cx + hw, yy + 4, 1, P.brass[3]);                                                     // 前半圈（亮）
      line(cx - hw + 1, yy + 3, cx + hw, yy + 5, 1, P.brass[1]);                                                 // 前半圈下侧阴影
    }
    R(cx - hw - 1, y0, hw * 2 + 3, 1, P.brass[2]); R(cx - hw - 1, y0 + h - 1, hw * 2 + 3, 1, P.brass[1]);        // 上下端板
  }
  function giantOver(x, y, o) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, 96, 96); ctx.clip();
    giantMuzzle(x, y, o);
    for (let i = 0; i < 12; i++) PART.rivet(x + 8 + i * 7, y + 79, RIVET_TIER.steel);                                            // 上弦一排大铆钉
    for (const bx of [2, 7, 11, 83, 87, 92]) { R(x + bx, y + 92, 3, 3, P.dark[0]); px1(x + bx + 1, y + 92, P.iron[4]); px1(x + bx + 1, y + 93, P.dark[3]); }   // 地脚板大螺栓
    for (let i = 0; i < 6; i++) { const bx = x + 14 + i * 13; R(bx, y + 93, 2, 2, P.dark[0]); px1(bx, y + 93, P.iron[4]); }        // 下弦地脚螺栓
    const ex = x + 42, ey = y + 62;                                                                                                    // 墙板铭牌
    R(ex, ey, 12, 7, P.brass[0]); R(ex + 1, ey + 1, 10, 5, P.brass[2]); R(ex + 1, ey + 1, 10, 1, P.brass[3]);
    R(ex + 2, ey + 2, 8, 3, '#1c1a1f'); R(ex + 3, ey + 3, 6, 1, P.brass[1]);
    ctx.restore();
  }
  const giantO = (q) => ({ a: q.a, k: (q.k || 0) / 8 });

  // 材质处理之后才画的「身份件」：DRAW 画铁件，OVER 画颜色固定的零件
  // ---------- 大型锅炉 boiler_l / 大水箱 water_l（3×3，2026-09-29 定稿 v4：巨大炉口 + 火光剪影 + 煤山 + 司炉站台；拼装水柜 + 大舷窗）----------
  // 样机 tools/archive/big-boiler-tank.html。自带一套小工具（从样机原样搬来，g 是当前画布）；司炉小工在材质处理之后逐帧画（bigStoker）
  const BIG = (() => {
  const P = SA.PAL, TAU = Math.PI * 2;
  let g = null;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const px = (x, y, c) => R(x, y, 1, 1, c);
  const disc = (cx, cy, r, c) => {
    g.fillStyle = c;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy; if (dx * dx + dy * dy <= r * r) g.fillRect(xx, yy, 1, 1);
    }
  };
  const line = (x0, y0, x1, y1, w, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1, o = Math.floor(w / 2); g.fillStyle = c;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n) - o, Math.round(y0 + (y1 - y0) * i / n) - o, w, w);
  };
  const ring = (cx, cy, r, c) => { const n = Math.ceil(r * 7); for (let i = 0; i < n; i++) { const a = i / n * TAU; px(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r), c); } };
  const IRON = [P.iron[0], P.iron[1], P.iron[2], P.iron[3]], IRONL = [P.iron[0], P.iron[2], P.iron[3], P.iron[4]], BRASS = [P.brass[0], P.brass[1], P.brass[2], P.brass[3]], DARK = [P.dark[0], P.dark[1], P.dark[2], P.dark[3]];
  const LEATHER = [P.black, P.leather[0], P.leather[1], P.leather[2]], WATER = [P.water[0], P.water[1], P.water[2], P.water[3]];
  const box = (x, y, w, h, r) => { R(x, y, w, h, r[0]); R(x + 1, y + 1, w - 2, h - 2, r[2]); R(x + 1, y + h - 2, w - 2, 1, r[1]); R(x + w - 2, y + 1, 1, h - 2, r[1]); R(x + 1, y + 1, w - 2, 1, r[3]); R(x + 1, y + 1, 1, h - 2, r[3]); };
  const rivet = (x, y) => { R(x, y, 2, 2, P.iron[4]); px(x + 1, y + 1, P.iron[2]); };
  // 任意形状按像素判定上色：外沿描边、左上两像素亮、右下两像素暗
  function shape(test, x0, y0, x1, y1, r = IRONL) {
    const inn = (xx, yy) => test(xx + 0.5, yy + 0.5);
    for (let yy = Math.floor(y0); yy <= Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx <= Math.ceil(x1); xx++) {
      if (!inn(xx, yy)) continue;
      if (!inn(xx - 1, yy) || !inn(xx + 1, yy) || !inn(xx, yy - 1) || !inn(xx, yy + 1)) { px(xx, yy, r[0]); continue; }
      px(xx, yy, !inn(xx - 2, yy) || !inn(xx, yy - 2) ? r[3] : !inn(xx + 2, yy) || !inn(xx, yy + 2) ? r[1] : r[2]);
    }
  }
  const inPoly = (pts) => (x, y) => { let s = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
  const poly = (pts, r) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); shape(inPoly(pts), Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, r); };
  const ball = (cx, cy, rr, r) => shape((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr, cx - rr - 1, cy - rr - 1, cx + rr + 1, cy + rr + 1, r);
  const vtube = (x, y, w, h, r = IRONL) => { R(x, y, w, h, r[0]); R(x + 1, y, w - 2, h, r[2]); R(x + 1, y, 1, h, r[3]); if (w > 3) R(x + w - 2, y, 1, h, r[1]); };
  const htube = (x, y, w, h, r = IRONL) => { R(x, y, w, h, r[0]); R(x, y + 1, w, h - 2, r[2]); R(x, y + 1, w, 1, r[3]); if (h > 3) R(x, y + h - 2, w, 1, r[1]); };
  const lens = (x, y, w, h, glint) => { R(x, y, w, h, P.glass[0]); if (w > 2 && h > 2) R(x + 1, y + 1, w - 2, h - 2, P.glass[2]); px(x + (w > 2 ? 1 : 0), y + (h > 2 ? 1 : 0), glint ? P.white : P.glass[3]); };
  const puff = (x, y, t, n = 3, rise = 8) => { for (let k = 0; k < n; k++) { const p = ((t * 0.04 + k / n) % 1); disc(x + Math.sin(p * 6 + k) * 1.5, y - p * rise, 0.8 + p * 1.6, p < 0.5 ? P.steam[2] : P.steam[1]); } };
  // 黄铜炮弹：横放（弹壳 + 铁弹头 + 底火）/ 竖放
  const shellH = (x, y, l = 9) => { R(x, y, l - 3, 3, P.brass[1]); R(x, y, l - 3, 1, P.brass[3]); R(x, y + 2, l - 3, 1, P.brass[0]); R(x + l - 3, y, 2, 3, P.iron[3]); px(x + l - 1, y + 1, P.iron[3]); px(x + l - 3, y, P.iron[4]); px(x, y + 1, P.brass[0]); };
  const shellV = (x, y, l = 9) => { R(x, y + 3, 3, l - 3, P.brass[1]); R(x, y + 3, 1, l - 3, P.brass[3]); R(x + 2, y + 3, 1, l - 3, P.brass[0]); R(x, y + 1, 3, 2, P.iron[3]); px(x + 1, y, P.iron[3]); px(x, y + 1, P.iron[4]); px(x + 1, y + l - 1, P.brass[0]); };
  const gear = (cx, cy, r, n, rot, ramp = BRASS) => { shape((x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot; return d <= r - 1 || (d <= r + 0.6 && Math.cos(a * n) > 0.2); }, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, ramp); disc(cx, cy, Math.max(0.8, r * 0.3), P.iron[0]); };
  function gauge(cx, cy, r, v = 0.6) {
    disc(cx, cy, r, P.brass[0]); disc(cx, cy, r - 1, P.steam[2]);
    const a = Math.PI * (0.75 + 1.5 * v), L = Math.max(1.5, r - 1.5);
    line(Math.round(cx - 0.5), Math.round(cy - 0.5), Math.round(cx - 0.5 + Math.cos(a) * L), Math.round(cy - 0.5 + Math.sin(a) * L), 1, P.dark[0]);
  }
  const plinth = (x, y, x0, x1, top, bot = 24) => { box(x + x0, y + top, x1 - x0, bot - top, IRON); if (x1 - x0 > 8) { rivet(x + x0 + 2, y + top + 2); rivet(x + x1 - 4, y + top + 2); } };
  const saw = (t, per) => ((t % per) + per) % per / per;   // 0～1 锯齿

  // 水：玻璃背景 + 水位（lv 0～1）+ 水面波纹 + 往上冒的气泡
  function water(x0, y0, w, h, lv, t, o = {}) {
    R(x0, y0, w, h, P.glass[0]);
    const top = y0 + h * (1 - lv);
    R(x0, top, w, y0 + h - top, P.water[1]); R(x0, top + 2, w, Math.max(0, y0 + h - top - 2), P.water[1]);
    for (let u = 0; u < w; u++) px(x0 + u, top + (Math.sin(u * 0.8 + t * 0.2) > 0.3 ? 0 : 1), P.water[2]);
    R(x0, top, 1, y0 + h - top, P.water[2]);
    if (o.bubbles !== false) for (let k = 0; k < Math.max(2, w / 6); k++) { const p = saw(t + k * 23, 70), by = y0 + h - 2 - p * (y0 + h - top - 3); if (by > top + 1) px(x0 + 2 + ((k * 7) % Math.max(1, w - 4)), by, P.water[3]); }
  }  // ================= v4（2026-09-29 用户：背景钢板照抄巨炮、炉膛占 60% 以上的红色中心、其他都是被红光衬托的剪影、煤堆变成大山）=================
  // 巨炮的背景钢板墙（sprites.js gPlateWall 原样照抄）：24px 大板 + X 加强肋 + 板边细铆钉，全用暗色，安静
  function plateWall(x0, y0, x1, y1) {
    R(x0, y0, x1 - x0, y1 - y0, P.dark[1]);
    for (let py0 = y0; py0 < y1; py0 += 24) for (let px0 = x0; px0 < x1; px0 += 24) {
      const w = Math.min(24, x1 - px0), h = Math.min(24, y1 - py0), n = Math.min(w, h);
      for (let t = 1; t < n - 1; t++) { px(px0 + t, py0 + t, P.dark[2]); px(px0 + n - 1 - t, py0 + t, P.dark[2]); }
      R(px0, py0, w, 1, P.dark[0]); R(px0, py0, 1, h, P.dark[0]);
      for (let t = 3; t < w; t += 3) px(px0 + t, py0 + 1, P.dark[3]);
      for (let t = 3; t < h; t += 3) px(px0 + 1, py0 + t, P.dark[3]);
    }
  }
  // 剪影：实心黑，朝上的边被身后的火光勾一道红边，两侧一道暗红
  function sil(test, x0, y0, x1, y1, rim = true) {
    const inn = (xx, yy) => test(xx + 0.5, yy + 0.5);
    for (let yy = Math.floor(y0); yy <= Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx <= Math.ceil(x1); xx++) {
      if (!inn(xx, yy)) continue;
      const edge = !inn(xx, yy - 1) || !inn(xx + 1, yy) || !inn(xx - 1, yy);
      px(xx, yy, rim && edge ? (!inn(xx, yy - 1) ? P.fire[1] : P.fire[0]) : P.black);
    }
  }
  const silBar = (ax, ay, bx, by, w) => { const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L; sil((x, y) => { const s = (x - ax) * ux + (y - ay) * uy, d = Math.abs((x - ax) * -uy + (y - ay) * ux); return s >= 0 && s <= L && d <= w / 2; }, Math.min(ax, bx) - w, Math.min(ay, by) - w, Math.max(ax, bx) + w, Math.max(ay, by) + w); };
  // 剪影链条：一串黑链节，销子被火光照出一粒红，随 off 走
  function chainSil(ax, ay, bx, by, off, horiz = true) {
    const n = Math.round(Math.hypot(bx - ax, by - ay)), dx = (bx - ax) / n, dy = (by - ay) / n;
    for (let i = 0; i <= n; i++) {
      const k = ((Math.floor(i + off)) % 4 + 4) % 4, x0 = ax + dx * i, y0 = ay + dy * i;
      if (horiz) { px(x0, y0 - 1, k < 2 ? P.black : P.fire[0]); px(x0, y0, P.black); px(x0, y0 + 1, k === 3 ? P.fire[1] : P.black); }
      else { px(x0 - 1, y0, k < 2 ? P.black : P.fire[0]); px(x0, y0, P.black); px(x0 + 1, y0, k === 3 ? P.fire[1] : P.black); }
    }
  }
  const sprocketSil = (cx, cy, r, n, rot) => sil((x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot; return (d <= r - 1 || (d <= r + 0.7 && Math.cos(a * n) > 0.2)) && !(d < r * 0.35); }, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
  // 煤山：不规则的大山（折线外形），几块大煤面 + 每块一粒亮反光；火在右边，右坡被勾红
  const HILL = [[0, 63], [0, 30], [2, 27], [5, 28], [7, 24], [10, 22], [13, 23], [15, 20], [18, 22], [20, 26], [22, 27], [24, 32], [26, 35], [27, 40], [30, 44], [30, 48], [33, 52], [34, 57], [37, 61], [38, 63]];
  const FACETS = [[6, 31, 7, 1], [15, 27, 7, 0], [11, 40, 8, 0], [21, 38, 6, 2], [4, 50, 7, 0], [17, 50, 8, 1], [27, 51, 6, 2], [9, 58, 6, 0], [24, 59, 7, 0]];
  function coalHill(x, y) {
    // 一座由大煤块垒起来的山：先铺一层阴影底，再从上往下一排排压上大块（越往下越靠前），每排最右一块被火勾红边
    const edgeX = (yy) => { for (let i = 1; i < HILL.length; i++) { const [a0, b0] = HILL[i - 1], [a1, b1] = HILL[i]; if (b1 >= yy && b0 <= yy && b1 > b0) return a0 + (a1 - a0) * (yy - b0) / (b1 - b0); } return 0; };
    const ins = inPoly(HILL.map(([a, b]) => [x + a - 1, y + b + 2]));
    for (let yy = y + 20; yy < y + 64; yy++) for (let xx = x; xx < x + 40; xx++) if (ins(xx + 0.5, yy + 0.5)) px(xx, yy, P.black);
    const hash = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5; return v - Math.floor(v); };
    let n = 0;
    for (let r = 0; r < 6; r++) {
      const cy = 27 + r * 7, right = edgeX(cy) - 3;
      for (let cx = right; cx > -4; cx -= 8.5 + hash(n) * 1.5, n++) {
        const s = 8 + hash(n + 50) * 3, h = s / 2, rim = cx === right, j = (k) => (hash(n * 7 + k) - 0.5) * 2;
        const pts = [[cx - h + j(1), cy + j(2)], [cx - h * 0.4 + j(3), cy - h + j(4)], [cx + h * 0.5 + j(5), cy - h * 0.8], [cx + h + j(6), cy + j(7)], [cx + h * 0.4, cy + h * 0.8 + j(8)], [cx - h * 0.6, cy + h * 0.8]].map(([a, b]) => [x + a, y + b]);
        const inn = inPoly(pts), ok = (xx, yy) => inn(xx + 0.5, yy + 0.5);
        for (let yy = Math.floor(y + cy - h - 2); yy <= y + cy + h + 2; yy++) for (let xx = Math.floor(x + cx - h - 2); xx <= x + cx + h + 2; xx++) {
          if (!ok(xx, yy) || xx < x || yy >= y + 64) continue;
          const out = !ok(xx - 1, yy) || !ok(xx + 1, yy) || !ok(xx, yy - 1) || !ok(xx, yy + 1);
          const tl = !ok(xx - 2, yy) || !ok(xx, yy - 2), br = !ok(xx + 2, yy) || !ok(xx, yy + 2);
          px(xx, yy, out ? (rim && !ok(xx + 1, yy) ? P.fire[1] : P.black) : tl ? P.dark[3] : br ? (rim ? P.fire[0] : P.black) : P.dark[1]);
        }
        if (hash(n + 90) > 0.62 && x + cx - h > x) { const gx = x + cx - h * 0.4, gy = y + cy - h + 2; px(gx, gy, P.white); px(gx + 1, gy, P.iron[4]); px(gx - 1, gy + 1, P.iron[4]); }   // 少数几块沿上沿一道亮反光
      }
    }
  }
  // 铲煤（v5，更自然）：铲子长度固定，双手带着它走——插进煤山、端起来、举过身侧、往前一送把煤抛上链条，然后转身（铲子缩成一小截表示转过来）回到煤山
  const SHOVEL_KF = [[0, 35, 57, 165, 9, 0], [0.16, 34, 58, 170, 9, 1], [0.3, 36, 56, 200, 9, 0], [0.46, 39, 53, 262, 9, -1], [0.58, 42, 51, 318, 9, -1], [0.68, 42, 52, 338, 9, 0], [0.8, 39, 55, 358, 8, 0], [0.86, 37, 56, 358, 2, 0], [0.87, 37, 56, 178, 2, 0], [0.94, 36, 56, 172, 9, 0], [1, 35, 57, 165, 9, 0]];
  function shovelPose4(t) {
    const p = saw(t, 60), ease = (k) => k * k * (3 - 2 * k);
    let i = 1; while (i < SHOVEL_KF.length - 1 && SHOVEL_KF[i][0] < p) i++;
    const A = SHOVEL_KF[i - 1], B = SHOVEL_KF[i], k = ease(Math.min(1, Math.max(0, (p - A[0]) / (B[0] - A[0] || 1)))), m = (j) => A[j] + (B[j] - A[j]) * k;
    const hx = m(1), hy = m(2), ang = m(3) * Math.PI / 180, L = m(4), dx = Math.cos(ang), dy = Math.sin(ang);
    return { p, hand: [hx, hy], dir: [dx, dy], L, tip: [hx + dx * L, hy + dy * L], dy: m(5), loaded: p > 0.16 && p < 0.56 };
  }
  const TOSS_TO = [54, 43];
  const MOUTH = { cx: 40, cy: 34, r: 29, bot: 62 };   // 拱形炉口：x 11～69，y 5～62，约占画面 57%，加上踏板下漏出来的红光超过 60%
  const BOILER4 = [
    { key: 'E4',
      draw(x, y, o) {
        const t = o.t || 0, heat = o.heat, run = t * 0.5, M = MOUTH;
        plateWall(x, y, x + 72, y + 72);
        // 炉口外框：一圈黑铁框 + 黄铜口沿
        sil((xx, yy) => { const dx = xx - (x + M.cx), dy = yy - (y + M.cy), R2 = M.r + 3; return yy <= y + M.bot + 1 && Math.abs(dx) <= R2 && (yy >= y + M.cy || dx * dx + dy * dy <= R2 * R2); }, x + 5, y + 1, x + 72, y + 64, false);
        for (let k = 0; k <= 60; k++) { const a = Math.PI + k / 60 * Math.PI; px(x + M.cx + Math.cos(a) * (M.r + 1.6), y + M.cy + Math.sin(a) * (M.r + 1.6), P.brass[1]); px(x + M.cx + Math.cos(a) * (M.r + 2.5), y + M.cy + Math.sin(a) * (M.r + 2.5), P.brass[0]); }
        R(x + M.cx - M.r - 3, y + M.cy, 2, M.bot - M.cy, P.brass[0]); R(x + M.cx - M.r - 2, y + M.cy, 1, M.bot - M.cy, P.brass[1]); R(x + M.cx + M.r + 1, y + M.cy, 2, M.bot - M.cy, P.brass[1]);
        // 炉口里：满满的火。上面暗红的炉顶，往下橙、黄，底下一床白热的炭
        g.save(); g.beginPath(); g.moveTo(x + M.cx - M.r, y + M.bot); g.lineTo(x + M.cx - M.r, y + M.cy); g.arc(x + M.cx, y + M.cy, M.r, Math.PI, 0); g.lineTo(x + M.cx + M.r, y + M.bot); g.closePath(); g.clip();
        R(x, y, 72, 64, P.fire[0]);
        const W = M.r * 2, x0 = x + M.cx - M.r, bed = y + 56, H = 50;
        for (let u = 0; u < W; u++) {
          const hg = H * (0.55 + 0.35 * heat) * (0.6 + 0.4 * Math.sin(u * 0.9 + t * 0.3) * Math.sin(u * 0.33 - t * 0.17));
          R(x0 + u, bed - hg, 1, hg, P.fire[1]); R(x0 + u, bed - hg * 0.62, 1, hg * 0.62, P.fire[2]); R(x0 + u, bed - hg * 0.28, 1, hg * 0.28, P.fire[3]);
        }
        R(x0, bed, W, 7, P.fire[2]); for (let u = 1; u < W; u += 3) R(x0 + u, bed + 1 + (u % 4), 2, 1, (u % 2) ? P.fire[3] : P.fire[1]);
        for (let k = 0; k < 7; k++) { const p = saw(t + k * 19, 60); px(x0 + 6 + ((k * 13) % (W - 12)) + Math.sin(p * 9 + k) * 2, bed - 8 - p * 38, p < 0.6 ? P.fire[3] : P.fire[2]); }   // 往上飘的火星
        g.restore();
        // 顶上：工字梁 + 黄铜齿轮组（下沿被火照亮）
        R(x, y, 72, 5, P.iron[0]); R(x, y + 1, 72, 3, P.iron[2]); R(x, y + 1, 72, 1, P.iron[3]); R(x, y + 4, 72, 1, P.dark[0]);
        gear(x + 46, y + 10, 6, 12, t * 0.05); gear(x + 35.5, y + 7, 3.8, 8, -t * 0.05 * 6 / 3.8); gear(x + 56.5, y + 8, 4.2, 9, -t * 0.05 * 6 / 4.2);
        for (const [cx, cy, r] of [[46, 10, 6], [35.5, 7, 3.8], [56.5, 8, 4.2]]) for (let k = 0; k < 7; k++) { const a = 0.2 + k * 0.4; px(x + cx + Math.cos(a) * r, y + cy + Math.sin(a) * r, P.fire[2]); }
        // 传动链：从大齿轮一直垂到输送链头部的链轮（剪影）
        chainSil(x + 41, y + 12, x + 41, y + 51, run, false); chainSil(x + 51, y + 12, x + 51, y + 51, -run, false);
        // 长拉环：梁上垂下的长杆 + 拉环（剪影）
        silBar(x + 63, y + 4, x + 63, y + 30, 1.6); sil((xx, yy) => { const d = Math.hypot(xx - (x + 63.5), yy - (y + 33.5)); return d <= 3.3 && d >= 1.7; }, x + 59, y + 29, x + 68, y + 38);
        // 输送链：链轮 + 上行链（载煤进火）+ 下行链 + 托架（剪影）
        sprocketSil(x + 46, y + 52, 5.5, 10, run * 0.2);
        chainSil(x + 46, y + 46.5, x + 69, y + 46.5, -run); chainSil(x + 46, y + 57.5, x + 69, y + 57.5, run);
        for (let k = 0; k < 5; k++) {
          const lx = x + 46 + ((k * 5.2 + run) % 26); if (lx > x + 67) continue;
          const hot = (lx - x - 50) / 14 * (0.6 + heat);
          sil((xx, yy) => xx >= lx && xx < lx + 3.5 && yy >= y + 42.5 && yy < y + 45.5 - (xx - lx > 2.5 ? 1 : 0), lx - 1, y + 41, lx + 5, y + 47, hot < 0.3);
          if (hot > 0.3) { R(lx, y + 43, 3, 2, hot > 0.8 ? P.fire[2] : P.fire[1]); if (hot > 0.8) px(lx + 1, y + 43, P.fire[3]); }
        }
        // 踏板：镂空格栅，孔里透出下面灰坑的红光
        R(x, y + 62, 72, 3, P.black); for (let u = 1; u < 71; u += 3) R(x + u, y + 63, 2, 1, u > 12 && u < 66 ? P.fire[1] : P.fire[0]);
        R(x, y + 62, 72, 1, P.dark[2]);
        // 踏板下：灰坑的红光 + 左下镂空楼梯（剪影）
        R(x, y + 65, 72, 7, P.dark[0]); R(x + 10, y + 66, 58, 5, P.fire[0]); for (let u = 12; u < 66; u += 5) R(x + u, y + 67 + (u % 2), 3, 2, heat > 0.4 ? P.fire[1] : P.fire[0]);
        for (let k = 0; k < 3; k++) { const sx = x + 18 - k * 7, sy = y + 65 + k * 2.5; R(sx, sy, 7, 2, P.black); for (let u = 1; u < 7; u += 2) px(sx + u, sy + 1, P.fire[0]); }
        line(x + 24, y + 64, x + 4, y + 72, 1, P.black);
        // 煤山（最前景）
        coalHill(x, y);
        // 司炉站台：花纹钢板踏面 + 黄铜包边 + 铆接立面 + 两条腿和一道斜撑（颜色、结构都清楚，不是剪影）
        R(x + 31, y + 61, 20, 3, P.iron[0]); R(x + 32, y + 61, 18, 2, P.iron[3]); for (let u = 33; u < 50; u += 3) px(x + u, y + 62, P.iron[4]);
        R(x + 31, y + 60, 20, 1, P.brass[2]); R(x + 31, y + 61, 20, 1, P.brass[1]);
        R(x + 32, y + 64, 18, 3, P.iron[2]); R(x + 32, y + 66, 18, 1, P.iron[0]); for (let u = 34; u < 50; u += 4) px(x + u, y + 65, P.iron[4]);
        for (const u of [33, 47]) { R(x + u, y + 67, 3, 5, P.iron[0]); R(x + u + 1, y + 67, 1, 5, P.iron[3]); }
        line(x + 36, y + 67, x + 46, y + 71, 1, P.iron[1]);
      },
      over(x, y, o, mini) {
        const t = o.t || 0, S = shovelPose4(t), [hx, hy] = S.hand, [dx, dy] = S.dir;
        const cx = x + 38 + (hx - 38) * 0.35, cy = y + 56 + S.dy;
        if (mini) g.drawImage(mini, Math.round(cx - 5), Math.round(cy - 6));
        const H = [x + hx, y + hy], tip = [H[0] + dx * S.L, H[1] + dy * S.L], base = [H[0] + dx * (S.L - 2), H[1] + dy * (S.L - 2)];
        line(H[0] - dx * 3, H[1] - dy * 3, base[0], base[1], 1, P.leather[2]);                 // 木柄
        px(H[0] - dx * 3, H[1] - dy * 3, P.black); px(H[0], H[1], P.black);                   // 两只手
        if (S.L > 4) {                                                                        // 铲头：一片亮钢，横在柄的末端
          const nx = -dy, ny = dx;
          for (const s2 of [-1, 0, 1]) { px(base[0] + nx * s2, base[1] + ny * s2, P.iron[3]); px(tip[0] + nx * s2 * 0.8, tip[1] + ny * s2 * 0.8, P.iron[4]); }
          px(tip[0], tip[1], Math.sin(t * 0.45) > 0.2 ? P.white : P.iron[4]);
          if (S.loaded) { R(tip[0] - 1 - dy, tip[1] - 2, 2, 2, P.black); px(tip[0] - dy, tip[1] - 2, P.white); }
        }
        if (S.p >= 0.56 && S.p < 0.72) {                                                      // 抛出去的一铲煤：沿弧线落到链条上
          const k = (S.p - 0.56) / 0.16, R0 = shovelPose4(0.56 * 60).tip, lx = x + R0[0] + (TOSS_TO[0] - R0[0]) * k, ly = y + R0[1] + (TOSS_TO[1] - R0[1]) * k - Math.sin(k * Math.PI) * 5;
          R(lx, ly, 2, 2, P.black); px(lx + 2, ly + 1, P.black); px(lx, ly, P.white);
        }
      } },
  ];
  const TANKS4 = [
    { key: 'AF4',
      draw(x, y, o) {
        const t = o.t || 0, lv = o.water;
        R(x + 3, y + 3, 66, 60, P.iron[2]);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const bx = x + 3 + i * 22, by = y + 3 + j * 20;
          R(bx, by, 22, 1, P.iron[1]); R(bx, by, 1, 20, P.iron[1]);
          line(bx + 11, by + 4, bx + 17, by + 10, 1, P.iron[3]); line(bx + 17, by + 10, bx + 11, by + 16, 1, P.iron[1]); line(bx + 11, by + 16, bx + 5, by + 10, 1, P.iron[1]); line(bx + 5, by + 10, bx + 11, by + 4, 1, P.iron[3]);
        }
        const edge = (ax, ay, w, h) => { R(ax, ay, w, h, P.iron[0]); R(ax + 1, ay + 1, w - 2, h - 2, P.iron[1]); R(ax + 1, ay + 1, w - 2, 1, P.iron[2]); };
        edge(x + 1, y + 1, 70, 4); edge(x + 1, y + 59, 70, 4); edge(x + 1, y + 1, 4, 62); edge(x + 67, y + 1, 4, 62);
        for (let u = 8; u < 66; u += 6) { px(x + u, y + 3, P.iron[3]); px(x + u, y + 61, P.iron[3]); }
        for (let u = 8; u < 58; u += 6) { px(x + 3, y + u, P.iron[3]); px(x + 69, y + u, P.iron[3]); }
        for (const [cx, cy, sx, sy] of [[5, 5, 1, 1], [67, 5, -1, 1], [5, 59, 1, -1], [67, 59, -1, -1]]) { poly([[x + cx, y + cy], [x + cx + sx * 8, y + cy], [x + cx, y + cy + sy * 8]], IRON); px(x + cx + sx * 2, y + cy + sy * 2, P.iron[3]); }
        // 大舷窗：半径 25（v3 是 16），一圈 20 颗螺栓
        ball(x + 36, y + 32, 25, BRASS); for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; px(x + 36 + Math.cos(a) * 23, y + 32 + Math.sin(a) * 23, P.brass[0]); }
        disc(x + 36, y + 32, 21.2, P.brass[0]);
        g.save(); g.beginPath(); g.arc(x + 36, y + 32, 20.4, 0, TAU); g.clip(); water(x + 15, y + 11, 42, 42, lv, t); g.restore();
        for (const [a, b] of [[24, 19], [25, 18], [26, 17], [23, 21], [29, 16]]) px(x + a, y + b, P.glass[3]);
        R(x + 1, y + 64, 70, 8, P.iron[1]); R(x + 1, y + 64, 70, 1, P.iron[3]);
        const s = Math.sin(t * 0.2) * 3;
        box(x + 50, y + 62, 12, 9, IRONL); R(x + 62, y + 65, 3 + s, 2, P.iron[4]); R(x + 64 + s, y + 63, 2, 6, P.brass[1]);
        gauge(x + 54, y + 60, 2.6, 0.4 + 0.2 * Math.sin(t * 0.2)); htube(x + 44, y + 66, 6, 3, IRONL);
      } },
  ];

  // ---------- 特殊武器（2026-09-29 定稿，样机 tools/archive/special-weapons.html）：鱼叉（链锚抓钩 + 绞缆盘）、蒸汽喷射器（扇形喷汽阀）、
  // 喷火器（翅片喷焰炮，火焰混白汽）、火箭架六档（投矛臂 / 投掷轮 / 板簧连弩 / 气压抛射管 / 火箭助推炸弹 / 管束发射架）。和大锅炉共用上面的小工具 ----------
  // ================= 转动炮组 + 特效小工具 =================
  // 转动：先在离屏按「水平」画好（支点落在 (60,50)），再绕支点转到仰角 a（度，向上为正）贴回来；最近邻，保持像素风（和游戏 sprites.js turn 一样）
  const layer = document.createElement('canvas'); layer.width = 140; layer.height = 100;
  function turn(px0, py0, a, fn) {
    const main = g, lg = layer.getContext('2d'); lg.clearRect(0, 0, 140, 100); g = lg; fn(60, 50); g = main;
    main.save(); main.imageSmoothingEnabled = false; main.translate(Math.round(px0), Math.round(py0)); main.rotate(-(a || 0) * Math.PI / 180); main.drawImage(layer, -60, -50); main.restore();
  }
  // 炮组上 (u, v) 点（沿炮管 u、垂直 v，向下为正）在世界里的位置
  const at = (px0, py0, a, u, v = 0) => { const r = (a || 0) * Math.PI / 180; return [px0 + Math.cos(r) * u + Math.sin(r) * v, py0 - Math.sin(r) * u + Math.cos(r) * v]; };
  const ROPE = [P.leather[0], P.leather[1], P.leather[2]];
  // 下垂的绳子：两点之间一条抛物线，每隔 2 像素一个亮点（麻绳的捻纹）
  function rope(x0, y0, x1, y1, sag = 4) {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) { const k = i / n, xx = x0 + (x1 - x0) * k, yy = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * sag; px(xx, yy, i % 3 ? ROPE[1] : ROPE[2]); }
  }
  // 鱼叉头：叉尖在 X0 + 8，两道倒钩往后翻
  function barbHead(X0, Y) {
    R(X0 - 2, Y - 1, 4, 2, P.iron[3]); R(X0 - 2, Y - 1, 4, 1, P.iron[4]);
    poly([[X0 + 1, Y - 3.5], [X0 + 8.5, Y], [X0 + 1, Y + 3.5]], IRONL);
    line(X0 + 1, Y - 3, X0 - 2, Y - 5, 1, P.iron[3]); line(X0 + 1, Y + 3, X0 - 2, Y + 5, 1, P.iron[2]);
  }
  // 红色警示带（饱和色，材质层不换）
  const warn = (x, y, w, h) => { R(x, y, w, h, P.fire[0]); for (let u = 0; u < w; u += 3) R(x + u, y, 1, h, P.fire[1]); R(x, y, w, 1, P.fire[1]); };
  // 喷口火焰：从 (x,y) 沿角度 a 喷出的锥形火（材质层之后画）
  function flameJet(x, y, a, len, t) {
    const r = a * Math.PI / 180, cx = Math.cos(r), cy = -Math.sin(r);
    for (let i = 0; i < len; i++) {
      const w = 1 + i * 0.28, k = i / len, jit = Math.sin(i * 0.9 + t * 0.7) * (0.6 + k * 1.6);
      for (let s = -w; s <= w; s += 1) {
        const e = Math.abs(s) / w, col = k > 0.85 ? (e < 0.5 ? P.fire[1] : P.fire[0]) : e < 0.35 ? (k < 0.35 ? P.white : P.fire[3]) : e < 0.7 ? P.fire[2] : P.fire[1];
        if (k > 0.7 && ((i * 7 + Math.round(s) * 3 + t) % 5 === 0)) continue;
        px(x + cx * i - cy * (s + jit), y + cy * i + cx * (s + jit), col);
      }
    }
  }
  // 引燃小火苗：2～3 像素，一直在跳
  const pilot = (x, y, t) => { px(x, y, P.fire[t % 3 === 0 ? 3 : 2]); px(x + 1, y - (t % 2), P.fire[2]); if (t % 4 < 2) px(x, y - 1, P.fire[1]); };
  // 喷汽：一串往外扩的白汽团（材质层之后画）；strong = 正在喷
  function steamJet(x, y, a, len, t, strong) {
    const r = a * Math.PI / 180, cx = Math.cos(r), cy = -Math.sin(r), n = strong ? 9 : 2;
    for (let k = 0; k < n; k++) {
      const p = saw(t * (strong ? 2.2 : 0.8) + k * (100 / n), 100), d = p * (strong ? len : 8), rr = 0.8 + p * (strong ? 4.2 : 1.6), wob = Math.sin(k * 2.1 + t * 0.2) * p * 3;
      disc(x + cx * d - cy * wob, y + cy * d + cx * wob - (strong ? 0 : p * 3), rr, p < 0.35 ? P.white : p < 0.75 ? P.steam[2] : P.steam[1]);
    }
  }
  // 车载炮座（2×1）：贴车体的矮底座 + 两片耳轴板（没有三脚架 / 立柱）
  const cradle = (x, y, x0 = 10, w = 18) => { box(x + x0, y + 18, w, 6, IRON); R(x + x0 + 1, y + 18, w - 2, 1, P.iron[3]); for (const u of [3, w - 5]) R(x + x0 + u, y + 10, 3, 8, P.iron[1]); };
  const pin = (x, y) => { disc(x, y, 2.4, P.brass[0]); disc(x, y, 1.5, P.brass[2]); px(x - 1, y - 1, P.brass[3]); };
  const flange = (X, Y, h) => { R(X, Y - h / 2 - 1, 2, h + 2, P.iron[0]); R(X, Y - h / 2 - 1, 1, h + 2, P.iron[4]); };

  const STEAM = [
    { key: 'A', name: '扇形喷汽阀', draw(x, y, o) {
        cradle(x, y, 8, 20); ball(x + 12, y + 17, 4.5, IRONL); R(x + 7, y + 16, 10, 3, P.iron[1]);
        turn(x + 18, y + 13, o.a, (X, Y) => {
          htube(X - 8, Y - 2, 32, 4, BRASS); flange(X + 2, Y, 4); flange(X + 14, Y, 4);
          poly([[X + 23, Y - 2], [X + 30, Y - 5], [X + 31, Y - 5], [X + 31, Y + 5], [X + 30, Y + 5], [X + 23, Y + 2]], BRASS); R(X + 30, Y - 5, 1, 10, P.dark[0]);
          R(X - 3, Y - 7, 1, 5, P.iron[2]); gear(X - 2.5, Y - 8, 3.5, 6, o.on ? o.t * 0.3 : 0.2);
        });
        pin(x + 18, y + 13); gauge(x + 5, y + 19, 2.6, o.on ? 0.3 : 0.75);
      },
      fx(x, y, o) { const [mx, my] = at(x + 18, y + 13, o.a, 31, 0); steamJet(mx, my, o.a, 30, o.t, o.on); if (o.on) { const [m2, n2] = at(x + 18, y + 13, o.a, 31, -3); steamJet(m2, n2, o.a + 10, 24, o.t + 30, true); const [m3, n3] = at(x + 18, y + 13, o.a, 31, 3); steamJet(m3, n3, o.a - 10, 24, o.t + 60, true); } } },
  ];
  const bed2 = (x, y) => { box(x + 10, y + 38, 28, 10, IRON); R(x + 11, y + 38, 26, 1, P.iron[3]); for (const u of [15, 29]) R(x + u, y + 24, 4, 14, P.iron[1]); };
  const ROCKET = [
    { key: 'A', name: '管束发射架', draw(x, y, o) {
        bed2(x, y);
        turn(x + 24, y + 28, o.a, (X, Y) => {
          for (let i = 0; i < 4; i++) { const v = -10.5 + i * 5.5; htube(X - 16, Y + v - 2.5, 42, 5, IRONL); R(X + 25, Y + v - 3, 2, 6, P.iron[0]); R(X + 25, Y + v - 1.5, 2, 3, P.dark[0]); if (i < o.n) { R(X + 27, Y + v - 1.5, 3, 3, P.fire[0]); R(X + 30, Y + v - 0.5, 2, 1, P.fire[1]); px(X + 27, Y + v - 1.5, P.fire[1]); } }
          for (const u of [-8, 12]) { R(X + u, Y - 14, 3, 24, P.brass[0]); R(X + u, Y - 14, 1, 24, P.brass[3]); R(X + u + 1, Y - 14, 1, 24, P.brass[2]); }
        });
        pin(x + 24, y + 28);
      } },
  ];
  function flameJet2(x, y, a, len, t) {
    const r = a * Math.PI / 180, cx = Math.cos(r), cy = -Math.sin(r), L = len * 0.72;
    const put = (u, v, c) => px(x + cx * u - cy * v, y + cy * u + cx * v, c);
    for (let i = 0; i < L; i++) {
      const k = i / L, w = 1 + i * 0.24 * (1 - k * 0.35), jit = Math.sin(i * 0.55 + t * 0.6) * k * 1.4;
      for (let s = -w; s <= w; s += 0.5) {
        const e = Math.abs(s) / w;
        put(i, s + jit, e < 0.3 ? (k < 0.3 ? P.white : P.fire[3]) : e < 0.65 ? (k < 0.75 ? P.fire[3] : P.fire[2]) : e < 0.9 ? P.fire[2] : P.fire[1]);
      }
    }
    for (let q = 0; q < 7; q++) {                                                   // 火舌尖化成汽团：越远越大、越白
      const p = saw(t * 2 + q * 14, 100), u = L * 0.8 + p * len * 0.55, v = Math.sin(q * 2.3 + t * 0.15) * (2 + p * 4), rr = 1.6 + p * 3.6;
      const c = p < 0.2 ? P.fire[3] : p < 0.55 ? P.white : P.steam[2];
      disc(x + cx * u - cy * v, y + cy * u + cx * v, rr, c);
    }
    for (const sd of [-1, 1]) { const p = saw(t * 3 + (sd > 0 ? 50 : 0), 100); disc(x + cx * (2 + p * 8) - cy * sd * (3 + p * 3), y + cy * (2 + p * 8) + cx * sd * (3 + p * 3), 1 + p * 1.6, p < 0.5 ? P.white : P.steam[2]); }   // 喷口两侧的白汽领子
  }
  const FLAME2 = [
    { key: 'F2', name: '翅片喷焰炮', draw(x, y, o) {
        box(x + 4, y + 16, 26, 8, IRONL); for (let u = 0; u < 24; u += 4) line(x + 5 + u, y + 23, x + 8 + u, y + 17, 2, P.fire[0]);
        turn(x + 18, y + 13, o.a, (X, Y) => {
          htube(X - 8, Y - 4, 34, 8, IRONL);
          for (let u = 2; u < 18; u += 2) { R(X + u, Y - 9, 1, 18, P.iron[u % 4 ? 1 : 3]); px(X + u, Y - 9, P.iron[4]); }
          poly([[X + 25, Y - 4], [X + 30, Y - 2.5], [X + 30, Y + 2.5], [X + 25, Y + 4]], IRONL); R(X + 29, Y - 1, 2, 2, P.dark[0]);
        });
      },
      fx(x, y, o) { const [mx, my] = at(x + 18, y + 13, o.a, 30, 0); o.on ? flameJet2(mx, my, o.a, 46, o.t) : pilot(Math.round(mx), Math.round(my) - 1, o.t); } },
  ];

  // 鱼叉 v2：链锚抓钩 + 身后占满高度的绞缆盘（正面看的大圆盘，一圈圈缠着的缆绳）
  const HARPOON2 = [
    { key: 'E2', name: '链锚抓钩 + 绞缆盘', draw(x, y, o) {
        const cx = x + 13, cy = y + 12, spin = (o.out ? 1 : -0.3) * o.t * 0.12;
        cableDrum(cx, cy, spin);
        cradle(x, y, 12, 16);
        turn(x + 18, y + 13, o.a, (X, Y) => {
          const d = o.k * 5; htube(X - 7 - d, Y - 4, 28, 8, IRONL); R(X + 18 - d, Y - 5, 3, 10, P.iron[0]); R(X + 19 - d, Y - 4, 1, 8, P.iron[4]); R(X - 3 - d, Y - 4, 2, 8, P.brass[1]);
          if (!o.out) { R(X + 21 - d, Y - 1, 6, 2, P.iron[3]); disc(X + 27 - d, Y, 1.5, P.iron[4]); for (const s of [-1, -0.35, 0.35, 1]) { line(X + 27 - d, Y, X + 32 - d, Y + s * 5, 1, P.iron[3]); line(X + 32 - d, Y + s * 5, X + 30 - d, Y + s * 6.5, 1, P.iron[4]); } }
        });
        pin(x + 18, y + 13);
        // 缆绳：从绞盘顶上出来，拴到炮口的一小段铁链（射出时绷直伸出去）
        const [rx, ry] = at(x + 18, y + 13, o.a, 21, -1);
        // 模块精灵只画绞盘到炮口，炮口到对手的长缆绳由战斗画面按实时目标点绘制。
        if (o.out) { line(cx, cy - 10.5, rx, ry, 1, ROPE[1]); const [ex, ey] = at(x + 18, y + 13, o.a, 34, 0); const n = Math.round(Math.hypot(ex - rx, ey - ry) / 2); for (let i = 0; i <= n; i++) { const k = i / n; px(rx + (ex - rx) * k, ry + (ey - ry) * k, i < 6 ? (i % 2 ? P.iron[4] : P.iron[1]) : ROPE[i % 3 ? 1 : 2]); } }
        else rope(cx + 2, cy - 10.5, rx, ry, 2);
      } },
  ];

  // 火箭架 v2：投石机 / 投矛器。每个投射点一枚短炸弹（圆胖弹体 + 红箍 + 一截引信）。
  // o.n：架上几枚（装填 / 打空时用）；o.s：一轮投掷的进度 0～1（0 = 没在投）
  const bomb = (cx, cy) => {
    disc(cx, cy, 2.6, P.iron[0]); disc(cx, cy, 1.8, P.iron[2]); px(cx - 1, cy - 1, P.iron[4]);
    R(cx - 2, cy, 5, 1, P.fire[0]); px(cx - 1, cy, P.fire[1]);
    R(cx, cy - 4, 1, 2, P.brass[1]); px(cx + 1, cy - 5, P.fire[3]);
  };
  const cup = (cx, cy) => { R(cx - 3, cy + 2, 7, 2, P.iron[0]); R(cx - 3, cy + 2, 7, 1, P.iron[3]); px(cx - 3, cy + 1, P.iron[2]); px(cx + 3, cy + 1, P.iron[2]); };
  const beam = (x0, y0, x1, y1, w = 3) => { line(x0, y0, x1, y1, w, P.iron[0]); line(x0, y0, x1, y1, Math.max(1, w - 2), P.iron[3]); };
  const easeOut = (k) => 1 - (1 - k) ** 3;
  // 单臂整体甩一次（B、D）：0～0.35 甩出去，0.35～0.6 停在前面，0.6～1 空臂收回来
  const swingOf = (s) => (s <= 0 ? 0 : s < 0.35 ? easeOut(s / 0.35) : s < 0.6 ? 1 : 1 - (s - 0.6) / 0.4);
  const CATA = [
    { key: 'G', name: '四杓投掷轮', draw(x, y, o) {
        const H = [x + 22, y + 26], firing = o.s > 0, per = firing ? o.s * 4 : 0, shot = Math.floor(per), sw = firing ? easeOut(per - shot) : 0;
        beam(x + 10, y + 42, H[0], H[1], 4); beam(x + 34, y + 42, H[0], H[1], 4); box(x + 6, y + 40, 34, 8, IRON);
        const base = -Math.PI * 0.75 + (shot + sw) * Math.PI / 2;
        for (let k = 0; k < 4; k++) {
          const a = base - k * Math.PI / 2, ex = H[0] + Math.cos(a) * 17, ey = H[1] + Math.sin(a) * 17;
          beam(H[0], H[1], ex, ey, 3);
          const loaded = firing ? (k > shot || (k === shot && sw < 0.8)) : k < o.n;
          const ux = Math.cos(a), uy = Math.sin(a);
          R(ex - 2 - uy * 0, ey - 2, 5, 5, P.iron[0]); R(ex - 1, ey - 1, 3, 3, P.iron[2]);
          if (loaded) bomb(ex - uy * 3.5 * -1 + ux * 0, ey - 3.5);
        }
        disc(H[0], H[1], 9, P.brass[0]); disc(H[0], H[1], 8, P.brass[1]); disc(H[0], H[1], 6, P.brass[0]); for (let k = 0; k < 8; k++) { const a = base + k * Math.PI / 4; line(H[0], H[1], H[0] + Math.cos(a) * 6, H[1] + Math.sin(a) * 6, 1, P.brass[2]); }
        disc(H[0], H[1], 2.2, P.iron[0]); px(H[0] - 1, H[1] - 1, P.brass[3]);
      } },
    { key: 'H', name: '投矛臂', draw(x, y, o) {
        box(x + 4, y + 40, 40, 8, IRON); R(x + 22, y + 33, 6, 8, P.iron[1]); R(x + 22, y + 33, 6, 1, P.iron[3]);
        const Pv = [x + 25, y + 36], sw = swingOf(o.s), a = (-172 + sw * 112) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
        const Cyl = [x + 40, y + 42], Arm8 = [Pv[0] + ux * 9, Pv[1] + uy * 9];
        line(Cyl[0], Cyl[1], Arm8[0], Arm8[1], 5, P.iron[0]); line(Cyl[0], Cyl[1], Arm8[0], Arm8[1], 3, P.iron[3]);
        line(Cyl[0], Cyl[1], Cyl[0] + (Arm8[0] - Cyl[0]) * 0.45, Cyl[1] + (Arm8[1] - Cyl[1]) * 0.45, 5, P.brass[1]);
        beam(Pv[0], Pv[1], Pv[0] + ux * 27, Pv[1] + uy * 27, 4); R(Pv[0] + ux * 27 - 1, Pv[1] + uy * 27 - 2, 3, 3, P.brass[2]);
        for (let k = 0; k < 4; k++) {
          const d = 26 - k * 5.5, bx = Pv[0] + ux * d, by = Pv[1] + uy * d, nx = uy, ny = -ux;   // 托架在臂的上沿
          const tx = bx + nx * -3, ty = by + ny * -3;
          line(bx, by, tx, ty, 1, P.iron[3]);
          const gone = o.s > 0 ? o.s > 0.22 + k * 0.035 : k >= o.n;
          if (!gone) bomb(tx, ty - 1);
        }
        pin(Pv[0], Pv[1]);
      } },
    { key: 'I', name: '四联投石机', draw(x, y, o) {
        R(x + 2, y + 15, 44, 3, P.iron[0]); R(x + 2, y + 15, 44, 1, P.iron[3]); R(x + 4, y + 13, 40, 2, P.leather[1]);
        for (const u of [3, 43]) R(x + u, y + 15, 2, 28, P.iron[1]);
        box(x + 2, y + 42, 44, 6, IRON);
        for (let k = 3; k >= 0; k--) {
          const Pv = [x + 12 + k * 9, y + 41 - k * 4], firing = o.s > 0, p = firing ? Math.max(0, Math.min(1, o.s * 4.5 - k)) : 0;
          const up = firing ? easeOut(p) : k < o.n ? 0 : 1, a = (-168 + up * 88) * Math.PI / 180, ex = Pv[0] + Math.cos(a) * 15, ey = Pv[1] + Math.sin(a) * 15;
          R(Pv[0] - 4, Pv[1] - 1, 8, 4 + k * 4, P.iron[1]); R(Pv[0] - 4, Pv[1] - 1, 8, 1, P.iron[3]);
          beam(Pv[0], Pv[1], ex, ey, 3);
          R(ex - 2, ey - 2, 4, 3, P.iron[0]);
          if (firing ? p < 0.75 : k < o.n) bomb(ex, ey - 4);
          disc(Pv[0], Pv[1], 2.6, ROPE[0]); disc(Pv[0], Pv[1], 1.8, ROPE[1]); px(Pv[0], Pv[1] - 1, ROPE[2]);
        }
      } },
    { key: 'J', name: '配重投石机', draw(x, y, o) {
        const Ax = [x + 24, y + 17], sw = swingOf(o.s), a = (150 - sw * 208) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
        beam(x + 11, y + 43, Ax[0], Ax[1], 4); beam(x + 37, y + 43, Ax[0], Ax[1], 4); beam(x + 15, y + 34, x + 33, y + 34, 2); box(x + 6, y + 42, 36, 6, IRON);
        const S = [Ax[0] - ux * 8, Ax[1] - uy * 8];
        line(S[0], S[1], S[0], S[1] + 4, 1, P.iron[3]); box(S[0] - 4, S[1] + 4, 9, 8, IRONL); px(S[0] - 2, S[1] + 6, P.iron[4]); px(S[0] + 2, S[1] + 6, P.iron[4]);
        const E = [Ax[0] + ux * 19, Ax[1] + uy * 19];
        beam(S[0], S[1], E[0], E[1], 4);
        for (let k = 0; k < 4; k++) {
          const b = a + (k - 1.5) * 0.5, tx = E[0] + Math.cos(b) * 5, ty = E[1] + Math.sin(b) * 5;
          line(E[0], E[1], tx, ty, 1, P.iron[3]);
          const gone = o.s > 0 ? o.s > 0.24 + k * 0.03 : k >= o.n;
          if (!gone) bomb(tx + Math.cos(b) * 2, ty + Math.sin(b) * 2);
        }
        pin(Ax[0], Ax[1]);
      } },
  ];
  // 投掷时的小烟尘：从脱手点往外飘两团汽（材质层之后）
  function cataFx(x, y, o) { if (o.s > 0.15 && o.s < 0.5) { const p = (o.s - 0.15) / 0.35; disc(x + 40 + p * 8, y + 8 - p * 6, 1 + p * 2.5, p < 0.5 ? P.white : P.steam[2]); disc(x + 32 + p * 10, y + 4 - p * 4, 0.8 + p * 2, P.steam[2]); } }

  function cableDrum(cx, cy, spin) {
    disc(cx, cy, 12, P.brass[0]); disc(cx, cy, 11, P.brass[1]); for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; px(cx + Math.cos(a) * 11.4, cy + Math.sin(a) * 11.4, P.brass[3]); }
    for (let yy = Math.floor(cy - 10); yy <= cy + 10; yy++) for (let xx = Math.floor(cx - 10); xx <= cx + 10; xx++) {
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > 9.9) continue;
      if (d < 3.2) continue;
      const f = (d - 3.4) / 2.1, ring = Math.floor(f), fr = f - ring;
      if (ring > 2 || fr > 0.72 || f < 0) { px(xx, yy, P.black); continue; }
      const a = Math.atan2(dy, dx), lit = Math.cos(a + Math.PI * 0.75);                                     // 左上 = 1，右下 = -1
      const ph = ((a - spin) / TAU * 8 % 1 + 1) % 1, tw = ring === 2 && ph < 0.12;   // 捻纹：只在最外圈，一圈 8 道短痕（看得出绞盘在转）
      px(xx, yy, tw ? ROPE[0] : lit > 0.35 ? ROPE[2] : lit < -0.4 ? ROPE[0] : ROPE[1]);
    }
    disc(cx, cy, 3, P.brass[0]); disc(cx, cy, 2.2, P.brass[2]); for (let k = 0; k < 4; k++) { const a = spin + k * TAU / 4; px(cx + Math.cos(a) * 2.2, cy + Math.sin(a) * 2.2, P.brass[0]); }
    px(cx - 1, cy - 1, P.brass[3]); px(cx, cy, P.iron[0]);
  }

  // ---------- 火箭架六档：从「扔」到「射」 ----------
  // 状态统一：o.n 架上几枚（装填 / 空）；o.s 一轮开火进度 0～1；o.a 仰角（会转的发射管用）
  const lobA = (o) => Math.max(18, o.a || 0);   // 火箭是抛射的：发射管最低也抬 18°
  const shotsOf = (o) => { if (!(o.s > 0)) return { n: o.n, fire: false, p: 0 }; const sh = o.s * 5 + 0.8, f = Math.min(4, Math.floor(sh)), p = sh >= 5 ? 1 : sh - f; return { n: 4 - f, fire: f >= 1 && p < 0.6, p }; };
  // 飞出去的一枚炸弹（材质层之后画）：从 (x0,y0) 沿角度 ang 飞 d 像素，身后拖两团小烟
  function flyBomb(x0, y0, ang, d) {
    const r = ang * Math.PI / 180, cx = Math.cos(r), cy = -Math.sin(r);
    for (const k of [0.45, 0.2]) disc(x0 + cx * d * k, y0 + cy * d * k, 0.8 + (1 - k) * 1.2, k > 0.3 ? P.steam[2] : P.steam[1]);
    const bx = x0 + cx * d, by = y0 + cy * d; disc(bx, by, 2.6, P.dark[0]); disc(bx, by, 1.8, P.dark[2]); px(bx - 1, by - 1, P.steam[2]); R(bx - 2, by, 5, 1, P.fire[0]); px(bx - cx * 3, by - cy * 3 - 1, P.fire[3]);
  }
  const tubeFx = (dx, dy) => (x, y, o) => { const S = shotsOf(o); if (!S.fire) return; const [bx, by] = at(x + 24, y + 28, o.a, dx, dy); steamJet(bx, by, o.a + 180, 14, o.t, true); };
  const coil = (x0, y0, x1, y1, turns, rr) => {   // 画一根螺旋弹簧：沿 a→b 一圈圈的斜线
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux, N = turns * 8;
    for (let i = 0; i < N; i++) { const k0 = i / N, k1 = (i + 1) / N, s0 = Math.sin(k0 * turns * TAU), s1 = Math.sin(k1 * turns * TAU); line(x0 + ux * L * k0 + nx * rr * s0, y0 + uy * L * k0 + ny * rr * s0, x0 + ux * L * k1 + nx * rr * s1, y0 + uy * L * k1 + ny * rr * s1, 1, Math.cos(k0 * turns * TAU) > 0 ? P.iron[4] : P.iron[1]); }
  };
  const ROCKET6 = [
    { key: 'T1', tier: 1, name: '投矛臂', draw: (x, y, o) => CATA[1].draw(x, y, o), fx: cataFx },
    { key: 'T2', tier: 2, name: '四杓投掷轮', draw: (x, y, o) => CATA[0].draw(x, y, o), fx: cataFx },
    { key: 'T3b', tier: 3, name: '板簧连弩', draw(x, y, o) {
        const S = shotsOf(o);
        box(x + 4, y + 40, 40, 8, IRON);
        for (let i = 0; i < 22; i++) { R(x + 2 + i, y + 18 + i, 3, 1, P.iron[0]); px(x + 3 + i, y + 18 + i, P.iron[3]); }        // 45° 脊梁：四条发射槽的根都钉在上面
        R(x + 2, y + 18, 3, 23, P.iron[0]); R(x + 3, y + 18, 1, 23, P.iron[3]);                                                 // 后立柱
        for (let k = 0; k < 4; k++) {
          const sx = x + 4 + k * 6, sy = y + 20 + k * 6, loaded = k < S.n, bend = loaded ? 2 : 0;
          for (let i = 0; i < 19; i++) { R(sx + i, sy - i, 2, 1, P.iron[1]); px(sx + i + 2, sy - i, P.iron[0]); px(sx + i + 1, sy - i - 1, P.iron[4]); }         // 发射槽（朝右上 45°）
          const cx = sx + 16, cy = sy - 16;
          for (let i = -3; i <= 3; i++) { const b = Math.round(i * i / 9 * bend); R(cx + i - b, cy + i + b, 2, 1, P.iron[4]); px(cx + i - b + 2, cy + i + b, P.iron[1]); }   // 板簧弓（垂直于槽）
          R(cx - 1, cy - 1, 3, 3, P.brass[1]); px(cx - 1, cy - 1, P.brass[3]);
          const d = loaded ? 7 : 1, nx = cx - d, ny = cy + d;
          line(cx - 3 - bend, cy - 3 + bend, nx, ny, 1, P.white); line(cx + 3 - bend, cy + 3 + bend, nx, ny, 1, P.white);
          if (loaded) bomb(nx + 2, ny - 4);
        }
      },
      fx(x, y, o) { const S = shotsOf(o); if (!(o.s > 0) || S.n >= 4 || S.p >= 1 || o.game) return; const k = S.n, cx = x + 4 + k * 6 + 16, cy = y + 20 + k * 6 - 16; if (S.p < 0.9) flyBomb(cx - 5, cy + 1, 45, 6 + S.p * 30); } },
    { key: 'T4a', tier: 4, name: '气压抛射管', draw(x, y, o) {
        box(x + 4, y + 40, 40, 8, IRON); const S = shotsOf(o), tilt = (50 + (o.a || 0) * 0.4) * Math.PI / 180;
        htube(x + 6, y + 36, 36, 4, IRONL); gauge(x + 40, y + 33, 3, S.fire ? 0.3 : 0.8);
        for (let k = 0; k < 4; k++) {
          const bx = x + 10 + k * 8, by = y + 37, L = 16 + (k % 2) * 5, ex = bx + Math.cos(tilt) * L, ey = by - Math.sin(tilt) * L;
          line(bx, by, ex, ey, 6, P.iron[0]); line(bx, by, ex, ey, 4, P.iron[2]); line(bx - 1, by - 1, ex - 1, ey - 1, 1, P.iron[4]);
          line(ex - 1, ey + 1, ex + 2, ey - 2, 2, P.iron[0]);
          if (k < S.n) bomb(ex, ey - 2);
        }
      },
      fx(x, y, o) {   // 刚打空的是第 n 根：白汽和飞出去的炸弹都从这一根的管口出来
        const S = shotsOf(o); if (!(o.s > 0) || S.n >= 4 || S.p >= 1) return;
        const k = S.n, tilt = 50 + (o.a || 0) * 0.4, L = 16 + (k % 2) * 5, r = tilt * Math.PI / 180, mx = x + 10 + k * 8 + Math.cos(r) * L, my = y + 37 - Math.sin(r) * L;
        if (S.fire) steamJet(mx, my, tilt, 12, o.t, true);
        if (S.p < 0.9 && !o.game) flyBomb(mx, my - 2, tilt, 4 + S.p * 30);
      } },
    { key: 'T5a', tier: 5, name: '火箭助推炸弹', draw(x, y, o) {
        box(x + 8, y + 40, 32, 8, IRON); const S = shotsOf(o);
        turn(x + 24, y + 28, lobA(o), (X, Y) => {
          R(X - 18, Y - 14, 3, 26, P.iron[0]); R(X - 18, Y - 14, 1, 26, P.iron[3]); R(X + 14, Y - 14, 3, 26, P.iron[0]);
          for (let k = 0; k < 4; k++) {
            const v = -11 + k * 6.5; R(X - 18, Y + v + 3, 36, 1, P.iron[2]);
            if (k < S.n) { R(X - 16, Y + v + 1, 18, 1, P.leather[2]); R(X + 2, Y + v - 1, 10, 3, P.iron[3]); R(X + 2, Y + v - 1, 10, 1, P.iron[4]); R(X + 5, Y + v - 1, 1, 3, P.brass[1]); bomb(X + 15, Y + v); }
          }
        });
        pin(x + 24, y + 28);
      },
      fx(x, y, o) {   // 刚打出去的是第 n 层：整枚火箭炸弹沿导轨冲出去，尾部喷火
        const S = shotsOf(o); if (!(o.s > 0) || S.n >= 4 || S.p >= 1) return;
        const A = lobA(o), v = -11 + S.n * 6.5, d = o.game ? 0 : S.p * 34, [tx, ty] = at(x + 24, y + 28, A, 2 + d, v), [hx, hy] = at(x + 24, y + 28, A, 12 + d, v), [bx, by] = at(x + 24, y + 28, A, 15 + d, v);
        if (o.game) { if (S.fire) flameJet2(tx, ty, A + 180, 10, o.t); return; }
        flameJet2(tx, ty, o.a + 180, 10, o.t); line(tx, ty, hx, hy, 3, P.dark[2]); line(tx, ty - 1, hx, hy - 1, 1, P.steam[1]);
        disc(bx, by, 2.6, P.dark[0]); disc(bx, by, 1.8, P.dark[2]); R(bx - 2, by, 5, 1, P.fire[0]);
      } },
    { key: 'T6', tier: 6, name: '管束发射架', draw(x, y, o) { const S = shotsOf(o); ROCKET[0].draw(x, y, { ...o, a: lobA(o), n: S.n }); },
      fx(x, y, o) {   // 刚打空的是第 n 根管：管尾喷烟，火箭拖着火从这根管口飞出去
        const S = shotsOf(o); if (!(o.s > 0) || S.n >= 4 || S.p >= 1) return;
        const A = lobA(o), v = -10.5 + S.n * 5.5, [rx, ry] = at(x + 24, y + 28, A, -17, v);
        if (S.fire) steamJet(rx, ry, A + 180, 14, o.t, true);
        if (o.game) return;
        const d = S.p * 36, [tx, ty] = at(x + 24, y + 28, A, 26 + d, v), [hx, hy] = at(x + 24, y + 28, A, 34 + d, v);
        flameJet2(tx, ty, o.a + 180, 9, o.t); line(tx, ty, hx, hy, 2, P.dark[2]); px(hx, hy, P.fire[1]);
      } },
  ];

  // ---------- 辅助四件（2026-09-29 定稿，样机 tools/archive/aux-modules.html）：蓄压罐 C 储气球 + 液柱表、测距仪 F 六分仪、陀螺仪 A 万向环、散热片 B 翅片管排 ----------
  const bottle = (x, y, w, h, r = IRONL) => {   // 竖放的铆接气瓶：上下圆顶 + 竖缝铆钉
    vtube(x, y + w / 2, w, h - w, r);
    shape((xx, yy) => ((xx - x - w / 2) / (w / 2)) ** 2 + ((yy - y - w / 2) / (w / 2)) ** 2 <= 1 && yy <= y + w / 2 + 0.5, x, y, x + w, y + w / 2 + 1, r);
    shape((xx, yy) => ((xx - x - w / 2) / (w / 2)) ** 2 + ((yy - y - h + w / 2) / (w / 2)) ** 2 <= 1 && yy >= y + h - w / 2 - 0.5, x, y + h - w / 2 - 1, x + w, y + h, r);
  };
  const band = (x, y, w, h = 2) => { R(x, y, w, h, P.brass[1]); R(x, y, w, 1, P.brass[3]); if (h > 2) R(x, y + h - 1, w, 1, P.brass[0]); };
  const glint = (x, y, t, per = 60) => { const p = saw(t, per); if (p < 0.12) { px(x, y, P.white); px(x + 1, y - 1, P.glass[3]); } };
  const ellRing = (cx, cy, rx, ry, c, c2) => { const n = Math.ceil(Math.max(rx, ry) * 7) + 4; for (let i = 0; i < n; i++) { const a = i / n * TAU; px(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, c2 && Math.sin(a) > 0 ? c2 : c); } };
  const cyanPipe = (x, y, w, t) => { R(x, y, w, 4, P.water[0]); R(x, y + 1, w, 2, P.water[1]); R(x, y + 1, w, 1, P.water[2]); for (let u = 0; u < w; u++) if (saw(t * 0.6 + u * 4, 60) < 0.08) px(x + u, y + 1, P.water[3]); };   // 冷却液集管：只有这里用青色，亮点在流
  const bracket = (x, y) => { R(x, y, 5, 5, P.iron[0]); R(x + 1, y + 1, 3, 3, P.iron[2]); px(x + 1, y + 1, P.iron[4]); px(x + 3, y + 3, P.iron[1]); };

  const AUX = {
    pressure_tank: { key: 'C', name: '储气球 + 液柱表', draw(x, y, o) {
        R(x + 3, y + 44, 18, 4, P.iron[0]); R(x + 4, y + 44, 16, 1, P.iron[3]);
        vtube(x + 7, y + 20, 10, 25, IRONL); R(x + 9, y + 23, 6, 19, P.dark[0]); const h = Math.round(17 * o.lv); R(x + 10, y + 41 - h, 4, h, P.gauge[1]); R(x + 10, y + 41 - h, 4, 1, P.gauge[3]); R(x + 10, y + 41 - h, 1, h, P.gauge[2]);
        for (let v = 24; v <= 40; v += 4) px(x + 15, y + v, P.brass[2]);
        ball(x + 12, y + 12, 10, IRONL); R(x + 2, y + 12, 20, 2, P.brass[1]); R(x + 2, y + 12, 20, 1, P.brass[3]); px(x + 8, y + 6, P.iron[4]); px(x + 9, y + 5, P.iron[4]);
        R(x + 17, y + 38, 5, 3, P.brass[1]); R(x + 20, y + 35, 2, 3, P.brass[2]);
      },
      fx(x, y, o) { if (o.lv > 0.92) puff(x + 21, y + 34, o.t, 2, 5); } },
    rangefinder: { key: 'F', name: '六分仪', draw(x, y, o) {
        box(x + 3, y + 19, 18, 5, IRON);
        const A0 = Math.PI * 0.32, A1 = Math.PI * 0.68, C = [x + 12, y + 3], r = 15;
        for (const a of [A0, A1]) line(C[0], C[1], C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r, 2, P.brass[1]);
        for (let k = 0; k <= 24; k++) { const a = A0 + (A1 - A0) * k / 24; px(C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r, P.brass[2]); px(C[0] + Math.cos(a) * (r - 1), C[1] + Math.sin(a) * (r - 1), P.brass[0]); if (k % 4 === 0) px(C[0] + Math.cos(a) * (r - 2), C[1] + Math.sin(a) * (r - 2), P.dark[0]); }
        const ai = A0 + (A1 - A0) * (0.5 + 0.4 * Math.sin(o.t * 0.04)); line(C[0], C[1], C[0] + Math.cos(ai) * (r + 1), C[1] + Math.sin(ai) * (r + 1), 1, P.iron[4]);
        R(x + 12, y + 18, 2, 2, P.iron[1]);
        htube(x + 4, y + 1, 15, 3, IRONL); R(x + 18, y + 1, 2, 3, P.glass[1]); R(x + 11, y + 3, 3, 3, P.glass[2]); disc(C[0], C[1] + 1, 1.2, P.brass[3]);
      },
      fx(x, y, o) { glint(x + 12, y + 4, o.t, 50); } },
    gyroscope: { key: 'A', name: '万向环', draw(x, y, o) {
        box(x + 3, y + 19, 18, 5, IRON);
        for (const u of [2, 20]) { R(x + u, y + 9, 2, 11, P.iron[0]); R(x + u, y + 9, 1, 11, P.iron[3]); }
        ellRing(x + 12, y + 11, 8.5, 8.5, P.brass[1], P.brass[0]); ellRing(x + 12, y + 11, 7.8, 7.8, P.brass[2]);
        const w = Math.abs(Math.cos(o.t * 0.08)) * 6 + 0.6; ellRing(x + 12, y + 11, w, 6, P.brass[3], P.brass[0]);
        disc(x + 12, y + 11, 2.6, P.iron[2]); const s = o.t * 0.4; line(x + 12 - Math.cos(s) * 2.4, y + 11 - Math.sin(s) * 2.4, x + 12 + Math.cos(s) * 2.4, y + 11 + Math.sin(s) * 2.4, 1, P.iron[4]);
        R(x + 3, y + 10, 2, 2, P.brass[2]); R(x + 19, y + 10, 2, 2, P.brass[2]);
      } },
    radiator: { key: 'B', name: '翅片管排', draw(x, y, o) {
        bracket(x, y + 8); bracket(x, y + 36); R(x + 4, y + 6, 2, 36, P.iron[0]); R(x + 5, y + 6, 1, 36, P.iron[3]);
        cyanPipe(x + 5, y + 3, 19, o.t * (1 + o.heat * 2)); cyanPipe(x + 5, y + 41, 19, o.t * (1 + o.heat * 2) + 30);
        for (const u of [8, 14, 20]) { R(x + u, y + 7, 2, 34, P.iron[2]); R(x + u, y + 7, 1, 34, P.iron[4]); for (let v = 9; v < 40; v += 2) { R(x + u - 2, y + v, 6, 1, P.iron[3]); px(x + u + 3, y + v, P.iron[1]); } }
      } },
  };

  // ---------- Boss 唯一件（2026-09-29 定稿，样机 tools/archive/boss-uniques.html）：圣堂压力核心 E 圣杯炉、寡妇液压撞头 C 三联活塞锤（锻工锤头）、公爵测距棱镜 F 旋转棱镜鼓 ----------
  const RUSTR = [P.rust[0], P.rust[1], P.rust[2], P.rust[3]];
  const GLASSR = [P.glass[0], P.glass[1], P.glass[2], P.glass[3]];
  const BLK = [P.black, P.dark[0], P.dark[1], P.dark[3]];
  const pulse = (t, per = 60) => 0.5 + 0.5 * Math.sin(t / per * TAU);
  const ember = (cx, cy, r, t) => { const k = pulse(t, 50); disc(cx, cy, r + 0.6, P.fire[0]); disc(cx, cy, r, k > 0.5 ? P.fire[1] : P.fire[0]); disc(cx, cy, Math.max(0.6, r * 0.5), k > 0.3 ? P.fire[2] : P.fire[1]); if (k > 0.75) px(cx - 0.5, cy - 0.5, P.fire[3]); };
  // 哥特尖拱：x0～x1、起拱线 ys、底 yb、两段圆弧半径 r（r 越大越尖）
  const inArch = (x0, x1, ys, yb, r) => (xx, yy) => xx >= x0 && xx <= x1 && yy <= yb && (yy >= ys || ((xx - (x0 + r)) ** 2 + (yy - ys) ** 2 <= r * r && (xx - (x1 - r)) ** 2 + (yy - ys) ** 2 <= r * r));
  const arch = (x0, x1, ys, yb, r, ramp) => shape(inArch(x0, x1, ys, yb, r), x0 - 1, ys - r, x1 + 1, yb + 1, ramp);
  const cross = (cx, cy, c = P.brass[2]) => { R(cx, cy - 2, 1, 5, c); R(cx - 1, cy - 1, 3, 1, c); };
  // 红沙漏：上下两个尖对尖的三角（5-3-1-3-5 像素），s ≥ 1 时整体放大一档
  const hourglass = (cx, cy, s = 1, c = P.fire[1]) => {
    const rows = s >= 1 ? [5, 3, 1, 3, 5] : [3, 1, 3], x0 = Math.round(cx), y0 = Math.round(cy) - Math.floor(rows.length / 2);
    rows.forEach((w, i) => { R(x0 - Math.floor(w / 2), y0 + i, w, 1, c); if (w > 1) px(x0 - Math.floor(w / 2), y0 + i, P.fire[0]); });
  };
  const spectrum = (x0, y0, len, t, ang = 0) => { const cols = [P.fire[1], P.fire[3], P.gauge[2], P.water[2]], c = Math.cos(ang), s = Math.sin(ang); if (saw(t, 40) > 0.7) return; cols.forEach((col, k) => { for (let i = 0; i < len; i++) px(x0 + c * i - s * (k - 1.5) * (0.3 + i * 0.12), y0 + s * i + c * (k - 1.5) * (0.3 + i * 0.12), col); }); };

  const mount = (x, y) => { R(x, y + 1, 4, 22, P.iron[0]); R(x + 1, y + 2, 2, 20, P.iron[2]); for (const v of [4, 11, 18]) px(x + 2, y + v, P.iron[4]); };
  const BOSS = {
    boss_core: { key: 'E', name: '圣杯炉', draw(x, y, o) {
        box(x + 4, y + 21, 16, 3, IRON); R(x + 6, y + 19, 12, 2, P.brass[0]); R(x + 6, y + 19, 12, 1, P.brass[2]);
        R(x + 10, y + 13, 4, 6, P.brass[1]); R(x + 10, y + 13, 1, 6, P.brass[3]); disc(x + 12, y + 16, 2.2, P.brass[1]); px(x + 11, y + 15, P.brass[3]);
        shape((xx, yy) => yy >= y + 5 && ((xx - x - 12) / 9) ** 2 + ((yy - y - 5) / 8.5) ** 2 <= 1, x + 2, y + 4, x + 22, y + 14, BRASS);
        R(x + 3, y + 5, 18, 1, P.brass[3]); for (const u of [6, 12, 18]) px(x + u, y + 9, P.fire[0]);
        const k = pulse(o.t, 45);
        shape((xx, yy) => yy <= y + 5 && ((xx - x - 12) / 8) ** 2 + ((yy - y - 5) / 3) ** 2 <= 1, x + 3, y + 1, x + 21, y + 6, [P.fire[0], P.fire[1], k > 0.5 ? P.fire[2] : P.fire[1], P.fire[3]]);
        for (const u of [8, 13, 16]) px(x + u, y + 4, P.dark[0]);
      },
      fx(x, y, o) { puff(x + 12, y + 1, o.t, 3, 8); } },
    boss_ram: { key: 'C', name: '三联活塞锤', draw(x, y, o) {
        mount(x, y);
        for (let k = 0; k < 3; k++) {
          const v = y + 2 + k * 7, ph = o.act != null ? (k === o.act ? o.p : o.p * 0.25) : Math.max(0, Math.sin((o.p * 3 - k) * Math.PI)) * (o.p > 0 ? 1 : 0), e = ph * 10;
          htube(x + 3, v, 18, 6, IRONL); band(x + 8, v, 2, 6);
          R(x + 21, v + 2, 7 + e, 2, P.iron[4]);
          const X = x + 28 + e;   // 锤头 v2：一块竖着的锤身 + 朝前收尖的锤嘴（像把锻工锤），后面一道黄铜夹箍
          poly([[X, v - 1], [X + 5, v - 1], [X + 10, v + 3], [X + 5, v + 7], [X, v + 7]], RUSTR);
          R(X - 1, v + 1, 2, 4, P.brass[1]); px(X - 1, v + 1, P.brass[3]); line(X + 5, v, X + 9, v + 3, 1, P.rust[3]); px(X + 10, v + 3, P.iron[4]);
        }
        hourglass(x + 15, y + 12, 1);
      } },
    boss_lens: { key: 'F', name: '旋转棱镜鼓', draw(x, y, o) {
        box(x + 2, y + 20, 20, 4, IRON);
        for (const u of [2, 19]) { R(x + u, y + 5, 3, 15, P.brass[1]); R(x + u, y + 5, 1, 15, P.brass[3]); disc(x + u + 1.5, y + 5, 2, P.brass[2]); px(x + u + 1, y + 13, P.brass[0]); }
        const rot = o.t * 0.06, faces = 6;
        for (let k = 0; k < faces; k++) {
          const a0 = rot + k / faces * TAU, a1 = a0 + TAU / faces, y0 = Math.sin(a0) * 6, y1 = Math.sin(a1) * 6;
          if (Math.cos((a0 + a1) / 2) < 0) continue;
          const lit = Math.cos((a0 + a1) / 2) > 0.92, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
          R(x + 5, y + 12 + lo, 14, Math.max(1, hi - lo), lit ? P.glass[3] : [P.glass[1], P.glass[0], P.glass[1]][k % 3]);
          R(x + 5, y + 12 + lo, 14, 1, P.brass[0]); if (!lit && hi - lo > 2) px(x + 7, y + 13 + lo, P.glass[2]);
        }
        R(x + 5, y + 5, 1, 14, P.brass[0]); R(x + 18, y + 5, 1, 14, P.brass[0]);
      },
      fx(x, y, o) { const rot = o.t * 0.06; for (let k = 0; k < 6; k++) { const a = rot + (k + 0.5) / 6 * TAU; if (Math.cos(a) > 0.92) spectrum(x + 19, y + 12, 6, 0, 0); } } },
  };

  // ---------- 水箱 + 撞击件（2026-09-29 定稿，样机 tools/archive/tank-rams.html）：水箱纵向箍带加固（按档 1～6）、铲斗 D 犁铧、撞角 B 舰艏撞角、蒸汽撞锤 B 双缸蓄力 ----------
  const tierOf = (o) => Math.max(1, Math.min(6, o.mt || 1));
  const bolt = (x, y) => { px(x, y, P.iron[4]); px(x + 1, y + 1, P.iron[0]); };
  // 水体：大窗里的水（水位 lv 0～1，波纹 + 气泡），青色只在水上
  function waterBody(x0, y0, w, h, lv, t) {
    R(x0, y0, w, h, P.glass[0]);
    const lh = Math.round(h * lv), top = y0 + h - lh;
    if (lh > 0) {
      R(x0, top, w, lh, P.water[1]); R(x0, top, w, 1, P.water[3]);
      for (let i = 0; i < w; i += 7) R(x0 + ((i + Math.floor(t / 4) * 2) % (w - 2)), top + 1, 3, 1, P.water[2]);
      if (lh > 4) R(x0 + 2, top + 3, 2, lh - 5, P.water[2]);
      for (let k = 0; k < 4; k++) { const p = saw(t + k * 17, 60), by = y0 + h - 2 - p * (lh - 3); if (by > top + 1) px(x0 + 5 + k * 7, by, P.water[3]); }
    }
    px(x0 + w - 5, y0 + 3, P.glass[3]); px(x0 + w - 4, y0 + 2, P.glass[3]);
  }
  // 撞击件的车头法兰（2×2 左边贴车体）
  const flange2 = (x, y, h0 = 6, h1 = 42) => { R(x, y + h0, 6, h1 - h0, P.iron[0]); R(x + 1, y + h0 + 1, 4, h1 - h0 - 2, P.iron[2]); R(x + 1, y + h0 + 1, 1, h1 - h0 - 2, P.iron[3]); for (let v = h0 + 4; v < h1 - 2; v += 8) bolt(x + 2, y + v); };

  const TANK2 = {
    key: 'A2', name: '纵向箍带加固', draw(x, y, o) {
      const T = tierOf(o);
      box(x + 19, y + 2, 10, 5, BRASS); box(x + 4, y + 6, 40, 39, IRONL); R(x + 8, y + 10, 32, 31, P.iron[0]); waterBody(x + 9, y + 11, 30, 29, o.water, o.t);
      for (const [rx, ry] of [[6, 8], [41, 8], [6, 42], [41, 42]]) bolt(x + rx, y + ry);
      const strap = (u, w) => { R(x + u, y + 4, w, 43, P.iron[0]); R(x + u + 1, y + 4, w - 2, 43, P.iron[3]); R(x + u + 1, y + 4, 1, 43, P.iron[4]); R(x + u, y + 4, w, 2, P.iron[1]); R(x + u, y + 45, w, 2, P.iron[1]); for (let v = 10; v < 44; v += 8) px(x + u + Math.floor(w / 2), y + v, P.iron[1]); };
      if (T >= 2) { const w = T >= 5 ? 5 : 4; strap(4, w); strap(44 - w, w); }
      if (T >= 6) { strap(1, 3); strap(44, 3); }
      if (T >= 3) { R(x + 8, y + 5, 32, 3, P.iron[0]); R(x + 8, y + 6, 32, 1, P.iron[3]); R(x + 8, y + 43, 32, 3, P.iron[0]); R(x + 8, y + 44, 32, 1, P.iron[3]); }
      if (T >= 4) for (const [cx, cy, sx, sy] of [[8, 8, 1, 1], [40, 8, -1, 1], [8, 43, 1, -1], [40, 43, -1, -1]]) { poly([[x + cx, y + cy], [x + cx + sx * 6, y + cy], [x + cx, y + cy + sy * 6]], IRON); bolt(x + cx + sx * 1.5, y + cy + sy * 1.5); }
      if (T >= 5) for (const u of [4, 39]) { R(x + u - 1, y + 22, 7, 7, P.iron[0]); R(x + u, y + 23, 5, 5, P.iron[2]); R(x + u + 2, y + 21, 1, 9, P.iron[4]); px(x + u + 2, y + 25, P.iron[0]); }
      if (T >= 6) for (let u = 8; u < 42; u += 4) { bolt(x + u, y + 5); bolt(x + u, y + 44); }
    } };

  const PISTON2 = {
    key: 'B2', name: '双缸蓄力撞锤', draw(x, y, o) {
      const st = tierOf(o) >= 5, c = Math.max(0, Math.min(1, o.c == null ? 1 : o.c));
      flange2(x, y, 4, 44);
      const pump = c < 1 ? Math.sin(o.t * 0.9) : 0;   // 蓄力时两缸往复；满了就停
      for (const [v, s] of [[4, 1], [34, -1]]) {
        box(x + 6, y + v, 18, 10, IRONL); R(x + 11, y + v, 2, 10, P.brass[1]); R(x + 19, y + v, 2, 10, P.brass[1]);
        const e = 3 + pump * s * 2.5; R(x + 24, y + v + 4, e, 2, P.iron[4]);
      }
      // v3：行程加长约 30%（弹簧满蓄 4.5 → 放开 19，原来 7 → 18）；释放瞬间锤头多冲出去 3px 再回弹；整只锤子在释放后抖（hit 从 1 衰减到 0）
      const hit = o.hit || 0, jx = hit ? Math.round(Math.sin(o.t * 3.3) * 1.6 * hit) : 0, jy = hit ? Math.round(Math.cos(o.t * 2.7) * 1.2 * hit) : 0;
      const L = 19 - c * 14.5 + Math.round(hit * hit * 3), hx = x + 12 + L + 6 + jx;
      R(x + 6, y + 17, 6, 14, P.iron[1]); R(x + 6, y + 17, 6, 1, P.iron[3]);   // 弹簧后座
      R(x + 12, y + 23, hx - x - 12, 2, P.iron[0]);                                // 导杆
      const n = 6, sp = L / n;   // 螺旋弹簧：每圈一道亮的前笔（竖）+ 一道暗的后笔（斜），压紧时圈挨圈
      for (let k = 0; k < n; k++) { const u = x + 12 + k * sp; line(u + sp, y + 18, u, y + 30, 1, P.iron[1]); }
      for (let k = 0; k <= n; k++) { const u = Math.round(x + 12 + k * sp); R(u, y + 18, 1, 13, P.iron[4]); px(u, y + 18, P.iron[2]); px(u, y + 30, P.iron[2]); }
      if (st) { R(x + 11, y + 16, L + 2, 1, P.brass[2]); R(x + 11, y + 31, L + 2, 1, P.brass[1]); }
      R(x + 24, y + 14, hx - x - 24 + 1, 2, P.iron[1]); for (let u = x + 24; u < hx; u += 3) px(u, y + 15, P.iron[4]);   // 上方的棘轮齿条（跟锤头滑座连着）
      R(x + 24, y + 32, hx - x - 24 + 1, 2, P.iron[1]); for (let u = x + 24; u < hx; u += 3) px(u, y + 32, P.iron[4]);
      const pw = c < 1 ? Math.round(Math.sin(o.t * 0.9) * 1.5) : 0;   // 两只棘爪：跟着活塞杆一推一推
      for (const [v, d] of [[12, 1], [35, -1]]) { R(x + 27 + pw, y + v, 3, 2, P.brass[1]); px(x + 29 + pw, y + v + d, P.brass[3]); }
      box(hx, y + 15 + jy, 6, 18, IRONL);                                                     // 锤头滑座
      box(hx + 6, y + 6 + jy, 8, 36, RUSTR); R(hx + 7, y + 23 + jy, 6, 2, P.rust[3]);         // 锤面
      if (st) poly([[hx + 14, y + 8 + jy], [hx + 20, y + 24 + jy], [hx + 14, y + 40 + jy]], RUSTR);
      if (hit > 0.3) for (const v of [7, 40]) { px(hx + 15, y + v + jy, P.iron[4]); px(hx + 5, y + v + jy, P.iron[4]); }   // 抖动时锤面四角的亮边
      const locked = c >= 0.99; R(x + 27, y + 14, 2, 3, P.iron[1]); line(x + 28, y + 16, locked ? hx + 1 : x + 31, locked ? y + 16 : y + 12, 1, locked ? P.brass[2] : P.iron[3]);   // 挂钩
      gauge(x + 15, y + 2, 2.6, 0.15 + c * 0.8);
    },
    fx(x, y, o) {
      const c = o.c == null ? 1 : o.c, hit = o.hit || 0;
      if (!hit) return;
      const L = 19 - c * 14.5 + Math.round(hit * hit * 3), hx = x + 12 + L + 6 + 14, k = 1 - hit;   // k：释放后过了多久（0 → 1）
      // 冲击波：锤面前三道弧往外扩
      for (let r = 0; r < 3; r++) { const rr = 3 + k * 12 + r * 3; if (rr > 20) continue; for (let a = -1.15; a <= 1.15; a += 0.1) px(hx + Math.cos(a) * rr, y + 24 + Math.sin(a) * rr * 1.7, r === 0 ? P.white : P.steam[2]); }
      // 强烈的蒸汽：两缸的排汽口往上 / 往下猛喷一大团，锤面上下沿也往外炸出两股；一松开就是一大团白汽，之后往外涨、慢慢变灰
      const burst = (cx, cy, dx, dy, n, len) => { for (let i = 0; i < n; i++) { const u = (i + 1) / n, d = (0.6 + k * 0.7) * len * u, wob = Math.sin(i * 2.3 + o.t * 0.3) * u * 3, w = k < 0.35 ? 0.1 : k < 0.7 ? 0.45 : 0.75; disc(cx + dx * d - dy * wob, cy + dy * d + dx * wob, 1.8 + u * 3.6 * (0.9 + k * 0.4), u < w ? P.steam[2] : k > 0.7 && u > 0.6 ? P.steam[1] : P.white); } };
      burst(x + 10, y + 4, -0.3, -1, 5, 14); burst(x + 20, y + 4, 0.3, -1, 5, 16);
      burst(x + 10, y + 44, -0.3, 1, 5, 14); burst(x + 20, y + 44, 0.3, 1, 5, 16);
      burst(hx - 6, y + 6, 0.5, -1, 4, 12); burst(hx - 6, y + 42, 0.5, 1, 4, 12);
      if (hit > 0.7) for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; px(hx + 3 + Math.cos(a) * 5, y + 24 + Math.sin(a) * 9, P.fire[3]); }   // 撞击一瞬间的火星
    } };
  const RAMS = {
    bucket: { key: 'D', name: '犁铧', draw(x, y, o) {
        const st = tierOf(o) >= 5; flange2(x, y, 6, 44);
        const share = (dx) => { poly([[x + 14 + dx, y + 4], [x + 24 + dx, y + 4], [x + 42 + dx, y + 42], [x + 30 + dx, y + 44], [x + 20 + dx, y + 30]], RUSTR); line(x + 24 + dx, y + 5, x + 41 + dx, y + 41, 1, P.rust[3]); };
        if (st) share(-8);
        share(0);
        poly([[x + 28, y + 40], [x + 46, y + 44], [x + 30, y + 46]], IRONL); R(x + 14, y + 44, 16, 3, P.iron[1]); R(x + 14, y + 44, 16, 1, P.iron[3]);
        line(x + 6, y + 20, x + 20, y + 20, 3, P.iron[0]); line(x + 6, y + 20, x + 20, y + 20, 1, P.iron[3]);
      } },
    spike: { key: 'B', name: '舰艏撞角', draw(x, y, o) {
        const st = tierOf(o) >= 5; flange2(x, y, 4, 44);
        poly([[x + 6, y + 6], [x + 20, y + 8], [x + 46, y + 30], [x + 47, y + 34], [x + 40, y + 38], [x + 6, y + 42]], RUSTR);
        line(x + 8, y + 26, x + 42, y + 34, 1, P.rust[3]); line(x + 8, y + 27, x + 42, y + 35, 1, P.rust[0]);
        for (let u = 10; u < 40; u += 4) { const yy = y + 8 + (u - 6) * 0.62 + 3; px(x + u, yy, P.rust[3]); if (st) px(x + u, y + 38, P.rust[3]); }
        if (st) poly([[x + 40, y + 29], [x + 47, y + 32], [x + 47, y + 34], [x + 41, y + 37]], IRONL);
      } },
    piston: PISTON2,
  };
  return {
    tank2(c, x, y, o) { g = c; TANK2.draw(x, y, o); },
    ram(c, id, x, y, o) { g = c; RAMS[id].draw(x, y, o); },
    ramFx(c, id, x, y, o) { g = c; if (RAMS[id].fx) RAMS[id].fx(x, y, o); },
    boss(c, id, x, y, o) { g = c; BOSS[id].draw(x, y, o); },
    bossFx(c, id, x, y, o) { g = c; if (BOSS[id].fx) BOSS[id].fx(x, y, o); },
    aux(c, id, x, y, o) { g = c; AUX[id].draw(x, y, o); },
    auxFx(c, id, x, y, o) { g = c; if (AUX[id].fx) AUX[id].fx(x, y, o); },
    harpoon(c, x, y, o) { g = c; HARPOON2[0].draw(x, y, o); },
    steamjet(c, x, y, o) { g = c; STEAM[0].draw(x, y, o); },
    steamjetFx(c, x, y, o) { g = c; STEAM[0].fx(x, y, o); },
    flamer(c, x, y, o) { g = c; FLAME2[0].draw(x, y, o); },
    flamerFx(c, x, y, o) { g = c; FLAME2[0].fx(x, y, o); },
    rocket(c, x, y, o, tier) { g = c; ROCKET6[Math.max(0, Math.min(5, tier - 1))].draw(x, y, o); },
    rocketFx(c, x, y, o, tier) { g = c; const e = ROCKET6[Math.max(0, Math.min(5, tier - 1))]; if (e.fx) e.fx(x, y, { ...o, game: true }); },
    boiler(c, x, y, o) { g = c; BOILER4[0].draw(x, y, o); },
    stoker(c, x, y, o, mini) { g = c; BOILER4[0].over(x, y, o, mini); },
    tank(c, x, y, o) { g = c; TANKS4[0].draw(x, y, o); },
  };
  })();

  const OVER = {
    boiler_s(x, y, q) { boilerSOver(x, y, q); },
    tank_tall(x, y, q) { tankTallOver(x, y, q); },
    mg_heavy(x, y, q) { mgHOver(x, y, q); },
    mg(x, y, q) { acOver(x, y, q, AC_TOP.mg); },
    mg2(x, y, q) { acOver(x, y, q, AC_TOP.mg2); },
    cannon_giant(x, y, q) { giantOver(x, y, giantO(q)); },   // 象牙白炮口箍 + 端面、上弦铆钉、地脚螺栓、墙板铭牌
    cannon(x, y, q) {
      const T = CANNON_TIERS[(q.mt || 1) - 1], Z = CANNON_ZONE;
      PART.seam(x, y, Z.seam, T.riv[0], RIVET_TIER[T.riv[1]]);
      if (T.parts.includes('plate')) PART.plate(x + Z.plate.x, y + Z.plate.y);
      if (T.parts.includes('gauge')) PART.gauge(x + Z.gauge.x, y + Z.gauge.y);
    },
    mortar(x, y, q) {   // 炮床上沿右段的铆钉
      const T = MORTAR_TIERS[(q.mt || 1) - 1], Z = MORTAR_ZONE[T.bed === 'block' ? 'block' : 'step'].riv, [n, kind] = T.riv, step = (Z.x1 - Z.x0) / (n - 1);
      for (let i = 0; i < n; i++) PART.rivet(Math.round(x + Z.x0 + i * step), y + Z.y, RIVET_TIER[kind]);
    },
    cannon_heavy(x, y, q) {   // 滑轨上沿的钢质铆钉
      const n = heavyTier(q.mt).riv, step = 61 / (n - 1);
      for (let i = 0; i < n; i++) PART.rivet(Math.round(x + 5 + i * step), y + 41, RIVET_TIER.steel);
    },
    side_cannon(x, y, q) {
      const T = SIDE_TIERS[(q.mt || 1) - 1], c = RIVET_TIER[T.riv[1]];
      if (T.h === 'post') for (const fx of SIDE_ZONE.post.rivets.xs) PART.rivet(x + fx, y + SIDE_ZONE.post.rivets.y, c);
      else PART.seam(x, y, SIDE_ZONE.box.rivets, T.riv[0], c);
      if (T.parts.includes('gauge')) gaugeS(x + SIDE_ZONE.box.gauge.x, y + SIDE_ZONE.box.gauge.y);
    },
    cannon_m(x, y, q) {
      const T = CANNON_M_TIERS[(q.mt || 1) - 1], c = RIVET_TIER[T.riv[1]];
      if (T.h === 'open') for (const fx of CANNON_M_ZONE.open.rivets.xs) PART.rivet(x + fx, y + CANNON_M_ZONE.open.rivets.y, c);
      else PART.seam(x, y, CANNON_M_ZONE.hood.rivets, T.riv[0], c);
      if (T.parts.includes('gauge')) gaugeS(x + CANNON_M_ZONE.hood.gauge.x, y + CANNON_M_ZONE.hood.gauge.y);
    },
  };

  // 垫在最后面的背景件（材质处理之后、destination-over）：颜色固定、永远在整张精灵后面
  const UNDER = {};   // 齿轮改用 GEAR_RAMP 后直接画在 DRAW 里，这里暂时不用（管线保留）


  // ---------- 履带六档的零件（DRAW.track 用；样机 tools/archive/track-tiers.html）----------
  const TAUT = Math.PI * 2, rdT = Math.round;
  const BRASST = [P.brass[0], P.brass[1], P.brass[2], P.brass[3]];   // T1 黄铜：轮辋、车台
  const WROUGHT = [P.iron[0], P.iron[1], P.iron[2], P.iron[3]];      // T2 熟铁：锻铁板条
  function tSeg(cx, cy, a, len, w, col) {
    const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
    line(rdT(cx - dx), rdT(cy - dy), rdT(cx + dx), rdT(cy + dy), w, col);
  }
  const tBolt = (x, y) => { px(x, y, P.iron[4]); px(x + 1, y + 1, P.iron[0]); };
  const tPlate = (x, y, w, h, r) => { R(x, y, w, h, r[0]); R(x + 1, y + 1, w - 2, h - 2, r[2]); R(x + 1, y + 1, w - 2, 1, r[3]); if (h > 3) R(x + 1, y + h - 2, w - 2, 1, r[1]); };
  // 铁链节（弧形段用）：黑描边 + 交替明暗 + 外侧高光 + 黄铜链销 + 抓地齿 / 导向齿
  function tLink(T, X, Y, a, i, pin) {
    const nx = -Math.sin(a), ny = Math.cos(a);
    if (T === 2) {   // 锻铁板条：垂直于行进方向摆，一块块铆在链上，每三块加一条抓地条
      tSeg(X, Y, a + Math.PI / 2, 4.2, 3, P.iron[0]); tSeg(X, Y, a + Math.PI / 2, 3.2, 2, i % 2 ? P.iron[2] : P.iron[3]);
      px(rdT(X - nx * 1.2 - 0.5), rdT(Y - ny * 1.2 - 0.5), P.iron[4]);
      if (i % 3 === 0) tSeg(X - nx * 2.6, Y - ny * 2.6, a + Math.PI / 2, 3, 1, P.iron[4]);
      return;
    }
    tSeg(X, Y, a, 5.8, 3, P.iron[0]); tSeg(X, Y, a, 4.6, 2, i % 2 ? P.iron[3] : P.iron[2]);
    px(rdT(X - nx * 1.2 - 0.5), rdT(Y - ny * 1.2 - 0.5), P.iron[4]);
    px(rdT(X - Math.cos(a) * 2.6 - 0.5), rdT(Y - Math.sin(a) * 2.6 - 0.5), pin);
    if (i % 2 === 0) { tSeg(X - nx * 2.6, Y - ny * 2.6, a + Math.PI / 2, 2, 1, P.iron[0]); px(rdT(X - nx * 3.6 - 0.5), rdT(Y - ny * 3.6 - 0.5), P.iron[4]); }
    if (T >= 4 && i % 2 === 1) R(rdT(X + nx * 2.6 - 1), rdT(Y + ny * 2.6 - 1), 2, 2, P.iron[4]);
  }
  // 直段链带（逐列画）：t = 带顶 y；dir = 1 下段（向左滚，+ph）/ -1 上段（向右滚，-ph）；节距 6（木板 4），格宽 48 是节距的整数倍，跨格不错位
  function trackCol(T, cx, t, ph, dir) {
    const slat = T === 2, pitch = slat ? 4 : 6, u = cx + ph * dir, p = ((u % pitch) + pitch) % pitch, idx = Math.floor(u / pitch);
    const out = dir > 0 ? 1 : -1;   // 外侧（抓地）朝下 / 朝上
    if (slat) {
      R(cx, t, 1, 4, P.iron[0]);
      if (p !== 3) { R(cx, t + 1, 1, 2, idx % 2 ? P.iron[2] : P.iron[3]); if (p === 0) px(cx, t + 1, P.iron[4]); if (p === 2 && idx % 2 === 0) px(cx, t + 1, P.iron[4]); }   // 板面 + 一颗铆钉
      if (idx % 3 === 0 && p >= 1 && p <= 2) R(cx, out > 0 ? t + 4 : t - 2, 1, 2, P.iron[4]);
      return;
    }
    R(cx, t, 1, 4, P.iron[0]);
    if (p === 5) R(cx, t + 1, 1, 2, T >= 4 ? P.brass[3] : P.brass[2]);
    else { R(cx, t + 1, 1, 2, idx % 2 ? P.iron[3] : P.iron[2]); if (p === 0) px(cx, out > 0 ? t + 1 : t + 2, P.iron[4]); }
    if (idx % 2 === 0 && p >= 2 && p <= 3) { px(cx, out > 0 ? t + 4 : t - 1, P.iron[4]); if (T >= 4) px(cx, out > 0 ? t + 5 : t - 2, P.iron[0]); }
    else if (T >= 4 && idx % 2 === 1 && p >= 2 && p <= 3) px(cx, out > 0 ? t - 1 : t + 4, P.iron[4]);   // 内侧导向齿
  }
  // 端头圆弧：side = -1 左端（驱动轮，从下段绕过左边到上段）/ 1 右端（诱导轮，从上段绕过右边到下段）；半径 12，链节沿弧长等距、随 ph 转
  function trackArc(T, cx, cy, side, ph) {
    const r = 12, pitch = T === 2 ? 4 : 6, n = Math.round(Math.PI * r / pitch), step = Math.PI * r / n, pin = T >= 4 ? P.brass[3] : P.brass[2];
    for (let k = 0; k < n; k++) {
      const s = (((k + ph / pitch) % n) + 0.5) * step, ang = side < 0 ? Math.PI / 2 + s / r : -Math.PI / 2 + s / r;
      tLink(T, cx + r * Math.cos(ang), cy + r * Math.sin(ang), ang + Math.PI / 2, k, pin);
    }
  }
  // 辐条轮 / 链轮齿
  function tSpoked(cx, cy, r, ang, n, o = {}) {
    const rim = o.rim || P.iron, sp = o.spoke || P.iron[3], hub = o.hub || P.iron[3];
    disc(cx, cy, r, P.dark[0]); disc(cx, cy, r - 1, rim[2]); disc(cx - 0.5, cy - 0.5, r - 1.6, rim[3] || rim[2]); disc(cx, cy, r - 2.2, o.hole || P.dark[1]);
    for (let i = 0; i < n; i++) { const a = ang + i * TAUT / n; line(rdT(cx), rdT(cy), rdT(cx + Math.cos(a) * (r - 2)), rdT(cy + Math.sin(a) * (r - 2)), 1, sp); }
    disc(cx, cy, Math.max(1.4, r * 0.28), hub); px(rdT(cx - 1), rdT(cy - 1), P.iron[4]);
  }
  function tTeeth(cx, cy, r, ang, n, col) { for (let i = 0; i < n; i++) { const a = ang + i * TAUT / n; R(rdT(cx + Math.cos(a) * r) - 1, rdT(cy + Math.sin(a) * r) - 1, 2, 2, col); } }
  // 驱动轮（左）/ 诱导轮（右）：圆心 (x+14, y+33) / (x+34, y+33)，半径 8.5；每档一套辐条数、轮毂、齿
  const TR_WHEEL = [null,
    null,
    { rn: 6, fn: 5, hubR: () => P.brass[2], hubF: () => P.iron[3], sp: P.iron[2], teeth: [8, P.iron[4]] },
    { rn: 6, fn: 6, hubR: () => P.iron[3], hubF: () => P.iron[3], sp: P.iron[3], teeth: [10, P.iron[4]] },
    { rn: 7, fn: 8, hubR: () => P.brass[2], hubF: () => P.iron[3], sp: P.iron[4], teeth: [12, P.iron[4]] },
    { rn: 8, fn: 8, hubR: () => P.brass[2], hubF: () => P.brass[2], sp: P.iron[4], hole: P.dark[2], teeth: [12, P.brass[3]], boss: true },
    { rn: 8, fn: 8, hubR: () => P.brass[2], hubF: () => P.brass[2], sp: P.brass[2], hole: P.dark[2], teeth: [12, P.brass[3]] }];
  function trackSprockets(T, x, y, L, Rr, ph) {
    const W = TR_WHEEL[T];
    if (!L) {
      const a = ph / 24 * TAUT / W.rn;
      tSpoked(x + 14, y + 33, 8.5, a, W.rn, { spoke: W.sp, hub: W.hubR(), hole: W.hole });
      tTeeth(x + 14, y + 33, 9.4, a, W.teeth[0], W.teeth[1]);
      if (W.boss) { disc(x + 14, y + 33, 2.2, P.brass[1]); px(x + 13, y + 32, P.brass[3]); }
    }
    if (!Rr) tSpoked(x + 34, y + 33, 8.5, ph / 24 * TAUT / W.fn, W.fn, { spoke: W.sp, hub: W.hubF(), hole: W.hole });
  }
  // 掉链子：链条摊在地上（两截 / 整条），断头翘起；驱动轮和诱导轮上垂下来的链
  function trackGround(T, x, y, L, Rr, sn) {
    const cable = (x0, y0, x1, y1) => { line(x0, y0, x1, y1, 5, P.dark[0]); line(x0, y0, x1, y1, 3, P.dark[2]); };
    const xa = L ? x : x + 2, xb = Rr ? x + C : x + 44;
    if (sn) {
      links(xa, x + 17, y + 42, 5, 3, false); links(x + 31, xb, y + 42, 5, 3, false);
      cable(x + 15, y + 44, x + 20, y + 37); cable(x + 33, y + 44, x + 29, y + 38);
      R(x + 19, y + 36, 2, 2, P.dark[3]); R(x + 28, y + 37, 2, 2, P.dark[3]);
    } else links(xa, xb, y + 42, 5, 3, false);
    if (!L) cable(x + 6, y + 36, x + 3, y + 43);
    if (!Rr) cable(x + 42, y + 36, x + 44, y + 43);
  }
  // 负重轮（钢盘 / 暗铁盘）：圆心 (wx, wy)，r 半径，a 转角（螺栓跟着转）
  function tRoad(wx, wy, r, a, style) {
    disc(wx, wy, r + 0.3, P.dark[0]);
    if (style === 'dark') { disc(wx, wy, r - 0.8, P.dark[3]); disc(wx, wy, r - 2.6, P.dark[2]); }
    else if (style === 'brass') { disc(wx, wy, r - 0.8, P.iron[2]); disc(wx - 0.5, wy - 0.5, r - 2, P.iron[3]); disc(wx, wy, 1.4, P.brass[2]); }
    else { disc(wx, wy, r - 0.8, P.iron[2]); disc(wx - 0.5, wy - 0.5, r - 2, P.iron[3]); disc(wx, wy, 1.4, style === 'steel' ? P.iron[1] : P.brass[2]); }
    for (const k of (style === 'steel' ? [0, TAUT / 3, 2 * TAUT / 3] : [0])) px(rdT(wx + Math.cos(a + k) * (r - 1.6) - 0.5), rdT(wy + Math.sin(a + k) * (r - 1.6) - 0.5), P.iron[4]);
  }
  // T1 博伊德尔铰接脚板轮：每格两只大黄铜辐轮（圆心 x+12 / x+36，跟悬挂 g0 / g1 上下），轮缘挂 9 块铰接铁脚板，转到最下面放平压地；轴梁 + 黄铜车台串起来
  function trackT1(x, y, L, Rr, ph, th, g0, g1) {
    const xa = x + (L ? 0 : 2), xb = x + (Rr ? C : C - 2);
    tPlate(xa, y + 12, xb - xa, 4, BRASST); R(xa, y + 16, xb - xa, 2, P.iron[0]); R(xa, y + 16, xb - xa, 1, P.iron[3]);
    for (let k = xa + 2; k < xb - 2; k++) if (((k - x) % 8 + 8) % 8 === 4) tBolt(k, y + 13);
    [12, 36].forEach((lx, i) => {
      const cx = x + lx, r = 12, cy = y + 33 + (i ? g1 : g0), wa = ph / 24 * TAUT / 9 + lx * 0.04;
      R(cx - 1, y + 18, 3, cy - y - 18, P.iron[0]); R(cx, y + 18, 1, cy - y - 18, P.iron[3]);   // 吊杆（悬挂伸缩时跟着变长）
      if (!th) for (let k = 0; k < 9; k++) {
        const a = wa + k * TAUT / 9 + Math.PI / 2, rr = r + 1;
        tSeg(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI / 2, 7.4, 3, P.iron[0]);
        tSeg(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI / 2, 6.2, 2, k % 2 ? P.iron[2] : P.iron[3]);
        px(rdT(cx + Math.cos(a + 0.36) * (rr + 0.3)), rdT(cy + Math.sin(a + 0.36) * (rr + 0.3)), P.brass[3]);
      }
      disc(cx, cy, r - 1.2, BRASST[0]); disc(cx, cy, r - 2.2, BRASST[2]); disc(cx - 0.5, cy - 0.5, r - 3, BRASST[3]); disc(cx, cy, r - 4, BRASST[1]);
      for (let k = 0; k < 8; k++) { const a = wa * 3 + k * TAUT / 8; line(rdT(cx), rdT(cy), rdT(cx + Math.cos(a) * (r - 4)), rdT(cy + Math.sin(a) * (r - 4)), 1, BRASST[3]); }
      disc(cx, cy, 2.4, P.iron[0]); disc(cx, cy, 1.6, P.brass[2]); px(rdT(cx - 1), rdT(cy - 1), P.brass[3]);
    });
    if (th) {   // 脚板掉在地上摊成一排
      for (let k = x + 3; k < x + C - 5; k += 8) { R(k, y + 44, 7, 3, P.iron[0]); R(k + 1, y + 45, 5, 1, k % 16 ? P.iron[2] : P.iron[3]); px(k + 3, y + 45, P.brass[3]); }
    }
  }
  // 侧框 + 负重轮（T2～T6），fx0 / fx1 = 本格里侧框的左右端；图案按格内绝对 x 排，跨格不错位
  function trackFrame(T, x, y, L, Rr, fx0, fx1, ph, g0, g1, gof) {
    const each = (step, off, lo, hi, fn) => { for (let k = x; k < x + C; k++) if (((k - x) % step) === off && k >= lo && k <= hi) fn(k); };
    const spin = (i) => ph / 24 * TAUT + i;
    if (T === 2) {   // 上梁 + 吊杆 + 铸铁小托轮
      const a = L ? x : x + 14, b = Rr ? x + C : x + 34;
      R(a, y + 11, b - a, 4, P.iron[0]); R(a, y + 12, b - a, 2, P.iron[3]); R(a, y + 12, b - a, 1, P.iron[4]);
      each(8, 3, a + 2, b - 4, (k) => tBolt(k, y + 12));
      for (const lx of [8, 24, 40]) if (x + lx >= a + 3 && x + lx <= b - 3) { R(x + lx - 1, y + 15, 3, 12, P.iron[0]); R(x + lx, y + 15, 1, 12, P.iron[3]); }
      for (const lx of [8, 24, 40]) if (x + lx >= a + 4 && x + lx <= b - 4) { const wy = y + 40 + gof(lx), cx = x + lx; disc(cx, wy, 3.4, P.dark[0]); disc(cx, wy, 2.6, P.iron[2]); px(cx - 1, wy - 1, P.iron[4]); }
      return;
    }
    if (T === 3) {   // 铆接铁板侧框（竖肋）+ 成对负重轮
      tPlate(fx0, y + 22, fx1 - fx0, 12, [P.iron[0], P.iron[1], P.iron[2], P.iron[3]]);
      each(8, 5, fx0 + 2, fx1 - 3, (k) => { R(k, y + 24, 1, 8, P.iron[1]); R(k + 1, y + 24, 1, 8, P.iron[4]); });
      each(8, 2, fx0 + 2, fx1 - 2, (k) => { tBolt(k, y + 23); tBolt(k, y + 31); });
      [13, 37].forEach((gc, i) => {
        if (x + gc - 6 < fx0 || x + gc + 6 > fx1) return;
        const d = i ? g1 : g0;
        R(x + gc - 6, y + 34 + d, 12, 2, P.dark[0]);
        for (const dx of [-4, 4]) tRoad(x + gc + dx, y + 39.5 + d, 4.3, spin(dx), 'dark');
      });
      return;
    }
    if (T === 4) {   // 冲孔减重钢框 + 单排钢盘负重轮
      tPlate(fx0, y + 21, fx1 - fx0, 14, [P.iron[0], P.iron[1], P.iron[2], P.iron[3]]);
      each(8, 2, fx0 + 3, fx1 - 5, (k) => { disc(k + 1.5, y + 28, 3.2, P.iron[1]); disc(k + 1.5, y + 28, 2.6, P.dark[1]); px(k - 1, y + 26, P.iron[0]); px(k + 1, y + 30, P.iron[3]); });
      R(fx0 + 1, y + 22, fx1 - fx0 - 2, 1, P.iron[4]);
      each(8, 2, fx0 + 2, fx1 - 2, (k) => tBolt(k, y + 33));
      for (const lx of [5, 13, 21, 29, 37, 45]) if (x + lx - 4.6 >= fx0 && x + lx + 4.6 <= fx1) tRoad(x + lx, y + 39.5 + gof(lx), 3.8, spin(lx), 'steel');
      return;
    }
    if (T === 5) {   // X 形桁架 + 板簧转向架
      R(fx0, y + 20, fx1 - fx0, 3, P.iron[0]); R(fx0, y + 21, fx1 - fx0, 1, P.iron[3]); R(fx0, y + 20, fx1 - fx0, 1, P.brass[2]);
      R(fx0, y + 31, fx1 - fx0, 3, P.iron[0]); R(fx0, y + 32, fx1 - fx0, 1, P.iron[3]);
      for (let lx = 0; lx < C; lx += 12) {
        const k = x + lx;
        if (k < fx0 - 1 || k + 12 > fx1 + 1) continue;
        line(k + 1, y + 22, k + 11, y + 32, 2, P.iron[1]); line(k + 1, y + 21, k + 11, y + 31, 1, P.iron[3]);
        line(k + 11, y + 22, k + 1, y + 32, 2, P.iron[1]); line(k + 11, y + 21, k + 1, y + 31, 1, P.iron[3]);
        R(k, y + 20, 2, 14, P.iron[0]); R(k, y + 21, 1, 12, P.iron[4]); tBolt(k, y + 24); tBolt(k, y + 29);
      }
      [13, 37].forEach((gc, i) => {
        if (x + gc - 9 < fx0 || x + gc + 9 > fx1) return;
        const d = i ? g1 : g0, bx = x + gc, rock = Math.round(Math.sin(ph / 24 * TAUT + i * 2));
        R(bx - 1, y + 34, 3, 3 + d, P.dark[0]);
        for (let k = -4; k <= 4; k++) px(bx + k, y + 35 - (Math.abs(k) < 3 ? 1 : 0), P.iron[k % 2 ? 2 : 3]);
        line(bx - 5, y + 39 + d + rock, bx + 5, y + 39 + d - rock, 2, P.dark[0]);
        for (const dx of [-5, 5]) tRoad(bx + dx, y + 39.5 + d + (dx > 0 ? -rock : rock) * 0.5, 4.4, spin(dx), 'brass');
      });
      return;
    }
    // T6 全包裙板：整块铆接裙板盖住上段和侧框，只露出下面一排负重轮；前后两端斜切露出大轮
    const sx0 = x + (L ? 0 : 3), sx1 = x + (Rr ? C : C - 3), top = y + 10, hh = 25;
    const ins = (xx, yy) => {
      if (yy < top || yy >= top + hh) return false;
      if (xx < x) return L && yy >= top; if (xx >= x + C) return Rr;
      if (xx < sx0 || xx >= sx1) return false;
      if (yy - top > 12 && !L && xx < sx0 + (yy - top - 12) * 1.1) return false;
      if (yy - top > 12 && !Rr && xx >= sx1 - (yy - top - 12) * 1.1) return false;
      return true;
    };
    for (const lx of [8, 24, 40]) if (x + lx >= fx0 + 6 && x + lx <= fx1 - 4 || (L && Rr)) tRoad(x + lx, y + 40 + gof(lx), 4.4, spin(lx), 'brass');
    for (let yy = top; yy < top + hh; yy++) for (let xx = x; xx < x + C; xx++) {
      if (!ins(xx, yy)) continue;
      const edge = !ins(xx - 1, yy) || !ins(xx + 1, yy) || !ins(xx, yy - 1) || !ins(xx, yy + 1);
      px(xx, yy, edge ? P.iron[0] : !ins(xx, yy - 2) ? P.iron[4] : !ins(xx, yy + 2) ? P.iron[1] : P.iron[3]);
    }
    R(Math.max(sx0 + 1, x), top + 1, Math.min(sx1 - 1, x + C) - Math.max(sx0 + 1, x), 1, P.brass[3]); R(Math.max(sx0 + 1, x), top + 2, Math.min(sx1 - 1, x + C) - Math.max(sx0 + 1, x), 1, P.brass[2]);
    R(Math.max(sx0 + 1, x), top + 13, Math.min(sx1 - 1, x + C) - Math.max(sx0 + 1, x), 1, P.iron[1]); R(Math.max(sx0 + 1, x), top + 14, Math.min(sx1 - 1, x + C) - Math.max(sx0 + 1, x), 1, P.iron[4]);
    for (const lx of [4, 16, 28, 40]) if (x + lx >= sx0 + 2 && x + lx + 8 <= sx1 - 2) for (let s = 0; s < 4; s++) { R(x + lx, top + 4 + s * 2, 8, 1, P.iron[0]); R(x + lx, top + 5 + s * 2, 8, 1, P.iron[4]); }
    each(8, 3, sx0 + 2, sx1 - 3, (k) => tBolt(k, top + 15));
  }
  const DRAW = {
    cannon_giant(x, y, q) { giantBase(x, y, giantO(q)); },   // 巨炮：攻城臼炮阵地（见上面的巨炮一节）
    // 铁装甲 1×2（2026-09-28 从 2×2 改成竖条）：一条厚铁板，中间一道横接缝，两列铆钉；并排两块拼回原来的样子
    armor(x, y) {
      box(x + 2, y + 2, 20, 44, IRONL);
      R(x + 3, y + 23, 18, 1, P.iron[1]);
      R(x + 3, y + 24, 18, 1, P.iron[4]);
      for (const ry of [6, 18, 28, 40]) for (const rx of [5, 16]) rivet(x + rx, y + ry);
      R(x + 10, y + 12, 4, 1, P.iron[2]); R(x + 8, y + 33, 3, 1, P.iron[2]);
    },
    armor_heavy(x, y) {
      box(x + 3, y + 3, 42, 42, IRON);
      box(x + 8, y + 8, 32, 32, IRONL);
      R(x + 9, y + 23, 30, 2, P.iron[2]); R(x + 9, y + 25, 30, 1, P.iron[4]);
      R(x + 23, y + 9, 2, 30, P.iron[2]); R(x + 25, y + 9, 1, 30, P.iron[4]);
      for (const [bx, by] of [[14, 14], [34, 14], [14, 34], [34, 34]]) {
        disc(x + bx, y + by, 3.2, P.iron[0]); disc(x + bx - 0.5, y + by - 0.5, 2.3, P.iron[4]); R(x + bx, y + by, 1, 1, P.iron[2]);
      }
      for (let k = 8; k < 42; k += 8) { rivet(x + k, y + 4, P.iron[3]); rivet(x + k, y + 41, P.iron[3]); rivet(x + 4, y + k, P.iron[3]); rivet(x + 41, y + k, P.iron[3]); }
    },
    cockpit(x, y, o) { cockpitArt(x, y, o); },
    copilot(x, y, o) {
      // 副驾驶：圆舷窗里的暖棕紫小黑炭球，扶着黄铜望远镜往外看；下方两根拉杆
      box(x + 3, y + 3, 42, 42, IRON);
      disc(x + 24, y + 20, 15, P.black); disc(x + 24, y + 20, 14, P.brass[1]); disc(x + 24, y + 20, 12.5, P.brass[2]);
      disc(x + 24, y + 20, 11, P.iron[1]);
      for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; R(Math.round(x + 24 + Math.cos(ang) * 13), Math.round(y + 20 + Math.sin(ang) * 13), 1, 1, P.brass[3]); }
      const bob = [0, 1, 1, 0][o.lv || 0];
      // 望远镜架在舷窗上，小黑炭球（暖棕紫）用两只小短手扶着往外看
      line(x + 26, y + 18, x + 37, y + 15, 4, P.black); line(x + 26, y + 18, x + 37, y + 15, 2, P.brass[2]);
      R(x + 36, y + 13, 3, 5, P.brass[3]);
      soot(x + 21, y + 21 + bob, 8.5, SOOT_CO, {
        look: 1, blink: (o.lv || 0) === 3,
        hands: [[x + 27, y + 20 + bob, x + 29, y + 16], [x + 27, y + 25 + bob, x + 32, y + 17]],
      });
      // 下方：拉杆 + 小仪表
      box(x + 8, y + 34, 32, 9, DARK);
      for (const lx of [14, 20]) { line(x + lx, y + 38, x + lx + (lx === 14 ? bob : -bob), y + 31, 2, P.brass[2]); disc(x + lx + (lx === 14 ? bob : -bob), y + 31, 1.6, P.fire[2]); }
      disc(x + 32, y + 38, 3, P.brass[2]); disc(x + 32, y + 38, 2, P.steam[2]); R(x + 32, y + 37, 1, 2, P.dark[0]);
      rivet(x + 6, y + 6); rivet(x + 40, y + 6); rivet(x + 6, y + 40); rivet(x + 40, y + 40);
    },
    boiler(x, y, o) {
      // 大燃煤窗口：唯一的发光体。外观阶段 ②（史诗起）：高烟囱 + 防火星罩、双压力表、圆形炉门 + 辐射炉栅
      const st = o.st || 1;
      box(x + 3, y + 6, 42, 39, IRON);
      if (st === 2) {
        box(x + 33, y - 4, 8, 12, DARK); R(x + 31, y - 6, 12, 3, P.dark[0]); R(x + 32, y - 6, 10, 1, P.dark[3]);
        for (const cx0 of [32, 35, 38, 41]) R(x + cx0, y - 8, 1, 2, P.dark[3]);   // 防火星罩的齿冠
        R(x + 34, y + 1, 6, 1, P.brass[2]);
      } else { box(x + 33, y, 8, 8, DARK); R(x + 32, y, 10, 2, P.dark[3]); }
      R(x + 4, y + 11, 40, 1, P.iron[1]);
      for (const rx of [8, 16, 24]) R(x + rx, y + 11, 1, 1, P.iron[4]);
      disc(x + 11, y + 9, 3.2, P.brass[2]); disc(x + 11, y + 9, 2.2, P.steam[2]); R(x + 11, y + 8, 1, 2, P.gauge[1]);
      if (st === 2) { disc(x + 20, y + 9, 3.2, P.brass[2]); disc(x + 20, y + 9, 2.2, P.steam[2]); R(x + 20, y + 9, 2, 1, P.fire[1]); R(x + 14, y + 9, 3, 1, P.brass[1]); }
      box(x + 7, y + 15, 34, 28, [P.iron[0], P.iron[1], P.iron[3], P.iron[4]]);
      rivet(x + 9, y + 17); rivet(x + 37, y + 17); rivet(x + 9, y + 39); rivet(x + 37, y + 39);
      R(x + 5, y + 21, 2, 5, P.brass[2]); R(x + 5, y + 33, 2, 5, P.brass[2]);
      const lv = o.lv || 1, fr = o.fr || 0;
      // 炉膛：暗室，底部煤层的余温向上晕开（抖动像素）
      R(x + 11, y + 19, 26, 20, P.dark[0]);
      for (let i = 0; i < 26; i++) {
        if (i % 2 === 0) R(x + 11 + i, y + 27, 1, 1, P.fire[0]);
        R(x + 11 + i, y + 28, 1, 1, P.fire[0]);
      }
      // 煤层：大块黑煤挤在一起，只有块间的裂缝透出暗红，热量越高裂缝越亮
      R(x + 11, y + 29, 26, 10, P.fire[1]);
      R(x + 11, y + 38, 26, 1, P.fire[lv >= 3 ? 2 : 1]);
      const lumps = [[0, 29, 6, 4], [6, 28, 6, 5], [12, 29, 5, 4], [17, 28, 6, 5], [23, 29, 3, 4],
        [0, 33, 5, 5], [5, 32, 6, 6], [11, 33, 6, 5], [17, 32, 5, 6], [22, 33, 4, 5]];
      lumps.forEach(([lx, ly, w, h], i) => {
        const X = x + 11 + lx, Y = y + ly;
        R(X + 1, Y, w - 2, h, P.dark[1]);
        R(X, Y + 1, w, h - 2, P.dark[1]);
        R(X + 1, Y, w - 2, 1, P.dark[2]); R(X, Y + 1, 1, 1, P.dark[3]); R(X + 1, Y, 1, 1, P.dark[3]);
        R(X + 1, Y + h - 1, w - 2, 1, P.dark[0]);
        // 裂缝余烬：逐帧轻微明灭
        const hot = (i * 5 + fr) % 4;
        R(X + w - 1, Y + 2, 1, Math.max(1, h - 4), hot < lv ? P.fire[Math.min(3, lv - 1 + (hot === 0 ? 1 : 0))] : P.fire[0]);
        if (hot < lv && i % 3 === 1) R(X + 2, Y + h - 1, 2, 1, P.fire[1]);
      });
      // 火星：只在高温时偶尔飘起一两粒
      if (lv >= 2) { R(x + 13 + fr * 5, y + 26 - fr % 2 * 3, 1, 1, P.fire[2]); if (lv >= 3) R(x + 31 - fr * 4, y + 23 + fr % 2, 1, 1, P.fire[1]); }
      if (st === 2) {
        // 圆形炉门：圆外是门板，圆里是炉火；黄铜门圈、左侧铰链，炉栅按圆裁
        const ccx = x + 24, ccy = y + 29, rr = 10.5;
        for (let yy = y + 19; yy < y + 40; yy++) for (let xx = x + 11; xx < x + 37; xx++) {
          const dx = xx + 0.5 - ccx, dy = yy + 0.5 - ccy, d2 = dx * dx + dy * dy;
          if (d2 > (rr + 1.5) ** 2) R(xx, yy, 1, 1, P.iron[3]);
          else if (d2 > rr * rr) R(xx, yy, 1, 1, dx + dy < 0 ? P.brass[3] : P.brass[1]);
          else if ((((xx - x) % 5) === 1 && Math.abs(dy) < rr - 1) || (Math.abs(dy + 4) < 1)) R(xx, yy, 1, 1, P.iron[0]);
        }
        R(x + 9, y + 24, 3, 10, P.brass[1]); R(x + 9, y + 24, 1, 10, P.brass[3]);
        rivet(x + 12, y + 20); rivet(x + 34, y + 20); rivet(x + 12, y + 37); rivet(x + 34, y + 37);
      } else {
        // 铁栅栏：竖条 + 一道横档，压在煤火前面
        R(x + 11, y + 25, 26, 2, P.iron[0]); R(x + 11, y + 25, 26, 1, P.iron[2]);
        for (const gx of [14, 20, 26, 32]) {
          R(x + gx, y + 19, 2, 20, P.iron[0]);
          R(x + gx, y + 19, 1, 20, P.iron[2]);
          R(x + gx, y + 25, 2, 2, P.iron[3]);
        }
      }
      // 灰斗缝透出微光
      R(x + 11, y + 40, 26, 1, lv >= 2 ? P.fire[1] : P.fire[0]);
    },
    cannon(x, y, o) {
      // 直射火炮 2×2（2026-09-27 定稿，样机 tools/cannon-lab.html）：按材料档位 T1～T6 画，形体只在 T3、T5 变——
      // T1～2 方指挥塔、T3～4 方平顶炮廓、T5～6 斜向板炮廓；炮管 ① 素管两道箍 + 方制退器，② 炮尾套筒 + 一道箍 + 阶梯式方制退器，③ 粗炮身 + 三道铁箍 + 大方制退器。
      // 立面：散热口逐档变（两道 → 三道 → 双列 → 斜百叶），钢起有包角铁；铆钉 / 铭牌 / 压力表在 OVER.cannon 里画。全部直线，炮口末端都在耳轴前 40px
      const T = CANNON_TIERS[(o.mt || 1) - 1];
      CANNON_TOWER[T.t](x, y);
      PART.vents(x, y, CANNON_ZONE.vent, T.vent[0], T.vent[1]);
      if (T.parts.includes('corners')) { PART.corner(x + 3, y + 16, 1, 1); PART.corner(x + 3, y + 40, 1, -1); PART.corner(x + 40, y + 40, -1, -1); }
      gunShield(x + 43, y + 27, o.up, 11);
      const d = rcPx('cannon', o.k);
      turn(x + 34, y + 27, o.a, (X, Y) => {
        X += x; Y += y;
        box(X + 26, Y + 15, 16, 24, BRASS);
        R(X + 29, Y + 17, 1, 20, P.brass[3]);
        R(X + 40, Y + 33, 12, 5, P.dark[0]); R(X + 40, Y + 34, 12, 3, P.iron[2]); R(X + 40, Y + 34, 12, 1, P.iron[4]);
        const lug = X + 58 - d;
        if (lug > X + 52) { R(X + 52, Y + 35, lug - X - 52, 2, P.iron[0]); R(X + 52, Y + 35, lug - X - 52, 1, P.brass[3]); }
        R(lug - 1, Y + 31, 3, 6, P.brass[1]); R(lug - 1, Y + 31, 1, 6, P.brass[3]);
        const bx = X + 38 - d;
        const tube = (x0, len, y0, hh) => { R(x0, y0, len, hh, P.iron[0]); R(x0, y0 + 1, len, hh - 2, P.iron[3]); R(x0, y0 + 1, len, 1, P.iron[4]); R(x0, y0 + hh - 2, len, 1, P.iron[2]); };
        const band = (hx, y0, hh) => { R(hx, y0, 3, hh, P.brass[1]); R(hx, y0, 1, hh, P.brass[3]); };
        const hoop = (hx, y0, hh) => { R(hx, y0, 3, hh, P.iron[0]); R(hx, y0 + 1, 3, hh - 2, P.iron[2]); R(hx, y0 + 1, 1, hh - 2, P.iron[4]); };
        const brake = (x0, y0, w, hh, slots) => { R(x0, y0, w, hh, P.iron[0]); R(x0 + 1, y0 + 1, w - 2, hh - 2, P.iron[3]); R(x0 + 1, y0 + 1, w - 2, 1, P.iron[4]); for (const sy of slots) R(x0 + 2, Y + sy, w - 4, 2, P.dark[0]); };
        if (T.b === 1) {
          tube(bx, 30, Y + 22, 10); for (const hb of [8, 18]) band(bx + hb, Y + 21, 12);
          brake(bx + 28, Y + 19, 8, 16, [22, 26, 30]);
        } else if (T.b === 2) {
          tube(bx, 30, Y + 22, 10); tube(bx, 14, Y + 20, 14); band(bx + 14, Y + 21, 12);
          R(bx + 24, Y + 20, 5, 14, P.iron[0]); R(bx + 25, Y + 21, 3, 12, P.iron[3]); R(bx + 25, Y + 21, 3, 1, P.iron[4]);   // 阶梯制退器的前一段
          brake(bx + 28, Y + 18, 8, 18, [21, 25, 29]);
        } else {
          tube(bx, 30, Y + 21, 12); for (const hb of [4, 11, 18]) hoop(bx + hb, Y + 20, 14);
          brake(bx + 27, Y + 18, 10, 18, [21, 25, 29]);
        }
        if ((o.k || 0) >= 7) { R(bx + 36, Y + 23, 3, 8, P.fire[3]); R(bx + 39, Y + 25, 2, 4, P.fire[2]); }   // 刚开炮：炮口余焰
      });
      disc(x + 34, y + 27, 3, P.brass[0]); disc(x + 34, y + 27, 2, P.brass[3]);   // 耳轴
    },
    // 中炮 2×1（48×24，横躺，2026-09-27 定稿）：炮组绕耳轴 (18,13) 转，炮口末端在耳轴前 41（blen 40）。和直射火炮同构——
    // T1～2 敞开炮架 + 低前挡板、T3～4 方平顶炮廓、T5～6 斜板炮廓；炮管 ① 素管 + 黄铜箍 + 小方制退器，② 炮尾套筒 + 箍 + 连体阶梯制退器，③ 粗炮身 + 三道铁箍 + 大方制退器。
    // 散热口每档至少 3 个；铆钉 / 小压力表在 OVER.cannon_m 里画
    cannon_m(x, y, o) {
      const T = CANNON_M_TIERS[(o.mt || 1) - 1], Z = CANNON_M_ZONE[T.h === 'open' ? 'open' : 'hood'];
      CANNON_M_HOOD[T.h](x, y);
      slimVents(x, y, Z.vent.x, Z.vent.y, Z.vent.h, T.vent[0], T.vent[1]);
      if (T.parts.includes('corners')) { PART.corner(x + 2, y + 3, 1, 1); PART.corner(x + 1, y + 19, 1, -1); }
      gunShield(x + 33, y + 13, o.up, 6);
      const d = rcPx('cannon_m', o.k);
      turn(x + 18, y + 13, o.a, (X, Y) => {
        X += x; Y += y;
        box(X + 11, Y + 7, 12, 11, BRASS); R(X + 13, Y + 9, 1, 7, P.brass[3]);   // 黄铜摇架
        const end = X + 59 - d, b0 = X + 22 - d;
        const tube = (x0, x1, y0, hh) => { R(x0, y0, x1 - x0, hh, P.iron[0]); R(x0, y0 + 1, x1 - x0, hh - 2, P.iron[3]); R(x0, y0 + 1, x1 - x0, 1, P.iron[4]); R(x0, y0 + hh - 2, x1 - x0, 1, P.iron[2]); };
        const band = (hx, y0, hh) => { R(hx, y0, 2, hh, P.brass[1]); R(hx, y0, 1, hh, P.brass[3]); };
        const hoop = (hx, y0, hh) => { R(hx, y0, 2, hh, P.iron[0]); R(hx, y0 + 1, 2, hh - 2, P.iron[2]); R(hx, y0 + 1, 1, hh - 2, P.iron[4]); };
        const brake = (x0, y0, w, hh, n) => { R(x0, y0, w, hh, P.iron[0]); R(x0 + 1, y0 + 1, w - 2, hh - 2, P.iron[3]); R(x0 + 1, y0 + 1, w - 2, 1, P.iron[4]); for (let i = 0; i < n; i++) R(x0 + 2, y0 + 2 + i * 3, w - 4, 1, P.dark[0]); };
        if (T.b === 1) { tube(b0, end - 5, Y + 10, 6); band(b0 + 12, Y + 9, 8); brake(end - 6, Y + 8, 6, 10, 2); }
        else if (T.b === 2) {
          tube(b0, end - 8, Y + 10, 6); tube(b0, b0 + 14, Y + 9, 8); band(b0 + 14, Y + 9, 8);
          R(end - 9, Y + 9, 3, 8, P.iron[0]); R(end - 8, Y + 10, 1, 6, P.iron[3]);
          brake(end - 6, Y + 7, 6, 12, 3);
        } else { tube(b0, end - 6, Y + 9, 8); for (const hb of [3, 11, 19]) hoop(b0 + hb, Y + 8, 10); brake(end - 7, Y + 7, 7, 12, 3); }
        if ((o.k || 0) >= 7) { R(end, Y + 10, 3, 6, P.fire[3]); R(end + 3, Y + 11, 2, 4, P.fire[2]); }   // 刚开炮：炮口余焰
      });
      trunnionBolt(x + 18, y + 13);
    },
    // 小炮 1×1（卡隆短炮，2026-09-27 定稿）：只靠剪影，不放铆钉 / 散热口 / 压力表 / 包角铁（visual-rules §3.5）。
    // 长药室 17×15 撑满格子上半；炮组绕耳轴 (12,13) 转，炮口末端在耳轴前 24。只留方形固定螺栓 + 药室一道黄铜箍
    cannon_s(x, y, o) {
      const T = CANNON_S_TIERS[(o.mt || 1) - 1];
      CANNON_S_MOUNT[T.m](x, y);
      gunShield(x + 21, y + 13, o.up, 4);
      const d = rcPx('cannon_s', o.k);
      turn(x + 12, y + 13, o.a, (X, Y) => {
        const C = X + x + 12 - d, M = Y + y + 13, end = C + 24;
        const col = (cx, t, b) => { R(cx, t, 1, b - t + 1, P.iron[0]); if (b - t > 1) { R(cx, t + 1, 1, b - t - 1, P.iron[3]); R(cx, t + 1, 1, 1, P.iron[4]); if (b - t > 3) R(cx, t + 2, 1, 1, P.iron[4]); R(cx, b - 1, 1, 1, P.iron[2]); } };
        const hoop = (hx, hh) => { R(hx, M - hh, 2, hh * 2 + 1, P.iron[0]); R(hx, M - hh + 1, 2, hh * 2 - 1, P.iron[2]); R(hx, M - hh + 1, 1, hh * 2 - 1, P.iron[4]); };
        const ring = (x0, w, hh) => { R(x0, M - hh, w, hh * 2 + 1, P.iron[0]); R(x0 + 1, M - hh + 1, w - 2, hh * 2 - 1, P.iron[3]); R(x0 + 1, M - hh + 1, w - 2, 1, P.iron[4]); };
        if (T.form === 'cast') {   // 铸造瓶身：圆尾钮 + 两端倒角的长药室 + 细炮管 + 方口箍
          disc(C - 10.5, M, 2.5, P.iron[0]); disc(C - 10.5, M, 1.5, P.iron[3]);
          [4, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 5, 4].forEach((hh, i) => col(C - 9 + i, M - hh, M + hh));
          for (let i = C + 8; i < end - 3; i++) col(i, M - 3, M + 3);
          ring(end - 3, 3, 4); R(end - 1, M, 1, 1, P.black);
        } else {                   // 方套箱（T5～6 前肩斜切）：方尾钮 + 17×15 套箱（倒 1px 角）
          const slant = T.form === 'slant', x0 = C - 9, n = 17;
          R(C - 12, M - 2, 3, 5, P.iron[0]); R(C - 11, M - 1, 1, 3, P.iron[3]); R(C - 11, M - 1, 1, 1, P.iron[4]);
          for (let i = 0; i < n; i++) {
            const edge = i === 0 || i === n - 1;
            const t = M - 7 + (slant && i >= 7 ? Math.round((i - 7) * 0.6) : 0) + (edge ? 1 : 0), b = M + 7 - (edge ? 1 : 0);
            R(x0 + i, t, 1, b - t + 1, P.iron[0]);
            if (!edge) { R(x0 + i, t + 1, 1, b - t - 1, P.iron[2]); R(x0 + i, t + 1, 1, 1, P.iron[4]); R(x0 + i, b - 1, 1, 1, P.iron[1]); }
            if (i === 1) R(x0 + i, t + 1, 1, b - t - 1, P.iron[3]);
            if (i === n - 2) R(x0 + i, t + 1, 1, b - t - 1, P.iron[1]);
          }
          const hh = slant ? 4 : 3;
          for (let i = C + 8; i < end - 5; i++) col(i, M - hh, M + hh);
          if (!slant) { col(C + 8, M - 5, M + 5); col(C + 9, M - 5, M + 5); R(C + 9, M - 5, 1, 11, P.iron[0]); hoop(C + 14, 4); ring(end - 6, 3, 4); ring(end - 3, 3, 5); R(end - 1, M, 1, 1, P.black); }   // 台阶收口 + 铁箍 + 阶梯方口
          else { hoop(C + 11, 5); ring(end - 6, 6, 5); R(end - 4, M - 2, 3, 1, P.dark[0]); R(end - 4, M + 2, 3, 1, P.dark[0]); }   // 粗箍 + 方制退器
        }
        R(C - 5, M - 7, 2, 15, P.brass[1]); R(C - 5, M - 7, 1, 15, P.brass[3]);   // 药室黄铜箍
        if ((o.k || 0) >= 7) { R(end, M - 2, 3, 5, P.fire[3]); R(end + 3, M - 1, 2, 3, P.fire[2]); }
      });
      trunnionBolt(x + 12, y + 13);
    },
    // ---------- 小模块：24px 原生画（不再借大模块缩小），像素大小和大模块一样 ----------
    // 1×1 驾驶舱（2026-09-29 重做：方窗驾驶箱，见 helmetArt）；双人 / 四人联合驾驶舱见 cockpitPairArt / cockpitArt
    helmet(x, y, o) { helmetArt(x, y, o); },
    cockpit_pair(x, y, o) { cockpitPairArt(x, y, o); },
    plate(x, y) {
      box(x + 2, y + 2, 20, 20, IRONL);
      R(x + 3, y + 11, 18, 1, P.iron[1]); R(x + 3, y + 12, 18, 1, P.iron[4]);
      for (const [a, b] of [[4, 4], [17, 4], [4, 16], [17, 16]]) rivet(x + a, y + b);
      R(x + 13, y + 7, 3, 1, P.iron[2]); R(x + 7, y + 17, 2, 1, P.iron[2]);
    },
    // 水罐（1×1 / 1×2）：圆罐 + 竖玻璃窗，水位跟着剩水量降，偶尔冒个气泡
    tank_s(x, y, q) { tankSmall(x, y, q); },
    periscope(x, y, q) { periscopeArt(x, y, q.fr || 0); },
    mortar_s(x, y, q) { mortarS(x, y, q); },
    autoloader(x, y, q) { autoloaderArt(x, y, q.fr || 0); },
    pressure_chamber(x, y, q) { pressureArt(x, y, q.fr || 0); },
    condenser(x, y, q) { condenserArt(x, y, q.fr || 0); },
    tank_tall(x, y, q) { tankTall(x, y, q); },
    boiler_s(x, y, q) { boilerS(x, y, q); },
    boiler_l(x, y, q) { BIG.boiler(ctx, x, y, { t: q.fr * 8, heat: q.ht / 2 }); },   // 炉火 3 档 × 13 帧（链节、煤块刚好循环）
    water_l(x, y, q) { BIG.tank(ctx, x, y, { t: q.fr * 9, water: q.lv / 29 }); },
    // 特殊武器（2026-09-29 定稿）：转动部分按 module-art 的耳轴 / 炮口几何；汽、火、飞出去的烟在 weaponFx 里逐帧画（材质处理之后）
    // 辅助四件（2026-09-29 定稿）：蓄压罐的液柱跟存量走，六分仪的指标臂慢慢扫，万向环一直翻，散热片的冷却液随车温流
    // Boss 唯一件（2026-09-29 定稿）：圣杯里的煤在呼吸（8 帧），三联活塞锤轮流打出（q.a3 = 这一下是哪根），棱镜鼓一直转（8 帧）
    // 水箱 + 撞击件（2026-09-29 定稿）：水箱按材质档 1～6 加固（q.st），撞击件普通 / 精英（q.st = 2 → 按 T5 画）
    water(x, y, q) { BIG.tank2(ctx, x, y, { water: (q.lv == null ? 29 : q.lv) / 29, t: (q.fr || 0) * 15, mt: q.st || 1 }); },
    bucket(x, y, q) { BIG.ram(ctx, 'bucket', x, y, { mt: (q.st || 1) >= 2 ? 5 : 1, t: 0 }); },
    spike(x, y, q) { BIG.ram(ctx, 'spike', x, y, { mt: (q.st || 1) >= 2 ? 5 : 1, t: 0 }); },
    piston(x, y, q) { BIG.ram(ctx, 'piston', x, y, { mt: (q.st || 1) >= 2 ? 5 : 1, c: (q.c == null ? 10 : q.c) / 10, hit: (q.h || 0) / 4, t: (q.fr || 0) * 2 }); },   // 蓄力 11 档 × 震颤 5 档
    boss_core(x, y, q) { BIG.boss(ctx, 'boss_core', x, y, { t: q.fr * 45 / 8 }); },
    boss_ram(x, y, q) { BIG.boss(ctx, 'boss_ram', x, y, { p: q.p / 3, act: q.a3 || 0, t: 0 }); },
    boss_lens(x, y, q) { BIG.boss(ctx, 'boss_lens', x, y, { t: q.fr * 17.45 / 8 }); },
    pressure_tank(x, y, q) { BIG.aux(ctx, 'pressure_tank', x, y, { lv: q.lv / 16, t: 0 }); },
    rangefinder(x, y, q) { BIG.aux(ctx, 'rangefinder', x, y, { t: q.fr * 6 }); },
    gyroscope(x, y, q) { BIG.aux(ctx, 'gyroscope', x, y, { t: q.fr * 3.27 }); },
    radiator(x, y, q) { BIG.aux(ctx, 'radiator', x, y, { t: q.fr * 10, heat: q.ht / 2 }); },
    harpoon(x, y, q) { BIG.harpoon(ctx, x, y, { a: q.a, k: (q.k || 0) / 8, out: !!q.out, t: (q.fr || 0) * 4 }); },
    steamjet(x, y, q) { BIG.steamjet(ctx, x, y, { a: q.a, on: !!q.on, t: 0 }); },
    flamer(x, y, q) { BIG.flamer(ctx, x, y, { a: q.a, t: 0 }); },
    rocket_rack(x, y, q) { BIG.rocket(ctx, x, y, { a: q.a, n: q.n, s: q.s / 18, t: 0 }, q.st || 1); },   // 六档六种样式（q.st = 材料档）
    mg_s(x, y, q) { mgS(x, y, q); },
    mg_heavy(x, y, q) { mgH(x, y, q); },
    // 臼炮 2×2（高抛火炮，2026-09-27 定稿，样机 tools/gun-family-lab.html 臼炮 v1）：参考 19 世纪攻城 / 岸防臼炮——
    // 炮管短粗、越往炮口越粗、炮口厚箍 + 大口径黑洞；炮耳在炮尾，夹在炮耳座里（炮耳座画在炮管前面）；低矮厚重的炮床；
    // 两侧活动大齿轮在 UNDER.mortar（随仰角转）。T1～2 方炮床 + 方炮耳座 → T3～4 台阶炮床 + 加厚炮耳座、一道铁箍 → T5～6 炮床前沿斜切 + 梯形炮耳座、两道铁箍。
    // 耳轴 (24,30)，炮口末端离耳轴 24（blen 24）
    mortar(x, y, o) {
      const T = MORTAR_TIERS[(o.mt || 1) - 1], Z = MORTAR_ZONE[T.bed === 'block' ? 'block' : 'step'];
      const ang = o.a == null ? 55 : o.a, rk = rcPx('mortar', o.k), f = Math.floor(ang / 6) % 4;   // 活动设计：仰角每 6° 换一个对称帧
      PART.gear(x + 10, y + 29, 'L', 3 - f);                                                        // 左齿轮：在最后面
      PART.gear(x + 24, y + 30, 'S', f);                                                            // 炮耳小齿轮
      mortarTube(x + 24, y + 30, ang, rk, T, (o.k || 0) >= 7);
      {   // 传动示意：左齿轮轮毂的曲柄销 → 炮管背面的吊耳（随仰角摆）
        const ar = ang * Math.PI / 180, u = 12 - rk, v = -8.5;
        const lx = Math.round(x + 24 + Math.cos(ar) * u + Math.sin(ar) * v), ly = Math.round(y + 30 - Math.sin(ar) * u + Math.cos(ar) * v);
        line(x + 10, y + 29, lx, ly, 3, P.iron[0]); line(x + 10, y + 29, lx, ly, 1, P.iron[3]);
        disc(lx + 0.5, ly + 0.5, 2, P.brass[0]); disc(lx + 0.5, ly + 0.5, 1.2, P.brass[2]);
        disc(x + 10, y + 29, 2.2, P.brass[0]); disc(x + 10, y + 29, 1.3, P.brass[3]);
      }
      MORTAR_CHEEK[T.cheek](x, y);
      trunnionBolt(x + 24, y + 30);
      PART.gear(x + 38, y + 29, 'L', f);                                                            // 右齿轮：在炮身和炮耳座前面
      MORTAR_BED[T.bed](x, y);                                                                       // 炮床最后画，挡住两只齿轮的下半
      slimVents(x, y, Z.vent.x, Z.vent.y, Z.vent.h, T.vent[0], T.vent[1]);
      if (T.corners) { PART.corner(x + 2, y + 42, 1, -1); PART.corner(x + (T.bed === 'slant' ? 40 : 41), y + 42, -1, -1); }
      if (o.up) {   // 改装：炮床两端立护板，三级前护板加高
        bolted(x + 41, y + (o.up >= 3 ? 22 : 30), 6, o.up >= 3 ? 18 : 10);
        if (o.up >= 2) bolted(x + 1, y + 30, 6, 10);
      }
    },
    mg(x, y, q) { acGun(x, y, q); },           // 机炮 · 蒸汽离心炮（见上面的机炮 / 双联一节）
    mg2(x, y, q) { acTwin(x, y, q); },         // 双联机枪 · 双嘴汽转球
    // 重炮 3×2（72×48，横躺，镀镍起，2026-09-27 定稿，样机 tools/gun-family-lab.html v5）：参考 19 世纪套箍式攻城 / 岸防重炮——
    // 台阶式炮身（炮尾最粗、直线台阶收细、炮尾钮、炮尾黄铜箍）+ 台阶形铁炮耳架 + 带三个滚轮的铁滑轨；
    // 背景齿轮：巨型 + 大 + 中在炮身后，迷你夹在炮耳架和炮身之间；炮耳架上一根长轴。耳轴 (34,24)，炮口末端 x 76（出框 4px，blen 42）。
    // T4 台阶形炮耳架；T5～6 炮耳架前沿斜切 + 炮身更粗、炮管两道铁箍；铆钉在 OVER.cannon_heavy
    cannon_heavy(x, y, o) {
      const T = heavyTier(o.mt);
      // 齿轮（用户按图排的大小和位置）：巨型 D32 在炮尾后面、大 D20 在右上、中 D14 在炮耳上方——都在炮身后面；
      // 迷你 D8 在炮耳下方，夹在炮耳架前、炮身后
      PART.gear(x + 16, y + 25, 'XXL', 0); PART.gear(x + 26, y + 11, 'L', 1); PART.gear(x + 38, y + 20, 'M', 0);
      box(x + 1, y + 39, 70, 6, IRON); R(x + 2, y + 40, 68, 1, P.iron[4]);                        // 铁滑轨
      for (const wx of [9, 36, 63]) { disc(x + wx, y + 45.5, 2.6, P.dark[0]); disc(x + wx, y + 45.5, 1.6, P.dark[2]); R(x + wx, y + 45, 1, 1, P.brass[2]); }
      steppedPlate(x, y, 12, T.slant ? HEAVY_CHEEK.slant : HEAVY_CHEEK.step, 39);                  // 炮耳架
      PART.gear(x + 32, y + 34, 'XS', 1);
      PART.shaft(x + 14, x + 54, y + 36); PART.collar(x + 22, y + 36); PART.collar(x + 46, y + 36);   // 炮耳架长轴
      gunShield(x + 58, y + 24, o.up, 9);
      const d = rcPx('cannon_heavy', o.k);
      turn(x + 34, y + 24, o.a, (X, Y) => {
        const C = X + x + 34 - d, M = Y + y + 24, H = T.heavy;
        const segs = [[-27, -25, 3], [-25, -24, 2], [-24, -8, H ? 11 : 10], [-8, 8, 9], [8, 18, H ? 8 : 7], [18, 37, H ? 6 : 5], [37, 42, H ? 7 : 6]];
        for (const [a0, a1, hh] of segs) for (let i = C + a0; i < C + a1; i++) {
          R(i, M - hh, 1, hh * 2 + 1, P.iron[0]);
          if (hh > 1) { R(i, M - hh + 1, 1, hh * 2 - 1, P.iron[3]); R(i, M - hh + 1, 1, 1, P.iron[4]); if (hh > 3) { R(i, M - hh + 2, 1, 1, P.iron[4]); R(i, M + hh - 2, 1, 2, P.iron[2]); } }
        }
        segs.forEach(([a0, , hh], k) => { if (k && segs[k - 1][2] > hh) R(C + a0, M - hh + 1, 1, hh * 2 - 1, P.iron[2]); });   // 台阶的阴影面
        R(C - 28, M - 2, 1, 5, P.iron[0]);                                                                                   // 炮尾钮后沿
        const bh = H ? 11 : 10;
        R(C - 12, M - bh, 2, bh * 2 + 1, P.brass[1]); R(C - 12, M - bh, 1, bh * 2 + 1, P.brass[3]);                           // 炮尾黄铜箍
        if (H) for (const hx of [23, 31]) { R(C + hx, M - 7, 2, 15, P.iron[0]); R(C + hx, M - 6, 1, 13, P.iron[4]); }       // 炮管铁箍
        else { R(C + 27, M - 6, 2, 13, P.iron[0]); R(C + 27, M - 5, 1, 11, P.iron[4]); }
        R(C + 41, M - 2, 1, 5, P.black);
        if ((o.k || 0) >= 7) { R(C + 42, M - 5, 4, 11, P.fire[3]); R(C + 46, M - 3, 3, 7, P.fire[2]); }
      });
      disc(x + 34, y + 24, 3.6, P.brass[0]); disc(x + 34, y + 24, 2.6, P.brass[2]); R(x + 33, y + 23, 1, 1, P.brass[3]); R(x + 34, y + 24, 1, 1, P.brass[0]);   // 炮耳
    },
    // 侧炮 2×2（侧挂层，2026-09-27 定稿，样机 tools/gun-family-lab.html）：挂板 + 暗铁悬吊臂 + 吊着的长炮，只画骨架、透出后面的主体模块。
    // T1～2 窄挂板 + 粗方柱、T3～4 方箱挂板 + 双柱横撑、T5～6 斜板挂板 + 实心腹板；炮管同中炮一套，炮口末端在耳轴前 48。
    // 零件只放挂板：上沿铆钉、中右散热口、钢起包角铁、镀镍起左侧小压力表（OVER.side_cannon）
    side_cannon(x, y, o) {
      const T = SIDE_TIERS[(o.mt || 1) - 1], Z = SIDE_ZONE[T.h === 'post' ? 'post' : 'box'];
      SIDE_HANG[T.h](x, y);
      slimVents(x, y, Z.vent.x, Z.vent.y, Z.vent.h, T.vent[0], T.vent[1]);
      if (T.parts.includes('corners')) { PART.corner(x + 3, y + 2, 1, 1); PART.corner(x + (T.h === 'slant' ? 25 : 27), y + 11, -1, -1); }
      gunShield(x + 29, y + 34, o.up, 8);
      const d = rcPx('side_cannon', o.k);
      turn(x + 18, y + 34, o.a, (X, Y) => {
        X += x; Y += y;
        box(X + 8, Y + 27, 19, 14, BRASS); R(X + 10, Y + 29, 1, 10, P.brass[3]);   // 黄铜摇架
        const end = X + 66 - d, b0 = X + 26 - d;
        const tube = (x0, x1, y0, hh) => { R(x0, y0, x1 - x0, hh, P.iron[0]); R(x0, y0 + 1, x1 - x0, hh - 2, P.iron[3]); R(x0, y0 + 1, x1 - x0, 1, P.iron[4]); R(x0, y0 + hh - 2, x1 - x0, 1, P.iron[2]); };
        const band = (hx, y0, hh) => { R(hx, y0, 2, hh, P.brass[1]); R(hx, y0, 1, hh, P.brass[3]); };
        const hoop = (hx, y0, hh) => { R(hx, y0, 2, hh, P.iron[0]); R(hx, y0 + 1, 2, hh - 2, P.iron[2]); R(hx, y0 + 1, 1, hh - 2, P.iron[4]); };
        const brake = (x0, y0, w, hh, n) => { R(x0, y0, w, hh, P.iron[0]); R(x0 + 1, y0 + 1, w - 2, hh - 2, P.iron[3]); R(x0 + 1, y0 + 1, w - 2, 1, P.iron[4]); for (let i = 0; i < n; i++) R(x0 + 2, y0 + 2 + i * 3, w - 4, 1, P.dark[0]); };
        if (T.b === 1) { tube(b0, end - 5, Y + 31, 6); band(b0 + 16, Y + 30, 8); brake(end - 6, Y + 29, 6, 10, 2); }
        else if (T.b === 2) {
          tube(b0, end - 8, Y + 31, 6); tube(b0, b0 + 16, Y + 30, 8); band(b0 + 16, Y + 30, 8);
          R(end - 9, Y + 30, 3, 8, P.iron[0]); R(end - 8, Y + 31, 1, 6, P.iron[3]);
          brake(end - 6, Y + 28, 6, 12, 3);
        } else { tube(b0, end - 6, Y + 30, 8); for (const hb of [4, 14, 24]) hoop(b0 + hb, Y + 29, 10); brake(end - 7, Y + 28, 7, 12, 3); }
        if ((o.k || 0) >= 7) { R(end, Y + 31, 3, 6, P.fire[3]); R(end + 3, Y + 32, 2, 4, P.fire[2]); }
      });
      trunnionBolt(x + 18, y + 34);
    },
    track(x, y, o) {
      // 履带六档（2026-09-29 用户定：全部采用；样机 tools/archive/track-tiers.html）。档位 = 材料 1～6（module-art 的 vis），每档一个真实的历史节点：
      // ① 博伊德尔铰接脚板轮（1846，无履带）② 熟铁板条链带（隆巴德 / 霍恩斯比）③ 霍尔特铁链节 + 竖肋侧框 ④ Mark IV 减重孔钢框 + 导向齿
      // ⑤ 维克斯桁架 + 板簧转向架 ⑥ 全包裙板。一格 48 宽；两端各一只半径 12 的圆弧（驱动轮在左、诱导轮在右），中间格是直段。
      // 悬挂：module-art 的 susp.pts = [13, 37]，g0 / g1 是这两个接地点的伸缩，负重轮和下段链带一起上下；gL / gR 是相邻格的偏移，跨格接成一条。
      // th = 掉链子（任意一段被毁，整条履带脱落）：链条摊在地上，sn = 被打断的那一段；T1 的脚板一起掉下来
      const L = o.connL, Rr = o.connR, th = o.th, T = Math.max(1, Math.min(6, o.st || 1));
      const ph = th ? 0 : o.ph || 0, g0 = th ? 0 : o.g0 || 0, g1 = th ? 0 : o.g1 || 0, gL = o.gL || 0, gR = o.gR || 0;
      const xa = L ? x : x + 14, xb = Rr ? x + C : x + 34, fx0 = L ? x : x + 20, fx1 = Rr ? x + C : x + 28;
      const gof = (lx) => (lx < 24 ? g0 : g1);
      floor(x, y, o, 5);
      // 车体底板下面到履带顶之间补一层铁板，和上方模块的框架相接
      const deckTo = [0, 12, 11, 19, 19, 19, 10][T];
      R(x, y + 5, C, deckTo - 5, P.iron[1]); R(x, y + deckTo - 1, C, 1, P.iron[0]);
      if (T === 1) trackT1(x, y, L, Rr, ph, th, g0, g1);
      else {
        if (!th) {
          const pts = [];
          if (L) pts.push([0, gL + (g0 - gL) * 0.4], [6, g0], [20, g0]); else pts.push([14, 0]);
          if (Rr) pts.push([30, g1], [44, g1], [48, g1 + (gR - g1) * 0.4]);
          else if (L) pts.push([26, g0 * 0.5], [34, 0]); else pts.push([34, 0]);
          const hAt = polyAt(pts);
          for (let cx = xa; cx < xb; cx++) { trackCol(T, cx, y + 43 + Math.round(hAt(cx - x)), ph, 1); trackCol(T, cx, y + 19, ph, -1); }
          if (!L) trackArc(T, x + 14, y + 33, -1, ph);
          if (!Rr) trackArc(T, x + 34, y + 33, 1, ph);
        } else trackGround(T, x, y, L, Rr, o.sn);
        trackSprockets(T, x, y, L, Rr, ph);
        trackFrame(T, x, y, L, Rr, fx0, fx1, ph, g0, g1, gof);
      }
    },
    // 腿式底盘分两层：近侧腿画在车体前；远侧腿压暗、向右上错位，画在整个车体后面 → 伪立体纵深。
    // part: 'far' 只画远侧腿 / 'near' 只画机身 + 近侧腿 / 省略 = 都画（卡片图标用）。bd = 机身随步态下沉的像素
    // 双足 T1 · 工装 Mk.II：箱形梁大腿 + 液压撑杆 + 双支杆小腿 + 带肋平脚（反关节）
    // 真双足 2×4（48×96，tools/chassis-lab.html 的画法）：上两行是带陀螺仪的胯（腰挂位有模块时伸出法兰板压住），
    // 下两行是一对放大的长腿。ga = 步态角档（12 档一圈），sd = 步幅，g2 = [近侧脚, 远侧脚] 的悬挂伸缩，tt = 陀螺转动的时间档
    biped(x, y, o) {
      const LL = SA.LEGLAB, pn = penFor(ctx.canvas);
      LL.bipedArt(pn, x, y, { mv: !!o.mv, a: (o.ga || 0) / 12 * Math.PI * 2, stride: o.sd || 16, bd: o.bd || 0, g: o.g2 || [0, 0],
        legs: o.lk || BIPED_LOOK[(o.st || 1) - 1], wL: !!o.wL, wR: !!o.wR, phase: (o.ga || 0) * 4, t: (o.tt || 0) / 6 }, o.part || undefined);
      pn.flush(ctx);
    },
    // 四足整件 4×2（96×48，tools/chassis-lab.html 的画法）：一整块蜘蛛甲壳 + 四条腿，后腿往后张、前腿往前张，对角两条同相大步交替。
    // ga = 步态角档（12 档一圈），sd = 步幅（世界像素），g4 = 四只脚的悬挂伸缩 [近后, 近前, 远后, 远前]（战斗 settle() 按 contactPts 算）
    quad(x, y, o) {
      const Q6 = SA.LEGLAB.Q6, pn = penFor(ctx.canvas), e = Q6.BY_KEY[o.lk] || Q6.BY_KEY[QUAD_LOOK()[(o.st || 1) - 1]];
      // 首尾相连的多件四足：相邻两件步态差半圈（像蜈蚣一样一节一节往前传）
      Q6.draw(pn, x, y, e, { mv: !!o.mv, a: (o.ga || 0) / 12 * Math.PI * 2 + (o.odd ? Math.PI : 0), stride: o.sd || 14, bd: o.bd || 0,
        g: o.g4 || [0, 0, 0, 0], top: !!o.top, connL: o.connL, connR: o.connR, t: (o.tt || 0) / 2 }, o.part || undefined);
      pn.flush(ctx);
    },
  };

  // ---------- 缓存：量化参数 → 离屏精灵 ----------
  const cache = new Map();
  const TOP = 16;
  const BOT = 14;   // 精灵底下留的空：悬挂伸长时轮子 / 脚落到格子下面也画得下
  const LEFT = 16;  // 精灵左边留的空：蜘蛛腿往后张的脚伸到格子外面也画得下
  // 四足整件的腿张得很开（脚离机身 ±步幅 + 伸出量），膝盖也高过机身：画布四周多留边
  const PAD = { quad: { l: 56, t: 44, r: 64 }, biped: { l: 48, t: 24, r: 56 } };   // 四足：温室的高膝会冒出顶板约 30px
  const padOf = (id) => PAD[id] || { l: LEFT, t: TOP, r: 32 };
  const angQ = (a, rest) => Math.round((a == null ? rest : a) / 2) * 2;   // 仰角按 2° 一档缓存
  // 悬挂偏移按整像素缓存；没有偏移就不写进键里（和原来的缓存一致）
  // 腿式底盘（step = 2）按 2px 一档：脚最多差 1px，但光栅腿的缓存命中率高得多
  function gndQ(q, o, step = 1) {
    if (!o.gnd) return;
    const rq = (v) => Math.round((v || 0) / step) * step;
    const a = rq(o.gnd[0]), b = rq(o.gnd[1]), l = rq(o.gL), r = rq(o.gR);
    if (a || b) { q.g0 = a; q.g1 = b; }
    if (l) q.gL = l;
    if (r) q.gR = r;
  }
  // 双缸蓄力撞锤：punch 1 = 刚打出 → 0 = 已经蓄满（没贴身时一直是 0）
  const pistonHit = (pu) => (pu > 0.6 ? (pu - 0.6) / 0.4 : 0);
  const pistonCharge = (pu) => (pu > 0.6 ? 0 : 1 - pu / 0.6);
  function quant(id, o) {
    const q = {};
    switch (id) {
      case 'boiler': case 'boiler_s': { const fl = Math.floor((o.t || 0) * 8 + (o.seed || 0)) % 4; q.fr = fl; q.lv = Math.max(1, Math.min(3, Math.floor(1 + (o.heat || 0) * 2.2 + (fl % 2) * 0.6))); break; }
      case 'boss_core': case 'boss_lens': q.fr = Math.floor((o.t || 0) * 8) % 8; break;
      case 'boss_ram': q.p = Math.round((o.punch || 0) * 3); if (q.p) q.a3 = Math.floor((o.t || 0) * 5) % 3; break;
      case 'pressure_tank': q.lv = Math.round(16 * Math.max(0, Math.min(1, o.store == null ? 0.6 : o.store))); break;   // 存量 17 档（车间 / 图标按六成画）
      case 'rangefinder': q.fr = Math.floor((o.t || 0) * 5) % 26; break;
      case 'gyroscope': q.fr = Math.floor((o.t || 0) * 10) % 12; break;
      case 'radiator': q.fr = Math.floor((o.t || 0) * 6) % 10; q.ht = Math.max(0, Math.min(2, Math.round((o.heat || 0) * 2))); break;
      case 'harpoon': q.a = angQ(o.a, 0); q.k = SA.Dyn.quant(o.recoil, 8); if (o.out) { q.out = 1; q.fr = Math.floor((o.t || 0) * 8) % 8; } break;   // 射出后绞盘放缆：8 帧
      case 'steamjet': q.a = angQ(o.a, 0); if (o.flash > 0) q.on = 1; break;
      case 'flamer': q.a = angQ(o.a, 0); break;
      case 'rocket_rack': q.a = angQ(o.a, 20); q.n = o.rn == null ? 4 : o.rn; q.s = Math.round((o.rs || 0) * 18); break;   // 架上几枚 + 一轮开火进度 18 档
      case 'boiler_l': q.fr = Math.floor((o.t || 0) * 6) % 13; q.ht = Math.max(0, Math.min(2, Math.round((o.heat || 0) * 2))); break;
      case 'water_l': q.lv = Math.round(29 * Math.max(0, Math.min(1, o.water == null ? 1 : o.water))); q.fr = Math.floor((o.t || 0) * 4) % 8; break;
      case 'water': case 'tank_s': case 'tank_tall': q.lv = Math.round(29 * Math.max(0, Math.min(1, o.water == null ? 1 : o.water))); q.fr = Math.floor((o.t || 0) * 4) % 4; break;
      case 'copilot': q.lv = Math.floor((o.t || 0) * 1.5 + (o.seed || 0)) % 4; break;
      case 'cockpit': case 'cockpit_pair': case 'helmet': if (o.layer) { q.layer = o.layer; q.fr = Math.floor((o.t || 0) * 10) % 60; } break;   // 舱体静止；中层 / 前层的操纵件 6 秒一轮
      case 'cannon': case 'cannon_m': case 'cannon_s': case 'cannon_heavy': case 'side_cannon': q.k = SA.Dyn.quant(o.recoil, 8); q.a = angQ(o.a, 0); break;
      case 'mortar': q.k = SA.Dyn.quant(o.recoil, 8); q.a = angQ(o.a, 55); break;
      case 'cannon_giant': q.k = SA.Dyn.quant(o.recoil, 8); q.a = angQ(o.a, 75); break;   // 没有仰角（车间、图标）时按静止 75° 画
      case 'mg': case 'mg2': case 'mg_s': case 'mg_heavy': q.k = SA.Dyn.quant(o.recoil, 8); q.f = SA.Dyn.frame(o.feed, 12); q.a = angQ(o.a, 0); break;
      case 'track': q.ph = o.thrown ? 0 : SA.Dyn.frame(o.phase, 24); q.connL = !!o.connL; q.connR = !!o.connR; q.top = !!o.top; q.th = !!o.thrown; q.sn = !!o.snap; gndQ(q, o); break;
      case 'quad': {   // 整件四足：步态角 12 档、步幅 4px 一档、四只脚的悬挂 2px 一档
        const A = o.gait || 0;
        q.mv = !!o.moving; q.ga = q.mv ? ((Math.round(A / (Math.PI * 2 / 12)) % 12) + 12) % 12 : 0; q.sd = Math.round((o.stride || 14) / 2) * 2;
        q.bd = o.bd || 0; q.part = o.part || null; q.top = !!o.top;
        if (o.look) q.lk = o.look;   // 唯一变体（Q6.SET 的 key），不给就按材料取六档主线
        if (SA.stageOf('quad', o.mt || 1) >= 6 || o.look) q.tt = Math.floor((o.t || 0) * 2) % 8;   // T6 的彩窗 / 旗帜要随时间动，8 档一轮；其余档不按时间缓存
        if (o.connL) q.connL = true; if (o.connR) q.connR = true; if ((o.ri || 0) % 2) q.odd = true;
        if (o.g4 && o.g4.some(v => v)) q.g4 = o.g4.map(v => Math.round((v || 0) / 2) * 2);
        break;
      }
      case 'biped': {   // 真双足：步态角 12 档、步幅 4px 一档、两只脚的悬挂 2px 一档、陀螺 6 档 / 秒（6 秒一轮）
        const A = o.gait || 0;
        // 唯一外观进入精灵缓存键，避免同材料的不同奖励共用普通双足精灵。
        if (SA.LEG_VARIANTS.some(v => v.id === 'biped' && v.look === o.look)) q.lk = o.look;
        q.mv = !!o.moving; q.ga = q.mv ? ((Math.round(A / (Math.PI * 2 / 12)) % 12) + 12) % 12 : 0; q.sd = Math.round((o.stride || 16) / 4) * 4;
        q.bd = o.bd || 0; q.part = o.part || null; q.tt = Math.floor((o.t || 0) * 6) % 36;
        if (o.wL) q.wL = true; if (o.wR) q.wR = true;
        if (o.g2 && o.g2.some(v => v)) q.g2 = o.g2.map(v => Math.round((v || 0) / 2) * 2);
        break;
      }
      case 'piston': { const pu = o.punch || 0; q.c = Math.round(pistonCharge(pu) * 10); q.h = Math.round(pistonHit(pu) * 4); if (q.c < 10 || q.h) q.fr = Math.floor((o.t || 0) * 12) % 8; break; }   // 打击后 punch 从 1 衰减：前 40% 是释放震颤，之后重新蓄力
      case 'periscope': q.fr = Math.floor((o.t || 0) * 2.2) % 24; break;   // 望远镜俯仰：24 帧一轮（约 11 秒）
      case 'mortar_s': q.k = SA.Dyn.quant(o.recoil, 8); q.a = angQ(o.a, 55); break;
      case 'autoloader': q.fr = Math.floor((o.t || 0) * 3.3) % 18; break;          // 扬弹链：18 帧一轮（约 5.5 秒）
      case 'pressure_chamber': q.fr = Math.floor((o.t || 0) * 5) % 16; break;      // 风箱一压一放：16 帧一轮（约 3 秒）
      case 'condenser': q.fr = Math.floor((o.t || 0) * 4) % 12; break;             // 盘管滴水：12 帧一轮
    }
    if (o.up) q.up = Math.min(3, o.up);   // 改装等级 → 挂件
    if (o.mt > 1) q.mt = o.mt;
    return q;
  }
  // ---------- 材料（2026-09-27 定稿，T1 黄铜到 T6 以太，色值在 palette.js 的 SA.PAL.mat，样机 tools/material-lab.html）----------
  // 金属像素（冷铁 / 暗铁 / 锈钢）按「阶」换成材料自己的颜色，不混色；黄铜饰件、炉火、水、玻璃、皮革、驾驶员保持原色。
  // 在此之上，每种材料最多再加：瓷漆（只刷模块大面的第 2、3 阶，亮边和斜面仍露金属）、描线（离模块外沿 3px 的 1px 线，自动算）、
  // 只改明度一阶的纹理（熟铁麻点、钢花纹板）、反光方式、四角紧固件（自动认出 rivet() 画的铆钉，只换最靠四个角的各一颗）。
  // 全部不发光，所以新模块只要照常画冷铁 + 用 rivet()，六种材料就自动有各自的样子。
  const rgbOf = (hx) => { const n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const k3 = (r, g, b) => (r << 16) | (g << 8) | b;
  const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
  const hash = (x, y) => (Math.imul(x + 101, 73856093) ^ Math.imul(y + 37, 19349663)) >>> 0;
  const SRC_PX = new Map();   // 源像素：{ kind: dark | iron | rust, lv }
  P.dark.forEach((h, i) => SRC_PX.set(k3(...rgbOf(h)), { kind: 'dark', lv: i }));
  P.iron.forEach((h, i) => SRC_PX.set(k3(...rgbOf(h)), { kind: 'iron', lv: i }));
  P.rust.forEach((h, i) => SRC_PX.set(k3(...rgbOf(h)), { kind: 'rust', lv: i }));
  const BRASS_PX = new Map(P.brass.map((h, i) => [k3(...rgbOf(h)), i]));
  const KEEP_PX = new Set([...P.brass, ...P.fire, ...P.water, ...P.gauge, ...P.glass, ...P.steam, ...P.leather, ...P.bg, P.white, P.black, P.magenta, ...SOOT_PILOT, ...SOOT_CO].map(h => k3(...rgbOf(h))));
  const IRON_LUM = P.iron.map(h => lum(...rgbOf(h)));
  // 不在调色板里的颜色（旋转贴图的边缘等）：灰的按明度归到最近的冷铁阶，有颜色的保留
  function pxSrc(r, g, b) {
    const k = k3(r, g, b);
    if (SRC_PX.has(k)) return SRC_PX.get(k);
    if (KEEP_PX.has(k)) return null;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === 0 || (mx - mn) / mx >= 0.28) return null;
    const L = lum(r, g, b); let best = 0;
    IRON_LUM.forEach((v, i) => { if (Math.abs(v - L) < Math.abs(IRON_LUM[best] - L)) best = i; });
    return { kind: 'iron', lv: best };
  }
  // 材料定义转成 RGB，按需缓存
  const matCache = {};
  function matOf(key) {
    const m = SA.PAL.mat && SA.PAL.mat[key];
    if (!m) return null;
    if (!matCache[key]) {
      const toC = (a) => (a ? a.map(rgbOf) : null);
      matCache[key] = { ...m, ironC: toC(m.iron), darkC: toC(m.dark), rustC: toC(m.rust), paintC: toC(m.paint), trimC: toC(m.trim), lineC: m.line ? rgbOf(m.line) : null };
    }
    return matCache[key];
  }
  const mixC = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  // 只改明度的纹理：返回 -1 / 0 / +1
  function texAt(tex, lx, ly) {
    if (tex === 'pits') { const h = hash(Math.floor(lx / 4), Math.floor(ly / 4)); return (((lx % 4) + 4) % 4) === h % 4 && (((ly % 4) + 4) % 4) === (h >> 2) % 4 ? (h % 5 === 0 ? 1 : -1) : 0; }
    if (tex === 'checker') { const u = ((lx % 8) + 8) % 8, v = ((ly % 8) + 8) % 8, alt = (Math.floor(lx / 8) + Math.floor(ly / 8)) % 2; return (alt ? (u === v && (u === 3 || u === 4)) : (u + v === 7 && (u === 3 || u === 4))) ? 1 : 0; }
    return 0;
  }
  // 四角紧固件的 2×2 钉头 [左上, 右上, 左下, 右下]
  const PIN_HEAD = {
    bolt: (M) => [M.ironC[4], M.ironC[3], M.ironC[3], M.ironC[1]],
    gold: (M) => (M.trimC ? [M.trimC[3], M.trimC[1], M.trimC[1], M.trimC[0]] : [P.brass[3], P.brass[1], P.brass[1], P.brass[0]].map(rgbOf)),
  };
  // 这些区域里的暗铁色像素不参与材质处理（模块内坐标 [x, y, w, h]）：炉膛里的煤是煤，不是金属；炉栅、炉门照常换材料
  const DECOR_SKIP = { boiler: [[11, 19, 26, 21]], boiler_s: [[5, 21, 14, 20]] };
  let matPass = null;   // 样机页可以换一套材质处理（setMatPass），游戏里始终是 decorate
  // tdy：纹理的竖向锚点偏移（整数或逐像素 Int8Array）。精灵内部会上下起伏的部件（四足 / 双足机身随步态下沉 bd）
  // 按它把纹理坐标跟着部件一起挪，花纹和反光点才粘在部件身上，不会像贴在镜头上一样原地不动
  function decorate(cv, mat, ox, oy, skip = [], tdy = 0) {
    const M = matOf(mat.key);
    if (!M) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, img = g.getImageData(0, 0, W, H), d = img.data;
    const src = new Array(W * H).fill(null), brass = new Int8Array(W * H).fill(-1);
    for (let i = 0; i < W * H; i++) {
      if (d[i * 4 + 3] < 8) continue;
      const kk = k3(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      if (M.trimC && BRASS_PX.has(kk)) { brass[i] = BRASS_PX.get(kk); continue; }
      const c = pxSrc(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      if (!c) continue;
      const lx = i % W - ox, ly = Math.floor(i / W) - oy;
      if (c.kind === 'dark' && skip.some(([sx, sy, sw, sh]) => lx >= sx && lx < sx + sw && ly >= sy && ly < sy + sh)) continue;
      src[i] = c;
    }
    const isM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!src[y * W + x];
    const lvAt = (x, y) => { if (!isM(x, y)) return -1; const c = src[y * W + x]; return c.kind === 'iron' ? c.lv : -1; };
    const out = new Array(W * H).fill(null);
    for (let i = 0; i < W * H; i++) {
      const c = src[i];
      if (c) out[i] = c.kind === 'dark' ? M.darkC[c.lv] : c.kind === 'rust' ? M.rustC[c.lv] : M.ironC[c.lv];
      else if (brass[i] >= 0) out[i] = M.trimC[brass[i]];
    }
    // 描线要知道每个冷铁像素离非金属有多远（4 邻域，算到 5 为止）
    const dist = M.lineC ? new Uint8Array(W * H) : null;
    if (dist) {
      const q = [];
      for (let i = 0; i < W * H; i++) dist[i] = src[i] && src[i].kind === 'iron' ? 255 : 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dist[i] && (!isM(x - 1, y) || !isM(x + 1, y) || !isM(x, y - 1) || !isM(x, y + 1))) { dist[i] = 1; q.push(i); } }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = Math.floor(i / W); if (dist[i] >= 5) continue;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + a, Y = y + b; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (dist[j] === 255) { dist[j] = dist[i] + 1; q.push(j); } }
      }
    }
    const flat = (x, y) => isM(x - 1, y) && isM(x + 1, y) && isM(x, y - 1) && isM(x, y + 1) && isM(x - 1, y - 1) && isM(x + 1, y + 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = src[i]; if (!c || c.kind !== 'iron') continue;
      const lx = x - ox, ly = y - oy - (typeof tdy === 'number' ? tdy : tdy[i]), face = c.lv === 2 || c.lv === 3, fl = flat(x, y);
      if (M.spec === 'matte' && c.lv === 4) out[i] = M.ironC[3];   // 哑光：亮边压一阶
      else if (M.spec === 'crisp' && c.lv === 4 && !isM(x, y - 1) && !isM(x - 1, y)) out[i] = mixC(M.ironC[4], [255, 255, 255], 0.45);   // 受光角一个亮点
      else if (M.spec === 'soft' && c.lv === 4 && (lx + ly) % 2) out[i] = mixC(M.ironC[3], M.ironC[4], 0.5);   // 柔和：亮边隔一个像素压半阶
      if (M.paintC && face) out[i] = M.paintC[c.lv];
      else if (M.tex && face && fl) { const t = texAt(M.tex, lx, ly); if (t) out[i] = M.ironC[Math.max(0, Math.min(4, c.lv + t))]; }
      if (dist && face && fl && dist[i] === 3) out[i] = M.lineC;
    }
    if (PIN_HEAD[M.pin]) {
      const found = [];
      for (let y = 0; y < H - 2; y++) for (let x = 0; x < W - 2; x++) {
        const a = lvAt(x, y);
        if (a < 3 || lvAt(x + 1, y) !== a || lvAt(x, y + 1) !== a || lvAt(x + 1, y + 1) !== 2 || lvAt(x + 2, y + 1) !== 0) continue;
        found.push([x, y]);
      }
      let use = found;
      if (found.length > 4) {
        const xs = found.map(p => p[0]), ys = found.map(p => p[1]), pickd = new Set();
        for (const ax of [Math.min(...xs), Math.max(...xs)]) for (const ay of [Math.min(...ys), Math.max(...ys)]) {
          let best = 0, bd = 1e9; found.forEach((p, k) => { const dd = (p[0] - ax) ** 2 + (p[1] - ay) ** 2; if (dd < bd) { bd = dd; best = k; } }); pickd.add(best);
        }
        use = [...pickd].map(k => found[k]);
      }
      const col = PIN_HEAD[M.pin](M);
      for (const [x, y] of use) [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b], k) => { out[(y + b) * W + x + a] = col[k]; });
    }
    for (let i = 0; i < W * H; i++) { const c = out[i]; if (!c) continue; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; }
    g.putImageData(img, 0, 0);
  }
  // 外观接口：DRAW[id](x, y, q) 在 (x, y) 画一个占 f.w × f.h 子格的模块；q 是 quant() 量化后的状态，
  // 另外带 q.st = 外观阶段（1~3，按材料算，见 SA.stageOf；只有一个造型的模块永远是 1，不写进 q）。
  // 画布按占格放大：右边留 32px 给伸出去的炮管，左边留 LEFT 给往后张的腿，上面留 TOP 给抬起的炮管，下面留 BOT 给伸长的悬挂
  function sprite(id, q, f = { w: 2, h: 2 }) {
    const key = id + JSON.stringify(q);
    let cv = cache.get(key);
    if (!cv) {
      if (cache.size > 800) cache.clear();
      cv = document.createElement('canvas');
      const pd = padOf(id);
      cv.width = f.w * S + pd.r + pd.l; cv.height = f.h * S + pd.t + BOT;
      cv.ox = pd.l; cv.oy = pd.t;
      ctx = cv.getContext('2d');
      DRAW[id](pd.l, pd.t, q);
      attach(id, q, f, pd.l, pd.t);
      (matPass || decorate)(cv, SA.MATS[q.mt || 1], pd.l, pd.t, DECOR_SKIP[id], bobAnchor(id, q, f, pd, cv));   // 每个材料（包括 T1 黄铜）都按 SA.PAL.mat 处理
      if (OVER[id]) { ctx = cv.getContext('2d'); OVER[id](pd.l, pd.t, q); }        // 身份件（铆钉、铭牌、压力表）最后画，颜色不被材质换掉
      if (UNDER[id]) { ctx = cv.getContext('2d'); ctx.globalCompositeOperation = 'destination-over'; UNDER[id](pd.l, pd.t, q); ctx.globalCompositeOperation = 'source-over'; }   // 背景齿轮：垫在最后面
      cache.set(key, cv);
    }
    return cv;
  }
  // 腿式底盘的机身（甲壳 / 胯）在精灵里随步态下沉 bd 像素，腿脚不跟着沉：单独画一遍只有机身的 shell，
  // 和整张比对，同位置同颜色的像素算机身，纹理锚点下移 bd；其余（腿）不动。远侧腿那一层没有机身，直接 0
  function bobAnchor(id, q, f, pd, cv) {
    if ((id !== 'quad' && id !== 'biped') || !q.bd || q.part === 'far' || q.part === 'legs') return 0;
    const sh = document.createElement('canvas'); sh.width = cv.width; sh.height = cv.height;
    const keep = ctx; ctx = sh.getContext('2d');
    DRAW[id](pd.l, pd.t, { ...q, part: 'shell' });
    ctx = keep;
    const a = sh.getContext('2d').getImageData(0, 0, sh.width, sh.height).data, b = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const out = new Int8Array(cv.width * cv.height);
    for (let i = 0; i < out.length; i++) {
      const j = i * 4;
      if (a[j + 3] > 8 && a[j] === b[j] && a[j + 1] === b[j + 1] && a[j + 2] === b[j + 2]) out[i] = q.bd;
    }
    return out;
  }
  // 模块的精灵：量化状态 + 外观阶段。art 字段 = 暂时借用别的（2×2）模块的画
  function modSprite(id, o) {
    const m = SA.MODULES[id], art = m.art || id, q = quant(art, o), st = SA.stageOf(id, o.mt || 1);
    if (st > 1) q.st = st;
    return sprite(art, q, m.art ? { w: 2, h: 2 } : SA.fp(id));
  }
  // 尚无专用美术的模块先画成带中文名称的功能占位，避免借用精灵让玩家误认模块。
  // 占位仍使用材料色边框，尺寸严格按 24px 子格，后续替换 DRAW 不会影响布局和数值。
  function placeholderModule(c2d, id, x, y, o = {}) {
    const f = SA.fp(id), w = f.w * S, h = f.h * S, mat = SA.MATS[o.mt || 1];
    c2d.save();
    c2d.fillStyle = '#18232b'; c2d.fillRect(x, y, w, h);
    c2d.strokeStyle = mat.chip; c2d.lineWidth = 2; c2d.strokeRect(x + 1, y + 1, w - 2, h - 2);
    let fs = Math.min(12, Math.max(7, Math.floor(Math.min(w, h) * 0.34))), label = SA.MODULES[id].placeholder;
    c2d.font = `bold ${fs}px sans-serif`;
    while (fs > 7 && c2d.measureText(label).width > w - 4) { fs--; c2d.font = `bold ${fs}px sans-serif`; }
    c2d.fillStyle = '#f2f4f7'; c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
    c2d.fillText(label, x + w / 2, y + h / 2);
    c2d.restore();
  }
  // 有自己画的模块按原生大小贴；借用大模块精灵的小模块（1×1、1×2）暂时缩小画，以后再重画
  function drawModule(c2d, id, x, y, o = {}) {
    if (SA.MODULES[id].placeholder) { placeholderModule(c2d, id, x, y, o); ctx = c2d; return; }
    const f = SA.fp(id), img = modSprite(id, o);
    if (!SA.MODULES[id].art || (f.w === 2 && f.h === 2)) c2d.drawImage(img, x - img.ox, y - img.oy);
    else c2d.drawImage(img, img.ox, img.oy, C, C, x, y, f.w * S, f.h * S);
    ctx = c2d;
  }
  // 按 48px 设计的叠加层（裂纹、残骸）缩放到模块的实际大小
  function scaled(g, x, y, id, fn) {
    const f = SA.fp(id);
    if (f.w === 2 && f.h === 2) { fn(x, y); return; }
    g.save(); g.translate(x, y); g.scale(f.w / 2, f.h / 2); fn(0, 0); g.restore(); ctx = g;
  }

  // 通用受损叠加层
  function damage(x, y, frac, seed) {
    if (frac > 0.66) return;
    const s = (seed * 7) % 5;
    line(x + 27 + (s % 4), y + 6, x + 21, y + 19, 1, P.black);
    line(x + 21, y + 19, x + 28, y + 30, 1, P.black);
    line(x + 21, y + 19, x + 13, y + 22, 1, P.black);
    if (frac <= 0.33) {
      line(x + 8, y + 39, x + 16 + (s % 3), y + 28, 1, P.black);
      line(x + 33, y + 36, x + 40, y + 42, 1, P.black);
      ctx.fillStyle = 'rgba(7,8,12,0.4)';
      ctx.fillRect(x + 6 + s, y + 9, 10, 7);
      ctx.fillRect(x + 24, y + 31 - (s % 3), 13, 7);
    }
  }

  // 被毁舱位：框架还在，舱内烧空
  function wreck(x, y) {
    R(x + 3, y + 3, 42, 42, P.dark[0]);
    R(x + 4, y + 4, 40, 40, P.dark[1]);
    line(x + 6, y + 40, x + 18, y + 21, 3, P.iron[1]);
    line(x + 18, y + 21, x + 26, y + 29, 3, P.iron[1]);
    line(x + 30, y + 12, x + 41, y + 24, 1, P.iron[2]);
    R(x + 9, y + 9, 6, 3, P.dark[2]); R(x + 33, y + 36, 8, 4, P.dark[2]);
  }

  function blockedMark(x, y) {
    disc(x, y, 8, P.black);
    disc(x, y, 7, P.white);
    disc(x, y, 5, P.black);
    line(x - 4, y + 3, x + 3, y - 4, 2, P.white);
  }

  // ---------- 车体框架：把所有舱位连成一台机器 ----------
  // 按子格画：同一个模块内部不画缝，相邻两个模块之间打铆钉，露在外面的边描黑
  function hull(O, cx, cy) {
    const solid = (o) => o && !SA.isRam(o.cell.id) && SA.MODULES[o.cell.id].layer !== 'chassis';   // 双足的胯在车身行里，但不算车体框架
    const at = (r, c) => (r >= 0 && r < K.ROWS - 2 && c >= 0 && c < K.COLS ? O[r][c] : null);
    const body = (fn) => { for (let r = 0; r < K.ROWS - 2; r++) for (let c = 0; c < K.COLS; c++) if (solid(O[r][c])) fn(r, c, cx(c), cy(r), O[r][c]); };
    body((r, c, x, y) => R(x, y, S, S, P.iron[1]));
    body((r, c, x, y, o) => {
      const rt = at(r, c + 1), dn = at(r + 1, c);
      if (solid(rt) && rt !== o) for (const yy of [6, 16]) rivet(x + S - 2, y + yy, P.iron[3]);
      if (solid(dn) && dn !== o) for (const xx of [6, 16]) rivet(x + xx, y + S - 2, P.iron[3]);
    });
    body((r, c, x, y) => {
      if (!solid(at(r - 1, c))) { R(x, y, S, 1, P.iron[0]); R(x + 1, y + 1, S - 1, 1, P.iron[3]); }
      if (!solid(at(r, c - 1))) { R(x, y, 1, S, P.iron[0]); R(x + 1, y + 1, 1, S - 1, P.iron[2]); }
      if (!solid(at(r, c + 1))) R(x + S - 1, y, 1, S, P.iron[0]);
      if (!solid(at(r + 1, c))) R(x, y + S - 1, S, 1, P.iron[0]);
    });
  }

  // ---------- 整车渲染 ----------
  const pool = {};
  function vehCanvas(key) {
    if (!pool[key]) {
      pool[key] = document.createElement('canvas');
      pool[key].width = K.COLS * S + PADX * 2;
      pool[key].height = K.ROWS * S + BOT;   // 底下留边给伸长的悬挂
    }
    return pool[key];
  }

  // 双足远侧腿单独画在一层上（同尺寸），再垫到车体下面
  const farLayers = new Map();
  function farLayer(cv) {
    let f = farLayers.get(cv);
    if (!f) { f = document.createElement('canvas'); farLayers.set(cv, f); }
    if (f.width !== cv.width || f.height !== cv.height) { f.width = cv.width; f.height = cv.height; }
    return f;
  }
  function renderVehicle(veh, o = {}) {
    const cv = vehCanvas(o.key || 'default');
    const g = cv.getContext('2d');
    ctx = g;
    g.clearRect(0, 0, cv.width, cv.height);
    const t = o.t || 0;
    const blocked = o.blocked || [];
    const isBlocked = (r, c) => blocked.some(b => b.r === r && b.c === c);
    const cx = (c) => PADX + c * S, cy = (r) => r * S;
    const O = SA.V.occ(veh, 'body');
    // 底盘锚点行：履带 / 四足在倒数第二行，真双足 2×4 在倒数第四行
    const CH = SA.V && SA.V.chassisRowOf ? SA.V.chassisRowOf(veh) : K.ROWS - 2;

    // 底盘行：履带任意一段被毁 → 整条掉链；腿式底盘的步态决定机身下沉量 bd
    const base = veh.body[CH];
    const thrown = base.some(x => x && x.id === 'track' && x.hp <= 0);
    const amp = base.some(x => x && x.id === 'track') ? 0 : Math.max(0, ...base.map(x => (x && x.hp > 0 && BOB[x.id]) || 0));
    const dyn = o.dyn || null;   // SA.Dyn.animator：战斗里提供行驶相位、后坐、供弹；改装台 / 预览不传就是静止
    const phase = dyn ? dyn.phase : (o.phase || 0);
    // 整件四足：dyn.phase 是步态角（战斗里按走过的距离 ÷ (4 × 步幅) 推进一圈），步幅跟着车速变；机身起伏按 quadBob
    const hasQuad = base.some(x => x && x.id === 'quad' && x.hp > 0), bipC = base.findIndex(x => x && x.id === 'biped'), hasBiped = bipC >= 0 && base[bipC].hp > 0;
    const stride = (hasQuad ? SA.LEGLAB.quadStride : SA.LEGLAB.strideFor)(o.speed || 0), gaitA = Math.round(phase / (Math.PI * 2 / 12)) * (Math.PI * 2 / 12);
    const bd = hasQuad ? SA.LEGLAB.quadBob({ mv: !!o.moving, a: gaitA, stride: Math.round(stride / 4) * 4 })
      : hasBiped ? SA.LEGLAB.bipedBob({ mv: !!o.moving, a: gaitA, stride: Math.round(stride / 4) * 4 })
      : amp - Math.round(Math.abs(Math.sin((o.moving ? gfOf(phase) : 0) / 12 * Math.PI * 2)) * amp);
    const isChassis = (id) => SA.MODULES[id].layer === 'chassis';
    const dy = (id, r) => (isChassis(id) ? 0 : bd);   // 底盘自己处理下沉，其余整体随之起伏
    // 双足的腰挂位（胯层左右各一大格）上有没有模块：有就让胯伸出法兰板压住
    const waist = (c0) => { for (let r = CH; r < CH + 2; r++) for (let c = c0; c < c0 + 2; c++) { const x = c >= 0 && c < K.COLS && O[r][c]; if (x && x.cell.id !== 'biped') return true; } return false; };

    const modOpts = (cell, r, c) => {
      const m = SA.MODULES[cell.id];
      const row = veh.body[r], w = SA.fp(cell.id).w;
      const same = (k) => k >= 0 && k < K.COLS && row[k] && row[k].id === cell.id;
      // 正上方紧贴着（非撞击件的）模块：底盘据此画出承托
      let above = null;
      if (r > 0) for (let k = c; k < c + w; k++) { const a = O[r - 1][k]; if (a && !SA.isRam(a.cell.id)) above = a.cell; }
      return {
        t, heat: o.heat || 0, water: o.water, moving: o.moving, seed: r * 3 + c, bd, mt: cell.mt, up: cell.lv || 0, look: ['quad', 'biped'].includes(cell.id) ? cell.look : undefined,
        gnd: o.gnd && m.layer === 'chassis' ? o.gnd[`${r},${c}`] || [0, 0] : null,   // 悬挂：每格两个接地点各自上下（像素，正 = 往下伸）
        gL: o.gnd && same(c - w) && o.gnd[`${r},${c - w}`] ? o.gnd[`${r},${c - w}`][1] : 0,   // 左右相邻同类底盘靠近本格的那个接地点（履带连成一条）
        gR: o.gnd && same(c + w) && o.gnd[`${r},${c + w}`] ? o.gnd[`${r},${c + w}`][0] : 0,
        recoil: dyn ? dyn.recoilOf(`${r},${c},${m.layer === 'side' ? 's' : 'b'}`) : 0,
        feed: dyn ? dyn.feedOf(`${r},${c},${m.layer === 'side' ? 's' : 'b'}`) : 0,
        flash: dyn ? dyn.flashOf(`${r},${c},${m.layer === 'side' ? 's' : 'b'}`) : 0,   // 喷射器 / 喷火器：正在喷
        out: !!(o.tetherCell && o.tetherCell === cell),   // 鱼叉：已射出、绳子拴着对手
        store: o.store,   // 蓄压罐：全车存量 0～1
        a: o.elev ? o.elev[`${r},${c},${m.layer === 'side' ? 's' : 'b'}`] : undefined,   // 炮管仰角（度）：战斗里跟着鼠标转
        punch: o.punch ? (o.punch[`${r},${c}`] || 0) : 0,
        phase, gait: phase, stride,
        g4: cell.id === 'quad' && o.gnd ? o.gnd[`${r},${c}`] || null : null,
        g2: cell.id === 'biped' && o.gnd ? o.gnd[`${r},${c}`] || null : null,
        wL: cell.id === 'biped' && waist(c - 2), wR: cell.id === 'biped' && waist(c + 2),
        connL: same(c - w),
        connR: same(c + w),
        ...run(row, c),
        top: !!(above && !SA.isRam(above.id)),
        thrown, snap: cell.id === 'track' && cell.hp <= 0,
      };
    };
    // 同类底盘连续段：本格在段内的序号与段长（腿按整段分配）
    const run = (row, c) => {
      const id = row[c].id, w = SA.fp(id).w;
      let a0 = c, a1 = c;
      while (a0 - w >= 0 && row[a0 - w] && row[a0 - w].id === id) a0 -= w;
      while (a1 + w < K.COLS && row[a1 + w] && row[a1 + w].id === id) a1 += w;
      return { ri: (c - a0) / w, rn: (a1 - a0) / w + 1 };
    };
    // 被毁的底盘/撞击件：压暗 + 裂纹，不画成半透明虚影
    const dead = (fn) => { g.save(); g.filter = 'brightness(0.45)'; fn(); g.restore(); ctx = g; };

    // 远侧腿：在整个车体之前画，被车体遮住一部分
    base.forEach((cell, c) => {
      if (!cell || !BOB[cell.id] || cell.id === 'biped') return;
      const r = CH, draw = () => { g.save(); if (cell.id === 'quad' && o.ghostLegs) g.globalAlpha = 0.35; drawModule(g, cell.id, cx(c), cy(r), { ...modOpts(cell, r, c), part: 'far' }); g.restore(); ctx = g; };
      if (cell.hp > 0) draw(); else dead(draw);
    });
    g.save(); g.translate(0, bd); hull(O, cx, cy); g.restore(); ctx = g;
    // 主体层：底盘/撞击 → 其他 → 武器（炮管压在相邻格上，被挡时一眼可见）
    // 整件四足（pass 3）：甲壳和近侧腿压在整个车身前面（同 tools/chassis-lab.html），膝盖高过机身也不会被模块挡住
    // 撞击件（pass 4）画在四足的腿前面，装在车头的铲斗、撞角不会被腿挡住。
    // o.ghostLegs（改装台正在摆放 / 拖动模块时）：四足的腿画成半透明，看得清底盘两侧的格子
    const order = (id) => (SA.isRam(id) ? 4 : id === 'quad' || id === 'biped' ? 3 : SA.isWeapon(id) ? 2 : isChassis(id) ? 0 : 1);
    for (const pass of [0, 1, 2, 3, 4]) {
      // 真双足：躯干画完（pass 3 之前）把露在外面的角切成斜角，再把远侧腿垫到最底下（destination-over），切角不会切到腿
      if (pass === 3 && bipC >= 0) {
        g.save(); g.translate(0, bd); SA.LEGLAB.torsoCuts(g, veh, bipC, PADX); g.restore();
        const fl = farLayer(cv), cell = base[bipC], fg = fl.getContext('2d');
        fg.clearRect(0, 0, fl.width, fl.height);
        fg.save(); if (o.ghostLegs) fg.globalAlpha = 0.35; if (cell.hp <= 0) fg.filter = 'brightness(0.45)';
        drawModule(fg, 'biped', cx(bipC), cy(CH), { ...modOpts(cell, CH, bipC), part: 'far' });
        fg.restore();
        g.save(); g.globalCompositeOperation = 'destination-over'; g.drawImage(fl, 0, 0); g.restore(); ctx = g;
      }
      eachCell(veh.body, (cell, r, c) => {
        if (order(cell.id) !== pass) return;
        const x = cx(c), y = cy(r) + dy(cell.id, r);
        const mo = { ...modOpts(cell, r, c), part: 'near' };
        const f = SA.fp(cell.id);
        if (cell.hp <= 0) {
          ctx = g;
          if (cell.id === 'track') { drawModule(g, cell.id, x, y, mo); scaled(g, x, y, cell.id, (xx, yy) => damage(xx, yy, 0, r * 8 + c)); }
          else if (cell.id === 'quad' || cell.id === 'biped') dead(() => drawModule(g, cell.id, x, y, mo));
          else if (isChassis(cell.id) || SA.isRam(cell.id)) { dead(() => drawModule(g, cell.id, x, y, mo)); scaled(g, x, y, cell.id, (xx, yy) => damage(xx, yy, 0, r * 8 + c)); }
          else scaled(g, x, y, cell.id, wreck);
          return;
        }
        if ((cell.id === 'quad' || cell.id === 'biped') && o.ghostLegs) {
          drawModule(g, cell.id, x, y, { ...mo, part: 'shell' });
          g.save(); g.globalAlpha = 0.35; drawModule(g, cell.id, x, y, { ...mo, part: 'legs' }); g.restore(); ctx = g;
        } else { if (cell.id === 'rocket_rack') Object.assign(mo, rocketLive(cell, mo)); drawModule(g, cell.id, x, y, mo); }
        if (SA.isCockpit(cell.id)) cockpitCrew(g, cell.id, x, y, mo, veh, o);
        if (cell.id === 'boiler_l') bigStoker(g, x, y, mo);
        weaponFx(g, cell.id, x, y, mo);
        if (cell.id !== 'quad' && cell.id !== 'biped') scaled(g, x, y, cell.id, (xx, yy) => damage(xx, yy, cell.hp / (cell.max || SA.mod(cell).hp), r * 8 + c));   // 四足的格子大半是腿间空地，裂纹会画在空中
        if (o.showBlocked && isBlocked(r, c)) blockedMark(x + f.w * S + 12, y + f.h * S - 21);
      });
    }
    if (o.dimBody) { g.fillStyle = 'rgba(7,8,12,0.55)'; g.fillRect(0, 0, cv.width, cv.height); }
    if (o.dimCell) { const dc = veh.body[o.dimCell.r][o.dimCell.c], f = dc ? SA.fp(dc.id) : { w: 2, h: 2 }; g.fillStyle = 'rgba(7,8,12,0.55)'; g.fillRect(cx(o.dimCell.c), cy(o.dimCell.r) + bd, f.w * S, f.h * S); }

    // 侧挂层：硬阴影 + 本体，明确“在另一个平面”
    eachCell(veh.side, (cell, r, c) => {
      if (cell.hp <= 0) return;
      const img = modSprite(cell.id, modOpts(cell, r, c));
      g.save();
      g.globalAlpha = o.dimSide ? 0.35 : 1;
      g.filter = 'brightness(0) opacity(0.55)';
      g.drawImage(img, cx(c) + 3 - img.ox, cy(r) + 3 + bd - img.oy);
      g.filter = 'none';
      g.drawImage(img, cx(c) - img.ox, cy(r) + bd - img.oy);
      g.restore();
      ctx = g;
      scaled(g, cx(c), cy(r) + bd, cell.id, (xx, yy) => damage(xx, yy, cell.hp / (cell.max || SA.mod(cell).hp), r * 8 + c + 3));
    });
    ctx = g;
    return cv;
  }

  // 驾驶舱舷窗里的车手（碳球，js/coal.js）：模块精灵里原有的驾驶员被盖掉，换成这台车自己的车手。
  // 1×1 驾驶舱一个舷窗；联合驾驶舱四个，第一个是车手，其余三个是船员。画在材质处理之后，颜色不被换掉
  // 驾驶员：按 COCKPIT_ART 的座位分排画（剪在舱窗里），排与排之间叠中层，最后叠前层（操纵件、挡板）
  function cockpitCrew(g, id, x, y, mo, veh, o) {
    const A = COCKPIT_ART[id];
    if (!A) return;
    const main = o.pilot ? (typeof o.pilot === 'string' ? SA.Coal && (SA.Coal.byName[o.pilot] || SA.Coal.crew(o.pilot)) : o.pilot) : SA.Coal && SA.Coal.pilotOf(veh);
    const st = SA.stageOf(id, mo.mt || 1), seed = mo.seed || 0;
    let i = 0;
    const row = (seats) => {
      if (!SA.Coal) return;
      g.save(); g.beginPath(); g.rect(x + A.win[0], y + A.win[1], A.win[2], A.win[3]); g.clip();
      for (const [sx, sy] of seats) {
        const ch = i === 0 ? main : SA.Coal.crew(`${veh && veh.name}-${i}`);
        const f = ((Math.floor((o.t || 0) * 1.5 + seed + i) % 4) + 4) % 4, bob = f === 1 || f === 2 ? 1 : 0;
        g.drawImage(SA.Coal.mini(ch, { blink: !o.crewExpr && f === 3 && (seed + i) % 2 === 0, expr: o.crewExpr, st }), x + sx - 5, y + sy - 6 + (o.crewExpr === 'sad' ? 1 : bob));
        i++;
      }
      g.restore();
    };
    A.rows.forEach((seats, k) => { row(seats); if (k === 0 && A.mid) drawModule(g, id, x, y, { ...mo, layer: 'mid' }); });
    drawModule(g, id, x, y, { ...mo, layer: 'front' });
    ctx = g;
  }

  // 大锅炉的司炉小工：画在材质处理之后，颜色不被换掉；一铲 60 拍（约 3.6 秒）
  function bigStoker(g, x, y, mo) {
    if (!SA.Coal) return;
    const mini = SA.Coal.mini(SA.Coal.crew('司炉小工'), { st: SA.stageOf('boiler_l', mo.mt || 1) });
    BIG.stoker(g, x, y, { t: (mo.t || 0) * 16.7 + (mo.seed || 0) * 7 }, mini); ctx = g;
  }

  // 火箭架的齐射节奏：战斗里只有「开了第几发」（feed），这里按时间记一轮：0.9 秒打完 → 空 3 秒 → 2 秒里一枚枚装回
  const RKT = new WeakMap();
  function rocketLive(cell, mo) {
    const t = mo.t || 0, R = RKT.get(cell) || { feed: mo.feed || 0, start: -99 };
    if ((mo.feed || 0) > R.feed) { if (t - R.start > 1.2) R.start = t; R.feed = mo.feed; }
    RKT.set(cell, R);
    const d = t - R.start;
    if (d < 0.9) return { rs: Math.max(0.01, d / 0.9), rn: 4 };
    const e = d - 0.9;
    return { rs: 0, rn: e < 3 ? 0 : e < 5 ? Math.min(4, 1 + Math.floor((e - 3) / 0.5)) : 4 };
  }
  // 特殊武器的汽 / 火（材质处理之后逐帧画，颜色不被换掉）
  function weaponFx(g, id, x, y, mo) {
    const T = (mo.t || 0) * 16.7, a = mo.a == null ? 0 : mo.a;
    if (id === 'piston') BIG.ramFx(g, id, x, y, { mt: SA.stageOf('piston', mo.mt || 1) >= 2 ? 5 : 1, c: pistonCharge(mo.punch || 0), hit: pistonHit(mo.punch || 0), t: T });
    else if (id === 'boss_core' || id === 'boss_lens') BIG.bossFx(g, id, x, y, { t: T });
    else if (id === 'pressure_tank' || id === 'rangefinder') BIG.auxFx(g, id, x, y, { t: T, lv: mo.store == null ? 0.6 : mo.store });
    else if (id === 'steamjet') BIG.steamjetFx(g, x, y, { a, t: T, on: mo.flash > 0 });
    else if (id === 'flamer') BIG.flamerFx(g, x, y, { a, t: T, on: mo.flash > 0 });
    else if (id === 'rocket_rack') BIG.rocketFx(g, x, y, { a: mo.a == null ? 20 : mo.a, t: T, n: mo.rn == null ? 4 : mo.rn, s: mo.rs || 0 }, SA.stageOf('rocket_rack', mo.mt || 1));
    else return;
    ctx = g;
  }

  function eachCell(grid, fn) {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++)
        if (grid[r][c]) fn(grid[r][c], r, c);
  }

  // ---------- 高亮描边：白芯黑边（主体）/ 洋红（侧挂）----------
  function outline(c2d, x, y, w, h, inner, outer, dash) {
    ctx = c2d;
    if (dash != null) {
      const per = 2 * (w + h) + 4;
      for (let i = 0; i < per; i++) {
        const col = ((i + dash) >> 2) % 2 === 0 ? inner : outer;
        let px, py;
        if (i < w + 2) { px = x - 1 + i; py = y - 1; }
        else if (i < w + h + 3) { px = x + w; py = y - 1 + (i - w - 2); }
        else if (i < 2 * w + h + 4) { px = x + w - (i - w - h - 3); py = y + h; }
        else { px = x - 1; py = y + h - (i - 2 * w - h - 4); }
        R(px, py, 2, 2, col);
      }
      return;
    }
    R(x - 3, y - 3, w + 6, 1, outer); R(x - 3, y + h + 2, w + 6, 1, outer);
    R(x - 3, y - 3, 1, h + 6, outer); R(x + w + 2, y - 3, 1, h + 6, outer);
    R(x - 2, y - 2, w + 4, 2, inner); R(x - 2, y + h, w + 4, 2, inner);
    R(x - 2, y - 2, 2, h + 4, inner); R(x + w, y - 2, 2, h + 4, inner);
  }

  // ---------- UI 图标（9×9，顶栏导航等）----------
  const ICONS = {
    coin: ['..#####..', '.#.....#.', '#...##..#', '#..#....#', '#.####..#', '#..#....#', '#.#####.#', '.#.....#.', '..#####..'],
    wrench: ['......##.', '.....#..#', '......#.#', '.....####', '....##...', '...##....', '..##.....', '.##......', '##.......'],
    gear: ['...###...', '.#.###.#.', '..#####..', '####.####', '###...###', '####.####', '..#####..', '.#.###.#.', '...###...'],
    scroll: ['.#######.', '#.#.....#', '.##.###.#', '..#.....#', '..#.###.#', '..#.....#', '..#.###.#', '..#.....#', '..######.'],
    trophy: ['#########', '#.#####.#', '#.#####.#', '.#.###.#.', '...###...', '....#....', '....#....', '..#####..', '..#####..'],
    dice: ['#########', '#.......#', '#.#...#.#', '#.......#', '#...#...#', '#.......#', '#.#...#.#', '#.......#', '#########'],
    swords: ['#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '.##...##.', '.##...##.', '#.......#'],
    cloud: ['.........', '...###...', '..#####..', '.#######.', '#########', '#########', '.#######.', '.........', '.........'],
    back: ['...#.....', '..##.....', '.########', '#########', '.########', '..##.....', '...#.....', '.........', '.........'],
    flag: ['##.......', '#####....', '#######..', '#####....', '##.......', '#........', '#........', '#........', '##.......'],
    eye: ['.........', '..#####..', '.#.....#.', '#..###..#', '#..###..#', '.#.....#.', '..#####..', '.........', '.........'],
  };
  const bits = (rows, x, y, c, s = 1) => {
    ctx.fillStyle = c;
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(x + i * s, y + j * s, s, s); });
  };

  function iconCanvas(name, color, scale = 3) {
    const cv = document.createElement('canvas');
    cv.width = 9; cv.height = 9;
    ctx = cv.getContext('2d');
    bits(ICONS[name], 0, 0, color);
    cv.style.width = cv.style.height = `${9 * scale}px`;
    cv.className = 'px';
    return cv;
  }

  // 模块卡片预览（含炮管伸出），主体模块带一圈车体框架
  function moduleCanvas(id, scale = 1, mt = 1) {
    // 整件四足的腿往前后张、膝盖高过机身：卡片左右上都多留一点，整只蜘蛛都画得进去
    const ex = id === 'quad' ? { l: 24, t: 18, r: 0 } : id === 'biped' ? { l: 24, t: 4, r: 16 } : { l: 0, t: 0, r: 0 };
    const f = SA.fp(id), fw = f.w * S, fh = f.h * S, W = Math.max(C, fw) + 32 + ex.l + ex.r, H = Math.max(C, fh) + 4 + ex.t, oy = H - 2 - fh, ox = 2 + ex.l;   // 小模块按实际大小画，底边对齐
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    ctx = g;
    if (SA.MODULES[id].layer === 'body') { R(ox, oy, fw, fh, P.iron[1]); R(ox, oy, fw, 1, P.iron[0]); R(ox, oy, 1, fh, P.iron[0]); R(ox + fw - 1, oy, 1, fh, P.iron[0]); R(ox, oy + fh - 1, fw, 1, P.iron[0]); }
    drawModule(g, id, ox, oy, { heat: 0.5, water: 0.7, t: 0, mt });
    if (SA.isCockpit(id)) cockpitCrew(g, id, ox, oy, { mt, seed: 0 }, null, { pilot: '你' });
    if (id === 'boiler_l') bigStoker(g, ox, oy, { mt, t: 0 });
    cv.style.width = `${W * scale}px`; cv.style.height = `${H * scale}px`;
    cv.className = 'px';
    return cv;
  }

  // ---------- 3×5 像素字（伤害数字）----------
  const FONT = {
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
    '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
    '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'],
    'M': ['#.#', '###', '###', '#.#', '#.#'], 'I': ['###', '.#.', '.#.', '.#.', '###'],
    'S': ['###', '#..', '###', '..#', '###'], '-': ['...', '...', '###', '...', '...'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  };
  function text(c2d, str, x, y, color, s = 3) {
    ctx = c2d;
    let cx = Math.round(x - (str.length * 4 * s - s) / 2);
    for (const ch of str) {
      const g = FONT[ch];
      if (g) { bits(g, cx + s, y + s, P.black, s); bits(g, cx, y, color, s); }
      cx += 4 * s;
    }
  }

  return {
    PADX, drawModule, cockpitCrew, bigStoker, weaponFx, renderVehicle, outline, iconCanvas, moduleCanvas, text, decorate,
    setMatPass: (fn) => { matPass = fn || null; cache.clear(); },
    useCtx: (c) => { ctx = c; }, R: (...a) => R(...a), disc: (...a) => disc(...a), line: (...a) => line(...a),
  };
})();
