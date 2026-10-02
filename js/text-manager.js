// 可复用的 HTML5 页面管理包。
//
// 设计目标：
// 1. 运行时编辑或删除 DOM 文本、按钮文案和 title/aria-label 等属性，并隐藏所选元素；
// 2. 同一个 key 可以绑定多个位置，修改后即时联动；
// 3. 编辑只在当前页面暂存，点击保存后由本机服务写入正式配置；
// 4. 不直接改写散落在业务 JS 里的字符串，避免正则替换破坏模板和逻辑。
//
// 最小接入示例：
//   SA.Text.init({ game: 'my-game', locale: 'zh-CN' });
//   SA.Text.bindText(button, 'ui.start', '开始游戏');
//   SA.Text.bindAttr(icon, 'title', 'ui.start.tip', '开始游戏');
// 页面中没有显式绑定的普通 DOM 文本也能在编辑模式下临时编辑；编辑器会为它生成稳定的页面路径 key。
window.SA = window.SA || {};

SA.Text = (() => {
  const config = {
    game: 'steam-arena',
    locale: 'zh-CN',
    saveUrl: '/__text/save',
    toolbar: true,
  };
  const values = Object.create(null);
  let uiDocument = null, savedUiMessages = null;
  function uiConfig() {
    if (!uiDocument) { uiDocument = SA.Config.get('ui'); savedUiMessages = { ...uiDocument.messages }; }
    return uiDocument;
  }
  const uiBindings = new Map();
  let uiDirty = false, uiChangeRevision = 0;
  const removedElements = new Set();
  const hiddenElements = new Map();
  const defaults = Object.create(null);
  const keyEntries = new Map();
  const allEntries = new Set();
  const autoEntries = new Set();
  const nodeDefaults = new WeakMap();
  const attrDefaults = new WeakMap();
  const manualBindings = new WeakMap();
  const listeners = new Set();
  let editing = false;
  let dirty = false;
  let started = false;
  let loaded = false;
  let scanTimer = 0;
  let observer = null;
  let activeEntry = null;
  let activeElement = null;
  let toolbar = null;
  let editorInput = null;
  let editorBox = null;
  let statusEl = null;
  let saves = Promise.resolve(); // 同页的连续保存按顺序写入，防止旧请求覆盖新稿。
  let fileLoadError = '';
  let changeRevision = 0;
  const canvasSource = new WeakMap();
  let canvasWrapped = false;
  let pinned = null;
  let hovered = null;
  let startupStyle = null;
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });

  const fileName = () => 'config/text.json';
  const sourceDocument = SA.Config.get('text');
  const safeKey = key => typeof key === 'string' && key.length > 0 && key.length <= 240;
  // 剧情编排入口及编辑器自身是功能控件，页面选字模式不能拦截其点击或扫描其文字。
  const isUiElement = el => el && el.closest && el.closest('#sa-text-manager, [data-sa-text-mirror], [data-story-action], [data-yard-chat-editor]');
  const snapshot = () => ({ values: { ...values }, removedElements: [...removedElements] });
  function replaceSnapshot(data) {
    Object.keys(values).forEach(key => delete values[key]);
    Object.assign(values, data.values || {});
    removedElements.clear();
    (data.removedElements || []).forEach(path => removedElements.add(path));
    restoreElements();
    applyAll();
    scan();
  }

  function notify(key) {
    listeners.forEach(fn => {
      try { fn(key, get(key)); } catch (e) { console.error('SA.Text.onChange 回调失败', e); }
    });
  }

  function addEntry(entry) {
    allEntries.add(entry);
    if (!keyEntries.has(entry.key)) keyEntries.set(entry.key, new Set());
    keyEntries.get(entry.key).add(entry);
    if (entry.auto) autoEntries.add(entry);
    return entry;
  }

  function removeAutoEntries() {
    autoEntries.forEach(entry => {
      allEntries.delete(entry);
      const set = keyEntries.get(entry.key);
      if (set) {
        set.delete(entry);
        if (!set.size) keyEntries.delete(entry.key);
      }
    });
    autoEntries.clear();
  }

  function register(key, fallback = '', meta = {}) {
    if (!safeKey(key)) throw new Error('SA.Text.register 需要非空且不超过 240 字符的 key');
    if (!(key in defaults)) defaults[key] = String(fallback == null ? '' : fallback);
    if (!keyEntries.has(key)) addEntry({ key, kind: 'value', explicit: true, ...meta });
    return get(key, fallback);
  }

  // Config.text 输出记录原模板与实参，页面编辑框可显示完整占位符文本。
  function registerUi(key, rendered, template, args) {
    if (typeof key !== 'string' || typeof rendered !== 'string' || typeof template !== 'string') return;
    const old = uiBindings.get(rendered);
    uiBindings.set(rendered, old && old.key !== key ? null : { key, args: [...args] });
  }
  function uiBindingFor(rendered) {
    const direct = uiBindings.get(rendered);
    if (direct) return direct;
    const key = SA.Config.keyForText?.(rendered);
    return key && !/{{\d+}}/.test(uiConfig().messages[key]) ? { key, args: [] } : null;
  }

  function get(key, fallback = '') {
    if (key.startsWith('ui:')) return uiConfig().messages[key.slice(3)] ?? fallback;
    if (key in values) return values[key];
    return key in defaults ? defaults[key] : String(fallback == null ? '' : fallback);
  }

  // Home 每次重建都可能产生新的敌手或车况文案，因此仅刷新本接口注册的默认值。
  // 已保存的自定义值仍由 get 优先读取；更新默认值本身不产生草稿或保存请求。
  function homeValue(key, fallback) {
    register(key, fallback);
    defaults[key] = String(fallback == null ? '' : fallback);
    return get(key);
  }

  // 院子闲谈沿用 Home 的 [说话者, 文案, 动作] 元组和稳定的 0 基位置。
  // 只替换第二项，复制数组与每个元组，避免编辑覆盖改动说话者、动作或输入数据。
  function homeLines(lines) {
    return lines.map((line, index) => {
      const result = line.slice();
      result[1] = homeValue(`home:chatter:${index}`, line[1]);
      return result;
    });
  }

  // 院子提示以人物 key 作为稳定位置；每次读取刷新动态默认文案，覆盖值优先。
  // 只返回文案字符串，Home 原有的 HTML 拼接和显示方式由 Home 自己处理。
  function homeTips(tips) {
    return {
      tom: homeValue('home:tip:tom', tips.tom),
      rel: homeValue('home:tip:rel', tips.rel),
      tim: homeValue('home:tip:tim', tips.tim),
    };
  }

  function set(key, value, options = {}) {
    if (!safeKey(key)) throw new Error('SA.Text.set 需要非空且不超过 240 字符的 key');
    const next = String(value == null ? '' : value);
    if (key.startsWith('ui:')) {
      const name = key.slice(3);
      if (!Object.hasOwn(uiConfig().messages, name)) throw new Error(`未知界面文案：${name}`);
      if (uiConfig().messages[name] === next) return next;
      uiConfig().messages[name] = next;
      uiDirty = true; uiChangeRevision++;
      applyKey(key);
      if (!options.silent) notify(key);
      updateToolbar();
      return next;
    }
    if (!(key in defaults)) defaults[key] = Array.from(keyEntries.get(key) || []).find(entry => entry.auto)?.fallback ?? next;
    if (values[key] === next && key in values) return next;
    values[key] = next;
    dirty = true;
    changeRevision++;
    applyKey(key);
    if (!options.silent) notify(key);
    updateToolbar();
    return next;
  }

  // 章节继承等显式删除只移除当前配置键，写盘前仍保留在本页内存中。
  function remove(key) {
    if (!safeKey(key)) throw new Error('SA.Text.remove 需要有效 key');
    if (!(key in values)) return;
    delete values[key];
    delete defaults[key];
    dirty = true;
    changeRevision++;
    applyKey(key);
    notify(key);
    updateToolbar();
  }

  function entryValue(entry) {
    if (entry.key.startsWith('ui:')) return SA.Config.text(entry.key.slice(3), ...(entry.uiArgs || []));
    const oldPathKey = entry.auto && !entry.semantic ? uniqueOldPathKey(entry.key, Object.keys(values), 'dom:') : null;
    return entry.key in values ? values[entry.key]
      : oldPathKey ? values[oldPathKey]
        : entry.legacyKey && entry.legacyKey in values ? values[entry.legacyKey]
        : entry.semantic && keyEntries.get(entry.key)?.size && Array.from(keyEntries.get(entry.key)).some(item => item.explicit)
          ? get(entry.key, entry.fallback) : entry.fallback;
  }

  function applyEntry(entry) {
    if (!entry || !entry.target || !entry.target.isConnected) return;
    const value = entryValue(entry);
    if (entry.kind === 'canvas') {
      if (entry.drawn !== value) {
        const source = entry.render(value);
        entry.target.width = source.width;
        entry.target.height = source.height;
        entry.target.style.width = `${source.width * entry.scale}px`;
        entry.target.style.height = `${source.height * entry.scale}px`;
        entry.target.getContext('2d').drawImage(source, 0, 0);
        entry.drawn = value;
        canvasSource.set(entry.target, { ...canvasSource.get(entry.target), drawn: value });
      }
      return;
    }
    if (entry.kind === 'attr') {
      if (entry.target.getAttribute(entry.attr) !== value) entry.target.setAttribute(entry.attr, value);
      return;
    }
    const node = entry.textNode && entry.textNode.parentNode === entry.target
      ? entry.textNode : directTextNodes(entry.target)[entry.nodeIndex || 0];
    if (!node) return;
    const prefix = entry.prefix || '';
    const suffix = entry.suffix || '';
    const next = `${prefix}${value}${suffix}`;
    if (node.data !== next) node.data = next;
  }

  function applyKey(key) {
    const setOfEntries = keyEntries.get(key);
    if (setOfEntries) setOfEntries.forEach(applyEntry);
  }

  function directTextNodes(el) {
    return Array.from(el.childNodes || []).filter(node =>
      node.nodeType === Node.TEXT_NODE && (node.data.trim() || node.saTextManaged));
  }

  function stableClasses(el) {
    // 出战黑板先挂载、延时展开；路径始终使用已有编辑稿保存时的展开态 class，
    // 让首次扫描与切关重绘命中同一文字、画布和元素显隐记录。
    if (el.classList?.contains('yard-board')) return ['yard-board', 'down'];
    const transient = new Set(['on', 'open', 'show', 'active', 'sel', 'bad', 'folded', 'hidden', 'drag']);
    return Array.from(el.classList || []).filter(name => !transient.has(name)).slice(0, 2);
  }

  // 自动 key 不读取文案本身，所以修改后 key 不会漂移；正式接入仍建议使用 bindText 的语义 key。
  function elementPath(el, keyed = false) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      let part = node.tagName.toLowerCase();
      if (keyed && node.dataset.pageKey) part += `:key:${encodeURIComponent(node.dataset.pageKey)}`;
      else if (node.id) part += `#${node.id}`;
      const classes = keyed && node.dataset.pageKey ? [] : stableClasses(node);
      if (classes.length) part += `.${classes.join('.')}`;
      if (!node.id && !(keyed && node.dataset.pageKey) && node.parentElement) {
        const same = Array.from(node.parentElement.children).filter(child => child.tagName === node.tagName);
        part += `:n${Math.max(1, same.indexOf(node) + 1)}`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join('/');
  }

  function textKey(el, index) {
    return `dom:${removalPath(el)}::text:${index}`;
  }

  function attrKey(el, attr) {
    return `dom:${removalPath(el)}::attr:${attr}`;
  }

  // 旧 v1 路径只作读取回退，新编辑始终写入页面与稳定行标识完整的新 key。
  const legacyTextKey = (el, index) => `dom:${elementPath(el)}::text:${index}`;
  const legacyAttrKey = (el, attr) => `dom:${elementPath(el)}::attr:${attr}`;

  // 稳定页面 ID 只用于覆盖路径；旧入口路径仅在相同画面和元素后缀唯一时读取，避免误套其他页面。
  function uniqueOldPathKey(current, candidates, prefix = '') {
    if (!config.page) return null;
    const scoped = current.slice(prefix.length);
    const marker = scoped.indexOf('::screen:') >= 0 ? scoped.indexOf('::screen:') : scoped.indexOf('::global::');
    if (marker < 0) return null;
    const suffix = scoped.slice(marker);
    const matches = candidates.filter(candidate => candidate.startsWith(prefix) && candidate !== current
      && candidate.slice(prefix.length, candidate.length - suffix.length).startsWith('/') && candidate.endsWith(suffix));
    return matches.length === 1 ? matches[0] : null;
  }

  // 已保存的页面路径就是作者字段；UI 语义模板只接管尚无作者覆盖的元素。
  function savedPathKey(current, legacy) {
    if (current in values) return current;
    const old = uniqueOldPathKey(current, Object.keys(values), 'dom:');
    if (old) return old;
    return legacy in values ? legacy : null;
  }

  // #screen 与弹窗按游戏页面隔离；侧栏等公共区域属于全局，避免同构重绘误删别页。
  function removalPath(el) {
    const screen = el.closest('#screen, #modal') ? `screen:${document.body.dataset.screen || ''}` : 'global';
    return `${config.page || location.pathname}::${screen}::${elementPath(el, true)}`;
  }

  function canRemove(el) {
    return el && el !== document.body && !['app', 'screen', 'side', 'modal', 'toast', 'sa-text-manager'].includes(el.id)
      && !isUiElement(el) && !el.contains(toolbar);
  }

  // 元素只隐藏而不移出 DOM，同标签兄弟序号在保存、重绘与恢复时始终一致。
  function hideElement(el) {
    if (hiddenElements.has(el)) return;
    hiddenElements.set(el, { value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display') });
    el.style.setProperty('display', 'none', 'important');
  }

  function restoreElements() {
    hiddenElements.forEach((display, el) => {
      if (display.value) el.style.setProperty('display', display.value, display.priority);
      else el.style.removeProperty('display');
    });
    hiddenElements.clear();
  }

  function applyRemoved() {
    if (!removedElements.size) return;
    for (const el of document.body.querySelectorAll('*')) {
      if (!canRemove(el)) continue;
      const path = removalPath(el);
      if (removedElements.has(path) || uniqueOldPathKey(path, [...removedElements])) hideElement(el);
    }
  }

  function editableAttributes(el) {
    return ['title', 'aria-label', 'alt', 'placeholder'].filter(attr => {
      const value = el.getAttribute && el.getAttribute(attr);
      return value != null && (String(value).trim() || el.saTextAttrs?.has(attr));
    });
  }

  function scan(root = document.body) {
    if (!root || !document.body) return;
    removeAutoEntries();
    const elements = root === document.body ? [root, ...root.querySelectorAll('*')] : [root, ...root.querySelectorAll('*')];
    elements.forEach(el => {
      if (el === document.body || isUiElement(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return;
      const nodes = directTextNodes(el);
      if (nodes.length) {
        el.dataset.saTextEditable = '1';
        nodes.forEach((node, index) => {
          const raw = node.data;
          const binding = uiBindingFor(raw.trim());
          const path = textKey(el, index), legacy = legacyTextKey(el, index);
          const authored = savedPathKey(path, legacy);
          const key = el.dataset.textKey && index === 0 ? el.dataset.textKey
            : authored || (binding ? `ui:${binding.key}` : path);
          node.saTextManaged = true;
          if (!nodeDefaults.has(node)) nodeDefaults.set(node, {
            fallback: raw.trim(), prefix: (raw.match(/^\s*/) || [''])[0], suffix: (raw.match(/\s*$/) || [''])[0],
          });
          const original = nodeDefaults.get(node);
          // 扫描得到的绑定每次重绘都重新建立；显式 bindText 保留自己的语义 key。
          addEntry({ key, uiArgs: authored ? [] : binding?.args || [], legacyKey: el.dataset.textKey && index === 0 ? null : legacy, semantic: !!(el.dataset.textKey && index === 0) || (!!binding && !authored),
            kind: 'text', target: el, textNode: node, nodeIndex: index, fallback: original.fallback,
            prefix: original.prefix, suffix: original.suffix, auto: true });
        });
      }
      editableAttributes(el).forEach(attr => {
        const manual = manualBindings.get(el)?.get(attr);
        const semantic = !!manual || (attr === 'title' && !!el.dataset.textKey);
        const binding = uiBindingFor(el.getAttribute(attr));
        const path = attrKey(el, attr), legacy = legacyAttrKey(el, attr);
        const authored = savedPathKey(path, legacy);
        const key = manual || (attr === 'title' && el.dataset.textKey ? `${el.dataset.textKey}.${attr}` : authored || (binding ? `ui:${binding.key}` : path));
        if (!el.saTextAttrs) el.saTextAttrs = new Set();
        el.saTextAttrs.add(attr);
        if (!attrDefaults.has(el)) attrDefaults.set(el, new Map());
        const originals = attrDefaults.get(el);
        if (!originals.has(attr)) originals.set(attr, el.getAttribute(attr));
        el.dataset.saTextEditable = '1';
        addEntry({ key, uiArgs: authored ? [] : binding?.args || [], legacyKey: semantic ? null : legacy, semantic: semantic || (!!binding && !authored),
          kind: 'attr', attr, target: el, fallback: originals.get(attr), auto: true });
      });
      if (el.tagName === 'CANVAS' && canvasSource.has(el)) {
        const source = canvasSource.get(el);
        const key = `canvas:${removalPath(el)}`;
        el.dataset.saTextEditable = '1';
        addEntry({ key, kind: 'canvas', target: el, fallback: source.text, render: source.render,
          scale: source.scale, drawn: source.drawn, auto: true });
      }
    });
    applyAll();
    applyRemoved();
  }

  function applyAll() {
    allEntries.forEach(applyEntry);
  }

  function bindText(el, key, fallback = '') {
    if (!el || !safeKey(key)) throw new Error('SA.Text.bindText 需要元素和合法 key');
    el.dataset.textKey = key;
    register(key, fallback);
    const nodes = directTextNodes(el);
    if (!nodes.length && !el.children.length) el.append(document.createTextNode(String(fallback)));
    const nextNodes = directTextNodes(el);
    nextNodes.forEach((node, index) => { node.saTextManaged = true; addEntry({ key: index === 0 ? key : `${key}.${index}`, kind: 'text', target: el, textNode: node, nodeIndex: index, fallback: node.data.trim(), prefix: (node.data.match(/^\s*/) || [''])[0], suffix: (node.data.match(/\s*$/) || [''])[0], explicit: true }); });
    el.dataset.saTextEditable = '1';
    applyKey(key);
    return el;
  }

  function bindAttr(el, attr, key, fallback = '') {
    if (!el || !safeKey(key)) throw new Error('SA.Text.bindAttr 需要元素和合法 key');
    if (!manualBindings.has(el)) manualBindings.set(el, new Map());
    manualBindings.get(el).set(attr, key);
    register(key, fallback);
    addEntry({ key, kind: 'attr', attr, target: el, fallback: String(fallback), explicit: true });
    el.dataset.saTextEditable = '1';
    applyKey(key);
    return el;
  }

  function canvas(key, fallback) {
    register(key, fallback);
    return get(key, fallback);
  }

  // Canvas 文字没有 DOM 节点，绘制时通过这个辅助函数读取覆盖值即可参与同一套编辑数据。
  function draw(ctx, key, x, y, fallback = '', options = {}) {
    const text = canvas(key, fallback);
    if (!ctx || typeof ctx.fillText !== 'function') return text;
    ctx.save();
    Object.entries(options || {}).forEach(([name, value]) => {
      if (name in ctx) ctx[name] = value;
    });
    ctx.fillText(text, x, y);
    ctx.restore();
    return text;
  }

  function findEntry(target, preferAttribute = false) {
    let node = target && target.nodeType === Node.ELEMENT_NODE ? target : target && target.parentElement;
    while (node && node !== document.body) {
      if (node.tagName === 'CANVAS' && canvasSource.has(node)) {
        const entries = keyEntries.get(`canvas:${removalPath(node)}`);
        if (entries?.size) return [...entries][0];
      }
      const direct = directTextNodes(node);
      const attributeEntry = () => {
        for (const attr of editableAttributes(node)) {
          const key = attr === 'title' && node.dataset.textKey ? `${node.dataset.textKey}.${attr}` : manualBindings.get(node)?.get(attr) || attrKey(node, attr);
          const setOfEntries = keyEntries.get(key);
          if (setOfEntries && setOfEntries.size) return Array.from(setOfEntries).find(entry => entry.target === node) || Array.from(setOfEntries)[0];
        }
        return null;
      };
      if (preferAttribute) {
        const entry = attributeEntry();
        if (entry) return entry;
      }
      if (direct.length) {
        const key = node.dataset.textKey || textKey(node, 0);
        const setOfEntries = keyEntries.get(key);
        if (setOfEntries && setOfEntries.size) return Array.from(setOfEntries).find(entry => entry.target === node) || Array.from(setOfEntries)[0];
      }
      if (!preferAttribute) {
        const entry = attributeEntry();
        if (entry) return entry;
      }
      const child = node.querySelector && node.querySelector('[data-sa-text-editable]');
      if (child && directTextNodes(child).length) {
        const key = child.dataset.textKey || textKey(child, 0);
        const setOfEntries = keyEntries.get(key);
        if (setOfEntries && setOfEntries.size) return Array.from(setOfEntries)[0];
      }
      node = node.parentElement;
    }
    return null;
  }

  function createToolbar() {
    if (toolbar || !document.body) return;
    toolbar = document.createElement('section');
    toolbar.id = 'sa-text-manager';
    toolbar.dataset.saTextUi = '1';
    const makeButton = (action, label) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.textAction = action; button.textContent = label;
      return button;
    };
    const head = document.createElement('div'); head.className = 'sa-text-head';
    const title = document.createElement('b'); title.textContent = '页面管理';
    const status = document.createElement('span'); status.className = 'sa-text-status';
    head.append(title, status);
    const actions = document.createElement('div'); actions.className = 'sa-text-actions';
    actions.append(makeButton('toggle', '开启编辑'), makeButton('save', '保存到配置'), makeButton('reset', '撤销本页修改'));
    editorBox = document.createElement('div'); editorBox.className = 'sa-text-editor'; editorBox.hidden = true;
    const label = document.createElement('label'); label.textContent = '当前文案';
    editorInput = document.createElement('textarea'); editorInput.rows = 2;
    const keyHint = document.createElement('small');
    label.append(editorInput); editorBox.append(label, keyHint);
    const selection = document.createElement('small'); selection.dataset.textSelection = '1';
    const editActions = document.createElement('div'); editActions.className = 'sa-text-actions';
    editActions.append(makeButton('parent', '选中父元素'), makeButton('remove-element', '删除所选元素'), makeButton('remove-text', '删除当前文字'));
    editorBox.append(selection, editActions);
    toolbar.append(head, actions, editorBox);
    document.body.append(toolbar);
    statusEl = status;
    toolbar.addEventListener('click', event => {
      const action = event.target.closest('[data-text-action]');
      if (!action) return;
      event.preventDefault();
      const name = action.dataset.textAction;
      if (name === 'toggle') toggle();
      if (name === 'save') save();
      if (name === 'reset') reset();
      if (name === 'parent') selectParent();
      if (name === 'remove-element') removeSelectedElement();
      if (name === 'remove-text') removeSelectedText();
    });
    editorInput.addEventListener('input', () => {
      if (activeEntry) set(activeEntry.key, editorInput.value);
    });
    // 工具栏显示当前配置与本页尚未保存的修改。
    updateToolbar();
  }

  function openEditor(entry) {
    activeEntry = entry;
    editorBox.querySelector('label').hidden = !entry;
    if (!entry) { editorBox.querySelector('small').textContent = '此元素没有可编辑文字'; return; }
    editorInput.value = entry.key.startsWith('ui:') ? uiConfig().messages[entry.key.slice(3)] : entryValue(entry);
    editorBox.querySelector('small').textContent = `${entry.key}${entry.kind === 'attr' ? `（${entry.attr}）` : ''}`;
    editorInput.focus(); editorInput.select();
  }

  // 选择真实 DOM 元素；无文字的图标、容器也可选，父级按钮用于删除整个区块。
  function selectElement(el, preferAttribute = false) {
    if (!el || el === document.body || isUiElement(el) || el.contains(toolbar)) return;
    activeElement = el;
    editorBox.hidden = false;
    editorBox.querySelector('[data-text-selection]').textContent = `所选元素：${elementPath(el)}`;
    const entry = findEntry(el, preferAttribute);
    openEditor(entry && entry.target === el ? entry : null);
    updateToolbar();
  }

  function selectParent() {
    if (activeElement) selectElement(activeElement.parentElement);
  }

  function removeSelectedElement() {
    if (!canRemove(activeElement)) return;
    removedElements.add(removalPath(activeElement));
    hideElement(activeElement);
    activeElement = null; activeEntry = null; editorBox.hidden = true;
    dirty = true; changeRevision++;  updateToolbar('元素已隐藏；尚未写入配置');
  }

  function removeSelectedText() {
    if (!activeEntry) return;
    set(activeEntry.key, '');
    editorInput.value = '';
    updateToolbar('文字已删除；尚未写入配置');
  }

  function onPointerDown(event) {
    if (editing && event.target.closest?.('[data-sa-text-mirror]') && pinned?.source) {
      event.preventDefault(); event.stopImmediatePropagation(); selectElement(pinned.source, true); return;
    }
    if (!editing || isUiElement(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectElement(event.target, event.altKey || event.shiftKey);
  }

  // 捕获编辑时的后续鼠标事件，避免页面原有拖放、松手动作被触发。
  function suppressPageEvent(event) {
    if (!editing || isUiElement(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onClick(event) {
    if (!editing || isUiElement(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectElement(event.target, event.altKey || event.shiftKey);
  }

  // 仅追踪公开文字工厂，显示画布沿用原工厂参数重绘。
  function wrapCanvasText() {
    if (canvasWrapped || !SA.PX?.ui?.img) return;
    canvasWrapped = true;
    for (const name of ['brush', 'num']) {
      const original = SA.PX[name];
      if (typeof original !== 'function') continue;
      SA.PX[name] = function (text, ...args) {
        const source = original.call(this, text, ...args);
        canvasSource.set(source, { text: String(text), render: value => original.call(SA.PX, value, ...args) });
        return source;
      };
    }
    const originalImg = SA.PX.ui.img;
    SA.PX.ui.img = function (source, scale, style) {
      const display = originalImg.call(this, source, scale, style);
      const meta = canvasSource.get(source);
      if (meta) canvasSource.set(display, { ...meta, scale: scale ?? SA.PX.S, drawn: meta.text });
      return display;
    };
    // ui.num 内部使用词法 img，不经过公开 ui.img，单独继承同一文字来源。
    if (typeof SA.PX.ui.num === 'function') {
      const originalNum = SA.PX.ui.num;
      SA.PX.ui.num = function (text, ...args) {
        const display = originalNum.call(this, text, ...args);
        canvasSource.set(display, { text: String(text), render: value => originalNum.call(SA.PX.ui, value, ...args),
          scale: SA.PX.S, drawn: String(text) });
        return display;
      };
    }
  }

  function releasePin() {
    if (!pinned) return;
    if (pinned.mirror) pinned.mirror.remove();
    if (pinned.element && pinned.style) {
      for (const [name, saved] of Object.entries(pinned.style)) {
        if (saved.value) pinned.element.style.setProperty(name, saved.value, saved.priority);
        else pinned.element.style.removeProperty(name);
      }
    }
    pinned = null;
  }

  // F8 固定真实悬浮内容；原生 title 的临时镜像只负责选择源属性。
  function pinHover() {
    if (pinned) { releasePin(); return; }
    const target = hovered && hovered.isConnected ? hovered : null;
    if (!target) return;
    const home = target.closest('.home-car');
    const hint = target.matches('.home-hint') ? target : (home || target).querySelector('.home-hint');
    if (hint) {
      const style = {};
      for (const name of ['opacity', 'visibility', 'pointer-events'])
        style[name] = { value: hint.style.getPropertyValue(name), priority: hint.style.getPropertyPriority(name) };
      pinned = { element: hint, style };
      hint.style.setProperty('opacity', '1', 'important');
      hint.style.setProperty('visibility', 'visible', 'important');
      hint.style.setProperty('pointer-events', 'auto', 'important');
      selectElement(hint);
    } else {
      const titled = target.closest('[title]') || target.querySelector('[title]');
      if (!titled) return;
      const mirror = document.createElement('div');
      mirror.textContent = titled.getAttribute('title');
      mirror.dataset.saTextMirror = '1';
      mirror.style.cssText = 'position:fixed;z-index:2147483646;padding:6px;background:#f4e4bd;color:#231b16;border:1px solid #231b16;pointer-events:auto;';
      const rect = titled.getBoundingClientRect();
      mirror.style.left = `${Math.max(0, rect.left)}px`;
      mirror.style.top = `${Math.max(0, rect.bottom)}px`;
      document.body.append(mirror);
      pinned = { mirror, source: titled };
      selectElement(titled, true);
    }
    updateToolbar('悬浮内容已固定；按 F8 释放');
  }

  function toggle(force) {
    editing = force == null ? !editing : !!force;
    document.body.classList.toggle('sa-text-editing', editing);
    if (!editing) {
      releasePin();
      activeEntry = null;
      activeElement = null;
      if (editorBox) editorBox.hidden = true;
    }
    updateToolbar();
    return editing;
  }

  function enterEdit() { return toggle(true); }
  function exitEdit() { return toggle(false); }

  function updateToolbar(message) {
    if (!toolbar) return;
    const toggleButton = toolbar.querySelector('[data-text-action="toggle"]');
    toggleButton.textContent = editing ? '完成编辑' : '开启编辑';
    if (editorBox) {
      editorBox.querySelector('[data-text-action="parent"]').disabled = !activeElement || !activeElement.parentElement || activeElement.parentElement === document.body;
      editorBox.querySelector('[data-text-action="remove-element"]').disabled = !canRemove(activeElement);
      editorBox.querySelector('[data-text-action="remove-text"]').disabled = !activeEntry;
    }
    statusEl.textContent = message || fileLoadError || (dirty || uiDirty ? '本页修改尚未写入正式配置' : loaded ? '配置已同步' : '正在加载…');
  }

  function payloadNow() {
    // 结构元数据与页面文案同写进唯一正式配置；编辑器只改当前快照。
    return { ...sourceDocument, version: 1, game: config.game, locale: config.locale, ...snapshot() };
  }

  function load() {
    if (!sourceDocument || sourceDocument.version !== 1 || !sourceDocument.values || !Array.isArray(sourceDocument.removedElements))
      throw new Error('正式文本配置格式无效');
    replaceSnapshot(sourceDocument);
    loaded = true;
    if (readyResolve) readyResolve(api);
    updateToolbar(); scan(); notify('*');
    if (startupStyle) { startupStyle.remove(); startupStyle = null; }
  }

  // 其他标签页写入后，只在当前页没有待保存修改时接收新快照。
  async function reload(savedDocument) {
    if (dirty || !savedDocument) return false;
    if (savedDocument.version !== 1 || savedDocument.game !== config.game || savedDocument.locale !== config.locale
      || !savedDocument.values || !Array.isArray(savedDocument.removedElements)) return false;
    Object.assign(sourceDocument, savedDocument);
    replaceSnapshot(sourceDocument);
    notify('*');
    return true;
  }

  function save() {
    saves = saves.then(saveNow, saveNow);
    return saves;
  }

  async function saveNow() {
    const saveText = dirty, saveUi = uiDirty;
    const payload = saveText ? payloadNow() : null;
    const uiPayload = saveUi ? JSON.parse(JSON.stringify(uiConfig())) : null;
    const revision = changeRevision, uiRevision = uiChangeRevision;
    let serverRevision;
    try {
      if (saveText) {
        const response = await fetch(config.saveUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        serverRevision = (await response.json()).revision;
        Object.assign(sourceDocument, payload);
        dirty = changeRevision !== revision;
      }
      if (saveUi) {
        const response = await fetch('/__config/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'ui', data: uiPayload }) });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        await response.json();
        savedUiMessages = { ...uiPayload.messages };
        uiDirty = uiChangeRevision !== uiRevision;
      }
      updateToolbar(dirty || uiDirty ? '本次写入完成；后续修改仍待保存' : '已写入正式配置');
      return { ok: true, file: saveUi && !saveText ? 'config/ui.json' : fileName(), revision: serverRevision,
        pending: dirty || uiDirty, document: payload };
    } catch (error) {
      updateToolbar(`写入失败，本页修改仍可重试：${error.message}`);
      return { ok: false, error };
    }
  }

  function reset() {
    // 撤销只恢复已落盘快照，不清空配置里的正式内容。
    replaceSnapshot(sourceDocument);
    dirty = false;
    if (uiDocument) uiDocument.messages = { ...savedUiMessages };
    uiDirty = false;
    uiChangeRevision++;
    changeRevision++;
    applyAll();
    scan();
    notify('*');
    updateToolbar('已恢复到上次写入的配置');
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function boot() {
    if (!SA.RELEASE && config.toolbar) createToolbar();
    wrapCanvasText();
    if (!SA.RELEASE) {
      document.addEventListener('pointerover', event => {
      if (editing && !isUiElement(event.target)) hovered = event.target;
    }, true);
    document.addEventListener('keydown', event => {
      if (!editing || isUiElement(event.target) || event.key !== 'F8' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault(); event.stopImmediatePropagation(); pinHover();
    }, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
      for (const type of ['pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'])
        document.addEventListener(type, suppressPageEvent, true);
    }
    observer = new MutationObserver(records => {
      if (records.every(record => isUiElement(record.target))) return;
      if (scanTimer) return;
      scanTimer = 1;
      queueMicrotask(() => { scanTimer = 0; scan(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  }

  function init(options = {}) {
    Object.assign(config, options);
    if (started) return api;
    started = true;
    if (document.head) {
      // 首页在脚本下载前已设遮罩；沿用它，待本地和文件覆盖均应用后再显示。
      startupStyle = document.getElementById('sa-text-startup-hide') || document.createElement('style');
      startupStyle.textContent = 'body{opacity:0!important}';
      if (!startupStyle.isConnected) document.head.append(startupStyle);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    Promise.resolve().then(load).catch(error => {
      fileLoadError = `文本加载失败：${error.message}`;
      loaded = true;
      scan();
      if (readyResolve) readyResolve(api);
    }).finally(() => { if (startupStyle) { startupStyle.remove(); startupStyle = null; } });
    return api;
  }

  const api = SA.RELEASE ? {
    init, ready, get, t: get, register, registerUi, homeLines, homeTips, bindText, bindAttr, canvas, draw, onChange,
    isEditing: () => false, file: fileName,
  } : {
    init, ready, load: reload, get, t: get, set, register, registerUi, homeLines, homeTips, bindText, bindAttr, canvas, draw,
    enterEdit, exitEdit, toggle, save, reset, remove, onChange,
    isEditing: () => editing,
    file: fileName,
    refresh: () => scan(),
  };

  return api;
})();

// 剧情数据接口：编辑前等待 SA.Text.ready；所有台词读取和写回同一份正式配置。
SA.StoryData = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const story = () => SA.STORY;

  // 场景 ID 来自现有剧情、战役关卡及通用对战槽，避免读取任意对象属性路径。
  function list() {
    const ids = ['opening', 'tutorial.intro', 'before.current', 'after.current'];
    (story().tutorial?.parts || []).forEach((_, i) => ids.push(`tutorial.parts.${i}`));
    for (const key of Object.keys(story().stage || {})) {
      if (!/^\d+,\d+$/.test(key)) continue;
      for (const outcome of ['win', 'lose']) if (story().stage[key][outcome]) ids.push(`stage.${key}.${outcome}`);
    }
    for (const id of Object.keys(story().feat || {})) ids.push(`feat.${id}`);
    (SA.CAMPAIGN || []).forEach((chapter, ci) => chapter.stages.forEach((_, si) => {
      ids.push(`before.${ci},${si}`, `after.${ci},${si}`);
    }));
    return ids;
  }

  function valid(id) {
    if (typeof id !== 'string' || !list().includes(id)) throw new Error(`无效剧情场景：${id}`);
  }

  // 每个场景在配置 values 中只有一份当前数据；空数组表示作者明确关闭该场景。
  function get(id) {
    valid(id);
    const raw = SA.Text.get(`story:${id}`, '[]');
    const lines = JSON.parse(raw);
    const speaker = id.startsWith('stage.') || id.startsWith('feat.') ? 'uncle' : null;
    return lines.map(line => typeof line === 'string' ? { text: line, ...(speaker ? { who: speaker } : {}) } : clone(line));
  }

  // set 接受字符串或 {text,who?,expr?,scene?}；省略元数据时沿用该位置原有值。expr = 说话人这一句的表情（SA.Coal.EXPR，旁白不带）。
  function set(id, lines) {
    valid(id);
    if (!Array.isArray(lines) || lines.length > 100) throw new Error('剧情必须是至多 100 行的数组');
    const old = get(id);
    const next = lines.map((line, i) => {
      if (typeof line !== 'string' && (!line || typeof line !== 'object' || Array.isArray(line))) throw new Error(`第 ${i + 1} 行格式无效`);
      const item = typeof line === 'string' ? { text: line } : line;
      if (Object.keys(item).some(key => !['text', 'who', 'expr', 'scene'].includes(key))) throw new Error(`第 ${i + 1} 行包含非法字段`);
      if (typeof item.text !== 'string' || !item.text.trim()) throw new Error(`第 ${i + 1} 行文本不能为空`);
      const row = { text: item.text };
      for (const key of ['who', 'expr', 'scene']) {
        const value = Object.hasOwn(item, key) ? item[key] : old[i]?.[key];
        if (value !== undefined) {
          if (typeof value !== 'string' || !value.trim()) throw new Error(`第 ${i + 1} 行 ${key} 无效`);
          if (key === 'who' && !Object.hasOwn(story().cast || {}, value)) throw new Error(`未知剧情角色：${value}`);
          if (key === 'scene' && !['sleep', 'roof', 'roll', 'car'].includes(value)) throw new Error(`未知开场分镜：${value}`);
          if (key === 'expr' && SA.Coal && (!Object.hasOwn(SA.Coal.EXPR, value) || value === 'blink')) throw new Error(`未知表情：${value}`);
          row[key] = value;
        }
      }
      if (!row.who) delete row.expr;
      return row;
    });
    const encoded = JSON.stringify(next);
    if (encoded.length > 10000) throw new Error('剧情场景超过 10000 字符的保存上限');
    SA.Text.set(`story:${id}`, encoded);
    return clone(next);
  }

  // 战役按“章,关”保存；其他对战共用 current 插入点。是否提示与展示由画面层决定。
  function point(phase, key = 'current') {
    if (phase !== 'before' && phase !== 'after') throw new Error('剧情插入点必须是 before 或 after');
    if (typeof key !== 'string' || (key !== 'current' && !/^\d+,\d+$/.test(key))) throw new Error('剧情插入点关卡无效');
    const id = `${phase}.${key}`;
    valid(id);
    return id;
  }

  async function save() { await SA.Text.ready; return SA.Text.save(); }
  // 发行包保留剧情读取与插入点，编辑和保存只向开发版开放。
  return SA.RELEASE ? { list, get, point } : { list, get, set, save, point };
})();
