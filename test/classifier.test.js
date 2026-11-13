// run: node test/classifier.test.js
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const { classify, isBlocked } = globalThis.GV;
const b = (t, o) => {
  return classify(t, o).bucket;
};

assert.strictEqual(b('GTA 6 Official Trailer 3'), 'content');
assert.strictEqual(b('GTA VI Soundtrack OST'), 'content');
assert.strictEqual(b('GTA 6 release date and price'), 'content');
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
assert.strictEqual(b('my reaction', { assumeGta: true }), 'content');
assert.strictEqual(b('the ending', { assumeGta: true }), 'story');

const story = classify('GTA 6 ending'),
  game = classify('GTA 6 gameplay'),
  news = classify('GTA 6 trailer');
assert.deepStrictEqual(
  ['nothing', 'content', 'gameplay', 'everything'].map(l => {
    return isBlocked(story, l);
  }),
  [true, true, true, false],
);
assert.deepStrictEqual(
  ['nothing', 'content', 'gameplay', 'everything'].map(l => {
    return isBlocked(game, l);
  }),
  [true, true, false, false],
);
assert.deepStrictEqual(
  ['nothing', 'content', 'gameplay', 'everything'].map(l => {
    return isBlocked(news, l);
  }),
  [true, false, false, false],
);
assert.strictEqual(isBlocked(classify('Cooking pasta'), 'nothing'), false);

// a real Reddit post that was wrongly hidden as a story spoiler: "leaked" meant liquid, "dead" meant a broken console
const ps5Post =
  'My PS5 Is dead before Gta 6 .. I would like to share a very sad demise of my Used ps5 form FB has been officially dead ' +
  'some Liquid thermal leaked and shorted the APU ..Long ago when everyone was freeking out cz tge shortage of ps5 i was ' +
  'also one of them i had ps3 still have ps4 pro needed ps5 badly that i actually got a good deal for 42k with case but ' +
  'the guy told it was shutting off mid game for which he later told that it was some fault with the cable whatever it is ' +
  'he was a genuine innocent chap when my bro got it cz i was overseas then i came back plugged everything with my fanatec ' +
  'mid game it used to shut off i thought it was a problem with the fanatec but not the ps was overheating';

assert.notStrictEqual(classify(ps5Post).bucket, 'story');
assert.strictEqual(classify(ps5Post).gta, true, 'it does mention GTA 6, so it is still GTA VI content');

console.log('classifier ok');
