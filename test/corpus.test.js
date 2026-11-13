// run: node test/corpus.test.js
// A wide set of realistic titles. Spoilers must be caught; harmless and non-GTA VI titles must not be blocked.
const assert = require('assert');
require('../src/core/names.js');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
const { classify } = globalThis.GV;

const cases = require('./corpus-cases.js');

const wrong = cases
  .map(([title, want, options]) => {
    return { title, want, got: classify(title, options || {}).bucket };
  })
  .filter(item => {
    return item.got !== item.want;
  });

assert.deepStrictEqual(
  wrong,
  [],
  'misclassified titles:\n' +
    wrong
      .map(i => {
        return `${i.got} (want ${i.want}): ${i.title}`;
      })
      .join('\n'),
);
console.log(`corpus ok (${cases.length} titles)`);

// Known limits, on purpose: a bare "final" (it would hide "final trailer"), "¡FINAL!", vague relationship titles,
// other languages, and spoilers whose text never mentions GTA VI.
