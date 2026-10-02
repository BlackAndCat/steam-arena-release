// 战役规则：进度、逐步解锁（功能 / 模块 / 材料 / 改装台大小）、每一关的对手、战后缴获和章节介绍进度
// 数据在 content.js 的 SA.CAMPAIGN；存档在 SA.S.d.camp
window.SA = window.SA || {};

// 作者关卡保存后通知其他已打开的本机游戏页重新读取正式配置。
const STAGE_CARS_CHANNEL_NAME = 'steam-arena-stage-cars';
let stageCarsBus = null;
const FIRST_TANK_REWARD = '0:0:tank_s'; // 修正首关固定奖励的持久化领取记号。

// 关卡标题和车辆铭牌分别保存；旧手工记录没有 vehicleName 时仍沿用原来的关卡名。
// 原始关卡车文件由用户工作台生成，这里只扩展公开接口，不手工改写其内容。
function supportStageVehicleName() {
  if (!SA.StageCars) return;
  const cars = SA.StageCars;
  const makeRecord = cars.makeRecord, merge = cars.merge, applyToCampaign = cars.applyToCampaign;
  cars.makeRecord = (chapter, stage, base, vehicle, meta = {}) => {
    const record = makeRecord(chapter, stage, base, vehicle, meta);
    record.vehicleName = String(meta.vehicleName || vehicle.name || record.name).trim();
    return record;
  };
  cars.merge = (base, chapter, stage) => {
    const merged = merge(base, chapter, stage);
    const name = cars.get(chapter, stage)?.vehicleName;
    if (name && merged.vehicle) merged.vehicle.name = name;
    return merged;
  };
  cars.applyToCampaign = () => {
    const result = applyToCampaign();
    // 原函数内部直接调用自己的 merge，随后修正已放进战役的车辆铭牌。
    for (const key of cars.targetKeys()) {
      const [chapter, stage] = key.split(':').map(Number);
      const name = cars.get(chapter, stage)?.vehicleName;
      const vehicle = SA.CAMPAIGN[chapter]?.stages?.[stage]?.vehicle;
      if (name && vehicle) vehicle.name = name;
    }
    return result;
  };
}

// 插入甲片关后，旧序章第二关仍是铲斗关，统一顺延到第三关；其他章不变。
function migrateStageIndex(chapter, stage, layout) {
  return (layout || 1) < SA.CAMPAIGN_LAYOUT && chapter === 0 && stage === 1 ? 2 : stage;
}
function migrateStageRecords(records, layout) {
  const result = {};
  for (const [key, record] of Object.entries(records || {})) {
    const [ci, si] = key.split(':').map(Number), target = `${ci}:${migrateStageIndex(ci, si, layout)}`;
    result[target] = record ? { ...record, id: target } : record;
  }
  return result;
}
// 报告按其布局版本迁移副本；包括候选、选关证据和失败行，不改历史文件或车辆构筑。
function migrateEvolutionReport(report) {
  if (!report || report.campaignLayout >= SA.CAMPAIGN_LAYOUT) return report;
  const result = JSON.parse(JSON.stringify(report)), layout = report.campaignLayout;
  const spec = value => { if (value && Number.isInteger(value.stage)) value.stage = migrateStageIndex(value.chapter, value.stage, layout); };
  const record = value => { if (value) spec(value.spec); };
  for (const ch of result.chapters || []) for (const stage of ch.stages || []) {
    spec(stage.spec); record(stage.selected); (stage.top || []).forEach(record);
  }
  (result.candidates || []).forEach(record);
  (result.selectionFailures || []).forEach(spec);
  if (result.scope?.stage != null) spec(result.scope);
  result.campaignLayout = SA.CAMPAIGN_LAYOUT;
  return result;
}

function stageCarsChannel() {
  if (stageCarsBus || typeof BroadcastChannel !== 'function') return stageCarsBus;
  stageCarsBus = new BroadcastChannel(STAGE_CARS_CHANNEL_NAME);
  stageCarsBus.onmessage = event => {
    if (event.data?.type !== 'saved') return;
    try {
      SA.Config.clear('stage-cars');
      const fresh = SA.Config.get('stage-cars');
      Object.assign(SA.STAGE_CARS, fresh);
      SA.StageCars.applyToCampaign();
      if (SA.current === 'arena' && SA.Arena?.open) SA.Arena.open(undefined, true);
      else if (SA.current === 'garage' && SA.Editor?.open) SA.Editor.open();
      SA.UI?.topbar?.();
    } catch (error) { console.error('关卡配置刷新失败', error); }
  };
  return stageCarsBus;
}

