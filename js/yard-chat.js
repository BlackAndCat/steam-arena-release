// 院子闲谈的数据、章节继承和调度。绘制气泡与人物动作仍由 Home 负责。
window.SA = window.SA || {};

SA.YardChat = (() => {
  const KEY = 'home:chat:';
  const ABSENT = '\u0000yard-chat-absent\u0000';
  // 闲谈默认池与参数只读正式文本配置，不在代码中保留第二份台词。
  const cooldowns = new Map(); // 同一游戏会话内重建院子时仍记住各组上次开始时间。
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaultSettings = () => JSON.parse(SA.Text.get(`${KEY}settings`, '{}'));

  // 三个人物的点击提示模板在配置中；工作台独立打开时，老汤姆使用通用提示。
  function clickTips() {
    const data = SA.S?.d;
    const problems = data && SA.V?.stats ? SA.V.stats(data.vehicle).problems : [];
    const stage = data && SA.Camp?.current ? SA.Camp.current() : null;
    const tip = name => SA.Text.get(`home:tip:template:${name}`);
    const defaults = {
      tom: problems?.length ? tip('tomProblems').replace('{问题}', problems[0])
        : stage ? tip('tomStage').replace('{关卡名}', stage.name).replace('{车手}', stage.pilot)
        : tip('tomComplete'),
      rel: tip('rel'), tim: tip('tim'),
    };
    return SA.Text?.homeTips ? SA.Text.homeTips(defaults) : defaults;
  }
  const scopeKey = scope => `${KEY}pool:${scope}`;

  // 存档里的章、关为零基序号；关卡完成后仍可继承所在章节的聊天。
  function currentScope() {
    const camp = SA.S?.d?.camp;
    const ci = camp?.ch, si = camp?.st;
    if (!Number.isInteger(ci) || !SA.CAMPAIGN?.[ci]) return 'global';
    if (Number.isInteger(si) && SA.CAMPAIGN[ci].stages?.[si]) return `stage:${ci}:${si}`;
    return `chapter:${ci}`;
  }

  function validScope(scope) {
    if (scope === 'global') return;
    const chapter = /^chapter:(\d+)$/.exec(scope);
    if (chapter && SA.CAMPAIGN?.[+chapter[1]]) return;
    const stage = /^stage:(\d+):(\d+)$/.exec(scope);
    if (stage && SA.CAMPAIGN?.[+stage[1]]?.stages?.[+stage[2]]) return;
    throw new Error('聊天范围无效，请选择现有章节或关卡');
  }

  function fallbackScopes(scope) {
    if (scope.startsWith('stage:')) return [scope, `chapter:${scope.split(':')[1]}`, 'global'];
    if (scope.startsWith('chapter:')) return [scope, 'global'];
    return ['global'];
  }

  function read(scope = currentScope()) {
    validScope(scope);
    for (const candidate of fallbackScopes(scope)) {
      const raw = SA.Text.get(scopeKey(candidate), ABSENT);
      // 缺少该范围配置才继承上级；作者显式保存空数组表示清空该池。
      if (raw !== ABSENT) return { source: candidate, groups: raw === '' ? [] : clone(JSON.parse(raw)) };
    }
    return { source: 'default', groups: clone(JSON.parse(SA.Text.get(scopeKey('default'), '[]'))) };
  }

  function settings() {
    return defaultSettings();
  }

  function checkSeconds(value, label, positive = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (positive ? 0.1 : 0) || value > 3600)
      throw new Error(`${label}必须是${positive ? '0.1～3600' : '0～3600'}秒`);
  }

  // 纯校验供工作台在写入配置前检查全部范围。
  function validateSettings(next) {
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('整体聊天设置格式无效');
    if (Object.keys(next).some(key => !['intervalSec', 'bubbleSec', 'replySec'].includes(key))) throw new Error('整体聊天设置包含未知项目');
    const result = { intervalSec: next.intervalSec, bubbleSec: next.bubbleSec, replySec: next.replySec };
    checkSeconds(result.intervalSec, '聊天间隔', true);
    checkSeconds(result.bubbleSec, '气泡留存时间');
    checkSeconds(result.replySec, '连续对答间隔', true);
    return result;
  }

  function setSettings(next) {
    const result = validateSettings({ ...settings(), ...next });
    SA.Text.set(`${KEY}settings`, JSON.stringify(result));
    return result;
  }

  // 每一组可独立设权重与冷却；内容大小受页面管理服务单个值上限约束。
  function validateGroups(groups) {
    if (!Array.isArray(groups) || groups.length > 100) throw new Error('聊天内容必须是至多100组的数组');
    const ids = new Set();
    groups.forEach((group, i) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(`第${i + 1}组格式无效`);
      if (typeof group.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(group.id) || ids.has(group.id)) throw new Error(`第${i + 1}组标识无效或重复`);
      ids.add(group.id);
      if (typeof group.name !== 'string' || !group.name.trim() || group.name.length > 100) throw new Error(`第${i + 1}组名称不能为空或超过100字`);
      checkSeconds(group.weight, `第${i + 1}组权重`);
      checkSeconds(group.cooldownSec, `第${i + 1}组冷却`);
      if (!['any', 'rain', 'night'].includes(group.weather)) throw new Error(`第${i + 1}组天气无效`);
      if (!Array.isArray(group.lines) || !group.lines.length || group.lines.length > 20) throw new Error(`第${i + 1}组必须有1～20句`);
      group.lines.forEach((line, j) => {
        if (!line || !['rel', 'tom', 'tim'].includes(line.who)) throw new Error(`第${i + 1}组第${j + 1}句角色无效`);
        if (typeof line.text !== 'string' || !line.text.trim() || line.text.length > 500) throw new Error(`第${i + 1}组第${j + 1}句内容不能为空或超过500字`);
        if (typeof line.action !== 'string' || !/^[a-z]{1,24}$/.test(line.action)) throw new Error(`第${i + 1}组第${j + 1}句动作无效`);
      });
    });
    const encoded = JSON.stringify(groups);
    if (encoded.length > 10000) throw new Error('本范围聊天超过10000字符的保存上限，请拆到章节或关卡');
    return clone(groups);
  }

  function write(scope, groups) {
    validScope(scope);
    SA.Text.set(scopeKey(scope), JSON.stringify(validateGroups(groups)));
    return read(scope);
  }

  function inherit(scope) {
    validScope(scope);
    SA.Text.remove(scopeKey(scope));
    return read(scope);
  }

  async function save() {
    await SA.Text.ready;
    const result = await SA.Text.save();
    if (result.ok && result.document && typeof BroadcastChannel === 'function') {
      const channel = new BroadcastChannel('sa-yard-chat');
      channel.postMessage({ type: 'saved', document: result.document });
      channel.close();
    }
    return result;
  }

  function formatLine(line) {
    const stage = SA.Camp?.current?.();
    return { ...line, text: line.text.includes('{关卡名}')
      ? stage ? line.text.replaceAll('{关卡名}', stage.name) : SA.Text.get('home:tip:template:noStage')
      : line.text };
  }

  // 平滑加权轮询：同权重按编辑器顺序播；每组播完后才挑下一组。
  function createPlayer(scope = currentScope(), present = ['rel', 'tom', 'tim']) {
    // 人物离开院子时整组对话暂停，避免其台词被其他人的气泡接着说出。
    const groups = read(scope).groups.filter(group => group.lines.every(line => present.includes(line.who)));
    const scores = new Map();
    let active = null, lineIndex = 0, nextAt = -Infinity, bubbleUntil = -Infinity;
    let currentLine = null, forced = null;
    const choose = (now, weather) => {
      const pool = groups.filter(group => group.weight > 0 && (group.weather === 'any' || group.weather === weather)
        && now >= (cooldowns.get(`${scope}:${group.id}`) ?? -Infinity) + group.cooldownSec);
      if (!pool.length) return null;
      const sum = pool.reduce((n, group) => n + group.weight, 0);
      let best = null;
      for (const group of pool) {
        const score = (scores.get(group.id) || 0) + group.weight;
        scores.set(group.id, score);
        if (!best || score > scores.get(best.id)) best = group;
      }
      scores.set(best.id, scores.get(best.id) - sum);
      cooldowns.set(`${scope}:${best.id}`, now);
      return best;
    };
    function step(nowSec, weather = 'sun') {
      const cfg = settings();
      if (forced) {
        currentLine = forced; forced = null;
        bubbleUntil = nowSec + cfg.bubbleSec;
        nextAt = nowSec + (active ? cfg.replySec : cfg.intervalSec);
        return { line: currentLine, expired: false };
      }
      if (nowSec >= nextAt) {
        if (!active) { active = choose(nowSec, weather); lineIndex = 0; }
        if (active) {
          currentLine = formatLine(active.lines[lineIndex++]);
          const hasReply = lineIndex < active.lines.length;
          if (!hasReply) active = null;
          nextAt = nowSec + (hasReply ? cfg.replySec : cfg.intervalSec);
          bubbleUntil = nowSec + cfg.bubbleSec;
          return { line: currentLine, expired: false };
        }
        nextAt = nowSec + 0.1;
      }
      return { line: currentLine, expired: !!currentLine && nowSec >= bubbleUntil };
    }
    function force(who, text) { if (present.includes(who)) forced = { who, text, action: 'talk', trustedHtml: true }; }
    return { step, force };
  }

  // 发行包只读随包配置，开发页只广播已落盘的正式配置。
  if (!SA.RELEASE && typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel('sa-yard-chat');
    channel.onmessage = event => {
      if (event.data?.type === 'saved' && event.data.document)
        SA.Text.load?.(event.data.document).catch(() => {});
    };
  }

  return SA.RELEASE ? { currentScope, read, settings, createPlayer, clickTips }
    : { currentScope, read, settings, validateSettings, setSettings, validateGroups, write, inherit, save, createPlayer, clickTips };
})();
