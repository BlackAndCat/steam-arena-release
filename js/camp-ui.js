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
    SA.UI.dialog('缴获战利品', [
      h('p', { style: 'margin-top:0' }, '按赛会规矩，胜者可以从对手车上拆走一件你还没有的零件：'),
      // 唯一件单独一张金边卡片排在最前：只能在这里拿到，而且每个存档只有一次
      h('div', { class: 'salvage' }, opts.slice().sort((a, b) => !!b.unique - !!a.unique).map(x => h('div', { class: `dlg-item ${x.unique ? 'uniq-card' : ''}` }, SA.SPR.moduleCanvas(x.id, 1, x.mt),
        h('div', {}, x.unique ? h('span', { class: 'chip uniq big' }, '★ 唯一件') : null, x.unique ? ' ' : null, h('b', {}, name(x)), ' ', matChip(x.mt),
          h('div', { class: 'muted' }, SA.UI.statLine(x.id, x.mt)),
          x.unique ? h('div', { class: 'uniq-note' }, '不能购买，只能缴获；这次不拿，以后重打也不会再掉。') : null)))),
    ],opts.map(x => ({ label: `拿走 ${x.unique ? '★ ' : ''}${name(x)}`, primary: x.mt >= 5 || !!x.unique, onClick: () => {
      if (!SA.Camp.claimSalvage(x)) { SA.UI.toast(`${name(x)}已经领取过了`); next(); return; }
      SA.UI.toast(`缴获 ${name(x)}，放进库存`);
      next();
    } })), false, next);
  }

  function unlockDialog({ title, u }, next) {
    const lines = unlockLines(u);
    if (!lines.length && !u.note) { next(); return; }
    SA.UI.dialog(title, [
      u.note ? h('p', { style: 'margin-top:0' }, u.note) : null,
      h('div', { class: 'unlocks' }, lines.map(l => h('div', { class: 'warn', style: 'border-left-color:var(--gauge2)' }, l))),
    ], [{ label: '好', primary: true, onClick: next }], false, next);
  }

  // 章节开场：进入出战页时，新章节先弹一次介绍
  function introIfNew() {
    const ch = SA.Camp.takeIntro();
    if (!ch) return false;
    SA.UI.dialog(ch.name, [
      h('p', { style: 'margin-top:0' }, ch.blurb),
      h('div', { class: 'unlocks' }, ch.stages.map((s, i) => h('div', { class: 'warn', style: 'border-left-color:var(--brass2)' },
        h('b', {}, `第 ${i + 1} 场 · ${s.name}`), s.boss ? ' 【Boss】' : '', h('span', { class: 'muted' }, ` · ${s.pilot}`)))),
      h('p', { class: 'muted' }, '每一场都是一道构筑题：点对手看它的车和弱点，再回车间对症改装。'),
    ], [{ label: '出发', primary: true, onClick: () => {} }], false);
    return true;
  }

  const matChip = (mt) => h('span', { class: 'chip mat', style: `--mat:${SA.MATS[mt].chip}` }, SA.MATS[mt].rank ? `${SA.MATS[mt].rank} · ${SA.MATS[mt].name}` : SA.MATS[mt].name);

  // ---------- 调试（控制台）----------
  // SA.dev.goto(3)：直接跳到第 3 章开头（前面各章的解锁全部发放）；SA.dev.unlockAll()：全部解锁；SA.dev.money(n)
  // 开发者面板：侧边栏底部的「开发者」按钮。上面是开发工具（新标签页打开），下面是存档调试
  // 新做的工具页 / 预览页加到 DEV_TOOLS 里就会出现在面板上；视觉样机不单独加，登记到 tools/labs.js（视觉样机馆）
  const DEV_TOOLS = [
    { url: 'tools/console.html', name: '后台 · 全部工具', desc: '关卡、剧情、院子闲聊、视觉样机和游戏调试都在这一页；Ctrl+K 搜任何一关、一幕剧情、一个样机' },
    { url: 'tools/sim.html', name: '数值自测', desc: 'AI 对 AI 批量对打：战役关卡检验、对战矩阵 + 评分校准、模块性价比' },
    { url: 'tools/evolve.html', name: '进化报告', desc: '关卡车进化生成器的结果：选关、强度 × 表现散点图、分类网格、毒瘤车与奇特构筑，可复现、可试驾' },
    { url: 'tools/stage-editor.html', name: '关卡车工作台', desc: '拼装全部章节关卡车，编辑奖励、文字与强度并保存手工锁定版本' },
    { url: 'tools/module-editor.html', name: '模块属性工作台', desc: '选择模块，修改文字与玩法属性，一键保存到模块数据' },
    { url: () => `tools/yard-chat-editor.html?scope=${encodeURIComponent(SA.YardChat.currentScope())}`, name: '院子聊天工作台', desc: '按章节关卡编排闲聊和多人对答，调整出现频率与气泡时长' },
    { url: 'tools/module-candidates.html', name: '模块造型 · 全部进度', desc: '全部模块按计划表分档：已通过的定稿、候选、占位，一页看全' },
    { url: 'tools/current.html', name: '当前开发', desc: '只放正在开发、等你确认的东西；确认后归档，这里换成下一项' },
    { url: 'tools/lab.html', name: '视觉样机馆', desc: '全部视觉样机和美术规范：风格参考、精灵表、模块造型探索、底盘演进、地形与悬挂；按类别、版本和状态收纳' },
  ];
  function devPanel() {
    const act = (label, fn, primary) => h('button', { class: `btn ${primary ? 'primary' : ''}`, onclick: () => { SA.UI.closeModal(); fn(); SA.UI.toast(label); } }, label);
    const sel = h('select', {}, SA.CAMPAIGN.map((ch, i) => h('option', { value: i, selected: i === chIndex() }, ch.name)));
    const row = (...kids) => h('div', { class: 'dialog-actions dev-row' }, kids);
    SA.UI.openModal('开发者模式', h('div', { class: 'dev-panel' },
      h('h3', { class: 'help-h' }, '开发工具 · 新标签页打开'),
      h('div', { class: 'dev-tools' }, DEV_TOOLS.map(t => h('a', { class: 'dev-tool', href: typeof t.url === 'function' ? t.url() : t.url, target: '_blank', rel: 'noopener' },
        h('b', {}, t.name, h('span', { class: 'ext' }, ' ↗')), h('span', { class: 'muted' }, t.desc)))),
      h('h3', { class: 'help-h' }, '存档调试 · 直接改存档'),
      row(act('一键全部解锁', () => { dev.unlockAll(); dev.money(10000); dev.ingots(5); }, true),
        act('+£1000', () => dev.money(1000)),
        act('乌兹钢锭 / 以太结晶 +3', () => dev.ingots(3))),
      row(sel, act('跳到这一章', () => dev.goto(+sel.value)), act('清空存档重来', () => SA.reset())),
      row(h('button', { class: 'btn', onclick: () => SA.UI.dialog('换成简陋初始车', [
        h('p', { style: 'margin-top:0' }, '把现在这台车整台换成黄铜四件车（履带 / 小锅炉 / 小机枪 / 头盔舱）。'),
        h('p', { class: 'muted' }, '原车每一件都退回库存，耐久、改装和唯一身份照旧；资金和战役进度不变。'),
      ], [{ label: '换车', primary: true, onClick: () => { SA.dev.resetVehicle(); SA.UI.refresh(); SA.UI.toast('已换成简陋初始车，原车零件在库存里'); } }]) }, '换成简陋初始车'),
      h('span', { class: 'muted' }, '原车零件全部退库，不清存档')),
      SA.StoryDev ? h('h3', { class: 'help-h' }, '剧情 · 编辑与插入') : null,
      SA.StoryDev && row(h('button', { class: 'btn primary', onclick: () => { SA.UI.closeModal(); SA.StoryDev.browser(); } }, '打开剧情编辑器'),
        h('label', { class: 'dev-check' }, h('input', { type: 'checkbox', checked: SA.StoryDev.enabled(), onchange: (e) => SA.StoryDev.setEnabled(e.target.checked) }), '出战前 / 战后询问是否插入剧情')) || null,
      h('h3', { class: 'help-h' }, '试驾场 · 不结算、不留损伤'),
      row(h('button', { class: 'btn primary', onclick: sandbox }, '打开试驾场'), h('span', { class: 'muted' }, '任选场地、对手、对手材料 / 性格 / 枪法，用你现在的车打一场'))));
  }

  // ---------- 试驾场：任选场地和对手 ----------
  // 对手来源：战役各关 / 终局锦标赛 / 官方蓝图 / 我的蓝图 / 分享码示例 / 随机街头车；可以改材料、AI 性格、枪法。
  const SB = { src: 'camp', foe: '1,0', terrain: '', mt: 0, style: '', aim: '', scene: '' };   // 记住上一次的选择
  const SRC = [['camp', '战役各关'], ['tour', '终局锦标赛'], ['bp', '官方蓝图'], ['mine', '我的蓝图'], ['cloud', '分享码示例'], ['evolve', '进化报告'], ['street', '随机街头车']];
  const STYLES = [['', '按对手默认'], ['roam', '游走'], ['rush', '冲锋'], ['kite', '放风筝'], ['turtle', '龟缩']];
  // 某个来源的对手列表：{ key, name, make() → { v, aim, style, terrain, boss } }
  function foeList(src) {
    if (src === 'camp') return SA.CAMPAIGN.flatMap((ch, ci) => ch.stages.map((o, si) => ({ key: `${ci},${si}`, name: `${ch.name.split(' · ')[0]} · ${o.name}${o.boss ? '【Boss】' : ''}`,
      make: () => ({ v: stage(ci, si).vehicle, aim: o.aim, style: o.style, terrain: o.terrain, boss: o.boss }) })));
    if (src === 'tour') return SA.OPPONENTS.map((o, i) => ({ key: String(i), name: `第 ${i + 1} 轮 · ${o.name}`,
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
    return [{ key: 'rand', name: '随手拼一台（每次都不一样）', make: () => { let v = null; for (let k = 0; k < 50 && !v; k++) v = SA.Street.build('街头小车', Math.random() < 0.5); return { v, aim: 0.65 }; } }];
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
        field('对手来源', sel(SRC, SB.src, (v) => { SB.src = v; SB.foe = (foeList(v)[0] || {}).key; })),
        field('对手', L.length ? sel(L.map(f => [f.key, f.name]), SB.foe, (v) => { SB.foe = v; }) : h('span', { class: 'muted' }, '这里还没有车')),
        field('场地', sel([['', '按对手默认'], ...SA.TERRAIN_ORDER.map(k => [k, SA.TERRAINS[k].name])], SB.terrain, (v) => { SB.terrain = v; })),
        field('场景', sel([['', '预选赛（默认）'], ...Object.entries(SA.Scenes.NAMES).filter(([k]) => k !== 'qual')], SB.scene, (v) => { SB.scene = v; })),
        field('对手材料', sel([[0, '保持原样'], ...SA.MATS.slice(1).map((m, i) => [i + 1, m.rank ? `${m.rank} · ${m.name}` : m.name])], SB.mt, (v) => { SB.mt = +v; })),
        field('AI 性格', sel(STYLES, SB.style, (v) => { SB.style = v; })),
        field('对手枪法', sel([['', '按对手默认'], ...[0.3, 0.5, 0.65, 0.8, 0.9, 1].map(a => [a, `瞄准 ${a}`])], SB.aim, (v) => { SB.aim = v; }))));
      if (!foe) { body.append(h('p', { class: 'muted' }, '选一个对手')); return; }
      const t = SA.TERRAINS[foe.terrain], st = SA.V.stats(foe.v), me = SA.V.stats(d().vehicle);
      body.append(h('div', { class: 'sb-preview' },
        h('div', { class: 'vs-pic' }, (() => { const cv = SA.UI.vehiclePreview(foe.v, 2); cv.style.transform = 'scaleX(-1)'; return cv; })()),
        h('div', { class: 'sb-info' },
          h('b', {}, foe.name, foe.boss ? ' 【Boss】' : ''),
          h('div', {}, h('span', { class: 'chip' }, `评分 ${st.rating}`), ' ', h('span', { class: 'chip' }, `你的车 ${me.rating}`), ' ',
            h('span', { class: 'chip' }, `性格 ${(STYLES.find(x => x[0] === (foe.style || 'roam')) || STYLES[1])[1]}`), ' ', h('span', { class: 'chip' }, `瞄准 ${foe.aim}`)),
          h('div', { class: 'terrain-note' }, h('b', {}, `场地 · ${t.name}`), h('span', { class: 'muted' }, t.desc)),
          !me.canDeploy ? h('div', { class: 'warn bad' }, `你的车还不能出战：${me.problems[0]}`) : null)),
        h('div', { class: 'dialog-actions', style: 'padding:10px 0 0;justify-content:flex-start' },
          h('button', { class: 'btn primary', disabled: !me.canDeploy, onclick: () => {
            SA.UI.closeModal();
            SA.Battle.start({ mode: 'friendly', enemyVehicle: foe.v, enemyName: foe.name, aim: foe.aim, style: foe.style, terrain: foe.terrain, boss: foe.boss, hpMul: 1, scene: SB.scene || undefined });
          } }, '开打'),
          SB.src === 'street' ? h('button', { class: 'btn', onclick: () => draw() }, '换一台') : null));
    }
    SA.UI.openModal('试驾场', body);
    draw();
  }

    // 在指定地形上和某一关的对手打一场友谊赛（不结算、不留损伤）；控制台用
  function drive(terrain = 'crates', foe = '1,0') {
      const [ci, si] = String(foe).split(',').map(Number), st = stage(ci, si);
      if (!st) return;
      SA.Battle.start({ mode: 'friendly', enemyVehicle: st.vehicle, enemyName: st.name, aim: st.aim, style: st.style, terrain, hpMul: 1 });
  }

  return { salvageDialog, unlockDialog, introIfNew, matChip, ...(!SA.RELEASE ? { devPanel, sandbox, drive } : {}) };
})();
