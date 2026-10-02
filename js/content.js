// 内容数据：赛事对手、订单、云车库预置载具
window.SA = window.SA || {};

// 开局的车：固定的小提米级四件构筑；坐标是子格 [r, c, id]，全车黄铜，无额外改装。
SA.STARTER = {
  rows: ['........', '........', '........', '........', '........', '........'],
  subs: [[8, 9, 'boiler_s'], [8, 10, 'mg_s'], [9, 10, 'helmet'], [10, 9, 'track']],
};

SA.OPPONENTS = [
  {
    name: '锈钉子号', pilot: '铁匠 老汤姆', prize: 150, aim: 0.65,
    blurb: '拿铁匠铺的边角料拼出来的，但老汤姆的机炮从不卡壳。',
    rows: ['........', '........', '........', '...KM...', '...OWA..', '...TTT..'], sides: [],
  },
  {
    name: '煤灰寡妇', pilot: '玛莎·布莱克', prize: 220, aim: 0.78,
    blurb: '四足稳定平台，火炮很准；车头的铲斗能把你推出场外。',
    rows: ['........', '........', '...K....', '...OC...', '..WOAA..', '..Q.U...'], sides: [],
  },
  {
    name: '黄铜公爵', pilot: '沃德豪斯公爵', prize: 300, aim: 0.9,
    blurb: '第一台在侧挂层架侧炮的参赛车，藏在装甲后面放冷枪。',
    rows: ['........', '........', '....K...', '...OAM..', '..WOAAC.', '..TTTTT.'], sides: [[3, 4]],
  },
  {
    name: '双足舞者', pilot: '伊莎贝拉·雷恩', prize: 400, aim: 0.9,
    blurb: '摇摇晃晃的双足底盘极难命中，还会顶着撞角全速冲过来。',
    rows: ['........', '....C...', '...KM...', '..OWAAX.', '..WOAM..', '..B.....'], sides: [],
  },
  {
    name: '铁甲圣堂', pilot: '圣殿骑士团', prize: 550, aim: 0.95,
    blurb: '重装甲堆到了第五层，顶上架着高抛火炮，车头还有蒸汽撞锤。',
    rows: ['........', '....KP..', '..WOHHY.', '..WOHHC.', '.WOOHAM.', '.TTTTTT.'], sides: [[3, 4], [2, 4]],
  },
  {
    name: '维多利亚女王号', pilot: '卫冕冠军 哈灵顿爵士', prize: 800, aim: 1.0,
    blurb: '六层高的移动堡垒：五座锅炉、三门侧炮、顶层高抛炮，履带前还焊着铲斗。',
    rows: ['.....K..', '....OHP.', '..WOHHM.', '.WWOHKC.', 'WWOOHAM.', 'TTTTTTTU'], sides: [[2, 4], [3, 4], [4, 4]],
  },
];

// ---------- 地形 ----------
// 坐标是竞技场世界像素（宽 1280，地面 y = 648）。开局两车车头大约在 x = 440 和 x = 840，地形都摆在中间这一段。
// hills：土坡（余弦鼓包，x 中心、w 宽、h 高）—— 挡低平的直射炮弹，上坡慢、下坡快，车跟着地面抬高
// mud：泥地区间 [x0, x1] —— 按底盘减速（履带 0.8、四足 0.65、双足 0.45）
// crates：木货箱（x 中心、w 宽、h 高、hp）—— 能挡一两发炮弹；车一顶上去就碾碎（车越重越快），碾的时候被拖慢，碎木堆也减速
SA.TERRAINS = {
  flat: { name: '平地', desc: '平整的煤渣地，没有遮挡，拼的是火力和装甲。' },
  crates: { name: '货箱', crates: [{ x: 600, w: 48, h: 72, hp: 60 }, { x: 690, w: 48, h: 48, hp: 40 }],
    desc: '场地中间堆着几只木货箱：能替你挡一两发炮弹；车顶上去一碾就碎，只是会被拖慢一下，碎木堆也让车慢一点。' },
  mud: { name: '泥地', mud: [[430, 850]],
    desc: '中间一大片烂泥：履带速度 ×0.8、四足 ×0.65、双足 ×0.45。冲撞车在泥里跑不起来。' },
  hills: { name: '土坡', hills: [{ x: 640, w: 320, h: 44 }],
    desc: '中间隆起一道土坡：低平的直射炮弹会打在坡上；爬坡变慢、下坡变快，翻过去的车会被抬高。' },
  yard: { name: '工厂后院', hills: [{ x: 510, w: 200, h: 26 }, { x: 790, w: 200, h: 26 }], crates: [{ x: 650, w: 48, h: 96, hp: 80 }],
    desc: '两道小坡夹着一摞高货箱：挡掉几发低平的炮弹，碾过去要多花一点时间。' },
  mine: { name: '矿坑', hills: [{ x: 640, w: 360, h: 56 }], mud: [[330, 470], [810, 950]],
    desc: '中间一座矿渣堆，两边是泥坑：出发就陷在泥里，翻过渣堆才能贴身。' },
};
SA.TERRAIN_ORDER = ['flat', 'crates', 'mud', 'hills', 'yard', 'mine'];

