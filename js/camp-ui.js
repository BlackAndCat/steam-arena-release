// 战役界面：缴获与解锁弹窗、章节介绍、开发者面板、试驾场。
// 视觉与交互原样从 camp.js 搬移；战役规则通过 SA.Camp 调用。
window.SA = window.SA || {};

SA.CampUI = (() => {
  const h = SA.h, M = SA.MODULES;
  const d = () => SA.S.d;
  const { salvageOptions, unlockLines, chIndex, stage, dev } = SA.Camp;

  function salvageDialog(survivors, next) {
    const opts = salvageOptions(survivors);
    if (!opts.length) { next(); return; }
    const name = (x) => (x.mt > 1 ? `${SA.MATS[x.mt].name}${M[x.id].name}` : M[x.id].name);
    SA.UI.dialog(SA.Config.text("camp_ui_5cbdfd1def9d"), [
      h('p', { style: 'margin-top:0' }, SA.Config.text("camp_ui_18e94f859d05")),
      // 唯一件单独一张金边卡片排在最前：只能在这里拿到，而且每个存档只有一次
      h('div', { class: 'salvage' }, opts.slice().sort((a, b) => !!b.unique - !!a.unique).map(x => h('div', { class: `dlg-item ${x.unique ? 'uniq-card' : ''}` }, SA.SPR.moduleCanvas(x.id, 1, x.mt),
        h('div', {}, x.unique ? h('span', { class: 'chip uniq big' }, SA.Config.text("camp_ui_b98b7fd2b55b")) : null, x.unique ? ' ' : null, h('b', {}, name(x)), ' ', matChip(x.mt),
          h('div', { class: 'muted' }, SA.UI.statLine(x.id, x.mt)),
          x.unique ? h('div', { class: 'uniq-note' }, SA.Config.text("camp_ui_a42c41f45f38")) : null)))),
    ],opts.map(x => ({ label: SA.Config.text("camp_ui_88cd706e4c17", `${x.unique ? '★ ' : ''}`, `${name(x)}`), primary: x.mt >= 5 || !!x.unique, onClick: () => {
      if (!SA.Camp.claimSalvage(x)) { SA.UI.toast(SA.Config.text("camp_ui_b4532df81ba6", `${name(x)}`)); next(); return; }
      SA.UI.toast(SA.Config.text("camp_ui_758a9a07c654", `${name(x)}`));
      next();
    } })), false, next);
  }

  // u.lines：额外的整句（比如支线开放），和解锁清单排在一起
  function unlockDialog({ title, u }, next) {
    const lines = [...unlockLines(u), ...(u.lines || [])];
    if (!lines.length && !u.note) { next(); return; }
    SA.UI.dialog(title, [
      u.note ? h('p', { style: 'margin-top:0' }, u.note) : null,
      h('div', { class: 'unlocks' }, lines.map(l => h('div', { class: 'warn', style: 'border-left-color:var(--gauge2)' }, l))),
    ], [{ label: SA.Config.text("camp_ui_f867f3417859"), primary: true, onClick: next }], false, next);
  }

  // 章节开场：进入出战页时，新章节先弹一次介绍
  function introIfNew() {
    const ch = SA.Camp.takeIntro();
    if (!ch) return false;
    SA.UI.dialog(ch.name, [
      h('p', { style: 'margin-top:0' }, ch.blurb),
      h('div', { class: 'unlocks' }, ch.stages.map((s, i) => s.unfinished ? null : h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' },
        h('b', {}, SA.Config.text("camp_ui_0f586f7648f7", `${i + 1}`, `${s.name}`)), s.boss ? ' 【Boss】' : '', h('span', { class: 'muted' }, ` · ${s.pilot}`)))),
      h('p', { class: 'muted' }, SA.Config.text("camp_ui_d4b04a2fc66d")),
    ], [{ label: SA.Config.text("camp_ui_efdc22fca1c6"), primary: true, onClick: () => {} }], false);
    return true;
  }

  const matChip = (mt) => h('span', { class: 'chip mat', style: `--mat:${SA.MATS[mt].chip}` }, SA.MATS[mt].rank ? `${SA.MATS[mt].rank} · ${SA.MATS[mt].name}` : SA.MATS[mt].name);

  // ---------- 调试（控制台）----------
  // SA.dev.goto(3)：直接跳到第 3 章开头（前面各章的解锁全部发放）；SA.dev.unlockAll()：全部解锁；SA.dev.money(n)
  // 开发者面板：侧边栏底部的「开发者」按钮。上面是开发工具（新标签页打开），下面是存档调试
  // 新做的工具页 / 预览页加到 DEV_TOOLS 里就会出现在面板上；视觉样机不单独加，登记到 tools/labs.js（视觉样机馆）
  const DEV_TOOLS = [
    { url: 'tools/console.html', name: SA.Config.text("camp_ui_539b6bdddbc8"), desc: SA.Config.text("camp_ui_47cf65196c5f") },
    { url: 'tools/sim.html', name: SA.Config.text("camp_ui_97d149dcb1be"), desc: SA.Config.text("camp_ui_6cfad2f5dc0c") },
    { url: 'tools/evolve.html', name: SA.Config.text("camp_ui_82481210220a"), desc: SA.Config.text("camp_ui_0a4e01b272bd") },
    { url: 'tools/module-editor.html', name: SA.Config.text("camp_ui_fb225353439f"), desc: SA.Config.text("camp_ui_b3c7072a567e") },
    { url: () => `tools/yard-chat-editor.html?scope=${encodeURIComponent(SA.YardChat.currentScope())}`, name: SA.Config.text("camp_ui_bab1744a894a"), desc: SA.Config.text("camp_ui_d33460ac22da") },
    { url: 'tools/module-candidates.html', name: SA.Config.text("camp_ui_31ed0912659c"), desc: SA.Config.text("camp_ui_c7fbdda8d1f8") },
    { url: 'tools/current.html', name: SA.Config.text("camp_ui_68916e754d56"), desc: SA.Config.text("camp_ui_8858a6eb422d") },
    { url: 'tools/lab.html', name: SA.Config.text("camp_ui_39cef72c84db"), desc: SA.Config.text("camp_ui_8c8dd8911276") },
  ];
  function devPanel() {
    const act = (label, fn, primary) => h('button', { class: `btn ${primary ? 'primary' : ''}`, onclick: () => { SA.UI.closeModal(); fn(); SA.UI.toast(label); } }, label);
    const sel = h('select', {}, SA.CAMPAIGN.map((ch, i) => h('option', { value: i, selected: i === chIndex() }, ch.name)));
    const row = (...kids) => h('div', { class: 'dialog-actions dev-row' }, kids);
    SA.UI.openModal(SA.Config.text("camp_ui_cf048cf5e66b"), h('div', { class: 'dev-panel' },
      h('h3', { class: 'help-h' }, SA.Config.text("camp_ui_ec2ca169eb2b")),
      h('div', { class: 'dev-tools' }, DEV_TOOLS.map(t => h('a', { class: 'dev-tool', href: typeof t.url === 'function' ? t.url() : t.url, target: '_blank', rel: 'noopener' },
        h('b', {}, t.name, h('span', { class: 'ext' }, ' ↗')), h('span', { class: 'muted' }, t.desc)))),
      h('h3', { class: 'help-h' }, SA.Config.text("camp_ui_c37040ee49f6")),
      row(act(SA.Config.text("camp_ui_b9da081735b5"), () => { dev.unlockAll(); dev.money(10000); dev.ingots(5); }, true),
        act('+£1000', () => dev.money(1000)),
        act(SA.Config.text("camp_ui_0ddfa306526a"), () => dev.ingots(3))),
      row(sel, act(SA.Config.text("camp_ui_2c3de48a2313"), () => dev.goto(+sel.value)), act(SA.Config.text("camp_ui_06a422a6b529"), () => SA.reset())),
      row(h('button', { class: 'btn', onclick: () => SA.UI.dialog(SA.Config.text("camp_ui_3634dd543577"), [
        h('p', { style: 'margin-top:0' }, SA.Config.text("camp_ui_66ff8d11b836")),
        h('p', { class: 'muted' }, SA.Config.text("camp_ui_9ca4f4cf8cc3")),
      ], [{ label: SA.Config.text("camp_ui_7bb4853e68bf"), primary: true, onClick: () => { SA.dev.resetVehicle(); SA.UI.refresh(); SA.UI.toast(SA.Config.text("camp_ui_1f40b649e19f")); } }]) }, SA.Config.text("camp_ui_3634dd543577")),
      h('span', { class: 'muted' }, SA.Config.text("camp_ui_fc390fa4f462"))),
      SA.StoryDev ? h('h3', { class: 'help-h' }, SA.Config.text("camp_ui_bcb19f0a0cb3")) : null,
      SA.StoryDev && row(h('button', { class: 'btn primary', onclick: () => { SA.UI.closeModal(); SA.StoryDev.browser(); } }, SA.Config.text("camp_ui_e1a951389c80")),
        h('label', { class: 'dev-check' }, h('input', { type: 'checkbox', checked: SA.StoryDev.enabled(), onchange: (e) => SA.StoryDev.setEnabled(e.target.checked) }), SA.Config.text("camp_ui_521ea8b0bbb7"))) || null,
      h('h3', { class: 'help-h' }, SA.Config.text("camp_ui_f95dcccbb04f")),
      row(h('button', { class: 'btn primary', onclick: sandbox }, SA.Config.text("camp_ui_ab9a20e4e946")), h('span', { class: 'muted' }, SA.Config.text("camp_ui_e0759ef96ec8")))));
  }

  // ---------- 试驾场：任选场地和对手 ----------
  // 对手来源：战役各关 / 终局锦标赛 / 官方蓝图 / 我的蓝图 / 分享码示例 / 随机街头车；可以改材料、AI 性格、枪法。
  const SB = { src: 'camp', foe: '1,0', terrain: '', mt: 0, style: '', aim: '', scene: '', bounds: '' };   // 记住上一次的选择
  const SRC = [['camp', SA.Config.text("camp_ui_aef74652a522")], ['tour', SA.Config.text("camp_ui_481666d112b2")], ['bp', SA.Config.text("camp_ui_09cf3953e6fb")], ['mine', SA.Config.text("camp_ui_77209467c816")], ['cloud', SA.Config.text("camp_ui_564d439aeaf1")], ['evolve', SA.Config.text("camp_ui_82481210220a")], ['street', SA.Config.text("camp_ui_61da76cd5798")]];
  // 试驾选择框在打开时读取战斗规则目录；空值沿用对手性格，roam 仍表示默认游走。
  const STYLES = () => [['', SA.Config.text("camp_ui_2c2210ed86d7")], ['roam', SA.Config.text("camp_ui_ddb2fe50fb4b")],
    ...SA.AI_STYLES.filter(item => item.id !== 'wander').map(item => [item.id, `${item.name} · ${['初级', '中级', '高级'][item.tier - 1]}${item.training ? ' · 教学' : ''}`])];
  // 某个来源的对手列表：{ key, name, make() → { v, aim, style, terrain, boss } }
  function foeList(src) {
    if (src === 'camp') return SA.CAMPAIGN.flatMap((ch, ci) => ch.stages.flatMap((o, si) => o.unfinished ? [] : [{ key: `${ci},${si}`, name: `${ch.name.split(' · ')[0]} · ${o.name}${o.boss ? '【Boss】' : ''}`,
      make: () => ({ v: stage(ci, si).vehicle, aim: o.aim, style: o.style, terrain: o.terrain, boss: o.boss, statMultipliers: stage(ci, si).statMultipliers }) }]));
    if (src === 'tour') return SA.OPPONENTS.map((o, i) => ({ key: String(i), name: SA.Config.text("state_f98b29d88349", `${i + 1}`, `${o.name}`),
      make: () => { const op = SA.S.opponent(i); return { v: op.vehicle, aim: op.aim, terrain: SA.TERRAIN_ORDER[i % SA.TERRAIN_ORDER.length], boss: i === SA.OPPONENTS.length - 1 }; } }));
    if (src === 'bp') return SA.OFFICIAL_BLUEPRINTS.map((b, i) => ({ key: String(i), name: b.name, make: () => ({ v: SA.V.fromAscii(b.name, b.rows, b.sides || []), aim: 0.8 }) }));
    if (src === 'mine') return SA.Blueprints.mine().map((b, i) => ({ key: String(i), name: b.name, make: () => ({ v: SA.V.fromLayout(b.name, b), aim: 0.8 }) }));
    if (src === 'cloud') return SA.S.Cloud.list().map((e, i) => ({ key: String(i), name: `${e.name} · ${e.author}`, make: () => ({ v: SA.V.decode(e.code), aim: 0.85 }) }));
    // 进化报告页（tools/evolve.html）点"去试驾场和它打一场"时存进来的车，最新的在前
    if (src === 'evolve') {
      let picks = [];
      try { picks = JSON.parse(localStorage.getItem('steam_arena_evolve_picks')) || []; } catch (e) { picks = []; }
      return picks.map((p, i) => ({ key: String(i), name: p.from ? `${p.name}（${p.from}）` : p.name,
        make: () => ({ v: p.cells ? SA.V.fromCells(p.name, p.cells) : SA.V.decode(p.code), aim: 0.8, style: p.style && p.style !== 'wander' ? p.style : null, terrain: p.terrain }) }));
    }
    return [{ key: 'rand', name: SA.Config.text("camp_ui_52f8d5a7fc8e"), make: () => { let v = null; for (let k = 0; k < SA.RULES.street.trialAttempts && !v; k++) v = SA.Street.build(SA.Config.text("camp_ui_77d99f34e0ae"), Math.random() < SA.RULES.street.trialBigChance); return { v, aim: SA.RULES.street.trialAim }; } }];
  }
  // src：直接打开某个对手来源（进化报告页跳过来时用 'evolve'，并选中最新的那台）
  function sandbox(src) {
    if (src && SRC.some(([k]) => k === src)) { SB.src = src; SB.foe = '0'; }
    const list = () => foeList(SB.src);
    if (!list().some(f => f.key === SB.foe)) SB.foe = (list()[0] || {}).key;
    const sel = (opts, cur, onchange) => h('select', { onchange: (e) => { onchange(e.target.value); draw(); } }, opts.map(([v, n]) => h('option', { value: v, selected: String(v) === String(cur) }, n)));
    const body = h('div', { class: 'sandbox' });
    let foe = null;   // 当前预览的对手（开打时直接用它，随机街头车也是看到的这台）
    function build() {
      const f = list().find(x => x.key === SB.foe);
      const r = f && f.make();
      if (!r || !r.v) return null;
      if (+SB.mt) SA.Camp.prepareTrialVehicle(r.v, +SB.mt);   // 统一换材料
      return { ...r, name: f.name.replace(/^.* · /, '').replace('【Boss】', ''), terrain: SB.terrain || r.terrain || 'flat',
        style: SB.style ? (SB.style === 'roam' ? null : SB.style) : r.style, aim: SB.aim ? +SB.aim : r.aim };
    }
    function draw(keepFoe) {
      if (!keepFoe) foe = build();
      body.innerHTML = '';
      const L = list();
      const field = (label, el) => h('label', { class: 'sb-field' }, h('span', { class: 'muted' }, label), el);
      body.append(h('div', { class: 'sb-grid' },
        field(SA.Config.text("camp_ui_11474bd8ffc9"), sel(SRC, SB.src, (v) => { SB.src = v; SB.foe = (foeList(v)[0] || {}).key; })),
        field(SA.Config.text("camp_ui_4ea064c4d27d"), L.length ? sel(L.map(f => [f.key, f.name]), SB.foe, (v) => { SB.foe = v; }) : h('span', { class: 'muted' }, SA.Config.text("camp_ui_a3fe69faec8c"))),
        field(SA.Config.text("camp_ui_e1d28b717f1e"), sel([['', SA.Config.text("camp_ui_2c2210ed86d7")], ...SA.TERRAIN_ORDER.map(k => [k, SA.TERRAINS[k].name])], SB.terrain, (v) => { SB.terrain = v; })),
        field(SA.Config.text("camp_ui_7f72f06a8877"), sel([['', SA.Config.text("camp_ui_9cda7385a1f3")], ...Object.entries(SA.Scenes.NAMES).filter(([k]) => k !== 'qual')], SB.scene, (v) => { SB.scene = v; })),
        field(SA.Config.text('camp_ui_trial_bounds'), sel([['', SA.Config.text('camp_ui_trial_bounds_off')], ['1', SA.Config.text('camp_ui_trial_bounds_on')]], SB.bounds, (v) => { SB.bounds = v; })),   // 两头摆路障（和战役同一套边界），看场景的路障用
        field(SA.Config.text("camp_ui_6e17d786b77d"), sel([[0, SA.Config.text("camp_ui_90b59fe7f8ac")], ...SA.MATS.slice(1).map((m, i) => [i + 1, m.rank ? `${m.rank} · ${m.name}` : m.name])], SB.mt, (v) => { SB.mt = +v; })),
        field(SA.Config.text("camp_ui_b4566d6d030d"), sel(STYLES(), SB.style, (v) => { SB.style = v; })),
        field(SA.Config.text("camp_ui_f787b4997419"), sel([['', SA.Config.text("camp_ui_2c2210ed86d7")], ...[0.3, 0.5, 0.65, 0.8, 0.9, 1].map(a => [a, SA.Config.text("camp_ui_c8ae3a7850bc", `${a}`)])], SB.aim, (v) => { SB.aim = v; }))));
      if (!foe) { body.append(h('p', { class: 'muted' }, SA.Config.text("camp_ui_d44831886e06"))); return; }
      const t = SA.TERRAINS[foe.terrain], st = SA.V.stats(foe.v), me = SA.V.stats(d().vehicle);
      body.append(h('div', { class: 'sb-preview' },
        h('div', { class: 'vs-pic' }, (() => { const cv = SA.UI.vehiclePreview(foe.v, 2); cv.style.transform = 'scaleX(-1)'; return cv; })()),
        h('div', { class: 'sb-info' },
          h('b', {}, foe.name, foe.boss ? ' 【Boss】' : ''),
          h('div', {}, h('span', { class: 'chip' }, SA.Config.text("camp_ui_3c474f64f788", `${st.rating}`)), ' ', h('span', { class: 'chip' }, SA.Config.text("camp_ui_fa293fb5cc44", `${me.rating}`)), ' ',
            h('span', { class: 'chip' }, SA.Config.text("camp_ui_e5e3905101d7", `${(STYLES().find(x => x[0] === (foe.style || 'roam')) || STYLES()[1])[1]}`)), ' ', h('span', { class: 'chip' }, SA.Config.text("camp_ui_c8ae3a7850bc", `${foe.aim}`))),
          h('div', { class: 'terrain-note' }, h('b', {}, SA.Config.text("camp_ui_33c84e18e918", `${t.name}`)), h('span', { class: 'muted' }, t.desc)),
          !me.canDeploy ? h('div', { class: 'warn bad' }, SA.Config.text("camp_ui_c972b6b78afa", `${me.problems[0]}`)) : null)),
        h('div', { class: 'dialog-actions', style: 'padding:10px 0 0;justify-content:flex-start' },
          h('button', { class: 'btn primary', disabled: !me.canDeploy, onclick: () => {
            SA.UI.closeModal();
            SA.Battle.start({ mode: 'friendly', enemyVehicle: foe.v, enemyName: foe.name, aim: foe.aim, style: foe.style, terrain: foe.terrain, boss: foe.boss, statMultipliers: foe.statMultipliers, hpMul: 1, scene: SB.scene || undefined, bounds: SB.bounds ? { left: 0, right: 1280 } : undefined });
          } }, SA.Config.text("camp_ui_308605e6e972")),
          SB.src === 'street' ? h('button', { class: 'btn', onclick: () => draw() }, SA.Config.text("camp_ui_2f07427ad654")) : null));
    }
    SA.UI.openModal(SA.Config.text("camp_ui_fd7105d81b1c"), body);
    draw();
  }

    // 在指定地形上和某一关的对手打一场友谊赛（不结算、不留损伤）；控制台用
  function drive(terrain = 'crates', foe = '1,0') {
      const [ci, si] = String(foe).split(',').map(Number), st = stage(ci, si);
      if (!st) return;
      SA.Battle.start({ mode: 'friendly', enemyVehicle: st.vehicle, enemyName: st.name, aim: st.aim, style: st.style, terrain, statMultipliers: st.statMultipliers, hpMul: 1 });
  }

  return { salvageDialog, unlockDialog, introIfNew, matChip, ...(!SA.RELEASE ? { devPanel, sandbox, drive } : {}) };
})();
