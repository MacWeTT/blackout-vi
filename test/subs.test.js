// run: node test/subs.test.js
const assert = require('assert');
require('../src/core/wordlists.js');
const { gta, gaming } = globalThis.GV_WORDS.subreddits;

const matches = (list, name) => {
  return list.some(pattern => {
    return pattern.test(name.toLowerCase());
  });
};

// GTA / GTA VI subreddits
for (const name of [
  'GTA6',
  'GTAVI',
  'GTA',
  'gtaonline',
  'GrandTheftAutoVI',
  'RockstarGames',
  'GTA6Leaks',
  'ViceCity',
]) {
  assert.ok(matches(gta, name), `${name} should count as a GTA sub`);
}

for (const name of ['cooking', 'AskReddit', 'formula1', 'India', 'Python']) {
  assert.ok(!matches(gta, name), `${name} is not a GTA sub`);
}

// gaming subreddits: deliberately broad, so scrolling Reddit is safe
for (const name of [
  'gaming',
  'Games',
  'pcgaming',
  'truegaming',
  'PS5',
  'IndiaPS5',
  'XboxSeriesX',
  'NintendoSwitch',
  'Steam',
  'pcmasterrace',
  'Minecraft',
  'Fortnite',
  'EldenRing',
  'patientgamers',
  'JRPG',
  'speedrun',
]) {
  assert.ok(matches(gaming, name), `${name} should count as a gaming sub`);
}

for (const name of ['cooking', 'AskReddit', 'formula1', 'AmItheAsshole', 'LifeProTips', 'worldnews']) {
  assert.ok(!matches(gaming, name), `${name} is not a gaming sub`);
}

console.log('subs ok');
