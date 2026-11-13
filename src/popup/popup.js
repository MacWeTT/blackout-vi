const DESCRIPTIONS = {
  all: 'Hides every GTA VI video, comment and tile.',
  news: 'Allows news, trailers, release info, score and OST. Hides story and gameplay.',
  story: 'Hides story, endings, deaths and missions. Gameplay and news are allowed.',
  off: 'Protection off. Everything shows.',
};
const SUBS_DESCRIPTIONS = {
  same: 'Videos from channels you subscribe to follow the same rules as everyone else.',
  gameplay: 'Subscribed channels may show news and gameplay; story spoilers stay hidden.',
  all: 'Subscribed channels skip the shield completely, spoilers included.',
};
const DEFAULTS = { level: 'news', panic: false, subsMode: 'same', trusted: {}, disabled: {} };

const $ = id => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-level]')];
const subsButtons = [...document.querySelectorAll('[data-subs]')];

// everything the screens draw comes from one state object, refreshed from storage
let state = { ...DEFAULTS, subs: {}, syncedAt: 0, syncError: '' };

const entries = () => {
  const rows = [];

  for (const [key, name] of Object.entries(state.subs)) {
    rows.push({ key, name, tag: 'subscribed' });
  }

  for (const [key, name] of Object.entries(state.trusted)) {
    rows.push({ key, name, tag: 'added by you' });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

const renderMain = () => {
  $('desc').textContent = DESCRIPTIONS[state.level];
  $('panic').checked = state.panic;
  $('subsDesc').textContent = SUBS_DESCRIPTIONS[state.subsMode];
  $('manage').dataset.count = entries().length;

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
    empty.textContent = 'No channels yet. Sync, or use "Trust" on a hidden card.';
    list.append(empty);
  }

  for (const row of rows) {
    const item = document.createElement('label');
    const avatar = document.createElement('span');
    const name = document.createElement('span');
    const tag = document.createElement('span');
    const toggle = document.createElement('input');

    item.className = 'channel';
    avatar.className = 'channel__avatar';
    name.className = 'channel__name';
    name.textContent = row.name;
    tag.className = 'channel__tag';
    tag.textContent = row.tag;
    toggle.type = 'checkbox';
    toggle.className = 'switch';
    toggle.checked = !state.disabled[row.key];
    toggle.onchange = () => handleChannelToggle(row.key, toggle.checked);
    item.append(avatar, name, tag, toggle);
    list.append(item);
  }

  const count = Object.keys(state.subs).length;

  $('syncTitle').textContent = state.syncedAt ? `Synced ${ago(state.syncedAt)}` : 'Not synced yet';
  $('syncDetail').textContent =
    state.syncError || `${count} channels from your subscriptions. Syncs through an open YouTube tab.`;
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

const handleChannelToggle = (key, on) => {
  const disabled = { ...state.disabled };

  if (on) {
    delete disabled[key];
  } else {
    disabled[key] = true;
  }

  state.disabled = disabled;
  chrome.storage.sync.set({ disabled });
};

const showView = channels => {
  $('main').hidden = channels;
  $('channels').hidden = !channels;
};

const handleSync = () => {
  $('syncTitle').textContent = 'Syncing…';
  chrome.storage.local.set({ syncRequest: Date.now() });
};

const refresh = () => {
  chrome.storage.sync.get(DEFAULTS, synced => {
    chrome.storage.local.get({ subs: {}, syncedAt: 0, syncError: '' }, local => {
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