SA.Camp = (() => {
  const M = SA.MODULES;
  const d = () => SA.S.d;
  const c = () => d().camp;

  const has = (f) => c().feat.includes(f);
  const hasMod = (id) => c().mods.includes(id);
  const maxMat = () => c().mat;
  const grid = () => c().grid;
  // 发行包只开放指定章数；开发目录始终使用完整战役。
  const chapterCount = () => SA.RELEASE ? Math.min(SA.RELEASE_CHAPTERS, SA.CAMPAIGN.length) : SA.CAMPAIGN.length;
  const done = () => !!(c().done || (SA.RELEASE && c().ch >= chapterCount()));
  // 当前章节序号（通关后停在最后一章）
  const chIndex = () => Math.min(c().ch, chapterCount() - 1);

  // 玩家的车带上改装台大小，编辑器和出战检查都按它限制可用格子
  function syncLim() { if (d() && d().vehicle) d().vehicle.lim = { ...grid() }; }

  // 第 ci 章第 si 关的对手
  function stage(ci = c().ch, si = c().st) {
    if (SA.RELEASE && (ci < 0 || ci >= chapterCount())) return null;
    const ch = SA.CAMPAIGN[ci], o = ch && ch.stages[si];
    if (!o) return null;
    const merged = SA.StageCars ? SA.StageCars.merge(o, ci, si) : { ...o, source: 'original', locked: false, stageCar: null };
    if (!merged.vehicle) merged.vehicle = SA.V.fromAscii(merged.name, merged.rows, merged.sides || [], merged.mt || 1, merged.elite || [], merged.subs || []);
    return { ...merged, ci, si, chapter: ch };
  }
  const current = () => (done() ? null : stage());

  // 试驾场临时换材料仍由规则层重算耐久；界面只传入材料等级，不直接改车格。
  function prepareTrialVehicle(v, mt) {
    if (!v || !mt) return v;
    SA.V.each(v, (cell) => { cell.mt = mt; cell.hp = SA.mod(cell).hp; SA.fixCell(cell); cell.hp = SA.V.maxHp(cell); });
    return v;
  }

  // ---------- 解锁 ----------
  function applyUnlock(u, noIngots) {
    if (!u) return;
    const C = c();
    for (const f of u.feat || []) if (!C.feat.includes(f)) C.feat.push(f);
    for (const id of u.mods || []) if (!C.mods.includes(id)) C.mods.push(id);
    if (u.mat) C.mat = Math.max(C.mat, u.mat);
    if (u.grid) C.grid = { ...u.grid };
    if (!noIngots) SA.S.addIngots(u.ingots);
    syncLim();
  }
  // 读档时补发：已经打过的关卡 / 章节，按现在的数据重新发一遍解锁（以后新加的解锁内容老存档也能拿到；锭不重复发）
  function backfill() {
    const C = c();
    SA.CAMPAIGN.slice(0, chapterCount()).forEach((ch, ci) => {
      ch.stages.forEach((raw, si) => { const s = stage(ci, si) || raw; if (C.done || ci < C.ch || (ci === C.ch && si < C.st)) applyUnlock(s.unlock, true); });
      if (C.done || ci < C.ch) applyUnlock(ch.unlock, true);
    });
    // 旧档已过首关但当时只有文字承诺：补发一次；旧库存与玩家构筑原样保留。
    if ((C.done || C.ch > 0 || C.st > 0) && !C.rewardClaims?.[FIRST_TANK_REWARD]) {
      SA.S.addInv('tank_s', 1, 1);
      (C.rewardClaims ||= {})[FIRST_TANK_REWARD] = true;
      SA.S.save();
    }
  }
  function unlockLines(u) {
    const out = [];
    if (u.grid) out.push(SA.Config.text('camp_unlock_grid', u.grid.cols, u.grid.rows));
    if (u.mat) out.push(SA.Config.text('camp_unlock_material', SA.MATS[u.mat].name, SA.MATS[u.mat].mul));
    if (u.mods && u.mods.length) out.push(SA.Config.text('camp_unlock_modules', u.mods.map(id => M[id].name).join('、')));
    if (u.feat && u.feat.length) out.push(SA.Config.text('camp_unlock_features', u.feat.map(f => SA.FEATURES[f]).join('、')));
    for (const k in u.ingots || {}) out.push(SA.Config.text('camp_unlock_ingots', SA.INGOTS[k].name, u.ingots[k]));
    return out;
  }

  // 赢下当前这一关：推进进度、发放解锁与掉落。返回 { lines, unlocks: [{ title, u }] }
  function win() {
    const C = c(), st = current();
    const out = { lines: [], unlocks: [] };
    if (!st) return out;
    if (st.unlock) { applyUnlock(st.unlock); out.unlocks.push({ title: SA.Config.text('camp_new_feature'), u: st.unlock }); }
    // 固定模块奖励只由首次通关发放；读档补解锁和重打均不会经过此处。
    for (const item of st.rewardItems || []) {
      SA.S.addInv(item.id, item.count, item.mt);
      out.lines.push(SA.Config.text('camp_reward_item', M[item.id].name, item.count));
      if (st.ci === 0 && st.si === 0 && item.id === 'tank_s') (C.rewardClaims ||= {})[FIRST_TANK_REWARD] = true;
    }
    if (st.drop) {
      SA.S.addIngots(st.drop);
      for (const k in st.drop) out.lines.push(SA.Config.text('camp_drop_ingot', SA.INGOTS[k].name, st.drop[k]));
    }
    C.st++;
    if (C.st >= st.chapter.stages.length) {
      applyUnlock(st.chapter.unlock);
      out.unlocks.push({ title: SA.Config.text('camp_chapter_clear', st.chapter.name), u: st.chapter.unlock });
      if (C.ch + 1 >= SA.CAMPAIGN.length) { C.done = true; C.st = st.chapter.stages.length; }
      else { C.ch++; C.st = 0; }
    }
    return out;
  }

  // ---------- 缴获：只在战役 / 终局锦标赛赢了之后，从对手还完好的模块里挑一件 ----------
  // 候选只有两种：你还没有的（车上和库存里都没有这种模块，或者只有更差的材料），以及史诗 / 传奇的特殊件
  // 史诗 / 传奇件排在前面，其余随机，最多 3 件，同款同材料不重复
  function owns(id, mt) {
    let yes = false;
    SA.V.each(d().vehicle, (cell) => { if (cell.id === id && (cell.mt || 1) >= mt) yes = true; });
    for (const k in d().inv) { const p = SA.parseKey(k); if (p.id === id && p.mt >= mt && d().inv[k] > 0) yes = true; }
    return yes;
  }
  function salvageOptions(survivors) {
    const seen = new Set(), pool = [];
    for (const x of survivors) {
      const unique = x.unique && typeof x.unique === 'object' ? SA.rewardRule({ ...x.unique, id: x.id }) : SA.uniqueRule(x);
      if (unique && unique.once !== false) {
        if (SA.S.hasUnique(unique.key)) continue;
        const key = `unique:${unique.key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pool.push({ ...x, id: unique.id, mt: unique.mt || x.mt || 5, look: unique.look, unique });
        continue;
      }
      const k = SA.invKey(x.id, x.mt);
      if (seen.has(k) || (x.mt < 5 && owns(x.id, x.mt))) continue;
      seen.add(k); pool.push(x);
    }
    pool.sort(() => Math.random() - 0.5);
    pool.sort((a, b) => (b.mt >= 5) - (a.mt >= 5));
    return pool.slice(0, 3);
  }
  // 章节介绍的进度只由规则层写入；界面取得待展示章节后原样绘制。
  function takeIntro() {
    const C = c();
    if (done() || C.intro >= C.ch) return null;
    C.intro = C.ch;
    SA.S.save();
    return SA.CAMPAIGN[C.ch];
  }

  // 缴获选择的唯一件检查与入库集中在规则层，失败时不重复发放。
  function claimSalvage(x) {
    const unique = x.unique && typeof x.unique === 'object' ? SA.rewardRule(x.unique) : SA.uniqueRule(x);
    if (unique && !SA.S.claimUnique(unique.key, unique.mt, unique.source || 'salvage')) return false;
    const cell = SA.newCell(x.id, unique ? unique.mt : x.mt);
    if (unique) { cell.unique = unique.key; if (unique.look) cell.look = unique.look; }
    SA.S.addInv(cell.id, 1, cell.mt || 1, unique ? cell : null);
    return true;
  }
  // 固定缴获与手选缴获共用同一领取账本，不依赖敌件存活，也不会因已有普通同类件而被过滤。
  function claimReward(reward) {
    const rule = SA.rewardRule(reward);
    return claimSalvage({ id: rule.id, mt: rule.mt, look: rule.look, unique: rule });
  }

  // 保留旧公共入口；界面模块在 camp.js 之后加载，调用时再转交。
  const salvageDialog = (...args) => SA.CampUI.salvageDialog(...args);
  const unlockDialog = (...args) => SA.CampUI.unlockDialog(...args);
  const introIfNew = (...args) => SA.CampUI.introIfNew(...args);
  const matChip = (...args) => SA.CampUI.matChip(...args);

  // 设计存档只存在当前页面内：不写正式存档，退出时恢复快照。
  let designSnapshot = null;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function restoreObject(target, snapshot) {
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, clone(snapshot));
  }
  function designMode() {
    if (designSnapshot) return { active: true, save: false };
    designSnapshot = clone(SA.S.d);
    try { localStorage.removeItem('steam_arena_design_v1'); } catch (error) { /* 隐私模式 */ }
    const D = SA.S.d, C = D.camp;
    C.feat = Object.keys(SA.FEATURES || {});
    C.mods = Object.keys(M).filter(id => !M[id].retired);
    C.mat = Math.max(1, (SA.MATS || []).length - 1);
    C.grid = { cols: 8, rows: 6 };
    C.ch = 0; C.st = 0; C.done = false; C.intro = -1;
    D.money = 999999999;
    D.debt = 0;
    // 设计存档把每种非退役模块的各级材料都放进库存，避免工作台还要经过
    // 商店购买或材料升级流程；唯一件也只在这个隔离存档里提供，不会写进正式库存。
    D.inv = {};
    for (const id of Object.keys(M)) {
      if (M[id].retired) continue;
      for (let mt = SA.minMt(id); mt <= SA.maxMt(id); mt++) D.inv[SA.invKey(id, mt)] = 99;
    }
    D.ingots = { wootz: 999999, aether: 999999 };
    if (D.vehicle) D.vehicle.lim = { ...C.grid };
    return { active: true, save: false, money: D.money, grid: C.grid, modules: C.mods.length };
  }
  function exitDesign() {
    if (!designSnapshot) return { active: false, restored: false };
    restoreObject(SA.S.d, designSnapshot);
    designSnapshot = null;
    SA.S.save();
    try { localStorage.removeItem('steam_arena_design_v1'); } catch (error) { /* 隐私模式 */ }
    if (SA.UI && SA.UI.topbar) SA.UI.topbar();
    return { active: false, restored: true };
  }
  const isDesignMode = () => !!designSnapshot;
  function loadStageCar(chapter, stageIndex) {
    if (!designSnapshot) designMode();
    const st = stage(chapter, stageIndex);
    if (!st) throw new Error(`找不到第 ${chapter + 1} 章第 ${stageIndex + 1} 关`);
    const v = SA.V.clone(st.vehicle);
    v.name = st.stageCar?.vehicleName || st.vehicle.name || st.name;
    v.lim = { cols: 8, rows: 6 };
    SA.S.d.vehicle = v;
    SA.S.d.camp.grid = { cols: 8, rows: 6 };
    syncLim();
    // 控制台调用时直接切进现有车间；工具页没有 SA.nav 时只更新设计存档。
    if (typeof SA.nav === 'function' && SA.Editor) SA.nav('garage');
    return { ...st, vehicle: v, design: true };
  }
  function checkStageCar(chapter, stageIndex, record, vehicle) {
    const check = SA.StageCars.validate(record, chapter, stageIndex, vehicle);
    if (check.ok) return check;
    const current = stage(chapter, stageIndex);
    if (!current?.vehicle) return check;
    const baseline = SA.StageCars.makeRecord(chapter, stageIndex, current, current.vehicle, record);
    const original = SA.StageCars.validate(baseline, chapter, stageIndex, current.vehicle);
    // 原关卡车自身不合规时，仅允许模块清单完全不变、错误也完全相同的资料修改。
    if (!original.ok && JSON.stringify(record.cells) === JSON.stringify(baseline.cells)
        && JSON.stringify(check.errors) === JSON.stringify(original.errors)) {
      return { ...check, ok: true, warnings: [...check.warnings, `沿用原关卡车已有问题：${check.errors.join('；')}`] };
    }
    return check;
  }
  async function saveStageCar(chapter, stageIndex, meta = {}) {
    if (!designSnapshot) throw new Error('请先调用 SA.dev.designMode()');
    const st = stage(chapter, stageIndex);
    if (!st) throw new Error(`找不到第 ${chapter + 1} 章第 ${stageIndex + 1} 关`);
    const v = SA.V.clone(SA.S.d.vehicle);
    // 重新保存当前车时保留既有记录的附加字段，当前拼装和表单字段仍由新记录覆盖。
    const previous = SA.STAGE_CARS.records?.[`${chapter}:${stageIndex}`];
    const record = { ...(previous || {}), ...SA.StageCars.makeRecord(chapter, stageIndex, st, v, meta) };
    const check = checkStageCar(chapter, stageIndex, record, v);
    if (!check.ok) throw new Error(`关卡车不能保存：${check.errors.join('；')}`);
    if (check.warnings.length) console.warn(`关卡车保存警告（允许保存）：${check.warnings.join('；')}`);
    // 磁盘写入成功才替换当前页关卡；失败时编辑车辆留在设计模式中供重试。
    const response = await fetch('/__stage-cars/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record }),
    });
    const saved = await response.json();
    if (!response.ok || !saved.ok) throw new Error(saved.error || `关卡配置保存失败（HTTP ${response.status}）`);
    SA.STAGE_CARS.records[record.id] = record;
    SA.StageCars.applyToCampaign();
    stageCarsChannel()?.postMessage({ type: 'saved', id: record.id });
    return { record, stats: check.stats, warnings: check.warnings, response: response.status, filePersisted: true };
  }

  const dev = {
    goto(ci) {
      const C = c();
      for (let i = 0; i < ci && i < SA.CAMPAIGN.length; i++) {
        for (let si = 0; si < SA.CAMPAIGN[i].stages.length; si++) applyUnlock(stage(i, si)?.unlock || SA.CAMPAIGN[i].stages[si].unlock);
        applyUnlock(SA.CAMPAIGN[i].unlock);
      }
      Object.assign(C, { ch: Math.min(ci, SA.CAMPAIGN.length - 1), st: 0, intro: -1, done: ci >= SA.CAMPAIGN.length });
      SA.S.save(); SA.nav('arena');
    },
    unlockAll() { dev.goto(SA.CAMPAIGN.length); },
    money(n = 1000) { d().money += n; SA.S.save(); SA.UI.topbar(); },
    ingots(n = 3) { SA.S.addIngots({ wootz: n, aether: n }); SA.S.save(); SA.UI.topbar(); },
    sandbox: (...args) => SA.CampUI.sandbox(...args),
    drive: (...args) => SA.CampUI.drive(...args),
    panel: (...args) => SA.CampUI.devPanel(...args),
    designMode,
    exitDesign,
    loadStageCar,
    checkStageCar,
    saveStageCar,
    resetVehicle: () => SA.S.replaceWithStarter(),
  };

  return { migrateStageIndex, migrateEvolutionReport, backfill, owns, salvageOptions, has, hasMod, maxMat, grid, chapterCount, done, chIndex, syncLim, stage, current, prepareTrialVehicle, win, applyUnlock, unlockLines, takeIntro, claimSalvage, claimReward, salvageDialog, unlockDialog, introIfNew, matChip, isDesignMode, ...(!SA.RELEASE ? { dev } : {}) };
})();
if (!SA.RELEASE) SA.dev = SA.Camp.dev;
if (SA.StageCars) {
  supportStageVehicleName();
  if (!SA.RELEASE) stageCarsChannel();
}
