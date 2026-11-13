// Pure and synchronous: it runs inside a MutationObserver callback, before paint.
(() => {
  const WORDS = globalThis.GV_WORDS;

  const matchesAny = (list, text) => {
    return list.some(pattern => {
      return pattern.test(text);
    });
  };

  // A death or sacrifice word is a story spoiler only when a word about a character is within four words of it.
  // "Jason sacrifices his life" counts; "sacrifice NPC car numbers" does not. See WORDS.weak.
  const weakStory = text => {
    const { strict, loose, subjects, pronouns, ignore, leak, leak_hardware: hardware } = WORDS.weak;
    let cleaned = text;

    for (const pattern of ignore) {
      cleaned = cleaned.replace(pattern, ' ');
    }

    const tokens = cleaned.match(/[a-z0-9]+/g) || [];

    for (let i = 0; i < tokens.length; i++) {
      // a leak about the game, not a leaking pipe
      if (leak.words.includes(tokens[i])) {
        const around = tokens.slice(Math.max(0, i - 3), i).concat(tokens.slice(i + 1, i + 4));

        if (
          around.some(word => {
            return leak.about.includes(word);
          }) &&
          !around.some(word => {
            return hardware.includes(word);
          })
        ) {
          return true;
        }
      }

      const isStrict = strict.includes(tokens[i]);

      if (!isStrict && !loose.includes(tokens[i])) {
        continue;
      }

      for (let j = Math.max(0, i - 4); j <= Math.min(tokens.length - 1, i + 4); j++) {
        if (j !== i && (subjects.includes(tokens[j]) || (isStrict && pronouns.includes(tokens[j])))) {
          return true;
        }
      }
    }

    return false;
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

    if (matchesAny(WORDS.story, normalized) || matchesAny(WORDS.generic, normalized) || weakStory(normalized)) {
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
