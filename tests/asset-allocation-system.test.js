const test = require('node:test');
const assert = require('node:assert/strict');

// Task 10: Asset Allocation System 单元测试
// 验证 v1.0 资产配置/风险偏好系统的核心功能

test('asset-allocation-system.js can be required in Node.js', () => {
  const mod = require('../scripts/asset-allocation-system.js');
  assert.ok(mod, 'module should be importable');
  assert.equal(typeof mod.createAssetAllocationSystem, 'function', 'createAssetAllocationSystem should be a function');
});

test('createAssetAllocationSystem returns expected API', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  // 最小化依赖 mock
  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const pushLog = () => {};
  const I18N = { getCurrentLang: () => 'zh' };
  const mockBuildings = [{ id: 'workshop', owned: 0 }];

  const system = createAssetAllocationSystem({
    st, eventBus, pushLog, I18N, buildings: mockBuildings,
  });

  assert.ok(system, 'system should be created');
  assert.equal(typeof system.init, 'function', 'init should be a function');
  assert.equal(typeof system.setRiskProfile, 'function', 'setRiskProfile should be a function');
  assert.equal(typeof system.getRiskProfile, 'function', 'getRiskProfile should be a function');
  assert.equal(typeof system.getLambda, 'function', 'getLambda should be a function');
  assert.equal(typeof system.getVolatilityScale, 'function', 'getVolatilityScale should be a function');
  assert.equal(typeof system.getMaxLeverage, 'function', 'getMaxLeverage should be a function');
  assert.equal(typeof system.getCrisisDampening, 'function', 'getCrisisDampening should be a function');
  assert.equal(typeof system.getAllocation, 'function', 'getAllocation should be a function');
  assert.equal(typeof system.setAllocation, 'function', 'setAllocation should be a function');
  assert.equal(typeof system.getBudgetSplit, 'function', 'getBudgetSplit should be a function');
});

test('default risk profile is balanced', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  assert.equal(system.getRiskProfile(), 'balanced', 'default risk profile should be balanced');
});

test('getLambda returns correct values for each profile', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // Conservative: lambda = 0.5
  system.setRiskProfile('conservative');
  assert.equal(system.getLambda(), 0.5, 'conservative lambda should be 0.5');

  // Balanced: lambda = 1.0
  system.setRiskProfile('balanced');
  assert.equal(system.getLambda(), 1.0, 'balanced lambda should be 1.0');

  // Aggressive: lambda = 1.8
  system.setRiskProfile('aggressive');
  assert.equal(system.getLambda(), 1.8, 'aggressive lambda should be 1.8');
});

test('getVolatilityScale returns correct values', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // 默认是 balanced，检查 balanced 的值
  assert.equal(system.getVolatilityScale(), 1.0, 'default (balanced) volatilityScale should be 1.0');
  // 然后切换到其他档位验证
  system.setRiskProfile('conservative');
  assert.equal(system.getVolatilityScale(), 0.6, 'conservative volatilityScale should be 0.6');
  system.setRiskProfile('aggressive');
  assert.equal(system.getVolatilityScale(), 1.5, 'aggressive volatilityScale should be 1.5');
});

test('getMaxLeverage returns correct values', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // 默认是 balanced
  assert.equal(system.getMaxLeverage(), 5, 'default (balanced) maxLeverage should be 5');
  system.setRiskProfile('conservative');
  assert.equal(system.getMaxLeverage(), 2, 'conservative maxLeverage should be 2');
  system.setRiskProfile('aggressive');
  assert.equal(system.getMaxLeverage(), 10, 'aggressive maxLeverage should be 10');
});

test('getCrisisDampening: conservative has 30%, others have 0%', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // 默认是 balanced
  assert.equal(system.getCrisisDampening(), 0, 'default (balanced) crisisDampening should be 0');
  system.setRiskProfile('conservative');
  assert.equal(system.getCrisisDampening(), 0.30, 'conservative crisisDampening should be 0.30');
  system.setRiskProfile('aggressive');
  assert.equal(system.getCrisisDampening(), 0, 'aggressive crisisDampening should be 0');
});

test('default allocation sums to 1.0', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  const alloc = system.getAllocation();

  const sum = alloc.buildings + alloc.upgrades + alloc.derivativesMargin;
  assert.ok(Math.abs(sum - 1.0) < 0.001, `allocation sum should be ~1.0, got ${sum}`);
});

