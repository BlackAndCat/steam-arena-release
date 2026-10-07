// 视觉构建标记：保留远端最新的四足步态与视觉基线，不由后台拆分覆盖。
window.SA = window.SA || {};
SA.BUILD_VIS = '2026-09-30 material-v2 + cannon-tiers + gun-family (cannon_m, cannon_s, side_cannon, cannon_heavy, mortar, cannon_giant v6) + sym gears (metal shading, mortar link) + stage-editor-entry + armor 1x2 + boiler_s A3 + tank W1 copper hoops (in game) + two overview pages + mg_s sponson / mg_heavy steam gatling (in game) + tank hoops v2 + mg steam centrifugal gun / mg2 aeolipile (in game) + module-placeholders + weapon-angles + continuous-placement + right-click-cancel + spending-float + story (title, opening, tutorial arrows, battle-start emblem, stage hints) + coal-ball people in game (cockpit crews, opening story, dialogue portrait) + rounder eyes + shock stare (pupils dart uncle<->car) + six-tier track in game (Boydell pad wheels in brass, wrought-iron slat chain, Holt links, Mark IV perforated frame, truss bogies, full skirt) + six-tier biped in game with per-tier hips (differential / steam cylinders / governor / ball-socket / gyro / gimbal) + Mk.II straight ram + six-tier quadruped in game (Mk.II / truss / leaf-spring / ivy crank / steam hammer / gothic church; 9 unique variants registered via cell.look; longer stride + gait bob) + quad exploration archived + periscope in game (yoke telescope, colour-only tiers) + mortar_s turret / autoloader chain hoist / pressure_chamber bellows (1x2-ready) / condenser coil (fewer beads + continuous trickle) in game; cockpit family in game (square-window cab / two-deck bridge / locomotive cab with stairs, crew in rows + animated controls, round wall hatches) + boiler_l v4 in game (giant-cannon plate wall, huge arched fire mouth, backlit conveyor / drive chains / pull ring, coal hill, brass-edged stoker platform, stoker drawn live with a fixed-length shovel dig-lift-toss swing) / water_l v4 in game (big porthole, muted ribs) + special weapons in game (harpoon grapnel + three-wrap cable drum paying out on tether, steamjet fan valve, finned flamer with steam-blended flame, rocket rack six tiers: spear-thrower / throwing wheel / 45-degree leaf-spring crossbow / pneumatic tubes / rocket-assisted bombs / tube bundle, lobbed; fx drawn live after the material pass) + pressure tank (sphere + gauge column) / rangefinder (sextant) / gyroscope (gimbal rings) / radiator (finned tubes, side) in game + boss uniques in game (temple grail furnace, widow triple forge-hammer ram, duke rotating prism drum) + surrender white flag (pole + flag rise on the roof anchor, sad crew, click / Space to skip) + story editor (scene browser, line editor with Ctrl+S, before / after battle insert prompts in dev mode) + dev reset-to-starter button + live tether endpoints + lobbed salvo hints + water tank vertical straps by tier / plough bucket / naval ram spike / twin-cylinder charged steam ram (latch release, steam blast, shudder) in game + material texture anchored to bobbing quad / biped bodies (checker / pits / brass dither ride with the shell instead of swimming) + unique biped looks + single workshop loop + mech kit v4 on current page (09-25 sub-cell kit inherited as-is + pauldron / backpack boiler / back water jars / steam jump pack / wrist-gun arm, four new machines) + three battle scenes (forge backyard at dusk / wild moor with windmill and viaduct train / qualifier grandstands with fairground, airship, crowd frames) with sky-far-mid-floor-near parallax + smith Old Tom joins the story as the relative partner (duo portraits, opening roll-in, tutorial retorts, prologue lines, stage 3 pre-battle) + UI rebuild lab v2 forge x gazette (iron base / brass hands / paper words; 3 button, panel and meter variants; living forge yard with chatting cast, paper-stack workbench, chalkboard + poster + dossier + betting slip arena), v1 four proposals archived + prebattle console stage workshop entry + UI rebuild v3 pixel kit (9-slice pixel skins for iron / brass / paper / kraft / board, 5x7 pixel digits, gears in moving parts: spinning button gear, rack meters, drum counter, layer knob, throttle-quadrant lever; decluttered forge yard, workbench and arena), v2 archived + UI v3 pen marks on paper (hand-drawn loop, wavy underline, arrow note, handwriting replace red blocks and buttons on poster / dossier / betting slip), long-grain wood without specks, detailed two-plank signposts with iron strap, nails and pasted paper labels + UI v3 in game phase 1: pixel UI kit js/ui-px.js (px- classes, paper / kraft / board / blueprint ramps) + home page js/home.js (forge yard, living cast with banter and save-aware tips, newspaper next match, unlocked-only signposts, car to garage, settings gear) + sidebar yard plate + UI v3 applied everywhere: global pixel reskin of buttons / panels / dialogs / toast, pixel top bar replaces sidebar, garage (clipboard spec sheet with rack meters and pick-up preview, blueprint canvas, catalog, kraft work order, lever), arena rewritten (chalkboard fixtures with chalk terrain, fight poster, dossier, betting slip with pen marks, lever), battle HUD tubes + dedicated forge-yard home scene js/home-scene.js (smithy with open forge, sign, window, barrel, coal, dusk city, scrap shed, cobbles, animated fire / smoke) + hand-drawn antique blueprint (grid only around the car, unfinished strokes fading out, ruler, india rubber, dip pen) + catalog paper index tabs';
SA.BUILD_VIS += '+yard-chat-player'; // 院子沿用原气泡与动作，按可编辑聊天池播放。
SA.BUILD_VIS += '+module-property-workbench-entry'; // 开发者面板和关卡车工作台入口。
SA.BUILD_VIS += '+home-car-hero'; // 院子：车挪到中间前景当主角（暗描边 + 炉光轮廓 + 暖光晕、影子、薄暮压背景、工作灯光锥、铭牌、悬停提示）
SA.BUILD_VIS += '+home-weather'; // 院子重画：晴 / 雨 / 夜 / 雾四种天气（风向标切换）、平涂少杂点、勒脚接缝、石拱门 + 石板路、所有东西按脚落地 + 接触影子；路标只留出战 / 车间 / 银行
SA.BUILD_VIS += '+prologue-yard'; // 序章战斗的铁匠铺后院改用主页面院子的画（同一座铁匠铺、院墙、院门、天气）
SA.BUILD_VIS += '+workshop-pan-zoom'; // 车间蓝图横向拖动与滚轮缩放。
SA.BUILD_VIS += '+cooling-water-labels'; // 水量提示只描述冷却耗水。
SA.BUILD_VIS += '+blueprint-zoom-crisp'; // 蓝图缩放只用 1/2/3 整数倍、最近邻不糊、最小 1 倍；纸比画布宽、平移夹在纸里；打开时车居中；尺子斜放
SA.BUILD_VIS += '+continuous-spread-fan'; // 瞄准散布扇区：弹道逐段精确求交 + 擦边处自适应补线 + 过准星淡出，对方移动时扇区连续变化不跳
SA.BUILD_VIS += '+weather-indoors'; // 雨天 / 夜里人回屋：老汤姆在门里逆光打铁，一人在门口雨棚下（夜里小提米提马灯），一人在亮窗后只剩剪影；主页和序章背景同一套
SA.BUILD_VIS += '+yard-board'; // 出战并进院子：院子压暗、拉下卷帘黑板（海报 / 便签 / 档案 / 下注单钉在上面）；大对决只给 Boss、毛笔手写字；纸边改成连续实边；去掉院子公报和车下铭牌；车间只显示有库存的大类、蓝图库第二章起
SA.BUILD_VIS += '+damage-numbers-v2'; // 伤害数字：5×7 字 + 整圈描边、屏幕空间整数像素；按单发伤害分四档（大小 / 颜色 / 加粗 / 迸射线 / 停留）；同模块连射合成「9×4」；数字之间自动避让
SA.BUILD_VIS += '+opening-story-editor-entry'; // 标题页与开场演出的剧情编排入口。
SA.BUILD_VIS += '+garage-nav-tips'; // 车间导航：顶栏去掉院子/车间/出战，改装台右下「← 回院子 / 出战 →」；尺子 2:1 重画；清单大图 + 名字 + 材质，属性进悬浮纸条；性能单去掉耐久、加间距和悬浮说明
SA.BUILD_VIS += '+garage-exit-dock'; // 车间出口挪进改装台下面的工单右端（不再越界）；选中模块不再展开弹开率对照表，只留悬浮纸条
SA.BUILD_VIS += '+two-way-lever'; // 出战黑板：拉杆立在正中，往左扳到底回院子、往右推到底出战，两端小字（快到哪头哪头亮），没扳到底弹回；去掉左上角「回院子」按钮
SA.BUILD_VIS += '+arena-vehicle-name'; // 出战海报与档案的车名读取车辆铭牌，关卡标题独立显示。
SA.BUILD_VIS += '+battle-hud-a-cab'; // 战斗界面 A 驾驶台：战场不挂框（对方车顶不再有状态条和警报牌），上方两块铁名牌 + 计时鼓，下方铁皮仪表台（锅炉压力表 / 水位管 / 十片装甲 / 五盏指示灯 / 纸条 / 10 格武器键 / 泄压 / 撤退），打不了时准星变红，升白旗压暗只留对方车 + 电报
SA.BUILD_VIS += '+first-stage-own-car-guide'; // 车间三步提示与首关己方部件箭头。
SA.BUILD_VIS += '+stage-workbench-larger-canvas'; // 关卡车工具页扩大拼装画布和操作区域。
SA.BUILD_VIS += '+tutorial-player-camera'; // 首关教程讲解镜头跟随玩家车，使四件部件的指示箭头可见。

