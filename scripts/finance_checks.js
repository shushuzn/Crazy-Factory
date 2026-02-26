#!/usr/bin/env node

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const FINANCE_BASE_APR = 0.045;
const FINANCE_TIER_APR_BONUS = 0.018;
const FINANCE_CYCLE_AMPLITUDE = 0.02;
const FINANCE_PRESTIGE_SPRINT_APR_BONUS = 0.03;
const FINANCE_PRESTIGE_SPRINT_VOL_MULT = 1.45;
const FINANCE_MAX_SHARE_OF_MAINLINE = 0.3;
const FINANCE_MIN_CAP_GPS = 2;
const PRESTIGE_BASE_DIVISOR = 2000;

const marketTimeline = ['stable', 'overheat', 'pullback', 'panic'];
const marketMods = {
  stable: { aprDelta: 0, cycleScale: 0.8 },
  overheat: { aprDelta: 0.018, cycleScale: 1.15 },
  pullback: { aprDelta: -0.012, cycleScale: 0.95 },
  panic: { aprDelta: -0.022, cycleScale: 0.7 }
};

const strategies = {
  conservative: { aprMult: 0.9, mainlineMult: 1.08, drawdown: 0.0008 },
  balanced: { aprMult: 1.0, mainlineMult: 1.0, drawdown: 0.0018 },
  aggressive: { aprMult: 1.22, mainlineMult: 0.92, drawdown: 0.002 }
};

const quantile = (arr, q) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[idx];
};

const getPrestigeGain = (lifetime) => Math.floor(Math.sqrt(lifetime / PRESTIGE_BASE_DIVISOR));

