// 模块数值、外观和材料的唯一内容源是 config/modules.json；本文件只保留运行规则。
window.SA = window.SA || {};
const moduleConfig = SA.Config.get('modules');
SA.K = moduleConfig.K;
SA.MODULES = moduleConfig.MODULES;
SA.MODULE_ORDER = moduleConfig.MODULE_ORDER;
SA.LEG_VARIANTS = moduleConfig.LEG_VARIANTS;
SA.MATS = moduleConfig.MATS;
SA.MAT_MAX = SA.MATS.length - 1;
SA.INGOTS = moduleConfig.INGOTS;
// 恢复默认仅供作者明确操作；正常游戏始终读取 MODULES 的当前值。
SA.MODULE_DEFAULTS = moduleConfig.factory.MODULES;
// 描述模板的数字从同一份 K 配置读取，避免调参后文案与规则脱节。
function applyDescTemplates(table) {
  for (const module of Object.values(table)) {
    if (!module.descTemplate || module.desc !== undefined) continue;
    const template = module.descTemplate;
    delete module.descTemplate;
    Object.defineProperty(module, 'desc', { enumerable: true, configurable: true, get() {
      return template.replace(/\{([A-Z][A-Z0-9_.]*)\}/g, (_, path) => {
        const value = path.split('.').reduce((part, key) => part?.[key], SA.K);
        return value === undefined ? '' : String(value);
      });
    } });
  }
}
applyDescTemplates(SA.MODULES);
applyDescTemplates(SA.MODULE_DEFAULTS);

SA.repairRate = (id) => SA.MODULES[id].repairRate || 0.05;


SA.isWeapon = (id) => !!SA.MODULES[id].dmg;
// 占格：w×h 个子格（默认 2×2）
SA.fp = (id) => { const m = SA.MODULES[id]; return { w: m.w || 2, h: m.h || 2 }; };
SA.isCockpit = (id) => !!SA.MODULES[id].cockpit;
SA.driversOf = (id) => SA.MODULES[id].drivers || 0;
// 已取消的模块 → 替代品（旧存档、旧分享码、旧蓝图读进来时换掉）
SA.RETIRED = { copilot: 'cockpit' };
SA.liveId = (id) => SA.RETIRED[id] || id;
SA.minMt = (id) => SA.MODULES[id].minMt || 1;
SA.maxMt = (id) => SA.MODULES[id].maxMt || SA.MAT_MAX;
// 指定材料的旧件、敌车和库存统一到对应喷射武器；无材料的蓝图仍按原 id 创建最低合法档。
SA.materialId = (id, mt) => id === 'flamer' && mt < 4 ? 'steamjet' : id === 'steamjet' && mt > 3 ? 'flamer' : id;
// 模块重量（kg）：基础重量（按面积折算）+ 自身重量 + 改装加重
SA.weightOf = (cell) => { const f = SA.fp(cell.id); return SA.K.WEIGHT_BASE * f.w * f.h / 4 + (SA.MODULES[cell.id].kg || 0) + (cell.lv || 0) * SA.K.UP_KG; };
const fmtT = (kg) => `${(kg / 1000).toFixed(kg < 10000 ? 2 : 1)} t`;
SA.tons = fmtT;
SA.kmh = (pxs) => `${(pxs * SA.K.KMH).toFixed(1)} km/h`;
// 动力与牵引的统一量纲：锅炉标称轴功率 kW，显示为公制马力 PS；1 L 冷却储水约为 1 kg。
SA.Phys = {
  PS_KW: 0.73549875, LATENT_KJ_L: 2257,
  PX_M: 1.5 / 48, GRAVITY: 9.81, ROLL: 0.025, TRANSMISSION: 0.8,
  kwToPs: kw => kw / 0.73549875,
  // 目标速度下预留 0.7 m/s² 起步牵引力；实战每帧再按 P=Fv 限制。
  driveKw: (kg, pxs) => kg * (0.7 + 9.81 * 0.025) * Math.max(0, pxs) * (1.5 / 48) / 0.8 / 1000,
  heatCapacity: kg => 8 * 4.18 + Math.max(0, kg) * 0.02 * 0.5, // 8 L 循环水及参与换热的 2% 金属（0.5 kJ/kg/K）
  heatMax: kg => (120 - 20) * SA.Phys.heatCapacity(kg),
  temp: (heat, cap) => 20 + heat / Math.max(1, cap),
  fmtPower: kw => `${SA.Phys.kwToPs(kw).toFixed(1)} 马力`,
  fmtKw: kw => `${kw.toFixed(1)} kW`,
  fmtWater: l => `${l.toFixed(1)} L`,
  fmtHeat: kj => `${kj.toFixed(0)} kJ`,
  fmtTemp: c => `${c.toFixed(0)} °C`,
  // 储水只参与冷却蒸发；锅炉轴功率及其产热不受储水量限制。
  thermalStep: (heat, water, dt, p) => {
    const shaftKw = p.shaftKw;
    heat = Math.max(0, heat + (p.heatKw * (p.shaftKw ? shaftKw / p.shaftKw : 0) + p.weaponKw + (shaftKw ? SA.K.IDLE_HEAT : 0)) * dt);
    const passive = Math.min(heat, (SA.K.DISSIPATE + p.dryCool) * Math.max(0, (SA.Phys.temp(heat, p.capacity) - 20) / 30) * dt);
    heat -= passive;
    const cooled = Math.min(heat, SA.coolRate(p.cool, heat, p.capacity) * dt, water * 2257 / p.waterSave);
    heat -= cooled; water -= cooled / 2257 * p.waterSave;
    return { heat: Math.max(0, heat), water: Math.max(0, water), shaftKw, cooled, passive };
  },
};
// 撞击伤害倍率：跟车重成正比（6 t 为 ×1），0.5 ~ 3 倍
SA.ramMul = (kg) => Math.max(0.5, Math.min(3, kg / 6000));
// 改装：武器加炮盾，底盘加裙板，撞击件加厚撞面，其余加附加装甲
SA.upName = (id) => (SA.isWeapon(id) ? '炮盾' : SA.MODULES[id].layer === 'chassis' ? '加固裙板' : SA.MODULES[id].layer === 'ram' ? '加厚撞面' : '附加装甲');
SA.upHp = (id) => (SA.isWeapon(id) ? 0.3 : 0.25);   // 每级耐久 +%
SA.upCost = (id, lv) => Math.round(SA.MODULES[id].price * SA.K.UP_COST * lv);
// 水箱这一刻能带走多少热量（kW）：由机组回路相对环境温差决定。
SA.coolRate = (cool, heat, cap = 50) => cool * Math.max(0, Math.min(1, (SA.Phys.temp(heat, cap) - 20) / SA.K.COOL_FULL));
SA.isRam = (id) => SA.MODULES[id].layer === 'ram';

