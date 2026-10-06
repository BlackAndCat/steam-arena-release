// 车间：改装台 + 商店 + 修理 + 蓝图库/分享码示例，全在这一页（主体层 / 侧挂层，像素 / 图纸视图）
// 操作集中在底部操作栏：选模块 → 连续点格子放置；右键优先取消选择，空手时才拆下指针下的模块。
// 操作栏可切到「蓝图库」：保存 / 应用 / 导入 / 导出分享码，内置示例也能直接套用。
// 车上的模块可以拖动（空格 = 移动，有模块 = 对调），拖出车外放回库存。
// 改装台上允许悬空、乱放；只有出战时才要求所有模块都连到底盘（SA.V.issues）。
window.SA = window.SA || {};

SA.Editor = (() => {
  const h = SA.h, K = SA.K, M = SA.MODULES, P = SA.PAL;
  const PADX = SA.SPR.PADX, C = K.CELL;
  const W = K.COLS * C + PADX * 2, H = K.ROWS * C + 12;
  const DRAG_PX = 6;
  // 蓝图缩放（2026-09-30 用户：缩小会露出一大片不像蓝图的底色、缩放发糊）：
  // 只用整数倍 1 / 2 / 3（画布只有 W×H 个像素，小数倍一重采样就糊、缩小就丢像素），最小 1 倍；关掉平滑、平移取整。
  // 蓝图纸比画布左右各宽 MX，平移（拖动 / 缩放锚点 / 打开时让车居中）始终夹在纸的范围里，永远看不到纸外面。
  const ZOOMS = [1, 2, 3], MX = 5 * C;
  // sel：准备连续放置的库存 / 商店键（id 或 id@材料，见 SA.invKey）；pick：车上选中的格子 { layer, r, c }
  // dock：底部操作栏显示「模块」还是「蓝图库」；bp：蓝图库里选中的蓝图 key；bpFilter：蓝图来源筛选
  const st = { layer: 'body', sel: null, pick: null, hover: null, stats: null, tab: 'all', plateOpen: null, press: null, drag: null, msg: null, noClick: false,
    dock: 'mods', bp: null, bpFilter: 'all', shop: false, cat: loadCat(), zoom: 1, panX: 0,
    // up：升级材质模式（点模块逐件升级）；shift：Shift 是否按着（模式里预览全部升级）；flash：刚升级的模块闪一下金光
    up: false, shift: false, flash: null };
  // 商店分组的折叠状态记在本机
  // 模块清单的纸页签：一次只看一类（界面重建 v3，替换原来的折叠条）；记住上次看的是哪一类
  function loadCat() { try { return localStorage.getItem('steam_arena_cat_v1') || null; } catch (e) { return null; } }
  // 关卡车工作台共用编辑器，但其分类选择不写入普通游戏车间的偏好。
  const stageWorkbench = () => !!document.querySelector('#assembly-screen > #screen');
  function saveCat() { if (stageWorkbench()) return; try { localStorage.setItem('steam_arena_cat_v1', st.cat || ''); } catch (e) { /* ignore */ } }
  let cv, g, stage, tipEl, viewEl, ctxEl, toolsEl, invEl, dockEl, tabsEl, plateEl, ghost, ro, frame = null, sheetEl = null, leverEl = null;
  // 工具页工单共用本轮性能单诊断，避免重复计算；普通车间始终为 null。
  let sheetDiagnosis = null;

  const d = () => SA.S.d;
  const veh = () => d().vehicle;
  const money = (n) => SA.UI.money(n);
  const hurt = (cell) => cell && cell.hp > 0 && cell.hp < SA.V.maxHp(cell);
  const where = (r, c) => SA.Config.text("editor_817a33140466", `${K.ROWS - r}`, `${c + 1}`);   // 子格坐标，从地面往上数
  const kid = (k) => SA.parseKey(k).id, kmt = (k) => SA.parseKey(k).mt;
  const has = (f) => SA.Camp.has(f);
  // 蓝图库：功能开放了、而且到了第二章（战役序号 2）才显示
  const bpOpen = () => has('blueprints') && (SA.Camp.done() || SA.Camp.chIndex() >= 2);
  // 商店里能买的：商店已开放、战役已解锁这种模块（只卖黄铜，更好的材料在车上升级）
  const buyable = (id) => SA.S.buyable(id);
  const matName = (mt) => SA.MATS[mt].name;
  const fullName = (id, mt) => (mt > 1 ? `${matName(mt)}${M[id].name}` : M[id].name);
  const issueAt = (layer, r, c) => st.stats.issues.find(x => x.layer === layer && x.r === r && x.c === c);

  function open(dock) {
    // 重开车间先取消上一帧（包括首次 fit 回调），始终只保留一条绘制循环。
    if (frame !== null) cancelAnimationFrame(frame);
    if (dock) st.dock = dock;
    if (st.dock === 'bps' && !bpOpen()) st.dock = 'mods';
    if (stageWorkbench()) st.cat = 'all';
    SA.go('garage');
    const screen = document.querySelector('#screen');
    screen.innerHTML = '';
    Object.assign(st, { sel: null, pick: null, hover: null, press: null, drag: null, msg: null, zoom: 1, panX: 0, wheelAcc: 0, up: false, shift: false, flash: null });
    if (st.plateOpen == null) st.plateOpen = window.innerWidth >= 1700;   // 展开的铭牌会盖住格子，默认收成一行
    st.stats = SA.V.stats(veh());
    centerView();

    cv = h('canvas', { class: 'px', width: W, height: H });
    g = cv.getContext('2d');
    tipEl = h('div', { class: 'ed-tip' });
    plateEl = h('div', { class: 'ed-sheet-paper px-sk px-sk-paper' });
    sheetEl = h('aside', { class: 'ed-sheet px-sk px-sk-iron px-drop' }, SA.PX.ui.img(SA.PX.bigClip(34), 2, 'position:absolute;left:50%;top:-6px;margin-left:-34px;z-index:2'), plateEl);
    viewEl = h('div', { class: 'ed-view' });
    leverEl = h('div', { class: 'ed-lever' });
    stage = h('div', { class: 'ed-stage' }, cv, viewEl, tipEl,
      h('button', { class: 'ed-help', title: `${SA.Config.text("editor_a21fcfac4591")} · ${SA.Config.text('editor_whole_move_hint')}`, 'aria-label': SA.Config.text("editor_a21fcfac4591"), onclick: openHelp }, '?'));
    // 中间：画布 + 下方操作栏；右边：模块清单 / 蓝图库（拖出车外的模块丢到这里就回库存）
    ctxEl = h('div', { class: 'dock-ctx' });
    toolsEl = h('div', { class: 'panel-tools' });
    invEl = h('div', { class: 'panel-list' });
    dockEl = h('aside', { class: 'ed-panel' }, toolsEl, invEl);
    tabsEl = h('nav', { class: 'ed-tabs' });
    screen.append(h('div', { class: 'ed' }, sheetEl, h('div', { class: 'ed-main' }, stage, h('div', { class: 'ed-dock' }, ctxEl, leverEl)), h('div', { class: 'ed-cat' }, dockEl, tabsEl)));

    cv.addEventListener('pointerdown', onCanvasDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointercancel', cancelPress);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('pointerleave', () => { if (!st.press) st.hover = null; });
    // 取消拖动会释放指针捕获；松手可能落在画布外，统一接收才能拦住随后合成的点击。
    document.addEventListener('pointerup', onUp);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onShift);
    document.addEventListener('keyup', onShift);
    window.addEventListener('blur', onShift);
    if (ro) ro.disconnect();
    ro = new ResizeObserver(fit);
    ro.observe(stage);
    renderAll();
    frame = requestAnimationFrame(() => { fit(); loop(); });
    // 页面教程（js/tutorial.js）：第一次进车间讲装水罐和性能单，商店第一次开张时指一下开关；后台拼装台不讲
    if (SA.Guide && !stageWorkbench() && !SA.Camp.isDesignMode()) SA.Guide.garage();
  }
  // 教程用：把清单翻到这个模块所在的那一类（shop 决定是否打开商店），返回清单里那一行
  function focusInv(id, shop) {
    if (!invEl || !invEl.isConnected || !M[id]) return null;
    if (shop != null) st.shop = !!shop && has('shop');
    st.cat = M[id].cat;
    renderTools(); renderInv();
    const row = invEl.querySelector(`.mrow[data-page-key^="inventory:${id}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    return row;
  }

  // 弹窗关闭后由 SA.UI.refresh 调用：钱、库存可能变了
  function refresh() {
    if (!cv || !cv.isConnected) return;
    st.stats = SA.V.stats(veh());
    renderAll();
  }

  function onKey(e) {
    if (SA.current !== 'garage' || !document.querySelector('#modal').hidden) return;
    if (e.target.matches && e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape') cancelSelection();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && st.pick) { e.preventDefault(); removeAt(st.pick); }
  }
  // Shift 按下 / 松开（弹窗开着也记，免得关窗后状态卡住）；切走窗口一律当松开
  function onShift(e) {
    if (e.type === 'blur') st.shift = false;
    else if (e.key === 'Shift') st.shift = e.type === 'keydown';
  }

  function fit() {
    if (!cv || !stage.isConnected) return;
    const aw = stage.clientWidth - 16, ah = stage.clientHeight - 16;
    let s = Math.min(aw / W, ah / H);
    s = s >= 1 ? Math.floor(s * 4) / 4 : Math.max(0.3, s);
    cv.style.width = `${Math.round(W * s)}px`;
    cv.style.height = `${Math.round(H * s)}px`;
  }

  // 鼠标先按画布的 CSS 大小换算，再逆向还原平移与缩放；fr / fc 用于模块中心对准鼠标。
  function cellAtXY(x0, y0) {
    const rc = cv.getBoundingClientRect();
    if (x0 < rc.left || x0 > rc.right || y0 < rc.top || y0 > rc.bottom) return null;
    const x = ((x0 - rc.left) / rc.width * W - st.panX) / st.zoom;
    const y = ((y0 - rc.top) / rc.height * H - K.ROWS * C * (1 - st.zoom)) / st.zoom;
    const fc = (x - PADX) / C, fr = y / C, c = Math.floor(fc), r = Math.floor(fr);
    return r >= 0 && r < K.ROWS && c >= 0 && c < K.COLS ? { r, c, fr, fc } : null;
  }
  function onWheel(e) {
    e.preventDefault();
    // 模块按压或拖动期间固定落点；deltaMode 换算后各设备的滚轮幅度一致。
    if (st.press || st.drag) return;
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientHeight : 1);
    // 滚轮一格（约 100）换一档；触控板的小幅滚动先攒着，攒够一档再换
    st.wheelAcc = (Math.sign(delta) === Math.sign(st.wheelAcc) ? st.wheelAcc : 0) + delta;
    if (Math.abs(st.wheelAcc) < 60) return;
    const i = ZOOMS.indexOf(st.zoom), zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (st.wheelAcc < 0 ? 1 : -1)))];
    st.wheelAcc = 0;
    if (zoom === st.zoom) return;
    const rc = cv.getBoundingClientRect();
    const x = (e.clientX - rc.left) / rc.width * W;
    // 鼠标下的蓝图横坐标不变；纵向始终以地面底线为缩放锚点。
    st.panX = clampPan(x - (x - st.panX) * zoom / st.zoom, zoom);
    st.zoom = zoom;
    st.hover = cellAtXY(e.clientX, e.clientY);
  }
  // 平移夹在蓝图纸里：纸在蓝图坐标 [-MX, W + MX]，画面 [0, W] 必须整个落在纸上；取整，像素不会错位
  function clampPan(p, z = st.zoom) { return Math.round(Math.max(W - z * (W + MX), Math.min(z * MX, p))); }
  // 打开车间：1 倍，车（已装的模块）左右居中
  function centerView() {
    let c0 = K.COLS, c1 = -1;
    SA.V.each(veh(), (cell, r, c) => { c0 = Math.min(c0, c); c1 = Math.max(c1, c + SA.fp(cell.id).w - 1); });
    const cx = c1 < 0 ? W / 2 : PADX + (c0 + c1 + 1) / 2 * C;
    st.zoom = 1; st.wheelAcc = 0; st.panX = clampPan(W / 2 - cx, 1);
  }
  // 把模块 id 摆到鼠标位置：模块中心对准鼠标（底盘自动贴到最底两行），返回锚点和会压到的模块（ignore 的锚点除外）
  const overCanvas = (x, y) => { const rc = cv.getBoundingClientRect(); return x >= rc.left && x <= rc.right && y >= rc.top && y <= rc.bottom; };

  function say(text, err) { st.msg = { text, err: !!err, at: performance.now() }; }

  // ---------- 指针：点击 / 拖动 ----------
  // 库存、商店、车上点选和拖动共用取消逻辑；模块尚未落下时不扣库存，也不拆走原件。
  function cancelSelection() {
    if (st.press) st.noClick = true;
    st.sel = null; st.pick = null; st.bp = null;
    if (st.up) { st.up = false; renderView(); }
    cancelPress();
    renderDock();
  }

  function onContextMenu(e) {
    if (SA.current !== 'garage' || !document.querySelector('#modal').hidden) return;
    if (st.sel || st.pick || st.press || st.drag || st.up) {
      e.preventDefault();
      cancelSelection();
      return;
    }
    if (e.target !== cv) return;
    e.preventDefault();
    const cell = cellAtXY(e.clientX, e.clientY);
    if (!cell) return;
    st.hover = cell;
    const v = veh();
    const layer = SA.V.at(v, st.layer, cell.r, cell.c) ? st.layer : SA.V.at(v, 'body', cell.r, cell.c) ? 'body' : null;
    if (layer) { const o = SA.V.at(v, layer, cell.r, cell.c); removeAt({ layer, r: o.r, c: o.c }); }
  }

  function onCanvasDown(e) {
    if (e.button !== 0) return;   // 右键统一在 contextmenu 处理，避免取消选择的同一次点击又拆掉模块。
    e.preventDefault();
    const cell = cellAtXY(e.clientX, e.clientY);
    st.hover = cell;
    // 升级材质模式：Shift + 点击 = 全部升级；单点在松手时升级指针下的模块，按住拖动仍然平移蓝图（模块不能拖）
    if (st.up) {
      if (e.shiftKey) { upAll(); return; }
      beginPress(e, { kind: 'pan', cell, panX: st.panX, up: true });
      return;
    }
    if (!cell) { if (st.sel) { emptyTap(null); return; } beginPress(e, { kind: 'pan', cell: null, panX: st.panX }); return; }
    const v = veh();
    // Shift 在按下时锁定整车模式；侧挂层也允许从可见的主体模块抓起。
    const so = SA.V.at(v, 'side', cell.r, cell.c), bo = SA.V.at(v, 'body', cell.r, cell.c);
    if (e.shiftKey && (so || bo)) { beginPress(e, { kind: 'whole', startFc: cell.fc }); return; }
    if (st.sel) { placeAt(st.sel, cell); return; }
    const here = SA.V.at(v, st.layer, cell.r, cell.c);
    if (here) { beginPress(e, { kind: 'cell', layer: st.layer, r: here.r, c: here.c, id: here.cell.id, key: SA.invKey(here.cell.id, here.cell.mt) }); return; }
    // 空白按压暂不执行点击：超过阈值平移蓝图，否则松手时仍执行原来的空格操作。
    beginPress(e, { kind: 'pan', cell, panX: st.panX });
  }

  function emptyTap(cell) {
    if (!cell) { if (st.pick) { st.pick = null; renderDock(); } return; }
    if (st.pick) moveTo(st.pick, cell);
    else if (st.layer === 'side' && SA.V.at(veh(), 'body', cell.r, cell.c)) say(SA.Config.text("editor_5cf43ce05f93"));
  }

  function beginPress(e, src) {
    st.press = { src, x: e.clientX, y: e.clientY, pid: e.pointerId, el: e.currentTarget };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onMove(e) {
    st.shift = e.shiftKey;
    const p = st.press;
    if (!p || p.pid !== e.pointerId) {
      if (e.currentTarget === cv) st.hover = cellAtXY(e.clientX, e.clientY);
      return;
    }
    if (p.src.kind === 'pan') {
      if (!st.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) st.drag = p.src;
      if (st.drag) st.panX = clampPan(p.src.panX + (e.clientX - p.x) / cv.getBoundingClientRect().width * W);
      st.hover = cellAtXY(e.clientX, e.clientY);
      return;
    }
    if (!st.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) {
      st.drag = p.src;
      if (p.src.kind !== 'whole') makeGhost(p.src.key);
    }
    if (st.drag) {
      st.hover = cellAtXY(e.clientX, e.clientY);
      moveGhost(e.clientX, e.clientY);
      dockEl.classList.toggle('drop', st.drag.kind === 'cell' && !overCanvas(e.clientX, e.clientY));
    }
  }

  function onUp(e) {
    if (SA.current !== 'garage' || e.button !== 0) return;
    // 拖动中右键 / Esc 取消后，仍需抑制这次左键松手产生的 click，随后恢复正常点选。
    if (st.noClick) setTimeout(() => { st.noClick = false; }, 0);
    const p = st.press;
    if (!p || p.pid !== e.pointerId) return;
    const src = p.src, drag = st.drag;
    const target = cellAtXY(e.clientX, e.clientY);
    const inside = overCanvas(e.clientX, e.clientY);
    cancelPress();
    if (src.kind === 'pan') {
      st.hover = target;
      if (drag) { st.noClick = true; setTimeout(() => { st.noClick = false; }, 0); }
      else if (src.up) { const o = upTarget(src.cell); if (o) upOne(o); }
      else emptyTap(src.cell);
      return;
    }
    if (!drag) { if (src.kind === 'cell') tapCell(src); return; }
    st.noClick = true;   // 拖完松手不再触发库存按钮的 click
    setTimeout(() => { st.noClick = false; }, 0);
    st.hover = target;
    if (src.kind === 'whole') { if (target) moveWhole(Math.round(target.fc - src.startFc)); return; }
    if (src.kind === 'inv') { if (target) placeAt(src.key, target); return; }
    if (target) moveTo(src, target);
    else if (!inside) removeAt(src);
  }

  function cancelPress() {
    if (st.press && st.press.el) try { st.press.el.releasePointerCapture(st.press.pid); } catch (err) { /* ignore */ }
    st.press = null; st.drag = null;
    dropGhost();
    if (dockEl) dockEl.classList.remove('drop');
  }

  function makeGhost(key) {
    dropGhost();
    const s = cv.getBoundingClientRect().width / W * st.zoom;
    const id = kid(key), f = SA.fp(id);
    const img = SA.SPR.moduleCanvas(id, s, kmt(key));
    ghost = h('div', { class: 'ed-ghost' }, img);
    // 模块在卡片画布里底边对齐，鼠标对准模块中心
    ghost._ox = (2 + f.w * C / 2) * s; ghost._oy = (2 + K.ART - f.h * C / 2) * s;
    document.body.append(ghost);
  }
  function moveGhost(x, y) { if (ghost) ghost.style.transform = `translate(${x - ghost._ox}px, ${y - ghost._oy}px)`; }
  function dropGhost() { if (ghost) ghost.remove(); ghost = null; }

  // ---------- 操作 ----------
  function tapCell(src) {
    const same = st.pick && st.pick.layer === src.layer && st.pick.r === src.r && st.pick.c === src.c;
    st.pick = same ? null : { layer: src.layer, r: src.r, c: src.c };
    st.sel = null;
    renderDock();
  }

  function changed() {
    st.stats = SA.V.stats(veh());
    SA.S.save();
    SA.UI.topbar();
    renderAll();
  }

  // 拆下来的模块：完好的连同材料回库存，报废的按总价值 10% 回收；改装件拆掉按一半折价回收

  // ---------- 升级材质：熟铁解锁后画布上方出现「升级材质」按钮 ----------
  // 按下进入升级模式：点车上的模块逐件升一级（钱够直接升，不弹窗；要消耗锭的仍确认）；悬停的模块金色闪烁。
  // Shift + 点击（画布或按钮）= 全部升级：只把材料最低的那一档各升一级，中高档的不跟着升，弹窗确认。
  const upOpen = () => SA.Camp.maxMat() > 1;
  function setUp(on) {
    st.up = !!on && upOpen();
    if (st.up) { st.sel = null; st.pick = null; }
    renderView(); renderDock();
  }
  // 指针下的模块：侧挂层优先看侧挂，其余先主体（和底部纸条同一规则）
  function upTarget(hv) {
    if (!hv) return null;
    const v = veh(), so = SA.V.at(v, 'side', hv.r, hv.c), bo = SA.V.at(v, 'body', hv.r, hv.c);
    const o = (st.layer === 'side' && so) || bo || so;
    return o && { layer: o === so ? 'side' : 'body', r: o.r, c: o.c, cell: o.cell };
  }
  function upCheck(cell) {
    if (cell.hp <= 0) return { ok: false, why: SA.Config.text('editor_up_wreck') };
    const u = SA.S.matUpInfo(cell);
    return u.ok || u.why ? u : { ...u, why: SA.Config.text('editor_up_max') };
  }
  // 全部升级的名单：能直接花钱升的模块里（乌兹钢 / 以太合金要消耗锭，只能逐件升），材料最低的那一档
  function upPlan() {
    const all = [];
    SA.V.each(veh(), (cell, r, c, layer) => {
      if (cell.hp <= 0) return;
      const u = SA.S.matUpInfo(cell);
      if (u.ok && !u.mat.ingot) all.push({ cell, r, c, layer, u });
    });
    if (!all.length) return null;
    const low = Math.min(...all.map(x => x.cell.mt || 1));
    const list = all.filter(x => (x.cell.mt || 1) === low);
    return { from: SA.MATS[low].name, to: SA.MATS[low + 1].name, list, cost: list.reduce((a, x) => a + x.u.cost, 0) };
  }
  function upFlash(list) { st.flash = { list: list.map(x => ({ layer: x.layer, r: x.r, c: x.c })), at: performance.now() / 1000 }; }
  // 单件升级的弹窗内容（只在要消耗锭、或钱不够要贷款时出现）：新材料的样子和属性变化
  function upLines(cell, u) {
    const m0 = SA.mod(cell), m1 = SA.mod(cell.id, u.to);
    const diff = [[SA.Config.text("editor_5ad0c596f2dc"), 'hp'], [SA.Config.text("editor_30e1196888bd"), 'dmg'], [SA.Config.text("editor_c9f16bb1e9d3"), 'supply'], [SA.Config.text("battle_327b54d04f71"), 'water'], [SA.Config.text("editor_6cac16b39789"), 'cool'], [SA.Config.text("editor_2a28bc59be31"), 'ram'], [SA.Config.text("editor_d1cffb2453cb"), 'punch'], [SA.Config.text("editor_6fd9e54a0016"), 'load'], [SA.Config.text("editor_c18d8f09cb26"), 'armor']]
      .filter(([, k]) => m0[k]).map(([n, k]) => `${n} ${k === 'load' ? SA.tons(m0[k]) : m0[k]} → ${k === 'load' ? SA.tons(m1[k]) : m1[k]}`);
    return [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(cell.id, 1, u.to), h('div', {}, h('b', {}, fullName(cell.id, u.to)), ' ', SA.Camp.matChip(u.to),
      h('div', { class: 'muted' }, diff.join(' · ')))),
      u.mat.ingot ? h('p', { class: 'muted' }, SA.Config.text("editor_285778663729", `${SA.INGOTS[u.mat.ingot].name}`, `${(d().ingots[u.mat.ingot] || 0) - 1}`)) : null,
      h('p', { class: 'muted' }, SA.Config.text("editor_c71321d5beac"))];
  }
  function upOne(o) {
    const cell = o.cell, u = upCheck(cell);
    if (!u.ok) { say(`${fullName(cell.id, cell.mt || 1)}：${u.why}`, true); return; }
    SA.UI.pay({ title: SA.Config.text("editor_7e10b9ed146f", `${u.mat.name}`), amount: u.cost, okLabel: SA.Config.text("editor_1adfa1565dd1", `${u.mat.name}`),
      confirm: !!u.mat.ingot, lines: upLines(cell, u),
      onPaid: () => {
        if (!SA.S.upgradeMaterial(cell, u)) return;
        upFlash([o]);
        say(SA.Config.text("editor_8e4ff009357b", `${M[cell.id].name}`, `${u.mat.name}`));
        changed();
      } });
  }
  function upAll() {
    const p = upPlan();
    if (!p) { say(SA.Config.text('editor_up_none'), true); return; }
    const count = new Map();
    for (const x of p.list) count.set(x.cell.id, (count.get(x.cell.id) || 0) + 1);
    SA.UI.pay({ title: SA.Config.text('editor_up_all_title'), amount: p.cost, okLabel: SA.Config.text('editor_up_all_ok', p.to),
      lines: [h('p', { style: 'margin-top:0' }, SA.Config.text('editor_up_all_body', `${p.list.length}`, p.from, p.to)),
        h('p', {}, [...count].map(([id, n]) => `${M[id].name}${n > 1 ? ` ×${n}` : ''}`).join('、')),
        h('p', { class: 'muted' }, SA.Config.text('editor_up_all_note'))],
      onPaid: () => {
        const done = p.list.filter(x => SA.S.upgradeMaterial(x.cell, x.u));
        upFlash(done);
        say(SA.Config.text('editor_up_all_done', `${done.length}`, p.to));
        changed();
      } });
  }

  // 改装：炮盾 / 附加装甲，每级加耐久和重量
  function upgrade(cell) {
    const lv = (cell.lv || 0) + 1, cost = SA.upCost(cell.id, lv), name = SA.upName(cell.id);
    SA.UI.pay({ title: SA.Config.text("editor_3dfbde750776", `${name}`), amount: cost, okLabel: SA.Config.text("editor_404bae5773c3", `${name}`),
      lines: [h('p', { style: 'margin-top:0' }, SA.Config.text("editor_2a7bbb092bcc", `${M[cell.id].name}`, `${lv}`, `${Math.round(SA.upHp(cell.id) * 100)}`, `${SA.K.UP_KG}`)),
        h('p', { class: 'muted' }, SA.Config.text("editor_ac9c5c11c338"))],
      onPaid: () => {
        SA.S.upgradeCell(cell, lv);
        st.pick = null;
        say(SA.Config.text("editor_4ea9417c56d2", `${M[cell.id].name}`, `${name}`, `${'▲'.repeat(lv)}`));
        changed();
      } });
  }

  // 专项改造与原附加装甲共用现有菜单和支付入口；说明同时展示能力增益与腿部降速代价。
  function refit(cell) {
    const level = SA.refitLevel(cell) + 1;
    if (!SA.refitKind(cell.id) || cell.hp <= 0 || level > K.UP_MAX) return;
    if (!SA.V.bipedOf(veh())) { say('专项改造仅限双足，请先移到双足底盘上。', true); return; }
    const info = SA.refitInfo(cell, level);
    SA.UI.pay({ title: info.name, amount: info.cost, okLabel: `${info.name} ${level} 级`,
      lines: [h('p', { style: 'margin-top:0' }, `${M[cell.id].name} · ${info.name} ${level} 级：${info.text}`),
        h('p', { class: 'muted' }, '专项改造不增加重量；拆回仓库仍保留改造等级。')],
      onPaid: () => {
        if (!SA.S.refitCell(cell, level)) return;
        say(`${M[cell.id].name} · ${info.name} ${level} 级`);
        changed();
      } });
  }
  // 合并库存行默认使用第一个实例，校验必须与后台实际取件保持一致。
  const stockCell = (id, mt) => SA.S.stockOptions(id, mt)[0] || null;

  // 库存不够就自动购买，只有钱不够才提示贷款；仍按商店解锁和可售材料检查。
  function withStock(key, then) {
    if (d().inv[key] > 0) { then(); return; }
    const id = kid(key), m = M[id];
    if (kmt(key) !== SA.buyMt(id) || !buyable(id)) { say(has('shop') ? SA.Config.text("editor_6cf70cc8390e", `${m.name}`) : SA.Config.text("editor_b5b94de06ec2"), true); st.sel = null; renderDock(); return; }
    // 钱够就直接买，不弹确认；钱不够才会问要不要贷款
    SA.UI.pay({
      title: SA.Config.text("editor_1abee404f72e", `${fullName(id, SA.buyMt(id))}`), amount: SA.buyPrice(id), okLabel: SA.Config.text("editor_f753a207c3ea"), confirm: false,
      lines: [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(id, 1), h('div', {}, h('b', {}, m.name), h('div', { class: 'muted' }, SA.UI.statLine(id))))],
      onPaid: () => { SA.S.addInv(id, 1, SA.buyMt(id)); then(); },
    });
  }

  // 把库存里的模块放到鼠标位置：压着一个模块就替换它（同款同材料 = 拆下），压着好几个就不行
  function placeAt(key, hv) {
    const id = kid(key), mt = kmt(key);
    const v = veh(), layer = SA.V.layerOf(id), m = M[id];
    const sp = SA.V.editorSpot(id, hv, v), { r, c } = sp;
    if (!SA.V.boxInRegion(v, r, c, sp.w, sp.h)) { say(SA.Config.text("vehicle_bd09be8e512a"), true); return; }
    if (st.layer !== layer) st.layer = layer;
    if (sp.hits.length > 1) { say(SA.Config.text("editor_3c28233de0ef"), true); return; }
    const cur = sp.hits[0] || null;
    if (cur && cur.cell.id === id && (cur.cell.mt || 1) === mt) { removeAt({ layer, r: cur.r, c: cur.c }); return; }   // 同款再点一次 = 拆下
    if (cur && hurt(cur.cell)) { say(SA.Config.text("editor_3d2872b94543", `${M[cur.cell.id].name}`), true); st.pick = { layer, r: cur.r, c: cur.c }; st.sel = null; renderDock(); return; }
    // 底盘：一辆车只能用一种底盘，整件底盘（四足 / 双足）只能有一个——放新底盘时把冲突的旧底盘换下来，
    // 而不是在改装台上留下两个底盘、再把压在车身下面的那个标成不合规
    const clash = m.layer === 'chassis' ? SA.V.chassisClash(v, id, cur) : [];
    if (clash.some(o => hurt(o.cell))) { say(SA.Config.text("editor_00b2f48b7a4e", `${M[clash[0].cell.id].name}`), true); return; }
    // 换下旧模块后放不放得下（大小可能不一样），先在副本上试
    const test = SA.V.clone(v);
    if (cur) test[layer][cur.r][cur.c] = null;
    for (const o of clash) test.body[o.r][o.c] = null;
    const chk = SA.V.canPut(test, id, r, c, stockCell(id, mt));
    if (!chk.ok) { say(chk.reason, true); return; }
    withStock(key, () => {
      const old = cur && cur.cell;
      const scrap = SA.S.installStock(v, id, r, c, mt, layer, cur, clash);
      // 点选和拖入都保留同一放置模板；库存用尽后，下一次放置继续走购买 / 借贷流程。
      st.sel = key;
      st.pick = null;
      const iss = SA.V.issues(v).find(x => x.layer === layer && x.r === r && x.c === c);
      const tail = iss ? SA.Config.text("editor_e44e4ef0bd8f", `${iss.reason}`) : '';
      if (!old && clash.length) say(SA.Config.text("editor_810554d54102", `${fullName(clash[0].cell.id, clash[0].cell.mt || 1)}`, `${clash.length > 1 ? ` ×${clash.length}` : ''}`, `${fullName(id, mt)}`, `${tail}`), !!iss);
      else say(old ? `${fullName(old.id, old.mt || 1)} → ${fullName(id, mt)}${scrap ? SA.Config.text("editor_e38600a070d0", `${money(scrap)}`) : ''}${tail}` : SA.Config.text("editor_68df3a1d02bf", `${m.name}`, `${tail}`), !!iss);
      changed();
    });
  }

  function removeAt({ layer, r, c }) {
    const res = SA.S.removeVehicleCell(layer, r, c);
    if (!res.ok) { say(res.reason, true); return; }
    const scrap = res.scrap;
    say(SA.Config.text("editor_bf55ef095f4a", `${res.removed.map(x => M[x.id].name).join('、')}`, `${scrap ? SA.Config.text("editor_f3fc623aa03e", `${money(scrap)}`) : ''}`));
    st.pick = null;
    changed();
  }

  // 放置检查（预览、提示、绿色可放区域共用）：底盘先按「换下冲突的旧底盘」算，和真正点下去的结果一致
  // 把车上的模块（锚点 from）搬到鼠标位置；压着一个模块就对调
  function moveTo(from, hv) {
    const v = veh(), cell = v[from.layer][from.r][from.c];
    if (!cell) return;
    const sp = SA.V.editorSpot(cell.id, hv, v, from);
    if (sp.r === from.r && sp.c === from.c) return;
    const res = SA.V.move(v, from.layer, from.r, from.c, sp.r, sp.c);
    if (!res.ok) { if (res.reason) say(res.reason, true); return; }
    const other = res.swapped && v[from.layer][from.r][from.c];
    say(other ? SA.Config.text("editor_dfd679d1cff6", `${M[cell.id].name}`, `${M[other.id].name}`) : SA.Config.text("editor_d0d9887d9d2f", `${where(sp.r, sp.c)}`));
    st.pick = null;   // 移动完成即取消选中
    changed();
  }

  // 整车位移只改已装模块的锚点；失败或原地松开都不动库存、存档与选中状态。
  function moveWhole(dc) {
    const res = SA.V.translate(veh(), dc);
    if (!res.ok) { if (res.reason) say(res.reason, true); return; }
    st.pick = null;
    say(SA.Config.text('editor_whole_move_done'));
    changed();
  }

  function repair(cells) {
    const cost = cells.reduce((a, x) => a + SA.S.repairCost(x), 0);
    SA.UI.pay({ title: SA.Config.text("arena_a0b0db2e55b8"), amount: cost, okLabel: SA.Config.text("arena_a0b0db2e55b8"), confirm: false, lines: [SA.UI.repairList(cells)],
      onPaid: () => { SA.S.repairCells(cells); st.pick = null; say(SA.Config.text("editor_d21ee9fa97e4", `${money(cost)}`)); changed(); } });
  }

  function buyOne(id) {
    const m = M[id];
    if (!buyable(id)) return;
    SA.UI.pay({ title: SA.Config.text("editor_1abee404f72e", `${fullName(id, SA.buyMt(id))}`), amount: SA.buyPrice(id), okLabel: SA.Config.text("editor_cc6f86bd41a6"), confirm: false,
      lines: [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(id, 1), h('div', {}, h('b', {}, m.name), h('div', { class: 'muted' }, SA.UI.statLine(id))))],
      onPaid: () => { const k = SA.invKey(id, SA.buyMt(id)); SA.S.addInv(id, 1, SA.buyMt(id)); say(SA.Config.text("editor_8c84a6bd7f9e", `${fullName(id, SA.buyMt(id))}`, `${d().inv[k]}`)); changed(); } });
  }

  function selectInv(key) {
    if (st.noClick) return;
    st.sel = st.sel === key ? null : key;
    st.pick = null; st.up = false;
    if (st.sel) st.layer = SA.V.layerOf(kid(key));
    renderAll();
  }

  // ---------- 黄铜铭牌（画布左上角）：车名、评分、状态、一键修理；展开看性能条 ----------
  function damagedCells() {
    const out = [];
    SA.V.each(veh(), (cell) => { if (cell.hp < SA.V.maxHp(cell)) out.push(cell); });
    return out;
  }
  function renderPlate() {
    // 关卡工具页可提供只读进化范围诊断；画布、摆放与普通玩家性能单仍使用原车。
    const diagnosis = SA.WorkbenchDiagnostics?.(veh());
    sheetDiagnosis = diagnosis || null;
    const s = diagnosis?.stats || st.stats, sheetVehicle = diagnosis?.vehicle || veh(), UI = SA.PX.ui;
    plateEl.innerHTML = '';
    const nameIn = h('input', { type: 'text', class: 'plate-name px-sk px-sk-brass', value: veh().name, maxLength: 20, 'aria-label': SA.Config.text("editor_9f9462db7694"),
      onchange: () => { SA.S.renameVehicle(nameIn.value); } });
    const hurtList = damagedCells();
    const cost = hurtList.reduce((a, x) => a + SA.S.repairCost(x), 0);
    // 拿着库存里的零件：算一遍装上以后的数，性能单上用棋盘点标出变化
    let preview = null;
    if (st.sel) { try { preview = SA.V.statsWith(sheetVehicle, kid(st.sel), kmt(st.sel)); } catch (e) { preview = null; } }
    plateEl.append(...[
      h('div', { class: 'ed-sheet-t px-h2' }, SA.Config.text("editor_2ae16e5d3bc6")),
      nameIn,
      diagnosis?.summary,
      h('div', { class: 'ed-sheet-row' }, h('span', {}, SA.Config.text("editor_9566c6f70a0d"), UI.num(s.rating)), s.problems.length ? UI.hand(SA.Config.text("editor_1e9ad60f3353", `${s.problems.length}`), 15) : h('span', { class: 'px-small' }, SA.Config.text("editor_4163fd6a7d4d"))),
      hurtList.length ? UI.btn(SA.Config.text("editor_fc849e6f69c5", `${hurtList.length}`, `${money(cost)}`), { sm: true, title: SA.UI.repairBrief(hurtList), onclick: () => repair(hurtList) }) : null,
      SA.UI.pxStats(diagnosis?.displayStats || s, sheetVehicle, preview)].filter(Boolean));
    // 车间的出口（拉闸只留给黑板上真正开打那一下）：放在改装台下面那条工单的右端——回院子 / 出战（也是回院子，再把出战黑板拉下来）
    leverEl.innerHTML = '';
    leverEl.append(UI.btn(SA.Config.text("arena_702c1bd28416"), { sm: true, onclick: () => SA.nav('home') }),
      UI.btn(SA.Config.text("editor_b6a22acb6784"), { kind: 'pri', sm: true, title: s.canDeploy ? SA.Config.text("editor_3bdaf5a7cc79") : SA.Config.text("editor_fc6544f217d6", `${s.problems.join('\n')}`), onclick: () => SA.nav('arena') }),
      ...(s.canDeploy ? [] : [h('div', { class: 'px-hand px-prob ed-exit-warn', title: s.problems.join('\n') }, SA.Config.text("editor_c196582c3cc5", `${s.problems.length}`))]));
  }

  // 画布右上角：看哪一层 + 蓝图库开关（右侧面板在模块清单和蓝图库之间切换）
  function setDock(k) { st.dock = k; st.sel = null; st.pick = null; st.bp = null; st.up = false; renderAll(); }
  function renderView() {
    viewEl.innerHTML = '';
    const setLayer = (k) => { st.layer = k; st.pick = null; if (st.sel && SA.V.layerOf(kid(st.sel)) !== k) st.sel = null; renderAll(); };
    viewEl.append(...[
      has('side') ? SA.PX.ui.toggle(SA.Config.text("editor_9155623ce3b0"), SA.Config.text("editor_edc7ed624d70"), st.layer === 'side', () => setLayer(st.layer === 'side' ? 'body' : 'side')) : null,
      bpOpen() ? h('button', { class: `btn small bp-btn ${st.dock === 'bps' ? 'on' : ''}`, title: SA.Config.text("editor_3dff92be0c24"),
        onclick: () => setDock(st.dock === 'bps' ? 'mods' : 'bps') }, SA.SPR.iconCanvas('scroll', st.dock === 'bps' ? '#e4e0d6' : '#f5d77a', 2), SA.Config.text("editor_3b2ceb32df23")) : null,
      upOpen() ? h('button', { class: `btn small bp-btn ${st.up ? 'on' : ''}`, title: SA.Config.text('editor_up_btn_title'),
        onclick: (e) => (e.shiftKey ? upAll() : setUp(!st.up)) }, SA.SPR.iconCanvas('upmat', st.up ? '#e4e0d6' : '#f5d77a', 2), SA.Config.text('editor_up_btn')) : null].filter(Boolean));
  }

  // ---------- 底部操作栏 ----------
  function thumb(id, mt) { const cvs = SA.SPR.moduleCanvas(id, 0.75, mt); cvs.classList.add('thumb'); return cvs; }

  function renderCtx() {
    ctxEl.innerHTML = '';
    const v = veh(), inv = d().inv;
    if (st.sel) {
      const key = st.sel, id = kid(key), mt = kmt(key), m = M[id], n = inv[key] || 0, canBuy = mt === SA.buyMt(id) && buyable(id);
      ctxEl.append(thumb(id, mt),
        h('div', { class: 'info' },
          h('div', {}, h('b', {}, m.name), ' ', SA.UI.uniqueBadge(id), ' ', SA.Camp.matChip(mt), ' ', SA.UI.repairChip({ id, mt }), ' ',
            n ? h('span', { class: 'chip' }, SA.Config.text("editor_990f4dd8bc60", `${n}`)) : canBuy ? h('span', { class: 'chip buy' }, SA.Config.text("editor_9916d8c2dbd0", `${money(SA.buyPrice(id))}`)) : h('span', { class: 'chip no' }, SA.isUnique(id) ? SA.Config.text("editor_d0de8bf9232c") : SA.Config.text("editor_c7f346912802"))),
          h('div', { class: 'sub' }, SA.isUnique(id) ? SA.Config.text("editor_304cfa37aa08") : canBuy ? SA.Config.text("editor_1e43b7128f91") : n ? SA.Config.text("editor_445832485e78") : SA.Config.text("editor_d951caeadf68"))),
        h('div', { class: 'acts' },
          canBuy ? h('button', { class: 'btn small', onclick: () => buyOne(id) }, SA.Config.text("editor_e328d285d23a", `${money(SA.buyPrice(id))}`)) : null,
          n ? h('button', { class: 'btn small', onclick: () => sellOne(key) }, SA.Config.text("editor_822dd009ddaf", `${money(SA.cellValue({ id, mt }) * 0.5)}`)) : null,
          h('button', { class: 'btn small', title: SA.Config.text("editor_a7ef6e62ce6f"), onclick: cancelSelection }, SA.Config.text("editor_2cd0f3be8738"))));
      return;
    }
    if (st.up) {
      const p = upPlan();
      // data-page-key：页面改字按 DOM 路径记，不加就会和空闲时的提示行同路径、被那条改字盖掉
      ctxEl.append(h('div', { class: 'info', 'data-page-key': 'upgrade-mode' },
        h('div', {}, h('b', {}, SA.Config.text('editor_up_btn')), ' ', h('span', { class: 'muted' }, SA.Config.text('editor_up_hint'))),
        h('div', { class: 'sub' }, p ? SA.Config.text('editor_up_all_sub', `${p.list.length}`, p.from, p.to) : SA.Config.text('editor_up_none'))),
      h('div', { class: 'acts' },
        h('button', { class: `btn small ${p ? 'primary' : ''}`, disabled: !p, title: SA.Config.text('editor_up_all_key'), onclick: upAll }, p ? SA.Config.text('editor_up_all_btn', money(p.cost)) : SA.Config.text('editor_up_all_btn0'))));
      return;
    }
    const pk = st.pick && v[st.pick.layer][st.pick.r][st.pick.c];
    if (pk) {
      const { layer, r, c } = st.pick, m = M[pk.id], max = SA.V.maxHp(pk);
      const iss = issueAt(layer, r, c);
      const fix = [pk, layer === 'body' && v.side[r][c]].filter(x => x && x.hp < SA.V.maxHp(x));
      const cost = fix.reduce((a, x) => a + SA.S.repairCost(x), 0);
      const lv = pk.lv || 0, upName = SA.upName(pk.id), refitInfo = SA.refitKind(pk.id) ? SA.refitInfo(pk) : null;
      // 升级材料不在这里：改成画布上方单独的「升级材质」按钮（见 setUp）
      ctxEl.append(thumb(pk.id, pk.mt),
        h('div', { class: 'info' },
          h('div', {}, h('b', {}, m.name), ' ', SA.UI.uniqueBadge(pk.id), ' ', SA.Camp.matChip(pk.mt || 1), ' ', h('span', { class: 'chip' }, pk.hp <= 0 ? SA.Config.text("editor_226b03150244") : SA.Config.text("editor_16f931d2b61c", `${pk.hp}`, `${max}`)), ' ', SA.UI.repairChip(pk), ' ',
            has('upgrade') ? h('span', { class: `chip rank ${lv ? 'on' : ''}`, title: SA.Config.text("editor_7c2e257c34bf", `${upName}`, `${lv}`, `${SA.K.UP_MAX}`) }, `${upName} ${'▲'.repeat(lv)}${'△'.repeat(SA.K.UP_MAX - lv)}`) : null, ' ',
            h('span', { class: 'muted' }, `${SA.tons(SA.weightOf(pk))} · ${where(r, c)}`)),
          // 改造等级和代价在低高度窗口也必须可见，不能被通用 sub 样式隐藏。
          refitInfo ? h('div', { 'data-page-key': 'knight-refit-state' }, `${refitInfo.name} ${refitInfo.level}/${K.UP_MAX} · ${refitInfo.text}`) : SA.isBipedOnly(pk) ? h('div', {}, '双足专属') : null,
          iss ? h('div', { class: 'sub err' }, iss.reason) : h('div', { class: 'sub' }, SA.Config.text("editor_49c3123bf418")),
          ''),
        h('div', { class: 'acts' },
          has('upgrade') && pk.hp > 0 && lv < SA.K.UP_MAX ? h('button', { class: 'btn small', title: SA.Config.text("editor_d4928db19a49", `${Math.round(SA.upHp(pk.id) * 100)}`, `${SA.K.UP_KG}`), onclick: () => upgrade(pk) },
            SA.Config.text("editor_3159ee17bc6b", `${upName}`, `${lv + 1}`, `${money(SA.upCost(pk.id, lv + 1))}`)) : null,
          has('upgrade') && pk.hp > 0 && refitInfo && refitInfo.level < K.UP_MAX ? h('button', { class: 'btn small', disabled: !SA.V.bipedOf(v), title: SA.V.bipedOf(v) ? SA.refitInfo(pk, refitInfo.level + 1).text : '专项改造仅限双足，请先移到双足底盘上。', onclick: () => refit(pk) },
            `${refitInfo.name} ${refitInfo.level + 1} · ${money(SA.upCost(pk.id, refitInfo.level + 1))}`) : null,
          fix.length ? h('button', { class: 'btn small', title: SA.UI.repairBrief(fix), onclick: () => repair(fix) }, SA.Config.text("editor_229d6a641972", `${money(cost)}`)) : null,
          h('button', { class: 'btn small', title: 'Delete', onclick: () => (pk.hp <= 0 && SA.isUnique(pk.id)
            ? uniqueConfirm(SA.Config.text("editor_40e1a6f0b50f", `${m.name}`), SA.Config.text("editor_fcdf6aa92335"), SA.Config.text("editor_71d597d4119c"), () => removeAt(st.pick))
            : removeAt(st.pick)) }, pk.hp <= 0 ? SA.Config.text("editor_4bec8e3e7a2b", `${money(SA.cellValue({ id: pk.id, mt: pk.mt }) * 0.1)}`) : SA.Config.text("editor_675d2b7b9ed0")),
          h('button', { class: 'btn small', title: SA.Config.text("editor_a7ef6e62ce6f"), onclick: cancelSelection }, SA.Config.text("editor_2cd0f3be8738"))));
      return;
    }
    st.pick = null;
    if (st.dock === 'bps') { bpCtx(); return; }
    // 什么都没选：告诉玩家现在该做什么
    const s = st.stats;
    ctxEl.append(h('div', { class: 'info' },
      s.problems.length ? h('div', { class: 'err' }, s.problems[0]) : h('div', {}, h('b', {}, sheetDiagnosis ? '编辑范围内车已就绪；进化资格见性能单' : SA.Config.text("editor_4a8a8b3676e1")), s.warnings.length ? h('span', { class: 'muted' }, ` · ${s.warnings[0]}`) : null),
      // 资格摘要是关键状态，不能使用横屏低高度时会被全局样式隐藏的 sub 类。
      sheetDiagnosis ? h('div', { class: `garage-deploy-summary ${sheetDiagnosis.grid && sheetDiagnosis.stats.canDeploy ? '' : 'err'}`, 'data-page-key': 'evolution-deploy-summary' }, sheetDiagnosis.compactText) : null,
      h('div', { class: 'sub' }, SA.Config.text("editor_4b7b7942d0e0"))),
    '');
  }

  // ---------- 右侧面板：页签 + 「商店」开关 / 蓝图筛选 ----------
  function renderTools() {
    toolsEl.innerHTML = '';
    const title = (t, extra) => h('div', { class: 'panel-title' }, h('b', {}, t), extra);
    if (st.dock === 'bps') {
      toolsEl.append(title(SA.Config.text("editor_3b2ceb32df23"), h('button', { class: 'btn small', onclick: () => setDock('mods') }, SA.Config.text("editor_7cd3fb74211c"))),
        h('div', { class: 'panel-row' },
          h('div', { class: 'inv-tabs' }, [['all', SA.Config.text("editor_5c55a67935af")], ['mine', SA.Config.text("editor_7f1d9dd04cd1")], ['official', SA.Config.text("editor_e73e38c1f65d")], ['cloud', SA.Config.text("camp_ui_564d439aeaf1")]].map(([k, n]) =>
            h('button', { class: `tab ${st.bpFilter === k ? 'on' : ''}`, onclick: () => { st.bpFilter = k; renderTools(); renderInv(); } }, n))),
          h('button', { class: 'btn small', onclick: importDialog }, SA.Config.text("editor_e3eeaa364bd3"))));
      return;
    }
    const owned = Object.values(d().inv).reduce((a, n) => a + n, 0);
    toolsEl.append(title(SA.Config.text("editor_7d9c9bca7baf"), h('span', { class: 'muted' }, SA.Config.text("editor_a96bcf971039", `${owned}`))),
      has('shop') ? h('div', { class: 'panel-row' },
        h('span', { class: 'muted' }, st.shop ? SA.Config.text("editor_ef91a815f304") : SA.Config.text("editor_e9b1471ac85a")),
        h('label', { class: `switch ${st.shop ? 'on' : ''}`, title: SA.Config.text("editor_66a163f614e7") },
          h('input', { type: 'checkbox', checked: st.shop, onchange: (e) => { st.shop = e.target.checked; renderTools(); renderInv(); } }),
          h('span', { class: 'knob' }), SA.Config.text("editor_61f96c6aac6a"))) : h('div', { class: 'panel-row' }, h('span', { class: 'muted' }, SA.Config.text("editor_9ac7a3e16717"))));
  }

    // 模块最关键的两三项数值，做成小标签；跨模块规则从 SA.K 读取。
  // 清单里的模块图：按整数倍放大（高不超过 96、宽不超过 120 像素）
  function bigPic(id, mt) {
    const c1 = SA.PX.trim(SA.SPR.moduleCanvas(id, 1, mt)), s = Math.max(1, Math.min(3, Math.floor(Math.min(96 / c1.height, 120 / c1.width))));
    return SA.PX.ui.img(c1, s);
  }
  // 悬浮纸条：名字（最大）→ 材质 → 各项属性 → 修理难度 → 空一行 → 说明（以后有背景故事就接在后面）
  function modTip(id, mt) {
    const m = M[id];
    return [h('div', { class: 'tp-nm' }, fullName(id, mt)),
      h('div', { class: 'tp-mt' }, SA.Camp.matChip(mt), ' ', SA.UI.uniqueBadge(id), ' ', h('span', { class: 'px-small' }, SA.CAT[m.cat] ? SA.CAT[m.cat].name : '')),
      h('div', { class: 'tp-ks' }, SA.UI.statLine(id, mt).split(' · ').map(t => h('div', {}, t)), h('div', {}, SA.UI.repairPips(id, SA.Config.text("editor_30c4e0bfdca6")))),
      h('div', { class: 'tp-note' }, h('b', {}, SA.Config.text("editor_4262c45dc797")), h('br'), m.desc || '—'),
      m.lore ? h('div', { class: 'tp-note' }, h('b', {}, SA.Config.text("editor_f4b669c55756")), h('br'), m.lore) : null];
  }
  function keyStats(id, mt = 1) {
    const m = SA.mod(id, mt), out = [];
    if (m.layer === 'chassis') out.push(SA.Config.text("editor_ecdf2eb87dc1", `${SA.tons(m.load)}`), SA.kmh(m.speed), m.brake >= 1.5 ? SA.Config.text("editor_51b057f5db0a") : m.brake < 0.8 ? SA.Config.text("editor_876d3fddff3c") : SA.Config.text("editor_3f63f756b226"), m.sway < 0.6 ? SA.Config.text("editor_1c0a9d014c6c") : m.sway > 1.2 ? SA.Config.text("editor_b54a9458fe2b") : SA.Config.text("editor_16da6e433377"));
    else if (m.dmg) out.push(SA.Config.text("editor_0effa98e724c", `${m.dmg}`), SA.Config.text("editor_4c4721f23bca", `${m.reload}`), m.indirect ? SA.Config.text("editor_3d6aa623d93d") : SA.Config.text("editor_a9d49428b47e", `${m.spread}`), m.penetration >= 99 ? SA.Config.text("editor_d06576d004d2") : SA.Config.text("editor_c2472685b8ec", `${m.penetration}`));
    else if (m.supply) out.push(SA.Config.text("editor_8006daa27c17", `${SA.Phys.fmtPower(m.supply)}`), SA.Config.text("editor_9795e140f483", `${SA.Phys.fmtKw(m.heatRate)}`));
    else if (m.store) out.push(SA.Config.text("editor_397947920edb", `${SA.Phys.fmtHeat(m.store)}`), SA.Config.text("editor_874a90bfc512", `${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}`));
    else if (m.water) out.push(SA.Config.text("editor_c7661f3af3be", `${SA.Phys.fmtKw(m.cool)}`), SA.Config.text("editor_985f298991a8", `${SA.Phys.fmtWater(m.water)}`));
    else if (m.dryCool) out.push(SA.Config.text("editor_6fd4db5f7540", `${SA.Phys.fmtKw(m.dryCool)}`));
    else if (m.waterSave) out.push(SA.Config.text("editor_c6279ed14eea", `${Math.round((1 - m.waterSave) * 100)}`), SA.Config.text("editor_c7661f3af3be", `${SA.Phys.fmtKw(m.cool)}`));
    else if (m.ram) out.push(SA.Config.text("editor_e877ffddb028", `${m.ram}`), m.punch ? SA.Config.text("editor_14cb15367e18", `${m.punch}`) : SA.Config.text("editor_ae508f51291d", `${m.hp}`));
    else out.push(SA.Config.text("editor_ae508f51291d", `${m.hp}`));
    if (m.tether) out.push(SA.Config.text("editor_c83dfc2b7d1f"));
    if (m.armor && !m.load) out.push(SA.Config.text("editor_987666ef16f4", `${Math.round(m.armor * 10) / 10}`));
    if (m.power) out.push(SA.Config.text("editor_7e866effc5db", `${SA.Phys.fmtKw(m.power)}`));
    out.push(SA.tons(SA.weightOf({ id })));
    return out;
  }

  const CAT_ORDER = ['mobility', 'control', 'energy', 'cooling', 'structure', 'firepower', 'ram'];
  function renderInv() {
    const keep = invEl.scrollTop;
    invEl.innerHTML = '';
    if (st.dock === 'bps') { tabsEl.innerHTML = ''; renderBps(); invEl.scrollTop = keep; return; }
    const inv = d().inv;
    const shop = st.shop && has('shop');
    let shown = 0;
    // 每一类要列的模块（按材料分行：库存里有的都列，材料好的排前面；商店打开时补上能买的黄铜款）
    const keysOf = (cat) => {
      const keys = [];
      // 工作台以正式注册表兜底补齐排序表遗漏的模块；普通车间沿用既有清单。
      const ids = stageWorkbench() ? [...new Set([...SA.MODULE_ORDER, ...Object.keys(M)])] : SA.MODULE_ORDER;
      for (const id of ids) {
        if (!M[id] || M[id].retired || M[id].cat !== cat) continue;
        for (let mt = SA.MAT_MAX; mt >= 1; mt--) { const k = SA.invKey(id, mt); if (inv[k] > 0 || (mt === SA.buyMt(id) && shop && buyable(id))) keys.push(k); }
      }
      return keys;
    };
    const cats = CAT_ORDER.map(cat => ({ cat, keys: keysOf(cat) }));
    if (st.cat !== 'all' || !stageWorkbench()) {
      if (!cats.some(c => c.cat === st.cat && c.keys.length)) { const first = cats.find(c => c.keys.length); st.cat = first ? first.cat : CAT_ORDER[0]; }
    }
    // 右边一列纸页签：类别色条 + 名字 + 件数；空的类别变淡
    tabsEl.innerHTML = '';
    if (stageWorkbench()) tabsEl.append(h('button', { class: `ed-tab ${st.cat === 'all' ? 'on' : ''}`, title: SA.Config.text("editor_8cf2d1e66c01"),
      onclick: () => { st.cat = 'all'; renderInv(); invEl.scrollTop = 0; } }, h('span', { class: 'nm' }, SA.Config.text("editor_5c55a67935af"))));
    for (const { cat, keys } of cats) {
      if (!keys.length) continue;   // 没有库存（商店模式下没有可买）的大类不显示页签
      const have = keys.reduce((a, k) => a + (inv[k] || 0), 0);
      tabsEl.append(h('button', { class: `ed-tab ${st.cat === cat ? 'on' : ''} ${keys.length ? '' : 'none'}`, style: `--c:${SA.CAT[cat].plate}`, title: keys.length ? `${SA.CAT[cat].name}：${shop ? SA.Config.text("editor_a067a474e68e", `${keys.length}`) : SA.Config.text("editor_1e57c27d2795", `${have}`)}` : SA.Config.text("editor_c8103f8422c4", `${SA.CAT[cat].name}`),
        onclick: () => { if (!keys.length) return; st.cat = cat; saveCat(); renderInv(); invEl.scrollTop = 0; } },
        h('i', {}), h('span', { class: 'nm' }, SA.CAT[cat].name), keys.length ? h('b', {}, shop ? keys.length : have) : null));
    }
    const curCat = st.cat === 'all' && stageWorkbench()
      ? { cat: 'all', keys: cats.flatMap(c => c.keys) } : cats.find(c => c.cat === st.cat);
    if (curCat && curCat.keys.length) {
      const cat = curCat.cat, keys = curCat.keys;
      const have = keys.reduce((a, k) => a + (inv[k] || 0), 0);
      const distinct = new Set(keys.map(kid)).size;
      invEl.append(h('div', { class: 'cat-head', style: `--c:${cat === 'all' ? 'var(--brass2)' : SA.CAT[cat].plate}` },
        h('span', { class: 'px-h2' }, cat === 'all' ? SA.Config.text("editor_8cf2d1e66c01") : SA.CAT[cat].name),
        h('span', { class: 'px-small' }, cat === 'all' ? SA.Config.text("editor_a067a474e68e", `${distinct}`) : shop ? SA.Config.text("editor_a067a474e68e", `${keys.length}`) : SA.Config.text("editor_1e57c27d2795", `${have}`))));
      for (const key of keys) {
        shown++;
        const id = kid(key), mt = kmt(key), m = M[id], n = inv[key] || 0;
        // 清单只放大图、名字、材质和数量；属性、修理难度、说明都在悬浮纸条里（2026-09-30 用户：要清爽，名字最要紧）
        const row = h('button', { class: `mrow cat-${m.cat} ${st.sel === key ? 'sel' : ''} ${n ? '' : 'unowned'}`, 'data-page-key': `inventory:${key}`, onclick: () => selectInv(key) },
        h('span', { class: 'pic' }, bigPic(id, mt)),
        h('span', { class: 'mid' },
          h('span', { class: 'nm' }, m.name), h('span', { class: 'mt' }, SA.Camp.matChip(mt), ' ', SA.UI.uniqueBadge(id))),
        n ? h('span', { class: 'cnt' }, h('b', {}, `×${n}`), h('small', {}, SA.Config.text("editor_780c5fd5b105")))
          : h('span', { class: 'cnt buy' }, h('b', {}, money(m.price)), h('small', {}, SA.Config.text("editor_cc6f86bd41a6"))));
        SA.PX.ui.tip(row, () => modTip(id, mt));
        row.addEventListener('pointerdown', (e) => { if (e.button === 0) beginPress(e, { kind: 'inv', id, key }); });
        row.addEventListener('pointermove', onMove);
        row.addEventListener('pointercancel', cancelPress);
        invEl.append(row);
        // 选中时不再展开对照表（2026-09-30 用户：只要悬浮纸条）
      }
    }
    if (!shown) invEl.append(h('div', { class: 'empty' },
      h('b', {}, SA.Config.text("editor_934c41f01b3a")),
      h('span', { class: 'muted' }, has('shop') ? SA.Config.text("editor_8f7abe76989b") : SA.Config.text("editor_f7a79c7f5b47")),
      has('shop') ? h('button', { class: 'btn primary', onclick: () => { st.shop = true; renderTools(); renderInv(); } }, SA.Config.text("editor_e3e0b1d93238")) : null));
    else if (shop) invEl.prepend(h('div', { class: 'shop-note' }, SA.Config.text("editor_fae9f709ca12")));
    invEl.scrollTop = keep;
  }

  function renderDock() { renderPlate(); renderCtx(); renderInv(); }
  function renderAll() { if (st.up && !upOpen()) st.up = false; renderPlate(); renderView(); renderCtx(); renderTools(); renderInv(); }

  // ---------- 蓝图库 · 分享码示例（底部操作栏的第二个页签）----------
  const KIND = { mine: SA.Config.text("editor_7f1d9dd04cd1"), official: SA.Config.text("editor_e73e38c1f65d"), cloud: SA.Config.text("camp_ui_564d439aeaf1") };
  function bpList() { return SA.Blueprints.all().filter(b => st.bpFilter === 'all' || b.kind === st.bpFilter); }
  function bpPic(bp, scale) {
    const cvs = SA.UI.vehiclePreview(SA.V.fromLayout(bp.name, bp), scale);
    cvs.classList.add('bp-pic');
    return cvs;
  }

  function renderBps() {
    const nextName = SA.Config.text("editor_37c6dc463bb6", `${veh().name}`, `${SA.Blueprints.mine().length + 1}`);
    invEl.append(h('button', { class: 'bprow add', title: SA.Config.text("editor_e19b8383bcef"), onclick: () => {
      SA.Blueprints.save(nextName);
      st.bpFilter = st.bpFilter === 'official' || st.bpFilter === 'cloud' ? 'all' : st.bpFilter;
      st.bp = SA.Blueprints.all().find(b => b.kind === 'mine').key;
      say(SA.Config.text("editor_3ba65d126dd6", `${nextName}`));
      renderAll();
    } }, h('span', { class: 'plus' }, '＋'), h('span', { class: 'mid' }, h('span', { class: 'nm' }, SA.Config.text("editor_12e06b04ad77")), h('span', { class: 'muted' }, SA.Config.text("editor_07311a3407e6")))),
      h('button', { class: 'bprow add share', title: SA.Config.text("editor_0ff3efae1125"), onclick: () => shareDialog(veh().name, SA.V.encode(veh()), veh()) },
        h('span', { class: 'plus' }, '⇪'), h('span', { class: 'mid' }, h('span', { class: 'nm' }, SA.Config.text("editor_fbaa0a9cf861")), h('span', { class: 'muted' }, SA.Config.text("editor_079f31d7043f")))));
    for (const bp of bpList()) {
      const p = SA.Blueprints.plan(bp);
      invEl.append(h('button', { class: `bprow ${st.bp === bp.key ? 'sel' : ''}`, 'data-page-key': `blueprint:${bp.key}`, title: bp.desc || bp.name,
        onclick: () => { st.bp = st.bp === bp.key ? null : bp.key; renderDock(); } },
      bpPic(bp, 1),
      h('span', { class: 'mid' },
        h('span', { class: 'nm' }, bp.name),
        h('span', { class: 'ks' }, h('span', { class: `kind-${bp.kind}` }, bp.kind === 'cloud' ? SA.Config.text("editor_79e71075e1d8", `${bp.author}`) : KIND[bp.kind]),
          h('span', { class: p.cost ? 'gold' : '' }, p.cost ? SA.Config.text("editor_7bb3a181404c", `${money(p.cost)}`) : SA.Config.text("editor_f76c83a5a0ec"))))));
    }
  }

  function bpCtx() {
    const bp = st.bp && SA.Blueprints.all().find(b => b.key === st.bp);
    if (!bp) {
      ctxEl.append(h('div', { class: 'info' },
        h('div', {}, h('b', {}, SA.Config.text("editor_22587af6e64e"))),
        h('div', { class: 'sub' }, SA.Config.text("editor_462759cb84ca"))));
      return;
    }
    const v = SA.V.fromLayout(bp.name, bp), s = SA.V.stats(v), p = SA.Blueprints.plan(bp);
    const done = () => { st.bp = null; st.stats = SA.V.stats(veh()); changed(); };
    const nameIn = bp.kind === 'mine' ? h('input', { type: 'text', class: 'bp-name', value: bp.name, maxLength: 20, 'aria-label': SA.Config.text("editor_ef2f63edef4d"),
      onchange: () => { SA.Blueprints.rename(bp.index, nameIn.value.trim() || bp.name); renderInv(); } }) : h('b', {}, bp.name);
    let armed = false;
    const del = bp.kind === 'mine' ? h('button', { class: 'btn small', onclick: () => {
      if (!armed) { armed = true; del.textContent = SA.Config.text("editor_7e18d0731e35"); del.classList.add('danger'); return; }
      SA.Blueprints.del(bp.index); st.bp = null; say(SA.Config.text("editor_07d3f0d376eb")); renderAll();
    } }, SA.Config.text("editor_2f9daa828907")) : null;
    ctxEl.append(bpPic(bp, 0.5),
      h('div', { class: 'info' },
        h('div', {}, nameIn, ' ', h('span', { class: `chip kind-${bp.kind}` }, bp.kind === 'cloud' ? SA.Config.text("editor_1c162cda7bb1", `${bp.author}`) : KIND[bp.kind]), ' ', h('span', { class: 'chip' }, SA.Config.text("camp_ui_3c474f64f788", `${s.rating}`))),
        h('div', { class: `sub ${s.canDeploy ? '' : 'err'}` }, bp.desc || (s.canDeploy ? SA.Config.text("editor_6b20e6e9e66d") : s.problems[0]))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn small primary', onclick: () => SA.Blueprints.apply(bp, done) }, p.cost ? SA.Config.text("editor_81f0629a24bb", `${money(p.cost)}`) : SA.Config.text("editor_63c73c4730f4")),
        bp.kind === 'mine' ? h('button', { class: 'btn small', title: SA.Config.text("editor_ad1607048874"), onclick: () => { SA.Blueprints.overwrite(bp.index); say(SA.Config.text("editor_140365d0c5e6")); renderAll(); } }, SA.Config.text("editor_4ce4c98eb27e")) : null,
        bp.kind !== 'official' ? h('button', { class: 'btn small', title: SA.Config.text("editor_f363270466c3"), onclick: () => shareDialog(bp.name, bp.kind === 'mine' ? SA.Blueprints.share(bp) : bp.code, v) }, SA.Config.text("editor_3323a4368524")) : null,
        bp.kind === 'cloud' ? h('button', { class: 'btn small', title: SA.Config.text("editor_6e6f807b3adb"), onclick: () => {
          const nv = SA.Blueprints.importCode(bp.code);
          if (!nv) { say(SA.Config.text("editor_c4beb34ea10a"), true); return; }
          st.bpFilter = 'mine'; st.bp = SA.Blueprints.all()[0].key; say(SA.Config.text("editor_bbb3a5e76906", `${nv.name}`)); renderAll();
        } }, SA.Config.text("editor_7262472ef8e1")) : null,
        del));
  }

  // 分享码是纯字符串：不上传、不经过服务器。导入时边粘贴边预览，读不出来就说清楚
  function codePreview(v) {
    if (!v) return h('div', { class: 'code-pv bad' }, h('b', {}, SA.Config.text("editor_58dffa0254e6")), h('span', { class: 'muted' }, SA.Config.text("editor_0bf4190baab4")));
    const s = SA.V.stats(v), n = Object.values(SA.V.countIds(v)).reduce((a, x) => a + x, 0);
    const pic = SA.UI.vehiclePreview(v, 1.5); pic.classList.add('bp-pic');
    return h('div', { class: 'code-pv' }, pic, h('div', {}, h('b', {}, v.name), h('div', { class: 'muted' }, SA.Config.text("editor_4fbc81ed5db3", `${n}`, `${s.rating}`, `${SA.tons(s.weight)}`)),
      s.issues.length ? h('div', { class: 'muted' }, SA.Config.text("editor_0ca7b69b1d58", `${s.issues.length}`)) : null));
  }
  function importDialog() {
    const box = h('textarea', { rows: 3, placeholder: SA.Config.text("editor_cadd60e2a809") });
    const pv = h('div', { class: 'code-pv-wrap' }, h('span', { class: 'muted' }, SA.Config.text("editor_a166808ddb3b")));
    let v = null;
    box.addEventListener('input', () => {
      const raw = box.value.trim();
      v = raw ? SA.V.decode(raw) : null;
      pv.innerHTML = ''; pv.append(raw ? codePreview(v) : h('span', { class: 'muted' }, SA.Config.text("editor_a166808ddb3b")));
    });
    SA.UI.dialog(SA.Config.text("editor_e3eeaa364bd3"), [h('p', { class: 'muted', style: 'margin-top:0' }, SA.Config.text("editor_b25a49f5defe")), box, pv],
      [{ label: SA.Config.text("editor_97af1a02123c"), primary: true, onClick: () => {
        const nv = SA.Blueprints.importCode(box.value);
        if (!nv) { SA.UI.toast(SA.Config.text("editor_0f5bae508180")); return; }
        st.dock = 'bps'; st.bpFilter = 'mine'; st.bp = SA.Blueprints.all()[0].key;
        say(SA.Config.text("editor_46fea2a5ba83", `${nv.name}`)); renderAll();
      } }]);
    setTimeout(() => box.focus(), 0);
  }
  // 分享：显示分享码 + 一键复制；剪贴板不可用时代码框已全选，手动 Ctrl+C 也行
  function shareDialog(name, code, v) {
    const box = h('textarea', { rows: 3, readOnly: true, class: 'code-out' });
    box.value = code;
    const note = h('span', { class: 'muted' });
    const copy = () => {
      box.focus(); box.select();
      const ok = () => { note.textContent = SA.Config.text("editor_cce28dd1fcdf"); };
      const fail = () => { note.textContent = SA.Config.text("editor_7faef4f108ea"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(ok, fail);
      else { try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(); } }
    };
    SA.UI.dialog(SA.Config.text("editor_c542e28278d6", `${name}`), [h('p', { class: 'muted', style: 'margin-top:0' }, SA.Config.text("editor_af0e4adae50e")),
      v ? codePreview(v) : null, box, h('div', { class: 'code-act' }, h('button', { class: 'btn small primary', onclick: copy }, SA.Config.text("editor_ae71ee588850")), note)], []);
    setTimeout(() => { box.focus(); box.select(); }, 0);
  }

  // 唯一件卖掉 / 报废就再也拿不到：先确认一次
  function uniqueConfirm(title, text, okLabel, onOk) {
    SA.UI.dialog(title, [h('p', { style: 'margin-top:0' }, text)], [{ label: okLabel, onClick: onOk }], SA.Config.text("editor_6b7589029582"));
  }
  function sellOne(key) {
    const id = kid(key), mt = kmt(key);
    if (SA.isUnique(id) && !sellOne.ok) {
      uniqueConfirm(SA.Config.text("editor_94d2a7e18c5d", `${M[id].name}`), SA.Config.text("editor_01ff78b3e6b5"), SA.Config.text("editor_1bbb29c0ff2f"), () => { sellOne.ok = true; try { sellOne(key); } finally { sellOne.ok = false; } });
      return;
    }
    const x = SA.S.sellStock(id, mt);
    if (!d().inv[key]) st.sel = null;
    say(SA.Config.text("editor_3beffd1d7455", `${fullName(id, mt)}`, `${money(x)}`));
    changed();
  }

  // 「?」只保留新手此刻要做的三步，详细模块数据仍在选中卡片里。
  function openHelp() {
    SA.UI.openModal(SA.Config.text("editor_a21fcfac4591"), h('div', { class: 'help' },
      h('p', {}, SA.Config.text("editor_6be0c3108d82")),
      h('p', {}, SA.Config.text("editor_8fed129fc96c")),
      h('p', {}, SA.Config.text("editor_997f250d05a7")),
    ));
  }

  // ---------- 绘制 ----------
  // 状态提示：整格缓慢闪烁的颜色（红 = 不可用/悬空，绿 = 选中/可放置），不再描边
  const RED = '#ff3b2f', GREEN = '#6fcf6a', WHITE = '#ffffff', GOLD = '#ffc93a';   // 金 = 升级材质
  const pulse = (t, lo, hi, per = 1.6) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / per));
  const tmp = document.createElement('canvas');
  const tg = tmp.getContext('2d');
  // 把 paint(tg, m) 画出来的像素整体染色后叠到画布上（只染模块本身，不染背景）；w, h 是模块像素大小，
  // m = 四周多留的边（整件四足的腿、炮管伸出模块外，也一起染色）。草稿画布按需要长大（整件底盘比 48px 宽）
  function tint(paint, x, y, w, h, color, a, m = 0) {
    const W2 = w + m * 2, H2 = h + m * 2;
    if (tmp.width < W2 || tmp.height < H2) { tmp.width = Math.max(tmp.width, W2); tmp.height = Math.max(tmp.height, H2); }
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, W2, H2);
    paint(tg, m);
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = color;
    tg.fillRect(0, 0, W2, H2);
    g.globalAlpha = a;
    g.drawImage(tmp, 0, 0, W2, H2, x - m, y - m, W2, H2);
    g.globalAlpha = 1;
  }
  const fromVeh = (vc, x, y, w, h) => (c2d) => c2d.drawImage(vc, x, y, w, h, 0, 0, w, h);
  const fromModule = (id, t, mt) => (c2d, m = 0) => SA.SPR.drawModule(c2d, id, m, m, { t, heat: 0.3, water: 1, mt });
  const tintPad = (id) => (M[id].layer === 'chassis' ? 64 : 0);
  function fillCell(x, y, color, a) {
    g.globalAlpha = a; g.fillStyle = color; g.fillRect(x + 1, y + 1, C - 1, C - 1); g.globalAlpha = 1;
  }
  function cross(x, y, w, h) {
    SA.SPR.useCtx(g);
    const x0 = x + Math.round(w * 0.3), x1 = x + Math.round(w * 0.7), y0 = y + Math.round(h * 0.3), y1 = y + Math.round(h * 0.7);
    SA.SPR.line(x0, y0, x1, y1, 5, P.black);
    SA.SPR.line(x1, y0, x0, y1, 5, P.black);
    SA.SPR.line(x0, y0, x1, y1, 3, P.white);
    SA.SPR.line(x1, y0, x0, y1, 3, P.white);
  }
  // 模块（锚点）在画布上的位置和像素大小
  const cellXY = (r, c) => [PADX + c * C, r * C];
  const boxOf = (v, layer, r, c) => { const cell = v[layer][r][c], f = SA.fp(cell ? cell.id : 'armor_heavy'); return [PADX + c * C, r * C, f.w * C, f.h * C]; };

  // 拖动到某处后，搬过去的模块会不会悬空 / 放不下（按目标锚点缓存，避免每帧克隆）
  let dropMemo = { key: '', bad: false };
  function dropBad(drag, sp) {
    const key = `${drag.layer}${drag.r},${drag.c}>${sp.r},${sp.c}`;
    if (dropMemo.key !== key) {
      const v = SA.V.clone(veh());
      const res = SA.V.move(v, drag.layer, drag.r, drag.c, sp.r, sp.c);
      dropMemo = { key, bad: !res.ok || SA.V.issues(v).some(x => x.r === sp.r && x.c === sp.c) };
    }
    return dropMemo.bad;
  }

  // 拖动预览与松手使用同一整车规则；相同列位移复用结果，避免每帧克隆车辆。
  function wholePreview() {
    const drag = st.drag, hv = st.hover;
    if (!drag || drag.kind !== 'whole' || !hv) return null;
    const dc = Math.round(hv.fc - drag.startFc);
    if (drag.preview && drag.preview.dc === dc) return drag.preview;
    const test = SA.V.clone(veh());
    const res = dc === 0 ? { ok: true } : SA.V.translate(test, dc);
    return (drag.preview = { dc, ok: res.ok, reason: res.reason, vehicle: res.ok ? test : null });
  }

  function tipText() {
    const v = veh(), hv = st.hover, now = performance.now();
    if (st.drag && st.drag.kind === 'whole') {
      const preview = wholePreview();
      return preview && !preview.ok ? { text: preview.reason, err: true } : { text: SA.Config.text('editor_whole_move_hint') };
    }
    if (st.drag && st.drag.kind === 'cell' && !hv) return { text: SA.Config.text("editor_41244e613de2", `${M[st.drag.id].name}`) };
    if (hv && !SA.V.inRegion(v, hv.r, hv.c)) return { text: SA.Config.text("vehicle_bd09be8e512a"), err: true };
    if (st.msg && now - st.msg.at < 2600) return st.msg;
    if (st.up && st.shift && hv) {
      const p = upPlan();
      return p ? { text: SA.Config.text('editor_up_all_tip', `${p.list.length}`, p.from, p.to, money(p.cost)) } : { text: SA.Config.text('editor_up_none'), err: true };
    }
    if (!hv) return st.msg && now - st.msg.at < 5000 ? st.msg : null;
    if (st.up) {
      const o = upTarget(hv);
      if (!o) return { text: SA.Config.text('editor_up_hint') };
      const u = upCheck(o.cell), nm = fullName(o.cell.id, o.cell.mt || 1);
      if (!u.ok) return { text: `${nm}：${u.why}`, err: true };
      return { text: SA.Config.text('editor_up_one_tip', nm, u.mat.name, money(u.cost), u.mat.ingot ? ` + ${SA.INGOTS[u.mat.ingot].name}` : '') };
    }
    const key = st.drag ? st.drag.key : st.sel;
    if (key) {
      const id = kid(key), mt = kmt(key);
      const dragCell = st.drag && st.drag.kind === 'cell' ? st.drag : null;
      const sp = SA.V.editorSpot(id, hv, v, dragCell), cur = sp.hits.length === 1 ? sp.hits[0].cell : null;
      if (dragCell) {
        if (sp.r === dragCell.r && sp.c === dragCell.c) return { text: SA.Config.text("editor_c6276b4534ae") };
        if (sp.hits.length > 1) return { text: SA.Config.text("editor_f48c28de1e1e"), err: true };
        return { text: cur ? SA.Config.text("editor_a462c4d4dd7e", `${M[dragCell.id].name}`, `${M[cur.id].name}`) : SA.Config.text("editor_d0d9887d9d2f", `${where(sp.r, sp.c)}`) };
      }
      const buy = d().inv[key] > 0 ? '' : SA.Config.text("editor_027e2242db96", `${money(SA.buyPrice(id))}`);
      if (sp.hits.length > 1) return { text: SA.Config.text("editor_3c28233de0ef"), err: true };
      if (cur && cur.id === id && (cur.mt || 1) === mt) return { text: SA.Config.text("editor_57e9347b20fa", `${M[id].name}`) };
      if (cur && hurt(cur)) return { text: SA.Config.text("editor_3d2872b94543", `${M[cur.id].name}`), err: true };
      if (cur) return { text: SA.Config.text("editor_43c7ad13af38", `${buy}`, `${M[cur.id].name}`, `${M[id].name}`) };
      const chk = SA.V.placeCheck(v, id, sp.r, sp.c, stockCell(id, mt)), clash = M[id].layer === 'chassis' ? SA.V.chassisClash(v, id, null) : [];
      if (chk.ok && clash.length) return { text: SA.Config.text("editor_a5d71e9795eb", `${buy}`, `${M[clash[0].cell.id].name}`, `${M[id].name}`) };
      return chk.ok ? { text: SA.Config.text("editor_ce8ff20e77b5", `${buy}`, `${M[id].name}`, `${where(sp.r, sp.c)}`) } : { text: SA.Config.text("editor_13e430cf8e22", `${buy}`, `${M[id].name}`, `${chk.reason}`), err: true };
    }
    const so = SA.V.at(v, 'side', hv.r, hv.c), bo = SA.V.at(v, 'body', hv.r, hv.c);
    const o = (st.layer === 'side' && so) || bo || so;
    if (!o) return { text: SA.Config.text("editor_0fb95f36b58a", `${where(hv.r, hv.c)}`) };
    const cell = o.cell, m = M[cell.id], layer = o === so ? 'side' : 'body';
    const iss = issueAt(layer, o.r, o.c);
    if (iss) return { text: `${m.name}：${iss.reason}`, err: true };
    // 底部纸条只说三件事：名字 · 材质 · 耐久（其余属性看悬浮纸条和性能单）
    return { text: SA.Config.text("editor_5547c59f25d9", `${m.name}`, `${matName(cell.mt || 1)}`, `${Math.max(0, cell.hp)}`, `${SA.V.maxHp(cell)}`) };
  }

  // 未扩建格子的斜线纹理（8×8 平铺）
  let hatchPat = null;
  function hatch() {
    if (hatchPat) return hatchPat;
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const hg = c.getContext('2d');
    hg.fillStyle = 'rgba(160,200,240,0.2)';
    for (let i = 0; i < 8; i++) hg.fillRect(7 - i, i, 1, 1);
    return (hatchPat = g.createPattern(c, 'repeat'));
  }


  // ---------- 蓝图纸（界面重建 v3 · 手绘晒图）：古旧的普鲁士蓝，墨线是手画的 ----------
  // 格子只在车周围一圈画全（车占的子格外扩 2 格），再往外每根线伸出去一截、越来越断，像没画完的笔迹；车变大，画全的范围跟着变。
  // 左上角压一把黄杨木尺，右上角放一块印度橡皮、一支蘸水笔和一滴墨——纯装饰，不能点。整张按「车占的范围 + 可建造区」缓存。
  let bpKey = '', bpCv = null;
  const BPC = { deep: '#1c3550', base: '#26435f', lite: '#2d4d6b', faint: 'rgba(176,200,222,', ink: 'rgba(214,226,236,' };
  function hsh(x, y, s = 1) { let v = (x * 374761393 + y * 668265263 + s * 982451653) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; }
  const BAY4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay4 = (x, y) => (BAY4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  // 低频斑驳（8 像素一格的值噪声，双线性）
  function wash(x, y, s) { const gx = x / 22, gy = y / 22, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const a = hsh(x0, y0, s), b = hsh(x0 + 1, y0, s), c = hsh(x0, y0 + 1, s), d2 = hsh(x0 + 1, y0 + 1, s);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d2 * fx) * fy; }
  function occBox(v) {
    let c0 = K.COLS, c1 = -1, r0 = K.ROWS, r1 = -1;
    SA.V.each(v, (cell, r, c) => { const f = SA.fp(cell.id); c0 = Math.min(c0, c); c1 = Math.max(c1, c + f.w - 1); r0 = Math.min(r0, r); r1 = Math.max(r1, r + f.h - 1); });
    if (c1 < 0) { c0 = Math.floor(K.COLS / 2) - 2; c1 = c0 + 3; r0 = K.ROWS - 4; r1 = K.ROWS - 1; }
    return { c0: Math.max(0, c0 - 2), c1: Math.min(K.COLS - 1, c1 + 2), r0: Math.max(0, r0 - 2), r1: K.ROWS - 1 };
  }
  function blueprint(v) {
    const box = occBox(v), reg = SA.V.region(v);
    const key = `${box.c0},${box.c1},${box.r0}|${reg.r0},${reg.c0},${reg.c1}`;
    if (key === bpKey && bpCv) return bpCv;
    bpKey = key;
    const BW = W + MX * 2;   // 纸比画布左右各宽 MX（平移、居中时不露底）
    bpCv = bpCv || document.createElement('canvas'); bpCv.width = BW; bpCv.height = H;
    const k = bpCv.getContext('2d'), img = k.createImageData(BW, H), px = img.data;
    const hex = (hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
    const T = [hex(BPC.deep), hex(BPC.base), hex(BPC.lite)];
    // 纸：斑驳三阶抖动 + 边缘压暗 + 两圈淡淡的水渍
    const rings = [[W * 0.18, H * 0.72, 34], [W * 0.83, H * 0.3, 22]];
    for (let y = 0; y < H; y++) for (let xi = 0; xi < BW; xi++) {
      const x = xi - MX;
      let n = wash(x + 400, y, 3) * 0.75 + wash((x + 400) * 3, y * 3, 9) * 0.25;
      const e = Math.min(xi, y, BW - 1 - xi, H - 1 - y); if (e < 14) n -= (14 - e) / 14 * 0.55;
      for (const [rx, ry, rr] of rings) { const dd = Math.abs(Math.hypot(x - rx, y - ry) - rr); if (dd < 1.5) n -= 0.35; }
      const t = Math.max(0, Math.min(2, Math.floor(n * 2.2 + bay4(x, y) - 0.35)));
      const i = (y * BW + xi) * 4, c = T[t];
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      if (hsh(x, y, 5) > 0.996) { px[i] = c[0] + 22; px[i + 1] = c[1] + 26; px[i + 2] = c[2] + 30; }   // 纸纤维亮点
    }
    k.putImageData(img, 0, 0);
    k.save(); k.translate(MX, 0);   // 以下按蓝图坐标画（格子从 PADX 开始）
    // 手画的线：每 ~26 像素抖一下，笔压不匀（偶尔断一个像素），画全区之外伸出去一截渐渐断掉
    const dot = (x, y, a, strong) => { k.fillStyle = `${strong ? BPC.ink : BPC.faint}${a})`; k.fillRect(x, y, 1, 1); };
    const X0 = PADX + box.c0 * C, X1 = PADX + (box.c1 + 1) * C, Y0 = box.r0 * C, Y1 = K.ROWS * C;
    function stroke(vertical, pos, from, to, strong, seed) {
      const tailA = 14 + Math.floor(hsh(pos, 1, seed) * 60), tailB = 14 + Math.floor(hsh(pos, 2, seed) * 60);   // 两头伸出去多长
      const lo = Math.max(vertical ? 0 : PADX - 20, from - tailA), hi = Math.min(vertical ? H - 13 : W - PADX + 20, to + tailB);
      let wob = 0;
      for (let t = lo; t <= hi; t++) {
        if (t % 26 === 0) wob = hsh(pos, t, seed) < 0.3 ? (hsh(t, pos, seed) < 0.5 ? -1 : 1) : 0;
        const out = t < from ? (from - t) / tailA : t > to ? (t - to) / tailB : 0;   // 伸出去的那截：0 → 1
        if (out > 0 && hsh(t, pos, seed + 7) < out * 1.1) continue;                 // 越往外越断
        if (!strong && t % 2) continue;                                               // 细线是虚的
        if (hsh(t, pos, seed + 3) < 0.06) continue;                                   // 笔压不匀
        const a = (strong ? 0.85 : 0.5) * (1 - out * 0.7) * (0.8 + hsh(t, pos, seed + 11) * 0.2);
        if (vertical) dot(pos + wob, t, a.toFixed(2), strong); else dot(t, pos + wob, a.toFixed(2), strong);
      }
    }
    for (let c = box.c0; c <= box.c1 + 1; c++) stroke(true, PADX + c * C, Y0, Y1, c % 2 === 0, 13);
    for (let r = box.r0; r <= K.ROWS; r++) stroke(false, r * C, X0, X1, r % 2 === 0, 29);
    // 地面：一道粗墨线 + 下面几笔斜线
    for (let x = PADX - 10; x < W - PADX + 10; x++) { if (hsh(x, 3, 41) > 0.05) dot(x, H - 12, 0.7, true); if (hsh(x, 4, 41) > 0.35) dot(x, H - 10, 0.35, true); if (x % 7 === 0) for (let j = 0; j < 4; j++) dot(x - j, H - 8 + j, 0.28, false); }
    // 还没扩建的格子：一层暗蓝 + 斜线（铅笔打的阴影）
    for (let r = 0; r < K.ROWS; r++) for (let c = 0; c < K.COLS; c++) {
      if (r >= reg.r0 && c >= reg.c0 && c <= reg.c1) continue;
      const x = PADX + c * C, y = r * C;
      k.fillStyle = 'rgba(12,26,42,0.35)'; k.fillRect(x, y, C, C);
      k.fillStyle = `${BPC.faint}0.12)`; for (let j = 0; j < C; j++) if (((x + j) % 8) === 0 || true) { const q = (x + y + j) % 8; if (q === 0) k.fillRect(x + j, y + C - 1 - j, 1, 1); }
    }
    decorate(k);
    k.restore();
    return bpCv;
  }
  // 桌上的小物件（画在车下面，纯装饰）
  function decorate(k) {
    const R = (x, y, w, hh, col) => { k.fillStyle = col; k.fillRect(x, y, w, hh); };
    // 黄杨木尺：左上角斜放，用像素画最干净的 2:1 斜率。用整数坐标 w = 2y - x（横穿尺子）、u = 2x + y（顺着尺子）判断每个像素：
    // 边缘是规整的两格台阶，刻度和端头顺着尺子的垂直方向（1:2），不是竖直的；两头黄铜包角，下面一道影子
    const RX = 64, RY = 4, TT = 11, UL = 360;   // 往里放一点：打开时为了让车居中会左右平移，别被切掉
      // 厚 11 行、长 360 个 u 单位（横向约 144 像素）
    const ruler = (ox, oy, shadow) => {
      for (let y = -2; y < UL / 2 + TT * 2; y++) for (let x = -TT * 2; x < UL / 2 + 2; x++) {
        const w = 2 * y - x, u = 2 * x + y;
        if (w < 0 || w >= TT * 2 || u < 0 || u >= UL) continue;
        if (shadow) { R(ox + x, oy + y, 1, 1, 'rgba(8,18,30,.45)'); continue; }
        const j = w >> 1, cap = u < 16 || u >= UL - 16, end = u < 2 || u >= UL - 2;
        let col = j === 0 || j === TT - 1 || end ? (cap ? '#4e3510' : '#5a3a18') : j === 1 ? (cap ? '#f5d77a' : '#e3c48c') : j === TT - 2 ? (cap ? '#9a6b1d' : '#9a7442') : (cap ? '#d9a441' : '#c9a36a');
        const t = u - 18;
        if (!cap && !end && t >= 0 && u < UL - 18 && t % 10 < 2 && j >= 1 && j <= (Math.floor(t / 10) % 5 === 0 ? 5 : 3)) col = '#5a3a18';   // 刻度：每 5 格一根长的
        R(ox + x, oy + y, 1, 1, col);
      }
    };
    ruler(RX + 2, RY + 3, true); ruler(RX, RY, false);
    // 右上角：印度橡皮（旧红褐，一角磨圆）+ 几粒橡皮屑
    const ex = W - 52, ey = 10;
    R(ex + 2, ey + 3, 24, 12, 'rgba(8,18,30,.45)');
    R(ex, ey, 24, 12, '#4a2418'); R(ex + 1, ey + 1, 22, 10, '#8a4a3a'); R(ex + 1, ey + 1, 22, 2, '#a86454'); R(ex + 1, ey + 9, 22, 2, '#6e3628');
    k.clearRect(ex, ey, 1, 1); R(ex + 1, ey + 1, 1, 1, '#4a2418'); R(ex + 3, ey + 4, 16, 1, '#7a3e30');
    for (const [dx, dy] of [[-4, 14], [-7, 11], [28, 16], [30, 12], [-2, 17]]) R(ex + dx, ey + dy, 1, 1, '#b07a68');
    // 蘸水笔：深色木杆 + 黄铜箍 + 钢笔尖，斜放；笔尖旁一滴墨
    const x0 = W - 110, y0 = 44, len = 58;
    for (let t = 0; t < len; t++) {
      const x = x0 + t, y = y0 - Math.round(t * 0.42);
      const col = t < 8 ? (t < 4 ? '#8a939c' : '#5a646e') : t < 12 ? '#d9a441' : '#3b2418';
      R(x + 1, y + 3, 1, 2, 'rgba(8,18,30,.4)');
      R(x, y, 1, 2, col); if (t >= 12) R(x, y, 1, 1, '#6b4128');
    }
    for (const [dx, dy, a] of [[-4, 2, 1], [-5, 3, 1], [-4, 3, 1], [-3, 3, 1], [-4, 4, 1], [-6, 1, .5]]) R(x0 + dx, y0 + dy, 1, 1, `rgba(10,20,34,${a})`);
  }

  function draw(t) {
    const v = veh();
    g.clearRect(0, 0, W, H);
    g.fillStyle = BPC.deep;
    g.fillRect(0, 0, W, H);
    // 蓝图、车辆、标记和预览使用同一变换；底线固定，平移只作用于横轴。
    g.save();
    g.imageSmoothingEnabled = false;   // 整数倍放大 + 最近邻，像素不糊
    g.translate(st.panX, K.ROWS * C * (1 - st.zoom));
    g.scale(st.zoom, st.zoom);
    g.drawImage(blueprint(v), -MX, 0);
    const O = SA.V.occ(v, 'body');
    g.fillStyle = 'rgba(111,207,106,0.06)';
    for (let c = 0; c < K.COLS; c++) if (O[K.ROWS - 1][c]) g.fillRect(PADX + c * C, 0, C, K.ROWS * C);
    const drag = st.drag && st.drag.kind === 'cell' ? st.drag : null;
    const opts = {
      key: 'editor', t, heat: 0.35, water: 1, showWrecks: true, showBlocked: true,
      blocked: st.stats.blocked, dimBody: st.layer === 'side', dimCell: drag && drag.layer === 'body' ? drag : null,
      ghostLegs: !!(st.sel || drag),   // 正在摆放 / 拖动：四足的腿半透明，底盘两侧的格子看得清
    };
    const vc = SA.SPR.renderVehicle(v, opts), whole = wholePreview();
    const moved = whole && whole.ok && whole.dc !== 0;
    if (moved) g.globalAlpha = 0.25;
    g.drawImage(vc, 0, 0);
    if (moved) {
      g.globalAlpha = 0.8;
      g.drawImage(SA.SPR.renderVehicle(whole.vehicle, opts), 0, 0);
      g.globalAlpha = 1;
    }

    // 悬空 / 不合规：整个模块红色闪烁 + 感叹号
    for (const x of moved ? [] : st.stats.issues) {
      if (!v[x.layer][x.r][x.c]) continue;
      const [px, py, w, h] = boxOf(v, x.layer, x.r, x.c);
      tint(fromVeh(vc, px, py, w, h), px, py, w, h, RED, pulse(t, 0.2, 0.65));
      SA.SPR.text(g, '!', px + w - 8, py + 5, RED, 2);
    }

    const hv = st.hover;
    const selKey = st.drag && st.drag.kind === 'whole' ? null : drag ? drag.key : st.sel;
    const id = selKey && kid(selKey), selMt = selKey ? kmt(selKey) : 1;
    if (id) {
      // 能稳稳装上的地方：淡淡的绿色呼吸（所有合规位置盖到的小格）
      if (!drag) {
        const f = SA.fp(id), cover = new Set();
        for (let r = 0; r <= K.ROWS - f.h; r++)
          for (let c = 0; c <= K.COLS - f.w; c++)
            if (SA.V.placeCheck(v, id, r, c, stockCell(id, selMt)).ok) for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) cover.add((r + i) * K.COLS + c + j);
        for (const k of cover) fillCell(...cellXY(Math.floor(k / K.COLS), k % K.COLS), GREEN, pulse(t, 0.06, 0.2, 2));
      }
      if (hv) {
        const sp = SA.V.editorSpot(id, hv, v, drag);
        const [x, y] = cellXY(sp.r, sp.c), w = sp.w * C, h = sp.h * C;
        const cur = sp.hits.length === 1 ? sp.hits[0] : null;
        const home = drag && drag.r === sp.r && drag.c === sp.c;
        if (!drag && cur && cur.cell.id === id && (cur.cell.mt || 1) === selMt) {           // 同款：再点一次拆下
          const [bx, by, bw, bh] = boxOf(v, 'body' === SA.V.layerOf(id) ? 'body' : 'side', cur.r, cur.c);
          tint(fromVeh(vc, bx, by, bw, bh), bx, by, bw, bh, RED, pulse(t, 0.3, 0.7, 1));
          cross(bx, by, bw, bh);
        } else if (!home) {
          const bad = !SA.V.boxInRegion(v, sp.r, sp.c, sp.w, sp.h) || sp.hits.length > 1
            || (drag ? dropBad(drag, sp) : (cur ? hurt(cur.cell) : !SA.V.placeCheck(v, id, sp.r, sp.c, stockCell(id, selMt)).ok));
          for (const o of sp.hits) { const [bx, by, bw, bh] = boxOf(v, SA.V.layerOf(id), o.r, o.c); g.fillStyle = 'rgba(7,8,12,0.6)'; g.fillRect(bx, by, bw, bh); }
          g.globalAlpha = 0.8;
          SA.SPR.drawModule(g, id, x, y, { t, heat: 0.3, water: 1, mt: selMt });
          if (SA.isCockpit(id)) SA.SPR.cockpitCrew(g, id, x, y, { t, mt: selMt, seed: 0 }, null, { pilot: SA.Config.text("arena_a0c7716669b5"), t });   // 驾驶舱：驾驶员 + 操纵件也画出来
          if (id === 'boiler_l') SA.SPR.bigStoker(g, x, y, { t, mt: selMt, seed: 0 });   // 大锅炉：司炉小工
          g.globalAlpha = 1;
          tint(fromModule(id, t, selMt), x, y, w, h, bad ? RED : GREEN, pulse(t, 0.3, 0.6, 1), tintPad(id));
        }
      }
    } else if (st.up) {
      // 升级材质：悬停的模块金色闪烁（升不了的只淡淡提亮）；按着 Shift 时，全部升级会升的那一批一起闪
      const blink = pulse(t, 0.12, 0.72, 0.7);
      const plan = st.shift && hv ? upPlan() : null;
      if (plan) for (const x of plan.list) { const [bx, by, bw, bh] = boxOf(v, x.layer, x.r, x.c); tint(fromVeh(vc, bx, by, bw, bh), bx, by, bw, bh, GOLD, blink); }
      else if (hv && !st.shift) {
        const o = upTarget(hv);
        if (o) { const [x, y, w, h] = boxOf(v, o.layer, o.r, o.c), ok = upCheck(o.cell).ok; tint(fromVeh(vc, x, y, w, h), x, y, w, h, ok ? GOLD : WHITE, ok ? blink : 0.18); }
      }
    } else if (hv) {
      const o = SA.V.at(v, st.layer, hv.r, hv.c);
      if (o) { const [x, y, w, h] = boxOf(v, st.layer, o.r, o.c); tint(fromVeh(vc, x, y, w, h), x, y, w, h, WHITE, 0.18); }
    }
    // 刚升级完：新材料上闪一道金光，0.6 秒淡掉
    if (st.flash) {
      const k = (t - st.flash.at) / 0.6;
      if (k >= 1) st.flash = null;
      else for (const x of st.flash.list) {
        if (!v[x.layer][x.r][x.c]) continue;
        const [bx, by, bw, bh] = boxOf(v, x.layer, x.r, x.c);
        tint(fromVeh(vc, bx, by, bw, bh), bx, by, bw, bh, '#fff4c2', 0.85 * (1 - k));
      }
    }
    // 选中：整个模块绿色闪烁
    if (st.pick && !st.drag && v[st.pick.layer][st.pick.r][st.pick.c]) {
      const [x, y, w, h] = boxOf(v, st.pick.layer, st.pick.r, st.pick.c);
      tint(fromVeh(vc, x, y, w, h), x, y, w, h, GREEN, pulse(t, 0.25, 0.6));
    }

    g.restore();
    const tip = tipText();
    const text = tip ? tip.text : '';
    if (tipEl._t !== text) { tipEl._t = text; tipEl.textContent = text; tipEl.hidden = !text; }
    tipEl.classList.toggle('err', !!(tip && tip.err));
  }

  function loop() {
    frame = null;
    if (SA.current !== 'garage') return;
    draw(performance.now() / 1000);
    frame = requestAnimationFrame(loop);
  }

  return { open, refresh, focusInv };
})();
