// 通用界面：弹窗 / 确认框 / 付款（含贷款询问）、顶栏导航、属性条、载具预览、银行、战后结算
window.SA = window.SA || {};

SA.h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

SA.UI = (() => {
  const h = SA.h, M = SA.MODULES, P = SA.PAL;
  const $ = (s) => document.querySelector(s);
  const S = () => SA.S.d;
  const money = (n) => `£${Math.round(n).toLocaleString()}`;

  // 捕获阶段记录指针，保证编辑器拦截冒泡、拖入安装和弹窗确认都能把扣款提示放在鼠标旁。
  const payPointer = { x: innerWidth / 2, y: innerHeight / 2 };
  const rememberPayPointer = e => { payPointer.x = e.clientX; payPointer.y = e.clientY; };
  document.addEventListener('pointermove', rememberPayPointer, { capture: true, passive: true });
  document.addEventListener('pointerdown', rememberPayPointer, { capture: true, passive: true });

  // 每笔实际支出各自上浮淡出；显示付款金额，避免借贷补款或回收收入影响本次花费的提示。
  function spendFloat(amount) {
    if (amount <= 0) return;
    const el = h('div', { class: 'money-spend', 'aria-hidden': 'true' }, `−${money(amount)}`);
    document.body.append(el);
    // 给上浮留出 32px，靠近窗口边缘时也让金额完整留在画面内。
    el.style.left = `${Math.max(8, Math.min(payPointer.x + 16, innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(40, Math.min(payPointer.y - 18, innerHeight - el.offsetHeight - 8))}px`;
    setTimeout(() => el.remove(), 1200);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 弹窗 ----------
  let modalOnClose = null;
  function openModal(title, body, onClose) {
    const m = $('#modal');
    m.innerHTML = '';
    const close = h('button', { class: 'btn small', onclick: closeModal }, '关闭');
    m.append(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, title), close),
      h('div', { class: 'panel-body' }, body)));
    m.hidden = false;
    modalOnClose = onClose || null;
  }
  function closeModal() {
    $('#modal').hidden = true;
    const f = modalOnClose; modalOnClose = null;
    if (f) f();
    refresh();
  }

  // 小确认框：actions = [{ label, primary, onClick }]，自动附带「取消」（cancelLabel = false 不带）
  // onDismiss：没点任何按钮就关掉（取消 / 点背景 / Esc）时调用，用来把一串战后弹窗接下去
  function dialog(title, body, actions = [], cancelLabel = '取消', onDismiss = null) {
    const m = $('#modal');
    m.innerHTML = '';
    const btns = actions.map(a => h('button', { class: `btn ${a.primary ? 'primary' : ''}`, onclick: () => { modalOnClose = null; closeModal(); a.onClick(); } }, a.label));
    if (cancelLabel !== false || !btns.length) btns.push(h('button', { class: 'btn', onclick: closeModal }, actions.length ? cancelLabel : '知道了'));
    m.append(h('div', { class: 'panel dialog' },
      h('div', { class: 'panel-head' }, h('h2', {}, title)),
      h('div', { class: 'panel-body' }, body),
      h('div', { class: 'dialog-actions' }, btns)));
    m.hidden = false;
    modalOnClose = onDismiss;
    setTimeout(() => btns[0].focus(), 0);
  }

  // 付钱：钱够就（按需确认后）直接扣款；不够就问要不要向银行贷款补齐差额
  function pay({ title, amount, lines = [], okLabel = '确认', confirm = true, onPaid }) {
    const d = S();
    const done = () => { SA.S.payAmount(amount); spendFloat(amount); topbar(); onPaid(); };
    if (d.money >= amount) {
      if (!confirm) { done(); return; }
      dialog(title, [lines, h('p', {}, `花费 `, h('b', { class: 'gold' }, money(amount)), `，剩余 ${money(d.money - amount)}`)],
        [{ label: `${okLabel} ${money(amount)}`, primary: true, onClick: done }]);
      return;
    }
    const short = amount - d.money;
    const loan = Math.ceil(short / 100) * 100;
    const room = SA.S.loanRoom();
    if (!SA.Camp.has('bank')) {
      dialog('资金不足', [lines, h('p', {}, `还差 ${money(short)}。`), h('p', { class: 'muted' }, '打一场比赛赚点钱再来，或者把用不上的库存卖掉（选中模块 → 卖）。')]);
      return;
    }
    if (loan > room) {
      dialog('资金不足', [lines, h('p', {}, `还差 ${money(short)}，银行也不肯再借了（额度剩 ${money(room)}，上限 ${money(SA.S.LOAN_CAP)}）。`),
        h('p', { class: 'muted' }, '先在车间把用不上的库存卖掉（选中模块 → 卖），或者打一场比赛再来。')]);
      return;
    }
    dialog('资金不足', [lines,
      h('p', {}, `现有 ${money(d.money)}，还差 `, h('b', { class: 'gold' }, money(short)), '。要向伦敦蒸汽银行贷款吗？'),
      h('p', { class: 'muted' }, `借 ${money(loan)}：债务 ${money(d.debt)} → ${money(d.debt + loan)}，每打一场锦标赛加收 10% 利息。`)],
    [{ label: `贷款 ${money(loan)} 并${okLabel}`, primary: true, onClick: () => { SA.S.borrow(loan); done(); } }]);
  }


  // ---------- 顶栏（界面重建 v3）：像素铁条，左边回院子 + 车间 / 出战，右边钱计数器 + 设置齿轮 ----------
  // 函数名沿用 topbar()：各处改完数据都调用它刷新。车间、院子、银行都要战役解锁后才出现；院子和战斗里不显示（院子有自己的）
  function topbar() {
    const d = S(), UI = SA.PX.ui;
    SA.PX.init();
    const bar = $('#side');
    bar.innerHTML = '';
    const cur = SA.current, has = SA.Camp.has;
    const fix = SA.V.stats(d.vehicle).problems.length;
    const st = SA.Camp.current(), ch = SA.CAMPAIGN[SA.Camp.chIndex()];
    const where = st ? ch.name : `锦标赛第 ${d.round + 1} 轮`;
    const nav = (key, label, extra) => UI.btn(label, { kind: cur === key ? 'pri' : 'sec', gear: cur === key, onclick: () => SA.nav(key), title: extra || null });
    const ingots = Object.entries(d.ingots || {}).filter(([, n]) => n > 0).map(([k, n]) => [k === 'aether' ? 'aether' : 'wootz', n]);
    const counter = UI.counter({ money: d.money, rep: d.rep, ingotList: ingots, onclick: has('bank') });
    if (has('bank')) { counter.title = '银行：借款 / 还款'; counter.addEventListener('click', openBank); }
    const gear = UI.btn(null, { title: '设置', icon: UI.img(SA.PX.gear(6, 8, SA.PX.RAMP.brass, 0.1)), onclick: settings }); gear.style.padding = '0 2px';
    // 导航（2026-09-30）：院子是中枢，出战也在院子里（拉下黑板）；顶栏只剩「在哪一章」、钱和设置，
    // 车间里离开的路是改装台右下角的「← 回院子 / 出战 →」
    bar.append(...[
      has('garage') ? UI.plate('车间', 'font-size:16px') : UI.plate('蒸汽竞技场', 'font-size:18px'),
      h('span', { class: 'top-where' }, where),
      h('span', { class: 'top-gap' }),
      counter,
      d.debt ? UI.tag([h('span', {}, '欠银行'), UI.num(money(d.debt), SA.PX.RED)]) : null,
      gear,
    ].filter(Boolean));
  }
  // 设置：发行包只显示玩家可用的场景特效选项。
  function settings() {
    const editing = SA.Text && SA.Text.isEditing();
    dialog('设置', [h('p', { style: 'margin-top:0' }, SA.RELEASE ? '调整场景特效显示。' : '开发和调试用的入口。')], [
      !SA.RELEASE ? { label: '开发者', onClick: () => SA.Camp.dev.panel() } : null,
      SA.Scenes ? { label: `场景特效：${SA.Scenes.fxOn() ? '开' : '关'}`, onClick: () => { SA.Scenes.setFx(!SA.Scenes.fxOn()); SA.toast && SA.toast(`场景特效已${SA.Scenes.fxOn() ? '打开' : '关闭'}（雾、光、超近景遮挡）`); } } : null,
      !SA.RELEASE && SA.Text ? { label: editing ? '完成页面编辑' : '页面管理', onClick: () => { SA.Text.toggle(); topbar(); } } : null,
    ].filter(Boolean));
  }

  // ---------- 像素性能单（界面重建 v3）：齿条表 + 问题；preview = 装上手里零件以后的 stats（棋盘点显示变化）----------
  function pxStats(s, v, preview) {
    const UI = SA.PX.ui, P = SA.PAL;
    const heatOf = (x) => Math.min(1, (x.heatGen + SA.K.IDLE_HEAT) / Math.max(0.1, SA.K.DISSIPATE + x.cool + (x.dryCool || 0)));
    const effW = (x) => (x.waterSave < 1 ? x.water / x.waterSave : x.water);
    const wScale = Math.max(250, effW(s), preview ? effW(preview) : 0);
    const rows = (x) => [
      { k: 'power', name: '动力', pct: x.demand / Math.max(x.supply, x.demand, 1e-6), val: `${Math.round(x.demand)}/${Math.round(x.supply)}`, bad: x.demand > x.supply,
        note: `额定需求 ${SA.Phys.fmtKw(x.demand)}（设备 ${SA.Phys.fmtKw(x.equip)} + 行驶 ${SA.Phys.fmtKw(x.drive)}）· 锅炉 ${SA.Phys.fmtPower(x.supply)}（红线）` },
      { k: 'weight', name: '重量', pct: x.weight / Math.max(x.load, x.weight, 1e-6), val: SA.tons(x.weight), bad: x.weight > x.load, note: `满水 ${SA.tons(x.weight)}（干重 ${SA.tons(x.dryWeight)}）· 底盘承重 ${SA.tons(x.load)}（红线）· 撞击伤害 ×${SA.ramMul(x.weight).toFixed(2)}` },
      { k: 'speed', name: '速度', pct: x.topSpeed / 100, val: SA.kmh(x.topSpeed), note: `最高 ${SA.kmh(x.topSpeed)}（底盘 ${SA.kmh(x.speed)} × 动力 ${Math.round((x.speedMul || 0) * 100)}%）· 刹车 ×${(x.brake || 0).toFixed(2)} · 晃动 ×${(x.sway || 0).toFixed(2)}` },
      { k: 'heat', name: '热量', pct: heatOf(x), val: `${Math.round(heatOf(x) * 100)}%`, bad: heatOf(x) >= 1, note: `产热 ${SA.Phys.fmtKw(x.heatGen + SA.K.IDLE_HEAT)} · 水冷 ${SA.Phys.fmtKw(x.cool)}${x.dryCool ? ` + 散热片 ${SA.Phys.fmtKw(x.dryCool)}` : ''} · ${x.overheat === Infinity ? '预计不达过热阈值' : `全力开火约 ${Math.round(x.overheat)} 秒后过热`}` },
      { k: 'water', name: '水', pct: effW(x) / wScale, val: SA.Phys.fmtWater(x.water), note: `${x.tanks} 只水箱 · ${SA.Phys.fmtWater(x.water)}${x.waterSave < 1 ? ` · 冷却耗水 ×${f1(x.waterSave)}` : ''}` },
    ];
    // 悬浮说明：这一项是什么、怎么算的、为什么要紧（性能单上只留条和数字）
    const ABOUT = {
      power: '锅炉供得上的蒸汽功率，和所有设备 + 行驶要用的功率。条到红线就是吃满了；超过红线，车会跑不动、武器也会变慢。',
      weight: '整车满水时的重量。底盘承重是红线，超过就开不动。越重撞人越疼，但起步、爬坡越慢。',
      speed: '平地上能跑到的最快速度：底盘本身的速度，按动力够不够打个折。刹车和晃动影响走位和边走边打。',
      heat: '全力开火时，产热和冷却能力的比。到 100% 就会越打越烫，过热后锅炉减压、武器停火。',
      water: '水箱里的冷却水。水冷靠它带走热量，烧干了就只剩散热片。',
    };
    const now = rows(s), nxt = preview ? rows(preview) : null;
    const lim = { power: s.supply / Math.max(s.supply, s.demand, 1e-6), weight: s.load / Math.max(s.load, s.weight, 1e-6) };
    return h('div', { class: 'px-stats' },
      now.map((g, i) => {
        const d2 = nxt ? nxt[i].pct - g.pct : 0;
        const el = UI.meter({ ...g, pct: Math.min(1, g.pct), delta: Math.abs(d2) > 0.004 ? d2 : 0 }, { w: 50, lim: lim[g.k] });
        return UI.tip(el, () => [h('div', { class: 'tp-nm' }, g.name, ' ', h('span', { class: 'tp-val' }, g.val)),
          h('div', { class: 'tp-ks' }, g.note.split(' · ').map(t => h('div', {}, t))),
          h('div', { class: 'tp-note' }, ABOUT[g.k])]);
      }),
      preview ? h('div', { class: 'px-small' }, '棋盘点 = 装上手里的零件以后') : null,
      s.problems.map(p => h('div', { class: 'px-hand px-prob' }, p)),
      s.warnings.map(w => h('div', { class: 'px-small px-warn' }, w)));
  }

  // ---------- 属性条 ----------
  function statBars(s, v) {
    const pmax = Math.max(s.supply, s.demand, 1);
    const wmax = Math.max(s.load, s.weight, 1);
    const pct = (x, m) => `${Math.max(0, Math.min(100, (x / m) * 100))}%`;
    const oh = s.overheat === Infinity ? '预计不达过热阈值' : `全力开火约 ${Math.round(s.overheat)} 秒后过热`;
    const heatShare = Math.min(1, (s.heatGen + SA.K.IDLE_HEAT) / Math.max(0.1, SA.K.DISSIPATE + s.cool + (s.dryCool || 0)));
    // 省水：同样的水按耗水倍率折算成"等效水量"，水条后面用斜纹接上多出来的那一截
    const effWater = s.waterSave < 1 ? s.water / s.waterSave : s.water, wScale = Math.max(250, effWater);
    // 全车最大穿深 / 最厚装甲（v 可选：给了才算；穿深对照表在选中武器时的清单里）
    let pen = 0, thick = 0;
    if (v) SA.V.each(v, (cell) => { if (cell.hp <= 0) return; const m = SA.mod(cell); if (m.penetration < 99) pen = Math.max(pen, m.penetration || 0); thick = Math.max(thick, m.armor || 0); });
    return h('div', { class: 'bars' },
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '动力'),
        h('div', { class: 'bar power' }, h('i', { style: `width:${pct(s.demand, pmax)}` }),
          h('span', { class: 'mark', style: `left:${pct(s.supply, pmax)}`, title: '锅炉供给' }))),
      h('div', { class: 'bar-note' }, `额定需求 ${SA.Phys.fmtKw(s.demand)}（设备 ${SA.Phys.fmtKw(s.equip)} + 行驶 ${SA.Phys.fmtKw(s.drive)}）· 锅炉 ${SA.Phys.fmtPower(s.supply)}（${SA.Phys.fmtKw(s.supply)}，白线）`,
        s.store ? h('span', { class: 'na-inline na-储能' }, ` · 储能 ${SA.Phys.fmtHeat(s.store)}：富余时蓄压，不够时最多补 ${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}`) : null),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '重量'),
        h('div', { class: `bar weight ${s.weight > s.load ? 'over' : ''}` }, h('i', { style: `width:${pct(s.weight, wmax)}` }),
          h('span', { class: 'cap', style: `left:calc(${pct(s.load, wmax)} - 2px)`, title: '底盘承重' }))),
      h('div', { class: 'bar-note' }, `满水 ${SA.tons(s.weight)}（干重 ${SA.tons(s.dryWeight)}）· 底盘承重 ${SA.tons(s.load)}（红线）· 撞击伤害 ×${SA.ramMul(s.weight).toFixed(2)} · 行驶功率随质量和速度计算`),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '速度'),
        h('div', { class: 'bar speed' }, h('i', { style: `width:${pct(s.topSpeed, 100)}` }),
          h('span', { class: 'mark', style: `left:${pct(s.speed, 100)}`, title: '底盘基础速度' }))),
      h('div', { class: 'bar-note' }, `最高 ${SA.kmh(s.topSpeed)}（底盘 ${SA.kmh(s.speed)} × 动力 ${Math.round((s.speedMul || 0) * 100)}%，锅炉富余最多 ${Math.round(SA.K.SPEED_BOOST * 100)}%）· 刹车 ×${(s.brake || 0).toFixed(2)} · 晃动 ×${(s.sway || 0).toFixed(2)}`),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '瞄准'),
        h('div', { class: 'bar aim' }, h('i', { style: `width:${pct(s.aimShrink, SA.K.AIM_SHRINK_MAX)}` }))),
      h('div', { class: 'bar-note' }, `按住蓄满最多缩小散布 ${Math.round(s.aimShrink * 100)}% · 瞄准速度 ×${s.aimSpeed.toFixed(2)}（直射火炮约 ${(SA.MODULES.cannon.aimT / s.aimSpeed).toFixed(1)} 秒蓄满）· 以后加装瞄准镜可以缩得更多、更快`),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '热量'),
        h('div', { class: 'bar heat' }, h('i', { style: `width:${pct(heatShare, 1)}` }))),
      h('div', { class: 'bar-note' }, `机组/冷却回路热容 ${s.heatCapacity.toFixed(1)} kJ/°C · 产热 ${SA.Phys.fmtKw(s.heatGen + SA.K.IDLE_HEAT)} · 自然散热随温差增加，水冷额定 ${SA.Phys.fmtKw(s.cool)}`,
        s.dryCool ? h('span', { class: 'na-inline na-不耗水散热' }, ` + 散热片 ${SA.Phys.fmtKw(s.dryCool)}`) : null, ` · ${oh}`),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '水'),
        h('div', { class: 'bar water' }, h('i', { style: `width:${pct(s.water, wScale)}` }),
          effWater > s.water ? h('b', { class: 'eff', style: `left:${pct(s.water, wScale)};width:${pct(effWater - s.water, wScale)}`, title: '省水：冷却耗水打折后等于多出来的水' }) : null)),
      h('div', { class: 'bar-note' }, `${s.tanks} 只水箱 · ${SA.Phys.fmtWater(s.water)}`,
        s.waterSave < 1 ? h('span', { class: 'na-inline na-省水' }, ` · 冷却耗水 ×${f1(s.waterSave)}，等效约 ${SA.Phys.fmtWater(effWater)}（斜纹）`) : null),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, '耐久'),
        h('div', { class: 'bar hp' }, h('i', { style: `width:${pct(s.hp, Math.max(s.maxHp, 1))}` }))),
      h('div', { class: 'bar-note' }, `${s.hp}/${s.maxHp} · 火力 ${s.dps.toFixed(1)}/秒 · 综合评分 ${s.rating}`,
        pen ? ` · 最大穿深 ${f1(pen)}` : '', thick ? ` · 最厚装甲 ${f1(thick)}` : '',
        s.tether ? h('span', { class: 'na-inline na-牵引' }, ' · 带牵引') : null),
      s.problems.map(p => h('div', { class: 'warn bad' }, p)),
      s.warnings.map(w => h('div', { class: 'warn' }, w)),
    );
  }

  function statLine(id, mt = 1) {
    const m = SA.mod(id, mt);
    const parts = [`耐久 ${m.hp}`];
    if (m.armor) parts.push(`装甲厚度 ${f1(m.armor)}`);
    if (m.power) parts.push(`额定功率 ${SA.Phys.fmtKw(m.power)}`);
    if (m.supply) parts.push(`动力 ${SA.Phys.fmtPower(m.supply)}（${SA.Phys.fmtKw(m.supply)}）`, `回路产热 ≤${SA.Phys.fmtKw(m.heatRate)}`);
    if (m.load) parts.push(`承重 ${SA.tons(m.load)}`, `速度 ${SA.kmh(m.speed)}`, `起步 ×${m.accel}`, `刹车 ×${m.brake}`, `晃动 ×${m.sway}`);
    parts.push(`重量 ${SA.tons(SA.weightOf({ id }))}`);
    if (m.dmg) parts.push(`伤害 ${m.dmg}`, `装填 ${m.reload}s`, m.indirect ? (m.spread ? `高抛 · 散布 ±${m.spread}° · 仰角 ${m.elev[0]}~${m.elev[1]}°` : '高抛 · 指哪打哪') : `直射 · 散布 ±${m.spread}° · 仰角 ${m.elev[0]}~${m.elev[1]}°`, m.heatPerSec ? `回路产热 ${SA.Phys.fmtKw(m.heat)}` : `回路热 +${SA.Phys.fmtHeat(m.heat)}/发`);
    if (m.penetration) parts.push(m.penetration >= 99 ? '不会弹开' : `穿深 ${m.penetration}${m.ricochet ? `（易弹开 +${Math.round(m.ricochet * 100)}%）` : ''}`);
    if (m.tether) parts.push(`牵引 ${m.tether}`);
    if (m.store) parts.push(`储能 ${SA.Phys.fmtHeat(m.store)}`);
    if (m.dryCool) parts.push(`不耗水散热 ${SA.Phys.fmtKw(m.dryCool)}`);
    if (m.waterSave) parts.push(`省水：耗水 ×${m.waterSave}`);
    if (m.ram) parts.push(`撞击 ${m.ram}×速度`);
    if (m.punch) parts.push(`活塞 ${m.punch}/${m.punchCd}s`);
    if (m.water) parts.push(`冷却 ${SA.Phys.fmtKw(m.cool)}`, `水 ${SA.Phys.fmtWater(m.water)}`);
    else if (m.cool) parts.push(`冷却 ${SA.Phys.fmtKw(m.cool)}`);
    if (m.evade) parts.push(`闪避 +${Math.round(m.evade * 100)}%`);
    if (m.acc && !m.dmg) parts.push(`命中 +${Math.round(m.acc * 100)}%`);
    return parts.join(' · ');
  }

  function vehiclePreview(v, scale = 4) {
    const cv = h('canvas', { class: 'px' });
    // 裁到载具包围盒，让车在预览里尽量大
    const C = SA.K.CELL;
    let c0 = SA.K.COLS, c1 = -1, r0 = SA.K.ROWS;
    SA.V.each(v, (cell, r, c) => { c0 = Math.min(c0, c); c1 = Math.max(c1, c + SA.fp(cell.id).w - 1); r0 = Math.min(r0, r); });
    if (c1 < 0) { c0 = 0; c1 = SA.K.COLS - 1; r0 = 0; }
    r0 = Math.min(r0, SA.K.ROWS - 6);   // 至少露出 3 层大格
    const sx = SA.SPR.PADX + c0 * C - 16, sy = Math.max(0, r0 * C - 12);
    const W = (c1 - c0 + 1) * C + 16 + 20, H = SA.K.ROWS * C - sy + 12;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const draw = (t) => {
      g.fillStyle = P.bg[2];
      g.fillRect(0, 0, W, H);
      g.fillStyle = P.bg[3]; g.fillRect(0, H - 12, W, 12);
      g.fillStyle = P.bg[4]; g.fillRect(0, H - 12, W, 1);
      const st = SA.V.stats(v);
      g.drawImage(SA.SPR.renderVehicle(v, { key: 'preview', t, heat: 0.3, water: 1, showWrecks: true, showBlocked: true, blocked: st.blocked }), -sx, -sy);
    };
    draw(0);
    cv.style.maxWidth = `${W * scale}px`;
    cv._draw = draw;
    return cv;
  }


  // ---------- 银行（点顶栏资金打开）----------
  function openBank() {
    const d = S();
    const act = (label, ok, fn, primary) => h('button', { class: `btn ${primary ? 'primary' : ''}`, disabled: !ok, onclick: () => { fn(); SA.S.save(); topbar(); openBank(); } }, label);
    openModal('伦敦蒸汽银行', [
      h('p', { class: 'muted', style: 'margin-top:0' }, `每打一场锦标赛，未还清的债务加收 10% 利息。借款上限 ${money(SA.S.LOAN_CAP)}。在车间买东西钱不够时，也会主动问你要不要借。`),
      h('div', { class: 'bank' },
        h('div', {}, h('span', { class: 'k' }, '资金'), h('b', { class: 'gold' }, money(d.money))),
        h('div', {}, h('span', { class: 'k' }, '债务'), h('b', { style: 'color:var(--fire2)' }, money(d.debt)))),
      h('div', { class: 'dialog-actions', style: 'padding:12px 0 0;justify-content:flex-start' },
        act('借 £300', SA.S.loanRoom() >= 300, () => SA.S.borrow(300), true),
        act('还 £100', d.debt && d.money >= Math.min(100, d.debt), () => SA.S.repay(100)),
        act('全部还清', d.debt && d.money >= d.debt, () => SA.S.repay(d.debt))),
    ]);
    $('#modal > .panel').classList.add('dialog');
  }

  // 关掉弹窗后刷新当前页面
  function refresh() {
    SA.S.save();
    topbar();
    if (SA.current === 'arena' && SA.Arena) SA.Arena.render();
    if (SA.current === 'garage' && SA.Editor) SA.Editor.refresh();
  }

  // ---------- 战后结算 ----------
  function afterBattle(res) {
    const d = S();
    // 过关提示（SA.Story）：记下打的是哪一场、结算前开放了哪些功能，结算弹窗之后由亲戚补一句
    const at = res.mode === 'campaign' && !res.replay ? SA.Camp.current() : null;
    const feat0 = d.camp.feat.slice();
    // 战后剧情插入点（SA.StoryDev）：按开战时记下的关卡 key，不读胜利推进后的新当前关；写好的段落先演，再是亲戚的提示
    const inserted = (next) => (SA.StoryDev ? SA.StoryDev.after({ key: res.opts && res.opts.storyKey, replay: res.replay }, next) : next());
    const story = (next) => inserted(() => (SA.Story ? SA.Story.afterBattle({ key: at && `${at.ci},${at.si}`, win: res.win, newFeat: d.camp.feat.filter(f => !feat0.includes(f)) }, next) : next()));
    const { lines, pre: pending, money0 } = SA.S.settleBattle(res);
    const pre = pending.map(p => p.kind === 'salvage'
      ? (next) => SA.Camp.salvageDialog(p.survivors, next)
      : (next) => SA.Camp.unlockDialog(p.unlock, next));
    // K7 重打沿用战役 / 支线的战斗入口，但完全按友谊赛处理：不写战损，不推进进度，不发钱、声望或缴获。
    if (res.replay) {
      SA.nav('arena', null, true);
      dialog(res.draw ? '重打结束：平手' : res.win ? '重打胜利！' : '重打结束', [
        h('p', { style: 'font-size:16px;margin-top:0' }, h('b', {}, res.reason)),
        h('p', { class: 'muted' }, `造成伤害 ${Math.round(res.dealt)} · 承受伤害 ${Math.round(res.taken)} · 用时 ${Math.round(res.time)} 秒`),
        h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' }, '重打不发奖励、不计声望，也不留下战损。'),
        feedbackRow(res.humanId),
      ], [], '继续', () => { refresh(); inserted(() => SA.Camp.introIfNew()); });
      return;
    }
    SA.nav('arena', null, true);
    // 受损就直接给出修理入口，不让玩家自己找
    const summary = () => {
      const hurt = [];
      SA.V.each(d.vehicle, (cell) => { if (cell.hp < SA.V.maxHp(cell)) hurt.push(cell); });
      // 免费修理只适用于本场战役胜利；损伤和点击修复仍走原有部件流程。
      const freeRepair = res.mode === 'campaign' && res.win && !res.draw && res.opts?.victoryRepairFree === true;
      const cost = freeRepair ? 0 : hurt.reduce((a, c) => a + SA.S.repairCost(c), 0);
      const fixAll = () => { SA.S.repairCells(hurt); toast(freeRepair ? `免费修好 ${hurt.length} 个模块` : `修好 ${hurt.length} 个模块，花费 ${money(cost)}`); };
      const after = () => { refresh(); story(() => SA.Camp.introIfNew()); };
      const gain = d.money - money0, net = gain - cost;
      dialog(res.draw ? '平手' : res.win ? '胜利！' : '战败', [
        h('p', { style: 'font-size:16px;margin-top:0' }, h('b', {}, res.reason)),
        h('p', { class: 'muted' }, `造成伤害 ${Math.round(res.dealt)} · 承受伤害 ${Math.round(res.taken)} · 用时 ${Math.round(res.time)} 秒`),
        lines.map(l => h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' }, l)),
        hurt.length ? h('div', { class: 'rp-sum' },
          h('div', { class: 'rp-head' }, h('b', {}, `${freeRepair ? '免费修理' : '修理费'} · ${hurt.length} 个模块受损`), h('span', { class: 'muted' }, freeRepair ? '本场胜利修理由铁匠铺承担' : '越精密的部件修起来越贵')),
          repairList(hurt, 5, freeRepair),
          gain > 0 || freeRepair ? h('div', { class: `rp-net ${net < 0 ? 'bad' : ''}` },
            `本场进账 ${money(gain)} − 修理 ${freeRepair ? '免费' : money(cost)} = `, h('b', {}, `${net < 0 ? '净亏' : '净赚'} ${money(Math.abs(net))}`)) : null) : null,
        feedbackRow(res.humanId),
      ], [
        hurt.length ? { label: freeRepair ? '免费全部修理' : `全部修理 ${money(cost)}`, primary: true, onClick: () => freeRepair ? (fixAll(), after()) : pay({ title: '修理', amount: cost, okLabel: '修理', confirm: false, onPaid: () => { fixAll(); after(); } }) } : null,
        hurt.length && SA.Camp.has('garage') ? { label: '去车间', onClick: () => { SA.nav('garage'); story(() => {}); } } : null,
      ].filter(Boolean), hurt.length ? '稍后再说' : '继续', after);
    };
    const run = (i) => (i < pre.length ? pre[i](() => run(i + 1)) : summary());
    run(0);
  }

  // ---------- 修理费呈现（W2，docs/campaign-direction.md §5）----------
  // 修理费比例（SA.repairRate，astra 定）分四档给玩家看：越精密越贵。"修满" = 这一件（含材料和改装）从报废修到满耐久的钱
  const RP_TIERS = [[0.06, '便宜'], [0.12, '一般'], [0.2, '较贵'], [Infinity, '昂贵']];
  function repairTier(id) {
    const rate = SA.repairRate(id), i = RP_TIERS.findIndex(([x]) => rate <= x + 1e-9);
    return { n: i + 1, name: RP_TIERS[i][1], rate };
  }
  const repairFull = (cell) => Math.max(1, Math.ceil(SA.cellValue(cell) * SA.repairRate(cell.id)));
  // 四格小扳手刻度：亮几格 = 第几档
  function repairPips(id, label) {
    const t = repairTier(id);
    return h('span', { class: `rp rp-${t.n}`, title: `修理费${t.name}：修满约为部件价值的 ${Math.round(t.rate * 100)}%` },
      label ? h('em', {}, label) : null, h('i'), h('i'), h('i'), h('i'));
  }
  function repairChip(cell) {
    const t = repairTier(cell.id);
    return h('span', { class: `chip rp-chip rp-${t.n}`, title: `修理费${t.name}：部件价值 ${money(SA.cellValue(cell))} × ${Math.round(t.rate * 100)}%，按损伤比例计` },
      `修满 ${money(repairFull(cell))} · ${t.name}`);
  }
  // 修理清单：按花费从高到低，最贵的几件单独列出，条的长短 = 占总修理费的比例
  function repairList(cells, top = 5, free = false) {
    const rows = cells.map(c => ({ c, cost: SA.S.repairCost(c) })).filter(r => r.cost > 0).sort((a, b) => b.cost - a.cost);
    const total = rows.reduce((a, r) => a + r.cost, 0), rest = rows.slice(top);
    const row = ({ c, cost }) => {
      const max = SA.V.maxHp(c), lost = c.hp <= 0 ? '报废' : `损 ${Math.round((1 - c.hp / max) * 100)}%`, t = repairTier(c.id);
      const pic = SA.SPR.moduleCanvas(c.id, 0.5, c.mt); pic.classList.add('px');
      return h('div', { class: `rp-row rp-${t.n}`, style: `--f:${(cost / Math.max(1, total) * 100).toFixed(1)}%` },
        h('span', { class: 'pic' }, pic), h('span', { class: 'nm' }, SA.MODULES[c.id].name, ' ', SA.Camp.matChip(c.mt || 1)),
        h('span', { class: `lost ${c.hp <= 0 ? 'dead' : ''}` }, lost), repairPips(c.id), h('b', {}, free ? '免费' : money(cost)));
    };
    return h('div', { class: 'rp-list' }, rows.slice(0, top).map(row),
      rest.length ? h('div', { class: 'rp-row more' }, h('span', { class: 'nm' }, `其余 ${rest.length} 件`), h('b', {}, free ? '免费' : money(rest.reduce((a, r) => a + r.cost, 0)))) : null,
      rows.length > 1 ? h('div', { class: 'rp-row total' }, h('span', { class: 'nm' }, '合计'), h('b', {}, free ? '免费' : money(total))) : null);
  }
  // 一行文字版（按钮的鼠标提示用）
  const repairBrief = (cells) => cells.map(c => [c, SA.S.repairCost(c)]).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([c, k]) => `${SA.MODULES[c.id].name} ${money(k)}`).join('\n');

  // ---------- 新属性（V4）：储能、省水、不耗水散热、牵引、穿深 / 装甲厚度 ----------
  const f1 = (x) => (Math.round(x * 10) / 10).toString();
  // 弹开概率（和战斗里同一个公式，SA.Battle.ricochetChance）
  const bounce = (armor, w) => (SA.Battle && SA.Battle.ricochetChance ? SA.Battle.ricochetChance(armor, w) : 0);
  const ARMOR_REF = ['plate', 'armor', 'bucket', 'armor_heavy'];
  const PEN_REF = ['mg', 'side_cannon', 'cannon_s', 'cannon_m', 'rocket_rack', 'mortar', 'cannon', 'cannon_heavy', 'cannon_giant'];
  function bounceCell(ch) {
    const k = ch <= 0 ? 0 : ch < 0.3 ? 1 : ch < 0.55 ? 2 : 3;
    return h('td', { class: `pen pen-${k}`, title: ch <= 0 ? '穿深够：照常按护甲减伤' : `穿深不够：${Math.round(ch * 100)}% 的炮弹会弹开，几乎没伤害` },
      ch <= 0 ? '穿' : `${Math.round(ch * 100)}%`);
  }
  // 穿深对照表：武器 → 各种装甲 × 各级材料；装甲 → 常见武器 × 这块装甲的各级材料
  function penTable(id, maxMt = SA.MAT_MAX) {
    const m = SA.MODULES[id], mats = SA.MATS.slice(1, Math.max(1, maxMt) + 1);
    const head = h('tr', {}, h('th', {}, ''), mats.map((mt) => h('th', { title: mt.rank ? `${mt.rank} · ${mt.name}` : mt.name }, h('i', { class: 'mat-dot', style: `background:${mt.chip}` }), mt.name)));
    if (m.dmg) {
      if (!m.penetration || m.penetration >= 99) return h('div', { class: 'pen-note' }, '喷射类武器：不会弹开。');
      return h('div', { class: 'pen-wrap' },
        h('div', { class: 'pen-cap' }, `穿深 ${m.penetration}${m.ricochet ? `（另加 ${Math.round(m.ricochet * 100)}% 弹开）` : ''} 打各种装甲的弹开率`),
        h('table', { class: 'pen-tab' }, head, ARMOR_REF.map(a => h('tr', {}, h('th', {}, SA.MODULES[a].name),
          mats.map((mt, i) => bounceCell(bounce(SA.mod(a, i + 1).armor, m)))))));
    }
    if (m.armor) {
      return h('div', { class: 'pen-wrap' },
        h('div', { class: 'pen-cap' }, `装甲厚度 ${mats.map((mt, i) => f1(SA.mod(id, i + 1).armor)).join(' / ')}（随材料加厚）· 各武器打它的弹开率`),
        h('table', { class: 'pen-tab' }, head, PEN_REF.map(w => h('tr', {}, h('th', {}, `${SA.MODULES[w].name} ${SA.MODULES[w].penetration}`),
          mats.map((mt, i) => bounceCell(bounce(SA.mod(id, i + 1).armor, SA.MODULES[w])))))));
    }
    return null;
  }
  // 把一件模块临时放进车的空位，算出装上前后的整车属性（只用来预览，不管摆放规则）
  const secs = (t) => (t === Infinity ? '预计不过热' : `${Math.round(t)} 秒`);
  // 新属性模块的说明 + 装上后的变化（车间右侧选中行展开）
  function newAttrInfo(id, mt, v) {
    const m = SA.mod(id, mt), out = [];
    if (m.store) out.push(['储能', `蓄压容量 ${SA.Phys.fmtHeat(m.store)}：锅炉有富余时储存蒸汽能量，动力不够时最多补 ${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}。存量过半时被打爆会爆炸。`]);
    if (m.waterSave) out.push(['省水', `全车冷却耗水 ×${m.waterSave}（多个按乘积叠加，最低 ×${SA.K.WATER_SAVE_MIN}）；本身不储水。`]);
    if (m.dryCool) out.push(['不耗水散热', `温差达到 30°C 时额外散热 ${SA.Phys.fmtKw(m.dryCool)}，不用水。`]);
    if (m.tether) out.push(['牵引', `命中后挂上绳索，把对手往自己这边拉（收绳 ${m.tether}）；被拉过来撞上时反震从 ${Math.round(SA.K.RAM_SELF * 100)}% 降到 ${Math.round(SA.K.RAM_TETHER_SELF * 100)}%。绳子挂着时不能再发射。`]);
    if (!out.length) return null;
    const a = v && SA.V.stats(v), b = v && SA.V.statsWith(v, id, mt);
    const diff = [];
    if (a && b) {
      if ((m.store || m.waterSave || m.dryCool) && a.overheat !== b.overheat) diff.push(`全力开火过热：${secs(a.overheat)} → ${secs(b.overheat)}`);
      if (m.store) diff.push(`储能 ${SA.Phys.fmtHeat(a.store)} → ${SA.Phys.fmtHeat(b.store)}`);
      if (m.waterSave) diff.push(`冷却耗水 ×${f1(a.waterSave)} → ×${f1(b.waterSave)}`);
      if (m.dryCool) diff.push(`不耗水散热 ${SA.Phys.fmtKw(a.dryCool)} → ${SA.Phys.fmtKw(b.dryCool)}`);
      diff.push(`评分 ${a.rating} → ${b.rating}`, `总重 ${SA.tons(a.weight)} → ${SA.tons(b.weight)}`);
    }
    return h('div', { class: 'na-wrap' },
      out.map(([k, t]) => h('div', { class: 'na-row' }, h('b', { class: `na-tag na-${k}` }, k), h('span', {}, t))),
      diff.length ? h('div', { class: 'na-diff' }, h('span', { class: 'muted' }, '装上这一件：'), diff.map(x => h('span', {}, x))) : null);
  }

  // ---------- 唯一件（K5）：金色星标徽章。规则只看 SA.isUnique / SA.uniqueRule，不在界面里写死哪几件 ----------
  function uniqueBadge(id, opts = {}) {
    if (!SA.isUnique(id)) return null;
    const r = SA.uniqueRule(id), mt = r && r.mt ? SA.MATS[r.mt] : null;
    return h('span', { class: `chip uniq ${opts.big ? 'big' : ''}`, title: `唯一件：不能购买，只能缴获${mt ? `，固定 ${mt.name}` : ''}${r && r.once ? '，每个存档只能拿一次' : ''}` }, '★ 唯一件');
  }

  // ---------- 战后一键评价（docs/evolve-plan.md §11，数据由 SA.HUMAN_BATTLES 记录）----------
  // 三个按钮，点一下就记下，可以改选；记录失败（隐私模式等）就不显示
  const FEEL = [['好玩', 'fun'], ['无聊', 'dull'], ['不公平', 'unfair']];
  function feedbackRow(id) {
    if (!id || !SA.HUMAN_BATTLES || !SA.HUMAN_BATTLES.feedback) return null;
    const row = h('div', { class: 'feel' }, h('span', { class: 'muted' }, '这一场打得：'));
    const btns = FEEL.map(([v, k]) => h('button', { class: `btn small feel-${k}`, onclick: () => {
      if (!SA.HUMAN_BATTLES.feedback(id, v)) { toast('没记下来（本机存储不可用）'); return; }
      for (const b of btns) b.classList.toggle('on', b === btns[FEEL.findIndex(x => x[0] === v)]);
      row.querySelector('.feel-thanks').textContent = '谢谢，记下了';
    } }, v));
    row.append(...btns, h('span', { class: 'feel-thanks muted' }));
    return row;
  }

  return { toast, openModal, closeModal, dialog, pay, topbar, settings, pxStats, refresh, openBank, statBars, statLine, vehiclePreview, afterBattle, money,
    repairTier, repairFull, repairPips, repairChip, repairList, repairBrief, penTable, newAttrInfo, statsWith: SA.V.statsWith, uniqueBadge, feedbackRow };
})();
