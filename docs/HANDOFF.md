# Handoff: GTA VI Spoiler Shield

Written for: the next Claude session picking up this project in this folder.

## Goal

A personal-use Chrome extension (MV3, loaded unpacked, shareable by zip with friends, no Web Store) that hides GTA VI spoilers. GTA VI launches ~6 days after 2026-11-13. YouTube comes first. X and other sites come later. The user wants GTA VI content like score, OST and news to keep showing, with only spoilers dodged.

## Hard requirement

**No glimpse of a spoiler, even for a split second.** Anything that delays hiding defeats the purpose. Failure must always mean "stays hidden too long", never "shown too early". Safety first: when in doubt, hide.

## Decisions made with the user

- **Approach A:**
  - Content script at `document_start`.
  - CSS hides every tile until a synchronous classifier marks it ok or blocked.
  - MutationObserver callbacks run before paint, so there is no flash.
  - Approach B (intercept YouTube's JSON before render) was deferred. Add it only if real use shows leaks.
- **Slider, 4 stops** (a level sets what gets blocked):
  - `all`: block all GTA VI content.
  - `news`: news only. Blocks story and gameplay. This is the default.
  - `story`: story only. Blocks story, endings, deaths and missions.
  - `off`.
- **Buckets:** story (most severe) > gameplay > news. News covers trailers, release info, score, OST and reviews. **Highest severity wins.** The user explicitly wants safety over false positives, e.g. "review: the ending made me cry" is classified as story.
- **Panic mode:** a popup checkbox. Generic phrases from the user's list ("who dies", "all endings") match on any video, even without a GTA mention.
- **Late-title handling:**
  - The observer watches text and attribute changes, not only new tiles.
  - Any tile with no text yet stays hidden, with no timeout that reveals it.
  - Cached verdicts are keyed by a text signature plus a settings stamp.
  - A backstop sweep runs on YouTube navigation events, after scroll (debounced), on tab visible, and every 2s via `requestIdleCallback`, with unchanged tiles skipped.
  - If the sweep never catches anything the observer missed, cut it back to events only.
- **Watch page:**
  - The player is hidden and paused while pending or blocked.
  - The stale `<h1>` from the previous video must not count, so classification waits until the title differs from the previous one.
  - `yt-navigate-start` forces pending.
  - A Reveal button appears after 3s while pending, and straight away when blocked.
- **User's keyword list** (screenshot, "Avoid GTA VI spoilers") is encoded in `src/core/wordlists.js` as the `generic` and `names` lists. Jason and Lucia only count next to story verbs, so "Jason Momoa" is not blocked.
- Look: sunset gradient (purple to orange), a "VI" icon.

## Current state

Built and unit-tested in Node only. **Never loaded in a real browser.**

| File                         | Role                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `manifest.json`              | MV3, `storage` permission, content scripts on youtube.com at `document_start`          |
| `src/core/wordlists.js`      | Editable regex lists: gta, names, generic, story, gameplay                             |
| `src/core/classifier.js`     | Pure `GV.classify(text, {assumeGta, panic})` and `GV.isBlocked(result, level)`         |
| `src/content/youtube.css`    | Hides tiles until marked, blocked placeholder, watch-page overlay                      |
| `src/content/youtube.js`     | Observer, per-tile checks, watch-page logic, click-to-reveal, pausing of hidden videos |
| `src/popup/` (html, css, js) | Slider and panic toggle, saved in `chrome.storage.sync`                                |
| `assets/`                    | toolbar icons (`icons/`), official logo and background art (`images/`)                     |
| `test/classifier.test.js`    | `node test/classifier.test.js` passes                                                  |

Settings are cached in the page's `localStorage` under `gv_settings` so the level applies synchronously at start.

## Next steps

1. Load unpacked in Chrome (`chrome://extensions`, Developer mode, Load unpacked) and verify on YouTube.
2. Check that the tile selectors in `src/content/youtube.css` and `src/content/youtube.js` (the `TILES` list) cover the real markup. **They were written from memory** and could be wrong or stale. A tile type that isn't listed is never hidden or blocked, which is a leak. Check the home feed, search results, the sidebar, Shorts, comments, playlists and mobile.
3. Test under Slow 3G with the DevTools throttle:
   - a flash of a blocked tile
   - tiles stuck hidden forever
   - a spoiler video playing audio for a moment
   - the watch-page overlay on SPA navigation
   - a direct load of a blocked `/watch` URL
4. Possible improvements:
   - search suggestions (not covered)
   - more gameplay and news vocabulary
   - X and other sites, reusing `src/core/classifier.js`
   - a README
   - possibly approach B
5. The user will have friends test too, across network conditions.

## Known limits and risks

- Text-only matching. A spoiler video whose title, thumbnail text, channel and comments never mention GTA won't be caught.
- Loose words ("mission", "story", "map", "guide") will block some harmless GTA VI videos at the stricter levels. This is accepted.
- Search suggestions are not handled.
- A new tile element type from YouTube would default to visible. Watch for leaks.

## Environment

Windows 11, PowerShell and Bash both available. The folder is not a git repo. The user's global instructions mention a `/graphify` skill, which is unrelated to this work.
