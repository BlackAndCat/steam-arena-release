// 项目锁定调色板：中性材质占大面积，语义色一色一义（见 docs/art-direction.md §3）
window.SA = window.SA || {};

SA.PAL = {
  // 中性：冷铁（装甲/结构/外壳），0 最暗 → 4 最亮
  iron: ['#1b2130', '#2e3647', '#4a5468', '#6f7a8e', '#a3adbd'],
  // 中性：暗铁（底盘、腿、履带），永远最暗
  dark: ['#0b0e15', '#161a24', '#232937', '#343c4e'],
  // 中性：皮革/木
  leather: ['#3b2418', '#6b4128', '#9a6a3f'],
  // 黄铜：维多利亚装饰材质（驾驶舱框、管线、铆钉），武器的 UI 色
  brass: ['#4e3510', '#9a6b1d', '#d9a441', '#f5d77a'],
  // 语义：能源/热量 = 炉火（唯一允许发光）
  fire: ['#5c1a0e', '#b8391b', '#ef7a21', '#ffd166'],
  // 语义：冷却/水 = 青
  water: ['#0f3b44', '#1f7a86', '#46c2c9', '#a8f0ee'],
  // 语义：动力/承载 = 压力表绿
  gauge: ['#1f4a2a', '#3f8f48', '#6fcf6a', '#c2f5a0'],
  // 语义：控制 = 舷窗玻璃
  glass: ['#1d3a4c', '#4f8fa8', '#a9dfee', '#effbff'],
  // 锈钢：撞击武器（铲斗/撞角/撞锤）
  rust: ['#34170f', '#6e3322', '#a4553a', '#d08a60'],
  // 蒸汽/烟（中性特效）
  steam: ['#6d6a64', '#a8a39a', '#e4e0d6'],
  // 背景：低饱和棕褐，压在中低明度
  bg: ['#1a1614', '#231e1b', '#2e2723', '#3b322c', '#4a3f37', '#5c4f45', '#6f6154'],
  // UI 专用：洋红 = 侧挂层锁定；场景美术禁止使用
  magenta: '#ff2bd6',
  white: '#f4f7ee',
  black: '#07080c',
};

// 界面专用色阶（界面重建 v3，2026-09-30 用户通过；只用在界面件上，场景和载具精灵不用）：
// 纸 / 牛皮纸 = [描边, 暗, 旧黄, 固有, 亮]，黑板 = [暗, 固有, 亮]，蓝图纸 = [描边, 纸, 细格, 粗格, 线]
SA.PAL.paper = ['#4a3a28', '#b59c6c', '#cdb887', '#decda3', '#efe4c6'];
SA.PAL.kraft = ['#3b2418', '#8e6238', '#a97f4c', '#c09560', '#d8b27c'];
SA.PAL.board = ['#161f1b', '#1d2823', '#25322c'];
SA.PAL.blueprint = ['#0c2340', '#18406e', '#2d5c92', '#4a7cb4', '#dcecfb'];
SA.PAL.ink = '#2a1a05';   // 纸上的墨字、黄铜上的刻字

// 语义分类：UI 卡片/蓝图用的类别色；场景里模块靠自身造型辨认
SA.CAT = {
  firepower: { name: '火力', plate: SA.PAL.brass[2], ink: SA.PAL.brass[0], ui: SA.PAL.brass[2] },
  energy:    { name: '能源', plate: SA.PAL.fire[2],  ink: SA.PAL.fire[0],  ui: SA.PAL.fire[2] },
  cooling:   { name: '冷却', plate: SA.PAL.water[2], ink: SA.PAL.water[0], ui: SA.PAL.water[2] },
  structure: { name: '结构', plate: SA.PAL.iron[4],  ink: SA.PAL.iron[0],  ui: SA.PAL.iron[4] },
  control:   { name: '控制', plate: SA.PAL.glass[2], ink: SA.PAL.glass[0], ui: SA.PAL.glass[2] },
  mobility:  { name: '底盘', plate: SA.PAL.gauge[2], ink: SA.PAL.dark[0],  ui: SA.PAL.gauge[2] },
  ram:       { name: '撞击', plate: SA.PAL.rust[2],  ink: SA.PAL.rust[0],  ui: SA.PAL.rust[2] },
};