const runCapitalOnly = (mode) => {
  const strategy = strategies[mode];
  let capital = 10000;
  let peak = capital;
  let maxDrawdown = 0;
  const aprSeries = [];

  for (let t = 0; t < 1200; t += 1) {
    const market = marketMods[marketTimeline[Math.floor(t / 75) % marketTimeline.length]];
    const cycle = FINANCE_CYCLE_AMPLITUDE * Math.sin(t / 45) * market.cycleScale;
    const apr = Math.max(0.01, FINANCE_BASE_APR + 3 * FINANCE_TIER_APR_BONUS + market.aprDelta + cycle) * strategy.aprMult;
    aprSeries.push(apr);

    capital += capital * apr * 0.01;
    if (market.aprDelta < 0) capital *= 1 - strategy.drawdown * (market.aprDelta < -0.02 ? 1 : 0.6);

    peak = Math.max(peak, capital);
    const dd = peak > 0 ? (peak - capital) / peak : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  return {
    mode,
    endCapital: capital,
    maxDrawdown,
    aprP10: quantile(aprSeries, 0.1),
    aprP50: quantile(aprSeries, 0.5),
    aprP90: quantile(aprSeries, 0.9)
  };
};

const run30mRoute = (route) => {
  const state = {
    gears: 0,
    lifetime: 0,
    totalClicks: 0,
    financeCapital: 0,
    financeTier: 0,
    financeMetaPoints: 0,
    chain: 1,
    strategy: route.startStrategy,
    switches: 0,
    prestigeAtSec: null,
    inSprint: false
  };

  const switchStrategy = (next) => {
    if (next !== state.strategy) {
      state.strategy = next;
      state.switches += 1;
    }
  };

  for (let t = 0; t < 1800; t += 1) {
    state.totalClicks += 1;
    const marketKey = marketTimeline[Math.floor(state.totalClicks / 75) % marketTimeline.length];
    const market = marketMods[marketKey];

    // 三条路线：产线优先 / 金融优先 / 联动均衡
    if (route.kind === 'production') {
      state.chain = Math.min(1.8, state.chain + 0.0003);
      if (state.lifetime > 300_000 && state.strategy !== 'balanced') switchStrategy('balanced');
      if (marketKey === 'panic') switchStrategy('conservative');
    } else if (route.kind === 'finance') {
      if (marketKey === 'overheat') switchStrategy('aggressive');
      if (marketKey === 'panic') switchStrategy('conservative');
      if (t % 45 === 0 && state.financeTier < 6) state.financeTier += 1;
    } else {
      state.chain = Math.min(1.7, state.chain + 0.00025);
      if (marketKey === 'overheat') switchStrategy('aggressive');
      if (marketKey === 'pullback' || marketKey === 'panic') switchStrategy('balanced');
      if (t % 60 === 0 && state.financeTier < 5) state.financeTier += 1;
    }

    const strat = strategies[state.strategy];
    const currentPrestige = getPrestigeGain(state.lifetime);
    const futurePrestige = getPrestigeGain(state.lifetime + 220_000);
    const sprintOn = currentPrestige >= 1 && futurePrestige > currentPrestige;
    state.inSprint = state.inSprint || sprintOn;

    const baseGps = (1 + state.chain * 24 + (route.kind === 'production' ? 8 : 0)) * strat.mainlineMult;

    // 金融资金流
    if (state.lifetime >= 1200) {
      const investRatio = route.kind === 'finance' ? 0.13 : route.kind === 'hybrid' ? 0.1 : 0.08;
      if (t % 20 === 0) {
        const invest = Math.floor(state.gears * investRatio);
        if (invest >= 100) {
          state.gears -= invest;
          state.financeCapital += invest;
        }
      }
      if (marketKey === 'panic' && t % 30 === 0 && state.financeCapital > 0) {
        state.financeCapital -= Math.max(1, Math.floor(state.financeCapital * 0.06)); // hedge-style low-risk action
      }
    }

    const cycle = FINANCE_CYCLE_AMPLITUDE * Math.sin(state.totalClicks / 45) * market.cycleScale * (sprintOn ? FINANCE_PRESTIGE_SPRINT_VOL_MULT : 1);
    const apr = Math.max(0.01, FINANCE_BASE_APR + state.financeTier * FINANCE_TIER_APR_BONUS + market.aprDelta + cycle + state.financeMetaPoints * 0.004 + (sprintOn ? FINANCE_PRESTIGE_SPRINT_APR_BONUS : 0)) * strat.aprMult;
    const financeRaw = state.financeCapital * apr;
    const financeCap = Math.max(FINANCE_MIN_CAP_GPS, baseGps * FINANCE_MAX_SHARE_OF_MAINLINE);
    const financeGain = Math.min(financeRaw, financeCap);

    const totalGain = baseGps + financeGain;
    state.gears += totalGain;
    state.lifetime += totalGain;

    if (state.prestigeAtSec === null && getPrestigeGain(state.lifetime) >= 1) {
      state.prestigeAtSec = t;
      const retainedMeta = Math.max(1, Math.floor(state.financeTier / 2) + Math.floor((state.chain - 1) / 0.08 / 2));
      state.financeMetaPoints += retainedMeta; // Phase C retained meta progression
      state.financeCapital = 0;
      state.financeTier = 0;
      state.strategy = 'balanced';
    }
  }

  return {
    route: route.kind,
    switches: state.switches,
    prestigeAtSec: state.prestigeAtSec,
    sawSprintWindow: state.inSprint,
    finalLifetime: state.lifetime
  };
};

const stable = runCapitalOnly('conservative');
const balanced = runCapitalOnly('balanced');
const aggressive = runCapitalOnly('aggressive');

assert(stable.aprP90 > stable.aprP10, 'apr quantiles should show market wave switching');
assert(stable.maxDrawdown < 0.12, 'conservative drawdown should remain low');
assert(balanced.maxDrawdown < 0.22, 'balanced drawdown should remain moderate');
assert(aggressive.maxDrawdown < 0.4, 'aggressive drawdown should stay bounded');
assert(aggressive.endCapital > balanced.endCapital, 'aggressive should have higher upside');
assert(aggressive.maxDrawdown > balanced.maxDrawdown, 'aggressive must pay higher drawdown cost than balanced');

const routes = [
  { kind: 'production', startStrategy: 'balanced' },
  { kind: 'finance', startStrategy: 'conservative' },
  { kind: 'hybrid', startStrategy: 'balanced' }
].map(run30mRoute);

for (const route of routes) {
  assert(route.prestigeAtSec !== null, `${route.route} route should reach first prestige within 30m`);
}
assert(routes.some((r) => r.switches >= 2), 'at least one 30-minute route should include >=2 finance strategy switches');
assert(routes.some((r) => r.sawSprintWindow), 'at least one route should enter prestige sprint window before reset');

console.log('finance checks passed');
