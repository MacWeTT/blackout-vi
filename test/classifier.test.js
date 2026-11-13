// run: node test/classifier.test.js
const assert = require('assert');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const { classify, isBlocked } = globalThis.GV;
const b = (t, o) => {
  return classify(t, o).bucket;
};

assert.strictEqual(b('GTA 6 Official Trailer 3'), 'news');
assert.strictEqual(b('GTA VI Soundtrack OST'), 'news');
assert.strictEqual(b('GTA 6 release date and price'), 'news');
assert.strictEqual(b('GTA VI ENDING EXPLAINED'), 'story');
assert.strictEqual(b('GTA 6 gameplay first hour'), 'gameplay');
assert.strictEqual(b('GTA 6 review: the ending made me cry'), 'story');
assert.strictEqual(b('gta6 leaked footage'), 'story');
assert.strictEqual(b('GTA Ⅵ ending'), 'story'); // roman numeral glyph
assert.strictEqual(b('Jason dies in the last scene'), 'story');
assert.strictEqual(b('death of Lucia'), 'story');
assert.strictEqual(b('Jason and Lucia ending'), 'story');
assert.strictEqual(b('Jason Momoa interview'), null);
assert.strictEqual(b('Cooking pasta'), null);
assert.strictEqual(b('Elden Ring all endings'), null);
assert.strictEqual(b('Elden Ring all endings', { panic: true }), 'story');
assert.strictEqual(b('my reaction', { assumeGta: true }), 'news');
assert.strictEqual(b('the ending', { assumeGta: true }), 'story');

const story = classify('GTA 6 ending'),
  game = classify('GTA 6 gameplay'),
  news = classify('GTA 6 trailer');
assert.deepStrictEqual(
  ['all', 'news', 'story', 'off'].map(l => {
    return isBlocked(story, l);
  }),
  [true, true, true, false],
);
assert.deepStrictEqual(
  ['all', 'news', 'story', 'off'].map(l => {
    return isBlocked(game, l);
  }),
  [true, true, false, false],
);
assert.deepStrictEqual(
  ['all', 'news', 'story', 'off'].map(l => {
    return isBlocked(news, l);
  }),
  [true, false, false, false],
);
assert.strictEqual(isBlocked(classify('Cooking pasta'), 'all'), false);

console.log('classifier ok');
