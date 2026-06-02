const test = require('node:test');
const assert = require('node:assert/strict');

// Task 4.4: Event System 模块守卫测试
// 验证 event-system.js 在 Node.js 环境下可正常导入（module.exports 守卫）

test('event-system.js can be required in Node.js', () => {
  const mod = require('../scripts/event-system.js');
  assert.ok(mod, 'module should be importable');
  assert.equal(typeof mod.createEventSystem, 'function', 'createEventSystem should be a function');
});

test('createEventSystem returns expected API', () => {
  const { createEventSystem } = require('../scripts/event-system.js');

  // 最小化依赖 mock
  const st = { questIndex: 0, logs: [] };
  const mockBuildings = [{ id: 'workshop', owned: 0 }];
  const pushLog = () => {};
  const onQuestComplete = () => {};
  const eventBus = { on: () => {}, emit: () => {} };

  const system = createEventSystem({ st, buildings: mockBuildings, pushLog, onQuestComplete, eventBus });

  assert.ok(system, 'system should be created');
  assert.equal(typeof system.tick, 'function', 'tick should be a function');
  assert.equal(typeof system.getActiveQuests, 'function', 'getActiveQuests should be a function');
  assert.equal(typeof system.getCompletedQuestCount, 'function', 'getCompletedQuestCount should be a function');
  assert.equal(typeof system.checkQuests, 'function', 'checkQuests should be a function');
  assert.ok(system.EVENT_TYPES, 'EVENT_TYPES should exist');
});
