/**
 * 金融衍生品系统 (Derivatives System) - P6-T1
 *
 * 功能：期货合约、期权合约、对冲策略
 * 机制：
 * 1. 期货：做多/做空市场趋势，支持杠杆
 * 2. 期权：购买牛市/熊市保险
 * 3. 对冲：自动对冲比例设置
 */

const createDerivativesSystem = ({
  st,
  market,
  eventBus,
  pushLog,
  I18N,
}) => {
  // 获取当前语言
  const getLang = () => (typeof I18N !== 'undefined' ? I18N.getCurrentLang() : 'zh');

  // ═══════════════════════════════════════════════════════════════════════════
  // 数据存储
  // ═══════════════════════════════════════════════════════════════════════════

  // 初始化衍生品数据
  const initDerivativesData = () => {
    if (!st.derivatives) {
      st.derivatives = {
        // 期货持仓
        futures: [],
        // 期权持仓
        options: [],
        // 对冲设置
        hedging: {
          autoHedge: false,
          hedgeRatio: 0.3,
        },
        // 统计数据
        stats: {
          totalTrades: 0,
          profitTrades: 0,
          lossTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
        },
      };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 期货系统 (Futures)
  // ═══════════════════════════════════════════════════════════════════════════

  const FUTURES_CONFIG = {
    marginRate: 0.1,        // 保证金比例 10%
    leverageOptions: [2, 5, 10], // 杠杆倍数选项
    minContractValue: 1e6,  // 最小合约价值 (1M)
    maxContractValue: 1e12, // 最大合约价值 (1T)
    maintenanceMargin: 0.05, // 维持保证金比例 5%
    liquidationFee: 0.01,   // 爆仓手续费 1%
  };

  // 创建期货合约
  const createFuturesContract = ({
    type,           // 'long' | 'short'
    leverage,       // 杠杆倍数
    contractValue,  // 合约名义价值
    entryPrice,     // 入场价格 (市场指数)
  }) => {
    const margin = contractValue * FUTURES_CONFIG.marginRate;
    const maintenanceMargin = contractValue * FUTURES_CONFIG.maintenanceMargin;

    return {
      id: `futures_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      leverage,
      contractValue,
      entryPrice,
      margin,
      maintenanceMargin,
      createdAt: Date.now(),
      status: 'open', // open | closed | liquidated
      pnl: 0,         // 已实现盈亏
      unrealizedPnl: 0, // 未实现盈亏
      closePrice: null,
      closedAt: null,
    };
  };

  // 计算期货未实现盈亏
  const calculateUnrealizedPnl = (contract, currentPrice) => {
    const priceDiff = currentPrice - contract.entryPrice;
    const direction = contract.type === 'long' ? 1 : -1;
    const notionalReturn = (priceDiff / contract.entryPrice) * contract.contractValue;
    return notionalReturn * contract.leverage * direction;
  };

  // 检查是否需要强平
  const checkLiquidation = (contract, currentPrice) => {
    const unrealizedPnl = calculateUnrealizedPnl(contract, currentPrice);
    const marginRatio = (contract.margin + unrealizedPnl) / contract.contractValue;
    return marginRatio <= FUTURES_CONFIG.maintenanceMargin;
  };

  // 开仓 - 期货
  const openFutures = ({
    type,
    leverage,
    contractValue,
  }) => {
    const lang = getLang();

    // 验证参数
    if (!['long', 'short'].includes(type)) {
      return { success: false, error: lang === 'en' ? 'Invalid type' : '无效的类型' };
    }

    if (!FUTURES_CONFIG.leverageOptions.includes(leverage)) {
      return { success: false, error: lang === 'en' ? 'Invalid leverage' : '无效的杠杆倍数' };
    }

    if (contractValue < FUTURES_CONFIG.minContractValue ||
        contractValue > FUTURES_CONFIG.maxContractValue) {
      return { success: false, error: lang === 'en' ? 'Invalid contract value' : '无效的合约价值' };
    }

    const margin = contractValue * FUTURES_CONFIG.marginRate;

    // 检查余额
    if (st.money < margin) {
      return { success: false, error: lang === 'en' ? 'Insufficient balance' : '余额不足' };
    }

    // 扣除保证金
    st.money -= margin;

    // 获取当前市场价格
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 创建合约
    const contract = createFuturesContract({
      type,
      leverage,
      contractValue,
      entryPrice: currentPrice,
    });

    st.derivatives.futures.push(contract);
    st.derivatives.stats.totalTrades++;

    // 触发事件
    eventBus.emit('futures:opened', { contract, margin });

    const typeLabel = type === 'long'
      ? (lang === 'en' ? 'Long' : '做多')
      : (lang === 'en' ? 'Short' : '做空');

    pushLog(lang === 'en'
      ? `📈 Futures ${typeLabel} opened: ${formatNumber(contractValue)} @ ${leverage}x leverage`
      : `📈 期货${typeLabel}开仓: ${formatNumber(contractValue)} 价值 @ ${leverage}x 杠杆`
    );

    return { success: true, contract };
  };

  // 平仓 - 期货
  const closeFutures = (contractId) => {
    const lang = getLang();
    const contractIndex = st.derivatives.futures.findIndex(f => f.id === contractId && f.status === 'open');

    if (contractIndex === -1) {
      return { success: false, error: lang === 'en' ? 'Contract not found' : '合约未找到' };
    }

    const contract = st.derivatives.futures[contractIndex];
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 计算盈亏
    const pnl = calculateUnrealizedPnl(contract, currentPrice);
    const totalReturn = contract.margin + pnl;

    // 更新合约状态
    contract.status = 'closed';
    contract.pnl = pnl;
    contract.closePrice = currentPrice;
    contract.closedAt = Date.now();

    // 返还资金
    const returnAmount = Math.max(0, totalReturn);
    st.money += returnAmount;

    // 更新统计
    if (pnl > 0) {
      st.derivatives.stats.profitTrades++;
      st.derivatives.stats.totalProfit += pnl;
    } else {
      st.derivatives.stats.lossTrades++;
      st.derivatives.stats.totalLoss += Math.abs(pnl);
    }

    // 触发事件
    eventBus.emit('futures:closed', { contract, pnl });

    const pnlLabel = pnl >= 0
      ? (lang === 'en' ? 'Profit' : '盈利')
      : (lang === 'en' ? 'Loss' : '亏损');

    pushLog(lang === 'en'
      ? `📉 Futures closed: ${pnlLabel} ${formatNumber(Math.abs(pnl))}`
      : `📉 期货平仓: ${pnlLabel} ${formatNumber(Math.abs(pnl))}`
    );

    return { success: true, contract, pnl };
  };

  // 爆仓处理
  const liquidateFutures = (contractId) => {
    const lang = getLang();
    const contractIndex = st.derivatives.futures.findIndex(f => f.id === contractId && f.status === 'open');

    if (contractIndex === -1) return { success: false };

    const contract = st.derivatives.futures[contractIndex];
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 计算亏损（含爆仓手续费）
    const liquidationFee = contract.margin * FUTURES_CONFIG.liquidationFee;
    const pnl = -(contract.margin - liquidationFee);

    // 更新合约状态
    contract.status = 'liquidated';
    contract.pnl = pnl;
    contract.closePrice = currentPrice;
    contract.closedAt = Date.now();

    // 更新统计
    st.derivatives.stats.lossTrades++;
    st.derivatives.stats.totalLoss += Math.abs(pnl);

    // 触发事件
    eventBus.emit('futures:liquidated', { contract, pnl });

    pushLog(lang === 'en'
      ? `💥 FUTURES LIQUIDATED! Loss: ${formatNumber(Math.abs(pnl))}`
      : `💥 期货爆仓！亏损: ${formatNumber(Math.abs(pnl))}`
    );

    return { success: true, contract, pnl };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 期权系统 (Options)
  // ═══════════════════════════════════════════════════════════════════════════

  const OPTIONS_CONFIG = {
    premiumRate: 0.05,      // 权利金比例 5%
    minStrikePrice: 50,     // 最小行权价
    maxStrikePrice: 500,    // 最大行权价
    expirationDays: [7, 14, 30], // 到期天数选项
  };

  // 简化版期权定价（基于 Black-Scholes 的简化版本）
  const calculateOptionPremium = ({
    type,           // 'call' | 'put'
    strikePrice,    // 行权价
    currentPrice,   // 当前价格
    daysToExpiry,   // 到期天数
  }) => {
    // 简化计算：基础权利金 + 时间价值 + 内在价值
    const intrinsicValue = type === 'call'
      ? Math.max(0, currentPrice - strikePrice)
      : Math.max(0, strikePrice - currentPrice);

    const timeValue = currentPrice * 0.02 * (daysToExpiry / 30);
    const totalPremium = (intrinsicValue + timeValue) * OPTIONS_CONFIG.premiumRate;

    return Math.max(totalPremium, currentPrice * 0.01); // 最小权利金
  };

  // 创建期权合约
  const createOptionsContract = ({
    type,
    strikePrice,
    contractValue,
    premium,
    expiryDays,
  }) => {
    return {
      id: `options_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      strikePrice,
      contractValue,
      premium,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiryDays * 24 * 60 * 60 * 1000,
      status: 'open', // open | exercised | expired
      pnl: 0,
    };
  };

  // 购买期权
  const buyOptions = ({
    type,
    strikePrice,
    contractValue,
    expiryDays,
  }) => {
    const lang = getLang();

    // 验证参数
    if (!['call', 'put'].includes(type)) {
      return { success: false, error: lang === 'en' ? 'Invalid type' : '无效的类型' };
    }

    if (!OPTIONS_CONFIG.expirationDays.includes(expiryDays)) {
      return { success: false, error: lang === 'en' ? 'Invalid expiry' : '无效的到期时间' };
    }

    // 获取当前价格
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 计算权利金
    const premium = calculateOptionPremium({
      type,
      strikePrice,
      currentPrice,
      daysToExpiry: expiryDays,
    });

    // 检查余额
    if (st.money < premium) {
      return { success: false, error: lang === 'en' ? 'Insufficient balance' : '余额不足' };
    }

    // 扣除权利金
    st.money -= premium;

    // 创建合约
    const contract = createOptionsContract({
      type,
      strikePrice,
      contractValue,
      premium,
      expiryDays,
    });

    st.derivatives.options.push(contract);

    // 触发事件
    eventBus.emit('options:purchased', { contract, premium });

    const typeLabel = type === 'call'
      ? (lang === 'en' ? 'Call' : '看涨')
      : (lang === 'en' ? 'Put' : '看跌');

    pushLog(lang === 'en'
      ? `🛡️ ${typeLabel} option purchased: Strike ${strikePrice}, Premium ${formatNumber(premium)}`
      : `🛡️ 购买${typeLabel}期权: 行权价 ${strikePrice}, 权利金 ${formatNumber(premium)}`
    );

    return { success: true, contract };
  };

  // 行权期权
  const exerciseOptions = (contractId) => {
    const lang = getLang();
    const contractIndex = st.derivatives.options.findIndex(o => o.id === contractId && o.status === 'open');

    if (contractIndex === -1) {
      return { success: false, error: lang === 'en' ? 'Contract not found' : '合约未找到' };
    }

    const contract = st.derivatives.options[contractIndex];
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 计算行权收益
    let pnl = 0;
    if (contract.type === 'call' && currentPrice > contract.strikePrice) {
      pnl = (currentPrice - contract.strikePrice) * contract.contractValue / currentPrice;
    } else if (contract.type === 'put' && currentPrice < contract.strikePrice) {
      pnl = (contract.strikePrice - currentPrice) * contract.contractValue / currentPrice;
    }

    // 扣除行权成本后的净收益
    pnl -= contract.premium;

    // 更新合约状态
    contract.status = 'exercised';
    contract.pnl = pnl;

    // 返还收益
    if (pnl > 0) {
      st.money += pnl;
      st.derivatives.stats.profitTrades++;
      st.derivatives.stats.totalProfit += pnl;
    }

    // 触发事件
    eventBus.emit('options:exercised', { contract, pnl });

    const pnlLabel = pnl > 0
      ? (lang === 'en' ? 'Profit' : '盈利')
      : (lang === 'en' ? 'Loss' : '亏损');

    pushLog(lang === 'en'
      ? `✅ Option exercised: ${pnlLabel} ${formatNumber(Math.abs(pnl))}`
      : `✅ 期权行权: ${pnlLabel} ${formatNumber(Math.abs(pnl))}`
    );

    return { success: true, contract, pnl };
  };

  // 检查期权到期
  const checkOptionsExpiry = () => {
    const now = Date.now();
    st.derivatives.options.forEach(contract => {
      if (contract.status === 'open' && contract.expiresAt <= now) {
        // 自动行权（如果有收益）或过期
        const currentPrice = market?.getCurrentIndex?.() || 100;
        let hasValue = false;

        if (contract.type === 'call' && currentPrice > contract.strikePrice) {
          hasValue = true;
        } else if (contract.type === 'put' && currentPrice < contract.strikePrice) {
          hasValue = true;
        }

        if (hasValue) {
          exerciseOptions(contract.id);
        } else {
          contract.status = 'expired';
          st.derivatives.stats.lossTrades++;
          st.derivatives.stats.totalLoss += contract.premium;
          eventBus.emit('options:expired', { contract });
        }
      }
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 对冲系统 (Hedging)
  // ═══════════════════════════════════════════════════════════════════════════

  const setHedgingConfig = ({ autoHedge, hedgeRatio }) => {
    st.derivatives.hedging.autoHedge = autoHedge;
    if (hedgeRatio !== undefined) {
      st.derivatives.hedging.hedgeRatio = Math.max(0, Math.min(1, hedgeRatio));
    }

    const lang = getLang();
    pushLog(lang === 'en'
      ? `🛡️ Hedging ${autoHedge ? 'enabled' : 'disabled'} (${(st.derivatives.hedging.hedgeRatio * 100).toFixed(0)}%)`
      : `🛡️ 自动对冲${autoHedge ? '已启用' : '已禁用'} (${(st.derivatives.hedging.hedgeRatio * 100).toFixed(0)}%)`
    );

    return { success: true };
  };

  // 自动对冲检查
  const checkAutoHedge = () => {
    if (!st.derivatives.hedging.autoHedge) return;

    const totalAssetValue = st.totalMoney || st.money;
    const hedgeValue = totalAssetValue * st.derivatives.hedging.hedgeRatio;

    // 检查是否需要建立对冲仓位
    const existingHedge = st.derivatives.futures.filter(f => f.type === 'short' && f.status === 'open');
    const existingHedgeValue = existingHedge.reduce((sum, f) => sum + f.contractValue, 0);

    if (existingHedgeValue < hedgeValue * 0.9) {
      // 需要增加对冲仓位
      const neededValue = hedgeValue - existingHedgeValue;
      openFutures({
        type: 'short',
        leverage: 2,
        contractValue: Math.min(neededValue, st.money * 5), // 限制仓位大小
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 更新循环
  // ═══════════════════════════════════════════════════════════════════════════

  const update = () => {
    const currentPrice = market?.getCurrentIndex?.() || 100;

    // 检查期货强平
    st.derivatives.futures.forEach(contract => {
      if (contract.status === 'open' && checkLiquidation(contract, currentPrice)) {
        liquidateFutures(contract.id);
      }
    });

    // 检查期权到期
    checkOptionsExpiry();

    // 自动对冲
    checkAutoHedge();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 查询接口
  // ═══════════════════════════════════════════════════════════════════════════

  const getFuturesPositions = () => st.derivatives.futures.filter(f => f.status === 'open');

  const getOptionsPositions = () => st.derivatives.options.filter(o => o.status === 'open');

  const getTotalUnrealizedPnl = () => {
    const currentPrice = market?.getCurrentIndex?.() || 100;
    return st.derivatives.futures
      .filter(f => f.status === 'open')
      .reduce((total, contract) => total + calculateUnrealizedPnl(contract, currentPrice), 0);
  };

  const getStats = () => st.derivatives.stats;

  const getConfig = () => ({
    futures: FUTURES_CONFIG,
    options: OPTIONS_CONFIG,
    hedging: st.derivatives.hedging,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UI 渲染
  // ═══════════════════════════════════════════════════════════════════════════

  const renderFuturesPanel = () => {
    const lang = getLang();
    const positions = getFuturesPositions();
    const totalUnrealizedPnl = getTotalUnrealizedPnl();

    const positionsHtml = positions.map(p => {
      const pnlClass = p.unrealizedPnl >= 0 ? 'profit' : 'loss';
      return `
        <div class="position-item ${pnlClass}">
          <span class="position-type">${p.type === 'long' ? '📈' : '📉'} ${p.leverage}x</span>
          <span class="position-value">${formatNumber(p.contractValue)}</span>
          <span class="position-pnl">${p.unrealizedPnl >= 0 ? '+' : ''}${formatNumber(p.unrealizedPnl)}</span>
          <button onclick="window.closeFuturesPosition('${p.id}')">${lang === 'en' ? 'Close' : '平仓'}</button>
        </div>
      `;
    }).join('');

    return `
      <div class="derivatives-panel futures-panel">
        <h3>${lang === 'en' ? '📈 Futures' : '📈 期货合约'}</h3>
        <div class="unrealized-pnl">
          ${lang === 'en' ? 'Unrealized P&L' : '未实现盈亏'}: 
          <span class="${totalUnrealizedPnl >= 0 ? 'profit' : 'loss'}">
            ${totalUnrealizedPnl >= 0 ? '+' : ''}${formatNumber(totalUnrealizedPnl)}
          </span>
        </div>
        <div class="positions-list">
          ${positionsHtml || (lang === 'en' ? 'No open positions' : '无持仓')}
        </div>
      </div>
    `;
  };

  const renderOptionsPanel = () => {
    const lang = getLang();
    const positions = getOptionsPositions();

    const positionsHtml = positions.map(p => {
      const daysLeft = Math.ceil((p.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      return `
        <div class="position-item">
          <span class="position-type">${p.type === 'call' ? '📞' : '🛑'} ${p.strikePrice}</span>
          <span class="position-value">${formatNumber(p.contractValue)}</span>
          <span class="position-expiry">${daysLeft}d</span>
        </div>
      `;
    }).join('');

    return `
      <div class="derivatives-panel options-panel">
        <h3>${lang === 'en' ? '🛡️ Options' : '🛡️ 期权合约'}</h3>
        <div class="positions-list">
          ${positionsHtml || (lang === 'en' ? 'No open options' : '无持仓')}
        </div>
      </div>
    `;
  };

  const renderStatsPanel = () => {
    const lang = getLang();
    const stats = getStats();
    const winRate = stats.totalTrades > 0
      ? ((stats.profitTrades / stats.totalTrades) * 100).toFixed(1)
      : 0;

    return `
      <div class="derivatives-panel stats-panel">
        <h3>${lang === 'en' ? '📊 Trading Stats' : '📊 交易统计'}</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">${lang === 'en' ? 'Total Trades' : '总交易'}</span>
            <span class="stat-value">${stats.totalTrades}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">${lang === 'en' ? 'Win Rate' : '胜率'}</span>
            <span class="stat-value">${winRate}%</span>
          </div>
          <div class="stat-item profit">
            <span class="stat-label">${lang === 'en' ? 'Total Profit' : '总盈利'}</span>
            <span class="stat-value">+${formatNumber(stats.totalProfit)}</span>
          </div>
          <div class="stat-item loss">
            <span class="stat-label">${lang === 'en' ? 'Total Loss' : '总亏损'}</span>
            <span class="stat-value">-${formatNumber(stats.totalLoss)}</span>
          </div>
        </div>
      </div>
    `;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════════════════════════════════════

  const init = () => {
    initDerivativesData();

    // 定期更新
    setInterval(update, 5000); // 每5秒检查一次
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 导出接口
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    // 初始化
    init,
    update,

    // 期货交易
    openFutures,
    closeFutures,
    getFuturesPositions,

    // 期权交易
    buyOptions,
    exerciseOptions,
    getOptionsPositions,

    // 对冲设置
    setHedgingConfig,

    // 查询
    getTotalUnrealizedPnl,
    getStats,
    getConfig,

    // UI
    renderFuturesPanel,
    renderOptionsPanel,
    renderStatsPanel,
  };
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createDerivativesSystem };
}

// 辅助函数：数字格式化
function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}
