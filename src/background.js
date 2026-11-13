// When the extension is reloaded or updated, pages that were already open keep an old, dead copy of the page script
// (it can no longer talk to the extension), so new features do nothing there until the page is refreshed.
// This starts the new copy in every open YouTube, X and Reddit tab, so nobody has to refresh anything.
// Returns how many tabs it started the script in.
const reinjectIntoOpenTabs = async () => {
  let started = 0;

  for (const group of chrome.runtime.getManifest().content_scripts) {
    const tabs = await chrome.tabs.query({ url: group.matches });

    for (const tab of tabs) {
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: group.css });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: group.js });
        started++;
      } catch {
        // a tab that cannot be scripted right now (still loading, discarded, a protected page) is simply skipped
      }
    }
  }

  return started;
};

chrome.runtime.onInstalled.addListener(reinjectIntoOpenTabs);
