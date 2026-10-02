/* 模块外观字段表。
 * 这里集中存放精灵借形、材料换色阶段、炮管几何、后坐力表现和底盘接地点。
 * 机制文件 modules.js 只保留数值与规则字段；加载后通过 SA.applyModuleArt 合并，
 * 以保证旧调用方继续读取 SA.MODULES[id] 的同一字段。
 */
window.SA = window.SA || {};
const SA = window.SA;
SA.MODULE_ART = {
  track: { vis: [1, 2, 3, 4, 5, 6], susp: { pts: [13, 37] } },
  quad: { vis: [1, 2, 3, 4, 5, 6], contactPts: { nearRear: 18, nearFront: 78, farRear: 20, farFront: 80 }, susp: { splay: 30, hips: [22, 30] } },
  biped: { vis: [1, 2, 3, 4, 5, 6], susp: { pts: [26, 34] } },   // 真双足的近侧 / 远侧脚（legs.js bipedArt，模块内 x）
  cockpit: { vis: [1, 5] },
  helmet: { vis: [1, 5] },
  cockpit_pair: { vis: [1, 5] },   // 2026-09-29 专用造型：双层驾驶台
  cannon: { vis: [1, 3, 5], piv: [34, 27], blen: 40, barrel: 24, rcPx: 9, back: 0.05, ret: 2.2 },
  cannon_m: { vis: [1, 3, 5], piv: [18, 13], blen: 40, barrel: 18, rcPx: 6, back: 0.05, ret: 2.4 },
  cannon_s: { vis: [1, 3, 5], piv: [12, 13], blen: 24, barrel: 12, rcPx: 4, back: 0.03, ret: 2.8 },
  cannon_heavy: { vis: [4, 5], piv: [34, 24], blen: 42, barrel: 34, rcPx: 12, back: 0.08, ret: 1.8 },
  cannon_giant: { vis: [6], piv: [48, 58], blen: 34, barrel: 34, rcPx: 7, back: 0.1, ret: 1.4 },   // 2026-09-28 专用造型进游戏：耳轴 / 炮口端面按样机 v6
  mortar: { piv: [24, 30], blen: 24, barrel: 0, rcPx: 6, back: 0.06, ret: 2.5 },
  mg: { piv: [29, 20], blen: 22, barrel: 13, rcPx: 2, back: 0, ret: 14 },   // 2026-09-28 蒸汽离心炮：耳轴 = 离心鼓轴心，只有炮管后坐
  side_cannon: { vis: [1, 3, 5], piv: [18, 34], blen: 48, barrel: 18, rcPx: 7, back: 0.04, ret: 2.6 },
  pressure_tank: {},   // 2026-09-29 专用造型：储气球 + 液柱表
  pressure_chamber: {},   // 2026-09-29 专用造型：风箱增压器（用户定以后是 1×2，数据改动交接 astra；1×1 时画同一套造型的小版）
  radiator: {},   // 2026-09-29 专用造型：翅片管排（侧挂）
  condenser: {},   // 2026-09-29 专用造型：盘管冷凝柱（各档只换颜色）
  rocket_rack: { vis: [1, 2, 3, 4, 5, 6], piv: [24, 28], blen: 34, barrel: 22, rcPx: 7, back: 0.05, ret: 2.2 },
  harpoon: { vis: [1], piv: [18, 13], blen: 34, barrel: 22, rcPx: 5, back: 0.04, ret: 2.8 },
  flamer: { vis: [1], piv: [18, 13], blen: 30, barrel: 18, rcPx: 3, back: 0.02, ret: 5 },
  steamjet: { vis: [1], piv: [18, 13], blen: 30, barrel: 18, rcPx: 3, back: 0.02, ret: 5 },
  boss_core: {},   // 2026-09-29 专用造型：圣杯炉
  boss_lens: {},   // 2026-09-29 专用造型：旋转棱镜鼓
  boss_ram: {},   // 2026-09-29 专用造型：三联活塞锤（锻工锤头）
  boiler: { vis: [1, 5] },
  water: { vis: [1, 2, 3, 4, 5, 6] },   // 2026-09-29 水箱按档加固（纵向箍带），每档一样
  bucket: { vis: [1, 5] },   // 2026-09-29 专用造型：犁铧（精英档双铧）
  spike: { vis: [1, 5] },   // 2026-09-29 专用造型：舰艏撞角
  piston: { vis: [1, 5] },   // 2026-09-29 专用造型：双缸蓄力撞锤
  mortar_s: { piv: [12, 13], blen: 18, barrel: 0, rcPx: 4, back: 0.03, ret: 2.7 },   // 2026-09-29 专用造型：炮塔臼炮（各档只换颜色）
  mg2: { piv: [20, 20], blen: 25, barrel: 15, rcPx: 2, back: 0, ret: 14 },  // 2026-09-28 双嘴汽转球：耳轴 = 球心，两根喷嘴交替后坐
  periscope: {},   // 2026-09-29 专用造型（轭架望远镜），各档只换颜色
  autoloader: {},   // 2026-09-29 专用造型：链式扬弹机（各档只换颜色）
  rangefinder: {},   // 2026-09-29 专用造型：六分仪
  gyroscope: {},   // 2026-09-29 专用造型：万向环
  // 新尺寸模块的专用造型尚未定稿，先按实际占格显示文字，保证库存和候选画廊能完整打开。
  mg_s: { piv: [15, 11], blen: 19, barrel: 10, rcPx: 2, back: 0, ret: 14 },       // 2026-09-28 专用造型：侧舷枪座
  mg_heavy: { piv: [12, 12], blen: 22, barrel: 12, rcPx: 3, back: 0, ret: 14 },   // 2026-09-28 专用造型：蒸汽加特林
  boiler_l: {},   // 2026-09-29 专用造型：巨大炉口 + 司炉小工
  water_l: {},   // 2026-09-29 专用造型：拼装水柜 + 大舷窗
};

SA.applyModuleArt = function applyModuleArt(art) {
  for (const [id, fields] of Object.entries(art || {})) {
    const module = SA.MODULES && SA.MODULES[id];
    if (!module) continue;
    const { susp, ...plain } = fields;
    Object.assign(module, plain);
    if (susp) Object.assign(module.susp || (module.susp = {}), susp);
  }
  return SA.MODULES;
};

// 视觉辅助函数仍由本文件提供；规则层只读取这些结果，不写入外观字段。
SA.suspPts = (id, ri = 0, rn = 1) => {
  const module = SA.MODULES[id], s = module.susp, fixed = module.contactPts;
  if (fixed) return [fixed.nearRear, fixed.nearFront, fixed.farRear, fixed.farFront];
  if (!s.splay) return s.pts;
  const d = ri < rn / 2 ? -1 : 1;
  return [s.hips[0] + d * s.splay, s.hips[1] - d * s.splay];
};

// 外观阶段：vis 列出换外形的材料等级（默认只有一个造型）。
SA.stageOf = (id, mt = 1) => (SA.MODULES[id].vis || [1]).filter(t => t <= mt).length || 1;

if (SA.MODULES) SA.applyModuleArt(SA.MODULE_ART);
