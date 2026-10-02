// 出战（界面重建 v3）：不单独跳页——院子暗下来，拉下一块黑板（js/home.js 的 board()），内容画在黑板上：
// 左边粉笔写赛程（战役 / 街头赛 / 终局锦标赛，后两项随战役解锁），中间钉一张对决海报、下面贴便签（场地、情报、缴获），
// 右边号外、对手档案、下注凭单、出战前要处理的事和调速杆。所有「要打的比赛」和「能赚钱的事」都在这块黑板上，选好就走。
window.SA = window.SA || {};

SA.Arena = (() => {
  const h = SA.h, M = SA.MODULES;
  const d = () => SA.S.d;
  const money = (n) => SA.UI.money(n);
  // [页签, 名称, 需要的功能]
  const MODES = [['camp', '战役', null], ['street', '街头赛', 'street'], ['tour', '锦标赛', 'season']];
  const modes = () => MODES.filter(([, , f]) => !f || SA.Camp.has(f));
  // openCh：战役列表展开了哪几章（默认只展开当前这一章和选中的那一场所在的章）
  const st = { mode: 'camp', pick: { camp: null, tour: null, street: null, friendly: null }, bet: null, openCh: null };
  let root = null;

  // quiet：战后结算会接着弹窗，先不弹章节开场
  function open(mode, quiet) {
    if (mode) st.mode = mode;
    if (!modes().some(([k]) => k === st.mode)) st.mode = 'camp';
    st.pick.tour = null; st.pick.camp = null;   // 每次进来都默认选中当前这一场
    root = SA.Home.board({ instant: !!quiet });   // 院子里拉下黑板，返回黑板上的内容容器
    render();
    if (!quiet) SA.Camp.introIfNew();
  }
  function unmount() { root = null; }

  // 这一场赢了能拿到的唯一件；claimed = 这个存档已经拿过。
  function rewardsOf(e) {
    if (!e) return [];
    let raw = [];
    if (st.mode === 'camp') { const [ci, si] = String(e.key).split(',').map(Number); raw = (SA.CAMPAIGN[ci] && SA.CAMPAIGN[ci].stages[si].uniqueLoot) || []; }
    return raw.map(r => ({ id: r.id, mt: r.mt || 1, claimed: SA.S.hasUnique(r.id) }));
  }
  // ---------- 页面（界面重建 v3）：左黑板赛程 · 中对决海报 · 右对手档案 + 下注凭单 + 调速杆 ----------
  function render() {
    if (!root || !root.isConnected) return;
    const D = d(), UI = SA.PX.ui;
    root.innerHTML = '';
    if (st.pick.tour == null) st.pick.tour = D.round;
    if (st.pick.camp == null) st.pick.camp = `${SA.Camp.chIndex()},${Math.min(D.camp.st, SA.CAMPAIGN[SA.Camp.chIndex()].stages.length - 1)}`;
    const list = SA.S.arenaEntries(st.mode);
    const pickKey = st.pick[st.mode];
    const cur = list.find(x => x.key === pickKey) || list.find(x => x.next) || list.find(x => !x.lock) || list[0] || null;
    if (cur) st.pick[st.mode] = cur.key;
    const s = SA.V.stats(D.vehicle);
    root.append(
      h('section', { class: 'ar-chalk' }, board(list, cur)),
      h('section', { class: 'ar-mid' },
        h('div', { class: 'ar-poster px-sk px-sk-paperOld px-drop' }, UI.img(SA.PX.pin(), 2, 'position:absolute;left:50%;top:-16px;margin-left:-8px;z-index:2'), poster(cur, s)),
        h('div', { class: 'ar-notes' }, notes(cur))),
      h('section', { class: 'ar-side' }, side(cur, s)));
  }

  // ---------- 左：黑板（打过的划掉，要打的圈起来，选中的框起来；底下粉笔画场地）----------
  function board(list, cur) {
    const D = d(), UI = SA.PX.ui, X = SA.PX, ms = modes();
    const tabs = ms.length > 1 ? h('div', { class: 'ch-tabs' }, ms.map(([k, n]) => h('button', { class: `ch-tab ${st.mode === k ? 'on' : ''}`, onclick: () => { st.mode = k; render(); } }, n, k === 'tour' ? ` · ${D.round + 1}` : ''))) : null;
    const line = (e) => {
      const name = st.mode === 'camp' ? e.name : e.title.replace(/^第 \d+ 轮 · /, '');
      const done = e.replay || (e.tag && e.tag[0] === 'ok'), next = e.next || (e.tag && e.tag[0] === 'next');
      const w = Math.round(([...name].length * 18 + 8) / 2);
      return h('button', { class: `ch-row ${cur && cur.key === e.key ? 'on' : ''} ${e.lock && !done ? 'lock' : ''}`, 'data-page-key': `arena:${st.mode}:${e.key}`, onclick: () => { st.pick[st.mode] = e.key; render(); } },
        h('span', { class: 'ck' }, done ? '✓' : ''),
        h('span', { class: 'nm' }, name, done ? UI.img(X.chalkLine(w), 2, 'position:absolute;left:-4px;top:11px') : null,
          next ? UI.img(X.ellipse(w + 10, 17, SA.PAL.fire[3], 0.06), 2, 'position:absolute;left:-14px;top:-4px') : null),
        h('span', { class: 'who' }, e.boss || (e.tag && e.tag[1] === 'Boss') ? 'Boss' : (e.pilot || '').split(' ').pop()),
        rewardsOf(e).filter(x => !x.claimed).length ? h('span', { class: 'uq', title: '赢了可以缴获唯一件' }, '★') : null);
    };
    let rows;
    if (st.mode === 'camp') {
      const byCh = new Map();
      for (const e of list) { const ci = +String(e.key).split(',')[0]; if (!byCh.has(ci)) byCh.set(ci, []); byCh.get(ci).push(e); }
      if (!st.openCh || st.openFor !== SA.Camp.chIndex()) { st.openCh = new Set([SA.Camp.chIndex()]); st.openFor = SA.Camp.chIndex(); }
      if (cur) st.openCh.add(+String(cur.key).split(',')[0]);
      rows = [];
      for (const [ci, rs] of byCh) {
        const open = st.openCh.has(ci);
        rows.push(h('button', { class: `ch-head ${open ? 'open' : ''}`, 'data-page-key': `chapter:${ci}`, onclick: () => { if (open) st.openCh.delete(ci); else st.openCh.add(ci); render(); } }, open ? '▾ ' : '▸ ', SA.CAMPAIGN[ci].name));
        if (open) rows.push(...rs.map(line));
      }
      const nextCh = SA.CAMPAIGN[SA.Camp.chIndex() + 1];
      if (nextCh && !SA.Camp.done()) rows.push(h('div', { class: 'ch-row lock' }, h('span', { class: 'ck' }, '?'), h('span', { class: 'nm' }, `下一章：${nextCh.name.split(' · ').pop()}`)));
    } else rows = list.map(line);
    const foot = st.mode === 'street' ? h('button', { class: 'ch-tab', onclick: () => { SA.Street.offers(true); render(); } }, '↻ 换一批对手')
      : st.mode === 'camp' ? h('div', { class: 'ch-foot' }, '打过的可以重打，不奖不罚') : null;
    return [tabs, h('div', { class: 'ch-list' }, rows), foot];
  }
  // 便签（贴在海报下面）：场地剖面、线人情报、能缴获的唯一件
  function notes(e) {
    if (!e) return [];
    const UI = SA.PX.ui, X = SA.PX, t = e.terrain && SA.TERRAINS[e.terrain], rs = rewardsOf(e);
    const note = (title, ...body) => h('div', { class: 'ar-stick px-sk px-sk-note px-drop' }, UI.img(X.tape(24), 2, 'position:absolute;left:50%;top:-14px;margin-left:-24px'), h('div', { class: 'nt' }, title), ...body);
    return [
      t ? note(`场地：${t.name}`, UI.img(sketch(t, '#4a3a18', 76), 2), h('div', { class: 'nb', title: t.desc }, t.desc.split(/[。；]/)[0])) : null,
      e.blurb ? note('情报', h('div', { class: 'nb', title: e.blurb }, UI.hand(`线人：${e.blurb}`, 14, 'white-space:normal'))) : null,
      rs.length ? note('缴获', ...rs.map(r => h('div', { class: 'nu' }, SA.SPR.moduleCanvas(r.id, 0.5, r.mt),
        h('div', {}, h('b', {}, `${r.mt > 1 ? SA.MATS[r.mt].name : ''}${M[r.id].name}`), h('div', { class: 'px-small' }, r.claimed ? '已经拿到了' : e.replay ? '重打不掉落' : '头一回赢了能挑它'))))) : null,
    ];
  }
  // 场地剖面（便签上用墨线画）：地面一条线，土坡是鼓包，货箱是方块（带一道斜撑），泥地是点点
  function sketch(t, c = SA.PX.CHALK, W = 130) {
    const f = W / 130, X = SA.PX, k = X.C(W, Math.round(36 * f)), sx = (x) => Math.round(x / 1280 * (W - 2)) + 1, G = Math.round(32 * f);
    const hills = t.hills || [];
    const yAt = (x) => { let y = G; for (const hl of hills) { const d0 = Math.abs(x - sx(hl.x)), hw = hl.w / 1280 * 64 * f; if (d0 < hw) y = Math.min(y, G - Math.round(Math.cos(d0 / hw * Math.PI / 2) * hl.h / 4 * f)); } return y; };
    for (let x = 0; x < W; x++) if (X.hash(x, 1, 41) > 0.1) k.p(x, yAt(x), c);
    for (const [a, b] of t.mud || []) for (let x = sx(a); x < sx(b); x += 3) k.p(x, G + 2, c === X.CHALK ? '#9fb7a2' : '#7a6a3a');
    for (const cr of t.crates || []) { const w = Math.max(3, Math.round(cr.w / 10 * f)), hh = Math.max(3, Math.round(cr.h / 10 * f)), x0 = sx(cr.x) - (w >> 1), y1 = yAt(sx(cr.x));
      X.line(k, x0, y1 - hh, x0 + w, y1 - hh, c, 0.1); X.line(k, x0, y1 - hh, x0, y1, c, 0.1); X.line(k, x0 + w, y1 - hh, x0 + w, y1, c, 0.1); X.line(k, x0, y1 - hh, x0 + w, y1, c, 0.3); }
    for (const x of [Math.round(8 * f), W - Math.round(10 * f)]) { const y = yAt(x), r = Math.max(3, Math.round(5 * f)); X.line(k, x - r, y - r + 1, x + r, y - r + 1, c); X.line(k, x - r, y - r + 1, x - r, y, c); X.line(k, x + r, y - r + 1, x + r, y, c); }
    return k.c;
  }

  // ---------- 中：对决海报 ----------
  const oval = (name) => {
    const X = SA.PX, UI = X.ui, k = X.C(52, 62), INK = X.INK;
    for (let y = 0; y < 62; y++) for (let x = 0; x < 52; x++) { const dx = (x + 0.5 - 26) / 23, dy = (y + 0.5 - 31) / 28; if (dx * dx + dy * dy < 1) k.p(x, y, dx * dx + dy * dy > 0.8 ? SA.PAL.paper[2] : SA.PAL.paper[3]); }
    k.g.drawImage(X.ellipse(52, 62, INK, 0), 0, 0); k.g.drawImage(X.ellipse(46, 56, INK, 0), 3, 3);
    const ch = SA.Coal.byName[name] || SA.Coal.crew(name || 'x');
    return h('div', { class: 'ar-oval' }, UI.img(k.c), h('div', { class: 'face' }, UI.img(SA.Coal.draw(ch, { size: 'sprite', look: name === '你' ? 1 : -1 }))));
  };
  const engraved = (v, flip) => {
    const X = SA.PX;
    let src = X.trim(SA.SPR.renderVehicle(v, { key: 'arena-poster', t: 0, heat: 0.45, water: 0.8 }));
    if (src.width > 160 || src.height > 76) {   // 大车缩成一半（整数倍、最近邻，像素不糊），海报才放得下
      const k = document.createElement('canvas'); k.width = Math.ceil(src.width / 2); k.height = Math.ceil(src.height / 2);
      const g = k.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, k.width, k.height); src = k;
    }
    const c = X.ui.img(X.engrave(src, [42, 26, 5], [184, 57, 27]), 1, flip ? 'transform:scaleX(-1)' : '');
    c.classList.add('ar-car'); return c;
  };
  function poster(e, s) {
    const D = d(), UI = SA.PX.ui, X = SA.PX;
    if (!e) return h('p', {}, '这里还没有比赛。');
    const where = st.mode === 'camp' ? (() => { const [ci, si] = String(e.key).split(',').map(Number); return `${SA.CAMPAIGN[ci].name} · 第 ${si + 1} 场`; })() : st.mode === 'tour' ? `伦敦蒸汽大奖赛 · 第 ${Number(e.key) + 1} 轮` : '街头赛';
    const out = [
      h('div', { class: 'ar-kick' }, where),
      e.boss || (e.tag && e.tag[1] === 'Boss')
        ? h('div', { class: 'ar-title boss' }, UI.img(X.brush('大对决', 34, X.RED, X.INK, 5), 2), UI.stamp('Boss', 'position:absolute;right:6px;top:10px'))
        : h('div', { class: 'ar-title' }, UI.img(X.brush(e.v?.name || e.name, 22, X.INK, '#b59c6c', 3), 2)),
      h('div', { class: 'ar-vs' },
        h('div', { class: 'who' }, oval('你'), h('div', { class: 'nm' }, h('b', {}, D.vehicle.name), h('span', { class: 'px-small' }, ' 评分 '), UI.num(s.rating))),
        h('div', { class: 'mid' }, UI.loop(h('span', { class: 'dui' }, '对'), 42, 38, 7)),
        h('div', { class: 'who' }, oval(e.pilot), h('div', { class: 'nm' }, h('b', {}, e.v?.name || e.name), h('span', { class: 'px-small' }, ' 评分 '), UI.num(e.rating)))),
      h('div', { class: 'ar-cars' }, engraved(D.vehicle, false), engraved(e.v, true)),
      h('div', { class: 'ar-prize' }, e.replay ? UI.hand('↺ 重打：不发奖金、不留战损、不掉落', 14, 'white-space:normal')
        : e.prize ? ['奖金 ', UI.underline(UI.num(money(e.prize)), 30, 4), ' · 缴获一件'] : '赢了不发奖金'),
    ];
    return out;
  }
  // 出战前要处理的：红笔手写 + 按钮
  function readiness(s) {
    const D = d(), UI = SA.PX.ui;
    const hurt = [];
    SA.V.each(D.vehicle, (cell) => { if (cell.hp < SA.V.maxHp(cell)) hurt.push(cell); });
    const cost = hurt.reduce((a, c) => a + SA.S.repairCost(c), 0);
    const out = [];
    if (s.problems.length) out.push(h('div', { class: 'ar-note' }, UI.hand(`还不能出战：${s.problems.join('；')}`, 16, 'white-space:normal'),
      SA.Camp.has('garage') ? UI.btn('去车间处理', { sm: true, onclick: () => SA.nav('garage') }) : null));
    if (hurt.length) out.push(h('div', { class: 'ar-note' }, UI.hand(`${hurt.length} 个模块受损`, 16),
      UI.btn(`全部修理 ${money(cost)}`, { sm: true, title: `最贵的几项：\n${SA.UI.repairBrief(hurt)}`, onclick: () =>
        SA.UI.pay({ title: '修理', amount: cost, okLabel: '修理', confirm: false, lines: [SA.UI.repairList(hurt)], onPaid: () => { SA.S.repairCells(hurt); SA.UI.toast('全部修好了'); render(); } }) })));
    const warns = s.warnings.filter(w => !/损毁/.test(w));
    if (warns.length) out.push(h('div', { class: 'ar-note px-small' }, warns.join('；')));
    return out;
  }

  // ---------- 右：对手档案 · 下注凭单 · 调速杆 ----------
  function side(e, s) {
    const D = d(), UI = SA.PX.ui, X = SA.PX;
    if (!e) return [];
    const fs = SA.V.stats(e.v);
    let chassis = '';
    SA.V.each(e.v, (cell) => { if (!chassis && M[cell.id] && M[cell.id].layer === 'chassis') chassis = M[cell.id].name; });
    const field = (k, ...v) => h('div', { class: 'f' }, h('span', { class: 'k' }, k), h('span', {}, ...v));
    const dossier = h('div', { class: 'ar-dossier px-sk px-sk-kraft px-drop' }, UI.sk('paper', [
      h('div', { class: 'ar-dt' }, h('span', { class: 'px-h2' }, '对手档案'), e.boss ? UI.underline(UI.hand('Boss！', 20), 26, 6) : null),
      // 对手档案展示车辆铭牌；关卡标题仍由赛程和海报单独使用。
      field('车手', e.pilot || '—'), field('座驾', e.v?.name || e.name), chassis ? field('底盘', chassis) : null,
      field('评分', UI.num(e.rating), h('span', { class: 'px-small' }, ' 你 '), UI.num(s.rating)),
      field('速度', SA.kmh(fs.topSpeed), h('span', { class: 'px-small' }, fs.topSpeed > s.topSpeed * 1.2 ? ' 比你快' : fs.topSpeed < s.topSpeed * 0.8 ? ' 比你慢' : ' 差不多'))]));
    const why = e.lock || (!s.canDeploy ? '先把车修整好' : null);
    const label = st.mode === 'camp' ? (e.replay ? '重打' : '出战') : st.mode === 'tour' ? '出战' : '应战';
    const go = () => { if (why) { SA.UI.toast(why); return; } document.querySelector('#modal').hidden = true; SA.StoryDev.before({ key: st.mode === 'camp' ? e.key : 'current', replay: e.replay }, () => e.start()); };
    return [
      D.news ? UI.sk('paper', [UI.stamp('号外'), ' ', D.news], 'padding:0 6px;font-size:13px', 'px-drop') : null,
      dossier,
      betSlip(e),
      ...readiness(s),
      // 拉杆在正中：往左扳到底回院子（车间解锁后才有院子可回），往右推到底出战
      h('div', { class: 'ar-go' }, UI.throttle({ title: why || `${label} · ${e.name}`,
        left: SA.Camp.has('garage') ? { label: '← 回院子', go: () => SA.Home.closeBoard() } : null,
        right: { label: `${label} →`, go, disabled: why } }),
        why ? h('div', { class: 'px-cap' }, why) : null,
        h('div', { class: 'px-cap' }, 'A / D 移动 · 鼠标瞄准 · 按住左键稳住准星 · 1–9 换武器')),
    ];
  }
  // 下注凭单：印好的金额，押哪个就用红笔圈哪个；已押的圈着、可以撤回
  function betSlip(e) {
    const D = d(), UI = SA.PX.ui;
    if ((st.mode !== 'tour' && st.mode !== 'camp') || e.lock || e.replay || !SA.Camp.has('bet')) return null;
    const odds = SA.S.odds(e.raw, e.hpMul);
    const max = Math.max(0, Math.floor(D.money / 10) * 10);
    const opts = D.bet ? [D.bet.amount] : [0, 50, 100, 200, 500].filter(x => x <= max).concat(max > 500 ? [max] : []);
    const pick = D.bet ? D.bet.amount : (st.bet != null && opts.includes(st.bet) ? st.bet : 0);
    const opt = (x) => h('button', { class: 'ar-opt', onclick: D.bet ? null : () => { st.bet = x; render(); } },
      x === pick ? UI.loop([x ? '■ ' : '■ ', x ? UI.num(money(x)) : '不下'], x ? 38 : 30, 19, 13 + x) : [x ? '□ ' : '□ ', x ? UI.num(money(x)) : '不下']);
    return h('div', { class: 'ar-slip' },
      h('div', { class: 'stub px-sk px-sk-green' }, [...'0042'].map(ch => UI.num(ch, '#2e3a26'))),
      UI.sk('green', [
        h('div', { class: 'ar-st' }, '伦敦蒸汽赛会 · 下注凭单'),
        h('div', {}, '押 自己赢 · 赔率 ', UI.num(`×${odds}`)),
        h('div', { class: 'ar-opts' }, opts.map(opt)),
        D.bet ? h('div', { class: 'ar-bet' }, UI.hand(`已押，赢了拿回 ${money(D.bet.amount * D.bet.odds)}`, 15), UI.btn('撤回', { sm: true, onclick: () => { SA.S.cancelBet(); SA.UI.topbar(); render(); } }))
          : pick ? h('div', { class: 'ar-bet' }, UI.hand(`能赢 ${money(pick * odds)}！`, 16), UI.btn('押自己赢', { sm: true, kind: 'pri', onclick: () => { SA.S.placeBet(pick, odds); st.bet = null; SA.UI.topbar(); SA.UI.toast(`押注 ${money(pick)}`); render(); } }))
            : !max ? h('div', { class: 'px-small' }, '现在没钱可押') : null], 'flex:1;padding:0 6px', 'px-drop'));
  }

  return { open, render, unmount };
})();
