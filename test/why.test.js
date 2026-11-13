// run: node test/why.test.js
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const { classify } = globalThis.GV;

// every story flag says why, so a surprising flag can be explained at a glance
const reasons = [
  ['GTA 6 ending explained', {}, /ending/],
  ['GTA 6 leaked footage', {}, /leaked.*gta|gta.*leaked/],
  ['GTA 6 Lucia sacrifices herself', {}, /lucia sacrifices/],
  ['Jason sacrifices his life', {}, /jason sacrifices/],
  ['My PS5 is dead before GTA 6', { panic: true }, /panic.*dead/],
  ['Elden Ring all endings', { panic: true }, /all endings/],
];

for (const [title, options, pattern] of reasons) {
  const result = classify(title, options);

  assert.strictEqual(result.bucket, 'story', title);
  assert.match(result.why, pattern, `why for: ${title}`);
}

// gameplay flags say why too (the word that made it gameplay)
assert.match(classify('GTA 6 gameplay first hour').why, /gameplay/);
assert.match(classify('Rockstar had GTAVI running on PS5 Pro at 60fps and removed all of the cars').why, /cars/);

// no reason when nothing flagged
assert.strictEqual(classify('GTA 6 trailer 3').why, undefined);
assert.strictEqual(classify('Cooking pasta').why, undefined);
assert.strictEqual(classify('Cooking pasta').why, undefined);

console.log('why ok');
