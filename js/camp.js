// 战役规则：进度、逐步解锁（功能 / 模块 / 材料 / 改装台大小）、每一关的对手、战后缴获和章节介绍进度
// 数据在 content.js 的 SA.CAMPAIGN；存档在 SA.S.d.camp
window.SA = window.SA || {};

// 关卡车先保存到浏览器本机存档，再尽力同步到 js/stage-cars.js。
// 这样直接打开 index.html 时也能立即把工作台结果同步到已打开的正式游戏页，
// 不把本地工具服务器当成保存功能的前置条件。
const STAGE_CARS_LOCAL_KEY = 'steam_arena_stage_cars_local_v1';
const STAGE_CARS_CHANNEL_NAME = 'steam-arena-stage-cars';
let stageCarsChannel = null;
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

function readLocalStageCars(text) {
  try {
    const raw = text === undefined
      ? (typeof localStorage === 'undefined' ? '' : localStorage.getItem(STAGE_CARS_LOCAL_KEY))
      : text;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || !parsed.records || typeof parsed.records !== 'object' || Array.isArray(parsed.records)) return null;
    return { version: 1, campaignLayout: parsed.campaignLayout, records: parsed.records, updatedAt: parsed.updatedAt || null };
  } catch (error) {
    return null;
  }
}

function applyLocalStageCars(payload) {
  if (!SA.STAGE_CARS || !SA.StageCars) return { ok: false, count: 0 };
  if (!SA.__STAGE_CARS_FILE_RECORDS) {
    // 老版生成文件会先把旧第二关覆盖到新位置；恢复新关模板后再按新编号应用手工车。
    if ((SA.STAGE_CARS.campaignLayout || 1) < SA.CAMPAIGN_LAYOUT && SA.STAGE_CARS.records?.['0:1'])
      SA.CAMPAIGN[0].stages[1] = { ...SA.PROLOGUE_PLATE_STAGE };
    SA.__STAGE_CARS_FILE_RECORDS = migrateStageRecords(SA.STAGE_CARS.records, SA.STAGE_CARS.campaignLayout);
    SA.STAGE_CARS.campaignLayout = SA.CAMPAIGN_LAYOUT;
    // 手工关卡车的目标随现有战役章节生成，工作台可编辑全部已定义关卡。
    SA.STAGE_CARS.targets = SA.CAMPAIGN.flatMap((ch, ci) => ch.stages.map((_, si) => `${ci}:${si}`));
  }
  // 发行包始终以随包关卡车为准，忽略浏览器旧草稿与工作台广播。
  const local = SA.RELEASE ? null : arguments.length ? payload : readLocalStageCars();
  SA.STAGE_CARS.records = { ...SA.__STAGE_CARS_FILE_RECORDS, ...migrateStageRecords(local?.records, local?.campaignLayout) };
  if (typeof SA.StageCars.applyToCampaign === 'function') SA.StageCars.applyToCampaign();
  return { ok: !!local, count: Object.keys(local?.records || {}).length };
}

function refreshStageCarsScreen() {
  // 正式游戏正在战役列表时立即重画；战斗中不强行切屏，下一次进入战役会读到新车。
  if (SA.current === 'arena' && SA.Arena?.open) SA.Arena.open(undefined, true);
  else if (SA.current === 'garage' && SA.Editor?.open) SA.Editor.open();
  if (SA.UI?.topbar) SA.UI.topbar();
  if (SA.StoryDev?.refreshConsoleLabel) SA.StoryDev.refreshConsoleLabel();
}

function openStageCarsChannel() {
  if (stageCarsChannel || typeof BroadcastChannel !== 'function') return stageCarsChannel;
  try {
    stageCarsChannel = new BroadcastChannel(STAGE_CARS_CHANNEL_NAME);
    stageCarsChannel.onmessage = event => {
      if (event.data?.type !== 'replace') return;
      applyLocalStageCars(event.data.payload || null);
      refreshStageCarsScreen();
    };
  } catch (error) {
    stageCarsChannel = null;
  }
  return stageCarsChannel;
}

function saveLocalStageCars(records) {
  const payload = { version: 1, campaignLayout: SA.CAMPAIGN_LAYOUT, records, updatedAt: new Date().toISOString() };
  let localPersisted = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STAGE_CARS_LOCAL_KEY, JSON.stringify(payload));
      localPersisted = true;
    }
  } catch (error) {
    // 隐私模式或 file:// 策略禁止 localStorage 时，仍尝试用同源频道同步已打开的正式游戏页。
  }
  const channel = openStageCarsChannel();
  let channelSent = false;
  try {
    if (channel) { channel.postMessage({ type: 'replace', payload }); channelSent = true; }
  } catch (error) {
    channelSent = false;
  }
  applyLocalStageCars(payload);
  return { localPersisted, channelSent, payload };
}

