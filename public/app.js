/* Gear Focus — frontend */

// ── Character management (localStorage) ──────────────────────────

const LS_CHARS  = 'gf-characters';
const LS_ACTIVE = 'gf-active';

const WOW_REGIONS = ['eu', 'us', 'kr', 'tw'];

function lsGetChars() {
  try { return JSON.parse(localStorage.getItem(LS_CHARS) || '[]'); } catch { return []; }
}
function lsSaveChars(chars) { localStorage.setItem(LS_CHARS, JSON.stringify(chars)); }
function lsGetActiveId() { return localStorage.getItem(LS_ACTIVE) || null; }
function lsSetActiveId(id) { localStorage.setItem(LS_ACTIVE, id); }

function makeCharId(name, realm, region) {
  return [name, realm, region].map(s => s.toLowerCase().replace(/\s+/g, '-')).join('|');
}

function getActiveChar() {
  const chars    = lsGetChars();
  const activeId = lsGetActiveId();
  return chars.find(c => c.id === activeId) || chars[0] || null;
}

function addChar(name, realm, region) {
  name   = name.trim();
  realm  = realm.trim().toLowerCase().replace(/\s+/g, '-'); // normalise to Blizzard slug format
  region = (region || 'eu').trim().toLowerCase();
  if (!name || !realm) return null;
  const id    = makeCharId(name, realm, region);
  const chars = lsGetChars();
  if (chars.find(c => c.id === id)) { lsSetActiveId(id); return id; } // already exists
  chars.push({ id, name, realm, region });
  lsSaveChars(chars);
  lsSetActiveId(id);
  return id;
}

function removeChar(id) {
  const chars = lsGetChars().filter(c => c.id !== id);
  lsSaveChars(chars);
  if (lsGetActiveId() === id) lsSetActiveId(chars[0]?.id || null);
}

