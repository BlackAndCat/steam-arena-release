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

// 关卡布局升级时旧编号的去处，按版本逐级换算：
// 1 → 2：序章插入甲片关，旧第二关（铲斗关）顺延到第三关；
// 2 → 3：第三、四、五章在末关前各插入一关，旧末关（工厂缠斗王 / 铁甲圣堂 / 维多利亚女王号）顺延一位；
//        第一、四章另在章末追加的新关不占旧编号。
// 3 → 4：章节改成设计稿的 34 关结构（每章只记计划关数 plannedStages），只留序章三关和第一章前三关，
//        留下的六关编号不变；其余关卡删除，指向它们的旧记录由各读取方按「关卡不存在」丢弃。
const migrateStageIndex = (chapter, stage, layout) => SA.StageCars.migrateStageIndex(chapter, stage, layout);
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
      else if (SA.current === 'garage' && !SA.Camp?.isDesignMode?.() && SA.Editor?.open) SA.Editor.open();
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
  // 旧存档和历史扩建奖励保留，但有效车间始终等于物理底图。
  const grid = () => SA.V.fullGrid();
  // 发行包只开放指定章数；开发目录始终使用完整战役。
  const chapterCount = () => SA.RELEASE ? Math.min(SA.RELEASE_CHAPTERS, SA.CAMPAIGN.length) : SA.CAMPAIGN.length;
  const done = () => !!(c().done || (SA.RELEASE && c().ch >= chapterCount()));
  // 当前章节序号（通关后停在最后一章）
  const chIndex = () => Math.min(c().ch, chapterCount() - 1);
  // 每章计划的关数（content.json 的 plannedStages）；已做出的关比计划少，这一章就还没做完
  const plannedStages = (ch) => Math.max(ch.stages.length, ch.plannedStages || 0);
  const unfinished = (ch) => ch.stages.length < plannedStages(ch) || ch.stages.some(st => st.unfinished);
  // 进度能走到的最远位置：第一个没做完的章节里、已做出的最后一关之后；全部做完时为 null
  function frontier() {
    for (let ci = 0; ci < chapterCount(); ci++) {
      const ch = SA.CAMPAIGN[ci];
      if (unfinished(ch)) return { ch: ci, st: ch.stages.findIndex(st => st.unfinished) < 0 ? ch.stages.length : ch.stages.findIndex(st => st.unfinished) };
    }
    return null;
  }
  // 已做出的关都打完了，正停在没做完的章节里等后续关卡
  function pending() {
    const C = c(), f = frontier();
    return !done() && !!f && C.ch === f.ch && C.st >= f.st;
  }
  // 关卡删减后（关卡布局 4），旧档的进度可能落在还没做出来的关上：夹回最远位置。已有的解锁、库存原样保留。
  function clampProgress() {
    const C = c(), f = frontier();
    if (!f || !(C.done || C.ch > f.ch || (C.ch === f.ch && C.st > f.st))) return false;
    Object.assign(C, { ch: f.ch, st: f.st, done: false, intro: Math.min(C.intro, f.ch) });
    SA.S.save();
    return true;
  }

  // 商店以当前战役坐标重新计算可售模块，避免旧档或开发者解锁写入的 C.mods 提前泄漏未来章节。
  // 已通关关卡、已完成章节与本章作者白名单可售；背包和一般解锁仍照常使用 C.mods。
  function shopMods() {
    const C = c(), available = new Set(SA.CAMP_START.mods);
    for (let ci = 0; ci < chapterCount(); ci++) {
      const chapter = SA.CAMPAIGN[ci];
      if (C.done || ci < C.ch || ci === C.ch) for (let si = 0; si < chapter.stages.length; si++) {
        if (!(C.done || ci < C.ch || si < C.st)) break;
        const unlocked = stage(ci, si)?.unlock || chapter.stages[si].unlock;
        for (const id of unlocked?.mods || []) available.add(id);
      }
      if (C.done || ci < C.ch) for (const id of chapter.unlock?.mods || []) available.add(id);
    }
    for (const id of SA.CAMPAIGN[chIndex()]?.shopExtras || []) available.add(id);
    return available;
  }

  // 玩家的车带上改装台大小，编辑器和出战检查都按它限制可用格子
  function syncLim() {
    if (!d()) return;
    c().grid = grid();
    if (d().vehicle) d().vehicle.lim = grid();
  }

  // 第 ci 章第 si 关的对手
  function stage(ci = c().ch, si = c().st) {
    if (SA.RELEASE && (ci < 0 || ci >= chapterCount())) return null;
    const ch = SA.CAMPAIGN[ci], o = ch && ch.stages[si];
    if (!o || o.unfinished) return null;
    const merged = SA.StageCars ? SA.StageCars.merge(o, ci, si) : { ...o, source: 'original', locked: false, stageCar: null };
    if (!merged.vehicle) merged.vehicle = SA.V.fromAscii(merged.name, merged.rows, merged.sides || [], merged.mt || 1, merged.elite || [], merged.subs || []);
    merged.vehicle.lim = grid();
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
    // 旧扩建奖励不再缩小已开放的车间；奖励原始数据和其他解锁保持不变。
    C.grid = grid();
    if (!noIngots) SA.S.addIngots(u.ingots);
    syncLim();
  }
  // 读档时补发：已经打过的关卡 / 章节，按现在的数据重新发一遍解锁（以后新加的解锁内容老存档也能拿到；锭不重复发）
  function backfill() {
    const C = c();
    clampProgress();
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
    if (C.st >= st.chapter.stages.length || st.chapter.stages[C.st]?.unfinished) {
      // 这一章还没做完：停在已有的关之后，不发通关奖励，等后续关卡做进来
      if (unfinished(st.chapter)) return out;
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
    C.grid = grid();
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
    v.lim = grid();
    SA.S.d.vehicle = v;
    SA.S.d.camp.grid = grid();
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workbenchVersion: 1, target: { kind: 'stage', id: record.id }, record }),
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
      clampProgress();
      SA.S.save(); SA.nav('arena');
    },
    // 关卡删减后章节奖励发不全：全部解锁直接开放全部功能、模块、材料和满格改装台，进度停在最远位置
    unlockAll() {
      dev.goto(SA.CAMPAIGN.length);
      applyUnlock({ feat: Object.keys(SA.FEATURES || {}), mods: Object.keys(M).filter(id => !M[id].retired), mat: Math.max(1, (SA.MATS || []).length - 1), grid: { cols: 8, rows: 6 } }, true);
      SA.S.save(); SA.UI?.topbar?.();
    },
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

  return { migrateStageIndex, migrateEvolutionReport, backfill, owns, salvageOptions, has, hasMod, shopMods, maxMat, grid, chapterCount, done, chIndex, plannedStages, unfinished, frontier, pending, clampProgress, syncLim, stage, current, prepareTrialVehicle, win, applyUnlock, unlockLines, takeIntro, claimSalvage, claimReward, salvageDialog, unlockDialog, introIfNew, matChip, isDesignMode, ...(!SA.RELEASE ? { dev } : {}) };
})();
// 支线：竞技场外的系列遭遇战（content.json 的 SIDE_LINES）。每条线若干关，按主线进度开放：
// open.ambush = 第一次开打这一主线关（「章,关」）时，先在路上被这一关拦住（过场 + 正式战斗）；打完不算过那一关，只开放这条支线；
// open.after = 打完这一主线关以后开放；open.prev = 还要先赢下同一条线的上一关。unfinished = 还没做车，只占位。
// 存档 camp.side = { met: { 关 id: 1 }（拦路已经演过）, won: { 关 id: 1 }（赢过，首胜奖励已发、以后按重打算） }。
SA.Side = (() => {
  const lines = () => SA.SIDE_LINES || [];
  const rec = () => { const C = SA.S.d.camp; C.side ||= {}; C.side.met ||= {}; C.side.won ||= {}; return C.side; };
  const parse = (key) => String(key || '').split(',').map(Number);
  // 主线这一关已经打过
  function beaten(key) {
    const [ci, si] = parse(key), C = SA.S.d.camp;
    if (!Number.isInteger(ci) || !Number.isInteger(si)) return false;
    return SA.Camp.done() || ci < C.ch || (ci === C.ch && si < C.st);
  }
  function find(id) {
    for (const line of lines()) {
      const i = line.episodes.findIndex(ep => ep.id === id);
      if (i >= 0) return { line, ep: line.episodes[i], i };
    }
    return null;
  }
  function isOpen(line, i) {
    const ep = line.episodes[i], o = ep.open || {}, R = rec();
    if (R.won[ep.id] || R.met[ep.id]) return true;
    // 拦路关：拦过才开放；旧档已经越过那一关、没被拦过的，也直接开放
    if (o.ambush && !beaten(o.ambush)) return false;
    if (o.after && !beaten(o.after)) return false;
    if (o.prev && i > 0 && !R.won[line.episodes[i - 1].id]) return false;
    return i === 0 || isOpen(line, 0);
  }
  const playable = (ep) => !ep.unfinished && Array.isArray(ep.cells) && ep.cells.length > 0;
  const lineOpen = (line) => line.episodes.length > 0 && isOpen(line, 0);
  const anyOpen = () => lines().some(lineOpen);
  const won = (id) => !!rec().won[id];
  const met = (id) => !!rec().met[id];
  // 第一次开打主线 stageKey 时要先演的拦路；没有就 null
  function ambushAt(stageKey) {
    for (const line of lines()) for (let i = 0; i < line.episodes.length; i++) {
      const ep = line.episodes[i];
      if (ep.open?.ambush === stageKey && playable(ep) && !met(ep.id) && !won(ep.id) && !beaten(stageKey)) return { line, ep, i };
    }
    return null;
  }
  const storyId = (ep) => `side.${ep.id}.ambush`;
  const title = (line, i) => SA.Config.text('state_side_title', line.name, i + 1, line.episodes[i].name);
  function vehicle(ep) {
    const v = SA.V.fromCells(ep.vehicleName || ep.name, ep.cells);
    v.name = ep.vehicleName || ep.name;
    return v;
  }
  // 开战参数：拦路那一场带 ambush（过场台词的剧情编号）；赢过以后再打按重打（不奖不罚）
  function battleOpts(found, ambush = false) {
    const { line, ep } = found, done = won(ep.id);
    const ch = SA.CAMPAIGN[parse(ep.open?.ambush || ep.open?.after)[0]];
    return { mode: 'side', sideId: ep.id, sideLine: line.id, replay: done && !ambush, ambush: ambush ? { story: storyId(ep) } : null,
      enemyVehicle: vehicle(ep), enemyName: ep.vehicleName || ep.name, aim: ep.aim, style: ep.style, terrain: ep.terrain || 'flat',
      bounds: ep.bounds || ch?.bounds || null, scene: ep.scene || null, boss: !!ep.boss, hpMul: 1,
      prize: done || !ep.rewardMoney ? 0 : (ep.prize || 0), rewardMoney: !!ep.rewardMoney, uniqueLoot: done ? [] : (ep.uniqueLoot || []) };
  }
  function canStart(opts) {
    const f = opts && find(opts.sideId);
    if (!f || !playable(f.ep)) return false;
    return opts.ambush ? !!ambushAt(f.ep.open?.ambush) : isOpen(f.line, f.i);
  }
  function start(id, ambush = false) {
    const f = find(id);
    if (!f) return false;
    return SA.Battle.start(battleOpts(f, ambush));
  }
  // 出战黑板「支线」页签：能打的关（和战役列表同一种条目）
  function entries() {
    const out = [];
    for (const line of lines()) {
      if (!lineOpen(line)) continue;
      line.episodes.forEach((ep, i) => {
        if (!isOpen(line, i) || !playable(ep)) return;
        const v = vehicle(ep), replay = won(ep.id);
        out.push({ key: ep.id, line: line.id, index: i, name: ep.name, pilot: ep.pilot, blurb: ep.blurb, v, raw: v, hpMul: 1, rating: SA.V.stats(v).rating,
          prize: replay || !ep.rewardMoney ? 0 : (ep.prize || 0), boss: !!ep.boss, terrain: ep.terrain || 'flat', replay, next: !replay,
          tag: replay ? ['ok', SA.Config.text('state_f75385ead4d2')] : ['next', SA.Config.text('state_6439bf33ade5')],
          title: title(line, i), lock: null, start: () => start(ep.id) });
      });
    }
    return out;
  }
  // 黑板上每条已开放支线的行：开放的关、还没做好的关、下一关的开放条件（只透露条件，不透露对手）
  function board() {
    return lines().filter(lineOpen).map(line => {
      const rows = [];
      for (let i = 0; i < line.episodes.length; i++) {
        const ep = line.episodes[i];
        if (isOpen(line, i)) { rows.push({ ep, i, state: playable(ep) ? 'open' : 'wip' }); continue; }
        rows.push({ ep, i, state: 'locked', after: ep.open?.after || null });
        break;
      }
      return { line, rows };
    });
  }
  // 结算用：记下拦路已演过 / 首胜
  function markMet(id) { rec().met[id] = 1; }
  function markWon(id) { rec().won[id] = 1; }
  // 主线推进前后对比：新开放、能打的关
  const openIds = () => lines().flatMap(line => line.episodes.filter((ep, i) => playable(ep) && isOpen(line, i)).map(ep => ep.id));
  const newlyOpen = (before) => openIds().filter(id => !before.includes(id)).map(find);
  return { lines, find, isOpen, lineOpen, anyOpen, playable, won, met, ambushAt, storyId, title, vehicle, battleOpts, canStart, start, entries, board, markMet, markWon, openIds, newlyOpen };
})();

if (!SA.RELEASE) SA.dev = SA.Camp.dev;
if (SA.StageCars) {
  supportStageVehicleName();
  if (!SA.RELEASE) stageCarsChannel();
}
