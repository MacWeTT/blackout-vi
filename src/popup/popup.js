const DESCRIPTIONS = {
  all: 'Hides every GTA VI video, comment and tile.',
  news: 'Allows news, trailers, release info, score and OST. Hides story and gameplay.',
  story: 'Hides story, endings, deaths and missions. Gameplay and news are allowed.',
  off: 'Protection off. Everything shows.',
};
const SUBS_DESCRIPTIONS = {
  off: 'Every channel follows the same rules, including the ones you trust.',
  gameplay: 'Channels you trust may show news and gameplay; story spoilers stay hidden.',
  all: 'Channels you trust skip the shield completely, spoilers included.',
};
const DEFAULTS = { level: 'news', panic: false, subsMode: 'gameplay', trusted: {} };

const $ = id => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-level]')];
const subsButtons = [...document.querySelectorAll('[data-subs]')];

// everything the screens draw comes from one state object, refreshed from storage
let state = { ...DEFAULTS, subs: {}, avatars: {}, syncedAt: 0, syncError: '' };

// Every subscription is a candidate (off by default); the trusted ones are the exclusion list.
const entries = () => {
  const rows = new Map();

  for (const [key, name] of Object.entries(state.subs)) {
    rows.set(key, { key, name, tag: 'subscribed' });
  }

  for (const [key, name] of Object.entries(state.trusted)) {
    rows.set(key, rows.get(key) || { key, name, tag: 'added by you' });
  }

  return [...rows.values()]
    .map(row => ({ ...row, on: Boolean(state.trusted[row.key]), avatar: state.avatars[row.key] || '' }))
    .sort((a, b) => Number(b.on) - Number(a.on) || a.name.localeCompare(b.name));
};

const renderMain = () => {
  $('desc').textContent = DESCRIPTIONS[state.level];
  $('panic').checked = state.panic;
  $('subsDesc').textContent = SUBS_DESCRIPTIONS[state.subsMode];
  $('manage').dataset.count = Object.keys(state.trusted).length;

  buttons.forEach(button => {
    button.classList.toggle('levels__button--on', button.dataset.level === state.level);
  });

  subsButtons.forEach(button => {
    button.classList.toggle('levels__button--on', button.dataset.subs === state.subsMode);
  });
};

const ago = time => {
  const minutes = Math.round((Date.now() - time) / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

const renderChannels = () => {
  const query = $('search').value.trim().toLowerCase();
  const rows = entries().filter(row => row.name.toLowerCase().includes(query));
  const list = $('list');

  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('div');

    empty.className = 'list__empty';
    empty.textContent = 'Nothing trusted yet. Sync to pick from your subscriptions, or use Trust on a hidden card.';
    list.append(empty);
  }

  for (const row of rows) {
    const item = document.createElement('label');
    const avatar = document.createElement(row.avatar ? 'img' : 'span');
    const name = document.createElement('span');
    const tag = document.createElement('span');
    const toggle = document.createElement('input');

    item.className = 'channel';
    avatar.className = 'channel__avatar';

    if (row.avatar) {
      avatar.src = row.avatar;
      avatar.alt = '';
    } else {
      avatar.textContent = row.name.charAt(0).toUpperCase();
    }

    name.className = 'channel__name';
    name.textContent = row.name;
    tag.className = 'channel__tag';
    tag.textContent = row.tag;
    toggle.type = 'checkbox';
    toggle.className = 'switch';
    toggle.checked = row.on;
    toggle.onchange = () => handleChannelToggle(row, toggle.checked);
    item.append(avatar, name, tag, toggle);
    list.append(item);
  }

  const count = Object.keys(state.subs).length;

  $('syncTitle').textContent = state.syncedAt ? `Synced ${ago(state.syncedAt)}` : 'Not synced yet';
  $('syncDetail').textContent = state.syncError || `${count} subscriptions found. Switch on the channels you trust.`;
};

const render = () => {
  renderMain();
  renderChannels();
};

const handleLevelClick = event => {
  const { level } = event.currentTarget.dataset;

  state.level = level;
  render();
  chrome.storage.sync.set({ level });
};

const handleSwitch = field => {
  state[field] = $(field).checked;
  render();
  chrome.storage.sync.set({ [field]: state[field] });
};

const handleChannelToggle = (row, on) => {
  const trusted = { ...state.trusted };

  if (on) {
    trusted[row.key] = row.name;
  } else {
    delete trusted[row.key];
  }

  state.trusted = trusted;
  render();
  chrome.storage.sync.set({ trusted });
};

const showView = channels => {
  $('main').hidden = channels;
  $('channels').hidden = !channels;
};

// The popup reads the subscriptions page itself (host permission), so no open YouTube tab is needed.
const handleSync = async () => {
  $('syncTitle').textContent = 'Syncing…';

  try {
    const response = await fetch('https://www.youtube.com/feed/channels', { credentials: 'include' });
    const list = GV.parseSubscriptions(await response.text());

    if (!list.length) {
      chrome.storage.local.set({ syncError: 'No subscriptions found. Are you signed in to YouTube?' });

      return;
    }

    const subs = Object.fromEntries(list.map(item => [item.key, item.name]));
    const avatars = Object.fromEntries(list.map(item => [item.key, item.avatar]));

    chrome.storage.local.set({ subs, avatars, syncedAt: Date.now(), syncError: '' });
  } catch {
    chrome.storage.local.set({ syncError: 'Could not read your subscriptions. Check your connection.' });
  }
};

const refresh = () => {
  chrome.storage.sync.get(DEFAULTS, synced => {
    chrome.storage.local.get({ subs: {}, avatars: {}, syncedAt: 0, syncError: '' }, local => {
      state = { ...state, ...synced, ...local };
      render();
    });
  });
};

const handleSubsClick = event => {
  const { subs } = event.currentTarget.dataset;

  state.subsMode = subs;
  render();
  chrome.storage.sync.set({ subsMode: subs });
};

buttons.forEach(button => {
  button.onclick = handleLevelClick;
});
subsButtons.forEach(button => {
  button.onclick = handleSubsClick;
});
$('panic').onchange = () => handleSwitch('panic');
$('manage').onclick = () => showView(true);
$('back').onclick = () => showView(false);
$('search').oninput = renderChannels;
$('sync').onclick = handleSync;
chrome.storage.onChanged.addListener(refresh);
refresh();
