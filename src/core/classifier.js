// Pure and synchronous: it runs inside a MutationObserver callback, before paint.
(() => {
  const WORDS = globalThis.GV_WORDS;

  const matchesAny = (list, text) => {
    return list.some(pattern => {
      return pattern.test(text);
    });
  };

  // 'music' | 'trailer' | 'news' | 'details' | 'review' | 'content' (anything else): names the card, nothing more
  const kindOf = text => {
    for (const [kind, list] of Object.entries(WORDS.kinds)) {
      if (matchesAny(list, text)) {
        return kind;
      }
    }

    return 'content';
  };

  // bucket: 'story' | 'gameplay' | 'content' | null (not about GTA VI)
  // Severity order: story > gameplay > content. The highest match wins.
  const classify = (text, options = {}) => {
    const { assumeGta = false, panic = false } = options;
    // a space after digits splits glued text such as gta6ending
    const normalized = text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/(\d)(?=[a-z])/g, '$1 ');

    if (matchesAny(WORDS.names, normalized)) {
      return { gta: true, bucket: 'story' };
    }

    const gta = assumeGta || matchesAny(WORDS.gta, normalized);

    if (!gta) {
      const spoiler = panic && matchesAny(WORDS.generic, normalized);

      return { gta: false, bucket: spoiler ? 'story' : null };
    }

    if (matchesAny(WORDS.story, normalized) || matchesAny(WORDS.generic, normalized)) {
      return { gta: true, bucket: 'story' };
    }

    if (matchesAny(WORDS.gameplay, normalized)) {
      return { gta: true, bucket: 'gameplay' };
    }

    return { gta: true, bucket: 'content', kind: kindOf(normalized) };
  };

  // level (what you may see): 'nothing' | 'content' | 'gameplay' | 'everything'. Returns true when the post is hidden.
  const isBlocked = (result, rawLevel) => {
    const level = GV.normalizeLevel(rawLevel);

    if (!result || !result.bucket || level === 'everything') {
      return false;
    }

    if (level === 'nothing') {
      return true;
    }

    if (level === 'content') {
      return result.bucket !== 'content';
    }

    return result.bucket === 'story';
  };

  globalThis.GV = { ...globalThis.GV, classify, isBlocked };
})();
