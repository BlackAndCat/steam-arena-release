// 动态处理：所有「会动的部件」共用的一套状态与量化工具。
// 履带 / 腿（行驶相位）、炮管制退与复进（后坐曲线）、机枪供弹链（射击计数相位）、整车晃动（阻尼弹簧）
// 都用这里的原语描述，渲染层只读量化后的整数帧，精灵按帧缓存。
window.SA = window.SA || {};

SA.Dyn = (() => {
  // ---------- 阻尼弹簧：车身晃动、撞击回弹 ----------
  // x 位移，v 速度；kick() 加一次冲量；step() 按弹簧 + 阻尼回到 0
  function spring(k = 160, c = 11) { return { x: 0, v: 0, k, c }; }
  function kick(s, impulse) { s.v += impulse; }
  function stepSpring(s, dt) {
    const a = -s.k * s.x - s.c * s.v;
    s.v += a * dt; s.x += s.v * dt;
    if (Math.abs(s.x) < 0.001 && Math.abs(s.v) < 0.01) { s.x = 0; s.v = 0; }
  }

  // ---------- 后坐：开火瞬间炮管被推到底（制退），短暂停顿后由复进机慢慢推回 ----------
  // back：打到底后停顿的秒数；ret：复进速度（每秒回位的比例，越接近原位越慢）
  function recoil(back = 0.04, ret = 3) { return { x: 0, hold: 0, back, ret }; }
  function fire(r) { r.x = 1; r.hold = r.back; }
  function stepRecoil(r, dt) {
    if (r.hold > 0) { r.hold -= dt; return; }
    if (r.x > 0) r.x = Math.max(0, r.x - dt * r.ret * (0.25 + r.x));
  }

  // ---------- 相位：连续累加量（行驶距离、射击次数），给履带 / 腿 / 供弹链用 ----------
  // frame(x, n, per)：把相位量化成 n 帧循环（per = 每帧跨过的相位量）
  const frame = (x, n, per = 1) => ((Math.floor((x || 0) / per) % n) + n) % n;
  // 量化 0~1 的连续值到 steps 档：精灵缓存只认有限的帧
  const quant = (x, steps) => Math.round(Math.max(0, Math.min(1, x || 0)) * steps);

  // ---------- 载具动画器：一辆车一个，按格子 key 存各部件的动态状态 ----------
  // key 形如 "r,c,b"（主体）/ "r,c,s"（侧挂），与战斗里武器的 key 一致
  function animator() {
    const parts = new Map();
    const A = {
      phase: 0,                 // 行驶相位（px）：履带链节、腿的步态
      body: spring(),           // 整车晃动（前后，px）
      part(key, make) {         // 取 / 建一个部件的状态
        let p = parts.get(key);
        if (!p) { p = make ? make() : {}; parts.set(key, p); }
        return p;
      },
      // 武器开火：炮管后坐 + 供弹相位 +1
      gun(key, m) {
        const p = A.part(key);
        if (!p.rc) Object.assign(p, { rc: recoil(m.back || 0.04, m.ret || 3), feed: p.feed || 0, flash: 0 });
        fire(p.rc); p.feed++; p.flash = 1;
        return p;
      },
      step(dt, dx = 0) {
        A.phase += dx;
        stepSpring(A.body, dt);
        for (const p of parts.values()) {
          if (p.rc) stepRecoil(p.rc, dt);
          if (p.flash) p.flash = Math.max(0, p.flash - dt * 8);
        }
      },
      // 渲染用：某个部件当前的后坐（0~1）和供弹相位
      recoilOf(key) { const p = parts.get(key); return p && p.rc ? p.rc.x : 0; },
      feedOf(key) { const p = parts.get(key); return p ? p.feed || 0 : 0; },
      flashOf(key) { const p = parts.get(key); return p ? p.flash || 0 : 0; },
    };
    return A;
  }

  return { spring, kick, stepSpring, recoil, fire, stepRecoil, frame, quant, animator };
})();