// 唯一腿部外观：材料取造型原档，每种独立缴获一次。半人马同材料的速度、动力、重量均与普通四足一致。
// chapter 为战役数组序号（0=序章）；双足变体从第三章起的场外精英获得，四足从第一章起逐档开放。

// 只有模块自身声明 unique 才封禁整类购买。普通观察镜 / 重装甲的支线奖励仅给那一件实例标身份。
SA.uniqueByKey = (key) => {
  const m = SA.MODULES[key];
  if (m && m.unique) return { id: key, key, mt: 5, once: true, source: 'salvage', ...(m.unique === true ? {} : m.unique) };
  return SA.LEG_VARIANTS.find(x => x.key === key)
    || (SA.SIDE_ENCOUNTERS || []).map(x => x.reward).find(x => x && x.key === key && x.unique) || null;
};
SA.uniqueRule = (x) => {
  if (typeof x === 'string') return SA.MODULES[x]?.unique ? SA.uniqueByKey(x) : null;
  if (!x) return null;
  const rule = typeof x.unique === 'string' ? SA.uniqueByKey(x.unique)
    : x.look ? SA.LEG_VARIANTS.find(v => v.id === x.id && v.look === x.look) : SA.uniqueRule(x.id);
  return rule && rule.id === x.id ? rule : null;
};
SA.isUnique = (x) => !!SA.uniqueRule(x);
// 战利品配置归一：key 是领取账本的身份，id 始终是基础模块种类。
SA.rewardRule = (x) => {
  if (!x) return null;
  const registered = SA.uniqueByKey(x.key || (typeof x.unique === 'string' ? x.unique : x.id));
  return { ...registered, ...x, key: x.key || registered?.key || x.id, mt: x.mt || registered?.mt || 5, once: x.once !== false, source: x.source || 'salvage' };
};
// 校验外观与身份组合；从蓝图读回固定材料，不允许外观字段把普通件伪装成免缴获的唯一件。
SA.fixIdentity = (cell) => {
  const rule = SA.uniqueRule(cell);
  if (rule) { cell.unique = rule.key; if (rule.look) cell.look = rule.look; else delete cell.look; }
  else { delete cell.unique; delete cell.look; }
  return rule;
};

