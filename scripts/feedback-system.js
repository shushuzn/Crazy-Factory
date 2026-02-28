// 反馈系统工厂
// 为什么拆出来：反馈（音效/动效）迭代频率高，独立文件可避免污染经济与渲染主流程。
const createFeedbackSystem = ({ st, JUICE, fmt, manualBtn, manualZone, marketFlashEl, gameShellEl }) => {
  // 轻量事件总线：保持事件驱动，不把反馈细节写进业务逻辑。
  const listeners = new Map();
  const eventBus = {
    on(event, handler) {
      const bucket = listeners.get(event) || [];
      bucket.push(handler);
      listeners.set(event, bucket);
    },
    emit(event, payload) {
      (listeners.get(event) || []).forEach((fn) => fn(payload));
    }
  };

  // Web Audio：纯合成，无外部资源依赖，适合原型快速迭代。
  let audioCtx = null;
  const getAudioCtx = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  };

  const playTone = (freq, type, duration, gainVal, detune = 0) => {
    if (!st.soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  };

  const sfxClick = () => playTone(520, 'triangle', 0.08, 0.12);
  const sfxBuy = () => {
    playTone(330, 'square', 0.12, 0.08);
    playTone(440, 'square', 0.1, 0.06, 50);
  };
  const sfxUpgrade = () => {
    playTone(660, 'sine', 0.15, 0.1);
    setTimeout(() => playTone(880, 'sine', 0.2, 0.08), 80);
  };
  const sfxMarket = (bull) => playTone(bull ? 330 : 220, 'sawtooth', 0.25, 0.06, bull ? 0 : -20);

  // P4-T2: 新增音效
  const sfxAchievement = () => {
    // 胜利音效：上行音阶
    playTone(523, 'sine', 0.1, 0.1); // C5
    setTimeout(() => playTone(659, 'sine', 0.1, 0.1), 100); // E5
    setTimeout(() => playTone(784, 'sine', 0.1, 0.1), 200); // G5
    setTimeout(() => playTone(1047, 'sine', 0.3, 0.12), 300); // C6
  };

  const sfxSkill = () => {
    // 技能升级：科幻感音效
    playTone(440, 'triangle', 0.05, 0.06);
    setTimeout(() => playTone(554, 'triangle', 0.05, 0.06), 60);
    setTimeout(() => playTone(659, 'triangle', 0.1, 0.08), 120);
  };

  const sfxPrestige = () => {
    // Prestige：庄重音效
    playTone(262, 'sine', 0.2, 0.1); // C4
    setTimeout(() => playTone(330, 'sine', 0.2, 0.1), 150); // E4
    setTimeout(() => playTone(392, 'sine', 0.2, 0.1), 300); // G4
    setTimeout(() => playTone(523, 'sine', 0.4, 0.12), 450); // C5
  };

  const spawnFloat = (x, y, text, color = '#fbbf24') => {
    const el = document.createElement('div');
    el.className = 'float-num';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  };

  // 事件驱动反馈注册：业务层只 emit，不关心如何表现。
  eventBus.on('manual:clicked', ({ x, y, gain }) => {
    sfxClick();
    spawnFloat(
      x + (Math.random() * JUICE.manualFloatJitter * 2 - JUICE.manualFloatJitter),
      y - 10,
      `+${fmt(gain)}`
    );
    manualBtn.classList.remove('clicked');
    if (JUICE.clickPulseResetReflow) void manualBtn.offsetWidth;
    manualBtn.classList.add('clicked');

    const rect = manualZone.getBoundingClientRect();
    manualZone.style.setProperty('--rx', `${((x - rect.left) / rect.width) * 100}%`);
    manualZone.style.setProperty('--ry', `${((y - rect.top) / rect.height) * 100}%`);
    manualZone.classList.add('ripple');
    setTimeout(() => manualZone.classList.remove('ripple'), JUICE.rippleDurationMs);
  });

  eventBus.on('market:switched', ({ isBull }) => {
    marketFlashEl.style.background = isBull ? '#10b981' : '#ef4444';
    marketFlashEl.classList.add('on');
    setTimeout(() => marketFlashEl.classList.remove('on'), JUICE.marketFlashDurationMs);

    if (!gameShellEl) return;
    gameShellEl.style.setProperty('--shake-x', `${JUICE.marketShakePx}px`);
    gameShellEl.classList.remove('screen-shake');
    void gameShellEl.offsetWidth;
    gameShellEl.classList.add('screen-shake');
    setTimeout(() => gameShellEl.classList.remove('screen-shake'), JUICE.marketShakeMs);
  });

  // P4-T2: 新增视觉反馈效果
  const spawnParticles = (x, y, count = 8, color = '#fbbf24') => {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 6px;
        height: 6px;
        background: ${color};
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
      `;
      document.body.appendChild(p);

      const angle = (Math.PI * 2 * i) / count;
      const velocity = 50 + Math.random() * 50;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;

      p.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
      ], {
        duration: 600 + Math.random() * 200,
        easing: 'cubic-bezier(0,.9,.57,1)',
      }).onfinish = () => p.remove();
    }
  };

  const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      achievement: '#8b5cf6',
    };
    toast.className = 'game-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: toastSlideDown 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 添加动画样式
    if (!document.getElementById('toastStyles')) {
      const style = document.createElement('style');
      style.id = 'toastStyles';
      style.textContent = `
        @keyframes toastSlideDown {
          from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => {
      toast.style.animation = 'toastSlideDown 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, JUICE.toastDurationMs || 2500);
  };

  // 事件监听：成就解锁
  eventBus.on('achievement:unlocked', ({ name, x, y }) => {
    sfxAchievement();
    spawnParticles(x, y, 12, '#8b5cf6');
    showToast(`🏆 成就解锁: ${name}`, 'achievement');
  });

  // 事件监听：技能升级
  eventBus.on('skill:upgraded', ({ name, level, x, y }) => {
    sfxSkill();
    spawnParticles(x, y, 10, '#3b82f6');
    showToast(`✨ ${name} 升级到 Lv.${level}`, 'success');
  });

  // 事件监听：建筑批量购买
  eventBus.on('building:bulkBuy', ({ count, x, y }) => {
    if (count >= 10) {
      spawnParticles(x, y, Math.min(count / 2, 20), '#10b981');
    }
  });

  // 事件监听：Prestige
  eventBus.on('prestige:executed', ({ rpGain, x, y }) => {
    sfxPrestige();
    spawnParticles(x, y, 20, '#f59e0b');
    showToast(`🌟 增发股权完成! 获得 ${rpGain} RP`, 'success');
  });

  return {
    eventBus,
    sfxBuy,
    sfxUpgrade,
    sfxMarket,
    sfxAchievement,
    sfxSkill,
    sfxPrestige,
    spawnFloat,
    spawnParticles,
    showToast,
  };
};