function installStageCarsLocalSync() {
  if (typeof window === 'undefined' || window.__SA_STAGE_CARS_LOCAL_SYNC__) return;
  window.__SA_STAGE_CARS_LOCAL_SYNC__ = true;
  openStageCarsChannel();
  window.addEventListener('storage', event => {
    if (event.key !== STAGE_CARS_LOCAL_KEY) return;
    applyLocalStageCars(readLocalStageCars(event.newValue));
    refreshStageCarsScreen();
  });
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
    // 序章第一关是教学战：保留手工关卡车，但驾驶行为不被历史车记录覆盖。
    if (ci === 0 && si === 0) {
      merged.style = 'rookie'; merged.aim = 0.18;
      merged.unlock = { ...merged.unlock, note: '车间开放：首胜领取一只 1×1 小水罐，装上它练习冷却。' }; // 旧手工备注只在运行时更正，不改用户关卡记录。
    }
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
    if (u.grid) out.push(`改装台扩建到 ${u.grid.cols} 列 × ${u.grid.rows} 层`);
    if (u.mat) out.push(`材料「${SA.MATS[u.mat].name}」：属性 ×${SA.MATS[u.mat].mul}，选中车上的模块即可升级`);
    if (u.mods && u.mods.length) out.push(`新模块：${u.mods.map(id => M[id].name).join('、')}`);
    if (u.feat && u.feat.length) out.push(`新功能：${u.feat.map(f => SA.FEATURES[f]).join('、')}`);
    for (const k in u.ingots || {}) out.push(`${SA.INGOTS[k].name} ×${u.ingots[k]}`);
    return out;
  }

  // 赢下当前这一关：推进进度、发放解锁与掉落。返回 { lines, unlocks: [{ title, u }] }
  function win() {
    const C = c(), st = current();
    const out = { lines: [], unlocks: [] };
    if (!st) return out;
    if (st.unlock) { applyUnlock(st.unlock); out.unlocks.push({ title: '新功能开放', u: st.unlock }); }
    // 固定模块奖励只由首次通关发放；读档补解锁和重打均不会经过此处。
    for (const item of st.rewardItems || []) {
      SA.S.addInv(item.id, item.count, item.mt);
      out.lines.push(`获得 ${M[item.id].name} ×${item.count}`);
      if (st.ci === 0 && st.si === 0 && item.id === 'tank_s') (C.rewardClaims ||= {})[FIRST_TANK_REWARD] = true;
    }
    if (st.drop) {
      SA.S.addIngots(st.drop);
      for (const k in st.drop) out.lines.push(`掉落 ${SA.INGOTS[k].name} ×${st.drop[k]}`);
    }
    C.st++;
    if (C.st >= st.chapter.stages.length) {
      applyUnlock(st.chapter.unlock);
      out.unlocks.push({ title: `${st.chapter.name} · 通关`, u: st.chapter.unlock });
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
    const record = SA.StageCars.makeRecord(chapter, stageIndex, st, v, meta);
    const check = checkStageCar(chapter, stageIndex, record, v);
    if (!check.ok) throw new Error(`关卡车不能保存：${check.errors.join('；')}`);
    if (check.warnings.length) console.warn(`关卡车保存警告（允许保存）：${check.warnings.join('；')}`);
    const payload = { version: 1, campaignLayout: SA.CAMPAIGN_LAYOUT, records: { ...(SA.STAGE_CARS.records || {}), [record.id]: record } };
    // 先落浏览器本机存档并广播，正式游戏页无需重启就能看到这辆车。
    const local = saveLocalStageCars(payload.records);
    let response = null;
    let filePersisted = false;
    let serverError = null;
    // file:// 页面没有可写的 HTTP 接口，直接跳过请求，避免保存按钮等待或弹出降级文本。
    const canWriteFile = typeof location === 'undefined' || !['file:', 'about:'].includes(location.protocol);
    if (canWriteFile) try {
      response = await fetch('/__stage-cars/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      filePersisted = true;
    } catch (error) {
      serverError = error;
      console.info('关卡车已保存到浏览器本机；未同步 js/stage-cars.js。', error);
    }
    // 无论文件同步是否成功，都把当前页的战役对象更新到手工车。
    applyLocalStageCars(local.payload);
    return { record, stats: check.stats, warnings: check.warnings, response: response && response.status,
      persisted: local.localPersisted || filePersisted, localPersisted: local.localPersisted,
      channelSent: local.channelSent, filePersisted, serverError };
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
  if (!SA.RELEASE) {
    SA.StageCars.localKey = STAGE_CARS_LOCAL_KEY;
    SA.StageCars.applyLocal = applyLocalStageCars;
    SA.StageCars.saveLocal = saveLocalStageCars;
  }
  applyLocalStageCars();
  if (!SA.RELEASE) installStageCarsLocalSync();
}