// 材料（T1～T6，2026-09-27 用户定稿，见 tools/material-lab.html）：金属按阶换成这里的颜色，不混色。
// iron / dark / rust：冷铁 5 阶、暗铁 4 阶、锈钢 4 阶的替换色；paint：瓷漆（只刷模块大面的第 2、3 阶，亮边和斜面仍是金属）；
// line：离模块外沿 3px 的描线色；trim：黄铜饰件换成的颜色；tex：只改明度的纹理；spec：反光；pin：四角铆钉换成的紧固件。
// 原画（冷蓝铁 SA.PAL.iron / dark）是所有材料的「源色」：画模块时照常用它，六种材料都从它换过来。
SA.PAL.mat = {
  // 黄铜：AAP-64（Adigun A. Polack）调色板的旧黄铜色阶，饱和度提高到 1.45 倍；色相随明度从红褐走到金黄
  brass: {
    iron: ['#453831', '#5f4e3f', '#81674d', '#ae8854', '#d4b37e'], dark: ['#1f1916', '#302722', '#453831', '#524338'],
    rust: ['#392119', '#623527', '#9a5a40', '#c6895c'],
    paint: null, line: null, trim: null,
    tex: null, spec: 'soft', pin: 'rivet',
  },
  // 熟铁：暗、暖灰、哑光，锻打麻点
  iron: {
    iron: ['#201f1d', '#32312f', '#4d4b47', '#67655f', '#84817b'], dark: ['#0e0e0d', '#181716', '#222120', '#2d2c2a'],
    rust: ['#2e1913', '#643a2d', '#925a45', '#b98768'],
    paint: null, line: null, trim: null,
    tex: 'pits', spec: 'matte', pin: 'rivet',
  },
  // 钢：淡青钢 + 花纹板（8px 一格），六角螺栓
  steel: {
    iron: ['#212627', '#384042', '#596669', '#809093', '#bbc2c3'], dark: ['#0f1111', '#191c1d', '#242829', '#313839'],
    rust: ['#2e1c16', '#5e372c', '#8e5a48', '#b88c6f'],
    paint: null, line: null, trim: null,
    tex: 'checker', spec: 'crisp', pin: 'bolt',
  },
  // 镀镍：象牙白瓷漆 + 淡金饰件（描线已关）
  nickel: {
    iron: ['#252422', '#403e3b', '#65625d', '#8e8b85', '#c1c0bd'], dark: ['#11100f', '#1c1b1a', '#282725', '#373633'],
    rust: ['#301b15', '#60362a', '#915945', '#bc8a6b'],
    paint: ['#3a3423', '#63593c', '#9c8d60', '#c5bca1', '#efede6'], line: null, trim: ['#4a4128', '#8c7d4e', '#c9b882', '#eee3bd'],   // 描线（原 #d9a441 金）按直射火炮定稿关掉：线条太多会显得「高级」
    tex: null, spec: 'crisp', pin: 'gold',
  },
  // 乌兹钢：暗钢边 + 布伦瑞克绿瓷漆
  wootz: {
    iron: ['#161718', '#252628', '#3d3f42', '#5d6065', '#898c90'], dark: ['#0a0a0b', '#111112', '#18191a', '#202123'],
    rust: ['#301c17', '#5f372c', '#8f5847', '#bb8b6e'],
    paint: ['#0a120e', '#111f18', '#1c3328', '#2a4e3c', '#3d7157'], line: null, trim: null,
    tex: null, spec: 'crisp', pin: 'gold',
  },
  // 以太合金：海军蓝瓷漆（描线已关）
  aether: {
    iron: ['#222325', '#3b3c40', '#5d6065', '#85888e', '#bdbfc1'], dark: ['#0f1011', '#1a1a1c', '#252628', '#333537'],
    rust: ['#2f1b16', '#5f362b', '#8f5847', '#ba896e'],
    paint: ['#0f131e', '#192133', '#283451', '#384a72', '#4e669f'], line: null, trim: null,   // 描线（原 #e8dcb8 象牙白）同上关掉
    tex: null, spec: 'crisp', pin: 'gold',
  },
};
