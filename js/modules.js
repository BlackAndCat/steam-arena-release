// 模块注册表。layer: chassis(只能放最底行) | body(主体层) | side(侧挂层，只能挂在主体模块上) | ram(撞击，挂在底盘/装甲正前方)
// 通用机制字段：salvo=每轮发射数，salvoGap=轮内间隔；splash={r,k}=命中点溅射半径与衰减；
// tether=牵引收绳速度；range=持续喷射射程，cone=半角；heatPerSec/dmgPerSec=持续喷射速率；
// store=蓄压容量，dryCool=不耗水散热，waterSave=冷却耗水倍率；reloadMul/spreadMul=实体辅助效果。
// 格子 unique=独立奖励身份，look=固定外观 key；它们不改变模块 id 或战斗数值。库存、分享码与战斗副本均保留身份。
// minMt / maxMt=可用材料范围；喷射武器按材料对应蒸汽（T1～T3）或喷火（T4～T6），旧件转换时保留材料与耐久比例。
// 底盘 susp：悬挂。pts 每格两个接地点（48px 格内的 x，近侧脚在前、远侧脚在后），up / down 上收 / 下伸行程（px），follow 车身跟坡的比例（其余交给悬挂）。
// 蜘蛛四足的脚往外张：splay = 脚离胯多远，hips = 近侧 / 远侧的胯；同一段四足的前半格往前张、后半格往后张（SA.suspPts 算）
window.SA = window.SA || {};

// 格子：子格 24px，全车 16 列 × 12 行（= 以前的 8 × 6 大格，每个大格分成 2×2 子格）。
// 模块记在左上角那一格（锚点），占 w×h 个子格；未写尺寸的旧模块默认 2×2，新模块可占 1×1、1×2 或 3×3。
// 关卡 / 蓝图的 ASCII 仍按大格写，读进来时换算成子格（SA.V.fromAscii）
SA.K = {
  COLS: 16,
  ROWS: 12,           // 最高 6 层大格（含底盘的两行子格）
  CELL: 24,           // 子格原生像素
  ART: 48,            // 模块精灵的原生尺寸（2×2 子格）
  GRAVITY: 780,       // 炮弹重力 px/s²
  MOVE_HEAT: 0,       // 行驶热量已计入机组负载，不重复产热
  ACCEL: 48,          // 起步加速度 px/s²（按质量缩放；撞击需要助跑）
  BRAKE: 62,          // 制动减速度 px/s²：松开按键会滑行一大段才停下；反向要先停稳再重新起步
  SKID: 320,          // 被撞飞 / 被推着走时的打滑急停减速度 px/s²（场地没有墙，靠它让车停住）
  KNOCK_MAX: 70,      // 铲斗 / 撞角 / 撞锤一次击退的速度上限 px/s
  HEAT_MAX: 5000,     // 标称 50 kJ/K 回路从 20°C 升到 120°C 的热量；实车用自身热容
  DISSIPATE: 60,     // 标称自然散热 kW，实际由回路温差缩放
  IDLE_HEAT: 40,     // 机组辅助热输入 kW
  COOL_FULL: 30,      // 回路比环境高 30°C 时达到额定冷却
  WATER_PER_HEAT: 1 / 2257, // 蒸发 1 L 水约带走 2257 kJ
  WATER_SAVE_MIN: 0.4,   // 多个省水模块叠加后的最低耗水倍率
  BATTLE_TIME: 100,
  GAME_SPEED: 0.75,   // 战斗节奏默认放慢到 0.75 倍（战斗界面底部有滑条可调，记在本机）
  // 重量：每个模块 = 基础重量 + 自身重量（kg）；底盘按承重（kg）限制总重
  WEIGHT_BASE: 250,   // 一个 2×2 模块的基础重量；小模块按面积折算
  DRIVE_PER_T: 0,     // 行驶功率由牵引力、目标速度与质量计算
  RAM_SELF: 0.5,      // 反震：撞击时自己的撞击面承受的反作用伤害（占造成伤害的比例）
  RAM_TETHER_SELF: 0.25, // 被鱼叉拉过来的撞击反震减半（docs/campaign-direction.md §2）
  // 模块改装（炮盾 / 附加装甲）：纯属性升级，最多 3 级
  UP_MAX: 3,
  UP_KG: 120,         // 每级增加的重量 kg
  UP_COST: 0.25,      // 第 n 级价格 = 模块原价 × 该系数 × n
  KMH: 0.1125,        // 速度换算：1 px/s ≈ 0.1125 km/h（一格 48px ≈ 1.5 m）
  SPEED_BOOST: 1.25,  // 锅炉富余时最多超速到底盘基础速度的 125%
  FOCUS_KICK: 0.35,   // 开火后瞄准稳定度保留的比例（后坐力）
  FOCUS_KICK_FAST: 0.88,   // 快枪（机枪）每发只震掉一点：持续扫射也能慢慢稳住
  // 瞄准（按住蓄力缩圈）：稳定度 0~100%；满时散布缩小 AIM_SHRINK，蓄满速度 × AIM_SPEED
  // 这是前期的基础值：以后加装瞄准镜等部件（模块字段 aimShrink / aimSpeed）可以缩得更多、更快
  AIM_SHRINK: 0.3,    // 基础缩圈幅度：最多把散布缩小 30%
  AIM_SHRINK_MAX: 0.75,
  AIM_SPEED: 0.5,     // 基础瞄准速度：直射火炮约 2.4 秒蓄满
  FAST_RELOAD: 1,     // 装填短于这个秒数的武器（机枪）按住就连发
  // 战斗调参：战斗逻辑、HUD 和车间说明统一从这里读取，避免同一个规则在多个文件各写一份数字。
  BATTLE: {
    // 储能与警报：储能释放是每秒速率，爆罐阈值和 HUD 阈值按比例表达。
    STORE_RELEASE_PER_SEC: 30, STORE_BURST_RATIO: 0.5,
    HEAT_ALERT: 0.75, WATER_LOW_RATIO: 0.2,
    // 地形、悬挂与瞄准：这些值决定泥地/坡地的速度、车辆贴地响应和移动射击散布。
    MASS_MIN_TONS: 0.5, BIPED_HIP_SWAY: 2.5, TOP_HEAVY_SWAY: 1.25,
    MUD_SPEED: { track: 0.8, quad: 0.65, biped: 0.45 }, MUD_DEFAULT_SPEED: 0.7,
    DEBRIS_SLOW_RADIUS: 10, DEBRIS_SLOW_FACTOR: 0.35,
    SLOPE_FACTOR: 2.2, SLOPE_MIN: 0.35, SLOPE_MAX: 1.35,
    SETTLE_FALLBACK_INSET: 6, SETTLE_FALLBACK_STEP: 12, SETTLE_TILT_MAX: 0.45,
    SETTLE_TILT_RESPONSE: 8, SETTLE_RIGID_CLEARANCE: 6, SETTLE_HEIGHT_RESPONSE: 10,
    AIM_SPEED_REFERENCE: 60, AIM_JOLT_MAX: 1.5, AIM_SPEED_SPREAD: 1.6,
    AIM_JOLT_SPREAD: 2.2, AIM_ACCEL_SPREAD: 5, AIM_SHAKE_SPREAD: 1.4, AIM_EVADE_SPREAD: 20,
    PREVIEW_STEPS: 600, PREVIEW_STEP: 1 / 120, PREVIEW_SAMPLE_EVERY: 4,
    // 命中、起步、移动与货箱：与模块字段相乘前的通用物理参数。
    RICOCHET_BASE: 0.18, RICOCHET_DEFICIT: 0.5, RICOCHET_MAX: 0.92, RICOCHET_DAMAGE: 0.05,
    SPOOL_BASE: 0.3, SPOOL_MASS: 0.05, SPOOL_MIN: 0.4, SPOOL_MAX: 0.9,
    CHUFF_INTERVAL: 0.2, CHUFF_HEAT: 0,
    WILD_SIGN_CHANCE: 0.5, WILD_JITTER_MIN: 1, WILD_JITTER_MAX: 1.4,
    RECOIL_HIGH_SPEED_FACTOR: 0.3, RECOIL_ANIM_HIGH: 2, RECOIL_ANIM_NORMAL: 4,
    SHELL_SHAKE_BASE: 1.5, SHELL_SHAKE_PUSH_DIVISOR: 6,
    START_SPEED: 4, ROCK_DECAY: 6, MASS_ACCEL_FACTOR: 5.5, MASS_ACCEL_MIN: 0.55, MASS_ACCEL_MAX: 1.4,
    SKID_SPEED_MULT: 1.05, SKID_SPEED_OFFSET: 4, SPEED_SMOOTHING: 4,
    JOLT_MAX: 1.5, JOLT_SPEED_REFERENCE: 25, JOLT_SMOOTHING: 6,
    BRAKE_DUST_SPEED: 30, BRAKE_DUST_INTERVAL: 0.08,
    CRATE_EDGE_MARGIN: 1.5, CRATE_DAMAGE_BASE: 8, CRATE_DAMAGE_SPEED: 0.5,
    CRATE_RAM_MULTIPLIER: 2, CRATE_IMPACT_SPEED: 10, CRATE_IMPACT_FACTOR: 0.2,
    CRATE_RAM_IMPACT_MULTIPLIER: 1.5, CRATE_SLOWDOWN: 0.7, CRATE_PUSH_SPEED_MAX: 18,
    MOVING_EPSILON: 0.02,
    // 接触、撞击、鱼叉和活塞：碰撞频率、冲击速度、击退和牵引生命周期。
    CONTACT_GAP: 1, BIPED_KICK_SHOVE: 22, RAM_TARGET_DAMAGE: 0.5, RAM_SPEED_THRESHOLD: 25,
    RAM_COOLDOWN: 0.35, RAM_CLOSING_REFERENCE: 60, RAM_DEFAULT_DAMAGE: 6, RAM_RESTITUTION: 0.25,
    TETHER_TIMEOUT: 4, TETHER_MAX_DISTANCE: 760, TETHER_PULL_DISTANCE: 18, TETHER_SPEED_MAX: 35,
    PISTON_DECAY: 4, PISTON_SHOVE: 30, WEAPON_KNOCK_FACTOR: 8, VENT_HEAT: 1750,
    // 供能、瞄准与 AI：与玩家/副驾驶装填、AI 选点和移动风格有关的阈值。
    UTIL_MIN: 0.3, FOCUS_SHAKE_DECAY: 0.2, FOCUS_IDLE_DECAY: 2.5,
    AIM_TURN_THRESHOLD: 3, COPILOT_FOCUS: 0.4, COPILOT_RELOAD_MIN: 0.2, COPILOT_RELOAD_MAX: 0.8,
    SALVO_FACTOR_MIN: 0.95, SALVO_FACTOR_MAX: 1.05, COPILOT_RELOAD_FACTOR_MIN: 1, COPILOT_RELOAD_FACTOR_MAX: 1.2,
    AI_TARGET_WEIGHTS: { side: 3, weapon: 2.5, cockpit: 2, boiler: 1.6, water: 1.2, chassis: 0.3, other: 0.6 },
    AI_COPILOT_ERROR_X: 34, AI_COPILOT_ERROR_Y: 20, AI_RETARGET_MIN: 3, AI_RETARGET_MAX: 6,
    AI_HEAT_HIGH: 0.72, AI_HEAT_LOW: 0.45, AI_ERROR_SCALE: 100, AI_ERROR_BIAS: 9, AI_ERROR_Y_SCALE: 0.6,
    AI_CHARGE_RUSH_CHANCE: 0.35, AI_CHARGE_KITE_CHANCE: 0.15, AI_CHARGE_DEFAULT_CHANCE: 0.7,
    AI_MOVE_RANGE_KITE: [400, 640], AI_MOVE_RANGE_RUSH: [70, 260], AI_MOVE_RANGE_DEFAULT: [140, 520],
    AI_TURTLE_OFFSET: 40, AI_CHARGE_TIME: [3, 5], AI_MOVE_TIME: [2, 5], AI_FAST_SPEED: 70,
    AI_FAST_MOVE_FACTOR: 0.6, AI_RANGE_MARGIN: 0.9, AI_CONTACT_SPEED: 10, AI_CONTACT_MOVE_TIME: 0.4, AI_GOAL_EPSILON: 8,
    // 投降、平手、超时评分与速度滑条：结算规则及其可调范围。
    SURRENDER_HOLD_TIME: 1, SURRENDER_CRIPPLED_HP: 0.5, SURRENDER_LOW_HP: 0.2, SURRENDER_HP_MULTIPLIER: 3,
    DRAW_HOLD_TIME: 1.5, SCORE_DAMAGE_WEIGHT: 0.6, SCORE_HP_WEIGHT: 0.4, SCORE_TIE_EPSILON: 0.005,
    ENDING_TIME: 1.8, GAME_SPEED_MIN: 0.3, GAME_SPEED_MAX: 1.5, GAME_SPEED_STEP: 0.05,
  },
};

