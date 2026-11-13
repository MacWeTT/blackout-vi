# GTA VI Spoiler Shield

Chrome extension (MV3) that hides GTA VI spoilers on YouTube, X and Reddit before they paint. Posts and videos get a card; comments and replies collapse to a one-line strip ("Potential story spoiler hidden · Show") and follow the same rules.

- Load: `chrome://extensions` → Developer mode → Load unpacked → pick this folder.
- Test: `npm test` (unit) and `npm run test:e2e` (loads the extension in Chromium)
- Layout: `src/core` (word lists, classifier), `src/content` (the shared engine plus a YouTube, X and Reddit adapter), `src/popup`, `assets`, `test`.

## Brand marks

The YouTube, X and Reddit marks in `assets/brands/` come from [Simple Icons](https://simpleicons.org) (CC0), filled with each brand's own colour. The names and logos belong to their owners.
