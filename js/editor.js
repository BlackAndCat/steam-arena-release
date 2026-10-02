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
    dock: 'mods', bp: null, bpFilter: 'all', shop: false, cat: loadCat(), zoom: 1, panX: 0 };
  // 商店分组的折叠状态记在本机
  // 模块清单的纸页签：一次只看一类（界面重建 v3，替换原来的折叠条）；记住上次看的是哪一类
  function loadCat() { try { return localStorage.getItem('steam_arena_cat_v1') || null; } catch (e) { return null; } }
  // 关卡车工作台共用编辑器，但其分类选择不写入普通游戏车间的偏好。
  const stageWorkbench = () => !!document.querySelector('#assembly-screen > #screen');
  function saveCat() { if (stageWorkbench()) return; try { localStorage.setItem('steam_arena_cat_v1', st.cat || ''); } catch (e) { /* ignore */ } }
  let cv, g, stage, tipEl, viewEl, ctxEl, toolsEl, invEl, dockEl, tabsEl, plateEl, ghost, ro, frame = null, sheetEl = null, leverEl = null;

  const d = () => SA.S.d;
  const veh = () => d().vehicle;
  const money = (n) => SA.UI.money(n);
  const hurt = (cell) => cell && cell.hp > 0 && cell.hp < SA.V.maxHp(cell);
  const where = (r, c) => `第 ${K.ROWS - r} 行 第 ${c + 1} 列`;   // 子格坐标，从地面往上数
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
    Object.assign(st, { sel: null, pick: null, hover: null, press: null, drag: null, msg: null, zoom: 1, panX: 0, wheelAcc: 0 });
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
      h('button', { class: 'ed-help', title: '图例与规则', 'aria-label': '图例与规则', onclick: openHelp }, '?'));
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
    if (ro) ro.disconnect();
    ro = new ResizeObserver(fit);
    ro.observe(stage);
    renderAll();
    frame = requestAnimationFrame(() => { fit(); loop(); });
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
    cancelPress();
    renderDock();
  }

  function onContextMenu(e) {
    if (SA.current !== 'garage' || !document.querySelector('#modal').hidden) return;
    if (st.sel || st.pick || st.press || st.drag) {
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
    if (!cell) { if (st.sel) { emptyTap(null); return; } beginPress(e, { kind: 'pan', cell: null, panX: st.panX }); return; }
    const v = veh();
    if (st.sel) { placeAt(st.sel, cell); return; }
    const here = SA.V.at(v, st.layer, cell.r, cell.c);
    if (here) { beginPress(e, { kind: 'cell', layer: st.layer, r: here.r, c: here.c, id: here.cell.id, key: SA.invKey(here.cell.id, here.cell.mt) }); return; }
    // 空白按压暂不执行点击：超过阈值平移蓝图，否则松手时仍执行原来的空格操作。
    beginPress(e, { kind: 'pan', cell, panX: st.panX });
  }

  function emptyTap(cell) {
    if (!cell) { if (st.pick) { st.pick = null; renderDock(); } return; }
    if (st.pick) moveTo(st.pick, cell);
    else if (st.layer === 'side' && SA.V.at(veh(), 'body', cell.r, cell.c)) say('侧挂层这里没有侧炮。切回「主体层」才能选中主体模块');
  }

  function beginPress(e, src) {
    st.press = { src, x: e.clientX, y: e.clientY, pid: e.pointerId, el: e.currentTarget };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onMove(e) {
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
      makeGhost(p.src.key);
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
      else emptyTap(src.cell);
      return;
    }
    if (!drag) { if (src.kind === 'cell') tapCell(src); return; }
    st.noClick = true;   // 拖完松手不再触发库存按钮的 click
    setTimeout(() => { st.noClick = false; }, 0);
    st.hover = target;
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
  function matUpgrade(cell) {
    const u = SA.S.matUpInfo(cell);
    if (!u.ok) { say(u.why, true); return; }
    const m0 = SA.mod(cell), m1 = SA.mod(cell.id, u.to);
    const diff = [['耐久', 'hp'], ['伤害', 'dmg'], ['动力', 'supply'], ['水', 'water'], ['冷却', 'cool'], ['撞击', 'ram'], ['活塞', 'punch'], ['承重', 'load'], ['护甲', 'armor']]
      .filter(([, k]) => m0[k]).map(([n, k]) => `${n} ${k === 'load' ? SA.tons(m0[k]) : m0[k]} → ${k === 'load' ? SA.tons(m1[k]) : m1[k]}`);
    SA.UI.pay({ title: `升级材料 · ${u.mat.name}`, amount: u.cost, okLabel: `升级为${u.mat.name}`,
      lines: [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(cell.id, 1, u.to), h('div', {}, h('b', {}, fullName(cell.id, u.to)), ' ', SA.Camp.matChip(u.to),
        h('div', { class: 'muted' }, diff.join(' · ')))),
        u.mat.ingot ? h('p', { class: 'muted' }, `同时消耗 ${SA.INGOTS[u.mat.ingot].name} ×1（剩 ${(d().ingots[u.mat.ingot] || 0) - 1}）。`) : null,
        h('p', { class: 'muted' }, '材料越好，耐久、伤害、动力、冷却等一起放大；重量和产热不变。拆下后材料跟着模块走。')],
      onPaid: () => {
        SA.S.upgradeMaterial(cell, u);
        say(`${M[cell.id].name} 升级为${u.mat.name}`);
        changed();
      } });
  }

  // 改装：炮盾 / 附加装甲，每级加耐久和重量
  function upgrade(cell) {
    const lv = (cell.lv || 0) + 1, cost = SA.upCost(cell.id, lv), name = SA.upName(cell.id);
    SA.UI.pay({ title: `改装 · ${name}`, amount: cost, okLabel: `装上${name}`,
      lines: [h('p', { style: 'margin-top:0' }, `${M[cell.id].name} 升到 ${lv} 级：耐久 +${Math.round(SA.upHp(cell.id) * 100)}%（按原耐久算），重量 +${SA.K.UP_KG} kg。`),
        h('p', { class: 'muted' }, '纯属性升级，不占格子。拆下模块时改装件按一半价格回收。')],
      onPaid: () => {
        SA.S.upgradeCell(cell, lv);
        st.pick = null;
        say(`${M[cell.id].name} 装上${name}，${'▲'.repeat(lv)}`);
        changed();
      } });
  }

  // 库存不够就自动购买，只有钱不够才提示贷款；仍按商店解锁和可售材料检查。
  function withStock(key, then) {
    if (d().inv[key] > 0) { then(); return; }
    const id = kid(key), m = M[id];
    if (kmt(key) !== SA.buyMt(id) || !buyable(id)) { say(has('shop') ? `${m.name}还没解锁` : '商店还没开张：只能用库存里的模块', true); st.sel = null; renderDock(); return; }
    // 钱够就直接买，不弹确认；钱不够才会问要不要贷款
    SA.UI.pay({
      title: `购买 ${fullName(id, SA.buyMt(id))}`, amount: SA.buyPrice(id), okLabel: '购买并安装', confirm: false,
      lines: [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(id, 1), h('div', {}, h('b', {}, m.name), h('div', { class: 'muted' }, SA.UI.statLine(id))))],
      onPaid: () => { SA.S.addInv(id, 1, SA.buyMt(id)); then(); },
    });
  }

  // 把库存里的模块放到鼠标位置：压着一个模块就替换它（同款同材料 = 拆下），压着好几个就不行
  function placeAt(key, hv) {
    const id = kid(key), mt = kmt(key);
    const v = veh(), layer = SA.V.layerOf(id), m = M[id];
    const sp = SA.V.editorSpot(id, hv, v), { r, c } = sp;
    if (!SA.V.boxInRegion(v, r, c, sp.w, sp.h)) { say('这一格还没扩建：推进战役会解锁更大的改装台', true); return; }
    if (st.layer !== layer) st.layer = layer;
    if (sp.hits.length > 1) { say('这里压着好几个模块：先拆掉或挪开，再放', true); return; }
    const cur = sp.hits[0] || null;
    if (cur && cur.cell.id === id && (cur.cell.mt || 1) === mt) { removeAt({ layer, r: cur.r, c: cur.c }); return; }   // 同款再点一次 = 拆下
    if (cur && hurt(cur.cell)) { say(`${M[cur.cell.id].name} 受损，先修理才能替换`, true); st.pick = { layer, r: cur.r, c: cur.c }; st.sel = null; renderDock(); return; }
    // 底盘：一辆车只能用一种底盘，整件底盘（四足 / 双足）只能有一个——放新底盘时把冲突的旧底盘换下来，
    // 而不是在改装台上留下两个底盘、再把压在车身下面的那个标成不合规
    const clash = m.layer === 'chassis' ? SA.V.chassisClash(v, id, cur) : [];
    if (clash.some(o => hurt(o.cell))) { say(`${M[clash[0].cell.id].name} 受损，先修理才能换底盘`, true); return; }
    // 换下旧模块后放不放得下（大小可能不一样），先在副本上试
    const test = SA.V.clone(v);
    if (cur) test[layer][cur.r][cur.c] = null;
    for (const o of clash) test.body[o.r][o.c] = null;
    const chk = SA.V.canPut(test, id, r, c);
    if (!chk.ok) { say(chk.reason, true); return; }
    withStock(key, () => {
      const old = cur && cur.cell;
      const scrap = SA.S.installStock(v, id, r, c, mt, layer, cur, clash);
      // 点选和拖入都保留同一放置模板；库存用尽后，下一次放置继续走购买 / 借贷流程。
      st.sel = key;
      st.pick = null;
      const iss = SA.V.issues(v).find(x => x.layer === layer && x.r === r && x.c === c);
      const tail = iss ? `（${iss.reason}，出战前要接好）` : '';
      if (!old && clash.length) say(`换底盘：${fullName(clash[0].cell.id, clash[0].cell.mt || 1)}${clash.length > 1 ? ` ×${clash.length}` : ''} → ${fullName(id, mt)}（换下的放回库存）${tail}`, !!iss);
      else say(old ? `${fullName(old.id, old.mt || 1)} → ${fullName(id, mt)}${scrap ? `，损毁件 / 改装件回收 ${money(scrap)}` : ''}${tail}` : `装上 ${m.name}${tail}`, !!iss);
      changed();
    });
  }

  function removeAt({ layer, r, c }) {
    const res = SA.S.removeVehicleCell(layer, r, c);
    if (!res.ok) { say(res.reason, true); return; }
    const scrap = res.scrap;
    say(`拆下 ${res.removed.map(x => M[x.id].name).join('、')}，已放回库存${scrap ? `；损毁件 / 改装件回收 ${money(scrap)}` : ''}`);
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
    say(other ? `对调：${M[cell.id].name} ⇄ ${M[other.id].name}` : `移到${where(sp.r, sp.c)}`);
    st.pick = null;   // 移动完成即取消选中
    changed();
  }

  function repair(cells) {
    const cost = cells.reduce((a, x) => a + SA.S.repairCost(x), 0);
    SA.UI.pay({ title: '修理', amount: cost, okLabel: '修理', confirm: false, lines: [SA.UI.repairList(cells)],
      onPaid: () => { SA.S.repairCells(cells); st.pick = null; say(`修好了，花费 ${money(cost)}`); changed(); } });
  }

  function buyOne(id) {
    const m = M[id];
    if (!buyable(id)) return;
    SA.UI.pay({ title: `购买 ${fullName(id, SA.buyMt(id))}`, amount: SA.buyPrice(id), okLabel: '购买', confirm: false,
      lines: [h('div', { class: 'dlg-item' }, SA.SPR.moduleCanvas(id, 1), h('div', {}, h('b', {}, m.name), h('div', { class: 'muted' }, SA.UI.statLine(id))))],
      onPaid: () => { const k = SA.invKey(id, SA.buyMt(id)); SA.S.addInv(id, 1, SA.buyMt(id)); say(`购入 ${fullName(id, SA.buyMt(id))}，库存 ${d().inv[k]}`); changed(); } });
  }

  function selectInv(key) {
    if (st.noClick) return;
    st.sel = st.sel === key ? null : key;
    st.pick = null;
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
    const s = st.stats, UI = SA.PX.ui;
    plateEl.innerHTML = '';
    const nameIn = h('input', { type: 'text', class: 'plate-name px-sk px-sk-brass', value: veh().name, maxLength: 20, 'aria-label': '车名',
      onchange: () => { SA.S.renameVehicle(nameIn.value); } });
    const hurtList = damagedCells();
    const cost = hurtList.reduce((a, x) => a + SA.S.repairCost(x), 0);
    // 拿着库存里的零件：算一遍装上以后的数，性能单上用棋盘点标出变化
    let preview = null;
    if (st.sel) { try { preview = SA.V.statsWith(veh(), kid(st.sel), kmt(st.sel)); } catch (e) { preview = null; } }
    plateEl.append(...[
      h('div', { class: 'ed-sheet-t px-h2' }, '性能单'),
      nameIn,
      h('div', { class: 'ed-sheet-row' }, h('span', {}, '评分 ', UI.num(s.rating)), s.problems.length ? UI.hand(`${s.problems.length} 项问题`, 15) : h('span', { class: 'px-small' }, '✓ 可出战')),
      hurtList.length ? UI.btn(`修理 ${hurtList.length} 处 · ${money(cost)}`, { sm: true, title: SA.UI.repairBrief(hurtList), onclick: () => repair(hurtList) }) : null,
      SA.UI.pxStats(s, veh(), preview)].filter(Boolean));
    // 车间的出口（拉闸只留给黑板上真正开打那一下）：放在改装台下面那条工单的右端——回院子 / 出战（也是回院子，再把出战黑板拉下来）
    leverEl.innerHTML = '';
    leverEl.append(UI.btn('← 回院子', { sm: true, onclick: () => SA.nav('home') }),
      UI.btn('出战 →', { kind: 'pri', sm: true, title: s.canDeploy ? '回院子，拉下出战黑板' : `还有问题：\n${s.problems.join('\n')}`, onclick: () => SA.nav('arena') }),
      ...(s.canDeploy ? [] : [h('div', { class: 'px-hand px-prob ed-exit-warn', title: s.problems.join('\n') }, `还有 ${s.problems.length} 项问题`)]));
  }

  // 画布右上角：看哪一层 + 蓝图库开关（右侧面板在模块清单和蓝图库之间切换）
  function setDock(k) { st.dock = k; st.sel = null; st.pick = null; st.bp = null; renderAll(); }
  function renderView() {
    viewEl.innerHTML = '';
    const setLayer = (k) => { st.layer = k; st.pick = null; if (st.sel && SA.V.layerOf(kid(st.sel)) !== k) st.sel = null; renderAll(); };
    viewEl.append(...[
      has('side') ? SA.PX.ui.toggle('主体层', '侧挂层', st.layer === 'side', () => setLayer(st.layer === 'side' ? 'body' : 'side')) : null,
      bpOpen() ? h('button', { class: `btn small bp-btn ${st.dock === 'bps' ? 'on' : ''}`, title: '蓝图库：保存 / 套用整车方案，分享码也在这里',
        onclick: () => setDock(st.dock === 'bps' ? 'mods' : 'bps') }, SA.SPR.iconCanvas('scroll', st.dock === 'bps' ? '#e4e0d6' : '#f5d77a', 2), '蓝图库') : null].filter(Boolean));
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
            n ? h('span', { class: 'chip' }, `库存 ${n}`) : canBuy ? h('span', { class: 'chip buy' }, `无库存 · 放置时购买 ${money(SA.buyPrice(id))}`) : h('span', { class: 'chip no' }, SA.isUnique(id) ? '只能缴获' : '当前材料无库存')),
          h('div', { class: 'sub' }, SA.isUnique(id) ? '唯一件：不能再买到，卖掉或报废就没有了；右键取消' : canBuy ? '点格子连续放置，库存用尽后自动购买；点已有模块直接替换，点同款模块拆下；右键取消' : n ? '点格子放置库存里的当前材料，放置后保持选中；右键取消' : '当前没有可用库存，右键取消或选择其他模块')),
        h('div', { class: 'acts' },
          canBuy ? h('button', { class: 'btn small', onclick: () => buyOne(id) }, `买 ${money(SA.buyPrice(id))}`) : null,
          n ? h('button', { class: 'btn small', onclick: () => sellOne(key) }, `卖 ${money(SA.cellValue({ id, mt }) * 0.5)}`) : null,
          h('button', { class: 'btn small', title: '右键 / Esc', onclick: cancelSelection }, '取消')));
      return;
    }
    const pk = st.pick && v[st.pick.layer][st.pick.r][st.pick.c];
    if (pk) {
      const { layer, r, c } = st.pick, m = M[pk.id], max = SA.V.maxHp(pk);
      const iss = issueAt(layer, r, c);
      const fix = [pk, layer === 'body' && v.side[r][c]].filter(x => x && x.hp < SA.V.maxHp(x));
      const cost = fix.reduce((a, x) => a + SA.S.repairCost(x), 0);
      const lv = pk.lv || 0, upName = SA.upName(pk.id);
      const mu = SA.S.matUpInfo(pk);
      // 下一级材料：已解锁或有锭才显示按钮；没解锁的只在提示里说一句
      const matBtn = pk.hp > 0 && !mu.max && (mu.ok || mu.mat.ingot || mu.to <= SA.Camp.maxMat() + 1) && SA.Camp.maxMat() > 1
        ? h('button', { class: `btn small ${mu.ok ? 'primary' : ''}`, disabled: !mu.ok, title: mu.why || `属性 ×${mu.mat.mul}`, onclick: () => matUpgrade(pk) },
          `升级为${mu.mat.name} · ${money(mu.cost)}${mu.mat.ingot ? ` + ${SA.INGOTS[mu.mat.ingot].name}` : ''}`) : null;
      ctxEl.append(thumb(pk.id, pk.mt),
        h('div', { class: 'info' },
          h('div', {}, h('b', {}, m.name), ' ', SA.UI.uniqueBadge(pk.id), ' ', SA.Camp.matChip(pk.mt || 1), ' ', h('span', { class: 'chip' }, pk.hp <= 0 ? '已损毁' : `耐久 ${pk.hp}/${max}`), ' ', SA.UI.repairChip(pk), ' ',
            has('upgrade') ? h('span', { class: `chip rank ${lv ? 'on' : ''}`, title: `${upName} ${lv}/${SA.K.UP_MAX} 级` }, `${upName} ${'▲'.repeat(lv)}${'△'.repeat(SA.K.UP_MAX - lv)}`) : null, ' ',
            h('span', { class: 'muted' }, `${SA.tons(SA.weightOf(pk))} · ${where(r, c)}`)),
          iss ? h('div', { class: 'sub err' }, iss.reason) : h('div', { class: 'sub' }, matBtn && !mu.ok ? mu.why : '点空格子移动；拖到别的模块上对调；拖出车外放回库存'),
          ''),
        h('div', { class: 'acts' },
          matBtn,
          has('upgrade') && pk.hp > 0 && lv < SA.K.UP_MAX ? h('button', { class: 'btn small', title: `耐久 +${Math.round(SA.upHp(pk.id) * 100)}%，重量 +${SA.K.UP_KG} kg`, onclick: () => upgrade(pk) },
            `${upName} ${lv + 1} 级 · ${money(SA.upCost(pk.id, lv + 1))}`) : null,
          fix.length ? h('button', { class: 'btn small', title: SA.UI.repairBrief(fix), onclick: () => repair(fix) }, `修理 ${money(cost)}`) : null,
          h('button', { class: 'btn small', title: 'Delete', onclick: () => (pk.hp <= 0 && SA.isUnique(pk.id)
            ? uniqueConfirm(`报废唯一件「${m.name}」？`, '报废以后就再也拿不到了。修好它只要付修理费。', '仍然报废', () => removeAt(st.pick))
            : removeAt(st.pick)) }, pk.hp <= 0 ? `报废 +${money(SA.cellValue({ id: pk.id, mt: pk.mt }) * 0.1)}` : '拆下'),
          h('button', { class: 'btn small', title: '右键 / Esc', onclick: cancelSelection }, '取消')));
      return;
    }
    st.pick = null;
    if (st.dock === 'bps') { bpCtx(); return; }
    // 什么都没选：告诉玩家现在该做什么
    const s = st.stats;
    ctxEl.append(h('div', { class: 'info' },
      s.problems.length ? h('div', { class: 'err' }, s.problems[0]) : h('div', {}, h('b', {}, '车已就绪'), s.warnings.length ? h('span', { class: 'muted' }, ` · ${s.warnings[0]}`) : null),
      h('div', { class: 'sub' }, '从模块清单选一个，再点格子放置；拖动车上的模块可移动 / 对调，拖回清单就放回库存。')),
    '');
  }

  // ---------- 右侧面板：页签 + 「商店」开关 / 蓝图筛选 ----------
  function renderTools() {
    toolsEl.innerHTML = '';
    const title = (t, extra) => h('div', { class: 'panel-title' }, h('b', {}, t), extra);
    if (st.dock === 'bps') {
      toolsEl.append(title('蓝图库', h('button', { class: 'btn small', onclick: () => setDock('mods') }, '← 模块清单')),
        h('div', { class: 'panel-row' },
          h('div', { class: 'inv-tabs' }, [['all', '全部'], ['mine', '我的'], ['official', '官方'], ['cloud', '分享码示例']].map(([k, n]) =>
            h('button', { class: `tab ${st.bpFilter === k ? 'on' : ''}`, onclick: () => { st.bpFilter = k; renderTools(); renderInv(); } }, n))),
          h('button', { class: 'btn small', onclick: importDialog }, '导入分享码')));
      return;
    }
    const owned = Object.values(d().inv).reduce((a, n) => a + n, 0);
    toolsEl.append(title('模块清单', h('span', { class: 'muted' }, `库存 ${owned} 件`)),
      has('shop') ? h('div', { class: 'panel-row' },
        h('span', { class: 'muted' }, st.shop ? '也列出没有库存的模块' : '只列出有库存的模块'),
        h('label', { class: `switch ${st.shop ? 'on' : ''}`, title: '打开后也列出没有库存的模块，放到车上即购买' },
          h('input', { type: 'checkbox', checked: st.shop, onchange: (e) => { st.shop = e.target.checked; renderTools(); renderInv(); } }),
          h('span', { class: 'knob' }), '商店')) : h('div', { class: 'panel-row' }, h('span', { class: 'muted' }, '商店还没开张：先用库存里的模块。')));
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
      h('div', { class: 'tp-ks' }, SA.UI.statLine(id, mt).split(' · ').map(t => h('div', {}, t)), h('div', {}, SA.UI.repairPips(id, '修理难度'))),
      h('div', { class: 'tp-note' }, h('b', {}, '说明'), h('br'), m.desc || '—'),
      m.lore ? h('div', { class: 'tp-note' }, h('b', {}, '背景'), h('br'), m.lore) : null];
  }
  function keyStats(id, mt = 1) {
    const m = SA.mod(id, mt), out = [];
    if (m.layer === 'chassis') out.push(`承重 ${SA.tons(m.load)}`, SA.kmh(m.speed), m.brake >= 1.5 ? '起步刹车最快' : m.brake < 0.8 ? '刹车慢' : '刹车中等', m.sway < 0.6 ? '移动最稳' : m.sway > 1.2 ? '移动晃' : '移动一般');
    else if (m.dmg) out.push(`伤害 ${m.dmg}`, `装填 ${m.reload}s`, m.indirect ? '高抛' : `散布 ±${m.spread}°`, m.penetration >= 99 ? '不会弹开' : `穿深 ${m.penetration}`);
    else if (m.supply) out.push(`动力 ${SA.Phys.fmtPower(m.supply)}`, `回路产热 ${SA.Phys.fmtKw(m.heatRate)}`);
    else if (m.store) out.push(`储能 ${SA.Phys.fmtHeat(m.store)}`, `不够时补 ${SA.Phys.fmtKw(SA.K.BATTLE.STORE_RELEASE_PER_SEC)}`);
    else if (m.water) out.push(`冷却 ${SA.Phys.fmtKw(m.cool)}`, `水 ${SA.Phys.fmtWater(m.water)}`);
    else if (m.dryCool) out.push(`不耗水散热 ${SA.Phys.fmtKw(m.dryCool)}`);
    else if (m.waterSave) out.push(`省水 ${Math.round((1 - m.waterSave) * 100)}%`, `冷却 ${SA.Phys.fmtKw(m.cool)}`);
    else if (m.ram) out.push(`撞击 ${m.ram}`, m.punch ? `活塞 ${m.punch}` : `耐久 ${m.hp}`);
    else out.push(`耐久 ${m.hp}`);
    if (m.tether) out.push('牵引');
    if (m.armor && !m.load) out.push(`装甲厚 ${Math.round(m.armor * 10) / 10}`);
    if (m.power) out.push(`额定功率 ${SA.Phys.fmtKw(m.power)}`);
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
    if (stageWorkbench()) tabsEl.append(h('button', { class: `ed-tab ${st.cat === 'all' ? 'on' : ''}`, title: '全部模块',
      onclick: () => { st.cat = 'all'; renderInv(); invEl.scrollTop = 0; } }, h('span', { class: 'nm' }, '全部')));
    for (const { cat, keys } of cats) {
      if (!keys.length) continue;   // 没有库存（商店模式下没有可买）的大类不显示页签
      const have = keys.reduce((a, k) => a + (inv[k] || 0), 0);
      tabsEl.append(h('button', { class: `ed-tab ${st.cat === cat ? 'on' : ''} ${keys.length ? '' : 'none'}`, style: `--c:${SA.CAT[cat].plate}`, title: keys.length ? `${SA.CAT[cat].name}：${shop ? `${keys.length} 种` : `${have} 件`}` : `${SA.CAT[cat].name}：没有`,
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
        h('span', { class: 'px-h2' }, cat === 'all' ? '全部模块' : SA.CAT[cat].name),
        h('span', { class: 'px-small' }, cat === 'all' ? `${distinct} 种` : shop ? `${keys.length} 种` : `${have} 件`)));
      for (const key of keys) {
        shown++;
        const id = kid(key), mt = kmt(key), m = M[id], n = inv[key] || 0;
        // 清单只放大图、名字、材质和数量；属性、修理难度、说明都在悬浮纸条里（2026-09-30 用户：要清爽，名字最要紧）
        const row = h('button', { class: `mrow cat-${m.cat} ${st.sel === key ? 'sel' : ''} ${n ? '' : 'unowned'}`, 'data-page-key': `inventory:${key}`, onclick: () => selectInv(key) },
        h('span', { class: 'pic' }, bigPic(id, mt)),
        h('span', { class: 'mid' },
          h('span', { class: 'nm' }, m.name), h('span', { class: 'mt' }, SA.Camp.matChip(mt), ' ', SA.UI.uniqueBadge(id))),
        n ? h('span', { class: 'cnt' }, h('b', {}, `×${n}`), h('small', {}, '库存'))
          : h('span', { class: 'cnt buy' }, h('b', {}, money(m.price)), h('small', {}, '购买')));
        SA.PX.ui.tip(row, () => modTip(id, mt));
        row.addEventListener('pointerdown', (e) => { if (e.button === 0) beginPress(e, { kind: 'inv', id, key }); });
        row.addEventListener('pointermove', onMove);
        row.addEventListener('pointercancel', cancelPress);
        invEl.append(row);
        // 选中时不再展开对照表（2026-09-30 用户：只要悬浮纸条）
      }
    }
    if (!shown) invEl.append(h('div', { class: 'empty' },
      h('b', {}, '库存是空的'),
      h('span', { class: 'muted' }, has('shop') ? '车上的模块拖到这里会放回库存。想买新模块，打开「商店」。' : '车上的模块拖到这里会放回库存。商店打完序章才开张。'),
      has('shop') ? h('button', { class: 'btn primary', onclick: () => { st.shop = true; renderTools(); renderInv(); } }, '打开商店') : null));
    else if (shop) invEl.prepend(h('div', { class: 'shop-note' }, '商店已打开：选中没有库存的模块，放到车上就自动购买。'));
    invEl.scrollTop = keep;
  }

  function renderDock() { renderPlate(); renderCtx(); renderInv(); }
  function renderAll() { renderPlate(); renderView(); renderCtx(); renderTools(); renderInv(); }

  // ---------- 蓝图库 · 分享码示例（底部操作栏的第二个页签）----------
  const KIND = { mine: '我的', official: '官方', cloud: '分享码示例' };
  function bpList() { return SA.Blueprints.all().filter(b => st.bpFilter === 'all' || b.kind === st.bpFilter); }
  function bpPic(bp, scale) {
    const cvs = SA.UI.vehiclePreview(SA.V.fromLayout(bp.name, bp), scale);
    cvs.classList.add('bp-pic');
    return cvs;
  }

  function renderBps() {
    const nextName = `${veh().name} 方案 ${SA.Blueprints.mine().length + 1}`;
    invEl.append(h('button', { class: 'bprow add', title: '把当前车辆存成一张蓝图', onclick: () => {
      SA.Blueprints.save(nextName);
      st.bpFilter = st.bpFilter === 'official' || st.bpFilter === 'cloud' ? 'all' : st.bpFilter;
      st.bp = SA.Blueprints.all().find(b => b.kind === 'mine').key;
      say(`已存为蓝图「${nextName}」`);
      renderAll();
    } }, h('span', { class: 'plus' }, '＋'), h('span', { class: 'mid' }, h('span', { class: 'nm' }, '存为蓝图'), h('span', { class: 'muted' }, '把当前车辆存一份，随时一键换回来'))),
      h('button', { class: 'bprow add share', title: '生成当前车辆的分享码', onclick: () => shareDialog(veh().name, SA.V.encode(veh()), veh()) },
        h('span', { class: 'plus' }, '⇪'), h('span', { class: 'mid' }, h('span', { class: 'nm' }, '分享当前车辆'), h('span', { class: 'muted' }, '生成分享码，发给别人粘贴导入'))));
    for (const bp of bpList()) {
      const p = SA.Blueprints.plan(bp);
      invEl.append(h('button', { class: `bprow ${st.bp === bp.key ? 'sel' : ''}`, 'data-page-key': `blueprint:${bp.key}`, title: bp.desc || bp.name,
        onclick: () => { st.bp = st.bp === bp.key ? null : bp.key; renderDock(); } },
      bpPic(bp, 1),
      h('span', { class: 'mid' },
        h('span', { class: 'nm' }, bp.name),
        h('span', { class: 'ks' }, h('span', { class: `kind-${bp.kind}` }, bp.kind === 'cloud' ? `示例 · ${bp.author}` : KIND[bp.kind]),
          h('span', { class: p.cost ? 'gold' : '' }, p.cost ? `需 ${money(p.cost)}` : '库存够用')))));
    }
  }

  function bpCtx() {
    const bp = st.bp && SA.Blueprints.all().find(b => b.key === st.bp);
    if (!bp) {
      ctxEl.append(h('div', { class: 'info' },
        h('div', {}, h('b', {}, '蓝图库 · 分享码车库')),
        h('div', { class: 'sub' }, '在右边选一张蓝图一键换装（车上的模块先拆回库存，缺的按原价补买）。「存为蓝图」保存当前车辆；「分享当前车辆」生成分享码；「导入分享码」把别人的车存进来。')));
      return;
    }
    const v = SA.V.fromLayout(bp.name, bp), s = SA.V.stats(v), p = SA.Blueprints.plan(bp);
    const done = () => { st.bp = null; st.stats = SA.V.stats(veh()); changed(); };
    const nameIn = bp.kind === 'mine' ? h('input', { type: 'text', class: 'bp-name', value: bp.name, maxLength: 20, 'aria-label': '蓝图名称',
      onchange: () => { SA.Blueprints.rename(bp.index, nameIn.value.trim() || bp.name); renderInv(); } }) : h('b', {}, bp.name);
    let armed = false;
    const del = bp.kind === 'mine' ? h('button', { class: 'btn small', onclick: () => {
      if (!armed) { armed = true; del.textContent = '确认删除？'; del.classList.add('danger'); return; }
      SA.Blueprints.del(bp.index); st.bp = null; say('蓝图已删除'); renderAll();
    } }, '删除') : null;
    ctxEl.append(bpPic(bp, 0.5),
      h('div', { class: 'info' },
        h('div', {}, nameIn, ' ', h('span', { class: `chip kind-${bp.kind}` }, bp.kind === 'cloud' ? `分享码示例 · ${bp.author}` : KIND[bp.kind]), ' ', h('span', { class: 'chip' }, `评分 ${s.rating}`)),
        h('div', { class: `sub ${s.canDeploy ? '' : 'err'}` }, bp.desc || (s.canDeploy ? '可以直接出战' : s.problems[0]))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn small primary', onclick: () => SA.Blueprints.apply(bp, done) }, p.cost ? `应用 · ${money(p.cost)}` : '应用'),
        bp.kind === 'mine' ? h('button', { class: 'btn small', title: '用当前车辆覆盖这张蓝图', onclick: () => { SA.Blueprints.overwrite(bp.index); say('已用当前车辆覆盖'); renderAll(); } }, '覆盖') : null,
        bp.kind !== 'official' ? h('button', { class: 'btn small', title: '生成这台车的分享码，发给别人粘贴导入', onclick: () => shareDialog(bp.name, bp.kind === 'mine' ? SA.Blueprints.share(bp) : bp.code, v) }, '分享码') : null,
        bp.kind === 'cloud' ? h('button', { class: 'btn small', title: '把这台示例车存进「我的蓝图」', onclick: () => {
          const nv = SA.Blueprints.importCode(bp.code);
          if (!nv) { say('这个分享码读不出来', true); return; }
          st.bpFilter = 'mine'; st.bp = SA.Blueprints.all()[0].key; say(`已存进我的蓝图：「${nv.name}」`); renderAll();
        } }, '存为我的') : null,
        del));
  }

  // 分享码是纯字符串：不上传、不经过服务器。导入时边粘贴边预览，读不出来就说清楚
  function codePreview(v) {
    if (!v) return h('div', { class: 'code-pv bad' }, h('b', {}, '读不出来'), h('span', { class: 'muted' }, '分享码以 SA2.（或旧的 SA1.）开头，整段复制，不要漏掉末尾。'));
    const s = SA.V.stats(v), n = Object.values(SA.V.countIds(v)).reduce((a, x) => a + x, 0);
    const pic = SA.UI.vehiclePreview(v, 1.5); pic.classList.add('bp-pic');
    return h('div', { class: 'code-pv' }, pic, h('div', {}, h('b', {}, v.name), h('div', { class: 'muted' }, `${n} 个模块 · 评分 ${s.rating} · ${SA.tons(s.weight)}`),
      s.issues.length ? h('div', { class: 'muted' }, `有 ${s.issues.length} 个模块摆放不合规，应用后要在车间接好`) : null));
  }
  function importDialog() {
    const box = h('textarea', { rows: 3, placeholder: '粘贴 SA2. 开头的分享码（旧的 SA1. 码也能读）' });
    const pv = h('div', { class: 'code-pv-wrap' }, h('span', { class: 'muted' }, '粘贴后这里会显示车的样子。'));
    let v = null;
    box.addEventListener('input', () => {
      const raw = box.value.trim();
      v = raw ? SA.V.decode(raw) : null;
      pv.innerHTML = ''; pv.append(raw ? codePreview(v) : h('span', { class: 'muted' }, '粘贴后这里会显示车的样子。'));
    });
    SA.UI.dialog('导入分享码', [h('p', { class: 'muted', style: 'margin-top:0' }, '导入的车会存成你自己的蓝图，可以直接应用。分享码只是一段文字，不会上传到任何地方。'), box, pv],
      [{ label: '导入为我的蓝图', primary: true, onClick: () => {
        const nv = SA.Blueprints.importCode(box.value);
        if (!nv) { SA.UI.toast('分享码无效'); return; }
        st.dock = 'bps'; st.bpFilter = 'mine'; st.bp = SA.Blueprints.all()[0].key;
        say(`已导入「${nv.name}」`); renderAll();
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
      const ok = () => { note.textContent = '已复制到剪贴板'; };
      const fail = () => { note.textContent = '浏览器不让自动复制：代码已经选中，按 Ctrl+C 复制'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(ok, fail);
      else { try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(); } }
    };
    SA.UI.dialog(`分享「${name}」`, [h('p', { class: 'muted', style: 'margin-top:0' }, '把这段分享码发给别人，对方在蓝图库点「导入分享码」粘贴即可。只记布局，不含材料和改装。'),
      v ? codePreview(v) : null, box, h('div', { class: 'code-act' }, h('button', { class: 'btn small primary', onclick: copy }, '复制分享码'), note)], []);
    setTimeout(() => { box.focus(); box.select(); }, 0);
  }

  // 唯一件卖掉 / 报废就再也拿不到：先确认一次
  function uniqueConfirm(title, text, okLabel, onOk) {
    SA.UI.dialog(title, [h('p', { style: 'margin-top:0' }, text)], [{ label: okLabel, onClick: onOk }], '算了');
  }
  function sellOne(key) {
    const id = kid(key), mt = kmt(key);
    if (SA.isUnique(id) && !sellOne.ok) {
      uniqueConfirm(`卖掉唯一件「${M[id].name}」？`, '唯一件不能在商店买回来，卖掉以后就没有了。', '仍然卖掉', () => { sellOne.ok = true; try { sellOne(key); } finally { sellOne.ok = false; } });
      return;
    }
    const x = SA.S.sellStock(id, mt);
    if (!d().inv[key]) st.sel = null;
    say(`卖出 ${fullName(id, mt)}，进账 ${money(x)}`);
    changed();
  }

  // 「?」只保留新手此刻要做的三步，详细模块数据仍在选中卡片里。
  function openHelp() {
    SA.UI.openModal('图例与规则', h('div', { class: 'help' },
      h('p', {}, '1. 先从模块清单选一件，再用左键点车上的格子放置。'),
      h('p', {}, '2. 选着模块或正在拖动时，右键取消当前操作。'),
      h('p', {}, '3. 点「出战 →」打开出战黑板，选择关卡进入战斗；A/D 移动，鼠标瞄准，按住左键稳住准星，蓄满自动开火或松手开火。'),
    ));
  }

  // ---------- 绘制 ----------
  // 状态提示：整格缓慢闪烁的颜色（红 = 不可用/悬空，绿 = 选中/可放置），不再描边
  const RED = '#ff3b2f', GREEN = '#6fcf6a', WHITE = '#ffffff';
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

  function tipText() {
    const v = veh(), hv = st.hover, now = performance.now();
    if (st.drag && st.drag.kind === 'cell' && !hv) return { text: `松手：拆下 ${M[st.drag.id].name}，放回库存` };
    if (hv && !SA.V.inRegion(v, hv.r, hv.c)) return { text: '这一格还没扩建：推进战役会解锁更大的改装台', err: true };
    if (st.msg && now - st.msg.at < 2600) return st.msg;
    if (!hv) return st.msg && now - st.msg.at < 5000 ? st.msg : null;
    const key = st.drag ? st.drag.key : st.sel;
    if (key) {
      const id = kid(key), mt = kmt(key);
      const dragCell = st.drag && st.drag.kind === 'cell' ? st.drag : null;
      const sp = SA.V.editorSpot(id, hv, v, dragCell), cur = sp.hits.length === 1 ? sp.hits[0].cell : null;
      if (dragCell) {
        if (sp.r === dragCell.r && sp.c === dragCell.c) return { text: '放回原处' };
        if (sp.hits.length > 1) return { text: '这里压着好几个模块，换不了', err: true };
        return { text: cur ? `对调 ${M[dragCell.id].name} ⇄ ${M[cur.id].name}` : `移到${where(sp.r, sp.c)}` };
      }
      const buy = d().inv[key] > 0 ? '' : `购买（${money(SA.buyPrice(id))}）并`;
      if (sp.hits.length > 1) return { text: '这里压着好几个模块：先拆掉或挪开，再放', err: true };
      if (cur && cur.id === id && (cur.mt || 1) === mt) return { text: `再点一次：拆下 ${M[id].name}` };
      if (cur && hurt(cur)) return { text: `${M[cur.id].name} 受损，先修理才能替换`, err: true };
      if (cur) return { text: `${buy}替换 ${M[cur.id].name} → ${M[id].name}` };
      const chk = SA.V.placeCheck(v, id, sp.r, sp.c), clash = M[id].layer === 'chassis' ? SA.V.chassisClash(v, id, null) : [];
      if (chk.ok && clash.length) return { text: `${buy}换底盘：${M[clash[0].cell.id].name} → ${M[id].name}（换下的放回库存）` };
      return chk.ok ? { text: `${buy}放置 ${M[id].name}：${where(sp.r, sp.c)}` } : { text: `${buy}放置 ${M[id].name}（${chk.reason}）`, err: true };
    }
    const so = SA.V.at(v, 'side', hv.r, hv.c), bo = SA.V.at(v, 'body', hv.r, hv.c);
    const o = (st.layer === 'side' && so) || bo || so;
    if (!o) return { text: `${where(hv.r, hv.c)} · 空` };
    const cell = o.cell, m = M[cell.id], layer = o === so ? 'side' : 'body';
    const iss = issueAt(layer, o.r, o.c);
    if (iss) return { text: `${m.name}：${iss.reason}`, err: true };
    // 底部纸条只说三件事：名字 · 材质 · 耐久（其余属性看悬浮纸条和性能单）
    return { text: `${m.name} · ${matName(cell.mt || 1)} · 耐久 ${Math.max(0, cell.hp)}/${SA.V.maxHp(cell)}` };
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
    const vc = SA.SPR.renderVehicle(v, {
      key: 'editor', t, heat: 0.35, water: 1, showWrecks: true, showBlocked: true,
      blocked: st.stats.blocked, dimBody: st.layer === 'side', dimCell: drag && drag.layer === 'body' ? drag : null,
      ghostLegs: !!(st.sel || drag),   // 正在摆放 / 拖动：四足的腿半透明，底盘两侧的格子看得清
    });
    g.drawImage(vc, 0, 0);

    // 悬空 / 不合规：整个模块红色闪烁 + 感叹号
    for (const x of st.stats.issues) {
      if (!v[x.layer][x.r][x.c]) continue;
      const [px, py, w, h] = boxOf(v, x.layer, x.r, x.c);
      tint(fromVeh(vc, px, py, w, h), px, py, w, h, RED, pulse(t, 0.2, 0.65));
      SA.SPR.text(g, '!', px + w - 8, py + 5, RED, 2);
    }

    const hv = st.hover;
    const selKey = drag ? drag.key : st.sel;
    const id = selKey && kid(selKey), selMt = selKey ? kmt(selKey) : 1;
    if (id) {
      // 能稳稳装上的地方：淡淡的绿色呼吸（所有合规位置盖到的小格）
      if (!drag) {
        const f = SA.fp(id), cover = new Set();
        for (let r = 0; r <= K.ROWS - f.h; r++)
          for (let c = 0; c <= K.COLS - f.w; c++)
            if (SA.V.placeCheck(v, id, r, c).ok) for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) cover.add((r + i) * K.COLS + c + j);
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
            || (drag ? dropBad(drag, sp) : (cur ? hurt(cur.cell) : !SA.V.placeCheck(v, id, sp.r, sp.c).ok));
          for (const o of sp.hits) { const [bx, by, bw, bh] = boxOf(v, SA.V.layerOf(id), o.r, o.c); g.fillStyle = 'rgba(7,8,12,0.6)'; g.fillRect(bx, by, bw, bh); }
          g.globalAlpha = 0.8;
          SA.SPR.drawModule(g, id, x, y, { t, heat: 0.3, water: 1, mt: selMt });
          if (SA.isCockpit(id)) SA.SPR.cockpitCrew(g, id, x, y, { t, mt: selMt, seed: 0 }, null, { pilot: '你', t });   // 驾驶舱：驾驶员 + 操纵件也画出来
          if (id === 'boiler_l') SA.SPR.bigStoker(g, x, y, { t, mt: selMt, seed: 0 });   // 大锅炉：司炉小工
          g.globalAlpha = 1;
          tint(fromModule(id, t, selMt), x, y, w, h, bad ? RED : GREEN, pulse(t, 0.3, 0.6, 1), tintPad(id));
        }
      }
    } else if (hv) {
      const o = SA.V.at(v, st.layer, hv.r, hv.c);
      if (o) { const [x, y, w, h] = boxOf(v, st.layer, o.r, o.c); tint(fromVeh(vc, x, y, w, h), x, y, w, h, WHITE, 0.18); }
    }
    // 选中：整个模块绿色闪烁
    if (st.pick && !drag && v[st.pick.layer][st.pick.r][st.pick.c]) {
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

  return { open, refresh };
})();
