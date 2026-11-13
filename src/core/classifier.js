// Pure and synchronous: it runs inside a MutationObserver callback, before paint.
// A story result carries `why`: the word or rule that flagged it, so a surprising flag can be explained at a glance.
(() => {
  const WORDS = globalThis.GV_WORDS;

  const matchesAny = (list, text) => {
    return list.some(pattern => {
      return pattern.test(text);
    });
  };

  // the text a pattern matched, or ''
  const firstMatch = (list, text) => {
    for (const pattern of list) {
      const hit = pattern.exec(text);

      if (hit) {
        return hit[0];
      }
    }

    return '';
  };

  // A death or sacrifice word is a story spoiler only when a word about a character is within four words of it.
  // "Jason sacrifices his life" counts; "sacrifice NPC car numbers" does not. See WORDS.weak.
  // Returns why it flagged, or '' when it did not.
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
        const about = around.find(word => {
          return leak.about.includes(word);
        });

        if (
          about &&
          !around.some(word => {
            return hardware.includes(word);
          })
        ) {
          return `"${tokens[i]}" next to "${about}"`;
        }
      }

      const isStrict = strict.includes(tokens[i]);

      if (!isStrict && !loose.includes(tokens[i])) {
        continue;
      }

      for (let j = Math.max(0, i - 4); j <= Math.min(tokens.length - 1, i + 4); j++) {
        if (j !== i && (subjects.includes(tokens[j]) || (isStrict && pronouns.includes(tokens[j])))) {
          return `"${tokens[i]}" next to "${tokens[j]}"`;
        }
      }
    }

    return '';
  };

  // why a text counts as story in normal mode: a plain story word, a strong phrase, or a weak word next to a character
  const storyReason = text => {
    const hit = firstMatch(WORDS.story, text) || firstMatch(WORDS.generic, text);

    return hit ? `"${hit}"` : weakStory(text);
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

  // Panic mode. Near GTA VI (the game, Rockstar, Jason, Lucia...) ANY spoiler-ish word flags the text as story: the plain
  // story words, death/sacrifice/betrayal/survival words, every leak word, and the extra panic words, with no check on
  // what they are next to. Away from GTA VI only the strong spoiler phrases ("who dies", "all endings") flag it.
  const classifyPanic = (text, gta) => {
    const { about, words } = WORDS.panic;
    const { strict, loose, leak } = WORDS.weak;

    if (!gta && !matchesAny(about, text)) {
      const phrase = firstMatch(WORDS.generic, text);

      return phrase ? { gta: false, bucket: 'story', why: `phrase "${phrase}"` } : { gta: false, bucket: null };
    }

    const tokens = text.match(/[a-z0-9]+/g) || [];
    const word = tokens.find(token => {
      return words.includes(token) || strict.includes(token) || loose.includes(token) || leak.words.includes(token);
    });

    if (word) {
      return { gta: true, bucket: 'story', why: `panic: "${word}"` };
    }

    const why = firstMatch(WORDS.panic.phrases, text) || storyReason(text).replace(/^"|"$/g, '');

    if (why) {
      return { gta: true, bucket: 'story', why: `panic: ${why}` };
    }

    if (matchesAny(WORDS.gameplay, text)) {
      return { gta: true, bucket: 'gameplay' };
    }

    return { gta: true, bucket: 'content', kind: kindOf(text) };
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

    const name = firstMatch(WORDS.names, normalized);

    if (name) {
      return { gta: true, bucket: 'story', why: `character: "${name}"` };
    }

    const gta = assumeGta || matchesAny(WORDS.gta, normalized);

    // Panic mode: anything that could be a spoiler is flagged. It never flags less than normal mode does.
    if (panic) {
      return classifyPanic(normalized, gta);
    }

    if (!gta) {
      return { gta: false, bucket: null };
    }

    const why = storyReason(normalized);

    if (why) {
      return { gta: true, bucket: 'story', why };
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
