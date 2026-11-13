// run: node test/kinds.test.js
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const { classify } = globalThis.GV;

// what a content card calls itself. The Content level shows or hides all of these together; this only names the card.
const cases = [
  ['GTA 6 soundtrack OST', 'music'],
  ['GTA VI radio stations revealed', 'music'],
  ['GTA 6 trailer 3', 'trailer'],
  ['GTA 6 trailer music', 'music'],
  ['GTA 6 trailer breakdown', 'trailer'],
  ['GTA 6 new screenshots', 'trailer'],
  ['GTA 6 release date and price', 'news'],
  ['Rockstar statement on the GTA 6 delay', 'news'],
  ['GTA 6 pre-order bonuses and editions', 'news'],
  ['GTA 6 system requirements', 'news'],
  ['GTA 6 everything we know', 'details'],
  ['GTA 6 new details about the characters', 'details'],
  ['GTA 6 review roundup scores', 'review'],
  ['GTA 6 metacritic', 'review'],
  ['my reaction to GTA 6', 'review'],
  ['GTA 6 hype is unreal', 'content'],
];

for (const [title, kind] of cases) {
  const result = classify(title);

  assert.strictEqual(result.bucket, 'content', title);
  assert.strictEqual(result.kind, kind, title);
}

// only content has a kind; gameplay and story never get one
assert.strictEqual(classify('GTA 6 gameplay first hour').kind, undefined);
assert.strictEqual(classify('GTA 6 ending explained').kind, undefined);
assert.strictEqual(classify('Cooking pasta').kind, undefined);

// no pattern is broken: none of the kind lists may contain a control character (a lost "\b" once became a backspace)
for (const list of Object.values(globalThis.GV_WORDS.kinds).flat()) {
  assert.ok(!/[\x00-\x1f]/.test(list.source), `control character in ${list}`);
}

console.log('kinds ok');
