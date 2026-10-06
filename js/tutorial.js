// 页面教程（旁白）：第一次进出战黑板、车间、商店时，旁白讲一遍怎么用，聚光框指着要点的东西。
// · 讲解：旁白对话框（SA.Story.talk，整页）＋ 聚光框（盖住别处的暗底只在目标那里开个口），点一下翻一句。
// · 动手：不挡操作的旁白小条 ＋ 目标发光，等玩家真的做到（装上水罐、推拉杆出战）才收起。
// 台词在 config/text.json 的 story:guide.<id>（剧情编辑器、后台剧情页都能改；场景表在 storyMeta.guides）。
// 看过哪段记在剧情已读标记里（SA.Story.seen / mark，键 guide:<id>），不动存档；SA.reset() 一起清掉。
window.SA = window.SA || {};

SA.Guide = (() => {
  const h = SA.h;
  const key = (id) => `guide:${id}`;
  const seen = (id) => SA.Story.seen(key(id));
  const mark = (id) => SA.Story.mark(key(id));
  // 每句还原成 { text }：编辑器里写了说话人就照写（旁白不带 who）
  const lines = (id) => {
    let rows;
    try { rows = SA.StoryData ? SA.StoryData.get(`guide.${id}`) : null; } catch (e) { rows = null; }
    if (!rows) rows = (SA.STORY.guides || {})[id] || [];
    return rows.map(l => (typeof l === 'string' ? { text: l } : { ...l }));
  };
  const $ = (sel) => (typeof sel === 'function' ? sel() : document.querySelector(sel));
  let busy = false;

  // ---------- 聚光框 ----------
  // 一个跟着目标走的框：黄铜描边 + 黑边，四周用超大阴影压暗（dim）；不吃事件。每帧对位，目标挪了框也跟着走
  function spot() {
    const el = h('div', { class: 'guide-spot' });
    document.body.append(el);
    let target = null, dim = true, raf = 0;
    const tick = () => {
      const t = $(target);
      if (t && t.isConnected && t.getClientRects().length) {
        const r = t.getBoundingClientRect(), pad = 6;
        el.style.cssText = `left:${Math.round(r.left - pad)}px;top:${Math.round(r.top - pad)}px;width:${Math.round(r.width + pad * 2)}px;height:${Math.round(r.height + pad * 2)}px`;
        el.hidden = false;
      } else el.hidden = true;
      el.classList.toggle('dim', dim);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      set(t, d = true) {
        target = t; dim = d;
        const el2 = $(t);   // 性能单、清单在窄屏里会滚动：先把目标滚进视野
        if (el2 && el2.scrollIntoView) el2.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        tick(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      },
      close() { cancelAnimationFrame(raf); el.remove(); },
    };
  }

  // 等弹窗、对话框都关了再开讲（战后结算、章节开场、过关提示都在前面）；页面换了就不讲了
  function whenFree(page, fn, tries = 600) {
    const free = () => document.querySelector('#modal').hidden && !document.querySelector('.vn');
    const go = () => {
      if (SA.current !== page) return;
      if (busy || !free()) { if (--tries > 0) setTimeout(go, 250); return; }
      fn();
    };
    setTimeout(go, 350);
  }

  // 讲解：rows 每句配一个目标（targets[i]，不够就沿用上一个）；讲完 done()
  function say(rows, targets, done) {
    if (!rows.length) { done(); return; }
    const sp = spot();
    // 目标在下半屏时对话框挪到上面，别把要看的东西盖住
    const list = rows.map((L, i) => ({ ...L, on: () => {
      const t = targets[Math.min(i, targets.length - 1)];
      sp.set(t);
      const el = $(t), root = document.querySelector('.vn.vn-guide');
      if (root) root.classList.toggle('vn-up', !!el && el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2 > window.innerHeight * 0.55);
    } }));
    busy = true;
    SA.Story.talk(list, { cls: 'vn-guide', onDone: () => { sp.close(); busy = false; done(); } });
  }

  // 动手：旁白小条 + 目标发光（不压暗），until() 成立、页面换了、或点「知道了」就收起；做到了才调用 done()
  function hint(text, target, until, done, page) {
    if (!text) { done(); return; }
    const sp = spot();
    sp.set(target, false);
    const box = h('div', { class: 'guide-hint', role: 'status' },
      h('div', { class: 'guide-hint-in' }, h('span', {}, text),
        h('button', { class: 'guide-hint-x', type: 'button', onclick: () => stop(false) }, SA.Config.text('guide_hint_close'))));
    document.body.append(box);
    let iv = 0;
    const place = () => {
      const t = $(target);
      // 目标在屏幕下半，小条就放上面；反之放下面
      const low = t && t.getBoundingClientRect().top > window.innerHeight * 0.5;
      box.classList.toggle('top', !!low);
    };
    function stop(ok) {
      clearInterval(iv); sp.close(); box.remove();
      if (ok) done();
    }
    place();
    iv = setInterval(() => {
      if (SA.current !== page) { stop(false); return; }
      if (until()) { stop(true); return; }
      place();
    }, 250);
  }

  // ---------- 出战黑板：第一次（第二关开打前）讲黑板和拉杆，最后让玩家自己推一次拉杆 ----------
  function arena() {
    if (!SA.Camp.has('garage') || seen('arena')) return;
    whenFree('arena', () => {
      if (!document.querySelector('.ar-go')) return;
      say(lines('arena'), ['.ar-chalk', '.ar-mid', '.ar-go', '.ar-garage .px-hot'], () => {
        mark('arena');
        const tip = lines('arena.lever')[0];
        hint(tip && tip.text, '.ar-go .px-thr', () => SA.current !== 'arena', () => {}, 'arena');
      });
    });
  }

  // ---------- 车间：第一次讲改装台和清单 → 动手装水罐 → 逐项讲性能单 ----------
  const TANK = 'tank_s';
  const onCar = (id) => { let n = 0; SA.V.each(SA.S.d.vehicle, (cell) => { if (cell.id === id) n++; }); return n; };
  const inStock = (id) => Object.entries(SA.S.d.inv).some(([k, n]) => n > 0 && SA.parseKey(k).id === id);
  const STATS = ['rating', 'power', 'weight', 'speed', 'heat', 'water'];
  const statEl = (k) => () => (k === 'rating' ? document.querySelector('.ed-sheet-row') : document.querySelector(`.px-stats [data-stat="${k}"]`));
  function stats() {
    const rows = [], targets = [];
    const add = (id, t) => { for (const L of lines(id)) { rows.push(L); targets.push(t); } };
    add('stats', '.ed-sheet');
    for (const k of STATS) add(`stats.${k}`, statEl(k));
    add('stats.exit', '.ed-lever');
    say(rows, targets, () => mark('stats'));
  }
  function tankStep() {
    // 先把清单翻到水罐那一类，再指着它
    const row = () => SA.Editor.focusInv && SA.Editor.focusInv(TANK, false);
    row();
    const tip = lines('garage.tank')[0];
    hint(tip && tip.text, () => document.querySelector(`.mrow[data-page-key^="inventory:${TANK}"]`) || document.querySelector('.ed-stage'),
      () => onCar(TANK) > 0, () => whenFree('garage', stats), 'garage');
  }
  function garage() {
    if (!SA.Camp.has('garage')) return;
    const needTank = () => inStock(TANK) && !onCar(TANK);
    if (!seen('garage')) {
      whenFree('garage', () => {
        if (needTank()) SA.Editor.focusInv && SA.Editor.focusInv(TANK, false);
        say(lines('garage'), ['.ed-stage', () => document.querySelector(`.mrow[data-page-key^="inventory:${TANK}"]`) || '.ed-cat'], () => {
          mark('garage');
          if (needTank()) tankStep(); else whenFree('garage', stats);
        });
      });
      return;
    }
    if (!seen('stats')) whenFree('garage', () => { if (needTank()) tankStep(); else stats(); });
    else if (SA.Camp.has('shop') && !seen('shop')) shop();
  }

  // ---------- 商店：第一次开张时指一下清单上方的「商店」开关 ----------
  function shop() {
    if (!SA.Camp.has('shop') || seen('shop')) return;
    whenFree('garage', () => {
      if (!document.querySelector('.ed-panel .switch')) return;
      say(lines('shop'), ['.ed-panel .switch'], () => mark('shop'));
    });
  }

  // ---------- 第一场赢下来（车间刚开）：战后的弹窗和剧情演完，直接带去车间 ----------
  function afterBattle() {
    if (!SA.Camp.has('garage') || seen('garage') || SA.current !== 'arena') return false;
    whenFree('arena', () => SA.nav('garage'));
    return true;
  }

  return { arena, garage, shop, afterBattle, seen };
})();
