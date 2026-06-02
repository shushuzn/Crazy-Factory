const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Task 4.1: 常量完整性测试
// 验证 game-data.js 中新增的常量定义正确

// 读取 game-data.js 源码并提取常量值（因为 game-data.js 是浏览器脚本，无法直接 require）
const gameDataPath = path.join(__dirname, '..', 'scripts', 'game-data.js');
const source = fs.readFileSync(gameDataPath, 'utf8');

const extractConst = (name) => {
  // 匹配 const NAME = VALUE; 或 const NAME = [...];
  const patterns = [
    new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`),
  ];
  for (const re of patterns) {
    const m = source.match(re);
    if (m) {
      try {
        // 安全求值（仅对简单数值和 JSON 数组）
        return Function(`"use strict"; return (${m[1]})`)();
      } catch { /* 忽略无法求值的表达式 */ }
    }
  }
  return undefined;
};

test('POLICY_RATE_MIN is defined and is a number', () => {
  const val = extractConst('POLICY_RATE_MIN');
  assert.equal(typeof val, 'number', 'POLICY_RATE_MIN should be a number');
  assert.ok(Number.isFinite(val), 'POLICY_RATE_MIN should be finite');
});

test('POLICY_RATE_MAX is defined and greater than MIN', () => {
  const min = extractConst('POLICY_RATE_MIN');
  const max = extractConst('POLICY_RATE_MAX');
  assert.equal(typeof max, 'number', 'POLICY_RATE_MAX should be a number');
  assert.ok(max > min, `POLICY_RATE_MAX (${max}) should be > POLICY_RATE_MIN (${min})`);
});

test('POLICY_RATE_DEFAULT is within [MIN, MAX]', () => {
  const min = extractConst('POLICY_RATE_MIN');
  const max = extractConst('POLICY_RATE_MAX');
  const def = extractConst('POLICY_RATE_DEFAULT');
  assert.equal(typeof def, 'number', 'POLICY_RATE_DEFAULT should be a number');
  assert.ok(def >= min && def <= max, `POLICY_RATE_DEFAULT (${def}) should be in [${min}, ${max}]`);
});

test('POLICY_GUIDANCE_BASE_BIAS is between 0 and 1', () => {
  const val = extractConst('POLICY_GUIDANCE_BASE_BIAS');
  assert.equal(typeof val, 'number');
  assert.ok(val >= 0 && val <= 1, `POLICY_GUIDANCE_BASE_BIAS (${val}) should be in [0, 1]`);
});

test('OUTLOOK reward/penalty constants are defined', () => {
  const rewardBase = extractConst('OUTLOOK_REWARD_BASE');
  const rewardScale = extractConst('OUTLOOK_REWARD_RATE_SCALE');
  const penaltyBase = extractConst('OUTLOOK_PENALTY_BASE');
  const penaltyScale = extractConst('OUTLOOK_PENALTY_RATE_SCALE');
  const penaltyGear = extractConst('OUTLOOK_PENALTY_GEAR_RATIO');

  assert.equal(typeof rewardBase, 'number');
  assert.equal(typeof rewardScale, 'number');
  assert.equal(typeof penaltyBase, 'number');
  assert.equal(typeof penaltyScale, 'number');
  assert.equal(typeof penaltyGear, 'number');

  assert.ok(rewardBase > 0, 'OUTLOOK_REWARD_BASE should be > 0');
  assert.ok(rewardScale > 0, 'OUTLOOK_REWARD_RATE_SCALE should be > 0');
  assert.ok(penaltyBase > 0, 'OUTLOOK_PENALTY_BASE should be > 0');
  assert.ok(penaltyScale > 0, 'OUTLOOK_PENALTY_RATE_SCALE should be > 0');
  assert.ok(penaltyGear > 0 && penaltyGear < 1, 'OUTLOOK_PENALTY_GEAR_RATIO should be in (0, 1)');
});

test('MARKET_MOMENTUM constants are defined', () => {
  const cap = extractConst('MARKET_MOMENTUM_CAP');
  const duration = extractConst('MARKET_MOMENTUM_DURATION');
  const gpsPerStack = extractConst('MARKET_MOMENTUM_GPS_PER_STACK');
  const manualPerStack = extractConst('MARKET_MOMENTUM_MANUAL_PER_STACK');

  assert.equal(typeof cap, 'number');
  assert.equal(typeof duration, 'number');
  assert.equal(typeof gpsPerStack, 'number');
  assert.equal(typeof manualPerStack, 'number');

  assert.ok(cap > 0, 'MARKET_MOMENTUM_CAP should be > 0');
  assert.ok(duration > 0, 'MARKET_MOMENTUM_DURATION should be > 0');
  assert.ok(gpsPerStack > 0, 'MARKET_MOMENTUM_GPS_PER_STACK should be > 0');
  assert.ok(manualPerStack > 0, 'MARKET_MOMENTUM_MANUAL_PER_STACK should be > 0');
});

test('MACRO_PREFERRED_BONUS is between 0 and 1', () => {
  const val = extractConst('MACRO_PREFERRED_BONUS');
  assert.equal(typeof val, 'number');
  assert.ok(val >= 0 && val <= 1, `MACRO_PREFERRED_BONUS (${val}) should be in [0, 1]`);
});

test('MACRO_EVENTS is a non-empty array with required fields', () => {
  const events = extractConst('MACRO_EVENTS');
  assert.ok(Array.isArray(events), 'MACRO_EVENTS should be an array');
  assert.ok(events.length >= 2, 'MACRO_EVENTS should have at least 2 events');

  for (const ev of events) {
    assert.ok(ev.id, `event should have id: ${JSON.stringify(ev)}`);
    assert.ok(ev.name, `event should have name: ${JSON.stringify(ev)}`);
    assert.equal(typeof ev.guidanceBiasUp, 'number', `event should have guidanceBiasUp: ${JSON.stringify(ev)}`);
    assert.ok(ev.guidanceBiasUp >= 0 && ev.guidanceBiasUp <= 1, `guidanceBiasUp should be in [0, 1]: ${JSON.stringify(ev)}`);
    assert.equal(typeof ev.durationSwitches, 'number', `event should have durationSwitches: ${JSON.stringify(ev)}`);
    assert.ok(ev.preferredBuildingId, `event should have preferredBuildingId: ${JSON.stringify(ev)}`);
    assert.ok(ev.nextEventId, `event should have nextEventId: ${JSON.stringify(ev)}`);
  }
});
