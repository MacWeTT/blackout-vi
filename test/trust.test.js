// run: node test/trust.test.js
const assert = require('assert');
require('../src/core/wordlists.js');
require('../src/core/classifier.js');
require('../src/core/trust.js');
const { channelKeyFromHref, isChannelName, entryKey, buildTrust, isTrusted, parseSubscriptions } = globalThis.GV;

// channel keys from links
assert.strictEqual(channelKeyFromHref('/@DigitalFoundry'), '@digitalfoundry');
assert.strictEqual(channelKeyFromHref('/@DigitalFoundry/videos?x=1'), '@digitalfoundry');
assert.strictEqual(channelKeyFromHref('/channel/UC123abc'), 'UC123abc');
assert.strictEqual(channelKeyFromHref('/watch?v=abc'), '');
assert.strictEqual(channelKeyFromHref(''), '');
assert.strictEqual(channelKeyFromHref(null), '');

// stats beside a channel are not names
for (const stat of ['194K views', '194k', '3 hours ago', '12:30', '1.2M watching', '42 subscribers', '']) {
  assert.ok(!isChannelName(stat), stat);
}

for (const name of ['Rockstar Games', 'Digital Foundry', 'TGG', 'Dattrax Plays']) {
  assert.ok(isChannelName(name), name);
}

// a stat-like name saved by mistake never matches other tiles
assert.ok(!isTrusted(buildTrust({ trusted: { '@x': '194k' }, subsMode: 'same' }), { key: '', name: '194k' }));

// entry keys: the link key, else the lowercased name
assert.strictEqual(entryKey({ key: '@x', name: 'X' }), '@x');
assert.strictEqual(entryKey({ key: '', name: 'Dattrax Plays' }), 'name:dattrax plays');

// trust sets: subscriptions count only while the switch is on; disabled entries never count
const settings = {
  subsMode: 'gameplay',
  subs: { '@rockstargames': 'Rockstar Games', '@tgg': 'TGG' },
  trusted: { 'name:dattrax plays': 'Dattrax Plays' },
  disabled: { '@tgg': true },
};
const trust = buildTrust(settings);

assert.ok(isTrusted(trust, { key: '@rockstargames', name: '' }));
assert.ok(isTrusted(trust, { key: '', name: 'rockstar games' }), 'name match ignores case');
assert.ok(isTrusted(trust, { key: '', name: 'Dattrax Plays' }));
assert.ok(!isTrusted(trust, { key: '@tgg', name: '' }), 'disabled entry');
assert.ok(!isTrusted(trust, { key: '@someoneelse', name: 'Someone Else' }));
assert.ok(!isTrusted(trust, { key: '', name: '' }), 'an unidentified channel is never trusted');
assert.ok(!isTrusted(trust, null));
assert.ok(!isTrusted(buildTrust({ ...settings, subsMode: 'same' }), { key: '@rockstargames', name: 'Rockstar Games' }));

// subscriptions page: channelRenderer entries inside ytInitialData
const data = {
  contents: [
    {
      channelRenderer: {
        channelId: 'UC1',
        title: { simpleText: 'Rockstar Games' },
        navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: '/@RockstarGames' } },
      },
    },
    { nested: { channelRenderer: { channelId: 'UC2', title: { simpleText: 'No Handle {tricky} "quote"' } } } },
    { channelRenderer: { channelId: 'UC3' } },
  ],
};
const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script><script>var other = {a:1};</script></html>`;

assert.deepStrictEqual(parseSubscriptions(html), [
  { key: '@rockstargames', name: 'Rockstar Games' },
  { key: 'UC2', name: 'No Handle {tricky} "quote"' },
]);
assert.deepStrictEqual(parseSubscriptions('<html>nothing here</html>'), []);
assert.deepStrictEqual(parseSubscriptions('<script>var ytInitialData = {broken</script>'), []);

console.log('trust ok');