function reorderChar(fromId, toId) {
  const chars   = lsGetChars();
  const fromIdx = chars.findIndex(c => c.id === fromId);
  const toIdx   = chars.findIndex(c => c.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const [moved] = chars.splice(fromIdx, 1);
  chars.splice(toIdx, 0, moved);
  lsSaveChars(chars);
}

function switchChar(id) {
  lsSetActiveId(id);
  renderSwitcher();
  loadCharacter();
}

let _dragSrcId = null;

// ── Character switcher UI ─────────────────────────────────────────

function renderSwitcher() {
  const tabs     = document.getElementById('char-tabs');
  const chars    = lsGetChars();
  const activeId = lsGetActiveId();
  tabs.innerHTML = '';

  if (!chars.length) {
    tabs.appendChild(el('span', 'char-empty-hint', 'No characters — add one to get started'));
    return;
  }

  for (const c of chars) {
    const isActive = c.id === activeId;
    const tab      = el('div', `char-tab${isActive ? ' active' : ''}`);
    tab.dataset.id  = c.id;
    tab.draggable   = true;

    const info = el('div', 'char-tab-info');
    info.appendChild(el('span', 'char-tab-name', c.name));
    info.appendChild(el('span', 'char-tab-realm', `${c.realm} · ${c.region.toUpperCase()}`));
    tab.appendChild(info);

    if (!isActive) {
      // Remove button only on inactive tabs to prevent accidental deletion
      const removeBtn = el('button', 'char-tab-remove', '×');
      removeBtn.title = `Remove ${c.name}`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Remove ${c.name} from your character list?`)) {
          removeChar(c.id);
          renderSwitcher();
          if (lsGetActiveId()) loadCharacter();
        }
      });
      tab.appendChild(removeBtn);
    }

    tab.addEventListener('click', () => { if (!isActive) switchChar(c.id); });

    // ── Drag-to-reorder ───────────────────────────────────────────
    tab.addEventListener('dragstart', e => {
      _dragSrcId = c.id;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tab.addEventListener('dragend', () => {
      _dragSrcId = null;
      tab.classList.remove('dragging');
      document.querySelectorAll('#char-tabs .char-tab.drag-over')
        .forEach(t => t.classList.remove('drag-over'));
    });
    tab.addEventListener('dragover', e => {
      if (_dragSrcId === c.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('#char-tabs .char-tab.drag-over')
        .forEach(t => t.classList.remove('drag-over'));
      tab.classList.add('drag-over');
    });
    tab.addEventListener('dragleave', e => {
      if (!tab.contains(e.relatedTarget)) tab.classList.remove('drag-over');
    });
    tab.addEventListener('drop', e => {
      e.preventDefault();
      if (_dragSrcId && _dragSrcId !== c.id) {
        reorderChar(_dragSrcId, c.id);
        renderSwitcher();
      }
    });

    tabs.appendChild(tab);
  }
}

function initCharacterSwitcher() {
  const addBtn    = document.getElementById('char-add-btn');
  const formWrap  = document.getElementById('char-form-wrap');
  const form      = document.getElementById('char-form');
  const cancelBtn = document.getElementById('char-form-cancel');

  addBtn.addEventListener('click', () => {
    formWrap.classList.toggle('hidden');
    if (!formWrap.classList.contains('hidden')) {
      document.getElementById('input-char-name').focus();
    }
  });

  cancelBtn.addEventListener('click', () => formWrap.classList.add('hidden'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name   = document.getElementById('input-char-name').value.trim();
    const realm  = document.getElementById('input-char-realm').value.trim();
    const region = document.getElementById('input-char-region').value;
    if (!name || !realm) return;
    addChar(name, realm, region);
    form.reset();
    formWrap.classList.add('hidden');
    renderSwitcher();
    loadCharacter();
  });

  renderSwitcher();
}



const WOWHEAD_BASE   = 'https://www.wowhead.com/item=';
const WOWHEAD_SEARCH = 'https://www.wowhead.com/?search=';

// Active BiS list — updated when a character loads based on their spec
let _activeBisList = BIS_LIST;

// True when the active BiS list has no ilvl data yet — updated in renderApp
let ILVL_UNKNOWN      = true;
let HERO_ILVL_UNKNOWN = true;

// State preserved across tier switches so we can re-render without a re-fetch
let activeTier       = 'myth';
let _slotMap         = {};
let _character       = null;
let _currencies      = [];
let _raids           = null;
let _raidDiff        = 'MYTHIC';
let _mythComparisons = [];
let _heroComparisons = [];
let _focusSourceMap  = {}; // slotKey → sourceType for Next Focus slots

const RAID_DIFF_ORDER = ['MYTHIC', 'HEROIC', 'NORMAL', 'LFR'];
const RAID_DIFF_LABEL = { MYTHIC: 'Mythic', HEROIC: 'Heroic', NORMAL: 'Normal', LFR: 'LFR' };

// ── Class / spec identity ─────────────────────────────────────────

const SPEC_ICONS = {
  'Shadow': '🌑', 'Holy': '✨', 'Discipline': '🛡',
  'Survival': '🗡️', 'Beast Mastery': '🐾', 'Marksmanship': '🏹',
  'Arms': '⚔️', 'Fury': '⚔️', 'Protection': '🛡️',
  'Fire': '🔥', 'Frost': '❄️', 'Arcane': '✨',
  'Affliction': '🩸', 'Demonology': '👿', 'Destruction': '🔥',
  'Balance': '🌙', 'Feral': '🐱', 'Guardian': '🐻', 'Restoration': '🌿',
  'Elemental': '⚡', 'Enhancement': '⚡',
  'Mistweaver': '🌸', 'Windwalker': '💨', 'Brewmaster': '🍺',
  'Retribution': '⚔️',
  'Unholy': '💀', 'Blood': '🩸',
  'Havoc': '🔪', 'Vengeance': '🔱',
  'Outlaw': '🗡️', 'Subtlety': '🌙', 'Assassination': '🗡️',
  'Devastation': '🔥', 'Augmentation': '⬆️', 'Preservation': '💚',
};

// Maps Blizzard class name → body CSS class for colour theming
const CLASS_THEMES = {
  'Death Knight': 'deathknight',
  'Demon Hunter': 'demonhunter',
  'Druid':        'druid',
  'Evoker':       'evoker',
  'Hunter':       'hunter',
  'Mage':         'mage',
  'Monk':         'monk',
  'Paladin':      'paladin',
  'Rogue':        'rogue',
  'Shaman':       'shaman',
  'Warlock':      'warlock',
  'Warrior':      'warrior',
  // Priest uses the default purple theme — no override needed
};

function applyClassTheme(className) {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
  const theme = CLASS_THEMES[className];
  if (theme) document.body.classList.add(`theme-${theme}`);
}

// ── Activity icons ────────────────────────────────────────────────
// WoW-style SVG icons for each content source type.
const SOURCE_ICONS = {
  // Dungeon-finder eye
  raid: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 3C5.6 3 1.9 6.3 1 10c.9 3.7 4.6 7 9 7s8.1-3.3 9-7c-.9-3.7-4.6-7-9-7zm0 11a4 4 0 110-8 4 4 0 010 8zm0-6a2 2 0 100 4 2 2 0 000-4z"/>
  </svg>`,
  // Keystone gem
  mythicplus: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <polygon points="10,1 18,7 15.5,19 4.5,19 2,7"/>
  </svg>`,
  // Anvil + hammer
  crafted: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 14.5h16v2.5H2zm4 2.5h3v2H6zm5 0h3v2h-3zM7 4h7a3 3 0 013 3.5v7H7V4z"/>
    <path d="M7 4H5a2.5 2.5 0 00-2.5 2.5v7H7V4z"/>
  </svg>`,
  // Torch / lantern
  delve: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 1c-.9 2-2.5 3.8-2.5 5.5a2.5 2.5 0 005 0C12.5 4.8 10.9 3 10 1z"/>
    <path d="M6.5 7.5a3.5 3.5 0 007 0H6.5z"/>
    <rect x="7" y="11" width="6" height="7" rx="1.5"/>
    <rect x="9" y="12.5" width="2" height="3.5" rx="0.5" fill="black" fill-opacity="0.3"/>
  </svg>`,
  // Globe
  world: `<svg class="act-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="10" cy="10" r="8"/>
    <path d="M10 2c-3 3-4 5.5-4 8s1 5 4 8m0-16c3 3 4 5.5 4 8s-1 5-4 8"/>
    <line x1="2" y1="10" x2="18" y2="10"/>
  </svg>`,
  // Quest scroll
  weekly: `<svg class="act-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
    <rect x="3" y="4" width="14" height="13" rx="1.5" fill="currentColor" fill-opacity="0.12"/>
    <line x1="6" y1="8"  x2="14" y2="8"/>
    <line x1="6" y1="11" x2="14" y2="11"/>
    <line x1="6" y1="14" x2="11" y2="14"/>
  </svg>`,
  // Yellow ! in circle (regular quest)
  quest: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm.75 11.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5V5.5h1.5V10.5z"/>
  </svg>`,
  // Map pin / world quest marker
  worldquest: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 2a5.5 5.5 0 00-5.5 5.5c0 4 5.5 10.5 5.5 10.5s5.5-6.5 5.5-10.5A5.5 5.5 0 0010 2zm0 7.5a2 2 0 110-4 2 2 0 010 4z"/>
  </svg>`,
  // Vault / chest door
  vault: `<svg class="act-icon" viewBox="0 0 20 20" fill="currentColor">
    <rect x="2" y="3" width="16" height="2.5" rx="1"/>
    <path d="M2 5.5h16v11a1 1 0 01-1 1H3a1 1 0 01-1-1v-11zm8 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 1.5a2 2 0 110 4 2 2 0 010-4z"/>
    <rect x="14.5" y="9" width="1.5" height="4" rx="0.75"/>
  </svg>`,
};

// ── Quality / source maps ─────────────────────────────────────────

const QUALITY_CLASS = {
  LEGENDARY: 'q-legendary',
  EPIC:      'q-epic',
  RARE:      'q-rare',
  UNCOMMON:  'q-uncommon',
  COMMON:    'q-common',
};

const SOURCE_CLASS = {
  quest:      'source-quest',
  worldquest: 'source-worldquest',
  weekly:     'source-weekly',
  crafted:    'source-crafted',
  delve:      'source-delve',
  mythicplus: 'source-mythicplus',
  raid:       'source-raid',
  vault:      'source-vault',
  world:      'source-world',
};

const SOURCE_LABEL = {
  quest:      'Quest',
  worldquest: 'World Quest',
  weekly:     'Weekly',
  crafted:    'Crafted',
  delve:      'Delve',
  mythicplus: 'Mythic+',
  raid:       'Raid',
  vault:      'Great Vault',
  world:      'World Drop',
};

// Ease of obtaining — lower = easier. Used to sort Tonight's Targets.
const SOURCE_EASE = {
  quest:      0,
  worldquest: 1,
  weekly:     2,
  crafted:    3,
  delve:      4,
  mythicplus: 5,
  raid:       6,
  vault:      7,
};

function getEaseRank(sourceType) {
  return SOURCE_EASE[sourceType] ?? 5;
}

// WoW character pane slot order — HEAD top-left, TRINKET_2 bottom-right
const PANEL_LEFT   = ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'WRIST', 'HANDS', 'WAIST'];
const PANEL_RIGHT  = ['LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2'];
const PANEL_WEAPON = ['MAIN_HAND', 'OFF_HAND'];

// ── Slot Tooltip ──────────────────────────────────────────────────

const bisStatsCache = new Map(); // itemId → [{name, value}] | null (loading)
let   tooltipSlot   = null;      // slotKey currently shown

function tooltipEl() { return document.getElementById('panel-tooltip'); }

function buildTooltipHtml(comp) {
  const { slotKey, bis, current, currentIlvl, delta } = comp;
  const meta    = SLOT_META[slotKey] || { label: slotKey, icon: '◈' };
  const bisStats = bis.itemId != null ? (bisStatsCache.get(bis.itemId) ?? null) : null;
  const html    = [];

  // Header
  html.push(`<div class="tt-header">${meta.icon} ${escHtml(meta.label)}</div>`);

  // Two-column items row
  html.push(`<div class="tt-items">`);

  // Left: equipped
  html.push(`<div class="tt-item">`);
  html.push(`<div class="tt-item-label">Equipped</div>`);
  if (current) {
    html.push(`<div class="tt-item-name ${qualityClass(current.quality?.type)}">${escHtml(current.name)}</div>`);
    if (currentIlvl) html.push(`<div class="tt-ilvl-badge">ilvl ${currentIlvl}</div>`);
  } else {
    html.push(`<div class="tt-item-name tt-empty">Nothing equipped</div>`);
  }
  html.push(`</div>`);

  html.push(`<div class="tt-arrow">→</div>`);

  // Right: BiS target
  html.push(`<div class="tt-item">`);
  html.push(`<div class="tt-item-label">BiS Target</div>`);
  if (!bis.name) {
    html.push(`<div class="tt-item-name tt-empty">No BiS data yet</div>`);
  } else {
    html.push(`<div class="tt-item-name q-epic">${escHtml(bis.name)}</div>`);
    if (bis.ilvl != null) {
      const dc = delta > 0 ? 'tt-gain' : delta < 0 ? 'tt-loss' : '';
      const ds = delta !== 0 ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
      html.push(`<div class="tt-ilvl-badge ${dc}">ilvl ${bis.ilvl}${ds}</div>`);
    } else {
      html.push(`<div class="tt-ilvl-badge tt-dim">ilvl unknown</div>`);
    }
  }
  html.push(`</div>`);
  html.push(`</div>`); // end tt-items

  // Stat section
  const curStats = current?.stats || [];

  if (curStats.length > 0 && bisStats && bisStats.length > 0) {
    // ── Full diff: green = gain, red = loss, zeros skipped ──
    const curMap = {};
    for (const s of curStats) { const n = s.type?.name; if (n) curMap[n] = s.value; }
    const bisMap = {};
    for (const s of bisStats)  { if (s.name) bisMap[s.name] = s.value; }

    const allKeys = new Set([...Object.keys(curMap), ...Object.keys(bisMap)]);
    const rows = [];
    for (const key of allKeys) {
      const diff = (bisMap[key] || 0) - (curMap[key] || 0);
      if (diff !== 0) rows.push({ key, diff });
    }
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    if (rows.length > 0) {
      html.push(`<div class="tt-stats-header">Stat changes</div><div class="tt-stats">`);
      for (const { key, diff } of rows) {
        const cls  = diff > 0 ? 'tt-gain' : 'tt-loss';
        const sign = diff > 0 ? '+' : '';
        html.push(`<div class="tt-stat-row ${cls}">
          <span class="tt-stat-name">${escHtml(key)}</span>
          <span class="tt-stat-diff">${sign}${diff.toLocaleString()}</span>
        </div>`);
      }
      html.push(`</div>`);
    }

  } else if (curStats.length > 0) {
    // ── Current item stats only (no BiS data yet) ──
    html.push(`<div class="tt-stats-header">Current stats</div><div class="tt-stats">`);
    for (const s of curStats) {
      const name = s.type?.name; const val = s.value;
      if (!name || !val) continue;
      html.push(`<div class="tt-stat-row">
        <span class="tt-stat-name">${escHtml(name)}</span>
        <span class="tt-stat-val">+${val.toLocaleString()}</span>
      </div>`);
    }
    html.push(`</div>`);
    if (bis.itemId == null) {
      html.push(`<div class="tt-note">Add itemId to bis.js to enable stat diff</div>`);
    } else if (bisStats === null) {
      html.push(`<div class="tt-note tt-loading">Loading BiS stats…</div>`);
    }

  } else if (!current) {
    // Empty slot — show BiS stats as "you'd gain" if available
    if (bisStats && bisStats.length > 0) {
      html.push(`<div class="tt-stats-header">You would gain</div><div class="tt-stats">`);
      for (const s of bisStats) {
        if (!s.name || !s.value) continue;
        html.push(`<div class="tt-stat-row tt-gain">
          <span class="tt-stat-name">${escHtml(s.name)}</span>
          <span class="tt-stat-diff">+${s.value.toLocaleString()}</span>
        </div>`);
      }
      html.push(`</div>`);
    }
  }

  // Source
  html.push(`<div class="tt-source">${sourceBadge(bis.sourceType)} ${escHtml(bis.source)}</div>`);

  return html.join('');
}

function showTooltip(comp, e) {
  tooltipSlot = comp.slotKey;
  const tip = tooltipEl();
  tip.innerHTML = buildTooltipHtml(comp);
  tip.classList.remove('hidden');
  placeTooltip(e);

  // Kick off async BiS stat load if we have an item ID and haven't fetched yet
  if (comp.bis.itemId != null && !bisStatsCache.has(comp.bis.itemId)) {
    bisStatsCache.set(comp.bis.itemId, null); // mark as loading
    fetchBisStats(comp);
  }
}

function hideTooltip() {
  tooltipSlot = null;
  tooltipEl().classList.add('hidden');
}

function placeTooltip(e) {
  const tip = tooltipEl();
  const pad = 14;
  const tw  = tip.offsetWidth  || 290;
  const th  = tip.offsetHeight || 220;
  let left  = e.clientX + pad;
  let top   = e.clientY + pad;
  if (left + tw > window.innerWidth  - 8) left = e.clientX - tw - pad;
  if (top  + th > window.innerHeight - 8) top  = e.clientY - th - pad;
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

async function fetchBisStats(comp) {
  const { bis } = comp;
  try {
    const region = getActiveChar()?.region || 'eu';
    const res    = await fetch(`/api/item-stats?id=${bis.itemId}&region=${region}`);
    if (!res.ok) { bisStatsCache.set(bis.itemId, []); return; }
    const data = await res.json();
    bisStatsCache.set(bis.itemId, data.stats || []);
    // Refresh tooltip if still hovering the same slot
    if (tooltipSlot === comp.slotKey) {
      tooltipEl().innerHTML = buildTooltipHtml(comp);
    }
  } catch {
    bisStatsCache.set(bis.itemId, []);
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function qualityClass(qualityType) {
  return QUALITY_CLASS[qualityType] || 'q-common';
}

function upgradeStatus(currentIlvl, bisIlvl) {
  if (bisIlvl == null) return currentIlvl > 0 ? 'unknown' : 'missing';
  if (!currentIlvl)    return 'missing';
  const delta = bisIlvl - currentIlvl;
  if (delta <= 0) return 'bis';
  if (delta <= 9) return 'close';
  return 'upgrade';
}

function statusLabel(status) {
  return { bis: 'BiS', close: 'Close', upgrade: 'Upgrade!', missing: 'Missing', unknown: 'Equipped' }[status] || '';
}

// Returns true if the slot already has the BiS item equipped
function hasEquippedBis(comp) {
  if (comp.status === 'bis') return true;
  // When ilvls unknown, fall back to name match
  const ilUnknown = comp.tier === 'hero' ? HERO_ILVL_UNKNOWN : ILVL_UNKNOWN;
  if (ilUnknown && comp.current && comp.current.name === comp.bis.name) return true;
  return false;
}

function el(tag, cls, innerHTML) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (innerHTML !== undefined) e.innerHTML = innerHTML;
  return e;
}

// Source pill badge with activity icon
function sourceBadge(sourceType) {
  const cls   = SOURCE_CLASS[sourceType]  || 'source-world';
  const label = SOURCE_LABEL[sourceType] || sourceType;
  const icon  = SOURCE_ICONS[sourceType]  || SOURCE_ICONS.world;
  return `<span class="source-tag ${cls}">${icon}${label}</span>`;
}

// BiS item name — link to Wowhead (direct item if itemId known, search fallback otherwise)
function bisNameEl(bis, extraClass) {
  const cls  = `item-name q-epic${extraClass ? ' ' + extraClass : ''}`;
  const href = bis.itemId
    ? `${WOWHEAD_BASE}${bis.itemId}`
    : `${WOWHEAD_SEARCH}${encodeURIComponent(bis.name)}`;

  const a = document.createElement('a');
  a.href   = href;
  a.target = '_blank';
  a.rel    = 'noopener';
  a.className = cls;
  a.style.textDecoration = 'none';
  a.textContent = bis.name;
  return a;
}

// ── Main data load ────────────────────────────────────────────────

async function loadCharacter() {
  const char = getActiveChar();

  document.getElementById('error-retry-btn').onclick = loadCharacter;
  document.getElementById('error-remove-btn').onclick = () => {
    if (char && confirm(`Remove ${char.name} from your character list?`)) {
      removeChar(char.id);
      renderSwitcher();
      loadCharacter();
    }
  };

  if (!char) {
    document.getElementById('error-title').textContent = 'No characters added';
    document.getElementById('error-message').textContent = 'No characters added yet.';
    document.getElementById('error-hint').textContent =
      'Click ＋ Add Character in the bar above to track your first character.';
    document.getElementById('error-remove-btn').style.display = 'none';
    showScreen('error');
    return;
  }

  showScreen('loading');
  try {
    const params = new URLSearchParams({ name: char.name, realm: char.realm, region: char.region });
    const res    = await fetch(`/api/character?${params}`);
    const data   = await res.json();
    if (!res.ok) {
      const msg = data.error || `Server error: ${res.status}`;
      throw new Error(msg);
    }
    renderApp(data);
    showScreen('main');
  } catch (err) {
    document.getElementById('error-title').textContent = 'Failed to load character data';
    document.getElementById('error-message').textContent =
      `${char.name} — ${char.realm} (${char.region.toUpperCase()}): ${err.message}`;
    document.getElementById('error-hint').textContent =
      'Check the character name, realm slug, and region are correct.';
    document.getElementById('error-remove-btn').style.display = '';
    showScreen('error');
  }
}

function showScreen(name) {
  ['loading-screen', 'error-screen', 'main-content', 'ilvl-warning'].forEach(id =>
    document.getElementById(id).classList.add('hidden')
  );

  if (name === 'loading') document.getElementById('loading-screen').classList.remove('hidden');
  if (name === 'error')   document.getElementById('error-screen').classList.remove('hidden');
  if (name === 'main') {
    document.getElementById('main-content').classList.remove('hidden');
    if (ILVL_UNKNOWN) {
      document.getElementById('ilvl-warning').classList.remove('hidden');
      document.getElementById('gear-legend').classList.add('hidden');
    }
  }
}

// ── Render ────────────────────────────────────────────────────────

// Keywords that flag a currency as an "upgrade material" — highlighted in the wallet
const UPGRADE_CURRENCY_KEYWORDS = [
  'crest', 'stone', 'fragment', 'shard', 'spark', 'valor', 'conquest',
  'badge', 'seal', 'token', 'sigil', 'flux', 'residue', 'essence',
];

function isUpgradeCurrency(name) {
  const lower = name.toLowerCase();
  return UPGRADE_CURRENCY_KEYWORDS.some(kw => lower.includes(kw));
}

function switchTier(tier) {
  activeTier = tier;
  document.querySelectorAll('.tier-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tier === tier)
  );
  const comparisons = tier === 'hero' ? _heroComparisons : _mythComparisons;
  renderCharacterPanel(comparisons, _character, _focusSourceMap);
}

// ── Raid Progress ─────────────────────────────────────────────────

function switchRaidDiff(diff) {
  _raidDiff = diff;
  document.querySelectorAll('.raid-diff-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.diff === diff)
  );
  renderRaidBosses();
}

function renderRaids(raids) {
  const section = document.getElementById('raids-section');
  _raids = raids;

  if (!raids || !raids.instances?.length) { section.style.display = 'none'; return; }

  const instances = raids.instances.filter(inst => CURRENT_RAID_NAMES.includes(inst.name));
  if (!instances.length) { section.style.display = 'none'; return; }

  // Shadow _raids with the filtered instance list so renderRaidBosses uses it
  _raids = { ...raids, instances };

  section.style.display = '';
  document.getElementById('raids-expansion-label').textContent = raids.expansion || '';

  // Collect available difficulties across current-tier instances
  const availDiffs = new Set();
  for (const inst of instances) {
    for (const mode of inst.modes) availDiffs.add(mode.difficulty);
  }

  // Default to best available difficulty if current selection isn't present
  if (!availDiffs.has(_raidDiff)) {
    _raidDiff = RAID_DIFF_ORDER.find(d => availDiffs.has(d)) || 'NORMAL';
  }

  // Difficulty tabs
  const tabsEl = document.getElementById('raids-diff-tabs');
  tabsEl.innerHTML = '';
  for (const diff of RAID_DIFF_ORDER) {
    if (!availDiffs.has(diff)) continue;
    const btn = el('button', `raid-diff-tab${_raidDiff === diff ? ' active' : ''}`, RAID_DIFF_LABEL[diff]);
    btn.dataset.diff = diff;
    btn.addEventListener('click', () => switchRaidDiff(diff));
    tabsEl.appendChild(btn);
  }

  renderRaidBosses();
}

function renderRaidBosses() {
  const list = document.getElementById('raids-boss-list');
  if (!_raids) return;
  list.innerHTML = '';

  for (const inst of _raids.instances) {
    const mode   = inst.modes.find(m => m.difficulty === _raidDiff);
    const instEl = el('div', 'raid-instance');

    // Header: raid name + X/Y badge
    const header = el('div', 'raid-instance-header');
    header.appendChild(el('span', 'raid-instance-name', escHtml(inst.name)));
    if (mode) {
      const cleared = mode.completed >= mode.total && mode.total > 0;
      header.appendChild(el('span',
        `raid-progress-badge${cleared ? ' cleared' : ''}`,
        `${mode.completed}/${mode.total}`
      ));
    } else {
      header.appendChild(el('span', 'raid-progress-badge not-attempted', '—'));
    }
    instEl.appendChild(header);

    // Boss list
    if (mode?.bosses.length) {
      const grid = el('div', 'raid-boss-grid');
      for (const boss of mode.bosses) {
        const bossEl = el('div', `raid-boss${boss.killed ? ' killed' : ''}`);
        bossEl.appendChild(el('span', 'raid-boss-icon', boss.killed ? '✓' : '·'));
        bossEl.appendChild(el('span', 'raid-boss-name', escHtml(boss.name)));
        if (boss.killed && boss.lastKill) {
          const daysAgo = Math.floor((Date.now() - boss.lastKill * 1000) / 86400000);
          const when    = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
          bossEl.appendChild(el('span', 'raid-boss-date', when));
        }
        grid.appendChild(bossEl);
      }
      instEl.appendChild(grid);
    } else if (!mode) {
      instEl.appendChild(el('div', 'raid-no-data', 'No attempts on this difficulty'));
    }

    list.appendChild(instEl);
  }
}

function renderApp({ character, equipment, currencies = [], raids = null }) {
  _character  = character;
  _currencies = currencies;

  // Resolve the BiS list for this character's spec
  _activeBisList = BIS_LISTS[character.specName] || BIS_LISTS.Shadow;
  const activeBisEntries = Object.values(_activeBisList).filter(b => b);
  ILVL_UNKNOWN      = activeBisEntries.every(b => b.ilvl      == null);
  HERO_ILVL_UNKNOWN = activeBisEntries.every(b => b.heroIlvl  == null);

  // Apply colour theme for this class
  applyClassTheme(character.className);

  // Update header spec name + icon
  const specLabel = `${character.specName} ${character.className}`;
  document.getElementById('header-spec-name').textContent = specLabel;
  document.getElementById('spec-icon').textContent =
    SPEC_ICONS[character.specName] || '⚔️';
  document.title = `${specLabel} — Gear Planner`;

  renderCharacterBanner(character);

  _slotMap = {};
  for (const item of equipment) {
    const k = item.slot?.type;
    if (k) _slotMap[k] = item;
  }

  _mythComparisons = buildComparisons(_slotMap, 'myth');
  _heroComparisons = buildComparisons(_slotMap, 'hero');

  renderBisProgress(calcBisProgress(_mythComparisons), calcBisProgress(_heroComparisons));
  renderUpgradeAdvisor(_mythComparisons, currencies);

  const focusCandidates = renderTargets(_mythComparisons) || [];
  _focusSourceMap = {};
  for (const c of focusCandidates) _focusSourceMap[c.slotKey] = c.bis.sourceType;

  renderCharacterPanel(activeTier === 'hero' ? _heroComparisons : _mythComparisons, character, _focusSourceMap);
  renderCurrencies(currencies);
  renderRaids(raids);
}

// ── Currencies ────────────────────────────────────────────────────

function renderCurrencies(currencies) {
  const section = document.getElementById('currency-section');
  const grid    = document.getElementById('currency-grid');

  if (!currencies || currencies.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  grid.innerHTML = '';

  // Upgrade materials first, then everything else, within each group sorted by quantity desc
  const upgrades = currencies.filter(c => isUpgradeCurrency(c.name));
  const other    = currencies.filter(c => !isUpgradeCurrency(c.name));

  const renderGroup = (label, items) => {
    if (!items.length) return;
    const header = el('div', 'currency-group-label', label);
    grid.appendChild(header);
    const row = el('div', 'currency-row');
    for (const c of items) row.appendChild(buildCurrencyChip(c));
    grid.appendChild(row);
  };

  renderGroup('Upgrade Materials', upgrades);
  renderGroup('Other Currencies', other);

  // Collapse/expand toggle
  document.getElementById('currency-toggle').onclick = () => {
    const collapsed = grid.classList.toggle('collapsed');
    document.getElementById('currency-toggle').textContent = collapsed ? '▸' : '▾';
  };
}

function buildCurrencyChip(c) {
  const isUpgrade  = isUpgradeCurrency(c.name);
  const chip       = el('div', `currency-chip${isUpgrade ? ' upgrade-currency' : ''}`);
  const hasMax     = c.maximum != null && c.maximum > 0;
  const pct        = hasMax ? Math.min(100, Math.round((c.quantity / c.maximum) * 100)) : null;

  // Name
  chip.appendChild(el('div', 'currency-name', escHtml(c.name)));

  // Quantity
  const qtyLine = el('div', 'currency-qty');
  const formattedQty = c.quantity.toLocaleString();
  const formattedMax = hasMax ? c.maximum.toLocaleString() : null;
  qtyLine.textContent = hasMax ? `${formattedQty} / ${formattedMax}` : formattedQty;
  chip.appendChild(qtyLine);

  // Progress bar (only when there's a cap)
  if (hasMax) {
    const barWrap = el('div', 'currency-bar-wrap');
    const bar     = el('div', 'currency-bar');
    bar.style.width = `${pct}%`;
    if (pct >= 90) bar.classList.add('bar-full');
    else if (pct >= 60) bar.classList.add('bar-mid');
    barWrap.appendChild(bar);
    chip.appendChild(barWrap);
  }

  return chip;
}

// ── Character Banner ──────────────────────────────────────────────

function renderCharacterBanner(character) {
  document.getElementById('char-name').textContent = character.name;
  document.getElementById('char-details').textContent =
    `${character.raceName} ${character.specName} ${character.className} · ${character.realm} · Level ${character.level}`;

  const equipped = character.equippedItemLevel || 0;
  document.getElementById('char-ilvl-equipped').textContent = equipped || '—';

  if (ILVL_UNKNOWN) {
    document.getElementById('bis-avg-ilvl').textContent = '—';
    document.getElementById('ilvl-gap').textContent = '—';
    document.getElementById('ilvl-gap').className = 'ilvl-value';
  } else {
    const bisAvg = calcBisAvgIlvl();
    document.getElementById('bis-avg-ilvl').textContent = bisAvg;
    const gap = bisAvg - equipped;
    const gapEl = document.getElementById('ilvl-gap');
    gapEl.textContent = gap > 0 ? `−${gap}` : '0';
    gapEl.className = 'ilvl-value ' + (gap <= 0 ? 'green' : gap < 20 ? '' : 'red');
  }

  if (character.avatarUrl) {
    const img = document.getElementById('char-avatar');
    img.src = character.avatarUrl;
    img.onload = () => {
      img.classList.remove('hidden');
      document.getElementById('char-avatar-fallback').classList.add('hidden');
    };
    img.onerror = () => {};
  }
}

function calcBisAvgIlvl() {
  const vals = Object.values(_activeBisList).filter(b => b).map(b => b.ilvl).filter(v => v != null);
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ── Comparisons ───────────────────────────────────────────────────

function buildComparisons(slotMap, tier = 'myth') {
  return Object.entries(_activeBisList)
    .filter(([, bis]) => bis !== null) // null = slot not used by this spec (e.g. OFF_HAND for 2H specs)
    .map(([slotKey, bis]) => {
      const current     = slotMap[slotKey] || null;
      const currentIlvl = current?.level?.value || 0;
      const bisIlvl     = tier === 'hero' ? bis.heroIlvl : bis.ilvl;
      const status      = bis.name ? upgradeStatus(currentIlvl, bisIlvl) : (current ? 'unknown' : 'missing');
      const delta       = bisIlvl != null ? bisIlvl - currentIlvl : null;
      return { slotKey, bis, current, currentIlvl, status, delta, tier, bisIlvl };
    });
}

// ── Gear Grid ─────────────────────────────────────────────────────

// ── Character Panel ───────────────────────────────────────────────

function buildPanelSlot(comp, focusSourceType) {
  const { slotKey, bis, current, currentIlvl, status } = comp;
  const meta       = SLOT_META[slotKey] || { label: slotKey, icon: '◈' };
  const ilUnknown  = comp.tier === 'hero' ? HERO_ILVL_UNKNOWN : ILVL_UNKNOWN;
  const cardStatus = ilUnknown ? (current ? 'unknown' : 'missing') : status;

  const focusCls = focusSourceType ? ` focus-source focus-${focusSourceType}` : '';
  const slot = el('div', `panel-slot status-${cardStatus}${focusCls}`);

  // Top row: icon + label on left, ilvl on right
  const top = el('div', 'ps-top');
  top.appendChild(el('span', 'ps-label', `${meta.icon} ${meta.label}`));
  if (currentIlvl > 0) top.appendChild(el('span', 'ps-ilvl', currentIlvl));
  slot.appendChild(top);

  // Equipped item
  if (current) {
    const itemEl = el('div', `ps-item ${qualityClass(current.quality?.type)}`);
    itemEl.textContent = current.name;
    slot.appendChild(itemEl);
  } else {
    slot.appendChild(el('div', 'ps-item ps-empty', '— empty —'));
  }

  // BiS line
  const isBis = hasEquippedBis(comp);
  const bisEl = el('div', isBis ? 'ps-bis ps-bis-done' : 'ps-bis');
  if (isBis) {
    bisEl.textContent = '✓ BiS';
  } else if (!bis.name) {
    bisEl.textContent = '— BiS unknown';
    bisEl.style.opacity = '0.35';
  } else {
    bisEl.textContent = `↑ ${bis.name}`;
    bisEl.title = bis.name;
  }
  slot.appendChild(bisEl);

  // Tooltip events
  slot.addEventListener('mouseenter', e => showTooltip(comp, e));
  slot.addEventListener('mousemove',  e => placeTooltip(e));
  slot.addEventListener('mouseleave', ()  => hideTooltip());

  return slot;
}

function renderCharacterPanel(comparisons, character, focusSourceMap = {}) {
  const panel = document.getElementById('char-panel');
  panel.innerHTML = '';

  const compMap = {};
  for (const c of comparisons) compMap[c.slotKey] = c;

  const slot = (key) => buildPanelSlot(compMap[key], focusSourceMap[key] || null);

  // Left column: HEAD → WAIST
  const leftCol = el('div', 'cp-col cp-left');
  for (const s of PANEL_LEFT) leftCol.appendChild(slot(s));

  // Center: portrait + weapons below
  const center = el('div', 'cp-center');

  const portrait = el('div', 'cp-portrait');
  const imgSrc   = character.mainRenderUrl || character.avatarUrl;
  if (imgSrc) {
    const img = document.createElement('img');
    img.src       = imgSrc;
    img.className = 'cp-portrait-img';
    img.alt       = character.name;
    img.onerror   = () => { img.remove(); };
    portrait.appendChild(img);
  } else {
    portrait.appendChild(el('div', 'cp-portrait-fallback', '🧙'));
  }
  center.appendChild(portrait);

  const weaponRow = el('div', 'cp-weapons');
  for (const s of PANEL_WEAPON) {
    if (compMap[s]) weaponRow.appendChild(slot(s)); // skip slots not in active BiS list
  }
  center.appendChild(weaponRow);

  // Right column: LEGS → TRINKET_2
  const rightCol = el('div', 'cp-col cp-right');
  for (const s of PANEL_RIGHT) rightCol.appendChild(slot(s));

  panel.appendChild(leftCol);
  panel.appendChild(center);
  panel.appendChild(rightCol);
}

function buildSlotCard({ slotKey, bis, current, currentIlvl, status, delta }) {
  const meta       = SLOT_META[slotKey] || { label: slotKey, icon: '◈' };
  const cardStatus = ILVL_UNKNOWN ? (current ? 'unknown' : 'missing') : status;
  const card       = el('div', `slot-card status-${cardStatus}`);

  // Header row
  const header = el('div', 'slot-header');
  header.appendChild(el('span', 'slot-name', `${meta.icon} ${meta.label}`));
  if (!ILVL_UNKNOWN) header.appendChild(el('span', `status-badge ${status}`, statusLabel(status)));
  card.appendChild(header);

  // Equipped item
  const curRow  = el('div', 'item-row');
  const curInfo = el('div');
  curInfo.appendChild(el('div', 'item-label', 'Equipped'));
  if (current) {
    curInfo.appendChild(el('div', `item-name ${qualityClass(current.quality?.type)}`, escHtml(current.name)));
  } else {
    curInfo.appendChild(el('div', 'item-name empty', 'Nothing equipped'));
  }
  curRow.appendChild(curInfo);
  if (currentIlvl > 0) curRow.appendChild(el('span', 'item-ilvl', currentIlvl));
  card.appendChild(curRow);

  card.appendChild(el('div', 'divider'));

  // BiS item
  const bisRow  = el('div', 'item-row');
  const bisInfo = el('div');
  bisInfo.style.flex = '1';
  bisInfo.appendChild(el('div', 'item-label', 'BiS'));
  bisInfo.appendChild(bisNameEl(bis));
  if (bis.tier) bisInfo.appendChild(el('span', 'tier-badge', bis.tierLabel || 'Tier'));
  bisRow.appendChild(bisInfo);

  // ilvl + delta column
  const ilvlWrap = el('div');
  ilvlWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:2px';
  if (bis.ilvl != null) {
    ilvlWrap.appendChild(el('span', 'item-ilvl', bis.ilvl));
    if (delta > 0)                      ilvlWrap.appendChild(el('span', 'ilvl-delta plus',  `+${delta}`));
    else if (delta === 0 && currentIlvl) ilvlWrap.appendChild(el('span', 'ilvl-delta zero',  '✓'));
    else if (delta < 0)                 ilvlWrap.appendChild(el('span', 'ilvl-delta minus', `${delta}`));
  } else {
    ilvlWrap.appendChild(el('span', 'item-ilvl', '?'));
  }
  bisRow.appendChild(ilvlWrap);
  card.appendChild(bisRow);

  // Source line with activity icon
  const srcLine = el('div', 'bis-source-line');
  srcLine.innerHTML = `${sourceBadge(bis.sourceType)} ${escHtml(bis.source)}`;
  card.appendChild(srcLine);

  return card;
}

// ── Tonight's Targets ─────────────────────────────────────────────

function renderTargets(comparisons) {
  const container = document.getElementById('targets-list');
  container.innerHTML = '';

  // Exclude slots with no BiS data and slots the character already has BiS for
  const needsUpgrade = comparisons.filter(c => c.bis.name && !hasEquippedBis(c));

  let candidates;

  const easeSort = (a, b) => {
    // Missing slots always surface first regardless of ease
    const aMiss = (!a.current || a.status === 'missing') ? 1 : 0;
    const bMiss = (!b.current || b.status === 'missing') ? 1 : 0;
    if (aMiss !== bMiss) return bMiss - aMiss;
    // Easiest source first
    const easeDiff = getEaseRank(a.bis.sourceType) - getEaseRank(b.bis.sourceType);
    if (easeDiff !== 0) return easeDiff;
    // Within the same ease tier: biggest ilvl gain first (if known), then tier pieces
    if (b.delta != null && a.delta != null && b.delta !== a.delta) return b.delta - a.delta;
    return (b.bis.tier ? 1 : 0) - (a.bis.tier ? 1 : 0);
  };

  if (ILVL_UNKNOWN) {
    candidates = needsUpgrade.sort(easeSort).slice(0, 5);
  } else {
    candidates = needsUpgrade.filter(c => c.status !== 'bis').sort(easeSort).slice(0, 5);
  }

  if (!ILVL_UNKNOWN && candidates.length === 0) {
    const msg = el('div', 'target-item');
    msg.style.gridTemplateColumns = '1fr';
    msg.innerHTML = `<span style="color:var(--green);font-weight:600">🎉 You're fully BiS! Nothing to chase tonight.</span>`;
    container.appendChild(msg);
    return candidates;
  }

  candidates.forEach((comp, i) => {
    const { slotKey, bis, current, currentIlvl, status, delta } = comp;
    const meta = SLOT_META[slotKey] || { label: slotKey, icon: '◈' };
    const row  = el('div', 'target-item');

    row.appendChild(el('span', 'target-rank', i + 1));

    // Info column
    const info = el('div', 'target-info');
    info.appendChild(el('div', 'target-slot', `${meta.icon} ${meta.label}`));
    info.appendChild(bisNameEl(bis, 'target-bis-name'));

    let desc = '';
    if (!current) {
      desc = 'Currently: <em>nothing equipped</em>';
    } else {
      desc = `Currently: <span class="${qualityClass(current.quality?.type)}">${escHtml(current.name)}</span>`;
      if (currentIlvl) desc += ` <span style="color:var(--text-dim)">(ilvl ${currentIlvl})</span>`;
    }
    if (bis.note) desc += ` <span class="target-note">— ${escHtml(bis.note)}</span>`;
    if (desc) info.appendChild(el('div', 'target-current', desc));
    row.appendChild(info);

    // Meta column: activity badge + gain
    const metaCol = el('div', 'target-meta');
    metaCol.innerHTML = `${sourceBadge(bis.sourceType)}<br>`;
    const gainEl = el('span', 'target-ilvl-gain');
    if (ILVL_UNKNOWN) {
      gainEl.textContent    = bis.tier ? 'Tier piece' : 'Check Wowhead';
      gainEl.style.color    = bis.tier ? 'var(--purple-bright)' : 'var(--text-secondary)';
    } else if (!current) {
      gainEl.textContent = `+${bis.ilvl} ilvl`;
    } else {
      gainEl.textContent = delta > 0 ? `+${delta} ilvl` : 'Item swap';
    }
    metaCol.appendChild(gainEl);
    row.appendChild(metaCol);

    container.appendChild(row);
  });

  return candidates;
}

// ── BiS Progress ──────────────────────────────────────────────────
//
// Scoring weights (per slot, out of 100):
//   Correct item at BiS ilvl       = 100   ← this is the target
//   Correct item below BiS ilvl    = 65 + (ilvlRatio * 35)
//   Off-piece (any ilvl)           = ilvlRatio * 50
//   Empty slot                     = 0
//
// This ensures a BiS item on Hero track scores higher than an off-piece
// at Mythic ilvl, matching the user's stated preference.

function calcBisProgress(comparisons) {
  if (!comparisons.length) return { pct: 0, bisCount: 0, rightItemCount: 0, offCount: 0, missingCount: 0, total: 0 };

  let bisCount = 0, rightItemCount = 0, offCount = 0, missingCount = 0;

  const scores = comparisons.map(({ bis, current, currentIlvl, status }) => {
    if (!current) { missingCount++; return 0; }

    const isBisItem = current.name === bis.name;

    if (bis.ilvl == null) {
      // ILVL unknown — name-only scoring
      if (isBisItem) { rightItemCount++; return 80; }
      offCount++;
      return 30;
    }

    const ratio = Math.min(1, currentIlvl / bis.ilvl);

    if (isBisItem && status === 'bis') { bisCount++; return 100; }
    if (isBisItem) { rightItemCount++; return Math.round(65 + ratio * 35); }
    offCount++;
    return Math.round(ratio * 50);
  });

  const pct = Math.round(scores.reduce((a, b) => a + b, 0) / (comparisons.length * 100) * 100);
  return { pct, bisCount, rightItemCount, offCount, missingCount, total: comparisons.length };
}

function renderBisProgress(mythProg, heroProg) {
  const section = document.getElementById('progress-section');

  const barRow = (label, cls, prog) => `
    <div class="progress-tier-row">
      <span class="progress-tier-label ${cls}">${label}</span>
      <div class="progress-bar-outer">
        <div class="progress-bar-inner ${cls}-bar" style="width:${prog.pct}%;background-position:${100 - prog.pct}% 0%"></div>
      </div>
      <span class="progress-tier-pct">${prog.pct}%</span>
    </div>`;

  section.innerHTML = `
    <div class="progress-header">
      <span class="progress-title">📊 BiS Progress</span>
    </div>
    <div class="progress-dual">
      ${barRow('Myth', 'myth', mythProg)}
      ${barRow('Hero', 'hero', heroProg)}
    </div>
    <div class="progress-breakdown" id="progress-breakdown"></div>`;

  // Breakdown dots reflect Myth comparisons as primary
  const { bisCount, rightItemCount, offCount, missingCount } = mythProg;
  const breakdown = document.getElementById('progress-breakdown');
  const stats = [
    { label: `${bisCount} full BiS`,         cls: 'full-bis',   show: bisCount > 0 },
    { label: `${rightItemCount} right item`, cls: 'right-item', show: rightItemCount > 0 },
    { label: `${offCount} off-piece`,        cls: 'off-piece',  show: offCount > 0 },
    { label: `${missingCount} empty`,        cls: 'empty-slot', show: missingCount > 0 },
  ];
  for (const s of stats.filter(s => s.show)) {
    const stat = el('div', 'progress-stat');
    stat.innerHTML = `<span class="pstat-dot ${s.cls}"></span>${s.label}`;
    breakdown.appendChild(stat);
  }
}

// ── Upgrade Advisor ───────────────────────────────────────────────

// Estimated crest cost per upgrade level (TWW baseline; verify in Midnight)
const APPROX_CREST_COST = 15;

// Known TWW track order; used to suggest the next track for maxed items
const TRACK_ORDER = ['Adventurer', 'Veteran', 'Champion', 'Hero', 'Myth'];

function getNextTrack(track) {
  const i = TRACK_ORDER.indexOf(track);
  return i >= 0 && i < TRACK_ORDER.length - 1 ? TRACK_ORDER[i + 1] : null;
}

// Parse the upgrade track info from level.display_string, e.g. "671 (Champion 5/8)"
function parseUpgradeInfo(item) {
  const str = item?.level?.display_string || '';
  const m   = str.match(/\(([A-Za-z][^0-9)]*?)\s+(\d+)\/(\d+)\)/);
  if (!m) return null;
  const current = parseInt(m[2], 10);
  const max     = parseInt(m[3], 10);
  return { track: m[1].trim(), current, max, remaining: max - current, isMaxed: current >= max };
}

// Try to find an upgrade currency that shares a keyword with the track name
function findTrackCurrency(trackName, currencies) {
  if (!trackName || !currencies.length) return null;
  const words = trackName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return currencies.find(c => words.some(w => c.name.toLowerCase().includes(w))) || null;
}

function renderUpgradeAdvisor(comparisons, currencies) {
  const section = document.getElementById('advisor-section');
  const list    = document.getElementById('advisor-list');
  const summary = document.getElementById('advisor-currency-summary');
  list.innerHTML = '';
  summary.innerHTML = '';

  const upgradeCurrencies = currencies.filter(c => isUpgradeCurrency(c.name));

  // Build entries: only equipped items with parseable upgrade info
  const items = comparisons
    .filter(c => c.current)
    .map(c => ({ ...c, upgradeInfo: parseUpgradeInfo(c.current) }))
    .filter(c => c.upgradeInfo)
    .sort((a, b) => {
      // BiS items first — upgrading the right item is always the priority
      const aBis = a.current.name === a.bis.name ? 1 : 0;
      const bBis = b.current.name === b.bis.name ? 1 : 0;
      if (aBis !== bBis) return bBis - aBis;
      // Upgradeable before maxed
      if (!a.upgradeInfo.isMaxed &&  b.upgradeInfo.isMaxed) return -1;
      if ( a.upgradeInfo.isMaxed && !b.upgradeInfo.isMaxed) return  1;
      // More remaining levels = higher priority
      return b.upgradeInfo.remaining - a.upgradeInfo.remaining;
    });

  if (!items.length && !upgradeCurrencies.length) { section.style.display = 'none'; return; }
  section.style.display = '';

  // Currency chips summary
  if (upgradeCurrencies.length) {
    const chips = el('div', 'advisor-crest-chips');
    for (const c of upgradeCurrencies.slice(0, 8)) {
      const approx = Math.floor(c.quantity / APPROX_CREST_COST);
      const chip   = el('div', 'advisor-crest-chip');
      chip.innerHTML = `
        <span class="crest-name">${escHtml(c.name)}</span>
        <span class="crest-qty">${c.quantity.toLocaleString()}</span>
        ${approx > 0 ? `<span class="crest-approx">≈${approx} upgrades</span>` : ''}
      `;
      chips.appendChild(chip);
    }
    summary.appendChild(chips);
    summary.appendChild(el('p', 'advisor-cost-note',
      `Estimates use ~${APPROX_CREST_COST} crests per level (TWW baseline). Verify actual costs in-game.`));
  }

  if (!items.length) return;

  const upgradeable = items.filter(i => !i.upgradeInfo.isMaxed);
  const maxed       = items.filter(i =>  i.upgradeInfo.isMaxed);

  if (upgradeable.length) {
    list.appendChild(el('div', 'advisor-group-label', 'Can be upgraded now'));
    for (const item of upgradeable) list.appendChild(buildAdvisorRow(item, upgradeCurrencies));
  }
  if (maxed.length) {
    list.appendChild(el('div', 'advisor-group-label', 'At track maximum — seek next-tier content'));
    for (const item of maxed) list.appendChild(buildAdvisorRow(item, upgradeCurrencies));
  }
}

function buildAdvisorRow({ slotKey, bis, current, upgradeInfo }, upgradeCurrencies) {
  const meta      = SLOT_META[slotKey] || { label: slotKey, icon: '◈' };
  const isBisItem = current.name === bis.name;
  const row       = el('div', `advisor-row${isBisItem ? ' advisor-bis' : ''}`);

  // Left — slot icon + item name (links to Wowhead by item ID) + BiS badge
  const left     = el('div', 'advisor-left');
  const itemHref = current.item?.id
    ? `${WOWHEAD_BASE}${current.item.id}`
    : `${WOWHEAD_SEARCH}${encodeURIComponent(current.name)}`;
  const nameLink = document.createElement('a');
  nameLink.href  = itemHref;
  nameLink.target = '_blank';
  nameLink.rel    = 'noopener';
  nameLink.className = `advisor-item-name ${qualityClass(current.quality?.type)}`;
  nameLink.style.textDecoration = 'none';
  nameLink.textContent = current.name;
  left.appendChild(el('span', 'advisor-slot-icon', meta.icon));
  left.appendChild(nameLink);
  if (isBisItem) left.appendChild(el('span', 'advisor-bis-badge', '⭐ BiS'));
  row.appendChild(left);

  // Mid — track level pips + status
  const mid = el('div', 'advisor-mid');
  if (upgradeInfo.isMaxed) {
    const next = getNextTrack(upgradeInfo.track);
    mid.appendChild(el('span', 'advisor-track-maxed', `${upgradeInfo.track} MAX ✓`));
    mid.appendChild(el('span', 'advisor-promote-hint',
      next ? `→ Seek ${next}-track drop or catalyst` : 'At maximum track'));
  } else {
    const trackRow = el('div', 'advisor-track-info');
    trackRow.appendChild(el('span', 'advisor-track-name', upgradeInfo.track));
    const pips = el('div', 'advisor-level-bar-wrap');
    for (let i = 1; i <= upgradeInfo.max; i++) {
      pips.appendChild(el('div', `advisor-pip${i <= upgradeInfo.current ? ' filled' : ''}`));
    }
    trackRow.appendChild(pips);
    trackRow.appendChild(el('span', 'advisor-track-levels', `${upgradeInfo.current}/${upgradeInfo.max}`));
    mid.appendChild(trackRow);
    mid.appendChild(el('span', 'advisor-remaining',
      `${upgradeInfo.remaining} level${upgradeInfo.remaining !== 1 ? 's' : ''} to max`));
  }
  row.appendChild(mid);

  // Right — cost + affordability check
  const right = el('div', 'advisor-right');
  if (!upgradeInfo.isMaxed) {
    const totalCost = upgradeInfo.remaining * APPROX_CREST_COST;
    const matched   = findTrackCurrency(upgradeInfo.track, upgradeCurrencies);
    const action    = el('div', 'advisor-action');
    if (matched) {
      const canFull    = matched.quantity >= totalCost;
      const affordable = Math.floor(matched.quantity / APPROX_CREST_COST);
      if (canFull) action.classList.add('can-afford');
      action.innerHTML = `
        <span class="advisor-cost">~${totalCost} ${escHtml(matched.name)}</span>
        <span class="advisor-can">${canFull
          ? '✓ Can fully upgrade'
          : `Can do ${affordable} of ${upgradeInfo.remaining} levels`}</span>
      `;
    } else {
      action.innerHTML = `<span class="advisor-cost">~${totalCost} crests (est.)</span>`;
    }
    right.appendChild(action);
  }
  row.appendChild(right);

  return row;
}

// ── Utils ─────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────

document.getElementById('refresh-btn').addEventListener('click', loadCharacter);

// Boot sequence: render switcher → load data (or prompt to add first character)
initCharacterSwitcher();
loadCharacter();