SA.MODULES = {
  // unique：唯一件规则 { mt: 固定材料, once: 每存档一次, source: 来源 }；没有该字段的模块仍可由关卡 uniqueLoot 临时标记。
  track: {
    name: '履带底盘', cat: 'mobility', layer: 'chassis', chain: true,
    price: 150, hp: 200, power: 0, armor: 2, load: 3500, speed: 48, kg: 600, q: 2, accel: 1, brake: 1, sway: 1, spool: 1,
    susp: { up: 4, down: 8, follow: 1 },
    desc: '承重大、耐打，但又重又慢。各段履带必须首尾相连，中间不能隔空。',
  },
  quad: {
    // 整件四足可以多件首尾相连（车体蜈蚣），中间不能隔空（2026-09-26 用户决定）；和别的底盘不能混用
    name: '四足底盘', cat: 'mobility', layer: 'chassis', w: 4, h: 2, whole: true, chain: true,
    price: 140, hp: 140, power: 0, armor: 1, load: 2400, acc: 0.06, speed: 62, kg: 400, q: 2, accel: 0.85, brake: 0.55, sway: 0.45, spool: 1.1,
    // 整件四足固定四个接地点：近侧后/前、远侧后/前，坐标是整件内部的 x。
    susp: { up: 6, down: 12, follow: 0.85 },
    desc: '最平稳的射击平台：静止散布 -30%，边走边打也几乎不晃；但刹车最慢，停下来要滑很远。',
  },
  biped: {
    name: '双足底盘', cat: 'mobility', layer: 'chassis', w: 2, h: 4, whole: true, chassisLimit: 1, legPair: true, waistSlots: 1,   // 真双足 2×4：上两行胯层、下两行腿区（1 大格宽 × 2 层，collab §5）
    // 平衡且贴身时由双腿完成的踢击；数值是规则初版，交 P2 诊断报告，不在本阶段调平衡。
    kick: { ram: 12, knock: 0.35, cooldown: 0.7 },
    price: 120, hp: 110, power: 0, load: 2400, evade: 0.12, speed: 78, kg: 250, q: 1, accel: 1.5, brake: 1.7, sway: 1.5, spool: 0.55,
    // 平衡规则的定稿阈值；材料品质按六档提高失衡容差。
    balance: { steady: 0.25, limit: 0.6, topHeavy: 1.8, toleranceByMt: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9] },
    susp: { up: 8, down: 3, follow: 0.85 },
    desc: '起步、刹车、跑得都最快，摇摆步态让敌人难以命中；但自己走起来晃得厉害，移动射击散布最大。',
  },
  // 驾驶舱：基础款是 1×1（id 仍叫 helmet，分享码按 id 序号编码不能改）；1×2、2×2 是「联合驾驶舱」换皮，舱里的驾驶员一律 1×1 大小。
  // drivers：驾驶员人数。全车活着的驾驶员比 1 多几个，就能多替你操作几组武器（原来副驾驶的功能）
  cockpit: {
    name: '联合驾驶舱', cat: 'control', layer: 'body', cockpit: true, drivers: 4,
    price: 260, hp: 200, power: 1, kg: 150, q: 2,
    desc: '四个驾驶员挤在一个大舱里：除了你手操的那组武器，另外三组由他们各自瞄准开火（枪法不如你准）。全部驾驶舱被毁即告负。',
  },
  helmet: {
    name: '驾驶舱', cat: 'control', layer: 'body', w: 1, h: 1, cockpit: true, drivers: 1,
    price: 70, hp: 90, power: 0.5, kg: 40, q: 1,
    desc: '至少需要 1 个，全部被毁即告负。只占一个小格：目标小，但很脆，记得用甲片护住。多装几个驾驶舱，每多一个驾驶员就能多替你操作一组武器。',
  },
  cockpit_pair: {
    name: '联合驾驶舱（双人）', cat: 'control', layer: 'body', w: 1, h: 2, cockpit: true, drivers: 2,
    price: 145, hp: 125, power: 0.7, kg: 90, q: 1,
    desc: '1×2 的联合驾驶舱，容纳两名驾驶员，除手操武器外再自动操作一组；先于四人联合驾驶舱解锁。',
  },
  plate: {
    name: '甲片', cat: 'structure', layer: 'body', w: 1, h: 1,
    price: 12, hp: 45, power: 0, armor: 3, kg: 90, q: 1,
    desc: '半块铁装甲，护甲同样是 3。用来补缝、垫在炮口下面、护住驾驶舱的一角。',
  },
  tank_s: {
    name: '小水罐', cat: 'cooling', layer: 'body', w: 1, h: 1,
    price: 20, hp: 28, power: 0, water: 36, cool: 1, kg: 75, q: 1,
    desc: '只占一个小格的水罐：储水 36 L，额定水冷 50 kW。',
  },
  tank_tall: {
    name: '水罐', cat: 'cooling', layer: 'body', w: 1, h: 2,
    price: 38, hp: 52, power: 0, water: 75, cool: 2, kg: 150, q: 1,
    desc: '竖着的细水罐，占 1×2 小格：储水 75 L，额定水冷 100 kW。',
  },
  // 已取消：功能并入驾驶员人数。定义留着给旧存档 / 旧分享码解码，读进来一律换成联合驾驶舱（SA.RETIRED）
  copilot: {
    name: '副驾驶', cat: 'control', layer: 'body', retired: true,
    price: 140, hp: 150, power: 1, kg: 150, q: 2,
    desc: '已取消，并入联合驾驶舱。',
  },
  // 2026-09-28 用户定：铁装甲从 2×2 改成竖着的 1×2；单件数值按面积减半（两块并排 = 原来一块）。
  // 旧存档 / 分享码 / 蓝图 / 关卡字母 A 里的一块 2×2 读进来时拆成并排两块（SA.V.widenArmor）
  armor: {
    name: '铁装甲', cat: 'structure', layer: 'body', w: 1, h: 2,
    price: 20, hp: 80, power: 0, armor: 3, kg: 175, q: 1,
    desc: '竖着的一条铁板，占 1×2 小格；廉价的挡箭牌，不耗动力但有分量。护甲 3：每发炮弹先减掉 3 点伤害，机炮打上去只冒火星。直射炮弹会先打中弹道上的第一个模块。',
  },
  armor_heavy: {
    name: '重装甲', cat: 'structure', layer: 'body',
    price: 95, hp: 320, power: 0, armor: 6, kg: 750, q: 2,
    desc: '两倍厚度，护甲 6，机炮基本打不动；也重了一倍多：吃掉底盘承重，拖慢车速。',
  },
  // 火炮家族：小炮 1×1、中炮 2×1（横躺）、直射火炮 2×2、重炮 3×2、巨炮 4×4（高抛，见 docs/module-plan.md）。
  // minMt：最低材料，低于它的模块不存在（关卡里低材料的车改用 lowAlt）；vis：从哪几级材料开始换外形
  cannon: {
    name: '直射火炮', cat: 'firepower', layer: 'body', minMt: 2, lowAlt: 'cannon_m',
    price: 170, hp: 150, power: 3, kg: 350, q: 2,
    dmg: 32, reload: 2.4, heat: 6, proj: 'shell', v: 840, g: 1, spread: 12, arc: 'low', kick: 70,
    elev: [-8, 30], slew: 24, windup: 0.35, wild: 0.12, rest: 0, aimT: 1.2,


    desc: '平射火炮，弹道低平。仰角只有 -8°~30°，太高太近的目标够不着；炮弹有散布，偶尔会打飞。同一行前方不能有己方模块。熟铁起才有。',
  },
  cannon_m: {
    name: '中炮', cat: 'firepower', layer: 'body', w: 2, h: 1,
    price: 110, hp: 100, power: 2, kg: 200, q: 1,
    dmg: 26, reload: 2.2, heat: 4.5, proj: 'shell', v: 820, g: 1, spread: 13, arc: 'low', kick: 50,
    elev: [-8, 30], slew: 28, windup: 0.3, wild: 0.14, rest: 0, aimT: 1.1,


    desc: '横躺的 2×1 主力火炮，只占一行：前方同样不能有己方模块。比直射火炮轻、便宜，伤害低一些。',
  },
  // 新增火炮与能源模块：先用已有精灵借形，尺寸和数值接口已经按 24px 子格注册，
  // 这样战役和模拟可以先验证构筑，不必等待专用美术完成。
  cannon_s: {
    name: '小炮', cat: 'firepower', layer: 'body', w: 1, h: 1,
    price: 72, hp: 62, power: 1, kg: 80, q: 1,
    dmg: 17, reload: 1.8, heat: 3.2, proj: 'shell', v: 800, g: 1, spread: 16, arc: 'low', kick: 26,
    elev: [-8, 30], slew: 34, windup: 0.25, wild: 0.16, rest: 0, aimT: 0.9,

    desc: '占一个小格的轻型火炮，便宜、耗能低，适合把早期的缝隙变成第二个射击位。',
  },
  cannon_heavy: {
    name: '重炮', cat: 'firepower', layer: 'body', w: 3, h: 2, minMt: 4, lowAlt: 'cannon',
    price: 330, hp: 260, power: 6, kg: 900, q: 4,
    dmg: 58, reload: 4.6, heat: 11, proj: 'shell', v: 900, g: 1, spread: 10, arc: 'low', kick: 110,
    elev: [-6, 34], slew: 16, windup: 0.55, wild: 0.08, rest: 0, aimT: 1.8,

    desc: '镀镍材料起才可制造的超大口径火炮。伤害高、耗能高，横躺占三列两行，前方必须留出完整炮口通道。',
  },
  cannon_giant: {
    name: '巨炮', cat: 'firepower', layer: 'body', w: 4, h: 4, minMt: 6, lowAlt: 'cannon_heavy', unique: { mt: 6, once: true, source: 'salvage' },
    price: 760, hp: 420, power: 10, kg: 1800, q: 5,
    dmg: 104, reload: 6.8, heat: 18, proj: 'shell', v: 820, g: 1, spread: 0, arc: 'high', indirect: true, kick: 180,
    elev: [55, 90], slew: 11, windup: 0.8, wild: 0, rest: 75, aimT: 2.4,   // 与攻城臼炮 v6 的炮口朝天造型一致

    desc: '女王号缴获的攻城臼炮，高抛炮弹越过己方装甲砸向敌车顶部。慢装填、慢转炮，可向前方近处高抛；热量和动力压力都最高。',
  },
  mortar: {
    name: '高抛火炮', cat: 'firepower', layer: 'body',
    price: 190, hp: 150, power: 3, kg: 450, q: 3,
    dmg: 38, reload: 3.4, heat: 7, proj: 'shell', v: 780, g: 1, spread: 0, arc: 'high', indirect: true, kick: 40,
    elev: [32, 90], slew: 20, windup: 0.45, wild: 0, rest: 55, aimT: 1.4,

    desc: '炮口朝天，弹道高抛，可以躲在装甲后面开火，砸敌人的顶部。指哪打哪，但炮弹飞得慢，移动中的目标会躲开。',
  },
  mg: {
    name: '机炮', cat: 'firepower', layer: 'body',
    price: 110, hp: 130, power: 2, kg: 150, q: 1,
    dmg: 5, reload: 0.4, heat: 1.2, proj: 'bullet', v: 1230, g: 0.27, spread: 10, arc: 'low', kick: 5,
    elev: [-8, 32], slew: 50, windup: 0.15, wild: 0.1, rest: 0, aimT: 0.4,

    desc: '高射速低伤害，专打没有护甲的锅炉、水箱、驾驶舱；打装甲只冒火星。前方同样不能有遮挡。',
  },
  side_cannon: {
    name: '侧炮', cat: 'firepower', layer: 'side',
    price: 150, hp: 120, power: 2, kg: 200, q: 2,
    dmg: 27, reload: 2.8, heat: 5, proj: 'shell', v: 780, g: 1, spread: 15, arc: 'low', kick: 55,
    elev: [-6, 24], slew: 18, windup: 0.4, wild: 0.18, rest: 0, aimT: 1,

    desc: '挂在侧挂层，可藏在装甲后方，射击不被己方遮挡；但炮身晃动，弹道散布很大。',
  },
  pressure_tank: {
    name: '蓄压罐', cat: 'energy', layer: 'body', w: 1, h: 2,
    price: 96, hp: 72, power: 0, store: 20, explode: 20, kg: 190, q: 1,
    get desc() { return `蓄压罐：动力富余时储存蒸汽能量，动力不足时最多补 ${SA.K.BATTLE.STORE_RELEASE_PER_SEC} kW，容量 1000 kJ；存量过半被毁会爆炸。`; },
  },
  pressure_chamber: {
    name: '加压舱', cat: 'energy', layer: 'body', w: 1, h: 2,
    price: 64, hp: 58, supply: 2, power: 0, water: 8, heatRate: 1.1, kg: 95, q: 1,
    desc: '小格加压单元，提供 20 kW 轴功率，约 27.2 公制马力；自带 8 L 冷却储水，额定回路余热 55 kW。',
  },
  radiator: {
    name: '散热片', cat: 'cooling', layer: 'side', w: 1, h: 2,
    price: 82, hp: 64, dryCool: 1.2, kg: 115, q: 1,
    desc: '镂空格栅式散热片，侧挂层开放后可挂在主体外侧；不储水，只提高持续散热。',
  },
  condenser: {
    name: '冷凝器', cat: 'cooling', layer: 'body', w: 1, h: 2,
    price: 105, hp: 78, cool: 3, waterSave: 0.7, kg: 180, q: 1,
    get desc() { return `冷凝器：全车冷却耗水 ×0.7（多个按乘积叠加，最低 ×${SA.K.WATER_SAVE_MIN}）；本身不储水。`; },
  },
  rocket_rack: {
    name: '抛射架', cat: 'firepower', layer: 'body',
    price: 230, hp: 150, power: 4, kg: 430, q: 3,
    dmg: 14, reload: 6, heat: 10, salvo: 4, salvoGap: 0.12, splash: { r: 24, k: 0.5 }, explode: 22, proj: 'shell', v: 760, g: 0.65, spread: 20, arc: 'high', indirect: true, kick: 58,
    elev: [18, 90], slew: 22, windup: 0.4, wild: 0.2, rest: 55, aimT: 1.3,   // 六档抛射造型：管口至少抬起 18°，近处可向世界竖直方向发射。

    desc: '四发齐射抛射架：低档投掷炸弹，高档采用气压与火箭助推发射，均沿高抛弹道越过正面遮挡；每发 14 点伤害，命中点 24px 内溅射，装填 6 秒；装填中的抛射架被击毁会殉爆。',
  },
  harpoon: {
    name: '鱼叉', cat: 'firepower', layer: 'body', w: 2, h: 1,
    price: 175, hp: 105, power: 2, kg: 210, q: 2,
    dmg: 10, reload: 2.6, heat: 4, proj: 'shell', v: 720, g: 0.75, spread: 14, arc: 'low', kick: 42, tether: 80,
    elev: [-10, 28], slew: 28, windup: 0.3, wild: 0.1, rest: 0, aimT: 1.0,

    desc: '命中后以 80px/s 收绳牵引敌车，最多持续 4 秒；绳索断开前不能再次发射。',
  },
  flamer: {
    name: '喷火器', cat: 'firepower', layer: 'body', w: 2, h: 1, minMt: 4, lowAlt: 'steamjet',
    price: 155, hp: 110, power: 2, kg: 240, q: 2,
    dmg: 4, reload: 0.1, heat: 3, heatToEnemy: 6, heatPerSec: 3, dmgPerSec: 4, range: 170, cone: 10, proj: 'flame', v: 540, g: 0.1, spread: 10, arc: 'low', kick: 18,
    elev: [-12, 25], slew: 30, windup: 0.2, wild: 0.05, rest: 0, aimT: 0.7,

    desc: 'T4～T6 喷火器：射程 170px、±10° 锥形持续喷火；向对手机组传热 300 kW、对命中模块造成持续伤害 4/秒，自身回路产热 150 kW。',
  },
  steamjet: {
    name: '蒸汽喷射器', cat: 'firepower', layer: 'body', w: 2, h: 1, maxMt: 3,
    price: 170, hp: 105, power: 2, kg: 230, q: 2,
    dmg: 3, reload: 0.1, heat: 1.5, heatToEnemy: 4, heatPerSec: 1.5, dmgPerSec: 3, range: 170, cone: 10, knock: 0.35, proj: 'steam', v: 540, g: 0.1, spread: 10, arc: 'low', kick: 16,
    elev: [-12, 25], slew: 30, windup: 0.1, wild: 0.05, rest: 0, aimT: 0.1,

    desc: 'T1～T3 蒸汽喷射器：射程 170px、±10° 蒸汽锥，额定轴功率 20 kW；连续喷射向对手传热 200 kW，自身产热 75 kW，储水仅用于冷却。钢材料为上限。',
  },
  // 三件 Boss 专属件：先以普通属性接入战斗，特殊被动由 special 字段保留给后续战斗迭代。
  boss_core: {
    name: '圣堂压力核心', cat: 'energy', layer: 'body', w: 1, h: 1,
    price: 280, hp: 150, supply: 5, store: 8, water: 24, cool: 3, heatRate: 0, heatMul: 0.9, kg: 120, q: 2, special: 'pressure-buffer',
    get desc() { return `铁甲圣堂的压力核心：提供 50 kW 轴功率、400 kJ 蓄压、24 L 储水和 150 kW 额定水冷；蓄压最多释放 ${SA.K.BATTLE.STORE_RELEASE_PER_SEC} kW，回路余热 ×0.9。Boss 战利品。`; },
  },
  boss_lens: {
    name: '公爵测距棱镜', cat: 'control', layer: 'body', w: 1, h: 1, unique: { mt: 5, once: true, source: 'salvage' },
    price: 250, hp: 86, power: 0.5, kg: 55, q: 1, aimShrink: 0.12, aimSpeed: 0.18, special: 'range-prism',
    desc: '黄铜公爵的测距棱镜：让全车瞄准更快、更稳。Boss 战利品。',
  },
  boss_ram: {
    name: '寡妇液压撞头', cat: 'ram', layer: 'ram', w: 2, h: 1, unique: { mt: 5, once: true, source: 'salvage' }, mount: ['track', 'quad', 'biped', 'armor', 'armor_heavy'],
    price: 245, hp: 220, armor: 3, kg: 480, q: 3, ram: 34, knock: 1.45, punch: 18, punchCd: 1.8, heat: 2, special: 'hydraulic-bite',
    desc: '煤灰寡妇改装的液压撞头：兼顾冲撞和短周期活塞打击。Boss 战利品。',
  },
  boiler: {
    name: '燃煤锅炉', cat: 'energy', layer: 'body',
    price: 130, hp: 120, power: 0, supply: 6, q: 1, heatRate: 1.5, explode: 40, kg: 550,
    desc: '额定供给 60 kW 轴功率，约 81.6 公制马力；满载蒸汽热功率 500 kW，不消耗储水供能，储水仅用于冷却。被击毁会爆炸波及相邻模块。',
  },
  water: {
    name: '水箱', cat: 'cooling', layer: 'body',
    price: 70, hp: 100, power: 0, water: 150, q: 1, cool: 4, kg: 300,
    desc: '机组回路比环境高 30°C 时额定水冷 200 kW；蒸发每 1 L 水约移走 2257 kJ 热量。',
  },
  bucket: {
    name: '铲斗', cat: 'ram', layer: 'ram', mount: ['track', 'quad', 'biped'],
    price: 110, hp: 260, power: 0, armor: 5, kg: 450, q: 2, ram: 22, knock: 1.8,
    desc: '装在底盘正前方。撞击伤害中等但极其结实，能把对手铲退很远。',
  },
  spike: {
    name: '撞角', cat: 'ram', layer: 'ram', mount: ['armor', 'armor_heavy', 'track', 'quad', 'biped'],
    price: 130, hp: 160, power: 0, kg: 600, q: 2, ram: 40, knock: 1,
    desc: '装在装甲或底盘正前方的实心钢角，比铲斗重得多。装在底盘前能顶到对手的履带和腿；伤害随撞击速度和车重大幅提升，全速冲撞最痛。',
  },
  piston: {
    name: '蒸汽撞锤', cat: 'ram', layer: 'ram', mount: ['armor', 'armor_heavy', 'track', 'quad', 'biped'],
    price: 170, hp: 150, power: 2, kg: 700, q: 3, ram: 16, punch: 26, punchCd: 1.5, heat: 3,
    desc: '装在装甲或底盘正前方。贴身时每 1.5 秒用蒸汽活塞猛击一次，不依赖速度。',
  },
  // 补齐计划中的换皮 / 小模块；专用精灵继续沿用 art 借形。
  mortar_s: {
    name: '小臼炮', cat: 'firepower', layer: 'body', w: 1, h: 1,
    price: 70, hp: 45, power: 1, kg: 110, q: 2, dmg: 16, reload: 2.6, heat: 3, proj: 'shell', v: 720, g: 1, spread: 0, arc: 'high', indirect: true, kick: 24,
    elev: [32, 90], slew: 22, windup: 0.35, wild: 0, rest: 55, aimT: 1.1, kick: 24,
    desc: '占一个小格的间接火力；直射被挡时由 AI 自动切换。',
  },
  mg2: {
    name: '双联机枪', cat: 'firepower', layer: 'body', w: 2, h: 2,
    price: 170, hp: 140, power: 3, kg: 220, q: 2, dmg: 5, reload: 0.25, heat: 1.1, proj: 'bullet', v: 1230, g: 0.27, spread: 10, arc: 'low', kick: 5,
    elev: [-8, 32], slew: 50, windup: 0.1, wild: 0.1, rest: 0, aimT: 0.25, kick: 5,
    desc: '两挺机枪合并为一件模块，装填快、动力消耗高，按一组齐射。',
  },
  periscope: {
    name: '观察镜', cat: 'control', layer: 'body', w: 1, h: 1,
    price: 90, hp: 30, kg: 40, q: 1, aimSpeed: 0.25, aimShrink: 0.1,
    desc: '实体辅助件：全车瞄准速度 +0.25、蓄满缩圈 +0.1；被毁即失效。',
  },
  autoloader: {
    name: '装弹机', cat: 'control', layer: 'body', w: 1, h: 1,
    price: 110, hp: 30, kg: 60, q: 1, reloadMul: 0.85,
    desc: '实体辅助件：全车装填时间 ×0.85；被毁即失效。',
  },
  rangefinder: {
    name: '测距仪', cat: 'control', layer: 'body', w: 1, h: 1,
    price: 100, hp: 30, kg: 40, q: 1, spreadMul: 0.85,
    desc: '实体辅助件：直射武器散布 ×0.85；被毁即失效。',
  },
  gyroscope: {
    name: '陀螺仪', cat: 'control', layer: 'body', w: 1, h: 1,
    price: 90, hp: 30, kg: 60, q: 1, swayMul: 0.7,
    desc: '实体辅助件：全车车身晃动 ×0.7；被毁即失效。',
  },
  mg_s: {
    name: '车载机枪', cat: 'firepower', layer: 'body', w: 1, h: 1,
    price: 48, hp: 48, power: 1, kg: 55, q: 1,
    dmg: 2, reload: 0.3, heat: 0.65, proj: 'bullet', v: 1150, g: 0.27, spread: 13, arc: 'low', kick: 2,
    elev: [-8, 32], slew: 60, windup: 0.1, wild: 0.1, rest: 0, aimT: 0.3,   // 文字占位阶段沿用机炮射界
    desc: '占一个小格的车载机枪，耗能和重量都低；适合补空位，但单发伤害和穿深有限。',
  },
  mg_heavy: {
    name: '重机枪', cat: 'firepower', layer: 'body', w: 1, h: 2,
    price: 78, hp: 82, power: 1.5, kg: 105, q: 1,
    dmg: 3.5, reload: 0.35, heat: 0.9, proj: 'bullet', v: 1200, g: 0.27, spread: 11, arc: 'low', kick: 3.5,
    elev: [-8, 32], slew: 55, windup: 0.12, wild: 0.1, rest: 0, aimT: 0.35,   // 文字占位阶段沿用机炮射界
    desc: '竖立的重机枪，占 1×2 小格；伤害和穿深高于车载机枪，但需要更多动力。',
  },
  boiler_s: {
    name: '竖式锅炉', cat: 'energy', layer: 'body', w: 1, h: 2,
    price: 72, hp: 70, power: 0, supply: 3, heatRate: 0.8, explode: 22, kg: 240, q: 1,
    desc: '占 1×2 小格的小型锅炉，供给 30 kW 轴功率，约 40.8 公制马力；不消耗储水供能，储水仅用于冷却。被击毁会爆炸。',
  },
  boiler_l: {
    name: '大型锅炉', cat: 'energy', layer: 'body', w: 3, h: 3,
    price: 290, hp: 250, power: 0, supply: 13.5, heatRate: 3.4, explode: 80, kg: 1235, q: 3,
    desc: '占 3×3 小格的大型锅炉，供给 135 kW 轴功率，约 183.5 公制马力；不消耗储水供能，储水仅用于冷却，重量、余热和殉爆风险都高。',
  },
  water_l: {
    name: '大水箱', cat: 'cooling', layer: 'body', w: 3, h: 3,
    price: 158, hp: 210, power: 0, water: 340, cool: 9, kg: 675, q: 2,
    desc: '占 3×3 小格，储水 340 L，额定水冷 450 kW；适合需要长时间开火的大型战车。',
  },
};

