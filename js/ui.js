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
    const close = h('button', { class: 'btn small', onclick: closeModal }, SA.Config.text("ui_3fd47edce45b"));
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
  function dialog(title, body, actions = [], cancelLabel = SA.Config.text("editor_2cd0f3be8738"), onDismiss = null) {
    const m = $('#modal');
    m.innerHTML = '';
    const btns = actions.map(a => h('button', { class: `btn ${a.primary ? 'primary' : ''}`, onclick: () => { modalOnClose = null; closeModal(); a.onClick(); } }, a.label));
    if (cancelLabel !== false || !btns.length) btns.push(h('button', { class: 'btn', onclick: closeModal }, actions.length ? cancelLabel : SA.Config.text("ui_de32e20193ad")));
    m.append(h('div', { class: 'panel dialog' },
      h('div', { class: 'panel-head' }, h('h2', {}, title)),
      h('div', { class: 'panel-body' }, body),
      h('div', { class: 'dialog-actions' }, btns)));
    m.hidden = false;
    modalOnClose = onDismiss;
    setTimeout(() => btns[0].focus(), 0);
  }

  // 付钱：钱够就（按需确认后）直接扣款；不够就问要不要向银行贷款补齐差额
  function pay({ title, amount, lines = [], okLabel = SA.Config.text('ui_pay_confirm'), confirm = true, onPaid }) {
    const d = S();
    const done = () => { SA.S.payAmount(amount); spendFloat(amount); topbar(); onPaid(); };
    if (d.money >= amount) {
      if (!confirm) { done(); return; }
      dialog(title, [lines, h('p', {}, SA.Config.text("ui_3f0e5c97fad1"), h('b', { class: 'gold' }, money(amount)), SA.Config.text("ui_a0760d8f2f4c", `${money(d.money - amount)}`))],
        [{ label: `${okLabel} ${money(amount)}`, primary: true, onClick: done }]);
      return;
    }
    const short = amount - d.money;
    const loan = Math.ceil(short / SA.RULES.economy.loanStep) * SA.RULES.economy.loanStep;
    const room = SA.S.loanRoom();
    if (!SA.Camp.has('bank')) {
      dialog(SA.Config.text("ui_80d4c44d2226"), [lines, h('p', {}, SA.Config.text("ui_9cbb5113eb59", `${money(short)}`)), h('p', { class: 'muted' }, SA.Config.text("ui_6ea3a743798b"))]);
      return;
    }
    if (loan > room) {
      dialog(SA.Config.text("ui_80d4c44d2226"), [lines, h('p', {}, SA.Config.text("ui_18635c16e28f", `${money(short)}`, `${money(room)}`, `${money(SA.S.LOAN_CAP)}`)),
        h('p', { class: 'muted' }, SA.Config.text("ui_7fab240fea6f"))]);
      return;
    }
    dialog(SA.Config.text("ui_80d4c44d2226"), [lines,
      h('p', {}, SA.Config.text("ui_52a8748e9409", `${money(d.money)}`), h('b', { class: 'gold' }, money(short)), SA.Config.text("ui_b58ee0d02f5d")),
      h('p', { class: 'muted' }, SA.Config.text("ui_961ce2520103", `${money(loan)}`, `${money(d.debt)}`, `${money(d.debt + loan)}`, `${SA.RULES.economy.interestRate * 100}%`))],
    [{ label: SA.Config.text("ui_1935f944ce05", `${money(loan)}`, `${okLabel}`), primary: true, onClick: () => { SA.S.borrow(loan); done(); } }]);
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
    const where = st || SA.Camp.pending() ? ch.name : SA.Config.text("ui_977e74339430", `${d.round + 1}`);
    const nav = (key, label, extra) => UI.btn(label, { kind: cur === key ? 'pri' : 'sec', gear: cur === key, onclick: () => SA.nav(key), title: extra || null });
    const ingots = Object.entries(d.ingots || {}).filter(([, n]) => n > 0).map(([k, n]) => [k === 'aether' ? 'aether' : 'wootz', n]);
    const counter = UI.counter({ money: d.money, rep: d.rep, ingotList: ingots, onclick: has('bank') });
    if (has('bank')) { counter.title = SA.Config.text("home_285c90f90398"); counter.addEventListener('click', openBank); }
    const gear = UI.btn(null, { title: SA.Config.text("home_df3d58c7d84b"), icon: UI.img(SA.PX.gear(6, 8, SA.PX.RAMP.brass, 0.1)), onclick: settings }); gear.style.padding = '0 2px';
    // 导航（2026-09-30）：院子是中枢，出战也在院子里（拉下黑板）；顶栏只剩「在哪一章」、钱和设置，
    // 车间里离开的路是改装台右下角的「← 回院子 / 出战 →」
    bar.append(...[
      has('garage') ? UI.plate(SA.Config.text("home_98d39d5eed3f"), 'font-size:16px') : UI.plate(SA.Config.text("ui_726a56454720"), 'font-size:18px'),
      h('span', { class: 'top-where' }, where),
      h('span', { class: 'top-gap' }),
      counter,
      d.debt ? UI.tag([h('span', {}, SA.Config.text("home_ffb37d8b01c4")), UI.num(money(d.debt), SA.PX.RED)]) : null,
      gear,
    ].filter(Boolean));
  }
  // 玩家重开需要两次明确确认；dialog 会先关闭当前层，再运行按钮回调。
  function confirmRestartGame() {
    dialog(SA.Config.text("ui_3cc5117ceee4"), [
      h('p', {}, SA.Config.text("ui_e043c6a05108")),
      h('p', { class: 'muted' }, SA.Config.text("ui_e3f2b2f425d5")),
    ], [{ label: SA.Config.text("ui_9907489e0983"), onClick: () => dialog(SA.Config.text("ui_e4446a3a1904"), [
      h('p', {}, SA.Config.text("ui_cd55ed2fa5f6")),
      h('p', { class: 'muted' }, SA.Config.text("ui_0a13f1e061a7")),
    ], [{ label: SA.Config.text("ui_0d031bc74539"), primary: true, onClick: () => {
      if (!SA.restartGame()) toast(SA.Config.text("ui_200b105318dc"));
    } }]) }]);
  }
  // 设置：发行包只显示玩家可用的选项；设计模式不能删除正式进度。
  function settings() {
    const editing = SA.Text && SA.Text.isEditing();
    dialog(SA.Config.text("home_df3d58c7d84b"), [h('p', { style: 'margin-top:0' }, SA.RELEASE ? SA.Config.text("ui_d70b4921fdf5") : SA.Config.text("ui_bb50197fd247"))], [
      !SA.RELEASE ? { label: SA.Config.text("ui_38084d301e3f"), onClick: () => SA.Camp.dev.panel() } : null,
      SA.Scenes ? { label: SA.Config.text("ui_ca3bf7a57916", `${SA.Scenes.fxOn() ? SA.Config.text("ui_39eae64cfc41") : SA.Config.text("ui_5d0ae622f61f")}`), onClick: () => { SA.Scenes.setFx(!SA.Scenes.fxOn()); SA.toast && SA.toast(SA.Config.text("ui_0729b8049e2d", `${SA.Scenes.fxOn() ? SA.Config.text("ui_c771248e511f") : SA.Config.text("ui_3fd47edce45b")}`)); } } : null,
      !SA.Camp?.isDesignMode?.() ? { label: SA.Config.text("ui_cb26ea7b2b32"), onClick: confirmRestartGame } : null,
      !SA.RELEASE && SA.Text ? { label: editing ? SA.Config.text("ui_4e8fb22363f8") : SA.Config.text("ui_7034b0e63dfd"), onClick: () => { SA.Text.toggle(); topbar(); } } : null,
    ].filter(Boolean));
  }

  // ---------- 像素性能单（界面重建 v3）：齿条表 + 问题；preview = 装上手里零件以后的 stats（棋盘点显示变化）----------
  function pxStats(s, v, preview) {
    const UI = SA.PX.ui, P = SA.PAL;
    const heatOf = (x) => Math.min(1, (x.heatGen + SA.K.IDLE_HEAT) / Math.max(0.1, SA.K.DISSIPATE + x.cool + (x.dryCool || 0)));
    const effW = (x) => (x.waterSave < 1 ? x.water / x.waterSave : x.water);
    const wScale = Math.max(250, effW(s), preview ? effW(preview) : 0);
    const rows = (x) => [
      { k: 'power', name: SA.Config.text("editor_c9f16bb1e9d3"), pct: x.demand / Math.max(x.supply, x.demand, 1e-6), val: `${Math.round(x.demand)}/${Math.round(x.supply)}`, bad: x.demand > x.supply,
        note: SA.Config.text("ui_dd2ba6832fa3", `${SA.Phys.fmtKw(x.demand)}`, `${SA.Phys.fmtKw(x.equip)}`, `${SA.Phys.fmtKw(x.drive)}`, `${SA.Phys.fmtPower(x.supply)}`) },
      { k: 'weight', name: SA.Config.text("ui_5081ead9bbce"), pct: x.weight / Math.max(x.load, x.weight, 1e-6), val: SA.tons(x.weight), bad: x.weight > x.load, note: SA.Config.text("ui_2304a7fe5bed", `${SA.tons(x.weight)}`, `${SA.tons(x.dryWeight)}`, `${SA.tons(x.load)}`, `${SA.ramMul(x.weight).toFixed(2)}`) },
      { k: 'speed', name: SA.Config.text("arena_0e14d148b46b"), pct: x.topSpeed / 100, val: SA.kmh(x.topSpeed), note: SA.Config.text("ui_bdad79e35b3e", `${SA.kmh(x.topSpeed)}`, `${SA.kmh(x.speed)}`, `${Math.round((x.speedMul || 0) * 100)}`, `${(x.brake || 0).toFixed(2)}`, `${(x.sway || 0).toFixed(2)}`) },
      { k: 'heat', name: SA.Config.text("ui_941ba5f9ea73"), pct: heatOf(x), val: `${Math.round(heatOf(x) * 100)}%`, bad: heatOf(x) >= 1, note: SA.Config.text("ui_0388ca91105f", `${SA.Phys.fmtKw(x.heatGen + SA.K.IDLE_HEAT)}`, `${SA.Phys.fmtKw(x.cool)}`, `${x.dryCool ? SA.Config.text("ui_b8e0c575c812", `${SA.Phys.fmtKw(x.dryCool)}`) : ''}`, `${x.overheat === Infinity ? SA.Config.text("ui_e7c64cf199f7") : SA.Config.text("ui_43b4be7f8c73", `${Math.round(x.overheat)}`)}`) },
      { k: 'water', name: SA.Config.text("battle_327b54d04f71"), pct: effW(x) / wScale, val: SA.Phys.fmtWater(x.water), note: SA.Config.text("ui_c6dd24aef1cf", `${x.tanks}`, `${SA.Phys.fmtWater(x.water)}`, `${x.waterSave < 1 ? SA.Config.text("ui_079442820900", `${f1(x.waterSave)}`) : ''}`) },
    ];
    // 悬浮说明：这一项是什么、怎么算的、为什么要紧（性能单上只留条和数字）
    const ABOUT = {
      power: SA.Config.text("ui_0ac18e8cdf23"),
      weight: SA.Config.text("ui_dc694e0dae8a"),
      speed: SA.Config.text("ui_1e9ede8a5d71"),
      heat: SA.Config.text("ui_00d6c4f22457"),
      water: SA.Config.text("ui_a7db2d4d6877"),
    };
    const now = rows(s), nxt = preview ? rows(preview) : null;
    const lim = { power: s.supply / Math.max(s.supply, s.demand, 1e-6), weight: s.load / Math.max(s.load, s.weight, 1e-6) };
    return h('div', { class: 'px-stats' },
      now.map((g, i) => {
        const d2 = nxt ? nxt[i].pct - g.pct : 0;
        const el = UI.meter({ ...g, pct: Math.min(1, g.pct), delta: Math.abs(d2) > 0.004 ? d2 : 0 }, { w: 50, lim: lim[g.k] });
        if (el.dataset) el.dataset.stat = g.k;   // 车间教程按这个指着讲（js/tutorial.js）
        return UI.tip(el, () => [h('div', { class: 'tp-nm' }, g.name, ' ', h('span', { class: 'tp-val' }, g.val)),
          h('div', { class: 'tp-ks' }, g.note.split(' · ').map(t => h('div', {}, t))),
          h('div', { class: 'tp-note' }, ABOUT[g.k])]);
      }),
      preview ? h('div', { class: 'px-small' }, SA.Config.text("ui_aceac13c2467")) : null,
      s.problems.map(p => h('div', { class: 'px-hand px-prob' }, p)),
      s.warnings.map(w => h('div', { class: 'px-small px-warn' }, w)));
  }

  // ---------- 属性条 ----------
  function statBars(s, v) {
    const pmax = Math.max(s.supply, s.demand, 1);
    const wmax = Math.max(s.load, s.weight, 1);
    const pct = (x, m) => `${Math.max(0, Math.min(100, (x / m) * 100))}%`;
    const oh = s.overheat === Infinity ? SA.Config.text("ui_e7c64cf199f7") : SA.Config.text("ui_43b4be7f8c73", `${Math.round(s.overheat)}`);
    const heatShare = Math.min(1, (s.heatGen + SA.K.IDLE_HEAT) / Math.max(0.1, SA.K.DISSIPATE + s.cool + (s.dryCool || 0)));
    // 省水：同样的水按耗水倍率折算成"等效水量"，水条后面用斜纹接上多出来的那一截
    const effWater = s.waterSave < 1 ? s.water / s.waterSave : s.water, wScale = Math.max(250, effWater);
    // 全车最大穿深 / 最厚装甲（v 可选：给了才算；穿深对照表在选中武器时的清单里）
    let pen = 0, thick = 0;
    if (v) SA.V.each(v, (cell) => { if (cell.hp <= 0) return; const m = SA.mod(cell); if (m.penetration < 99) pen = Math.max(pen, m.penetration || 0); thick = Math.max(thick, m.armor || 0); });
    return h('div', { class: 'bars' },
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("editor_c9f16bb1e9d3")),
        h('div', { class: 'bar power' }, h('i', { style: `width:${pct(s.demand, pmax)}` }),
          h('span', { class: 'mark', style: `left:${pct(s.supply, pmax)}`, title: SA.Config.text("ui_837baeae286f") }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_78d2b317ecf0", `${SA.Phys.fmtKw(s.demand)}`, `${SA.Phys.fmtKw(s.equip)}`, `${SA.Phys.fmtKw(s.drive)}`, `${SA.Phys.fmtPower(s.supply)}`, `${SA.Phys.fmtKw(s.supply)}`),
        s.store ? h('span', { class: SA.Config.text("ui_a29e2c245294") }, SA.Config.text("ui_25c6ce346308", `${SA.Phys.fmtHeat(s.store)}`, `${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}`)) : null),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("ui_5081ead9bbce")),
        h('div', { class: `bar weight ${s.weight > s.load ? 'over' : ''}` }, h('i', { style: `width:${pct(s.weight, wmax)}` }),
          h('span', { class: 'cap', style: `left:calc(${pct(s.load, wmax)} - 2px)`, title: SA.Config.text("ui_ef556a1de8c2") }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_8abf9c618f0b", `${SA.tons(s.weight)}`, `${SA.tons(s.dryWeight)}`, `${SA.tons(s.load)}`, `${SA.ramMul(s.weight).toFixed(2)}`)),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("arena_0e14d148b46b")),
        h('div', { class: 'bar speed' }, h('i', { style: `width:${pct(s.topSpeed, 100)}` }),
          h('span', { class: 'mark', style: `left:${pct(s.speed, 100)}`, title: SA.Config.text("ui_efde08aac68b") }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_65abfa74630c", `${SA.kmh(s.topSpeed)}`, `${SA.kmh(s.speed)}`, `${Math.round((s.speedMul || 0) * 100)}`, `${Math.round(SA.K.SPEED_BOOST * 100)}`, `${(s.brake || 0).toFixed(2)}`, `${(s.sway || 0).toFixed(2)}`)),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("ui_04ea5112801b")),
        h('div', { class: 'bar aim' }, h('i', { style: `width:${pct(s.aimShrink, SA.K.AIM_SHRINK_MAX)}` }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_3b5463a80b95", `${Math.round(s.aimShrink * 100)}`, `${s.aimSpeed.toFixed(2)}`, `${(SA.MODULES.cannon.aimT / s.aimSpeed).toFixed(1)}`)),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("ui_941ba5f9ea73")),
        h('div', { class: 'bar heat' }, h('i', { style: `width:${pct(heatShare, 1)}` }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_8081499a3def", `${s.heatCapacity.toFixed(1)}`, `${SA.Phys.fmtKw(s.heatGen + SA.K.IDLE_HEAT)}`, `${SA.Phys.fmtKw(s.cool)}`),
        s.dryCool ? h('span', { class: SA.Config.text("ui_08b2f31aa1ca") }, SA.Config.text("ui_b8e0c575c812", `${SA.Phys.fmtKw(s.dryCool)}`)) : null, ` · ${oh}`),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("battle_327b54d04f71")),
        h('div', { class: 'bar water' }, h('i', { style: `width:${pct(s.water, wScale)}` }),
          effWater > s.water ? h('b', { class: 'eff', style: `left:${pct(s.water, wScale)};width:${pct(effWater - s.water, wScale)}`, title: SA.Config.text("ui_9dc2ccc6ba98") }) : null)),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_625ee25f58d5", `${s.tanks}`, `${SA.Phys.fmtWater(s.water)}`),
        s.waterSave < 1 ? h('span', { class: SA.Config.text("ui_72db466848ad") }, SA.Config.text("ui_971b4ea550ce", `${f1(s.waterSave)}`, `${SA.Phys.fmtWater(effWater)}`)) : null),
      h('div', { class: 'bar-row' }, h('span', { class: 'name' }, SA.Config.text("editor_5ad0c596f2dc")),
        h('div', { class: 'bar hp' }, h('i', { style: `width:${pct(s.hp, Math.max(s.maxHp, 1))}` }))),
      h('div', { class: 'bar-note' }, SA.Config.text("ui_0b18f5d932b8", `${s.hp}`, `${s.maxHp}`, `${s.dps.toFixed(1)}`, `${s.rating}`),
        pen ? SA.Config.text("ui_07808fb055a4", `${f1(pen)}`) : '', thick ? SA.Config.text("ui_b00550fdd016", `${f1(thick)}`) : '',
        s.tether ? h('span', { class: SA.Config.text("ui_ce25ea0e33e7") }, SA.Config.text("ui_f2871d82062d")) : null),
      s.problems.map(p => h('div', { class: 'warn bad' }, p)),
      s.warnings.map(w => h('div', { class: 'warn' }, w)),
    );
  }

  function statLine(id, mt = 1) {
    const m = SA.mod(id, mt);
    const parts = [SA.Config.text("editor_ae508f51291d", `${m.hp}`)];
    if (m.armor) parts.push(SA.Config.text("ui_b9e763ad20da", `${f1(m.armor)}`));
    if (m.power) parts.push(SA.Config.text("editor_7e866effc5db", `${SA.Phys.fmtKw(m.power)}`));
    if (m.supply) parts.push(SA.Config.text("ui_e00fabb109dd", `${SA.Phys.fmtPower(m.supply)}`, `${SA.Phys.fmtKw(m.supply)}`), SA.Config.text("ui_5b7c85e16107", `${SA.Phys.fmtKw(m.heatRate)}`));
    if (m.load) parts.push(SA.Config.text("editor_ecdf2eb87dc1", `${SA.tons(m.load)}`), SA.Config.text("ui_fdd2cea6a21d", `${SA.kmh(m.speed)}`), SA.Config.text("ui_ccbdfb7e3fae", `${m.accel}`), SA.Config.text("ui_9285d5f1bd99", `${m.brake}`), SA.Config.text("ui_2a5c23686ee1", `${m.sway}`));
    parts.push(SA.Config.text("ui_db0892bbc48e", `${SA.tons(SA.weightOf({ id }))}`));
    if (m.dmg) parts.push(SA.Config.text("editor_0effa98e724c", `${m.dmg}`), SA.Config.text("editor_4c4721f23bca", `${m.reload}`), m.indirect ? (m.spread ? SA.Config.text("ui_62edfc3b1a32", `${m.spread}`, `${m.elev[0]}`, `${m.elev[1]}`) : SA.Config.text("ui_76ec43f019a0")) : SA.Config.text("ui_456e52ca73eb", `${m.spread}`, `${m.elev[0]}`, `${m.elev[1]}`), m.heatPerSec ? SA.Config.text("editor_9795e140f483", `${SA.Phys.fmtKw(m.heat)}`) : SA.Config.text("ui_cfa8e0a5b2cf", `${SA.Phys.fmtHeat(m.heat)}`));
    if (m.penetration) parts.push(m.penetration >= 99 ? SA.Config.text("editor_d06576d004d2") : SA.Config.text("ui_25b82177bb7f", `${m.penetration}`, `${m.ricochet ? SA.Config.text("ui_4079b6a3cda8", `${Math.round(m.ricochet * 100)}`) : ''}`));
    if (m.tether) parts.push(SA.Config.text("ui_ae38d4203b57", `${m.tether}`));
    if (m.store) parts.push(SA.Config.text("editor_397947920edb", `${SA.Phys.fmtHeat(m.store)}`));
    if (m.dryCool) parts.push(SA.Config.text("editor_6fd4db5f7540", `${SA.Phys.fmtKw(m.dryCool)}`));
    if (m.waterSave) parts.push(SA.Config.text("ui_6553898b4a04", `${m.waterSave}`));
    if (m.ram) parts.push(SA.Config.text("ui_3e2b0d3da52f", `${m.ram}`));
    if (m.punch) parts.push(SA.Config.text("ui_82bcb5384a65", `${m.punch}`, `${m.punchCd}`));
    if (m.water) parts.push(SA.Config.text("editor_c7661f3af3be", `${SA.Phys.fmtKw(m.cool)}`), SA.Config.text("editor_985f298991a8", `${SA.Phys.fmtWater(m.water)}`));
    else if (m.cool) parts.push(SA.Config.text("editor_c7661f3af3be", `${SA.Phys.fmtKw(m.cool)}`));
    if (m.evade) parts.push(SA.Config.text("ui_a7337f7d8462", `${Math.round(m.evade * 100)}`));
    if (m.acc && !m.dmg) parts.push(SA.Config.text("ui_4abc54d1f61c", `${Math.round(m.acc * 100)}`));
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
    openModal(SA.Config.text("ui_4569315e5df3"), [
      h('p', { class: 'muted', style: 'margin-top:0' }, SA.Config.text("ui_cf02cbe7b2dc", `${money(SA.S.LOAN_CAP)}`, `${SA.RULES.economy.interestRate * 100}%`)),
      h('div', { class: 'bank' },
        h('div', {}, h('span', { class: 'k' }, SA.Config.text("home_4cd1c821039a")), h('b', { class: 'gold' }, money(d.money))),
        h('div', {}, h('span', { class: 'k' }, SA.Config.text("ui_095b45ce7df5")), h('b', { style: 'color:var(--fire2)' }, money(d.debt)))),
      h('div', { class: 'dialog-actions', style: 'padding:12px 0 0;justify-content:flex-start' },
        act(SA.Config.text("ui_23969a7b639a"), SA.S.loanRoom() >= SA.RULES.economy.quickBorrow, () => SA.S.borrow(SA.RULES.economy.quickBorrow), true),
        act(SA.Config.text("ui_669f79bba87e"), d.debt && d.money >= Math.min(SA.RULES.economy.quickRepay, d.debt), () => SA.S.repay(SA.RULES.economy.quickRepay)),
        act(SA.Config.text("ui_638c36a19cbe"), d.debt && d.money >= d.debt, () => SA.S.repay(d.debt))),
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
    const { lines, pre: pending, money0, repairFree } = SA.S.settleBattle(res);
    const pre = pending.map(p => p.kind === 'salvage'
      ? (next) => SA.Camp.salvageDialog(p.survivors, next)
      : (next) => SA.Camp.unlockDialog(p.unlock, next));
    // K7 重打沿用战役 / 支线的战斗入口，但完全按友谊赛处理：不写战损，不推进进度，不发钱、声望或缴获。
    if (res.replay) {
      SA.nav('arena', null, true);
      dialog(res.draw ? SA.Config.text("ui_ca6350e432ac") : res.win ? SA.Config.text("ui_8c5653c2e9ca") : SA.Config.text("ui_7841c5ca8f04"), [
        h('p', { style: 'font-size:16px;margin-top:0' }, h('b', {}, res.reason)),
        h('p', { class: 'muted' }, SA.Config.text("ui_0cf010dd881d", `${Math.round(res.dealt)}`, `${Math.round(res.taken)}`, `${Math.round(res.time)}`)),
        h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' }, SA.Config.text("ui_5d0f059166f2")),
        repairFree ? h('div', { class: 'warn repair-free-note', style: 'border-left-color:var(--brass2)' }, SA.Config.text('ui_repair_free_done')) : null,
        feedbackRow(res.humanId),
      ], [], SA.Config.text("ui_7c9691192f1b"), () => { refresh(); inserted(() => SA.Camp.introIfNew()); });
      return;
    }
    SA.nav('arena', null, true);
    // 受损就直接给出修理入口，不让玩家自己找
    const summary = () => {
      const hurt = [];
      SA.V.each(d.vehicle, (cell) => { if (cell.hp < SA.V.maxHp(cell)) hurt.push(cell); });
      // 旧胜利免修仍由按钮完成；全结果免修已在规则结算时自动写入存档。
      const freeRepair = !repairFree && res.mode === 'campaign' && res.win && !res.draw && res.opts?.victoryRepairFree === true;
      const cost = freeRepair ? 0 : hurt.reduce((a, c) => a + SA.S.repairCost(c), 0);
      const fixAll = () => { SA.S.repairCells(hurt); toast(freeRepair ? SA.Config.text("ui_54a224778a07", `${hurt.length}`) : SA.Config.text("ui_6da34172caea", `${hurt.length}`, `${money(cost)}`)); };
      // 第一场赢下、车间刚开：弹窗和剧情演完直接带去车间（js/tutorial.js）
      const after = () => { refresh(); story(() => { SA.Camp.introIfNew(); if (SA.Guide) SA.Guide.afterBattle(); }); };
      const gain = d.money - money0, net = gain - cost;
      dialog(res.draw ? SA.Config.text("ui_53829b1ffb0b") : res.win ? SA.Config.text("ui_c328cf26a3fd") : SA.Config.text("ui_bd5cdcb6f4f6"), [
        h('p', { style: 'font-size:16px;margin-top:0' }, h('b', {}, res.reason)),
        h('p', { class: 'muted' }, SA.Config.text("ui_0cf010dd881d", `${Math.round(res.dealt)}`, `${Math.round(res.taken)}`, `${Math.round(res.time)}`)),
        lines.map(l => h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' }, l)),
        repairFree ? h('div', { class: 'warn repair-free-note', style: 'border-left-color:var(--brass2)' }, SA.Config.text('ui_repair_free_done')) : null,
        !repairFree && hurt.length ? h('div', { class: 'rp-sum' },
          h('div', { class: 'rp-head' }, h('b', {}, SA.Config.text("ui_2837356f3ad9", `${freeRepair ? SA.Config.text("ui_b41b7071ad0a") : SA.Config.text("ui_18a30ed66d7a")}`, `${hurt.length}`)), h('span', { class: 'muted' }, freeRepair ? SA.Config.text("ui_19790ec76561") : SA.Config.text("ui_99d1acadca51"))),
          repairList(hurt, 5, freeRepair),
          gain > 0 || freeRepair ? h('div', { class: `rp-net ${net < 0 ? 'bad' : ''}` },
            SA.Config.text("ui_a491f0181535", `${money(gain)}`, `${freeRepair ? SA.Config.text("ui_649a0fc7237e") : money(cost)}`), h('b', {}, `${net < 0 ? SA.Config.text("ui_1ccb728430fa") : SA.Config.text("ui_75fb0e9d94fa")} ${money(Math.abs(net))}`)) : null) : null,
        feedbackRow(res.humanId),
      ], [
        !repairFree && hurt.length ? { label: freeRepair ? SA.Config.text("ui_cf2f1a6510a9") : SA.Config.text("arena_218d949df8a3", `${money(cost)}`), primary: true, onClick: () => freeRepair ? (fixAll(), after()) : pay({ title: SA.Config.text("arena_a0b0db2e55b8"), amount: cost, okLabel: SA.Config.text("arena_a0b0db2e55b8"), confirm: false, onPaid: () => { fixAll(); after(); } }) } : null,
        !repairFree && hurt.length && SA.Camp.has('garage') ? { label: SA.Config.text("ui_b9b89cadaed4"), onClick: () => { SA.nav('garage'); story(() => {}); } } : null,
      ].filter(Boolean), !repairFree && hurt.length ? SA.Config.text("ui_99845832ed7f") : SA.Config.text("ui_7c9691192f1b"), after);
    };
    const run = (i) => (i < pre.length ? pre[i](() => run(i + 1)) : summary());
    run(0);
  }

  // ---------- 修理费呈现（W2，docs/campaign-direction.md §5）----------
  // 修理费比例（SA.repairRate，astra 定）分四档给玩家看：越精密越贵。"修满" = 这一件（含材料和改装）从报废修到满耐久的钱
  const RP_LABELS = [SA.Config.text("ui_303a288691f8"), SA.Config.text("ui_91e25f4ddc6f"), SA.Config.text("ui_1f13c5c40e9e"), SA.Config.text("ui_a1d6ce790593")];
  const RP_TIERS = [...SA.RULES.economy.repairTierLimits, Infinity].map((limit, i) => [limit, RP_LABELS[i]]);
  function repairTier(id) {
    const rate = SA.repairRate(id), i = RP_TIERS.findIndex(([x]) => rate <= x + 1e-9);
    return { n: i + 1, name: RP_TIERS[i][1], rate };
  }
  const repairFull = (cell) => Math.max(1, Math.ceil(SA.cellValue(cell) * SA.repairRate(cell.id)));
  // 四格小扳手刻度：亮几格 = 第几档
  function repairPips(id, label) {
    const t = repairTier(id);
    return h('span', { class: `rp rp-${t.n}`, title: SA.Config.text("ui_3008085a1b75", `${t.name}`, `${Math.round(t.rate * 100)}`) },
      label ? h('em', {}, label) : null, h('i'), h('i'), h('i'), h('i'));
  }
  function repairChip(cell) {
    const t = repairTier(cell.id);
    return h('span', { class: `chip rp-chip rp-${t.n}`, title: SA.Config.text("ui_2a06cb87199b", `${t.name}`, `${money(SA.cellValue(cell))}`, `${Math.round(t.rate * 100)}`) },
      SA.Config.text("ui_93a9d219e6a7", `${money(repairFull(cell))}`, `${t.name}`));
  }
  // 修理清单：按花费从高到低，最贵的几件单独列出，条的长短 = 占总修理费的比例
  function repairList(cells, top = 5, free = false) {
    const rows = cells.map(c => ({ c, cost: SA.S.repairCost(c) })).filter(r => r.cost > 0).sort((a, b) => b.cost - a.cost);
    const total = rows.reduce((a, r) => a + r.cost, 0), rest = rows.slice(top);
    const row = ({ c, cost }) => {
      const max = SA.V.maxHp(c), lost = c.hp <= 0 ? SA.Config.text("ui_d392529f3b02") : SA.Config.text("ui_24612fe74a25", `${Math.round((1 - c.hp / max) * 100)}`), t = repairTier(c.id);
      const pic = SA.SPR.moduleCanvas(c.id, 0.5, c.mt); pic.classList.add('px');
      return h('div', { class: `rp-row rp-${t.n}`, style: `--f:${(cost / Math.max(1, total) * 100).toFixed(1)}%` },
        h('span', { class: 'pic' }, pic), h('span', { class: 'nm' }, SA.MODULES[c.id].name, ' ', SA.Camp.matChip(c.mt || 1)),
        h('span', { class: `lost ${c.hp <= 0 ? 'dead' : ''}` }, lost), repairPips(c.id), h('b', {}, free ? SA.Config.text("ui_649a0fc7237e") : money(cost)));
    };
    return h('div', { class: 'rp-list' }, rows.slice(0, top).map(row),
      rest.length ? h('div', { class: 'rp-row more' }, h('span', { class: 'nm' }, SA.Config.text("ui_327b3c268175", `${rest.length}`)), h('b', {}, free ? SA.Config.text("ui_649a0fc7237e") : money(rest.reduce((a, r) => a + r.cost, 0)))) : null,
      rows.length > 1 ? h('div', { class: 'rp-row total' }, h('span', { class: 'nm' }, SA.Config.text("ui_e009c148d189")), h('b', {}, free ? SA.Config.text("ui_649a0fc7237e") : money(total))) : null);
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
    return h('td', { class: `pen pen-${k}`, title: ch <= 0 ? SA.Config.text("ui_a95b5b403044") : SA.Config.text("ui_a666a150add1", `${Math.round(ch * 100)}`) },
      ch <= 0 ? SA.Config.text("ui_9fdbcf447095") : `${Math.round(ch * 100)}%`);
  }
  // 穿深对照表：武器 → 各种装甲 × 各级材料；装甲 → 常见武器 × 这块装甲的各级材料
  function penTable(id, maxMt = SA.MAT_MAX) {
    const m = SA.MODULES[id], mats = SA.MATS.slice(1, Math.max(1, maxMt) + 1);
    const head = h('tr', {}, h('th', {}, ''), mats.map((mt) => h('th', { title: mt.rank ? `${mt.rank} · ${mt.name}` : mt.name }, h('i', { class: 'mat-dot', style: `background:${mt.chip}` }), mt.name)));
    if (m.dmg) {
      if (!m.penetration || m.penetration >= 99) return h('div', { class: 'pen-note' }, SA.Config.text("ui_c5dbdcb6aef6"));
      return h('div', { class: 'pen-wrap' },
        h('div', { class: 'pen-cap' }, SA.Config.text("ui_da9309ffd798", `${m.penetration}`, `${m.ricochet ? SA.Config.text("ui_b7d5880e54ca", `${Math.round(m.ricochet * 100)}`) : ''}`)),
        h('table', { class: 'pen-tab' }, head, ARMOR_REF.map(a => h('tr', {}, h('th', {}, SA.MODULES[a].name),
          mats.map((mt, i) => bounceCell(bounce(SA.mod(a, i + 1).armor, m)))))));
    }
    if (m.armor) {
      return h('div', { class: 'pen-wrap' },
        h('div', { class: 'pen-cap' }, SA.Config.text("ui_3945240b5d26", `${mats.map((mt, i) => f1(SA.mod(id, i + 1).armor)).join(' / ')}`)),
        h('table', { class: 'pen-tab' }, head, PEN_REF.map(w => h('tr', {}, h('th', {}, `${SA.MODULES[w].name} ${SA.MODULES[w].penetration}`),
          mats.map((mt, i) => bounceCell(bounce(SA.mod(id, i + 1).armor, SA.MODULES[w])))))));
    }
    return null;
  }
  // 把一件模块临时放进车的空位，算出装上前后的整车属性（只用来预览，不管摆放规则）
  const secs = (t) => (t === Infinity ? SA.Config.text("ui_d2e2fca06f76") : SA.Config.text("ui_2120a43f4ebd", `${Math.round(t)}`));
  // 新属性模块的说明 + 装上后的变化（车间右侧选中行展开）
  function newAttrInfo(id, mt, v) {
    const m = SA.mod(id, mt), out = [];
    if (m.store) out.push([SA.Config.text("ui_017f1d8e6c7b"), SA.Config.text("ui_ad45cf325b05", `${SA.Phys.fmtHeat(m.store)}`, `${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}`)]);
    if (m.waterSave) out.push([SA.Config.text("ui_78401a6c4264"), SA.Config.text("ui_cb6f445d1eda", `${m.waterSave}`, `${SA.K.WATER_SAVE_MIN}`)]);
    if (m.dryCool) out.push([SA.Config.text("ui_6154cf8de0a5"), SA.Config.text("ui_7c55c2e5ac59", `${SA.Phys.fmtKw(m.dryCool)}`)]);
    if (m.tether) out.push([SA.Config.text("editor_c83dfc2b7d1f"), SA.Config.text("ui_235a3c43442d", `${m.tether}`, `${Math.round(SA.K.RAM_SELF * 100)}`, `${Math.round(SA.K.RAM_TETHER_SELF * 100)}`)]);
    if (!out.length) return null;
    const a = v && SA.V.stats(v), b = v && SA.V.statsWith(v, id, mt);
    const diff = [];
    if (a && b) {
      if ((m.store || m.waterSave || m.dryCool) && a.overheat !== b.overheat) diff.push(SA.Config.text("ui_5ad9feecc59e", `${secs(a.overheat)}`, `${secs(b.overheat)}`));
      if (m.store) diff.push(SA.Config.text("ui_d95999a4b86c", `${SA.Phys.fmtHeat(a.store)}`, `${SA.Phys.fmtHeat(b.store)}`));
      if (m.waterSave) diff.push(SA.Config.text("ui_ae4b48a0af31", `${f1(a.waterSave)}`, `${f1(b.waterSave)}`));
      if (m.dryCool) diff.push(SA.Config.text("ui_3bb44f1f99f9", `${SA.Phys.fmtKw(a.dryCool)}`, `${SA.Phys.fmtKw(b.dryCool)}`));
      diff.push(SA.Config.text("ui_5160c44c2fd9", `${a.rating}`, `${b.rating}`), SA.Config.text("ui_df8e9f5e17c8", `${SA.tons(a.weight)}`, `${SA.tons(b.weight)}`));
    }
    return h('div', { class: 'na-wrap' },
      out.map(([k, t]) => h('div', { class: 'na-row' }, h('b', { class: `na-tag na-${k}` }, k), h('span', {}, t))),
      diff.length ? h('div', { class: 'na-diff' }, h('span', { class: 'muted' }, SA.Config.text("ui_35b82e4563ef")), diff.map(x => h('span', {}, x))) : null);
  }

  // ---------- 唯一件（K5）：金色星标徽章。规则只看 SA.isUnique / SA.uniqueRule，不在界面里写死哪几件 ----------
  function uniqueBadge(id, opts = {}) {
    if (!SA.isUnique(id)) return null;
    const r = SA.uniqueRule(id), mt = r && r.mt ? SA.MATS[r.mt] : null;
    return h('span', { class: `chip uniq ${opts.big ? 'big' : ''}`, title: SA.Config.text("ui_35dcb25b8be7", `${mt ? SA.Config.text("ui_a05866272c7b", `${mt.name}`) : ''}`, `${r && r.once ? SA.Config.text("ui_d631e71b71f0") : ''}`) }, SA.Config.text("camp_ui_b98b7fd2b55b"));
  }

  // ---------- 战后一键评价（docs/evolve-plan.md §11，数据由 SA.HUMAN_BATTLES 记录）----------
  // 三个按钮，点一下就记下，可以改选；记录失败（隐私模式等）就不显示
  const FEEL = [[SA.Config.text("battle_21c3183d825b"), 'fun'], [SA.Config.text("battle_43932aa17701"), 'dull'], [SA.Config.text("battle_c42008a148a6"), 'unfair']];
  function feedbackRow(id) {
    if (!id || !SA.HUMAN_BATTLES || !SA.HUMAN_BATTLES.feedback) return null;
    const row = h('div', { class: 'feel' }, h('span', { class: 'muted' }, SA.Config.text("ui_1932c5f37881")));
    const btns = FEEL.map(([v, k]) => h('button', { class: `btn small feel-${k}`, onclick: () => {
      if (!SA.HUMAN_BATTLES.feedback(id, v)) { toast(SA.Config.text("ui_5ff91251386d")); return; }
      for (const b of btns) b.classList.toggle('on', b === btns[FEEL.findIndex(x => x[0] === v)]);
      row.querySelector('.feel-thanks').textContent = SA.Config.text("ui_8f045d788c02");
    } }, v));
    row.append(...btns, h('span', { class: 'feel-thanks muted' }));
    return row;
  }

  return { toast, openModal, closeModal, dialog, pay, topbar, settings, pxStats, refresh, openBank, statBars, statLine, vehiclePreview, afterBattle, money,
    repairTier, repairFull, repairPips, repairChip, repairList, repairBrief, penTable, newAttrInfo, statsWith: SA.V.statsWith, uniqueBadge, feedbackRow };
})();
