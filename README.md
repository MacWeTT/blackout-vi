# GTA VI Spoiler Shield

A Chrome extension (Manifest V3) that hides GTA VI spoilers on **YouTube, X and Reddit** before they paint. Posts and
videos get a cover card; comments and replies collapse to a one-line strip
("Potential story spoiler hidden · Show") that replaces only the text, so the author and actions stay.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder (or the unzipped folder you were sent).
3. Chrome asks for access to YouTube, X and Reddit. That is how it hides posts; nothing leaves your browser.

After a reload or update, tabs that were already open restart the extension by themselves. If a page ever looks
unprotected, refresh it.

## What it does

- **Show me** (Rules tab): **Nothing**, **Content**, **Gameplay** or **Everything**. Each level shows itself and the kinds
  before it. Content is trailers, news, release info, music and score. Gameplay adds gameplay. Story (endings, deaths,
  missions, leaks) is hidden until you choose Everything.
- **Global settings**: one level for all three sites, or turn it off to give YouTube, X and Reddit their own level and
  their own Panic switch.
- **Panic mode**: flag anything that could be a spoiler near GTA VI, Jason, Lucia or Rockstar, whatever the word sits next
  to. Expect false alarms on purpose. With Panic off, death, sacrifice and leak words only count in context.
- **Trusted** (Trusted tab): choose YouTube channels, X accounts or subreddits that skip the shield. Each has a mode:
  _Same rules_, _Gameplay_ (story spoilers stay hidden) or _Everything_. Nothing is trusted until you add it, from the
  Trust badge on a cover card or from the list.
- **Reddit** also has two switches: _Block GTA / GTA VI subs_ and _Block gaming subs_, so you can scroll Reddit freely.
- A hidden card says what it is (trailer, music, news, details, review, story spoiler) and **why** ("because …").

## Limits

- It reads text. Spoilers that live only inside an image or a thumbnail cannot be caught.
- Matching is by keywords and context, in English. It is built to flag too much rather than miss something.
- YouTube search suggestions, video descriptions, X search dropdowns and Reddit sidebar widgets are not covered yet.
- X and Reddit change their markup now and then. If a post is not hidden, the selectors in `src/content/x.js` or
  `src/content/reddit.js` probably need an update.

## Develop

```
npm install
npm test          # unit tests: classifier, word lists, trust, names, panic, subreddits
npm run test:e2e  # loads the unpacked extension in Chromium (the live tests need network)
npm run verify    # lint + unit + e2e
```

Layout: `src/core` (word lists, classifier, trust helpers), `src/content` (the shared engine and one adapter per site),
`src/popup`, `src/background.js`, `assets`, `test`.

Code style follows the author's Cadence project: block-bodied arrow functions, braces on every statement, Prettier
(`npm run format`), ESLint (`npm run lint`).

## Brand marks

The YouTube, X and Reddit marks in `assets/brands/` come from [Simple Icons](https://simpleicons.org) (CC0), filled with
each brand's own colour. The names and logos belong to their owners.
