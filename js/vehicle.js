// 载具模型：子格网格、两层（主体/侧挂）、摆放规则、属性计算、分享码
// 子格 24px，全车 16 列 × 12 行；模块只记在左上角那一格（锚点），占 SA.fp(id) = w×h 个子格。
// 「占格表」occ() 把每个子格指向盖住它的模块，摆放、连通、遮挡、点选都查它
window.SA = window.SA || {};

SA.V = (() => {
  const K = SA.K, M = SA.MODULES;
  // 武器组次序决定默认手操组及其余驾驶员的接管顺序，战斗和纸面预计统一使用。
  const GROUP_ORDER = ['cannon', 'cannon_m', 'mortar', 'mortar_s', 'mg', 'mg2', 'side_cannon',
    'cannon_s', 'cannon_heavy', 'cannon_giant', 'rocket_rack', 'harpoon', 'flamer', 'steamjet', 'mg_s', 'mg_heavy', 'knight_cannon', 'knight_gun'];
  const grid = () => Array.from({ length: K.ROWS }, () => Array(K.COLS).fill(null));
  // 全部车间统一开放物理底图：返回独立的大格尺寸对象，不扩充底层子格数组。
  const fullGrid = () => ({ cols: K.COLS / 2, rows: K.ROWS / 2 });
  // av：铁装甲的数据版本。2026-09-28 铁装甲从 2×2 改成竖着的 1×2；没有 av 的旧数据读进来时由 widenArmor 拆成并排两块
  const ARMOR_VER = 2;
  // pv：加压舱占格版本。旧车未记录 pv，表示仍按 1×1 摆放，读入后迁移到 1×2。
  const PRESSURE_VER = 2;
  const MOVED_TO_SIDE = new Set(['boss_lens', 'periscope', 'autoloader', 'rangefinder', 'gyroscope']);
  const create = (name = SA.Config.text("state_3a7baff38a97")) => ({ name, body: grid(), side: grid(), av: ARMOR_VER, pv: PRESSURE_VER, lim: fullGrid() });
  const layerOf = (id) => (M[id].layer === 'side' ? 'side' : 'body');
  // 满耐久：改装（炮盾 / 附加装甲）每级按比例加；参战副本直接带 max
  const maxHp = (cell, v = null) => cell.max || Math.round((v ? SA.modForVehicle(cell, v) : SA.mod(cell)).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
  const alive = (cell) => cell && cell.hp > 0;
  const fp = SA.fp;
  const CH = K.ROWS - 2;   // 履带 / 四足的锚点行：占最底下两行子格
  // 底盘锚点行 = 贴底：真双足 2×4（胯一层 + 腿区一层）锚在第 ROWS-4 行，其余底盘在 CH（docs/collab.md §5 2026-09-26）
  const chassisRow = (id) => K.ROWS - fp(id).h;
  // 旧蓝图可能把整件底盘写成多个逐格锚点；读取时统一成一个底盘整件。
  function chassisAnchors(v) {
    const out = [];
    for (let r = 0; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) {
      const cell = v.body[r][c];
      if (cell && M[cell.id] && M[cell.id].layer === 'chassis') out.push({ cell, r, c });
    }
    return out;
  }
  function normalizeChassis(v) {
    const a = chassisAnchors(v);
    if (!a.length) return v;
    // 履带仍可由多个同类锚点组成；整件双足只能保留一个；整件四足可以多件相连（chain），旧的逐格四足（2 宽锚点）
    // 读进来会互相重叠，从左往右只保留不重叠、放得下的那些。混用时优先保留整件底盘。
    const whole = a.find(x => M[x.cell.id].whole);
    const type = whole ? whole.cell.id : a[0].cell.id;
    if (type === 'biped') return liftForBiped(v, a);
    let keptWhole = false, end = -1;
    for (const x of a) {
      const m = M[type], w = fp(type).w;
      if (x.cell.id !== type || (m.whole && x.r !== chassisRow(type)) || (m.chassisLimit === 1 && keptWhole) || (m.chain && (x.c < end || x.c + w > K.COLS))) v.body[x.r][x.c] = null;
      else { if (m.chassisLimit === 1) keptWhole = true; if (m.chain) end = x.c + w; }
    }
    return v;
  }
  // 真双足只保留一个 2×4 整件。旧格式（逐格双足、1×2 双足，锚在第 CH 行）：原来的底盘行变成胯层，腿区加在下面——
  // 整车往上移一层（最高一层放不下的丢掉），保留中间那一格的位置作胯（true-biped.md §8 迁移）
  function liftForBiped(v, a) {
    const want = chassisRow('biped'), bip = a.filter(x => x.cell.id === 'biped').sort((p, q) => p.r - q.r || p.c - q.c);
    const keep = bip.find(x => x.r === want) || bip[Math.floor((bip.length - 1) / 2)];
    for (const x of a) v.body[x.r][x.c] = null;
    const dr = keep.r - want;
    // 旧加压舱扩高与旧双足抬升同时发生时，不能让底盘清场/顶部裁剪先吞掉加压舱。
    const preservePressure = (cell, r, c) => {
      if (cell?.id === 'pressure_chamber') (v.pressureMoves || (v.pressureMoves = [])).push({ cell, r, c });
    };
    if (dr > 0) for (const layer of ['body', 'side']) {
      const L = v[layer];
      for (let r = 0; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) {
        const cell = L[r][c];
        if (!cell) continue;
        L[r][c] = null;
        if (r - dr >= 0) L[r - dr][c] = cell;
        else preservePressure(cell, r - dr, c);
      }
    }
    // 迁移时胯放在车身重心正下方（旧车身往往好几格宽，直接用原来的某一格会失衡、走不动）
    let mx = 0, mw = 0;
    if (dr > 0) each(v, (cell, r, c, layer) => { if (layer === 'body' && !SA.isRam(cell.id)) { const w = SA.weightOf(cell); mx += w * (c + fp(cell.id).w / 2); mw += w; } });
    const c0 = Math.max(0, Math.min(K.COLS - 2, mw ? Math.round(mx / mw - 1) : keep.c)), f = fp('biped');
    const O = occ(v, 'body');
    if (dr > 0) {   // 只在迁移旧格式时清场；新格式里放错的模块留着，由 issues() 标红
      for (const [rr, cc] of box(want, c0, f.w, f.h)) { const o = O[rr][cc]; if (o && v.body[o.r][o.c]) { preservePressure(o.cell, o.r, o.c); v.body[o.r][o.c] = null; } }   // 压在胯 / 腿区上的模块让位
      for (let r = want + 2; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) if (v.body[r][c]) { preservePressure(v.body[r][c], r, c); v.body[r][c] = null; }   // 腿区不能放模块
    }
    delete keep.cell.bipedZones;
    v.body[want][c0] = keep.cell;
    // 旧车挂在躯干上的撞击件：双足的撞击件只能在胯层，迁移时挪到胯正前方（放得下就挪，放不下留在原处由 issues() 标红）
    if (dr > 0) each(v, (cell, r, c, layer) => {
      if (layer !== 'body' || !SA.isRam(cell.id) || (r >= want && r + fp(cell.id).h <= want + 2)) return;
      v.body[r][c] = null;
      if (canPlace(v, cell.id, want, c0 + 2, cell).ok) v.body[want][c0 + 2] = cell; else v.body[r][c] = cell;
    });
    return v;
  }
  const inGrid = (r, c) => r >= 0 && r < K.ROWS && c >= 0 && c < K.COLS;
  const fits = (r, c, w, h) => r >= 0 && c >= 0 && r + h <= K.ROWS && c + w <= K.COLS;
  const box = (r, c, w, h) => { const out = []; for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) out.push([r + i, c + j]); return out; };
  // 紧贴模块外圈的子格（上下左右，不含对角）
  const ring = (r, c, w, h) => {
    const out = [];
    for (let j = 0; j < w; j++) out.push([r - 1, c + j], [r + h, c + j]);
    for (let i = 0; i < h; i++) out.push([r + i, c - 1], [r + i, c + w]);
    return out.filter(([rr, cc]) => inGrid(rr, cc));
  };

  // 占格表：每个子格 → { cell, r, c }（盖住它的模块和锚点），没有就是 null
  function occ(v, layer = 'body') {
    const g = grid(), L = v[layer];
    for (let r = 0; r < K.ROWS; r++)
      for (let c = 0; c < K.COLS; c++) {
        const cell = L[r][c];
        if (!cell) continue;
        const ref = { cell, r, c };
        for (const [rr, cc] of box(r, c, fp(cell.id).w, fp(cell.id).h)) if (inGrid(rr, cc)) g[rr][cc] = ref;
      }
    return g;
  }
  // 某个子格上是哪个模块（点选用）
  const at = (v, layer, r, c) => (inGrid(r, c) ? occ(v, layer)[r][c] : null);

  // 大格关卡字母。新模块只占用未使用字母；未完成专用美术时由 sprites.js 的 art 借形显示。
  const ASCII = {
    T: 'track', Q: 'quad', B: 'biped', K: 'cockpit', k: 'helmet', A: 'armor', H: 'armor_heavy', C: 'cannon', P: 'mortar',
    M: 'mg', O: 'boiler', W: 'water', S: 'side_cannon', U: 'bucket', X: 'spike', Y: 'piston', V: 'copilot',
    L: 'cannon_s', R: 'cannon_heavy', G: 'rocket_rack', J: 'harpoon', F: 'flamer', N: 'pressure_tank',
    D: 'pressure_chamber', E: 'condenser', I: 'boss_core', Z: 'boss_lens', a: 'mortar_s', b: 'mg2', c: 'steamjet', d: 'periscope', e: 'autoloader', f: 'rangefinder', g: 'gyroscope'
  };

  // 关卡 / 官方蓝图的 ASCII 按大格写（6 行 × 8 列，一个字符 = 一个 2×2 模块），锚点换算成子格 (2r, 2c)
  // mt：整车材料；sides / elite 也用大格坐标。elite：个别格子的材料 [[r, c, mt, 'side'?], ...]（Boss 身上的史诗件）
  // subs：子格上的小模块 [[r, c, id], ...]（子格坐标）。
  // 模块要求的材料比整车高（黄铜车上的直射火炮）时换成 lowAlt（中炮）：小一号的替代品贴着大格的底边和车头一侧，
  // 上面还压着模块时，大格里剩下的子格用甲片补上，保证上层照样连得到底盘
  function fromAscii(name, rows, sides = [], mt = 1, elite = [], subs = []) {
    const v = create(name);
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const id0 = ASCII[row[c]];
        if (!id0) continue;
        if (id0 === 'armor') { v.body[r * 2][c * 2] = SA.newCell(id0, mt); v.body[r * 2][c * 2 + 1] = SA.newCell(id0, mt); continue; }   // 字母 A = 一个大格 = 并排两块 1×2
        if (mt >= SA.minMt(id0) || !M[id0].lowAlt) { v[layerOf(id0)][r * 2][c * 2] = SA.newCell(id0, mt); continue; }
        const id = M[id0].lowAlt, f = fp(id), rr = r * 2 + 2 - f.h, cc = c * 2 + 2 - f.w;
        v[layerOf(id)][rr][cc] = SA.newCell(id, mt);
        if (r > 0 && ASCII[(rows[r - 1] || '')[c]])
          for (const [pr, pc] of box(r * 2, c * 2, 2, 2)) if (pr < rr || pc < cc) v.body[pr][pc] = SA.newCell('plate', mt);
      }
    });
    for (const [r, c, id] of subs) v[layerOf(id)][r][c] = SA.newCell(id, mt);
    sides.forEach(([r, c]) => { v.side[r * 2][c * 2] = SA.newCell('side_cannon', mt); });
    for (const [r, c, t, layer] of elite) {
      const L = v[layer || 'body'], cell = L[r * 2][c * 2];
      if (!cell) continue;
      L[r * 2][c * 2] = SA.newCell(cell.id, t);
      if (cell.id === 'armor' && L[r * 2][c * 2 + 1] && L[r * 2][c * 2 + 1].id === 'armor') L[r * 2][c * 2 + 1] = SA.newCell('armor', t);
    }
    return migratePressure(normalizeChassis(v), true);
  }
  // 旧数据里的一块 2×2 铁装甲 → 并排两块 1×2（右边那块复制材料、改装和耐久），占满原来的格子
  function widenArmor(v) {
    const O = occ(v, 'body'), add = [];
    for (let r = 0; r < K.ROWS - 1; r++) for (let c = 0; c < K.COLS - 1; c++) {
      const cell = v.body[r][c];
      if (cell && cell.id === 'armor' && !O[r][c + 1] && !O[r + 1][c + 1]) add.push([r, c, cell]);
    }
    for (const [r, c, cell] of add) v.body[r][c + 1] = JSON.parse(JSON.stringify(cell));
    v.av = ARMOR_VER;
    return v;
  }
  // 大格网格（6 × 8，每格一个模块对象）→ 子格载具
  function fromBig(name, body, side, lim) {
    const v = create(name);
    v.pv = undefined;
    if (lim) v.lim = lim;
    for (const [layer, g] of [['body', body], ['side', side || []]])
      g.forEach((row, r) => row.forEach((cell, c) => { if (cell) v[layer][r * 2][c * 2] = SA.fixCell(cell); }));
    return migratePressure(migrateSide(normalizeChassis(widenArmor(v))));
  }
  // 只迁移本次换层的五种旧主体件；原位置侧挂已被占用时退库，避免覆盖现有模块。
  function migrateSide(v) {
    const moved = [];
    each(v, (cell, r, c, layer) => { if (layer === 'body' && MOVED_TO_SIDE.has(cell.id)) moved.push({ cell, r, c }); });
    for (const { cell, r, c } of moved) {
      v.body[r][c] = null;
      const f = fp(cell.id);
      if (fits(r, c, f.w, f.h) && free(v, 'side', r, c, f.w, f.h)) v.side[r][c] = cell;
      else (v.migrationStock || (v.migrationStock = [])).push(cell);
    }
    return v;
  }
  // 旧存档（6 × 8 大格）→ 子格；所有读入车辆解除旧战役扩建限位。
  function migrate(v) {
    if (!v || !v.body) return v;
    const out = v.body.length === K.ROWS ? migratePressure(migrateSide(normalizeChassis(v.av ? v : widenArmor(v)))) : fromBig(v.name, v.body, v.side);
    out.lim = fullGrid();
    return out;
  }

  // 通用显式限位接口（大格数），供规则工具检查；实际车间和加载入口统一使用 fullGrid。
  function region(v) {
    const L = v && v.lim;
    if (!L) return { c0: 0, c1: K.COLS - 1, r0: 0 };
    const c0 = 2 * Math.floor((K.COLS / 2 - L.cols) / 2);
    return { c0, c1: c0 + 2 * L.cols - 1, r0: K.ROWS - 2 * L.rows };
  }
  const inRegion = (v, r, c) => { const g = region(v); return r >= g.r0 && c >= g.c0 && c <= g.c1; };
  const boxInRegion = (v, r, c, w, h) => inRegion(v, r, c) && inRegion(v, r + h - 1, c + w - 1);
  const LOCKED = SA.Config.text("vehicle_bd09be8e512a");

  function each(v, fn) {
    for (const layer of ['body', 'side'])
      for (let r = 0; r < K.ROWS; r++)
        for (let c = 0; c < K.COLS; c++)
          if (v[layer][r][c]) fn(v[layer][r][c], r, c, layer);
  }

  const isRamCell = (cell) => cell && SA.isRam(cell.id);
  const mountText = (m) => SA.Config.text("vehicle_00ad5972b1d4", `${m.name}`, `${m.mount.map(x => M[x].name).join('/')}`);
  const CLEARANCE = '抛射型火炮上方必须留空';
  // 高抛炮从炮顶垂直出膛；主体实体在其水平投影上方会挡住炮口，侧挂层不占炮口空间。
  // 候选件既可能是炮，也可能是后来加在炮顶的遮挡件；ignore 用于检查已放入的自身。
  function clearanceBlocked(v, id, r, c, layer, ignore = null, liveOnly = false) {
    if (layer !== 'body') return false;
    const f = fp(id);
    let blocked = false;
    each(v, (other, or, oc, ol) => {
      if (blocked || ol !== 'body' || (liveOnly && !alive(other)) || (ignore && ignore.layer === ol && ignore.r === or && ignore.c === oc)) return;
      if (c >= oc + fp(other.id).w || oc >= c + f.w) return;
      if ((M[id].arc === 'high' && or < r) || (M[other.id].arc === 'high' && r < or)) blocked = true;
    });
    return blocked;
  }
  // 真双足：锚在第 ROWS-4 行的 2×4 整件；胯层 = 锚点那两行，腿区 = 下面两行（不能放任何模块）
  const bipedOf = (v) => chassisAnchors(v).find(x => x.cell.id === 'biped' && x.r === chassisRow('biped')) || null;
  // 近侧小腿位和胯位各一格；另一列留给骨架，不允许同类重复挂装。
  function legMount(v, id, r, c) {
    const a = bipedOf(v), m = M[id];
    if (!a || !m.legPart || c !== a.c || r !== a.r + (m.legSlot === 'shin' ? 3 : 0)) return null;
    return a;
  }
  // 机甲头盔下面才是肩膀（用户 2026-10-05，Opus 按用户要求加）：车上有机甲头盔时，骑士手臂整条都要在头盔那一行下面，
  // 不能盖住头盔，也不能和头盔并排。helmBottom = 机甲头盔底边的下一行（没有头盔为 -1）
  function helmBottom(v) { let b = -1; for (let r = 0; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) { const x = v.body[r][c]; if (x && x.id === 'mech_helm') b = Math.max(b, r + fp(x.id).h); } return b; }
  const armAboveHelm = (v, id, r, hb = helmBottom(v)) => !!M[id].knight && hb >= 0 && r < hb;
  function armsAtOrAbove(v, row) { for (let r = 0; r < Math.min(row, K.ROWS); r++) for (let c = 0; c < K.COLS; c++) { const x = v.side[r][c]; if (x && M[x.id].knight) return true; } return false; }
  // 骑士手臂可覆盖多块车体并伸出边缘；至少贴住一个主体，腿区只容许专用腿件。
  function knightHosts(v, id, r, c, O = occ(v, 'body')) {
    if (!M[id].knight) return [];
    const f = fp(id), refs = [...box(r, c, f.w, f.h), ...ring(r, c, f.w, f.h)]
      .map(([rr, cc]) => inGrid(rr, cc) && O[rr][cc]).filter(Boolean);
    return refs.filter((o, i) => M[o.cell.id].layer === 'body' && refs.findIndex(x => x.r === o.r && x.c === o.c) === i);
  }
  // 战斗每帧可读取有效挂件：损毁、摆错位置和失去腿骨架时能力立即消失。
  function bipedParts(v) {
    const a = bipedOf(v), bipedClass = a ? SA.uniqueRule(a.cell)?.bipedClass || 'standard' : 'standard';
    const rule = K.BIPED_CLASSES[bipedClass], out = { kind: a ? 'biped' : null, bipedClass, spring: [], booster: [], speedBoost: 1, jumpHeight: rule.jumpHeight, crouchStability: rule.crouchStability };
    if (!a || !alive(a.cell) || (a.cell.bipedZones && (a.cell.bipedZones.hip <= 0 || a.cell.bipedZones.leg <= 0))) return out;
    each(v, (cell, r, c, layer) => {
      const m = M[cell.id];
      if (layer === 'side' && alive(cell) && m.legPart && legMount(v, cell.id, r, c)) out[m.legPart].push({ cell, r, c, layer });
    });
    if (out.booster.length) out.speedBoost = SA.mod(out.booster[0].cell).speedMul;
    return out;
  }
  // 底盘保留区从哪一行开始：双足占最底下两层（4 行），其余底盘两行
  const floorRow = (v) => (bipedOf(v) ? chassisRow('biped') : CH);
  // 腰挂位：胯层左右各 1 大格（2 子格宽），模块整个落在里面才算
  function bipedWaist(v, r, c, w, h) {
    const a = bipedOf(v);
    if (!a || r < a.r || r + h > a.r + 2) return false;
    return (c >= a.c - 2 && c + w <= a.c) || (c >= a.c + 2 && c + w <= a.c + 4);
  }
  // 骑士手臂允许从躯干跨入腰胯，也可覆盖胯本体；底边不能越过胯底进入腿区。
  // 横向支撑和侧挂冲突继续独立检查，普通侧挂件仍遵循原腰挂位矩形限制。
  const knightHip = (v, id, r, h) => !!M[id].knight && !!bipedOf(v) && r + h <= floorRow(v) + 2;
  // 模块类别与实例改造统一判定专属限制，头盔仍不触发手臂宿主规则。
  const bipedOnly = (id, cell = null) => SA.isBipedOnly(cell || { id });
  const KNIGHT_ONLY = '骑士组件及骑士改造件为双足专属，不能安装在其他底盘上';
  // 只允许三种实体装甲贴在连续履带/四足链的整体端部，向下伸入底盘保留区。
  // 位置判定同时供摆放、出战连通和速度计算使用，避免链内接缝被误认成车头/车尾。
  function endArmorSide(v, id, r, c) {
    if (!['plate', 'armor', 'armor_heavy'].includes(id)) return null;
    const { w, h } = fp(id), floor = floorRow(v);
    if (r + h <= floor || r >= CH + 2 || r + h <= CH) return null;
    const anchors = chassisAnchors(v).sort((a, b) => a.c - b.c);
    if (!anchors.length || !['track', 'quad'].includes(anchors[0].cell.id)) return null;
    const type = anchors[0].cell.id, width = fp(type).w;
    if (anchors.some((x, i) => x.cell.id !== type || x.r !== CH || (i && x.c !== anchors[i - 1].c + width))) return null;
    if (c + w === anchors[0].c) return 'rear';
    if (c === anchors[anchors.length - 1].c + width) return 'front';
    return null;
  }
  // 每侧只计算一次 30% 罚速；战斗中只看仍有耐久的装甲，击毁后即时恢复。
  function armorSpeedFactor(v) {
    const sides = new Set();
    each(v, (cell, r, c, layer) => {
      if (layer !== 'body' || !alive(cell)) return;
      const side = endArmorSide(v, cell.id, r, c);
      if (side) sides.add(side);
    });
    return 1 - sides.size * 0.3;
  }
  const inHipRows = (v, r, h) => { const a = bipedOf(v); return !!a && r >= a.r && r + h <= a.r + 2; };
  // 这几行里，锚点左边有没有撞击件（撞击件前方不能再放东西）
  const ramBehind = (O, r, c, h) => { for (let i = 0; i < h; i++) for (let k = 0; k < c; k++) if (O[r + i][k] && isRamCell(O[r + i][k].cell)) return true; return false; };
  // 这几行里，模块右边还有没有东西（撞击件必须是最前端）
  const anyAhead = (O, r, c, w, h) => { for (let i = 0; i < h; i++) for (let k = c + w; k < K.COLS; k++) if (O[r + i][k]) return true; return false; };
  // 紧贴在模块正后方（左边一列）的模块
  const behind = (O, r, c, h) => { const out = []; if (c > 0) for (let i = 0; i < h; i++) { const o = O[r + i][c - 1]; if (o && !out.includes(o)) out.push(o); } return out; };

  // 侧挂必须完整落在同一主体模块上；常规挂件只认实体装甲，装弹机只认足够大的兼容武器。
  function sideHost(v, id, r, c, O = occ(v, 'body')) {
    if (M[id].legPart) return legMount(v, id, r, c);
    if (M[id].knight) return knightHosts(v, id, r, c, O)[0] || null;
    const f = fp(id), refs = box(r, c, f.w, f.h).map(([rr, cc]) => inGrid(rr, cc) && O[rr][cc]);
    const host = refs[0];
    if (!host || refs.some(o => !o || o.r !== host.r || o.c !== host.c)) return null;
    const hf = fp(host.cell.id), hm = M[host.cell.id];
    if (r < host.r || c < host.c || r + f.h > host.r + hf.h || c + f.w > host.c + hf.w) return null;
    if (id !== 'autoloader') return ['plate', 'armor', 'armor_heavy'].includes(host.cell.id) ? host : null;
    if (hm.layer !== 'body' || !hm.dmg || hf.w * hf.h < 2) return null;
    if (['rocket_rack', 'steamjet', 'flamer'].includes(host.cell.id)
      || /rocket|steam|flame/.test(`${hm.proj || ''} ${hm.special || ''}`)) return null;
    return host;
  }
  // 同一门武器上的装弹机可叠加；损毁的装弹机不再提供倍率。
  function weaponReloadMul(v, r, c, layer = 'body') {
    if (layer !== 'body') return 1;
    let mul = 1;
    each(v, (cell, sr, sc, sl) => {
      if (sl !== 'side' || cell.id !== 'autoloader' || !alive(cell)) return;
      const host = sideHost(v, cell.id, sr, sc);
      if (host && host.r === r && host.c === c) mul *= SA.mod(cell).reloadMul || 1;
    });
    return mul;
  }

  // 严格摆放：这个位置是否合规（能连上、不悬空）
  function canPlace(v, id, r, c, cell = null) {
    const m = M[id], { w, h } = fp(id);
    const no = (reason) => ({ ok: false, reason });
    if (!fits(r, c, w, h)) return no(SA.Config.text("vehicle_7230b6f9f8a8"));
    if (!boxInRegion(v, r, c, w, h)) return no(LOCKED);
    if (bipedOnly(id, cell) && !bipedOf(v)) return no(KNIGHT_ONLY);
    if (clearanceBlocked(v, id, r, c, layerOf(id))) return no(CLEARANCE);
    const O = occ(v, 'body'), cells = box(r, c, w, h);
    if (m.layer === 'side') {
      if (r + h > floorRow(v) && !legMount(v, id, r, c) && !bipedWaist(v, r, c, w, h) && !knightHip(v, id, r, h)) return no(SA.Config.text("vehicle_790b7c4b3a97"));
      const S = occ(v, 'side');
      if (cells.some(([rr, cc]) => S[rr][cc])) return no(SA.Config.text("vehicle_3ef702ab6894"));
      if (armAboveHelm(v, id, r)) return no('骑士手臂要装在机甲头盔下面（肩膀在胸口），不能盖住头盔或和头盔并排');
      if (!sideHost(v, id, r, c, O)) return no(id === 'autoloader' ? '装弹机只能挂在至少 1×2 的火炮上，不能挂火箭、蒸汽、喷火或近战武器' : '侧挂必须完整挂在同一块足够大的装甲上');
      return { ok: true };
    }
    if (cells.some(([rr, cc]) => O[rr][cc])) return no(SA.Config.text("vehicle_45f9e24da252"));
    if (m.layer === 'ram') {
      if (bipedOf(v) && !inHipRows(v, r, h)) return no(SA.Config.text("vehicle_4eee3911ae77"));
      if (!behind(O, r, c, h).some(o => m.mount.includes(o.cell.id))) return no(mountText(m));
      if (anyAhead(O, r, c, w, h)) return no(SA.Config.text("vehicle_1aaaf5795430"));
      return { ok: true };
    }
    if (m.layer === 'chassis') {
      if (r !== chassisRow(id)) return no(SA.Config.text("vehicle_3ad9ab98b50f", `${m.name}`));
      const chassis = chassisAnchors(v);
      if (chassis.some(x => x.cell.id !== id)) return no(SA.Config.text("vehicle_2d644a62c152"));
      if (m.chassisLimit === 1 && chassis.some(x => x.cell.id === id)) return no(SA.Config.text("vehicle_8349bca866a2"));
      if (m.chain && chassis.length && !chassis.some(x => x.c + w === c || c + w === x.c)) return no(SA.Config.text("vehicle_080e3f8388ac", `${m.name}`));
      if (ramBehind(O, r, c, h)) return no(SA.Config.text("vehicle_7da5b5f98f49"));
      return { ok: true };
    }
    if (r + h > floorRow(v) && !bipedWaist(v, r, c, w, h) && !endArmorSide(v, id, r, c)) return no(bipedOf(v) ? SA.Config.text("vehicle_c7a7f2dde86c") : SA.Config.text("vehicle_1aaebea2f8b1"));
    // 外圈只要挨着一个（非撞击件的）模块就能塞进去；是否一路连到底盘由 issues() 检查
    const near = ring(r, c, w, h).map(([rr, cc]) => O[rr][cc]).filter(Boolean);
    if (!near.length) return no(SA.Config.text("vehicle_08441cb986b1"));
    if (near.every(o => isRamCell(o.cell))) return no(SA.Config.text("vehicle_772300b88a8a"));
    if (ramBehind(O, r, c, h)) return no(SA.Config.text("vehicle_7da5b5f98f49"));
    if (id === 'mech_helm' && armsAtOrAbove(v, r + h)) return no('机甲头盔这一行及以上已经挂着骑士手臂：先把手臂挪到头盔下面');
    return { ok: true };
  }

  function place(v, id, r, c, mt = SA.minMt(SA.liveId(id))) {
    const chk = canPlace(v, id, r, c);
    if (chk.ok) v[layerOf(id)][r][c] = SA.newCell(id, mt);
    return chk;
  }

  // ---------- 改装台上的自由摆放：出战前允许悬空、乱放，出战时再由 issues() 把关 ----------
  const hurt = (x) => x && x.hp > 0 && x.hp < maxHp(x);
  // 同一层这块地方有没有空
  const free = (v, layer, r, c, w, h) => { const O = occ(v, layer); return box(r, c, w, h).every(([rr, cc]) => !O[rr][cc]); };

  // 只检查位置是否空着；返回 { ok, reason, fit }，fit 表示这个位置是否已经合规
  function canPut(v, id, r, c, cell = null) {
    const { w, h } = fp(id), layer = layerOf(id);
    if (!fits(r, c, w, h)) return { ok: false, reason: SA.Config.text("vehicle_7230b6f9f8a8") };
    if (!boxInRegion(v, r, c, w, h)) return { ok: false, reason: LOCKED };
    if (clearanceBlocked(v, id, r, c, layer)) return { ok: false, reason: CLEARANCE };
    if (!free(v, layer, r, c, w, h)) return { ok: false, reason: layer === 'side' ? SA.Config.text("vehicle_3ef702ab6894") : SA.Config.text("vehicle_45f9e24da252") };
    // 自由摆放保留 ok/fit 语义，但实例骑士改造必须参与合规判定，不能只按基础 id 检查。
    const chk = canPlace(v, id, r, c, cell);
    return { ok: true, fit: chk.ok, reason: chk.reason };
  }

  function put(v, id, r, c, mt = SA.minMt(SA.liveId(id))) {
    const chk = canPut(v, id, r, c);
    if (chk.ok) v[layerOf(id)][r][c] = SA.newCell(id, mt);
    return chk;
  }

  // 挂在某个主体模块上的侧炮：侧炮整个落在这个模块范围里（拆 / 搬主体模块时跟着走）
  function ridersOf(v, r, c) {
    const cell = v.body[r][c];
    if (!cell) return [];
    const f = fp(cell.id), out = [];
    each(v, (sc, sr, scc, layer) => {
      if (layer !== 'side') return;
      const g = fp(sc.id);
      if (sr >= r && scc >= c && sr + g.h <= r + f.h && scc + g.w <= c + f.w) out.push({ cell: sc, dr: sr - r, dc: scc - c });
    });
    return out;
  }

  // 拆下：主体模块连同挂在它上面的侧炮一起拆；上方的模块留在原地悬空。(r, c) 是锚点
  // 受损模块要先修理；报废模块直接清除（由调用方回收残值）
  function remove(v, layer, r, c) {
    const cell = inGrid(r, c) && v[layer][r][c];
    if (!cell) return { ok: false, reason: SA.Config.text("vehicle_d2156defb0c9") };
    const riders = layer === 'body' ? ridersOf(v, r, c) : [];
    if (hurt(cell) || riders.some(x => hurt(x.cell))) return { ok: false, reason: SA.Config.text("vehicle_469eb834c128") };
    const out = [cell];
    for (const x of riders) { out.push(x.cell); v.side[r + x.dr][c + x.dc] = null; }
    v[layer][r][c] = null;
    return { ok: true, removed: out };
  }

  // 移动：把锚点 (r1, c1) 的模块搬到锚点 (r2, c2)。目标位置正好压着另一个模块就对调（对方搬到原位，放得下才行）
  // 主体模块连同挂在它上面的侧炮一起搬
  function move(v, layer, r1, c1, r2, c2) {
    if (!inGrid(r1, c1) || !inGrid(r2, c2)) return { ok: false, reason: SA.Config.text("vehicle_7230b6f9f8a8") };
    if (r1 === r2 && c1 === c2) return { ok: false, reason: '' };
    const cell = v[layer][r1][c1];
    if (!cell) return { ok: false, reason: SA.Config.text("vehicle_d2156defb0c9") };
    const { w, h } = fp(cell.id);
    if (!fits(r2, c2, w, h)) return { ok: false, reason: SA.Config.text("vehicle_7230b6f9f8a8") };
    if (!boxInRegion(v, r2, c2, w, h)) return { ok: false, reason: LOCKED };
    const lift = (r, c) => {
      const riders = layer === 'body' ? ridersOf(v, r, c) : [];
      const it = { cell: v[layer][r][c], riders };
      v[layer][r][c] = null;
      for (const x of riders) v.side[r + x.dr][c + x.dc] = null;
      return it;
    };
    const drop = (it, r, c) => {
      v[layer][r][c] = it.cell;
      for (const x of it.riders) v.side[r + x.dr][c + x.dc] = x.cell;
    };
    const blockedMove = (it, r, c) => clearanceBlocked(v, it.cell.id, r, c, layer, { layer, r, c })
      || it.riders.some(x => clearanceBlocked(v, x.cell.id, r + x.dr, c + x.dc, 'side', { layer: 'side', r: r + x.dr, c: c + x.dc }));
    const a = lift(r1, c1);
    const O = occ(v, layer);
    const hits = [];
    for (const [rr, cc] of box(r2, c2, w, h)) { const o = O[rr][cc]; if (o && !hits.includes(o)) hits.push(o); }
    if (!hits.length) {
      drop(a, r2, c2);
      if (!blockedMove(a, r2, c2)) return { ok: true, swapped: false };
      v[layer][r2][c2] = null; for (const x of a.riders) v.side[r2 + x.dr][c2 + x.dc] = null;
      drop(a, r1, c1);
      return { ok: false, reason: CLEARANCE };
    }
    if (hits.length > 1) { drop(a, r1, c1); return { ok: false, reason: SA.Config.text("vehicle_33e9896fda49") }; }
    const X = hits[0], xf = fp(X.cell.id);
    const b = lift(X.r, X.c);
    // 先放搬过去的，再看对方能不能放回原位
    if (free(v, layer, r2, c2, w, h) && fits(r1, c1, xf.w, xf.h) && boxInRegion(v, r1, c1, xf.w, xf.h)) {
      drop(a, r2, c2);
      if (free(v, layer, r1, c1, xf.w, xf.h)) {
        drop(b, r1, c1);
        if (!blockedMove(a, r2, c2) && !blockedMove(b, r1, c1)) return { ok: true, swapped: true };
        v[layer][r1][c1] = null; for (const x of b.riders) v.side[r1 + x.dr][c1 + x.dc] = null;
      }
      v[layer][r2][c2] = null; for (const x of a.riders) v.side[r2 + x.dr][c2 + x.dc] = null;
    }
    drop(b, X.r, X.c); drop(a, r1, c1);
    return { ok: false, reason: SA.Config.text("vehicle_2189a813bf25", `${M[X.cell.id].name}`) };
  }

  // 整车只横移：先检查主层与侧挂层的全部占格，再一次替换锚点表；失败时原车完全不变。
  function translate(v, dc) {
    if (!Number.isInteger(dc) || dc === 0) return { ok: false, reason: '' };
    const body = grid(), side = grid(), used = { body: new Set(), side: new Set() };
    let reason = '';
    each(v, (cell, r, c, layer) => {
      if (reason) return;
      const nc = c + dc, { w, h } = fp(cell.id);
      if (!fits(r, nc, w, h)) { reason = SA.Config.text("vehicle_7230b6f9f8a8"); return; }
      if (!boxInRegion(v, r, nc, w, h)) { reason = LOCKED; return; }
      for (const [rr, cc] of box(r, nc, w, h)) {
        const key = rr * K.COLS + cc;
        if (used[layer].has(key)) { reason = SA.Config.text("vehicle_45f9e24da252"); return; }
        used[layer].add(key);
      }
      (layer === 'body' ? body : side)[r][nc] = cell;
    });
    if (reason) return { ok: false, reason };
    v.body = body; v.side = side;
    return { ok: true };
  }

  // 出战检查：逐个模块找出悬空（没有一路连到底盘）或摆放不合规的。
  // 连通规则：从底盘出发，四周紧贴的主体模块都算连上（可以侧挂、可以悬挑）；撞击件不传导支撑
  function issues(v) {
    const out = [];
    const B = v.body, O = occ(v, 'body');
    const ok = new Set();
    const key = (r, c) => r * K.COLS + c;
    const flag = (layer, r, c, reason) => out.push({ layer, r, c, reason });
    const queue = [];
    const chassis = chassisAnchors(v);
    const chassisIds = new Set(chassis.map(x => x.cell.id));
    if (chassisIds.size > 1) for (const x of chassis) flag('body', x.r, x.c, SA.Config.text("vehicle_2d644a62c152"));
    for (const id of chassisIds) if (M[id].chassisLimit === 1 && chassis.filter(x => x.cell.id === id).length > 1)
      for (const x of chassis.filter(x => x.cell.id === id).slice(1)) flag('body', x.r, x.c, SA.Config.text("vehicle_8349bca866a2"));
    // 连续底盘（履带、四足）：只认最长的一段，隔着空子的其余几件都标红。
    for (const id of chassisIds) if (M[id].chain) {
      const w = fp(id).w, xs = chassis.filter(x => x.cell.id === id).sort((p, q) => p.c - q.c), runs = [];
      for (const x of xs) { const last = runs[runs.length - 1]; if (last && last[last.length - 1].c + w === x.c) last.push(x); else runs.push([x]); }
      const best = runs.reduce((p, q) => (q.length > p.length ? q : p));
      for (const run of runs) if (run !== best) for (const x of run) flag('body', x.r, x.c, SA.Config.text("vehicle_82d980e8a835", `${M[id].name}`));
    }
    const isBiped = !!bipedOf(v), floor = floorRow(v);
    for (const x of chassis) if (x.r === chassisRow(x.cell.id) && inRegion(v, x.r, x.c)) { ok.add(key(x.r, x.c)); queue.push([x.r, x.c]); }
    while (queue.length) {
      const [r, c] = queue.shift();
      const f = fp(B[r][c].id);
      for (const [rr, cc] of ring(r, c, f.w, f.h)) {
        const o = O[rr][cc];
        if (!o || ok.has(key(o.r, o.c))) continue;
        const m = M[o.cell.id];
        const of = fp(o.cell.id);
        if (m.layer !== 'body' || (o.r + of.h > floor && !(isBiped && bipedWaist(v, o.r, o.c, of.w, of.h)) && !endArmorSide(v, o.cell.id, o.r, o.c))) continue;
        ok.add(key(o.r, o.c)); queue.push([o.r, o.c]);
      }
    }
    for (let r = K.ROWS - 1; r >= 0; r--)
      for (let c = 0; c < K.COLS; c++) {
        const cell = B[r][c];
        if (!cell) continue;
        const m = M[cell.id], { w, h } = fp(cell.id);
        if (bipedOnly(cell.id, cell) && !isBiped) flag('body', r, c, KNIGHT_ONLY);
        if (m.layer === 'side') flag('body', r, c, '侧挂件必须放在侧挂层');
        if (clearanceBlocked(v, cell.id, r, c, 'body', { layer: 'body', r, c })) flag('body', r, c, CLEARANCE);
        if (!boxInRegion(v, r, c, w, h)) flag('body', r, c, LOCKED);
        else if (m.layer === 'chassis') {
          if (r !== chassisRow(cell.id)) flag('body', r, c, SA.Config.text("vehicle_3ad9ab98b50f", `${m.name}`));
        } else if (m.layer === 'ram') {
          if (isBiped && !inHipRows(v, r, h)) flag('body', r, c, SA.Config.text("vehicle_4eee3911ae77"));
          else if (!behind(O, r, c, h).some(o => m.mount.includes(o.cell.id) && ok.has(key(o.r, o.c)))) flag('body', r, c, mountText(m));
          else if (anyAhead(O, r, c, w, h)) flag('body', r, c, SA.Config.text("vehicle_92097b2f55f0"));
        } else if (r + h > floor && !(isBiped && bipedWaist(v, r, c, w, h)) && !endArmorSide(v, cell.id, r, c)) {
          flag('body', r, c, isBiped ? (r + h > floor + 2 ? SA.Config.text("vehicle_0789672892e8") : SA.Config.text("vehicle_277b96ce365a")) : SA.Config.text("vehicle_b4682b465b5e"));
        } else if (!ok.has(key(r, c))) {
          const below = ring(r, c, w, h).filter(([rr]) => rr === r + h).map(([rr, cc]) => O[rr][cc]).filter(Boolean);
          flag('body', r, c, below.length && below.every(o => isRamCell(o.cell)) ? SA.Config.text("vehicle_c549eb415298") : SA.Config.text("vehicle_e1cb25bb5a9c"));
        }
      }
    // 旧车或分享码可能绕过 canPlace；按实际占格标记冲突双方，不能只检查被覆盖后的占格表。
    const sideGrid = grid(), sideConflicts = new Set();
    each(v, (cell, r, c, layer) => {
      if (layer !== 'side') return;
      const f = fp(cell.id);
      for (const [rr, cc] of box(r, c, f.w, f.h)) if (inGrid(rr, cc)) {
        if (sideGrid[rr][cc] != null) { sideConflicts.add(sideGrid[rr][cc]); sideConflicts.add(key(r, c)); }
        sideGrid[rr][cc] = key(r, c);
      }
    });
    const hb = helmBottom(v);
    for (let r = 0; r < K.ROWS; r++)
      for (let c = 0; c < K.COLS; c++) {
        const cell = v.side[r][c];
        if (!cell) continue;
        const { w, h } = fp(cell.id), host = sideHost(v, cell.id, r, c, O);
        if (bipedOnly(cell.id, cell) && !isBiped) flag('side', r, c, KNIGHT_ONLY);
        if (sideConflicts.has(key(r, c))) flag('side', r, c, SA.Config.text("vehicle_3ef702ab6894"));
        if (armAboveHelm(v, cell.id, r, hb)) flag('side', r, c, '骑士手臂要装在机甲头盔下面（肩膀在胸口），不能盖住头盔或和头盔并排');
        if (M[cell.id].layer !== 'side') flag('side', r, c, '主体件不能放在侧挂层');
        if (clearanceBlocked(v, cell.id, r, c, 'side', { layer: 'side', r, c })) flag('side', r, c, CLEARANCE);
        if (!boxInRegion(v, r, c, w, h)) flag('side', r, c, LOCKED);
        else if (r + h > floor && !legMount(v, cell.id, r, c) && !(isBiped && bipedWaist(v, r, c, w, h)) && !knightHip(v, cell.id, r, h)) flag('side', r, c, SA.Config.text("vehicle_790b7c4b3a97"));
        else if (!host) flag('side', r, c, cell.id === 'autoloader' ? '装弹机只能挂在至少 1×2 的火炮上，不能挂火箭、蒸汽、喷火或近战武器' : '侧挂必须完整挂在同一块足够大的装甲上');
        else if (!(M[cell.id].knight ? knightHosts(v, cell.id, r, c, O).some(x => ok.has(key(x.r, x.c))) : ok.has(key(host.r, host.c)))) flag('side', r, c, SA.Config.text("vehicle_bc6fe015ba42"));
      }
    return out;
  }

  // 旧加压舱原占 1×1；只搬这件，按离原锚点最近的合法位置尝试，其他模块和侧挂都不挪。
  // 找不到不会丢弃：完整 cell 留在 migrationStock，由存档层退回库存；重复读取 pv=2 的车不再迁移。
  function migratePressure(v, conflictsOnly = false) {
    if (!conflictsOnly && v.pv === PRESSURE_VER && !v.pressureMoves) return v;
    const cells = v.pressureMoves || [];
    delete v.pressureMoves;
    each(v, (cell, r, c, layer) => { if (layer === 'body' && cell.id === 'pressure_chamber') cells.push({ cell, r, c }); });
    for (const x of cells) if (inGrid(x.r, x.c) && v.body[x.r][x.c] === x.cell) v.body[x.r][x.c] = null;
    v.migrationStock = v.migrationStock || [];
    v.pv = PRESSURE_VER;
    for (const x of cells) {
      // 无版本的关卡 cells 也可能已经按 1×2 写好；合法且不冲突的锚点原样保留。
      const f = fp(x.cell.id);
      if (conflictsOnly && fits(x.r, x.c, f.w, f.h) && free(v, 'body', x.r, x.c, f.w, f.h)) { v.body[x.r][x.c] = x.cell; continue; }
      const before = new Set(issues(v).filter(i => !(i.layer === 'body' && i.r === x.r && i.c === x.c)).map(i => `${i.layer}:${i.r}:${i.c}`));
      const positions = [];
      for (let r = 0; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) positions.push([r, c]);
      positions.sort((a, b) => Math.abs(a[0] - x.r) + Math.abs(a[1] - x.c) - Math.abs(b[0] - x.r) - Math.abs(b[1] - x.c) || Math.abs(a[0] - x.r) - Math.abs(b[0] - x.r) || a[0] - b[0] || a[1] - b[1]);
      let placed = false;
      for (const [r, c] of positions) {
        if (!canPlace(v, x.cell.id, r, c, x.cell).ok) continue;
        v.body[r][c] = x.cell;
        const newIssues = issues(v).some(i => !(i.layer === 'body' && i.r === r && i.c === c) && !before.has(`${i.layer}:${i.r}:${i.c}`));
        if (!newIssues) { placed = true; break; }
        v.body[r][c] = null;
      }
      if (!placed) v.migrationStock.push(x.cell);
    }
    if (!v.migrationStock.length) delete v.migrationStock;
    return v;
  }

  // 直射炮查前方同行遮挡；高抛炮查炮顶垂直投影，旧车的非法布局也不能射穿顶部。
  function blockedList(v) {
    const out = [], O = occ(v, 'body');
    for (let r = 0; r < K.ROWS; r++)
      for (let c = 0; c < K.COLS; c++) {
        const cell = v.body[r][c];
        if (!alive(cell) || !SA.isWeapon(cell.id)) continue;
        if (M[cell.id].arc === 'high') {
          if (clearanceBlocked(v, cell.id, r, c, 'body', { layer: 'body', r, c }, true)) out.push({ r, c });
          continue;
        }
        if (M[cell.id].indirect) continue;
        const { w, h } = fp(cell.id);
        let blocked = false;
        for (let row = r; row < r + h && !blocked; row++)
          for (let k = c + w; k < K.COLS; k++)
            if (O[row][k] && alive(O[row][k].cell)) { blocked = true; break; }
        if (blocked) out.push({ r, c });
      }
    return out;
  }

  // 武器组只决定瞄准和自动开火归属；装填由全部存活驾驶员共用，每人同时负责一门炮。
  function crewPlan(weapons, drivers, selected) {
    const groups = GROUP_ORDER.filter(id => weapons.some(w => w.cell.id === id));
    const sel = groups.includes(selected) ? selected : groups[0] || null;
    const autoGroups = groups.filter(id => id !== sel).slice(0, Math.max(0, drivers - 1));
    return { groups, selected: sel, autoGroups, loaders: Math.max(0, drivers) };
  }

  function overheatTime(weaponKw, coolRate, water, dryCool, waterSave, capacity, shaftKw, heatKw) {
    thermalCounters.cpuForecastCalls++;
    let heat = 0;
    for (let t = 0; t < 300; t += 0.5) {
      const next = SA.Phys.thermalStep(heat, water, 0.5, { shaftKw, heatKw, weaponKw, cool: coolRate, dryCool, waterSave, capacity });
      heat = next.heat; water = next.water;
      if (heat >= (120 - 20) * capacity) return t + 0.5;
    }
    return Infinity;
  }

  // 仅在进化器显式安装认证结果时复用；键包含全部热输入和规则实现，普通游戏仍走精确热循环。
  const thermalRuleVersion = [SA.Phys.thermalStep, SA.Phys.temp, SA.coolRate,
    SA.K.IDLE_HEAT, SA.K.DISSIPATE, SA.K.COOL_FULL].map(String).join('|');
  // 双层键把完整规则源码只存一次，单项键保留所有热输入的原始数值。
  const thermalPredictions = new Map([[thermalRuleVersion, new Map()]]);
  const thermalCache = thermalPredictions.get(thermalRuleVersion);
  const THERMAL_CACHE_LIMIT = 8192;
  function readThermalCache(key) {
    const found = thermalCache.get(key);
    if (found) { thermalCache.delete(key); thermalCache.set(key, found); }
    return found;
  }
  function writeThermalCache(key, value) {
    thermalCache.delete(key);
    thermalCache.set(key, value);
    if (thermalCache.size > THERMAL_CACHE_LIMIT) thermalCache.delete(thermalCache.keys().next().value);
  }
  const thermalCounters = { cpuForecastCalls: 0, cacheHits: 0, gpuCacheHits: 0, cpuCacheHits: 0 };
  function thermalSummary() { return { ...thermalCounters, cacheEntries: thermalCache.size }; }
  function thermalKey(input) {
    const values = Object.values(input);
    return values.every(Number.isFinite) ? JSON.stringify(values) : null;
  }
  function installThermalPredictions(entries) {
    for (const entry of entries) {
      if (!entry || !Number.isInteger(entry.steps) || entry.steps < 0 || entry.steps > 600) continue;
      const key = thermalKey(entry.input);
      if (!key) continue;
      writeThermalCache(key, { time: entry.steps ? entry.steps * 0.5 : Infinity,
        source: entry.source === 'gpu' ? 'gpu' : 'cpu' });
    }
  }
  function thermalPrediction(input) {
    const key = thermalKey(input), found = key ? readThermalCache(key) : null;
    return found ? { input, steps: Number.isFinite(found.time) ? Math.round(found.time * 2) : 0, source: found.source } : null;
  }
  function clearThermalPredictions() { thermalCache.clear(); }

  function stats(v, options = null) {
    const s = {
      aimShrink: K.AIM_SHRINK, aimSpeed: K.AIM_SPEED,   // 瞄准：基础值 + 瞄准类部件加成
      demand: 0, equip: 0, drive: 0, weight: 0, loadKg: 0, load: 0, supply: 0, hp: 0, maxHp: 0, cockpits: 0, chassis: 0, boilers: 0, tanks: 0,
      water: 0, cool: 0, dryCool: 0, waterSave: 1, store: 0, dps: 0, weapons: 0, drivers: 0, heatRate: 0, heatMul: 1, evade: 0, acc: 0, broken: 0, damaged: 0,
      value: 0, count: 0, height: 0, byId: {}, speed: 0, rams: 0, accel: 0, brake: 0, sway: 0, salvoDps: 0, splashDps: 0, heatDps: 0, tether: 0,
      center: 0, d: 0, balance: '无底盘', balanceState: '无底盘', balanceTolerance: 0, comHeight: 0, topHeavy: false, hip: '正常', legs: '正常',
    };
    const parts = bipedParts(v);
    s.bipedClass = parts.bipedClass;
    s.speedBoost = parts.kind ? K.BIPED_SPEED_BOOST : K.SPEED_BOOST;
    let aimShrinkBonus = 0, aimSpeedBonus = 0, massX = 0, massY = 0, mass = 0;
    let chassisCenter = K.COLS / 2, chassisMt = 1, chassisCell = null;
    each(v, (cell, r, c) => {
      const m = SA.modForVehicle(cell, v);
      s.value += SA.cellValue(cell); s.count++;
      s.byId[cell.id] = (s.byId[cell.id] || 0) + (cell.hp > 0 ? 1 : 0);
      if (M[cell.id].layer === 'chassis' && !chassisCell) { chassisCell = cell; chassisCenter = c + fp(cell.id).w / 2; chassisMt = cell.mt || 1; }
      if (cell.hp <= 0) { s.broken++; return; }
      if (cell.hp < maxHp(cell)) s.damaged++;
      s.height = Math.max(s.height, Math.ceil((K.ROWS - r) / 2));   // 按大格算层数
      s.hp += cell.max ? cell.hp : cell.hp * maxHp(cell, v) / maxHp(cell); s.maxHp += maxHp(cell, v);
      s.equip += m.power || 0;
      aimShrinkBonus = Math.max(aimShrinkBonus, m.aimShrink || 0);
      aimSpeedBonus = Math.max(aimSpeedBonus, m.aimSpeed || 0);
      s.weight += SA.weightOf(cell);
      const f = fp(cell.id), weight = SA.weightOf(cell), cx = c + f.w / 2, cy = r + f.h / 2;
      if (!m.legPart) s.loadKg += weight;
      // 腿件只豁免承重额度；真实质量仍参与整车重心、牵引和惯性。
      massX += weight * cx; massY += weight * cy; mass += weight;
      s.supply += m.supply || 0;
      s.heatMul = Math.min(s.heatMul, m.heatMul || 1);
      s.store += m.store || 0;
      s.dryCool += m.dryCool || 0;
      if (m.waterSave) s.waterSave = Math.max(K.WATER_SAVE_MIN, s.waterSave * m.waterSave);
      // 腿部承重由单件属性计算强化，速度代价仅在底盘汇总时应用一次。
      if (m.layer === 'chassis') { s.chassis++; s.load += m.load; s.evade += m.evade || 0; s.acc += m.acc || 0; s.speed += m.speed * SA.refitSpeed(cell); s.accel += m.accel; s.brake += m.brake; s.sway += m.sway; }
      if (m.ram) s.rams++;
      if (SA.isCockpit(cell.id)) { s.cockpits++; s.drivers += SA.driversOf(cell.id); }
      if (m.supply) { s.boilers++; s.heatRate += m.heatRate; }
      if (m.water || m.cool) { if (m.cat === 'cooling') s.tanks++; s.water += m.water || 0; s.cool += m.cool || 0; }
    });
    s.center = mass ? massX / mass : chassisCenter;
    // 重心偏移 d 和重心高度都按大格算（true-biped.md §2 的阈值是「格」）；双足从胯层中线量起
    s.d = (s.center - chassisCenter) / 2;
    const hipY = chassisCell && chassisCell.id === 'biped' ? chassisRow('biped') + 1 : CH + 0.5;
    const comY = mass ? massY / mass : hipY;
    s.comHeight = Math.max(0, (hipY - comY) / 2);
    // 实体辅助模块（观察镜 / 装弹机 / 陀螺仪 / 测距仪）
    const cells = [];
    each(v, (cell) => cells.push(cell));
    const ax = s.aux = SA.auxEffect(cells);
    s.aimShrink = Math.min(K.AIM_SHRINK_MAX, K.AIM_SHRINK + Math.max(aimShrinkBonus, ax.aimShrink));
    s.aimSpeed = K.AIM_SPEED + Math.max(aimSpeedBonus, ax.aimSpeed);
    if (s.chassis) for (const k of ['evade', 'acc', 'speed', 'accel', 'brake', 'sway']) s[k] /= s.chassis;
    s.sway *= ax.sway;
    s.speed *= parts.speedBoost;
    // 动力：设备耗能 + 行驶耗能（按车重）；锅炉供给不够时，装填和车速一起按比例下降
    s.dryWeight = s.weight;
    s.loadKg += s.water;
    s.weight += s.water; // 满水纸面重量；战斗帧中使用实时剩余水量。
    s.drive = SA.Phys.driveKw(s.weight, s.speed);
    s.demand = Math.round((s.equip + s.drive) * 10) / 10;
    s.blocked = blockedList(v);
    // 最高速度 = 底盘基础速度 × 动力比（锅炉富余时可以超速，最多 125%）
    s.speedMul = s.demand ? Math.min(s.speedBoost, s.supply / s.demand) : (s.supply ? 1 : 0);
    s.armorSpeedFactor = armorSpeedFactor(v);
    s.topSpeed = s.speed * s.speedMul * s.armorSpeedFactor;
    s.power = s.demand ? Math.min(1, s.supply / s.demand) : 1;
    const util = s.supply ? Math.min(1, s.demand / s.supply) : 0;
    const weapons = [];
    each(v, (cell, r, c, layer) => { if (alive(cell) && SA.mod(cell).dmg) weapons.push({ cell, r, c, layer }); });
    // 纸面持续产出按可并发装填人数折算；这只是总产出估算，单门炮实际始终按原速装填。
    const crew = crewPlan(weapons, s.drivers, null);
    const crewRate = weapons.length ? Math.min(crew.loaders, weapons.length) / weapons.length : 0;
    let weaponHeat = 0;
    each(v, (cell, r, c, layer) => {
      const m = SA.modForVehicle(cell, v);
      if (!alive(cell) || (!m.dmg && !(m.knight && m.punch))) return;
      s.weapons++;
      // 近战不占射击装填组，纸面伤害沿用独立活塞冷却，避免不存在 reload 的除法。
      if (m.punch) { s.dps += m.punch / m.punchCd * s.power; weaponHeat += (m.heat || 0) / m.punchCd * s.power; return; }
      if (layer === 'body' && s.blocked.some(b => b.r === r && b.c === c)) return;
      // 与战斗共用辅助件汇总倍率，纸面输出不再重复应用装弹、散布和晃动收益。
      const reload = m.reload * weaponReloadMul(v, r, c, layer);
      const salvo = m.salvo || 1;
      const shotDps = m.dmgPerSec ? m.dmgPerSec * salvo : m.dmg * salvo / reload;
      const ownHeatRate = m.heatPerSec ? m.heat * m.reload / reload : m.heat / reload;
      const splash = m.splash ? (m.splash.k * Math.PI * m.splash.r * m.splash.r / (K.CELL * K.CELL)) : 0;
      s.dps += (shotDps * Math.max(0.4, 0.95 - (m.spread || 0) * ax.spread * 0.03 + s.acc)) * s.power * crewRate;
      s.salvoDps += shotDps * s.power * crewRate;
      s.splashDps += shotDps * splash * 0.08 * s.power * crewRate;
      s.heatDps += ownHeatRate * s.power * crewRate;
      s.tether += m.tether ? 12 : 0;
      weaponHeat += ownHeatRate * s.power * crewRate;
    });
    s.heatCapacity = SA.Phys.heatCapacity(s.dryWeight);
    s.heatMax = SA.Phys.heatMax(s.dryWeight);
    s.boilerHeat = s.heatRate * s.heatMul * Math.max(0.3, util);
    s.heatGen = s.boilerHeat + weaponHeat;
    const thermalInput = { water: s.water, shaftKw: Math.min(s.supply, s.demand), heatKw: s.boilerHeat,
      weaponKw: weaponHeat, cool: s.cool, dryCool: s.dryCool, waterSave: s.waterSave,
      capacity: s.heatCapacity, idleHeat: SA.K.IDLE_HEAT, dissipate: SA.K.DISSIPATE, coolFull: SA.K.COOL_FULL };
    if (options?.captureThermalInput) options.captureThermalInput(thermalInput);
    // 构筑筛选只读机械字段时延迟求热：不生成伪造的过热时间或综合评分。
    if (!options?.deferHeat) {
      const key = thermalKey(thermalInput), predicted = key ? readThermalCache(key) : null;
      if (predicted) {
        thermalCounters.cacheHits++;
        thermalCounters[predicted.source === 'gpu' ? 'gpuCacheHits' : 'cpuCacheHits']++;
      }
      s.overheat = predicted ? predicted.time :
        overheatTime(weaponHeat, s.cool, s.water, s.dryCool, s.waterSave, s.heatCapacity, thermalInput.shaftKw, s.boilerHeat);
      if (!predicted && key) writeThermalCache(key, { time: s.overheat, source: 'cpu' });
      s.rating = Math.round(s.hp / 12 + s.dps * 5 + s.salvoDps * 0.8 + s.splashDps + s.heatDps / 25 + s.tether + s.store * 0.014 + s.dryCool * 0.16 + (1 - s.waterSave) * 120 + s.evade * 60 + s.rams * 15 + Math.min(s.overheat, 120) / 4);
    }

    s.problems = [];
    if (!s.chassis) s.problems.push(SA.Config.text("vehicle_a3a9bdd8de8e"));
    if (!s.cockpits) s.problems.push(SA.Config.text("vehicle_7abfbf6b281e"));
    if (!s.boilers) s.problems.push(SA.Config.text("vehicle_fdab84d99c43"));
    if (s.chassis && s.loadKg > s.load) s.problems.push(SA.Config.text("vehicle_4fe380eb9d59", `${SA.tons(s.loadKg)}`, `${SA.tons(s.load)}`));
    s.issues = issues(v);
    if (s.issues.length) s.problems.push(SA.Config.text("vehicle_ed6884f4d489", `${s.issues.length}`));
    // 履带是一个整体：有一段被毁就整条掉链，修好之前开不动
    const deadTracks = v.body[CH].filter(cell => cell && cell.id === 'track' && cell.hp <= 0).length;
    s.thrown = deadTracks > 0;
    if (s.thrown) s.problems.push(SA.Config.text("vehicle_68c64e650c10"));
    s.warnings = [];
    if (chassisCell && chassisCell.id === 'biped') {
      const rule = M.biped.balance || { steady: 0.25, limit: 0.6, topHeavy: 1.8, toleranceByMt: [] };
      s.balanceTolerance = rule.toleranceByMt[chassisMt - 1] || rule.limit;
      s.balance = Math.abs(s.d) <= rule.steady ? '平衡' : (Math.abs(s.d) <= s.balanceTolerance ? (s.d > 0 ? SA.Config.text("vehicle_252ba89c1ba5") : SA.Config.text("vehicle_ecc051faaf16")) : '失衡');
      s.balanceState = s.balance;
      s.topHeavy = s.comHeight > rule.topHeavy;
      const zones = chassisCell.bipedZones;
      s.hip = zones ? (zones.hip > 0 ? '正常' : SA.Config.text("vehicle_b0272ae322c9")) : (chassisCell.hp > 0 ? '正常' : SA.Config.text("vehicle_b0272ae322c9"));
      s.legs = zones ? (zones.leg > 0 ? '正常' : SA.Config.text("vehicle_b0272ae322c9")) : (chassisCell.hp > 0 ? '正常' : SA.Config.text("vehicle_b0272ae322c9"));
      if (s.balance === '失衡') s.problems.push(SA.Config.text("vehicle_cec73c2faa72"));
      if (s.topHeavy) s.warnings.push(SA.Config.text("vehicle_03c3bbe5dda8"));
    }
    if (s.demand > s.supply && s.boilers) s.warnings.push(SA.Config.text("vehicle_5be9817aa75b", `${Math.round(s.power * 100)}`));
    if (s.blocked.length) s.warnings.push(SA.Config.text("vehicle_7ff3b573c8ca", `${s.blocked.length}`));
    if (!s.weapons) s.warnings.push(SA.Config.text("vehicle_36768053c9a3"));
    if (!options?.deferHeat && s.overheat < 60) s.warnings.push(SA.Config.text("vehicle_b0c86f179335", `${Math.round(s.overheat)}`));
    const brokenOther = s.broken - deadTracks;
    if (brokenOther > 0) s.warnings.push(SA.Config.text("vehicle_a34380ad5380", `${brokenOther}`));
    s.canDeploy = s.problems.length === 0;
    return s;
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));

  // 参战副本：剔除损毁模块；hpMul 用于赛季强化
  function battleCopy(v, hpMul = 1, fullHp = false) {
    const b = create(v.name);
    each(v, (cell, r, c, layer) => {
      if (cell.hp <= 0) return;
      // 极小的正倍率仍保留至少一点最大耐久，避免 max=0 被当成缺省值回退。
      const max = Math.max(1, Math.round(maxHp(cell, v) * hpMul));
      // 盾按精确耐久比例生成，避免基础半点耐久在每轮四舍五入后逐次回血。
      const hp = M[cell.id].knight === 'shield' && bipedOf(v)
        ? cell.hp / maxHp(cell) * max : Math.round(cell.hp * maxHp(cell, v) / maxHp(cell) * hpMul);
      b[layer][r][c] = { id: cell.id, mt: cell.mt || 1, lv: cell.lv || 0, hp: fullHp ? max : Math.min(max, hp), max };
      if (cell.refit) b[layer][r][c].refit = cell.refit;
      if (cell.look) b[layer][r][c].look = cell.look;
      if (cell.unique) b[layer][r][c].unique = cell.unique;
    });
    return b;
  }

  // 布局（本地蓝图用）：原样记录每个模块的锚点，悬空的也保留。g: 2 = 子格坐标（没有 g 的旧蓝图是大格坐标，读的时候 ×2）
  function layout(v) {
    const b = [], s = [];
    each(v, (cell, r, c, layer) => (layer === 'body' ? b : s).push(cell.look || cell.unique ? [r, c, cell.id, { look: cell.look, unique: cell.unique }] : [r, c, cell.id]));
    return { b, s, g: 2, a: ARMOR_VER, pv: PRESSURE_VER, ms: v.migrationStock || [] };
  }
  // 迁移退库也是外部蓝图的一部分：未知模块或非法数值不能进入后续补购规划。
  function validStockCell(cell) {
    const valid = !!cell && typeof cell === 'object' && !Array.isArray(cell)
      && typeof cell.id === 'string' && Object.hasOwn(M, SA.liveId(cell.id))
      && (cell.mt == null || (Number.isInteger(cell.mt) && cell.mt >= 1 && cell.mt <= SA.MAT_MAX))
      && (cell.lv == null || (Number.isInteger(cell.lv) && cell.lv >= 0 && cell.lv <= K.UP_MAX))
      && (cell.refit == null || (Number.isInteger(cell.refit) && cell.refit >= 0 && cell.refit <= K.UP_MAX && (!cell.refit || !!SA.refitKind(SA.liveId(cell.id)))))
      && Number.isFinite(cell.hp) && cell.hp >= 0
      && (cell.max == null || (Number.isFinite(cell.max) && cell.max > 0));
    if (!valid) return false;
    // max 只允许记录规范耐久，不能由分享码放大。先验原材料，再沿用旧件比例迁移。
    const id = Object.hasOwn(M, cell.id) ? cell.id : SA.liveId(cell.id);
    const max = Math.round(SA.mod({ id, mt: cell.mt || 1, refit: cell.refit || 0 }).hp * (1 + SA.upHp(id) * (cell.lv || 0)));
    return cell.hp <= max && (cell.max == null || cell.max === max);
  }
  // 只验证数据结构，不拿当前摆放规则拒绝旧码或车间自由摆放；尺寸迁移仍走原来的流程。
  // indexed 表示分享码使用 MODULE_ORDER 的索引，本地蓝图则直接记录模块 id。
  function validLayout(L, indexed = false) {
    if (!L || typeof L !== 'object' || Array.isArray(L)) return false;
    const k = L.g === 2 ? 1 : 2;
    for (const [layer, list] of [['body', L.b ?? []], ['side', L.s ?? []]]) {
      if (!Array.isArray(list) || list.length > K.ROWS * K.COLS) return false;
      const anchors = new Set();
      for (const item of list) {
        if (!Array.isArray(item) || item.length < 3 || item.length > 4) return false;
        const [r, c, key, variant] = item;
        const id = indexed ? (Number.isInteger(key) && SA.MODULE_ORDER[key]) : key;
        if (typeof id !== 'string' || !Object.hasOwn(M, SA.liveId(id))
          || !Number.isInteger(r) || !Number.isInteger(c) || !inGrid(r * k, c * k)
          || (layerOf(SA.liveId(id)) !== layer && !(layer === 'body' && MOVED_TO_SIDE.has(SA.liveId(id)))) || anchors.has(`${r},${c}`)) return false;
        if (variant != null && (typeof variant !== 'object' || Array.isArray(variant)
          || (variant.look != null && typeof variant.look !== 'string')
          || (variant.unique != null && typeof variant.unique !== 'string'))) return false;
        anchors.add(`${r},${c}`);
      }
    }
    return L.ms == null || (Array.isArray(L.ms) && L.ms.length <= K.ROWS * K.COLS && L.ms.every(validStockCell));
  }
  function fromLayout(name, L) {
    const v = create(name), k = L.g === 2 ? 1 : 2;
    v.migrationStock = (Array.isArray(L.ms) ? L.ms : []).filter(validStockCell).map(cell => SA.fixCell(JSON.parse(JSON.stringify(cell))));
    for (const [layer, list] of [['body', L.b || []], ['side', L.s || []]])
      for (const [r, c, id, variant] of list)
        if (M[id] && inGrid(r * k, c * k) && (layerOf(SA.liveId(id)) === layer || (layer === 'body' && MOVED_TO_SIDE.has(SA.liveId(id))))) {
          const cell = SA.newCell(id);
          if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
          v[layer][r * k][c * k] = SA.fixCell(cell);
        }
    v.pv = L.pv;
    // 兼容曾经保存的污染蓝图：保留正常构筑，只过滤无法规划的迁移退库项。
    return migratePressure(migrateSide(normalizeChassis(L.a === ARMOR_VER ? v : widenArmor(v))));
  }
  // 完整模块清单 [层(0 主体 / 1 侧挂), 行, 列, id, 材料, 改装等级] → 载具（进化报告用；分享码不记材料和改装）
  function fromCells(name, cells) {
    const v = create(name);
    for (const [l, r, c, id, mt, lv, variant] of cells || []) {
      const live = SA.liveId(id);
      if (!M[live] || !inGrid(r, c)) continue;
      const cell = SA.newCell(live, mt || 1);
      // 进化报告的实例变体保留独立改造等级；分享码仍沿用不记录材料和强化的既有协议。
      if (variant?.refit) { cell.refit = variant.refit; SA.fixCell(cell); cell.hp = maxHp(cell); }
      if (lv) { cell.lv = lv; cell.hp = maxHp(cell); }
      if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
      v[l ? 'side' : 'body'][r][c] = SA.fixCell(cell);
    }
    return migratePressure(migrateSide(normalizeChassis(v)), true);
  }
  // 布局需要的模块数量 { id: n }
  function countIds(v) {
    const n = {};
    each(v, (cell) => { n[cell.id] = (n[cell.id] || 0) + 1; });
    return n;
  }

  // 分享码：SA2.<base64>（子格坐标）；旧的 SA1 码是大格坐标，照样能读
  function encode(v) {
    const b = [], s = [];
    each(v, (cell, r, c, layer) => (layer === 'body' ? b : s).push(cell.look || cell.unique ? [r, c, SA.MODULE_ORDER.indexOf(cell.id), { look: cell.look, unique: cell.unique }] : [r, c, SA.MODULE_ORDER.indexOf(cell.id)]));
    const json = JSON.stringify({ n: v.name, b, s, a: ARMOR_VER, pv: PRESSURE_VER, ms: v.migrationStock || [] });
    return 'SA2.' + btoa(unescape(encodeURIComponent(json)));
  }

  function decode(code) {
    try {
      const raw = String(code).trim();
      const ver = raw.startsWith('SA2.') ? 2 : raw.startsWith('SA1.') ? 1 : 0;
      if (!ver) return null;
      const k = ver === 1 ? 2 : 1;
      const d = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
      // 必须先验完整包，再创建车辆；不能静默丢掉损坏记录后仍把分享码当成成功导入。
      if (!d || typeof d !== 'object' || Array.isArray(d) || !validLayout({ ...d, g: ver }, true)) return null;
      const v = create(String(d.n || SA.Config.text("vehicle_a7a357a827fb")).slice(0, 20));
      v.pv = d.pv;
      v.migrationStock = (d.ms || []).map(cell => SA.fixCell(JSON.parse(JSON.stringify(cell))));
      // 自下而上摆放，保证规则合法；侧炮最后挂
      let list = [...(d.b || []), ...(d.s || [])].map(([r, c, i, variant]) => [r * k, c * k, i, variant]);
      // 旧分享码（没有 a）里的铁装甲是 2×2：右边补一块，拼回原来的大小
      const ai = SA.MODULE_ORDER.indexOf('armor');
      if (d.a !== ARMOR_VER) list = list.concat(list.filter(x => x[2] === ai && x[1] + 1 < K.COLS).map(([r, c, i, variant]) => [r, c + 1, i, variant]));
      // 旧分享码里的双足锚在第 CH 行（逐格或 1×2）：和 liftForBiped 一样整车上移一层，只留中间那一格作 2×4 双足的胯
      const bi = SA.MODULE_ORDER.indexOf('biped'), feet = list.filter(x => x[2] === bi);
      if (feet.length && feet.some(x => x[0] !== chassisRow('biped'))) {
        const keep = feet.sort((p, q) => p[1] - q[1])[Math.floor((feet.length - 1) / 2)], dr = keep[0] - chassisRow('biped');
        list = list.filter(x => x[2] !== bi).map(([r, c, i, variant]) => [r - Math.max(0, dr), c, i, variant]);
        for (const [r, c, i] of list) if (r < 0 && SA.MODULE_ORDER[i] === 'pressure_chamber')
          (v.pressureMoves || (v.pressureMoves = [])).push({ cell: SA.newCell('pressure_chamber'), r, c });
        list = list.filter(([r]) => r >= 0);
        list.push([chassisRow('biped'), Math.min(K.COLS - 2, keep[1]), bi, keep[3]]);
      }
      // 旧码里的加压舱仍是 1×1。先保留全部锚点，再统一扩格，避免逐件摆放时把被它支撑的模块提前丢掉。
      if (d.pv !== PRESSURE_VER && list.some(x => SA.MODULE_ORDER[x[2]] === 'pressure_chamber')) {
        for (const [r, c, i, variant] of list) {
          const id = SA.MODULE_ORDER[i];
          if (!id || !inGrid(r, c)) continue;
          const cell = SA.newCell(SA.liveId(id));
          if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
          const layer = layerOf(cell.id), f = fp(cell.id);
          if (fits(r, c, f.w, f.h) && free(v, layer, r, c, f.w, f.h)) v[layer][r][c] = SA.fixCell(cell);
          else v.migrationStock.push(SA.fixCell(cell));
        }
        return migratePressure(migrateSide(normalizeChassis(v)));
      }
      list = list.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      let pending = list.filter(x => SA.MODULE_ORDER[x[2]] !== 'side_cannon').concat(list.filter(x => SA.MODULE_ORDER[x[2]] === 'side_cannon'));
      // 侧挂 / 悬挑的模块要等撑住它的模块摆好才合法，而那个模块可能排在后面：摆不下的留到下一轮再试，直到没有进展
      while (pending.length) {
        const next = pending.filter(([r, c, i, variant]) => {
          const id = SA.MODULE_ORDER[i];
          if (!id) return false;
          if (!place(v, SA.liveId(id), r, c).ok) return true;
          const cell = v[layerOf(SA.liveId(id))][r][c];
          if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
          SA.fixCell(cell);
          return false;
        });
        if (next.length === pending.length) break;
        pending = next;
      }
      // 历史侧挂和骑士专属件允许标红待调整，避免新底盘限制丢掉旧头盔；其余非法主体仍沿用旧分享码的过滤规则。
      for (const [r, c, i, variant] of pending) {
        const id = SA.liveId(SA.MODULE_ORDER[i]), layer = layerOf(id), f = fp(id);
        if (layer !== 'side' && id !== 'pressure_chamber' && !bipedOnly(id)) continue;
        const cell = SA.newCell(id);
        if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
        SA.fixCell(cell);
        if (fits(r, c, f.w, f.h) && free(v, layer, r, c, f.w, f.h)) v[layer][r][c] = cell;
        else v.migrationStock.push(cell);
      }
      return migratePressure(migrateSide(normalizeChassis(v)));
    } catch (e) { return null; }
  }

  // 车间摆放与预览所需的模型计算，界面仅负责坐标和呈现。
  function editorSpot(id, hv, v, ignore = null) {
    const f = SA.fp(id), clampI = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const r = M[id].layer === 'chassis' ? chassisRow(id) : clampI(Math.round(hv.fr - f.h / 2), 0, K.ROWS - f.h);
    const c = clampI(Math.round(hv.fc - f.w / 2), 0, K.COLS - f.w);
    const O = SA.V.occ(v, SA.V.layerOf(id)), hits = [];
    for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) {
      const o = O[r + i][c + j];
      if (o && !(ignore && o.r === ignore.r && o.c === ignore.c) && !hits.some(x => x.r === o.r && x.c === o.c)) hits.push(o);
    }
    return { r, c, w: f.w, h: f.h, hits };
  }

  function placeCheck(v, id, r, c, cell = null) {
    if (M[id].layer !== 'chassis') return SA.V.canPlace(v, id, r, c, cell);
    const test = SA.V.clone(v);
    for (const o of chassisClash(v, id, null)) test.body[o.r][o.c] = null;
    return SA.V.canPlace(test, id, r, c, cell);
  }
  // 车上和新底盘冲突的底盘：不同种的全部；同种的整件底盘（chassisLimit 1）已有的那个。cur = 正好被替换的那个（不重复算）
  function chassisClash(v, id, cur) {
    const out = [];
    SA.V.each(v, (cell, r, c, layer) => {
      if (layer !== 'body' || M[cell.id].layer !== 'chassis' || (cur && cur.r === r && cur.c === c)) return;
      if (cell.id !== id || M[id].chassisLimit === 1) out.push({ cell, r, c });
    });
    return out;
  }


  function statsWith(v, id, mt = 1) {
    const layer = SA.V.layerOf(id) === 'side' ? 'side' : 'body', f = SA.fp(id), o = SA.V.occ(v, layer);
    for (let r = 0; r + f.h <= SA.K.ROWS - 2; r++) for (let c = 0; c + f.w <= SA.K.COLS; c++) {
      let free = true;
      for (let i = 0; i < f.h && free; i++) for (let j = 0; j < f.w && free; j++) if (o[r + i][c + j]) free = false;
      if (!free) continue;
      const w = SA.V.clone(v);
      w[layer][r][c] = SA.newCell(id, mt);
      return SA.V.stats(w);
    }
    return null;
  }
  // 载具的底盘锚点行（没有底盘时是 CH）；战斗悬挂、画面找底盘都用它
  const chassisRowOf = (v) => { const a = chassisAnchors(v)[0]; return a ? a.r : CH; };
  return { fullGrid, helmBottom, widenArmor, chassisRow, chassisRowOf, bipedOf, bipedParts, legMount, bipedWaist, floorRow, endArmorSide, armorSpeedFactor, sideHost, weaponReloadMul, create, fromAscii, fromBig, migrate, region, inRegion, boxInRegion, occ, at, CH, each, canPlace, place, canPut, remove, move, translate, issues, layout, fromLayout, fromCells, countIds, blockedList, crewPlan, stats, clone, battleCopy, encode, decode, validLayout, validStockCell, layerOf, maxHp, alive, editorSpot, placeCheck, chassisClash, statsWith, installThermalPredictions, thermalPrediction, clearThermalPredictions, thermalSummary };
})();
