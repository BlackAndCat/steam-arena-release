// 竞技场：加速/撞击、直射与高抛弹道 + 弹道预览、数字键切换武器、侧挂层优先、热量/水、AI
// 视觉事件类型：part、text、particles、boom、ricochet、shatter、surrender-start、surrender。
window.SA = window.SA || {};
// 规则指纹的手工版本；战斗规则改动时必须递增，进化候选会因此被标记为需要复核。
SA.RULES_VERSION = '2026-10-06-knight-waist-exclusive-refit';

SA.Battle = (() => {
  const h = SA.h, K = SA.K, T = K.BATTLE, M = SA.MODULES, P = SA.PAL, C = K.CELL, PADX = SA.SPR.PADX;
  const W = 1280, H = 720, GROUND = 648, VY = GROUND - K.ROWS * C;
  const VW = K.COLS * C + PADX * 2;
  const HALF = C / 2;   // C = 子格 24px；模块的实际大小按 SA.fp 算（modBox / modCenter）
  const alive = SA.V.alive;
  let B = null;
  let view = null;
  const CAMERA_ZMIN = SA.Config.get('rules').battle.cameraMinZoom;
  // 投降演出按真实秒数推进，不受战斗倍速影响；先伸杆，再升旗。
  const SURRENDER_DURATION = SA.Config.get('rules').battle.surrenderDurationSec,
    SURRENDER_POLE_TIME = SA.Config.get('rules').battle.surrenderPoleSec;

  // 无画面模拟可以注入固定种子；正常游戏仍使用浏览器的随机数。
  let random = Math.random;
  const seededRandom = (seed) => {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rnd = (a, b) => a + random() * (b - a);
  // 散布分布：两个均匀数相加（三角分布），中间密、边缘稀，但扇区边缘确实会打到
  const gauss = () => random() + random() - 1;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const aiStyles = SA.AI_STYLES, normalizeAiStyle = SA.normalizeAiStyle;
  // 每门炮以本轮发射后的实际周期计算进度，供驾驶员分配与装填提示共用。
  function reloadProgress(s, w) {
    const left = s.timers[w.key] || 0;
    if (left <= 0) return 1;
    return clamp(1 - left / (s.reloadTotals[w.key] || w.m.reload), 0, 1);
  }

  // ---------- 阵营 ----------
  function makeSide(v, name, isAI, aim, x, multipliers) {
    const s = { v, name, isAI, aim, x, vx: 0, heat: 0, water: 0, effects: {}, events: { fire: 0, hit: 0, ricochet: 0, chargedHit: 0, ram: 0, kick: 0, knock: 0, terrainBlock: 0, highHit: 0, downhillRam: 0, destroyed: 0 }, timers: {}, reloadTotals: {}, anim: SA.Dyn.animator(), co: { target: null, err: { x: 0, y: 0 }, retarget: 0 }, punch: {}, punchT: {}, tether: null, dead: false, reason: '', failureType: null, failureAt: null,
      vented: false, hold: false, dealt: 0, taken: 0, smokeT: 0, dir: 0, phase: 0, moving: false,
      fireHeld: false, sel: null, target: null, retarget: 0, moveT: 0, goalX: x, charge: false, err: { x: 0, y: 0 },
      elev: {}, heldT: 0, lastSel: null, thrown: false, brakeT: 0, spool: 0, spoolDir: 0, chuffT: 0, rock: 0, spooling: false,
      focus: 0, jolt: 0, release: false, kick: 0, kickCooldown: 0, bipedLegHp: null, bipedHipHp: null, bipedLegDead: false, bipedHipDead: false, balance: '无底盘', gait: 0,
      crouch: 0, crouchHeld: false, jumpHeld: false, jumpLatch: false, jumpCharge: 0, jumpCooldown: 0, airHeight: 0, airTime: 0, airDuration: 0, tuck: 0, knightCooldown: 0,
      holdSeconds: 0, fireHeldSeconds: 0, ventCount: 0 };   // focus：瞄准稳定度 0~1（按住蓄力）；jolt：起步/刹车造成的颠簸
    s.homeX = x;
    s.statMultipliers = SA.StageCars.statMultipliers(multipliers);
    s.occ = SA.V.occ(v, 'body'); s.occS = SA.V.occ(v, 'side');   // 占格表：战斗中模块不会挪位置，开局算一次
    refresh(s);
    settle(s, 1);
    s.water = s.waterMax;
    refresh(s); // 开局按满水质量计算驱动需求与碰撞质量。
    // 开战时每门存活武器都已装满，首次发射后才记录各自的完整装填周期。
    for (const w of s.weapons) s.timers[w.key] = 0;
    s.startHp = SA.V.maxHp ? SA.V.stats(s.v).maxHp : 0;
    s.startSupply = s.supply;
    s.maxHeat = 0;
    s.minWater = s.water;
    s.armed = s.weapons.length > 0;   // 开局有武器（敌方判负规则用）
    return s;
  }

  function refresh(s) {
    let supply = 0, equip = 0, heatRate = 0, heatMul = 1, cool = 0, dryCool = 0, waterSave = 1, storeMax = 0, waterMax = 0, ev = 0, acc = 0, ch = 0, sp = 0, cock = 0, kg = 0, rams = 0, minCol = K.COLS, frontCol = -1, prism = false;
    let ak = 0, bk = 0, sw = 0, spk = 0, cop = 0, aimSh = 0, aimSp = 0;
    const chIds = {};
    const live = [];
    SA.V.each(s.v, (cell, r, c, layer) => {
      if (!alive(cell)) return;
      live.push(cell);
      const m = SA.modForVehicle(cell, s.v);   // 按材料放大后的属性
      effect(s, cell.id, 'active');
      minCol = Math.min(minCol, c);
      if (layer === 'body') frontCol = Math.max(frontCol, c + SA.fp(cell.id).w - 1);
      supply += m.supply || 0; equip += m.power || 0; heatRate += m.heatRate || 0; heatMul = Math.min(heatMul, m.heatMul || 1);
      cool += m.cool || 0; dryCool += m.dryCool || 0; if (m.waterSave) waterSave = Math.max(K.WATER_SAVE_MIN, waterSave * m.waterSave);
      storeMax += m.store || 0; waterMax += m.water || 0; kg += SA.weightOf(cell);
      if (m.layer === 'chassis') { chIds[cell.id] = (chIds[cell.id] || 0) + 1; ch++; ev += m.evade || 0; acc += m.acc || 0; sp += m.speed; ak += m.accel; bk += m.brake; sw += m.sway; spk += m.spool; }
      if (m.layer === 'ram') rams++;
      if (SA.isCockpit(cell.id)) { cock++; cop += SA.driversOf(cell.id); }
      if (m.special === 'range-prism') prism = true;
      aimSh = Math.max(aimSh, m.aimShrink || 0); aimSp = Math.max(aimSp, m.aimSpeed || 0);
    });
    // 履带是一个整体：任意一段被毁 = 掉链子，整车趴窝
    let thrown = false;
    SA.V.each(s.v, (cell) => { if (cell.id === 'track' && cell.hp <= 0) thrown = true; });
    // mass = 车重（吨）：决定加速、起步、碰撞和撞击伤害；动力需求 = 设备耗能 + 车重 × 行驶系数
    const mass = Math.max(T.MASS_MIN_TONS, (kg + Math.max(0, s.water)) / 1000);
    const driveKw = SA.Phys.driveKw(mass * 1000, ch ? sp / ch : 0);
    const demand = equip + driveKw;
    // 底盘手感（多种底盘取平均）：accelK 起步、brakeK 刹车、sway 移动时的晃动、spoolK 起步憋气时间
    const avg = (x, d) => (ch ? x / ch : d);
    // 瞄准能力：基础值 + 瞄准类部件加成（以后的瞄准镜等）
    // 实体辅助模块：只算仍有耐久的模块，被击毁即失效。
    const ax = SA.auxEffect(live);
    s.aimShrink = Math.min(K.AIM_SHRINK_MAX, K.AIM_SHRINK + Math.max(aimSh, ax.aimShrink));
    s.aimSpeed = K.AIM_SPEED + Math.max(aimSp, ax.aimSpeed);
    // 端部挂甲在动力倍率之后扣速；锅炉富余无法抵消这项罚速。
    const armorSpeedFactor = SA.V.armorSpeedFactor(s.v);
    Object.assign(s, { accelK: avg(ak, 1), brakeK: avg(bk, 1), sway: avg(sw, 1) * ax.sway, spoolK: avg(spk, 1), armorSpeedFactor,
      speedMul: (supply <= 0 ? 0 : demand ? Math.min(K.SPEED_BOOST, supply / demand) : 1) * armorSpeedFactor });
    s.chassisId = Object.keys(chIds).sort((a, b) => chIds[b] - chIds[a])[0] || 'track';
    let bipedCell = null;
    if (s.chassisId === 'biped') {
      SA.V.each(s.v, (cell) => { if (!bipedCell && cell.id === 'biped') bipedCell = cell; });
      const hp = bipedCell ? SA.V.maxHp(bipedCell) : 0;
      // 分区只在入战时初始化，均分当前耐久；零耐久表示损毁，刷新不能当成尚未初始化。
      if (s.bipedHipHp === null) s.bipedHipHp = s.bipedLegHp = bipedCell ? clamp(bipedCell.hp, 0, hp) / 2 : 0;
      if (bipedCell) bipedCell.bipedZones = { hip: Math.max(0, s.bipedHipHp), leg: Math.max(0, s.bipedLegHp), max: hp };
    }
    const vehicleStats = SA.V.stats(s.v);
    s.bipedParts = SA.V.bipedParts(s.v);
    s.loadKg = vehicleStats.loadKg; s.dryLoadKg = vehicleStats.loadKg - vehicleStats.water; s.load = vehicleStats.load;
    s.speedBoost = vehicleStats.speedBoost;
    s.balance = vehicleStats.balance || '无底盘';
    s.balanceTolerance = vehicleStats.balanceTolerance || 0;
    s.topHeavy = !!vehicleStats.topHeavy;
    if (s.chassisId === 'biped') {
      s.bipedLegDead = s.bipedLegHp <= 0;
      s.bipedHipDead = s.bipedHipHp <= 0;
    }
    const heatCapacity = SA.Phys.heatCapacity(kg), heatMax = SA.Phys.heatMax(kg);
    // 被毁模块带走其自身热容对应的能量；幸存回路保持原温升，不因质量突降凭空跳温。
    if (s.heatCapacity && heatCapacity < s.heatCapacity) s.heat *= heatCapacity / s.heatCapacity;
    Object.assign(s, { supply, demand, driveKw, equip, dryKg: kg, heatRate, heatMul, heatCapacity, heatMax, cool, dryCool, waterSave, storeMax, waterMax, minCol, frontCol, rams, mass, thrown, prism,
      evade: ch ? ev / ch : 0, acc: ch ? acc / ch : 0, speed: thrown ? 0 : ch ? sp / ch : 0, cockpits: cock, drivers: cop, copilots: Math.max(0, cop - 1) });   // 每个自动武器组占用一名驾驶员
    if (s.chassisId === 'biped') {
      s.speed = vehicleStats.speed;
      if (s.bipedLegDead || s.balance === '失衡') s.speed = 0;
      if (s.bipedHipDead) s.sway *= T.BIPED_HIP_SWAY;
      if (s.topHeavy) s.sway *= T.TOP_HEAVY_SWAY;
    }
    s.water = Math.min(s.water, waterMax);
    if (!Number.isFinite(s.store) || s.store > storeMax) s.store = 0;
    const blocked = SA.V.blockedList(s.v);
    s.weapons = [];
    SA.V.each(s.v, (cell, r, c, layer) => {
      if (!alive(cell) || !M[cell.id].dmg) return;
      const m = SA.modForVehicle(cell, s.v);
      // 装弹机只加速其下方的武器；测距仪仍影响全车散布。
      const reloadMul = SA.V.weaponReloadMul(s.v, r, c, layer);
      s.weapons.push({ cell, r, c, layer, m: reloadMul === 1 && ax.spread === 1 ? m : { ...m, reload: m.reload * reloadMul, spread: m.spread * ax.spread, ...(m.spreadMin != null ? { spreadMin: m.spreadMin * ax.spread } : {}) }, key: `${r},${c},${layer === 'side' ? 's' : 'b'}`,
        blocked: layer === 'body' && blocked.some(b => b.r === r && b.c === c) });
    });
    const crew = SA.V.crewPlan(s.weapons, cop, s.sel);
    s.groups = crew.groups;
    s.sel = crew.selected;
    s.pistons = [];
    SA.V.each(s.v, (cell, r, c, layer) => { if ((layer === 'body' || M[cell.id].knight === 'melee') && alive(cell) && (M[cell.id].type === 'piston' || cell.id === 'piston' || M[cell.id].special === 'hydraulic-bite')) s.pistons.push({ cell, r, c, layer }); });
    if (!cock) kill(s, SA.Config.text("battle_d45a8a5771ea"));
  }

  function kill(s, reason) {
    if (s.dead) return;
    s.dead = true; s.reason = reason; s.failureAt = B.t;
    s.failureType = reason.includes(SA.Config.text("battle_fe1b451306a3")) || reason.includes(SA.Config.text("battle_9ffc666969e6")) ? 'overheat' : (reason.includes(SA.Config.text("battle_327b54d04f71")) ? 'dry' : null);
    s.fireHeldAtFailure = !!s.fireHeld; s.holdAtFailure = !!s.hold; s.ventAtFailure = !!s.vented;
    s.dir = 0; s.fireHeld = false;
    for (let i = 0; i < 50; i++) emit('part', { type: 'steam', x: s.x + VW / 2 + rnd(-120, 120), y: VY + (s.yo || 0) + 120 + rnd(-90, 90), vx: rnd(-30, 30), vy: rnd(-90, -24), life: rnd(1, 2.2), col: undefined });
  }

  // 诊断遥测：只记录首次触达阈值的时间，不参与战斗判定。
  function markTelemetry(s) {
    if (s.firstWaterEmptyAt == null && s.water <= 0) s.firstWaterEmptyAt = B.t;
    if (s.firstHeatMaxAt == null && s.heat >= s.heatMax) s.firstHeatMaxAt = B.t;
  }

  // 诊断只读耐久快照，供经济模拟按实际受损模块估算修理费；不参与判定。
  function cellTelemetry(v) {
    const out = [];
    SA.V.each(v, (cell, r, c, layer) => out.push({ id: cell.id, mt: cell.mt || 1, lv: cell.lv || 0,
      ...(cell.refit ? { refit: cell.refit } : {}), hp: cell.hp, max: SA.V.maxHp(cell), r, c, layer }));
    return out;
  }

  // ---------- 地形 ----------
  // B.ter：每个像素的地面高度（土坡）、泥地区间、货箱。数据在 SA.TERRAINS；没有地形就是平地
  const MUD = T.MUD_SPEED;   // 泥地里的速度系数（按底盘）
  function makeTerrain(id) {
    const key = SA.TERRAINS[id] ? id : 'flat', def = SA.TERRAINS[key];
    const ground = new Float32Array(W + 1).fill(GROUND);
    for (const hl of def.hills || [])
      for (let x = Math.max(0, Math.floor(hl.x - hl.w / 2)); x <= Math.min(W, Math.ceil(hl.x + hl.w / 2)); x++)
        ground[x] -= hl.h * 0.5 * (1 + Math.cos(Math.PI * (x - hl.x) / (hl.w / 2)));
    const at = (x) => ground[Math.max(0, Math.min(W, Math.round(x)))];
    const crates = (def.crates || []).map(c => { const y1 = at(c.x); return { x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: y1 - c.h, y1, hp: c.hp, max: c.hp, dead: false, shake: 0 }; });
    return { id: key, def, ground, mud: def.mud || [], crates };
  }
  const groundAt = (x) => (B && B.ter && x >= 0 && x <= W ? B.ter.ground[Math.round(x)] : GROUND);   // 地形只在中间这一段，其余都是平地
  const crateAt = (x, y) => (B && B.ter ? B.ter.crates.findIndex(c => !c.dead && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) : -1);
  // 整车在世界里的左右边缘
  const span = (s) => (isP(s) ? [cellX(s, s.minCol), cellX(s, s.frontCol) + C] : [cellX(s, s.frontCol), cellX(s, s.minCol) + C]);
  // 有场地边界时，按整车外沿限制中心位置。碰撞会再次推动车身，因此每帧碰撞后统一限位。
  function enforceBounds(s) {
    if (!B.bounds || s.frontCol < 0) return;
    const [left, right] = span(s);
    if (left < B.bounds.left) { s.x += B.bounds.left - left; if (s.vx < 0) s.vx = 0; }
    else if (right > B.bounds.right) { s.x -= right - B.bounds.right; if (s.vx > 0) s.vx = 0; }
  }
  // 地形对速度的影响：泥地按底盘减速；上坡慢、下坡快（按车头车尾的高度差）
  function terrainK(s, dir) {
    if (!B.ter) return { top: 1, acc: 1 };
    const [L, R] = span(s), wd = Math.max(1, R - L);
    let mud = 0, junk = 0;
    for (const [a, b] of B.ter.mud) mud += Math.max(0, Math.min(R, b) - Math.max(L, a));
    for (const c of B.ter.crates) if (c.dead) junk += Math.max(0, Math.min(R, c.x1 + T.DEBRIS_SLOW_RADIUS) - Math.max(L, c.x0 - T.DEBRIS_SLOW_RADIUS));   // 碎木堆：谁开过去都慢一点
    const mk = (1 - (mud / wd) * (1 - (MUD[s.chassisId] || T.MUD_DEFAULT_SPEED))) * (1 - Math.min(1, junk / wd) * T.DEBRIS_SLOW_FACTOR);
    return { top: mk, acc: mk }; // 坡阻已由牵引力方程计算，不在速度上重复处罚。
  }
  // 车身贴地 + 悬挂（见 docs/game-design.md §4.1）：上层车体是刚体，底盘每格两个接地点（履带的两组负重轮、腿式的两只脚）各自在行程内伸缩。
  // 车底是一条斜线，坡度 kw（世界里每往右 1px 往下多少 px）= 接地点下面地面的最小二乘拟合 × 主底盘的跟坡比例；
  // 车底放在各点的平均高度，但不让哪一点插进地里超过上收行程（宁可悬空）。被毁的底盘不参与；撞击件最多压进地面 6px。
  // 画面上整车绕车底中点旋转 atan(kw)，每个接地点的伸缩存进 s.gnd 交给 renderVehicle
  function settle(s, dt) {
    const [L, R] = span(s), xc = (L + R) / 2;
    const cr = SA.V.chassisRowOf(s.v);   // 底盘锚点行：履带 / 四足在 CH，真双足 2×4 在 ROWS-4
    const pts = [], rigid = [], row = s.v.body[cr];
    const same = (k, id) => k >= 0 && k < K.COLS && row[k] && row[k].id === id;
    for (let c = 0; c < K.COLS; c++) {
      const cell = row[c];
      if (!cell) continue;
      const m = SA.MODULES[cell.id], w = SA.fp(cell.id).w;
      let a0 = c, a1 = c;   // 同类底盘连续段（蜘蛛腿按它决定往前还是往后张）
      while (same(a0 - w, cell.id)) a0 -= w;
      while (same(a1 + w, cell.id)) a1 += w;
      if (m.susp && alive(cell)) SA.suspPts(cell.id, (c - a0) / w, (a1 - a0) / w + 1).forEach((px, i) => pts.push({ key: `${cr},${c}`, i, x: isP(s) ? cellX(s, c) + px : cellX(s, c) + C - px, up: m.susp.up, down: m.susp.down }));
      else if (SA.isRam(cell.id)) for (let k = 0; k < SA.fp(cell.id).w; k++) rigid.push(cellX(s, c + k) + HALF);
    }
    if (!pts.length) for (let x = L + T.SETTLE_FALLBACK_INSET; x <= R - T.SETTLE_FALLBACK_INSET; x += T.SETTLE_FALLBACK_STEP) pts.push({ x, up: 0, down: 0 });   // 底盘全毁：整车趴在地上
    for (const p of pts) p.y = groundAt(p.x);
    const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
    let sxy = 0, sxx = 0;
    for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
    const follow = (SA.MODULES[s.chassisId] && SA.MODULES[s.chassisId].susp || { follow: 1 }).follow;
    const kT = clamp((sxx ? sxy / sxx : 0) * follow, -T.SETTLE_TILT_MAX, T.SETTLE_TILT_MAX);
    s.kw = (s.kw || 0) + (kT - (s.kw || 0)) * Math.min(1, dt * T.SETTLE_TILT_RESPONSE);
    const rel = (x, y) => y - s.kw * (x - xc);   // 地面相对车底线的高度
    for (const p of pts) p.r = rel(p.x, p.y);
    const lo = Math.max(...pts.map(p => p.r - p.down));
    let hi = Math.min(...pts.map(p => p.r + p.up));
    for (const x of rigid) hi = Math.min(hi, rel(x, groundAt(x)) + T.SETTLE_RIGID_CLEARANCE);
    const mean = pts.reduce((a, p) => a + p.r, 0) / n, want = lo <= hi ? clamp(mean, lo, hi) : hi;
    s.pivX = xc;
    s.yo = (s.yo || 0) + (want - GROUND - (s.yo || 0)) * Math.min(1, dt * T.SETTLE_HEIGHT_RESPONSE);
    const cs = Math.cos(Math.atan(s.kw)), py = GROUND + s.yo;
    s.gnd = {};
    for (const p of pts) if (p.key) (s.gnd[p.key] = s.gnd[p.key] || [0, 0])[p.i] = clamp((p.r - py) * cs, -p.up, p.down);
  }
  // 车身倾斜：绕支点（车底中点）旋转 atan(kw)。「平放坐标」（cellX / cellY 算出来的）↔ 世界坐标
  const tiltOf = (s) => Math.atan(s.kw || 0);
  const poseOffset = (s) => s.chassisId === 'biped' ? 24 * s.crouch - s.airHeight : 0;
  const pivY = (s) => GROUND + (s.yo || 0) + poseOffset(s);
  function toWorld(s, x, y) {
    const a = tiltOf(s);
    if (!a || s.pivX == null) return [x, y];
    const dx = x - s.pivX, dy = y - pivY(s), c = Math.cos(a), n = Math.sin(a);
    return [s.pivX + dx * c - dy * n, pivY(s) + dx * n + dy * c];
  }
  function toFlat(s, x, y) {
    const a = tiltOf(s);
    if (!a || s.pivX == null) return [x, y];
    const dx = x - s.pivX, dy = y - pivY(s), c = Math.cos(a), n = Math.sin(a);
    return [s.pivX + dx * c + dy * n, pivY(s) - dx * n + dy * c];
  }
  // 车头抬起的角度（度，两边都是「抬头为正」）：瞄准和出膛方向要加上它
  const pitchOf = (s) => (isP(s) ? -1 : 1) * tiltOf(s) * 180 / Math.PI;
  // 货箱挨打 / 被碾：一抖、飞木屑，打烂了就散成一地碎木。crush = 被车碾（每帧都有，不飘数字，木屑少一点）
  function hitCrate(k, dmg, crush) {
    const c = B.ter.crates[k];
    if (!c || c.dead) return;
    c.hp -= dmg;
    c.shake = 0.2;
    const x = (c.x0 + c.x1) / 2, y = (c.y0 + c.y1) / 2;
    if (!crush) {
      const rounded = Math.round(dmg), textX = x + rnd(-9, 9);
      if (rounded > 0) emit('text', { str: String(rounded), x: textX, y: c.y0 - 10, col: '#d9b27a' });
    }
    if (!crush || random() < 0.25) for (let i = 0; i < (crush ? 2 : 6); i++) emit('part', { type: 'debris', x: x, y: y, vx: rnd(-120, 120), vy: rnd(-180, -40), life: rnd(0.4, 0.8), col: P.leather[1] });
    if (c.hp <= 0) {
      c.dead = true;
      for (let i = 0; i < 16; i++) emit('part', { type: 'debris', x: x + rnd(-20, 20), y: y + rnd(-20, 20), vx: rnd(-200, 200), vy: rnd(-260, -60), life: rnd(0.8, 1.4), col: i % 2 ? P.leather[1] : P.leather[2] });
      for (let i = 0; i < 6; i++) emit('part', { type: 'dust', x: x, y: c.y1 - 4, vx: rnd(-80, 80), vy: rnd(-60, -10), life: rnd(0.4, 0.8), col: undefined });
      B.shake = Math.max(B.shake, 4);
    }
  }

  // ---------- 坐标 ----------
  const isP = (s) => s === B.p;
  const isHuman = (s) => s === B.p && !s.isAI;   // 数值自测时玩家这一侧也交给 AI
  const cellX = (s, c) => (isP(s) ? s.x + PADX + c * C : s.x + VW - PADX - (c + 1) * C);
  const cellY = (r, s) => {
    const base = VY + (s ? (s.yo || 0) + poseOffset(s) : 0) + r * C;
    if (!s || s.chassisId !== 'biped' || r < bipedLegStart(s)) return base;
    return base - (r - bipedLegStart(s)) * C * legCompression(s);
  };   // s.yo：车被地形抬高 / 压低的量（负 = 抬高）
  const frontEdge = (s) => (isP(s) ? cellX(s, s.frontCol) + C : cellX(s, s.frontCol));
  // 模块在世界里的包围盒（敌方镜像：锚点列在世界里是最右边那一列）
  function modBox(s, r, c, id) {
    const f = SA.fp(id), x0 = isP(s) ? cellX(s, c) : cellX(s, c + f.w - 1);
    // 车身倾斜时模块中心跟着转（包围盒大小不变，够画角框、军衔杠、特效用）
    const height = cellY(r + f.h, s) - cellY(r, s);
    const [cx, cy] = toWorld(s, x0 + f.w * C / 2, cellY(r, s) + height / 2);
    return { x0: cx - f.w * C / 2, x1: cx + f.w * C / 2, y0: cy - height / 2, y1: cy + height / 2 };
  }
  function modCenter(s, layer, r, c) {
    const cell = s.v[layer][r][c], b = modBox(s, r, c, cell ? cell.id : 'armor_heavy');
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  }
  // 真双足的腿区从胯锚点下两行开始；按载具实际锚点取值，避免把普通底盘的 CH 当成固定分界。
  const bipedLegStart = (s) => (SA.V.bipedOf && SA.V.bipedOf(s.v) ? SA.V.bipedOf(s.v).r + 2 : SA.V.CH);
  // 蹲姿把腿区高度压成一半；空中收腿同样使用这份几何，炮口、瞄准和命中共用。
  const legCompression = (s) => s.chassisId === 'biped' ? Math.max(s.crouch, s.tuck) * 0.5 : 0;
  // 世界坐标 → 子格
  function cellAt(s, x, y) {
    [x, y] = toFlat(s, x, y);   // 先转回车身平放时的坐标
    let localY = y - VY - (s.yo || 0) - poseOffset(s);
    const legY = bipedLegStart(s) * C;
    if (s.chassisId === 'biped' && localY >= legY) localY = legY + (localY - legY) / (1 - legCompression(s));
    const r = Math.floor(localY / C);
    const c = isP(s) ? Math.floor((x - s.x - PADX) / C) : Math.floor((s.x + VW - PADX - x) / C);
    return r >= 0 && r < K.ROWS && c >= 0 && c < K.COLS ? { r, c } : null;
  }
  // 子格上活着的模块 → { layer, r, c }（锚点）
  function modAt(s, layer, r, c) {
    const o = (layer === 'side' ? s.occS : s.occ)[r][c];
    if (o && o.cell.id === 'biped' && layer === 'body' && (r >= bipedLegStart(s) ? s.bipedLegDead : s.bipedHipDead)) return null;
    return o && alive(o.cell) ? { layer, r: o.r, c: o.c, hitR: r, hitC: c, zone: o.cell.id === 'biped' && layer === 'body' ? (r >= bipedLegStart(s) ? 'leg' : 'hip') : null } : null;
  }
  // 炮口位置：耳轴 + 炮管长度沿当前仰角伸出去（和画面上转动的炮管一致）；敌方镜像
  function muzzle(s, w, deg = barrel(s, w)) {
    const x0 = cellX(s, w.c), y0 = cellY(w.r, s);
    const [px, py] = w.m.piv || [C / 2, C / 2], a = deg * Math.PI / 180;
    const dx = Math.cos(a) * (w.m.blen || C / 2), dy = -Math.sin(a) * (w.m.blen || C / 2);
    const mx = isP(s) ? x0 + px + dx : x0 + C - px - dx;
    return toWorld(s, mx, y0 + py + dy);
  }
  // 准星优先级：侧挂层 > 主体层
  function targetAt(def, x, y) {
    const cell = cellAt(def, x, y);
    if (!cell) return null;
    return modAt(def, 'side', cell.r, cell.c) || modAt(def, 'body', cell.r, cell.c);
  }

  // ---------- 弹道 ----------
  function solve(x0, y0, tx, ty, v, gr, high) {
    const dx = Math.max(1, Math.abs(tx - x0)), dy = y0 - ty, v2 = v * v;
    const disc = v2 * v2 - gr * (gr * dx * dx + 2 * dy * v2);
    if (disc < 0) return { a: Math.PI / 4, reach: false };
    const sq = Math.sqrt(disc);
    return { a: Math.atan((v2 + (high ? sq : -sq)) / (gr * dx)), reach: true };
  }
  // 车身不稳的程度：移动速度 + 起步/刹车颠簸，乘底盘晃动系数（四足最稳，双足最晃）
  const shakeOf = (s) => s.sway * (Math.min(1, Math.abs(s.vx) / T.AIM_SPEED_REFERENCE) * T.AIM_SPEED_SPREAD + Math.min(T.AIM_JOLT_MAX, s.jolt) * T.AIM_JOLT_SPREAD);
  // 拆分兼容：旧的 battle-view.js 仍从全局读取这个 HUD 辅助函数；显式 API 同时在下方传给新视图。
  if (typeof window !== 'undefined') window.shakeOf = shakeOf;
  // 散布随聚焦和车身晃动变化；显式设置下限的抛射炮将当前角度限制在配置区间。
  const spreadDeg = (s, o, w, focus = s.focus) => {
    if ((w.m.indirect && !w.m.spread) || (s.prism && focus >= 1)) return 0;
    let spread = (w.m.spread * (1 - s.acc * T.AIM_ACCEL_SPREAD) + shakeOf(s) * T.AIM_SHAKE_SPREAD) * (1 - s.aimShrink * focus) + o.evade * T.AIM_EVADE_SPREAD;
    if (!w.m.indirect && w.m.arc !== 'high' && crouchStable(s)) spread *= 0.75 * s.bipedParts.crouchStability;
    return w.m.indirect && w.m.spreadMin != null ? clamp(spread, w.m.spreadMin, w.m.spread) : spread;
  };
  // 间接炮的最高仰角限制在世界竖直方向；下坡时允许车身相对角超过 90°。
  // 瞄准与散布发射共用此界，直射炮仍使用模块原射界。
  const aimLimits = (s, w) => [w.m.elev[0], w.m.indirect ? w.m.elev[1] - pitchOf(s) : w.m.elev[1]];
  // 瞄准点 → 炮管该抬到的仰角（度），受射界限制
  function aimAngle(s, w, tx, ty) {
    let a = barrel(s, w), sol, raw, behind;
    const [lo, hi] = aimLimits(s, w);
    // 高抛炮的炮口会随仰角明显移动：从候选仰角的炮口迭代求解，
    // 让 AI 预判、慢速转炮后的发射和弹道预览使用同一个出膛点。
    for (let i = 0; i < (w.m.indirect ? 4 : 1); i++) {
      const [x0, y0] = muzzle(s, w, a);
      behind = (isP(s) ? 1 : -1) * (tx - x0) <= 0;
      sol = solve(x0, y0, tx, ty, w.m.v, K.GRAVITY * w.m.g, w.m.arc === 'high');
      raw = sol.a * 180 / Math.PI - pitchOf(s);
      a = clamp(raw, lo, hi);
    }
    // 世界里要的仰角 → 炮管相对车身的仰角（车身在坡上抬头 / 低头，射界也跟着车身走）
    return { a, reach: sol.reach, behind, over: sol.reach && raw > hi ? 'high' : sol.reach && raw < lo ? 'low' : null };
  }
  const barrel = (s, w) => (s.elev[w.key] != null ? s.elev[w.key] : w.m.rest);
  // 间接火力必须有可达目标，并能在本帧完成转炮才开火；齐射与副驾驶共用此条件。
  // 直射武器保留原来的提前松手射击规则，巨炮等慢转高抛炮不会横着浪费首发。
  function indirectReady(s, w, pt, dt) {
    if (!w.m.indirect) return true;
    if (!pt) return false;
    const aim = aimAngle(s, w, pt[0], pt[1]);
    return aim.reach && !aim.over && !aim.behind && Math.abs(aim.a - barrel(s, w)) <= w.m.slew * dt;
  }
  function launch(s, w, deg, jitter) {
    const [x0, y0] = muzzle(s, w, deg);
    // 有散布的抛射件限制偏弹射界；预览和实射共用，避免平射、反向射击或预览扇区越界。
    const shotDeg = w.m.indirect ? clamp(deg + jitter, ...aimLimits(s, w)) : deg + jitter;
    const a = shotDeg * Math.PI / 180;
    const dir = isP(s) ? 1 : -1;
    const wa = a + pitchOf(s) * Math.PI / 180;   // 炮管仰角（相对车身）+ 车身抬头 = 世界里的仰角
    return { x: x0, y: y0, vx: dir * w.m.v * Math.cos(wa), vy: -w.m.v * Math.sin(wa), g: K.GRAVITY * w.m.g };
  }
  // 推进一步并检测命中：侧挂模式只和侧挂层碰撞
  function advance(sh, def, dt) {
    // 匀加速位移与 solve 的解析抛物线一致，避免高抛长航时累积半帧重力误差。
    sh.x += sh.vx * dt; sh.y += sh.vy * dt + sh.g * dt * dt / 2; sh.vy += sh.g * dt;
    const cell = cellAt(def, sh.x, sh.y);
    if (cell) {
      // 双足腿件是腿区的实体受击外层：命中同一真实挂位时先挡弹，损毁后才露出底盘分区。
      // 此例外不依赖瞄准时选的 side；普通侧挂件仍遵守原来的侧挂/车体分层。
      const legPart = def.chassisId === 'biped' && def.occS[cell.r][cell.c];
      if (legPart && M[legPart.cell.id].legPart) {
        const hit = modAt(def, 'side', cell.r, cell.c) || modAt(def, 'body', cell.r, cell.c);
        if (hit) return hit;
      } else {
        const hit = modAt(def, sh.side ? 'side' : 'body', cell.r, cell.c);
        if (hit) return hit;
      }
    }
    const cr = crateAt(sh.x, sh.y);
    if (cr >= 0) return { crate: cr };
    if (sh.y >= groundAt(sh.x)) return 'ground';
    if (sh.y > H + 100 || (B.cam && (sh.x < B.cam.x - 800 || sh.x > B.cam.x + B.cam.w + 800))) return 'out';
    return null;
  }

  // 镜头状态同时服务于画面和炮弹出界判定；无画面模拟也必须更新它，保持战斗边界与实战一致。
  function camera(dt) {
    const pr = cellX(B.p, B.p.minCol), er = cellX(B.e, B.e.minCol) + C;
    const lob = B.p.weapons.some(w => w.cell.id === B.p.sel && w.m.indirect);
    const tz = clamp((W - 60) / (er - pr + 360), CAMERA_ZMIN, lob ? 1.25 : 1.8);
    const cam = B.cam;
    cam.z += (tz - cam.z) * Math.min(1, dt * 3);
    const sw = W / cam.z, sh = H / cam.z;
    const tx = (pr + er) / 2 - sw / 2;
    cam.x += (tx - cam.x) * Math.min(1, dt * 4);
    cam.y = GROUND + 60 - sh;
    cam.w = sw; cam.h = sh;
    B.aim = B.aimScreen ? [cam.x + B.aimScreen[0] / cam.z, cam.y + B.aimScreen[1] / cam.z] : null;
  }
  function predict(s, o, w, deg, side, jitter = 0) {
    const sh = { ...launch(s, w, deg, jitter), side };
    const pts = [];
    for (let i = 0; i < T.PREVIEW_STEPS; i++) {
      const res = advance(sh, o, T.PREVIEW_STEP);
      if (i % T.PREVIEW_SAMPLE_EVERY === 0) pts.push([sh.x, sh.y]);
      if (res) return { pts, hit: res.layer ? res : null, blocked: res.crate != null ? 'crate' : res === 'ground' && sh.y < GROUND - 1 ? 'hill' : null, end: [sh.x, sh.y] };
    }
    return { pts, hit: null, end: [sh.x, sh.y] };
  }

  // ---------- 特效 ----------
  // 无画面模拟（数值自测）不产生粒子和飘字
  // 视觉事件总线：战斗逻辑只提交事件，画面层负责把事件变成粒子和飘字；无画面模拟仍完整消耗同一份战斗随机数。
  function emit(type, data = {}) {
    if (type === 'part' || type === 'text') { if (!B.headless && view) view.emit(type, data); return; }
    if (type === 'boom') {
      const items = [];
      const n = data.n == null ? 18 : data.n;
      for (let i = 0; i < n; i++) items.push({ type: 'fire', x: data.x, y: data.y, vx: rnd(-130, 130), vy: rnd(-160, 30), life: rnd(0.3, 0.7) });
      for (let i = 0; i < n / 2; i++) items.push({ type: 'debris', x: data.x, y: data.y, vx: rnd(-160, 160), vy: rnd(-250, -60), life: rnd(0.8, 1.4), col: random() < 0.5 ? P.iron[2] : P.dark[3] });
      for (let i = 0; i < n / 3; i++) items.push({ type: 'smoke', x: data.x + rnd(-12, 12), y: data.y, vx: rnd(-20, 20), vy: rnd(-70, -30), life: rnd(1, 1.8) });
      B.shake = Math.max(B.shake, 7);
      if (!B.headless && view) view.emit('particles', { items });
      return;
    }
    if (!B.headless && view) view.emit(type, data);
  }

  function fire(s, o, w, side, focus = s.focus) {
    // 鱼叉已牵引时保持绳索，直到绳索断开才允许再次发射。
    if (w.cell.id === 'harpoon' && s.tether) return;
    // 只观察已成功发射的最高威胁武器，即使它由副驾驶操控也可被对手看见。
    const primary = s.weapons.filter(x => !x.blocked).sort((a, b) => (b.m.dmg || 0) / Math.max(0.4, b.m.reload || 1) - (a.m.dmg || 0) / Math.max(0.4, a.m.reload || 1))[0];
    if (primary?.key === w.key) { s.lastMainFireAt = B.t; s.lastMainReload = w.m.reload; }
    if (B.aiStats) B.aiStats[isP(s) ? 'p' : 'e'].shots += w.m.salvo || 1;
    const spread = spreadDeg(s, o, w, focus);
    let jit = gauss() * spread;
    if (random() < (w.m.wild || 0)) jit += (random() < T.WILD_SIGN_CHANCE ? -1 : 1) * rnd(T.WILD_JITTER_MIN, T.WILD_JITTER_MAX) * w.m.spread; // 偏弹
    if (w.m.indirect && w.m.spreadMin != null) jit = clamp(jit, -spread, spread);
    const count = w.m.salvo || 1, gap = w.m.salvoGap || 0;
    effect(s, w.cell.id, 'fire', count);
    s.events.fire += count;
    const charged = focus >= 0.999;
    const muzzleShot = launch(s, w, barrel(s, w), 0);
    for (let i = 0; i < count; i++) {
      const sh = launch(s, w, barrel(s, w), count > 1 ? gauss() * spread : jit);
      const tick = w.m.reload < 1 && w.m.heatPerSec ? w.m.reload : 1;
      B.shots.push({ ...sh, delay: i * gap, originX: sh.x, originY: sh.y, range: w.m.range || 0, side, from: s, to: o, weapon: w.m, weaponCell: w.cell, focusAtFire: charged, dmg: (w.m.dmgPerSec ? w.m.dmgPerSec * tick : w.m.dmg), heatToEnemy: (w.m.heatToEnemy ? w.m.heatToEnemy * tick : 0), big: w.m.proj === 'shell' });
    }
    // 连续喷射的 heat 是自身每秒产热，普通武器的 heat 是每轮（齐射也只算一轮）。
    s.heat += w.m.heatPerSec ? w.m.heat * w.m.reload : w.m.heat;
    // 制退与反作用：炮管后坐（动态模块）、车身被往后推、整车晃一下；越重的车越稳
    const dir = isP(s) ? 1 : -1, up = w.m.arc === 'high';
    s.anim.gun(w.key, w.m);
    const push = (w.m.kick || 0) / s.mass * (crouchStable(s) ? 0.5 * s.bipedParts.crouchStability : 1);
    s.vx -= dir * push * (up ? T.RECOIL_HIGH_SPEED_FACTOR : 1);
    SA.Dyn.kick(s.anim.body, -push * (up ? T.RECOIL_ANIM_HIGH : T.RECOIL_ANIM_NORMAL));
    if (w.m.proj === 'shell') B.shake = Math.max(B.shake, T.SHELL_SHAKE_BASE + push / T.SHELL_SHAKE_PUSH_DIVISOR);
    for (let i = 0; i < (w.m.proj === 'shell' ? 10 : 3); i++) emit('part', { type: 'flash', x: muzzleShot.x + dir * rnd(0, 10), y: muzzleShot.y + rnd(-3, 3) - (up ? rnd(0, 8) : 0), vx: dir * rnd(30, 110), vy: up ? rnd(-140, -40) : rnd(-30, 30), life: rnd(0.06, 0.14), col: undefined });
    if (w.m.proj === 'shell') {
      emit('part', { type: 'smoke', x: muzzleShot.x, y: muzzleShot.y, vx: dir * 30, vy: -24, life: 0.9, col: undefined });
      // 炮口制退器两侧喷出的气浪 + 炮口前方的冲击尘
      if (!up) for (const vy of [-1, 1]) for (let i = 0; i < 3; i++) emit('part', { type: 'steam', x: muzzleShot.x - dir * 4, y: muzzleShot.y + vy * 4, vx: -dir * rnd(20, 60), vy: vy * rnd(60, 120), life: rnd(0.25, 0.45), col: undefined });
      if (muzzleShot.y > groundAt(muzzleShot.x) - 120) for (let i = 0; i < 6; i++) emit('part', { type: 'dust', x: muzzleShot.x + dir * rnd(0, 30), y: groundAt(muzzleShot.x) - 2, vx: dir * rnd(20, 120), vy: rnd(-80, -20), life: rnd(0.3, 0.6), col: undefined });
    }
  }

  function damage(def, att, imp, dmg) {
    // 输出倍率只在实际受击入口应用一次；分摊仍按原预算分份，返回实际扣血供反震记账。
    dmg *= att ? att.statMultipliers.damage : 1;
    if (!(dmg > 0)) return 0;
    const cell = def.v[imp.layer][imp.r][imp.c];
    if (!alive(cell)) return 0;
    const before = cell.hp;
    const zone = imp.zone || (cell.id === 'biped' && imp.layer === 'body' ? (imp.hitR >= bipedLegStart(def) ? 'leg' : 'hip') : null);
    if (cell.id === 'biped' && zone) {
      // 分区各自承受伤害：超出该区的部分不扣另一分区，也不计入伤害账本。
      if (zone === 'leg') def.bipedLegHp = Math.max(0, def.bipedLegHp - dmg);
      else def.bipedHipHp = Math.max(0, def.bipedHipHp - dmg);
      def.bipedLegDead = def.bipedLegHp <= 0;
      def.bipedHipDead = def.bipedHipHp <= 0;
      cell.bipedZones = { hip: Math.max(0, def.bipedHipHp), leg: Math.max(0, def.bipedLegHp), max: SA.V.maxHp(cell) };
      cell.hp = def.bipedHipHp + def.bipedLegHp;
      refresh(def);
    } else cell.hp = Math.max(0, cell.hp - dmg);
    // 超时评分、结算统计和受击数字共用实际扣掉的耐久，避免巨炮超额伤害改变胜负。
    dmg = before - cell.hp;
    def.taken += dmg; if (att) att.dealt += dmg;
    const [x, y0] = modCenter(def, imp.layer, imp.r, imp.c), y = y0 - 6;
    // 微小扣血保留精度与账本，但不发出四舍五入为 0 的伤害数字。
    const rounded = Math.round(dmg), textX = x + rnd(-9, 9);
    if (rounded > 0) emit('text', { str: String(rounded), x: textX, y: y - 18, col: imp.layer === 'side' ? P.magenta : P.white });
    for (let i = 0; i < 6; i++) emit('part', { type: 'spark', x: x, y: y + 6, vx: rnd(-130, 130), vy: rnd(-160, 0), life: rnd(0.15, 0.35), col: undefined });
    if (cell.id === 'biped' ? (def.bipedLegDead && def.bipedHipDead) : cell.hp <= 0) destroy(def, att, imp);
    return dmg;
  }

  // 受击刷新后重算可用驱动，避免沿用碰撞前的动力缓存；本帧蓄压放能仍算可移动。
  const canDrive = (s) => {
    if (s.speed <= 0 || s.armorSpeedFactor <= 0) return false;
    const stored = s.storeMax > 0 ? Math.min(T.STORE_RELEASE_PER_SEC, Math.max(0, s.store || 0) / Math.max(1e-6, s.driveDt || 1 / 60) + (s.driveRelease || 0)) : 0;
    return s.supply + stored > s.equip;
  };
  // 近战打中残骸或已毁腿/髋时，把一次攻击预算按距撞点远近分给存活部件。
  function meleeDamage(def, att, imp, amount) {
    const cell = def.v[imp.layer][imp.r][imp.c];
    if (!cell || !(amount > 0)) return 0;
    const budget = amount * (canDrive(def) ? 1 : 1.25);
    const hitRow = imp.hitR == null ? imp.r : imp.hitR;
    const hitCol = imp.hitC == null ? imp.c : imp.hitC;
    const zone = cell.id === 'biped' ? (hitRow >= bipedLegStart(def) ? 'leg' : 'hip') : null;
    if (alive(cell) && (!zone || (zone === 'leg' ? def.bipedLegHp : def.bipedHipHp) > 0)) {
      return damage(def, att, { ...imp, hitR: hitRow, hitC: hitCol, zone }, budget);
    }
    return distributeDamage(def, att, imp, budget);
  }

  // 全车分摊既用于命中残骸后的继续伤害，也用于没有近战件时的车体反震。
  const impactPoint = (s, imp) => toWorld(s, cellX(s, imp.hitC == null ? imp.c : imp.hitC) + HALF, cellY(imp.hitR == null ? imp.r : imp.hitR, s) + HALF);
  function distributeDamage(def, att, imp, budget) {
    const [hx, hy] = impactPoint(def, imp);
    const targets = [];
    SA.V.each(def.v, (part, r, c, layer) => {
      if (!alive(part)) return;
      let partZone = null, [x, y] = modCenter(def, layer, r, c);
      if (part.id === 'biped') {
        // 双足只取当前仍存活且更靠近撞点的分区，避免把份额写进已毁分区。
        const choices = [];
        if (def.bipedHipHp > 0) choices.push({ zone: 'hip', row: r + 1 });
        if (def.bipedLegHp > 0) choices.push({ zone: 'leg', row: r + 3 });
        if (!choices.length) return;
        const pos = choices.map(q => ({ ...q, point: toWorld(def, x, cellY(q.row, def) + HALF) }));
        pos.sort((a, b) => Math.hypot(a.point[0] - hx, a.point[1] - hy) - Math.hypot(b.point[0] - hx, b.point[1] - hy));
        partZone = pos[0].zone; [x, y] = pos[0].point;
      }
      const weight = 1 / (C + Math.hypot(x - hx, y - hy));
      targets.push({ layer, r, c, zone: partZone, hitR: partZone === 'leg' ? r + 3 : r, weight });
    });
    const total = targets.reduce((sum, target) => sum + target.weight, 0);
    if (!total) return 0;
    let dealt = 0;
    for (const target of targets) dealt += damage(def, att, target, budget * target.weight / total);
    return dealt;
  }

  // 有存活近战件时，反震只落在本次接触件或距撞点最近的一件；没有时才分摊全车。
  function recoilDamage(s, imp, contact, directLoss, tethered = false) {
    if (!(directLoss > 0)) return 0;
    let chosen = contact && alive(contact.cell) && SA.isRam(contact.cell.id) ? contact : null;
    if (!chosen) {
      const [hx, hy] = impactPoint(s, imp);
      let nearest = Infinity;
      SA.V.each(s.v, (cell, r, c, layer) => {
        if (!alive(cell) || !SA.isRam(cell.id)) return;
        const [x, y] = modCenter(s, layer, r, c);
        const distance = Math.hypot(x - hx, y - hy);
        if (distance < nearest) { nearest = distance; chosen = { cell, layer, r, c }; }
      });
    }
    if (chosen) return damage(s, null, { layer: chosen.layer, r: chosen.r, c: chosen.c }, directLoss * rnd(K.RAM_MELEE_SELF_MIN, K.RAM_MELEE_SELF_MAX));
    return distributeDamage(s, null, imp, directLoss * (tethered ? K.RAM_TETHER_SELF : K.RAM_SELF));
  }

  // 弹开概率：装甲厚度（材料放大后的 armor）对武器穿深。抽成纯函数，车间用它给出穿深对照（SA.Battle.ricochetChance）
  function ricochetChance(armor, weapon) {
    const thickness = Math.max(0, armor || 0), penetration = Math.max(0, weapon.penetration || 0);
    const deficit = Math.max(0, thickness - penetration) / Math.max(1, thickness);
    const base = penetration >= thickness ? 0 : T.RICOCHET_BASE + deficit * T.RICOCHET_DEFICIT;
    return clamp(base + (weapon.ricochet || 0), 0, T.RICOCHET_MAX);
  }
  // 炮弹命中装甲时独立检查穿深。装甲厚度来自材料放大后的 armor，穿深来自武器原始字段，
  // 因而升级材料只会让装甲更难打穿，不会把同一门炮的穿深一起放大。
  function projectileDamage(def, att, imp, dmg, weapon) {
    const cell = def.v[imp.layer][imp.r][imp.c], m = cell ? SA.mod(cell) : null;
    if (!m || !m.armor || !weapon) return dmg;
    const chance = ricochetChance(m.armor, weapon);
    if (random() >= chance) return SA.armorCut(m, dmg);
    if (att) att.events.ricochet++;
    const [x, y] = modCenter(def, imp.layer, imp.r, imp.c);
    emit('ricochet', { x: x, y: y, back: att && att.x < def.x ? -1 : 1 });
    return dmg * T.RICOCHET_DAMAGE;
  }

  function destroy(def, att, imp) {
    const cell = def.v[imp.layer][imp.r][imp.c];
    cell.hp = 0;
    if (att) att.events.destroyed++;
    const [x, y] = modCenter(def, imp.layer, imp.r, imp.c);
    emit('boom', { x: x, y: y });
    emit('shatter', { x: x, y: y, cell: cell });
    const f = SA.fp(cell.id);
    // 挂在这个主体模块上的侧炮一起掉下来
    if (imp.layer === 'body') {
      const seen = new Set();
      for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) {
        const o = def.occS[imp.r + i][imp.c + j];
        if (!o || seen.has(o.cell) || !alive(o.cell)) continue;
        seen.add(o.cell); o.cell.hp = 0;
        for (let k = 0; k < 8; k++) emit('part', { type: 'debris', x: x, y: y, vx: rnd(-90, 90), vy: rnd(-120, 0), life: 1.2, col: P.brass[1] });
        emit('text', { str: '!', x: x, y: y - 40, col: P.fire[3] });
      }
    }
    const m = M[cell.id];
    if (cell.id === 'track' && !def.thrown) for (let i = 0; i < 14; i++) emit('part', { type: 'debris', x: x + rnd(-40, 40), y: GROUND - 10, vx: rnd(-140, 140), vy: rnd(-260, -80), life: rnd(0.8, 1.5), col: i % 2 ? P.dark[2] : P.dark[3] });
    // 蓄压罐只有在罐内存量超过一半时才会因击毁爆炸；普通爆炸模块保持原规则。
    const pressurized = cell.id === 'pressure_tank' && def.storeMax > 0 && def.store > def.storeMax * T.STORE_BURST_RATIO;
    const owner = def === B.p ? B.p : B.e;
    const wkey = `${imp.r},${imp.c},b`;
    const loaded = !owner || owner.timers[wkey] == null || owner.timers[wkey] <= 0;
    if (m.explode && (cell.id !== 'pressure_tank' || pressurized) && (cell.id !== 'rocket_rack' || loaded)) {
      emit('boom', { x: x, y: y, n: 30 });
      // 波及外圈紧贴的每个模块（各炸一次）
      const hit = new Set();
      for (let i = -1; i <= f.h; i++) for (let j = -1; j <= f.w; j++) {
        if ((i === -1 || i === f.h) === (j === -1 || j === f.w)) continue;   // 只要上下左右，不要对角和自己
        const r = imp.r + i, c = imp.c + j;
        if (r < 0 || r >= K.ROWS || c < 0 || c >= K.COLS) continue;
        const o = def.occ[r][c];
        if (o && alive(o.cell) && !hit.has(o.cell)) { hit.add(o.cell); damage(def, att, { layer: 'body', r: o.r, c: o.c }, m.explode); }
      }
    }
    refresh(def);
  }

  // ---------- 移动与撞击 ----------
  // 起步：停稳后要先让锅炉「库吃库吃」憋几口蒸汽，才开得动；越重憋得越久
  const spoolTime = (s) => clamp(T.SPOOL_BASE + s.mass * T.SPOOL_MASS, T.SPOOL_MIN, T.SPOOL_MAX) * s.spoolK;
  function chuff(s, dt) {
    s.chuffT -= dt;
    if (s.chuffT > 0) return;
    s.chuffT = T.CHUFF_INTERVAL;
    s.rock = 1;
    SA.V.each(s.v, (cell, r, c, layer) => {
      if (layer !== 'body' || !alive(cell) || cell.id !== 'boiler') return;
      const x = modBox(s, r, c, cell.id).x0 + (isP(s) ? 37 : 11), y = cellY(r, s);
      for (let i = 0; i < 7; i++) emit('part', { type: 'steam', x: x + rnd(-5, 5), y: y, vx: rnd(-50, 50), vy: rnd(-170, -80), life: rnd(0.5, 0.9), col: undefined });
    });
    const back = cellX(s, isP(s) ? s.minCol : s.frontCol);
    for (let i = 0; i < 3; i++) emit('part', { type: 'steam', x: back + (isP(s) ? 0 : C), y: GROUND - 16, vx: (isP(s) ? -1 : 1) * rnd(40, 90), vy: rnd(-40, -10), life: rnd(0.4, 0.7), col: undefined });
  }

  // 惯性：起步要憋气再加速，松开/反向要先制动滑行；越重越慢
  function drive(s, dt) {
    let dir = s.dead || s.crouch > 0 || s.jumpCharge > 0 ? 0 : s.dir;
    if (s.chassisId === 'biped' && (s.crouch > 0 || s.jumpCharge > 0)) s.vx = 0;
    s.spooling = false;
    if (dir && Math.abs(s.vx) < T.START_SPEED && s.speed > 0 && s.power > 0) {
      if (s.spoolDir !== dir) { s.spoolDir = dir; s.spool = spoolTime(s); s.chuffT = 0; }
      if (s.spool > 0) { s.spool -= dt; s.spooling = true; chuff(s, dt); dir = 0; }
    } else if (!dir) s.spoolDir = 0;
    s.rock = Math.max(0, s.rock - dt * T.ROCK_DECAY);
    // 最高速度 = 底盘速度 × 动力比（锅炉富余可按 K.SPEED_BOOST 超速）
    // 地形：泥地减速、上坡慢下坡快
    const tk = s.airDuration > 0 ? { top: 1, acc: 1 } : terrainK(s, dir || Math.sign(s.vx));
    // 绳索收绳速度叠加在自主驾驶目标上：外向驾驶仍能抵抗，断绳恢复正常制动。
    const top = dir * s.speed * (s.speedMul || 0) * tk.top * s.statMultipliers.speed + (s.tetherPullVx || 0);
    const k = clamp(Math.sqrt(T.MASS_ACCEL_FACTOR / s.mass), T.MASS_ACCEL_MIN, T.MASS_ACCEL_MAX);
    const braking = s.vx !== 0 && (top === 0 || Math.sign(top) !== Math.sign(s.vx) || Math.abs(top) < Math.abs(s.vx));
    // 被撞飞（速度超过自己能开出的最高速度）：履带和脚在地上打滑，急停。正常松手 / 掉头仍按原来的刹车慢慢停
    const own = s.speed * (s.speedMul || 0) * tk.top * s.statMultipliers.speed;
    const skid = braking && Math.abs(s.vx) > own * T.SKID_SPEED_MULT + T.SKID_SPEED_OFFSET;
    // 制动倍率同时覆盖正常刹车和被撞飞后的打滑减速，不改变起步加速度。
    let acc = (braking ? Math.max(K.BRAKE * s.brakeK, skid ? K.SKID : 0) * s.statMultipliers.brake : K.ACCEL * s.accelK * tk.acc) * k;
    // 自主牵引力受本车动力限制；外部绳索提供收绳力，无动力车辆也能被拖动。
    if (!braking && dir && !s.tetherPullVx) {
      const [left, right] = span(s), front = dir > 0 ? right : left, back = dir > 0 ? left : right;
      const grade = (groundAt(back) - groundAt(front)) / Math.max(1, right - left);
      const kg = s.mass * 1000, metresPerSec = Math.abs(s.vx) * SA.Phys.PX_M;
      const tractionN = Math.max(0, s.driveAvailableKw || 0) * 1000 * SA.Phys.TRANSMISSION / Math.max(0.4, metresPerSec);
      const resistanceN = kg * SA.Phys.GRAVITY * (SA.Phys.ROLL + grade);
      const physicalAcc = Math.max(0, (tractionN - resistanceN) / kg / SA.Phys.PX_M);
      acc = Math.min(acc, physicalAcc);
    }
    const vx0 = s.vx;
    if (s.airDuration > 0) s.vx += clamp(dir * s.speed * 0.25 - s.vx, -25 * dt, 25 * dt);
    else s.vx += clamp(top - s.vx, -acc * dt, acc * dt);
    // 颠簸：速度变化越猛越颠（起步、刹车、撞击），慢慢平复
    // 颠簸：当前速度和「平滑速度」的差（起步、刹车、撞击时大；开火的小后坐几乎不算）
    s.vxs = (s.vxs == null ? s.vx : s.vxs + (s.vx - s.vxs) * Math.min(1, dt * T.SPEED_SMOOTHING));
    if (dt > 0) s.jolt += (Math.min(T.JOLT_MAX, Math.abs(s.vx - s.vxs) / T.JOLT_SPEED_REFERENCE) - s.jolt) * Math.min(1, dt * T.JOLT_SMOOTHING);
    if (braking && Math.abs(s.vx) > T.BRAKE_DUST_SPEED) {
      s.brakeT -= dt;
      if (s.brakeT <= 0) {
        s.brakeT = T.BRAKE_DUST_INTERVAL;
        const back = cellX(s, isP(s) ? s.minCol : s.frontCol);
        const dx0 = back + rnd(0, (s.frontCol - s.minCol + 1) * C);
        emit('part', { type: 'dust', x: dx0, y: groundAt(dx0) - 2, vx: -Math.sign(s.vx) * rnd(10, 60), vy: rnd(-60, -20), life: rnd(0.3, 0.5), col: undefined });
      }
    }
    // 自由场地可无限延伸；有限场地在本帧碰撞与推挤结束后统一钳住整车外沿。
    let nx = s.x + s.vx * dt;
    // 货箱：不经撞，车一顶上去就碾碎（车越重、越快碎得越快），碾的时候车速被拖慢；碎了留一堆碎木，开过去再慢一点
    if (B.ter && s.airHeight <= 0) {
      const [L, R] = span(s);
      for (let k2 = 0; k2 < B.ter.crates.length; k2++) {
        const cb = B.ter.crates[k2];
        if (cb.dead) continue;
        const dx = nx - s.x;
        let stop = null;
        if (dx > 0 && R <= cb.x0 + T.CRATE_EDGE_MARGIN && R + dx > cb.x0) stop = s.x + (cb.x0 - R);
        else if (dx < 0 && L >= cb.x1 - T.CRATE_EDGE_MARGIN && L + dx < cb.x1) stop = s.x + (cb.x1 - L);
        if (stop == null) continue;
        const v = Math.abs(s.vx), hit = !cb.touch;   // 刚撞上的那一下另算冲击
        cb.touch = 0.15;
        let dmg = s.mass * (T.CRATE_DAMAGE_BASE + v * T.CRATE_DAMAGE_SPEED) * dt * (s.rams ? T.CRATE_RAM_MULTIPLIER : 1);
        if (hit && v > T.CRATE_IMPACT_SPEED) dmg += s.mass * v * T.CRATE_IMPACT_FACTOR * (s.rams ? T.CRATE_RAM_IMPACT_MULTIPLIER : 1);
        hitCrate(k2, dmg, true);
        if (cb.dead) { s.vx *= T.CRATE_SLOWDOWN; continue; }      // 碾碎了：冲过去，只丢一点速度
        nx = stop;
        s.vx = Math.sign(s.vx) * Math.min(Math.abs(s.vx), T.CRATE_PUSH_SPEED_MAX);   // 还没碎：顶着慢慢碾
      }
    }
    s.moving = Math.abs(nx - s.x) > T.MOVING_EPSILON;
    const distance = Math.abs(nx - s.x);
    s.phase += (nx - s.x) * (isP(s) ? 1 : -1);
    if ((s.chassisId === 'biped' || s.chassisId === 'quad') && SA.LEGLAB && SA.LEGLAB.strideFor) {
      // 步态角：每走 4 × 步幅一圈（同 tools/chassis-lab.html）；按车头方向带符号，倒车时步态倒着放，看起来是往后退
      const stride = (s.chassisId === 'quad' ? SA.LEGLAB.quadStride : SA.LEGLAB.strideFor)(Math.abs(s.vx));
      s.gait += Math.PI * 2 * (nx - s.x) * (isP(s) ? 1 : -1) / (4 * stride);
      s.anim.phase = s.gait;   // 腿式步态按走过的距离推进
    } else s.anim.phase = s.phase; // 履带沿用链节相位
    s.x = nx;
    settle(s, dt);
  }

  // ---------- 逐行碰撞 ----------
  // 两车只在「同一高度的行」上相撞：每一行各自最前端的模块互相顶住。
  // 这样底盘伸得再长也只在底盘那一行挡路，上层的撞角可以从光秃秃的底盘上方越过去撞到后面的模块。
  // 每一行子格最前端的活模块（占格表里的 { cell, r, c }），没有就是 null
  const rowFront = (s, r) => { for (let c = K.COLS - 1; c >= 0; c--) { const o = s.occ[r][c]; if (o && alive(o.cell) && !(o.cell.id === 'biped' && (r >= bipedLegStart(s) ? s.bipedLegDead : s.bipedHipDead))) return o; } return null; };
  const rowFrontAny = (s, r) => { for (let c = K.COLS - 1; c >= 0; c--) if (s.occ[r][c]) return s.occ[r][c]; return null; };
  const rowEdge = (s, o) => { const b = modBox(s, o.r, o.c, o.cell.id); return isP(s) ? b.x1 : b.x0; };
  // 返回 { gap, rows }：最小间距，以及贴得最近（在 1px 内）的那些行
  // 两车被地形抬到不同高度时，按世界高度对齐：p 的第 r 行对着 e 的第 r + dr 行
  function rowContact(p, e) {
    let gap = Infinity;
    const rows = [];
    const dr = Math.round(((p.yo || 0) + poseOffset(p) - (e.yo || 0) - poseOffset(e)) / C);
    for (let r = 0; r < K.ROWS; r++) {
      let re = r + dr;
      if (p.chassisId === 'biped' || e.chassisId === 'biped') {
        let y = (cellY(r, p) + cellY(r + 1, p)) / 2 - VY - (e.yo || 0) - poseOffset(e);
        const legY = bipedLegStart(e) * C;
        if (e.chassisId === 'biped' && y >= legY) y = legY + (y - legY) / (1 - legCompression(e));
        re = Math.floor(y / C);
      }
      if (re < 0 || re >= K.ROWS) continue;
      const pc = rowFront(p, r), ec = rowFront(e, re);
      if (!pc || !ec) continue;
      const g0 = rowEdge(e, ec) - rowEdge(p, pc);
      rows.push({ r, re, g: g0, pc, ec });
      gap = Math.min(gap, g0);
    }
    return { gap, dr, rows: rows.filter(x => x.g <= gap + T.CONTACT_GAP) };
  }

  // 普通碰撞仍只看存活前沿；近战另取残骸前沿，且攻击方必须是存活的前排撞击件。
  function meleeContact(p, e, dr) {
    const pairs = [];
    for (let r = 0; r < K.ROWS; r++) {
      const re = r + dr;
      if (re < 0 || re >= K.ROWS) continue;
      const pf = rowFront(p, r), ef = rowFront(e, re);
      const pa = rowFrontAny(p, r), ea = rowFrontAny(e, re);
      if (pf && SA.isRam(pf.cell.id) && ea) pairs.push({ a: p, d: e, am: pf, dm: ea, r, tr: re, g: rowEdge(e, ea) - rowEdge(p, pf) });
      if (ef && SA.isRam(ef.cell.id) && pa) pairs.push({ a: e, d: p, am: ef, dm: pa, r: re, tr: r, g: rowEdge(e, ef) - rowEdge(p, pa) });
    }
    return pairs;
  }

  // 已毁底盘（履带、轮、腿）不再像存活模块那样把撞击件弹回去，但仍是一大块铁：
  // 撞击件顶进残骸时限速、艰涩地往里挤，按节拍给一次比正常撞击轻的反震，并让两车震动。
  // 只限速和反推，不阻止深入或重叠；伤害仍走下方原有的近战结算。
  function grindWreck(melee, dt) {
    for (const s of [B.p, B.e]) { s.grind = Math.max(0, (s.grind || 0) - dt * T.WRECK_GRIND_FADE); s.grindT = Math.max(0, (s.grindT || 0) - dt); }
    const done = new Set();
    for (const x of melee) {
      const a = x.a, d = x.d;
      if (x.g > 0 || done.has(a) || !alive(x.am.cell)) continue;
      const dir = isP(a) ? 1 : -1, ex = rowEdge(a, x.am), ey = cellY(x.r, a) + HALF;
      // 撞击件前沿此刻压着的那一格：必须是已毁底盘（穿出残骸、碰到活模块或空格都不算）
      const px = ex - dir, dc = isP(d) ? Math.floor((px - d.x - PADX) / C) : Math.floor((d.x + VW - PADX - px) / C);
      const under = dc >= 0 && dc < K.COLS ? d.occ[x.tr][dc] : null;
      if (!under || alive(under.cell) || M[under.cell.id].layer !== 'chassis') continue;
      const rel = dir * (a.vx - d.vx);
      if (rel <= 0 && !(a.dir === dir && canDrive(a))) continue;
      done.add(a);
      const fresh = !a.grinding;
      // 往里挤的相对速度封顶。残骸趴在地上，多出来的速度大半被地面吃掉，只把一小份拱给对方
      const sum = a.mass + d.mass, share = T.WRECK_PUSH_SHARE * a.mass / sum;
      if (rel > T.WRECK_GRIND_SPEED_MAX) {
        const dv = rel - T.WRECK_GRIND_SPEED_MAX;
        a.vx -= dir * dv; d.vx += dir * dv * share;
      }
      a.grind = 1; d.grind = Math.max(d.grind, 0.6);
      if (!fresh && a.grindT > 0) continue;
      a.grindT = T.WRECK_GRIND_INTERVAL;
      // 一次反震：把撞击方往回顶一点（远小于正常撞击的弹开），刚顶上那一下按来速加重
      const k = fresh ? Math.min(T.WRECK_IMPACT_MAX, 1 + Math.max(0, rel - T.WRECK_GRIND_SPEED_MAX) / T.RAM_CLOSING_REFERENCE) : 1;
      const back = T.WRECK_GRIND_RECOIL * k;
      a.vx -= dir * back; d.vx += dir * back * share;
      SA.Dyn.kick(a.anim.body, -T.WRECK_GRIND_ANIM * k);
      SA.Dyn.kick(d.anim.body, T.WRECK_GRIND_ANIM * 0.5 * k);
      for (let i = 0; i < (fresh ? 10 : 4); i++) emit('part', { type: 'spark', x: ex, y: ey + rnd(-8, 8), vx: -dir * rnd(20, 160), vy: rnd(-180, -20), life: rnd(0.12, 0.3), col: undefined });
      for (let i = 0; i < (fresh ? 5 : 2); i++) emit('part', { type: 'debris', x: ex, y: ey, vx: rnd(-80, 80), vy: rnd(-160, -40), life: rnd(0.5, 1), col: i % 2 ? P.dark[2] : P.iron[2] });
      emit('part', { type: 'dust', x: ex, y: groundAt(ex) - 2, vx: dir * rnd(10, 50), vy: rnd(-50, -15), life: rnd(0.3, 0.5), col: undefined });
      B.shake = Math.max(B.shake, fresh ? 3 + 2 * k : 2);
    }
    for (const s of [B.p, B.e]) s.grinding = done.has(s);
  }

  function collide(dt) {
    const p = B.p, e = B.e;
    if (p.frontCol < 0 || e.frontCol < 0) return;
    if (p.airDuration > 0 || e.airDuration > 0) {
      const [pl, pr] = span(p), [el, er] = span(e), overlap = pr - el;
      if (overlap > 0) { p.x -= overlap * e.mass / (p.mass + e.mass); e.x += overlap * p.mass / (p.mass + e.mass); }
    }
    const { gap, rows, dr } = rowContact(p, e);
    const melee = meleeContact(p, e, dr).filter(x => x.g <= T.CONTACT_GAP);
    grindWreck(melee, dt);
    B.contactRows = gap <= T.CONTACT_GAP ? rows.map(x => x.r) : [];
    B.contactRowsE = gap <= T.CONTACT_GAP ? rows.map(x => x.re) : [];
    for (const x of melee) { B.contactRows.push(x.a === p ? x.r : x.tr); B.contactRowsE.push(x.a === e ? x.r : x.tr); }
    B.rowShift = dr;
    B.contact = gap <= T.CONTACT_GAP || melee.length > 0;
    if (B.contact) {
      for (const [a, d] of [[p, e], [e, p]]) {
        if (a.chassisId === 'biped' && a.balance === '平衡' && !a.bipedLegDead && a.kickCooldown <= 0 && a.speed > 0 && !a.crouch && !a.airDuration && !a.pistons.some(pc => M[pc.cell.id].knight)) {
          const target = rows.find(x => {
            const part = a === p ? x.ec : x.pc;
            return x.g <= T.CONTACT_GAP && part && alive(part.cell);
          });
          if (target) {
            const hit = a === p ? target.ec : target.pc;
            const hitRow = a === p ? target.re : target.r;
            const kick = M.biped.kick || { ram: 12, knock: 0.35, cooldown: 0.7 };
            damage(d, a, { layer: 'body', r: hit.r, c: hit.c, hitR: hitRow, hitC: hit.c, zone: hitRow >= bipedLegStart(d) ? 'leg' : 'hip' }, kick.ram * SA.ramMul(a.mass * 1000));
            if (kick.knock) shove(a, d, kick.knock * T.BIPED_KICK_SHOVE);
            a.events.kick++; a.kickCooldown = kick.cooldown;
          }
        }
      }
    }
    const closing = p.vx - e.vx;
    // 已顶住时继续出力的近战件按原撞击公式每 0.35 秒打一轮；高速碰撞仍走下方原物理。
    if (closing <= T.RAM_SPEED_THRESHOLD && B.ramCd <= 0) {
      const used = [];
      for (const x of melee) {
        if (x.g > 0 || !canDrive(x.a) || x.a.dir !== (x.a === p ? 1 : -1) || used.some(q => q.a === x.a && q.am.cell === x.am.cell && q.dm.cell === x.dm.cell)) continue;
        used.push(x);
        const speed = Math.max((x.a === p ? 1 : -1) * (x.a.vx - x.d.vx), T.RAM_SPEED_THRESHOLD);
        const dmg = (SA.mod(x.am.cell).ram || T.RAM_DEFAULT_DAMAGE) * speed / T.RAM_CLOSING_REFERENCE * SA.ramMul(x.a.mass * 1000);
        x.a.events.ram++;
        const directLoss = meleeDamage(x.d, x.a, { layer: 'body', r: x.dm.r, c: x.dm.c, hitR: x.tr }, SA.isRam(x.dm.cell.id) ? dmg * T.RAM_TARGET_DAMAGE : dmg);
        recoilDamage(x.a, { layer: 'body', r: x.am.r, c: x.am.c, hitR: x.r }, { ...x.am, layer: 'body' }, directLoss);
      }
      if (used.length) B.ramCd = T.RAM_COOLDOWN;
    }
    if (gap > 0) return;
    const cx = (rowEdge(p, rows[0].pc) + rowEdge(e, rows[0].ec)) / 2;
    if (closing > T.RAM_SPEED_THRESHOLD && B.ramCd <= 0) {
      B.ramCd = T.RAM_COOLDOWN;
      // 双足提速只改变运动，不放大其自身撞击伤害；其他底盘仍使用真实速度。
      const damageV = q => q.chassisId === 'biped' ? clamp(q.vx, -97.5, 97.5) : q.vx;
      const f = closing / T.RAM_CLOSING_REFERENCE;
      let knockP = 0, knockE = 0;
      // 一对模块顶在一起（可能跨好几行子格）只算一次
      const pairs = [];
      for (const x of rows) if (!pairs.some(q => q.pc === x.pc && q.ec === x.ec)) pairs.push(x);
      for (const [a, d] of [[p, e], [e, p]]) {
        for (const x of pairs) {
          const am = a === p ? x.pc : x.ec, dm = a === p ? x.ec : x.pc;
          const ma = am.cell;
          // 撞击伤害 ∝ 相对速度 × 自身车重；撞击面自己也吃一部分反作用
          const dmg = (SA.mod(ma).ram || T.RAM_DEFAULT_DAMAGE) * Math.max(0, a === p ? damageV(a) - d.vx : d.vx - damageV(a)) / T.RAM_CLOSING_REFERENCE * SA.ramMul(a.mass * 1000);   // 车越重撞得越狠
          if (SA.mod(ma).ram) a.events.ram++;
          const contact = SA.isRam(ma.id) && melee.find(q => q.a === a && q.am.cell === ma && q.g <= 0);
          const target = contact ? contact.dm : dm, hitR = contact ? contact.tr : (a === p ? x.re : x.r);
          const hit = { layer: 'body', r: target.r, c: target.c, hitR };
          const directLoss = SA.isRam(ma.id)
            ? meleeDamage(d, a, hit, SA.isRam(target.cell.id) ? dmg * T.RAM_TARGET_DAMAGE : dmg)
            : damage(d, a, hit, SA.isRam(dm.cell.id) ? dmg * T.RAM_TARGET_DAMAGE : dmg);
          const tethered = (a.tether && a.tether.target === d) || (d.tether && d.tether.target === a);
          recoilDamage(a, { layer: 'body', r: am.r, c: am.c, hitR: a === p ? x.r : x.re }, { ...am, layer: 'body' }, directLoss, tethered);
          if (M[ma.id].knock) { if (a === p) knockE += M[ma.id].knock; else knockP += M[ma.id].knock; }
        }
      }
      for (let i = 0; i < 16; i++) emit('part', { type: 'spark', x: cx, y: cellY(rows[0].r, p) + HALF + rnd(-30, 30), vx: rnd(-300, 300), vy: rnd(-300, 0), life: rnd(0.2, 0.4), col: undefined });
      B.shake = Math.max(B.shake, 5 + f * 4);
      // 一维碰撞：恢复系数由战斗常量控制，铲斗额外击退
      const mp = p.mass, me = e.mass, vp = p.vx, ve = e.vx;
      const vcm = (mp * vp + me * ve) / (mp + me);
      p.vx = vcm - T.RAM_RESTITUTION * (vp - vcm);
      e.vx = vcm - T.RAM_RESTITUTION * (ve - vcm);
      // 铲斗 / 撞角的额外击退：两车之间的一对冲量，谁重谁的速度变化小
      if (knockE) shove(p, e, knockE * T.BIPED_KICK_SHOVE * f);
      if (knockP) shove(e, p, knockP * T.BIPED_KICK_SHOVE * f);
    } else if (closing > 0) {
      // 顶牛：按质量合成速度
      const v = (p.mass * p.vx + e.mass * e.vx) / (p.mass + e.mass);
      p.vx = v; e.vx = v;
    }
    // 分离，按质量分摊
    const ov = -gap;
    p.x -= ov * e.mass / (p.mass + e.mass);
    e.x += ov * p.mass / (p.mass + e.mass);
  }

  // a 把 t 往前推：动量守恒的一对冲量。dv 是两车一样重时各自的速度变化；
  // 质量不同时按质量反比分摊，重车的速度变化永远比轻车小（以前只推对方、还按比例截断，重车会被推得比轻车更远）
  function shove(a, t, dv) {
    dv = Math.min(dv, K.KNOCK_MAX);   // 击退封顶：一下撞不飞几十米
    if (a && a.events && dv > 0) a.events.knock++;
    const dir = isP(a) ? 1 : -1, sum = a.mass + t.mass;
    t.vx += dir * dv * 2 * a.mass / sum * (crouchStable(t) ? 0.5 * t.bipedParts.crouchStability : 1);
    a.vx -= dir * dv * 2 * t.mass / sum;
  }

  // 只在无画面模拟中读取的模块遥测；普通战斗不显示这些计数。
  function effect(s, id, key, value = 1) {
    if (!s || !id || !value) return;
    const e = s.effects[id] || (s.effects[id] = { active: 0, fire: 0, hit: 0, tether: 0, energy: 0, waterSaved: 0, dryCool: 0 });
    e[key] = (e[key] || 0) + value;
  }

  // 鱼叉牵引：按两车质量反比分摊收绳速度，一对目标速度的总动量为零。
  // 在 drive 积分前叠加，避免松手刹车吞掉牵引；货箱、车体碰撞和场地边界仍走原路径。
  function updateTether(s, o, dt) {
    const t = s.tether;
    if (!t) return;
    t.time -= dt;
    const target = o.v[t.layer] && o.v[t.layer][t.r] && o.v[t.layer][t.r][t.c];
    const dist = Math.abs(o.x - s.x);
    if (s.dead || o.dead || t.time <= 0 || dist > T.TETHER_MAX_DISTANCE || !target || !alive(target) || !alive(t.cell)) { s.tether = null; return; }
    if (dist > T.TETHER_PULL_DISTANCE) {
      const dir = Math.sign(o.x - s.x), sum = s.mass + o.mass;
      const speed = Math.min(M.harpoon.tether, T.TETHER_SPEED_MAX);
      s.tetherPullVx += dir * speed * 2 * o.mass / sum;
      o.tetherPullVx -= dir * speed * 2 * s.mass / sum;
    }
  }

  // 绳索抗拉上限按鱼叉实体的材料放大；负荷只取向外驾驶的当帧富余动力（kW）。
  // 超限比例按时间累计危险度，首次超载才抽指数阈值；未超载不改变随机序列。
  function overloadTether(s, o, dt) {
    const t = s.tether;
    if (!t) return;
    if (!tetherState(s)) { s.tether = null; return; }
    const dir = Math.sign(o.x - s.x);
    if (Math.abs(o.x - s.x) <= T.TETHER_PULL_DISTANCE) return;
    const outward = (side, away) => side.dir === away && side.speed > 0 && side.power > 0
      ? Math.max(0, side.driveAvailableKw - side.driveKw) : 0;
    const load = outward(s, -dir) + outward(o, dir);
    const strength = SA.mod(t.cell).tetherStrength;
    const rate = Math.max(0, load / strength - 1);
    // 动力预算浮点相减可能在恰好满载时残留极小误差，不为这种误差抽随机数。
    if (!(rate > 1e-12)) return;
    if (t.breakThreshold == null) t.breakThreshold = -Math.log(1 - random());
    t.overload = (t.overload || 0) + rate * dt;
    if (t.overload >= t.breakThreshold) s.tether = null;
  }

  // 蒸汽撞锤：贴身时周期性猛击
  function pistons(s, o, dt) {
    for (const k in s.punch) s.punch[k] = Math.max(0, s.punch[k] - dt * T.PISTON_DECAY);
    if (s.dead || o.dead || s.power <= 0 || !B.contact) return;
    for (const pc of s.pistons) {
      // 撞锤要在自己这几行的最前端，并且其中一行正顶着对方
      const pm = SA.modForVehicle(pc.cell, s.v);
      if (pm.knight && s.knightCooldown > 0) continue;
      const f = SA.fp(pc.cell.id);
      let row = -1;
      const mine = (isP(s) ? B.contactRows : B.contactRowsE) || [];
      for (let i = 0; i < f.h; i++) { const rr = pc.r + i, fr = rowFront(s, rr); if (mine.includes(rr) && (pm.knight === 'melee' || (fr && fr.cell === pc.cell))) row = rr; }
      if (!alive(pc.cell) || row < 0) continue;
      const key = `${pc.r},${pc.c}`;
      s.punchT[key] = (s.punchT[key] || 0) - dt;
      if (s.punchT[key] > 0) continue;
      s.punchT[key] = pm.punchCd;
      const tr = row + (isP(s) ? 1 : -1) * (B.rowShift || 0);   // 对方那边同一高度的行
      const tgt = tr >= 0 && tr < K.ROWS ? rowFrontAny(o, tr) : null;
      if (!tgt) continue;
      if (pm.knight) s.knightCooldown = pm.punchCd;
      const dc = tgt.c;
      s.punch[key] = 1;
      s.heat += pm.heat;
      meleeDamage(o, s, { layer: 'body', r: tgt.r, c: dc, hitR: tr }, SA.armorCut(SA.mod(tgt.cell), pm.punch));
      shove(s, o, pm.punchKnock || T.PISTON_SHOVE);   // 撞锤的推力同样是一对冲量：推重车时自己被弹开得更多
      const x = frontEdge(s), y = cellY(row, s) + HALF;
      for (let i = 0; i < 10; i++) emit('part', { type: 'steam', x: x, y: y, vx: rnd(-90, 90), vy: rnd(-120, -15), life: rnd(0.4, 0.8), col: undefined });
      B.shake = Math.max(B.shake, 4);
    }
  }

  // 双足动作状态与地形高度分开：yo 只跟坡，airHeight 只负责跳跃，避免 settle 吞掉位移。
  const crouchStable = s => s.chassisId === 'biped' && s.crouch >= 0.999 && !s.bipedLegDead && !s.bipedHipDead && !s.airDuration && !s.jumpCharge && Math.abs(s.vx) < 5;
  function canJump(s) {
    return s.chassisId === 'biped' && !s.dead && !s.bipedLegDead && !s.bipedHipDead && s.balance === '平衡'
      && s.loadKg <= s.load && s.bipedParts.spring.length > 0 && s.jumpCooldown <= 0 && !s.airDuration && !s.crouch && !s.crouchHeld;
  }
  function updateBiped(s, dt) {
    if (s.chassisId !== 'biped') return;
    s.jumpCooldown = Math.max(0, s.jumpCooldown - dt);
    if (!s.jumpHeld) s.jumpLatch = false;
    if (s.jumpHeld && !s.jumpLatch) {
      s.jumpLatch = true;
      if (canJump(s)) s.jumpCharge = 0.15;
    }
    if (s.jumpCharge > 0) {
      // 蓄力途中失去腿、胯或跳跃件会取消起跳，不能借上一帧缓存继续跳。
      if (s.bipedLegDead || s.bipedHipDead || !s.bipedParts.spring.length || s.balance !== '平衡' || s.loadKg > s.load) s.jumpCharge = 0;
      else {
        s.jumpCharge = Math.max(0, s.jumpCharge - dt);
        if (!s.jumpCharge) {
          const spring = s.bipedParts.spring[0].cell, ratio = clamp(s.loadKg / Math.max(1, s.load), 0, 1);
          // 蹬缸每跳需求 12kJ，供汽以 kW×0.15s 加上蓄压罐 kJ 表示；冷却储水不作汽库存。
          const steamNeed = 12, direct = Math.max(0, s.supply - s.equip) * 0.15;
          const stored = Math.min(s.store || 0, Math.max(0, steamNeed - direct));
          const gas = clamp((direct + stored) / steamNeed, 0, 1), power = clamp(s.power || 0, 0, 1);
          s.store = Math.max(0, (s.store || 0) - stored);
          s.jumpPeak = (24 + 96 * (1 - ratio)) * s.bipedParts.jumpHeight * (1 + ((spring.mt || 1) - 1) * 0.03) * gas * power;
          s.heat += steamNeed * gas;
          s.jumpCooldown = 3; s.crouch = 0;
          s.airDuration = s.jumpPeak > 0 ? 2 * Math.sqrt(2 * s.jumpPeak / K.GRAVITY) : 0;
          s.airTime = 0; s.events.jump = (s.events.jump || 0) + 1;
        }
      }
    }
    if (s.airDuration > 0) {
      s.airTime += dt;
      const u = clamp(s.airTime / s.airDuration, 0, 1);
      s.airHeight = 4 * s.jumpPeak * u * (1 - u); s.tuck = Math.sin(Math.PI * u);
      if (u >= 1) { s.airDuration = 0; s.airHeight = 0; s.tuck = 0; s.jolt = Math.max(s.jolt, 1); s.events.land = (s.events.land || 0) + 1; }
    }
    const want = !s.airDuration && (s.bipedLegDead || s.crouchHeld || s.jumpCharge > 0) ? 1 : 0;
    s.crouch = clamp(s.crouch + clamp(want - s.crouch, -dt / 0.25, dt / 0.25), 0, 1);
  }

  // ---------- 模拟 ----------
  function sim(s, o, dt) {
    if (s.dead) { drive(s, dt); return; }
    if (s.hold) s.holdSeconds += dt;
    if (s.fireHeld) s.fireHeldSeconds += dt;
    s.knightCooldown = Math.max(0, s.knightCooldown - dt);
    // 蓄压罐按秒充放：富余动力存入，短缺时按 STORE_RELEASE_PER_SEC 限制释放。
    // 每帧按剩水重算质量；锅炉供能不受冷却储水限制。
    s.mass = Math.max(T.MASS_MIN_TONS, (s.dryKg + s.water) / 1000);
    if (s.chassisId === 'biped') s.loadKg = s.dryLoadKg + s.water;
    s.driveKw = SA.Phys.driveKw(s.mass * 1000, s.speed);
    s.demand = s.equip + s.driveKw;
    const baseSupply = s.supply;
    const surplus = Math.max(0, baseSupply - s.demand);
    let chargeKw = 0;
    if (s.storeMax > 0) {
      chargeKw = Math.min(surplus, (s.storeMax - s.store) / Math.max(dt, 1e-9));
      s.store = clamp(s.store + chargeKw * dt, 0, s.storeMax);
      if (chargeKw > 0) SA.V.each(s.v, cell => { if (alive(cell) && SA.mod(cell).store) effect(s, cell.id, 'energy', chargeKw * dt); });
    }
    const release = s.storeMax > 0 && baseSupply < s.demand ? Math.min(T.STORE_RELEASE_PER_SEC, s.store / Math.max(dt, 1e-6), s.demand - baseSupply) : 0;
    s.driveRelease = release; s.driveDt = dt;
    if (release > 0) {
      s.store = Math.max(0, s.store - release * dt);
      SA.V.each(s.v, cell => { if (alive(cell) && (SA.mod(cell).store || 0)) effect(s, cell.id, 'energy', release * dt); });
    }
    const availableSupply = baseSupply + release;
    const util = availableSupply ? Math.min(1, s.demand / availableSupply) : 0;
    s.power = availableSupply <= 0 ? 0 : s.demand ? Math.min(1, availableSupply / s.demand) : 1;
    s.driveAvailableKw = Math.max(0, availableSupply - s.equip);
    // 装甲罚速由 refresh 缓存；模块损毁会调用 refresh，下一帧即可解除已失去的端部装甲罚速。
    s.speedMul = (s.driveKw ? Math.min(s.speedBoost || K.SPEED_BOOST, s.driveAvailableKw / s.driveKw) : 0) * s.armorSpeedFactor;
    updateBiped(s, dt);
    drive(s, dt);
    const result = SA.Phys.thermalStep(s.heat, s.water, dt, {
      shaftKw: Math.min(baseSupply, Math.max(0, s.demand - release) + chargeKw),
      heatKw: s.heatRate * s.heatMul * Math.max(T.UTIL_MIN, util), weaponKw: 0,
      cool: s.cool, dryCool: s.dryCool, waterSave: s.waterSave, capacity: s.heatCapacity,
    });
    s.heat = result.heat; s.water = result.water;
    const saved = result.cooled / SA.Phys.LATENT_KJ_L * (1 - s.waterSave);
    if (saved > 0) SA.V.each(s.v, cell => { if (alive(cell) && SA.mod(cell).waterSave) effect(s, cell.id, 'waterSaved', saved); });
    if (s.dryCool > 0) SA.V.each(s.v, cell => { if (alive(cell) && SA.mod(cell).dryCool) effect(s, cell.id, 'dryCool', result.passive * SA.mod(cell).dryCool / (K.DISSIPATE + s.dryCool)); });
    s.maxHeat = Math.max(s.maxHeat, s.heat);
    s.minWater = Math.min(s.minWater, s.water);
    markTelemetry(s);
    if (s.heat >= s.heatMax) { kill(s, SA.Config.text("battle_39f68a635696")); return; }
    const aimPt = isHuman(s) ? B.aim : aiAimPoint(s, o);
    const aiming = s.fireHeld && aimPt && s.power > 0 && !s.hold && !o.dead;
    // 玩家松开按键的这一帧也算开火（提前松手 = 用当前稳定度打出去）
    const firing = aiming || (isHuman(s) && s.release && aimPt && s.power > 0 && !o.dead);
    const at = firing ? targetAt(o, aimPt[0], aimPt[1]) : null;
    const side = !!at && at.layer === 'side';
    if (firing) {
      markTelemetry(s);
    }
    // 瞄准稳定度：按住就慢慢蓄满（准星收紧、散布缩小），车身晃动会拖慢蓄力并不断把它抖散
    const selW = s.weapons.find(w => w.cell.id === s.sel && !w.blocked);
    const shake = shakeOf(s);
    if (aiming) s.focus += dt * s.aimSpeed / (selW ? selW.m.aimT : 1) / (1 + shake);
    s.focus = clamp(s.focus - dt * (aiming ? shake * T.FOCUS_SHAKE_DECAY : T.FOCUS_IDLE_DECAY), 0, 1);
    // 扳机延迟（AI 用）：按住开火后要等一小会儿才打出第一发；换武器组重新计时
    if (s.sel !== s.lastSel) { s.lastSel = s.sel; s.heldT = 0; s.focus = 0; }
    s.heldT = aiming ? s.heldT + dt : 0;
    // 玩家：稳定度蓄满（绿光）自动开火，或者松手立刻开火
    // 快枪（机枪）：按住装好就打，不用等蓄满；稳定度照样影响散布，每发后坐会把它震掉一些
    const ready = (w) => (isHuman(s) ? s.focus >= 1 || s.release || w.m.reload < K.FAST_RELOAD : s.heldT >= w.m.windup);
    // 多出来的驾驶员：每人接管一组「当前没在手操」的武器，自己挑目标开火（枪法比玩家差）
    const crew = SA.V.crewPlan(s.weapons, s.drivers, s.sel);
    s.coGroups = crew.autoGroups;
    const coPt = s.coGroups.length && !o.dead && s.power > 0 && !s.hold ? copilotAim(s, o, dt) : null;
    const coAt = coPt ? targetAt(o, coPt[0], coPt[1]) : null;
    // 每名驾驶员只装一门；优先接近完成的炮，同进度随机挑选以免实体顺序固定优先权。
    const waiting = s.weapons.filter(w => s.timers[w.key] > 0);
    for (let i = 0; i < crew.loaders && waiting.length; i++) {
      let best = -1, chosen = -1, ties = 0;
      for (let j = 0; j < waiting.length; j++) {
        const progress = reloadProgress(s, waiting[j]);
        if (progress > best) { best = progress; chosen = j; ties = 1; }
        else if (progress === best && random() < 1 / ++ties) chosen = j;
      }
      const [w] = waiting.splice(chosen, 1);
      s.timers[w.key] -= dt * s.power;
    }
    const again = rnd(T.SALVO_FACTOR_MIN, T.SALVO_FACTOR_MAX);
    for (const w of s.weapons) {
      if (w.blocked) continue;
      const mine = w.cell.id === s.sel, co = !mine && s.coGroups.includes(w.cell.id);
      const pt = co ? coPt : aimPt;
      // 炮管以有限角速度转向瞄准点
      const cur = barrel(s, w), want = pt ? aimAngle(s, w, pt[0], pt[1]).a : cur;
      s.elev[w.key] = cur + clamp(want - cur, -w.m.slew * dt, w.m.slew * dt);
      if (s.timers[w.key] > 0) continue;
      if (mine) {
        if (firing && ready(w) && indirectReady(s, w, aimPt, dt)) { fire(s, o, w, side); s.timers[w.key] = s.reloadTotals[w.key] = w.m.reload * again; s.kick = w.m.reload < K.FAST_RELOAD ? K.FOCUS_KICK_FAST : K.FOCUS_KICK; }
        else s.timers[w.key] = 0;
      } else if (co && coPt && Math.abs(want - cur) < T.AIM_TURN_THRESHOLD && indirectReady(s, w, coPt, dt)) { fire(s, o, w, !!coAt && coAt.layer === 'side', T.COPILOT_FOCUS); s.timers[w.key] = s.reloadTotals[w.key] = w.m.reload * rnd(T.COPILOT_RELOAD_FACTOR_MIN, T.COPILOT_RELOAD_FACTOR_MAX); }
      else s.timers[w.key] = 0;
    }
    if (s.kick) { s.focus *= s.kick; s.kick = 0; }   // 后坐力把准星震开（快枪只震掉一点）
    s.release = false;
    s.smokeT -= dt;
    if (s.smokeT <= 0) {
      s.smokeT = 0.45 - Math.min(0.35, s.heat / 280);
      SA.V.each(s.v, (cell, r, c, layer) => {
        if (layer !== 'body' || !alive(cell)) return;
        if (cell.id === 'boiler') emit('part', { type: 'steam', x: modBox(s, r, c, cell.id).x0 + (isP(s) ? 37 : 11), y: cellY(r, s), vx: rnd(-12, 12), vy: rnd(-66, -36), life: rnd(0.8, 1.4), col: undefined });
        if (cell.hp / SA.V.maxHp(cell) < 0.34 && random() < 0.5) emit('part', { type: 'smoke', x: modCenter(s, layer, r, c)[0], y: cellY(r, s) + 12, vx: rnd(-12, 12), vy: -42, life: 1.2, col: undefined });
      });
    }
  }

  // ---------- AI ----------
  function aiAimPoint(s, o) {
    const t = s.target;
    if (!t) return null;
    const [x, y] = modCenter(o, t.layer, t.r, t.c);
    return [x + s.err.x, y + s.err.y];
  }
  // 按权重随机挑一个敌方模块当目标：武器、驾驶舱、锅炉优先
  function pickTarget(o, uniform = false) {
    const cands = [];
    SA.V.each(o.v, (cell, r, c, layer) => {
      if (!alive(cell)) return;
      const id = cell.id;
      const w = uniform ? 1 : layer === 'side' ? T.AI_TARGET_WEIGHTS.side : M[id].dmg ? T.AI_TARGET_WEIGHTS.weapon : SA.isCockpit(id) ? T.AI_TARGET_WEIGHTS.cockpit : M[id].supply ? T.AI_TARGET_WEIGHTS.boiler : M[id].water ? T.AI_TARGET_WEIGHTS.water : M[id].layer === 'chassis' ? T.AI_TARGET_WEIGHTS.chassis : T.AI_TARGET_WEIGHTS.other;
      cands.push({ w, t: { layer, r, c } });
    });
    let x = random() * cands.reduce((a, b) => a + b.w, 0);
    for (const cnd of cands) { x -= cnd.w; if (x <= 0) return cnd.t; }
    return null;
  }
  // 其他驾驶员的瞄准点：自己挑目标，几秒换一次，带固定的手抖误差
  function copilotAim(s, o, dt) {
    const co = s.co;
    co.retarget -= dt;
    if (!co.target || !alive(o.v[co.target.layer][co.target.r][co.target.c]) || co.retarget <= 0) {
      co.target = pickTarget(o);
      co.err = { x: gauss() * T.AI_COPILOT_ERROR_X, y: gauss() * T.AI_COPILOT_ERROR_Y };
      co.retarget = rnd(T.AI_RETARGET_MIN, T.AI_RETARGET_MAX);
    }
    if (!co.target) return null;
    const [x, y] = modCenter(o, co.target.layer, co.target.r, co.target.c);
    return [x + co.err.x, y + co.err.y];
  }
  const canMelee = (s) => s.rams > 0 || s.pistons.some(pc => M[pc.cell.id].knight === 'melee') || (s.chassisId === 'biped' && s.balance === '平衡' && !s.bipedLegDead && s.speed > 0);
  // 定点性格只比较存活模块；侧挂武器仍按武器本身的伤害与装填评价。
  function priorityTarget(s, o, style, w) {
    const cands = [];
    let obstruction = null;
    SA.V.each(o.v, (cell, r, c, layer) => {
      if (!alive(cell)) return;
      const m = SA.mod(cell), weapon = !!m.dmg, cockpit = SA.isCockpit(cell.id), boiler = !!m.supply;
      let score = style === 'sniper' ? weapon ? 100 + m.dmg / Math.max(0.4, m.reload || 1) : cockpit ? 20 : 1
        : style === 'assassin' ? cockpit ? 200 : weapon ? 25 : 1
        : boiler && o.supply > o.startSupply * 0.5 ? 200 : weapon ? 70 + m.dmg / Math.max(0.4, m.reload || 1) : cockpit ? 50 : 1;
      const pt = modCenter(o, layer, r, c);
      if (w) {
        const a = aimAngle(s, w, pt[0], pt[1]);
        if (a.behind || !a.reach || a.over) score = 0;
        else {
          const hit = predict(s, o, w, a.a, layer === 'side').hit;
          if (!hit || hit.layer !== layer || hit.r !== r || hit.c !== c) {
            if (hit && !obstruction) obstruction = { layer: hit.layer, r: hit.r, c: hit.c };
            score = 0;
          }
        }
      }
      cands.push({ t: { layer, r, c }, score });
    });
    cands.sort((a, b) => b.score - a.score);
    return { target: cands[0]?.score > 0 ? cands[0].t : obstruction || cands[0]?.t || null, score: cands[0]?.score || 0 };
  }
  // 对可见来弹采样短时弹道，比较刹停、前进和后退后的受击帧数。
  function evadeAction(s, o) {
    const shots = B.shots.filter(sh => sh.from === o && sh.to === s && sh.delay <= 0 && !sh.done);
    if (!shots.length) return null;
    if (s.chassisId === 'biped') {
      // 蹲跳只应对直射；高抛和间接火力继续进入下方的横向规避评分。
      for (const sh of shots.filter(sh => sh.weapon?.arc !== 'high' && !sh.weapon?.indirect)) for (let t = 0.2; t <= 0.7; t += 0.05) {
        const x = sh.x + sh.vx * t, y = sh.y + sh.vy * t + sh.g * t * t / 2;
        const hit = targetAt(s, x - s.vx * t, y);
        if (!hit) continue;
        if ((hit.zone === 'leg' || hit.r >= bipedLegStart(s)) && canJump(s)) return { dir: 0, jump: true };
        if (hit.zone !== 'leg' && !s.airDuration) return { dir: 0, crouch: true };
      }
    }
    const risks = [0, -1, 1].map(dir => {
      let hits = 0, clearance = 0;
      for (const sh of shots) for (let t = 0.15; t <= 1.2; t += 0.1) {
        const x = sh.x + sh.vx * t, y = sh.y + sh.vy * t + sh.g * t * t / 2;
        if (y < VY - 180 || y > groundAt(s.x + VW / 2) + 20) continue;
        const carX = s.x + VW / 2 + s.vx * t + dir * Math.min(80, s.speed * s.statMultipliers.speed * t * t * 0.35);
        const dist = Math.abs(x - carX);
        if (dist < 110) hits++;
        clearance += Math.min(200, dist);
      }
      return { dir, hits, clearance };
    });
    if (!risks[0].hits) return null;
    risks.sort((a, b) => a.hits - b.hits || b.clearance - a.clearance);
    return risks[0].dir;
  }
  function ai(s, o, dt) {
    if (s.dead) return;
    const profile = s.aiProfile || {};
    const heatHigh = Number.isFinite(profile.heatHoldHigh) ? profile.heatHoldHigh / 100 : T.AI_HEAT_HIGH;
    const heatLow = Number.isFinite(profile.heatHoldLow) ? profile.heatHoldLow / 100 : T.AI_HEAT_LOW;
    if (s.heat / s.heatMax > heatHigh) s.hold = true; else if (s.heat / s.heatMax < heatLow) s.hold = false;
    s.retarget -= dt;
    // 鱼叉发射后立即让出单驾驶员的主控位；连接期间不等待鱼叉装填再换炮。
    if (s.sel === 'harpoon' && (s.tether || !s.weapons.some(w => w.cell.id === 'harpoon' && !w.blocked && alive(w.cell) && !(s.timers[w.key] > 0)))) s.retarget = 0;
    const style = normalizeAiStyle(s.style);
    if (s.chassisId === 'biped') { s.crouchHeld = false; s.jumpHeld = false; }
    const tAlive = s.target && alive(o.v[s.target.layer]?.[s.target.r]?.[s.target.c]);
    if (!tAlive || s.retarget <= 0) {
      const precise = ['sniper', 'assassin', 'disruptor'].includes(style);
      const available = s.weapons.filter(w => !w.blocked && alive(w.cell) && (w.cell.id !== 'harpoon' || (!s.tether && !(s.timers[w.key] > 0))));
      const ranked = precise ? available.filter(w => w.cell.id !== 'harpoon').sort((a, b) => (b.m.dmg || 0) / Math.max(0.4, b.m.reload || 1) - (a.m.dmg || 0) / Math.max(0.4, a.m.reload || 1)) : [];
      let best = ranked[0], choice = precise ? priorityTarget(s, o, style, best) : null;
      // 首选炮没有有效射线时，再试其他已存活武器；始终以实际选中的炮评估目标。
      for (const w of ranked.slice(1)) {
        if (choice.score > 0) break;
        const alt = priorityTarget(s, o, style, w);
        if (alt.score > 0) { best = w; choice = alt; }
      }
      s.target = precise ? choice.target : pickTarget(o, style === 'clumsy');
      // 控制武器不按低伤害 DPS 排到最后：只在正常重选时寻找真实可达的收绳机会。
      // priorityTarget 同时检查射界、地形和实际命中模块，装填中或已有绳索不抢主炮。
      // 弹道能命中但中心距超过绳索长度时不能控制目标，不为无效连接占主控位。
      for (const w of available.filter(w => w.cell.id === 'harpoon' && Math.abs(o.x - s.x) <= T.TETHER_MAX_DISTANCE)) {
        const hook = priorityTarget(s, o, style, w);
        if (hook.score > 0) { best = w; s.target = hook.target; break; }
      }
      if (B.aiStats && s.target) {
        const id = o.v[s.target.layer][s.target.r][s.target.c].id, m = M[id];
        const kind = m.dmg ? 'weapon' : SA.isCockpit(id) ? 'cockpit' : m.supply ? 'boiler' : 'other';
        const targets = B.aiStats[isP(s) ? 'p' : 'e'].targets;
        targets[kind] = (targets[kind] || 0) + 1;
      }
      const e = (1 - s.aim) * T.AI_ERROR_SCALE + T.AI_ERROR_BIAS;
      s.err = { x: gauss() * e, y: gauss() * e * T.AI_ERROR_Y_SCALE };
      s.retarget = (['sniper', 'assassin', 'disruptor'].includes(style) ? 1.3 : rnd(T.AI_RETARGET_MIN, T.AI_RETARGET_MAX)) * (Number.isFinite(profile.retargetFactor) ? profile.retargetFactor : 1);
      // 选武器组：直射打得到就直射，否则换高抛
      const groups = s.groups.filter(id => id !== 'harpoon' && available.some(w => w.cell.id === id));
      s.sel = best?.cell.id || groups[Math.floor(random() * groups.length)] || null;
      if (s.sel !== 'harpoon' && s.target && s.target.layer === 'body' && s.groups.some(id => s.weapons.some(x => x.cell.id === id && x.m.indirect))) {
        const w = s.weapons.find(x => !x.blocked && !x.m.indirect && (x.cell.id === 'cannon' || x.cell.id === 'cannon_m' || x.cell.id === 'cannon_s' || x.cell.id === 'cannon_heavy'));
        const pt = aiAimPoint(s, o);
        const pr = w && predict(s, o, w, aimAngle(s, w, pt[0], pt[1]).a, false);
        if (!pr || !pr.hit || pr.hit.c !== s.target.c || pr.hit.r !== s.target.r) s.sel = s.groups.find(id => s.weapons.some(x => x.cell.id === id && x.m.indirect && !x.blocked));
      }
    }
    if (style === 'rookie') {
      // 教学新手的时序和远近驾驶权重来自配置；随机调用顺序保持不变，确保回放可复现。
      if (!s.rookie) s.rookie = { fireT: rnd(...T.AI_ROOKIE_FIRE_START), firing: false, driveT: rnd(...T.AI_ROOKIE_DRIVE_START) };
      const novice = s.rookie;
      novice.fireT -= dt;
      if (novice.fireT <= 0) {
        novice.firing = !novice.firing;
        novice.fireT = novice.firing ? rnd(...T.AI_ROOKIE_FIRE_ON) : rnd(...T.AI_ROOKIE_FIRE_OFF);
      }
      s.fireHeld = !!s.target && novice.firing;
      novice.driveT -= dt;
      if (novice.driveT <= 0) {
        // 远处会慌忙追近；贴近后乱踩油门和倒车，避免退远后把教学战拖到锅炉烧干。
        const fwd = isP(s) ? 1 : -1;
        const gap = fwd * (frontEdge(o) - frontEdge(s));
        const choices = (gap > T.AI_ROOKIE_FAR_GAP ? T.AI_ROOKIE_FAR_DIRS : T.AI_ROOKIE_NEAR_DIRS).map(dir => dir === 0 ? 0 : dir * fwd);
        s.dir = choices[Math.floor(random() * choices.length)];
        novice.driveT = s.dir === -fwd ? rnd(...T.AI_ROOKIE_DRIVE_BACK) : rnd(...T.AI_ROOKIE_DRIVE_OTHER);
      }
      if (B.aiStats) {
        const st = B.aiStats[isP(s) ? 'p' : 'e'], fwd = isP(s) ? 1 : -1;
        if (s.fireHeld) st.fireIntent += dt;
        if (s.dir === fwd) st.advance += dt;
        if (s.dir === -fwd) st.retreat += dt;
      }
      return;
    }
    s.fireHeld = !!s.target;
    // 移动：按性格来。默认 = 有撞击武器就周期性冲撞，否则在交战距离内游走；
    // rush 冲锋：几乎一直在冲，退也只退一小段助跑；kite 放风筝：保持远距离，很少冲撞；turtle 龟缩：守在出发点附近
    const rushMelee = style === 'rush' && canMelee(s);
    const pureMeleeRush = rushMelee && s.weapons.length === 0;
    // 混合武装在火力段失去最后一门炮时，立即改用近战短撤步节奏。
    if (pureMeleeRush && !s.charge) s.moveT = Math.min(s.moveT, T.AI_CONTACT_MOVE_TIME);
    s.moveT -= dt;
    if (s.moveT <= 0) {
      const sty = style;
      // 未接触前持续冲锋；纯近战可继续顶推，混合武装接触后必定转入火力段。
      s.charge = canMelee(s) && sty !== 'turtle' && (sty === 'rush' ? !s.charge || !B.contact || (pureMeleeRush && random() < T.AI_CHARGE_RUSH_CHANCE) : !s.charge && random() < (sty === 'kite' ? T.AI_CHARGE_KITE_CHANCE : T.AI_CHARGE_DEFAULT_CHANCE));
      const [lo, hi] = sty === 'kite' ? T.AI_MOVE_RANGE_KITE : sty === 'rush' ? T.AI_MOVE_RANGE_RUSH : T.AI_MOVE_RANGE_DEFAULT;
      const fwd = isP(s) ? 1 : -1, gap = fwd * (frontEdge(o) - frontEdge(s));   // 两车车头之间的距离
      s.goalX = sty === 'turtle' ? s.homeX + rnd(-T.AI_TURTLE_OFFSET, T.AI_TURTLE_OFFSET) : s.x + fwd * (gap - rnd(lo, hi));
      s.moveT = s.charge ? rnd(T.AI_CHARGE_TIME[0], T.AI_CHARGE_TIME[1]) : pureMeleeRush ? T.AI_CONTACT_MOVE_TIME : rnd(T.AI_MOVE_TIME[0], T.AI_MOVE_TIME[1]) * (s.speed * s.statMultipliers.speed > T.AI_FAST_SPEED ? T.AI_FAST_MOVE_FACTOR : 1);
    }
    const selected = s.weapons.find(w => w.cell.id === s.sel && !w.blocked);
    // 高抛炮只对超出有效射界或炮口后方的目标后退；前方近点可竖直高抛。
    // 远到弹道不可达或压不低时前进；进入射界后仍按原性格移动。
    const aimPt = selected && selected.m.indirect ? aiAimPoint(s, o) : null;
    const lob = aimPt ? aimAngle(s, selected, aimPt[0], aimPt[1]) : null;
    const fwd = isP(s) ? 1 : -1;
    const gapNow = selected && selected.m.range ? Math.abs(frontEdge(o) - frontEdge(s)) : 0;
    // 冲锋阶段优先接敌；纯近战火力段改成定向短撤步，混合武装沿用原站位开火。
    if (rushMelee && (s.charge || pureMeleeRush)) { s.dir = s.charge ? fwd : -fwd; if (s.charge && B.contact && Math.abs(s.vx) < T.AI_CONTACT_SPEED) s.moveT = Math.min(s.moveT, T.AI_CONTACT_MOVE_TIME); }
    else if (lob && (lob.behind || lob.over === 'high')) s.dir = -fwd;
    else if (lob && (!lob.reach || lob.over === 'low')) s.dir = fwd;
    else if (selected && selected.m.range && gapNow > selected.m.range * T.AI_RANGE_MARGIN) s.dir = fwd;
    else if (s.charge) { s.dir = isP(s) ? 1 : -1; if (B.contact && Math.abs(s.vx) < T.AI_CONTACT_SPEED) s.moveT = Math.min(s.moveT, T.AI_CONTACT_MOVE_TIME); }
    else s.dir = Math.abs(s.goalX - s.x) > T.AI_GOAL_EPSILON ? Math.sign(s.goalX - s.x) : 0;
    const gap = Math.abs(frontEdge(o) - frontEdge(s));
    const main = selected || s.weapons.find(w => !w.blocked);
    const usefulRange = clamp((main?.m.range || 650) * 0.65, 180, 650);
    if (style === 'rush') {
      // 近战被拆掉后也持续贴近炮战；接触时有近战则顶压。
      if (pureMeleeRush && !s.charge) s.dir = -fwd;
      else if (canMelee(s) && s.charge) s.dir = fwd;
      else if (!canMelee(s) && gap > 190) s.dir = fwd;
      else if (gap < 90 && !canMelee(s)) s.dir = -fwd;
    } else if (style === 'kite') {
      // 距离由当前可用主武器决定，射界失效时优先回到可射位置。
      if (lob && (!lob.reach || lob.over === 'low')) s.dir = fwd;
      else if (gap > usefulRange + 70) s.dir = fwd;
      else if (gap < usefulRange - 70 && Math.abs(s.x - s.homeX) < 320 && (!B.bounds || (s.x > B.bounds.left + 70 && s.x + VW < B.bounds.right - 70))) s.dir = -fwd;
      else s.dir = 0;
    } else if (style === 'turtle') {
      // 预测射线被地形或其他模块挡住时允许有限位移寻找射界。
      const pt = main && aiAimPoint(s, o), a = pt && aimAngle(s, main, pt[0], pt[1]);
      const hit = a && predict(s, o, main, a.a, s.target?.layer === 'side').hit;
      if (main && (!a?.reach || a.over || !hit) && gap > 100) s.dir = fwd;
      if (Math.abs(s.x - s.homeX) > 110) s.dir = Math.sign(s.homeX - s.x);
    } else if (style === 'sniper' || style === 'assassin') {
      // 稳车使散布收紧，但两秒内仍必须寻找并抓住开火窗口。
      if (gap > usefulRange) s.dir = fwd;
      else if (Math.abs(s.vx) > 45) s.dir = -Math.sign(s.vx);
      else s.dir = 0;
      s.aimWait = (s.aimWait || 0) + dt;
      s.fireHeld = !!s.target && (Math.abs(s.vx) < 65 || s.aimWait > 2);
      if (s.lastMainFireAt != null && s.lastMainFireAt !== s.aimLastFire) { s.aimWait = 0; s.aimLastFire = s.lastMainFireAt; }
    } else if (style === 'disruptor') {
      if (gap > usefulRange * 0.85) s.dir = fwd;
      else if (gap < 170) s.dir = -fwd;
      else s.dir = 0;
    } else if (style === 'evade') {
      const dodge = evadeAction(s, o);
      if (dodge !== null && B.t >= (s.evadeUntil || 0) && (s.evadeReact || 0) <= 0) {
        s.evadeReact = 0.2;
        s.evadeDir = typeof dodge === 'object' ? dodge.dir : dodge;
        s.evadePose = typeof dodge === 'object' ? dodge : null;
      }
      if (s.evadeReact > 0) {
        s.evadeReact -= dt;
        if (s.evadeReact <= 0) s.evadeUntil = B.t + 0.8;
      }
      if (B.t < (s.evadeUntil || 0)) { s.dir = s.evadeDir; if (s.evadePose) { s.crouchHeld = !!s.evadePose.crouch; s.jumpHeld = !!s.evadePose.jump; } }
    } else if (style === 'counter') {
      // 未观察到发射时照常交战；观察到后利用短暂空当进攻，不读取对方装填表。
      const elapsed = B.t - (o.lastMainFireAt ?? -Infinity);
      const opening = clamp((o.lastMainReload || 1) * 0.8, 0.6, 2.2);
      if (elapsed >= 0 && elapsed <= 0.25 && opening > 0.8) s.fireHeld = false;
      else if (elapsed > 0.25 && elapsed < opening) { s.dir = fwd; s.fireHeld = !!s.target; }
      else if (gap < usefulRange * 0.75) s.dir = -fwd;
    } else if (style === 'burst') {
      const state = s.burst || (s.burst = { phase: 'ready', until: B.t + 1.5 });
      const armed = s.weapons.filter(w => !w.blocked && w.cell.id === s.sel);
      const rapid = armed.some(w => w.m.reload < 1.2);
      if (state.phase === 'ready' && (armed.length && armed.every(w => (s.timers[w.key] || 0) <= 0) || B.t >= state.until)) { state.phase = 'burst'; state.started = B.t; state.until = B.t + (rapid ? 3.4 : 2.3); }
      if (state.phase === 'burst' && (B.t >= state.until || s.heat / s.heatMax > 0.97 && B.t - state.started > 0.8)) {
        state.phase = 'cool'; state.until = B.t + (rapid ? s.heat / s.heatMax > 0.8 ? 0.65 : 0.2 : 0.55);
      }
      if (state.phase === 'cool' && (B.t >= state.until || rapid && s.heat / s.heatMax < 0.65 && armed.every(w => (s.timers[w.key] || 0) <= 0) && B.t - (s.lastMainFireAt ?? -Infinity) > 0.2)) { state.phase = 'ready'; state.until = B.t + 1.5; }
      s.fireHeld = !!s.target && state.phase === 'burst';
      if (state.phase === 'cool') s.dir = gap < 220 ? -fwd : 0;
    } else if (style === 'veteran') {
      // 与超时判定使用同一伤害/耐久比例；临近超时或落后时主动缩短距离。
      const mine = s.dealt / Math.max(1, o.startHp) * T.SCORE_DAMAGE_WEIGHT + hpFrac(s) * T.SCORE_HP_WEIGHT;
      const theirs = o.dealt / Math.max(1, s.startHp) * T.SCORE_DAMAGE_WEIGHT + hpFrac(o) * T.SCORE_HP_WEIGHT;
      const urgent = mine < theirs + 0.025 || K.BATTLE_TIME - B.t < 18;
      if (urgent || hpFrac(o) < 0.2) s.dir = gap > 130 ? fwd : 0;
      else if (gap < usefulRange * 0.8) s.dir = -fwd;
      else if (gap > usefulRange) s.dir = fwd;
      else s.dir = 0;
    } else if (style === 'clumsy') {
      // 武器手生会在装好后错过一小段窗口，随后照正常炮管、弹道和热量规则开火。
      if (!s.clumsy) s.clumsy = { firing: false, until: B.t + 0.9 };
      if (B.t >= s.clumsy.until) {
        s.clumsy.firing = !s.clumsy.firing;
        s.clumsy.until = B.t + (s.clumsy.firing ? 1.1 : 0.8);
      }
      s.fireHeld = !!s.target && s.clumsy.firing;
    } else if (style === 'misjudge') {
      // 驾驶者交替误认为应该贴脸或远退；短暂修正时仍会向有效射程回归。
      if (!s.misjudge) s.misjudge = { phase: 0, until: B.t + 3.8 };
      if (B.t >= s.misjudge.until) { s.misjudge.phase = (s.misjudge.phase + 1) % 3; s.misjudge.until = B.t + (s.misjudge.phase === 2 ? 0.9 : 3.8); }
      const desired = s.misjudge.phase === 0 ? (main?.m.indirect ? 35 : 95) : s.misjudge.phase === 1 ? Math.min(1000, (main?.m.range || 650) * 1.15) : usefulRange;
      s.dir = gap > desired + 50 ? fwd : gap < desired - 50 ? -fwd : 0;
      // 错误的距离信念同时影响开火时机；短暂纠正期仍可照常交战。
      s.fireHeld = !!s.target && (s.misjudge.phase === 2 || Math.abs(gap - desired) < 130);
    } else if (style === 'hesitant') {
      // 观察与行动分段，观察期结束必定恢复交战，避免永久停火。
      if (!s.hesitant) s.hesitant = { acting: false, until: B.t + 1.3 };
      if (B.t >= s.hesitant.until) {
        s.hesitant.acting = !s.hesitant.acting;
        s.hesitant.until = B.t + (s.hesitant.acting ? 2.4 : 1.3);
      }
      if (!s.hesitant.acting) { s.dir = 0; s.fireHeld = false; }
    }
    if (s.chassisId === 'biped') {
      if (style === 'turtle' && !s.dir) s.crouchHeld = true;
      if (style === 'rush' && gap > 100 && gap < 350 && s.dir === fwd && canJump(s)) s.jumpHeld = true;
    }
    if (B.aiStats) {
      const st = B.aiStats[isP(s) ? 'p' : 'e'];
      if (s.fireHeld) st.fireIntent += dt;
      if (s.dir === fwd) st.advance += dt;
      if (s.dir === -fwd) st.retreat += dt;
      if (style === 'evade' && B.t < (s.evadeUntil || 0)) st.evade += dt;
      if (style === 'counter' && B.t - (o.lastMainFireAt ?? -Infinity) < 2.2) st.counter += dt;
      if (style === 'burst' && s.burst?.phase === 'burst') st.burst += dt;
      if (style === 'veteran' && (s.dealt / Math.max(1, o.startHp) < o.dealt / Math.max(1, s.startHp) || K.BATTLE_TIME - B.t < 18)) st.chase += dt;
    }
  }

  // 失去战斗力：没有动力（锅炉全毁），或者没有能开火的武器。返回原因，否则为 null
  function crippled(s) {
    if (s.supply <= 0) return SA.Config.text("battle_e35b14a75262");
    if (!s.weapons.some(w => !w.blocked)) return SA.Config.text("battle_3992a84f4604");
    return null;
  }
  // 彻底没法打：开不了火，也撞不了人（有撞击件、有动力、能开动就还算能打）
  const helpless = (s) => !!crippled(s) && !(canMelee(s) && s.supply > 0);

  // 投降：条件持续 1 秒后暂停战斗；支持新接口的画面先演升旗，再询问接受或拒绝。
  // 只有对手会投降（玩家没了武器还能等对手烧干）；无画面模拟里视为玩家接受投降
  // 剩余耐久比例（含已损毁的模块）
  const hpFrac = (s) => { let a = 0, m = 0; SA.V.each(s.v, (cell) => { a += Math.max(0, cell.hp); m += SA.V.maxHp(cell); }); return a / Math.max(1, m); };
  // 对手想不想投降：返回理由，否则 null。耐久阈值和比较倍数由 T.SURRENDER_* 统一控制。
  // Boss 有骨气：只有 ① 才投降
  function quitReason(e, p) {
    if (helpless(e)) return crippled(e);
    if (e.boss) return null;
    const fe = hpFrac(e);
    if (crippled(e) && fe < T.SURRENDER_CRIPPLED_HP) return SA.Config.text("battle_92c305567d28", `${crippled(e)}`);
    if (fe < T.SURRENDER_LOW_HP && hpFrac(p) >= fe * T.SURRENDER_HP_MULTIPLIER) return SA.Config.text("battle_c1e99faef1e7");
    return null;
  }

  // 鱼叉缆绳两端的实时世界坐标；目标模块中心随镜像、移动和坡地倾斜更新。
  // 查询不修改牵引状态、不消耗随机数，画面和检查脚本可在任意帧重复读取。
  function tetherState(s) {
    if (!B) return null;
    if (typeof s === 'string') s = s === 'e' ? B.e : B.p;
    s = s || B.p;
    const t = s.tether, o = t && t.target;
    if (!t || !o || s.dead || o.dead || t.time <= 0 || Math.abs(o.x - s.x) > T.TETHER_MAX_DISTANCE) return null;
    const target = o.v[t.layer] && o.v[t.layer][t.r] && o.v[t.layer][t.r][t.c];
    const w = s.weapons.find(item => item.cell === t.cell);
    if (!w || !alive(t.cell) || !alive(target)) return null;
    return { cell: t.cell, from: muzzle(s, w), to: modCenter(o, t.layer, t.r, t.c), remaining: t.time,
      target: { layer: t.layer, r: t.r, c: t.c } };
  }

  // 在残存模块的顶边中点中取最高处；敌车镜像和坡角都沿用真实战斗坐标。
  // 锚点同时保留模块位置，画面层可按造型补充像素偏移，不必改变规则状态。
  function surrenderAnchor(s) {
    let top = null;
    SA.V.each(s.v, (cell, r, c, layer) => {
      if (!alive(cell)) return;
      const f = SA.fp(cell.id), x0 = isP(s) ? cellX(s, c) : cellX(s, c + f.w - 1);
      const [x, y] = toWorld(s, x0 + f.w * C / 2, cellY(r, s));
      if (!top || y < top.y) top = { x, y, layer, r, c, id: cell.id };
    });
    return top;
  }

  // 只读演出快照：驾驶员统一读 crewExpression，伸杆和升旗分别读两个进度。
  // 拒绝投降后返回 null，画面据此撤旗并恢复正常表情。
  function surrenderState() {
    if (!B || !['raising', 'asked', 'accepted'].includes(B.surrender)) return null;
    const elapsed = B.surrenderElapsed;
    return { phase: B.surrender, name: B.e.name, why: B.surrenderWhy,
      duration: SURRENDER_DURATION, elapsed, poleProgress: clamp(elapsed / SURRENDER_POLE_TIME, 0, 1),
      flagProgress: clamp((elapsed - SURRENDER_POLE_TIME) / (SURRENDER_DURATION - SURRENDER_POLE_TIME), 0, 1),
      canConfirm: B.surrender === 'asked', crewExpression: 'sad', anchor: { ...B.surrenderAnchor } };
  }

  // 新画面须在每个 rAF（包括 frozen 时）传入真实 dt；规则只推进演出，不消耗战斗时间。
  function advanceSurrender(dt) {
    if (!B || B.surrender !== 'raising' || !Number.isFinite(dt) || dt <= 0) return surrenderState();
    B.surrenderElapsed = Math.min(SURRENDER_DURATION, B.surrenderElapsed + dt);
    if (B.surrenderElapsed >= SURRENDER_DURATION) {
      B.surrender = 'asked';
      emit('surrender', surrenderState());
    }
    return surrenderState();
  }

  // 点击跳过只完成升旗并打开确认，不代替玩家接受；重复请求不重复发事件。
  function skipSurrenderAnimation() {
    if (!B || B.surrender !== 'raising') return false;
    advanceSurrender(SURRENDER_DURATION);
    return true;
  }

  function surrender(dt) {
    const p = B.p, e = B.e;
    if (p.dead || e.dead || B.surrender) return;
    const why = helpless(p) ? null : quitReason(e, p);
    B.surT = why ? (B.surT || 0) + dt : 0;
    if (B.surT < T.SURRENDER_HOLD_TIME) return;
    if (B.headless) { B.surrender = 'accepted'; kill(e, SA.Config.text("battle_979e372e75a8", `${why}`)); return; }
    // 旧画面尚未接入升旗时仍使用即时确认，避免冻结后无人推进演出。
    const animated = !!view?.supportsSurrenderAnimation;
    B.surrender = animated ? 'raising' : 'asked';
    B.surrenderWhy = why;
    B.surrenderElapsed = animated ? 0 : SURRENDER_DURATION;
    B.surrenderAnchor = surrenderAnchor(e);
    B.frozen = true;
    B.keys.left = B.keys.right = B.keys.fire = false;
    for (let i = 0; i < 12; i++) emit('part', { type: 'steam', x: e.x + VW / 2 + rnd(-40, 40), y: VY + rnd(0, 60), vx: rnd(-20, 20), vy: rnd(-60, -20), life: rnd(1, 2), col: undefined });
    emit(animated ? 'surrender-start' : 'surrender', surrenderState());
  }

  // 画面层只发出操作请求；泄压、投降和撤退的状态变化统一留在规则层。
  function vent() {
    if (!B || B.p.vented || B.p.dead) return false;
    if (B.surrender === 'raising' || B.surrender === 'asked') return false;
    B.p.vented = true;
    B.p.ventCount++;
    B.p.heat = Math.max(0, B.p.heat - T.VENT_HEAT);
    for (let i = 0; i < 30; i++) emit('part', {
      type: 'steam', x: B.p.x + VW / 2 + rnd(-90, 90), y: VY + rnd(30, 240),
      vx: rnd(-120, 120), vy: rnd(-150, -30), life: rnd(0.6, 1.3), col: undefined,
    });
    return true;
  }

  function retreat() {
    if (!B || B.p.dead) return false;
    if (B.surrender === 'raising' || B.surrender === 'asked') return false;
    kill(B.p, SA.Config.text("battle_114d47b4788d"));
    return true;
  }

  function acceptSurrender() {
    if (!B || B.surrender !== 'asked') return false;
    const why = B.surrenderWhy || SA.Config.text("battle_ae17083576e8");
    B.frozen = false;
    B.surrender = 'accepted';
    kill(B.e, why + SA.Config.text("battle_c7ce70ac076e"));
    emit('text', { str: SA.Config.text("battle_08f61250ec4d"), x: B.e.x + VW / 2, y: VY + 40, col: P.white, life: 0.9 });
    return true;
  }

  function refuseSurrender() {
    if (!B || B.surrender !== 'asked') return false;
    B.frozen = false;
    B.surrender = 'refused';
    return true;
  }

  function step(dt) {
    // 实时画面与手动调试均不得在升旗或确认期间偷跑物理、炮弹或结算。
    if (B.surrender === 'raising' || B.surrender === 'asked') return;
    const beforeX = B.telemetry ? { p: B.p.x, e: B.e.x } : null;
    B.t += dt;
    B.ramCd = Math.max(0, B.ramCd - dt);
    B.p.kickCooldown = Math.max(0, B.p.kickCooldown - dt);
    B.e.kickCooldown = Math.max(0, B.e.kickCooldown - dt);
    if (B.ter) for (const c of B.ter.crates) { c.shake = Math.max(0, c.shake - dt); c.touch = Math.max(0, (c.touch || 0) - dt); }
    if (B.p.isAI) ai(B.p, B.e, dt);
    else {
      if (!B.p.dead) B.p.dir = (B.keys.right ? 1 : 0) - (B.keys.left ? 1 : 0);
      if (B.p.fireHeld && !B.keys.fire) B.p.release = true;
      B.p.fireHeld = B.keys.fire;
      B.p.crouchHeld = !!B.keys.crouch; B.p.jumpHeld = !!B.keys.jump;
    }
    ai(B.e, B.p, dt);
    // 两端先共同算出本帧收绳目标，避免先更新的一方占据时序优势。
    B.p.tetherPullVx = B.e.tetherPullVx = 0;
    updateTether(B.p, B.e, dt); updateTether(B.e, B.p, dt);
    sim(B.p, B.e, dt);
    sim(B.e, B.p, dt);
    // 双方供能和行驶需求都已更新，再结算绳索超载，避免用上一帧动力。
    overloadTether(B.p, B.e, dt); overloadTether(B.e, B.p, dt);
    B.p.anim.step(dt); B.e.anim.step(dt);
    collide(dt);
    pistons(B.p, B.e, dt);
    pistons(B.e, B.p, dt);
    enforceBounds(B.p); enforceBounds(B.e);
    // 进化评分只保存时间摘要，不保存逐帧录像；同一帧由双方共享一份距离统计。
    if (B.metrics) {
      const distance = Math.abs(frontEdge(B.e) - frontEdge(B.p));
      B.metrics.distanceSum += distance * dt;
      B.metrics.samples += dt;
      if (distance < 200) B.metrics.nearTime += dt;
      if (distance > 500) B.metrics.farTime += dt;
      if (distance > 500 && !B.shots.length && !B.contact) B.metrics.noEngageTime += dt;
    }
    if (B.telemetry) {
      for (const key of ['p', 'e']) { B.telemetry[key].distance += Math.abs(B[key].x - beforeX[key]); B.telemetry[key].speedIntegral += Math.abs(B[key].vx) * dt; }
      B.telemetry.seconds += dt;
    }
    camera(dt);

    for (const sh of B.shots) {
      const n = Math.max(1, Math.ceil(dt * 120));
      if (sh.delay > 0) { sh.delay -= dt; continue; }
      for (let i = 0; i < n && !sh.done; i++) {
        const res = advance(sh, sh.to, dt / n);
        if (sh.range && Math.hypot(sh.x - sh.originX, sh.y - sh.originY) > sh.range) { sh.done = true; continue; }
        if (!res) continue;
        sh.done = true;
        if (res === 'ground') {
          sh.from.events.terrainBlock++;
          const gy = groundAt(sh.x);
          for (let k = 0; k < 6; k++) emit('part', { type: 'dust', x: sh.x, y: gy, vx: rnd(-75, 75), vy: rnd(-100, -30), life: rnd(0.3, 0.6), col: undefined });
          if (sh.big) emit('part', { type: 'smoke', x: sh.x, y: gy - 6, vx: 0, vy: -30, life: 0.8, col: undefined });
        } else if (res.crate != null) {
          hitCrate(res.crate, sh.dmg);
        } else if (res !== 'out') {
          // 护甲：每发先减掉固定伤害（机枪打装甲只冒火星）
          const tc = sh.to.v[res.layer][res.r][res.c];
          effect(sh.from, sh.weaponCell.id, 'hit');
          sh.from.events.hit++;
          if (sh.focusAtFire) sh.from.events.chargedHit++;
          if (sh.weapon && sh.weapon.arc === 'high') sh.from.events.highHit++;
          damage(sh.to, sh.from, res, projectileDamage(sh.to, sh.from, res, sh.dmg, sh.weapon));
          // 抛射架与其他带 splash 的武器共享溅射规则，命中点附近的模块按距离衰减。
          if (sh.weapon && sh.weapon.splash) {
            const hitBox = modCenter(sh.to, res.layer, res.r, res.c);
            const seen = new Set([tc]);
            SA.V.each(sh.to.v, (oc, rr, cc, layer) => {
              if (!alive(oc) || seen.has(oc)) return;
              const p = modCenter(sh.to, layer, rr, cc), d = Math.hypot(p[0] - hitBox[0], p[1] - hitBox[1]);
              if (d <= sh.weapon.splash.r) { seen.add(oc); const k = Math.max(0, 1 - d / sh.weapon.splash.r) * sh.weapon.splash.k; if (k > 0) { effect(sh.from, sh.weaponCell.id, 'hit'); damage(sh.to, sh.from, { layer, r: rr, c: cc }, projectileDamage(sh.to, sh.from, { layer, r: rr, c: cc }, sh.dmg * k, sh.weapon)); } }
            });
          }
          // 喷火 / 蒸汽喷射的升温效果与伤害分开结算：命中一次就给目标增加固定热量，
          // 热量在下一帧按正常锅炉规则检查，因此不会绕过已有的烧干判负流程。
          if (sh.heatToEnemy) sh.to.heat += sh.heatToEnemy;
          if (sh.weapon && sh.weapon.knock) shove(sh.from, sh.to, sh.weapon.knock * T.WEAPON_KNOCK_FACTOR);
          if (sh.weapon && sh.weapon.tether) {
            sh.from.tether = { layer: res.layer, r: res.r, c: res.c, cell: sh.weaponCell, target: sh.to, time: T.TETHER_TIMEOUT };
            effect(sh.from, sh.weaponCell.id, 'tether');
          }
          if (sh.big) B.shake = Math.max(B.shake, 3);
        }
      }
      sh.trail = sh.trail || [];
      sh.trail.push([sh.x, sh.y]);
      if (sh.trail.length > 5) sh.trail.shift();
    }
    B.shots = B.shots.filter(s => !s.done);

    if (!B.headless && view && view.tick) view.tick(dt);

    if (!B.ending) {
      surrender(dt);
      if (B.surrender === 'raising' || B.surrender === 'asked') return;
      // 武器打光：一方开局有武器、现在全被摧毁，而另一方还有 → 判负；两边同时打光走下面的平手
      // 敌方判负：武器打光 + 水烧干 + 没有近战（撞击件）。这条只对敌方生效，玩家不会因此判负
      const e = B.e;
      if (!e.dead && !B.p.dead && e.armed && !e.weapons.length && e.water <= 0 && !canMelee(e)) kill(e, SA.Config.text("battle_605a242d802d"));
      // 自测时两边都是 AI，这条规则对称生效
      const p = B.p;
      if (p.isAI && !p.dead && !e.dead && p.armed && !p.weapons.length && p.water <= 0 && !canMelee(p)) kill(p, SA.Config.text("battle_605a242d802d"));
      // 平手：双方都没了动力或没有能开火的武器，且场上没有飞行中的炮弹，持续 T.DRAW_HOLD_TIME 秒
      const both = !B.p.dead && !B.e.dead && crippled(B.p) && crippled(B.e) && !B.shots.length;
      B.drawT = both ? (B.drawT || 0) + dt : 0;
      if (B.drawT >= T.DRAW_HOLD_TIME) {
        B.draw = SA.Config.text("battle_2a9b09a1ef95", `${crippled(B.p) === crippled(B.e) ? crippled(B.p) : SA.Config.text("battle_43162559f8f3")}`);
        B.ending = T.ENDING_TIME;
      }
      if (!B.draw && B.t >= K.BATTLE_TIME && !B.p.dead && !B.e.dead) {
        // 超时按文档的 T.SCORE_DAMAGE_WEIGHT / T.SCORE_HP_WEIGHT 评分。
        const pScore = (B.p.dealt / Math.max(1, B.e.startHp)) * T.SCORE_DAMAGE_WEIGHT + hpFrac(B.p) * T.SCORE_HP_WEIGHT;
        const eScore = (B.e.dealt / Math.max(1, B.p.startHp)) * T.SCORE_DAMAGE_WEIGHT + hpFrac(B.e) * T.SCORE_HP_WEIGHT;
        B.timeout = { p: pScore, e: eScore };
        if (Math.abs(pScore - eScore) < T.SCORE_TIE_EPSILON) { B.draw = SA.Config.text("battle_b4c1399f333d"); B.ending = T.ENDING_TIME; }
        else if (pScore > eScore) kill(B.e, SA.Config.text("battle_62b0dcd35067"));
        else kill(B.p, SA.Config.text("battle_62b0dcd35067"));
      }
      if (B.p.dead || B.e.dead) B.ending = B.ending || T.ENDING_TIME;
    } else {
      B.ending -= dt;
      if (B.ending <= 0 && !B.done) finish();
    }
  }

  function frontShift(v) {
    let m = -1;
    SA.V.each(v, (cell, r, c) => { m = Math.max(m, c + SA.fp(cell.id).w - 1); });
    return m < 0 ? 0 : K.COLS - 1 - m;
  }
  function shiftVeh(v, k) {
    if (!k) return v;
    const out = SA.V.create(v.name);
    SA.V.each(v, (cell, r, c, layer) => { if (c + k >= 0 && c + k < K.COLS) out[layer][r][c + k] = cell; });
    return out;
  }

  function startState(opts) {
    SA.go('battle');
    const d = SA.S.d;
    const pShift = frontShift(d.vehicle);
    const pv = shiftVeh(SA.V.battleCopy(d.vehicle, 1, opts.mode === 'friendly'), pShift);
    const enemyStats = SA.StageCars.statMultipliers(opts.statMultipliers);
    const ev = shiftVeh(SA.V.battleCopy(opts.enemyVehicle, (opts.hpMul || 1) * enemyStats.hp, true), frontShift(opts.enemyVehicle));
    B = { opts, pShift, bounds: opts.bounds || null, ter: makeTerrain(opts.terrain), t: 0, shots: [], parts: [], texts: [], shake: 0, aim: null, ending: 0, done: false, hudT: 0, ramCd: 0, contact: false,
      speed: view ? view.gameSpeed() : K.GAME_SPEED, keys: { left: false, right: false, fire: false, crouch: false, jump: false }, cam: { x: 0, y: 0, z: 1, w: W, h: H }, aimScreen: null };
    B.p = makeSide(pv, d.vehicle.name, false, 1, W / 2 - 200 - PADX - K.COLS * C);
    B.e = makeSide(ev, opts.enemyName, true, opts.aim || 0.9, W / 2 + 200 - PADX, enemyStats);
    B.e.style = normalizeAiStyle(opts.style);
    B.e.boss = !!opts.boss;
    return B;
  }

  function start(opts) {
    // 支线只能打已经开放的关（拦路那一场只在它该出现时）；已取消的遭遇战不能从旧页面或脚本绕过出战入口启动。
    if (opts?.mode === 'side' && !SA.Side?.canStart(opts)) return false;
    // 发行包在实际开战入口核对开放范围，旧页面不能启动后续章节。
    if (SA.RELEASE && opts?.mode === 'campaign') {
      const key = /^(\d+),(\d+)$/.exec(String(opts.storyKey || ''));
      if (!key || !SA.Camp.stage(Number(key[1]), Number(key[2]))) return false;
    }
    if (!view) throw new Error(SA.Config.text("battle_282b507870d1"));
    view.start(opts);
  }

  function finish() {
    B.done = true;
    if (B.headless) {
      B.result = { winner: B.draw ? 'draw' : B.e.dead && !B.p.dead ? 'p' : B.p.dead && !B.e.dead ? 'e' : 'draw',
        t: B.t, reason: B.draw || (B.e.dead ? B.e.reason : B.p.reason), pDealt: B.p.dealt, eDealt: B.e.dealt,
        effectStats: { p: B.p.effects, e: B.e.effects },
        events: { p: { ...B.p.events, maxHeat: B.p.maxHeat, heatMax: B.p.heatMax, minWater: B.p.minWater, failureType: B.p.failureType, failureAt: B.p.failureAt, firstWaterEmptyAt: B.p.firstWaterEmptyAt, firstHeatMaxAt: B.p.firstHeatMaxAt, fireHeldAtFailure: B.p.fireHeldAtFailure, holdAtFailure: B.p.holdAtFailure, ventAtFailure: B.p.ventAtFailure, holdSeconds: B.p.holdSeconds, fireHeldSeconds: B.p.fireHeldSeconds, ventCount: B.p.ventCount }, e: { ...B.e.events, maxHeat: B.e.maxHeat, heatMax: B.e.heatMax, minWater: B.e.minWater, failureType: B.e.failureType, failureAt: B.e.failureAt, firstWaterEmptyAt: B.e.firstWaterEmptyAt, firstHeatMaxAt: B.e.firstHeatMaxAt, fireHeldAtFailure: B.e.fireHeldAtFailure, holdAtFailure: B.e.holdAtFailure, ventAtFailure: B.e.ventAtFailure, holdSeconds: B.e.holdSeconds, fireHeldSeconds: B.e.fireHeldSeconds, ventCount: B.e.ventCount } },
        // 无画面诊断只读快照：用于压力测试发现位置、耐久、热量和水量越界，不参与判胜或 AI。
        state: { p: { x: B.p.x, hp: hpFrac(B.p), heat: B.p.heat, water: B.p.water, cells: cellTelemetry(B.p.v) }, e: { x: B.e.x, hp: hpFrac(B.e), heat: B.e.heat, water: B.e.water, cells: cellTelemetry(B.e.v) } },
        ...(B.telemetry ? { telemetry: B.telemetry } : {}), metrics: { ...B.metrics }, timeout: B.timeout || null, ...(B.aiStats ? { aiStats: B.aiStats } : {}) };
      return;
    }
    if (view) view.teardown();
    const draw = !!B.draw;
    const win = !draw && !B.p.dead && B.e.dead;
    let flawless = true;
    SA.V.each(B.p.v, (cell) => { if (SA.isCockpit(cell.id) && cell.hp < SA.V.maxHp(cell)) flawless = false; });
    // 对手还完好的模块：战役胜利后可以挑一件缴获
    const survivors = [];
    const uniqueLoot = Array.isArray(B.opts.uniqueLoot) ? B.opts.uniqueLoot : [];
    SA.V.each(B.e.v, (cell) => {
      if (cell.hp <= 0) return;
      const unique = uniqueLoot.find(item => item.id === cell.id && (!cell.unique || (item.key || item.id) === cell.unique)) || SA.uniqueRule(cell);
      survivors.push({ id: cell.id, mt: cell.mt || 1, ...(cell.look ? { look: cell.look } : {}), ...(unique ? { unique: SA.rewardRule({ ...unique, id: cell.id }) } : {}) });
    });
    // 真人记录只保存一局的聚合指标，供 P8 校准代理 AI；不写逐帧数据，也不记录友谊赛以外的隐私信息。
    const humanId = recordHumanBattle({
      terrain: B.opts.terrain || 'flat', outcome: draw ? 'draw' : win ? 'p' : 'e', time: B.t,
      events: B.p.events, metrics: B.metrics, maxHeat: B.p.maxHeat, heatMax: B.p.heatMax, minWater: B.p.minWater,
      pDealt: B.p.dealt, pTaken: B.p.taken,
    });
    if (view) view.presentResult({
      // 结算规则和结果弹窗都读取顶层 replay；漏传会把重打胜利误当成当前关卡首次通关。
      mode: B.opts.mode, replay: !!B.opts.replay, opts: B.opts, win, draw, prize: B.opts.prize || 0, enemyName: B.e.name,
      reason: draw ? B.draw : win ? `「${B.e.name}」${B.e.reason}` : SA.Config.text("battle_31229846c96d", `${B.p.name}`, `${B.p.reason}`), surrendered: win && B.surrender === 'accepted',
      playerVehicle: shiftVeh(B.p.v, -B.pShift), survivors, dealt: B.p.dealt, taken: B.p.taken, time: B.t, flawless: win && flawless,
      humanId,   // 真人记录的 id：结算弹窗的一键评价按钮用它调 SA.HUMAN_BATTLES.feedback
    });
  }

  // 与 tools/ai-calibration.js 共用 steam_arena_human_battles_v1 协议。
  // localStorage 失败（隐私模式或容量不足）时不影响战斗结算。
  function recordHumanBattle(input) {
    const KEY = 'steam_arena_human_battles_v1', MAX = 200, LIMIT = 1024 * 1024;
    try {
      const raw = localStorage.getItem(KEY), old = raw ? JSON.parse(raw) : {}, rows = Array.isArray(old.records) ? old.records : [];
      const fire = input.events?.fire || 0, hit = input.events?.hit || 0, charged = input.events?.chargedHit || 0, t = Math.max(0, input.time || 0);
      const id = `${Date.now()}-${rows.length}`;
      rows.push({ version: 1, id, at: new Date().toISOString(), terrain: input.terrain,
        outcome: input.outcome, time: t, shots: fire, hits: hit, ricochets: input.events?.ricochet || 0, chargedHits: charged,
        hitRate: fire ? hit / fire : 0, chargedRate: fire ? charged / fire : 0,
        closeRate: t ? (input.metrics?.nearTime || 0) / t : 0, farRate: t ? (input.metrics?.farTime || 0) / t : 0,
        noEngageRate: t ? (input.metrics?.noEngageTime || 0) / t : 0, maxHeat: input.maxHeat || 0, heatMax: input.heatMax || 0,
        minWater: input.minWater || 0, damageDealt: input.pDealt || 0, damageTaken: input.pTaken || 0, feedback: null });
      let kept = rows.slice(-MAX), encoded = () => JSON.stringify({ version: 1, records: kept });
      while (kept.length > 1 && encoded().length > LIMIT) kept.shift();
      localStorage.setItem(KEY, encoded());
      // 给开发者面板 / Opus 的评价按钮一个无样式数据接口；按钮呈现不在这里实现。
      SA.HUMAN_BATTLES = SA.HUMAN_BATTLES || {
        exportJson() { return localStorage.getItem(KEY) || JSON.stringify({ version: 1, records: [] }); },
        feedback(id, value) {
          const raw = localStorage.getItem(KEY), payload = raw ? JSON.parse(raw) : { version: 1, records: [] };
          const row = payload.records.find(item => item.id === id);
          if (!row || ![SA.Config.text("battle_21c3183d825b"), SA.Config.text("battle_43932aa17701"), SA.Config.text("battle_c42008a148a6")].includes(value)) return false;
          row.feedback = value; localStorage.setItem(KEY, JSON.stringify(payload)); return true;
        },
        clear() { localStorage.removeItem(KEY); },
      };
      return id;
    } catch (e) { return null; /* 记录失败不应阻断战斗结算 */ }
  }

  // ---------- 无画面模拟（tools/sim.html 数值自测用）----------
  // 两边都交给 AI，按固定步长一口气打完，返回 { winner: 'p' | 'e' | 'draw', t, reason, pDealt, eDealt }
  // o = { p: 载具, e: 载具, pAim, eAim, pStyle, eStyle, eBoss, terrain, dt, seed }
  function simulate(o) {
    const keep = B;
    const previousRandom = random;
    random = o && o.seed != null ? seededRandom(o.seed) : Math.random;
    const pS = frontShift(o.p), eS = frontShift(o.e);
    B = { headless: true, opts: { mode: 'sim' }, pShift: pS, bounds: o.bounds || null, ter: makeTerrain(o.terrain), t: 0, shots: [], parts: [], texts: [], shake: 0, aim: null, ending: 0, done: false, hudT: 0, ramCd: 0, contact: false,
      telemetry: o.telemetry ? { p: { distance: 0, speedIntegral: 0 }, e: { distance: 0, speedIntegral: 0 }, seconds: 0 } : null,
      metrics: { distanceSum: 0, samples: 0, nearTime: 0, farTime: 0, noEngageTime: 0 },
      // 可选行为计数仅累加确定性状态，不抽随机数，也不改变战斗结算。
      aiStats: o.aiStats ? { p: { shots: 0, fireIntent: 0, advance: 0, retreat: 0, evade: 0, counter: 0, burst: 0, chase: 0, targets: {} }, e: { shots: 0, fireIntent: 0, advance: 0, retreat: 0, evade: 0, counter: 0, burst: 0, chase: 0, targets: {} } } : null,
      speed: 1, keys: { left: false, right: false, fire: false, crouch: false, jump: false }, cam: { x: 0, y: 0, z: 1, w: W, h: H }, aimScreen: null };
    try {
      const profileAim = Number.isFinite(o.aiProfile?.aim) ? o.aiProfile.aim : null;
      // 双向对打时倍率随关卡车辆所在阵营传入；每场从原车建立副本，不叠乘上场数值。
      const pStats = SA.StageCars.statMultipliers(o.pStatMultipliers), eStats = SA.StageCars.statMultipliers(o.eStatMultipliers);
      B.p = makeSide(shiftVeh(SA.V.battleCopy(o.p, pStats.hp, true), pS), 'A', true, profileAim ?? o.pAim ?? 0.8, W / 2 - 200 - PADX - K.COLS * C, pStats);
      B.p.style = normalizeAiStyle(o.pStyle);
      B.p.aiProfile = o.aiProfile || null;
      B.e = makeSide(shiftVeh(SA.V.battleCopy(o.e, eStats.hp, true), eS), 'B', true, profileAim ?? o.eAim ?? 0.8, W / 2 + 200 - PADX, eStats);
      B.e.style = normalizeAiStyle(o.eStyle);
      B.e.aiProfile = o.aiProfile || null;
      B.e.boss = !!o.eBoss;
      const dt = o.dt || 1 / 30;
      while (!B.done && B.t < K.BATTLE_TIME + 10) step(dt);
      return B.result || { winner: 'draw', t: B.t, reason: SA.Config.text("battle_e512cf016f96"), pDealt: B.p.dealt, eDealt: B.e.dealt, effectStats: { p: B.p.effects, e: B.e.effects }, events: { p: B.p.events, e: B.e.events }, metrics: { ...B.metrics }, ...(B.aiStats ? { aiStats: B.aiStats } : {}) };
    } finally { B = keep; random = previousRandom; }
  }

  // 调试：预览环境里 rAF 可能不跑，可手动推进
  const debug = {
    canJump(side = 'p') { return canJump(side === 'e' ? B.e : B.p); },
    targetAt(side, x, y) { return targetAt(side === 'e' ? B.e : B.p, x, y); },
    muzzle(side = 'p', index = 0) { const s = side === 'e' ? B.e : B.p; return muzzle(s, s.weapons[index]); },
    damage(side, r, c, layer = 'body', amount = 1) { const s = side === 'e' ? B.e : B.p; damage(s, null, { layer, r, c }, amount); }, // 单位检查用真实受击与刷新路径。
    step(sec = 1) { for (let i = 0; i < sec * 60; i++) { if (B.done) break; step(1 / 60); } if (view) { view.draw(); view.hudTick(1); } return { t: B.t, px: B.p.x, ex: B.e.x, pv: B.p.vx, ev: B.e.vx, ph: B.p.heat, eh: B.e.heat, pd: B.p.dead, ed: B.e.dead }; },
    get B() { return B; },
    cellCenter(side, r, c, layer = 'body') { const s = side === 'e' ? B.e : B.p; return modCenter(s, layer, r, c); },
    aimWorld(x, y) { if (view) view.aimWorld(x, y); },
    fx: { ricochet: (x, y, back = 1) => emit('ricochet', { x, y, back }), shatter: (x, y, id = 'plate', mt = 1) => emit('shatter', { x, y, cell: { id, mt } }) },
  };
  if (SA.BattleView && SA.BattleView.create) view = SA.BattleView.create({
    constants: { h, K, T, M, P, C, PADX, W, H, GROUND, VY, VW, HALF },
    getState: () => B, startState, step, camera, kill, crippled, alive, clamp, rnd, gauss, isP, cellX, cellY, frontEdge, groundAt, crateAt, modCenter, modAt, cellAt,
    muzzle, targetAt, aimAngle, spreadDeg, shakeOf, barrel, launch, predict, tiltOf, pivY, toWorld, modBox, frontShift, shiftVeh, tetherState,
    vent, retreat, acceptSurrender, refuseSurrender, surrenderState, advanceSurrender, skipSurrenderAnimation,
    emit: (type, data) => emit(type, data),
  });
  return { start, aiStyles, normalizeAiStyle, ...(!SA.RELEASE ? { startState, simulate, debug } : {}), reloadProgress, ricochetChance, emit, tetherState, vent, retreat, acceptSurrender, refuseSurrender, surrenderState, advanceSurrender, skipSurrenderAnimation };
})();