// ---------- 材料：模块品质 = 材料 ----------
// 1~4 用钱在车间升级（随战役解锁）；5 史诗、6 传奇还要消耗特定的锭 / 结晶，只能靠委托、缴获和 Boss 掉落获得
// mul：耐久、伤害、动力、水、冷却、撞击、活塞、承重、护甲一起放大；产热和重量不变，所以好材料更「省」
// cost：从上一级升到这一级的费用 = 模块原价 × cost；tint / a / lite / dark：换色（'color' 混合保留原图明暗，再提亮 / 压暗）
// 持续伤害率和单发伤害同样随材料放大；产热和射速仍沿用模块原值。
const MAT_SCALED = ['hp', 'dmg', 'dmgPerSec', 'supply', 'water', 'cool', 'ram', 'punch', 'load', 'armor'];
const modCache = new Map();
// 某一格模块按材料放大后的定义：SA.mod(cell) 或 SA.mod(id, mt)
SA.mod = (x, mt) => {
  const id = typeof x === 'object' ? x.id : x;
  mt = Math.max(1, Math.min(SA.MAT_MAX, (typeof x === 'object' ? x.mt : mt) || 1));
  const key = `${id}@${mt}`;
  let m = modCache.get(key);
  if (!m) {
    const base = SA.MODULES[id], mul = SA.MATS[mt].mul;
    m = { ...base, mt };
    for (const k of MAT_SCALED) if (base[k]) m[k] = k === 'hp' || k === 'load' ? Math.round(base[k] * mul) : Math.round(base[k] * mul * 10) / 10;
    modCache.set(key, m);
  }
  return m;
};
SA.newCell = (id, mt = SA.minMt(SA.liveId(id))) => {
  id = SA.materialId(SA.liveId(id), mt); mt = Math.max(mt, SA.minMt(id));
  return mt > 1 ? { id, mt, hp: SA.mod(id, mt).hp } : { id, hp: SA.MODULES[id].hp };
};
// 旧数据修正：退役件替代、喷射器按原材料换种类，其余模块补最低材料；保留含改装的耐久比例。
SA.fixCell = (cell) => {
  if (!cell) return cell;
  const unique = SA.fixIdentity(cell);
  const id = SA.materialId(SA.liveId(cell.id), cell.mt || 1), mt = unique ? unique.mt : Math.max(cell.mt || 1, SA.minMt(id));
  if (id === cell.id && mt === (cell.mt || 1)) return cell;
  const before = cell.max || Math.round(SA.mod(cell).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
  const ratio = Math.max(0, Math.min(1, cell.hp / before));
  cell.id = id; if (mt > 1) cell.mt = mt;
  const after = Math.round(SA.mod(cell).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
  cell.hp = Math.round(after * ratio);
  if (cell.max != null) cell.max = after;
  if (cell.aux && !SA.isCockpit(id)) delete cell.aux;
  return cell;
};
// 库存键修正：同上
SA.fixKey = (k) => { const p = SA.parseKey(k), id = SA.materialId(SA.liveId(p.id), p.mt); return SA.invKey(id, Math.max(p.mt, SA.minMt(id))); };
// 买一个新模块：材料至少是它的最低材料，价格按那一级的总价值算
SA.buyMt = (id) => SA.minMt(id);
SA.buyPrice = (id) => SA.cellValue({ id, mt: SA.buyMt(id) });
SA.matOf = (cell) => SA.MATS[(cell && cell.mt) || 1];
SA.matUpCost = (id, toMt) => Math.round(SA.MODULES[id].price * SA.MATS[toMt].cost);
// 模块总价值：原价 + 材料升级 + 改装件（修理、回收、卖出都按它算）
SA.cellValue = (cell) => {
  let v = SA.MODULES[cell.id].price;
  for (let t = 2; t <= (cell.mt || 1); t++) v += SA.matUpCost(cell.id, t);
  for (let k = 1; k <= (cell.lv || 0); k++) v += SA.upCost(cell.id, k);
  return v;
};
// 护甲：每发炮弹先减掉固定伤害（最少保留 25%）
SA.armorCut = (m, dmg) => (m.armor ? Math.max(dmg * 0.25, dmg - m.armor) : dmg);
// 库存键：黄铜直接用 id，其余是 id@材料
SA.invKey = (id, mt = 1) => (mt > 1 ? `${id}@${mt}` : id);
SA.parseKey = (k) => { const [id, t] = String(k).split('@'); return { id, mt: +t || 1 }; };

// ---------- 实体辅助模块效果 ----------
// 观察镜、装弹机、陀螺仪和测距仪都是普通 1×1 模块；只统计仍有耐久的实体。
SA.auxEffect = (cells) => {
  const e = { aimSpeed: 0, aimShrink: 0, reload: 1, sway: 1, spread: 1 };
  for (const cell of cells) {
    if (!(cell.hp > 0)) continue;
    const m = SA.mod(cell);
    if (!m.reloadMul && !m.spreadMul && !m.swayMul) continue;
    e.reload *= m.reloadMul || 1;
    e.sway *= m.swayMul || 1;
    e.spread *= m.spreadMul || 1;
  }
  return e;
};
