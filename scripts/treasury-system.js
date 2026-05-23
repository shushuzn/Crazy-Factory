/**
 * 国债系统 (Treasury Bonds System)
 *
 * 功能：将闲置资本投入国债获取稳定利息收益
 * 机制：
 * 1. 三档期限：3个月(短期)/1年(中期)/3年(长期)，利率递增
 * 2. 市场联动：空头市场时央行提升利率吸引资本，多头时降息
 * 3. 复合利息：每日结算并加入本金继续计息
 * 4. 提前赎回：收取手续费(30天以内额外惩罚)
 * 5. 到期兑现：自动入账，支持续投
 */

const createTreasurySystem = ({
  st,
  eventBus,
  pushLog,
  I18N,
  fmt,
}) => {
  // 获取当前语言
  const getLang = () => (typeof I18N !== 'undefined' ? I18N.getCurrentLang() : 'zh');

  // ═══════════════════════════════════════════════════════════════════════════
  // 国债档位配置
  // ═══════════════════════════════════════════════════════════════════════════

  const BOND_TIERS = [
    {
      id: 'short',
      name: { zh: '短期国债', en: 'Short-Term Bond' },
      durationSec: 90 * 86400,     // 90天
      baseRate: 0.036,             // 年化 3.6%
      minAmount: 1000,             // 最低买入 ¥1,000
      earlyPenalty: 0.02,          // 提前赎回扣 2% 本金
      color: '#10b981',
      icon: '📋',
    },
    {
      id: 'medium',
      name: { zh: '中期国债', en: 'Medium-Term Bond' },
      durationSec: 365 * 86400,    // 365天
      baseRate: 0.072,             // 年化 7.2%
      minAmount: 10000,            // 最低买入 ¥10,000
      earlyPenalty: 0.05,          // 提前赎回扣 5% 本金
      color: '#3b82f6',
      icon: '📜',
    },
    {
      id: 'long',
      name: { zh: '长期国债', en: 'Long-Term Bond' },
      durationSec: 1095 * 86400,   // 3年
      baseRate: 0.12,              // 年化 12%
      minAmount: 100000,           // 最低买入 ¥100,000
      earlyPenalty: 0.10,          // 提前赎回扣 10% 本金
      color: '#f59e0b',
      icon: '🏛️',
    },
  ];

  // 基础利率倍数（由市场状态调控）
  const MARKET_RATE_MULT = {
    bull:   0.7,  // 多头市场：利率降低
    neutral: 1.0,
    bear:   1.4,  // 空头市场：利率升高，吸引资本避险
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 数据初始化
  // ═══════════════════════════════════════════════════════════════════════════

  const initTreasuryData = () => {
    if (!st.treasury) {
      st.treasury = {
        bonds: [],        // 持有的国债列表
        history: [],      // 历史记录
        totalInvested: 0, // 累计投入
        totalEarned: 0,   // 累计获得利息
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 核心计算
  // ═══════════════════════════════════════════════════════════════════════════

  // 获取当前市场利率乘数（基于市场动量/情绪）
  const getMarketRateMult = () => {
    // 动量越高（多头趋势），乘数越低
    if (!st.marketIsBull) return MARKET_RATE_MULT.bear;
    // 根据市场动量判断当前市场强度
    const momentum = st.marketMomentum || 0;
    if (momentum > 5) return MARKET_RATE_MULT.bull;
    return MARKET_RATE_MULT.neutral;
  };

  // 获取某档国债的当前年化利率
  const getBondRate = (tierId) => {
    const tier = BOND_TIERS.find(t => t.id === tierId);
    if (!tier) return 0;
    return tier.baseRate * getMarketRateMult();
  };

  // 每日利息计算（简化：每秒利息 = 本金 * 年化利率 / 365 / 86400）
  const calcSecondInterest = (principal, annualRate) => {
    return principal * annualRate / 365 / 86400;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 业务逻辑
  // ═══════════════════════════════════════════════════════════════════════════

  // 购买国债
  const buyBond = (tierId, amount) => {
    const tier = BOND_TIERS.find(t => t.id === tierId);
    if (!tier) return { success: false, error: 'Invalid bond tier' };
    if (amount < tier.minAmount) return { success: false, error: `Minimum investment: ${fmt(tier.minAmount)}` };
    if (st.gears < amount) return { success: false, error: 'Insufficient funds' };

    const rate = getBondRate(tierId);
    const now = Date.now();

    st.gears -= amount;
    st.treasury.totalInvested += amount;

    const bond = {
      id: `bond_${now}_${Math.random().toString(36).substr(2, 6)}`,
      tierId,
      principal: amount,
      annualRate: rate,
      purchasedAt: now,
      maturesAt: now + tier.durationSec * 1000,
      lastAccrual: now,
      accrued: 0,       // 已累计利息（未到期前）
      isMatured: false,
      isRedeemed: false,
    };

    st.treasury.bonds.push(bond);
    pushLog(`🏛️ 购入${tier.name.zh}：${fmt(amount)}（年化 ${(rate * 100).toFixed(1)}%）`);
    eventBus.emit('treasury:purchased', { tierId, amount, rate });

    return { success: true, bond };
  };

  // 赎回国债（手动或在到期时调用）
  const redeemBond = (bondId, early = false) => {
    const bond = st.treasury.bonds.find(b => b.id === bondId);
    if (!bond || bond.isRedeemed) return { success: false, error: 'Bond not found or already redeemed' };

    const tier = BOND_TIERS.find(t => t.id === bond.tierId);
    const now = Date.now();

    // 先结算利息
    let interest = bond.accrued;
    if (!bond.isMatured && !early) {
      // 到期：完整利息
      interest = bond.principal * bond.annualRate * (tier.durationSec / 365);
      bond.isMatured = true;
    }

    // 计算提前赎回惩罚
    let penalty = 0;
    if (early && !bond.isMatured) {
      const tier2 = BOND_TIERS.find(t => t.id === bond.tierId);
      penalty = bond.principal * tier2.earlyPenalty;
      interest = bond.accrued * 0.8; // 提前赎回只给 80% 利息
    }

    const payout = bond.principal - penalty + interest;
    st.gears += payout;
    st.treasury.totalEarned += interest;
    bond.isRedeemed = true;

    // 移入历史
    st.treasury.history.unshift({
      ...bond,
      redeemedAt: now,
      payout,
      penalty,
      interest,
      early,
    });
    if (st.treasury.history.length > 50) st.treasury.history.pop();

    pushLog(`💰 国债兑现：${fmt(payout)}${penalty > 0 ? `（扣除惩罚 ${fmt(penalty)}）` : ''}`);
    eventBus.emit('treasury:redeemed', { bondId, payout, interest, penalty });

    return { success: true, payout, interest, penalty };
  };

  // 每帧/定时利息累积（由主循环调用）
  const tickBonds = (elapsedSec) => {
    const now = Date.now();
    let changed = false;

    for (const bond of st.treasury.bonds) {
      if (bond.isRedeemed) continue;

      // 利息累计
      const secInterest = calcSecondInterest(bond.principal, bond.annualRate) * elapsedSec;
      bond.accrued += secInterest;
      bond.lastAccrual = now;
      changed = true;

      // 检查到期
      if (!bond.isMatured && now >= bond.maturesAt) {
        bond.isMatured = true;
      }
    }

    return changed;
  };

  // 自动到期兑现（由主循环或定时器调用）
  const tickMaturities = () => {
    const now = Date.now();
    const matured = [];

    for (const bond of st.treasury.bonds) {
      if (!bond.isRedeemed && bond.isMatured) {
        redeemBond(bond.id, false);
        matured.push(bond.id);
      }
    }

    return matured;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 面板渲染
  // ═══════════════════════════════════════════════════════════════════════════

  const renderTreasuryPanel = () => {
    const lang = getLang();
    const rateMult = getMarketRateMult();
    const now = Date.now();

    // 计算汇总
    const activeBonds = st.treasury.bonds.filter(b => !b.isRedeemed);
    const totalPrincipal = activeBonds.reduce((s, b) => s + b.principal, 0);
    const totalAccrued   = activeBonds.reduce((s, b) => s + (b.accrued || 0), 0);
    const totalValue     = totalPrincipal + totalAccrued;

    // 生成档位购买区
    const tierCards = BOND_TIERS.map(tier => {
      const rate = getBondRate(tier.id);
      const days = Math.round(tier.durationSec / 86400);
      const canBuy = st.gears >= tier.minAmount;
      const marketTag = rateMult < 1 ? '🟢' : rateMult > 1 ? '🔴' : '🟡';

      return `
        <div class="treasury-tier" style="border-left: 3px solid ${tier.color};">
          <div class="treasury-tier-header">
            <span>${tier.icon}</span>
            <strong>${tier.name[lang]}</strong>
            <span class="market-tag">${marketTag} ${(rate * 100).toFixed(1)}%</span>
          </div>
          <div class="treasury-tier-meta">
            期限：${days} 天 &nbsp;|&nbsp; 起购：${fmt(tier.minAmount)} &nbsp;|&nbsp;
            提前赎回：-${(tier.earlyPenalty * 100).toFixed(0)}%
          </div>
          <div class="treasury-tier-buy">
            <input type="number" class="treasury-input" id="bondAmt_${tier.id}"
              placeholder="${fmt(tier.minAmount)}" min="${tier.minAmount}" step="${tier.minAmount}">
            <button class="btn btn-primary treasury-buy-btn"
              data-bond-buy="${tier.id}"
              ${!canBuy ? 'disabled' : ''}>
              买入
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 生成持有中列表
    const bondRows = activeBonds.map(bond => {
      const tier = BOND_TIERS.find(t => t.id === bond.tierId);
      const daysLeft = Math.max(0, Math.ceil((bond.maturesAt - now) / 86400000));
      const pct = bond.isMatured ? 100 : Math.min(100, ((now - bond.purchasedAt) / (bond.maturesAt - bond.purchasedAt)) * 100);
      const canRedeemEarly = !bond.isMatured;

      return `
        <div class="treasury-bond-row">
          <div class="treasury-bond-info">
            <strong>${tier.icon} ${tier.name[lang]}</strong>
            <span class="muted">
              本金 ${fmt(bond.principal)} &nbsp;|&nbsp;
              利息 ${fmt(bond.accrued)} &nbsp;|&nbsp;
              ${bond.isMatured ? '<span style="color:#10b981">已到期</span>' : `剩余 ${daysLeft} 天`}
            </span>
          </div>
          <div class="treasury-bond-progress">
            <div class="progress-track" style="height:4px;">
              <div class="progress-fill" style="width:${pct.toFixed(1)}%; background: ${tier.color};"></div>
            </div>
          </div>
          <div class="treasury-bond-actions">
            <button class="btn treasury-redeem-btn" data-bond-redeem="${bond.id}" ${canRedeemEarly ? '' : 'disabled'}>
              ${bond.isMatured ? '兑现' : '提前赎回'}
            </button>
          </div>
        </div>
      `;
    }).join('');

    const noBonds = `<div class="muted" style="text-align:center; padding:12px;">暂无持有国债</div>`;

    return `
      <div class="treasury-panel">
        <div class="section-title">🏛️ 国债系统</div>

        <!-- 汇总 -->
        <div class="treasury-summary">
          <div class="treasury-summary-item">
            <div class="label">持有本金</div>
            <div class="value" style="color:#3b82f6;">${fmt(totalPrincipal)}</div>
          </div>
          <div class="treasury-summary-item">
            <div class="label">累计利息</div>
            <div class="value" style="color:#10b981;">${fmt(totalAccrued)}</div>
          </div>
          <div class="treasury-summary-item">
            <div class="label">总价值</div>
            <div class="value" style="color:#fbbf24;">${fmt(totalValue)}</div>
          </div>
          <div class="treasury-summary-item">
            <div class="label">历史收益</div>
            <div class="value" style="color:#10b981;">${fmt(st.treasury.totalEarned)}</div>
          </div>
        </div>

        <!-- 购买档位 -->
        <div class="section-title" style="margin-top:12px;">📋 购买国债</div>
        <div class="treasury-tiers">${tierCards}</div>

        <!-- 持有列表 -->
        <div class="section-title" style="margin-top:12px;">📊 持有中</div>
        ${activeBonds.length > 0 ? bondRows : noBonds}
      </div>
    `;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 注入 DOM
  // ═══════════════════════════════════════════════════════════════════════════

  const injectPanel = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = renderTreasuryPanel();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 事件绑定（事件委托）
  // ═══════════════════════════════════════════════════════════════════════════

  const bindEvents = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.addEventListener('click', (e) => {
      const buyBtn = e.target.closest('[data-bond-buy]');
      if (buyBtn) {
        const tierId = buyBtn.dataset.bondBuy;
        const input = container.querySelector(`#bondAmt_${tierId}`);
        const amount = parseFloat(input?.value) || 0;
        buyBond(tierId, amount);
        injectPanel(containerId);
        return;
      }

      const redeemBtn = e.target.closest('[data-bond-redeem]');
      if (redeemBtn) {
        const bondId = redeemBtn.dataset.bondRedeem;
        const bond = st.treasury.bonds.find(b => b.id === bondId);
        const early = !bond?.isMatured;
        redeemBond(bondId, early);
        injectPanel(containerId);
        return;
      }
    });
  };

  return {
    initTreasuryData,
    buyBond,
    redeemBond,
    tickBonds,
    tickMaturities,
    getBondRate,
    getTotalPrincipal: () => st.treasury.bonds.filter(b => !b.isRedeemed).reduce((s, b) => s + b.principal, 0),
    getTotalAccrued: () => st.treasury.bonds.filter(b => !b.isRedeemed).reduce((s, b) => s + (b.accrued || 0), 0),
    getTotalValue: () => {
      const p = st.treasury.bonds.filter(b => !b.isRedeemed);
      return p.reduce((s, b) => s + b.principal + (b.accrued || 0), 0);
    },
    renderTreasuryPanel,
    injectPanel,
    bindEvents,
    BOND_TIERS,
  };
};
