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
    B.texts.push({ str: '弹开', x: x + vr(-6, 6), y: y - 34, life: 1, max: 1, col: P.iron[4], plaque: P.glass[2] });
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
      SA.UI.dialog(`「${e.name}」挂出了白旗`, [
        h('p', { style: 'margin-top:0' }, `对手${why}，已经没法再打，请求投降。`),
        h('p', {}, h('b', {}, '接受：'), '立即获胜，对手剩下的零件原样保留（缴获的选择更多），体面收场额外 ', h('b', {}, '声望 +1'), '。'),
        h('p', { class: 'muted' }, '拒绝：比赛继续，你可以把它拆得更彻底；这场不会再问第二次。'),
      ], [{ label: '接受投降', primary: true, onClick: () => api.acceptSurrender() }], '拒绝，继续打', () => api.refuseSurrender());
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
      cars: [B.p, B.e].map(s => { const b = sideBox(s); return isFinite(b.x0) ? { ...b, ground: groundAt(b.cx) } : null; }).filter(Boolean) };
    SA.Scenes.fxBack(BD, dg, fxc);

    // 第 2 层：车。车会跟着坡度连续倾斜，在世界像素里最近邻旋转会让像素行断成台阶、每帧还跳来跳去（撕裂 / 闪烁），
    // 所以车直接画在设备分辨率上：车身画布先整数倍最近邻放大，再带着旋转双线性画上去 —— 像素块大小一致，斜边平滑不抖
    const Z = cam.z * DPX;
    const aimT = B.aim && !B.e.dead ? targetAt(B.e, B.aim[0], B.aim[1]) : null;
    const opts = (s, key, extra) => ({ key, t, heat: s.heat / s.heatMax, water: s.water / Math.max(1, s.waterMax), dyn: s.anim, elev: s.elev, punch: s.punch, tetherCell: s.tether ? s.tether.cell : null, store: s.storeMax > 0 ? s.store / s.storeMax : 0, moving: s.moving, speed: Math.abs(s.vx), gnd: s.gnd, ...extra });
    const pc = SA.SPR.renderVehicle(B.p.v, opts(B.p, 'bp'));
    const sur = api.surrenderState();
    const ec = SA.SPR.renderVehicle(B.e.v, opts(B.e, 'be', sur ? { crewExpr: sur.crewExpression } : null));
    dg.setTransform(Z, 0, 0, Z, (shx - cam.x) * Z, (shy - cam.y) * Z);
    g = dg;
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
      g.fillStyle = P.black; g.fillText('侧炮', x + 29, y - 13); g.fillStyle = P.white; g.fillText('侧炮', x + 28, y - 14);
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

  // 当前武器组的装填进度（0 → 1）：齐射要等最慢的那门炮，所以取最小值；全部装好才返回 null
  function reloadFrac(s) {
    if (s.dead || !s.sel) return null;
    let worst = null;
    for (const w of s.weapons) {
      if (w.cell.id !== s.sel || w.blocked) continue;
      const left = Math.max(0, s.timers[w.key] || 0);
      const f = 1 - left / w.m.reload;
      if (worst == null || f < worst) worst = f;
    }
    return worst == null || worst >= 1 ? null : clamp(worst, 0, 1);
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
      h('i', {}, '电 报'), h('b', {}, `「${B.e.name}」挂白旗了`), h('span', {}, '点击画面跳过'));
    hud.stage.append(hud.sur);
  }

  function drawVehicle(s, cvs, hl, Z) {
    const w = s.anim.body.x;                        // 后坐：本地坐标里往后挪（负 = 被往后推）
    const py = K.ROWS * C;                          // 车身画布底边 = 车底
    const lp = isP(s) ? s.pivX - s.x : s.x + VW - s.pivX;   // 支点（车底中点）在车身画布里的 x
    const n = Math.max(1, Math.floor(Z + 0.001));
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    g.translate(s.pivX, pivY(s) - s.rock * 2);      // 设备分辨率下不取整：爬坡时平滑移动
    g.rotate(tiltOf(s));                            // 跟着坡度倾斜（整车绕车底中点转）
    if (!isP(s)) g.scale(-1, 1);
    g.translate(w, 0);
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
    return [(isP(o) ? x - o.x - PADX : o.x + VW - PADX - x) / C, (y - VY - (o.yo || 0)) / C];
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
    const pts = [[L.x0, L.y0]];
    let [px, py] = pts[0];
    for (let i = 1; i <= T.PREVIEW_STEPS; i++) {
      const [x, y] = fanAt(L, i * FAN_STEP), hit = fanSeg(ctx, px, py, x, y);
      if (hit) {
        const e = [px + (x - px) * hit[0], py + (y - py) * hit[0]];
        pts.push(e);
        return { jit, pts, end: e, key: hit[1] };
      }
      if (i % 3 === 0) pts.push([x, y]);
      if (y > H + 100 || (B.cam && (x < B.cam.x - 200 || x > B.cam.x + B.cam.w + 200))) { pts.push([x, y]); return { jit, pts, end: [x, y], key: 'out' }; }
      px = x; py = y;
    }
    return { jit, pts, end: [px, py], key: 'out' };
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
    // 相邻两条弹道之间围成条带，全部放进同一条路径一次填满（nonzero，重叠处不叠深）；
    // 填充用沿弹道方向的渐变：准星法平面之前是正常浓度，之后 FAN_TAIL 像素内淡到 0
    const pl = ctx.plane, gr = g.createLinearGradient(pl.x, pl.y, pl.x + pl.dx * FAN_TAIL, pl.y + pl.dy * FAN_TAIL);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(244,247,238,0)');
    g.save(); g.globalAlpha = 0.16; g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < rays.length - 1; i++) {
      const a = rays[i].pts, b = rays[i + 1].pts;
      g.moveTo(a[0][0], a[0][1]);
      for (let k = 1; k < a.length; k++) g.lineTo(a[k][0], a[k][1]);
      for (let k = b.length - 1; k >= 0; k--) g.lineTo(b[k][0], b[k][1]);
      g.closePath();
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
  const LAMPS = [['heat', '过热', P.fire[2]], ['water', '缺水', '#46c2c9'], ['power', '动力', P.fire[2]], ['track', '履带', P.fire[2]], ['gun', '武器', P.fire[2]]];
  function dashboard() {
    const fig = (c, label, cls = '') => h('div', { class: `dash-fig ${cls}` }, c, label ? h('span', {}, label) : null);
    hud.gauge = pxCanvas(); hud.tube = pxCanvas(); hud.hpNum = pxCanvas(); hud.plates = pxCanvas();
    hud.lamps = LAMPS.map(() => pxCanvas());
    hud.lampLabels = LAMPS.map(([, nm]) => h('span', {}, nm));
    hud.note = h('div', { class: 'dash-note px-sk px-sk-paper' });
    hud.keys = h('div', { class: 'dash-keys' });
    hud.keySig = null;
    hud.vent = PXI().btn('紧急泄压', { kind: 'dng', title: '一次性打开安全阀：热量大降，限一次', onclick: () => { if (api.vent()) { hud.vent.disabled = true; hud.vent.className = 'px-btn off'; } } });
    return h('div', { class: 'bt-dash px-sk px-sk-iron' },
      h('div', { class: 'dash-car' },
        hud.gaugeFig = fig(hud.gauge, '锅炉'), hud.tubeFig = fig(hud.tube, '水'),
        h('div', { class: 'dash-hull' },
          h('div', { class: 'dash-hp' }, h('span', {}, '装甲'), hud.hpNum), hud.plates,
          h('div', { class: 'dash-lamps' }, LAMPS.map((_, i) => h('div', { class: 'dash-lamp' }, hud.lamps[i], hud.lampLabels[i]))))),
      h('div', { class: 'dash-mid' }, hud.note, hud.keys),
      h('div', { class: 'dash-act' },
        h('div', { class: 'dash-vent' }, hud.vent, h('span', { class: 'px-cap' }, '限一次')),
        PXI().btn('撤退', { title: '撤出比赛（判负）', onclick: () => { if (!B.p.dead) SA.UI.dialog('撤出比赛', h('p', {}, '确定撤出？这会判负。'), [{ label: '撤退', primary: true, onClick: () => { endIntro(); api.retreat(); } }], '继续比赛'); } }),
        speedSlider()),
      h('div', { class: 'bt-touch' }, holdBtn('◀ 后退', 'left'), holdBtn('前进 ▶', 'right'), holdBtn('开火', 'fire')));
  }
  // 你的车现在的警报（按紧急程度）：亮哪几盏灯 + 纸条上的红字
  function alertsOf(s) {
    if (s.dead) return [];
    const out = [];
    if (s.heat / s.heatMax > T.HEAT_ALERT) out.push(['heat', '锅炉过热']);
    if (s.hold) out.push(['heat', '停火降温中']);
    if (s.waterMax && s.water <= 0) out.push(['water', '没水了']);
    else if (s.waterMax && s.water / s.waterMax < T.WATER_LOW_RATIO) out.push(['water', '水快没了']);
    if (s.supply <= 0) out.push(['power', '失去动力']);
    if (s.thrown) out.push(['track', '履带掉链，动不了']);
    if (!s.weapons.some(w => !w.blocked)) out.push(['gun', '没有能开火的武器']);
    return out;
  }
  // 操作提示属于教程：目前只在序章第一关出现
  const tutorialHint = () => B.opts.mode === 'campaign' && B.opts.storyKey === '0,0';
  // 纸条：警报（红）> 瞄准出了问题（墨）> 教程提示 > 瞄准的目标和命中率（淡墨）
  function noteOf() {
    const p = B.p;
    if (p.dead) return ['alert', p.reason || '车瘫了'];
    const al = alertsOf(p);
    if (al.length) return ['alert', [...new Set(al.map(a => a[1]))].join(' · ')];
    if (!p.sel) return ['warn', '没有可用的武器 · 可以用 A / D 冲撞对手'];
    const pi = B.previewInfo, aimT = B.aim ? targetAt(B.e, B.aim[0], B.aim[1]) : null;
    const alt = p.groups.includes('mortar') && p.sel !== 'mortar' ? ' · 换高抛火炮试试' : '';
    if (pi && pi.blocked) return ['warn', '这组武器全被自己的模块挡住了 · 换一组'];
    if (pi && pi.over) return ['warn', pi.over === 'high' ? `超出射界：目标太高或太近，炮管抬不到 ${M[p.sel].elev[1]}° 以上${alt}` : '超出射界：炮管压不了那么低'];
    if (pi && !pi.reach) return ['warn', '超出射程 · 靠近一些'];
    if (aimT && pi && pi.cover && !pi.hit) return ['warn', pi.cover === 'crate' ? '弹道被货箱挡住 · 打烂它、绕过去，或者换高抛' : `弹道打在土坡上 · 靠近一些${alt || '，或者换高抛'}`];
    if (aimT && pi && pi.hit && !sameCell(pi.hit, aimT)) return ['warn', `弹道中心会先打到「${M[B.e.v[pi.hit.layer][pi.hit.r][pi.hit.c].id].name}」（橙色角框）${alt}`];
    if (p.spooling) return ['warn', '锅炉加压中…'];
    if (tutorialHint()) return ['tut', `A / D 移动 · 鼠标瞄准 · 按住左键稳住准星，松手开火${p.groups.length > 1 ? ' · 数字键换武器' : ''}`];
    if (!aimT) return ['info', ''];
    const parts = [aimT.layer === 'side' ? '瞄准 敌方侧炮（只打侧炮）' : `瞄准 敌方${M[B.e.v[aimT.layer][aimT.r][aimT.c].id].name}`];
    if (pi && pi.chance != null) parts.push(`命中率约 ${pi.chance}%`);
    else if (pi && M[p.sel].indirect) parts.push(M[p.sel].spread ? '高抛齐射：保留散布' : '高抛：指哪打哪');
    if (p.fireHeld) parts.push(p.focus >= 1 ? '准星稳住了！' : `稳住 ${Math.round(p.focus * 100)}%`);
    return ['info', parts.join(' · ')];
  }
  function updDash() {
    if (!hud.dash) return;
    const p = B.p, X = SA.PX, blink = Math.floor(performance.now() / 300) % 2 === 0;
    const heat = p.heat / p.heatMax, hot = heat > T.HEAT_ALERT;
    paint(hud.gauge, `${Math.round(heat * 60)}|${hot && blink}`, () => X.gauge(22, heat, T.HEAT_ALERT, hot && blink));
    hud.gaugeFig.classList.toggle('bad', hot);
    hud.gaugeFig.title = `锅炉 ${SA.Phys.fmtTemp(SA.Phys.temp(p.heat, p.heatCapacity))} · 热量 ${SA.Phys.fmtHeat(p.heat)} / ${SA.Phys.fmtHeat(p.heatMax)}`;
    const wf = p.waterMax ? p.water / p.waterMax : 0, low = !p.waterMax || wf < T.WATER_LOW_RATIO;
    paint(hud.tube, `${Math.round(wf * 40)}|${low && blink}`, () => X.tube(46, wf, P.water, low && blink));
    hud.tubeFig.classList.toggle('bad', low);
    hud.tubeFig.title = p.waterMax ? `冷却水 ${SA.Phys.fmtWater(p.water)} / ${SA.Phys.fmtWater(p.waterMax)}` : '没有水箱';
    let a = 0, m = 0;
    SA.V.each(p.v, (cell) => { a += Math.max(0, cell.hp); m += SA.V.maxHp(cell); });
    const hp = a / Math.max(1, m), pct = Math.round(hp * 100);
    paint(hud.hpNum, `${pct}`, () => X.num(`${pct}%`, pct <= 25 ? '#ff8a5c' : '#e4e0d6', { shadow: P.dark[0] }));
    paint(hud.plates, `${Math.ceil(hp * 10)}`, () => X.plates(Math.ceil(hp * 10 - 1e-6), 10));
    const on = new Set(alertsOf(p).map(x => x[0]));
    LAMPS.forEach(([id, , col], i) => {
      const lit = on.has(id) && (blink || id === 'power' || id === 'track');
      paint(hud.lamps[i], `${lit}`, () => X.lamp(lit, col));
      hud.lampLabels[i].classList.toggle('on', on.has(id));
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
    let worst = 1;
    for (const w of p.weapons) { if (w.cell.id !== id || w.blocked) continue; worst = Math.min(worst, 1 - Math.max(0, p.timers[w.key] || 0) / w.m.reload); }
    return clamp(worst, 0, 1);
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
        hud.keys.append(h('button', { class: `dash-key ${sel ? 'on' : ''} ${off(id) ? 'off' : ''} ${isCo ? 'co' : ''}`, title: `${keyOf(i)} 键 · ${M[id].name} ×${n}${isCo ? ' · 另一名驾驶员在操作' : ''}`, onclick: () => { p.sel = id; } },
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
  const KEYMAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'fire' };
  function onKey(e) {
    if (!B || B.done || SA.current !== 'battle') return;
    // 开场期间不接操作；开战动画可以用空格 / 回车 / Esc 跳过（教程对话框自己处理按键）
    if (B.intro) {
      if (B.intro.mode === 'cine' && e.type === 'keydown' && /^(Space|Enter|NumpadEnter|Escape)$/.test(e.code)) { e.preventDefault(); endIntro(); }
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

  // 游戏速度：整场战斗的时间流速（移动、装填、热量、AI、动画全部按它缩放）
  const SPEED_KEY = 'steam_arena_speed_v1';
  function gameSpeed() { try { const v = parseFloat(localStorage.getItem(SPEED_KEY)); return v > 0 ? v : K.GAME_SPEED; } catch (e) { return K.GAME_SPEED; } }
  function speedSlider() {
    const out = h('b', {}, `${gameSpeed().toFixed(2)}×`);
    const range = h('input', { type: 'range', min: T.GAME_SPEED_MIN, max: T.GAME_SPEED_MAX, step: T.GAME_SPEED_STEP, value: gameSpeed(), 'aria-label': '游戏速度',
      oninput: () => { B.speed = +range.value; out.textContent = `${B.speed.toFixed(2)}×`; try { localStorage.setItem(SPEED_KEY, String(B.speed)); } catch (e) { /* ignore */ } },
      onchange: () => range.blur() });
    return h('label', { class: 'bt-speed', title: '游戏速度：拖动试试什么节奏合适' }, '速度', range, out);
  }

  function holdBtn(label, key) {
    const b = h('button', { class: 'btn' }, label);
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
    const tut = SA.Story && SA.Story.tutorial(opts);
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
    I.vn = SA.Story.talk(lines, { host: wrap, cls: 'vn-battle', onDone: () => {
      SA.Story.mark('tutorial');
      if (B.intro !== I) return;
      I.vn = null; I.mode = 'cine'; I.t = 0; I.from = { cx: camCx(), z: B.cam.z, bot: camBottom() };
    } });
  }
  function endIntro() {
    const I = B.intro;
    if (!I) return;
    if (I.vn) { const vn = I.vn; I.vn = null; vn.close(); }
    B.intro = null;
    B.keys.left = B.keys.right = B.keys.fire = false;
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
      // 讲解部件时镜头推到玩家车上，旁白时回到全景。
      const pb = sideBox(B.p);
      // 对话框压在画面上方，讲解时把车往画面下方放，给箭头和标签留出空间
      const [tx, tz, tb] = I.focus ? [pb.cx, 2.2, GROUND + 22] : [I.home.x + I.home.w / 2, I.home.z, GROUND + 60];
      const k = Math.min(1, dt * 4);
      camAt(camCx() + (tx - camCx()) * k, B.cam.z + (tz - B.cam.z) * k, camBottom() + (tb - camBottom()) * k);
      return;
    }
    I.t += dt;
    const t = I.t, pb = sideBox(B.p), eb = sideBox(B.e), home = I.home.x + I.home.w / 2;
    const G0 = GROUND + 60, G1 = GROUND + 30;
    const [cx, z, bot] = keyCam([[0, I.from.cx, I.from.z, I.from.bot], [CINE.pIn, pb.cx, CZ, G1], [CINE.pHold, pb.cx, CZ, G1], [CINE.pan, eb.cx, CZ, G1], [CINE.eHold, eb.cx, CZ, G1], [CINE.back, home, I.home.z, G0]], t);
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
  function introDraw() {
    const I = B.intro;
    if (!I) return;
    const Z = B.cam.z * DPX;
    // 电影黑边：教程和开战动画期间上下各一条
    const barK = I.mode === 'tutor' ? 1 : 1 - easeIO((I.t - CINE.fade) / (CINE.end - CINE.fade));
    dg.setTransform(DPX, 0, 0, DPX, 0, 0);
    dg.fillStyle = P.black;
    dg.fillRect(0, 0, W, Math.round(44 * barK)); dg.fillRect(0, H - Math.round(44 * barK), W, Math.round(44 * barK));
    if (I.mode === 'tutor' && I.arrows && I.focus) {
      dg.setTransform(Z, 0, 0, Z, -B.cam.x * Z, -B.cam.y * Z);
      dg.imageSmoothingEnabled = false;
      g = dg;
      for (const a of I.arrows) {
        const on = a.part === I.focus, bob = on ? 3 + 3 * Math.sin(I.clock * 7) : 3;
        // 箭头尖端贴着部件边缘，身子朝车外；精灵中心在尖端后 10 像素
        const tx = a.mx + a.ox * (a.reach + bob), ty = a.my + a.oy * (a.reach + bob);
        const spr = arrowSprite(Math.atan2(-a.oy, -a.ox)), ax = tx + a.ox * 10, ay = ty + a.oy * 10;
        dg.globalAlpha = on ? 1 : 0.35;
        dg.drawImage(spr, Math.round(ax - spr.width / 2), Math.round(ay - spr.height / 2));
        if (on) {
          cornerMark(a.b.x0 - 2, a.b.y0 - 2, a.b.x1 - a.b.x0 + 4, a.b.y1 - a.b.y0 + 4);
          const lx = tx + a.ox * 36, ly = ty + a.oy * 36;
          dg.font = '900 9px "Microsoft YaHei", "PingFang SC", sans-serif';
          const w = dg.measureText(a.label).width + 8;
          dg.fillStyle = P.black; dg.fillRect(Math.round(lx - w / 2) - 1, Math.round(ly - 7) - 1, Math.round(w) + 2, 15);
          dg.fillStyle = P.brass[2]; dg.fillRect(Math.round(lx - w / 2), Math.round(ly - 7), Math.round(w), 13);
          dg.fillStyle = '#2a1a05'; dg.textAlign = 'center'; dg.textBaseline = 'middle';
          dg.fillText(a.label, lx, ly);
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
      dg.lineJoin = 'miter'; dg.lineWidth = 12; dg.strokeStyle = P.black; dg.strokeText('开 战 ！', 0, 0);
      dg.fillStyle = P.brass[0]; dg.fillText('开 战 ！', 4, 4);
      dg.fillStyle = P.brass[3]; dg.fillText('开 战 ！', 0, 0);
      dg.restore();
      dg.globalAlpha = 1;
    }
    // 右下角提示：可以跳过
    if (t < CINE.fade) {
      dg.font = '12px "Microsoft YaHei", sans-serif'; dg.textAlign = 'right'; dg.textBaseline = 'alphabetic';
      dg.fillStyle = P.steam[1]; dg.fillText('点击或按空格跳过', W - 16, H - 16);
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
    const where = `${B.opts.mode === 'side' ? '竞技场外 · ' : B.opts.replay ? '重打 · ' : ''}${B.ter.def.name}`;
    // 上方压在画面上：左右两块铁名牌（只有名字）+ 正中计时鼓
    hud.top = h('div', { class: 'bt-top' },
      h('span', { class: 'bt-plate px-sk px-sk-iron' }, `你 · ${B.p.name}`),
      h('div', { class: 'bt-clock' }, hud.drum, h('span', {}, where)),
      h('span', { class: 'bt-plate px-sk px-sk-iron' }, B.e.name));
    hud.stage = h('div', { class: 'bt-stage' }, cv, hud.top);
    wrap = h('div', { class: 'bt-canvas-wrap' }, hud.stage);
    hud.dash = hasPX ? dashboard() : null;
    screen.append(h('div', { class: 'bt' }, wrap, hud.dash || ''));

    const toNative = (e) => {
      const rc = cv.getBoundingClientRect();
      return [(e.clientX - rc.left) / rc.width * W, (e.clientY - rc.top) / rc.height * H];
    };
    cv.addEventListener('pointermove', (e) => { B.aimScreen = toNative(e); });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') B.aimScreen = null; B.keys.fire = false; });
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (B.intro) { if (B.intro.mode === 'cine') endIntro(); return; }
      if (B.surrender === 'raising') { api.skipSurrenderAnimation(); return; }   // 点击跳过升旗，只打开确认框
      B.aimScreen = toNative(e);
      if (e.button !== 0) return;
      B.keys.fire = true;
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerup', () => { B.keys.fire = false; });
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
    const aw = wrap.clientWidth - 16;
    const ah = Math.max(240, window.innerHeight - (hud.dash ? hud.dash.offsetHeight : 140) - 28);
    let s = Math.min(aw / W, ah / H);
    const cw = Math.round(W * s), ch = Math.round(H * s), dpr = window.devicePixelRatio || 1;
    cv.style.width = `${cw}px`;
    cv.style.height = `${ch}px`;
    const bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    DPX = bw / W;
    if (hud.dash) hud.dash.style.width = `${Math.max(cw, Math.min(wrap.clientWidth, 1040))}px`;   // 仪表台和画面一样宽，窄屏时最少 1040
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