// 旧配置数值一次性迁移到工程单位；模块 ID 与分享码顺序不变。
// power 为设备工作额定轴功率 kW，supply 为锅炉轴功率 kW；热字段为 kJ 或 kW。
for (const m of Object.values(SA.MODULES)) {
  // 储水只来自模块显式 water 字段；供汽额定值不再附赠开局给水。
  if (m.power) m.power *= 10;
  if (m.supply) m.supply *= 10;
  for (const key of ['heat', 'heatRate', 'heatPerSec', 'heatToEnemy', 'cool', 'dryCool', 'store']) if (m[key]) m[key] *= 50;
}

SA.MODULE_ORDER = ['track', 'quad', 'biped', 'cockpit', 'boiler', 'water',
  'armor', 'armor_heavy', 'cannon', 'mortar', 'mg', 'side_cannon', 'bucket', 'spike', 'piston',
  'copilot', 'helmet', 'plate', 'tank_s', 'tank_tall', 'cannon_m',
  'cannon_s', 'cannon_heavy', 'cannon_giant', 'pressure_tank', 'pressure_chamber', 'cockpit_pair',
  'radiator', 'condenser', 'rocket_rack', 'harpoon', 'flamer',
  'boss_core', 'boss_lens', 'boss_ram', 'mortar_s', 'mg2', 'steamjet', 'periscope', 'autoloader', 'rangefinder', 'gyroscope',
  'mg_s', 'mg_heavy', 'boiler_s', 'boiler_l', 'water_l'];   // 新模块只能追加在末尾：分享码按这里的序号编码

