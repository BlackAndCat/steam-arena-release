// 存档与经济
window.SA = window.SA || {};

SA.S = (() => {
  const KEY = 'steam_arena_save_v2';   // v2：战役 + 材料（v1 的旧存档不再读取）
  const DESIGN_KEY = 'steam_arena_design_v1'; // 设计模式的临时存档，与正式进度完全分开
  let d = null;

  // 新档与开发者主动替换共用同一份固定的黄铜四件车配置。
  function starterVehicle() { return SA.V.fromAscii('一号原型机', SA.STARTER.rows, [], 1, [], SA.STARTER.subs); }

  function fresh() {
    return {
      money: 300, debt: 0, rep: 0, season: 1, round: 0,
      inv: {}, ingots: {},   // 新档先用四件初始车作教学，首胜再领取小水罐。
      vehicle: starterVehicle(),
      // 领取账本按奖励 key 记；stockCells 保存有身份或迁移耐久的库存实例，inv 仍是供现有车间读取的总件数。
      uniqueClaims: {}, stockCells: [],
      bet: null,
      // 战役进度：ch 章、st 关；feat 已开放的功能、mods 商店里能买的模块、mat 能升级到的材料、grid 改装台大小
      camp: { ch: 0, st: 0, intro: -1, done: false, sideWins: {}, ...JSON.parse(JSON.stringify(SA.CAMP_START)) },
      orders: [], ordersDone: [],
      wins: 0, losses: 0, battles: 0, champion: 0,
      news: '老汤姆的铁匠铺后院：你的第一台原型机已经点着了锅炉。去「出战」打第一场练习赛。',
    };
  }

  function load() {
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    if (!d || !d.vehicle || !d.camp) d = fresh();
    d.ingots = d.ingots || {};
    d.uniqueClaims = d.uniqueClaims || {};
    d.stockCells = d.stockCells || [];
    const oldArmor = !d.vehicle.av;         // 铁装甲 2×2 → 1×2 之前的存档：车上的由 migrate 拆成两块，库存里的数量翻倍
    d.vehicle = SA.V.migrate(d.vehicle);   // 旧存档是 6 × 8 大格，换算成子格
    if (oldArmor) for (const k in d.inv || {}) if (SA.parseKey(k).id === 'armor') d.inv[k] *= 2;
    fixModules(d);
    // 放不下的旧加压舱保留材料、耐久和改装后入库；清空待退清单，刷新不重复补偿。
    for (const cell of d.vehicle.migrationStock || []) addInv(cell.id, 1, cell.mt || 1, cell);
    delete d.vehicle.migrationStock;
    return d;
  }
  // 模块表改动后的旧存档修正：副驾驶 → 联合驾驶舱；低于最低材料的（黄铜直射火炮）补到最低材料；开局的新模块补进商店
  function fixModules(s) {
    s.inv = s.inv || {};
    const oldAux = { scope: 'periscope', loader: 'autoloader', gyro: 'gyroscope', ranger: 'rangefinder' };
    SA.V.each(s.vehicle, (cell) => {
      // 旧存档的驾驶舱槽位迁移为库存中的 1×1 实体模块。
      for (const old of cell.aux || []) if (oldAux[old]) s.inv[oldAux[old]] = (s.inv[oldAux[old]] || 0) + 1;
      delete cell.aux;
      SA.fixCell(cell);
    });
    const inv = {};
    for (const k in s.inv) { const f = SA.fixKey(k); inv[f] = (inv[f] || 0) + s.inv[k]; }
    s.inv = inv;
    // 清掉旧实现把普通模块库存误算成唯一件的账本条目；旧支线记录只供存档兼容。
    for (const key of Object.keys(s.uniqueClaims)) if (!SA.uniqueByKey(key)) delete s.uniqueClaims[key];
    for (const cell of s.stockCells) {
      const oldKey = SA.fixKey(SA.invKey(cell.id, cell.mt || 1));
      SA.fixCell(cell);
      const newKey = SA.invKey(cell.id, cell.mt || 1);
      // 唯一件的固定材料纠正必须同时移动聚合计数，否则旧键会残留一件可再次取出的普通模块。
      if (oldKey !== newKey && s.inv[oldKey] > 0) {
        if (--s.inv[oldKey] <= 0) delete s.inv[oldKey];
        s.inv[newKey] = (s.inv[newKey] || 0) + 1;
      }
    }
    // 已持有的实例保留身份；普通观察镜、重装甲、四足和双足不再登记全局唯一。
    SA.V.each(s.vehicle, (cell) => {
      const rule = SA.uniqueRule(cell);
      if (rule) s.uniqueClaims[rule.key] = s.uniqueClaims[rule.key] || { mt: cell.mt || 1, source: 'legacy' };
    });
    for (const cell of s.stockCells) { const rule = SA.uniqueRule(cell); if (rule) s.uniqueClaims[rule.key] = s.uniqueClaims[rule.key] || { mt: cell.mt || 1, source: 'legacy' }; }
    for (const k in s.inv) {
      const p = SA.parseKey(k);
      if (s.inv[k] > 0 && SA.isUnique(p.id)) s.uniqueClaims[p.id] = s.uniqueClaims[p.id] || { mt: p.mt, source: 'legacy' };
    }
    const C = s.camp;
    C.sideWins = C.sideWins || {};
    const mods = [];
    for (const id of [...SA.CAMP_START.mods, ...C.mods]) { const f = SA.liveId(id); if (!mods.includes(f)) mods.push(f); }
    C.mods = mods;
  }
  function save() {
    try {
      const key = SA.Camp && SA.Camp.isDesignMode && SA.Camp.isDesignMode() ? DESIGN_KEY : KEY;
      localStorage.setItem(key, JSON.stringify(d));
      return true;
    } catch (e) { /* 隐私模式 */ return false; }
  }
  function reset() { d = fresh(); save(); return d; }

  // 玩家重开只替换正式进度；设计模式拒绝调用，蓝图库和作者草稿均不在此处清理。
  function restartGame() {
    if (SA.Camp?.isDesignMode?.()) return false;
    const previous = d;
    d = fresh();
    if (save()) return true;
    d = previous;
    return false;
  }

  // 主动换车时逐件退回原车，保留每件的耐久、等级、唯一身份和外观；其余存档字段不动。
  function replaceWithStarter() {
    if (!d || !d.vehicle) throw new Error('请先加载存档');
    SA.V.each(d.vehicle, cell => addInv(cell.id, 1, cell.mt || 1, cell));
    d.vehicle = starterVehicle();
    if (SA.Camp?.syncLim) SA.Camp.syncLim();
    save();
    return d.vehicle;
  }

  // 库存按「模块 + 材料」分开记：黄铜的键就是 id，其余是 id@材料（SA.invKey）
  function addInv(id, n = 1, mt = SA.buyMt(id), cell = null) {
    // 聚合数量与完整实例必须用同一合法键，旧高档蒸汽 / 低档喷火不能留下可重复取出的旧行。
    const item = cell ? SA.fixCell(JSON.parse(JSON.stringify(cell))) : SA.newCell(id, mt);
    id = item.id; mt = item.mt || 1;
    if (n < 0) { for (let i = 0; i < -n; i++) takeStock(id, mt); return; }
    const k = SA.invKey(id, mt);
    d.inv[k] = (d.inv[k] || 0) + n;
    if (cell) for (let i = 0; i < n; i++) d.stockCells.push(JSON.parse(JSON.stringify(item)));
  }
  // 库存选择接口：不改现有按种类/材料分行的 UI。默认按入库顺序先装唯一件；Opus 可传 key 精确选择，null 指普通件。
  function stockOptions(id, mt) {
    const saved = d.stockCells.filter(x => x.id === id && (x.mt || 1) === mt);
    const plain = Math.max(0, (d.inv[SA.invKey(id, mt)] || 0) - saved.length);
    return [...saved.filter(x => SA.isUnique(x)), ...saved.filter(x => !SA.isUnique(x)), ...Array.from({ length: plain }, () => SA.newCell(id, mt))];
  }
  function takeStock(id, mt, uniqueKey) {
    if (!(d.inv[SA.invKey(id, mt)] > 0)) return null;
    const cell = stockOptions(id, mt).find(x => uniqueKey === undefined || (SA.uniqueRule(x)?.key || null) === uniqueKey);
    if (!cell) return null;
    const at = d.stockCells.indexOf(cell);
    if (at >= 0) d.stockCells.splice(at, 1);
    const k = SA.invKey(id, mt);
    if (--d.inv[k] <= 0) delete d.inv[k];
    return cell;
  }
  const invCount = (id) => Object.keys(d.inv).reduce((a, k) => a + (SA.parseKey(k).id === id ? d.inv[k] : 0), 0);
  // 从库存取出一个该模块，优先拿材料最好的；返回材料等级，没有就返回 0
  function takeBest(id) {
    let best = 0;
    for (const k in d.inv) { const p = SA.parseKey(k); if (p.id === id && d.inv[k] > 0) best = Math.max(best, p.mt); }
    if (best) addInv(id, -1, best);
    return best;
  }
  const addIngots = (map) => { for (const k in map || {}) d.ingots[k] = (d.ingots[k] || 0) + map[k]; };
  // 唯一件只能由缴获流程写入账本；重复调用保持幂等并拒绝第二件。
  function hasUnique(key) { return !!(d.uniqueClaims && d.uniqueClaims[key]); }
  function claimUnique(key, mt, source = 'salvage') {
    if (hasUnique(key)) return false;
    d.uniqueClaims[key] = { mt: mt || SA.uniqueByKey(key)?.mt || 5, source, at: Date.now() };
    return true;
  }

  // 银行：每场比赛未还清的债务加收 10% 利息
  const LOAN_CAP = 1500;
  const loanRoom = () => Math.max(0, LOAN_CAP - d.debt);
  function borrow(n) {
    if (n <= 0 || n > loanRoom()) return false;
    d.debt += n; d.money += n;
    return true;
  }
  // 买下 n 个模块进库存
  function buy(id, n = 1) {
    if (!buyable(id)) return false;
    const cost = SA.buyPrice(id) * n;
    if (d.money < cost) return false;
    d.money -= cost; addInv(id, n, SA.buyMt(id));
    return true;
  }

  function repairCost(cell) {
    if (SA.Camp && SA.Camp.isDesignMode && SA.Camp.isDesignMode()) return 0;
    // 修满 = 模块总价值（含材料和改装）× 该模块的修理费比例（SA.repairRate），按损伤比例计；报废的也按修满算
    const lost = 1 - Math.max(0, cell.hp) / SA.V.maxHp(cell);
    return lost <= 0 ? 0 : Math.max(1, Math.ceil(lost * SA.cellValue(cell) * SA.repairRate(cell.id)));
  }

  // 终局锦标赛（通关战役后开放）：第 1 赛季对手是镀镍，之后每季升一级材料，封顶以太合金后再加耐久
  function opponent(i = d.round) {
    const o = SA.OPPONENTS[i];
    const mt = Math.min(SA.MAT_MAX, 3 + d.season);
    const mul = 1 + Math.max(0, d.season - 3) * 0.2;
    return { ...o, index: i, hpMul: mul, mt, prize: Math.round(o.prize * (2 + (d.season - 1) * 0.6)), vehicle: SA.V.fromAscii(o.name, o.rows, o.sides, mt) };
  }

  // 赔率：对手评分 / 我方评分
  function odds(ev, hpMul = 1) {
    const me = SA.V.stats(d.vehicle).rating;
    const them = SA.V.stats(SA.V.battleCopy(ev, hpMul, true)).rating;
    return Math.max(1.15, Math.min(5, +(1.1 + (them / Math.max(1, me)) * 0.9).toFixed(2)));
  }

  // 分享码示例：只读内置数据，不写本地“云端”存储；玩家车辆通过蓝图库导入 / 导出分享码。
  const Cloud = {
    list() {
      const presets = SA.CLOUD_PRESETS.map(p => ({ author: p.author, name: p.name, code: SA.V.encode(SA.V.fromAscii(p.name, p.rows, p.sides)) }));
      return presets;
    },
  };

  // 提示金额的格式与原界面一致，结算规则不依赖 DOM。
  const formatMoney = (n) => `£${Math.round(n).toLocaleString()}`;

  // 蓝图库独立存储与应用规则；重置主存档时仍保留蓝图。
  const Blueprints = (() => {
    const M = SA.MODULES;
  const KEY = 'steam_arena_blueprints_v1';   // 独立于存档，SA.reset() 不会清掉
  const d = () => SA.S.d;
  const money = formatMoney;

  const official = () => SA.OFFICIAL_BLUEPRINTS.map(b => ({ official: true, name: b.name, desc: b.desc, ...SA.V.layout(SA.V.fromAscii(b.name, b.rows, b.sides || [])) }));
  function mine() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY));
      if (!Array.isArray(list)) return [];
      // 旧存档可能已导入坏迁移退库项；读时隔离污染，不因单张坏蓝图卡住整个列表。
      return list.filter(bp => bp && typeof bp === 'object' && !Array.isArray(bp) && SA.V.validLayout({ ...bp, ms: [] }))
        .map(bp => ({ ...bp, ms: (Array.isArray(bp.ms) ? bp.ms : []).filter(SA.V.validStockCell) }));
    } catch (e) { return []; }
  }
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* 隐私模式 */ } }

  function save(name) {
    const list = mine();
    list.unshift({ name, ...SA.V.layout(d().vehicle), at: Date.now() });
    store(list);
  }
  function overwrite(i) {
    const list = mine();
    Object.assign(list[i], SA.V.layout(d().vehicle), { at: Date.now() });
    store(list);
  }
  function del(i) { const list = mine(); list.splice(i, 1); store(list); }
  function rename(i, name) { const list = mine(); if (list[i]) { list[i].name = name; store(list); } }

  // 应用蓝图要花多少钱：优先复用车上的模块（受损的先用上，保留原耐久），再用库存，最后补买
  function plan(bp) {
    const target = SA.V.fromLayout(d().vehicle.name, bp);
    const requests = [];
    SA.V.each(target, (cell, r, c, layer) => requests.push({ cell, r, c, layer }));
    // 旧蓝图放不下的加压舱仍计入需求，应用后留在库存；分享蓝图不会凭空赠送这些零件。
    for (const cell of target.migrationStock || []) requests.push({ cell, stock: true });
    const identity = cell => SA.uniqueRule(cell)?.key || cell.id;
    const need = {}, kinds = {};
    for (const { cell } of requests) { const key = identity(cell); need[key] = (need[key] || 0) + 1; kinds[key] = cell; }
    const pool = {};
    let scrap = 0;
    const blocked = [];
    SA.V.each(d().vehicle, (cell) => {
      if (cell.hp <= 0) scrap += Math.round(SA.cellValue({ id: cell.id, mt: cell.mt }) * 0.1);
      else { const key = identity(cell); (pool[key] = pool[key] || []).push(cell); }
    });
    // 车上的同款模块：材料好的先用，同材料里受损的先用上（保留原耐久）
    for (const id in pool) pool[id].sort((a, b) => (b.mt || 1) - (a.mt || 1) || a.hp / SA.V.maxHp(a) - b.hp / SA.V.maxHp(b));
    const buy = {}, stock = {};
    let buyCost = 0, fixCost = 0;
    for (const key in need) {
      const cell = kinds[key], id = cell.id;
      stock[key] = [];
      for (let mt = SA.MAT_MAX; mt >= 1; mt--) stock[key].push(...stockOptions(id, mt).filter(x => identity(x) === key));
      const miss = Math.max(0, need[key] - (pool[key] || []).length - stock[key].length);
      if (miss && SA.isUnique(cell)) blocked.push(`${SA.uniqueRule(cell).name || M[id].name}是唯一件，只能通过缴获获得`);
      else if (miss && ['steamjet', 'flamer'].includes(id) && !SA.S.buyable(id)) blocked.push(`${M[id].name}还没解锁或材料尚未开放`);
      else if (miss) { buy[id] = (buy[id] || 0) + miss; buyCost += miss * SA.buyPrice(id); }
    }
    // 用不上的受损模块要修好才能放回库存
    for (const id in pool) for (const cell of pool[id].slice(need[id] || 0)) if (cell.hp < SA.V.maxHp(cell)) fixCost += SA.S.repairCost(cell);
    return { target, requests, identity, need, pool, stock, buy, buyCost, fixCost, scrap, blocked, cost: buyCost + fixCost };
  }

  // 付款确认后按原计划组装，库存、回收款与车辆变更统一在逻辑层处理。
  function applyPlan(p) {
      if (p.blocked.length || Object.keys(p.buy).some(id => ['steamjet', 'flamer'].includes(id) && !SA.S.buyable(id))) return false;
      for (const id in p.buy) SA.S.addInv(id, p.buy[id], SA.buyMt(id));
      for (const { cell, r, c, layer, stock } of p.requests) {
        const key = p.identity(cell), reuse = p.pool[key] && p.pool[key].shift();
        const saved = !reuse && p.stock[key].shift();
        const item = reuse || takeStock(cell.id, saved ? saved.mt || 1 : SA.buyMt(cell.id), SA.uniqueRule(cell)?.key || null);
        if (stock) addInv(item.id, 1, item.mt || 1, item);
        else p.target[layer][r][c] = item;
      }
      delete p.target.migrationStock;
      // 用不上的模块回库存；改装件按半价回收
      for (const id in p.pool) for (const cell of p.pool[id]) {
        const restored = SA.newCell(cell.id, cell.mt || 1);
        if (cell.unique) restored.unique = cell.unique;
        if (cell.look) restored.look = cell.look;
        SA.S.addInv(cell.id, 1, cell.mt || 1, SA.isUnique(cell) ? restored : null);
        for (let k = 1; k <= (cell.lv || 0); k++) d().money += Math.round(SA.upCost(cell.id, k) * 0.5);
      }
      d().money += p.scrap;
      d().vehicle = p.target;
      SA.Camp.syncLim();
      SA.S.save();
      return true;
  }

  // 统一列表：我的 → 官方 → 内置分享码示例（示例也能当蓝图直接应用）
  function all() {
    const out = [];
    mine().forEach((b, i) => out.push({ ...b, kind: 'mine', index: i, key: `m${b.at}` }));
    official().forEach((b, i) => out.push({ ...b, kind: 'official', key: `o${i}` }));
    SA.S.Cloud.list().forEach((e, i) => {
      const v = SA.V.decode(e.code);
      if (v) out.push({ name: e.name, author: e.author, code: e.code, kind: 'cloud', key: `c${i}${e.name}`, ...SA.V.layout(v) });
    });
    return out;
  }

  // 导入分享码：存成自己的蓝图
  function importCode(code) {
    const v = SA.V.decode(code);
    if (!v) return null;
    const list = mine();
    list.unshift({ name: v.name, ...SA.V.layout(v), at: Date.now() });
    store(list);
    return v;
  }

  // 分享：只生成分享码，不写任何云端或本地上传记录。
  function share(bp) {
    const v = SA.V.fromLayout(bp.name, bp);
    return SA.V.encode(v);
  }

    return { all, save, overwrite, del, rename, mine, official, plan, applyPlan, importCode, share };
  })();

  function arenaEntries(mode) {
    const D = d;
    if (mode === 'camp') {
      const C = D.camp, over = SA.Camp.done();
      return SA.CAMPAIGN.slice(0, SA.Camp.chapterCount()).flatMap((chapter, chapterIndex) => chapter.stages.flatMap((o, i) => {
        const beaten = over || chapterIndex < C.ch || (chapterIndex === C.ch && i < C.st);
        const next = !over && chapterIndex === C.ch && i === C.st;
        if (!beaten && !next) return [];
        const stage = SA.Camp.stage(chapterIndex, i);
        const replay = beaten;
        return [{ key: `${chapterIndex},${i}`, name: stage.name, pilot: stage.pilot, blurb: stage.blurb, v: stage.vehicle, raw: stage.vehicle, hpMul: 1, rating: SA.V.stats(stage.vehicle).rating, prize: replay || stage.rewardMoney === false ? 0 : stage.prize, boss: stage.boss, terrain: stage.terrain || 'flat', bounds: stage.chapter.bounds, replay, next,
          tag: replay ? ['ok', '可重打'] : next ? ['next', stage.boss ? 'Boss' : '下一场'] : ['no', stage.boss ? 'Boss' : `第 ${i + 1} 场`],
          title: `第 ${chapterIndex + 1} 章 · 第 ${i + 1} 场 · ${stage.name}`, lock: replay || next ? null : '先完成前面的战役',
          // 战前控制台可修改当前关卡；真正开战时再取一次最新数据，剧情编号和重打规则仍固定。
          start: () => {
            const latest = SA.Camp.stage(chapterIndex, i);
            // 本场经济规则随战斗选项固定，结算时不再读取可能已被工作台修改的关卡。
            SA.Battle.start({ mode: 'campaign', storyKey: `${chapterIndex},${i}`, replay, enemyVehicle: latest.vehicle, enemyName: latest.vehicle?.name || latest.name, aim: latest.aim, style: latest.style, terrain: latest.terrain, bounds: latest.chapter.bounds, boss: latest.boss, hpMul: 1, prize: replay || latest.rewardMoney === false ? 0 : latest.prize, rewardMoney: latest.rewardMoney !== false, victoryRepairFree: latest.victoryRepairFree === true, uniqueLoot: latest.uniqueLoot || [] });
          } }];
      }));
    }
    if (mode === 'tour') return SA.OPPONENTS.map((o, i) => {
      const op = SA.S.opponent(i);
      const bv = SA.V.battleCopy(op.vehicle, op.hpMul, true);
      const terrain = SA.TERRAIN_ORDER[i % SA.TERRAIN_ORDER.length];   // 终局锦标赛：六轮六种场地
      return { key: i, name: op.name, pilot: op.pilot, blurb: op.blurb, v: bv, raw: op.vehicle, hpMul: op.hpMul, rating: SA.V.stats(bv).rating, prize: op.prize, terrain,
        tag: i < D.round ? ['ok', '已击败'] : i === D.round ? ['next', '下一场'] : ['no', `第 ${i + 1} 轮`],
        title: `第 ${i + 1} 轮 · ${op.name}`, lock: i !== D.round ? (i < D.round ? '已经击败过了' : `先打完第 ${D.round + 1} 轮`) : null,
        start: () => SA.Battle.start({ mode: 'tournament', enemyVehicle: op.vehicle, enemyName: op.name, aim: op.aim, terrain, boss: i === SA.OPPONENTS.length - 1, hpMul: op.hpMul, prize: op.prize }) };
    });
    if (mode === 'street') {
      const me = SA.V.stats(D.vehicle).rating;
      return SA.Street.offers().map((o, i) => {
        const tier = SA.STREET_TIERS[i];
        const v = SA.Street.vehicleOf(o), cap = SA.Street.cap(i);
        return { key: i, name: o.name, pilot: o.pilot, blurb: '街坊邻居随手拼的小车。赢了拿奖金，不计声望、不影响赛程；损伤照常带回车间。', v, rating: o.rating, prize: o.prize, terrain: o.terrain || 'flat',
          tag: ['', `上限 ${cap}`], title: `${tier.name} · ${o.name}`, lock: me > cap ? `你的评分 ${me} 超过上限 ${cap}` : null,
          start: () => SA.Battle.start({ mode: 'street', streetTier: i, enemyVehicle: v, enemyName: o.name, aim: o.aim, terrain: o.terrain, hpMul: 1, prize: o.prize }) };
      });
    }
    return [];
  }


  // 下注和撤回只变更存档；界面负责保持原刷新与提示顺序。
  function placeBet(amount, odds) { d.money -= amount; d.bet = { amount, odds }; save(); }
  function cancelBet() { d.money += d.bet.amount; d.bet = null; save(); }

  // 战斗结算只更新存档并返回原提示；缴获与解锁弹窗由视觉层按顺序呈现。
  const drawFee = (prize) => Math.max(5, Math.round(prize * 0.1 / 5) * 5);
  function settleBattle(res) {
    const lines = [], pre = [], money0 = d.money;
    // 旧链接或脚本传入已取消的遭遇战时，不结算战损、奖励或旧档进度。
    if (res.mode === 'side') return { lines, pre, money0 };
    // 发行版拒绝越过开放章节的伪造结算，避免修改战损、经济与进度。
    if (SA.RELEASE && res.mode === 'campaign') {
      const key = /^(\d+),(\d+)$/.exec(String(res.opts?.storyKey || ''));
      if (!key || !SA.Camp.stage(Number(key[1]), Number(key[2]))) return { lines, pre, money0 };
    }
    if (res.replay) {
      d.news = res.win ? `「${d.vehicle.name}」重打击败了「${res.enemyName}」。` : `「${d.vehicle.name}」完成了与「${res.enemyName}」的重打。`;
      save();
      return { lines, pre, money0 };
    }
    const settlesDamage = res.mode !== 'friendly';
    if (res.mode !== 'friendly' && settlesDamage) {
      d.battles++;
      // 损伤带回车间
      SA.V.each(d.vehicle, (cell, r, c, layer) => {
        if (cell.hp <= 0) return;
        const b = res.playerVehicle[layer][r][c];
        cell.hp = b ? Math.max(0, b.hp) : 0;
      });
    }
    if (res.mode === 'street') {
      const tier = SA.STREET_TIERS[res.opts.streetTier];
      if (res.draw) {
        const fee = drawFee(res.prize);
        d.money += fee;
        lines.push(`平手：双方各拿出场费 ${formatMoney(fee)}`);
        d.news = `「${d.vehicle.name}」在${tier.name}和「${res.enemyName}」打成平手。`;
      } else if (res.win) {
        d.money += res.prize; d.wins++;
        lines.push(`奖金 +${formatMoney(res.prize)}`);
        d.news = `「${d.vehicle.name}」在${tier.name}赢了「${res.enemyName}」，进账 ${formatMoney(res.prize)}。`;
      } else {
        d.losses++;
        d.news = `「${d.vehicle.name}」在${tier.name}输给了「${res.enemyName}」。`;
      }
      lines.push('街头赛不计声望，也不影响战役进度。');
      SA.Street.consume(res.opts.streetTier);
    } else if (res.mode === 'campaign' || res.mode === 'tournament') {
      const camp = res.mode === 'campaign';
      if (d.debt) { const add = Math.ceil(d.debt * 0.1); d.debt += add; lines.push(`银行利息 +${formatMoney(add)}`); }
      // 关卡关闭金币时，平局也不发最低 5 金币的出场费；赌注仍按原规则退回。
      const rewardMoney = !camp || res.opts?.rewardMoney !== false;
      if (res.draw) {
        if (rewardMoney) {
          const fee = drawFee(res.prize);
          d.money += fee;
          lines.push(`平手：双方各拿出场费 ${formatMoney(fee)}，这一场要重赛`);
        } else lines.push('平手：这一场要重赛');
        if (d.bet) { d.money += d.bet.amount; lines.push(`平局退还赌注 ${formatMoney(d.bet.amount)}`); }
        d.news = `「${d.vehicle.name}」和「${res.enemyName}」打成平手，择日重赛。`;
      } else if (res.win) {
        if (rewardMoney) d.money += res.prize;
        d.wins++;
        const rep = (res.flawless ? 2 : 1) + (res.surrendered ? 1 : 0);
        d.rep += rep;
        if (rewardMoney) lines.push(`奖金 +${formatMoney(res.prize)}`);
        lines.push(`声望 +${rep}${[res.flawless ? '驾驶舱毫发无损' : '', res.surrendered ? '接受投降，体面收场' : ''].filter(Boolean).map(x => `（${x}）`).join('')}`);
        if (d.bet) { const pay = Math.round(d.bet.amount * d.bet.odds); d.money += pay; lines.push(`赌注兑现 +${formatMoney(pay)}`); }
        // 缴获：只有你还没有的零件或史诗 / 传奇件；什么都没有就说一声
        const loot = SA.Camp.salvageOptions(res.survivors || []);
        if (loot.length) pre.push({ kind: 'salvage', survivors: res.survivors || [] });
        else lines.push('对手车上没有你缺的零件，这次没什么可缴获的。');
        if (camp) {
          const r = SA.Camp.win();
          lines.push(...r.lines);
          for (const u of r.unlocks) pre.push({ kind: 'unlock', unlock: u });
          const st = SA.Camp.current();
          d.news = SA.Camp.done() ? (SA.RELEASE ? `「${d.vehicle.name}」完成了当前开放的战役，可以重打已开放的关卡。` : `「${d.vehicle.name}」击败女王号，夺得帝国蒸汽大奖赛冠军！`)
            : `「${d.vehicle.name}」击败了「${res.enemyName}」。下一场：${SA.CAMPAIGN[st.ci].name} · ${st.name}。`;
        } else {
          d.round++;
          if (d.round >= SA.OPPONENTS.length) {
            d.champion++; d.season++; d.round = 0;
            SA.S.addIngots({ aether: 1 });
            lines.push(`🏆 你赢得了第 ${d.season - 1} 赛季冠军！奖励 ${SA.INGOTS.aether.name} ×1。新赛季的对手会换上更好的材料。`);
            d.news = `「${d.vehicle.name}」夺得伦敦蒸汽大奖赛第 ${d.season - 1} 赛季冠军！`;
          } else {
            d.news = `「${d.vehicle.name}」击败了「${res.enemyName}」，晋级第 ${d.round + 1} 轮。`;
          }
        }
      } else {
        d.losses++;
        if (d.bet) lines.push(`赌注 ${formatMoney(d.bet.amount)} 输光了`);
        d.news = `「${d.vehicle.name}」败给了「${res.enemyName}」。${SA.Camp.has('garage') ? '回车间对症改装，再来。' : '再来一次。'}`;
      }
      d.bet = null;
    } else {
      lines.push('友谊赛：不结算奖金，也不留下损伤。');
    }
    SA.S.save();
    return { lines, pre, money0 };
  }

  function stashCell(cell) {
    let back = 0;
    for (let k = 1; k <= (cell.lv || 0); k++) back += Math.round(SA.upCost(cell.id, k) * 0.5);
    if (cell.hp <= 0) back += Math.round(SA.cellValue({ id: cell.id, mt: cell.mt }) * 0.1);
    else {
      const stock = SA.newCell(cell.id, cell.mt || 1);
      if (cell.unique) stock.unique = cell.unique;
      if (cell.look) stock.look = cell.look;
      SA.S.addInv(cell.id, 1, cell.mt || 1, SA.isUnique(cell) ? stock : null);
    }
    d.money += back;
    return back;
  }

  // 材料升级：黄铜 → 熟铁 → 钢 → 镀镍（花钱，随战役解锁）→ 乌兹钢 / 以太合金（还要消耗锭 / 结晶）
  function matUpInfo(cell) {
    if (SA.isUnique(cell)) return { max: true, why: '唯一件材料固定' };
    const to = (cell.mt || 1) + 1;
    if (to > SA.maxMt(cell.id)) return { max: true, why: cell.id === 'steamjet' ? '蒸汽喷射器最高为钢材料（T3）；喷火器从镀镍（T4）起另行获得' : '' };
    const mat = SA.MATS[to], cost = SA.matUpCost(cell.id, to);
    if (mat.ingot) {
      const n = d.ingots[mat.ingot] || 0;
      return { to, mat, cost, ok: n > 0, why: n > 0 ? '' : `需要 ${SA.INGOTS[mat.ingot].name}（Boss 掉落）` };
    }
    if (to > SA.Camp.maxMat()) return { to, mat, cost, ok: false, why: `${mat.name}还没解锁（推进战役）` };
    return { to, mat, cost, ok: true };
  }

  // 通过原摆放检查并付款后执行换件；回收和库存扣除保持原先顺序。
  function installStock(v, id, r, c, mt, layer, cur, clash, uniqueKey) {
    const check = SA.V.clone(v);
    if (cur) check[layer][cur.r][cur.c] = null;
    for (const o of clash) check.body[o.r][o.c] = null;
    if (!SA.V.canPut(check, id, r, c).ok) return 0;
    const item = takeStock(id, mt, uniqueKey);
    if (!item) return 0;
    const old = cur && cur.cell;
      let scrap = 0;
      if (old) { v[layer][cur.r][cur.c] = null; scrap = stashCell(old); }
      for (const o of clash) { v.body[o.r][o.c] = null; scrap += stashCell(o.cell); }
      v[layer][r][c] = item;
    return scrap;
  }

  // 编辑器操作：付款在原确认入口扣除，其余模块变更在此执行。
  // 商店只卖有效的非退役模块；额外名单仅替代模块解锁，不放宽其他交易门槛。
  const buyable = (id) => typeof id === 'string' && Object.hasOwn(SA.MODULES, id) && !Object.hasOwn(SA.RETIRED, id)
    && SA.Camp.has('shop') && (SA.Camp.hasMod(id) || SA.SHOP_EXTRAS.includes(id))
    && !SA.isUnique(id) && SA.minMt(id) <= SA.Camp.maxMat();
  function payAmount(amount) { d.money -= amount; save(); }
  function repay(n) { const x = Math.min(n, d.debt); d.debt -= x; d.money -= x; }
  function repairCells(cells) { for (const c of cells) c.hp = SA.V.maxHp(c); }
  function upgradeMaterial(cell, u) {
    // 执行时重读规则，拒绝过期提示或直接调用绕过蒸汽 T3 上限；不额外扣除界面已经支付的费用。
    const current = matUpInfo(cell);
    if (!current.ok || !u || u.to !== current.to) return false;
    if (current.mat.ingot) d.ingots[current.mat.ingot]--;
    const before = SA.V.maxHp(cell);
    cell.mt = u.to;
    if (cell.hp > 0) cell.hp += SA.V.maxHp(cell) - before;
    return true;
  }
  function upgradeCell(cell, lv) {
    const before = SA.V.maxHp(cell);
    cell.lv = lv;
    if (cell.hp > 0) cell.hp += SA.V.maxHp(cell) - before;
  }
  function renameVehicle(name) { d.vehicle.name = name.trim() || '原型机'; save(); }
  function sellStock(id, mt, uniqueKey) {
    // 旧库存行未展示唯一身份；未明确指定 key 时只出售普通件，避免合并行误卖不可再次领取的奖励。
    const cell = takeStock(id, mt, uniqueKey === undefined ? null : uniqueKey);
    if (!cell) return 0;
    const x = Math.round(SA.cellValue(cell) * 0.5);
    d.money += x;
    return x;
  }
  function removeVehicleCell(layer, r, c) {
    const res = SA.V.remove(d.vehicle, layer, r, c);
    if (!res.ok) return res;
    let scrap = 0;
    for (const cell of res.removed) scrap += stashCell(cell);
    return { ...res, scrap };
  }
  return { load, save, restartGame, ...(!SA.RELEASE ? { reset, replaceWithStarter } : {}), starterVehicle, get d() { return d; }, addInv, invCount, takeBest, stockOptions, takeStock, addIngots, hasUnique, claimUnique, LOAN_CAP, loanRoom, borrow, buy, repairCost, opponent, odds, Cloud, Blueprints, arenaEntries, placeBet, cancelBet, settleBattle, stashCell, matUpInfo, buyable, payAmount, repay, repairCells, upgradeMaterial, upgradeCell, renameVehicle, sellStock, installStock, removeVehicleCell };
})();
