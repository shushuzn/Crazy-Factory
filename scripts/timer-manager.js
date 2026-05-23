/**
 * 统一定时管理器
 *
 * 为什么需要：原代码中散布 15+ 个独立 setInterval，各自独立计时，互相碎片化主线程。
 * 合并到单一 RAF 循环后，所有定时任务共享一个调度器，减少 timer 开销与 layout thrashing。
 *
 * 用法：
 *   const tm = createTimerManager();
 *   tm.schedule(fn, 5000);       // 每 5 秒
 *   tm.schedule(fn, 100, true); // 每 100ms（高频率）
 *   tm.cancel(fn);               // 取消
 *   tm.destroy();                // 销毁所有
 */
const createTimerManager = () => {
  const tasks = []; // [{ fn, intervalMs, lastRun, enabled }]
  let _idleHandle = null;

  const schedule = (fn, intervalMs, immediate = false) => {
    cancelImpl(fn);
    tasks.push({
      fn,
      intervalMs,
      lastRun: immediate ? -Infinity : performance.now(),
      enabled: true,
    });
  };

  const cancelImpl = (fn) => {
    const idx = tasks.findIndex((t) => t.fn === fn);
    if (idx !== -1) tasks.splice(idx, 1);
  };
  const cancel = (fn) => cancelImpl(fn);

  const cancelAll = () => { tasks.length = 0; };

  // 由主 RAF 循环每帧调用
  const tick = (now) => {
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t.enabled) continue;
      if (now - t.lastRun >= t.intervalMs) {
        try {
          t.fn();
        } catch (e) {
          console.error('[TimerManager]', t.fn.name || 'anonymous', e);
        }
        t.lastRun = now;
      }
    }
  };

  // requestIdleCallback 调度器 — 在浏览器空闲时运行低优先级任务
  const _runIdleTasks = (deadline) => {
    while (deadline.timeRemaining() > 0 && tasks.length > 0) {
      const t = tasks.find((t) => t.enabled && performance.now() - t.lastRun >= t.intervalMs);
      if (!t) break;
      try {
        t.fn();
      } catch (e) {
        console.error('[TimerManager:idle]', t.fn.name || 'anonymous', e);
      }
      t.lastRun = performance.now();
    }
    // 继续调度下一批
    if (typeof requestIdleCallback !== 'undefined') {
      _idleHandle = requestIdleCallback(_runIdleTasks, { timeout: 2000 });
    }
  };

  const scheduleIdle = (fn, intervalMs) => {
    // 先按普通调度器注册，保持定时逻辑
    schedule(fn, intervalMs);
    // 同时启动 idle 调度（如果还未启动）
    if (_idleHandle === null && typeof requestIdleCallback !== 'undefined') {
      _idleHandle = requestIdleCallback(_runIdleTasks, { timeout: 2000 });
    }
  };

  const setEnabled = (fn, enabled) => {
    const t = tasks.find((t) => t.fn === fn);
    if (t) t.enabled = enabled;
  };

  const getTasks = () => tasks.map((t) => ({
    name: t.fn.name || 'anonymous',
    intervalMs: t.intervalMs,
    enabled: t.enabled,
    nextIn: Math.max(0, t.intervalMs - (performance.now() - t.lastRun)),
  }));

  return { schedule, scheduleIdle, cancel, cancelAll, tick, setEnabled, getTasks };
};

// 全局单例（供各子系统使用）
window.__timerManager = createTimerManager();
