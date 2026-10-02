// 赛事、地形、订单和战役编排的唯一内容源是 config/content.json。
window.SA = window.SA || {};
const contentConfig = SA.Config.get('content');
for (const [key, value] of Object.entries(contentConfig)) if (key !== 'ORDERS' && key !== 'PROLOGUE_PLATE_STAGE') SA[key] = value;
// 旧存档迁移使用的甲片关在 stage-cars.js 根据同一条最终记录建立。
SA.PROLOGUE_PLATE_STAGE = null;
// JSON 条件只描述数据来源和比较方式；订单的公开 req 接口仍返回函数。
function orderCondition([kind, field, limit]) {
  if (kind === 'byId') return stats => stats.byId[field] || 0;
  if (kind === 'field') return stats => stats[field];
  if (kind === 'lte') return stats => stats[field] <= limit ? 1 : 0;
  if (kind === 'gte') return stats => stats[field] >= limit ? 1 : 0;
  throw new Error('未知订单条件：' + kind);
}
SA.ORDERS = contentConfig.ORDERS.map(order => ({ ...order, req: order.req.map(([label, condition, threshold]) => [label, orderCondition(condition), threshold]) }));
