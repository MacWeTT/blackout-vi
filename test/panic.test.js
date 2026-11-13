// run: node test/panic.test.js
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const cases = require('./corpus-cases.js');
const { classify } = globalThis.GV;

// A missed spoiler is the worst outcome. Panic mode must never flag LESS than normal mode, on any title.
const rank = bucket => {
  return [null, 'content', 'gameplay', 'story'].indexOf(bucket);
};

const lower = [];

for (const [title, , options] of cases) {
  const normal = classify(title, options || {});
  const panic = classify(title, { ...(options || {}), panic: true });

  if (rank(panic.bucket) < rank(normal.bucket)) {
    lower.push(`${title}: normal ${normal.bucket}, panic ${panic.bucket}`);
  }
}

assert.deepStrictEqual(lower, [], 'panic flagged less than normal:\n' + lower.join('\n'));

// near GTA VI, one suspicious word is enough in panic mode, whatever it sits next to
const panicStory = [
  'My PS5 is dead before GTA 6. Liquid thermal leaked and shorted the APU', // the real Reddit post
  'GTA 6 sacrifice NPC car numbers',
  'GTA 6 coolant leaking from my ps5 pro',
  'Rockstar stock price leaked somewhere far away from the other words in a very long sentence about nothing at all',
  'GTA 6 survival tips',
  'Jason dies at the end of GTA 6',
  'GTA 6 the final scene',
  'Jason Momoa dies in the movie',
  'Lucia was in the background and everyone cried',
  'GTA 5 ending explained',
  'Rockstar shocking secret',
  'Vice City is gone',
];

for (const title of panicStory) {
  assert.strictEqual(classify(title, { panic: true }).bucket, 'story', `panic should flag: ${title}`);
}

// everyday uses of "end" and "final" are not flagged, even in panic mode (a real comment: "on Rockstars end")
assert.strictEqual(
  classify('the issue is on Rockstars end and not the hardware', { panic: true, assumeGta: true }).bucket,
  'content',
);
assert.strictEqual(classify('GTA 6 final trailer', { panic: true }).bucket, 'content');

// the protagonists' names count as "about GTA VI" in panic mode, but a name alone is not a spoiler
assert.strictEqual(classify('Jason Momoa interview', { panic: true }).bucket, 'content');
assert.strictEqual(classify('Lucia', { panic: true }).bucket, 'content');
assert.strictEqual(classify('GTA 6 trailer 3', { panic: true }).bucket, 'content');
assert.strictEqual(classify('GTA 6 gameplay', { panic: true }).bucket, 'gameplay');

// away from GTA VI panic stays out of the way: only the strong phrases flag, ordinary text and ordinary deaths do not
assert.strictEqual(classify('Cooking pasta in 10 minutes', { panic: true }).bucket, null);
assert.strictEqual(classify('Elden Ring boss dies', { panic: true }).bucket, null);
assert.strictEqual(classify('Water leak in my kitchen', { panic: true }).bucket, null);
assert.strictEqual(classify('Elden Ring all endings', { panic: true }).bucket, 'story');

// with panic off the same texts are judged by context, so the everyday uses pass
assert.notStrictEqual(
  classify('My PS5 is dead before GTA 6. Liquid thermal leaked and shorted the APU').bucket,
  'story',
);
assert.notStrictEqual(classify('GTA 6 sacrifice NPC car numbers').bucket, 'story');

console.log(`panic ok (${cases.length} titles, never lower than normal)`);
