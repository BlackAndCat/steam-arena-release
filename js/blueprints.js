// 蓝图库：我的蓝图（本地）+ 官方基础蓝图（不能删除）+ 内置分享码示例
// 蓝图只记录布局（不记材料）；应用时先拆回当前车上的模块，优先用材料最好的库存，缺的按黄铜原价补买。界面在车间底部操作栏里
window.SA = window.SA || {};

SA.Blueprints = (() => {
  const h = SA.h, M = SA.MODULES;
  const d = () => SA.S.d;
  const money = (n) => SA.UI.money(n);
  const { all, save, overwrite, del, rename, mine, official, plan, importCode, share } = SA.S.Blueprints;

  function apply(bp, done) {
    const p = plan(bp);
    if (p.blocked.length) {
      SA.UI.dialog(SA.Config.text("blueprints_257e2665f40c"), [h('p', { style: 'margin-top:0' }, p.blocked.join('；')), h('p', { class: 'muted' }, SA.Config.text("blueprints_3d0d1595f7f2"))], [{ label: SA.Config.text("ui_de32e20193ad"), primary: true }]);
      return;
    }
    const run = () => {
      SA.S.Blueprints.applyPlan(p);
      SA.UI.toast(SA.Config.text("blueprints_bc64624ea5d9", `${bp.name}`, `${p.scrap ? SA.Config.text("blueprints_b556bb92bc09", `${money(p.scrap)}`) : ''}`));
      if (done) done();
    };
    const lines = [
      h('p', {}, SA.Config.text("blueprints_3f1f91257f45", `${bp.name}`)),
      Object.keys(p.buy).length ? h('div', { class: 'list', style: 'margin-bottom:8px' }, Object.entries(p.buy).map(([id, n]) =>
        h('div', { class: 'dlg-item', style: 'margin:0' }, SA.SPR.moduleCanvas(id, 0.6), `${M[id].name} ×${n}`, h('span', { class: 'gold', style: 'margin-left:auto' }, money(SA.buyPrice(id) * n))))) : null,
      p.fixCost ? h('p', { class: 'muted' }, SA.Config.text("blueprints_4cc91b2dcf71", `${money(p.fixCost)}`)) : null,
    ];
    if (!p.cost) {
      SA.UI.dialog(SA.Config.text("blueprints_3bf632c1c10b"), [lines, h('p', { class: 'muted' }, SA.Config.text("blueprints_fcfecbaed27e"))], [{ label: SA.Config.text("editor_63c73c4730f4"), primary: true, onClick: run }]);
      return;
    }
    SA.UI.pay({ title: SA.Config.text("blueprints_3bf632c1c10b"), amount: p.cost, lines, okLabel: SA.Config.text("editor_63c73c4730f4"), onPaid: run });
  }

  return { all, save, overwrite, del, rename, mine, official, plan, apply, importCode, share };
})();
