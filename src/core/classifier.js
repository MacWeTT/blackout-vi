// Pure and synchronous: it runs inside a MutationObserver callback, before paint.
(() => {
  const WORDS = globalThis.GV_WORDS;

  const matchesAny = (list, text) => {
    return list.some(pattern => {
      return pattern.test(text);
    });
  };

  // bucket: 'story' | 'gameplay' | 'news' | null (not about GTA VI)
  // Severity order: story > gameplay > news. The highest match wins.
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

    return { gta: true, bucket: 'news' };
  };

  // level: 'all' | 'news' (news only) | 'story' (story only) | 'off'
  const isBlocked = (result, level) => {
    if (!result || !result.bucket || level === 'off') {
      return false;
    }

    if (level === 'all') {
      return true;
    }

    if (level === 'news') {
      return result.bucket !== 'news';
    }

    return result.bucket === 'story';
  };

  globalThis.GV = { classify, isBlocked };
})();
