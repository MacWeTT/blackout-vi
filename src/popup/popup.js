const DESCRIPTIONS = {
  all: 'Hides every GTA VI post, video and comment.',
  news: 'Allows news, trailers, release info, score and OST. Hides story and gameplay.',
  story: 'Hides story, endings, deaths and missions. Gameplay and news are allowed.',
  off: 'Protection off. Everything shows.',
};
const MODE_DESCRIPTIONS = {
  off: 'Everyone follows the same rules, including the ones you trust.',
  gameplay: 'Ones you trust may show news and gameplay; story spoilers stay hidden.',
  all: 'Ones you trust skip the shield completely, spoilers included.',
};

// What differs per site: the trusted list and its mode (synced), the pick-list and pictures (local).
const SITES = {
  youtube: {
    label: 'YouTube',
    noun: 'channels',
    trust: 'trusted',
    mode: 'subsMode',
    subs: 'subs',
    avatars: 'avatars',
    synced: 'syncedAt',
    canSync: true,
    pickHint: 'subscriptions found. Switch on the channels you trust.',
  },
  x: {
    label: 'X',
    noun: 'accounts',
    trust: 'xTrusted',
    mode: 'xMode',
    subs: 'xSubs',
    avatars: 'xAvatars',
    synced: 'xSyncedAt',
    canSync: false,
    pickHint: 'accounts collected. Open your Following page on X and scroll to add more.',
  },
};
const DEFAULTS = {
  global: true,
  level: 'news',
  panic: false,
  sites: {},
  trusted: {},
  subsMode: 'gameplay',
  xTrusted: {},
  xMode: 'gameplay',
};

const $ = id => {
  return document.getElementById(id);
};

// everything the screens draw comes from one state object, refreshed from storage
let state = {
  ...DEFAULTS,
  subs: {},
  avatars: {},
  xSubs: {},
  xAvatars: {},
  syncedAt: 0,
  xSyncedAt: 0,
  syncError: '',
  tab: 'youtube', // the site tab being edited while global settings are off
  manage: null, // the site whose trusted list is open, or null for the main screen
};

// level and panic: the shared value, or this site's own when global settings are off
const current = () => {
  const own = state.global ? {} : state.sites[state.tab] || {};

  return { level: own.level ?? state.level, panic: own.panic ?? state.panic };
};

const rowsFor = site => {
  const config = SITES[site];
  const trusted = state[config.trust];
  const rows = new Map();

  for (const [key, name] of Object.entries(state[config.subs] || {})) {
    rows.set(key, { key, name, tag: site === 'x' ? 'following' : 'subscribed' });
  }

  for (const [key, name] of Object.entries(trusted)) {
    rows.set(key, rows.get(key) || { key, name, tag: 'added by you' });
  }

  return [...rows.values()]
    .map(row => {
      return { ...row, on: Boolean(trusted[row.key]), avatar: (state[config.avatars] || {})[row.key] || '' };
    })
    .sort((a, b) => {
      return Number(b.on) - Number(a.on) || a.name.localeCompare(b.name);
    });
};