SA.BUILD_VIS += '+no-rank-chevrons'; // 模块上的改装军衔杠取消（车间悬停 / 战斗瞄准都不再画）；车间底部纸条只写 名字 · 材质 · 耐久
SA.BUILD_VIS += '+stage-victory-free-repair'; // 战役胜利后按关卡设置呈现免费修理。
SA.BUILD_VIS += '+scene-atmosphere'; // 战斗场景氛围层：景深雾 / 雾带 / 灯光晕和光锥 / 车底软影 / 贴地薄雾 / 调色 / 泛光 / 超近景虚化剪影（挡车自动变淡）/ 飘浮物 / 暗角 / 颗粒，帧率低自动降档，设置里可关
SA.BUILD_VIS += '+yard-click-dialog'; // 院子人物点击显示可关闭对话框，台词读取页面管理覆盖。
SA.BUILD_VIS += '+back-alley-scene'; // 第一章后巷场景（熏黑的民房、酒馆、当铺三铜球、窗里和人行道上围观的煤球、庄家赔率黑板和放贷的）+ 场地两头的路障（后巷 / 铁匠铺 / 野地 / 竞技场各一种）
SA.BUILD_VIS += '+opening-shock-gaze-wall-car'; // 开场震惊视线缓慢往返，战车驾驶舱藏在后墙下。
SA.BUILD_VIS += '+console'; // 后台 tools/console.html：全部工具的统一入口（关卡工作区、剧情、院子闲聊、样机目录、游戏调试、Ctrl+K 搜索），开发者面板第一项。
SA.BUILD_VIS += '+console-warm-garage'; // 后台改成暖色木纹 + 黄铜 + 纸面；关卡车拼装搬进「关卡」工作区（tools/console-garage.html 嵌游戏车间），文字与奖励、强度也在同一页编辑。
SA.BUILD_VIS += '+settings-player-restart'; // 设置菜单两次确认后重开游戏。
SA.BUILD_VIS += '+wreck-grind-shudder'; // 撞击件顶进已毁底盘时整车高频抖动、火花碎铁（规则见 battle.js grindWreck）。
SA.BUILD_VIS += '+shift-whole-vehicle-drag'; // 车间按住 Shift 拖动已装模块时预览并横移整车。
SA.BUILD_VIS += '+story-narration-expressions'; // 剧情旁白改成铁灰框 + 冷色字、不再借用亲戚头像；台词可选表情（expr）；后台剧情页加表情窗（说话动作 + 全部表情）和完整重放（tools/story-player.html，游戏自己的对话框）
SA.BUILD_VIS += '+mobile-battle-tutorial'; // 触屏设备的战斗手机布局（横屏左右两栏、竖屏上下排）；第一关教程讲完部件后加旁白操作教学（开车 / 瞄准 / 开火 / 换武器，电脑和手机各一套，画面演示 + 真按钮发光）
SA.BUILD_VIS += '+twin-stick-touch'; // 手机战斗操作改成手游式两个半透明圆圈：左圈左右推开车，右圈跟着手指瞄准、按住开火（画面上指哪打哪，画面外像触控板）；战斗界面禁止浏览器缩放
SA.BUILD_VIS += '+page-guides'; // 页面教程（js/tutorial.js，旁白 + 聚光框）：第一次进出战黑板讲赛程 / 海报 / 拉杆并让玩家推一次拉杆；黑板左下加「车间」木路牌直接回车间；第一场赢下后直接带去车间，教装水罐（等玩家装上）再逐项讲性能单；商店开张后指一下「商店」开关
SA.BUILD_VIS += '+campaign-map'; // 后台「战役地图」：按设计稿把主线 34 关 + 三条支线 13 关画成一张图，悬浮看关名、车的剪影和奖励，点了进工作台或剧情。
SA.BUILD_VIS += '+map-card-preview'; // 战役地图悬浮卡片放大一倍（窄了上下叠），主线车用正常画面；文字与奖励 / 强度 / 院子闲聊页签现场预览，底部按钮传送到工作台；出战海报的唯一腿型奖励按变体起名。
SA.BUILD_VIS += '+track-center-wheels'; // 履带负重轮补齐：单节熟铁托轮加大提亮，钢及以上单节补中间一只轮；镀镍两节接缝补轮，乌兹钢 / 以太前后对称。
SA.BUILD_VIS += '+dash-lamps-two-level'; // 仪表台指示灯分两级：常亮 = 留意（动力不足、水偏少、无水箱、偏热、底盘 / 武器受损），闪 = 危险；悬停看原因。
SA.BUILD_VIS += '+wrought-track-rollers'; // 熟铁履带托轮加大提亮、吊杆伸到轮心，战斗里缩小看也认得出（多节履带同样）。
SA.BUILD_VIS += '+wrought-track-prototype'; // 熟铁（T2）履带改回定稿样机画法：整条按体育场形路径摆木板条，吊杆、托轮按整条均分，每格裁出自己那段。
SA.BUILD_VIS += '+track-backing-plate'; // 履带后面补上定稿样机的 y+6～y+36 车体底板（熟铁另加链带里侧阴影），中间不再透出背景。
SA.BUILD_VIS += '+arena-stages-wip'; // 出战黑板在没做完的章节末尾写「还有 N 关 · 制作中」；后台战役地图按计划关数直接按编号对齐。
SA.BUILD_VIS += '+wrought-track-road-wheels'; // 熟铁（T2）履带中间补上真正的负重轮：驱动轮轴到诱导轮轴一根下梁，9×9 铸铁负重轮挂在下梁下压住链带，吊杆吊住下梁；板条恢复熟铁色（09-29 用户定）。
SA.BUILD_VIS += '+group-ready-reload-hud'; // 任一同组武器满装即隐藏沙漏并点亮装填条。
SA.BUILD_VIS += '+campaign-module-preview'; // 战役地图下方展示全模块，并随节点预览累计解锁。
SA.BUILD_VIS += '+campaign-module-status-glow'; // 已解锁模块浅绿发光，未解锁普通剪影整体调淡。
SA.BUILD_VIS += '+pip-yard-story'; // 双人舱上的皮普离开院子，首次装车在院子播放专门剧情。
SA.BUILD_VIS += '+material-upgrade-mode'; // 升级材质改成画布上方单独的按钮（熟铁解锁后出现）：按下后点模块逐件升一级，悬停金色闪烁；Shift + 点击 = 全部升级（只升材料最低的那一批，弹窗确认，按住 Shift 预览这一批）。
SA.BUILD_VIS += '+stage-create-defaults'; // 新关草稿按设计稿填好默认参数、车抄前一关；工作台每章「＋ 新建 / 补上」行；地图空白车图做成新建按钮；拼装台打开与保存排队，防止存错关。
SA.BUILD_VIS += '+suburb-scene'; // 第二章伦敦郊区场景：远处伦敦天际线（水晶宫 / 圣保罗 / 威斯敏斯特钟楼 / 塔桥）、对岸树林、泰晤士河上的帆驳 / 蒸汽艇 / 天鹅、垂柳和栈桥、少量围观者、草地 + 碎石路；两头收费栅门路障；试驾场可选两头路障
SA.BUILD_VIS += '+mortar-fan-fill'; // 高抛散布预览按飞行时间拼接弹道，避免交叉条带的绕数相消漏填。
SA.BUILD_VIS += '+side-ambush-cutscene'; // 支线拦路过场：第一次开打第二章第 1 关时，伦敦郊区路上你的车开进来、玛莎的车从右边冲出来急刹横在路上（扬尘、震屏、头上「！」），演完台词接开战动画；出战黑板加「支线」页签；对话框任意两人同框（玛莎在右）。
SA.BUILD_VIS += '+evolve-arena-redo'; // 进化擂台按后台外观重做：第一屏每关一张选关卡（大车图、强度 / 同档胜率 / 表现、打上一关车的胜率、硬条件、筛选点阵、重跑这关），车图框按窗口高度自适应；往下是逐关筛选、散点、毒瘤 / 奇特车、报告信息

