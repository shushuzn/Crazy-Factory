// 经济系统工厂
// 为什么拆分：数值平衡/购买规则改动频繁，独立后可避免渲染与输入逻辑互相污染。
const createEconomySystem = ({
  st,
  buildings,
  upgrades,
  skills,
  bldBoost,
  PRICE_GROWTH,
  MARKET_BULL_BONUS,
  MARKET_BEAR_PENALTY,
  SKILL_MASTERY_BONUS,
  MACRO_PREFERRED_BONUS,
  dirty,
  buildingViewMap,
  pushLog,
  saveGame,
  fmt,
  sfxBuy,
  applyUpgradeEffect
}) => {
  // 预计算查找表（消除 O(n) find 在热路径中的每帧调用）
  const _bldMap = new Map(buildings.map(b => [b.id, b]));
  const _skillMap = new Map(skills.map(s => [s.id, s]));
  const _upgradeMap = new Map(upgrades.map(u => [u.id, u]));

  const bld = (id) => _bldMap.get(id) || null;
  const skillLv = (id) => _skillMap.get(id)?.level || 0;
  const discount = () => Math.max(0.6, 1 - skillLv('bulk_discount') * 0.04);
  const price = (b, off = 0) => Math.floor(b.basePrice * Math.pow(PRICE_GROWTH, b.owned + off) * discount());

  const bldPreferredMult = (b) => (st.macroPreferredBuildingId && st.macroPreferredBuildingId === b.id ? 1 + MACRO_PREFERRED_BONUS : 1);
  const bldGPS = (b) => b.dps * b.owned * (bldBoost[b.id] || 1) * bldPreferredMult(b);
  // baseGPS 已由 _getBaseGPS() 缓存，移除重复定义
  const resMult = () => 1 + st.researchPoints * 0.1;
  const skillGPS = () => 1 + skillLv('line_optimizer') * 0.25;
  const mktMult = () => {
    const base = st.marketIsBull ? MARKET_BULL_BONUS : MARKET_BEAR_PENALTY;
    return st.marketIsBull ? base * (1 + skillLv('market_sense') * 0.1) : base;
  };
  const skillMasteryMult = () => 1 + (st.skillMasteryTier || 0) * SKILL_MASTERY_BONUS;

  // GPS 乘法链路缓存（Matching Principle 启发）：避免每帧重复计算 st.gpsMultiplier × resMult × skillGPS × mktMult × skillMasteryMult
  let _gpsMultCache = null;
  let _gpsMultDirty = true;
  const _invalidateGPSMult = () => { _gpsMultDirty = true; };

  // baseGPS 缓存：buildings.reduce() 在主循环每帧调用，改为 dirty 时才重算
  let _baseGPSCache = null;
  let _baseGPSDirty = true;
  const _getBaseGPS = () => {
    if (!_baseGPSDirty) return _baseGPSCache;
    _baseGPSCache = buildings.reduce((s, b) => s + bldGPS(b), 0);
    _baseGPSDirty = false;
    return _baseGPSCache;
  };
  const _invalidateBaseGPS = () => { _baseGPSDirty = true; };

  const _getGPSMult = () => {
    if (!_gpsMultDirty) return _gpsMultCache;
    _gpsMultCache = st.gpsMultiplier * resMult() * skillGPS() * mktMult() * skillMasteryMult();
    _gpsMultDirty = false;
    return _gpsMultCache;
  };

  const getTotalGPS = () => _getBaseGPS() * _getGPSMult();
  const getManualGain = () => st.manualPower * st.manualMult * (1 + skillLv('manual_mastery') * 0.3);

  const affordableCount = (b, budget, mode) => {
    if (mode === '1') return budget >= price(b) ? 1 : 0;
    if (mode === '10' || mode === '100') {
      const tgt = Number(mode);
      let tot = 0;
      for (let i = 0; i < tgt; i++) {
        tot += price(b, i);
        if (tot > budget) return i;
      }
      return tgt;
    }
    let n = 0;
    let tot = 0;
    while (n < 10000) {
      tot += price(b, n);
      if (tot > budget) return n;
      n++;
    }
    return n;
  };

  const purchaseCost = (b, n) => {
    let c = 0;
    for (let i = 0; i < n; i++) c += price(b, i);
    return c;
  };

  const upgradeLockedReason = (u) => {
    if (st.researchPoints < u.unlockRP) return `需要 ${u.unlockRP} RP`;
    if (u.requires) {
      const r = _upgradeMap.get(u.requires);
      if (r && !r.purchased) return `前置：${r.name}`;
    }
    if (u.type === 'bldBoost') {
      const bb = bld(u.value.id);
      if (bb && st.lifetimeGears < bb.unlock) return `解锁「${bb.name}」后可用`;
    }
    return '';
  };

  const isBldUnlocked = (b) => st.lifetimeGears >= b.unlock;

  const buyBuilding = (id) => {
    const b = bld(id);
    if (!b || !isBldUnlocked(b)) return;
    const n = affordableCount(b, st.gears, st.purchaseMode);
    if (n <= 0) return;
    const pc = st.purchaseMode === 'max' ? n : Math.min(n, Number(st.purchaseMode) || 1);
    const cost = purchaseCost(b, pc);
    if (st.gears < cost) return;

    st.gears -= cost;
    b.owned += pc;
    pushLog(`收购 ${b.emoji}${b.name} ×${pc}（-${fmt(cost)}）`);
    sfxBuy();

    const v = buildingViewMap.get(id);
    if (v) {
      v.row.classList.remove('bought');
      void v.row.offsetWidth;
      v.row.classList.add('bought');
    }

    dirty.buildings = dirty.stats = dirty.logs = true;
    _invalidateGPSMult();
    _invalidateBaseGPS();
    saveGame();
  };

  const buyUpgrade = (id) => {
    const u = upgrades.find((x) => x.id === id);
    if (!u || u.purchased) return;
    const locked = upgradeLockedReason(u);
    if (locked || st.gears < u.price) return;

    st.gears -= u.price;
    u.purchased = true;
    applyUpgradeEffect(u);
    dirty.upgrades = dirty.buildings = dirty.stats = dirty.logs = true;
    _invalidateGPSMult();
    _invalidateBaseGPS();
    saveGame();
  };

  // 边际 DPS = 买第 owned 个后再买 1 个的增量 DPS（边际产出）
  const _marginalDPS = (b) => b.dps * (bldBoost[b.id] || 1) * bldPreferredMult(b);

  // ROI = 边际 DPS / 边际成本（买第 owned+1 个时，第 owned 个的 price）
  // 越高越值得优先买
  const _buildingROI = (b) => {
    const mc = price(b);
    return mc > 0 ? _marginalDPS(b) / mc : 0;
  };

  // Deep RL Job Shop Scheduling 启发：用 ROI 评分替代逆序贪心
  const tryAutoBuy = () => {
    let totalBought = 0;

    // —— 建筑：按 ROI 降序贪心满预算购买（买得越多越划算）
    const unlocked = buildings.filter(isBldUnlocked);
    if (unlocked.length > 0 && st.gears > 0) {
      const sorted = unlocked.slice().sort((a, b) => _buildingROI(b) - _buildingROI(a));
      let budget = st.gears;
      for (const b of sorted) {
        if (budget <= 0) break;
        const maxN = affordableCount(b, budget, 'max');
        if (maxN <= 0) continue;
        const cost = purchaseCost(b, maxN);
        if (cost > budget) {
          // 二分精确可购数量（避免 purchaseCost 循环累积误差）
          let lo = 0, hi = maxN;
          while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            purchaseCost(b, mid) <= budget ? (lo = mid) : (hi = mid);
          }
          const n = lo;
          if (n <= 0) continue;
          st.gears -= purchaseCost(b, n); b.owned += n;
          totalBought += n; budget -= purchaseCost(b, n);
        } else {
          st.gears -= cost; b.owned += maxN;
          totalBought += maxN; budget -= cost;
        }
        _invalidateGPSMult();
        _invalidateBaseGPS();
      }
    }

    // —— 升级：按价格升序（便宜优先），买得起多少买多少
    if (st.gears > 0) {
      const avail = upgrades
        .filter(u => !u.purchased && !upgradeLockedReason(u) && st.gears >= u.price)
        .sort((a, b) => a.price - b.price);
      for (const u of avail) {
        if (st.gears < u.price) break;
        st.gears -= u.price; u.purchased = true; applyUpgradeEffect(u);
        _invalidateGPSMult();
        _invalidateBaseGPS();
        totalBought++;
      }
    }

    if (totalBought > 0) {
      dirty.buildings = dirty.upgrades = dirty.stats = dirty.logs = true;
      saveGame();
    }
    return totalBought;
  };

  // 调试用 GPS 分解：debug-system 依赖此接口
  const getGpsBreakdown = () => {
    const base = _getBaseGPS();
    const mult = _getGPSMult();
    return { baseGPS: base, finalMult: mult, totalGPS: base * mult };
  };

  return {
    bld,
    skillLv,
    price,
    mktMult,
    getTotalGPS,
    getGpsBreakdown,
    getManualGain,
    affordableCount,
    purchaseCost,
    upgradeLockedReason,
    isBldUnlocked,
    buyBuilding,
    buyUpgrade,
    tryAutoBuy,
  };
};
