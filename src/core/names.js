// One set of words everywhere. Kinds of posts: content, gameplay, story. Levels (what you may SEE, each one includes
// the ones before it): nothing, content, gameplay, everything. Trusted accounts may show: same rules, gameplay, everything.
// Older versions saved other words (all, news, story, off); they are translated here so nobody loses a setting.
(() => {
  const LEVELS = ['nothing', 'content', 'gameplay', 'everything'];
  const LEGACY_LEVELS = { all: 'nothing', news: 'content', story: 'gameplay', off: 'everything' };
  const MODES = ['same', 'gameplay', 'everything'];
  const LEGACY_MODES = { off: 'same', all: 'everything' };

  const normalizeLevel = value => {
    return LEVELS.includes(value) ? value : LEGACY_LEVELS[value] || 'content';
  };

  const normalizeMode = value => {
    return MODES.includes(value) ? value : LEGACY_MODES[value] || 'gameplay';
  };

  globalThis.GV = { ...globalThis.GV, LEVELS, MODES, normalizeLevel, normalizeMode };
})();