// 穿深（K1，docs/campaign-direction.md §3）：炮弹打到有护甲的模块时和装甲厚度（护甲值，随材料放大）比较，
// 穿深不够就有概率弹开（battle.js 的 projectileDamage）。穿深不随材料放大，所以越往后装甲越难打穿。
// ricochet：额外的弹开概率（侧炮定位是补强而不是主力）。喷射类武器不会弹开。数值暂定，等系统健康测试校准
const PENETRATION = {
  mg: 3, mg2: 3, mg_s: 2, mg_heavy: 2.5, cannon_s: 3.5, cannon_m: 5, cannon: 7, cannon_heavy: 11, cannon_giant: 16,
  mortar: 6, mortar_s: 4, side_cannon: [3, 0.1], rocket_rack: 4, harpoon: 4, flamer: 99, steamjet: 99,
};
for (const id in PENETRATION) {
  const [pen, extra] = [].concat(PENETRATION[id]);
  SA.MODULES[id].penetration = pen;
  if (extra) SA.MODULES[id].ricochet = extra;
}
// 修理费比例（K3，docs/campaign-direction.md §5）：修满一件的费用 = 模块总价值 × 比例，按损伤比例计。
// 越复杂精密越贵：甲片、装甲便宜，水箱低，铲斗 1/8、蒸汽撞锤 1/5（用户给定），驾驶舱、锅炉昂贵。
// 2026-09-26 用户选定 astra 提出的这套较高的比例；整体水平等经济模拟再校准
const REPAIR_RATE = {
  plate: 0.03, armor: 0.04, armor_heavy: 0.045,
  water: 0.06, water_l: 0.06, tank_s: 0.05, tank_tall: 0.055, radiator: 0.07, condenser: 0.08,
  track: 0.08, quad: 0.09, biped: 0.1,
  helmet: 0.24, cockpit_pair: 0.27, cockpit: 0.28, copilot: 0.24,
  boiler: 0.26, boiler_s: 0.26, boiler_l: 0.26, pressure_chamber: 0.12, pressure_tank: 0.1,
  periscope: 0.18, autoloader: 0.19, rangefinder: 0.18, gyroscope: 0.19,
  mg: 0.09, mg2: 0.11, mg_s: 0.08, mg_heavy: 0.085, cannon_s: 0.1, cannon_m: 0.12, cannon: 0.14, cannon_heavy: 0.18, cannon_giant: 0.22,
  mortar: 0.15, mortar_s: 0.12, side_cannon: 0.14, rocket_rack: 0.16, harpoon: 0.14, flamer: 0.12, steamjet: 0.12,
  bucket: 1 / 8, spike: 0.16, piston: 1 / 5,
  boss_core: 0.24, boss_lens: 0.22, boss_ram: 0.2,
};
for (const id in REPAIR_RATE) SA.MODULES[id].repairRate = REPAIR_RATE[id];

