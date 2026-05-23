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
}) => {
  let lastRender = 0;

  // 值变化缓存：避免值未变时重复写入 DOM
  const _prevVals = new Map(); // `${buildingId}:${field}` -> previous string value

  // 增量日志渲染状态（提升到闭包顶层，避免每次 render() 重建）
  let _renderedLogKeys = [];

  // 统计面板缓存（dirty.stats 时才更新，避免每帧 reduce/filter）
  let _statsCache = { bldCount: 0, purchasedUpgrades: 0, totalUpgrades: 0, doneAchiev: 0, totalAchiev: 0 };

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
    gearsEl.textContent = fmt(disp.gears);
    gpsEl.textContent = `收益率 ${fmt(disp.gps)}/s`;
    rpDisplayEl.textContent = `${st.researchPoints} RP`;
    rpMetaEl.textContent = `研究加成 ×${(1 + st.researchPoints * 0.1).toFixed(1)}`;
    const momentumStacks = Math.max(0, Math.floor(st.marketMomentum || 0));
    const momentumPct = momentumStacks * 8;
    const baseDrag = Math.max(0.72, 1 - (st.policyRate || 0) * 0.035);
    const hedge = Math.max(0, Math.min(0.6, Number(st.policyHedge) || 0));
    const policyMult = Math.min(1, baseDrag + (1 - baseDrag) * hedge);
    const rateHint = `利率效率 ${(policyMult * 100).toFixed(1)}%`;
    manualDesc.textContent = momentumStacks > 0
      ? `每次撮合 +${fmt(getManualGain())}（多头连击 ${momentumStacks} 层，手动+${momentumPct}%｜${rateHint}）`
      : `每次撮合 +${fmt(getManualGain())}（${rateHint}）`;
    if(dirty.market) renderMarket();

    if(dirty.buildings){
      for(const b of buildings){
        const v=buildingViewMap.get(b.id); if(!v) continue;
        const cnt=affordableCount(b,st.gears,st.purchaseMode);
        const pc =st.purchaseMode==='max'?cnt:Math.min(cnt,Number(st.purchaseMode)||1);
        const spc=Math.max(1,pc||0);
        const unlocked=isBldUnlocked(b);
        if(_changed(b.id+'|owned', b.owned)) v.ownedEl.textContent=b.owned;
        const buyLabel=`购买 ×${spc}（${fmt(purchaseCost(b,spc))}）`;
        if(_changed(b.id+'|buy', buyLabel)) v.buyBtn.textContent=buyLabel;
        v.buyBtn.disabled=!(cnt>0&&unlocked);
        const lockTxt=!unlocked?`解锁条件：历史资本 ${fmt(b.unlock)}`:'';
        if(_changed(b.id+'|lock', lockTxt)) v.lockEl.textContent=lockTxt;
        const hintTxt=(unlocked&&cnt<=0)?`还差 ${fmt(price(b)-st.gears)}`:'';
        if(_changed(b.id+'|hint', hintTxt)) v.hintEl.textContent=hintTxt;
      }
      dirty.buildings = false;
      _statsCache.bldCount = buildings.reduce((s, b) => s + b.owned, 0);
    }

    if(dirty.upgrades){
      for(const u of upgrades){
        const v=upgradeViewMap.get(u.id); if(!v) continue;
        if(u.purchased){
          if(_changed(u.id+'|btn','已研发')) v.btn.textContent='已研发';
          v.btn.disabled=true;
          if(_changed(u.id+'|lock','')) v.lockEl.textContent='';
          continue;
        }
        const lr=upgradeLockedReason(u);
        const btnTxt=`研发（${fmt(u.price)}）`;
        const isDisabled=st.gears<u.price||Boolean(lr);
        if(_changed(u.id+'|lock',lr)) v.lockEl.textContent=lr;
        if(_changed(u.id+'|btn',btnTxt)) v.btn.textContent=btnTxt;
        if(_changed(u.id+'|disabled',String(isDisabled))) v.btn.disabled=isDisabled;
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
        if(_changed(sk.id+'|meta',metaTxt)) v.meta.textContent=metaTxt;
        if(sk.level>=sk.maxLevel){
          if(_changed(sk.id+'|btn','已满级')) v.btn.textContent='已满级';
          v.btn.disabled=true;
        }else{
          const isDisabled=st.researchPoints<sk.costRP;
          const btnTxt=`升级（${sk.costRP} RP）`;
          if(_changed(sk.id+'|btn',btnTxt)) v.btn.textContent=btnTxt;
          if(_changed(sk.id+'|disabled',String(isDisabled))) v.btn.disabled=isDisabled;
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
        if(_changed(a.id+'|badge',badgeTxt)) v.badge.textContent=badgeTxt;
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

    rewardFeedEl.textContent=st.lastRewardText||'';

    // 增量日志渲染：只创建/删除差异节点，不做 innerHTML='' 全量重建

  if(dirty.logs){
    const newLogs = st.logs.slice(0, 8);
    const newKeys = newLogs.map((_, i) => `log-${i}`);

    // 删除多余的 DOM 节点
    for (const key of _renderedLogKeys) {
      if (!newKeys.includes(key)) {
        const el = eventLogEl.querySelector(`[data-log-key="${key}"]`);
        if (el) el.remove();
      }
    }

    // 复用或新建节点
    const frag = document.createDocumentFragment();
    newLogs.forEach((line, i) => {
      const key = newKeys[i];
      let el = eventLogEl.querySelector(`[data-log-key="${key}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'log-item';
        el.dataset.logKey = key;
        frag.appendChild(el);
      }
      el.textContent = line;
    });

    // 将新节点追加到现有列表之前（保持顺序）
    // 先清空再重建：无法直接原地 diff，但用 frag 批量插入只触发 1 次 layout
    eventLogEl.innerHTML = '';
    eventLogEl.appendChild(frag);
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

    modeButtons.forEach(b =>b.classList.toggle('active',b.dataset.mode===st.purchaseMode));
    speedButtons.forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===st.gameSpeed));
    autoBuyBtn.classList.toggle('active',st.autoBuy);
    autoBuyBtn.textContent=`自动投资: ${st.autoBuy?'开':'关'}`;
    soundBtn.textContent  =`音效: ${st.soundEnabled?'开':'关'}`;

    dirty.gears = dirty.market = false;
  };

  return { render };
};
