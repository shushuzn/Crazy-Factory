/**
 * 滚动更新检测系统测试
 * Rolling Update Detection System Tests
 */

const assert = require('assert');
const { createUpdateDetectionSystem } = require('../scripts/update-detection-system.js');

// 模拟 fetch 和 localStorage
let fetchCalls = [];
let localStorageData = {};
let reloadCalled = false;

// 重置 mock
global.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  return {
    ok: true,
    json: async () => ({ version: 'v2.7.0' }),
  };
};

global.localStorage = {
  getItem: (key) => localStorageData[key] || null,
  setItem: (key, value) => { localStorageData[key] = value; },
  removeItem: (key) => { delete localStorageData[key]; },
};

global.window = {
  location: { reload: (force) => { reloadCalled = true; } },
};

global.document = {
  createElement: (tag) => ({
    tagName: tag,
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    appendChild: function(child) { this.children.push(child); return child; },
    querySelector: function() { return { addEventListener: () => {} }; },
    remove: function() {},
  }),
  head: { appendChild: () => {} },
  body: { appendChild: () => {} },
};

global.performance = { now: () => Date.now() };

global.Date = class extends Date {
  constructor() {
    super(...arguments);
    if (!global.Date.nowVal) global.Date.nowVal = super.now();
  }
  static now() {
    return global.Date.nowVal || super.now();
  }
};

// 测试用例
function runTests() {
  let passed = 0;
  let failed = 0;

  const test = (name, fn) => {
    try {
      // 重置状态
      fetchCalls = [];
      localStorageData = {};
      reloadCalled = false;
      global.Date.nowVal = 0;

      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
      failed++;
    }
  };

  // 测试 1: 禁用状态下系统不工作
  test('disabled system returns no-op functions', () => {
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: false,
    });
    assert.strictEqual(system.isRunning(), false);
    system.start();
    assert.strictEqual(system.isRunning(), false);
  });

  // 测试 2: 启用的系统可以启动和停止
  test('enabled system can start and stop', () => {
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      checkIntervalMs: 1000,
    });
    assert.strictEqual(system.isRunning(), false);
    system.start();
    assert.strictEqual(system.isRunning(), true);
    system.stop();
    assert.strictEqual(system.isRunning(), false);
  });

  // 测试 3: 获取状态信息
  test('getStatus returns correct info', () => {
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      checkIntervalMs: 5000,
    });
    const status = system.getStatus();
    assert.strictEqual(status.currentVersion, 'v2.6.0');
    assert.strictEqual(status.checkIntervalMs, 5000);
    assert.strictEqual(status.isRunning, false);
  });

  // 测试 4: dismissUpdate 正确存储忽略的版本
  test('dismissUpdate stores dismissed version', () => {
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
    });
    system.dismissUpdate('v2.7.0');
    assert.strictEqual(localStorageData['updateDismissedVersion'], 'v2.7.0');
  });

  // 测试 5: forceReload 清除忽略记录并重载
  test('forceReload clears storage and reloads', () => {
    localStorageData['updateDismissedVersion'] = 'v2.7.0';
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
    });
    system.forceReload();
    assert.strictEqual(localStorageData['updateDismissedVersion'], undefined);
    assert.strictEqual(reloadCalled, true);
  });

  // 测试 6: checkNow 触发版本检测
  test('checkNow triggers version check', async () => {
    const onUpdateAvailable = ({ newVersion }) => {
      assert.strictEqual(newVersion, 'v2.7.0');
    };
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      onUpdateAvailable,
    });
    await system.checkNow();
    assert.strictEqual(fetchCalls.length, 1);
    // 验证 URL 包含时间戳防止缓存
    assert(fetchCalls[0].url.includes('t='));
  });

  // 测试 7: 版本比较逻辑
  test('version comparison detects updates correctly', async () => {
    const updates = [];
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: 'v2.8.0' }),
    });
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.7.0',
      enabled: true,
      onUpdateAvailable: ({ newVersion }) => updates.push(newVersion),
    });
    await system.checkNow();
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(updates[0], 'v2.8.0');
  });

  // 测试 8: 相同版本不触发更新提示
  test('same version does not trigger update', async () => {
    const updates = [];
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: 'v2.6.0' }),
    });
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      onUpdateAvailable: ({ newVersion }) => updates.push(newVersion),
    });
    await system.checkNow();
    assert.strictEqual(updates.length, 0);
  });

  // 测试 9: 旧版本不触发更新提示
  test('older version does not trigger update', async () => {
    const updates = [];
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: 'v2.5.0' }),
    });
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      onUpdateAvailable: ({ newVersion }) => updates.push(newVersion),
    });
    await system.checkNow();
    assert.strictEqual(updates.length, 0);
  });

  // 测试 10: 错误处理
  test('fetch errors are handled gracefully', async () => {
    const errors = [];
    global.fetch = async () => { throw new Error('Network error'); };
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      onError: (err) => errors.push(err.message),
    });
    const result = await system.checkNow();
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(result.error, 'Network error');
    assert.strictEqual(result.hasUpdate, false);
  });

  // 测试 11: 忽略的版本不会重复提示
  test('dismissed version is not re-notified', async () => {
    const updates = [];
    localStorageData['updateDismissedVersion'] = 'v2.7.0';
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ version: 'v2.7.0' }),
    });
    const system = createUpdateDetectionSystem({
      currentVersion: 'v2.6.0',
      enabled: true,
      onUpdateAvailable: ({ newVersion }) => updates.push(newVersion),
    });
    await system.checkNow();
    assert.strictEqual(updates.length, 0);
  });

  // 汇总
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`滚动更新检测系统测试结果: ${passed}/${passed+failed} 通过`);
  console.log(`═══════════════════════════════════════════\n`);

  return failed === 0;
}

// 运行测试
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };
