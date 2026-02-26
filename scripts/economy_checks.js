#!/usr/bin/env node

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const PRICE_GROWTH = 1.15;
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;

const getCurrentPrice = (basePrice, owned, discountMultiplier = 1) =>
  Math.floor(basePrice * Math.pow(PRICE_GROWTH, owned) * discountMultiplier);

const getResearchMultiplier = (rp) => 1 + rp * 0.1;

const getPrestigeGain = (lifetimeGears) => Math.floor(Math.sqrt(lifetimeGears / 2000));

const getOfflineReward = (gps, savedAtMs, nowMs) => {
  const offlineSeconds = Math.max(0, Math.min((nowMs - savedAtMs) / 1000, OFFLINE_CAP_SECONDS));
  return gps * offlineSeconds;
};

const migrateSaveData = (rawData) => {
  if (!rawData || typeof rawData !== 'object') return null;
  const data = { ...rawData };
  const version = Number(data.saveVersion) || 1;

  if (version < 2) {
    data.saveVersion = 2;
    if (data.activeOrder && typeof data.activeOrder === 'object') {
      const hasType = ['clicks', 'lifetime', 'building'].includes(data.activeOrder.type);
      const hasTarget = Number.isFinite(Number(data.activeOrder.target));
      if (!hasType || !hasTarget) data.activeOrder = null;
    }
  }

  if (!Number.isFinite(Number(data.saveVersion))) {
    data.saveVersion = 2;
  }
  return data;
};

// price
assert(getCurrentPrice(15, 0) === 15, 'base price should be unchanged at owned=0');
assert(getCurrentPrice(15, 1) === 17, 'price growth step mismatch at owned=1');
assert(getCurrentPrice(100, 10, 0.9) > 0, 'discounted price should stay positive');

// multipliers
assert(getResearchMultiplier(0) === 1, 'rp 0 multiplier should be 1');
assert(getResearchMultiplier(5) === 1.5, 'rp 5 multiplier should be 1.5');

// prestige
assert(getPrestigeGain(0) === 0, 'prestige gain at zero should be 0');
assert(getPrestigeGain(2000) === 1, 'prestige gain at 2000 should be 1');

// offline cap
const now = Date.now();
const reward = getOfflineReward(10, now - (OFFLINE_CAP_SECONDS + 600) * 1000, now);
assert(reward === 10 * OFFLINE_CAP_SECONDS, 'offline reward must be capped at 8h');

// migration
const migrated = migrateSaveData({ gears: 10, activeOrder: { type: 'unknown', target: 10 } });
assert(migrated.saveVersion === 2, 'saveVersion should migrate to 2');
assert(migrated.activeOrder === null, 'invalid order should be nulled during migration');

console.log('economy checks passed');
