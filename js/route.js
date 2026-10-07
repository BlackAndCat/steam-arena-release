// 出征公开入口：解析正式路线和现有关卡车辆；不经竞技场结算，不写玩家存档。
window.SA = window.SA || {};
SA.Route = (() => {
  /** 每次出发重新读取关卡车，避免作者修改后还沿用上一趟的敌车快照。 */
  function prepare(route) {
    const def = typeof route === 'string' ? SA.ROUTES[route] : route;
    if (!def || !Number.isFinite(def.len) || def.len <= 0 || !def.end) throw new Error('找不到有效出征路线');
    return { ...def, encounters: (def.encounters || []).map(enc => {
      if (enc.vehicle) return { ...enc }; // 无画面检查可传入独立夹具，正式 r1 始终读取 car。
      const match = /^(\d+):(\d+)$/.exec(enc.car || '');
      if (!match) throw new Error('遭遇缺少关卡车引用：' + enc.name);
      const ci = Number(match[1]), si = Number(match[2]);
      const stage = SA.StageCars.get(ci, si);
      const vehicle = SA.StageCars.vehicle(stage, enc.name);
      if (!vehicle) throw new Error('遭遇关卡车尚未配置：' + enc.car);
      return { ...enc, vehicle, aim: stage.aim, statMultipliers: stage.statMultipliers };
    }) };
  }

  /** 返回数据副本供黑板呈现；调用者不能通过改列表污染正式路线。 */
  function list() { return Object.values(SA.ROUTES).map(def => JSON.parse(JSON.stringify(def))); }

  /** 使用正式当前车辆启动画面战斗；界面需要支持空敌、路线开场和 route-end 事件。 */
  function start(id) {
    const vehicle = SA.S.d?.vehicle;
    if (!vehicle || !SA.V.stats(vehicle).canDeploy) throw new Error('当前车辆不能出征');
    return SA.Battle.start({ mode: 'route', routeData: prepare(id) });
  }

  /** 固定种子运行真实逐帧规则；预算耗尽返回 completed:false，绝不补写到站或收益。 */
  function simulate({ route = 'r1', vehicle, seed = 1, maxTime = 600 } = {}) {
    if (!vehicle || !SA.V.stats(vehicle).canDeploy) throw new Error('模拟车辆不能出征');
    if (!Number.isFinite(maxTime) || maxTime <= 0) throw new Error('模拟时限必须是正数');
    return SA.Battle.route.simulate({ routeData: prepare(route), vehicle, seed, maxTime });
  }

  // R1 只返回事实结果，不提供 settle；煤炭、货物、正式结算和持久化由 R2 完成。
  return { list, start, simulate, recall: () => SA.Battle.route.recall(), result: () => SA.Battle.route.result() };
})();
