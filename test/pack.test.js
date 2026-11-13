// run: node test/pack.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { stage } = require('../scripts/pack.js');

const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-pack-'));

try {
  const { manifest, missing, files, bytes } = stage(path.join(target, 'extension'));
  const relative = files.map(file => {
    return path.relative(path.join(target, 'extension'), file).split(path.sep).join('/');
  });

  // everything the manifest points at is in the package
  assert.deepStrictEqual(missing, []);
  assert.ok(relative.includes('manifest.json'));
  assert.ok(relative.includes('src/background.js'));
  assert.ok(relative.includes('src/popup/popup.html'));
  assert.ok(relative.includes('src/content/engine.js'));
  assert.ok(relative.includes('assets/images/gta-vi-logo.png'));
  assert.ok(relative.includes('assets/brands/reddit.svg'));
  assert.strictEqual(
    manifest.version,
    JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).version,
  );

  // and nothing else: no tests, tooling, history, or the big source art
  for (const file of relative) {
    assert.ok(!/^(test|node_modules|scripts|dist|\.git|test-results)\//.test(file), `should not ship: ${file}`);
    assert.ok(!/\.(eps)$/.test(file), `should not ship: ${file}`);
    assert.ok(!file.endsWith('background-full.png'), `should not ship: ${file}`);
  }

  assert.ok(bytes < 2 * 1024 * 1024, `package is ${bytes} bytes, expected under 2 MB`);
} finally {
  fs.rmSync(target, { recursive: true, force: true });
}

console.log('pack ok');
