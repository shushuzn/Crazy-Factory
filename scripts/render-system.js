// 渲染系统工厂
// 为什么拆分：渲染是高频路径，独立后更容易做性能优化和UI迭代。
const createRenderSystem = ({
  st,
  disp,
  dirty,
  buildings,
  upgrades,
  skills,
  achievements,
  questChain,
  buildingViewMap,
  upgradeViewMap,
  skillViewMap,
  achievViewMap,
  modeButtons,
  speedButtons,
  autoBuyBtn,
  soundBtn,
  gearsEl,
  gpsEl,
  rpDisplayEl,
  rpMetaEl,
  manualDesc,
  comboEl,
  offlineEl,
  offlineTextEl,
  rewardFeedEl,
  eventLogEl,
  statBldEl,
  statUpgEl,
  statAchEl,
  statQstEl,
  statModeEl,
  statLifeEl,
  skillMasteryMetaEl,
  perkViewMap,
  speedQuestViewMap,
  goalTitleEl,
  goalFillEl,
  goalHintEl,
  goalPctEl,
  questRewardEl,
  fmt,
  mktMult,
  getTotalGPS,
  getManualGain,
  affordableCount,
  purchaseCost,
  isBldUnlocked,
  price,
  upgradeLockedReason,
  claimAchievement,
  grantReward,
  saveGame,
  renderMarket,
  getTotalSkillLevels,
  SKILL_MASTERY_BONUS,
  SMOOTH_SPEED,
  RENDER_THROTTLE,
  prestigePerks,
  speedQuests,
}) => {
  let lastRender = 0;

  // 值变化缓存：直接存原始值 + 键由 game.js 初始化时预计算（消除每帧 b.id+'|field' 拼接分配）
  const _prevVals = new Map();

  // fmt 缓存：整数部分不变时跳过，避免每帧生成新字符串（减少 GC 压力）
  let _gearsFmtKey = null, _gearsFmtTxt = '';
  let _gpsFmtKey = null, _gpsFmtTxt = '';

  // 增量日志渲染状态（提升到闭包顶层，避免每次 render() 重建）
  let _renderedLogKeys = [];

  // 统计面板缓存（dirty.stats 时才更新，避免每帧 reduce/filter）
  let _statsCache = { bldCount: 0, purchasedUpgrades: 0, totalUpgrades: 0, doneAchiev: 0, totalAchiev: 0 };

  // 按钮状态缓存（避免每帧 classList.toggle / textContent 无谓执行）
  let _prevAutoBuy = null;
  let _prevSoundEnabled = null;
  let _prevPurchaseMode = null;
  let _prevGameSpeed = null;

  const _changed = (key, next) => {
    if (_prevVals.get(key) !== next) { _prevVals.set(key, next); return true; }
    return false;
  };

  const renderQuest = () => {
    if(st.questIndex>=questChain.length){
      goalTitleEl.textContent='产业目标：全部完成！'; goalFillEl.style.width='100%';
      goalHintEl.textContent='恭喜，金融帝国已建成'; goalPctEl.textContent='100%';
      questRewardEl.textContent='全部奖励已领取'; return;
    }
    const q=questChain[st.questIndex];
    const cur=q.progress(), pct=Math.min(100,(cur/q.target)*100);
    goalTitleEl.textContent=q.title;
    goalFillEl.style.width=`${pct}%`;
    goalHintEl.textContent= cur>=q.target?'目标达成，奖励已发放':`进度 ${cur} / ${q.target}`;
    goalPctEl.textContent=`${pct.toFixed(0)}%`;
    questRewardEl.textContent=`奖励：${q.rewardText}`;
    if(cur>=q.target){ grantReward(q.reward,`任务「${q.title}」`); st.questIndex++; dirty.quest = dirty.gears = dirty.stats = dirty.logs = true; saveGame(); }
  };

  const smoothUpdate = (target) => {
    const diff = target - disp.gears;
    if(Math.abs(diff) < 1) { disp.gears = target; return target; }
    disp.gears += diff * SMOOTH_SPEED;
    return disp.gears;
  };

  const render = (force = false) => {
    const now = performance.now();
    if(!force && now - lastRender < RENDER_THROTTLE) return;
    lastRender = now;

    const targetGPS = getTotalGPS();
    disp.gps += (targetGPS - disp.gps) * SMOOTH_SPEED;
    disp.gears = smoothUpdate(st.gears);
    const gKey = Math.floor(disp.gears);
    if (gKey !== _gearsFmtKey) { _gearsFmtKey = gKey; _gearsFmtTxt = fmt(disp.gears); }
    gearsEl.textContent = _gearsFmtTxt;
    const gpsKey = Math.floor(disp.gps);
    if (gpsKey !== _gpsFmtKey) { _gpsFmtKey = gpsKey; _gpsFmtTxt = fmt(disp.gps); }
    gpsEl.textContent = `收益率 ${_gpsFmtTxt}/s`;
    if(_changed('rp|val', st.researchPoints)) {
      rpDisplayEl.textContent = `${st.researchPoints} RP`;
      rpMetaEl.textContent = `研究加成 ×${(1 + st.researchPoints * 0.1).toFixed(1)}`;
    }
    const momentumStacks = Math.max(0, Math.floor(st.marketMomentum || 0));
    const momentumPct = momentumStacks * 8;
    const baseDrag = Math.max(0.72, 1 - (st.policyRate || 0) * 0.035);
    const hedge = Math.max(0, Math.min(0.6, Number(st.policyHedge) || 0));
    const policyMult = Math.min(1, baseDrag + (1 - baseDrag) * hedge);
    const rateHint = `利率效率 ${(policyMult * 100).toFixed(1)}%`;
    const manualTxt = momentumStacks > 0
      ? `每次撮合 +${fmt(getManualGain())}（多头连击 ${momentumStacks} 层，手动+${momentumPct}%｜${rateHint}）`
      : `每次撮合 +${fmt(getManualGain())}（${rateHint}）`;
    if(_changed('manual', manualTxt)) manualDesc.textContent = manualTxt;
    // 连击显示
    const combo = st.combo || 0;
    const comboMult = combo >= 2 ? (1 + Math.min(combo - 1, 99) * 0.05).toFixed(2) : null;
    if (comboEl) {
      if (combo >= 2) {
        comboEl.style.display = '';
        comboEl.textContent = `🔥 连击 ×${combo}${comboMult ? `（收益 ×${comboMult}）` : ''}`;
      } else {
        comboEl.style.display = 'none';
      }
    }
    if(dirty.market) renderMarket();

    if(dirty.buildings){
      const _vis = window.__visibleBuildingIds;
      for(const b of buildings){
        const v=buildingViewMap.get(b.id); if(!v) continue;
        // 虚拟滚动优化：不可见建筑跳过 DOM 更新（保留 JS 计算，但省去 DOM 操作）
        if (_vis && _vis.size > 0 && !_vis.has(b.id)) continue;
        const cnt=affordableCount(b,st.gears,st.purchaseMode);
        const pc =st.purchaseMode==='max'?cnt:Math.min(cnt,Number(st.purchaseMode)||1);
        const spc=Math.max(1,pc||0);
        const unlocked=isBldUnlocked(b);
        if(_changed(b._ck.owned, b.owned)) v.ownedEl.textContent=b.owned;
        const buyLabel=`购买 ×${spc}（${fmt(purchaseCost(b,spc))}）`;
        if(_changed(b._ck.buy, buyLabel)) v.buyBtn.textContent=buyLabel;
        v.buyBtn.disabled=!(cnt>0&&unlocked);
        const lockTxt=!unlocked?`解锁条件：历史资本 ${fmt(b.unlock)}`:'';
        if(_changed(b._ck.lock, lockTxt)) v.lockEl.textContent=lockTxt;
        const hintTxt=(unlocked&&cnt<=0)?`还差 ${fmt(price(b)-st.gears)}`:'';
        if(_changed(b._ck.hint, hintTxt)) v.hintEl.textContent=hintTxt;
      }
      dirty.buildings = false;
      _statsCache.bldCount = buildings.reduce((s, b) => s + b.owned, 0);
    }

    if(dirty.upgrades){
      const _visUpg = window.__visibleUpgradeIds;
      for(const u of upgrades){
        const v=upgradeViewMap.get(u.id); if(!v) continue;
        // 虚拟滚动优化：不可见升级跳过 DOM 更新
        if (_visUpg && _visUpg.size > 0 && !_visUpg.has(u.id)) continue;
        if(u.purchased){
          if(_changed(u._ck.btn,'已研发')) v.btn.textContent='已研发';
          v.btn.disabled=true;
          if(_changed(u._ck.lock,'')) v.lockEl.textContent='';
          continue;
        }
        const lr=upgradeLockedReason(u);
        const btnTxt=`研发（${fmt(u.price)}）`;
        const isDisabled=st.gears<u.price||Boolean(lr);
        if(_changed(u._ck.lock,lr)) v.lockEl.textContent=lr;
        if(_changed(u._ck.btn,btnTxt)) v.btn.textContent=btnTxt;
        if(_changed(u._ck.disabled, isDisabled)) v.btn.disabled=isDisabled;
      }
      dirty.upgrades = false;
      _statsCache.purchasedUpgrades = upgrades.filter(u => u.purchased).length;
      _statsCache.totalUpgrades = upgrades.length;
    }

    if(dirty.quest) renderQuest();

    if(dirty.skills){
      for(const sk of skills){
        const v=skillViewMap.get(sk.id); if(!v) continue;
        const metaTxt=`等级 ${sk.level}/${sk.maxLevel}`;
        if(_changed(sk._ck.meta,metaTxt)) v.meta.textContent=metaTxt;
        if(sk.level>=sk.maxLevel){
          if(_changed(sk._ck.btn,'已满级')) v.btn.textContent='已满级';
          v.btn.disabled=true;
        }else{
          const isDisabled=st.researchPoints<sk.costRP;
          const btnTxt=`升级（${sk.costRP} RP）`;
          if(_changed(sk._ck.btn,btnTxt)) v.btn.textContent=btnTxt;
          if(_changed(sk._ck.disabled, isDisabled)) v.btn.disabled=isDisabled;
        }
      }
      if(skillMasteryMetaEl){
        const totalLv = getTotalSkillLevels();
        const masteryTxt=`专精 T${st.skillMasteryTier} · 总技能等级 ${totalLv} · 总收益加成 ×${(1 + st.skillMasteryTier * SKILL_MASTERY_BONUS).toFixed(2)}`;
        if(_changed('skillMastery',masteryTxt)) skillMasteryMetaEl.textContent=masteryTxt;
      }
      dirty.skills = false;
    }

    if(dirty.achievements){
      for(const a of achievements){
        if(!a.done&&a.check()){a.done=true;claimAchievement(a);}
        const v=achievViewMap.get(a.id); if(!v) continue;
        const done=a.done;
        v.badge.classList.toggle('done',done);
        const badgeTxt=done?(a.claimed?'已完成✓':'已完成'):'未完成';
        if(_changed(a._ck.badge,badgeTxt)) v.badge.textContent=badgeTxt;
      }
      dirty.achievements = false;
      _statsCache.doneAchiev = achievements.filter(a => a.done).length;
      _statsCache.totalAchiev = achievements.length;
    }

    if(st.pendingOfflineGears>0){
      if(_changed('offline|show','1')) offlineEl.style.display='flex';
      const txt=`离线期间产生收益 ${fmt(st.pendingOfflineGears)}`;
      if(_changed('offline|txt',txt)) offlineTextEl.textContent=txt;
    }else{
      if(_changed('offline|show','0')) offlineEl.style.display='none';
    }

    if(_changed('reward', st.lastRewardText||'')) rewardFeedEl.textContent=st.lastRewardText||'';

    // 增量日志渲染：只创建/删除差异节点，不做 innerHTML='' 全量重建

  if(dirty.logs){
    const newLogs = st.logs.slice(0, 8);
    const newKeys = newLogs.map((_, i) => `log-${i}`);

    // 删除多余的 DOM 节点（innerHTML='' 触发完整解析/重建，改为定向删除）
    const existingKeys = new Set(_renderedLogKeys);
    for (const key of existingKeys) {
      if (!newKeys.includes(key)) {
        const el = eventLogEl.querySelector(`[data-log-key="${key}"]`);
        if (el) el.remove();
      }
    }

    // 复用或新建节点
    for (let i = 0; i < newLogs.length; i++) {
      const key = newKeys[i];
      let el = eventLogEl.querySelector(`[data-log-key="${key}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'log-item';
        el.dataset.logKey = key;
        eventLogEl.appendChild(el);
      }
      el.textContent = newLogs[i];
    }
    _renderedLogKeys = newKeys;

    dirty.logs = false;
  }

    if(dirty.stats){
      statBldEl.textContent  =`产业数：${_statsCache.bldCount}`;
      statUpgEl.textContent  =`已研发：${_statsCache.purchasedUpgrades}/${_statsCache.totalUpgrades}`;
      statAchEl.textContent  =`成就：${_statsCache.doneAchiev}/${_statsCache.totalAchiev}`;
      statQstEl.textContent  =`任务：${Math.min(st.questIndex,questChain.length)}/${questChain.length}`;
      statModeEl.textContent =`自动投资：${st.autoBuy?'开':'关'}`;
      statLifeEl.textContent =`历史资本：${fmt(st.lifetimeGears)}`;
      dirty.stats = false;
    }

    // ── 速通计时检查（每帧）──
    // 依次检查当前活跃速通任务是否完成；完成后触发奖励并记录 bestTime
    if (speedQuests && st.gameStartTime) {
      const elapsedMs = Date.now() - st.gameStartTime;
      const activeIdx = st.speedQuestIndex || 0;
      if (activeIdx < speedQuests.length) {
        const sq = speedQuests[activeIdx];
        const sqCheckFns = {
          sq1: () => st.lifetimeGears >= 100,
          sq2: () => bld('factory').owned >= 10,
          sq3: () => upgrades.find(u => u.id === 'quant2')?.purchased,
          sq4: () => bld('central').owned >= 1,
          sq5: () => st.researchPoints > 0 && st.lifetimeGears > 0 && (st.gears === 0 || true), // 首次 prestige：在有 researchPoints 时即算完成
        };
        const sqCheck = sqCheckFns[sq.id];
        if (sqCheck && sqCheck()) {
          const elapsedSec = elapsedMs / 1000;
          const passed = elapsedSec <= sq.timeLimit;
          // 记录 bestTime（永久）
          if (!st.speedRecords[sq.id] || elapsedMs < st.speedRecords[sq.id]) {
            st.speedRecords[sq.id] = elapsedMs;
          }
          // 触发奖励
          grantReward(sq.reward, `🏁 速通「${sq.title}」${passed ? '通过！' : '完成！'} 用时 ${elapsedSec.toFixed(1)}s`);
          st.speedQuestIndex = activeIdx + 1;
          dirty.stats = dirty.gears = dirty.logs = true;
          saveGame();
        }
      }
    }

    // 用缓存值避免每帧无谓 classList 操作（active 状态只在值变化时更新）
    if (_prevPurchaseMode !== st.purchaseMode) {
      _prevPurchaseMode = st.purchaseMode;
      modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === st.purchaseMode));
    }
    if (_prevGameSpeed !== st.gameSpeed) {
      _prevGameSpeed = st.gameSpeed;
      speedButtons.forEach(b => b.classList.toggle('active', Number(b.dataset.speed) === st.gameSpeed));
    }
    if (_prevAutoBuy !== st.autoBuy) {
      _prevAutoBuy = st.autoBuy;
      autoBuyBtn.classList.toggle('active', st.autoBuy);
      autoBuyBtn.textContent = `自动投资: ${st.autoBuy ? '开' : '关'}`;
    }
    if (_prevSoundEnabled !== st.soundEnabled) {
      _prevSoundEnabled = st.soundEnabled;
      soundBtn.textContent = `音效: ${st.soundEnabled ? '开' : '关'}`;
    }

    dirty.gears = dirty.market = false;
  };

  return { render };
};
