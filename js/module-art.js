// 模块外观字段已随数值一起迁入 config/modules.json；此处保留视觉辅助算法。
window.SA = window.SA || {};
const SA = window.SA;

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