const ago = time => {
  const minutes = Math.round((Date.now() - time) / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

const openManage = site => {
  state.manage = site;
  $('search').value = '';
  render();
};

const renderMain = () => {
  const { level, panic } = current();
  const shown = state.global
    ? ['youtube', 'x']
    : [state.tab].filter(tab => {
        return SITES[tab];
      });

  $('global').checked = state.global;
  $('globalHint').textContent = state.global
    ? 'The same rules on YouTube, X and Reddit'
    : 'Each site has its own rules. Pick a site below.';
  $('sites').hidden = state.global;
  $('desc').textContent = DESCRIPTIONS[level];
  $('panic').checked = panic;

  document.querySelectorAll('[data-site]').forEach(button => {
    button.classList.toggle('site--on', button.dataset.site === state.tab);
  });
  document.querySelectorAll('[data-level]').forEach(button => {
    button.classList.toggle('levels__button--on', button.dataset.level === level);
  });

  // trusted lists belong to one site each; Reddit has no joined communities, so it has none
  const rows = $('trustRows');

  rows.replaceChildren();

  for (const site of shown) {
    const config = SITES[site];
    const count = Object.keys(state[config.trust]).length;
    const row = document.createElement('button');

    row.type = 'button';
    row.className = 'box box--button';
    row.dataset.manage = site;
    row.innerHTML = '<span class="box__text"><b></b><small></small></span><span class="box__arrow">&rarr;</span>';
    row.querySelector('b').textContent = `${config.label} ${config.noun}`;
    row.querySelector('small').textContent = `${count} trusted`;
    row.onclick = () => {
      openManage(site);
    };
    rows.append(row);
  }

  const redditOnly = !state.global && state.tab === 'reddit';

  $('trustHeading').hidden = redditOnly;
  $('siteNote').hidden = !redditOnly;
  $('siteNote').textContent =
    'Reddit has no joined-community feature, so these rules apply to the whole site. Reddit support is coming.';
};

const handleChannelToggle = (row, on) => {
  const key = SITES[state.manage].trust;
  const trusted = { ...state[key] };

  if (on) {
    trusted[row.key] = row.name;
  } else {
    delete trusted[row.key];
  }

  save({ [key]: trusted });
};

const renderChannels = () => {
  const site = state.manage;

  if (!site) {
    return;
  }

  const config = SITES[site];
  const query = $('search').value.trim().toLowerCase();
  const rows = rowsFor(site).filter(row => {
    return row.name.toLowerCase().includes(query);
  });
  const list = $('list');
  const mode = state[config.mode];

  $('manageTitle').textContent = `Trusted ${config.noun}`;
  $('modeDesc').textContent = MODE_DESCRIPTIONS[mode];
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('levels__button--on', button.dataset.mode === mode);
  });
  list.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement('div');

    empty.className = 'list__empty';
    empty.textContent = config.canSync
      ? 'Nothing trusted yet. Sync to pick from your subscriptions, or use Trust on a hidden card.'
      : 'Nothing trusted yet. Open your Following page and scroll, or use Trust on a hidden post.';
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
    toggle.onchange = () => {
      handleChannelToggle(row, toggle.checked);
    };
    item.append(avatar, name, tag, toggle);
    list.append(item);
  }

  const count = Object.keys(state[config.subs] || {}).length;
  const syncedAt = state[config.synced];
  const idle = config.canSync ? 'Not synced yet' : 'Collected as you browse';

  $('sync').hidden = !config.canSync;
  $('syncTitle').textContent = syncedAt ? `Synced ${ago(syncedAt)}` : idle;
  $('syncDetail').textContent = (config.canSync && state.syncError) || `${count} ${config.pickHint}`;
};

const render = () => {
  $('main').hidden = Boolean(state.manage);
  $('channels').hidden = !state.manage;
  renderMain();
  renderChannels();
};

const save = values => {
  version++;
  Object.assign(state, values);
  render();
  chrome.storage.sync.set(values);
};

const siteValues = values => {
  return { sites: { ...state.sites, [state.tab]: { ...state.sites[state.tab], ...values } } };
};

const handleLevelClick = event => {
  const { level } = event.currentTarget.dataset;

  save(state.global ? { level } : siteValues({ level }));
};

const handlePanicChange = () => {
  const panic = $('panic').checked;

  save(state.global ? { panic } : siteValues({ panic }));
};

const handleGlobalChange = () => {
  save({ global: $('global').checked });
};

const handleSiteClick = event => {
  state.tab = event.currentTarget.dataset.site;
  render();
};

const handleModeClick = event => {
  save({ [SITES[state.manage].mode]: event.currentTarget.dataset.mode });
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

    const subs = Object.fromEntries(
      list.map(item => {
        return [item.key, item.name];
      }),
    );
    const avatars = Object.fromEntries(
      list.map(item => {
        return [item.key, item.avatar];
      }),
    );

    chrome.storage.local.set({ subs, avatars, syncedAt: Date.now(), syncError: '' });
  } catch {
    chrome.storage.local.set({ syncError: 'Could not read your subscriptions. Check your connection.' });
  }
};

// A read that started before a newer read or a save must not overwrite it, so reads carry a version.
let version = 0;

const refresh = () => {
  const mine = ++version;

  chrome.storage.sync.get(DEFAULTS, synced => {
    const localDefaults = { subs: {}, avatars: {}, xSubs: {}, xAvatars: {}, syncedAt: 0, xSyncedAt: 0, syncError: '' };

    chrome.storage.local.get(localDefaults, local => {
      if (mine !== version) {
        return;
      }

      state = { ...state, ...synced, ...local };
      render();
    });
  });
};

document.querySelectorAll('[data-level]').forEach(button => {
  button.onclick = handleLevelClick;
});
document.querySelectorAll('[data-site]').forEach(button => {
  button.onclick = handleSiteClick;
});
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = handleModeClick;
});
$('global').onchange = handleGlobalChange;
$('panic').onchange = handlePanicChange;
$('back').onclick = () => {
  state.manage = null;
  render();
};
$('search').oninput = renderChannels;
$('sync').onclick = handleSync;
chrome.storage.onChanged.addListener(refresh);
refresh();