// ---------- 战役：从后巷一路打进水晶宫 ----------
// 每一章 = 一组「考题」对手 + 通关解锁（新模块 / 材料 / 功能 / 更大的改装台）。每一关 = 一道构筑考题：
// blurb 写明它的问题和弱点，玩家赛前侦察后去车间调整。mt：整车材料；elite：个别格子的材料（Boss 的史诗件，可以缴获）。
// style：AI 性格 —— rush 冲锋（有撞击件就一直冲）、kite 拉开距离放风筝、turtle 守在原地、不写 = 在交战距离内游走。
// terrain：场地（SA.TERRAINS 的键），不写 = 平地。
// unlock：{ feat: [功能], mods: [模块], mat: 最高可升级的材料, grid: { cols, rows } 改装台大小, ingots: { 锭: 数量 } }
// spec：每关的探索稿规格。terrain / reward / lesson / targetStrength / performanceMin 供进化报告和验收读取，
// 它描述设计意图，不直接替代战斗数值或敌车的实际布局；关卡调整时优先改这里和 unlock 的对应关系。
// subs：用子格坐标放置 1×1 / 1×2 / Boss 大件，坐标仍是 24px 最小格；无专用美术的模块由通用占位显示。
// 开局已有小锅炉、小机枪，商店清单继续保留原有可用模块；黄铜材料，4×3 改装台。
SA.CAMP_START = { feat: [], mods: ['track', 'helmet', 'plate', 'boiler', 'water', 'armor', 'cannon_m', 'mg', 'boiler_s', 'mg_s'], mat: 1, grid: { cols: 4, rows: 3 } };
SA.FEATURES = {
  garage: '车间', shop: '商店', street: '街头赛', bank: '银行贷款', side: '侧挂层', upgrade: '改装（炮盾 / 附加装甲）',
  orders: '民间委托', bet: '下注', blueprints: '蓝图库', friendly: '友谊赛 · 云车库', season: '终局 · 伦敦蒸汽大奖赛',
};
// 竞技场外遭遇战（K6）：第二章开始开放；不发奖金和声望，奖励由数据指定。
// settleDamage=true 表示战斗损伤带回车间；改成 false 可用于一次性无损遭遇战。
SA.SIDE_ENCOUNTERS = [
  {
    id: 'dock_patrol', name: '码头巡逻队', pilot: '河岸工头', chapter: 1, terrain: 'mud', aim: 0.72, style: 'rush', settleDamage: true,
    blurb: '码头外的巡逻队拦住了补给车。没有观众，也没有奖金，但他们的观察镜值得拆下来研究。',
    rows: ['........', '........', '...K....', '...OM...', '..WOA...', '..TT...'],
    subs: [[3, 6, 'periscope']],
    reward: { id: 'periscope', key: 'side:dock_patrol', mt: 2, unique: true, guaranteed: true, once: true, source: 'side' },
  },
  {
    id: 'factory_escort', name: '工厂护送车', pilot: '夜班领班', chapter: 1, terrain: 'crates', aim: 0.78, style: 'turtle', settleDamage: true,
    blurb: '护送车不参加赛会，只守着工厂门口。击败它可以拿到一块稀有装甲。',
    rows: ['........', '........', '...K....', '..OMC...', '..WOH...', '..TT...'],
    reward: { id: 'armor_heavy', key: 'side:factory_escort', mt: 3, unique: true, guaranteed: true, once: true, source: 'side' },
  },
];
// 变体精英沿用两套合法底盘构筑；固定外观只写到敌车和缴获格子，主线、基础模块数值与材料倍率不变。
// 胜利后的固定缴获独立于存活零件池：炸坏敌方底盘也不会永久错过外观，重打不重复发放。
for (const variant of SA.LEG_VARIANTS) {
  const quad = variant.id === 'quad';
  SA.SIDE_ENCOUNTERS.push({
    id: `variant_${variant.id}_${variant.look}`, name: `${quad ? '四足' : '双足'}精英 · ${variant.name}`, pilot: '场外机械师',
    chapter: variant.chapter, mt: variant.mt, terrain: 'flat', aim: 0.8, style: 'wander', settleDamage: true,
    blurb: `首次击败可固定缴获「${variant.name}」${quad ? '四足' : '双足'}底盘；同材料数值与普通底盘相同。`,
    rows: quad ? ['........', '........', '........', '........', '...O....', '...Q....']
      : ['........', '........', '........', '...O....', '...B....', '........'],
    subs: quad ? [[7, 6, 'helmet'], [7, 7, 'mg_s'], [8, 8, 'water']]
      : [[5, 6, 'helmet'], [5, 7, 'mg_s'], [6, 8, 'water']],
    reward: { ...variant, unique: true, guaranteed: true },
  });
}
// 序章训练赛不发金币，胜利后由铁匠铺免费修理；保留原奖金数值供工作台重新开启时使用。
// 第二关原始模板还用于旧手工关卡记录迁移时恢复新关。
SA.CAMPAIGN_LAYOUT = 2;
SA.PROLOGUE_PLATE_STAGE = {
  name: '补丁号', pilot: '铆工 小艾达', prize: 0, rewardMoney: false, victoryRepairFree: true, aim: 0.45, style: 'turtle',
  blurb: '驾驶舱上方焊着一块甲片。观察它护住了哪里，再试着从薄弱处打进去。',
  rows: ['........', '........', '........', '........', '........', '........'],
  subs: [[8, 5, 'boiler_s'], [9, 4, 'helmet'], [9, 6, 'mg_s'], [10, 4, 'track'], [8, 4, 'plate']],
  spec: { terrain: 'flat', reward: 'plate', lesson: '用少量甲片保护驾驶舱和锅炉，认识装甲的位置比堆叠数量更重要。', targetStrength: [0.65, 0.8], performanceMin: 35 },
  unlock: { mods: ['plate'], note: '获得一块甲片：回到车间，把它装在要害受到攻击的一侧。' },
  // 甲片已属于开局模块，单独解锁不会发放实物；首次通关明确给一块黄铜甲片。
  rewardItems: [{ id: 'plate', count: 1, mt: 1 }],
};
SA.CAMPAIGN = [
  {
    name: '序章 · 铁匠铺后院', place: '铁匠铺后院',
    bounds: { left: 0, right: 1280 }, // 两侧为现有地形边缘；整车不能无限后退。
    blurb: '老汤姆答应教你开蒸汽战车。先在后院的煤渣地上试试手：A/D 开车，按住左键瞄准开火。',
    stages: [
      {
        name: '破铜烂铁号', pilot: '学徒 小提米', prize: 60, rewardMoney: false, victoryRepairFree: true, aim: 0.18, style: 'rookie',
        blurb: '铁匠铺学徒拿废料拼的练习车，只有一门机炮，枪法也很烂。放心开火。',
        rows: ['........', '........', '........', '...K....', '...OM...', '...TT...'],
        spec: { terrain: 'flat', reward: 'tank_s', lesson: '认识车间、锅炉和机炮：先学会让车动起来并保护驾驶舱。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        rewardItems: [{ id: 'tank_s', count: 1, mt: 1 }], // 首关实发一只 1×1 黄铜小水罐。
        unlock: { feat: ['garage'], mods: ['tank_s'], note: '车间开放：领取一只 1×1 小水罐，装上它练习冷却。' },
      },
      { ...SA.PROLOGUE_PLATE_STAGE },
      {
        name: '锈钉子号', pilot: '铁匠 老汤姆', prize: 120, rewardMoney: false, victoryRepairFree: true, aim: 0.6,
        blurb: '老汤姆的机炮从不卡壳，专扫你没有装甲的锅炉和驾驶舱；车头铲斗会把你推出去。用装甲护住要害，再贴近它。',
        rows: ['........', '........', '........', '...KM...', '...OWA..', '...TTU..'],
        spec: { terrain: 'flat', reward: 'bucket', lesson: '铲斗近战：没有好炮时，用动力和铲斗贴身推倒早期薄甲车。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['bucket'], note: '缴获铲斗：前期瞄准困难时，先用动力和铲斗贴近解决战斗。' },
      },
    ],
    unlock: { feat: ['shop'], mods: ['tank_tall', 'cannon_s', 'mg_s', 'boiler_s'], grid: { cols: 5, rows: 3 },
      note: '商店开张：没库存的模块直接放上车就是购买。每个大格可以拆成 2×2 小格：小水罐、水罐、小炮、车载机枪和竖式锅炉用来补缝、增加火力或供能。' },
  },
  {
    name: '第一章 · 后巷', place: '白教堂后巷',
    blurb: '后巷里的地下赛车圈。在这里站稳脚跟，才会有人给你递锦标赛的请柬。',
    stages: [
      {
        name: '铁皮罐头', pilot: '锅炉工 胖哈利', prize: 130, terrain: 'crates', aim: 0.55, style: 'turtle',
        blurb: '车头糊满了铁皮，机炮打上去只冒火星（装甲每发减伤）。用直射火炮把铁皮凿穿，再打它的火炮。',
        rows: ['........', '........', '...K....', '..OWL...', '..OWAA..', '..TTTT..'],
        spec: { terrain: 'crates', reward: null, lesson: '推与挡的第一题：货箱能挡低平火力，薄甲应由直射火炮先打开缺口。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { feat: ['street', 'bank'], note: '街头赛和银行开放：先用短赛补足改装预算，再决定把钱投到武器还是冷却。' },
      },
      {
        name: '双管哨兵', pilot: '扒手 机灵杰克', prize: 150, aim: 0.65, style: 'kite',
        blurb: '上下两门机炮一起扫，跑得还快，专挑没护甲的模块。把锅炉、驾驶舱藏到装甲后面，拉近了打。',
        rows: ['........', '........', '...M....', '..KAM...', '..OWA...', '..TTT...'], subs: [[4, 10, 'periscope'], [4, 12, 'autoloader']],
        spec: { terrain: 'flat', reward: 'periscope', lesson: '观察与装填：先用辅助件改善瞄准和装填，再处理会拉扯距离的机炮车。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['periscope', 'autoloader'], note: '观察镜和装弹机开放：装到车上即可改善瞄准和装填，被击毁后效果消失。' },
      },
      {
        name: '煤灰寡妇', pilot: '玛莎·布莱克', prize: 220, terrain: 'crates', aim: 0.75, boss: true,
        blurb: '【宿敌】玛莎把四足炮台的车头换成重装甲，顶层火炮和侧炮从高处往下压；车头的铲斗仍会把你铲出去。她说后巷只容得下一个人。',
        rows: ['........', '........', '...P....', '...KZ...', '..WOHH..', '..Q.U...'], sides: [[3, 4]], elite: [[3, 4, 2]], subs: [[4, 14, 'boss_lens']],
        uniqueLoot: [{ id: 'boss_lens', mt: 5, once: true, source: 'salvage' }],
        spec: { terrain: 'crates', reward: 'side_cannon', lesson: '推与挡的 Boss：厚重车头克制纯近战，侧炮和高抛火力逼你从正面以外规划攻击。', targetStrength: [0.6, 0.7], performanceMin: 35 },
        unlock: { feat: ['side'], mods: ['side_cannon', 'armor_heavy'], note: '缴获侧炮和重装甲：侧挂层能从装甲外侧射击，重装甲则把正面推撞的成本降下来。' },
      },
    ],
    unlock: { mods: ['quad', 'cannon', 'mg_heavy'], mat: 2, grid: { cols: 5, rows: 4 },
      note: '熟铁材料开放：选中车上的模块就能升级材料，所有属性 ×1.2。四足、直射火炮和重机枪到手，观察镜、装弹机和侧挂件都是可击毁的实体模块。街头赛可以刷钱，银行可以贷款。' },
  },
  {
    name: '第二章 · 码头区', place: '泰晤士河码头',
    bounds: { left: 0, right: 1280 }, // 本章场地同样以地形两端为极限。
    blurb: '码头区先让你用侧炮和近战贴身，随后把战场抬到头顶：货箱和厚甲挡住平射，臼炮从后排越过掩体落下。',
    stages: [
      {
        name: '推土机', pilot: '码头工 大块头比尔', prize: 180, terrain: 'mud', aim: 0.6, style: 'rush', mt: 2,
        blurb: '宽履带加车头铲斗，一门心思往前推；车尾还挂着一只小臼炮，示范如何在泥地里用间接火力补近战的空档。',
        rows: ['........', '........', '........', '...KM...', '..WOAA..', '..TTTTU.'], subs: [[4, 10, 'mortar_s']],
        spec: { terrain: 'mud', reward: 'mortar_s', lesson: '抛射入门：泥地会拖慢冲锋车，小臼炮可以越过货箱补上平射死角。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { feat: ['blueprints'], mods: ['mortar_s', 'condenser'], note: '小臼炮和冷凝器开放：保存一套冷却蓝图，开始把热量和抛射角度当作构筑预算管理。' },
      },
      {
        name: '独角兽', pilot: '邮差 老乔', prize: 200, aim: 0.65, style: 'rush', mt: 2,
        blurb: '双足轻骑，装甲前焊着撞角全速冲锋，身子晃得很难打中。等它冲到脸上再开火，它的装甲很薄。',
        rows: ['........', '........', '........', '...KM...', '...OAX..', '...B....'],
        spec: { terrain: 'flat', reward: 'biped', lesson: '双足近战：摇摆底盘很难被命中，但正面只有轻甲，侧炮配撞击件能快速结束贴身战。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['biped', 'pressure_chamber'], note: '双足底盘和加压舱开放：每个小格换来一点动力，但双足走起来更晃，热量压力也会上升。' },
      },
      {
        name: '码头齐射', pilot: '钟表匠 老维克', prize: 300, terrain: 'mud', aim: 0.85, style: 'turtle', boss: true, mt: 3,
        blurb: '【抛射 Boss】前排重装甲挡住平射，后排两门臼炮越过货箱连续落弹，联合驾驶舱让它能同时压制近处和远处。',
        rows: ['....P.P.', '........', '...K....', '...OHH..', '..WOHH..', '..Q.....'], elite: [[3, 4, 3]], subs: [[4, 10, 'cockpit_pair'], [4, 12, 'mortar_s']],
        spec: { terrain: 'mud', reward: 'mortar', lesson: '抛射 Boss：厚前装甲与后排臼炮迫使玩家改变站位，联合驾驶舱展示多组武器协同。', targetStrength: [0.6, 0.7], performanceMin: 35 },
        unlock: { mods: ['mortar', 'cockpit_pair'], note: '缴获高抛火炮和双人联合驾驶舱：臼炮越过正面装甲，两个驾驶员可以同时操作两组武器。' },
      },
    ],
    unlock: { mat: 3, grid: { cols: 6, rows: 4 },
      note: '钢材料开放（×1.45）。你已经见过泥地、双足和抛射火力，下一章会把贴身缠斗推到更高强度。' },
  },
  {
    name: '第三章 · 工厂区', place: '兰开夏纺织厂',
    blurb: '工厂区进入缠斗：撞角、鱼叉和蒸汽喷射器轮番把距离变成优势，贴身后要在反震和持续加热之间做取舍。',
    stages: [
      {
        name: '烟囱', pilot: '扫烟囱的汤米', prize: 260, terrain: 'yard', aim: 0.7, style: 'turtle', mt: 2,
        blurb: '车头两层重装甲，高抛炮从墙后面往你头上砸；两支喷射器会在贴身后持续加热和推开你。直射打不穿？用撞角把墙顶开。',
        rows: ['........', '........', '...P....', '..KOH...', '..WOHH..', '..TTTT..'], subs: [[4, 10, 'flamer'], [4, 12, 'steamjet']],
        spec: { terrain: 'yard', reward: 'spike', lesson: '缠斗入门：重甲会挡住平射，撞角和蒸汽喷射器把贴身后的推挤与持续伤害连起来。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['spike', 'steamjet'], note: '撞角和蒸汽喷射器开放：贴身后持续升温，蒸汽喷射还能把对手推开。' },
      },
      {
        name: '齐射', pilot: '钟表匠 老维克', prize: 300, terrain: 'hills', aim: 0.75, style: 'kite', mt: 3,
        blurb: '四足炮台装上鱼叉和蒸汽喷射器，先用山坡拉开距离，再把你拽回蒸汽锥和撞角的有效范围。',
        rows: ['........', '........', '..P.....', '..KAC...', '..OWAA..', '..Q.....'], subs: [[0, 14, 'harpoon'], [4, 10, 'flamer']],
        spec: { terrain: 'hills', reward: 'harpoon', lesson: '缠斗的距离控制：鱼叉把风筝车拉回近战距离，蒸汽喷射器和撞角在坡地上形成连续压力。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['harpoon', 'flamer'], note: '鱼叉开放，喷火器图纸获得：第三章通关开放镀镍（T4）后可购买喷火器；蒸汽喷射器最高为钢（T3）。' },
      },
      {
        name: '工厂缠斗王', pilot: '车间领班 沃德豪斯', prize: 400, terrain: 'hills', aim: 0.85, boss: true, mt: 3,
        blurb: '【缠斗 Boss】公爵的旧侧炮仍挂在层架上，车头新增蒸汽撞锤和鱼叉；它会先拉你进坡，再用活塞和喷射器连续逼退。',
        rows: ['........', '........', '....K...', '...OAZ..', '..WOAAC.', '..TTTTT.'], sides: [[3, 4]], elite: [[3, 4, 4, 'side']], subs: [[4, 14, 'harpoon'], [4, 12, 'steamjet'], [6, 14, 'piston']],
        spec: { terrain: 'hills', reward: 'piston', lesson: '缠斗 Boss：鱼叉、蒸汽喷射器和蒸汽撞锤把接近、拉回和反震连成一套连续考题。', targetStrength: [0.6, 0.7], performanceMin: 35 },
        unlock: { mods: ['piston'], note: '蒸汽撞锤开放：贴身后每隔一段时间自动活塞打击，不再只依赖冲撞速度。' },
      },
    ],
    unlock: { feat: ['upgrade'], mat: 4, grid: { cols: 6, rows: 5 },
      note: '镀镍材料开放（×1.75）。改装（炮盾 / 附加装甲）开放；侧挂层、抛射和缠斗装备已经在前两章逐步拿到。' },
  },
  {
    name: '第四章 · 北方矿区', place: '约克郡煤矿',
    blurb: '第四章先按下主题：矿区把前几章的构筑混在一起，先学会管理重炮、储压和抛射架的空间，Boss 后开放大部分剩余装备。',
    stages: [
      {
        name: '矿车', pilot: '矿工头 霍布斯', prize: 380, terrain: 'mine', aim: 0.75, style: 'rush', mt: 3,
        blurb: '重装甲履带车，车头装着蒸汽撞锤，贴上来就一下一下猛砸。别跟它顶牛，高抛炮越过装甲砸它的锅炉。',
        rows: ['........', '........', '....K...', '..WOHHY.', '..WOOAC.', '..TTTTT.'], subs: [[6, 14, 'harpoon']],
        spec: { terrain: 'mine', reward: 'pressure_tank', lesson: '综合压力一：矿坑泥地限制冲撞，重炮和蓄压罐要求同时管理动力、热量和空间。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['pressure_tank', 'cannon_heavy'], note: '蓄压罐和重炮开放：动力富余时储蒸汽，留出大块空间换取更高的穿透力。' },
      },
      {
        name: '夜枭', pilot: '猎场看守 格雷', prize: 420, terrain: 'hills', aim: 0.85, style: 'kite', mt: 3,
        blurb: '两门侧炮躲在装甲后面，四足平台稳得像块石头，一直往后退。冲上去撞它，或者先敲掉侧炮。',
        rows: ['........', '........', '...K....', '..OAM...', '..WOAC..', '..Q.U...'], sides: [[3, 3], [4, 3]], subs: [[0, 14, 'harpoon']],
        spec: { terrain: 'hills', reward: 'rocket_rack', lesson: '综合压力二：土坡和侧炮迫使你选择接近路线，抛射架用高抛齐射和散布换取中距离压制。', targetStrength: [0.65, 0.8], performanceMin: 35 },
        unlock: { mods: ['rocket_rack', 'rangefinder'], note: '抛射架和测距仪开放：高抛齐射越过正面遮挡，散布换来中距离压制，测距仪让直射火力更稳定。' },
      },
      {
        name: '铁甲圣堂', pilot: '圣殿骑士团', prize: 550, terrain: 'mine', aim: 0.88, boss: true, mt: 4,
        blurb: '【综合 Boss】重装甲堆到第五层，顶上是一门乌兹钢高抛炮，车头还有蒸汽撞锤和圣堂压力核心。赢了以后，剩余的大部分装备都会开放。',
        rows: ['........', '....KP..', '..WOHHY.', '..WOHIC.', '.WOOHAM.', '.TTTTTT.'], sides: [[3, 4], [2, 4]], elite: [[1, 5, 5]], subs: [[0, 14, 'rocket_rack'], [8, 14, 'boss_core']],
        drop: { wootz: 1 },
        spec: { terrain: 'mine', reward: 'cockpit', lesson: '综合 Boss：高抛、重甲、撞击和压力核心同时出现，要求切换前几章学过的解法。', targetStrength: [0.6, 0.7], performanceMin: 35 },
        unlock: { mods: ['cockpit', 'boss_core'], note: '联合驾驶舱和圣堂压力核心开放：四个驾驶员协同操作，核心提供动力、储压、储水和持续冷却。' },
      },
    ],
    unlock: { feat: ['bet', 'blueprints', 'friendly'], mods: ['mg2', 'radiator', 'gyroscope', 'boiler_l', 'water_l'], grid: { cols: 7, rows: 5 },
      note: '第四章 Boss 后开放大部分剩余装备：双联机枪、散热片、陀螺仪、大型锅炉和大水箱补齐火力、控制与后勤；下注和蓝图库开放。' },
  },
  {
    name: '第五章 · 水晶宫', place: '海德公园 · 水晶宫',
    blurb: '帝国蒸汽大奖赛。全英国最好的战车都在这里，卫冕冠军的女王号在决赛等你。',
    stages: [
      {
        name: '差分机', pilot: '皇家工程师 惠特克', prize: 500, terrain: 'crates', aim: 0.9, mt: 4,
        blurb: '三门机炮、一组双联机枪加一门火炮，火力网密不透风，但全是镀镍的轻家伙。重装甲顶上去，机炮就只能冒火星。',
        rows: ['........', '........', '....M...', '...KAM..', '..WOOAM.', '..B.....'], subs: [[4, 10, 'mg2']],
        spec: { terrain: 'crates', reward: null, lesson: '综合考试一：重装甲、机炮与双联机枪火力网和双足机动同时出现，检验前几章的防守与接近。', targetStrength: [0.65, 0.8], performanceMin: 35 },
      },
      {
        name: '煤灰寡妇 · 复仇', pilot: '玛莎·布莱克', prize: 600, terrain: 'yard', aim: 0.9, boss: true, mt: 4,
        blurb: '【宿敌】玛莎把她的四足换成了乌兹钢火炮，顶上加了高抛炮。这次她是认真的。',
        rows: ['........', '........', '...PK...', '..WOAC..', '..WOAAC.', '..Q.U...'], elite: [[4, 6, 5], [3, 5, 5]],
        subs: [[6, 14, 'boss_ram']],
        uniqueLoot: [{ id: 'boss_ram', mt: 5, once: true, source: 'salvage' }],
        spec: { terrain: 'yard', reward: 'boss_ram', lesson: '综合考试二：宿敌把高抛和近战放在同一辆四足车上，胜利后缴获带故事的液压撞头。', targetStrength: [0.6, 0.7], performanceMin: 35 },
        unlock: { mods: ['boss_ram'], note: '缴获寡妇液压撞头：把冲撞和短周期活塞打击合成一件高风险近战件。' },
      },
      {
        name: '维多利亚女王号', pilot: '卫冕冠军 哈灵顿爵士', prize: 1000, aim: 0.98, boss: true, mt: 3,
        blurb: '六层高的移动堡垒：多座锅炉、一门侧炮、顶层高抛炮和巨炮，驾驶舱是乌兹钢。打赢它，你就是帝国冠军。',
        rows: ['.....K..', '....OHP.', '..WOHHM.', '.WWOHKC.', 'WWOOHAM.', 'TTTTTTTU'], sides: [[3, 4]],
        subs: [[0, 0, 'cannon_giant'], [0, 14, 'pressure_tank']],
        elite: [[0, 5, 6], [1, 6, 5], [3, 6, 5]], drop: { aether: 1 },
        uniqueLoot: [{ id: 'cannon_giant', mt: 6, once: true, source: 'salvage' }],
        spec: { terrain: 'flat', reward: 'cannon_giant', lesson: '终局考试：女王号综合使用侧炮、高抛、巨炮和厚甲，唯一的目标是稳定拆解移动堡垒。', targetStrength: [0.6, 0.7], performanceMin: 35 },
      },
    ],
    unlock: { feat: ['season'], mods: ['cannon_giant'], mat: 6, grid: { cols: 8, rows: 6 }, ingots: { wootz: 1 },
      note: '你是帝国冠军了！改装台扩到 8×6。终局「伦敦蒸汽大奖赛」开放：每个赛季对手更强，夺冠奖励以太结晶。' },
  },
];

// 民间订单：满足条件即可授权图纸拿钱，载具保留
SA.ORDERS = [
  {
    id: 'farmer', who: '农场主 哈格里夫斯', reward: 180, rep: 0,
    text: '泥地里犁田要四条腿，还得带足水，免得半路烧干。',
    req: [['四足底盘', s => s.byId.quad || 0, 2], ['水箱', s => s.byId.water || 0, 2]],
  },
  {
    id: 'post', who: '皇家邮政局', reward: 150, rep: 0,
    text: '送信用的双足机，要轻：额定总功率需求不超过 60 kW。',
    req: [['双足底盘', s => s.byId.biped || 0, 2], ['额定需求 ≤ 60 kW', s => (s.demand <= 60 ? 1 : 0), 1]],
  },
  {
    id: 'mill', who: '纺织厂主 布伦特伍德', reward: 260, rep: 1,
    text: '工厂需要一台强劲的蒸汽原动机，动力供给要足。',
    req: [['锅炉轴功率 (kW)', s => s.supply, 180]],
  },
  {
    id: 'fire', who: '伦敦消防队', reward: 220, rep: 1,
    text: '救火车要扛得住热：3 只水箱，全力运转 90 秒不过热。',
    req: [['水箱', s => s.byId.water || 0, 3], ['烧干时间 ≥ 90 秒', s => (s.overheat >= 90 ? 1 : 0), 1]],
  },
  {
    id: 'mine', who: '北方矿业公司', reward: 320, rep: 2, ingots: { wootz: 1 },
    text: '矿道常常塌方，要结实的履带车。',
    req: [['履带底盘', s => s.byId.track || 0, 4], ['重装甲', s => s.byId.armor_heavy || 0, 2]],
  },
  {
    id: 'circus', who: '马戏团团长 巴纳比', reward: 240, rep: 2, ingots: { wootz: 1 },
    text: '要一台看着就吓人的大家伙：叠满六层！',
    req: [['载具高度', s => s.height, 6]],
  },
];

// 内置分享码示例（不写本地或服务器云端存储）
SA.CLOUD_PRESETS = [
  { author: '齿轮先生', name: '咆哮的茶壶', rows: ['........', '........', '...K....', '..OAM...', '..WOAC..', '..Q.U...'], sides: [[3, 3]] },
  { author: 'Ada_Loveplate', name: '差分机', rows: ['........', '........', '....M...', '...KAM..', '..WOOAM.', '..B.....'], sides: [] },
  { author: '伦敦雾', name: '夜行者', rows: ['........', '........', '..OK....', '..WAA...', '..OOHH..', '..TTTT..'], sides: [[3, 3], [3, 4], [4, 4], [4, 5]] },
];

// 官方蓝图：基础构型，不能删除
SA.OFFICIAL_BLUEPRINTS = [
  { name: '履带 · 基础炮车', desc: '起步用的稳妥构型：一门直射火炮，装甲护住锅炉。', rows: ['........', '........', '........', '...KC...', '...OWA..', '...TTT..'] },
  { name: '履带 · 铲斗推土机', desc: '宽履带加车头铲斗，机炮压制，靠冲撞把对手推出去。', rows: ['........', '........', '........', '...KM...', '..WOAA..', '..TTTTU.'] },
  { name: '四足 · 稳定炮台', desc: '四足平台散布小，直射炮平推，顶上高抛炮砸顶。', rows: ['........', '........', '...P....', '..WKC...', '..OOA...', '..Q.....'] },
  { name: '双足 · 轻骑兵', desc: '跑得快、难命中，装甲前焊着撞角，适合贴脸冲锋。', rows: ['........', '........', '........', '...KM...', '...OAX..', '...B....'] },
];

// 街头赛：不算锦标赛，对手是随手拼出来的小角色；每档有评分上限
SA.STREET_TIERS = [
  { name: '后巷赛', cap: 200 },
  { name: '集市赛', cap: 300 },
  { name: '码头赛', cap: 450 },
];
SA.STREET_PILOTS = [
  ['报童 小杰克', '号外号外'], ['扫烟囱的汤米', '烟囱刷'], ['卖花女 莉莉', '紫罗兰'], ['码头工 大块头比尔', '缆桩'],
  ['钟表匠学徒 奥利', '发条'], ['面包师 胖墩', '烤炉'], ['邮差 老乔', '急件'], ['擦鞋匠 小山姆', '鞋油罐'],
  ['磨刀匠 老维克', '砂轮'], ['送奶工 玛吉', '奶桶'], ['车夫 霍布斯', '老马'], ['修伞匠 皮普', '黑伞'],
];

// 游戏入口由 Opus 维护，不能要求它为了数据文件改动页面结构。解析主页面时同步插入
// 手工关卡数据脚本；Node 工具和独立工具页会显式加载同一文件，因此不会依赖 document。
if (typeof document !== 'undefined' && document.readyState === 'loading' && !window.SA_STAGE_CARS_SCRIPT) {
  window.SA_STAGE_CARS_SCRIPT = true;
  const source = document.currentScript && document.currentScript.src;
  const stageCars = source ? new URL('stage-cars.js', source).href : 'js/stage-cars.js';
  document.write('<script src="' + stageCars + '"></' + 'script>');
}
