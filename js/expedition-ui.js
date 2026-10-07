// 出征（卷轴路线）回院子后的清点黑板（docs/expedition-plan.md V8）：院子暗下来、拉下黑板（SA.Home.board），左边粉笔写怎么回来的、走了多远，
// 中间海报列带回来的和丢在路上的，右边车况和三个去处（去车间 / 再出征 / 回院子）。
// 只读 SA.Route.result() 的结果画；入档（收益、难民、遗迹件、战损）由 SA.Route.settle 做（astra 的 R2），没有它就只看不记。
window.SA = window.SA || {};

SA.ExpeditionUI = (() => {
  const h = (...a) => SA.h(...a);
  const settled = new Set();   // 同一趟只调一次 settle（后台自己也防重复）
  const HOW = { depot: 'route_end_depot', recall: 'route_end_recall', stranded: 'route_end_stranded', wrecked: 'route_end_wrecked' };
  const meters = (px) => Math.round((px || 0) * 1.5 / 24);
  const clock = (t) => { const s = Math.max(0, Math.round(t || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function afterRoute(result) {
    const r = result || { mode: 'route', how: 'recall' };
    if (SA.Route && SA.Route.settle && r.runId && !settled.has(r.runId)) { settled.add(r.runId); SA.Route.settle(r); }
    if (SA.Arena && SA.Arena.unmount) SA.Arena.unmount();
    document.querySelector('#modal').hidden = true;   // 战斗里没关的对话框（返航确认、白旗）不留到院子里
    const root = SA.Home.board({});
    if (!root) return;
    render(root, r);
  }

  // 回来的车：和出战海报一样的版画（带着这趟的伤），太大就缩一半
  function carPrint(v) {
    const X = SA.PX;
    let src = X.trim(SA.SPR.renderVehicle(v, { key: 'route-tally', t: 0, heat: 0.3, water: 0.6 }));
    if (src.width > 160 || src.height > 76) { const k = document.createElement('canvas'); k.width = Math.ceil(src.width / 2); k.height = Math.ceil(src.height / 2); const g = k.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, k.width, k.height); src = k; }
    const c = X.ui.img(X.engrave(src, [42, 26, 5], [184, 57, 27]), 1); c.classList.add('ar-car'); return c;
  }
  function render(root, r) {
    const UI = SA.PX.ui, X = SA.PX, A = SA.RouteArt;
    root.innerHTML = '';
    const cargo = r.cargo || [], lost = r.lost || [];
    const refugees = r.refugees || cargo.filter(c => (typeof c === 'string' ? c : c.kind) === 'refugee').length;
    // 车况：结果里的车和出发时一样按格子记耐久，受损的格子数
    let hurt = 0;
    if (r.playerVehicle) SA.V.each(r.playerVehicle, (cell) => { if (cell.hp < SA.V.maxHp(cell)) hurt++; });
    const line = (text, style = '') => h('div', { class: 'ch-row', style }, h('span', { class: 'nm' }, text));
    const chalk = h('section', { class: 'ar-chalk', 'data-page-key': 'route-tally-chalk' },
      h('div', { class: 'ch-tabs' }, h('span', { class: 'ch-tab on' }, SA.Config.text('route_tally'))),
      h('div', { class: 'ch-list' },
        line(SA.Config.text(HOW[r.how] || 'route_end_recall'), 'font-size:20px'),
        line(SA.Config.text('route_tally_dist', meters(r.dist), clock(r.time))),
        refugees ? line(SA.Config.text('route_tally_refugees', refugees)) : null,
        r.relic ? line(SA.Config.text('route_tally_relic')) : null),
      !SA.Route || !SA.Route.settle ? h('div', { class: 'ch-foot' }, SA.Config.text('route_tally_unsaved')) : null);
    const slots = (items) => (A && items.length ? UI.img(A.cargoSlots(items, items.length), 2) : null);
    const mid = h('section', { class: 'ar-mid', 'data-page-key': 'route-tally-mid' },
      h('div', { class: 'ar-poster px-sk px-sk-paperOld px-drop' }, UI.img(X.pin(), 2, 'position:absolute;left:50%;top:-16px;margin-left:-8px;z-index:2'),
        h('div', { class: 'ar-kick' }, SA.Config.text('route_where')),
        h('div', { class: 'ar-title' }, UI.img(X.brush(SA.Config.text('route_tally'), 22, X.INK, '#b59c6c', 3), 2)),
        h('div', { class: 'ar-tally' },
          h('div', { class: 'nt' }, SA.Config.text('route_tally_got')),
          slots(cargo) || h('div', { class: 'px-small' }, SA.Config.text('route_tally_none')),
          r.money ? h('div', {}, SA.Config.text('route_tally_money'), ' ', UI.num(SA.UI.money(r.money))) : null,
          lost.length ? [h('div', { class: 'nt' }, SA.Config.text('route_tally_lost')), h('div', { class: 'ar-lost' }, slots(lost))] : null),
        r.playerVehicle ? h('div', { class: 'ar-cars' }, carPrint(r.playerVehicle)) : null));
    const side = h('section', { class: 'ar-side', 'data-page-key': 'route-tally-side' },
      h('div', { class: 'ar-dossier px-sk px-sk-kraft px-drop' }, UI.sk('paper', [
        h('div', { class: 'ar-dt' }, h('span', { class: 'px-h2' }, SA.Config.text('route_load_title'))),
        h('div', {}, hurt ? SA.Config.text('route_tally_damage', hurt) : SA.Config.text('route_tally_intact'))])),
      h('div', { class: 'ar-tally-go' },
        SA.Camp.has('garage') ? UI.btn(SA.Config.text('route_to_garage'), { onclick: () => SA.nav('garage') }) : null,
        UI.btn(SA.Config.text('route_again'), { kind: 'pri', onclick: () => SA.Arena.open('route', true) }),
        SA.Camp.has('garage') ? UI.btn(SA.Config.text('route_home_btn'), { onclick: () => SA.Home.closeBoard() }) : null));
    root.append(chalk, mid, side);
  }

  return { afterRoute, render };
})();
