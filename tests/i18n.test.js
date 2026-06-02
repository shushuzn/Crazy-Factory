const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Task 4.2: I18N 一致性测试
// 验证 getCurrentLang() 别名方法存在且与 getLanguage() 一致

const i18nPath = path.join(__dirname, '..', 'scripts', 'i18n.js');
const source = fs.readFileSync(i18nPath, 'utf8');

test('I18N defines getLanguage() method', () => {
  assert.ok(
    /getLanguage\s*\(\s*\)\s*\{/.test(source),
    'I18N should define a getLanguage() method'
  );
});

test('I18N defines getCurrentLang() alias method', () => {
  assert.ok(
    /getCurrentLang\s*\(\s*\)\s*\{/.test(source),
    'I18N should define a getCurrentLang() alias method'
  );
});

test('getCurrentLang() delegates to getLanguage()', () => {
  // 检查 getCurrentLang 的实现中包含 this.getLanguage()
  const match = source.match(/getCurrentLang\s*\(\s*\)\s*\{([^}]+)\}/);
  assert.ok(match, 'getCurrentLang method body should be found');
  assert.ok(
    /this\.getLanguage\s*\(\s*\)/.test(match[1]),
    'getCurrentLang() should call this.getLanguage()'
  );
});

test('all subsystems use getCurrentLang() consistently', () => {
  // 检查主要子系统文件调用 I18N.getCurrentLang()
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const filesToCheck = [
    'derivatives-system.js',
    'global-market-system.js',
    'crisis-system.js',
    'guild-system.js',
    'boost-system.js',
    'subscription-system.js',
    'synergy-system.js',
    'treasury-system.js',
  ];

  for (const file of filesToCheck) {
    const filePath = path.join(scriptsDir, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(
      /I18N\.getCurrentLang\s*\(\s*\)/.test(content),
      `${file} should call I18N.getCurrentLang()`
    );
  }
});
