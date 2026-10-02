// 载具模型：子格网格、两层（主体/侧挂）、摆放规则、属性计算、分享码
// 子格 24px，全车 16 列 × 12 行；模块只记在左上角那一格（锚点），占 SA.fp(id) = w×h 个子格。
// 「占格表」occ() 把每个子格指向盖住它的模块，摆放、连通、遮挡、点选都查它
window.SA = window.SA || {};

SA.V = (() => {
  const K = SA.K, M = SA.MODULES;
  const grid = () => Array.from({ length: K.ROWS }, () => Array(K.COLS).fill(null));
  // av：铁装甲的数据版本。2026-09-28 铁装甲从 2×2 改成竖着的 1×2；没有 av 的旧数据读进来时由 widenArmor 拆成并排两块
  const ARMOR_VER = 2;
  // pv：加压舱占格版本。旧车未记录 pv，表示仍按 1×1 摆放，读入后迁移到 1×2。
  const PRESSURE_VER = 2;
  const create = (name = '原型机') => ({ name, body: grid(), side: grid(), av: ARMOR_VER, pv: PRESSURE_VER });
  const layerOf = (id) => (M[id].layer === 'side' ? 'side' : 'body');
  // 满耐久：改装（炮盾 / 附加装甲）每级按比例加；参战副本直接带 max
  const maxHp = (cell) => cell.max || Math.round(SA.mod(cell).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
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
      if (canPlace(v, cell.id, want, c0 + 2).ok) v.body[want][c0 + 2] = cell; else v.body[r][c] = cell;
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
        if (mt >= SA.minMt(id0) || !M[id0].lowAlt) { v.body[r * 2][c * 2] = SA.newCell(id0, mt); continue; }
        const id = M[id0].lowAlt, f = fp(id), rr = r * 2 + 2 - f.h, cc = c * 2 + 2 - f.w;
        v.body[rr][cc] = SA.newCell(id, mt);
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
    return migratePressure(normalizeChassis(widenArmor(v)));
  }
  // 旧存档（6 × 8 大格）→ 子格
  function migrate(v) {
    if (!v || !v.body) return v;
    if (v.body.length === K.ROWS) return migratePressure(normalizeChassis(v.av ? v : widenArmor(v)));
    const out = fromBig(v.name, v.body, v.side, v.lim);
    return migratePressure(normalizeChassis(out));
  }

  // 改装台的可用区域：战役逐章扩建。v.lim = { cols, rows }（大格数，只有玩家的车有），列从中间往两边扩，行从底盘往上扩
  function region(v) {
    const L = v && v.lim;
    if (!L) return { c0: 0, c1: K.COLS - 1, r0: 0 };
    const c0 = 2 * Math.floor((K.COLS / 2 - L.cols) / 2);
    return { c0, c1: c0 + 2 * L.cols - 1, r0: K.ROWS - 2 * L.rows };
  }
  const inRegion = (v, r, c) => { const g = region(v); return r >= g.r0 && c >= g.c0 && c <= g.c1; };
  const boxInRegion = (v, r, c, w, h) => inRegion(v, r, c) && inRegion(v, r + h - 1, c + w - 1);
  const LOCKED = '这一格还没扩建：推进战役会解锁更大的改装台';

  function each(v, fn) {
    for (const layer of ['body', 'side'])
      for (let r = 0; r < K.ROWS; r++)
        for (let c = 0; c < K.COLS; c++)
          if (v[layer][r][c]) fn(v[layer][r][c], r, c, layer);
  }

  const isRamCell = (cell) => cell && SA.isRam(cell.id);
  const mountText = (m) => `${m.name}要装在${m.mount.map(x => M[x].name).join('/')}的正前方（右侧）`;
  // 真双足：锚在第 ROWS-4 行的 2×4 整件；胯层 = 锚点那两行，腿区 = 下面两行（不能放任何模块）
  const bipedOf = (v) => chassisAnchors(v).find(x => x.cell.id === 'biped' && x.r === chassisRow('biped')) || null;
  // 底盘保留区从哪一行开始：双足占最底下两层（4 行），其余底盘两行
  const floorRow = (v) => (bipedOf(v) ? chassisRow('biped') : CH);
  // 腰挂位：胯层左右各 1 大格（2 子格宽），模块整个落在里面才算
  function bipedWaist(v, r, c, w, h) {
    const a = bipedOf(v);
    if (!a || r < a.r || r + h > a.r + 2) return false;
    return (c >= a.c - 2 && c + w <= a.c) || (c >= a.c + 2 && c + w <= a.c + 4);
  }
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

  // 严格摆放：这个位置是否合规（能连上、不悬空）
  function canPlace(v, id, r, c) {
    const m = M[id], { w, h } = fp(id);
    const no = (reason) => ({ ok: false, reason });
    if (!fits(r, c, w, h)) return no('超出格子范围');
    if (!boxInRegion(v, r, c, w, h)) return no(LOCKED);
    const O = occ(v, 'body'), cells = box(r, c, w, h);
    if (m.layer === 'side') {
      if (r + h > floorRow(v) && !bipedWaist(v, r, c, w, h)) return no('底盘上不能挂侧炮');
      const S = occ(v, 'side');
      if (cells.some(([rr, cc]) => S[rr][cc])) return no('侧挂层这里已经有侧炮');
      if (cells.some(([rr, cc]) => !O[rr][cc])) return no('侧炮必须整个挂在主体模块上');
      if (cells.some(([rr, cc]) => isRamCell(O[rr][cc].cell))) return no('撞击武器上不能挂侧炮');
      return { ok: true };
    }
    if (cells.some(([rr, cc]) => O[rr][cc])) return no('这里已经有模块');
    if (m.layer === 'ram') {
      if (bipedOf(v) && !inHipRows(v, r, h)) return no('双足撞击件只能装在胯层或腰挂位');
      if (!behind(O, r, c, h).some(o => m.mount.includes(o.cell.id))) return no(mountText(m));
      if (anyAhead(O, r, c, w, h)) return no('撞击武器必须在这一行的最前端');
      return { ok: true };
    }
    if (m.layer === 'chassis') {
      if (r !== chassisRow(id)) return no(`${m.name}只能贴着最底下放`);
      const chassis = chassisAnchors(v);
      if (chassis.some(x => x.cell.id !== id)) return no('一辆车只能使用一种底盘');
      if (m.chassisLimit === 1 && chassis.some(x => x.cell.id === id)) return no('一辆车只能有一个底盘整件');
      if (m.chain && chassis.length && !chassis.some(x => x.c + w === c || c + w === x.c)) return no(`${m.name}要和已有的首尾相连，中间不能隔空`);
      if (ramBehind(O, r, c, h)) return no('撞击武器前方不能再放模块');
      return { ok: true };
    }
    if (r + h > floorRow(v) && !bipedWaist(v, r, c, w, h) && !endArmorSide(v, id, r, c)) return no(bipedOf(v) ? '双足的胯层只能放腰挂位，腿区不能放模块' : '最底下两行只能放底盘');
    // 外圈只要挨着一个（非撞击件的）模块就能塞进去；是否一路连到底盘由 issues() 检查
    const near = ring(r, c, w, h).map(([rr, cc]) => O[rr][cc]).filter(Boolean);
    if (!near.length) return no('悬空：四周都没有模块可以依靠');
    if (near.every(o => isRamCell(o.cell))) return no('撞击武器不能当支撑');
    if (ramBehind(O, r, c, h)) return no('撞击武器前方不能再放模块');
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
  function canPut(v, id, r, c) {
    const { w, h } = fp(id), layer = layerOf(id);
    if (!fits(r, c, w, h)) return { ok: false, reason: '超出格子范围' };
    if (!boxInRegion(v, r, c, w, h)) return { ok: false, reason: LOCKED };
    if (!free(v, layer, r, c, w, h)) return { ok: false, reason: layer === 'side' ? '侧挂层这里已经有侧炮' : '这里已经有模块' };
    const chk = canPlace(v, id, r, c);
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
    if (!cell) return { ok: false, reason: '这里是空的' };
    const riders = layer === 'body' ? ridersOf(v, r, c) : [];
    if (hurt(cell) || riders.some(x => hurt(x.cell))) return { ok: false, reason: '受损模块要先修理才能拆下' };
    const out = [cell];
    for (const x of riders) { out.push(x.cell); v.side[r + x.dr][c + x.dc] = null; }
    v[layer][r][c] = null;
    return { ok: true, removed: out };
  }

  // 移动：把锚点 (r1, c1) 的模块搬到锚点 (r2, c2)。目标位置正好压着另一个模块就对调（对方搬到原位，放得下才行）
  // 主体模块连同挂在它上面的侧炮一起搬
  function move(v, layer, r1, c1, r2, c2) {
    if (!inGrid(r1, c1) || !inGrid(r2, c2)) return { ok: false, reason: '超出格子范围' };
    if (r1 === r2 && c1 === c2) return { ok: false, reason: '' };
    const cell = v[layer][r1][c1];
    if (!cell) return { ok: false, reason: '这里是空的' };
    const { w, h } = fp(cell.id);
    if (!fits(r2, c2, w, h)) return { ok: false, reason: '超出格子范围' };
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
    const a = lift(r1, c1);
    const O = occ(v, layer);
    const hits = [];
    for (const [rr, cc] of box(r2, c2, w, h)) { const o = O[rr][cc]; if (o && !hits.includes(o)) hits.push(o); }
    if (!hits.length) { drop(a, r2, c2); return { ok: true, swapped: false }; }
    if (hits.length > 1) { drop(a, r1, c1); return { ok: false, reason: '目标位置压着好几个模块，换不了' }; }
    const X = hits[0], xf = fp(X.cell.id);
    const b = lift(X.r, X.c);
    // 先放搬过去的，再看对方能不能放回原位
    if (free(v, layer, r2, c2, w, h) && fits(r1, c1, xf.w, xf.h) && boxInRegion(v, r1, c1, xf.w, xf.h)) {
      drop(a, r2, c2);
      if (free(v, layer, r1, c1, xf.w, xf.h)) { drop(b, r1, c1); return { ok: true, swapped: true }; }
      v[layer][r2][c2] = null; for (const x of a.riders) v.side[r2 + x.dr][c2 + x.dc] = null;
    }
    drop(b, X.r, X.c); drop(a, r1, c1);
    return { ok: false, reason: `${M[X.cell.id].name}放不回原位，换不了（尺寸不一样）` };
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
    if (chassisIds.size > 1) for (const x of chassis) flag('body', x.r, x.c, '一辆车只能使用一种底盘');
    for (const id of chassisIds) if (M[id].chassisLimit === 1 && chassis.filter(x => x.cell.id === id).length > 1)
      for (const x of chassis.filter(x => x.cell.id === id).slice(1)) flag('body', x.r, x.c, '一辆车只能有一个底盘整件');
    // 连续底盘（履带、四足）：只认最长的一段，隔着空子的其余几件都标红。
    for (const id of chassisIds) if (M[id].chain) {
      const w = fp(id).w, xs = chassis.filter(x => x.cell.id === id).sort((p, q) => p.c - q.c), runs = [];
      for (const x of xs) { const last = runs[runs.length - 1]; if (last && last[last.length - 1].c + w === x.c) last.push(x); else runs.push([x]); }
      const best = runs.reduce((p, q) => (q.length > p.length ? q : p));
      for (const run of runs) if (run !== best) for (const x of run) flag('body', x.r, x.c, `${M[id].name}之间不能隔着空子（要首尾相连）`);
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
        if (!boxInRegion(v, r, c, w, h)) flag('body', r, c, LOCKED);
        else if (m.layer === 'chassis') {
          if (r !== chassisRow(cell.id)) flag('body', r, c, `${m.name}只能贴着最底下放`);
        } else if (m.layer === 'ram') {
          if (isBiped && !inHipRows(v, r, h)) flag('body', r, c, '双足撞击件只能装在胯层或腰挂位');
          else if (!behind(O, r, c, h).some(o => m.mount.includes(o.cell.id) && ok.has(key(o.r, o.c)))) flag('body', r, c, mountText(m));
          else if (anyAhead(O, r, c, w, h)) flag('body', r, c, '撞击武器必须是这一行的最前端');
        } else if (r + h > floor && !(isBiped && bipedWaist(v, r, c, w, h)) && !endArmorSide(v, cell.id, r, c)) {
          flag('body', r, c, isBiped ? (r + h > floor + 2 ? '双足腿区不能放模块' : '双足的胯层只能放腰挂位（胯左右各一格）') : '底盘腿区只能放底盘');
        } else if (!ok.has(key(r, c))) {
          const below = ring(r, c, w, h).filter(([rr]) => rr === r + h).map(([rr, cc]) => O[rr][cc]).filter(Boolean);
          flag('body', r, c, below.length && below.every(o => isRamCell(o.cell)) ? '悬空：撞击武器不能当支撑' : '悬空：四周都没连到底盘');
        }
      }
    for (let r = 0; r < K.ROWS; r++)
      for (let c = 0; c < K.COLS; c++) {
        const cell = v.side[r][c];
        if (!cell) continue;
        const { w, h } = fp(cell.id), under = box(r, c, w, h).map(([rr, cc]) => inGrid(rr, cc) && O[rr][cc]);
        if (!boxInRegion(v, r, c, w, h)) flag('side', r, c, LOCKED);
        else if (r + h > floor && !(isBiped && bipedWaist(v, r, c, w, h))) flag('side', r, c, '底盘上不能挂侧炮');
        else if (under.some(o => !o)) flag('side', r, c, '悬空：侧炮必须整个挂在主体模块上');
        else if (under.some(o => isRamCell(o.cell))) flag('side', r, c, '撞击武器上不能挂侧炮');
        else if (under.some(o => !ok.has(key(o.r, o.c)))) flag('side', r, c, '悬空：挂载的模块没有连到底盘');
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
        if (!canPlace(v, x.cell.id, r, c).ok) continue;
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

  // 直射武器：模块覆盖的每一行都要检查；任一行前方有己方存活主体模块就算被挡。
  // 这样 1×1 小模块、驾驶舱以及高大的重炮/巨炮都会和战斗判定保持一致；高抛炮不受影响。
  function blockedList(v) {
    const out = [], O = occ(v, 'body');
    for (let r = 0; r < K.ROWS; r++)
      for (let c = 0; c < K.COLS; c++) {
        const cell = v.body[r][c];
        if (!alive(cell) || !SA.isWeapon(cell.id) || M[cell.id].indirect) continue;
        const { w, h } = fp(cell.id);
        let blocked = false;
        for (let row = r; row < r + h && !blocked; row++)
          for (let k = c + w; k < K.COLS; k++)
            if (O[row][k] && alive(O[row][k].cell)) { blocked = true; break; }
        if (blocked) out.push({ r, c });
      }
    return out;
  }

  function overheatTime(weaponKw, coolRate, water, dryCool, waterSave, capacity, shaftKw, heatKw) {
    let heat = 0;
    for (let t = 0; t < 300; t += 0.5) {
      const next = SA.Phys.thermalStep(heat, water, 0.5, { shaftKw, heatKw, weaponKw, cool: coolRate, dryCool, waterSave, capacity });
      heat = next.heat; water = next.water;
      if (heat >= (120 - 20) * capacity) return t + 0.5;
    }
    return Infinity;
  }

  function stats(v) {
    const s = {
      aimShrink: K.AIM_SHRINK, aimSpeed: K.AIM_SPEED,   // 瞄准：基础值 + 瞄准类部件加成
      demand: 0, equip: 0, drive: 0, weight: 0, load: 0, supply: 0, hp: 0, maxHp: 0, cockpits: 0, chassis: 0, boilers: 0, tanks: 0,
      water: 0, cool: 0, dryCool: 0, waterSave: 1, store: 0, dps: 0, weapons: 0, heatRate: 0, heatMul: 1, evade: 0, acc: 0, broken: 0, damaged: 0,
      value: 0, count: 0, height: 0, byId: {}, speed: 0, rams: 0, accel: 0, brake: 0, sway: 0, salvoDps: 0, splashDps: 0, heatDps: 0, tether: 0,
      center: 0, d: 0, balance: '无底盘', balanceState: '无底盘', balanceTolerance: 0, comHeight: 0, topHeavy: false, hip: '正常', legs: '正常',
    };
    let aimShrinkBonus = 0, aimSpeedBonus = 0, massX = 0, massY = 0, mass = 0;
    let chassisCenter = K.COLS / 2, chassisMt = 1, chassisCell = null;
    each(v, (cell, r, c) => {
      const m = SA.mod(cell);
      s.value += SA.cellValue(cell); s.count++;
      s.byId[cell.id] = (s.byId[cell.id] || 0) + (cell.hp > 0 ? 1 : 0);
      if (M[cell.id].layer === 'chassis' && !chassisCell) { chassisCell = cell; chassisCenter = c + fp(cell.id).w / 2; chassisMt = cell.mt || 1; }
      if (cell.hp <= 0) { s.broken++; return; }
      if (cell.hp < maxHp(cell)) s.damaged++;
      s.height = Math.max(s.height, Math.ceil((K.ROWS - r) / 2));   // 按大格算层数
      s.hp += cell.hp; s.maxHp += maxHp(cell);
      s.equip += m.power || 0;
      aimShrinkBonus = Math.max(aimShrinkBonus, m.aimShrink || 0);
      aimSpeedBonus = Math.max(aimSpeedBonus, m.aimSpeed || 0);
      s.weight += SA.weightOf(cell);
      const f = fp(cell.id), weight = SA.weightOf(cell), cx = c + f.w / 2, cy = r + f.h / 2;
      massX += weight * cx; massY += weight * cy; mass += weight;
      s.supply += m.supply || 0;
      s.heatMul = Math.min(s.heatMul, m.heatMul || 1);
      s.store += m.store || 0;
      s.dryCool += m.dryCool || 0;
      if (m.waterSave) s.waterSave = Math.max(K.WATER_SAVE_MIN, s.waterSave * m.waterSave);
      if (m.layer === 'chassis') { s.chassis++; s.load += m.load; s.evade += m.evade || 0; s.acc += m.acc || 0; s.speed += m.speed; s.accel += m.accel; s.brake += m.brake; s.sway += m.sway; }
      if (m.ram) s.rams++;
      if (SA.isCockpit(cell.id)) s.cockpits++;
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
    // 动力：设备耗能 + 行驶耗能（按车重）；锅炉供给不够时，装填和车速一起按比例下降
    s.dryWeight = s.weight;
    s.weight += s.water; // 满水纸面重量；战斗帧中使用实时剩余水量。
    s.drive = SA.Phys.driveKw(s.weight, s.speed);
    s.demand = Math.round((s.equip + s.drive) * 10) / 10;
    s.blocked = blockedList(v);
    // 最高速度 = 底盘基础速度 × 动力比（锅炉富余时可以超速，最多 125%）
    s.speedMul = s.demand ? Math.min(K.SPEED_BOOST, s.supply / s.demand) : (s.supply ? 1 : 0);
    s.armorSpeedFactor = armorSpeedFactor(v);
    s.topSpeed = s.speed * s.speedMul * s.armorSpeedFactor;
    s.power = s.demand ? Math.min(1, s.supply / s.demand) : 1;
    const util = s.supply ? Math.min(1, s.demand / s.supply) : 0;
    let weaponHeat = 0;
    each(v, (cell, r, c, layer) => {
      const m = SA.mod(cell);
      if (!alive(cell) || !m.dmg) return;
      s.weapons++;
      if (layer === 'body' && s.blocked.some(b => b.r === r && b.c === c)) return;
      // 与战斗共用辅助件汇总倍率，纸面输出不再重复应用装弹、散布和晃动收益。
      const reload = m.reload * ax.reload;
      const salvo = m.salvo || 1;
      const shotDps = m.dmgPerSec ? m.dmgPerSec * salvo : m.dmg * salvo / reload;
      const splash = m.splash ? (m.splash.k * Math.PI * m.splash.r * m.splash.r / (K.CELL * K.CELL)) : 0;
      s.dps += (shotDps * Math.max(0.4, 0.95 - (m.spread || 0) * ax.spread * 0.03 + s.acc)) * s.power;
      s.salvoDps += shotDps * s.power;
      s.splashDps += shotDps * splash * 0.08 * s.power;
      s.heatDps += (m.heatPerSec || m.heat / reload) * s.power;
      s.tether += m.tether ? 12 : 0;
      weaponHeat += (m.heatPerSec ? m.heat : m.heat / reload) * s.power;
    });
    s.heatCapacity = SA.Phys.heatCapacity(s.dryWeight);
    s.heatMax = SA.Phys.heatMax(s.dryWeight);
    s.boilerHeat = s.heatRate * s.heatMul * Math.max(0.3, util);
    s.heatGen = s.boilerHeat + weaponHeat;
    s.overheat = overheatTime(weaponHeat, s.cool, s.water, s.dryCool, s.waterSave, s.heatCapacity, Math.min(s.supply, s.demand), s.boilerHeat);
    s.rating = Math.round(s.hp / 12 + s.dps * 5 + s.salvoDps * 0.8 + s.splashDps + s.heatDps / 25 + s.tether + s.store * 0.014 + s.dryCool * 0.16 + (1 - s.waterSave) * 120 + s.evade * 60 + s.rams * 15 + Math.min(s.overheat, 120) / 4);

    s.problems = [];
    if (!s.chassis) s.problems.push('没有底盘');
    if (!s.cockpits) s.problems.push('没有可用的驾驶舱');
    if (!s.boilers) s.problems.push('没有锅炉，机器无法启动');
    if (s.chassis && s.weight > s.load) s.problems.push(`超重：总重 ${SA.tons(s.weight)} 超过底盘承重 ${SA.tons(s.load)}`);
    s.issues = issues(v);
    if (s.issues.length) s.problems.push(`${s.issues.length} 个模块悬空或摆放不合规（车间里红色闪烁），接好才能出战`);
    // 履带是一个整体：有一段被毁就整条掉链，修好之前开不动
    const deadTracks = v.body[CH].filter(cell => cell && cell.id === 'track' && cell.hp <= 0).length;
    s.thrown = deadTracks > 0;
    if (s.thrown) s.problems.push('履带掉链（有一段被打断），在车间修好才能开');
    s.warnings = [];
    if (chassisCell && chassisCell.id === 'biped') {
      const rule = M.biped.balance || { steady: 0.25, limit: 0.6, topHeavy: 1.8, toleranceByMt: [] };
      s.balanceTolerance = rule.toleranceByMt[chassisMt - 1] || rule.limit;
      s.balance = Math.abs(s.d) <= rule.steady ? '平衡' : (Math.abs(s.d) <= s.balanceTolerance ? (s.d > 0 ? '前倾' : '后仰') : '失衡');
      s.balanceState = s.balance;
      s.topHeavy = s.comHeight > rule.topHeavy;
      const zones = chassisCell.bipedZones;
      s.hip = zones ? (zones.hip > 0 ? '正常' : '损毁') : (chassisCell.hp > 0 ? '正常' : '损毁');
      s.legs = zones ? (zones.leg > 0 ? '正常' : '损毁') : (chassisCell.hp > 0 ? '正常' : '损毁');
      if (s.balance === '失衡') s.problems.push('双足重心失衡，无法部署');
      if (s.topHeavy) s.warnings.push('双足头重脚轻，行走摆动增大');
    }
    if (s.demand > s.supply && s.boilers) s.warnings.push(`动力不足：车速和装填降至 ${Math.round(s.power * 100)}%`);
    if (s.blocked.length) s.warnings.push(`${s.blocked.length} 门武器被己方模块挡住，无法开火`);
    if (!s.weapons) s.warnings.push('没有武器');
    if (s.overheat < 60) s.warnings.push(`全力开火约 ${Math.round(s.overheat)} 秒后烧干`);
    const brokenOther = s.broken - deadTracks;
    if (brokenOther > 0) s.warnings.push(`${brokenOther} 个模块已损毁，不会参战`);
    s.canDeploy = s.problems.length === 0;
    return s;
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));

  // 参战副本：剔除损毁模块；hpMul 用于赛季强化
  function battleCopy(v, hpMul = 1, fullHp = false) {
    const b = create(v.name);
    each(v, (cell, r, c, layer) => {
      if (cell.hp <= 0) return;
      const max = Math.round(maxHp(cell) * hpMul);
      b[layer][r][c] = { id: cell.id, mt: cell.mt || 1, lv: cell.lv || 0, hp: fullHp ? max : Math.min(max, Math.round(cell.hp * hpMul)), max };
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
      && Number.isFinite(cell.hp) && cell.hp >= 0
      && (cell.max == null || (Number.isFinite(cell.max) && cell.max > 0));
    if (!valid) return false;
    // max 只允许记录规范耐久，不能由分享码放大。先验原材料，再沿用旧件比例迁移。
    const id = Object.hasOwn(M, cell.id) ? cell.id : SA.liveId(cell.id);
    const max = Math.round(SA.mod(id, cell.mt || 1).hp * (1 + SA.upHp(id) * (cell.lv || 0)));
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
          || layerOf(SA.liveId(id)) !== layer || anchors.has(`${r},${c}`)) return false;
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
    for (const [layer, list] of [['body', L.b || []], ['side', L.s || []]])
      for (const [r, c, id, variant] of list)
        if (M[id] && inGrid(r * k, c * k) && layerOf(SA.liveId(id)) === layer) {
          const cell = SA.newCell(id);
          if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
          v[layer][r * k][c * k] = SA.fixCell(cell);
        }
    v.pv = L.pv;
    // 兼容曾经保存的污染蓝图：保留正常构筑，只过滤无法规划的迁移退库项。
    v.migrationStock = (Array.isArray(L.ms) ? L.ms : []).filter(validStockCell).map(cell => SA.fixCell(JSON.parse(JSON.stringify(cell))));
    return migratePressure(normalizeChassis(L.a === ARMOR_VER ? v : widenArmor(v)));
  }
  // 完整模块清单 [层(0 主体 / 1 侧挂), 行, 列, id, 材料, 改装等级] → 载具（进化报告用；分享码不记材料和改装）
  function fromCells(name, cells) {
    const v = create(name);
    for (const [l, r, c, id, mt, lv, variant] of cells || []) {
      const live = SA.liveId(id);
      if (!M[live] || !inGrid(r, c)) continue;
      const cell = SA.newCell(live, mt || 1);
      if (lv) { cell.lv = lv; cell.hp = maxHp(cell); }
      if (variant) { if (variant.look) cell.look = variant.look; if (variant.unique) cell.unique = variant.unique; }
      v[l ? 'side' : 'body'][r][c] = SA.fixCell(cell);
    }
    return migratePressure(normalizeChassis(v), true);
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
      const v = create(String(d.n || '无名载具').slice(0, 20));
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
          v[layerOf(cell.id)][r][c] = SA.fixCell(cell);
        }
        return migratePressure(normalizeChassis(v));
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
      // 车间允许保存标红部件；新版分享码不能因自由摆放尚不合法而吞掉加压舱。
      for (const [, , i] of pending) if (SA.MODULE_ORDER[i] === 'pressure_chamber')
        v.migrationStock.push(SA.newCell('pressure_chamber'));
      return migratePressure(normalizeChassis(v));
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

  function placeCheck(v, id, r, c) {
    if (M[id].layer !== 'chassis') return SA.V.canPlace(v, id, r, c);
    const test = SA.V.clone(v);
    for (const o of chassisClash(v, id, null)) test.body[o.r][o.c] = null;
    return SA.V.canPlace(test, id, r, c);
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
  return { widenArmor, chassisRow, chassisRowOf, bipedOf, bipedWaist, floorRow, endArmorSide, armorSpeedFactor, create, fromAscii, fromBig, migrate, region, inRegion, boxInRegion, occ, at, CH, each, canPlace, place, canPut, put, remove, move, issues, layout, fromLayout, fromCells, countIds, blockedList, stats, clone, battleCopy, encode, decode, validLayout, validStockCell, layerOf, maxHp, alive, editorSpot, placeCheck, chassisClash, statsWith };
})();