// 关卡车性能单显示进化范围校验，并保留完整数值与警告。
SA.BUILD_VIS += '+stage-workbench-diagnostics';
SA.BUILD_VIS += '+stage-car-one-save'; // 关卡车只剩一种保存（关卡工作台「保存」，改过车自动勾「手动选择」）；进化擂台卡片先显示手动选择的关卡车和它的成绩、可勾掉；点卡片在那一排下面展开全部候选，「换上这辆」交给关卡工作台当草稿
SA.BUILD_VIS += '+stage-sheet-sidebar-seed-export'; // 用户授权本次工作台性能单左侧竖栏、完整种子复制与导出入口。
SA.BUILD_VIS += '+evolve-route-diagnostic-results'; // 进化进度区完整列出未达标关及候选，明细标注后续模拟所用的临时参考。
SA.BUILD_VIS += '+biped-pose-params'; // legs.js：双足下蹲 / 空中收腿 / 快跑腾空 / 腿部件挂点参数（默认画面逐像素不变），当前开发页双足强化 v5。
SA.BUILD_VIS += '+biped-gait-v2'; // 双足走路 / 跑步重做：按步频算步幅，走 = 倒立摆、跑 = 弹簧 + 腾空，关键姿势插值，车速 76～100 走跑过渡，跑起来躯干前倾。
SA.BUILD_VIS += '+biped-mech-looks'; // 机甲套件 v4 进游戏：双足躯干顶角的甲片 = 肩甲，最后一列的竖式锅炉 / 小水罐 / 加压舱 = 背负锅炉 / 背水罐 / 喷汽背包（只换画面）；bipedArt 加 hipPart 挂点。
SA.BUILD_VIS += '+mech-helm'; // 新模块机甲头盔 mech_helm（2×1，头盔居中一格 + 两侧防御饰件；5 种造型，游戏先用 A）；跳跃件 / 提速件画法定稿进 legs.js；头盔和肩甲不垫车体框架。
SA.BUILD_VIS += '+biped-in-game'; // 头盔定稿 D；骑士手臂 6 种专用画法（近战挥动、武器绕肘瞄准）；腿部件画在腿骨 / 胯上；下蹲 / 跳跃接线（按键、触屏、腿姿、地影、喷汽、扬尘）；走跑区间 92～118。
SA.BUILD_VIS += '+knight-arm-below-helm'; // 当前开发 v9 样车改成头盔第 4 行、手臂挂在头盔下面（规则见 vehicle.js helmBottom）。
SA.BUILD_VIS += '+knight-refit-options'; // 用户授权本次在现有改装菜单中接入骑士、承重改造及数值说明。
SA.BUILD_VIS += '+landscape-shell'; // 横屏模式（js/orient.js）：手机浏览器转不过来时，外壳页铺 iframe 把游戏转 90° 显示；标题页「横屏游玩」+ 设置里开关 / 翻转方向
SA.BUILD_VIS += '+route-o1'; // 出征（卷轴路线）O1：标题页入口 + 出战黑板「出征」页签 + 路线战斗画面（空敌车、长地形分块、路障 / 遗迹门 / 拾取物 / 残骸 / 布景、路程条、驾驶台煤表 / 货位 / 慢行停车灯、拉汽笛返航、遭遇电报）+ 清点黑板；画法在 js/route-art.js
SA.BUILD_VIS += '+waste-scene'; // 出征废土场景 js/scenes.js 'waste'（塌了的厂区天际线、断高架桥、煤气罐框架、风车骨架、两倍宽废墟、煤渣路；A 锈黄昏 / B 煤烟霾 / C 冷灰晨，样机挑色调；近景可跟起伏地面）。游戏里出征仍借野地
SA.BUILD_VIS += '+mobile-landscape-workshop-sidebar'; // 横屏车间大蓝图与单一操作侧栏，性能/零件切换保留完整功能，方向切换恢复原布局。