// 工作台在工程单位换算与派生属性完成后取快照，只覆盖用户实际改过的字段。
// 描述等只读 getter 的默认文本也存入快照；编辑描述时只替换该实例的属性。
SA.MODULE_DEFAULTS = JSON.parse(JSON.stringify(SA.MODULES));
// MODULE_EDITOR_OVERRIDES_START
SA.MODULE_OVERRIDES = {
  "helmet": {
    "hp": 45,
    "desc": "称之为驾驶舱主要是出于归档时的体面，它本质上是露天操作台用几块带铆钉的金属板围成的笼子。之所以要加上围档还是因为体面的需求。公司不喜欢看到驾驶员伤亡率居高不下。"
  },
  "track": {
    "hp": 120,
    "desc": "在工程师们终于想明白“应该把铁轨连成一整圈套在轮子上”之前，博伊德尔先生提出了一个更为暴躁的折中方案：如果大地不来配合车轮，那就让车轮每走一步都给大地抽一记巴掌。\n\n“严禁在未穿铁头靴时靠近转动的轮缘。它不在乎踩到的是英格兰或俄国的土地，抑或是某位倒霉助手的脚趾。”\n—— 皇家工程试验场·第三次事故报告残页"
  },
  "boiler_s": {
    "desc": "别看个头不大，却能硬生生挤出 40 匹马力！相比起其他庞然大物，整体让人觉得显得温顺可爱。唯一的小毛病是没有空间再装安全阀了。所以，别让驾驶舱离它太近，除非你身手很好。"
  },
  "tank_tall": {
    "desc": "一根笔挺的苗条金属筒，专为填补各种尴尬的夹缝而生。虽然 75 升的肚量谈不上多宽裕，但也足够日常使用了。它是维持引擎理智的最佳拍档，同时也是工人们晾衣服的绝佳去处。"
  },
  "mg_s": {
    "desc": "专为治愈廉价新人训练需求（和拼装强迫症）而生的武器。虽然单发威力和穿深有限，但发射起来动静极大，在纯粹听个响时表现非常称职。很多老兵都要听着它的声音才能安稳睡去。",
    "hp": 36
  },
  "bucket": {
    "desc": "用来铲煤的工具，被异想天开地固定到了车上。虽不正规，但只要不想被当做煤块铲走的话，还是要注意一下……也许说全神贯注会更准确些。",
    "knock": 1.5
  },
  "plate": {
    "desc": "半块金属甲片，任何一个铁匠炉内都能塞下它。步兵和载具都能用得上，堪称本世纪最伟大的发明！……之一！\n额，也许应该是上世纪的发明？好吧好吧，不管怎么说，像斯拉夫球往棉衣里塞稻草一样，有空间就塞上一块准没错！"
  },
  "armor": {
    "desc": "广泛应用于各行各业的金属甲板，造成金属价格上涨的罪魁祸首之一。用于保护更大的区域，但其重量也是个不容小觑的问题",
    "hp": 100
  },
  "tank_s": {
    "desc": "一个供锅炉解渴的水箱，时髦地使用了玻璃。优良的工艺使其意外地坚固。便宜的价格让伦敦城中家家户户都要备上一罐。除此之外，还能给驾驶员解渴",
    "hp": 14
  },
  "mortar_s": {
    "desc": "早在拿破仑时期就被广泛使用的抛射火炮，因其独特的弹道和散布范围而被军队逐渐淘汰。如今在战车竞技、马戏表演、狗狗抛接球和个人商业短途飞行等领域得到广泛应用。"
  },
  "mortar": {
    "desc": "现役的抛射型火炮，威力和散布都比过去的版本有了长足的增长。当然重量和价格也是。发明家一直试图将其转化为新一代城市内通勤用的快速旅行装置，火热的技术竞争每天都在发生。\n\n“这是分不错的工作，很吃激，让思绪摆多大地的束缚……现在可以给窝医疗费噜吗？”——鼻青脸肿的测试员",
    "hp": 75
  }
};
// MODULE_EDITOR_OVERRIDES_END
for (const [id, fields] of Object.entries(SA.MODULE_OVERRIDES)) {
  const module = SA.MODULES[id];
  if (!module || !fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
  const apply = (target, edits) => {
    for (const [key, value] of Object.entries(edits)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (value && typeof value === 'object' && !Array.isArray(value)
          && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        apply(target[key], value);
      } else if (Object.getOwnPropertyDescriptor(target, key)?.get) {
        Object.defineProperty(target, key, { value, writable: true, configurable: true, enumerable: true });
      } else {
        target[key] = value;
      }
    }
  };
  apply(module, fields);
}
SA.repairRate = (id) => SA.MODULES[id].repairRate || 0.05;


SA.isWeapon = (id) => !!SA.MODULES[id].dmg;
// 占格：w×h 个子格（默认 2×2）
SA.fp = (id) => { const m = SA.MODULES[id]; return { w: m.w || 2, h: m.h || 2 }; };
SA.isCockpit = (id) => !!SA.MODULES[id].cockpit;
SA.driversOf = (id) => SA.MODULES[id].drivers || 0;
// 已取消的模块 → 替代品（旧存档、旧分享码、旧蓝图读进来时换掉）
SA.RETIRED = { copilot: 'cockpit' };
SA.liveId = (id) => SA.RETIRED[id] || id;
SA.minMt = (id) => SA.MODULES[id].minMt || 1;
SA.maxMt = (id) => SA.MODULES[id].maxMt || SA.MAT_MAX;
// 指定材料的旧件、敌车和库存统一到对应喷射武器；无材料的蓝图仍按原 id 创建最低合法档。
SA.materialId = (id, mt) => id === 'flamer' && mt < 4 ? 'steamjet' : id === 'steamjet' && mt > 3 ? 'flamer' : id;
// 模块重量（kg）：基础重量（按面积折算）+ 自身重量 + 改装加重
SA.weightOf = (cell) => { const f = SA.fp(cell.id); return SA.K.WEIGHT_BASE * f.w * f.h / 4 + (SA.MODULES[cell.id].kg || 0) + (cell.lv || 0) * SA.K.UP_KG; };
const fmtT = (kg) => `${(kg / 1000).toFixed(kg < 10000 ? 2 : 1)} t`;
SA.tons = fmtT;
SA.kmh = (pxs) => `${(pxs * SA.K.KMH).toFixed(1)} km/h`;
// 动力与牵引的统一量纲：锅炉标称轴功率 kW，显示为公制马力 PS；1 L 冷却储水约为 1 kg。
SA.Phys = {
  PS_KW: 0.73549875, LATENT_KJ_L: 2257,
  PX_M: 1.5 / 48, GRAVITY: 9.81, ROLL: 0.025, TRANSMISSION: 0.8,
  kwToPs: kw => kw / 0.73549875,
  // 目标速度下预留 0.7 m/s² 起步牵引力；实战每帧再按 P=Fv 限制。
  driveKw: (kg, pxs) => kg * (0.7 + 9.81 * 0.025) * Math.max(0, pxs) * (1.5 / 48) / 0.8 / 1000,
  heatCapacity: kg => 8 * 4.18 + Math.max(0, kg) * 0.02 * 0.5, // 8 L 循环水及参与换热的 2% 金属（0.5 kJ/kg/K）
  heatMax: kg => (120 - 20) * SA.Phys.heatCapacity(kg),
  temp: (heat, cap) => 20 + heat / Math.max(1, cap),
  fmtPower: kw => `${SA.Phys.kwToPs(kw).toFixed(1)} 马力`,
  fmtKw: kw => `${kw.toFixed(1)} kW`,
  fmtWater: l => `${l.toFixed(1)} L`,
  fmtHeat: kj => `${kj.toFixed(0)} kJ`,
  fmtTemp: c => `${c.toFixed(0)} °C`,
  // 储水只参与冷却蒸发；锅炉轴功率及其产热不受储水量限制。
  thermalStep: (heat, water, dt, p) => {
    const shaftKw = p.shaftKw;
    heat = Math.max(0, heat + (p.heatKw * (p.shaftKw ? shaftKw / p.shaftKw : 0) + p.weaponKw + (shaftKw ? SA.K.IDLE_HEAT : 0)) * dt);
    const passive = Math.min(heat, (SA.K.DISSIPATE + p.dryCool) * Math.max(0, (SA.Phys.temp(heat, p.capacity) - 20) / 30) * dt);
    heat -= passive;
    const cooled = Math.min(heat, SA.coolRate(p.cool, heat, p.capacity) * dt, water * 2257 / p.waterSave);
    heat -= cooled; water -= cooled / 2257 * p.waterSave;
    return { heat: Math.max(0, heat), water: Math.max(0, water), shaftKw, cooled, passive };
  },
};
// 撞击伤害倍率：跟车重成正比（6 t 为 ×1），0.5 ~ 3 倍
SA.ramMul = (kg) => Math.max(0.5, Math.min(3, kg / 6000));
// 改装：武器加炮盾，底盘加裙板，撞击件加厚撞面，其余加附加装甲
SA.upName = (id) => (SA.isWeapon(id) ? '炮盾' : SA.MODULES[id].layer === 'chassis' ? '加固裙板' : SA.MODULES[id].layer === 'ram' ? '加厚撞面' : '附加装甲');
SA.upHp = (id) => (SA.isWeapon(id) ? 0.3 : 0.25);   // 每级耐久 +%
SA.upCost = (id, lv) => Math.round(SA.MODULES[id].price * SA.K.UP_COST * lv);
// 水箱这一刻能带走多少热量（kW）：由机组回路相对环境温差决定。
SA.coolRate = (cool, heat, cap = 50) => cool * Math.max(0, Math.min(1, (SA.Phys.temp(heat, cap) - 20) / SA.K.COOL_FULL));
SA.isRam = (id) => SA.MODULES[id].layer === 'ram';

// 唯一腿部外观：材料取造型原档，每种独立缴获一次。半人马同材料的速度、动力、重量均与普通四足一致。
// chapter 为战役数组序号（0=序章）；双足变体从第三章起的场外精英获得，四足从第一章起逐档开放。
SA.LEG_VARIANTS = [
  ['quad', 'skirtfort', '裙甲堡', 2, 1], ['quad', 'gren', '掷弹兵', 3, 2], ['quad', 'pedrail', '步行履带', 3, 2],
  ['quad', 'knight', '蒸汽圣骑', 4, 3], ['quad', 'mantis', '螳臂步行机', 4, 3],
  ['quad', 'centaur', '半人马', 5, 4], ['quad', 'anchor', '锚链铁甲', 5, 4],
  ['quad', 'bigben', '大本钟', 6, 5], ['quad', 'dragon', '黑龙', 6, 5],
  ['biped', 'stilt', '高跷', 2, 3], ['biped', 'blade', '板簧跑刃', 3, 3], ['biped', 'skirt', '裙甲堡', 3, 3],
  ['biped', 'mail', '锁甲骑士腿', 4, 3], ['biped', 'panto', '缩放仪平行腿', 4, 3],
  ['biped', 'steamman', '蒸汽人', 5, 4], ['biped', 'bellows', '风箱腿', 5, 4],
  ['biped', 'templar', '圣堂骑士腿', 6, 5], ['biped', 'crystal', '晶枝腿', 6, 5],
].map(([id, look, name, mt, chapter]) => ({ id, key: `${id}:${look}`, look, name, mt, chapter, once: true, source: 'side' }));

// 只有模块自身声明 unique 才封禁整类购买。普通观察镜 / 重装甲的支线奖励仅给那一件实例标身份。
SA.uniqueByKey = (key) => {
  const m = SA.MODULES[key];
  if (m && m.unique) return { id: key, key, mt: 5, once: true, source: 'salvage', ...(m.unique === true ? {} : m.unique) };
  return SA.LEG_VARIANTS.find(x => x.key === key)
    || (SA.SIDE_ENCOUNTERS || []).map(x => x.reward).find(x => x && x.key === key && x.unique) || null;
};
SA.uniqueRule = (x) => {
  if (typeof x === 'string') return SA.MODULES[x]?.unique ? SA.uniqueByKey(x) : null;
  if (!x) return null;
  const rule = typeof x.unique === 'string' ? SA.uniqueByKey(x.unique)
    : x.look ? SA.LEG_VARIANTS.find(v => v.id === x.id && v.look === x.look) : SA.uniqueRule(x.id);
  return rule && rule.id === x.id ? rule : null;
};
SA.isUnique = (x) => !!SA.uniqueRule(x);
// 战利品配置归一：key 是领取账本的身份，id 始终是基础模块种类。
SA.rewardRule = (x) => {
  if (!x) return null;
  const registered = SA.uniqueByKey(x.key || (typeof x.unique === 'string' ? x.unique : x.id));
  return { ...registered, ...x, key: x.key || registered?.key || x.id, mt: x.mt || registered?.mt || 5, once: x.once !== false, source: x.source || 'salvage' };
};
// 校验外观与身份组合；从蓝图读回固定材料，不允许外观字段把普通件伪装成免缴获的唯一件。
SA.fixIdentity = (cell) => {
  const rule = SA.uniqueRule(cell);
  if (rule) { cell.unique = rule.key; if (rule.look) cell.look = rule.look; else delete cell.look; }
  else { delete cell.unique; delete cell.look; }
  return rule;
};

// ---------- 材料：模块品质 = 材料 ----------
// 1~4 用钱在车间升级（随战役解锁）；5 史诗、6 传奇还要消耗特定的锭 / 结晶，只能靠委托、缴获和 Boss 掉落获得
// mul：耐久、伤害、动力、水、冷却、撞击、活塞、承重、护甲一起放大；产热和重量不变，所以好材料更「省」
// cost：从上一级升到这一级的费用 = 模块原价 × cost；tint / a / lite / dark：换色（'color' 混合保留原图明暗，再提亮 / 压暗）
SA.MATS = [null,
  { key: 'brass', name: '黄铜', mul: 1.00, cost: 0, chip: '#d9a441' },
  { key: 'iron', name: '熟铁', mul: 1.20, cost: 0.6, chip: '#8d8f96', tint: '#6a6c72', a: 0.9, dark: 0.3 },
  { key: 'steel', name: '钢', mul: 1.45, cost: 1.0, chip: '#7f9fc4', tint: '#5f86b8', a: 0.75 },
  { key: 'nickel', name: '镀镍', mul: 1.75, cost: 1.6, chip: '#e2e6ec', tint: '#cfd6de', a: 0.9, lite: 0.22 },
  { key: 'wootz', name: '乌兹钢', mul: 2.10, cost: 2.2, chip: '#b07ae6', tint: '#8f55d6', a: 0.8, ingot: 'wootz', rank: '史诗' },
  { key: 'aether', name: '以太合金', mul: 2.50, cost: 3.0, chip: '#4fe3d2', tint: '#2fd6c4', a: 0.85, lite: 0.12, ingot: 'aether', rank: '传奇' },
];
SA.MAT_MAX = SA.MATS.length - 1;
// 史诗 / 传奇材料：升级时每次消耗 1 块
SA.INGOTS = {
  wootz: { name: '乌兹钢锭', desc: '印度坩埚钢，花纹像流水。把镀镍模块升到史诗级「乌兹钢」要用 1 块。' },
  aether: { name: '以太结晶', desc: '女王号锅炉里取出的发光结晶。把乌兹钢模块升到传奇级「以太合金」要用 1 块。' },
};
// 持续伤害率和单发伤害同样随材料放大；产热和射速仍沿用模块原值。
const MAT_SCALED = ['hp', 'dmg', 'dmgPerSec', 'supply', 'water', 'cool', 'ram', 'punch', 'load', 'armor'];
const modCache = new Map();
// 某一格模块按材料放大后的定义：SA.mod(cell) 或 SA.mod(id, mt)
SA.mod = (x, mt) => {
  const id = typeof x === 'object' ? x.id : x;
  mt = Math.max(1, Math.min(SA.MAT_MAX, (typeof x === 'object' ? x.mt : mt) || 1));
  const key = `${id}@${mt}`;
  let m = modCache.get(key);
  if (!m) {
    const base = SA.MODULES[id], mul = SA.MATS[mt].mul;
    m = { ...base, mt };
    for (const k of MAT_SCALED) if (base[k]) m[k] = k === 'hp' || k === 'load' ? Math.round(base[k] * mul) : Math.round(base[k] * mul * 10) / 10;
    modCache.set(key, m);
  }
  return m;
};
SA.newCell = (id, mt = SA.minMt(SA.liveId(id))) => {
  id = SA.materialId(SA.liveId(id), mt); mt = Math.max(mt, SA.minMt(id));
  return mt > 1 ? { id, mt, hp: SA.mod(id, mt).hp } : { id, hp: SA.MODULES[id].hp };
};
// 旧数据修正：退役件替代、喷射器按原材料换种类，其余模块补最低材料；保留含改装的耐久比例。
SA.fixCell = (cell) => {
  if (!cell) return cell;
  const unique = SA.fixIdentity(cell);
  const id = SA.materialId(SA.liveId(cell.id), cell.mt || 1), mt = unique ? unique.mt : Math.max(cell.mt || 1, SA.minMt(id));
  if (id === cell.id && mt === (cell.mt || 1)) return cell;
  const before = cell.max || Math.round(SA.mod(cell).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
  const ratio = Math.max(0, Math.min(1, cell.hp / before));
  cell.id = id; if (mt > 1) cell.mt = mt;
  const after = Math.round(SA.mod(cell).hp * (1 + SA.upHp(cell.id) * (cell.lv || 0)));
  cell.hp = Math.round(after * ratio);
  if (cell.max != null) cell.max = after;
  if (cell.aux && !SA.isCockpit(id)) delete cell.aux;
  return cell;
};
// 库存键修正：同上
SA.fixKey = (k) => { const p = SA.parseKey(k), id = SA.materialId(SA.liveId(p.id), p.mt); return SA.invKey(id, Math.max(p.mt, SA.minMt(id))); };
// 买一个新模块：材料至少是它的最低材料，价格按那一级的总价值算
SA.buyMt = (id) => SA.minMt(id);
SA.buyPrice = (id) => SA.cellValue({ id, mt: SA.buyMt(id) });
SA.matOf = (cell) => SA.MATS[(cell && cell.mt) || 1];
SA.matUpCost = (id, toMt) => Math.round(SA.MODULES[id].price * SA.MATS[toMt].cost);
// 模块总价值：原价 + 材料升级 + 改装件（修理、回收、卖出都按它算）
SA.cellValue = (cell) => {
  let v = SA.MODULES[cell.id].price;
  for (let t = 2; t <= (cell.mt || 1); t++) v += SA.matUpCost(cell.id, t);
  for (let k = 1; k <= (cell.lv || 0); k++) v += SA.upCost(cell.id, k);
  return v;
};
// 护甲：每发炮弹先减掉固定伤害（最少保留 25%）
SA.armorCut = (m, dmg) => (m.armor ? Math.max(dmg * 0.25, dmg - m.armor) : dmg);
// 库存键：黄铜直接用 id，其余是 id@材料
SA.invKey = (id, mt = 1) => (mt > 1 ? `${id}@${mt}` : id);
SA.parseKey = (k) => { const [id, t] = String(k).split('@'); return { id, mt: +t || 1 }; };

// ---------- 实体辅助模块效果 ----------
// 观察镜、装弹机、陀螺仪和测距仪都是普通 1×1 模块；只统计仍有耐久的实体。
SA.auxEffect = (cells) => {
  const e = { aimSpeed: 0, aimShrink: 0, reload: 1, sway: 1, spread: 1 };
  for (const cell of cells) {
    if (!(cell.hp > 0)) continue;
    const m = SA.mod(cell);
    if (!m.reloadMul && !m.spreadMul && !m.swayMul) continue;
    e.reload *= m.reloadMul || 1;
    e.sway *= m.swayMul || 1;
    e.spread *= m.spreadMul || 1;
  }
  return e;
};
