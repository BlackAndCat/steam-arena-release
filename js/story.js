// 剧情：开始界面、开场、像素风对话框（galgame 式）、第一关战斗教程的台词、过关后的提示。
// 画面都是程序化像素画；台词集中在 SA.STORY，改文案只改这里。
// 看过哪些剧情单独记在 localStorage（steam_arena_story_v1），不动存档格式；SA.reset() 时一起清掉。
window.SA = window.SA || {};

SA.STORY = {
  // coal = js/coal.js 阵容里的名字（头像和小人按它画）。铁匠总是和远房亲戚成双入对：只要有他的台词，对话框就同时摆出两个人的头像
  cast: { uncle: { name: '远房亲戚', coal: '远房亲戚' }, smith: { name: '铁匠 老汤姆', coal: '铁匠 老汤姆' } },
  // 开场：scene 是开场画面的分镜（见 drawScene）
  opening: [
    { text: '你从睡梦中醒来，身无分文。', scene: 'sleep' },
    { text: '你的窝棚突然被掀开了——', scene: 'roof' },
    { text: '许久未见的远房亲戚骨碌碌滚了进来，后面还跟着一个独眼铁匠。', scene: 'roll' },
    { who: 'uncle', text: '我老了，现在继承我的战车吧！', scene: 'car' },
    { who: 'smith', text: '……车是我拿铁匠铺的边角料拼的。锅炉已经给你烧热了。' },
    { who: 'uncle', text: '这是老汤姆，我的老战友。他说话少，焊得好。' },
  ],
  // 第一关开战前：先旁白，再用箭头逐个指着玩家初始车上的四件部件讲解。
  tutorial: {
    // intro / lines 里的字符串默认是远房亲戚说的；{ who: 'smith' } 是老汤姆在旁边补的一句
    intro: ['我找来了小提米和你对练，作为大英帝国的军人，我相信实战是最好的老师！',
      { who: 'smith', text: '车是我拼的，小提米是我徒弟。两个都别给我打坏了。' }],
    parts: [
      { part: 'cockpit', label: '驾驶舱', lines: ['这是你的驾驶舱。它被毁，战斗就输了。'] },
      { part: 'track', label: '履带', lines: ['这是你的履带。用 A/D 驾车移动，断了履带就走不动了。'] },
      { part: 'boiler', label: '锅炉', lines: ['这是你的锅炉，给车提供动力。', { who: 'smith', text: '我已经烧热了。记得留意给水和机组温度。' }] },
      { part: 'mg', label: '机枪', lines: ['这是你的机枪。移动鼠标瞄准，按住左键稳住准星；蓄满会自动开火，松手也能开火。', { who: 'smith', text: '训练弹是我拿铆钉磨圆的。' }] },
    ],
  },
  // 过关提示：stage 按「章,场」写专属台词；feat 按新开放的功能写（战役顺序调整后也跟着功能走）
  stage: {
    '0,0': {
      win: ['好！小提米已经哭着跑回铁匠铺了。这才像我们家的人。', { who: 'smith', text: '我徒弟没哭。……他只是眼睛进了煤灰。' }],
      lose: ['训练弹打不死人——你看，你还活着。', { who: 'smith', text: '车我拖回去了。天亮之前给你焊好。' }, '把车修一修，再去和小提米打一场！'],
    },
    '0,1': {
      win: ['看见没有？甲片挡住的地方打不动，就绕过去打它没挡住的地方。兵法！', { who: 'smith', text: '那块甲片是我给艾达焊的。……焊歪了一点，你打的就是那一点。' }],
      lose: [{ who: 'smith', text: '甲片是我焊的。驾驶舱上面那块，左边薄。' }, '听见没有？找缝！我当年在克里米亚就是这么……', { who: 'smith', text: '……他在克里米亚管的是伙房。' }],
    },
    '0,2': {
      win: ['连老汤姆都服了你。铁匠铺后院已经装不下你了。', { who: 'smith', text: '……铲斗归你了。别拿它铲我的煤堆。' }, '他的意思是：去后巷吧，那儿才有真正的比赛。'],
      lose: ['汤姆！对自家孩子也下这么重的手？', { who: 'smith', text: '战场上没有自家孩子。车拖回来，我给你修，不收钱。' }],
    },
  },
  // 战前插入（「章,场」）：和 before.* 剧情插入点对应，只在第一次打这一场时播；开发者模式下可以在剧情编辑器里改。这里的字符串算旁白，角色台词要写 who
  before: {
    '0,2': [{ who: 'uncle', text: '最后一场。你的对手是——' }, { who: 'smith', text: '我。' }, { who: 'uncle', text: '……汤姆，你不是说你退休了吗？' }, { who: 'smith', text: '铁匠不退休。上车吧，孩子。我的机炮从不卡壳。' }],
  },
  feat: {
    garage: ['车间现在归你了。首胜领到的小水罐放在库存里，把它装到车上练习冷却。',
      { who: 'smith', text: '车间就在我铺子后头。工具随便用，别碰我的铁砧。' }],
    shop: ['商店开张了：库存里没有的零件，直接放上车就是买下来。钱要花在刀刃上！', { who: 'smith', text: '缺零件先问我。……我这儿也收钱。' }],
    street: ['街头赛开放了：输赢都快，赚点零花钱正好。'],
    bank: ['银行也肯借钱给你了。我年轻时借过一次，还了二十年。你自己掂量。'],
    side: ['侧挂层开放了：车身侧面也能挂零件了。'],
    upgrade: ['改装开放了：给零件加炮盾、加附加装甲，老零件也能再上场。'],
    orders: ['有人来下委托了：车满足他们的要求，就能交付图纸拿钱，车还是你的。'],
    bet: ['竞技场开始收赌注了。押自己赢——我当年就是这么输掉半个庄园的。'],
    blueprints: ['蓝图库开放了：把满意的方案存下来，改坏了一键就能换回来。'],
    friendly: ['云车库开放了：可以用分享码和别人交换战车的设计。'],
    season: ['伦敦蒸汽大奖赛给你发请柬了！连胜六轮，你就是全伦敦最好的车手。'],
  },
};