test('setAllocation normalizes to sum <= 1.0', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // Test: buildings=0.8, upgrades=0.4 (sum=1.2) -> should normalize
  system.setAllocation({ buildings: 0.8, upgrades: 0.4 });
  const alloc = system.getAllocation();
  const sum = alloc.buildings + alloc.upgrades + alloc.derivativesMargin;
  assert.ok(Math.abs(sum - 1.0) < 0.001, `normalized sum should be ~1.0, got ${sum}`);
});

test('getBudgetSplit sums to totalGears', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();

  // 确保分配比例正确设置
  const totalGears = 10000;
  const split = system.getBudgetSplit(totalGears);

  // 验证总额相等（允许 2 误差，由于浮点运算和 Math.floor）
  const sum = split.buildingBudget + split.upgradeBudget + split.marginReserve;
  assert.ok(Math.abs(sum - totalGears) <= 2, `budget split should sum to ~${totalGears}, got ${sum}`);
});

test('lambda power transform: ratio changes as expected', () => {
  // 幂运算性质: (a^λ) / (b^λ) = (a/b)^λ
  // 所以对于 ROI < 1 的情况，lambda > 1 会压缩比率，lambda < 1 会放大比率

  const rawROI_high = 0.1;
  const rawROI_low = 0.01;

  // 原始比率: 0.1 / 0.01 = 10
  const originalRatio = rawROI_high / rawROI_low;
  assert.equal(originalRatio, 10, 'original ratio should be 10');

  // lambda=0.5: (0.1^0.5) / (0.01^0.5) = (0.1/0.01)^0.5 = 10^0.5 ≈ 3.16
  const adjustedRatio_0_5 = Math.pow(rawROI_high, 0.5) / Math.pow(rawROI_low, 0.5);
  assert.ok(Math.abs(adjustedRatio_0_5 - 3.162) < 0.01, 'lambda=0.5 ratio should be ~3.16, got ' + adjustedRatio_0_5);

  // lambda=1.8: (0.1^1.8) / (0.01^1.8) = (0.1/0.01)^1.8 = 10^1.8 ≈ 63
  const adjustedRatio_1_8 = Math.pow(rawROI_high, 1.8) / Math.pow(rawROI_low, 1.8);
  assert.ok(Math.abs(adjustedRatio_1_8 - 63.1) < 1, 'lambda=1.8 ratio should be ~63, got ' + adjustedRatio_1_8);
});

test('setRiskProfile emits risk:changed event', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  let eventReceived = false;
  let eventPayload = null;
  const eventBus = {
    on: (event, fn) => { /* 监听器注册 */ },
    emit: (event, payload) => {
      if (event === 'risk:changed') {
        eventReceived = true;
        eventPayload = payload;
      }
    },
  };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  system.setRiskProfile('aggressive');

  assert.ok(eventReceived, 'risk:changed event should be emitted');
  assert.equal(eventPayload.profile, 'aggressive', 'event payload should contain profile');
});

test('setAllocation emits allocation:changed event', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  let eventReceived = false;
  let eventPayload = null;
  const eventBus = {
    on: () => {},
    emit: (event, payload) => {
      if (event === 'allocation:changed') {
        eventReceived = true;
        eventPayload = payload;
      }
    },
  };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  system.setAllocation({ buildings: 0.7, upgrades: 0.25 });

  assert.ok(eventReceived, 'allocation:changed event should be emitted');
  assert.ok('buildings' in eventPayload, 'event payload should contain buildings');
  assert.ok('upgrades' in eventPayload, 'event payload should contain upgrades');
});

test('renderRiskSelector returns HTML with 3 chips', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  const html = system.renderRiskSelector();

  assert.ok(html.includes('conservative'), 'should contain conservative chip');
  assert.ok(html.includes('balanced'), 'should contain balanced chip');
  assert.ok(html.includes('aggressive'), 'should contain aggressive chip');
  assert.ok(html.includes('data-risk-profile'), 'should have data-risk-profile attributes');
});

test('renderAllocationPanel returns HTML with sliders', () => {
  const { createAssetAllocationSystem } = require('../scripts/asset-allocation-system.js');

  const st = {};
  const eventBus = { on: () => {}, emit: () => {} };
  const system = createAssetAllocationSystem({
    st, eventBus, pushLog: () => {}, I18N: { getCurrentLang: () => 'zh' }, buildings: [],
  });

  system.init();
  const html = system.renderAllocationPanel();

  assert.ok(html.includes('allocation-slider'), 'should contain slider inputs');
  assert.ok(html.includes('allocation-total'), 'should contain total display');
});