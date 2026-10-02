// 竞技场：加速/撞击、直射与高抛弹道 + 弹道预览、数字键切换武器、侧挂层优先、热量/水、AI
// 视觉事件类型：part、text、particles、boom、ricochet、shatter、surrender-start、surrender。
window.SA = window.SA || {};
// 规则指纹的手工版本；战斗规则改动时必须递增，进化候选会因此被标记为需要复核。
SA.RULES_VERSION = '2026-10-01-end-armor-chapter-bounds';

SA.Battle = (() => {
  const h = SA.h, K = SA.K, T = K.BATTLE, M = SA.MODULES, P = SA.PAL, C = K.CELL, PADX = SA.SPR.PADX;
  const W = 1280, H = 720, GROUND = 648, VY = GROUND - K.ROWS * C;
  const VW = K.COLS * C + PADX * 2;
  const HALF = C / 2;   // C = 子格 24px；模块的实际大小按 SA.fp 算（modBox / modCenter）
  const alive = SA.V.alive;
  // 武器组顺序同时决定驾驶员接管顺序。新模块追加到末尾，避免旧分享码的手操顺序变化。
  const GROUP_ORDER = ['cannon', 'cannon_m', 'mortar', 'mortar_s', 'mg', 'mg2', 'side_cannon',
    'cannon_s', 'cannon_heavy', 'cannon_giant', 'rocket_rack', 'harpoon', 'flamer', 'steamjet', 'mg_s', 'mg_heavy'];
  let B = null;
  let view = null;
  const CAMERA_ZMIN = 0.62;
  // 投降演出按真实秒数推进，不受战斗倍速影响；先伸杆，再升旗。
  const SURRENDER_DURATION = 3.5, SURRENDER_POLE_TIME = 1.2;

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

  // ---------- 阵营 ----------
  function makeSide(v, name, isAI, aim, x) {
    const s = { v, name, isAI, aim, x, vx: 0, heat: 0, water: 0, effects: {}, events: { fire: 0, hit: 0, ricochet: 0, chargedHit: 0, ram: 0, kick: 0, knock: 0, terrainBlock: 0, highHit: 0, downhillRam: 0, destroyed: 0 }, timers: {}, anim: SA.Dyn.animator(), co: { target: null, err: { x: 0, y: 0 }, retarget: 0 }, punch: {}, punchT: {}, tether: null, dead: false, reason: '', failureType: null, failureAt: null,
      vented: false, hold: false, dealt: 0, taken: 0, smokeT: 0, dir: 0, phase: 0, moving: false,
      fireHeld: false, sel: null, target: null, retarget: 0, moveT: 0, goalX: x, charge: false, err: { x: 0, y: 0 },
      elev: {}, heldT: 0, lastSel: null, thrown: false, brakeT: 0, spool: 0, spoolDir: 0, chuffT: 0, rock: 0, spooling: false,
      focus: 0, jolt: 0, release: false, kick: 0, kickCooldown: 0, bipedLegHp: null, bipedHipHp: null, bipedLegDead: false, bipedHipDead: false, balance: '无底盘', gait: 0,
      holdSeconds: 0, fireHeldSeconds: 0, ventCount: 0 };   // focus：瞄准稳定度 0~1（按住蓄力）；jolt：起步/刹车造成的颠簸
    s.homeX = x;
    s.occ = SA.V.occ(v, 'body'); s.occS = SA.V.occ(v, 'side');   // 占格表：战斗中模块不会挪位置，开局算一次
    refresh(s);
    settle(s, 1);
    s.water = s.waterMax;
    refresh(s); // 开局按满水质量计算驱动需求与碰撞质量。
    s.startHp = SA.V.maxHp ? SA.V.stats(s.v).maxHp : 0;
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
      const m = SA.mod(cell);   // 按材料放大后的属性
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
      evade: ch ? ev / ch : 0, acc: ch ? acc / ch : 0, speed: thrown ? 0 : ch ? sp / ch : 0, cockpits: cock, copilots: Math.max(0, cop - 1) });   // 多出来的驾驶员各管一组武器
    if (s.chassisId === 'biped') {
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
      const m = SA.mod(cell);
      // 实体辅助件由 auxEffect 统一汇总，每件倍率只应用一次。
      s.weapons.push({ cell, r, c, layer, m: ax.reload === 1 && ax.spread === 1 ? m : { ...m, reload: m.reload * ax.reload, spread: m.spread * ax.spread }, key: `${r},${c},${layer === 'side' ? 's' : 'b'}`,
        blocked: layer === 'body' && blocked.some(b => b.r === r && b.c === c) });
    });
    s.groups = GROUP_ORDER.filter(id => s.weapons.some(w => w.cell.id === id));
    if (!s.groups.includes(s.sel)) s.sel = s.groups[0] || null;
    s.pistons = [];
    SA.V.each(s.v, (cell, r, c, layer) => { if (layer === 'body' && alive(cell) && (cell.id === 'piston' || M[cell.id].special === 'hydraulic-bite')) s.pistons.push({ cell, r, c }); });
    if (!cock) kill(s, '驾驶舱全部被摧毁');
  }

  function kill(s, reason) {
    if (s.dead) return;
    s.dead = true; s.reason = reason; s.failureAt = B.t;
    s.failureType = reason.includes('过热') || reason.includes('锅炉烧干') ? 'overheat' : (reason.includes('水') ? 'dry' : null);
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
    SA.V.each(v, (cell, r, c, layer) => out.push({ id: cell.id, mt: cell.mt || 1, lv: cell.lv || 0, hp: cell.hp, max: SA.V.maxHp(cell), r, c, layer }));
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
  const pivY = (s) => GROUND + (s.yo || 0);
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
    if (!crush) emit('text', { str: String(Math.round(dmg)), x: x + rnd(-9, 9), y: c.y0 - 10, col: '#d9b27a' });
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
  const cellY = (r, s) => VY + (s ? s.yo || 0 : 0) + r * C;   // s.yo：车被地形抬高 / 压低的量（负 = 抬高）
  const frontEdge = (s) => (isP(s) ? cellX(s, s.frontCol) + C : cellX(s, s.frontCol));
  // 模块在世界里的包围盒（敌方镜像：锚点列在世界里是最右边那一列）
  function modBox(s, r, c, id) {
    const f = SA.fp(id), x0 = isP(s) ? cellX(s, c) : cellX(s, c + f.w - 1);
    // 车身倾斜时模块中心跟着转（包围盒大小不变，够画角框、军衔杠、特效用）
    const [cx, cy] = toWorld(s, x0 + f.w * C / 2, cellY(r, s) + f.h * C / 2);
    return { x0: cx - f.w * C / 2, x1: cx + f.w * C / 2, y0: cy - f.h * C / 2, y1: cy + f.h * C / 2 };
  }
  function modCenter(s, layer, r, c) {
    const cell = s.v[layer][r][c], b = modBox(s, r, c, cell ? cell.id : 'armor_heavy');
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  }
  // 真双足的腿区从胯锚点下两行开始；按载具实际锚点取值，避免把普通底盘的 CH 当成固定分界。
  const bipedLegStart = (s) => (SA.V.bipedOf && SA.V.bipedOf(s.v) ? SA.V.bipedOf(s.v).r + 2 : SA.V.CH);
  // 世界坐标 → 子格
  function cellAt(s, x, y) {
    [x, y] = toFlat(s, x, y);   // 先转回车身平放时的坐标
    const r = Math.floor((y - VY - (s.yo || 0)) / C);
    const c = isP(s) ? Math.floor((x - s.x - PADX) / C) : Math.floor((s.x + VW - PADX - x) / C);
    return r >= 0 && r < K.ROWS && c >= 0 && c < K.COLS ? { r, c } : null;
  }
  // 子格上活着的模块 → { layer, r, c }（锚点）
  function modAt(s, layer, r, c) {
    const o = (layer === 'side' ? s.occS : s.occ)[r][c];
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
  // 散布由模块决定：臼炮 / 巨炮的 spread 为 0，抛射架保留齐射散布。
  // 边走边打、刹车时散布更大；按住蓄力（focus）能缩圈。
  const spreadDeg = (s, o, w, focus = s.focus) => {
    if ((w.m.indirect && !w.m.spread) || (s.prism && focus >= 1)) return 0;
    return (w.m.spread * (1 - s.acc * T.AIM_ACCEL_SPREAD) + shakeOf(s) * T.AIM_SHAKE_SPREAD) * (1 - s.aimShrink * focus) + o.evade * T.AIM_EVADE_SPREAD;
  };
  // 瞄准点 → 炮管该抬到的仰角（度），受射界限制
  function aimAngle(s, w, tx, ty) {
    let a = barrel(s, w), sol, raw, behind;
    const [lo, hi] = w.m.elev;
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
    const shotDeg = w.m.indirect ? clamp(deg + jitter, w.m.elev[0], w.m.elev[1]) : deg + jitter;
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
      const hit = modAt(def, sh.side ? 'side' : 'body', cell.r, cell.c);
      if (hit) return hit;
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
    let jit = gauss() * spreadDeg(s, o, w, focus);
    if (random() < (w.m.wild || 0)) jit += (random() < T.WILD_SIGN_CHANCE ? -1 : 1) * rnd(T.WILD_JITTER_MIN, T.WILD_JITTER_MAX) * w.m.spread; // 偏弹
    const count = w.m.salvo || 1, gap = w.m.salvoGap || 0;
    effect(s, w.cell.id, 'fire', count);
    s.events.fire += count;
    const charged = focus >= 0.999;
    const muzzleShot = launch(s, w, barrel(s, w), 0);
    for (let i = 0; i < count; i++) {
      const sh = launch(s, w, barrel(s, w), count > 1 ? gauss() * spreadDeg(s, o, w, focus) : jit);
      const tick = w.m.reload < 1 && w.m.heatPerSec ? w.m.reload : 1;
      B.shots.push({ ...sh, delay: i * gap, originX: sh.x, originY: sh.y, range: w.m.range || 0, side, from: s, to: o, weapon: w.m, weaponCell: w.cell, focusAtFire: charged, dmg: (w.m.dmgPerSec ? w.m.dmgPerSec * tick : w.m.dmg), heatToEnemy: (w.m.heatToEnemy ? w.m.heatToEnemy * tick : 0), big: w.m.proj === 'shell' });
    }
    // 连续喷射的 heat 是自身每秒产热，普通武器的 heat 是每轮（齐射也只算一轮）。
    s.heat += w.m.heatPerSec ? w.m.heat * w.m.reload : w.m.heat;
    // 制退与反作用：炮管后坐（动态模块）、车身被往后推、整车晃一下；越重的车越稳
    const dir = isP(s) ? 1 : -1, up = w.m.arc === 'high';
    s.anim.gun(w.key, w.m);
    const push = (w.m.kick || 0) / s.mass;
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
    if (!(dmg > 0)) return;
    const cell = def.v[imp.layer][imp.r][imp.c];
    if (!alive(cell)) return;
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
    emit('text', { str: String(Math.round(dmg)), x: x + rnd(-9, 9), y: y - 18, col: imp.layer === 'side' ? P.magenta : P.white });
    for (let i = 0; i < 6; i++) emit('part', { type: 'spark', x: x, y: y + 6, vx: rnd(-130, 130), vy: rnd(-160, 0), life: rnd(0.15, 0.35), col: undefined });
    if (cell.id === 'biped' ? (def.bipedLegDead && def.bipedHipDead) : cell.hp <= 0) destroy(def, att, imp);
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
    let dir = s.dead ? 0 : s.dir;
    s.spooling = false;
    if (dir && Math.abs(s.vx) < T.START_SPEED && s.speed > 0 && s.power > 0) {
      if (s.spoolDir !== dir) { s.spoolDir = dir; s.spool = spoolTime(s); s.chuffT = 0; }
      if (s.spool > 0) { s.spool -= dt; s.spooling = true; chuff(s, dt); dir = 0; }
    } else if (!dir) s.spoolDir = 0;
    s.rock = Math.max(0, s.rock - dt * T.ROCK_DECAY);
    // 最高速度 = 底盘速度 × 动力比（锅炉富余可按 K.SPEED_BOOST 超速）
    // 地形：泥地减速、上坡慢下坡快
    const tk = terrainK(s, dir || Math.sign(s.vx));
    const top = dir * s.speed * (s.speedMul || 0) * tk.top;
    const k = clamp(Math.sqrt(T.MASS_ACCEL_FACTOR / s.mass), T.MASS_ACCEL_MIN, T.MASS_ACCEL_MAX);
    const braking = s.vx !== 0 && (top === 0 || Math.sign(top) !== Math.sign(s.vx) || Math.abs(top) < Math.abs(s.vx));
    // 被撞飞（速度超过自己能开出的最高速度）：履带和脚在地上打滑，急停。正常松手 / 掉头仍按原来的刹车慢慢停
    const own = s.speed * (s.speedMul || 0) * tk.top;
    const skid = braking && Math.abs(s.vx) > own * T.SKID_SPEED_MULT + T.SKID_SPEED_OFFSET;
    let acc = (braking ? Math.max(K.BRAKE * s.brakeK, skid ? K.SKID : 0) : K.ACCEL * s.accelK * tk.acc) * k;
    if (!braking && dir) {
      const [left, right] = span(s), front = dir > 0 ? right : left, back = dir > 0 ? left : right;
      const grade = (groundAt(back) - groundAt(front)) / Math.max(1, right - left);
      const kg = s.mass * 1000, metresPerSec = Math.abs(s.vx) * SA.Phys.PX_M;
      const tractionN = Math.max(0, s.driveAvailableKw || 0) * 1000 * SA.Phys.TRANSMISSION / Math.max(0.4, metresPerSec);
      const resistanceN = kg * SA.Phys.GRAVITY * (SA.Phys.ROLL + grade);
      const physicalAcc = Math.max(0, (tractionN - resistanceN) / kg / SA.Phys.PX_M);
      acc = Math.min(acc, physicalAcc);
    }
    const vx0 = s.vx;
    s.vx += clamp(top - s.vx, -acc * dt, acc * dt);
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
    if (B.ter) {
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
  const rowFront = (s, r) => { for (let c = K.COLS - 1; c >= 0; c--) { const o = s.occ[r][c]; if (o && alive(o.cell)) return o; } return null; };
  const rowEdge = (s, o) => { const b = modBox(s, o.r, o.c, o.cell.id); return isP(s) ? b.x1 : b.x0; };
  // 返回 { gap, rows }：最小间距，以及贴得最近（在 1px 内）的那些行
  // 两车被地形抬到不同高度时，按世界高度对齐：p 的第 r 行对着 e 的第 r + dr 行
  function rowContact(p, e) {
    let gap = Infinity;
    const rows = [];
    const dr = Math.round(((p.yo || 0) - (e.yo || 0)) / C);
    for (let r = 0; r < K.ROWS; r++) {
      const re = r + dr;
      if (re < 0 || re >= K.ROWS) continue;
      const pc = rowFront(p, r), ec = rowFront(e, re);
      if (!pc || !ec) continue;
      const g0 = rowEdge(e, ec) - rowEdge(p, pc);
      rows.push({ r, re, g: g0, pc, ec });
      gap = Math.min(gap, g0);
    }
    return { gap, dr, rows: rows.filter(x => x.g <= gap + T.CONTACT_GAP) };
  }

  function collide() {
    const p = B.p, e = B.e;
    if (p.frontCol < 0 || e.frontCol < 0) return;
    const { gap, rows, dr } = rowContact(p, e);
    B.contactRows = gap <= T.CONTACT_GAP ? rows.map(x => x.r) : [];
    B.contactRowsE = gap <= T.CONTACT_GAP ? rows.map(x => x.re) : [];
    B.rowShift = dr;
    B.contact = gap <= T.CONTACT_GAP;
    if (B.contact) {
      for (const [a, d] of [[p, e], [e, p]]) {
        if (a.chassisId === 'biped' && a.balance === '平衡' && !a.bipedLegDead && a.kickCooldown <= 0 && a.speed > 0) {
          const target = rows.find(x => {
            const part = a === p ? x.ec : x.pc;
            return part && alive(part.cell);
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
    if (gap > 0) return;
    const closing = p.vx - e.vx;
    const cx = (rowEdge(p, rows[0].pc) + rowEdge(e, rows[0].ec)) / 2;
    if (closing > T.RAM_SPEED_THRESHOLD && B.ramCd <= 0) {
      B.ramCd = T.RAM_COOLDOWN;
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
          const dmg = (SA.mod(ma).ram || T.RAM_DEFAULT_DAMAGE) * f * SA.ramMul(a.mass * 1000);   // 车越重撞得越狠
          if (SA.mod(ma).ram) a.events.ram++;
          damage(d, a, { layer: 'body', r: dm.r, c: dm.c }, SA.isRam(dm.cell.id) ? dmg * T.RAM_TARGET_DAMAGE : dmg);
          const tethered = (a.tether && a.tether.target === d) || (d.tether && d.tether.target === a);
          if (alive(ma)) damage(a, null, { layer: 'body', r: am.r, c: am.c }, dmg * (tethered ? K.RAM_TETHER_SELF : K.RAM_SELF));
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
    t.vx += dir * dv * 2 * a.mass / sum;
    a.vx -= dir * dv * 2 * t.mass / sum;
  }

  // 只在无画面模拟中读取的模块遥测；普通战斗不显示这些计数。
  function effect(s, id, key, value = 1) {
    if (!s || !id || !value) return;
    const e = s.effects[id] || (s.effects[id] = { active: 0, fire: 0, hit: 0, tether: 0, energy: 0, waterSaved: 0, dryCool: 0 });
    e[key] = (e[key] || 0) + value;
  }

  // 鱼叉牵引：按两车质量反比分摊收绳冲量，距离过远、目标损毁或超过 T.TETHER_TIMEOUT 秒自动断开。
  function updateTether(s, o, dt) {
    const t = s.tether;
    if (!t) return;
    t.time -= dt;
    const target = o.v[t.layer] && o.v[t.layer][t.r] && o.v[t.layer][t.r][t.c];
    const dist = Math.abs(o.x - s.x);
    if (t.time <= 0 || dist > T.TETHER_MAX_DISTANCE || !target || !alive(target) || !alive(t.cell)) { s.tether = null; return; }
    if (dist > T.TETHER_PULL_DISTANCE) shove(s, o, Math.min(M.harpoon.tether * dt, T.TETHER_SPEED_MAX));
  }

  // 蒸汽撞锤：贴身时周期性猛击
  function pistons(s, o, dt) {
    for (const k in s.punch) s.punch[k] = Math.max(0, s.punch[k] - dt * T.PISTON_DECAY);
    if (s.dead || o.dead || !B.contact) return;
    for (const pc of s.pistons) {
      // 撞锤要在自己这几行的最前端，并且其中一行正顶着对方
      const pm = SA.mod(pc.cell);
      const f = SA.fp(pc.cell.id);
      let row = -1;
      const mine = (isP(s) ? B.contactRows : B.contactRowsE) || [];
      for (let i = 0; i < f.h; i++) { const rr = pc.r + i, fr = rowFront(s, rr); if (fr && fr.cell === pc.cell && mine.includes(rr)) row = rr; }
      if (!alive(pc.cell) || row < 0) continue;
      const key = `${pc.r},${pc.c}`;
      s.punchT[key] = (s.punchT[key] || 0) - dt;
      if (s.punchT[key] > 0) continue;
      s.punchT[key] = pm.punchCd;
      const tr = row + (isP(s) ? 1 : -1) * (B.rowShift || 0);   // 对方那边同一高度的行
      const tgt = tr >= 0 && tr < K.ROWS ? rowFront(o, tr) : null;
      if (!tgt) continue;
      const dc = tgt.c;
      s.punch[key] = 1;
      s.heat += pm.heat;
      damage(o, s, { layer: 'body', r: tgt.r, c: dc }, SA.armorCut(SA.mod(tgt.cell), pm.punch));
      shove(s, o, T.PISTON_SHOVE);   // 撞锤的推力同样是一对冲量：推重车时自己被弹开得更多
      const x = frontEdge(s), y = cellY(row, s) + HALF;
      for (let i = 0; i < 10; i++) emit('part', { type: 'steam', x: x, y: y, vx: rnd(-90, 90), vy: rnd(-120, -15), life: rnd(0.4, 0.8), col: undefined });
      B.shake = Math.max(B.shake, 4);
    }
  }

  // ---------- 模拟 ----------
  function sim(s, o, dt) {
    if (s.dead) { drive(s, dt); return; }
    if (s.hold) s.holdSeconds += dt;
    if (s.fireHeld) s.fireHeldSeconds += dt;
    updateTether(s, o, dt);
    // 蓄压罐按秒充放：富余动力存入，短缺时按 STORE_RELEASE_PER_SEC 限制释放。
    // 每帧按剩水重算质量；锅炉供能不受冷却储水限制。
    s.mass = Math.max(T.MASS_MIN_TONS, (s.dryKg + s.water) / 1000);
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
    if (release > 0) {
      s.store = Math.max(0, s.store - release * dt);
      SA.V.each(s.v, cell => { if (alive(cell) && (SA.mod(cell).store || 0)) effect(s, cell.id, 'energy', release * dt); });
    }
    const availableSupply = baseSupply + release;
    const util = availableSupply ? Math.min(1, s.demand / availableSupply) : 0;
    s.power = availableSupply <= 0 ? 0 : s.demand ? Math.min(1, availableSupply / s.demand) : 1;
    s.driveAvailableKw = Math.max(0, availableSupply - s.equip);
    // 每帧重算：挂甲被击毁后，下一帧即按存活装甲解除对应侧罚速。
    s.armorSpeedFactor = SA.V.armorSpeedFactor(s.v);
    s.speedMul = (s.driveKw ? Math.min(K.SPEED_BOOST, s.driveAvailableKw / s.driveKw) : 0) * s.armorSpeedFactor;
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
    if (s.heat >= s.heatMax) { kill(s, '机组过热停摆'); return; }
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
    s.coGroups = s.copilots ? s.groups.filter(g => g !== s.sel).slice(0, s.copilots) : [];
    const coPt = s.coGroups.length && !o.dead && s.power > 0 && !s.hold ? copilotAim(s, o, dt) : null;
    const coAt = coPt ? targetAt(o, coPt[0], coPt[1]) : null;
    // 装填：先把所有炮的装填计时推进一步
    for (const w of s.weapons) {
      if (w.blocked) continue;
      if (s.timers[w.key] == null) s.timers[w.key] = rnd(T.COPILOT_RELOAD_MIN, T.COPILOT_RELOAD_MAX) * w.m.reload;
      s.timers[w.key] -= dt * s.power;
    }
    // 手操的这一组是齐射：组里每门炮都装好了才一起开火（其他驾驶员管的组照旧各打各的）
    const salvo = s.weapons.filter(w => !w.blocked && w.cell.id === s.sel);
    const salvoReady = salvo.length > 0 && salvo.every(w => s.timers[w.key] <= 0);
    const salvoGo = salvoReady && firing && salvo.every(w => ready(w) && indirectReady(s, w, aimPt, dt));
    const again = rnd(T.SALVO_FACTOR_MIN, T.SALVO_FACTOR_MAX);   // 同一轮齐射用同一个装填时间，下一轮还是一起好
    for (const w of s.weapons) {
      if (w.blocked) continue;
      const mine = w.cell.id === s.sel, co = !mine && s.coGroups.includes(w.cell.id);
      const pt = co ? coPt : aimPt;
      // 炮管以有限角速度转向瞄准点
      const cur = barrel(s, w), want = pt ? aimAngle(s, w, pt[0], pt[1]).a : cur;
      s.elev[w.key] = cur + clamp(want - cur, -w.m.slew * dt, w.m.slew * dt);
      if (s.timers[w.key] > 0) continue;
      if (mine) {
        if (salvoGo) { fire(s, o, w, side); s.timers[w.key] = w.m.reload * again; s.kick = w.m.reload < K.FAST_RELOAD ? K.FOCUS_KICK_FAST : K.FOCUS_KICK; }
        else s.timers[w.key] = 0;
      } else if (co && coPt && Math.abs(want - cur) < T.AIM_TURN_THRESHOLD && indirectReady(s, w, coPt, dt)) { fire(s, o, w, !!coAt && coAt.layer === 'side', T.COPILOT_FOCUS); s.timers[w.key] = w.m.reload * rnd(T.COPILOT_RELOAD_FACTOR_MIN, T.COPILOT_RELOAD_FACTOR_MAX); }
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
  function pickTarget(o) {
    const cands = [];
    SA.V.each(o.v, (cell, r, c, layer) => {
      if (!alive(cell)) return;
      const id = cell.id;
      const w = layer === 'side' ? T.AI_TARGET_WEIGHTS.side : M[id].dmg ? T.AI_TARGET_WEIGHTS.weapon : SA.isCockpit(id) ? T.AI_TARGET_WEIGHTS.cockpit : M[id].supply ? T.AI_TARGET_WEIGHTS.boiler : M[id].water ? T.AI_TARGET_WEIGHTS.water : M[id].layer === 'chassis' ? T.AI_TARGET_WEIGHTS.chassis : T.AI_TARGET_WEIGHTS.other;
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
  const canMelee = (s) => s.rams > 0 || (s.chassisId === 'biped' && s.balance === '平衡' && !s.bipedLegDead && s.speed > 0);
  function ai(s, o, dt) {
    if (s.dead) return;
    const profile = s.aiProfile || {};
    const heatHigh = Number.isFinite(profile.heatHoldHigh) ? profile.heatHoldHigh / 100 : T.AI_HEAT_HIGH;
    const heatLow = Number.isFinite(profile.heatHoldLow) ? profile.heatHoldLow / 100 : T.AI_HEAT_LOW;
    if (s.heat / s.heatMax > heatHigh) s.hold = true; else if (s.heat / s.heatMax < heatLow) s.hold = false;
    s.retarget -= dt;
    const tAlive = s.target && alive(o.v[s.target.layer][s.target.r][s.target.c]);
    if (!tAlive || s.retarget <= 0) {
      s.target = pickTarget(o);
      const e = (1 - s.aim) * T.AI_ERROR_SCALE + T.AI_ERROR_BIAS;
      s.err = { x: gauss() * e, y: gauss() * e * T.AI_ERROR_Y_SCALE };
      s.retarget = rnd(T.AI_RETARGET_MIN, T.AI_RETARGET_MAX) * (Number.isFinite(profile.retargetFactor) ? profile.retargetFactor : 1);
      // 选武器组：直射打得到就直射，否则换高抛
      s.sel = s.groups[Math.floor(random() * s.groups.length)] || null;
      if (s.target && s.target.layer === 'body' && s.groups.some(id => s.weapons.some(x => x.cell.id === id && x.m.indirect))) {
        const w = s.weapons.find(x => !x.blocked && !x.m.indirect && (x.cell.id === 'cannon' || x.cell.id === 'cannon_m' || x.cell.id === 'cannon_s' || x.cell.id === 'cannon_heavy'));
        const pt = aiAimPoint(s, o);
        const pr = w && predict(s, o, w, aimAngle(s, w, pt[0], pt[1]).a, false);
        if (!pr || !pr.hit || pr.hit.c !== s.target.c || pr.hit.r !== s.target.r) s.sel = s.groups.find(id => s.weapons.some(x => x.cell.id === id && x.m.indirect && !x.blocked));
      }
    }
    if (s.style === 'rookie') {
      // 序章学徒会迟疑、点射后忘记扣扳机；每辆车独立计时，沿用战斗随机源以保持回放可复现。
      if (!s.rookie) s.rookie = { fireT: rnd(1.4, 2.5), firing: false, driveT: rnd(0.8, 1.6) };
      const novice = s.rookie;
      novice.fireT -= dt;
      if (novice.fireT <= 0) {
        novice.firing = !novice.firing;
        novice.fireT = novice.firing ? rnd(0.55, 0.9) : rnd(1.6, 3);
      }
      s.fireHeld = !!s.target && novice.firing;
      novice.driveT -= dt;
      if (novice.driveT <= 0) {
        // 远处会慌忙追近；贴近后乱踩油门和倒车，避免退远后把教学战拖到锅炉烧干。
        const fwd = isP(s) ? 1 : -1;
        const gap = fwd * (frontEdge(o) - frontEdge(s));
        const choices = gap > 580 ? [fwd, fwd, fwd, fwd, 0, -fwd] : [0, 0, fwd, fwd, fwd, -fwd];
        s.dir = choices[Math.floor(random() * choices.length)];
        novice.driveT = s.dir === -fwd ? rnd(0.2, 0.45) : rnd(0.6, 1.25);
      }
      return;
    }
    s.fireHeld = !!s.target;
    // 移动：按性格来。默认 = 有撞击武器就周期性冲撞，否则在交战距离内游走；
    // rush 冲锋：几乎一直在冲，退也只退一小段助跑；kite 放风筝：保持远距离，很少冲撞；turtle 龟缩：守在出发点附近
    s.moveT -= dt;
    if (s.moveT <= 0) {
      const sty = s.style;
      s.charge = canMelee(s) && sty !== 'turtle' && (sty === 'rush' ? !s.charge || random() < T.AI_CHARGE_RUSH_CHANCE : !s.charge && random() < (sty === 'kite' ? T.AI_CHARGE_KITE_CHANCE : T.AI_CHARGE_DEFAULT_CHANCE));
      const [lo, hi] = sty === 'kite' ? T.AI_MOVE_RANGE_KITE : sty === 'rush' ? T.AI_MOVE_RANGE_RUSH : T.AI_MOVE_RANGE_DEFAULT;
      const fwd = isP(s) ? 1 : -1, gap = fwd * (frontEdge(o) - frontEdge(s));   // 两车车头之间的距离
      s.goalX = sty === 'turtle' ? s.homeX + rnd(-T.AI_TURTLE_OFFSET, T.AI_TURTLE_OFFSET) : s.x + fwd * (gap - rnd(lo, hi));
      s.moveT = s.charge ? rnd(T.AI_CHARGE_TIME[0], T.AI_CHARGE_TIME[1]) : rnd(T.AI_MOVE_TIME[0], T.AI_MOVE_TIME[1]) * (s.speed > T.AI_FAST_SPEED ? T.AI_FAST_MOVE_FACTOR : 1);
    }
    const selected = s.weapons.find(w => w.cell.id === s.sel && !w.blocked);
    // 高抛射界有近端盲区和最远距离，沿用模块的角度配置判断，不写死巨炮的视觉参数。
    // 近到抬不够炮口时后退，远到弹道不可达或压不低时前进；进入射界后仍按原性格移动。
    const aimPt = selected && selected.m.indirect ? aiAimPoint(s, o) : null;
    const lob = aimPt ? aimAngle(s, selected, aimPt[0], aimPt[1]) : null;
    const fwd = isP(s) ? 1 : -1;
    const gapNow = selected && selected.m.range ? Math.abs(frontEdge(o) - frontEdge(s)) : 0;
    if (lob && (lob.behind || lob.over === 'high')) s.dir = -fwd;
    else if (lob && (!lob.reach || lob.over === 'low')) s.dir = fwd;
    else if (selected && selected.m.range && gapNow > selected.m.range * T.AI_RANGE_MARGIN) s.dir = fwd;
    else if (s.charge) { s.dir = isP(s) ? 1 : -1; if (B.contact && Math.abs(s.vx) < T.AI_CONTACT_SPEED) s.moveT = Math.min(s.moveT, T.AI_CONTACT_MOVE_TIME); }
    else s.dir = Math.abs(s.goalX - s.x) > T.AI_GOAL_EPSILON ? Math.sign(s.goalX - s.x) : 0;
  }

  // 失去战斗力：没有动力（锅炉全毁），或者没有能开火的武器。返回原因，否则为 null
  function crippled(s) {
    if (s.supply <= 0) return '失去动力';
    if (!s.weapons.some(w => !w.blocked)) return '没有能开火的武器';
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
    if (crippled(e) && fe < T.SURRENDER_CRIPPLED_HP) return `${crippled(e)}，只剩撞击件`;
    if (fe < T.SURRENDER_LOW_HP && hpFrac(p) >= fe * T.SURRENDER_HP_MULTIPLIER) return '伤得太重，打不下去了';
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
    if (B.headless) { B.surrender = 'accepted'; kill(e, `${why}，挂白旗投降`); return; }
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
    kill(B.p, '主动撤出比赛');
    return true;
  }

  function acceptSurrender() {
    if (!B || B.surrender !== 'asked') return false;
    const why = B.surrenderWhy || '已经没法再打';
    B.frozen = false;
    B.surrender = 'accepted';
    kill(B.e, why + '，挂白旗投降');
    emit('text', { str: '投降', x: B.e.x + VW / 2, y: VY + 40, col: P.white, life: 0.9 });
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
    }
    ai(B.e, B.p, dt);
    sim(B.p, B.e, dt);
    sim(B.e, B.p, dt);
    B.p.anim.step(dt); B.e.anim.step(dt);
    collide();
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
      if (!e.dead && !B.p.dead && e.armed && !e.weapons.length && e.water <= 0 && !canMelee(e)) kill(e, '武器打光、水也烧干，又没有近战手段，失去战斗力');
      // 自测时两边都是 AI，这条规则对称生效
      const p = B.p;
      if (p.isAI && !p.dead && !e.dead && p.armed && !p.weapons.length && p.water <= 0 && !canMelee(p)) kill(p, '武器打光、水也烧干，又没有近战手段，失去战斗力');
      // 平手：双方都没了动力或没有能开火的武器，且场上没有飞行中的炮弹，持续 T.DRAW_HOLD_TIME 秒
      const both = !B.p.dead && !B.e.dead && crippled(B.p) && crippled(B.e) && !B.shots.length;
      B.drawT = both ? (B.drawT || 0) + dt : 0;
      if (B.drawT >= T.DRAW_HOLD_TIME) {
        B.draw = `双方都${crippled(B.p) === crippled(B.e) ? crippled(B.p) : '失去了战斗力'}，裁判判定平手`;
        B.ending = T.ENDING_TIME;
      }
      if (!B.draw && B.t >= K.BATTLE_TIME && !B.p.dead && !B.e.dead) {
        // 超时按文档的 T.SCORE_DAMAGE_WEIGHT / T.SCORE_HP_WEIGHT 评分。
        const pScore = (B.p.dealt / Math.max(1, B.e.startHp)) * T.SCORE_DAMAGE_WEIGHT + hpFrac(B.p) * T.SCORE_HP_WEIGHT;
        const eScore = (B.e.dealt / Math.max(1, B.p.startHp)) * T.SCORE_DAMAGE_WEIGHT + hpFrac(B.e) * T.SCORE_HP_WEIGHT;
        B.timeout = { p: pScore, e: eScore };
        if (Math.abs(pScore - eScore) < T.SCORE_TIE_EPSILON) { B.draw = '时间到，双方按伤害与剩余耐久计算后相同，裁判判平手'; B.ending = T.ENDING_TIME; }
        else if (pScore > eScore) kill(B.e, '时间到，按 60 / 40 评分判负');
        else kill(B.p, '时间到，按 60 / 40 评分判负');
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
    const ev = shiftVeh(SA.V.battleCopy(opts.enemyVehicle, opts.hpMul || 1, true), frontShift(opts.enemyVehicle));
    B = { opts, pShift, bounds: opts.bounds || null, ter: makeTerrain(opts.terrain), t: 0, shots: [], parts: [], texts: [], shake: 0, aim: null, ending: 0, done: false, hudT: 0, ramCd: 0, contact: false,
      speed: view ? view.gameSpeed() : K.GAME_SPEED, keys: { left: false, right: false, fire: false }, cam: { x: 0, y: 0, z: 1, w: W, h: H }, aimScreen: null };
    B.p = makeSide(pv, d.vehicle.name, false, 1, W / 2 - 200 - PADX - K.COLS * C);
    B.e = makeSide(ev, opts.enemyName, true, opts.aim || 0.9, W / 2 + 200 - PADX);
    B.e.style = opts.style || null;
    B.e.boss = !!opts.boss;
    return B;
  }

  function start(opts) {
    // 已取消的遭遇战不能从旧页面或脚本绕过出战入口启动。
    if (opts?.mode === 'side') return false;
    // 发行版在实际开战入口再次核对关卡，防止旧页面启动未开放章节。
    if (SA.RELEASE && opts?.mode === 'campaign') {
      const key = /^(\d+),(\d+)$/.exec(String(opts.storyKey || ''));
      if (!key || !SA.Camp.stage(Number(key[1]), Number(key[2]))) return false;
    }
    if (!view) throw new Error('BattleView 未加载');
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
        metrics: { ...B.metrics }, timeout: B.timeout || null };
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
      reason: draw ? B.draw : win ? `「${B.e.name}」${B.e.reason}` : `你的「${B.p.name}」${B.p.reason}`, surrendered: win && B.surrender === 'accepted',
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
          if (!row || !['好玩', '无聊', '不公平'].includes(value)) return false;
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
      metrics: { distanceSum: 0, samples: 0, nearTime: 0, farTime: 0, noEngageTime: 0 },
      speed: 1, keys: { left: false, right: false, fire: false }, cam: { x: 0, y: 0, z: 1, w: W, h: H }, aimScreen: null };
    try {
      const profileAim = Number.isFinite(o.aiProfile?.aim) ? o.aiProfile.aim : null;
      B.p = makeSide(shiftVeh(SA.V.battleCopy(o.p, 1, true), pS), 'A', true, profileAim ?? o.pAim ?? 0.8, W / 2 - 200 - PADX - K.COLS * C);
      B.p.style = o.pStyle || null;
      B.p.aiProfile = o.aiProfile || null;
      B.e = makeSide(shiftVeh(SA.V.battleCopy(o.e, 1, true), eS), 'B', true, profileAim ?? o.eAim ?? 0.8, W / 2 + 200 - PADX);
      B.e.style = o.eStyle || null;
      B.e.aiProfile = o.aiProfile || null;
      B.e.boss = !!o.eBoss;
      const dt = o.dt || 1 / 30;
      while (!B.done && B.t < K.BATTLE_TIME + 10) step(dt);
      return B.result || { winner: 'draw', t: B.t, reason: '超时', pDealt: B.p.dealt, eDealt: B.e.dealt, effectStats: { p: B.p.effects, e: B.e.effects }, events: { p: B.p.events, e: B.e.events }, metrics: { ...B.metrics } };
    } finally { B = keep; random = previousRandom; }
  }

  // 调试：预览环境里 rAF 可能不跑，可手动推进
  const debug = {
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
    muzzle, targetAt, aimAngle, spreadDeg, shakeOf, barrel, predict, tiltOf, pivY, toWorld, modBox, frontShift, shiftVeh, tetherState,
    vent, retreat, acceptSurrender, refuseSurrender, surrenderState, advanceSurrender, skipSurrenderAnimation,
    emit: (type, data) => emit(type, data),
  });
  return { start, ...(!SA.RELEASE ? { startState, simulate, debug } : {}), ricochetChance, emit, tetherState, vent, retreat, acceptSurrender, refuseSurrender, surrenderState, advanceSurrender, skipSurrenderAnimation };
})();
