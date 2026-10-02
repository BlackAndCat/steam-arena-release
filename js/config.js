// 所有可编辑内容统一从 config/*.json 同步加载，供既有脚本按原顺序初始化。
(function () {
  const host = typeof window === 'undefined' ? self : window;
  const page = typeof document === 'undefined' ? null : document;
  const SA = host.SA = host.SA || {};
  const source = page?.currentScript?.src || location.href;
  const projectRoot = new URL('../', source);
  const cache = Object.create(null);
  const renderedKeys = new Map();
  const migrationKey = 'sa-config-migrate=';
  const legacyKeys = ['steam_arena_stage_cars_local_v1', 'sa-text-steam-arena-zh-CN'];

  function legacy() {
    const data = {};
    for (const key of legacyKeys) {
      try { const value = localStorage.getItem(key); if (value) data[key] = value; }
      catch { /* 禁用本地存储时仍可读取正式配置。 */ }
    }
    return data;
  }
  function fail(message) {
    host.SA_CONFIG_ERROR = message;
    if (!page) throw new Error(message);
    const show = () => {
      page.getElementById('sa-text-startup-hide')?.remove();
      page.body.style.setProperty('opacity', '1', 'important');
      const panel = page.createElement('pre');
      panel.style.cssText = 'position:fixed;z-index:2147483647;inset:12px;padding:24px;background:#2d1010;color:white;white-space:pre-wrap;overflow:auto';
      panel.textContent = `配置加载失败：${message}\n旧作者数据仍保留；请启动 python tools/serve.py 后重试。`;
      page.body.append(panel);
    };
    if (page.body) show(); else page.addEventListener('DOMContentLoaded', show, { once: true });
    throw new Error(message);
  }
  // file 页面无法可靠写回 JSON；把旧作者缓存连同原路径交给本机服务一次迁入。
  if (page && location.protocol === 'file:') {
    if (SA.RELEASE) fail('发行包请通过发布网址或 HTTP 服务打开。');
    if (!location.href.startsWith(projectRoot.href)) fail('开发页面不在项目目录内。');
    const relative = location.href.slice(projectRoot.href.length).split(/[?#]/)[0];
    const payload = legacy();
    if (Object.keys(payload).length) payload.__returnHash = location.hash;
    const fragment = Object.keys(payload).length ? '#' + migrationKey + encodeURIComponent(JSON.stringify(payload)) : location.hash;
    location.replace('http://localhost:5173/' + relative + location.search + fragment);
    return;
  }
  if (page && !SA.RELEASE && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const incoming = location.hash.startsWith('#' + migrationKey) ? location.hash.slice(migrationKey.length + 1) : '';
    const httpLegacy = legacy();
    let payload = httpLegacy;
    if (incoming) {
      try { payload = { ...JSON.parse(decodeURIComponent(incoming)), __shadow: httpLegacy }; }
      catch { fail('旧作者数据片段无法解析。'); }
    }
    if (Object.keys(payload).length) {
      const request = new XMLHttpRequest();
      request.open('POST', '/__config/migrate', false);
      request.setRequestHeader('Content-Type', 'application/json');
      try { request.send(JSON.stringify(payload)); }
      catch (error) { fail('旧作者数据迁入失败：' + error.message); }
      if (request.status !== 200) fail('旧作者数据迁入失败：' + (request.responseText || request.status));
      if (incoming) history.replaceState(null, '', location.pathname + location.search + (payload.__returnHash || ''));
    }
  }
  SA.Config = {
    get(name) {
      if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('非法配置名：' + name);
      if (cache[name]) return cache[name];
      const request = new XMLHttpRequest();
      const suffix = SA.RELEASE && SA.RELEASE_VERSION ? '?v=' + encodeURIComponent(SA.RELEASE_VERSION) : '';
      request.open('GET', new URL('config/' + name + '.json' + suffix, projectRoot).href, false);
      if (!SA.RELEASE) request.setRequestHeader('Cache-Control', 'no-cache');
      request.send();
      if (request.status !== 200) fail(`${name}.json：HTTP ${request.status}`);
      try { return cache[name] = JSON.parse(request.responseText); }
      catch { return fail(`${name}.json 不是有效 JSON。`); }
    },
    replace(name, data) { cache[name] = data; return data; },
    clear(name) { if (name) delete cache[name]; else for (const key of Object.keys(cache)) delete cache[key]; },
    // 模板只替换显式编号占位符；作者编辑器可按 key 保存完整原模板。
    text(key, ...args) {
      const template = this.get('ui').messages[key];
      if (typeof template !== 'string') throw new Error('缺少界面文案：' + key);
      const rendered = template.replace(/\{\{(\d+)\}\}/g, (_, index) => String(args[+index]));
      const previous = renderedKeys.get(rendered);
      renderedKeys.set(rendered, previous === undefined || previous === key ? key : null);
      SA.Text?.registerUi?.(key, rendered, template, args);
      return rendered;
    },
    keyForText(rendered) { return renderedKeys.get(String(rendered)) || null; },
  };
  if (page && page.title === '') page.title = SA.Config.text('page_title');
})();