SA.Story = (() => {
  const h = SA.h, P = SA.PAL;

  // ---------- 看过的剧情 ----------
  const KEY = 'steam_arena_story_v1';
  let flags = {};
  try { flags = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { flags = {}; }
  const seen = (k) => !!flags[k];
  function mark(k) { flags[k] = 1; try { localStorage.setItem(KEY, JSON.stringify(flags)); } catch (e) { /* 隐私模式：只在本页记住 */ } }
  function reset() { flags = {}; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  // 全新存档：还在序章第一场、车间没开
  const isFresh = () => { const C = SA.S.d.camp; return C.ch === 0 && C.st === 0 && !C.done && !SA.Camp.has('garage'); };

  // ---------- 像素画工具 ----------
  const OUT = '#140c0a';
  // 在 w×h 的色块缓冲里作画，最后按需描一圈黑边，转成画布
  function raster(w, h2, paint, outline = OUT) {
    let buf = new Array(w * h2).fill(null);
    const put = (x, y, col) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < w && y < h2) buf[y * w + x] = col; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h2 ? buf[y * w + x] : null);
    const ell = (cx, cy, rx, ry, col, test) => {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!test || test(x, y, dx, dy))) put(x, y, typeof col === 'function' ? col(x, y, dx, dy) : col);
      }
    };
    const rect = (x0, y0, x1, y1, col) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, col); };
    const line = (x0, y0, x1, y1, col, th = 0.6) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let i = 0; i <= n; i++) { const k = i / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k; ell(x, y, th, th, col); put(x, y, col); }
    };
    paint({ put, get, ell, rect, line });
    if (outline) {
      const o = buf.slice();
      for (let y = 0; y < h2; y++) for (let x = 0; x < w; x++) {
        if (buf[y * w + x]) continue;
        if (get(x - 1, y) || get(x + 1, y) || get(x, y - 1) || get(x, y + 1)) o[y * w + x] = outline;
      }
      buf = o;
    }
    return toCanvas(w, h2, buf);
  }
  const rgbCache = {};
  const rgb = (hex) => rgbCache[hex] || (rgbCache[hex] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  function toCanvas(w, h2, buf) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h2;
    const x = c.getContext('2d'), img = x.createImageData(w, h2);
    buf.forEach((col, i) => { if (!col) return; const [r, g, b] = rgb(col); img.data.set([r, g, b, 255], i * 4); });
    x.putImageData(img, 0, 0);
    return c;
  }
  // ---------- 角色：碳球（js/coal.js，规则 docs/visual-rules.md §9）----------
  // 远房亲戚 = 阵容里的「远房亲戚」（遮阳盔 + 海象胡 + 单片眼镜 + 金肩章），你 = 「你」（蓝灰碳球 + 呆毛 + 补丁围巾）。
  // 碳球不画嘴：说话时整只上下弹 2 像素（见 portrait），眨眼用 blink 表情
  const coalCache = {};
  function coal(name, o) {
    const k = `${name}|${JSON.stringify(o)}`;
    return coalCache[k] || (coalCache[k] = SA.Coal.draw(SA.Coal.byName[name], o));
  }
  // 对话框头像（96×96）：talk 时身子往上弹 2 像素；blink 眨眼。亲戚在对话框左边，眼睛朝右看着你；
  // 老汤姆（和亲戚同框时）在右边，眼睛朝左
  function portrait(talk, blink, who = 'uncle') {
    const c = SA.STORY.cast[who] || SA.STORY.cast.uncle;
    return coal(c.coal || '远房亲戚', { size: 'bust', expr: blink ? 'blink' : 'normal', cy: talk ? 60 : 62, look: who === 'smith' ? -1 : 1 });
  }
  // 站着的亲戚（56×56，身子底边在第 46 行）；pose：salute 敬礼 / idle 垂手 / cheer 欢呼
  const uncle = (pose = 'salute', expr = 'normal') => coal('远房亲戚', { size: 'scene', pose, expr, look: -1 });
  // 老汤姆：拿着铁锤站着，看向左边的你
  const smith = (pose = 'hold', expr = 'normal') => coal('铁匠 老汤姆', { size: 'scene', pose, expr, look: -1 });
  // 滚成一团的碳球：θ = 转角，按 16 档转，最近邻，不糊
  function uncleBall(th, name = '远房亲戚') {
    const q = Math.round(th / (Math.PI / 8)), k = `ball|${name}|${((q % 16) + 16) % 16}`;
    if (coalCache[k]) return coalCache[k];
    const src = coal(name, { size: 'scene', pose: 'idle', expr: 'surprise', look: -1 }), c = document.createElement('canvas');
    c.width = c.height = 56;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(28, 34); g.rotate(q * Math.PI / 8); g.drawImage(src, -28, -34);
    return (coalCache[k] = c);
  }
  // 你：睡着（闭眼）/ 醒着（expr 另给）
  const me = (expr = 'normal', pose = 'idle', pupil) => coal('你', { size: 'scene', expr, pose, pupil });
  // 看到战车：保持瞪大眼睛，只让视线在右侧小幅平滑往返，约六秒一轮。
  function meShock(gt) {
    const x = 0.55 + 0.25 * Math.cos(gt * Math.PI / 3);
    return me('shock', 'idle', [Math.round(x * 20) / 20, 0.1]);
  }

  // ---------- 徽记：齿轮底 + 两门交叉的卡隆炮 ----------
  // 64×64，rot = 齿轮转角；返回 { cv, muzzles: [[x, y, dx, dy]...] }（炮口位置和朝向，开火特效用）
  const EC = [32, 34], EL = 27;
  const EDIR = [[-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
  const emblemCache = {};
  function emblem(rot = 0) {
    const key = Math.round(rot * 20);
    if (emblemCache[key]) return emblemCache[key];
    const B3 = P.brass, IR = P.iron, teeth = 12;
    // 卡隆炮外形：u = 沿炮管（-EL 炮尾 → +EL 炮口），返回半径
    const prof = (u) => (u < -EL - 3.5 ? 0 : u < -EL ? 2.4 : u < -EL + 10 ? 5.4 : u < EL - 5 ? 4.4 - (u - (-EL + 10)) * 0.025 : u < EL ? 4.9 : 0);
    const cannon = (x, y, [dx, dy]) => {
      const px = x + 0.5 - EC[0], py = y + 0.5 - EC[1], u = px * dx + py * dy, v = px * -dy + py * dx;
      const r = prof(u);
      if (!r || Math.abs(v) > r) return null;
      if (u > EL - 1.6 && Math.abs(v) < r - 1.8) return P.black;                 // 炮口
      if ((u > -EL + 8 && u < -EL + 10) || (u > EL - 6.5 && u < EL - 5)) return v < 0 ? B3[3] : B3[1];   // 黄铜箍
      const k = v / r;
      return k < -0.45 ? IR[4] : k < 0.1 ? IR[3] : k < 0.6 ? IR[2] : IR[1];
    };
    const gear = (x, y) => {
      const px = x + 0.5 - EC[0], py = y + 0.5 - EC[1], r = Math.hypot(px, py);
      if (r < 7 || r > 27) return null;
      const a = Math.atan2(py, px) - rot, ph = ((a / (Math.PI * 2 / teeth)) % 1 + 1) % 1;
      if (r > 21 && Math.abs(ph - 0.5) > 0.2) return null;
      const lit = (-px - py) / (r * Math.SQRT2);
      if (r > 12.5 && r < 14.5) return B3[1];                                     // 环槽
      if (r < 9) return B3[1];
      return lit > 0.55 && (r > 19 || r < 11) ? B3[3] : lit < -0.45 ? B3[1] : B3[2];
    };
    const cv = raster(64, 64, ({ put }) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const col = cannon(x, y, EDIR[1]) || cannon(x, y, EDIR[0]) || gear(x, y);
        if (col) put(x, y, col);
      }
    });
    const muzzles = EDIR.map(([dx, dy]) => [EC[0] + dx * EL, EC[1] + dy * EL, dx, dy]);
    return (emblemCache[key] = { cv, muzzles });
  }

  // ---------- 场景：黎明的伦敦 + 窝棚 ----------
  const SW = 480, SH = 270, WALL = 150, FLOOR = 232;
  // 城市剪影（固定种子）
  const CITY = (() => {
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const far = [], near = [], chim = [];
    for (let x = -10; x < SW + 20;) { const w = 18 + r() * 30; far.push([x, 104 + r() * 26, w]); x += w; }
    for (let x = -10; x < SW + 20;) {
      const w = 22 + r() * 40, y = 118 + r() * 22; near.push([x, y, w]);
      if (r() < 0.55) { const cx = x + 4 + r() * (w - 10); chim.push([cx, y - 14 - r() * 14]); }
      x += w + r() * 6;
    }
    return { far, near, chim };
  })();
  function sky(g, t) {
    const bands = [[0, '#1a1614'], [36, '#231a1e'], [62, '#35202a'], [84, '#542a26'], [102, '#7e3c22'], [118, '#a9561e'], [132, '#d27a2c'], [142, '#ee9c3e']];
    bands.forEach(([y, col], i) => { g.fillStyle = col; g.fillRect(0, y, SW, (bands[i + 1] ? bands[i + 1][0] : SH) - y); });
    // 太阳：一圈一圈的像素圆
    for (const [r, col] of [[30, '#f0a444'], [24, '#f8c25a'], [18, '#ffd97a']]) circle(g, 376, 128, r, col);
    g.fillStyle = '#5a2e26';
    for (const [x, y, w] of CITY.far) g.fillRect(Math.round(x), Math.round(y), Math.ceil(w), SH - Math.round(y));
    // 钟楼
    g.fillRect(84, 60, 16, 90); g.fillRect(88, 48, 8, 12); g.fillRect(91, 40, 2, 8);
    g.fillStyle = '#f5d77a'; g.fillRect(89, 70, 6, 6); g.fillStyle = '#5a2e26'; g.fillRect(91, 71, 1, 3); g.fillRect(91, 73, 3, 1);
    g.fillStyle = '#2e1a1a';
    for (const [x, y, w] of CITY.near) g.fillRect(Math.round(x), Math.round(y), Math.ceil(w), SH - Math.round(y));
    for (const [x, y] of CITY.chim) g.fillRect(Math.round(x), Math.round(y), 5, 30);
    // 烟囱冒烟
    CITY.chim.forEach(([x, y], i) => {
      for (let k = 0; k < 4; k++) {
        const f = ((t * 0.25 + k / 4 + i * 0.37) % 1), py = y - 4 - f * 60, px = x + 2 + f * 22 + Math.sin(f * 6 + i) * 3, r = 3 + f * 7;
        g.globalAlpha = 0.45 * (1 - f);
        circle(g, px, py, r, f < 0.5 ? P.steam[1] : P.steam[0]);
      }
    });
    g.globalAlpha = 1;
  }
  function circle(g, cx, cy, r, col) {
    g.fillStyle = col;
    for (let y = -Math.floor(r); y <= r; y++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y))); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
  }
  // 你的战车：裁到包围盒，从墙后探出来
  let carCv = null;
  function carSprite(t) {
    const v = SA.S.d.vehicle, K = SA.K, CL = K.CELL;
    let c0 = K.COLS, c1 = -1, r0 = K.ROWS, cockpitRow = K.ROWS;
    SA.V.each(v, (cell, r, c) => {
      c0 = Math.min(c0, c); c1 = Math.max(c1, c + SA.fp(cell.id).w - 1); r0 = Math.min(r0, r);
      if (SA.isCockpit(cell.id)) cockpitRow = Math.min(cockpitRow, r);
    });
    if (c1 < 0) return null;
    const src = SA.SPR.renderVehicle(v, { key: 'story', t, heat: 0.3, water: 1 });
    const sx = SA.SPR.PADX + c0 * CL - 8, sy = Math.max(0, r0 * CL - 12), w = (c1 - c0 + 1) * CL + 28, hh = K.ROWS * CL - sy;
    carCv = carCv || document.createElement('canvas');
    carCv.width = w; carCv.height = hh;
    // 驾驶员可能探出模块格顶，预留 8 像素供本镜头的墙体遮挡。
    carCv.cockpitTop = cockpitRow < K.ROWS ? Math.max(0, cockpitRow * CL - sy - 8) : Infinity;
    const x = carCv.getContext('2d');
    x.clearRect(0, 0, w, hh);
    x.drawImage(src, sx, sy, w, hh, 0, 0, w, hh);
    return carCv;
  }
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3));
  const SCENES = ['sleep', 'roof', 'roll', 'car'];
  // key = 当前分镜，t = 这一镜开始后的秒数，gt = 总时间（烟、灯火这些一直在动的东西）
  function drawScene(g, key, t, gt) {
    const idx = SCENES.indexOf(key);
    const roofK = idx > 1 ? 1 : idx === 1 ? ease(t / 0.7) : 0;
    const shake = (idx === 1 && t < 0.6) ? Math.round((Math.random() - 0.5) * 8 * (1 - t / 0.6)) : 0;
    g.setTransform(1, 0, 0, 1, shake, 0);
    g.imageSmoothingEnabled = false;
    sky(g, gt);
    // 战车从墙后升起来，锅炉冒着汽
    if (idx >= 3) {
      const car = carSprite(gt);
      if (car) {
        const cx = 400 - car.width / 2;
        // 后墙顶边最高到 WALL + 5；停稳后只露车体上部，让驾驶舱与驾驶员都藏在墙后。
        const cy = Math.max(Math.min(FLOOR - car.height + 24, WALL + 16 - car.height), WALL + 5 - car.cockpitTop) + Math.round((1 - ease(t / 0.9)) * 90);
        g.drawImage(car, Math.round(cx), cy);
        for (let k = 0; k < 3; k++) {
          const f = (gt * 0.6 + k / 3) % 1;
          g.globalAlpha = 0.6 * (1 - f); circle(g, cx + car.width * 0.45 + f * 14, cy + 20 - f * 50, 4 + f * 8, P.steam[2]);
        }
        g.globalAlpha = 1;
      }
    }
    // 后墙：竖木板，屋顶掀掉后顶边参差
    for (let i = 0, x = 0; x < SW; i++, x += 20) {
      const top = WALL + (roofK > 0.5 ? ((i * 7) % 9) - 3 : 0);
      g.fillStyle = i % 2 ? '#6b4128' : '#5a3620'; g.fillRect(x, top, 20, FLOOR - top);
      g.fillStyle = '#2e1c12'; g.fillRect(x, top, 1, FLOOR - top);
      g.fillStyle = '#8a5a34'; g.fillRect(x + 1, top, 1, FLOOR - top);
      g.fillStyle = '#2e1c12'; g.fillRect(x + 9, top + 12, 2, 2); g.fillRect(x + 9, FLOOR - 16, 2, 2);
    }
    g.fillStyle = '#3b2418'; g.fillRect(0, WALL + 36, SW, 4);
    // 地面
    g.fillStyle = P.bg[3]; g.fillRect(0, FLOOR, SW, SH - FLOOR);
    g.fillStyle = P.bg[4]; g.fillRect(0, FLOOR, SW, 2);
    g.fillStyle = P.bg[2];
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % SW, FLOOR + 6 + (i * 13) % 30, 3, 2);
    // 草垫
    g.fillStyle = P.brass[1]; g.fillRect(36, FLOOR - 6, 140, 7);
    g.fillStyle = P.brass[2]; for (let x = 38; x < 174; x += 5) g.fillRect(x, FLOOR - 6, 3, 1);
    g.fillStyle = P.brass[0]; g.fillRect(36, FLOOR, 140, 1);
    // 你
    // 碳球 56×56 按 ×2 贴，身子底边（第 46 行）落在草垫上
    if (idx === 0) {
      const breath = Math.floor(gt * 1.2) % 2;   // 睡着：慢慢一起一伏
      g.drawImage(me('blink'), 56, FLOOR - 98 + breath * 2, 112, 112 - breath * 2);
      zzz(g, 130, FLOOR - 70, gt);
    } else {
      const jump = idx === 1 ? Math.round(Math.sin(Math.min(1, t / 0.35) * Math.PI) * 10) : 0;
      const expr = idx === 1 || (idx === 2 && t < 1.35) ? 'surprise' : 'normal';
      g.drawImage(idx === 3 ? meShock(gt) : me(expr), 56, FLOOR - 98 - jump, 112, 112);
      if (idx === 1 || (idx === 2 && t < 0.6)) bang(g, 150, FLOOR - 92 - (idx === 1 ? Math.round(ease(t / 0.3) * 6) : 6));
    }
    // 亲戚：从右边滚进来，停住，弹起来站好
    if (idx >= 2) {
      const stand = idx === 3 || t > 1.35;
      const k = Math.min(1, t / 1.2), x = 520 - (520 - 262) * ease(k), bounce = Math.round(Math.abs(Math.sin(t * 11)) * 10 * (1 - k));
      if (!stand) {
        const ball = uncleBall(-t * 12);
        g.fillStyle = P.bg[4];
        for (let i = 1; i <= 3; i++) g.fillRect(Math.round(x + 24 + i * 9), FLOOR - 16 - i * 4 + (i % 2) * 6, 7 - i, 2);
        g.drawImage(ball, Math.round(x - 56), FLOOR - 92 - bounce, 112, 112);
      } else {
        const pop = idx === 2 ? Math.max(0, 1 - (t - 1.35) / 0.25) : 0, u = idx === 3 ? uncle('salute') : uncle('idle', t < 1.6 ? 'happy' : 'normal');
        const bob = idx === 3 ? Math.round(Math.sin(gt * 3) * 1) : 0;
        g.drawImage(u, 262 - 56, FLOOR - 92 - Math.round(pop * 10) + bob, 112, 112);
        if (idx === 2 && t < 1.8) dust(g, 262, FLOOR, (t - 1.35) / 0.45);
      }
    }
    // 老汤姆：跟在亲戚后面晚 0.45 秒滚进来，停在战车前面；之后一直拎着铁锤站着
    if (idx >= 2) {
      const t2 = idx === 2 ? t - 0.45 : 9, SX = 356;
      if (t2 > 0) {
        const stand = t2 > 1.35;
        const k = Math.min(1, t2 / 1.2), x = 580 - (580 - SX) * ease(k), bounce = Math.round(Math.abs(Math.sin(t2 * 11 + 1)) * 10 * (1 - k));
        if (!stand) {
          g.fillStyle = P.bg[4];
          for (let i = 1; i <= 3; i++) g.fillRect(Math.round(x + 24 + i * 9), FLOOR - 16 - i * 4 + (i % 2) * 6, 7 - i, 2);
          g.drawImage(uncleBall(-t2 * 12, '铁匠 老汤姆'), Math.round(x - 56), FLOOR - 92 - bounce, 112, 112);
        } else {
          const pop = idx === 2 ? Math.max(0, 1 - (t2 - 1.35) / 0.25) : 0, bob = idx === 3 ? Math.round(Math.sin(gt * 3 + 1.4)) : 0;
          g.drawImage(smith('hold', idx === 2 && t2 < 1.7 ? 'surprise' : 'normal'), SX - 56, FLOOR - 92 - Math.round(pop * 10) + bob, 112, 112);
          if (idx === 2 && t2 < 1.8) dust(g, SX, FLOOR, (t2 - 1.35) / 0.45);
        }
      }
    }
    // 屋顶：掀掉时整片往上飞
    if (roofK < 1) {
      const oy = -Math.round(roofK * roofK * 280), ox = Math.round(roofK * 40);
      g.save(); g.translate(ox, oy);
      for (let y = 0, i = 0; y < WALL + 6; y += 16, i++) {
        g.fillStyle = i % 2 ? '#2e1c12' : '#3b2418'; g.fillRect(-10, y, SW + 20, 16);
        g.fillStyle = '#1a100a'; g.fillRect(-10, y + 15, SW + 20, 1);
        g.fillStyle = '#6b4128'; for (let x = (i * 37) % 60; x < SW; x += 60) g.fillRect(x, y + 6, 2, 2);
      }
      // 板缝透进来的晨光
      g.fillStyle = '#e08a32';
      for (const [x, y, w] of [[140, 47, 36], [300, 95, 22], [380, 31, 30]]) g.fillRect(x, y, w, 1);
      // 马灯（挂在屋顶上，跟着一起飞走）
      g.fillStyle = P.dark[2]; g.fillRect(79, WALL - 60, 2, 24);
      const fl = 0.8 + 0.2 * Math.sin(gt * 13) * Math.sin(gt * 7);
      g.fillStyle = P.dark[3]; g.fillRect(73, WALL - 36, 14, 3); g.fillRect(74, WALL - 22, 12, 3);
      g.fillStyle = fl > 0.85 ? P.fire[3] : P.fire[2]; g.fillRect(75, WALL - 33, 10, 11);
      g.fillStyle = P.fire[3]; g.fillRect(78, WALL - 30, 4, 6);
      g.restore();
      // 室内昏暗：屋顶越开越亮
      const dark = 0.55 * (1 - roofK);
      if (dark > 0.01) {
        g.fillStyle = `rgba(7,8,12,${dark})`; g.fillRect(-10, WALL + 6 + oy, SW + 20, SH);
        // 马灯的光晕
        g.globalAlpha = 0.07 * (1 - roofK);
        for (const r of [66, 50, 36, 24]) circle(g, 80 + ox, WALL - 28 + oy, r, P.fire[2]);
        g.globalAlpha = 1;
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function zzz(g, x, y, t) {
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.5 + i / 3) % 1, px = Math.round(x + f * 18), py = Math.round(y - f * 30), s = 3 + Math.round(f * 3);
      g.globalAlpha = 1 - f;
      g.fillStyle = P.steam[2];
      g.fillRect(px, py, s, 1); g.fillRect(px, py + s - 1, s, 1);
      for (let k = 0; k < s; k++) g.fillRect(px + s - 1 - k, py + k, 1, 1);
    }
    g.globalAlpha = 1;
  }
  function bang(g, x, y) {
    g.fillStyle = OUT; g.fillRect(x - 1, y - 1, 6, 16); g.fillRect(x - 1, y + 16, 6, 6);
    g.fillStyle = P.brass[3]; g.fillRect(x, y, 4, 13); g.fillRect(x, y + 17, 4, 4);
  }
  function dust(g, x, y, k) {
    if (k < 0 || k > 1) return;
    g.globalAlpha = 1 - k;
    for (let i = 0; i < 6; i++) { const a = Math.PI + (i / 5) * Math.PI; circle(g, x + Math.cos(a) * 30 * k, y - 4 + Math.sin(a) * 10 * k, 3 + 3 * k, P.bg[5]); }
    g.globalAlpha = 1;
  }

  // ---------- 对话框 ----------
  // lines: [{ who, text, scene, on }]。host 默认整页（带暗底）；战斗里传画布外框，对话框压在画面下沿。
  // 点击 / 空格 / 回车：先把字打完，再翻下一句；Esc 或「跳过」直接结束。结束时调用 onDone。
  const CPS = 26;
  function talk(lines, { host = document.body, scene = null, onDone = null, onEdit = null, cls = '' } = {}) {
    const page = host === document.body;
    const face = h('canvas', { class: 'px vn-face', width: 96, height: 96 });
    // 老汤姆一出场就和远房亲戚同框：左边亲戚、右边老汤姆，谁说话谁亮
    const duo = lines.some(L => L.who === 'smith');
    const face2 = duo ? h('canvas', { class: 'px vn-face', width: 96, height: 96 }) : null;
    const name = h('div', { class: 'vn-name' });
    const txt = h('div', { class: 'vn-text' });
    const more = h('i', { class: 'vn-more', 'aria-hidden': 'true' });
    const skip = h('button', { class: 'vn-skip', type: 'button' }, '跳过 ▸▸');
    const edit = !SA.RELEASE && onEdit ? h('button', { class: 'vn-skip', type: 'button', style: 'right:96px', 'data-story-action': '1' }, '编排剧情') : null;
    const dock = h('div', { class: 'vn-dock' }, name,
      h('div', { class: 'vn-box' }, h('div', { class: 'vn-frame' }, h('div', { class: 'vn-in' },
        h('div', { class: 'vn-portrait' }, face), txt, duo ? h('div', { class: 'vn-portrait vn-portrait2' }, face2) : null, more))));
    const root = h('div', { class: `vn ${page ? 'vn-page' : ''} ${duo ? 'vn-duo' : ''} ${cls}`, role: 'dialog', 'aria-live': 'polite' },
      scene ? scene.el : null, dock, skip, edit);
    host.append(root);
    const fg = face.getContext('2d'), fg2 = face2 && face2.getContext('2d');
    let i = -1, shown = 0, full = '', done = false, raf = 0, last = performance.now(), lt = 0, gt = 0;
    function show(k) {
      i = k; const L = lines[k];
      full = L.text; shown = 0; lt = 0;
      const who = L.who && SA.STORY.cast[L.who];
      root.dataset.who = L.who || 'narr';
      name.textContent = who ? who.name : '';
      if (L.scene && scene) scene.set(L.scene);
      if (L.on) L.on();
      render();
    }
    function render() {
      txt.textContent = full.slice(0, Math.floor(shown));
      more.style.visibility = shown >= full.length ? 'visible' : 'hidden';
    }
    function advance() {
      if (done) return;
      if (shown < full.length) { shown = full.length; render(); return; }
      if (i + 1 < lines.length) show(i + 1); else finish();
    }
    function frame(now) {
      if (done) return;
      if (edit) edit.hidden = !canEditOpening();
      const dt = Math.min(0.05, (now - last) / 1000); last = now; lt += dt; gt += dt;
      if (shown < full.length) { shown = Math.min(full.length, shown + dt * CPS); render(); }
      const who = root.dataset.who;
      if (who !== 'narr') {
        const talking = shown < full.length && Math.floor(gt * 9) % 2 === 0;
        const left = duo ? 'uncle' : who;
        fg.clearRect(0, 0, 96, 96); fg.drawImage(portrait(talking && who === left, gt % 3.2 < 0.12, left), 0, 0);
        if (fg2) { fg2.clearRect(0, 0, 96, 96); fg2.drawImage(portrait(talking && who === 'smith', (gt + 1.3) % 3.7 < 0.12, 'smith'), 0, 0); }
      }
      if (scene) scene.draw(gt);
      raf = requestAnimationFrame(frame);
    }
    const onKey = (e) => {
      if (e.target === edit) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); advance(); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(); }
    };
    function finish(notify = true) {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      if (notify) { root.classList.add('out'); setTimeout(() => root.remove(), 260); }
      else root.remove();
      if (notify && onDone) onDone();
    }
    root.addEventListener('pointerdown', (e) => { if (e.target === skip || e.target === edit) return; if (e.button > 0) return; e.preventDefault(); advance(); });
    skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });
    if (edit) edit.addEventListener('click', (e) => { e.stopPropagation(); if (canEditOpening()) { finish(false); onEdit(); } });
    window.addEventListener('keydown', onKey, true);
    show(0);
    if (edit) edit.hidden = !canEditOpening();
    raf = requestAnimationFrame(frame);
    return { close: () => finish(), cancel: () => finish(false), get index() { return i; } };
  }

  // 开场画面：480×270 画布，分镜随台词切换
  function openingScene() {
    const el = h('canvas', { class: 'px vn-scene', width: SW, height: SH });
    const g = el.getContext('2d');
    let key = 'sleep', t0 = 0, now = 0;
    return { el, set(k) { key = k; t0 = now; }, draw(gt) { now = gt; drawScene(g, key, gt - t0, gt); } };
  }

  // ---------- 开始界面 ----------
  // 两种开发入口都复用同一开场编辑器；页面选字模式可在标题出现后即时开启。
  const canEditOpening = () => !SA.RELEASE && !!SA.StoryDev && (SA.StoryDev.enabled() || !!SA.Text?.isEditing?.());
  function title(onStart) {
    const bg = h('canvas', { class: 'px title-bg', width: SW, height: SH });
    const em = h('canvas', { class: 'px title-emblem', width: 64, height: 64 });
    const fresh = isFresh();
    const C0 = SA.S.d.camp, ch = SA.CAMPAIGN[Math.min(C0.ch, SA.CAMPAIGN.length - 1)];
    // 越过发行章节的旧档只显示当前发行范围的通关状态。
    const savePlace = SA.RELEASE ? (SA.Camp.done() ? '战役已通关' : SA.CAMPAIGN[SA.Camp.chIndex()].name)
      : (C0.done ? '战役已通关' : ch.name);
    const go = h('button', { class: 'btn primary title-go', type: 'button' }, '开始游戏');
    const edit = !SA.RELEASE ? h('button', { class: 'btn small', type: 'button', 'data-story-action': '1' }, '编排开场剧情') : null;
    const root = h('div', { class: 'title', role: 'dialog', 'aria-label': '蒸汽竞技场' }, bg,
      h('div', { class: 'title-card' }, em,
        h('h1', { class: 'title-name' }, '蒸汽竞技场'),
        h('div', { class: 'title-sub' }, 'STEAM  ARENA'),
        go, edit,
        h('div', { class: 'title-save' }, fresh ? '新的存档' : `继续存档 · ${savePlace}`)));
    document.body.append(root);
    const g = bg.getContext('2d'), eg = em.getContext('2d');
    let raf = 0, t = 0, last = performance.now(), left = false;
    const frame = (now) => {
      if (left) return;
      if (edit) edit.hidden = !canEditOpening();
      t += Math.min(0.05, (now - last) / 1000); last = now;
      g.imageSmoothingEnabled = false;
      sky(g, t);
      // 背后一只慢慢转的大齿轮剪影：齿圈 + 六根辐条 + 轮毂
      const rot = t * 0.12, cx = SW / 2, cy = 118;
      g.fillStyle = 'rgba(20,12,10,0.42)';
      for (let y = -112; y <= 112; y += 2) for (let x = -112; x <= 112; x += 2) {
        const r = Math.hypot(x, y), a = Math.atan2(y, x) - rot;
        if (r > 112 || r < 12) continue;
        const tooth = Math.abs(((a / (Math.PI / 9)) % 1 + 1) % 1 - 0.5) < 0.24;
        const spoke = Math.abs(Math.sin(a * 3)) * r < 7;
        if ((r > 96 && !tooth) || (r > 30 && r < 76 && !spoke)) continue;
        g.fillRect(cx + x, cy + y, 2, 2);
      }
      g.fillStyle = P.bg[1]; g.fillRect(0, 228, SW, SH - 228);
      g.fillStyle = P.bg[3]; g.fillRect(0, 228, SW, 2);
      eg.clearRect(0, 0, 64, 64);
      eg.drawImage(emblem(Math.floor(t * 8) / 8 * 0.35).cv, 0, 0);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e) => { if (e.target === edit || document.querySelector('.sd, .vn')) return; if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); start(); } };
    window.addEventListener('keydown', onKey, true);
    function start() {
      if (left) return;
      left = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      root.classList.add('out');
      setTimeout(() => root.remove(), 420);
      onStart();
    }
    go.addEventListener('click', start);
    if (edit) {
      edit.addEventListener('click', () => { if (canEditOpening()) SA.StoryDev.editor('opening'); });
      edit.hidden = !canEditOpening();
    }
    setTimeout(() => go.focus(), 0);
  }

  // ---------- 流程 ----------
  // 台词一律经 SA.StoryData.get 读（开发者编辑过的覆盖值优先，SA.STORY 是默认值）；取不到就用默认
  const lines = (id, fb) => { try { return SA.StoryData ? SA.StoryData.get(id) : fb; } catch (e) { return fb; } };
  // 开场试播使用正式分镜，但结束后只执行编辑器回调，不写进度或进入战斗。
  function previewOpening(rows, next) {
    if (!rows.length) { next(); return; }
    talk(rows, { scene: openingScene(), cls: 'vn-opening', onDone: next });
  }
  // 开始游戏：全新存档先演开场，演完直接进第一场战斗；否则回到正常的页面
  function begin() {
    if (!isFresh() || seen('opening')) return;
    const rows = lines('opening', SA.STORY.opening);
    if (!rows.length) { mark('opening'); firstBattle(); return; }
    talk(rows, { scene: openingScene(), cls: 'vn-opening', onDone: () => { mark('opening'); firstBattle(); },
      onEdit: SA.RELEASE ? null : () => SA.StoryDev.editor('opening', { back: begin }) });
  }
  function firstBattle() {
    const e = SA.S.arenaEntries('camp').find(x => x.next);
    if (!e || !SA.V.stats(SA.S.d.vehicle).canDeploy) return;
    document.querySelector('#modal').hidden = true;
    const go = () => e.start();
    if (SA.StoryDev) SA.StoryDev.before({ key: e.key, replay: e.replay }, go); else go();
  }
  // 战斗教程台词：只在第一关第一次开打时有；返回 null 就不演
  function tutorial(opts) {
    if (seen('tutorial') || opts.mode !== 'campaign' || opts.replay) return null;
    const st = SA.Camp.current();
    if (!st || st.ci !== 0 || st.si !== 0) return null;
    // 每句还原成 { who, text }：没写 who 的是远房亲戚说的
    const T0 = SA.STORY.tutorial, rows = (id, fb) => lines(id, fb).map(l => (typeof l === 'string' ? { who: 'uncle', text: l } : { ...l, who: l.who || 'uncle' }));
    return { intro: rows('tutorial.intro', [].concat(T0.intro)), parts: T0.parts.map((p, i) => ({ ...p, lines: rows(`tutorial.parts.${i}`, p.lines) })) };
  }
  // 过关提示：at = 打的是哪一场（战役），newFeat = 这一场新开放的功能。每条只说一次
  function afterBattle({ key, win, newFeat = [] }, next) {
    const out = [], uncle = (arr) => arr.map(l => (typeof l === 'string' ? { who: 'uncle', text: l } : l));
    const S0 = key && SA.STORY.stage[key], outcome = win ? 'win' : 'lose';
    const sk = `after:${key}:${outcome}`;
    if (S0 && S0[outcome] && !seen(sk)) { out.push(...lines(`stage.${key}.${outcome}`, uncle(S0[outcome]))); mark(sk); }
    for (const f of newFeat) {
      if (!SA.STORY.feat[f] || seen(`feat:${f}`)) continue;
      out.push(...lines(`feat.${f}`, uncle(SA.STORY.feat[f]))); mark(`feat:${f}`);
    }
    if (!out.length) { next(); return; }
    talk(out, { onDone: next, cls: 'vn-hint' });
  }

  return { title, begin, talk, previewOpening, tutorial, afterBattle, emblem, portrait, seen, mark, reset, isFresh };
})();
