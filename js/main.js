// 入口与页面切换：主页面 铁匠铺院子（home）+ 车间（garage）/ 出战（arena），外加战斗（battle）
window.SA = window.SA || {};

// 文本管理使用独立 locale JSON，其他 HTML5 游戏只需把 game 改成自己的标识即可复用。
SA.Text.init({ game: 'steam-arena', locale: 'zh-CN', page: 'main' });

// 版本标记：系统和视觉分别维护，控制台输入 SA.BUILD 可同时核对两条基线。
SA.BUILD = [SA.BUILD_SYS, SA.BUILD_VIS].filter(Boolean).join(' / ');
console.info(`蒸汽竞技场 build ${SA.BUILD}`);

SA.current = null;
// 标记当前页面并刷新顶栏；页面自己负责渲染
SA.go = (name) => {
  SA.current = name;
  delete document.body.dataset.yard;   // 院子（主页面 / 出战黑板）自己再标上
  SA.Camp.syncLim();
  document.body.dataset.screen = name;
  SA.UI.topbar();
};
// 主导航：车间 / 出战。车间要打完第一场练习赛才开放；quiet：出战页先不弹章节开场（战后结算还要弹窗）
// 主页面（院子）和车间一起开放：打完第一场练习赛以前只有出战页
SA.nav = (name, arg, quiet) => {
  document.querySelector('#modal').hidden = true;
  if ((name === 'garage' || name === 'home') && !SA.Camp.has('garage')) name = 'arena';
  if (name === 'arena') SA.Arena.open(arg, quiet);
  else if (name === 'home') SA.Home.open();
  else SA.Editor.open(arg);
};

window.addEventListener('DOMContentLoaded', () => {
  SA.PX.init();   // 像素界面件的九宫格 / 齿轮 / 桌面纹理挂到 CSS 变量上
  SA.S.load();
  SA.Camp.backfill();
  SA.nav(SA.Camp.has('garage') ? 'home' : 'arena');
  document.querySelector('#modal').addEventListener('pointerdown', (e) => {
    if (e.target.id === 'modal') SA.UI.closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('#modal').hidden) SA.UI.closeModal();
  });
  // 从进化报告页（tools/evolve.html）跳过来：直接打开试驾场，对手来源选"进化报告"
  if (!SA.RELEASE && location.hash === '#sandbox=evolve') { history.replaceState(null, '', location.pathname); SA.Camp.dev.sandbox('evolve'); return; }
  // 开始界面：点「开始游戏」后，全新存档先演开场、直接进第一场；老存档回到原来的页面
  SA.Story.title(SA.Story.begin);
});

// 调试用：控制台输入 SA.reset() 重开存档
if (!SA.RELEASE) SA.reset = () => { SA.S.reset(); SA.Story.reset(); SA.nav('home'); };

// 玩家重开在正式与开发版均可用；重新加载会结束旧战斗/剧情并回到全新存档的开场页。
SA.restartGame = () => {
  // 战斗和剧情仍可能在导航后异步结算；这些界面没有设置入口，公开调用也一并拒绝。
  if (SA.current === 'battle' || document.querySelector('.vn')) return false;
  if (!SA.S.restartGame()) return false;
  SA.Story.reset();
  window.location.reload();
  return true;
};
