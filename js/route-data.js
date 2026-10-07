// 出征样板路线：全部位置使用世界像素坐标；资源拾取与收益规则由后续 R2 接入。
window.SA = window.SA || {};
SA.ROUTES = {
  r1: {
    id: 'r1', name: '铁匠铺 → 旧煤场', len: 7680, scene: 'waste',
    hills: [{ x: 3000, w: 360, h: 44 }, { x: 5200, w: 200, h: 20 }],
    mud: [[3900, 4600]],
    props: [
      ...[900, 1250, 1700, 6500, 6560].map(x => ({ kind: 'crate', x, w: 48, h: 48, hp: 40 })),
      { kind: 'barricade', x: 2520, w: 64, h: 72, hp: 120 },
      { kind: 'ruinDoor', x: 5550, w: 72, h: 120, hp: 300 },
      { kind: 'barricade', x: 7000, w: 64, h: 72, hp: 120 },
    ],
    pickups: [
      { kind: 'coal', x: 1500, amount: 0.15 },
      ...[2800, 3650, 4300].map(x => ({ kind: 'supply', x })),
      ...[3400, 6000].map(x => ({ kind: 'refugee', x, n: 1 })),
      { kind: 'coal', x: 6300, amount: 0.15 },
      // 遗迹装备尚待 R2 指定正式奖励，不能提前填入虚构模块或发放收益。
      { kind: 'relic', x: 5600, gate: 5550 },
    ],
    encounters: [
      { at: 2000, car: '0:0', name: '拾荒小车', style: 'rookie', guard: 2480, leash: 2520 },
      { at: 4000, car: '1:0', name: '铁皮罐头', style: 'turtle', guard: 4750, leash: 4800 },
      { at: 6400, car: '1:4', name: '推土机', style: 'rush', guard: 6900, leash: 7000, charge: true },
    ],
    end: { x: 7400, bonus: 3 },
  },
};
