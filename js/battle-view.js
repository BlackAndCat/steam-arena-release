/* 竞技场画面层：只负责画布、镜头、HUD、输入和视觉事件呈现。规则状态由 battle.js 提供接口。 */
window.SA = window.SA || {};
SA.BattleView = SA.BattleView || {};
SA.BattleView.create = function createBattleView(api) {
  const h = SA.h, K = SA.K, T = K.BATTLE, M = SA.MODULES, P = SA.PAL, C = K.CELL, PADX = SA.SPR.PADX;
  const W = 1280, H = 720, GROUND = 648, VY = GROUND - K.ROWS * C;
  const VW = K.COLS * C + PADX * 2;
  const HALF = C / 2;
  const alive = api.alive, clamp = api.clamp, rnd = api.rnd, gauss = api.gauss;
  const camera = api.camera;
  const isP = api.isP, cellX = api.cellX, cellY = api.cellY, frontEdge = api.frontEdge;
  const groundAt = api.groundAt, crateAt = api.crateAt, modBox = api.modBox, modCenter = api.modCenter, cellAt = api.cellAt, modAt = api.modAt;
  const muzzle = api.muzzle, targetAt = api.targetAt, aimAngle = api.aimAngle, spreadDeg = api.spreadDeg, barrel = api.barrel, launch = api.launch, predict = api.predict;
  const tiltOf = api.tiltOf, pivY = api.pivY, toWorld = api.toWorld;
  const step = api.step;
  let B = null, cv, g, dg, wc, wrap, hud = {};
  let DPX = 1;
  // 触屏（手指为主的设备）：战斗换成手机布局（js 加 .touchui，css/style.css 排版），教程讲触屏操作
  let touchUI = false;
  const isTouchUI = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const ZMIN = 0.62;
  const sync = () => { B = api.getState(); return B; };
  const part = (type, x, y, vx, vy, life, col) => emit('part', { type, x, y, vx, vy, life, col });
  const vr = (a, b) => a + Math.random() * (b - a);
  const vpart = (type, x, y, vx, vy, life, col) => B.parts.push({ type, x, y, vx, vy, life, max: life, col, spin: vr(8, 22) });
  const SHARDS = { plate: 7, armor: 10, armor_heavy: 14 };
  function ricochetFx(x, y, back) {
    if (B.headless) return;
    vpart('ping', x, y, 0, 0, 0.22);
    const a = vr(0.35, 0.95), sp = vr(430, 560);
    vpart('glance', x, y, back * Math.cos(a) * sp, -Math.sin(a) * sp, 0.3);
    for (let i = 0; i < 2; i++) { const b = vr(0.2, 1.3), v = vr(220, 360); vpart('glance', x, y, back * Math.cos(b) * v * (i ? 1 : -0.6), -Math.sin(b) * v, 0.16); }
    for (let i = 0; i < 9; i++) vpart('spark', x, y, back * vr(20, 190), vr(-220, -20), vr(0.12, 0.3), i % 3 ? P.white : P.brass[3]);
    B.texts.push({ str: SA.Config.text('battle_view_ricochet'), x: x + vr(-6, 6), y: y - 34, life: 1, max: 1, col: P.iron[4], plaque: P.glass[2] });
  }
  function shatterFx(x, y, cell) {
    if (B.headless || !SHARDS[cell.id]) return;
    const mat = SA.MATS[cell.mt || 1], cols = [P.iron[3], P.iron[4], cell.mt > 1 ? mat.chip : P.iron[2]];
    for (let i = 0; i < SHARDS[cell.id]; i++) vpart('shard', x + vr(-10, 10), y + vr(-10, 10), vr(-170, 170), vr(-280, -80), vr(1.1, 1.8), cols[i % 3]);
    vpart('ping', x, y, 0, 0, 0.18);
  }
  function emit(type, data = {}) {
    sync();
    if (!B || B.headless) return;
    if (type === 'part') B.parts.push({ ...data, max: data.life });
    else if (type === 'text') { if (DMG_RE.test(data.str)) addDmg(data); else B.texts.push({ ...data, life: data.life == null ? 0.9 : data.life }); }
    else if (type === 'particles') for (const p of data.items || []) B.parts.push({ ...p, max: p.life });
    else if (type === 'texts') for (const t of data.items || []) { if (DMG_RE.test(t.str)) addDmg(t); else B.texts.push({ ...t, life: t.life == null ? 0.9 : t.life }); }
    else if (type === 'ricochet') ricochetFx(data.x, data.y, data.back);
    else if (type === 'shatter') shatterFx(data.x, data.y, data.cell);
    else if (type === 'surrender-start') surrenderHint(true);
    else if (type === 'surrender') {
      surrenderHint(false);
      const e = B.e, why = data.why;
      SA.UI.dialog(SA.Config.text('battle_view_surrender_title', e.name), [
        h('p', { style: 'margin-top:0' }, SA.Config.text('battle_view_surrender_reason', why)),
        h('p', {}, h('b', {}, SA.Config.text('battle_view_accept_prefix')), SA.Config.text('battle_view_accept_detail'), h('b', {}, SA.Config.text('battle_view_reputation')), SA.Config.text('battle_view_period')),
        h('p', { class: 'muted' }, SA.Config.text('battle_view_refuse_detail')),
      ], [{ label: SA.Config.text('battle_view_accept_button'), primary: true, onClick: () => api.acceptSurrender() }], SA.Config.text('battle_view_refuse_button'), () => api.refuseSurrender());
    }
  }
  // ---------- 背景：按场次换场景（js/scenes.js）----------
  // 铁匠铺后院（序章）/ 野地（遭遇战）/ 预选赛（其余比赛）。天空不动，远景、中远景、中景按不同视差平移，地面 1:1，
  // 近景（废料堆、长草、前排观众）压在车前面、画面最下沿，移动得比车还快。场景动效用自己的时钟，不跟战斗暂停
  let BD = null;
  const sceneT = () => performance.now() / 1000;
  function drawBackdrop(vw, vh, oy) { SA.Scenes.back(BD, g, vw, vh, oy, B.cam.x, sceneT(), B.opts); }
  function drawFloor() { SA.Scenes.floor(BD, g, B.cam); if (B.bounds) SA.Scenes.barriers(BD, g, B.bounds, groundAt, sceneT()); }   // 有场地边界时两头摆路障
  function drawNear(vw, vh, oy) { SA.Scenes.front(BD, g, vw, vh, oy, B.cam.x, sceneT()); }

  // ---------- 绘制 ----------
  // 地形：土坡填满到地面、泥地一层湿泥、货箱（木板 + 铁包角，越破裂纹越多）
  function drawTerrain() {
    const T = B.ter;
    if (!T) return;
    if (!T.art && ((T.def.hills || []).length || T.mud.length)) T.art = SA.TerrainArt.layer(T.ground, T.mud, W, H, GROUND);   // 土坡 + 泥地：静态像素层，只画一次
    if (T.art) g.drawImage(T.art, 0, 0);
    for (const c of T.crates) {
      if (c.dead) SA.TerrainArt.rubble(g, c.x0 - 6, c.x1 + 6, c.y1);
      else SA.TerrainArt.crate(g, c.x0, c.y0, Math.round(c.x1 - c.x0), Math.round(c.y1 - c.y0), c.hp / c.max, c.shake > 0 ? (Math.floor(B.t * 40) % 2 ? 1 : -1) : 0);
    }
  }

  // 把世界层放到屏幕上。镜头缩放 × 设备像素比几乎总不是整数，直接最近邻放大会让像素一列宽一列窄（看起来撕裂、发虚），
  // 两次放大（世界 → 1280×720 → CSS）更是雪上加霜。做法（sharp bilinear）：
  // 先按整数倍 n 最近邻放大（每个像素严格 n×n），剩下不到 2 倍的零头用双线性补齐 —— 像素大小一致，只有边缘 1 个设备像素的过渡。
  // 镜头的亚像素位移在这一步平滑处理，车和背景一起移动，不会一顿一顿
  let upC = null;
  function present(vw, vh, ox, oy, base) {
    const cam = B.cam, Z = cam.z * DPX, n = Math.max(1, Math.floor(Z + 0.001));
    dg.setTransform(1, 0, 0, 1, 0, 0);
    if (base) { dg.fillStyle = P.bg[3]; dg.fillRect(0, 0, cv.width, cv.height); }
    const dx = -(cam.x - ox) * Z, dy = -(cam.y - oy) * Z;
    if (n === 1 && Math.abs(Z - 1) < 0.001) {   // 正好 1:1
      dg.imageSmoothingEnabled = false;
      dg.drawImage(wc, 0, 0, vw, vh, Math.round(dx), Math.round(dy), vw, vh);
      return;
    }
    let src = wc;
    if (n > 1) {
      upC = upC || document.createElement('canvas');
      if (upC.width < vw * n || upC.height < vh * n) { upC.width = Math.max(upC.width, vw * n); upC.height = Math.max(upC.height, vh * n); }
      const u = upC.getContext('2d');
      u.imageSmoothingEnabled = false;
      u.clearRect(0, 0, vw * n, vh * n);
      u.drawImage(wc, 0, 0, vw, vh, 0, 0, vw * n, vh * n);
      src = upC;
    }
    dg.imageSmoothingEnabled = true;
    dg.imageSmoothingQuality = 'low';
    dg.drawImage(src, 0, 0, vw * n, vh * n, dx, dy, vw * Z, vh * Z);
  }

  function draw() {
    const t = B.t;
    g = wc.getContext('2d');
    // 世界画布只装镜头看得到的那一块：先平移到镜头左上角，背景之后在屏幕空间里画
    const cam = B.cam, ox = Math.floor(cam.x), oy = Math.floor(cam.y);
    const vw = Math.min(wc.width, Math.ceil(cam.w) + 2), vh = Math.min(wc.height, Math.ceil(cam.h) + 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;   // 车身倾斜旋转时用最近邻采样，保持像素块
    drawBackdrop(vw, vh, oy);
    g.save();
    g.translate(-ox, -oy);
    drawFloor();
    const shx = B.shake ? Math.round(rnd(-B.shake, B.shake)) : 0, shy = B.shake ? Math.round(rnd(-B.shake, B.shake)) : 0;
    g.save();
    g.translate(shx, shy);
    drawTerrain();
    g.restore();
    g.restore();
    // 第 1 层：背景 + 地面 + 地形（世界像素）
    present(vw, vh, ox, oy, true);
    // 氛围（js/scenes.js，设备分辨率、平滑）：车后面一层雾、灯光、车底软影；车前面一层薄雾、调色、超近景虚化剪影、暗角
    const fxc = { W: cv.width, H: cv.height, Z: cam.z * DPX, dpx: DPX, zoom: cam.z, camx: cam.x, camy: cam.y, ox, oy, vw, vh, t: sceneT(), opts: B.opts, aim: B.aim,
      cars: [B.p, B.e].map(s => { const b = sideBox(s), ix = introDx(s); return isFinite(b.x0) ? { ...b, x0: b.x0 + ix, x1: b.x1 + ix, cx: b.cx + ix, ground: groundAt(b.cx + ix) } : null; }).filter(Boolean) };
    SA.Scenes.fxBack(BD, dg, fxc);

    // 第 2 层：车。车会跟着坡度连续倾斜，在世界像素里最近邻旋转会让像素行断成台阶、每帧还跳来跳去（撕裂 / 闪烁），
    // 所以车直接画在设备分辨率上：车身画布先整数倍最近邻放大，再带着旋转双线性画上去 —— 像素块大小一致，斜边平滑不抖
    const Z = cam.z * DPX;
    const aimT = B.aim && !B.e.dead ? targetAt(B.e, B.aim[0], B.aim[1]) : null;
    const opts = (s, key, extra) => ({ key, t, heat: s.heat / s.heatMax, water: s.water / Math.max(1, s.waterMax), dyn: s.anim, elev: s.elev, punch: s.punch, tetherCell: s.tether ? s.tether.cell : null, store: s.storeMax > 0 ? s.store / s.storeMax : 0, moving: s.moving, speed: Math.abs(s.vx), gnd: s.gnd, crouch: s.crouch || 0, air: (s.airDuration || 0) > 0, tuck: s.tuck || 0, ...extra });
    const pc = SA.SPR.renderVehicle(B.p.v, opts(B.p, 'bp', introCar(B.p)));
    const sur = api.surrenderState();
    const ec = SA.SPR.renderVehicle(B.e.v, opts(B.e, 'be', { ...(sur ? { crewExpr: sur.crewExpression } : null), ...introCar(B.e) }));
    dg.setTransform(Z, 0, 0, Z, (shx - cam.x) * Z, (shy - cam.y) * Z);
    g = dg;
    bipedAir(B.p); bipedAir(B.e);
    drawVehicle(B.p, pc, null, Z); drawVehicle(B.e, ec, aimT, Z);

    // 第 3 层：炮弹、粒子、伤害数字（世界像素，透明底）
    g = wc.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, vw, vh);
    g.save();
    g.translate(shx - ox, shy - oy);

    // 战斗侧给出两端世界坐标，缆绳随双方移动和倾斜，失效后同帧停止绘制。
    for (const s of [B.p, B.e]) {
      const tether = api.tetherState(s);
      if (!tether) continue;
      SA.SPR.useCtx(g);
      SA.SPR.line(...tether.from.map(Math.round), ...tether.to.map(Math.round), 2, P.leather[1]);
    }
    for (const sh of B.shots) {
      const tr = sh.trail || [];
      if (sh.big) {
        for (let i = 0; i < tr.length - 1; i++) { g.fillStyle = i < tr.length - 3 ? P.steam[0] : P.steam[1]; g.fillRect(Math.round(tr[i][0]) - 2, Math.round(tr[i][1]) - 2, 3, 3); }
        g.fillStyle = P.brass[0]; g.fillRect(Math.round(sh.x) - 4, Math.round(sh.y) - 4, 9, 9);
        g.fillStyle = P.brass[2]; g.fillRect(Math.round(sh.x) - 3, Math.round(sh.y) - 3, 7, 7);
        g.fillStyle = P.brass[3]; g.fillRect(Math.round(sh.x) - 3, Math.round(sh.y) - 3, 3, 2);
      } else {
        const p0 = tr[0] || [sh.x, sh.y];
        SA.SPR.useCtx(g); SA.SPR.line(Math.round(p0[0]), Math.round(p0[1]), Math.round(sh.x), Math.round(sh.y), 3, P.fire[3]);
      }
    }
    for (const p of B.parts) {
      const k = p.life / p.max;
      // 跳弹曳光：沿速度方向的一道短线，头白尾黄
      if (p.type === 'glance') {
        SA.SPR.useCtx(g);
        SA.SPR.line(Math.round(p.x - p.vx * 0.035), Math.round(p.y - p.vy * 0.035), Math.round(p.x), Math.round(p.y), 2, k > 0.5 ? P.white : P.brass[3]);
        continue;
      }
      // 星芒：十字先张开再收回
      if (p.type === 'ping') {
        const L = Math.round(3 + 9 * Math.sin(Math.PI * (1 - k))), x = Math.round(p.x), y = Math.round(p.y);
        g.fillStyle = P.white; g.fillRect(x - L, y - 1, L * 2 + 1, 3); g.fillRect(x - 1, y - L, 3, L * 2 + 1);
        g.fillStyle = P.glass[3]; g.fillRect(x - 2, y - 2, 5, 5);
        continue;
      }
      // 甲片碎片：翻滚的薄片（宽度随转动忽宽忽窄），落地后躺着淡出
      if (p.type === 'shard') {
        const down = p.y >= groundAt(p.x) - 1, fw = down ? 5 : 1 + Math.round(5 * Math.abs(Math.cos(p.spin * p.life))), fh = 2;
        g.globalAlpha = Math.min(1, k * 3);
        g.fillStyle = P.black; g.fillRect(Math.round(p.x - fw / 2), Math.round(p.y - fh / 2) + 1, fw, fh);
        g.fillStyle = p.col; g.fillRect(Math.round(p.x - fw / 2), Math.round(p.y - fh / 2), fw, fh);
        g.globalAlpha = 1;
        continue;
      }
      let col, s = 3;
      switch (p.type) {
        case 'fire': col = k > 0.66 ? P.fire[3] : k > 0.33 ? P.fire[2] : P.fire[1]; s = k > 0.5 ? 6 : 3; break;
        case 'flash': col = P.fire[3]; s = 6; break;
        case 'spark': col = p.col || P.brass[3]; break;
        case 'dust': col = P.bg[5]; s = 4; break;
        case 'debris': col = p.col; s = 4; break;
        case 'smoke': col = k > 0.5 ? P.dark[3] : P.iron[1]; s = 6 + Math.round((1 - k) * 9); g.globalAlpha = Math.min(1, k * 1.5) * 0.8; break;
        case 'steam': col = k > 0.5 ? P.steam[2] : P.steam[1]; s = 3 + Math.round((1 - k) * 12); g.globalAlpha = Math.min(1, k * 1.2) * 0.7; break;
      }
      g.fillStyle = col;
      g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      g.globalAlpha = 1;
    }
    for (const tx of B.texts) if (PIXEL_TEXT.test(tx.str)) SA.SPR.text(g, tx.str, tx.x, Math.round(tx.y), tx.col);
    g.restore();
    drawNear(vw, vh, oy);   // 近景压在车和炮弹前面
    present(vw, vh, ox, oy, false);
    SA.Scenes.fxFront(BD, dg, fxc);   // HUD（准星、伤害数字、标签）画在它上面，不被调色和遮挡影响

    // 叠加层：直接画在设备分辨率上（文字、细条、准星、弹道扇区都是矢量，不再被放大成糊块）
    dg.setTransform(Z, 0, 0, Z, -cam.x * Z, -cam.y * Z);
    dg.imageSmoothingEnabled = false;
    g = dg;
    fxLabels();
    B.previewInfo = null;
    if (B.aim && !B.p.dead && !B.e.dead) drawPreview(aimT);
    if (!sur) drawDmg();   // 升白旗时伤害数字也收起来
    dg.setTransform(Z, 0, 0, Z, -cam.x * Z, -cam.y * Z);
    if (B.aim && !sur) reticle(B.aim[0], B.aim[1], aimT);
    if (sur) flagSpotlight(sur, ec, Z);
    g = wc.getContext('2d');
    dg.setTransform(DPX, 0, 0, DPX, 0, 0);   // 屏幕空间（W × H）
    // 过热：屏幕四周红光呼吸，余光就能看到
    if (!B.p.dead && B.p.heat / B.p.heatMax > T.HEAT_ALERT) {
      const a = (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(B.t * 8))) * Math.min(1, (B.p.heat / B.p.heatMax - T.HEAT_ALERT) / 0.15 + 0.4);
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, 60, 0, 0, W, 60], [0, H, 0, H - 60, 0, H - 60, W, 60], [0, 0, 60, 0, 0, 0, 60, H], [W, 0, W - 60, 0, W - 60, 0, 60, H]]) {
        const gr = dg.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, `rgba(255,40,30,${a})`); gr.addColorStop(1, 'rgba(255,40,30,0)');
        dg.fillStyle = gr; dg.fillRect(rx, ry, rw, rh);
      }
    }
  }

  // 准星：装填中 = 来回摆动的沙漏（外面一圈稳定度环，按住蓄力时跟着收紧）；装好了 = 黄铜齿轮。
  // 按住蓄满自动开火后如果还按着，也照样先变沙漏，装好了再变回齿轮、接着蓄力。
  // 机枪这类快枪（装填 < 1 秒）不切沙漏：齿轮每打一发咔哒转一齿，领头的齿闪一下，内圈细弧显示装填
  // 准星半径跟实际缩圈幅度走：前期只能缩一点，加装瞄准镜后能缩得更紧
  // 准星半径 = 瞄准度（0→100% 从 24 收到 9）；实际散布缩多少由车的缩圈幅度决定，扇区会如实反映
  const reticleR = (focus) => Math.round(24 - 15 * focus);
  // 现在打不了（停火降温 / 没动力 / 没有能开火的武器）：准星变成红齿轮——眼睛盯着准星也知道，原因看仪表台
  const cantFire = (p) => p.hold || p.supply <= 0 || !p.weapons.some(w => !w.blocked);
  function reticle(x, y, aimT) {
    const p = B.p;
    const group = p.weapons.filter(w => w.cell.id === p.sel && !w.blocked);
    const fast = group.length && group[0].m.reload < 1;
    const rl = reloadFrac(p);
    if (cantFire(p)) { gearReticle(x, y, 0, aimT, { fast: false, ticks: 0, flash: 0, rl: null, red: true }); return; }
    // 正在装填（慢炮）：沙漏，不管按没按住
    if (rl != null && !fast) {
      // 稳定度环：装填时按住也在蓄力，环跟着收紧；蓄满变绿
      g.save(); g.globalAlpha = p.fireHeld ? 0.75 : 0.45; g.lineWidth = 2; g.strokeStyle = p.focus >= 1 ? '#6fcf6a' : P.brass[2];
      g.beginPath(); g.arc(x, y, reticleR(p.focus), 0, Math.PI * 2); g.stroke(); g.restore();
      g.fillStyle = P.black; g.fillRect(x - 2, y - 2, 5, 5); g.fillStyle = P.white; g.fillRect(x - 1, y - 1, 3, 3);
      // 沙漏像钟摆一样挂在准星上方来回摆
      g.save(); g.translate(x, y - 34); g.rotate(Math.sin(B.t * 4.5) * 0.38);
      hourglass(-11, 0, rl);
      g.restore();
      return;
    }
    let ticks = 0, flash = 0;
    for (const w of group) { ticks += p.anim.feedOf(w.key); flash = Math.max(flash, p.anim.flashOf(w.key)); }
    gearReticle(x, y, p.focus, aimT, { fast, ticks, flash, rl });
    if (aimT && aimT.layer === 'side') {   // 瞄的是侧挂层的侧炮：标一下
      g.font = 'bold 13px sans-serif'; g.textAlign = 'left';
      g.fillStyle = P.black; g.fillText(SA.Config.text('battle_view_side_cannon'), x + 29, y - 13); g.fillStyle = P.white; g.fillText(SA.Config.text('battle_view_side_cannon'), x + 28, y - 14);
    }
  }

  // 黄铜齿轮准星：按住蓄力时齿轮收紧、转动；蓄满（稳定度 100%）闪绿光
  function gearReticle(x, y, focus, aimT, mg) {
    const full = focus >= 1;
    const r = reticleR(focus);
    const rot = focus * Math.PI / 2 + (mg.fast ? mg.ticks * Math.PI / 4 + (B.p.fireHeld ? B.t * 9 : 0) : B.t * (full ? 2 : 0.3));   // 快枪按住时齿轮飞转
    const pulse = 0.5 + 0.5 * Math.sin(B.t * 12);
    const col = mg.red ? (pulse > 0.5 ? '#ff5a3a' : '#c8321e') : full ? (pulse > 0.5 ? '#9dff8a' : '#6fcf6a') : P.brass[2];
    const hi = mg.red ? '#ffb08a' : full ? '#e8ffd9' : P.brass[3];
    g.save();
    if (full) {   // 绿色光晕
      g.globalAlpha = 0.25 + 0.35 * pulse; g.strokeStyle = '#6fcf6a'; g.lineWidth = 6;
      g.beginPath(); g.arc(x, y, r + 9, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }
    g.lineWidth = 7; g.strokeStyle = P.black;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.strokeStyle = col;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1; g.strokeStyle = hi;
    g.beginPath(); g.arc(x, y, r - 1, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
    // 内圈细弧 = 装填进度（装好了就不画）
    if (mg.rl != null) {
      g.globalAlpha = 0.8; g.lineWidth = 2; g.strokeStyle = hi;
      g.beginPath(); g.arc(x, y, Math.max(3, r - 5), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mg.rl); g.stroke(); g.globalAlpha = 1;
    }
    // 8 个齿（快枪：领头的齿在开火瞬间闪白）
    g.translate(x, y); g.rotate(rot);
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.fillStyle = P.black; g.fillRect(-4, -r - 8, 8, 8);
      g.fillStyle = mg.fast && i === 7 && mg.flash > 0.3 ? '#ffffff' : col; g.fillRect(-2.5, -r - 6.5, 5, 5);
    }
    g.restore();
    // 中心：十字小点
    g.fillStyle = P.black; g.fillRect(x - 3, y - 3, 7, 7);
    g.fillStyle = full ? hi : P.white; g.fillRect(x - 1, y - 1, 3, 3);
  }

  // 当前组任一门炮满装即可单独开火；全组空炮时显示最接近完成的一门。
  function reloadFrac(s) {
    if (s.dead || !s.sel) return null;
    let next = null;
    for (const w of s.weapons) {
      if (w.cell.id !== s.sel) continue;
      if ((s.timers[w.key] || 0) <= 0) return null;
      const f = SA.Battle.reloadProgress(s, w);
      if (next == null || f > next) next = f;
    }
    return next;
  }
  // 跟着准星走的小沙漏：上半沙子漏到下半 = 装填进度
  function hourglass(x, y, f) {
    const S = 2;   // 放大两倍，镜头拉远时也看得清
    const R = (a, b, w, hh, col) => { g.fillStyle = col; g.fillRect(x + a * S, y + b * S, w * S, hh * S); };
    R(-1, -1, 13, 19, P.black);                       // 描边
    R(0, 0, 11, 2, P.brass[2]); R(0, 15, 11, 2, P.brass[2]);   // 上下黄铜盖
    R(0, 2, 1, 13, P.brass[1]); R(10, 2, 1, 13, P.brass[1]);   // 立柱
    const glass = [[2, 7], [2, 7], [3, 5], [4, 3], [5, 1], [5, 1], [4, 3], [3, 5], [2, 7], [2, 7], [2, 7]];
    glass.forEach(([gx, gw], i) => R(gx, 3 + i, gw, 1, P.steam[0]));
    const top = Math.round((1 - f) * 4), bot = Math.round(f * 4);
    for (let i = 0; i < top; i++) { const [gx, gw] = glass[4 - i]; R(gx, 7 - i, gw, 1, P.brass[3]); }
    for (let i = 0; i < bot; i++) { const [gx, gw] = glass[10 - i]; R(gx, 13 - i, gw, 1, P.brass[3]); }
    if (f < 1 && Math.floor(B.t * 10) % 2) R(5, 8, 1, 5 - bot, P.brass[3]);   // 漏下来的细流
  }

  // 画一辆车：起步憋气的颠簸 + 开火反作用的前后晃动与抬头（动态模块里的车身弹簧）；敌方整体镜像
  // ---------- 伤害数字 ----------
  // 旧版：3×5 小字（5 和 S 同形、6 / 8 / 9 几乎一样），只有右下一道影子，所有伤害一个样，同一位置连着冒出来就叠成一团。
  // 新版：① 5×7 字形（与界面钱数同一套）+ 一圈完整黑描边 + 下方投影，在屏幕空间按整数像素画，镜头缩放也不糊不变小；
  // ② 按单发伤害分四档：大小、颜色、加粗、弹出力度、停留时间都不同，≥25 再带一圈迸射线；主体 白→黄→橙→红，侧挂 粉→品红，货箱 木色；
  // ③ 同一模块上连着打进来的同值伤害（机枪）合成一个「9×4」，在弹着点悬停，停火后再飘走；
  // ④ 不同数字之间每帧做一次避让（沿重叠较少的方向推开），不会叠在一起。
  const DMG_RE = /^\d+$/;
  const DMG_GLYPH = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '×': ['000', '000', '101', '010', '101', '000', '000'],
  };
  const DMG_COL = {
    body: ['#f4f7ee', '#ffe066', '#ffa133', '#ff4f2e'],
    side: ['#f8c6f0', '#f590e4', '#ea55d4', '#d42abd'],
    crate: ['#d9b27a', '#e2bd85', '#eac68e', '#f2d098'],
  };
  const DMG_U = [3, 4, 4, 5], DMG_BOLD = [0, 0, 1, 1], DMG_LIFE = [0.75, 0.95, 1.2, 1.5], DMG_RISE = [40, 32, 26, 20], DMG_POP = [1.5, 1.8, 2.1, 2.6];
  const dmgTier = (v) => (v >= 50 ? 3 : v >= 25 ? 2 : v >= 10 ? 1 : 0);
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`; };
  const dmgCache = new Map();
  // 预烘一张 1 倍像素的数字图（描边 + 投影 + 两段明暗），画的时候按整数倍放大
  function dmgSprite(str, tier, kind) {
    const key = `${str}|${tier}|${kind}`;
    if (dmgCache.has(key)) return dmgCache.get(key);
    const bold = DMG_BOLD[tier], mask = [];
    let w = 0;
    for (const ch of str) {
      const gl = DMG_GLYPH[ch], gw = gl[0].length;
      gl.forEach((row, y) => { for (let i = 0; i < gw; i++) if (row[i] === '1') { mask.push([w + i, y]); if (bold) mask.push([w + i + 1, y]); } });
      w += gw + 1 + bold;
    }
    w -= 1;
    const cv = document.createElement('canvas');
    cv.width = w + 2; cv.height = 7 + 3;
    const x = cv.getContext('2d'), col = DMG_COL[kind][tier];
    const at = (c, list, dy) => { x.fillStyle = c; for (const [px, py] of list) x.fillRect(px + 1, py + 1 + dy, 1, 1); };
    const ring = [];
    for (const [px, py] of mask) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ring.push([px + dx, py + dy]);
    at('rgba(0,0,0,0.45)', ring, 1);                             // 投影
    at('#0b0a10', ring, 0);                                       // 一圈完整描边
    at(col, mask, 0);
    at(shade(col, 0.74), mask.filter(([, py]) => py >= 5), 0);    // 下两行压暗，字有厚度
    if (tier >= 2) at('#ffffff', mask.filter(([, py]) => py === 0), 0);   // 大伤害顶上一行高光
    if (dmgCache.size > 300) dmgCache.clear();
    dmgCache.set(key, cv);
    return cv;
  }
  // 数字属于哪个模块：battle.js 在模块中心上方 24px 处、左右 ±9 抖动生成数字，倒推回去找模块（找不到就按位置分格）
  function dmgKey(x, y, kind) {
    if (kind !== 'crate') for (const s of [B.e, B.p]) {
      const cell = cellAt(s, x, y + 24);
      const m = cell && modAt(s, kind === 'side' ? 'side' : 'body', cell.r, cell.c);
      if (m) return `${s === B.e ? 'e' : 'p'}${m.layer}${m.r},${m.c}`;
    }
    return `${kind}${Math.round(x / 24)},${Math.round(y / 24)}`;
  }
  let dmgSeq = 0;
  function addDmg(d) {
    const list = B.dmg || (B.dmg = []);
    const v = +d.str, kind = d.col === P.magenta ? 'side' : d.col === '#d9b27a' ? 'crate' : 'body', key = dmgKey(d.x, d.y, kind);
    const m = list.find(n => n.key === key && n.v === v && n.since < 0.35);
    if (m) { m.n++; m.since = 0; m.pop = 0; m.popK = 1.35; m.life = Math.max(m.life, DMG_LIFE[m.tier]); return; }
    const tier = dmgTier(v);
    list.push({ v, n: 1, tier, kind, key, x: d.x, y: d.y, ox: 0, oy: 0, rise: 0, age: 0, pop: 0, popK: DMG_POP[tier], since: 0, life: DMG_LIFE[tier], id: dmgSeq++ });
  }
  const dmgStr = (n) => (n.n > 1 ? `${n.v}×${n.n}` : `${n.v}`);
  // 屏幕空间里的方框（逻辑像素 1280 × 720）
  function dmgRect(n) {
    const cam = B.cam, cv = dmgSprite(dmgStr(n), n.tier, n.kind), k = Math.min(1, n.pop / 0.16);
    const u = DMG_U[n.tier] * (1 + (n.popK - 1) * (1 - k) * (1 - k));   // 含弹出放大，避让时也算进去
    const cx = (n.x - cam.x) * cam.z + n.ox, cy = (n.y - cam.y) * cam.z - n.rise + n.oy;
    return { cx, cy, w: cv.width * u, h: cv.height * u, cv, u };
  }
  function tickDmg(dt) {
    const list = B.dmg;
    if (!list || !list.length) return;
    for (const n of list) {
      n.age += dt; n.pop += dt; n.since += dt; n.life -= dt;
      if (n.since > 0.12) n.rise += DMG_RISE[n.tier] * dt;   // 连射还在打进来时停在弹着点，停火后再往上飘
    }
    B.dmg = list.filter(n => n.life > 0);
    // 避让：两两比较，重叠了就沿重叠较少的方向推开（新的挪 70%、旧的挪 30%，每帧两遍，平滑不抖）
    const L = B.dmg, R = L.map(dmgRect);
    for (let pass = 0; pass < 2; pass++) for (let j = 1; j < R.length; j++) for (let i = 0; i < j; i++) {
      const a = R[i], b = R[j];
      const ox = (a.w + b.w) / 2 + 8 - Math.abs(a.cx - b.cx), oy = (a.h + b.h) / 2 + 3 - Math.abs(a.cy - b.cy);   // 留出间隙：两个数字贴着会读成一个
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) {
        const d = b.cx === a.cx ? (L[j].id % 2 ? 1 : -1) : Math.sign(b.cx - a.cx);
        L[j].ox += d * ox * 0.7; b.cx += d * ox * 0.7; L[i].ox -= d * ox * 0.3; a.cx -= d * ox * 0.3;
      } else {
        const d = b.cy === a.cy ? -1 : Math.sign(b.cy - a.cy);
        L[j].oy += d * oy * 0.7; b.cy += d * oy * 0.7; L[i].oy -= d * oy * 0.3; a.cy -= d * oy * 0.3;
      }
    }
    L.forEach((n, i) => { n.ox = clamp(n.ox, -120, 120); n.oy = clamp(n.oy, -140, 10); n.r = R[i]; });   // 挤得再多也不离弹着点太远；往下最多让一点，免得被压到车底下
  }
  function drawDmg() {
    const list = B.dmg;
    if (!list || !list.length) return;
    // 直接画在设备像素上（DPX 可能不是整数）：一个字像素 = 整数个设备像素，块块方正
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.imageSmoothingEnabled = false;
    for (const n of [...list].sort((a, b) => a.tier - b.tier)) {   // 大伤害压在上面
      const r = n.r || dmgRect(n), u = Math.max(1, Math.round(r.u * DPX));   // 一个字像素取整数个设备像素（弹出时按整数倍缩回）
      const cx = r.cx * DPX, cy = r.cy * DPX;
      const w = r.cv.width * u, h = r.cv.height * u, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
      dg.globalAlpha = Math.min(1, n.life / 0.25);
      // 大伤害：出现时一圈短促的迸射线（≥25 四道，≥50 八道），颜色同数字
      if (n.tier >= 2 && n.age < 0.22) {
        const t = n.age / 0.22, rays = n.tier === 3 ? 8 : 4, sz = Math.max(1, Math.round((n.tier === 3 ? 3 : 2) * DPX));
        const rr = ((n.tier === 3 ? 22 : 16) + t * (n.tier === 3 ? 26 : 16)) * DPX, len = (7 * (1 - t) + 2) * DPX;
        dg.fillStyle = DMG_COL[n.kind][n.tier];
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2 + Math.PI / rays, ca = Math.cos(a), sa = Math.sin(a);
          for (let s = 0; s < len; s += sz) dg.fillRect(Math.round(cx + ca * (rr + s) * 1.4 - sz / 2), Math.round(cy + sa * (rr + s) - sz / 2), sz, sz);
        }
      }
      dg.drawImage(r.cv, x, y, w, h);
    }
    dg.globalAlpha = 1;
  }

  // 飘字：像素字体只有数字和几个字母，其余（"弹开""投降"等中文）在叠加层用矢量字画成小铭牌
  const PIXEL_TEXT = /^[0-9MIS!-]*$/;
  function fxLabels() {
    g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const tx of B.texts) {
      if (PIXEL_TEXT.test(tx.str)) continue;
      const age = (tx.max || 0.9) - tx.life, pop = age < 0.08 ? 1.35 - age * 4.4 : 1;
      const w = Math.ceil(g.measureText(tx.str).width) + 10, h = 18;
      g.save();
      g.translate(Math.round(tx.x), Math.round(tx.y)); g.scale(pop, pop);
      g.globalAlpha = Math.min(1, tx.life * 3);
      g.fillStyle = 'rgba(7,8,12,0.85)'; g.fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
      g.strokeStyle = tx.plaque || tx.col; g.lineWidth = 1; g.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      g.fillStyle = P.black; g.fillText(tx.str, 1, 2);
      g.fillStyle = tx.plaque ? P.white : tx.col; g.fillText(tx.str, 0, 1);
      g.restore();
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  // 瞄准高亮：整格白色闪烁 + 白描边，侧炮和普通模块一样，不分颜色
  const hlC = document.createElement('canvas');
  hlC.width = K.ART + 8; hlC.height = K.ART + 8;
  // lx, ly：模块在整车画布里的左上角；w, h：模块像素大小；dx, dy：画到哪（当前坐标系）
  function highlight(cvs, lx, ly, w, h, dx, dy) {
    const x = hlC.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, hlC.width, hlC.height);
    x.drawImage(cvs, lx - 4, ly - 4, w + 8, h + 8, 0, 0, w + 8, h + 8);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w + 8, h + 8);
    const pulse = 0.5 + 0.5 * Math.sin(B.t * 10);
    g.globalAlpha = 0.3 + 0.45 * pulse; g.drawImage(hlC, 0, 0, w + 8, h + 8, dx - 4, dy - 4, w + 8, h + 8); g.globalAlpha = 1;
    g.lineWidth = 2; g.strokeStyle = `rgba(255,255,255,${0.55 + 0.45 * pulse})`; g.strokeRect(dx - 1, dy - 1, w + 2, h + 2);
  }

  // 车身画布按整数倍 n 最近邻放大（每辆车一张缓存画布），再缩回 1/n 用双线性画：旋转也不会出现像素台阶
  const upV = new Map();
  function upscaled(key, src, n) {
    if (n <= 1) return src;
    let c = upV.get(key);
    if (!c) { c = document.createElement('canvas'); upV.set(key, c); }
    if (c.width !== src.width * n || c.height !== src.height * n) { c.width = src.width * n; c.height = src.height * n; }
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function blit(key, src, dx, dy, n) {
    if (n <= 1) { g.drawImage(src, dx, dy); return; }
    g.drawImage(upscaled(key, src, n), dx, dy, src.width, src.height);
  }

  // ---------- 投降：车顶伸出旗杆、升起白旗 ----------
  // 规则层给出锚点（残存模块最高顶边中点，世界坐标）和两段进度；画面只读不写。
  // 旗杆 2px 暗铁 + 黄铜杆头，底下一块卡座；白旗朝车尾方向飘（敌车车尾在右），逐列正弦起伏，暗列做褶皱
  const easeOut = (k) => 1 - (1 - k) * (1 - k);
  function drawWhiteFlag(sur) {
    const a = sur.anchor;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
    if (B.flagX0 == null) B.flagX0 = B.e.x;
    const x = Math.round(a.x + (B.e.x - B.flagX0)), y0 = Math.round(a.y);
    const POLE = 58, len = Math.round(POLE * easeOut(sur.poleProgress));
    if (len <= 0) return;
    const top = y0 - len, wall = performance.now() / 1000;
    g.fillStyle = P.black; g.fillRect(x - 4, y0 - 4, 9, 5);                 // 卡座
    g.fillStyle = P.iron[2]; g.fillRect(x - 3, y0 - 3, 7, 3);
    g.fillStyle = P.black; g.fillRect(x - 1, top, 4, len);                  // 旗杆（黑边）
    g.fillStyle = P.iron[3]; g.fillRect(x, top, 1, len - 3);
    g.fillStyle = P.iron[1]; g.fillRect(x + 1, top, 1, len - 3);
    g.fillStyle = P.black; g.fillRect(x - 2, top - 4, 6, 5);                // 黄铜杆头
    g.fillStyle = P.brass[2]; g.fillRect(x - 1, top - 3, 4, 3);
    g.fillStyle = P.brass[3]; g.fillRect(x - 1, top - 3, 2, 1);
    const fk = easeOut(sur.flagProgress);
    if (fk <= 0) return;
    const FW = Math.round(14 + 12 * fk), FH = 15;
    const fy = Math.round((y0 - 6 - FH) + ((top + 1) - (y0 - 6 - FH)) * fk);   // 从杆底升到杆顶
    const amp = 0.6 + 1.6 * fk;
    for (let i = 0; i < FW; i++) {
      const k = i / FW, dy = Math.round(Math.sin(wall * 7 - i * 0.45) * amp * k);
      const hgt = FH - Math.round(k * 3);                                  // 旗尾略收
      const shade = Math.sin(wall * 7 - i * 0.45 + 1.2) > 0.55;
      g.fillStyle = P.black; g.fillRect(x + 2 + i, fy + dy - 1, 1, hgt + 2);
      g.fillStyle = shade ? P.iron[4] : P.white; g.fillRect(x + 2 + i, fy + dy, 1, hgt);
    }
    g.fillStyle = P.black; g.fillRect(x + 2 + FW, fy + Math.round(Math.sin(wall * 7 - FW * 0.45) * amp) - 1, 1, FH - 1);
  }
  // 升白旗时：整屏压暗（烟火、背景人物、伤害数字、准星都压下去），对方的车原样画回来，白旗画在最上面——什么都挡不住它。
  // 压暗跟着升旗进度淡入；画在设备分辨率的叠加层上（世界变换和车那一层一样）
  function flagSpotlight(sur, ec, Z) {
    const k = Math.min(1, sur.poleProgress * 2 + sur.flagProgress);
    dg.setTransform(1, 0, 0, 1, 0, 0);
    dg.fillStyle = `rgba(8,8,14,${(0.62 * k).toFixed(3)})`; dg.fillRect(0, 0, cv.width, cv.height);
    dg.setTransform(Z, 0, 0, Z, -B.cam.x * Z, -B.cam.y * Z);
    g = dg;
    drawVehicle(B.e, ec, null, Z);
    drawWhiteFlag(sur);
  }
  // 升旗时画面上方钉一张电报：谁挂了白旗 + 可以点击跳过
  function surrenderHint(on) {
    if (hud.sur) { hud.sur.remove(); hud.sur = null; }
    if (!on || !wrap) return;
    hud.sur = h('div', { class: 'bt-sur px-sk px-sk-kraft px-drop' }, SA.PX && SA.PX.ui ? SA.PX.ui.img(SA.PX.pin(), 2, 'position:absolute;left:50%;top:-14px;margin-left:-8px') : '',
      h('i', {}, SA.Config.text('battle_view_telegram')), h('b', {}, SA.Config.text('battle_view_surrender_banner', B.e.name)), h('span', {}, SA.Config.text('battle_view_skip_click')));
    hud.stage.append(hud.sur);
  }

  // 真双足跳跃（docs/biped-plan.md §5.2）：车在空中时地上画一块影子（离地越高越小越淡）；起跳那一帧脚下喷汽、落地那一帧扬尘 + 小震屏。
  // 只是画面：粒子进 B.parts（vpart，不占战斗随机流），影子画在车下面
  const airWas = new WeakMap();
  function bipedAir(s) {
    if (s.chassisId !== 'biped') return;
    const a = SA.V.bipedOf(s.v), air = (s.airDuration || 0) > 0, was = airWas.get(s) || false;
    airWas.set(s, air);
    if (!a) return;
    const x = cellX(s, a.c) + C, gy = GROUND + (s.yo || 0);
    if (air) {
      const hgt = s.airHeight || 0, w = Math.max(12, 26 - hgt * 0.14), alpha = Math.max(0.3, 0.55 - hgt * 0.004);
      g.save(); g.fillStyle = `rgba(7,8,12,${alpha.toFixed(2)})`;
      g.beginPath(); g.ellipse(x, gy - 1, w, 3.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    if (air && !was) for (let i = 0; i < 9; i++) vpart('steam', x + vr(-12, 12), gy - 3, vr(-50, 50), vr(-70, -20), vr(0.4, 0.75));
    if (!air && was) {
      for (let i = 0; i < 10; i++) vpart('dust', x + vr(-22, 22), gy - 2, vr(-60, 60), vr(-45, -10), vr(0.3, 0.55));
      B.shake = Math.max(B.shake || 0, 2.5);
    }
  }
  function drawVehicle(s, cvs, hl, Z) {
    const w = s.anim.body.x;                        // 后坐：本地坐标里往后挪（负 = 被往后推）
    const py = K.ROWS * C;                          // 车身画布底边 = 车底
    const lp = isP(s) ? s.pivX - s.x : s.x + VW - s.pivX;   // 支点（车底中点）在车身画布里的 x
    const n = Math.max(1, Math.floor(Z + 0.001));
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    g.translate(s.pivX + introDx(s), pivY(s) - s.rock * 2);      // 设备分辨率下不取整：爬坡时平滑移动（拦路过场里车在画面上平移 introDx）
    g.rotate(tiltOf(s));                            // 跟着坡度倾斜（整车绕车底中点转）
    if (!isP(s)) g.scale(-1, 1);
    // 撞击件在底盘残骸里艰涩地挤：整车高频抖 1~2px（两车相位错开）
    const gr = s.grind || 0, gt = Math.floor(B.t * 38) + (isP(s) ? 0 : 1);
    const gx = gr > 0.05 ? (gt % 2 ? 1 : -1) * Math.ceil(gr * 1.6) : 0, gy = gr > 0.05 && gt % 3 === 0 ? -1 : 0;
    g.translate(w + gx, gy);
    g.rotate(clamp(w * 0.012, -0.06, 0.06));        // 往后坐时车头微微抬起
    blit(isP(s) ? 'p' : 'e', cvs, -lp, -py, n);
    if (s.dead) blit('dead', tint(cvs), -lp, -py, n);
    if (hl) {
      const f = SA.fp(s.v[hl.layer][hl.r][hl.c].id), lx = PADX + hl.c * C, ly = hl.r * C;
      highlight(cvs, lx, ly, f.w * C, f.h * C, lx - lp, ly - py);   // 本地坐标：跟着车身晃动、倾斜、敌方镜像
    }
    g.restore();
  }

  // 命中率估算用的固定分位样本（与 gauss() 同分布），每帧结果稳定不闪
  const QS = (() => { const a = Array.from({ length: 3000 }, gauss).sort((x, y) => x - y); return Array.from({ length: 15 }, (_, i) => a[Math.floor((i + 0.5) / 15 * a.length)]); })();
  const sameCell = (a, b) => a && b && a.layer === b.layer && a.r === b.r && a.c === b.c;

  // ---------- 散布扇区 ----------
  // 旧做法：17 条弹道各自按步长采样到「撞上的那一格」，相邻两条连成条带。对方一动，某条弹道擦过模块边缘就从
  // 前一块跳到后一块（或穿过缝隙飞到地上），整条条带跟着跳。新做法让扇区形状只随连续量变化：
  // ① 每条弹道用解析抛物线逐步走，每一步当作一小段弦做精确求交（模块逐格走、货箱矩形、地面逐像素），
  //    入射点连续变化，擦过模块角 / 顶面的弹道也不会时有时无；
  // ② 相邻两条弹道撞的东西不同（或终点离得远）就在中间补一条再比，直到角度差极小 ——
  //    扇区边缘因此落在「刚好擦过模块角」的那条弹道上，对方移动时边缘跟着角点平滑滑动；
  // ③ 穿过准星以后的部分沿弹道方向淡出（准星处的法平面往后 FAN_TAIL 像素），漏过缝隙的弹道只留一段渐隐的尾巴。
  // 发射参数与 battle.js 的 launch() 一致（出膛点、偏弹射界限制、车身俯仰），只用于画面。
  const FAN_TAIL = C * 2.5, FAN_STEP = T.PREVIEW_STEP, FAN_BUDGET = 220;
  function fanLaunch(s, w, deg, jit) {
    const shot = launch(s, w, deg, jit);
    return { x0: shot.x, y0: shot.y, vx: shot.vx, vy: shot.vy, g: shot.g };
  }
  const fanAt = (L, t) => [L.x0 + L.vx * t, L.y0 + L.vy * t + L.g * t * t / 2];
  // 世界坐标 → 对方车身的格子坐标（u 列、v 行，整数处是格线）：先转回车身平放（绕支点反转倾斜），敌方列号镜像，与 cellAt() 相同
  function fanUV(o, x, y) {
    const a = tiltOf(o);
    if (a && o.pivX != null) {
      const py = pivY(o), dx = x - o.pivX, dy = y - py, c = Math.cos(a), n = Math.sin(a);
      x = o.pivX + dx * c + dy * n; y = py - dx * n + dy * c;
    }
    return [(isP(o) ? x - o.x - PADX : o.x + VW - PADX - x) / C, (y - VY - (pivY(o) - GROUND)) / C];   // pivY 含地形和双足姿态位移
  }
  // 一小段弦（一步 ≈ 7px，弦和抛物线相差不到 0.01px）最先撞到什么：返回 [λ, key]，λ ∈ [0, 1] 是弦上的位置。
  // 模块：在格子坐标里逐格走（DDA），第一个有活模块的格子就是入射点 —— 精确到擦边，不会从角上一穿而过；
  // 货箱：矩形求交；地面：贴近地面时逐像素查；淡出尾巴：法平面往后 FAN_TAIL 的那条线，线性求交。同一位置按 advance() 的优先级
  function fanSeg(ctx, x0, y0, x1, y1) {
    const o = ctx.o;
    let best = Infinity, key = null;
    const [u0, v0] = fanUV(o, x0, y0), [u1, v1] = fanUV(o, x1, y1);
    const du = u1 - u0, dv = v1 - v0;
    if (Math.max(u0, u1) >= 0 && Math.min(u0, u1) < K.COLS && Math.max(v0, v1) >= 0 && Math.min(v0, v1) < K.ROWS) {
      let cu = Math.floor(u0), cv = Math.floor(v0), lam = 0;
      const su = du > 0 ? 1 : -1, sv = dv > 0 ? 1 : -1;
      const tdu = du ? 1 / Math.abs(du) : Infinity, tdv = dv ? 1 / Math.abs(dv) : Infinity;
      let tu = du ? (du > 0 ? cu + 1 - u0 : u0 - cu) * tdu : Infinity, tv = dv ? (dv > 0 ? cv + 1 - v0 : v0 - cv) * tdv : Infinity;
      for (let n = 0; n < 12; n++) {
        if (cv >= 0 && cv < K.ROWS && cu >= 0 && cu < K.COLS) {
          const m = modAt(o, ctx.side ? 'side' : 'body', cv, cu);
          if (m) { best = lam; key = `${m.layer}${m.r},${m.c}`; break; }
        }
        if (Math.min(tu, tv) > 1) break;
        if (tu < tv) { cu += su; lam = tu; tu += tdu; } else { cv += sv; lam = tv; tv += tdv; }
      }
    }
    const dx = x1 - x0, dy = y1 - y0;
    ctx.crates.forEach((c, i) => {
      let lo = 0, hi = 1;
      for (const [p, d, a, b] of [[x0, dx, c.x0, c.x1], [y0, dy, c.y0, c.y1]]) {
        if (!d) { if (p < a || p > b) { lo = 2; } continue; }
        let ta = (a - p) / d, tb = (b - p) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        lo = Math.max(lo, ta); hi = Math.min(hi, tb);
      }
      if (lo <= hi && lo < best) { best = lo; key = `c${B.ter.crates.indexOf(c)}`; }
    });
    if (Math.max(y0, y1) >= Math.min(groundAt(x0), groundAt(x1)) - HALF) {
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        if (t >= best) break;
        if (y0 + dy * t >= groundAt(x0 + dx * t)) { best = t; key = 'g'; break; }
      }
    }
    const pl = ctx.plane;
    if (pl) {
      const s0 = (x0 - pl.x) * pl.dx + (y0 - pl.y) * pl.dy - FAN_TAIL, s1 = (x1 - pl.x) * pl.dx + (y1 - pl.y) * pl.dy - FAN_TAIL;
      const t = s0 >= 0 ? 0 : s1 > 0 ? s0 / (s0 - s1) : Infinity;
      if (t < best) { best = t; key = 'tail'; }
    }
    return key ? [best, key] : null;
  }
  // 一条弹道：返回折线点、终点和撞到的东西（'tail' = 淡出尾巴走完，'out' = 飞出画面）
  function fanTrace(ctx, jit) {
    const L = fanLaunch(ctx.s, ctx.w, ctx.deg, jit);
    // 第三项记录飞行时间，供相邻弹道按同一时刻拼接；碰撞后的终点仍停在真实入射时刻。
    const pts = [[L.x0, L.y0, 0]];
    let [px, py] = pts[0];
    for (let i = 1; i <= T.PREVIEW_STEPS; i++) {
      const [x, y] = fanAt(L, i * FAN_STEP), hit = fanSeg(ctx, px, py, x, y);
      if (hit) {
        const e = [px + (x - px) * hit[0], py + (y - py) * hit[0]];
        const t = (i - 1 + hit[0]) * FAN_STEP;
        if (t > pts[pts.length - 1][2]) pts.push([e[0], e[1], t]);
        return { jit, pts, end: e, key: hit[1] };
      }
      if (y > H + 100 || (B.cam && (x < B.cam.x - 200 || x > B.cam.x + B.cam.w + 200))) { pts.push([x, y, i * FAN_STEP]); return { jit, pts, end: [x, y], key: 'out' }; }
      if (i % 3 === 0) pts.push([x, y, i * FAN_STEP]);
      px = x; py = y;
    }
    return { jit, pts, end: [px, py], key: 'out' };
  }
  // 在已采样的折线上取同一飞行时刻的位置；一条弹道先撞上目标时，后续固定在入射点。
  function fanPoint(pts, i, t) {
    if (i >= pts.length - 1) return pts[pts.length - 1];
    const a = pts[i], b = pts[i + 1], f = (t - a[2]) / (b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  // 准星处的法平面：不受阻挡的中心弹道上离准星最近的点 + 那里的飞行方向。
  // 参数 t 做轻微平滑，高抛弧线两段都靠近准星时也不会在两处之间跳
  function fanPlane(s, w, deg) {
    const L = fanLaunch(s, w, deg, 0), [ax, ay] = B.aim;
    let best = Infinity, bt = 0;
    for (let i = 1; i <= T.PREVIEW_STEPS; i++) {
      const t = i * FAN_STEP, [x, y] = fanAt(L, t), d = (x - ax) ** 2 + (y - ay) ** 2;
      if (d < best) { best = d; bt = t; }
      if (y > H + 100) break;
    }
    // 在最近的采样点两侧三分法求精确最近点：准星移动时法平面连续滑动，不按 7px 一格跳
    let lo = Math.max(0, bt - FAN_STEP), hi = bt + FAN_STEP;
    const dist = (t) => { const [x, y] = fanAt(L, t); return (x - ax) ** 2 + (y - ay) ** 2; };
    for (let k = 0; k < 30; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (dist(m1) < dist(m2)) hi = m2; else lo = m1; }
    bt = (lo + hi) / 2;
    const dt = Math.min(0.1, B.t - (B.fanPT || B.t));
    B.fanPT = B.t;
    B.fanTA = B.fanTA == null || B.fanPW !== w.key ? bt : B.fanTA + (bt - B.fanTA) * Math.min(1, dt * 12);
    B.fanPW = w.key;
    const [x, y] = fanAt(L, B.fanTA), vx = L.vx, vy = L.vy + L.g * B.fanTA, n = Math.hypot(vx, vy) || 1;
    return { x, y, dx: vx / n, dy: vy / n };
  }
  function drawFan(s, w, deg, side, S, col) {
    const ctx = { s, w, deg, side, o: B.e, plane: fanPlane(s, w, deg), crates: B.ter ? B.ter.crates.filter(c => !c.dead) : [] };
    let budget = FAN_BUDGET;
    const trace = (j) => { budget--; return fanTrace(ctx, j); };
    const N = 13, base = [];
    for (let i = 0; i < N; i++) base.push(trace(-S + 2 * S * i / (N - 1)));
    const rays = [base[0]];
    const far = (a, b) => Math.hypot(a.end[0] - b.end[0], a.end[1] - b.end[1]) > 6;
    const refine = (a, b, depth) => {
      // 撞的东西不同：一直细分到擦边（角度差 ≈ 散布 / 3000）；同一个东西只是终点远（掠地的浅角）：补两层就够平滑
      if (budget <= 0 || (a.key === b.key ? depth > 1 || !far(a, b) : depth > 9)) return;
      const m = trace((a.jit + b.jit) / 2);
      refine(a, m, depth + 1); rays.push(m); refine(m, b, depth + 1);
    };
    for (let i = 0; i < N - 1; i++) { refine(base[i], base[i + 1], 0); rays.push(base[i + 1]); }
    // 整条弹道闭合成条带会在高抛轨迹交叉处产生正负绕数，相互抵消后漏掉中间弹道。
    // 按飞行时间拆片，连续同向的片合并成一条边界；转向处统一绕向后一次填满，重叠处仍不叠深。
    // 填充用沿弹道方向的渐变：准星法平面之前是正常浓度，之后 FAN_TAIL 像素内淡到 0
    const pl = ctx.plane, gr = g.createLinearGradient(pl.x, pl.y, pl.x + pl.dx * FAN_TAIL, pl.y + pl.dy * FAN_TAIL);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(244,247,238,0)');
    g.save(); g.globalAlpha = 0.16; g.fillStyle = gr; g.beginPath();
    const triangle = (a, b, c) => {
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) < 0.001) return;
      g.moveTo(a[0], a[1]);
      if (cross > 0) { g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); }
      else { g.lineTo(c[0], c[1]); g.lineTo(b[0], b[1]); }
      g.closePath();
    };
    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i].pts, b = rays[i + 1].pts;
      let ai = 0, bi = 0, a0 = a[0], b0 = b[0];
      let sign = 0, as = [], bs = [];
      const flush = () => {
        if (!sign) return;
        g.moveTo(as[0][0], as[0][1]);
        if (sign > 0) {
          for (const p of bs) g.lineTo(p[0], p[1]);
          for (let k = as.length - 1; k > 0; k--) g.lineTo(as[k][0], as[k][1]);
        } else {
          for (let k = 1; k < as.length; k++) g.lineTo(as[k][0], as[k][1]);
          for (let k = bs.length - 1; k >= 0; k--) g.lineTo(bs[k][0], bs[k][1]);
        }
        g.closePath(); sign = 0;
      };
      while (ai < a.length - 1 || bi < b.length - 1) {
        const at = ai < a.length - 1 ? a[ai + 1][2] : Infinity;
        const bt = bi < b.length - 1 ? b[bi + 1][2] : Infinity;
        const t = Math.min(at, bt);
        if (at === t) ai++;
        if (bt === t) bi++;
        const a1 = fanPoint(a, ai, t), b1 = fanPoint(b, bi, t);
        const c1 = (b0[0] - a0[0]) * (b1[1] - a0[1]) - (b0[1] - a0[1]) * (b1[0] - a0[0]);
        const c2 = (b1[0] - a0[0]) * (a1[1] - a0[1]) - (b1[1] - a0[1]) * (a1[0] - a0[0]);
        const s1 = Math.abs(c1) < 0.001 ? 0 : Math.sign(c1), s2 = Math.abs(c2) < 0.001 ? 0 : Math.sign(c2);
        if (s1 && s2 && s1 !== s2) {
          flush(); triangle(a0, b0, b1); triangle(a0, b1, a1);
        } else if (s1 || s2) {
          const next = s1 || s2;
          if (sign !== next) { flush(); sign = next; as = [a0]; bs = [b0]; }
          as.push(a1); bs.push(b1);
        } else flush();
        a0 = a1; b0 = b1;
      }
      flush();
    }
    g.fill('nonzero'); g.restore();
  }

  // 当前武器组的弹道预览：按炮管「当前」仰角画（炮管转动有延迟）。
  // 中心点线与落点共用真实弹道；有散布的武器（含抛射架）另画扇区和命中率。
  function drawPreview(aimT) {
    const side = aimT && aimT.layer === 'side';
    const info = { hit: null, reach: true, blocked: false };
    B.previewInfo = info;
    const p = B.p;
    const w = p.weapons.find(x => x.cell.id === p.sel && !x.blocked);
    if (!w) { info.blocked = p.weapons.some(x => x.cell.id === p.sel); return; }
    const want = aimAngle(p, w, B.aim[0], B.aim[1]), cur = barrel(p, w);
    info.reach = want.reach || (!w.m.indirect && w.m.g < 1);
    info.over = want.over;
    info.slewing = Math.abs(want.a - cur) > 1;
    info.windup = p.fireHeld && p.heldT < w.m.windup;
    const pr = predict(p, B.e, w, cur, side);
    const col = P.white;
    const big = w.m.proj === 'shell';
    SA.SPR.useCtx(g);
    const sp = spreadDeg(p, B.e, w);
    // 扇区宽度：散布变大时很快跟上（约 0.1 秒），变小时慢慢收；都是连续变化，不会一帧跳宽
    const now = B.t, dtv = Math.min(0.1, now - (B.fanT || now));
    B.fanT = now;
    if (B.fanSp == null || B.fanW !== w.key) B.fanSp = sp;
    else B.fanSp += (sp - B.fanSp) * Math.min(1, dtv * (sp > B.fanSp ? 20 : 4));
    B.fanW = w.key;
    if (sp > 0) {
      drawFan(p, w, cur, side, B.fanSp, col);
      if (aimT) {
        let n = 0;
        for (const q of QS) if (sameCell(predict(p, B.e, w, cur, side, q * sp).hit, aimT)) n++;
        const base = n / QS.length;
        info.chance = Math.round(100 * base * (1 - (w.m.wild || 0) * 0.8));
      }
    }
    pr.pts.forEach(([x, y], i) => {
      if (i % (big ? 2 : 3)) return;
      g.fillStyle = P.black; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, big ? 5 : 4, big ? 5 : 4);
      g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), big ? 3 : 2, big ? 3 : 2);
    });
    if (sp <= 0) {
      const [ex, ey] = pr.end.map(Math.round);
      SA.SPR.line(ex - 6, ey - 6, ex + 6, ey + 6, 4, P.black); SA.SPR.line(ex + 6, ey - 6, ex - 6, ey + 6, 4, P.black);
      SA.SPR.line(ex - 5, ey - 5, ex + 5, ey + 5, 2, col); SA.SPR.line(ex + 5, ey - 5, ex - 5, ey + 5, 2, col);
    }
    if (pr.blocked) info.cover = pr.blocked;   // 弹道被货箱 / 土坡挡住
    if (pr.hit) {
      info.hit = pr.hit;
      if (!sameCell(pr.hit, aimT)) { const b = modBox(B.e, pr.hit.r, pr.hit.c, B.e.v[pr.hit.layer][pr.hit.r][pr.hit.c].id); cornerMark(Math.round(b.x0), Math.round(b.y0), b.x1 - b.x0, b.y1 - b.y0); }
    }
  }

  // 「弹道中心会先打到这个模块」：四个橙色角框（黑边），轻轻呼吸
  function cornerMark(x, y, w, h) {
    const n = Math.max(6, Math.round(Math.min(w, h) * 0.3)), a = 0.65 + 0.35 * Math.sin(B.t * 6);
    g.save();
    for (const [col, lw, off] of [[P.black, 5, 0], ['#ffb347', 3, 0]]) {
      g.globalAlpha = col === P.black ? 0.8 : a; g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        g.moveTo(cx + dx * n, cy + off); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * n);
      }
      g.stroke();
    }
    g.restore();
  }

  const tintC = document.createElement('canvas');
  function tint(src) {
    tintC.width = src.width; tintC.height = src.height;
    const x = tintC.getContext('2d');
    x.clearRect(0, 0, src.width, src.height);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(7,8,12,0.55)';
    x.fillRect(0, 0, src.width, src.height);
    x.globalCompositeOperation = 'source-over';
    return tintC;
  }

  // ---------- HUD：A 驾驶台（2026-09-30 用户选定，样机见 tools/current.html 的 A）----------
  // 战场上不挂任何框：只有准星、弹道扇区、伤害数字。上方左右两块铁名牌（没有条）+ 正中计时鼓；
  // 你的车况、警报、武器、按钮全部收进画面下面一条铁皮仪表台。对方没有任何实时状态，挂白旗时钉一张电报。
  const PXI = () => SA.PX.ui;
  // 一块 2 倍像素的小画布：内容变了才重画（sig 相同就跳过）
  function pxCanvas() { const c = document.createElement('canvas'); c.className = 'px-img'; c.width = c.height = 1; return c; }
  function paint(c, sig, make) {
    if (c.dataset.sig === sig) return;
    c.dataset.sig = sig;
    const src = make();
    if (c.width !== src.width || c.height !== src.height) { c.width = src.width; c.height = src.height; c.style.width = `${src.width * 2}px`; c.style.height = `${src.height * 2}px`; }
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0);
  }
  const LAMPS = [['heat', SA.Config.text('battle_view_lamp_heat'), P.fire[2]], ['water', SA.Config.text('battle_view_lamp_water'), '#46c2c9'], ['power', SA.Config.text('battle_view_lamp_power'), P.fire[2]], ['track', SA.Config.text('battle_view_lamp_track'), P.fire[2]], ['gun', SA.Config.text('battle_view_lamp_weapon'), P.fire[2]]];
  function dashboard() {
    const fig = (c, label, cls = '') => h('div', { class: `dash-fig ${cls}` }, c, label ? h('span', {}, label) : null);
    hud.gauge = pxCanvas(); hud.tube = pxCanvas(); hud.hpNum = pxCanvas(); hud.plates = pxCanvas();
    hud.lamps = LAMPS.map(() => pxCanvas());
    hud.lampLabels = LAMPS.map(([, nm]) => h('span', {}, nm));
    hud.note = h('div', { class: 'dash-note px-sk px-sk-paper' });
    hud.keys = h('div', { class: 'dash-keys' });
    hud.keySig = null;
    hud.vent = PXI().btn(SA.Config.text('battle_view_vent'), { kind: 'dng', title: SA.Config.text('battle_view_vent_title'), onclick: () => { if (api.vent()) { hud.vent.disabled = true; hud.vent.className = 'px-btn off'; } } });
    const car = h('div', { class: 'dash-car' },
      hud.gaugeFig = fig(hud.gauge, SA.Config.text('battle_view_boiler')), hud.tubeFig = fig(hud.tube, SA.Config.text('battle_view_water')),
      h('div', { class: 'dash-hull' },
        h('div', { class: 'dash-hp' }, h('span', {}, SA.Config.text('battle_view_armor')), hud.hpNum), hud.plates,
        h('div', { class: 'dash-lamps' }, hud.lampBox = LAMPS.map((_, i) => h('div', { class: 'dash-lamp' }, hud.lamps[i], hud.lampLabels[i])))));
    const act = h('div', { class: 'dash-act' },
      h('div', { class: 'dash-vent' }, hud.vent, h('span', { class: 'px-cap' }, SA.Config.text('battle_view_once'))),
      PXI().btn(SA.Config.text('battle_view_retreat'), { title: SA.Config.text('battle_view_retreat_title'), onclick: () => { if (!B.p.dead) SA.UI.dialog(SA.Config.text('battle_view_retreat_title_short'), h('p', {}, SA.Config.text('battle_view_retreat_confirm')), [{ label: SA.Config.text('battle_view_retreat'), primary: true, onClick: () => { endIntro(); api.retreat(); } }], SA.Config.text('battle_view_continue')); } }),
      !SA.RELEASE ? speedSlider() : null);
    // 手机：左栏 = 车况 + 左圈，右栏 = 泄压 / 撤退 + 武器键 + 右圈待命位，两栏各自从上往下排（css 的 .bt-rail）
    if (touchUI) {
      touchPads();
      return h('div', { class: 'bt-dash px-sk px-sk-iron' },
        h('div', { class: 'bt-rail l' }, car, hud.stick),
        h('div', { class: 'dash-mid' }, hud.note),
        h('div', { class: 'bt-rail r' }, act, hud.keys, hud.aimHome));
    }
    return h('div', { class: 'bt-dash px-sk px-sk-iron' }, car,
      h('div', { class: 'dash-mid' }, hud.note, hud.keys),
      act,
      h('div', { class: 'bt-touch' },
        hud.move = h('div', { class: 'bt-move' }, holdBtn(SA.Config.text('battle_view_backward'), 'left'), holdBtn(SA.Config.text('battle_view_forward'), 'right')),
        hud.fireBtn = holdBtn(SA.Config.text('battle_view_fire'), 'fire', 'bt-fire')));
  }
  // 你的车现在的警报（按紧急程度）：亮哪几盏灯 + 纸条上的红字
  function alertsOf(s) {
    if (s.dead) return [];
    const out = [];
    if (s.heat / s.heatMax > T.HEAT_ALERT) out.push(['heat', SA.Config.text('battle_view_alert_heat')]);
    if (s.hold) out.push(['heat', SA.Config.text('battle_view_alert_cooling')]);
    if (s.waterMax && s.water <= 0) out.push(['water', SA.Config.text('battle_view_alert_no_water')]);
    else if (s.waterMax && s.water / s.waterMax < T.WATER_LOW_RATIO) out.push(['water', SA.Config.text('battle_view_alert_low_water')]);
    if (s.supply <= 0) out.push(['power', SA.Config.text('battle_view_alert_no_power')]);
    if (s.thrown) out.push(['track', SA.Config.text('battle_view_alert_track')]);
    if (!s.weapons.some(w => !w.blocked)) out.push(['gun', SA.Config.text('battle_view_alert_no_weapon')]);
    return out;
  }
  // 仪表台五盏灯：0 灭 / 1 常亮（有问题，留意）/ 2 闪（危险）；悬停灯看原因。
  // 纸条红字只报 alertsOf 的危险项，灯把「已经在拖后腿」的状况也亮出来（动力不足、水偏少、部件受损）
  const LAMP_WARN = { heat: 0.5, water: 0.45, power: 0.995, part: 0.5 };
  function lampsOf(s) {
    const L = { heat: [0, ''], water: [0, ''], power: [0, ''], track: [0, ''], gun: [0, ''] }, pct = (v) => Math.round(clamp(v, 0, 1) * 100);
    if (s.dead) return L;
    const set = (id, lv, text) => { if (lv > L[id][0]) L[id] = [lv, text]; };
    for (const [id, text] of alertsOf(s)) set(id, 2, text);
    const heat = s.heat / s.heatMax;
    if (heat > LAMP_WARN.heat) set('heat', 1, SA.Config.text('battle_view_lamp_heat_warn', pct(heat)));
    if (!s.waterMax) set('water', 1, SA.Config.text('battle_view_lamp_no_tank'));
    else if (s.water / s.waterMax < LAMP_WARN.water) set('water', 1, SA.Config.text('battle_view_lamp_water_warn', pct(s.water / s.waterMax)));
    // 动力：锅炉供不上设备 + 满速行驶的需求时，装填按比例变慢、也跑不到全速；不到一半算危险
    if (s.supply > 0 && s.power < LAMP_WARN.power) set('power', s.power < 0.5 ? 2 : 1, SA.Config.text('battle_view_lamp_power_warn', pct(s.power)));
    // 底盘：动不了算危险（掉链、腿断、失衡），有一段伤过半算留意
    let chHp = 0, chMax = 0, worst = 1, gunDead = 0;
    SA.V.each(s.v, (cell) => {
      const m = M[cell.id];
      if (m.layer === 'chassis') { const mx = SA.V.maxHp(cell); chHp += Math.max(0, cell.hp); chMax += mx; worst = Math.min(worst, Math.max(0, cell.hp) / Math.max(1, mx)); }
      else if (m.dmg && cell.hp <= 0) gunDead++;
    });
    if (chMax && s.speed <= 0) set('track', 2, SA.Config.text('battle_view_lamp_chassis_stuck'));
    else if (chMax && worst < LAMP_WARN.part) set('track', 1, SA.Config.text('battle_view_lamp_chassis_warn', pct(chHp / chMax)));
    const blocked = s.weapons.filter(w => w.blocked).length;
    if (gunDead || blocked) set('gun', 1, SA.Config.text('battle_view_lamp_weapon_warn', gunDead, blocked));
    return L;
  }
  // 操作提示属于教程：目前只在序章第一关出现
  const tutorialHint = () => B.opts.mode === 'campaign' && B.opts.storyKey === '0,0';
  // 纸条：警报（红）> 瞄准出了问题（墨）> 教程提示 > 瞄准的目标和命中率（淡墨）
  function noteOf() {
    const p = B.p;
    if (p.dead) return ['alert', p.reason || SA.Config.text('battle_view_disabled')];
    const al = alertsOf(p);
    if (al.length) return ['alert', [...new Set(al.map(a => a[1]))].join(' · ')];
    if (!p.sel) return ['warn', SA.Config.text(touchUI ? 'battle_view_no_weapon_touch' : 'battle_view_no_weapon')];
    const pi = B.previewInfo, aimT = B.aim ? targetAt(B.e, B.aim[0], B.aim[1]) : null;
    const alt = p.groups.includes('mortar') && p.sel !== 'mortar' ? SA.Config.text('battle_view_try_mortar') : '';
    if (pi && pi.blocked) return ['warn', SA.Config.text('battle_view_blocked')];
    if (pi && pi.over) return ['warn', pi.over === 'high' ? SA.Config.text('battle_view_too_high', M[p.sel].elev[1], alt) : SA.Config.text('battle_view_too_low')];
    if (pi && !pi.reach) return ['warn', SA.Config.text('battle_view_out_of_range')];
    if (aimT && pi && pi.cover && !pi.hit) return ['warn', pi.cover === 'crate' ? SA.Config.text('battle_view_crate_cover') : SA.Config.text('battle_view_hill_cover', alt || SA.Config.text('battle_view_try_mortar_alt'))];
    if (aimT && pi && pi.hit && !sameCell(pi.hit, aimT)) return ['warn', SA.Config.text('battle_view_hit_other', M[B.e.v[pi.hit.layer][pi.hit.r][pi.hit.c].id].name, alt)];
    if (p.spooling) return ['warn', SA.Config.text('battle_view_spooling')];
    if (tutorialHint()) return ['tut', SA.Config.text(touchUI ? 'battle_view_tutorial_hint_touch' : 'battle_view_tutorial_hint', p.groups.length > 1 ? SA.Config.text(touchUI ? 'battle_view_weapon_keys_touch' : 'battle_view_weapon_keys') : '')];
    if (!aimT) return ['info', ''];
    const parts = [aimT.layer === 'side' ? SA.Config.text('battle_view_aim_side_cannon') : SA.Config.text('battle_view_aim_enemy', M[B.e.v[aimT.layer][aimT.r][aimT.c].id].name)];
    if (pi && pi.chance != null) parts.push(SA.Config.text('battle_view_hit_chance', pi.chance));
    else if (pi && M[p.sel].indirect) parts.push(M[p.sel].spread ? SA.Config.text('battle_view_indirect_spread') : SA.Config.text('battle_view_indirect_exact'));
    if (p.fireHeld) parts.push(p.focus >= 1 ? SA.Config.text('battle_view_focus_ready') : SA.Config.text('battle_view_focus_progress', Math.round(p.focus * 100)));
    return ['info', parts.join(' · ')];
  }
  function updDash() {
    if (!hud.dash) return;
    const p = B.p, X = SA.PX, blink = Math.floor(performance.now() / 300) % 2 === 0;
    const heat = p.heat / p.heatMax, hot = heat > T.HEAT_ALERT;
    paint(hud.gauge, `${Math.round(heat * 60)}|${hot && blink}`, () => X.gauge(22, heat, T.HEAT_ALERT, hot && blink));
    hud.gaugeFig.classList.toggle('bad', hot);
    hud.gaugeFig.title = SA.Config.text('battle_view_heat_title', SA.Phys.fmtTemp(SA.Phys.temp(p.heat, p.heatCapacity)), SA.Phys.fmtHeat(p.heat), SA.Phys.fmtHeat(p.heatMax));
    const wf = p.waterMax ? p.water / p.waterMax : 0, low = !p.waterMax || wf < T.WATER_LOW_RATIO;
    paint(hud.tube, `${Math.round(wf * 40)}|${low && blink}`, () => X.tube(46, wf, P.water, low && blink));
    hud.tubeFig.classList.toggle('bad', low);
    hud.tubeFig.title = p.waterMax ? SA.Config.text('battle_view_water_title', SA.Phys.fmtWater(p.water), SA.Phys.fmtWater(p.waterMax)) : SA.Config.text('battle_view_no_tank');
    let a = 0, m = 0;
    SA.V.each(p.v, (cell) => { a += Math.max(0, cell.hp); m += SA.V.maxHp(cell); });
    const hp = a / Math.max(1, m), pct = Math.round(hp * 100);
    paint(hud.hpNum, `${pct}`, () => X.num(`${pct}%`, pct <= 25 ? '#ff8a5c' : '#e4e0d6', { shadow: P.dark[0] }));
    paint(hud.plates, `${Math.ceil(hp * 10)}`, () => X.plates(Math.ceil(hp * 10 - 1e-6), 10));
    const lamps = lampsOf(p);
    LAMPS.forEach(([id, nm, col], i) => {
      const [lv, why] = lamps[id], lit = lv === 1 || (lv === 2 && blink);
      paint(hud.lamps[i], `${lit}`, () => X.lamp(lit, col));
      hud.lampLabels[i].classList.toggle('on', lv === 1);
      hud.lampLabels[i].classList.toggle('crit', lv === 2);
      const title = why ? `${nm}：${why}` : SA.Config.text('battle_view_lamp_ok', nm);
      if (hud.lampBox[i].title !== title) hud.lampBox[i].title = title;
    });
    const [kind, text] = noteOf();
    if (hud.note.dataset.k !== kind || hud.note.textContent !== text) { hud.note.dataset.k = kind; hud.note.textContent = text; }
    renderKeys();
    // 上方：计时鼓 + 场地
    const left = Math.max(0, Math.ceil(K.BATTLE_TIME - B.t));
    paint(hud.drum, `${left}`, () => X.drum(String(left).padStart(2, '0')));
  }

  // 武器键：仪表台上固定 10 个位置（数字键 1–9、0），装了的武器组才有键，没装的位置空着；
  // 名字写在键上（不另外占地方），键底一条装填条，选中的键按下去（黄铜），整组打不了是暗铁
  const keyOf = (i) => (i === 9 ? '0' : String(i + 1));
  function groupReload(p, id) {
    let next = 0;
    for (const w of p.weapons) {
      if (w.cell.id !== id) continue;
      if ((p.timers[w.key] || 0) <= 0) return 1;
      next = Math.max(next, SA.Battle.reloadProgress(p, w));
    }
    return next;
  }
  function renderKeys() {
    const p = B.p, co = p.coGroups || [], stop = cantFire(p);
    const off = (id) => stop || !p.weapons.some(w => w.cell.id === id && !w.blocked);
    const sig = p.groups.map(id => `${id}:${off(id) ? 0 : 1}`).join(',') + '|' + p.sel + '|' + co.join(',');
    if (hud.keySig !== sig) {
      hud.keySig = sig;
      hud.keys.innerHTML = '';
      hud.bars = {};
      for (let i = 0; i < 10; i++) {
        const id = p.groups[i];
        if (!id) { hud.keys.append(h('span', { class: 'dash-key empty' })); continue; }
        const n = p.weapons.filter(w => w.cell.id === id).length, isCo = co.includes(id), sel = p.sel === id;
        const bar = h('i');
        hud.bars[id] = bar;
        hud.keys.append(h('button', { class: `dash-key ${sel ? 'on' : ''} ${off(id) ? 'off' : ''} ${isCo ? 'co' : ''}`, title: SA.Config.text('battle_view_weapon_title', keyOf(i), M[id].name, n, isCo ? SA.Config.text('battle_view_copilot') : ''), onclick: () => { p.sel = id; } },
          PXI().num(keyOf(i), sel ? '#2a1a05' : off(id) ? '#6f7a8e' : '#e4e0d6'),
          h('span', { class: 't' }, M[id].name), n > 1 ? h('span', { class: 'c' }, `×${n}`) : null,
          h('b', { class: 'rl' }, bar)));
      }
    }
    for (const id of p.groups.slice(0, 10)) {
      const bar = hud.bars[id];
      if (!bar) continue;
      const f = groupReload(p, id);
      bar.style.width = `${Math.round(f * 100)}%`;
      bar.classList.toggle('ok', f >= 1);
    }
  }

  // ---------- 流程 ----------
  const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'fire', KeyW: 'jump', ArrowUp: 'jump', KeyS: 'crouch', ArrowDown: 'crouch' };   // 跳 / 蹲只对真双足有效（battle.js updateBiped）
  function onKey(e) {
    if (!B || B.done || SA.current !== 'battle') return;
    // 开场期间不接操作；开战动画可以用空格 / 回车 / Esc 跳过（教程对话框自己处理按键）
    if (B.intro) {
      if (B.intro.mode === 'cine' && e.type === 'keydown' && /^(Space|Enter|NumpadEnter|Escape)$/.test(e.code)) { e.preventDefault(); endIntro(); }
      // 拦路过场：只在没有对话框、也不在编辑器里打字时跳过开车这一段
      else if (B.intro.mode === 'ambush' && e.type === 'keydown' && /^(Space|Enter|NumpadEnter|Escape)$/.test(e.code) && !e.target.closest?.('input, textarea, select, .sd')) { e.preventDefault(); ambushSkip(); }
      return;
    }
    if (B.surrender === 'raising') {
      if (e.type === 'keydown' && /^(Space|Enter|NumpadEnter|Escape)$/.test(e.code)) { e.preventDefault(); api.skipSurrenderAnimation(); }
      return;
    }
    const k = KEYMAP[e.code];
    if (k) { B.keys[k] = e.type === 'keydown'; e.preventDefault(); }
    const m = /^(Digit|Numpad)([0-9])$/.exec(e.code);
    if (m && e.type === 'keydown') {
      const id = B.p.groups[m[2] === '0' ? 9 : +m[2] - 1];
      if (id) B.p.sel = id;
    }
  }

  // 整场战斗共用正式模块配置中的速度；发行版不提供调速入口，也不读取旧浏览器偏好。
  function gameSpeed() { return K.GAME_SPEED; }
  function speedSlider() {
    const out = h('b', {}, `${gameSpeed().toFixed(2)}×`);
    const status = h('span', { 'aria-live': 'polite' });
    const range = h('input', { type: 'range', min: T.GAME_SPEED_MIN, max: T.GAME_SPEED_MAX, step: T.GAME_SPEED_STEP, value: gameSpeed(), 'aria-label': SA.Config.text('battle_view_speed_aria'),
      oninput: () => { B.speed = +range.value; out.textContent = `${B.speed.toFixed(2)}×`; status.textContent = ''; },
      onchange: async () => {
        range.blur(); range.disabled = true;
        const speed = +range.value;
        status.textContent = SA.Config.text('battle_view_speed_saving');
        try {
          // 服务端在配置锁内只改 GAME_SPEED，避免整份覆盖同时保存的模块作者数据。
          const saved = await fetch('/__battle-speed/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameSpeed: speed }) });
          const result = await saved.json().catch(() => ({}));
          if (!saved.ok || !result.ok) throw new Error(result.error || `写入配置 HTTP ${saved.status}`);
          K.GAME_SPEED = result.gameSpeed;
          SA.Config.get('modules').K.GAME_SPEED = result.gameSpeed;
          status.textContent = SA.Config.text('battle_view_speed_saved');
        } catch (error) {
          B.speed = gameSpeed(); range.value = B.speed; out.textContent = `${B.speed.toFixed(2)}×`;
          status.textContent = SA.Config.text('battle_view_speed_save_failed');
          SA.UI.toast(SA.Config.text('battle_view_speed_save_failed_detail', error.message));
        } finally { range.disabled = false; }
      } });
    return h('label', { class: 'bt-speed', title: SA.Config.text('battle_view_speed_title') }, SA.Config.text('battle_view_speed'), range, out, status);
  }

  // ---------- 手机双圈操作（.touchui）：左圈开车、右圈瞄准 + 开火 ----------
  // 左圈固定在左下：按住往右推前进、往左拉倒车（只看横向），松手摇杆回中、车停下。
  // 右圈不固定：左圈和按钮以外的战斗界面任意一处按下，圈就出现在手指下面、一直跟着手指；
  //   手指在画面上 = 准星就在手指下（指哪打哪）；在画面外（两侧栏、竖屏下面的空地）= 像触控板一样拖着准星走。
  //   按着就是按住开火（准星收紧，收满自动打，机枪一直打），抬手打出去。两个圈可以同时按。
  // 整块战斗界面 touch-action: none（css），浏览器不会把双指 / 双击当成缩放。
  function pxRing(r, w, col, fill) {
    const n = r * 2 + 2, c = document.createElement('canvas'); c.width = c.height = n; c.className = 'px-img';
    const x = c.getContext('2d');
    for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
      const dd = Math.hypot(px + 0.5 - n / 2, py + 0.5 - n / 2);
      let col2 = null;
      if (dd > r + 1) continue;
      else if (dd > r) col2 = P.black;
      else if (dd > r - w) col2 = dd > r - 1 && px + py < n ? P.brass[3] : col;
      else if (dd > r - w - 1) col2 = P.black;
      else col2 = fill;
      if (!col2) continue;
      x.fillStyle = col2; x.fillRect(px, py, 1, 1);
    }
    c.style.width = `${n * 2}px`; c.style.height = `${n * 2}px`;
    return c;
  }
  const STICK_R = 26;
  function touchPads() {
    const base = pxRing(STICK_R, 3, P.brass[2], 'rgba(11,14,21,0.5)');
    // 圈里左右两枚小三角：往哪边推就往哪边开
    const bx = base.getContext('2d'), n = base.width;
    for (const [col, grow] of [[P.black, 1], [P.brass[3], 0]]) for (const dir of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x0 = Math.round(n / 2 + dir * (STICK_R - 7) - dir * i), hh = 4 - i;
      bx.fillStyle = col; bx.fillRect(x0 - grow, Math.round(n / 2) - hh - grow, 1 + grow * 2, hh * 2 + 1 + grow * 2);
    }
    hud.knob = pxRing(11, 11, P.brass[2]);
    hud.knob.classList.add('bt-knob');
    hud.stick = h('div', { class: 'bt-stick' }, base, hud.knob);
    hud.move = hud.stick;
    hud.aimHome = h('div', { class: 'bt-aimhome' }, h('i'), h('span', {}, SA.Config.text('battle_view_aim_pad')));
    hud.aimRing = h('div', { class: 'bt-aimring' }, pxRing(22, 2, P.brass[2]));
    hud.fireBtn = hud.aimHome;   // 教程讲开火时让右圈的待命位发光
  }
  // 右圈：没按时停在右下的待命位（半透明），按下就跳到手指下面
  function placeAimRing(x, y, on) {
    const r = hud.aimRing;
    if (!r || !r.isConnected) return;
    if (x == null) { const b = hud.aimHome.firstChild.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
    r.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    r.classList.toggle('on', !!on);
  }
  function bindTouch(root, toNative) {
    let stick = null, aim = null;
    const stickMove = (e) => {
      const b = hud.stick.getBoundingClientRect(), R = b.width / 2 - 8;
      const dx = clamp(e.clientX - (b.left + b.width / 2), -R, R), dy = clamp(e.clientY - (b.top + b.height / 2), -R, R);
      hud.knob.style.transform = `translate(${Math.round(dx / 2) * 2}px, ${Math.round(dy / 2) * 2}px)`;
      B.keys.left = dx < -R * 0.22; B.keys.right = dx > R * 0.22;
      B.keys.jump = dy < -R * 0.55; B.keys.crouch = dy > R * 0.55;   // 上推跳、下拉蹲（真双足）
      hud.stick.classList.toggle('on', B.keys.left || B.keys.right || B.keys.jump || B.keys.crouch);
    };
    const stickEnd = () => { stick = null; if (B) B.keys.left = B.keys.right = B.keys.jump = B.keys.crouch = false; hud.knob.style.transform = ''; hud.stick.classList.remove('on'); };
    const inCanvas = (e) => { const rc = cv.getBoundingClientRect(); return e.clientX >= rc.left && e.clientX <= rc.right && e.clientY >= rc.top && e.clientY <= rc.bottom; };
    root.addEventListener('pointerdown', (e) => {
      if (!B || B.done) return;
      if (hud.stick.contains(e.target)) {
        e.preventDefault();
        if (B.intro || stick != null) return;
        stick = e.pointerId; try { root.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有活动指针 */ }
        stickMove(e); return;
      }
      if (e.target.closest('button, input, a, select, .vn')) return;   // 武器键、泄压、撤退、对话框照常点
      e.preventDefault();
      if (B.intro) { if (B.intro.mode === 'cine') endIntro(); else if (B.intro.vn && B.intro.vn.advance) B.intro.vn.advance(); else if (B.intro.mode === 'ambush') ambushSkip(); return; }
      if (B.surrender === 'raising') { api.skipSurrenderAnimation(); return; }
      if (aim) return;
      const abs = inCanvas(e);
      aim = { id: e.pointerId, abs, x: e.clientX, y: e.clientY };
      try { root.setPointerCapture(e.pointerId); } catch (_) { /* 合成事件没有活动指针 */ }
      if (abs) B.aimScreen = toNative(e);
      else if (!B.aimScreen) B.aimScreen = [W * 0.72, H * 0.62];
      B.keys.fire = true;
      placeAimRing(e.clientX, e.clientY, true);
    });
    root.addEventListener('pointermove', (e) => {
      if (!B) return;
      if (e.pointerId === stick) { stickMove(e); return; }
      if (!aim || e.pointerId !== aim.id) return;
      if (aim.abs) { const [x, y] = toNative(e); B.aimScreen = [clamp(x, 0, W), clamp(y, 0, H)]; }
      else {
        // 触控板：手指走多少，准星按画布比例走 1.6 倍
        const k = 1.6 * W / Math.max(1, cv.getBoundingClientRect().width);
        B.aimScreen = [clamp(B.aimScreen[0] + (e.clientX - aim.x) * k, 0, W), clamp(B.aimScreen[1] + (e.clientY - aim.y) * k, 0, H)];
        aim.x = e.clientX; aim.y = e.clientY;
      }
      placeAimRing(e.clientX, e.clientY, true);
    });
    const end = (e) => {
      if (e.pointerId === stick) { stickEnd(); return; }
      if (aim && e.pointerId === aim.id) { aim = null; if (B) B.keys.fire = false; placeAimRing(null, null, false); }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari 的双指缩放手势不走 touch-action，单独拦一下；双击放大也拦掉
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) root.addEventListener(ev, (e) => e.preventDefault());
    requestAnimationFrame(() => placeAimRing(null, null, false));
  }

  function holdBtn(label, key, cls = '') {
    const b = h('button', { class: `btn ${cls}` }, label);
    const set = (v) => (e) => { e.preventDefault(); if (B) B.keys[key] = v; };
    b.addEventListener('pointerdown', set(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, set(false));
    return b;
  }

  function tick(dt) {
    if (!B) return;
    for (const p of B.parts) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'glance') p.vy += 300 * dt;
      if (p.type === 'debris' || p.type === 'spark' || p.type === 'dust' || p.type === 'shard') {
        p.vy += 660 * dt;
        const gy = groundAt(p.x);
        if (p.y > gy) { p.y = gy; p.vy *= -0.3; p.vx *= 0.6; }
      }
      if (p.type === 'smoke' || p.type === 'steam') p.vx *= 0.98;
    }
    B.parts = B.parts.filter(p => p.life > 0);
    for (const t of B.texts) { t.life -= dt; t.y -= 42 * dt; }
    tickDmg(dt);
    B.texts = B.texts.filter(t => t.life > 0);
    B.shake = Math.max(0, B.shake - dt * 14);
  }

  // ---------- 开场：第一关的教程（箭头指着自己的部件讲解）+ 每场的开战动画 ----------
  // 开场期间战斗不推进（step 不跑），镜头由这里直接摆；结束后交还给 battle.js 的镜头，它会自己平滑拉回
  const easeIO = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const CINE = { pIn: 0.7, pHold: 1.1, pan: 2.1, eHold: 2.4, back: 3.0, drop: 2.8, land: 3.15, fire: 3.6, stamp: 3.8, fade: 4.7, end: 5.1 };
  const CZ = 2.3;
  // bottom：画面下沿对准的世界 y（战斗镜头是地面往下 60）
  function camAt(cx, z, bottom = GROUND + 60) {
    const cam = B.cam;
    cam.z = z; cam.w = W / z; cam.h = H / z;
    cam.x = cx - cam.w / 2; cam.y = bottom - cam.h;
  }
  const camBottom = () => B.cam.y + B.cam.h;
  const camCx = () => B.cam.x + B.cam.w / 2;
  function sideBox(s) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    SA.V.each(s.v, (cell, r, c) => {
      if (!alive(cell)) return;
      const b = modBox(s, r, c, cell.id);
      x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
    });
    return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // 教程要指的部件：驾驶舱 / 底盘 / 锅炉 / 机枪（没有机枪就指第一件武器）
  const PART_TEST = {
    cockpit: (id) => SA.isCockpit(id),
    track: (id) => id === 'track' || !!M[id].load,
    boiler: (id) => !!M[id].supply,
    mg: (id) => /^mg/.test(id) && !!M[id].dmg,
    weapon: (id) => !!M[id].dmg,
  };
  function findPart(s, part) {
    for (const test of [PART_TEST[part], part === 'mg' ? PART_TEST.weapon : null]) {
      if (!test) continue;
      let hit = null;
      SA.V.each(s.v, (cell, r, c) => { if (!hit && alive(cell) && test(cell.id)) hit = { r, c, id: cell.id }; });
      if (hit) return hit;
    }
    return null;
  }
  function beginIntro(opts) {
    const I = { mode: 'cine', t: 0, clock: 0, home: { ...B.cam }, from: null, focus: null, arrows: null, puffs: [], vn: null, shook: {} };
    B.intro = I;
    if (opts.ambush) { beginAmbush(I, opts.ambush); return; }
    const tut = SA.Story && SA.Story.tutorial(opts, touchUI ? 'touch' : 'desktop');
    if (!tut) { I.from = { cx: camCx(), z: B.cam.z, bot: camBottom() }; return; }
    I.mode = 'tutor';
    const box = sideBox(B.p);
    I.arrows = tut.parts.map(p => {
      const at = findPart(B.p, p.part);
      if (!at) return null;
      const b = modBox(B.p, at.r, at.c, at.id), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      // 箭头从车外指向部件：方向取车中心 → 部件；底盘在最下面，改成从车头斜上方指过去
      let dx = mx - box.cx, dy = my - box.cy;
      if (p.part === 'track' || Math.hypot(dx, dy) < 6) { dx = -1; dy = -0.35; }
      const n = Math.hypot(dx, dy); dx /= n; dy /= n;
      const reach = Math.min((b.x1 - b.x0) / 2 / Math.max(0.01, Math.abs(dx)), (b.y1 - b.y0) / 2 / Math.max(0.01, Math.abs(dy)));
      return { part: p.part, label: p.label, b, mx, my, ox: dx, oy: dy, reach };   // o = 由车内指向车外的方向
    }).filter(Boolean);
    const lines = tut.intro.map(L => ({ ...L, on: () => { I.focus = null; } }));
    for (const p of tut.parts) {
      if (!I.arrows.some(a => a.part === p.part)) continue;
      for (const L of p.lines) lines.push({ ...L, on: () => { I.focus = p.part; } });
    }
    // 操作教学（旁白）：开车 / 瞄准 / 开火 / 换武器，电脑和触屏各一套；画面上同步演示，对应的真按钮发光
    const ctl = (tut.controls || []).filter(c => c.lines.length);
    if (ctl.length && touchUI && window.innerHeight > window.innerWidth) lines.push({ text: SA.Config.text('battle_view_tutorial_rotate'), on: () => { I.focus = null; } });
    for (const c of ctl) for (const L of c.lines) lines.push({ ...L, on: () => { if (I.focus !== CTL + c.part) I.ctlT = 0; I.focus = CTL + c.part; } });
    I.vn = SA.Story.talk(lines, { host: wrap, cls: `vn-battle${touchUI ? ' vn-touch' : ''}`, onDone: () => {
      SA.Story.mark('tutorial');
      if (B.intro !== I) return;
      I.vn = null; I.mode = 'cine'; I.t = 0; I.from = { cx: camCx(), z: B.cam.z, bot: camBottom() };
    } });
  }
  // ---------- 拦路过场（支线第一次出现，SA.Side）----------
  // 你的车沿着路开进画面停下；对方的车从右边冲进来，急刹横在路上（扬尘、震屏、你头上冒一个「！」）。
  // 接着演这一段的台词（剧情编号 opts.ambush.story，作者在剧情编辑器里写；没写就直接开战），演完接正常开战动画的后半段（徽记 + 「开战！」）。
  // 车只在画面上平移（I.dx），战斗状态里的位置不动；腿式底盘走整数步，停下时正好是战斗开始的站姿。
  const AMB = { pIn: 2.1, eAt: 1.6, eIn: 0.8, talk: 3.2, run: 140 };
  const introDx = (s) => (B.intro && B.intro.dx ? B.intro.dx[isP(s) ? 'p' : 'e'] || 0 : 0);
  const introCar = (s) => (B.intro && B.intro.spd ? { moving: B.intro.spd[isP(s) ? 'p' : 'e'] > 4, speed: B.intro.spd[isP(s) ? 'p' : 'e'] } : null);
  function beginAmbush(I, amb) {
    Object.assign(I, { mode: 'ambush', story: amb.story, dust: [], mark: -1, talked: false, hold: null });
    const pb = sideBox(B.p), eb = sideBox(B.e);
    // 镜头框住两车停下的位置（场地两头的路障在框外）；两辆车的起点都在框外
    const x0 = pb.x0 - 60, x1 = eb.x1 + 60, z = clamp(W / (x1 - x0), 1.2, 2.2), cx = (x0 + x1) / 2, half = W / z / 2;
    I.frame = { cx, z };
    I.run = { p: { d0: cx - half - 24 - pb.x1, dur: AMB.pIn }, e: { d0: cx + half + 24 - eb.x0, dur: AMB.eIn } };
    for (const k of ['p', 'e']) {
      const s = B[k], run = I.run[k], dist = Math.abs(run.d0), legs = s.chassisId === 'quad' || s.chassisId === 'biped';
      const stride = legs ? (s.chassisId === 'quad' ? SA.LEGLAB.quadStride : SA.LEGLAB.strideFor)(dist / run.dur) : 1;
      run.phase0 = s.anim.phase;
      run.total = legs ? Math.PI * 2 * Math.max(1, Math.round(dist / (4 * stride))) : dist;
    }
    I.dx = { p: I.run.p.d0, e: I.run.e.d0 };
    I.spd = { p: 0, e: 0 };
    camAt(cx, z * 0.94, GROUND + 44);
  }
  function ambushStep(I, dt) {
    I.t += dt;
    const t = I.t, stop = AMB.eAt + AMB.eIn, f = I.frame;
    B.p.anim.step(dt); B.e.anim.step(dt);
    // 你的车缓缓停下；她的车冲得快、刹得急
    const prog = { p: 1 - Math.pow(1 - clamp(t / AMB.pIn, 0, 1), 3), e: 1 - Math.pow(1 - clamp((t - AMB.eAt) / AMB.eIn, 0, 1), 2.4) };
    for (const k of ['p', 'e']) {
      const run = I.run[k], dx = run.d0 * (1 - prog[k]);
      I.spd[k] = dt > 0 ? Math.abs(dx - I.dx[k]) / dt : 0;
      I.dx[k] = dx;
      B[k].anim.phase = run.phase0 + run.total * prog[k];
      // 车尾扬尘
      if (I.spd[k] > 50 && Math.random() < dt * (k === 'e' ? 40 : 18)) {
        const b = sideBox(B[k]), back = k === 'p' ? b.x0 + dx : b.x1 + dx;
        I.dust.push({ x: back + vr(-6, 6), y: GROUND - vr(2, 10), vx: (k === 'p' ? -1 : 1) * vr(20, 60), vy: -vr(10, 40), life: vr(0.5, 0.9), max: 0.9, r: vr(5, 10) });
      }
    }
    // 急刹：车头往前一扑、你的车往后一缩，扬一大片尘，你头上冒「！」
    if (t >= stop && !I.shook.stop) {
      I.shook.stop = true;
      B.shake = Math.max(B.shake, 6);
      SA.Dyn.kick(B.e.anim.body, 7); SA.Dyn.kick(B.p.anim.body, -3);
      const b = sideBox(B.e);
      for (let i = 0; i < 26; i++) I.dust.push({ x: b.x0 + vr(-14, (b.x1 - b.x0) * 0.7), y: GROUND - vr(0, 10), vx: vr(-170, 70), vy: -vr(20, 100), life: vr(0.7, 1.4), max: 1.4, r: vr(8, 18) });
      I.mark = 0;
    }
    if (I.mark >= 0) I.mark += dt;
    for (const p of I.dust) { p.life -= dt; const k = Math.exp(-2.6 * dt); p.vx *= k; p.vy = p.vy * k - 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    I.dust = I.dust.filter(p => p.life > 0);
    // 镜头：开进来时慢慢推近；刹住以后再往前推一点，等台词
    const zk = t < stop ? 0.94 + 0.06 * easeIO(t / stop) : 1 + 0.06 * easeIO((t - stop) / 0.8);
    camAt(f.cx, f.z * zk, GROUND + 44);
    if (t >= AMB.talk && !I.talked) { I.talked = true; ambushTalk(I); }
    if (I.hold != null && (I.hold -= dt) <= 0) ambushGo(I);
  }
  function ambushTalk(I) {
    let rows = [];
    try { rows = SA.StoryData ? SA.StoryData.get(I.story) : []; } catch (e) { rows = []; }
    const dev = !SA.RELEASE && SA.StoryDev && SA.StoryDev.enabled && SA.StoryDev.enabled();
    if (!rows.length && dev) rows = [{ text: SA.Config.text('battle_view_ambush_dev_hint') }];
    if (!rows.length || !SA.Story) { I.hold = 0.5; return; }   // 还没写台词：停一下直接开战
    I.vn = SA.Story.talk(rows, { host: wrap, cls: `vn-battle${touchUI ? ' vn-touch' : ''}`,
      onDone: () => { if (B.intro !== I) return; I.vn = null; ambushGo(I); },
      // 开发者：对话框上的「编排剧情」直接改这一段，保存后接着开战
      onEdit: SA.RELEASE || !SA.StoryDev || !SA.StoryDev.editor ? null : () => { I.vn = null; SA.StoryDev.editor(I.story, { cont: () => { if (B.intro === I) ambushGo(I); } }); } });
  }
  // 台词演完：接开战动画的后半段（镜头拉回全景、徽记落地、「开战！」）
  function ambushGo(I) {
    if (I.mode !== 'ambush') return;
    Object.assign(I, { mode: 'cine', short: true, hold: null, dx: { p: 0, e: 0 }, spd: null, puffs: [] });
    I.t = I.fromT = CINE.drop - 0.5;
    I.from = { cx: camCx(), z: B.cam.z, bot: camBottom() };
  }
  // 点击 / 空格：开车阶段直接跳到停稳；没台词的停顿直接开战（台词由对话框自己翻）
  function ambushSkip() {
    const I = B.intro;
    if (!I || I.mode !== 'ambush' || I.vn) return;
    if (!I.talked) I.t = Math.max(I.t, AMB.talk - 0.01);
    else if (I.hold != null) ambushGo(I);
  }
  function ambushDraw(I) {
    const Z = DPX;
    dg.setTransform(Z, 0, 0, Z, 0, 0);
    dg.imageSmoothingEnabled = false;
    // 扬尘（碎石路上的黄白土）：按 3 像素对齐的方块，越淡越大
    for (const p of I.dust) {
      const k = p.life / p.max, [sx, sy] = toScreen(p.x, p.y), r = Math.max(3, Math.round(p.r * B.cam.z * (1.5 - k * 0.5) / 3) * 3);
      dg.globalAlpha = Math.min(1, k * 1.6) * 0.75;
      dg.fillStyle = k > 0.55 ? P.steam[2] : P.steam[1];
      dg.fillRect(Math.round((sx - r / 2) / 3) * 3, Math.round((sy - r / 2) / 3) * 3, r, r);
    }
    dg.globalAlpha = 1;
    // 「！」：像素感叹号，弹出来再停住，一秒后淡掉
    if (I.mark >= 0 && I.mark < 1.3) {
      // 6 × 12 格的字形：黑描边、亮黄铜、右边一列暗面；弹出时整体放大，停住后上下轻晃
      const b = sideBox(B.p), [sx, sy] = toScreen(b.cx + I.dx.p, b.y0);
      const u = Math.round(6 * (I.mark < 0.15 ? 1 + 0.5 * (1 - I.mark / 0.15) : 1)), a = I.mark > 1 ? 1 - (I.mark - 1) / 0.3 : 1;
      const x = Math.round(sx - u * 3), y = Math.round(sy - 20 - u * 12 - (I.mark < 0.15 ? 0 : Math.round(Math.sin((I.mark - 0.15) * 9) * 2)));
      const px = (col, cx, cy, w, hh) => { dg.fillStyle = col; dg.fillRect(x + cx * u, y + cy * u, w * u, hh * u); };
      dg.globalAlpha = Math.max(0, a);
      px(P.black, 0, 0, 6, 8); px(P.black, 0, 9, 6, 3);
      px(P.brass[3], 1, 1, 4, 6); px(P.brass[3], 1, 10, 4, 1);
      px(P.brass[1], 4, 1, 1, 6); px(P.brass[1], 4, 10, 1, 1);
      dg.globalAlpha = 1;
    }
    // 开车阶段：右下角提示可以跳过
    if (!I.talked) {
      dg.font = '12px "Microsoft YaHei", sans-serif'; dg.textAlign = 'right'; dg.textBaseline = 'alphabetic';
      dg.fillStyle = P.steam[1]; dg.fillText(SA.Config.text('battle_view_skip_intro'), W - 16, H - 16);
      dg.textAlign = 'start';
    }
  }
  function endIntro() {
    const I = B.intro;
    if (!I) return;
    if (I.vn) { const vn = I.vn; I.vn = null; vn.close(); }
    tutGlow(null);
    B.intro = null;
    B.keys.left = B.keys.right = B.keys.fire = B.keys.jump = B.keys.crouch = false;
    B.shake = 0;
  }
  // 关键帧插值：[[t, 值…]...]
  function keyCam(frames, t) {
    let i = 0;
    while (i < frames.length - 1 && t > frames[i + 1][0]) i++;
    const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
    const k = b[0] > a[0] ? easeIO((t - a[0]) / (b[0] - a[0])) : 1;
    return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
  }
  function introStep(dt) {
    const I = B.intro;
    I.clock += dt;
    tick(dt);   // 粒子和震屏照常衰减
    if (I.mode === 'tutor') {
      // 讲解部件和开车时镜头推到玩家车上；旁白、瞄准、开火演示时回到全景（两辆车都看得见）。
      const pb = sideBox(B.p), ctl = I.focus && I.focus.startsWith(CTL) ? I.focus.slice(CTL.length) : null;
      I.ctlT = (I.ctlT || 0) + dt;
      tutGlow(ctl);
      // 对话框压在画面上方，讲解时把车往画面下方放，给箭头和标签留出空间
      const close = I.focus && (!ctl || ctl === 'move');
      // 瞄准 / 开火演示：大屏看全景；手机上画面窄，推到对方车上，手指和准星才看得清
      const foe = (ctl === 'aim' || ctl === 'fire') && legible() > 1.2 ? sideBox(B.e) : null;
      const [tx, tz, tb] = close ? [pb.cx, tutZoom(), GROUND + 22] : foe ? [foe.cx - 40, tutZoom() * 0.8, GROUND + 22] : [I.home.x + I.home.w / 2, I.home.z, GROUND + 60];
      const k = Math.min(1, dt * 4);
      camAt(camCx() + (tx - camCx()) * k, B.cam.z + (tz - B.cam.z) * k, camBottom() + (tb - camBottom()) * k);
      return;
    }
    if (I.mode === 'ambush') { ambushStep(I, dt); return; }
    I.t += dt;
    const t = I.t, pb = sideBox(B.p), eb = sideBox(B.e), home = I.home.x + I.home.w / 2;
    const G0 = GROUND + 60, G1 = GROUND + 30;
    // 拦路过场之后（short）两辆车都看过了：镜头直接拉回全景，接徽记和「开战！」
    const [cx, z, bot] = keyCam(I.short ? [[I.fromT, I.from.cx, I.from.z, I.from.bot], [CINE.back, home, I.home.z, G0]]
      : [[0, I.from.cx, I.from.z, I.from.bot], [CINE.pIn, pb.cx, CZ, G1], [CINE.pHold, pb.cx, CZ, G1], [CINE.pan, eb.cx, CZ, G1], [CINE.eHold, eb.cx, CZ, G1], [CINE.back, home, I.home.z, G0]], t);
    camAt(cx, z, bot);
    const once = (k, fn) => { if (!I.shook[k]) { I.shook[k] = true; fn(); } };
    if (t >= CINE.land) once('land', () => {
      B.shake = Math.max(B.shake, 6);
      for (let i = 0; i < 14; i++) I.puffs.push({ x: W / 2 + vr(-110, 110), y: H * 0.34 + 110, vx: vr(-160, 160), vy: vr(-60, 10), life: vr(0.4, 0.8), max: 0.8, r: vr(6, 12), col: P.bg[5] });
    });
    if (t >= CINE.fire) once('fire', () => {
      B.shake = Math.max(B.shake, 7);
      const em = SA.Story.emblem(0), s = EMS, x0 = W / 2 - 32 * s, y0 = H * 0.34 - 32 * s;
      for (const [mx, my, dx, dy] of em.muzzles) {
        const sx = x0 + mx * s, sy = y0 + my * s;
        for (let i = 0; i < 22; i++) {
          const sp = vr(80, 340), a = Math.atan2(dy, dx) + vr(-0.45, 0.45);
          I.puffs.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: vr(0.6, 1.3), max: 1.3, r: vr(9, 24), col: i % 3 ? P.steam[2] : P.steam[1], drag: 2.2 });
        }
      }
    });
    for (const p of I.puffs) { p.life -= dt; const f = Math.exp(-(p.drag || 3) * dt); p.vx *= f; p.vy = p.vy * f - 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    I.puffs = I.puffs.filter(p => p.life > 0);
    if (t >= CINE.end) endIntro();
  }
  const EMS = 4;   // 徽记放大倍数（屏幕像素）
  // 像素箭头：朝 +x，旋转后逐像素采样，保持方块边缘
  const arrowCache = {};
  function arrowSprite(ang) {
    const key = Math.round(ang * 36 / Math.PI);
    if (arrowCache[key]) return arrowCache[key];
    const R = 16, c = document.createElement('canvas'); c.width = c.height = R * 2;
    const x = c.getContext('2d'), co = Math.cos(ang), si = Math.sin(ang);
    const inside = (u, v, grow) => (u >= -14 - grow && u <= 0 + grow && Math.abs(v) <= 2.5 + grow) || (u >= -1 - grow && u <= 10 + grow && Math.abs(v) <= (10 - u) * 0.7 + grow);
    for (let py = 0; py < R * 2; py++) for (let px = 0; px < R * 2; px++) {
      const dx = px + 0.5 - R, dy = py + 0.5 - R, u = dx * co + dy * si, v = -dx * si + dy * co;
      if (inside(u, v, 0)) { x.fillStyle = v < -0.8 ? P.brass[3] : v > 1.6 ? P.brass[1] : P.brass[2]; x.fillRect(px, py, 1, 1); }
      else if (inside(u, v, 1.2)) { x.fillStyle = P.black; x.fillRect(px, py, 1, 1); }
    }
    return (arrowCache[key] = c);
  }
  // ---------- 操作教学的演示（第一关教程讲完部件后，旁白讲操作）----------
  const CTL = 'ctl:';
  // 画布在屏幕上越窄，教程的箭头和铭牌越要放大才看得清：先把镜头推近一些（最多 1.5 倍），剩下的靠放大箭头和字
  const legible = () => clamp(900 / Math.max(1, cv.clientWidth), 1, 3);
  const tutZoom = () => 2.2 * Math.min(1.5, legible());
  const tutL = () => legible() / Math.min(1.5, legible());
  // 讲到哪一步，仪表台上对应的真按钮就发光（电脑上没有移动 / 开火键，只有武器键会亮）
  function tutGlow(part) {
    for (const [k, el] of [['move', hud.move], ['fire', hud.fireBtn], ['weapon', hud.keys]]) if (el) el.classList.toggle('tut-glow', k === part);
  }
  // 演示用的指针：电脑 = 鼠标箭头，触屏 = 白手套食指（指尖朝上，指尖就是瞄准点）。X 黑边 / w 亮 / s 暗
  const POINTERS = {
    mouse: { tip: [0, 0], rows: ['X', 'XX', 'XwX', 'XwwX', 'XwwwX', 'XwwwwX', 'XwwwwwX', 'XwwwwwwX', 'XwwwwwwwX', 'XwwwwwXXXX', 'XwwXwwX', 'XwX XwwX', 'XX  XwwX', '     XwwX', '      XX'] },
    finger: { tip: [5, 0], rows: ['    XXX', '   XwwwX', '   XwwsX', '   XwwsX', '   XwwsXXX', '   XwwsXwwXX', ' XXXwwsXwsXwX', 'XwwXwwwwwwsXwX', 'XwsXwwwwwwwwsX', 'XwwwwwwwwwwwsX', ' XwwwwwwwwwwsX', '  XwwwwwwwwsX', '   XwwwwwwsX', '    XsssssX', '    XXXXXXX'] },
  };
  const pointerCache = {};
  function pointerSprite(kind) {
    if (pointerCache[kind]) return pointerCache[kind];
    const def = POINTERS[kind], w = Math.max(...def.rows.map(r => r.length)), c = document.createElement('canvas');
    c.width = w; c.height = def.rows.length;
    const x = c.getContext('2d'), col = { X: P.black, w: '#f2ecdc', s: '#b9b09a' };
    def.rows.forEach((row, y) => [...row].forEach((ch, i) => { if (col[ch]) { x.fillStyle = col[ch]; x.fillRect(i, y, 1, 1); } }));
    return (pointerCache[kind] = { cv: c, tip: def.tip });
  }
  // 世界坐标 → 画面坐标（W × H）
  const toScreen = (x, y) => [(x - B.cam.x) * B.cam.z, (y - B.cam.y) * B.cam.z];
  // 黄铜小铭牌（同部件讲解的标签）；当前变换下画，字号跟着变换缩放。side：0 = x 是中心，1 = x 是左边，-1 = x 是右边
  function brassTag(text, x, y, fs, side = 0) {
    dg.font = `900 ${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    const w = dg.measureText(text).width + fs, hh = Math.round(fs * 1.5), b = Math.max(1, Math.round(fs / 9));
    x += side * w / 2;
    dg.fillStyle = P.black; dg.fillRect(Math.round(x - w / 2) - b, Math.round(y - hh / 2) - b, Math.round(w) + b * 2, hh + b * 2);
    dg.fillStyle = P.brass[2]; dg.fillRect(Math.round(x - w / 2), Math.round(y - hh / 2), Math.round(w), hh);
    dg.fillStyle = '#2a1a05'; dg.textAlign = 'center'; dg.textBaseline = 'middle';
    dg.fillText(text, x, y);
    dg.textAlign = 'start'; dg.textBaseline = 'alphabetic';
  }
  function ctlDraw(I, part, Z) {
    const t = I.ctlT || 0;
    dg.imageSmoothingEnabled = false;
    if (part === 'move') {
      // 车两边各一支箭头：前进 / 后退轮流亮起、往外顶，旁边写上对应的键
      const b = sideBox(B.p), y = Math.round(b.y1 - 14), fwd = Math.floor(t / 1.2) % 2 === 0, L = tutL();
      dg.setTransform(Z, 0, 0, Z, -B.cam.x * Z, -B.cam.y * Z);
      for (const [dir, on, label] of [[1, fwd, touchUI ? SA.Config.text('battle_view_forward') : 'D / →'], [-1, !fwd, touchUI ? SA.Config.text('battle_view_backward') : 'A / ←']]) {
        // 箭头尾巴离车边 4 像素、尖朝外，亮着的那支往外顶；键名写在箭头上方、朝外摆，两边不会叠在车上
        const bob = on ? 2 + 3 * Math.sin(I.clock * 7) : 0, edge = dir > 0 ? b.x1 : b.x0;
        const mid = edge + dir * (18 + bob) * L, spr = arrowSprite(dir > 0 ? 0 : Math.PI);
        dg.globalAlpha = on ? 1 : 0.35;
        dg.drawImage(spr, Math.round(mid - spr.width * L / 2), Math.round(y - spr.height * L / 2), spr.width * L, spr.height * L);
        brassTag(label, edge + dir * 6 * L, y - 20 * L, 9 * L, dir);
        dg.globalAlpha = 1;
      }
      return;
    }
    if (part !== 'aim' && part !== 'fire') return;   // 换武器：只让仪表台的武器键发光
    // 目标：对方驾驶舱（打掉就赢）
    const at = findPart(B.e, 'cockpit');
    const tb = at ? modBox(B.e, at.r, at.c, at.id) : sideBox(B.e);
    const gx = (tb.x0 + tb.x1) / 2, gy = (tb.y0 + tb.y1) / 2;
    let px = gx, py = gy, focus = 0, pressed = false, shot = -1;
    if (part === 'aim') {
      // 指针从两车中间上方滑到驾驶舱上，再在附近慢慢晃（按住拖动 / 移动鼠标挑部件）
      const k = easeIO(clamp((t % 3.6) / 1.1, 0, 1)), sb = sideBox(B.p);
      const sx = (sb.x1 + tb.x0) / 2, sy = Math.min(sb.y0, tb.y0) - 30;
      const wob = clamp(((t % 3.6) - 1.1) / 0.4, 0, 1);
      px = sx + (gx - sx) * k + wob * 5 * Math.sin(t * 2.4); py = sy + (gy - sy) * k + wob * 3 * Math.sin(t * 3.1);
      pressed = touchUI && k > 0.02;
    } else {
      // 按住 → 准星收紧变绿 → 自动打出去 → 松开，循环
      const c = t % 3.4;
      pressed = c >= 0.4 && c < 2.1;
      focus = pressed ? easeIO(clamp((c - 0.4) / 1.5, 0, 1)) : 0;
      if (c >= 2.1) shot = c - 2.1;
    }
    dg.setTransform(Z, 0, 0, Z, -B.cam.x * Z, -B.cam.y * Z);
    g = dg;
    const near = Math.hypot(px - gx, py - gy) < 8;
    if (near) {
      cornerMark(Math.round(tb.x0) - 2, Math.round(tb.y0) - 2, tb.x1 - tb.x0 + 4, tb.y1 - tb.y0 + 4);
      if (at) brassTag(M[at.id].name, tb.x0 - 8 * tutL(), gy - 14 * tutL(), 9 * tutL(), -1);   // 写在目标左边（两车中间是空地）
    }
    gearReticle(px, py, focus, null, { fast: false, ticks: 0, flash: 0, rl: null });
    // 打出去的一下：命中点一颗白星芒 + 几粒火花
    if (shot >= 0 && shot < 0.5) {
      const k = shot / 0.5, L = Math.round(4 + 12 * Math.sin(Math.PI * Math.min(1, k * 1.6))), x = Math.round(gx), y = Math.round(gy);
      dg.globalAlpha = 1 - k;
      dg.fillStyle = P.white; dg.fillRect(x - L, y - 1, L * 2 + 1, 3); dg.fillRect(x - 1, y - L, 3, L * 2 + 1);
      dg.fillStyle = P.fire[3];
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, r = 6 + 22 * k; dg.fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y - Math.abs(Math.sin(a)) * r) - 1, 3, 3); }
      dg.globalAlpha = 1;
    }
    g = wc.getContext('2d');
    // 指针和提示字画在画面坐标里，大小跟着画布在屏幕上的实际宽度走（手机上不会小成一粒）
    dg.setTransform(DPX, 0, 0, DPX, 0, 0);
    const [sx, sy] = toScreen(px, py), k = clamp(Math.round(2.6 * W / Math.max(1, cv.clientWidth)), 2, 8);
    const sp = pointerSprite(touchUI ? 'finger' : 'mouse');
    if (pressed) {   // 按下：指尖外一圈涟漪
      const r = k * (4 + 3 * ((I.clock * 1.6) % 1));
      dg.globalAlpha = 0.8 - 0.6 * ((I.clock * 1.6) % 1); dg.strokeStyle = P.brass[3]; dg.lineWidth = k;
      dg.beginPath(); dg.arc(sx, sy, r, 0, Math.PI * 2); dg.stroke(); dg.globalAlpha = 1;
    }
    const dy = pressed ? k : 0;
    dg.drawImage(sp.cv, Math.round(sx - sp.tip[0] * k), Math.round(sy - sp.tip[1] * k + dy), sp.cv.width * k, sp.cv.height * k);
    if (part === 'fire') {
      const tag = shot >= 0 && shot < 0.8 ? SA.Config.text('battle_view_demo_release') : pressed ? SA.Config.text('battle_view_demo_hold') : '';
      if (tag) brassTag(tag, sx + sp.cv.width * k + 8 * k, sy + 8 * k, 5 * k);
    }
  }
  function introDraw() {
    const I = B.intro;
    if (!I) return;
    const Z = B.cam.z * DPX;
    // 电影黑边：教程和开战动画期间上下各一条
    const barK = I.mode === 'tutor' || I.mode === 'ambush' ? 1 : 1 - easeIO((I.t - CINE.fade) / (CINE.end - CINE.fade));
    dg.setTransform(DPX, 0, 0, DPX, 0, 0);
    dg.fillStyle = P.black;
    dg.fillRect(0, 0, W, Math.round(44 * barK)); dg.fillRect(0, H - Math.round(44 * barK), W, Math.round(44 * barK));
    if (I.mode === 'ambush') { ambushDraw(I); return; }
    if (I.mode === 'tutor' && I.focus && I.focus.startsWith(CTL)) { ctlDraw(I, I.focus.slice(CTL.length), Z); return; }
    if (I.mode === 'tutor' && I.arrows && I.focus) {
      dg.setTransform(Z, 0, 0, Z, -B.cam.x * Z, -B.cam.y * Z);
      dg.imageSmoothingEnabled = false;
      g = dg;
      const L = tutL();
      for (const a of I.arrows) {
        const on = a.part === I.focus, bob = (on ? 3 + 3 * Math.sin(I.clock * 7) : 3) * L;
        // 箭头尖端贴着部件边缘，身子朝车外；精灵中心在尖端后 10 像素（手机上整体放大 L 倍）
        const tx = a.mx + a.ox * (a.reach + bob), ty = a.my + a.oy * (a.reach + bob);
        const spr = arrowSprite(Math.atan2(-a.oy, -a.ox)), ax = tx + a.ox * 10 * L, ay = ty + a.oy * 10 * L;
        dg.globalAlpha = on ? 1 : 0.35;
        dg.drawImage(spr, Math.round(ax - spr.width * L / 2), Math.round(ay - spr.height * L / 2), spr.width * L, spr.height * L);
        if (on) {
          cornerMark(a.b.x0 - 2, a.b.y0 - 2, a.b.x1 - a.b.x0 + 4, a.b.y1 - a.b.y0 + 4);
          brassTag(a.label, tx + a.ox * 36 * L, ty + a.oy * 36 * L, 9 * L);
        }
        dg.globalAlpha = 1;
      }
      dg.textAlign = 'start'; dg.textBaseline = 'alphabetic';
      return;
    }
    if (I.mode !== 'cine') return;
    const t = I.t;
    dg.setTransform(DPX, 0, 0, DPX, 0, 0);
    dg.imageSmoothingEnabled = false;
    const sh = B.shake ? [rnd(-B.shake, B.shake), rnd(-B.shake, B.shake)] : [0, 0];
    const fadeK = 1 - easeIO((t - CINE.fade) / (CINE.end - CINE.fade - 0.1));
    // 徽记：从天上掉下来，落地压扁一下再弹回；开火时往下一挫
    if (t >= CINE.drop) {
      const cy = H * 0.34, s = EMS, size = 64 * s;
      let y = cy, sx = 1, sy = 1;
      if (t < CINE.land) { const k = (t - CINE.drop) / (CINE.land - CINE.drop); y = -size + (cy + size) * k * k; sy = 1.12; sx = 0.92; }
      else if (t < CINE.land + 0.25) { const k = (t - CINE.land) / 0.25; sy = 1 - 0.18 * Math.sin(k * Math.PI); sx = 1 + 0.12 * Math.sin(k * Math.PI); }
      if (t >= CINE.fire && t < CINE.fire + 0.12) y += 6 * (1 - (t - CINE.fire) / 0.12);
      if (t > CINE.fade) y -= 40 * easeIO((t - CINE.fade) / (CINE.end - CINE.fade));
      dg.globalAlpha = Math.max(0, fadeK);
      // 投影 + 徽记
      dg.fillStyle = 'rgba(7,8,12,0.45)';
      dg.fillRect(Math.round(W / 2 - size * 0.34 * sx), Math.round(cy + size * 0.46), Math.round(size * 0.68 * sx), 8);
      const em = SA.Story.emblem(0);
      const w = size * sx, hh = size * sy;
      dg.drawImage(em.cv, Math.round(W / 2 - w / 2 + sh[0]), Math.round(y + size / 2 - hh + sh[1]), Math.round(w), Math.round(hh));
      // 炮口火光：两团像素十字
      if (t >= CINE.fire && t < CINE.fire + 0.18) {
        const k = (t - CINE.fire) / 0.18, x0 = W / 2 - 32 * s, y0 = cy - 32 * s;
        for (const [mx, my, dx, dy] of em.muzzles) {
          const fx = x0 + mx * s + dx * 14, fy = y0 + my * s + dy * 14, L = Math.round(26 * (1 - k) + 8);
          for (const [col, gr] of [[P.fire[2], 8], [P.fire[3], 4], [P.white, 1]]) {
            dg.fillStyle = col;
            dg.fillRect(Math.round(fx - L / 2 - gr / 2), Math.round(fy - gr), Math.round(L + gr), gr * 2);
            dg.fillRect(Math.round(fx - gr), Math.round(fy - L / 2 - gr / 2), gr * 2, Math.round(L + gr));
          }
        }
      }
      dg.globalAlpha = 1;
    }
    for (const p of I.puffs) {
      const k = p.life / p.max, r = Math.round(p.r * (1.6 - k * 0.6) / 3) * 3;
      dg.globalAlpha = Math.min(1, k * 1.6) * 0.85;
      dg.fillStyle = p.col;
      dg.fillRect(Math.round((p.x - r / 2) / 3) * 3, Math.round((p.y - r / 2) / 3) * 3, r, r);
    }
    dg.globalAlpha = 1;
    // 「开战！」：盖章一样砸下来
    if (t >= CINE.stamp) {
      const k = Math.min(1, (t - CINE.stamp) / 0.14), sc = 1 + (1 - k) * 1.4;
      dg.globalAlpha = Math.max(0, fadeK) * k;
      dg.save();
      dg.translate(W / 2 + sh[0], H * 0.34 + 64 * EMS / 2 + 40 + sh[1]);
      dg.scale(sc, sc);
      dg.font = '900 64px "Microsoft YaHei", "PingFang SC", sans-serif';
      dg.textAlign = 'center'; dg.textBaseline = 'middle';
      dg.lineJoin = 'miter'; dg.lineWidth = 12; dg.strokeStyle = P.black; dg.strokeText(SA.Config.text('battle_view_start'), 0, 0);
      dg.fillStyle = P.brass[0]; dg.fillText(SA.Config.text('battle_view_start'), 4, 4);
      dg.fillStyle = P.brass[3]; dg.fillText(SA.Config.text('battle_view_start'), 0, 0);
      dg.restore();
      dg.globalAlpha = 1;
    }
    // 右下角提示：可以跳过
    if (t < CINE.fade) {
      dg.font = '12px "Microsoft YaHei", sans-serif'; dg.textAlign = 'right'; dg.textBaseline = 'alphabetic';
      dg.fillStyle = P.steam[1]; dg.fillText(SA.Config.text('battle_view_skip_intro'), W - 16, H - 16);
      dg.textAlign = 'start';
    }
  }

  function start(opts) {
    api.startState(opts);
    B = api.getState();
    BD = SA.Scenes.pick(opts);

    const screen = document.querySelector('#screen');
    screen.innerHTML = '';
    cv = h('canvas', { class: 'px', width: W, height: H });
    dg = cv.getContext('2d');
    wc = document.createElement('canvas'); wc.width = Math.ceil(W / ZMIN) + 4; wc.height = Math.ceil(H / ZMIN) + 4;   // 镜头拉到最远时也装得下
    g = wc.getContext('2d');
    // 像素件（js/ui-px.js）没加载时（检查脚本的沙盒只跑战斗逻辑）不搭仪表台，其余照常
    const hasPX = !!(SA.PX && SA.PX.ui);
    if (hasPX) SA.PX.init();
    hud.drum = pxCanvas();
    const where = `${B.opts.mode === 'side' ? SA.Config.text('battle_view_outside_prefix') : B.opts.replay ? SA.Config.text('battle_view_replay_prefix') : ''}${B.ter.def.name}`;
    // 上方压在画面上：左右两块铁名牌（只有名字）+ 正中计时鼓
    hud.top = h('div', { class: 'bt-top' },
      h('span', { class: 'bt-plate px-sk px-sk-iron' }, SA.Config.text('battle_view_player_name', B.p.name)),
      h('div', { class: 'bt-clock' }, hud.drum, h('span', {}, where)),
      h('span', { class: 'bt-plate px-sk px-sk-iron' }, B.e.name));
    hud.stage = h('div', { class: 'bt-stage' }, cv, hud.top);
    wrap = h('div', { class: 'bt-canvas-wrap' }, hud.stage);
    touchUI = hasPX && isTouchUI();
    hud.aimRing = null;
    hud.dash = hasPX ? dashboard() : null;
    const btRoot = h('div', { class: `bt${touchUI ? ' touchui' : ''}` }, wrap, hud.dash || '', hud.aimRing || '');
    screen.append(btRoot);

    const toNative = (e) => {
      const rc = cv.getBoundingClientRect();
      return [(e.clientX - rc.left) / rc.width * W, (e.clientY - rc.top) / rc.height * H];
    };
    if (touchUI) bindTouch(btRoot, toNative);   // 手机：双圈操作接管整块战斗界面，画布自己的鼠标处理不再用
    cv.addEventListener('pointermove', (e) => { if (!touchUI) B.aimScreen = toNative(e); });
    cv.addEventListener('pointerleave', (e) => { if (touchUI) return; if (e.pointerType === 'mouse') B.aimScreen = null; B.keys.fire = false; });
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (touchUI) return;
      if (B.intro) { if (B.intro.mode === 'cine') endIntro(); else if (B.intro.vn && B.intro.vn.advance) B.intro.vn.advance(); else if (B.intro.mode === 'ambush') ambushSkip(); return; }
      if (B.surrender === 'raising') { api.skipSurrenderAnimation(); return; }   // 点击跳过升旗，只打开确认框
      B.aimScreen = toNative(e);
      if (e.button !== 0) return;
      B.keys.fire = true;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerup', () => { if (!touchUI) B.keys.fire = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('resize', fit);
    fit();
    camera(1);
    beginIntro(opts);
    let last = performance.now();
    const mine = B;   // 每场战斗一个循环：换了新的一场，旧循环自己退出
    const loop = (now) => {
      if (SA.current !== 'battle' || B !== mine || B.done) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (B.intro) introStep(dt);
      else {
        api.advanceSurrender(dt);   // 升白旗按真实秒数推进（冻结时也推），不乘游戏倍速
        if (!B.frozen) step(dt * B.speed);
      }   // frozen：调试 / 测试时暂停实时推进，只用 debug.step 手动推
      draw();
      introDraw();
      hudTick(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  function hudTick(dt) {
    B.hudT -= dt;
    if (B.hudT > 0) return;
    B.hudT = 0.1;
    updDash();
  }

  function fit() {
    if (!wrap || !wrap.isConnected) return;
    let aw = wrap.clientWidth - 16;
    let ah = Math.max(240, window.innerHeight - (hud.dash ? hud.dash.offsetHeight : 140) - 28);
    // 手机布局：横屏时画面占中间一格（两边是仪表栏），竖屏时画面占满宽、控制件排在下面
    const touch = touchUI && wrap.parentElement && wrap.parentElement.classList.contains('touchui');
    if (touch && hud.aimRing && !hud.aimRing.classList.contains('on')) requestAnimationFrame(() => placeAimRing(null, null, false));
    if (touch) { aw = wrap.clientWidth; ah = window.innerHeight > window.innerWidth ? aw * H / W : wrap.clientHeight; }
    let s = Math.min(aw / W, ah / H);
    const cw = Math.round(W * s), ch = Math.round(H * s), dpr = window.devicePixelRatio || 1;
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    DPX = bw / W;
    if (hud.dash) hud.dash.style.width = touch ? '' : `${Math.max(cw, Math.min(wrap.clientWidth, 1040))}px`;   // 仪表台和画面一样宽，窄屏时最少 1040
  }

  return {
    supportsSurrenderAnimation: true,   // battle.js 据此先演升白旗（surrender-start → advanceSurrender → surrender）
    start,
    draw: () => { sync(); draw(); },
    hudTick: (dt) => { sync(); hudTick(dt); },
    camera: (dt) => { sync(); camera(dt); },
    tick: (dt) => { sync(); tick(dt); },
    fit,
    gameSpeed,
    aimWorld: (x, y) => { sync(); const cam = B.cam; B.aimScreen = [(x - cam.x) * cam.z, (y - cam.y) * cam.z]; camera(0); },
    emit,
    presentResult: (data) => SA.UI.afterBattle(data),
    skipIntro: () => { sync(); if (B && B.intro) endIntro(); },
    teardown: () => { if (typeof window !== 'undefined') { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); } },
  };
};
