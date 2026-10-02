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
      SA.UI.dialog('蓝图无法应用', [h('p', { style: 'margin-top:0' }, p.blocked.join('；')), h('p', { class: 'muted' }, '唯一件不能购买，只能在对应战斗中缴获。')], [{ label: '知道了', primary: true }]);
      return;
    }
    const run = () => {
      SA.S.Blueprints.applyPlan(p);
      SA.UI.toast(`已按「${bp.name}」改装${p.scrap ? `，损毁件回收 ${money(p.scrap)}` : ''}`);
      if (done) done();
    };
    const lines = [
      h('p', {}, `车上现有的模块会先拆回库存，再按蓝图「${bp.name}」重新组装。`),
      Object.keys(p.buy).length ? h('div', { class: 'list', style: 'margin-bottom:8px' }, Object.entries(p.buy).map(([id, n]) =>
        h('div', { class: 'dlg-item', style: 'margin:0' }, SA.SPR.moduleCanvas(id, 0.6), `${M[id].name} ×${n}`, h('span', { class: 'gold', style: 'margin-left:auto' }, money(SA.buyPrice(id) * n))))) : null,
      p.fixCost ? h('p', { class: 'muted' }, `用不上的受损模块修好后放回库存：${money(p.fixCost)}`) : null,
    ];
    if (!p.cost) {
      SA.UI.dialog(`应用蓝图`, [lines, h('p', { class: 'muted' }, '库存够用，不需要花钱。')], [{ label: '应用', primary: true, onClick: run }]);
      return;
    }
    SA.UI.pay({ title: '应用蓝图', amount: p.cost, lines, okLabel: '应用', onPaid: run });
  }

  return { all, save, overwrite, del, rename, mine, official, plan, apply, importCode, share };
})();
