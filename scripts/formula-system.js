// 公式系统（纯函数）
// 为什么拆分：把高价值数值公式从运行时逻辑解耦，便于单元测试与平衡校验。
(function initFormulaSystem(globalScope) {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // 等比数列求和公式：S(n) = a * (r^n - 1) / (r - 1), r ≠ 1
  // a = 首项，r = 公比，n = 项数
  const geoSeriesSum = (a, r, n) => {
    if (n <= 0) return 0;
    if (r === 1) return a * n;
    if (r > 1 && n > 500) return Infinity;
    if (r < 1 && n > 2000) return a * (1 - Math.pow(r, n)) / (1 - r);
    return a * (Math.pow(r, n) - 1) / (r - 1);
  };

  const calcBuildingPrice = ({ basePrice, owned, growth, discount = 1, offset = 0 }) => {
    return Math.floor(basePrice * Math.pow(growth, owned + offset) * discount);
  };

  // 优化：O(1) 等比数列求和，替代原 O(count) 循环（count > 1000 时启用）
  // 小 count 时保留循环以确保浮点精度与原版一致（避免 floor(sum) ≠ sum(floors) 问题）
  const calcPurchaseCost = ({ basePrice, owned, growth, discount = 1, count }) => {
    if (count <= 0) return 0;
    if (count <= 1000) {
      let total = 0;
      for (let i = 0; i < count; i++) {
        total += calcBuildingPrice({ basePrice, owned, growth, discount, offset: i });
      }
      return total;
    }
    const a = basePrice * discount * Math.pow(growth, owned);
    const sum = geoSeriesSum(a, growth, count);
    return Math.floor(sum);
  };

  // 优化：O(log n) 二分查找，替代原 O(budget) while 循环
  const calcAffordableCount = ({ basePrice, owned, growth, discount = 1, budget, mode, maxIterations = 10000 }) => {
    if (mode === '1') {
      return budget >= calcBuildingPrice({ basePrice, owned, growth, discount }) ? 1 : 0;
    }
    const target = (mode === '10' || mode === '100') ? Number(mode) : null;
    const maxSearch = target || Math.min(maxIterations, 100000);

    const a = basePrice * discount * Math.pow(growth, owned);
    if (a > budget) return 0;

    // 二分查找：找最大 n 使得 geoSeriesSum(a, r, n) <= budget
    let lo = 0, hi = maxSearch;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const cost = geoSeriesSum(a, growth, mid);
      if (cost <= budget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };

  const calcPrestigeGain = ({ lifetimeGears, divisor = 2000 }) => Math.floor(Math.sqrt(Math.max(0, lifetimeGears) / divisor));

  const calcOfflineGain = ({ gps, elapsedSec, capSec }) => {
    const secs = clamp(elapsedSec, 0, capSec);
    return Math.max(0, gps * secs);
  };

  const api = {
    calcBuildingPrice,
    calcPurchaseCost,
    calcAffordableCount,
    calcPrestigeGain,
    calcOfflineGain,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (globalScope) globalScope.GameFormulas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
