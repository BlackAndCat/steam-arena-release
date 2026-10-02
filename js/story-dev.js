// 剧情编辑（开发者）：场景列表、简易编辑器（Ctrl+S 保存）、战前 / 战后插入提示。
// 数据全走 SA.StoryData（js/text-manager.js，astra 维护）：get / set / save / point / list；这里只做界面和流程。
// 开发者开关记在 localStorage（steam_arena_story_dev_v1），不动存档；普通玩家看不到任何询问。
// 普通玩家：写好的战前 / 战后剧情在首次打这一关（非重打）时自动播放一次。
window.SA = window.SA || {};

SA.StoryDev = (() => {
  const h = SA.h;
  const KEY = 'steam_arena_story_dev_v1';
  const SCENES = { sleep: '睡觉', roof: '掀屋顶', roll: '滚进来', car: '战车' };
  let on = false;
  // 发行包忽略浏览器里遗留的开发开关。
  if (!SA.RELEASE) try { on = localStorage.getItem(KEY) === '1'; } catch (e) { on = false; }
  const enabled = () => !SA.RELEASE && on;
  function setEnabled(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 隐私模式：只在本页记住 */ } }

  const D = () => SA.StoryData;
  const safeGet = (id) => { try { return D().get(id); } catch (e) { return []; } };
  const cast = () => Object.entries((SA.STORY && SA.STORY.cast) || {});

  // ---------- 场景名 ----------
  function stageName(key) {
    const [ci, si] = key.split(',').map(Number), ch = SA.CAMPAIGN[ci], st = ch && (SA.Camp?.stage(ci, si) || ch.stages[si]);
    return st ? `${ch.name.split(' · ')[0]} · 第 ${si + 1} 场 · ${st.name}` : key;
  }
  const FEAT = { garage: '车间', shop: '商店', street: '街头赛', bank: '银行', side: '侧挂层', upgrade: '改装', orders: '委托', bet: '赌注', blueprints: '蓝图库', friendly: '云车库', season: '大奖赛' };
  function label(id) {
    if (id === 'opening') return '开场';
    if (id === 'tutorial.intro') return '第一关教程 · 开场白';
    let m = /^tutorial\.parts\.(\d+)$/.exec(id);
    if (m) { const p = SA.STORY.tutorial.parts[+m[1]]; return `第一关教程 · 讲解${p ? p.label : m[1]}`; }
    m = /^stage\.(\d+,\d+)\.(win|lose)$/.exec(id);
    if (m) return `${stageName(m[1])} · ${m[2] === 'win' ? '胜利后提示' : '战败后提示'}`;
    m = /^feat\.(.+)$/.exec(id);
    if (m) return `功能开放 · ${FEAT[m[1]] || m[1]}`;
    m = /^(before|after)\.(.+)$/.exec(id);
    if (m) return `${m[2] === 'current' ? '其他对战（街头赛 / 锦标赛 / 支线）' : stageName(m[2])} · ${m[1] === 'before' ? '战前' : '战后'}`;
    return id;
  }
  const group = (id) => id === 'opening' || id.startsWith('tutorial.') ? '开场与教程'
    : id.startsWith('before.') || id.startsWith('after.') ? '战前 / 战后插入' : id.startsWith('stage.') ? '过关提示' : '功能开放提示';

  // ---------- 简易编辑器 ----------
  // o.cont：从战前 / 战后提示进来时的「继续原流程」；有它时按钮变成「保存并播放后继续」，关闭也会继续
  let open = null;
  function editor(id, o = {}) {
    if (open) open.close(true);
    // 页面选字模式会截获编辑器输入；编排期间暂停，最终返回来源时再恢复。
    const restoreText = o.restoreText === true || !!SA.Text?.isEditing?.();
    if (restoreText) SA.Text.exitEdit();
    const rows = safeGet(id).map(l => ({ ...l }));
    const list = h('div', { class: 'sd-rows' });
    const status = h('span', { class: 'sd-status muted' }, '');
    const who = (r) => h('select', { class: 'sd-who', onchange: (e) => { r.who = e.target.value || undefined; } },
      h('option', { value: '', selected: !r.who }, '旁白'),
      cast().map(([k, c]) => h('option', { value: k, selected: r.who === k }, c.name)));
    const scene = (r) => h('select', { class: 'sd-scene', title: '开场分镜', onchange: (e) => { r.scene = e.target.value || undefined; } },
      h('option', { value: '', selected: !r.scene }, '分镜不变'),
      Object.entries(SCENES).map(([k, n]) => h('option', { value: k, selected: r.scene === k }, n)));
    let dirty = false;
    const touch = () => { dirty = true; status.textContent = '有未保存的修改'; };
    function draw() {
      list.innerHTML = '';
      if (!rows.length) list.append(h('p', { class: 'muted sd-empty' }, '这一段还没有台词。点「添加一句」开始写；保存空白 = 这一段不演。'));
      rows.forEach((r, i) => {
        const txt = h('textarea', { class: 'sd-text', rows: 2, placeholder: '台词……', oninput: (e) => { r.text = e.target.value; touch(); } });
        txt.value = r.text || '';
        const mv = (d) => { const j = i + d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; touch(); draw(); };
        list.append(h('div', { class: 'sd-row' },
          h('span', { class: 'sd-n' }, i + 1),
          h('div', { class: 'sd-meta' }, who(r), id === 'opening' || r.scene ? scene(r) : null),
          txt,
          h('div', { class: 'sd-ops' },
            h('button', { class: 'btn small', title: '上移', disabled: i === 0, onclick: () => mv(-1) }, '↑'),
            h('button', { class: 'btn small', title: '下移', disabled: i === rows.length - 1, onclick: () => mv(1) }, '↓'),
            h('button', { class: 'btn small', title: '删除这一句', onclick: () => { rows.splice(i, 1); touch(); draw(); } }, '✕'))));
      });
    }
    list.addEventListener('change', touch);
    // 保存：先 set（校验、写本机草稿），再 save 写文件；显式传 who / scene（undefined = 去掉），避免沿用这个位置原有的角色
    async function save() {
      let out;
      try {
        out = rows.filter(r => (r.text || '').trim()).map(r => ({ text: r.text.trim(), who: r.who || undefined, scene: r.scene || undefined }));
        D().set(id, out);
      } catch (e) { status.textContent = `没保存：${e.message}`; status.className = 'sd-status bad'; return false; }
      status.textContent = '保存中……'; status.className = 'sd-status muted';
      const r = await D().save();
      dirty = false;
      status.className = `sd-status ${r.ok ? 'ok' : 'warn'}`;
      status.textContent = !r.ok ? '已存本机草稿（用 tools/serve.py 打开才能写入文件）' : r.pending ? '已保存，另有修改仍待写入' : `已写入 ${r.file || '文本文件'}`;
      return true;
    }
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); e.stopImmediatePropagation(); save(); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    };
    const root = h('div', { class: 'sd', role: 'dialog', 'aria-label': '剧情编辑', 'data-story-action': '1' },
      h('div', { class: 'panel sd-panel' },
        h('div', { class: 'panel-head' }, h('h2', {}, `剧情编辑 · ${label(id)}`), h('code', { class: 'sd-id muted' }, id)),
        h('div', { class: 'panel-body' }, list,
          h('button', { class: 'btn small sd-add', onclick: () => { rows.push({ text: '', who: rows.length ? rows[rows.length - 1].who : 'uncle' }); draw(); list.lastChild.querySelector('textarea').focus(); } }, '+ 添加一句')),
        h('div', { class: 'dialog-actions sd-foot' }, status,
          h('button', { class: 'btn', onclick: () => save() }, '保存', h('kbd', {}, 'Ctrl+S')),
          h('button', { class: 'btn primary', onclick: async () => { if (await save()) { close(true); play(id, id === 'opening' ? () => editor(id, { ...o, restoreText }) : o.cont || (() => {})); } } }, o.cont ? '保存并播放后继续' : '保存并试播'),
          h('button', { class: 'btn', onclick: () => close() }, o.cont ? '关闭并继续' : '关闭'))));
    function close(silent) {
      if (!silent && dirty && !confirm('有未保存的修改，确定关闭？')) return;
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      if (open && open.root === root) open = null;
      if (!silent && restoreText) SA.Text.enterEdit();
      if (!silent && o.cont) o.cont();
      else if (!silent && o.back) o.back();
    }
    window.addEventListener('keydown', onKey, true);
    document.body.append(root);
    draw();
    open = { root, close };
    setTimeout(() => { const t = root.querySelector('textarea'); if (t) t.focus(); }, 0);
  }

  // 播放某一段（空的直接继续）
  function play(id, next) {
    const L = safeGet(id);
    if (!L.length) { next(); return; }
    if (id === 'opening') SA.Story.previewOpening(L, next);
    else SA.Story.talk(L, { onDone: next, cls: 'vn-hint' });
  }

  // ---------- 全部场景 ----------
  async function browser() {
    if (SA.Text && SA.Text.ready) await SA.Text.ready;
    const ids = D().list(), groups = {};
    for (const id of ids) (groups[group(id)] = groups[group(id)] || []).push(id);
    const q = h('input', { class: 'sd-q', type: 'search', placeholder: '搜关卡名 / 台词……', oninput: () => filter() });
    const body = h('div', { class: 'sd-list' });
    function filter() {
      const k = q.value.trim();
      body.innerHTML = '';
      for (const [g, arr] of Object.entries(groups)) {
        const items = arr.map(id => ({ id, L: safeGet(id) })).filter(({ id, L }) => !k || label(id).includes(k) || L.some(l => l.text.includes(k)));
        if (!items.length) continue;
        body.append(h('h3', { class: 'help-h' }, g), h('div', { class: 'sd-items' }, items.map(({ id, L }) =>
          h('button', { class: `sd-item ${L.length ? '' : 'empty'}`, onclick: () => { SA.UI.closeModal(); editor(id, { back: browser }); } },
            h('b', {}, label(id)), h('span', { class: 'muted' }, L.length ? `${L.length} 句 · ${L[0].text.slice(0, 24)}${L[0].text.length > 24 ? '…' : ''}` : '空')))));
      }
    }
    filter();
    SA.UI.openModal('剧情编辑器', h('div', { class: 'sd-browser' },
      h('p', { class: 'muted', style: 'margin-top:0' }, '点一段打开编辑；Ctrl+S 保存，写进 text/steam-arena/zh-CN.json（需要 tools/serve.py），否则先存本机草稿。'), q, body));
  }

  // ---------- 战前 / 战后插入 ----------
  const played = (k) => SA.Story.seen(`insert:${k}`);
  // at = { key: '章,关' | 'current' | undefined, replay }；phase = before / after
  function workshopKey(at) {
    const match = /^(\d+),(\d+)$/.exec(at?.key || '');
    if (!match) return null;
    const ci = Number(match[1]), si = Number(match[2]);
    return Number.isSafeInteger(ci) && Number.isSafeInteger(si) && SA.CAMPAIGN[ci]?.stages?.[si] ? `${ci},${si}` : null;
  }
  function openWorkshop(at) {
    const key = workshopKey(at);
    // 独立窗口编辑关卡车，当前战前控制台和继续开战的回调保持原位。
    window.open(`tools/stage-editor.html${key ? `?stage=${key}` : ''}`, '_blank');
  }
  function hook(phase, at, next) {
    let id;
    try { id = D().point(phase, at && at.key && /^\d+,\d+$/.test(at.key) ? at.key : 'current'); } catch (e) { next(); return; }
    const L = safeGet(id);
    if (!on) {
      // 普通玩家：写好的段落第一次打（非重打）时播一次
      if (!L.length || (at && at.replay) || played(id)) { next(); return; }
      SA.Story.mark(`insert:${id}`);
      SA.Story.talk(L, { onDone: next, cls: 'vn-hint' });
      return;
    }
    const what = phase === 'before' ? '战前' : '战后';
    SA.UI.dialog(phase === 'before' ? '战前控制台' : `${what}剧情 · 开发者`, [
      h('p', { style: 'margin-top:0' }, h('b', { 'data-story-stage-label': id }, label(id))),
      L.length
        ? h('div', { class: 'sd-peek' }, L.slice(0, 3).map(l => h('div', {}, h('span', { class: 'muted' }, l.who ? `${(SA.STORY.cast[l.who] || {}).name || l.who}：` : '旁白：'), l.text)), L.length > 3 ? h('div', { class: 'muted' }, `……共 ${L.length} 句`) : null)
        : h('p', { class: 'muted' }, `这里还没有${what}剧情。要插入一段吗？`),
      h('p', { class: 'muted', style: 'font-size:12px' }, '开发者模式才会问；普通玩家只会在第一次打这一关时看到写好的剧情。'),
      phase === 'before' ? h('button', { class: 'btn', onclick: () => openWorkshop(at) }, '关卡车工作台') : null,
    ], [
      { label: L.length ? '编辑' : '插入剧情', primary: true, onClick: () => editor(id, { cont: next }) },
      L.length ? { label: '播放', onClick: () => play(id, next) } : null,
    ].filter(Boolean), phase === 'before' ? '直接开战' : '不插入，继续', next);
  }
  const before = (at, go) => hook('before', at, go);
  const after = (at, next) => hook('after', at, next);

  // 工作台跨窗口保存后只刷新控制台的关卡名，不触碰剧情预览或继续开战回调。
  function refreshConsoleLabel() {
    const title = document.querySelector('#modal [data-story-stage-label]');
    if (title) title.textContent = label(title.dataset.storyStageLabel);
  }
  if (!SA.RELEASE) window.addEventListener('focus', refreshConsoleLabel);
  return SA.RELEASE ? { enabled, before, after } : { enabled, setEnabled, editor, browser, play, before, after, label, refreshConsoleLabel };
})();
