// run: node test/names.test.js
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
require('../src/core/trust.js');
const { normalizeLevel, normalizeMode, isBlocked, classify, keepsStoryHidden } = globalThis.GV;

// the four levels are what they say, and older saved words keep their meaning
for (const level of ['nothing', 'content', 'gameplay', 'everything']) {
  assert.strictEqual(normalizeLevel(level), level);
}

assert.strictEqual(normalizeLevel('all'), 'nothing');
assert.strictEqual(normalizeLevel('news'), 'content');
assert.strictEqual(normalizeLevel('story'), 'gameplay');
assert.strictEqual(normalizeLevel('off'), 'everything');
assert.strictEqual(normalizeLevel(undefined), 'content', 'unknown falls back to the default');
assert.strictEqual(normalizeLevel('garbage'), 'content');

for (const mode of ['same', 'gameplay', 'everything']) {
  assert.strictEqual(normalizeMode(mode), mode);
}

assert.strictEqual(normalizeMode('off'), 'same');
assert.strictEqual(normalizeMode('all'), 'everything');
assert.strictEqual(normalizeMode(undefined), 'gameplay');

// what each level hides, by kind of post (content, gameplay, story): a level shows itself and the kinds before it
const kinds = {
  content: classify('GTA 6 trailer'),
  gameplay: classify('GTA 6 gameplay'),
  story: classify('GTA 6 ending'),
};
const hidden = level => {
  return Object.entries(kinds)
    .filter(([, result]) => {
      return isBlocked(result, level);
    })
    .map(([kind]) => {
      return kind;
    });
};

assert.deepStrictEqual(hidden('nothing'), ['content', 'gameplay', 'story']);
assert.deepStrictEqual(hidden('content'), ['gameplay', 'story']);
assert.deepStrictEqual(hidden('gameplay'), ['story']);
assert.deepStrictEqual(hidden('everything'), []);
// old words still behave the same way
assert.deepStrictEqual(hidden('news'), hidden('content'));
assert.deepStrictEqual(hidden('story'), hidden('gameplay'));

assert.strictEqual(keepsStoryHidden('gameplay'), true);
assert.strictEqual(keepsStoryHidden('everything'), false);
assert.strictEqual(keepsStoryHidden('all'), false, 'the old word for everything');

console.log('names ok');
