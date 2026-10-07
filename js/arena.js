// 出战（界面重建 v3）：不单独跳页——院子暗下来，拉下一块黑板（js/home.js 的 board()），内容画在黑板上：
// 左边粉笔写赛程（战役 / 街头赛 / 终局锦标赛，后两项随战役解锁），中间钉一张对决海报、下面贴便签（场地、情报、缴获），
// 右边号外、对手档案、下注凭单、出战前要处理的事和调速杆。所有「要打的比赛」和「能赚钱的事」都在这块黑板上，选好就走。
window.SA = window.SA || {};

SA.Arena = (() => {
  const h = SA.h, M = SA.MODULES;
  const d = () => SA.S.d;
  const money = (n) => SA.UI.money(n);
  // [页签, 名称, 需要的功能]
  // 支线页签只在有支线开放（SA.Side）以后出现
  // 出征页签（docs/expedition-plan.md V1）放在最后，不挪已有页签的位置；js/route.js（SA.Route）加载了才出现
  const MODES = [['camp', SA.Config.text("arena_7ae0219da3ae"), null], ['side', SA.Config.text('arena_side_tab'), 'sideLine'], ['street', SA.Config.text("arena_dc638f0b9759"), 'street'], ['tour', SA.Config.text("arena_d152ba4020fe"), 'season'], ['route', SA.Config.text('route_tab'), 'route']];
  const modes = () => MODES.filter(([, , f]) => !f || (f === 'sideLine' ? !!SA.Side?.anyOpen() : f === 'route' ? !!(!SA.RELEASE && SA.Route && SA.Route.start) : SA.Camp.has(f)));
  // openCh：战役列表展开了哪几章（默认只展开当前这一章和选中的那一场所在的章）
  const st = { mode: 'camp', pick: { camp: null, side: null, tour: null, street: null, friendly: null, route: null }, bet: null, openCh: null };
  let root = null;

  // quiet：战后结算会接着弹窗，先不弹章节开场
  function open(mode, quiet) {
    if (mode) st.mode = mode;
    if (!modes().some(([k]) => k === st.mode)) st.mode = 'camp';
    st.pick.tour = null; st.pick.camp = null;   // 每次进来都默认选中当前这一场
    root = SA.Home.board({ instant: !!quiet });   // 院子里拉下黑板，返回黑板上的内容容器
    render();
    if (!quiet) SA.Camp.introIfNew();
    if (!quiet && SA.Guide) SA.Guide.arena();   // 第一次正式进出战黑板（第二关）：讲黑板和拉杆
  }
  function unmount() { root = null; }

  // 这一场赢了能拿到的唯一件；claimed = 这个存档已经拿过。
  function rewardsOf(e) {
    if (!e) return [];
    let raw = [];
    if (st.mode === 'camp') { const [ci, si] = String(e.key).split(',').map(Number); raw = (SA.CAMPAIGN[ci] && SA.CAMPAIGN[ci].stages[si].uniqueLoot) || []; }
    if (st.mode === 'side') raw = SA.Side.find(e.key)?.ep.uniqueLoot || [];
    // 唯一腿型按变体身份记账和起名（「步行履带」而不是「钢四足底盘」）
    return raw.map(r => {
      const leg = r.key ? (SA.LEG_VARIANTS || []).find(x => x.key === r.key) : null;
      return { id: r.id, mt: (leg && leg.mt) || r.mt || 1, name: leg ? leg.name : null, claimed: SA.S.hasUnique(r.key || r.id) };
    });
  }
  // ---------- 页面（界面重建 v3）：左黑板赛程 · 中对决海报 · 右对手档案 + 下注凭单 + 调速杆 ----------
  function render() {
    if (!root || !root.isConnected) return;
    const D = d(), UI = SA.PX.ui;
    root.innerHTML = '';
    if (st.mode === 'route') { renderRoute(); return; }
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

  // 支线开放条件里的主线关：做好了写关名，没做好写「第几章第几关」
  function sideStage(key) {
    const [ci, si] = String(key).split(',').map(Number), stage = SA.Camp.stage(ci, si);
    return stage ? stage.name : SA.Config.text('arena_side_stage', ci, si + 1);
  }
  // ---------- 左：黑板（打过的划掉，要打的圈起来，选中的框起来；底下粉笔画场地）----------
  function tabsEl() {
    const D = d(), ms = modes();
    return ms.length > 1 ? h('div', { class: 'ch-tabs' }, ms.map(([k, n]) => h('button', { class: `ch-tab ${st.mode === k ? 'on' : ''}`, onclick: () => { st.mode = k; render(); } }, n, k === 'tour' ? ` · ${D.round + 1}` : ''))) : null;
  }
  function board(list, cur) {
    const D = d(), UI = SA.PX.ui, X = SA.PX;
    const tabs = tabsEl();
    const line = (e) => {
      const name = st.mode === 'camp' ? e.name : st.mode === 'side' ? SA.Config.text('arena_side_row', e.index + 1, e.name) : e.title.replace(/^第 \d+ 轮 · /, '');
      const done = e.replay || (e.tag && e.tag[0] === 'ok'), next = e.next || (e.tag && e.tag[0] === 'next');
      const w = Math.round(([...name].length * 18 + 8) / 2);
      return h('button', { class: `ch-row ${cur && cur.key === e.key ? 'on' : ''} ${e.lock && !done ? 'lock' : ''}`, 'data-page-key': `arena:${st.mode}:${e.key}`, onclick: () => { st.pick[st.mode] = e.key; render(); } },
        h('span', { class: 'ck' }, done ? '✓' : ''),
        h('span', { class: 'nm' }, name, done ? UI.img(X.chalkLine(w), 2, 'position:absolute;left:-4px;top:11px') : null,
          next ? UI.img(X.ellipse(w + 10, 17, SA.PAL.fire[3], 0.06), 2, 'position:absolute;left:-14px;top:-4px') : null),
        h('span', { class: 'who' }, e.boss || (e.tag && e.tag[1] === 'Boss') ? 'Boss' : (e.pilot || '').split(' ').pop()),
        rewardsOf(e).filter(x => !x.claimed).length ? h('span', { class: 'uq', title: SA.Config.text("arena_c99992c3e6ed") }, '★') : null);
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
        // 这一章还没做完：已有的关下面写一行「还有几关 · 制作中」
        const chapter = SA.CAMPAIGN[ci], left = SA.Camp.plannedStages(chapter) - chapter.stages.filter(x => !x.unfinished).length;
        if (open && left > 0) rows.push(h('div', { class: 'ch-row lock' }, h('span', { class: 'ck' }, '…'), h('span', { class: 'nm' }, SA.Config.text('arena_stages_wip', left))));
      }
      const nextCh = SA.CAMPAIGN[SA.Camp.chIndex() + 1];
      if (nextCh && !SA.Camp.done()) rows.push(h('div', { class: 'ch-row lock' }, h('span', { class: 'ck' }, '?'), h('span', { class: 'nm' }, SA.Config.text("arena_b3dca196e267", `${nextCh.name.split(' · ').pop()}`))));
    } else if (st.mode === 'side') {
      // 支线：每条线一个标题，下面是开放的关；还没做好的写「制作中」，下一关只写开放条件
      const lock = (text) => h('div', { class: 'ch-row lock' }, h('span', { class: 'ck' }, '…'), h('span', { class: 'nm' }, text));
      rows = [];
      for (const { line: L, rows: eps } of SA.Side.board()) {
        rows.push(h('div', { class: 'ch-head open', 'data-page-key': `side:${L.id}` }, '▾ ', L.name));
        for (const r of eps) {
          const e = list.find(x => x.key === r.ep.id);
          if (r.state === 'open' && e) rows.push(line(e));
          else if (r.state === 'wip') rows.push(lock(SA.Config.text('arena_side_wip', r.i + 1)));
          else if (r.state === 'locked') rows.push(lock(r.after ? SA.Config.text('arena_side_after', r.i + 1, sideStage(r.after)) : SA.Config.text('arena_side_wip', r.i + 1)));
        }
      }
    } else rows = list.map(line);
    const foot = st.mode === 'side' ? h('div', { class: 'ch-foot' }, SA.Config.text('arena_side_foot'))
      : st.mode === 'street' ? h('button', { class: 'ch-tab', onclick: () => { SA.Street.offers(true); render(); } }, SA.Config.text("arena_b111553da074"))
      : st.mode === 'camp' ? h('div', { class: 'ch-foot' }, SA.Config.text("arena_76babf5f99db")) : null;
    // 黑板左下角钉一块朝左的木路牌：直接回车间改车（和右下角的出战拉杆左右对着）
    return [tabs, h('div', { class: 'ch-list' }, rows), foot, garageSign()];
  }
  const garageSign = () => (SA.Camp.has('garage') ? h('div', { class: 'ar-garage' },
    SA.PX.ui.sign(SA.Config.text('home_98d39d5eed3f'), -1, 72, { onclick: () => SA.nav('garage'), title: SA.Config.text('arena_back_garage'), seed: 11 })) : null);

  // ---------- 出征页签（docs/expedition-plan.md V1）：左黑板列路线 · 中间海报画路线剖面 + 便签 · 右边装车单和出发拉杆 ----------
  // 路线定义读 SA.Route（js/route.js，astra）：get(id) 或 list() 的条目；字段按计划 §8.1（len / hills / mud / props / pickups / encounters / end）
  const routeOf = (id) => (SA.Route.get ? SA.Route.get(id) : null) || (SA.Route.list() || []).find(r => r.id === id) || null;
  const routeEnd = (r) => (r && r.end != null ? (r.end.x != null ? r.end.x : r.end) : (r && r.len) || 0);
  const meters = (px) => Math.round(px * 1.5 / 24);   // 一格 24px ≈ 1.5 m
  function renderRoute() {
    const D = d(), s = SA.V.stats(D.vehicle), routes = SA.Route.list() || [];
    if (!routes.some(r => r.id === st.pick.route)) st.pick.route = routes[0] ? routes[0].id : null;
    const r = st.pick.route ? routeOf(st.pick.route) : null;
    root.append(
      h('section', { class: 'ar-chalk', 'data-page-key': 'route-chalk' }, routeBoard(routes, r)),
      h('section', { class: 'ar-mid', 'data-page-key': 'route-mid' },
        h('div', { class: 'ar-poster px-sk px-sk-paperOld px-drop' }, SA.PX.ui.img(SA.PX.pin(), 2, 'position:absolute;left:50%;top:-16px;margin-left:-8px;z-index:2'), routePoster(r, s)),
        h('div', { class: 'ar-notes' }, routeNotes(r))),
      h('section', { class: 'ar-side', 'data-page-key': 'route-side' }, routeSide(r, s)));
  }
  function routeBoard(routes, cur) {
    const UI = SA.PX.ui, X = SA.PX;
    const rows = routes.map(r => {
      const done = !!r.cleared, name = r.name || r.id, w = Math.round(([...name].length * 18 + 8) / 2);
      return h('button', { class: `ch-row ${cur && cur.id === r.id ? 'on' : ''}`, 'data-page-key': `arena:route:${r.id}`, onclick: () => { st.pick.route = r.id; render(); } },
        h('span', { class: 'ck' }, done ? '✓' : ''),
        h('span', { class: 'nm' }, name, !done ? UI.img(X.ellipse(w + 10, 17, SA.PAL.fire[3], 0.06), 2, 'position:absolute;left:-14px;top:-4px') : null),
        h('span', { class: 'who' }, r.best ? `${meters(r.best)} m` : ''));
    });
    return [tabsEl(), h('div', { class: 'ch-list' }, rows), h('div', { class: 'ch-foot' }, SA.Config.text('route_list_foot')), garageSign()];
  }
  // 路线剖面（海报上用墨线画，原生像素、放大 2 倍）：地面线、土坡鼓包、泥地点点、木箱方块、路障叉、遭遇红圈、难民小人、遗迹齿轮、终点小旗
  function routeSketch(r, W = 236) {
    const X = SA.PX, INK = X.INK, RED = X.RED, k = X.C(W, 64), len = Math.max(1, routeEnd(r) || r.len || 1), G = 48;
    const sx = (x) => Math.round(x / len * (W - 14)) + 4;
    const yAt = (x) => { let y = 0; for (const hl of r.hills || []) { const d0 = Math.abs(x - hl.x); if (d0 < hl.w / 2) y = Math.max(y, hl.h * 0.5 * (1 + Math.cos(Math.PI * d0 / (hl.w / 2)))); } return G - Math.round(y / 4); };
    for (let px = 0; px < W - 6; px++) { const x = (px - 4) / (W - 14) * len; if (X.hash(px, 3, 7) > 0.08) k.p(px, yAt(x), INK); }
    for (const [a, b] of r.mud || []) for (let px = sx(a); px < sx(b); px += 3) k.p(px, G + 2, '#7a6a3a');
    const at = (o) => (o.x != null ? o.x : (o.x0 + o.x1) / 2);
    for (const p of r.props || []) {
      const x = sx(at(p)), y = yAt(at(p));
      if (p.kind === 'barricade') { X.line(k, x - 3, y - 7, x + 3, y - 1, INK); X.line(k, x + 3, y - 7, x - 3, y - 1, INK); }
      else if (p.kind === 'ruinDoor') { k.r(x - 4, y - 10, 2, 10, INK); k.r(x + 3, y - 10, 2, 10, INK); k.r(x - 4, y - 11, 9, 1, INK); }
      else { k.r(x - 2, y - 4, 5, 1, INK); k.r(x - 2, y - 4, 1, 4, INK); k.r(x + 2, y - 4, 1, 4, INK); }
    }
    for (const p of r.pickups || []) {
      const x = sx(at(p)), y = yAt(at(p));
      if (p.kind === 'refugee') { k.r(x - 2, y - 6, 2, 2, INK); k.r(x + 1, y - 5, 2, 2, INK); k.r(x - 3, y - 4, 7, 3, INK); }
      else if (p.kind === 'relic') { k.g.drawImage(X.gear(4, 6, X.RAMP.brass, 0), x - 4, y - 12); }
      else if (p.kind === 'coal') { k.r(x - 2, y - 2, 4, 2, '#323844'); }
      else if (p.kind === 'water') { k.r(x, y - 9, 1, 9, INK); k.r(x - 2, y - 11, 5, 3, '#1f7a86'); }
    }
    for (const e of r.encounters || []) { const x = sx(e.at), y = yAt(e.at) - 18; k.g.drawImage(X.ellipse(15, 13, RED, 0), x - 7, y - 6); X.line(k, x - 3, y - 2, x + 3, y + 2, RED); X.line(k, x + 3, y - 2, x - 3, y + 2, RED); }
    const ex = sx(routeEnd(r)), ey = yAt(routeEnd(r)); k.r(ex, ey - 16, 1, 16, INK); k.r(ex + 1, ey - 16, 7, 4, RED);
    return k.c;
  }
  function routePoster(r, s) {
    const D = d(), UI = SA.PX.ui, X = SA.PX;
    if (!r) return h('p', {}, SA.Config.text('arena_7bd3bb3555fd'));
    return [
      h('div', { class: 'ar-kick' }, SA.Config.text('route_where')),
      h('div', { class: 'ar-title' }, UI.img(X.brush(r.name || r.id, 22, X.INK, '#b59c6c', 3), 2)),
      h('div', { class: 'ar-route' }, UI.img(routeSketch(r), 2)),
      h('div', { class: 'ar-cars' }, engraved(D.vehicle, false)),
      h('div', { class: 'ar-prize' }, SA.Config.text('route_len', meters(routeEnd(r)))),
    ];
  }
  function routeNotes(r) {
    if (!r) return [];
    const UI = SA.PX.ui, X = SA.PX;
    const note = (title, ...body) => h('div', { class: 'ar-stick px-sk px-sk-note px-drop' }, UI.img(X.tape(24), 2, 'position:absolute;left:50%;top:-14px;margin-left:-24px'), h('div', { class: 'nt' }, title), ...body);
    const line = (key) => h('div', { class: 'nb' }, SA.Config.text(key));
    const terr = [(r.mud || []).length ? 'route_terrain_mud' : null, (r.hills || []).length ? 'route_terrain_hills' : null, (r.props || []).length ? 'route_terrain_crates' : null].filter(Boolean);
    const count = (kind) => (r.pickups || []).filter(p => p.kind === kind).length;
    return [
      terr.length ? note(SA.Config.text('route_note_terrain'), ...terr.map(line)) : null,
      note(SA.Config.text('route_note_find'), h('div', { class: 'nb' }, SA.Config.text('route_find', (r.encounters || []).length, count('refugee'), count('relic')))),
      note(SA.Config.text('route_note_home'), ...['route_home_depot', 'route_home_recall', 'route_home_stranded', 'route_home_wrecked'].map(line)),
    ];
  }
  function routeSide(r, s) {
    const D = d(), UI = SA.PX.ui;
    if (!r) return [];
    let chassis = '';
    SA.V.each(D.vehicle, (cell) => { if (!chassis && M[cell.id] && M[cell.id].layer === 'chassis') chassis = M[cell.id].name; });
    const field = (k, ...v) => h('div', { class: 'f' }, h('span', { class: 'k' }, k), h('span', {}, ...v));
    const cap = SA.Route.capacity ? SA.Route.capacity(D.vehicle) : null;   // R2：货位 / 煤量（astra 提供后自动显示）
    const card = h('div', { class: 'ar-dossier px-sk px-sk-kraft px-drop' }, UI.sk('paper', [
      h('div', { class: 'ar-dt' }, h('span', { class: 'px-h2' }, SA.Config.text('route_load_title'))),
      field(SA.Config.text('arena_58045ad11948'), D.vehicle.name), chassis ? field(SA.Config.text('arena_d55ac43b9ae9'), chassis) : null,
      field(SA.Config.text('arena_0e14d148b46b'), SA.kmh(s.topSpeed)),
      h('div', { class: 'px-small' }, SA.Config.text('route_load_coal')),
      cap && cap.cargo != null ? h('div', { class: 'px-small' }, SA.Config.text('route_load_cargo', cap.cargo)) : null,
      h('div', { class: 'px-small' }, SA.Config.text('route_load_slow'))]));
    const why = !s.canDeploy ? SA.Config.text('arena_ea58e9813630') : null;
    const go = () => {
      if (why) { SA.UI.toast(why); return; }
      document.querySelector('#modal').hidden = true;
      SA.Route.start(r.id);
    };
    return [
      card,
      ...readiness(s),
      h('div', { class: 'ar-go' }, UI.throttle({ title: why || `${SA.Config.text('route_tab')} · ${r.name || r.id}`,
        left: SA.Camp.has('garage') ? { label: SA.Config.text('arena_702c1bd28416'), go: () => SA.Home.closeBoard() } : null,
        right: { label: SA.Config.text('route_go'), go, disabled: why } }),
        why ? h('div', { class: 'px-cap' }, why) : null),
    ];
  }
  // 便签（贴在海报下面）：场地剖面、线人情报、能缴获的唯一件
  function notes(e) {
    if (!e) return [];
    const UI = SA.PX.ui, X = SA.PX, t = e.terrain && SA.TERRAINS[e.terrain], rs = rewardsOf(e);
    const note = (title, ...body) => h('div', { class: 'ar-stick px-sk px-sk-note px-drop' }, UI.img(X.tape(24), 2, 'position:absolute;left:50%;top:-14px;margin-left:-24px'), h('div', { class: 'nt' }, title), ...body);
    return [
      t ? note(SA.Config.text("arena_ef520ff326a4", `${t.name}`), UI.img(sketch(t, '#4a3a18', 76), 2), h('div', { class: 'nb', title: t.desc }, t.desc.split(/[。；]/)[0])) : null,
      e.blurb ? note(SA.Config.text("arena_0499bfda46ca"), h('div', { class: 'nb', title: e.blurb }, UI.hand(SA.Config.text("arena_741522735269", `${e.blurb}`), 14, 'white-space:normal'))) : null,
      rs.length ? note(SA.Config.text("arena_c51834a41645"), ...rs.map(r => h('div', { class: 'nu' }, SA.SPR.moduleCanvas(r.id, 0.5, r.mt),
        h('div', {}, h('b', {}, r.name || `${r.mt > 1 ? SA.MATS[r.mt].name : ''}${M[r.id].name}`), h('div', { class: 'px-small' }, r.claimed ? SA.Config.text("arena_260e1d99c461") : e.replay ? SA.Config.text("arena_8c9eaa468201") : SA.Config.text("arena_1c589341288b")))))) : null,
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
    if (!e) return h('p', {}, SA.Config.text("arena_7bd3bb3555fd"));
    const where = st.mode === 'camp' ? (() => { const [ci, si] = String(e.key).split(',').map(Number); return SA.Config.text("arena_d72d11a730b7", `${SA.CAMPAIGN[ci].name}`, `${si + 1}`); })()
      : st.mode === 'side' ? SA.Config.text('arena_side_where', SA.Side.find(e.key)?.line.name || '', e.index + 1) : st.mode === 'tour' ? SA.Config.text("arena_c177769a100d", `${Number(e.key) + 1}`) : SA.Config.text("arena_dc638f0b9759");
    const out = [
      h('div', { class: 'ar-kick' }, where),
      e.boss || (e.tag && e.tag[1] === 'Boss')
        ? h('div', { class: 'ar-title boss' }, UI.img(X.brush(SA.Config.text("arena_c56a1dfb49ec"), 34, X.RED, X.INK, 5), 2), UI.stamp('Boss', 'position:absolute;right:6px;top:10px'))
        : h('div', { class: 'ar-title' }, UI.img(X.brush(e.v?.name || e.name, 22, X.INK, '#b59c6c', 3), 2)),
      h('div', { class: 'ar-vs' },
        h('div', { class: 'who' }, oval(SA.Config.text("arena_a0c7716669b5")), h('div', { class: 'nm' }, h('b', {}, D.vehicle.name), h('span', { class: 'px-small' }, SA.Config.text("arena_b9905636ed01")), UI.num(s.rating))),
        h('div', { class: 'mid' }, UI.loop(h('span', { class: 'dui' }, SA.Config.text("arena_74570c72706a")), 42, 38, 7)),
        h('div', { class: 'who' }, oval(e.pilot), h('div', { class: 'nm' }, h('b', {}, e.v?.name || e.name), h('span', { class: 'px-small' }, SA.Config.text("arena_b9905636ed01")), UI.num(e.rating)))),
      h('div', { class: 'ar-cars' }, engraved(D.vehicle, false), engraved(e.v, true)),
      h('div', { class: 'ar-prize' }, e.replay ? UI.hand(SA.Config.text("arena_fc63d3ddb80e"), 14, 'white-space:normal')
        : e.prize ? [SA.Config.text("arena_f7bb3f29fe85"), UI.underline(UI.num(money(e.prize)), 30, 4), SA.Config.text("arena_dc4c740e190f")] : SA.Config.text("arena_aa2838275625")),
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
    if (s.problems.length) out.push(h('div', { class: 'ar-note' }, UI.hand(SA.Config.text("arena_e8c028877d36", `${s.problems.join('；')}`), 16, 'white-space:normal'),
      SA.Camp.has('garage') ? UI.btn(SA.Config.text("arena_9199b38df764"), { sm: true, onclick: () => SA.nav('garage') }) : null));
    if (hurt.length) out.push(h('div', { class: 'ar-note' }, UI.hand(SA.Config.text("arena_05a52db1749a", `${hurt.length}`), 16),
      UI.btn(SA.Config.text("arena_218d949df8a3", `${money(cost)}`), { sm: true, title: SA.Config.text("arena_414fbcf0218b", `${SA.UI.repairBrief(hurt)}`), onclick: () =>
        SA.UI.pay({ title: SA.Config.text("arena_a0b0db2e55b8"), amount: cost, okLabel: SA.Config.text("arena_a0b0db2e55b8"), confirm: false, lines: [SA.UI.repairList(hurt)], onPaid: () => { SA.S.repairCells(hurt); SA.UI.toast(SA.Config.text("arena_77de03b04937")); render(); } }) })));
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
      h('div', { class: 'ar-dt' }, h('span', { class: 'px-h2' }, SA.Config.text("arena_9ceddf319a3e")), e.boss ? UI.underline(UI.hand('Boss！', 20), 26, 6) : null),
      // 对手档案展示车辆铭牌；关卡标题仍由赛程和海报单独使用。
      field(SA.Config.text("arena_0d0dc4e4231d"), e.pilot || '—'), field(SA.Config.text("arena_58045ad11948"), e.v?.name || e.name), chassis ? field(SA.Config.text("arena_d55ac43b9ae9"), chassis) : null,
      field(SA.Config.text("arena_96fff2e26c8d"), UI.num(e.rating), h('span', { class: 'px-small' }, SA.Config.text("arena_9418357cc52f")), UI.num(s.rating)),
      field(SA.Config.text("arena_0e14d148b46b"), SA.kmh(fs.topSpeed), h('span', { class: 'px-small' }, fs.topSpeed > s.topSpeed * 1.2 ? SA.Config.text("arena_96be43b63aef") : fs.topSpeed < s.topSpeed * 0.8 ? SA.Config.text("arena_94d82552037a") : SA.Config.text("arena_2a57cb0e602a")))]));
    const why = e.lock || (!s.canDeploy ? SA.Config.text("arena_ea58e9813630") : null);
    const label = st.mode === 'camp' || st.mode === 'side' ? (e.replay ? SA.Config.text("arena_c0db7b4d07f1") : SA.Config.text("arena_a7caf88fcaa9")) : st.mode === 'tour' ? SA.Config.text("arena_a7caf88fcaa9") : SA.Config.text("arena_38c6f68eba39");
    const go = () => {
      if (why) { SA.UI.toast(why); return; }
      document.querySelector('#modal').hidden = true;
      // 第一次开打某一主线关时，支线的人可能先在路上拦住你（SA.Side：过场 + 正式战斗，打完那一关照旧没过）
      const ambush = st.mode === 'camp' && !e.replay && SA.Side ? SA.Side.ambushAt(e.key) : null;
      if (ambush) { SA.Side.start(ambush.ep.id, true); return; }
      SA.StoryDev.before({ key: st.mode === 'camp' ? e.key : 'current', replay: e.replay }, () => e.start());
    };
    return [
      D.news ? UI.sk('paper', [UI.stamp(SA.Config.text("arena_01b255a26588")), ' ', D.news], 'padding:0 6px;font-size:13px', 'px-drop') : null,
      dossier,
      betSlip(e),
      ...readiness(s),
      // 拉杆在正中：往左扳到底回院子（车间解锁后才有院子可回），往右推到底出战
      h('div', { class: 'ar-go' }, UI.throttle({ title: why || `${label} · ${e.name}`,
        left: SA.Camp.has('garage') ? { label: SA.Config.text("arena_702c1bd28416"), go: () => SA.Home.closeBoard() } : null,
        right: { label: `${label} →`, go, disabled: why } }),
        why ? h('div', { class: 'px-cap' }, why) : null,
        h('div', { class: 'px-cap' }, SA.Config.text("arena_e807569d1ac3"))),
    ];
  }
  // 下注凭单：印好的金额，押哪个就用红笔圈哪个；已押的圈着、可以撤回
  function betSlip(e) {
    const D = d(), UI = SA.PX.ui;
    if ((st.mode !== 'tour' && st.mode !== 'camp') || e.lock || e.replay || !SA.Camp.has('bet')) return null;
    const odds = SA.S.odds(e.raw, e.hpMul);
    const bet = SA.Config.get('rules').bet;
    const max = Math.max(0, Math.floor(D.money / bet.step) * bet.step);
    const opts = D.bet ? [D.bet.amount] : bet.amounts.filter(x => x <= max).concat(max > bet.amounts.at(-1) ? [max] : []);
    const pick = D.bet ? D.bet.amount : (st.bet != null && opts.includes(st.bet) ? st.bet : 0);
    const opt = (x) => h('button', { class: 'ar-opt', onclick: D.bet ? null : () => { st.bet = x; render(); } },
      x === pick ? UI.loop([x ? '■ ' : '■ ', x ? UI.num(money(x)) : SA.Config.text("arena_7c9567e20f32")], x ? 38 : 30, 19, 13 + x) : [x ? '□ ' : '□ ', x ? UI.num(money(x)) : SA.Config.text("arena_7c9567e20f32")]);
    return h('div', { class: 'ar-slip' },
      h('div', { class: 'stub px-sk px-sk-green' }, [...'0042'].map(ch => UI.num(ch, '#2e3a26'))),
      UI.sk('green', [
        h('div', { class: 'ar-st' }, SA.Config.text("arena_03d9ed2a2824")),
        h('div', {}, SA.Config.text("arena_57875902c2aa"), UI.num(`×${odds}`)),
        h('div', { class: 'ar-opts' }, opts.map(opt)),
        D.bet ? h('div', { class: 'ar-bet' }, UI.hand(SA.Config.text("arena_4f2102ac02bc", `${money(D.bet.amount * D.bet.odds)}`), 15), UI.btn(SA.Config.text("arena_6b5819895525"), { sm: true, onclick: () => { SA.S.cancelBet(); SA.UI.topbar(); render(); } }))
          : pick ? h('div', { class: 'ar-bet' }, UI.hand(SA.Config.text("arena_3744568f40c5", `${money(pick * odds)}`), 16), UI.btn(SA.Config.text("arena_f4fd8bf4a76a"), { sm: true, kind: 'pri', onclick: () => { SA.S.placeBet(pick, odds); st.bet = null; SA.UI.topbar(); SA.UI.toast(SA.Config.text("arena_efa9ac78224c", `${money(pick)}`)); render(); } }))
            : !max ? h('div', { class: 'px-small' }, SA.Config.text("arena_bcc74c52d3fc")) : null], 'flex:1;padding:0 6px', 'px-drop'));
  }

  return { open, render, unmount };
})();
