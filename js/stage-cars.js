// 关卡最终记录只来自 config/stage-cars.json；记录缺失时直接报错。
window.SA = window.SA || {};
SA.STAGE_CARS = SA.Config.get('stage-cars');
SA.StageCars = (() => {
  const data = SA.STAGE_CARS;
  // 每关只有一条最终记录；手工作者字段与原始关卡字段已在迁移时合并。
  const keyOf = (chapter, stage) => `${chapter}:${stage}`;
  const targetKeys = () => [...(data.targets || [])];
  const get = (chapter, stage) => data.records && data.records[keyOf(chapter, stage)] || null;
  const isLocked = (chapter, stage) => !!get(chapter, stage)?.locked;
  // 规则指纹只来自后台版本，不把用户的手工数据算进去。
  const ruleFingerprint = () => String(SA.RULES_VERSION || SA.BUILD_SYS || 'rules-unknown');
  function cellsOf(vehicle) {
    const cells = [];
    SA.V.each(vehicle, (cell, row, col, layer) => cells.push([layer === 'side' ? 1 : 0, row, col, cell.id, cell.mt || 1, cell.lv || 0]));
    return cells;
  }
  function vehicle(record, name) {
    if (!record) return null;
    if (Array.isArray(record.cells) && typeof SA.V?.fromCells === 'function') return SA.V.fromCells(name || record.name || '手工关卡车', record.cells);
    if (record.code && typeof SA.V?.decode === 'function') {
      const decoded = SA.V.decode(record.code);
      if (decoded && name) decoded.name = name;
      return decoded;
    }
    return null;
  }
  function merge(base, chapter, stage) {
    const record = get(chapter, stage);
    if (!record) throw new Error('缺少关卡配置：' + keyOf(chapter, stage));
    if (typeof record.rewardMoney !== 'boolean' || typeof record.victoryRepairFree !== 'boolean')
      throw new Error('关卡结算配置不完整：' + keyOf(chapter, stage));
    // 最终关卡字段全部来自本条配置，避免已加载旧值回填缺失字段。
    const out = { ...record, stageRef: keyOf(chapter, stage) };
    if (record.cells || record.code) for (const field of ['rows', 'sides', 'elite', 'subs']) delete out[field];
    if (record.cells || record.code) out.vehicle = vehicle(record, record.vehicleName || record.name);
    out.source = record.source || (record.cells || record.code ? 'manual' : 'original');
    out.locked = record.locked !== false;
    out.stageCar = out.source === 'manual' ? record : null;
    return out;
  }
  function applyToCampaign() {
    if (!Array.isArray(SA.CAMPAIGN)) return;
    for (const key of targetKeys()) {
      const [chapter, stage] = key.split(':').map(Number);
      const ref = SA.CAMPAIGN[chapter]?.stages?.[stage];
      if (!ref || ref.stageRef !== key) throw new Error('关卡引用与配置不匹配：' + key);
      SA.CAMPAIGN[chapter].stages[stage] = merge(ref, chapter, stage);
    }
    SA.PROLOGUE_PLATE_STAGE = { ...SA.CAMPAIGN[0].stages[1] };
  }
  function makeRecord(chapter, stage, base, vehicleValue, meta = {}) {
    const stats = SA.V.stats(vehicleValue);
    // 保存改车时沿用该关未编辑的规则和规格，同时移除旧 ASCII 车体。
    const { rows, sides, elite, subs, vehicle: oldVehicle, stageCar, ...preserved } = get(chapter, stage) || {};
    return {
      ...preserved,
      version: 1, id: keyOf(chapter, stage), cells: cellsOf(vehicleValue), code: SA.V.encode(vehicleValue),
      style: meta.style ?? base.style ?? 'wander', aim: Number.isFinite(+meta.aim) ? +meta.aim : (base.aim ?? 0.8), terrain: meta.terrain || base.terrain || 'flat', boss: meta.boss === undefined ? !!base.boss : !!meta.boss,
      prize: Number.isFinite(+meta.prize) ? +meta.prize : (base.prize || 0), unlock: meta.unlock === undefined ? (base.unlock || null) : meta.unlock, uniqueLoot: meta.uniqueLoot === undefined ? (base.uniqueLoot || []) : meta.uniqueLoot,
      rewardItems: meta.rewardItems === undefined ? (base.rewardItems || []) : meta.rewardItems,
      rewardMoney: meta.rewardMoney === undefined ? base.rewardMoney : !!meta.rewardMoney,
      victoryRepairFree: meta.victoryRepairFree === undefined ? base.victoryRepairFree : !!meta.victoryRepairFree,
      repairFree: meta.repairFree === undefined ? base.repairFree === true : !!meta.repairFree,
      name: meta.name || base.name || vehicleValue.name, pilot: meta.pilot || base.pilot || '', blurb: meta.blurb ?? base.blurb ?? '', weakness: meta.weakness ?? base.weakness ?? '',
      source: 'manual', locked: meta.locked !== false, updatedAt: new Date().toISOString(), rules: ruleFingerprint(),
      analysis: { rating: stats.rating, value: stats.value, weight: stats.weight, drive: stats.drive, water: stats.water, overheat: stats.overheat, dps: stats.dps, hp: stats.hp },
    };
  }
  function validate(record, chapter, stage, vehicleValue) {
    const out = { ok: false, warnings: [], errors: [], stats: null };
    if (!vehicleValue) { out.errors.push('没有可分析的载具'); return out; }
    const stats = SA.V.stats(vehicleValue); out.stats = stats;
    if (!stats.canDeploy) out.errors.push(...(stats.problems || ['载具不能出战']));
    if (!record || !Array.isArray(record.cells) || !record.cells.length) out.errors.push('没有模块清单');
    const allowed = new Set(SA.CAMP_START?.mods || []), base = SA.CAMPAIGN?.[chapter]?.stages?.[stage];
    if (SA.STARTER && SA.V?.fromAscii) {
      const starter = SA.V.fromAscii('开局车', SA.STARTER.rows, SA.STARTER.sides || [], 1, [], SA.STARTER.subs || []);
      SA.V.each(starter, cell => allowed.add(cell.id));
    }
    // 开局车的 ASCII 车体用 K 表示驾驶舱，正式模块清单使用 cockpit；两者都属于开局可用部件。
    allowed.add('cockpit');
    for (let ci = 0; ci <= chapter; ci++) {
      const ch = SA.CAMPAIGN[ci], stop = ci === chapter ? stage : ch.stages.length;
      for (let si = 0; si < stop; si++) for (const id of ch.stages[si].unlock?.mods || []) allowed.add(id);
      if (ci < chapter) for (const id of ch.unlock?.mods || []) allowed.add(id);
    }
    for (const id of record?.unlock?.mods || []) allowed.add(id);
    for (const loot of record?.uniqueLoot || []) if (loot?.id) allowed.add(loot.id);
    if (base?.spec?.reward) allowed.add(base.spec.reward);
    for (const row of base?.subs || []) if (row?.[2]) allowed.add(row[2]);
    for (const cell of record?.cells || []) if (cell && SA.MODULES[cell[3]] && !allowed.has(cell[3]) && !record.boss) out.warnings.push(`使用了该关尚未解锁的模块：${cell[3]}`);
    out.ok = out.errors.length === 0;
    return out;
  }
  applyToCampaign();
  return { data, keyOf, targetKeys, get, isLocked, merge, applyToCampaign, vehicle, cellsOf, makeRecord, validate, ruleFingerprint };
})();
